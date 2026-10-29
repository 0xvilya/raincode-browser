import http from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
import type { Command } from "../../src/shared/contracts";

let origin = "";
let server: http.Server;
const requests: string[] = [];

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    requests.push(request.url || "/");
    if (request.url === "/redirect-onion") {
      response.writeHead(302, { location: `http://${"a".repeat(56)}.onion/` });
      response.end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(
      `<!doctype html><html><head><title>Fixture ${request.url}</title></head><body><h1 id="title">Fixture ${request.url}</h1><a id="next" href="/b">Next</a><input aria-label="Text field"><script>window.fixtureReady = true;</script></body></html>`,
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture server address");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("real WebContents navigate, isolate Node, expose DevTools and are destroyed when closed", async ({
  rainBrowser,
}) => {
  const { app, shell } = rainBrowser;
  await open(shell, `${origin}/a`);
  const firstId = (await activeTab(shell)).id;
  const contentsId = await pageContentsId(app, `${origin}/a`);
  const isolation = await app.evaluate(async ({ webContents }, id) => {
    const contents = webContents.fromId(id)!;
    const runtime = await contents.executeJavaScript(
      "({ node: typeof process, require: typeof require, bridge: typeof window.raincode, fixtureReady: window.fixtureReady })",
    );
    return runtime;
  }, contentsId);
  expect(isolation).toEqual({
    node: "undefined",
    require: "undefined",
    bridge: "undefined",
    fixtureReady: true,
  });

  await open(shell, `${origin}/b`);
  await expect.poll(async () => (await activeTab(shell)).canGoBack).toBe(true);
  await command(shell, { type: "action", action: "back" });
  await expect
    .poll(async () => (await activeTab(shell)).url)
    .toBe(`${origin}/a`);
  await command(shell, { type: "action", action: "forward" });
  await expect
    .poll(async () => (await activeTab(shell)).url)
    .toBe(`${origin}/b`);
  await command(shell, { type: "action", action: "reload" });
  await expect
    .poll(async () => {
      const tab = await activeTab(shell);
      return { id: tab.id, url: tab.url, loading: tab.loading };
    })
    .toEqual({ id: firstId, url: `${origin}/b`, loading: false });

  // A pending back/forward traversal may replace its WebContents to cancel an
  // obsolete navigation. DevTools must inspect the current document, while
  // the logical tab keeps its identity throughout that lifecycle change.
  const inspectedContentsId = await pageContentsId(app, `${origin}/b`);
  await command(shell, { type: "action", action: "devtools" });
  await expect
    .poll(() =>
      app.evaluate(
        ({ webContents }, id) => webContents.fromId(id)?.isDevToolsOpened(),
        inspectedContentsId,
      ),
    )
    .toBe(true);
  const toolsContentsId = await app.evaluate(
    ({ webContents }, id) => webContents.fromId(id)?.devToolsWebContents?.id,
    inspectedContentsId,
  );
  expect(typeof toolsContentsId).toBe("number");
  await command(shell, { type: "tab.create", url: `${origin}/second` });
  await expect.poll(async () => (await state(shell)).tabs.length).toBe(2);
  await command(shell, { type: "tab.close", id: firstId });
  await expect
    .poll(() =>
      app.evaluate(
        ({ webContents }, value) => ({
          knownContentsDestroyed: value.ids.every(
            (id) => webContents.fromId(id) === undefined,
          ),
          remainingClosedPages: webContents
            .getAllWebContents()
            .filter((contents) => value.urls.includes(contents.getURL()))
            .length,
        }),
        {
          ids: [contentsId, inspectedContentsId, toolsContentsId as number],
          urls: [`${origin}/a`, `${origin}/b`],
        },
      ),
    )
    .toEqual({ knownContentsDestroyed: true, remainingClosedPages: 0 });
  await command(shell, { type: "tab.restore" });
  await expect
    .poll(async () =>
      (await state(shell)).tabs.some((tab) => tab.url === `${origin}/b`),
    )
    .toBe(true);
});

test("IPC validates commands and rejects privileged schemes before navigation", async ({
  rainBrowser: { shell },
}) => {
  const before = await state(shell);
  const invalid = [
    { type: "exec", command: "whoami" },
    { type: "tab.create", nodeIntegration: true },
    { type: "navigate", url: "file:///C:/Windows/win.ini" },
    { type: "navigate", url: "javascript:alert(1)" },
    { type: "navigate", url: `http://${"a".repeat(56)}.onion/` },
  ];
  for (const payload of invalid) {
    const result = await shell.evaluate(
      (value) => window.raincode.command(value as Command),
      payload,
    );
    expect(result.ok, JSON.stringify(payload)).toBe(false);
  }
  const after = await state(shell);
  expect(after.tabs.map((tab) => tab.url)).toEqual(
    before.tabs.map((tab) => tab.url),
  );
});

test("history and bookmarks persist and the active session is restored", async () => {
  const userData = await mkdtemp(path.join(tmpdir(), "raincode-restore-e2e-"));
  let app = await launchBrowser(userData);
  try {
    await open(app.shell, `${origin}/persist`);
    await command(app.shell, { type: "bookmark.toggle" });
    await command(app.shell, {
      type: "settings.update",
      settings: { rain: "off", locale: "en" },
    });
    await expect
      .poll(async () =>
        (await state(app.shell)).history.some(
          (visit) => visit.url === `${origin}/persist`,
        ),
      )
      .toBe(true);
    await app.app.close();
    app = await launchBrowser(userData);
    const restored = await state(app.shell);
    expect(
      restored.tabs.find((tab) => tab.id === restored.activeTabId)?.url,
    ).toBe(`${origin}/persist`);
    expect(restored.tabs.some((tab) => tab.url === `${origin}/persist`)).toBe(
      true,
    );
    expect(
      restored.history.some((visit) => visit.url === `${origin}/persist`),
    ).toBe(true);
    expect(
      restored.bookmarks.some(
        (bookmark) => bookmark.url === `${origin}/persist`,
      ),
    ).toBe(true);
    expect(restored.settings).toMatchObject({ rain: "off", locale: "en" });
    await command(app.shell, { type: "history.clear" });
    expect((await state(app.shell)).history).toEqual([]);
    const bookmark = restored.bookmarks.find(
      (item) => item.url === `${origin}/persist`,
    )!;
    await command(app.shell, { type: "bookmark.remove", id: bookmark.id });
    expect(
      (await state(app.shell)).bookmarks.some(
        (item) => item.id === bookmark.id,
      ),
    ).toBe(false);
  } finally {
    await app.app.close().catch(() => undefined);
    await rm(userData, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});

test("private profiles have separate storage and do not enter history", async ({
  rainBrowser: { app, shell },
}) => {
  await open(shell, `${origin}/direct-storage`);
  const direct = await pageContentsId(app, `${origin}/direct-storage`);
  await app.evaluate(async ({ webContents }, id) => {
    await webContents
      .fromId(id)!
      .executeJavaScript(
        'localStorage.setItem("private-boundary", "direct-secret"); document.cookie="boundary=direct; SameSite=Lax"',
      );
  }, direct);
  await command(shell, {
    type: "profile.create",
    name: "Private test",
    mode: "private",
  });
  const profile = (await state(shell)).profiles.find(
    (item) => item.name === "Private test",
  )!;
  await command(shell, {
    type: "tab.create",
    url: `${origin}/private-storage`,
    profileId: profile.id,
  });
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  const privateId = await pageContentsId(app, `${origin}/private-storage`);
  const data = await app.evaluate(
    async ({ webContents }, id) =>
      webContents
        .fromId(id)!
        .executeJavaScript(
          '({ value: localStorage.getItem("private-boundary"), cookies: document.cookie })',
        ),
    privateId,
  );
  expect(data).toEqual({ value: null, cookies: "" });
  expect(
    (await state(shell)).history.some(
      (visit) => visit.url === `${origin}/private-storage`,
    ),
  ).toBe(false);
});

test("offline emulation blocks new page requests", async ({
  rainBrowser: { shell },
}) => {
  await open(shell, `${origin}/online`);
  await command(shell, { type: "dev.configure", offline: true });
  const target = `/offline-${Date.now()}`;
  await command(shell, { type: "navigate", url: `${origin}${target}` });
  await expect
    .poll(async () => (await activeTab(shell)).error || "")
    .not.toBe("");
  expect(requests.includes(target)).toBe(false);
  await command(shell, { type: "dev.configure", offline: false });
  await open(shell, `${origin}/online-again`);
});

test("a controlled HTTP proxy carries requests and its failure never falls back to direct", async ({
  rainBrowser: { shell },
}) => {
  const proxied: string[] = [];
  const proxy = http.createServer((request, response) => {
    proxied.push(request.url || "");
    const target = new URL(request.url!);
    const upstream = http.request(
      target,
      { method: request.method, headers: request.headers },
      (result) => {
        response.writeHead(result.statusCode || 502, result.headers);
        result.pipe(response);
      },
    );
    upstream.on("error", () => {
      response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  if (!address || typeof address === "string")
    throw new Error("No proxy address");
  try {
    await command(shell, {
      type: "profile.create",
      name: "Controlled proxy",
      mode: "proxy",
      proxy: {
        scheme: "http",
        host: "127.0.0.1",
        port: address.port,
        bypassLocal: false,
      },
    });
    const profile = (await state(shell)).profiles.find(
      (item) => item.name === "Controlled proxy",
    )!;
    await command(shell, {
      type: "tab.create",
      url: `${origin}/proxied`,
      profileId: profile.id,
    });
    await expect.poll(() => proxied.includes(`${origin}/proxied`)).toBe(true);
    await expect
      .poll(async () => (await activeTab(shell)).title)
      .toBe("Fixture /proxied");
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    const blocked = `/no-direct-fallback-${Date.now()}`;
    await command(shell, { type: "navigate", url: `${origin}${blocked}` });
    await expect
      .poll(async () => (await activeTab(shell)).error || "")
      .not.toBe("");
    expect(requests.includes(blocked)).toBe(false);
    await command(shell, { type: "proxy.disconnect" });
    await open(shell, `${origin}/disconnected`);
    const disconnectedTab = await activeTab(shell);
    expect(
      (await state(shell)).profiles.find(
        (item) => item.id === disconnectedTab.profileId,
      )?.mode,
    ).toBe("direct");
  } finally {
    proxy.closeAllConnections();
    if (proxy.listening)
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});

test("onion redirects and subresources are blocked before a controlled proxy receives them", async ({
  rainBrowser: { app, shell },
}) => {
  const onion = `http://${"a".repeat(56)}.onion/`;
  const proxied: string[] = [];
  const proxy = http.createServer((request, response) => {
    proxied.push(request.url || "");
    if (request.url?.endsWith("/onion-redirect")) {
      response.writeHead(302, { location: onion });
      response.end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(
      `<!doctype html><title>Controlled onion guard</title><img id="guard" src="${onion}image"><script>window.guardResult = 'pending'; document.getElementById('guard').onerror = () => window.guardResult = 'blocked';</script>`,
    );
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  if (!address || typeof address === "string")
    throw new Error("Missing proxy address");
  try {
    await command(shell, {
      type: "profile.create",
      name: "Onion guard",
      mode: "proxy",
      proxy: {
        scheme: "http",
        host: "127.0.0.1",
        port: address.port,
        bypassLocal: false,
      },
    });
    const profile = (await state(shell)).profiles.find(
      (item) => item.name === "Onion guard",
    )!;
    await command(shell, {
      type: "tab.create",
      profileId: profile.id,
      url: `${origin}/onion-subresource`,
    });
    await expect
      .poll(async () => (await activeTab(shell)).title)
      .toBe("Controlled onion guard");
    const contentsId = await pageContentsId(app, `${origin}/onion-subresource`);
    await expect
      .poll(() =>
        app.evaluate(
          async ({ webContents }, id) =>
            webContents.fromId(id)!.executeJavaScript("window.guardResult"),
          contentsId,
        ),
      )
      .toBe("blocked");
    expect(proxied.some((url) => url.includes(".onion"))).toBe(false);
    await command(shell, { type: "navigate", url: `${origin}/onion-redirect` });
    await expect
      .poll(async () => (await activeTab(shell)).error || "")
      .not.toBe("");
    expect(proxied.some((url) => url.includes(".onion"))).toBe(false);
  } finally {
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});
