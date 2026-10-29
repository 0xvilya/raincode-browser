import http from "node:http";
import { once } from "node:events";
import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  test,
  expect,
  command,
  state,
  activeTab,
  pageContentsId,
  launchBrowser,
} from "./fixtures";

async function server() {
  const fixture = http.createServer((request, response) => {
    if (request.url === "/download") {
      response.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="owned-performance.txt"',
        "Content-Length": "10000000",
      });
      response.write("owned pending download");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
    const content =
      request.url === "/form"
        ? '<input value="original">'
        : request.url === "/frame"
          ? '<iframe src="/child"></iframe>'
          : request.url === "/media"
            ? "<audio controls></audio>"
            : request.url === "/session"
              ? '<script>sessionStorage.setItem("draft","owned")</script>'
              : request.url === "/guard"
                ? '<script>onbeforeunload=event=>{event.preventDefault();event.returnValue="";}</script>'
                : "<h1>Owned plain document</h1>";
    response.end(
      `<!doctype html><title>Owned ${request.url}</title>${content}`,
    );
  });
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      fixture.closeAllConnections();
      await new Promise<void>((resolve) => fixture.close(() => resolve()));
    },
  };
}

test("background deadlines actually destroy safe WebContents and restore URL without affecting active page", async ({
  rainBrowser: { app, shell },
}) => {
  const fixture = await server();
  try {
    await app.evaluate(() => {
      const original = setTimeout;
      globalThis.setTimeout = ((
        fn: (...args: unknown[]) => void,
        ms?: number,
        ...args: unknown[]
      ) =>
        original(fn, ms === 300000 ? 120 : ms, ...args)) as typeof setTimeout;
    });
    await command(shell, { type: "navigate", url: `${fixture.url}/plain` });
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    const tab = await activeTab(shell),
      id = await pageContentsId(app, tab.url);
    const before = await app.evaluate(({ webContents, app }) => ({
      contents: webContents.getAllWebContents().length,
      memoryKiB: app
        .getAppMetrics()
        .reduce((sum, m) => sum + m.memory.workingSetSize, 0),
    }));
    await command(shell, {
      type: "settings.update",
      settings: { autoSleepMinutes: 5 },
    });
    await command(shell, { type: "tab.create", url: "raincode://newtab" });
    await expect
      .poll(
        async () =>
          (await state(shell)).tabs.find((t) => t.id === tab.id)?.suspended,
      )
      .toBe(true);
    expect(
      await app.evaluate(({ webContents }, id) => !!webContents.fromId(id), id),
    ).toBe(false);
    const after = await app.evaluate(({ webContents, app }) => ({
      contents: webContents.getAllWebContents().length,
      memoryKiB: app
        .getAppMetrics()
        .reduce((sum, m) => sum + m.memory.workingSetSize, 0),
    }));
    expect(after.contents).toBeLessThan(before.contents);
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/performance-sleep.json",
      JSON.stringify(
        { timerAccelerated: true, before, after, webContentsDestroyed: true },
        null,
        2,
      ),
    );
    await command(shell, { type: "tab.activate", id: tab.id });
    await expect
      .poll(async () => ({
        loading: (await activeTab(shell)).loading,
        url: (await activeTab(shell)).url,
      }))
      .toEqual({ loading: false, url: tab.url });
    expect((await activeTab(shell)).suspended).toBe(false);
  } finally {
    await fixture.close();
  }
});

test("forms, session storage, frames, media, interaction, pinned/kept tabs and beforeunload are retained", async ({
  rainBrowser: { app, shell },
}) => {
  const fixture = await server();
  const protectedTabs: { id: string; contents: number }[] = [];
  try {
    await app.evaluate(() => {
      const original = setTimeout;
      globalThis.setTimeout = ((
        fn: (...args: unknown[]) => void,
        ms?: number,
        ...args: unknown[]
      ) =>
        original(fn, ms === 300000 ? 120 : ms, ...args)) as typeof setTimeout;
    });
    for (const suffix of [
      "form",
      "session",
      "frame",
      "media",
      "interacted",
      "pinned",
      "kept",
      "guard",
      "permission",
    ]) {
      await command(shell, {
        type: "tab.create",
        url: `${fixture.url}/${suffix}`,
      });
      await expect
        .poll(async () => (await activeTab(shell)).loading)
        .toBe(false);
      const tab = await activeTab(shell),
        id = await pageContentsId(app, tab.url);
      if (suffix === "pinned")
        await command(shell, { type: "tab.update", id: tab.id, pinned: true });
      if (suffix === "kept")
        await command(shell, {
          type: "tab.update",
          id: tab.id,
          keepAwake: true,
        });
      if (suffix === "interacted")
        await app.evaluate(
          ({ webContents }, id) =>
            webContents
              .fromId(id)!
              .sendInputEvent({ type: "keyDown", keyCode: "A" }),
          id,
        );
      if (suffix === "guard")
        await app.evaluate(
          ({ webContents }, id) =>
            webContents.fromId(id)!.executeJavaScript("void 0", true),
          id,
        );
      if (suffix === "permission") {
        await app.evaluate(({ dialog }) => {
          dialog.showMessageBox = async () => ({
            response: 1,
            checkboxChecked: false,
          });
        });
        expect(
          await app.evaluate(
            ({ webContents }, id) =>
              webContents
                .fromId(id)!
                .executeJavaScript("Notification.requestPermission()", true),
            id,
          ),
        ).toBe("granted");
      }
      protectedTabs.push({ id: tab.id, contents: id });
    }
    await command(shell, { type: "tab.create", url: `${fixture.url}/plain` });
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    const control = await activeTab(shell);
    await command(shell, {
      type: "settings.update",
      settings: { autoSleepMinutes: 5 },
    });
    await command(shell, { type: "tab.create", url: "raincode://newtab" });
    await expect
      .poll(
        async () =>
          (await state(shell)).tabs.find((t) => t.id === control.id)?.suspended,
      )
      .toBe(true);
    for (const tab of protectedTabs)
      expect(
        await app.evaluate(
          ({ webContents }, id) => !!webContents.fromId(id),
          tab.contents,
        ),
        tab.id,
      ).toBe(true);
    const dirty = await shell.evaluate(
      (id) => window.raincode.command({ type: "tab.suspend", id }),
      protectedTabs[0].id,
    );
    expect(dirty.ok).toBe(false);
  } finally {
    await fixture.close();
  }
});

test("performance presets and graphics off persist and stop the actual rain loop", async ({
  rainBrowser: { shell, app, userData },
}) => {
  const window = await app.browserWindow(shell);
  await window.evaluate((w) => {
    w.show();
    w.focus();
    w.webContents.focus();
  });
  await command(shell, {
    type: "settings.update",
    settings: { motionPreference: "full", rain: "cinematic", fps: 60 },
  });
  const canvas = shell.getByTestId("rain-canvas");
  for (const [performanceMode, cap] of [
    ["eco", 20],
    ["balanced", 30],
    ["ultra", 60],
  ] as const) {
    await command(shell, {
      type: "settings.update",
      settings: { performanceMode },
    });
    await expect(canvas).toHaveAttribute("data-running", "true");
    expect(
      Number(await canvas.getAttribute("data-fps-limit")),
    ).toBeLessThanOrEqual(cap);
  }
  await command(shell, { type: "navigate", url: "raincode://settings" });
  await shell
    .getByLabel("Режим производительности", { exact: true })
    .selectOption("balanced");
  await expect.poll(async () => (await state(shell)).settings.fps).toBe(30);
  await shell
    .getByLabel("Режим производительности", { exact: true })
    .selectOption("ultra");
  await expect.poll(async () => (await state(shell)).settings.fps).toBe(60);
  await command(shell, {
    type: "settings.update",
    settings: { graphicsEnabled: false },
  });
  await command(shell, { type: "navigate", url: "raincode://newtab" });
  await expect(canvas).toHaveAttribute("data-running", "false");
  await expect(canvas).toHaveAttribute("data-pause-reason", "disabled");
  expect(
    await shell
      .locator(".atmosphere-bokeh")
      .evaluate((e) => getComputedStyle(e).display),
  ).toBe("none");
  await app.close();
  const restarted = await launchBrowser(userData);
  try {
    expect((await state(restarted.shell)).settings).toMatchObject({
      graphicsEnabled: false,
      performanceMode: "ultra",
      fps: 60,
    });
    await expect(restarted.shell.getByTestId("rain-canvas")).toHaveAttribute(
      "data-pause-reason",
      "disabled",
    );
  } finally {
    await restarted.app.close();
  }
});

test("an approved active download protects its profile until cancellation", async ({
  rainBrowser: { app, shell },
}) => {
  const fixture = await server();
  const folder = await mkdtemp(path.join(tmpdir(), "raincode-performance-"));
  try {
    await app.evaluate(({ dialog }, folder) => {
      const original = setTimeout;
      globalThis.setTimeout = ((
        fn: (...args: unknown[]) => void,
        ms?: number,
        ...args: unknown[]
      ) =>
        original(fn, ms === 300000 ? 120 : ms, ...args)) as typeof setTimeout;
      dialog.showMessageBoxSync = () => 1;
      dialog.showSaveDialogSync = () => `${folder}/owned-performance.txt`;
    }, folder);
    await command(shell, { type: "navigate", url: `${fixture.url}/plain` });
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    const tab = await activeTab(shell),
      id = await pageContentsId(app, tab.url);
    await app.evaluate(
      ({ webContents }, args) =>
        webContents.fromId(args.id)!.downloadURL(args.url),
      { id, url: `${fixture.url}/download` },
    );
    await expect
      .poll(async () =>
        (await state(shell)).downloads.some((d) => d.status === "progressing"),
      )
      .toBe(true);
    await command(shell, {
      type: "settings.update",
      settings: { autoSleepMinutes: 5 },
    });
    await command(shell, { type: "tab.create", url: "raincode://newtab" });
    await shell.waitForTimeout(300);
    expect(
      await app.evaluate(({ webContents }, id) => !!webContents.fromId(id), id),
    ).toBe(true);
    const download = (await state(shell)).downloads.find(
      (d) => d.status === "progressing",
    )!;
    await command(shell, { type: "download.cancel", id: download.id });
    await expect
      .poll(
        async () =>
          (await state(shell)).tabs.find((t) => t.id === tab.id)?.suspended,
      )
      .toBe(true);
  } finally {
    await fixture.close();
    if (!folder.startsWith(path.join(tmpdir(), "raincode-performance-")))
      throw new Error("Unexpected test path");
    await rm(folder, { recursive: true, force: true, maxRetries: 5 });
  }
});
