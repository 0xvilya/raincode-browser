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
import type { ElectronApplication, Page } from "@playwright/test";

let server: http.Server;
let origin = "";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNI2fLhPwAGkAMIJxFZsAAAAABJRU5ErkJggg==",
  "base64",
);

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    if (request.url === "/favicon.png") {
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(png);
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(
      `<!doctype html><title>Core ${request.url}</title><link rel="icon" href="/favicon.png"><h1 id="real-dom">Core ${request.url}</h1><a id="next" href="/next">Next</a><input id="site-input">`,
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture port");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function nativeKey(
  app: ElectronApplication,
  id: number,
  keyCode: string,
  modifiers: NonNullable<Electron.KeyboardInputEvent["modifiers"]> = [],
) {
  await app.evaluate(
    ({ webContents }, value) => {
      const contents = webContents.fromId(value.id)!;
      contents.sendInputEvent({
        type: "keyDown",
        keyCode: value.keyCode,
        modifiers: value.modifiers,
      });
      contents.sendInputEvent({
        type: "keyUp",
        keyCode: value.keyCode,
        modifiers: value.modifiers,
      });
    },
    { id, keyCode, modifiers },
  );
}

async function settledURL(shell: Page, url: string) {
  await expect
    .poll(async () => {
      const tab = await activeTab(shell);
      return { url: tab.url, loading: tab.loading };
    })
    .toEqual({ url, loading: false });
}

test("native web page shortcuts drive real history, source, reload, zoom and tab cycling", async ({
  rainBrowser: { app, shell },
}) => {
  await open(shell, `${origin}/first`);
  const first = await activeTab(shell);
  const contentsId = await pageContentsId(app, first.url);
  await open(shell, `${origin}/second`);
  await nativeKey(app, contentsId, "Left", ["alt"]);
  await settledURL(shell, `${origin}/first`);
  await nativeKey(app, contentsId, "Right", ["alt"]);
  await settledURL(shell, `${origin}/second`);
  await nativeKey(app, contentsId, "R", ["control", "shift"]);
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  await nativeKey(app, contentsId, "-", ["control"]);
  await expect.poll(async () => (await activeTab(shell)).zoom).toBeCloseTo(0.9);
  await nativeKey(app, contentsId, "0", ["control"]);
  await expect.poll(async () => (await activeTab(shell)).zoom).toBe(1);
  await nativeKey(app, contentsId, "U", ["control"]);
  await expect
    .poll(async () => (await activeTab(shell)).url)
    .toBe(`view-source:${origin}/second`);
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  const sourceId = await pageContentsId(app, `view-source:${origin}/second`);
  await expect
    .poll(() =>
      app.evaluate(
        async ({ webContents }, id) =>
          webContents.fromId(id)!.executeJavaScript("document.body.innerText"),
        sourceId,
      ),
    )
    .toContain('<h1 id="real-dom">');
  await nativeKey(app, sourceId, "Tab", ["control", "shift"]);
  await expect.poll(async () => (await activeTab(shell)).id).toBe(first.id);
  await nativeKey(app, contentsId, "T", ["control"]);
  await expect.poll(async () => (await state(shell)).tabs.length).toBe(3);
  const shellId = await app.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.id,
  );
  // CDP Input.dispatchKeyEvent bypasses Electron before-input-event. Exercise
  // the native shell event path with sendInputEvent as for remote content.
  await nativeKey(app, shellId, "W", ["control"]);
  await expect.poll(async () => (await state(shell)).tabs.length).toBe(2);
  await nativeKey(app, shellId, "T", ["control", "shift"]);
  await expect.poll(async () => (await state(shell)).tabs.length).toBe(3);
});

test("recently closed stays distinct from workspaces and restores a chosen native history with metadata", async ({
  rainBrowser: { shell },
}) => {
  await open(shell, `${origin}/before`);
  await open(shell, `${origin}/after`);
  const first = await activeTab(shell);
  await command(shell, {
    type: "tab.update",
    id: first.id,
    pinned: true,
    muted: true,
    group: "Core",
  });
  await command(shell, { type: "action", action: "zoomIn" });
  await command(shell, { type: "tab.close", id: first.id });
  await command(shell, { type: "tab.create", url: "raincode://workspaces" });
  const workspaceTab = await activeTab(shell);
  await command(shell, { type: "tab.close", id: workspaceTab.id });
  await command(shell, { type: "navigate", url: "raincode://recently-closed" });
  expect((await activeTab(shell)).url).toBe("raincode://recently-closed");
  const closed = (await state(shell)).recentlyClosed.find(
    (tab) => tab.id === first.id,
  )!;
  expect(closed.closedAt).toBeGreaterThan(0);
  await command(shell, { type: "tab.restore", id: first.id });
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  expect(await activeTab(shell)).toMatchObject({
    url: `${origin}/after`,
    pinned: true,
    muted: true,
    group: "Core",
    zoom: 1.1,
    canGoBack: true,
  });
  await command(shell, { type: "action", action: "back" });
  await settledURL(shell, `${origin}/before`);
  expect(
    (await state(shell)).recentlyClosed.some(
      (tab) => tab.id === workspaceTab.id,
    ),
  ).toBe(true);
  expect(
    (await state(shell)).history.some(
      (visit) => visit.url === `${origin}/after`,
    ),
  ).toBe(true);
});

test("home and internal pages preserve real page history in the same tab", async ({
  rainBrowser: { shell },
}) => {
  await open(shell, `${origin}/history-first`);
  await open(shell, `${origin}/history-second`);
  const original = await activeTab(shell);
  await command(shell, { type: "action", action: "home" });
  expect(await activeTab(shell)).toMatchObject({
    id: original.id,
    url: "raincode://newtab",
    canGoBack: true,
  });
  await command(shell, { type: "action", action: "back" });
  await settledURL(shell, `${origin}/history-second`);
  await command(shell, { type: "action", action: "back" });
  await settledURL(shell, `${origin}/history-first`);
  await command(shell, { type: "action", action: "forward" });
  await settledURL(shell, `${origin}/history-second`);
  await command(shell, { type: "action", action: "forward" });
  expect(await activeTab(shell)).toMatchObject({
    id: original.id,
    url: "raincode://newtab",
    canGoForward: false,
  });
  await command(shell, { type: "navigate", url: "raincode://history" });
  await command(shell, { type: "navigate", url: "raincode://recently-closed" });
  await command(shell, { type: "action", action: "back" });
  expect((await activeTab(shell)).url).toBe("raincode://history");
  await command(shell, { type: "action", action: "back" });
  expect((await activeTab(shell)).url).toBe("raincode://newtab");
});

test("rapid back then forward finishes on the requested page without corrupting history", async ({
  rainBrowser: { shell },
}) => {
  await open(shell, `${origin}/rapid-first`);
  await open(shell, `${origin}/rapid-second`);
  await command(shell, { type: "action", action: "back" });
  await command(shell, { type: "action", action: "forward" });
  await settledURL(shell, `${origin}/rapid-second`);
  await command(shell, { type: "action", action: "back" });
  await settledURL(shell, `${origin}/rapid-first`);
});

test("tab session and closed entries survive restart, private tabs do not", async () => {
  const userData = await mkdtemp(path.join(tmpdir(), "raincode-core-session-"));
  let browser = await launchBrowser(userData);
  try {
    await open(browser.shell, `${origin}/persist-one`);
    await open(browser.shell, `${origin}/persist-two`);
    const persisted = await activeTab(browser.shell);
    await command(browser.shell, {
      type: "tab.create",
      url: `${origin}/closed-persist`,
    });
    const closed = await activeTab(browser.shell);
    await command(browser.shell, { type: "tab.close", id: closed.id });
    const privateProfile = await command(browser.shell, {
      type: "profile.create",
      name: "Private test",
      mode: "private",
    });
    await command(browser.shell, {
      type: "tab.create",
      url: `${origin}/private-only`,
      profileId: privateProfile.data as string,
    });
    await command(browser.shell, { type: "tab.activate", id: persisted.id });
    await browser.app.close();
    browser = await launchBrowser(userData);
    await expect
      .poll(async () => (await activeTab(browser.shell)).loading)
      .toBe(false);
    expect((await state(browser.shell)).recentlyClosed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: `${origin}/closed-persist` }),
      ]),
    );
    expect(
      (await state(browser.shell)).tabs.some((tab) =>
        tab.url.includes("private-only"),
      ),
    ).toBe(false);
    expect(
      (await state(browser.shell)).profiles.some(
        (profile) => profile.id === privateProfile.data,
      ),
    ).toBe(false);
    expect(await activeTab(browser.shell)).toMatchObject({
      url: `${origin}/persist-two`,
      canGoBack: true,
    });
    await command(browser.shell, { type: "action", action: "back" });
    await expect
      .poll(async () => (await activeTab(browser.shell)).url)
      .toBe(`${origin}/persist-one`);
  } finally {
    await browser.app.close().catch(() => undefined);
    await rm(userData, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});

test("favicons are bounded local data resources and popups preserve the parent profile", async ({
  rainBrowser: { app, shell },
}) => {
  await open(shell, `${origin}/icons`);
  const before = await activeTab(shell);
  await expect
    .poll(async () => (await activeTab(shell)).favicon || "")
    .toMatch(/^data:image\/png;base64,/);
  const contentsId = await pageContentsId(app, before.url);
  await app.evaluate(async ({ webContents }, id) => {
    await webContents
      .fromId(id)!
      .executeJavaScript('window.open("/popup", "_blank")');
  }, contentsId);
  await expect.poll(async () => (await state(shell)).tabs.length).toBe(2);
  const popup = await activeTab(shell);
  expect(popup.profileId).toBe(before.profileId);
  expect(popup.url).toBe(`${origin}/popup`);
});
