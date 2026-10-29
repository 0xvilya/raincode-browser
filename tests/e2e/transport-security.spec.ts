import http from "node:http";
import { once } from "node:events";
import {
  command,
  expect,
  test,
  state,
  activeTab,
  pageContentsId,
} from "./fixtures";

test("HTTPS-only upgrades before proxy traffic, blocks plaintext writes and survives unrelated settings", async ({
  rainBrowser: { app, shell },
}) => {
  const clear: string[] = [];
  const tunnels: string[] = [];
  let wsAttempts = 0;
  // All destinations terminate in our loopback proxy: no external DNS, TLS
  // bypass or third-party fixture needed to observe plaintext-vs-CONNECT.
  const proxy = http.createServer((request, response) => {
    if (request.url?.includes("/socket")) wsAttempts++;
    clear.push(`${request.method} ${request.url}`);
    response.end("<!doctype html><title>Owned transport fixture</title>");
  });
  proxy.on("connect", (request, socket) => {
    if (request.url === "transport.example.test:80") wsAttempts++;
    tunnels.push(request.url || "");
    socket.end(
      "HTTP/1.1 502 Fixture intentionally refuses TLS tunnel\r\nContent-Length: 0\r\n\r\n",
    );
  });
  proxy.on("upgrade", (_request, socket) => {
    wsAttempts++;
    socket.end(
      "HTTP/1.1 400 Controlled WebSocket probe\r\nContent-Length: 0\r\n\r\n",
    );
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  if (!address || typeof address === "string") throw new Error("Proxy port");
  try {
    expect((await state(shell)).settings.httpsOnly).toBe(true);
    await command(shell, {
      type: "profile.create",
      mode: "proxy",
      name: "Owned TLS transport",
      proxy: {
        scheme: "http",
        host: "127.0.0.1",
        port: address.port,
        bypassLocal: false,
      },
    });
    const profile = (await state(shell)).profiles.find(
      (item) => item.name === "Owned TLS transport",
    )!;
    await command(shell, {
      type: "tab.create",
      profileId: profile.id,
      url: "http://transport.example.test/probe",
    });
    await expect.poll(() => tunnels).toContain("transport.example.test:443");
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    expect(clear).toEqual([]);
    const fetchInSession = (url: string, method: string) =>
      app.evaluate(
        async ({ session }, args) => {
          try {
            await session
              .fromPartition(`persist:raincode-${args.id}`)
              .fetch(args.url, { method: args.method });
            return true;
          } catch {
            return false;
          }
        },
        { id: profile.id, url, method },
      );
    expect(
      await fetchInSession("http://transport.example.test/post", "POST"),
    ).toBe(false);
    expect(clear).toEqual([]);
    // Controlled positive check: the exact same request does reach our proxy
    // when the user explicitly disables HTTPS-only.
    await command(shell, {
      type: "settings.update",
      settings: { httpsOnly: false, motionPreference: "full", bokeh: false },
    });
    expect(
      await fetchInSession("http://transport.example.test/post", "POST"),
    ).toBe(true);
    expect(clear).toContain("POST http://transport.example.test/post");
    await command(shell, {
      type: "navigate",
      url: "http://transport.example.test/live",
    });
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    const old = await pageContentsId(app, "http://transport.example.test/live");
    const probeSocket = (id: number) =>
      app.evaluate(
        ({ webContents }, target) =>
          webContents.fromId(target)!.executeJavaScript(`
      new Promise(resolve => {
        const socket = new WebSocket('ws://transport.example.test/socket');
        const timer = setTimeout(() => { socket.close(); resolve('timeout'); }, 3000);
        socket.onerror = () => { clearTimeout(timer); resolve('error'); };
        socket.onopen = () => { clearTimeout(timer); socket.close(); resolve('open'); };
      })
    `),
        id,
      );
    expect(await probeSocket(old)).toBe("error");
    expect(wsAttempts).toBeGreaterThan(0);
    await command(shell, {
      type: "settings.update",
      settings: { httpsOnly: true },
    });
    expect(
      await app.evaluate(
        ({ webContents }, id) => !!webContents.fromId(id),
        old,
      ),
    ).toBe(false);
    expect((await activeTab(shell)).suspended).toBe(true);
    expect(
      await fetchInSession("http://transport.example.test/new-post", "POST"),
    ).toBe(false);
    expect(clear.some((item) => item.includes("new-post"))).toBe(false);
    // Loopback development remains usable; its native renderer cannot bypass
    // the public ws: policy. Both runs use the same controlled proxy.
    await command(shell, {
      type: "navigate",
      url: "http://localhost/socket-page",
    });
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    const local = await pageContentsId(app, "http://localhost/socket-page");
    const previousWS = wsAttempts;
    expect(await probeSocket(local)).toBe("error");
    expect(wsAttempts).toBe(previousWS);
    await command(shell, {
      type: "settings.update",
      settings: { networkKillSwitch: true },
    });
    await command(shell, {
      type: "settings.update",
      settings: { fontSize: 16, rain: "high" },
    });
    expect((await state(shell)).settings).toMatchObject({
      networkKillSwitch: true,
      httpsOnly: true,
      motionPreference: "full",
      bokeh: false,
      fontSize: 16,
    });
    const count = tunnels.length;
    expect(
      await fetchInSession("https://transport.example.test/blocked", "GET"),
    ).toBe(false);
    expect(tunnels).toHaveLength(count);
    await command(shell, {
      type: "settings.update",
      settings: { networkKillSwitch: false },
    });
  } finally {
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});

test("invalid onion input explains v3 without starting Tor or navigating/searching", async ({
  rainBrowser: { shell },
}) => {
  const initial = await state(shell);
  const input = shell.locator('.home-search input[name="search"]');
  await input.fill("facebook.onion");
  await input.press("Enter");
  await expect(shell.getByText(/facebook\.onion не является/)).toBeVisible();
  const current = await state(shell);
  expect(current.tor?.status).toBe(initial.tor?.status);
  expect(current.tabs.map((tab) => tab.url)).toEqual(
    initial.tabs.map((tab) => tab.url),
  );
  expect(current.history).toEqual(initial.history);
});
