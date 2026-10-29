import net from "node:net";
import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { TorControl } from "../../src/main/tor";

it("discards a timed-out control channel instead of associating its late reply with another command", async () => {
  const received: string[] = [];
  let incoming: net.Socket | undefined;
  let sawRequest!: () => void;
  const request = new Promise<void>((resolve) => {
    sawRequest = resolve;
  });
  const server = net.createServer((socket) => {
    incoming = socket;
    socket.on("error", () => {});
    socket.on("data", (data) => {
      received.push(data.toString("ascii"));
      sawRequest();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const closed = vi.fn();
  const control = new TorControl(
    (server.address() as net.AddressInfo).port,
    () => {},
    closed,
  );
  try {
    await once(control.socket, "connect");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const result = expect(
      control.command("GETINFO status/bootstrap-phase"),
    ).rejects.toThrow("TOR_CONTROL_TIMEOUT");
    await request;
    const closeEvent = once(control.socket, "close");
    await vi.advanceTimersByTimeAsync(7001);
    await result;
    await closeEvent;
    await expect(
      control.command("GETINFO net/listeners/socks"),
    ).rejects.toThrow("TOR_CONTROL");
    expect(received).toEqual(["GETINFO status/bootstrap-phase\r\n"]);
    expect(closed).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
    control.close();
    incoming?.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
