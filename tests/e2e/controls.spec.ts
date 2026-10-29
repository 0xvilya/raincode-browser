import http from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ElectronApplication } from "@playwright/test";
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

let server: http.Server;
let origin = "";
test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    if (request.url === "/download") {
      response.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="controlled-fixture.txt"',
        "Content-Length": Buffer.byteLength("RainCode controlled download\n"),
      });
      response.end("RainCode controlled download\n");
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(
      `<!doctype html><title>Controls ${request.url}</title><h1>Controlled local fixture</h1>`,
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture address");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function answerDialog(app: ElectronApplication, response: number) {
  await app.evaluate(({ dialog }, answer) => {
    dialog.showMessageBox = (async () => ({
      response: answer,
      checkboxChecked: false,
    })) as typeof dialog.showMessageBox;
  }, response);
}

test("pin, duplicate, mute, groups, reorder and split preserve live tabs", async ({
  rainBrowser: { app, shell },
}) => {
  await open(shell, `${origin}/first`);
  const first = await activeTab(shell);
  await command(shell, {
    type: "tab.update",
    id: first.id,
    pinned: true,
    muted: true,
    group: "Frontend",
  });
  await expect
    .poll(async () => await activeTab(shell))
    .toMatchObject({ pinned: true, muted: true, group: "Frontend" });
  const contentsId = await pageContentsId(app, `${origin}/first`);
  expect(
    await app.evaluate(
      ({ webContents }, id) => webContents.fromId(id)!.isAudioMuted(),
      contentsId,
    ),
  ).toBe(true);
  await command(shell, { type: "tab.duplicate", id: first.id });
  await expect.poll(async () => (await state(shell)).tabs.length).toBe(2);
  const duplicate = await activeTab(shell);
  expect(duplicate.id).not.toBe(first.id);
  expect(duplicate).toMatchObject({
    url: first.url,
    profileId: first.profileId,
  });
  await command(shell, { type: "tab.reorder", ids: [duplicate.id, first.id] });
  expect((await state(shell)).tabs.map((tab) => tab.id)).toEqual([
    duplicate.id,
    first.id,
  ]);
  await command(shell, { type: "split", id: first.id });
  expect((await state(shell)).splitTabId).toBe(first.id);
  await command(shell, { type: "split" });
  expect((await state(shell)).splitTabId).toBeUndefined();
  await command(shell, { type: "tab.update", id: first.id, muted: false });
  expect(
    await app.evaluate(
      ({ webContents }, id) => webContents.fromId(id)!.isAudioMuted(),
      contentsId,
    ),
  ).toBe(false);
});

test("rain off, reduced motion and power saving remain controllable", async ({
  rainBrowser: { shell },
}) => {
  await shell.emulateMedia({ reducedMotion: "no-preference" });
  await command(shell, {
    type: "settings.update",
    settings: { rain: "high", powerSave: false },
  });
  const canvas = shell.getByTestId("rain-canvas");
  await expect(canvas).toHaveAttribute("data-quality", "high");
  await expect(canvas).toHaveAttribute("data-running", "true");
  await command(shell, { type: "settings.update", settings: { rain: "off" } });
  await expect(canvas).toHaveAttribute("data-running", "false");
  await command(shell, {
    type: "settings.update",
    settings: { rain: "cinematic", powerSave: true },
  });
  await expect(canvas).toHaveAttribute("data-running", "true");
  await shell.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas).toHaveAttribute("data-running", "false");
  await shell.emulateMedia({ reducedMotion: "no-preference" });
  await expect(canvas).toHaveAttribute("data-running", "true");
});

test("permission prompts deny, remember a site choice and support revocation", async ({
  rainBrowser: { app, shell },
}) => {
  await open(shell, `${origin}/permissions`);
  const contentsId = await pageContentsId(app, `${origin}/permissions`);
  await answerDialog(app, 0);
  const ask = () =>
    app.evaluate(
      async ({ webContents }, id) =>
        webContents
          .fromId(id)!
          .executeJavaScript("Notification.requestPermission()"),
      contentsId,
    );
  expect(await ask()).toBe("denied");
  expect(
    (await state(shell)).permissions.some(
      (permission) => permission.origin === origin && permission.allowed,
    ),
  ).toBe(false);
  await answerDialog(app, 1);
  await command(shell, { type: "action", action: "reload" });
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  expect(await ask()).toBe("granted");
  expect((await state(shell)).permissions).toHaveLength(0);
  await answerDialog(app, 0);
  await command(shell, { type: "action", action: "reload" });
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  expect(await ask()).toBe("denied");
  await answerDialog(app, 2);
  await command(shell, { type: "action", action: "reload" });
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  expect(await ask()).toBe("granted");
  const remembered = (await state(shell)).permissions.find(
    (permission) =>
      permission.origin === origin && permission.permission === "notifications",
  );
  expect(remembered).toMatchObject({ allowed: true });
  await command(shell, {
    type: "permission.revoke",
    origin,
    permission: "notifications",
    profileId: (await activeTab(shell)).profileId,
  });
  expect(
    (await state(shell)).permissions.some(
      (permission) =>
        permission.origin === origin &&
        permission.permission === "notifications",
    ),
  ).toBe(false);
  await answerDialog(app, 0);
  await command(shell, { type: "action", action: "reload" });
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  expect(await ask()).toBe("denied");
});

test("deleting a profile clears its stored visits and closed-tab restore references", async ({
  rainBrowser: { app, shell },
}) => {
  await command(shell, {
    type: "profile.create",
    name: "Disposable",
    mode: "direct",
  });
  const profile = (await state(shell)).profiles.find(
    (item) => item.name === "Disposable",
  )!;
  await command(shell, {
    type: "tab.create",
    profileId: profile.id,
    url: `${origin}/delete-me`,
  });
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  await expect
    .poll(async () =>
      (await state(shell)).history.some(
        (visit) => visit.profileId === profile.id,
      ),
    )
    .toBe(true);
  const disposableTab = await activeTab(shell);
  await command(shell, {
    type: "workspace.save",
    name: "Disposable workspace",
  });
  await command(shell, { type: "tab.close", id: disposableTab.id });
  await answerDialog(app, 1);
  await command(shell, { type: "profile.delete", id: profile.id });
  const current = await state(shell);
  expect(current.profiles.some((item) => item.id === profile.id)).toBe(false);
  expect(current.tabs.some((item) => item.profileId === profile.id)).toBe(
    false,
  );
  expect(current.history.some((item) => item.profileId === profile.id)).toBe(
    false,
  );
  expect(
    current.recentlyClosed.some((item) => item.profileId === profile.id),
  ).toBe(false);
  expect(current.workspaces.some((item) => item.profileId === profile.id)).toBe(
    false,
  );
});

test("private URLs and closed private tabs are absent after session restoration", async () => {
  const userData = await mkdtemp(
    path.join(tmpdir(), "raincode-private-restore-"),
  );
  let browser = await launchBrowser(userData);
  try {
    await command(browser.shell, {
      type: "profile.create",
      name: "Ephemeral",
      mode: "private",
    });
    const profile = (await state(browser.shell)).profiles.find(
      (item) => item.name === "Ephemeral",
    )!;
    await command(browser.shell, {
      type: "tab.create",
      profileId: profile.id,
      url: `${origin}/private-secret`,
    });
    await expect
      .poll(async () => (await activeTab(browser.shell)).loading)
      .toBe(false);
    await command(browser.shell, {
      type: "workspace.save",
      name: "Private workspace",
    });
    const privateTab = await activeTab(browser.shell);
    await command(browser.shell, { type: "tab.close", id: privateTab.id });
    await command(browser.shell, {
      type: "tab.create",
      profileId: profile.id,
      url: `${origin}/private-active`,
    });
    await expect
      .poll(async () => (await activeTab(browser.shell)).loading)
      .toBe(false);
    await browser.app.close();
    browser = await launchBrowser(userData);
    const restored = await state(browser.shell);
    const restoredURLs = [
      ...restored.tabs,
      ...restored.recentlyClosed,
      ...restored.history,
    ].map((item) => item.url);
    expect(restoredURLs).not.toContain(`${origin}/private-secret`);
    expect(restoredURLs).not.toContain(`${origin}/private-active`);
    expect(
      restored.workspaces.some(
        (workspace) => workspace.profileId === profile.id,
      ),
    ).toBe(false);
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

test("a download requires confirmation and writes only the user-selected file", async ({
  rainBrowser: { app, shell, userData },
}) => {
  await open(shell, `${origin}/download-page`);
  const contentsId = await pageContentsId(app, `${origin}/download-page`);
  const filename = path.join(userData, "controlled-fixture.txt");
  await app.evaluate(({ dialog }, destination) => {
    dialog.showMessageBoxSync = (() => 1) as typeof dialog.showMessageBoxSync;
    dialog.showSaveDialogSync = (() =>
      destination) as typeof dialog.showSaveDialogSync;
  }, filename);
  await app.evaluate(
    ({ webContents }, { id, url }) => webContents.fromId(id)!.downloadURL(url),
    { id: contentsId, url: `${origin}/download` },
  );
  await expect
    .poll(
      async () =>
        (await state(shell)).downloads.find(
          (item) => item.name === "controlled-fixture.txt",
        )?.status,
    )
    .toBe("completed");
  const download = (await state(shell)).downloads.find(
    (item) => item.name === "controlled-fixture.txt",
  )!;
  expect(download.path).toBe(filename);
  expect(await readFile(filename, "utf8")).toBe(
    "RainCode controlled download\n",
  );
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = (() => 0) as typeof dialog.showMessageBoxSync;
    dialog.showSaveDialogSync = (() => {
      throw new Error("Save dialog must not open after deny");
    }) as typeof dialog.showSaveDialogSync;
  });
  await app.evaluate(
    async ({ webContents }, { id, url }) => {
      const contents = webContents.fromId(id)!;
      const rejected = new Promise<void>((resolve) =>
        contents.session.once("will-download", () => resolve()),
      );
      contents.downloadURL(url);
      await rejected;
    },
    { id: contentsId, url: `${origin}/download` },
  );
  expect((await state(shell)).downloads).toHaveLength(1);
});
