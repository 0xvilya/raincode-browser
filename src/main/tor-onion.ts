import { connect, type Socket } from "node:net";
import { isV3OnionHost } from "./security";

// Chromium limits a SOCKS handshake to 30s. Building a cold onion circuit can
// take longer. Establish a TCP stream through Tor first, without sending HTTP
// bytes; Chromium then uses the same daemon's descriptor/circuit cache normally.
// This is not a gateway, HTTP renderer, DNS lookup or direct-connect fallback.
export class OnionPreconnect {
  private entries = new Map<
    string,
    { promise: Promise<void>; expires: number }
  >();
  private sockets = new Set<Socket>();
  private epoch = 0;
  constructor(private readonly timeoutMs = 180_000) {}

  prepare(input: string, socksPort: number): Promise<void> {
    const url = new URL(input);
    if (
      !["http:", "https:", "ws:", "wss:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !isV3OnionHost(url.hostname) ||
      url.hostname.length > 253 ||
      !Number.isInteger(socksPort) ||
      socksPort < 1 ||
      socksPort > 65535
    )
      return Promise.reject(new Error("TOR_ONION_TARGET"));
    const port = Number(
      url.port || (["https:", "wss:"].includes(url.protocol) ? 443 : 80),
    );
    const key = `${socksPort}:${url.hostname}:${port}`;
    const cached = this.entries.get(key);
    if (cached && cached.expires > Date.now()) return cached.promise;
    for (const [name, entry] of this.entries)
      if (entry.expires <= Date.now()) this.entries.delete(name);
    if (this.sockets.size >= 16)
      return Promise.reject(new Error("TOR_ONION_BUSY"));
    if (this.entries.size >= 64) {
      const completed = [...this.entries].find(
        ([, entry]) => entry.expires !== Infinity,
      );
      if (completed) this.entries.delete(completed[0]);
    }
    const epoch = this.epoch;
    const socket = connect({ host: "127.0.0.1", port: socksPort });
    this.sockets.add(socket);
    const promise = new Promise<void>((resolve, reject) => {
      let buffered = Buffer.alloc(0),
        stage = 0,
        finished = false;
      const finish = (error?: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.sockets.delete(socket);
        socket.destroy();
        if (error) {
          if (epoch === this.epoch) this.entries.delete(key);
          reject(new Error(error));
        } else {
          const entry =
            epoch === this.epoch ? this.entries.get(key) : undefined;
          if (entry) entry.expires = Date.now() + 60_000;
          resolve();
        }
      };
      const timer = setTimeout(
        () => finish("TOR_ONION_TIMEOUT"),
        this.timeoutMs,
      );
      timer.unref();
      socket.once("connect", () => socket.write(Buffer.from([5, 1, 0])));
      socket.on("error", () => finish("TOR_ONION_CONNECTION"));
      socket.on("close", () => finish("TOR_ONION_CANCELLED"));
      socket.on("data", (data: Buffer) => {
        buffered = Buffer.concat([buffered, data]);
        if (buffered.length > 512) return finish("TOR_ONION_PROTOCOL");
        if (stage === 0) {
          if (buffered.length < 2) return;
          if (buffered[0] !== 5 || buffered[1] !== 0)
            return finish("TOR_ONION_PROTOCOL");
          buffered = buffered.subarray(2);
          const host = Buffer.from(url.hostname, "ascii");
          const request = Buffer.alloc(7 + host.length);
          request.set([5, 1, 0, 3, host.length]);
          host.copy(request, 5);
          request.writeUInt16BE(port, 5 + host.length);
          stage = 1;
          socket.write(request);
        }
        if (stage === 1 && buffered.length >= 4) {
          if (buffered[0] !== 5 || buffered[2] !== 0)
            return finish("TOR_ONION_PROTOCOL");
          if (buffered[1] !== 0) return finish("TOR_ONION_UNREACHABLE");
          const length =
            buffered[3] === 1
              ? 10
              : buffered[3] === 4
                ? 22
                : buffered[3] === 3
                  ? buffered.length >= 5
                    ? 7 + buffered[4]
                    : Infinity
                  : 0;
          if (!length) return finish("TOR_ONION_PROTOCOL");
          if (buffered.length >= length) finish();
        }
      });
    });
    this.entries.set(key, { promise, expires: Infinity });
    return promise;
  }
  clear() {
    ++this.epoch;
    this.entries.clear();
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
  }
}
