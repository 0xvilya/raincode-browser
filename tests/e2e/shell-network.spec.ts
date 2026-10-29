import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test, expect, open } from "./fixtures";

test("browser shell cannot initiate external HTTP while visited pages retain their selected connection", async ({
  rainBrowser: { app, shell },
}) => {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests++;
    response.end("<title>Network boundary</title><h1>Page works</h1>");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  try {
    const blocked = await app.evaluate(async ({ session }, url) => {
      try {
        await session.fromPartition("raincode-ui").fetch(url);
        return false;
      } catch {
        return true;
      }
    }, url);
    expect(blocked).toBe(true);
    expect(requests).toBe(0);
    await open(shell, url);
    expect(requests).toBeGreaterThan(0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
