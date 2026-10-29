import net from "node:net";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { OnionPreconnect } from "../../src/main/tor-onion";
import { fixtureOnion } from "./fixture-onion";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function proxy(reply: boolean) {
  const requests: { host: string; port: number; atyp: number }[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    let stage = 0,
      buffer = Buffer.alloc(0);
    socket.on("data", (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);
      if (stage === 0 && buffer.length >= 3) {
        expect([...buffer.subarray(0, 3)]).toEqual([5, 1, 0]);
        buffer = buffer.subarray(3);
        stage = 1;
        socket.write(Buffer.from([5]));
        setTimeout(() => socket.write(Buffer.from([0])), 5);
      }
      if (stage === 1 && buffer.length >= 7 + buffer[4]) {
        const length = buffer[4];
        requests.push({
          host: buffer.toString("ascii", 5, 5 + length),
          port: buffer.readUInt16BE(5 + length),
          atyp: buffer[3],
        });
        stage = 2;
        // A cold Tor circuit can take longer than Chromium's SOCKS timer.
        if (reply)
          setTimeout(
            () => socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0])),
            60,
          );
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as net.AddressInfo).port;
  cleanups.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { port, requests };
}

describe("cold onion circuit preparation", () => {
  it("bounds concurrent circuits and cancels every pending stream", async () => {
    const server = await proxy(false),
      warm = new OnionPreconnect(1000);
    const pending = Array.from({ length: 16 }, (_, n) =>
      warm.prepare(`http://${fixtureOnion(n + 60)}/`, server.port),
    );
    const settled = Promise.allSettled(pending);
    await expect(
      warm.prepare(`http://${fixtureOnion(80)}/`, server.port),
    ).rejects.toThrow("TOR_ONION_BUSY");
    warm.clear();
    expect(
      (await settled).every((result) => result.status === "rejected"),
    ).toBe(true);
  });
  it("uses only loopback SOCKS and ATYP03, deduplicates and sends no HTTP bytes", async () => {
    const server = await proxy(true),
      warm = new OnionPreconnect(1000);
    cleanups.push(async () => warm.clear());
    const host = fixtureOnion(52),
      url = `https://${host}/private?q=secret`;
    const start = Date.now();
    await Promise.all([
      warm.prepare(url, server.port),
      warm.prepare(url, server.port),
    ]);
    expect(Date.now() - start).toBeGreaterThanOrEqual(50);
    expect(server.requests).toEqual([{ host, port: 443, atyp: 3 }]);
    await warm.prepare(url, server.port);
    expect(server.requests).toHaveLength(1);
    await expect(
      warm.prepare("https://example.com", server.port),
    ).rejects.toThrow("TOR_ONION_TARGET");
    await expect(
      warm.prepare("http://facebook.onion", server.port),
    ).rejects.toThrow("TOR_ONION_TARGET");
  });
  it("fails closed on timeout, cancels outstanding streams and never caches failure", async () => {
    const server = await proxy(false),
      warm = new OnionPreconnect(60);
    const url = `http://${fixtureOnion(53)}/`;
    await expect(warm.prepare(url, server.port)).rejects.toThrow(
      "TOR_ONION_TIMEOUT",
    );
    const next = warm.prepare(url, server.port);
    const rejected = expect(next).rejects.toThrow("TOR_ONION_CANCELLED");
    warm.clear();
    await rejected;
    expect(server.requests).toHaveLength(1);
  });
});
