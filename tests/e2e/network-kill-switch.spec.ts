import http from "node:http";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Socket } from "node:net";
import {
  activeTab,
  command,
  expect,
  launchBrowser,
  open,
  pageContentsId,
  state,
  test,
} from "./fixtures";
import type { Command, CommandResult } from "../../src/shared/contracts";

async function fixture() {
  const requests: string[] = [];
  const sockets = new Map<Socket, string>();
  const opened = new Set<string>();
  const frames = new Map<string, number>();
  const closeFrames: string[] = [];
  const unproxied: string[] = [];
  const transfers = new Set<http.ServerResponse>();
  const transferTimers = new Set<ReturnType<typeof setInterval>>();
  let transferBytes = 0;
  let origin = "";
  const server = http.createServer((request, response) => {
    const url = request.url || "/";
    requests.push(url);
    if (
      ["/proxy-live", "/proxy-poll"].includes(url) &&
      request.headers["x-raincode-fixture-proxy"] !== "owned-local-proxy"
    )
      unproxied.push(url);
    const socketURL = origin.replace("http:", "ws:");
    response.setHeader("Cache-Control", "no-store");
    if (url === "/download-slow") {
      response.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition":
          'attachment; filename="raincode-kill-fixture.txt"',
        "Content-Length": String(32 * 1024 * 1024),
      });
      transfers.add(response);
      const chunk = Buffer.alloc(16384, 0x52);
      const timer = setInterval(() => {
        if (!response.destroyed) {
          response.write(chunk);
          transferBytes += chunk.length;
        }
      }, 40);
      transferTimers.add(timer);
      response.once("close", () => {
        clearInterval(timer);
        transferTimers.delete(timer);
        transfers.delete(response);
      });
    } else if (url === "/dedicated-worker.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(`
        const socket = new WebSocket(${JSON.stringify(`${socketURL}/ws-worker`)});
        socket.onopen = () => postMessage('ready');
        setInterval(() => {
          fetch('/worker-poll').catch(() => {});
          if (socket.readyState === 1) socket.send('worker');
        }, 80);
      `);
    } else if (url === "/service-worker.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.setHeader("Service-Worker-Allowed", "/");
      response.end(`
        self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
        self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
        self.addEventListener('message', event => {
          if (event.data !== 'start') return;
          event.waitUntil((async () => {
            const socket = new WebSocket(${JSON.stringify(`${socketURL}/ws-service-worker`)});
            await new Promise((resolve, reject) => {
              socket.onopen = resolve; socket.onerror = reject;
            });
            event.source.postMessage('service-ready');
            const interval = setInterval(() => {
              fetch('/service-worker-poll').catch(() => {});
              if (socket.readyState === 1) socket.send('service-worker');
            }, 80);
            await new Promise(resolve => setTimeout(resolve, 60000));
            clearInterval(interval); socket.close();
          })());
        });
      `);
    } else if (url === "/proxy-live") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><title>Owned proxy kill fixture</title><h1>Proxy</h1>
        <script>setInterval(() => fetch('/proxy-poll').catch(() => {}), 80);</script>`);
    } else if (url.includes("poll")) {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("local fixture");
    } else if (url === "/live") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><title>Kill switch live fixture</title><h1>Live</h1>
        <script>
          window.killFixture = { page: false, dedicated: false, service: false };
          const socket = new WebSocket(${JSON.stringify(`${socketURL}/ws-page`)});
          socket.onopen = () => window.killFixture.page = true;
          setInterval(() => {
            fetch('/page-poll').catch(() => {});
            if (socket.readyState === 1) socket.send('page');
          }, 80);
          const worker = new Worker('/dedicated-worker.js');
          worker.onmessage = () => window.killFixture.dedicated = true;
          navigator.serviceWorker.addEventListener('message', event => {
            if (event.data === 'service-ready') window.killFixture.service = true;
          });
          navigator.serviceWorker.register('/service-worker.js')
            .then(() => navigator.serviceWorker.ready)
            .then(registration => registration.active.postMessage('start'));
        </script>`);
    } else {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(
        "<!doctype html><title>Kill switch plain fixture</title><h1>Plain</h1>",
      );
    }
  });
  server.on("upgrade", (request, socket) => {
    const key = request.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      socket.destroy();
      return;
    }
    const accept = createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const kind = request.url || "/";
    sockets.set(socket as Socket, kind);
    opened.add(kind);
    socket.on("error", () => undefined);
    socket.on("close", () => sockets.delete(socket as Socket));
    let incoming = Buffer.alloc(0);
    socket.on("data", (bytes: Buffer) => {
      // Reply to a clean close handshake; otherwise retain the transport until
      // Chromium actually terminates it. No fake timeout closes these sockets.
      incoming = Buffer.concat([incoming, bytes]);
      while (incoming.length >= 2) {
        const opcode = incoming[0] & 0x0f;
        const masked = Boolean(incoming[1] & 0x80);
        let length = incoming[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (incoming.length < 4) return;
          length = incoming.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (incoming.length < 10) return;
          const largeLength = incoming.readBigUInt64BE(2);
          if (largeLength > 65536n) {
            socket.destroy();
            return;
          }
          length = Number(largeLength);
          offset = 10;
        }
        const maskOffset = offset;
        if (masked) offset += 4;
        if (incoming.length < offset + length) return;
        const payload = Buffer.from(incoming.subarray(offset, offset + length));
        if (masked)
          for (let index = 0; index < payload.length; index++)
            payload[index] ^= incoming[maskOffset + (index % 4)];
        incoming = incoming.subarray(offset + length);
        if (opcode === 8) {
          closeFrames.push(kind);
          const close = payload.subarray(0, 125);
          socket.end(Buffer.concat([Buffer.from([0x88, close.length]), close]));
          return;
        }
        if ([0, 1, 2].includes(opcode))
          frames.set(kind, (frames.get(kind) || 0) + 1);
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture port");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    requests,
    sockets,
    opened,
    frames,
    closeFrames,
    unproxied,
    transfers,
    get transferBytes() {
      return transferBytes;
    },
    async close() {
      for (const timer of transferTimers) clearInterval(timer);
      for (const response of transfers) response.destroy();
      for (const socket of sockets.keys()) socket.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test("global kill switch terminates page, dedicated-worker and service-worker transports and cannot be bypassed", async ({
  rainBrowser: { app, shell },
}) => {
  const local = await fixture();
  let framesAfterKill: Record<string, number> = {};
  try {
    await open(shell, `${local.origin}/live`);
    const original = await activeTab(shell);
    const contentsId = await pageContentsId(app, original.url);
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }, id) =>
            webContents.fromId(id)!.executeJavaScript("window.killFixture"),
          contentsId,
        ),
      )
      .toEqual({ page: true, dedicated: true, service: true });
    const privateProfile = await command(shell, {
      type: "profile.create",
      name: "Existing private transport fixture",
      mode: "private",
    });
    await command(shell, {
      type: "tab.create",
      url: `${local.origin}/live`,
      profileId: privateProfile.data as string,
    });
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    const privateContentsId = await app.evaluate(
      ({ webContents }, value) =>
        webContents
          .getAllWebContents()
          .find(
            (item) => item.id !== value.first && item.getURL() === value.url,
          )?.id,
      { first: contentsId, url: original.url },
    );
    expect(typeof privateContentsId).toBe("number");
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }, id) =>
            webContents.fromId(id)!.executeJavaScript("window.killFixture"),
          privateContentsId as number,
        ),
      )
      .toEqual({ page: true, dedicated: true, service: true });
    await expect.poll(() => local.sockets.size).toBe(6);
    await command(shell, { type: "tab.activate", id: original.id });
    await app.evaluate(
      ({ webContents }, ids) => {
        const diagnostic = globalThis as typeof globalThis & {
          killFixtureSessions?: Electron.Session[];
        };
        diagnostic.killFixtureSessions = ids.map(
          (id) => webContents.fromId(id)!.session,
        );
      },
      [contentsId, privateContentsId as number],
    );
    expect([...local.opened].sort()).toEqual([
      "/ws-page",
      "/ws-service-worker",
      "/ws-worker",
    ]);
    await expect
      .poll(() =>
        ["/page-poll", "/worker-poll", "/service-worker-poll"].every((url) =>
          local.requests.includes(url),
        ),
      )
      .toBe(true);
    await command(shell, {
      type: "settings.update",
      settings: { networkKillSwitch: true },
    });
    framesAfterKill = Object.fromEntries(local.frames);
    expect((await state(shell)).settings.networkKillSwitch).toBe(true);
    expect(await activeTab(shell)).toMatchObject({
      id: original.id,
      url: original.url,
      loading: false,
      suspended: true,
    });
    await expect
      .poll(() =>
        app.evaluate(() => {
          const diagnostic = globalThis as typeof globalThis & {
            killFixtureSessions?: Electron.Session[];
          };
          return diagnostic.killFixtureSessions!.flatMap((current) =>
            Object.values(current.serviceWorkers.getAllRunning()),
          );
        }),
      )
      .toEqual([]);
    await expect.poll(() => [...local.sockets.values()].sort()).toEqual([]);
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }, ids) =>
            ids.every((id) => webContents.fromId(id) === undefined),
          [contentsId, privateContentsId as number],
        ),
      )
      .toBe(true);
    const stoppedCount = local.requests.length;
    await command(shell, { type: "dev.configure", offline: false });
    const denied: Command[] = [
      { type: "action", action: "reload" },
      { type: "tor.start" },
      { type: "dev.ports" },
      { type: "dev.command", command: "Write-Output 'must-not-run'" },
      { type: "proxy.test", profileId: "default" },
    ];
    for (const payload of denied) {
      const result = await shell.evaluate(
        (value) => window.raincode.command(value),
        payload,
      );
      expect(result.ok, JSON.stringify(payload)).toBe(false);
    }
    await command(shell, {
      type: "tab.create",
      url: `${local.origin}/blocked-new`,
    });
    const killedPrivateProfile = await command(shell, {
      type: "profile.create",
      name: "Killed private fixture",
      mode: "private",
    });
    await command(shell, {
      type: "tab.create",
      url: `${local.origin}/blocked-private`,
      profileId: killedPrivateProfile.data as string,
    });
    await command(shell, { type: "dev.configure", offline: false });
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }, origin) =>
            webContents
              .getAllWebContents()
              .filter((item) => item.getURL().startsWith(origin)).length,
          local.origin,
        ),
      )
      .toBe(0);
    // Observe beyond several 80ms fixture intervals: neither a surviving
    // worker nor a newly requested document may reach the server.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(local.requests).toHaveLength(stoppedCount);
    await command(shell, {
      type: "settings.update",
      settings: { networkKillSwitch: false },
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(local.requests).toHaveLength(stoppedCount);
    await command(shell, { type: "tab.activate", id: original.id });
    await command(shell, { type: "action", action: "reload" });
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    await expect
      .poll(() => local.requests.length)
      .toBeGreaterThan(stoppedCount);
    expect((await activeTab(shell)).url).toBe(original.url);
  } finally {
    await test.info().attach("controlled-transport-state", {
      body: Buffer.from(
        JSON.stringify({
          openSockets: [...local.sockets.values()],
          frameCounts: Object.fromEntries(local.frames),
          framesImmediatelyAfterKill: framesAfterKill,
          receivedCloseFrames: local.closeFrames,
          httpRequestCount: local.requests.length,
        }),
      ),
      contentType: "application/json",
    });
    await local.close();
  }
});

test("kill switch cancels an ongoing consented inert download and stops its transport", async ({
  rainBrowser: { app, shell, userData },
}) => {
  const local = await fixture();
  try {
    await open(shell, `${local.origin}/download-page`);
    const id = await pageContentsId(app, `${local.origin}/download-page`);
    const destination = path.join(userData, "raincode-kill-fixture.txt");
    await app.evaluate(({ dialog }, file) => {
      dialog.showMessageBoxSync = (() => 1) as typeof dialog.showMessageBoxSync;
      dialog.showSaveDialogSync = (() =>
        file) as typeof dialog.showSaveDialogSync;
    }, destination);
    await app.evaluate(
      ({ webContents }, value) =>
        webContents.fromId(value.id)!.downloadURL(value.url),
      { id, url: `${local.origin}/download-slow` },
    );
    await expect
      .poll(async () => {
        const download = (await state(shell)).downloads.find(
          (item) => item.path === destination,
        );
        return Boolean(
          download &&
          download.status === "progressing" &&
          download.received > 0,
        );
      })
      .toBe(true);
    expect(local.transfers.size).toBe(1);
    const started = performance.now();
    await command(shell, {
      type: "settings.update",
      settings: { networkKillSwitch: true },
    });
    expect(performance.now() - started).toBeLessThan(4000);
    await expect
      .poll(
        async () =>
          (await state(shell)).downloads.find(
            (item) => item.path === destination,
          )?.status,
      )
      .toBe("cancelled");
    await expect.poll(() => local.transfers.size).toBe(0);
    const bytesAtStop = local.transferBytes;
    const receivedAtStop = (await state(shell)).downloads.find(
      (item) => item.path === destination,
    )!.received;
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(local.transferBytes).toBe(bytesAtStop);
    expect(
      (await state(shell)).downloads.find((item) => item.path === destination)!
        .received,
    ).toBe(receivedAtStop);
  } finally {
    await shell
      .evaluate(() =>
        window.raincode.command({
          type: "settings.update",
          settings: { networkKillSwitch: true },
        }),
      )
      .catch(() => undefined);
    await local.close();
  }
});

test("emergency kill bypasses a running approved project command and terminates its owned process", async ({
  rainBrowser: { app, shell, userData },
}) => {
  test.skip(
    process.platform !== "win32",
    "This integration exercises the real Windows PowerShell runner.",
  );
  const local = await fixture();
  let running: Promise<CommandResult> | undefined;
  try {
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    }, userData);
    await command(shell, { type: "action", action: "project" });
    expect((await state(shell)).projectPath).toBe(userData);
    const script = `$ErrorActionPreference = 'Stop'; Write-Output ('RAINCODE_FIXTURE_PID=' + $PID); while ($true) { Invoke-WebRequest -UseBasicParsing -Uri '${local.origin}/command-tick' -TimeoutSec 2 | Out-Null; Start-Sleep -Milliseconds 100 }`;
    running = shell.evaluate(
      (value) =>
        window.raincode.command({ type: "dev.command", command: value }),
      script,
    );
    // Count real OS-process HTTP requests before asking main to stop it.
    await expect
      .poll(
        () => local.requests.filter((url) => url === "/command-tick").length,
      )
      .toBeGreaterThanOrEqual(3);
    const started = performance.now();
    await command(shell, {
      type: "settings.update",
      settings: { networkKillSwitch: true },
    });
    const killLatency = performance.now() - started;
    expect(killLatency).toBeLessThan(4000);
    const result = await running;
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ timedOut: false });
    const output = (result.data as { output: string }).output;
    const match = /RAINCODE_FIXTURE_PID=(\d+)/.exec(output);
    expect(match).not.toBeNull();
    const pid = Number(match![1]);
    expect(pid).toBeGreaterThan(0);
    await expect
      .poll(() =>
        app.evaluate((_electron, ownedPid) => {
          try {
            process.kill(ownedPid, 0);
            return true;
          } catch {
            return false;
          }
        }, pid),
      )
      .toBe(false);
    const countAtStop = local.requests.length;
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(local.requests).toHaveLength(countAtStop);
    await test.info().attach("command-kill-latency", {
      body: Buffer.from(
        JSON.stringify({
          killLatencyMs: killLatency,
          timedOut: false,
          ownedProcessTerminated: true,
          stoppedHttpTicks: countAtStop,
        }),
      ),
      contentType: "application/json",
    });
  } finally {
    await shell
      .evaluate(() =>
        window.raincode.command({
          type: "settings.update",
          settings: { networkKillSwitch: true },
        }),
      )
      .catch(() => undefined);
    await running?.catch(() => undefined);
    await local.close();
  }
});

test("dashboard kill state persists across restart and requires an explicit reload to reconnect", async () => {
  const local = await fixture();
  const userData = await mkdtemp(path.join(tmpdir(), "raincode-kill-restart-"));
  let browser = await launchBrowser(userData);
  try {
    await open(browser.shell, `${local.origin}/plain`);
    const original = await activeTab(browser.shell);
    await command(browser.shell, {
      type: "settings.update",
      settings: { locale: "en" },
    });
    await command(browser.shell, {
      type: "tab.create",
      url: "raincode://privacy",
    });
    await browser.shell
      .getByRole("tab", { name: "Diagnostics", exact: true })
      .click();
    const kill = browser.shell.getByRole("switch", {
      name: "Network Kill Switch",
      exact: true,
    });
    await kill.check();
    await expect
      .poll(async () => (await state(browser.shell)).settings.networkKillSwitch)
      .toBe(true);
    await command(browser.shell, { type: "tab.activate", id: original.id });
    await browser.app.close();
    const count = local.requests.length;
    browser = await launchBrowser(userData);
    expect((await state(browser.shell)).settings.networkKillSwitch).toBe(true);
    expect(await activeTab(browser.shell)).toMatchObject({
      id: original.id,
      url: original.url,
      suspended: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(local.requests).toHaveLength(count);
    await command(browser.shell, {
      type: "tab.create",
      url: "raincode://privacy",
    });
    await browser.shell
      .getByRole("tab", { name: "Diagnostics", exact: true })
      .click();
    const history = browser.shell.getByRole("switch", {
      name: "Browsing history",
      exact: true,
    });
    await history.uncheck();
    await expect
      .poll(async () => (await state(browser.shell)).settings.historyEnabled)
      .toBe(false);
    await browser.shell
      .getByRole("switch", { name: "Network Kill Switch", exact: true })
      .uncheck();
    await expect
      .poll(async () => (await state(browser.shell)).settings.networkKillSwitch)
      .toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(local.requests).toHaveLength(count);
    await command(browser.shell, { type: "tab.activate", id: original.id });
    await command(browser.shell, { type: "action", action: "reload" });
    await expect.poll(() => local.requests.length).toBeGreaterThan(count);
    await expect
      .poll(async () => (await activeTab(browser.shell)).loading)
      .toBe(false);
    expect(
      (await state(browser.shell)).history.filter(
        (visit) => visit.url === original.url,
      ),
    ).toHaveLength(1);
  } finally {
    await browser.app.close().catch(() => undefined);
    await local.close();
    await rm(userData, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});

test("a per-profile HTTP proxy overrides the direct startup flag and stays isolated through kill and explicit resume", async ({
  rainBrowser: { app, shell },
}) => {
  const local = await fixture();
  const hits: string[] = [];
  const refused: string[] = [];
  const proxySockets = new Set<Socket>();
  const upstreams = new Set<http.ClientRequest>();
  const proxy = http.createServer((request, response) => {
    let target: URL;
    try {
      target = new URL(request.url || "");
    } catch {
      response.writeHead(400).end();
      return;
    }
    // This fixture cannot become an open proxy: no external destination is
    // forwarded, even if Chromium starts an unexpected background request.
    if (target.origin !== local.origin) {
      refused.push(target.origin);
      response.writeHead(403).end();
      return;
    }
    hits.push(target.href);
    const upstream = http.request(
      target,
      {
        method: request.method,
        agent: false,
        headers: {
          ...request.headers,
          host: target.host,
          "x-raincode-fixture-proxy": "owned-local-proxy",
        },
      },
      (result) => {
        response.writeHead(result.statusCode || 502, result.headers);
        result.pipe(response);
      },
    );
    upstreams.add(upstream);
    upstream.once("close", () => upstreams.delete(upstream));
    upstream.once("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    response.once("close", () => upstream.destroy());
    request.pipe(upstream);
  });
  proxy.on("connection", (socket) => {
    proxySockets.add(socket);
    socket.once("close", () => proxySockets.delete(socket));
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  if (!address || typeof address === "string")
    throw new Error("Proxy fixture port");
  try {
    const created = await command(shell, {
      type: "profile.create",
      name: "Owned proxy kill profile",
      mode: "proxy",
      proxy: {
        scheme: "http",
        host: "127.0.0.1",
        port: address.port,
        bypassLocal: false,
      },
    });
    const profileId = created.data as string;
    await command(shell, {
      type: "tab.create",
      url: `${local.origin}/proxy-live`,
      profileId,
    });
    await expect
      .poll(async () => (await activeTab(shell)).title)
      .toBe("Owned proxy kill fixture");
    await expect
      .poll(
        () => hits.filter((url) => url === `${local.origin}/proxy-poll`).length,
      )
      .toBeGreaterThanOrEqual(3);
    const original = await activeTab(shell);
    expect(original.profileId).toBe(profileId);
    expect(hits).toContain(`${local.origin}/proxy-live`);
    expect(local.unproxied).toEqual([]);
    expect(refused).toEqual([]);
    const id = await pageContentsId(app, original.url);
    await command(shell, {
      type: "settings.update",
      settings: { networkKillSwitch: true },
    });
    await expect.poll(() => proxySockets.size).toBe(0);
    await expect.poll(() => upstreams.size).toBe(0);
    expect(
      await app.evaluate(
        ({ webContents }, contentsId) =>
          webContents.fromId(contentsId) === undefined,
        id,
      ),
    ).toBe(true);
    const stoppedHits = hits.length;
    const stoppedOrigin = local.requests.length;
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(hits).toHaveLength(stoppedHits);
    expect(local.requests).toHaveLength(stoppedOrigin);
    expect(
      (await state(shell)).profiles.find((profile) => profile.id === profileId),
    ).toMatchObject({
      mode: "proxy",
      proxy: { scheme: "http", port: address.port },
    });
    await command(shell, {
      type: "settings.update",
      settings: { networkKillSwitch: false },
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(hits).toHaveLength(stoppedHits);
    expect(local.requests).toHaveLength(stoppedOrigin);
    await command(shell, { type: "action", action: "reload" });
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    await expect.poll(() => hits.length).toBeGreaterThan(stoppedHits);
    await expect
      .poll(() => local.requests.length)
      .toBeGreaterThan(stoppedOrigin);
    expect(await activeTab(shell)).toMatchObject({
      id: original.id,
      profileId,
      url: original.url,
    });
    expect(
      (await state(shell)).profiles.find((profile) => profile.id === profileId)
        ?.mode,
    ).toBe("proxy");
    expect(local.unproxied).toEqual([]);
    expect(refused).toEqual([]);
  } finally {
    await shell
      .evaluate(() =>
        window.raincode.command({
          type: "settings.update",
          settings: { networkKillSwitch: true },
        }),
      )
      .catch(() => undefined);
    for (const upstream of upstreams) upstream.destroy();
    for (const socket of proxySockets) socket.destroy();
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await local.close();
  }
});
