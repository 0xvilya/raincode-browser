import http from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  activeTab,
  command,
  expect,
  open,
  pageContentsId,
  state,
  test,
} from "./fixtures";
import type { ElectronApplication } from "@playwright/test";

let server: http.Server;
let origin = "";
test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": "secret-cookie=never-export; SameSite=Lax",
    });
    response.end(
      `<!doctype html><title>Developer ${request.url}</title><h1 id="actual-dom">Developer ${request.url}</h1><script>window.fixture = 'actual-page';</script>`,
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

// Evaluate through Chromium DevTools' own protocol connection. This checks the
// inspected target, rather than just asking Electron whether a window is open.
async function inspectedPage(app: ElectronApplication, id: number) {
  return app.evaluate(async ({ webContents }, target) => {
    const tools = webContents.fromId(target)?.devToolsWebContents;
    if (!tools || tools.isDestroyed()) return null;
    return tools.executeJavaScript(`(async () => {
      const sdk = await import('devtools://devtools/bundled/core/sdk/sdk.js');
      const target = sdk.TargetManager.TargetManager.instance().primaryPageTarget();
      if (!target) return null;
      const result = await target.runtimeAgent().invoke_evaluate({
        expression: '({url:location.href, dom:document.querySelector("#actual-dom")?.textContent, node:typeof process, fixture:window.fixture})',
        returnByValue: true
      });
      return result.result?.value;
    })()`);
  }, id);
}

test("actual DevTools inspect the chosen native page DOM and Console across tab switches and dock modes", async ({
  rainBrowser: { app, shell },
}) => {
  await open(shell, `${origin}/first`);
  const first = await activeTab(shell);
  const firstContents = await pageContentsId(app, first.url);
  await app.evaluate(({ webContents }, id) => {
    const contents = webContents.fromId(id)!;
    contents.sendInputEvent({ type: "keyDown", keyCode: "F12" });
    contents.sendInputEvent({ type: "keyUp", keyCode: "F12" });
  }, firstContents);
  await expect
    .poll(() => inspectedPage(app, firstContents))
    .toMatchObject({
      url: first.url,
      dom: "Developer /first",
    });
  await app.evaluate(
    ({ webContents }, id) => webContents.fromId(id)!.closeDevTools(),
    firstContents,
  );
  await command(shell, { type: "tab.create", url: `${origin}/second` });
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  const second = await activeTab(shell);
  const secondContents = await pageContentsId(app, second.url);
  await command(shell, { type: "dev.tools", tabId: first.id, mode: "detach" });
  await expect
    .poll(() => inspectedPage(app, firstContents))
    .toEqual({
      url: first.url,
      dom: "Developer /first",
      node: "undefined",
      fixture: "actual-page",
    });
  expect(
    await app.evaluate(
      ({ webContents }, id) => webContents.fromId(id)!.isDevToolsOpened(),
      secondContents,
    ),
  ).toBe(false);
  // The shell has no inspected page DOM and is never the DevTools target.
  expect(
    await shell.evaluate(() => document.querySelector("#actual-dom")),
  ).toBeNull();
  await command(shell, { type: "tab.activate", id: first.id });
  for (const mode of ["right", "bottom", "undocked"] as const) {
    await command(shell, { type: "dev.tools", tabId: second.id, mode });
    await expect
      .poll(() => inspectedPage(app, secondContents))
      .toMatchObject({
        url: second.url,
        dom: "Developer /second",
      });
  }
  // The DevTools Console can change the inspected page's real DOM.
  await app.evaluate(async ({ webContents }, id) => {
    await webContents.fromId(id)!.devToolsWebContents!
      .executeJavaScript(`(async () => {
      const sdk = await import('devtools://devtools/bundled/core/sdk/sdk.js');
      await sdk.TargetManager.TargetManager.instance().primaryPageTarget().runtimeAgent().invoke_evaluate({
        expression: 'document.querySelector("#actual-dom").textContent = "edited through DevTools"'
      });
      return true;
    })()`);
  }, secondContents);
  await expect
    .poll(() => inspectedPage(app, secondContents))
    .toMatchObject({
      dom: "edited through DevTools",
    });
  const inspectedRequest = await app.evaluate(async ({ webContents }, id) => {
    return webContents.fromId(id)!.devToolsWebContents!
      .executeJavaScript(`(async () => {
      const sdk = await import('devtools://devtools/bundled/core/sdk/sdk.js');
      const ui = await import('devtools://devtools/bundled/ui/legacy/legacy.js');
      await ui.ViewManager.ViewManager.instance().showView('network');
      const target = sdk.TargetManager.TargetManager.instance().primaryPageTarget();
      const manager = target.model(sdk.NetworkManager.NetworkManager);
      const result = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('DevTools Network event timeout')), 10000);
        const listener = ({data}) => {
          const request = data.request || data;
          if (!request.url().includes('/from-devtools-console')) return;
          clearTimeout(timeout);
          manager.removeEventListener(sdk.NetworkManager.Events.RequestFinished, listener);
          resolve({url: request.url(), status: request.statusCode});
        };
        manager.addEventListener(sdk.NetworkManager.Events.RequestFinished, listener);
      });
      await target.runtimeAgent().invoke_evaluate({expression:'fetch("/from-devtools-console").then(response => response.text())', awaitPromise:true});
      return result;
    })()`);
  }, secondContents);
  expect(inspectedRequest).toEqual({
    url: `${origin}/from-devtools-console`,
    status: 200,
  });
  await command(shell, { type: "tab.close", id: second.id });
  await expect
    .poll(() =>
      app.evaluate(
        ({ webContents }, id) => webContents.fromId(id) === undefined,
        secondContents,
      ),
    )
    .toBe(true);
});

test("real request metadata and saved HAR redact query credentials, cookies, headers and bodies", async ({
  rainBrowser: { app, shell },
}) => {
  await open(shell, `${origin}/network?token=never-export#private`);
  const tab = await activeTab(shell);
  expect(
    (await command(shell, { type: "dev.network", tabId: tab.id })).data,
  ).toEqual([]);
  await command(shell, { type: "dev.recording", tabId: tab.id, enabled: true });
  await open(shell, `${origin}/network?token=never-export-recorded#private`);
  const network = await command(shell, { type: "dev.network", tabId: tab.id });
  expect(network.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        method: "GET",
        status: 200,
        url: `${origin}/network?redacted`,
      }),
    ]),
  );
  const folder = await mkdtemp(path.join(tmpdir(), "raincode-har-"));
  const file = path.join(folder, "fixture.har");
  try {
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, file);
    expect(
      (await command(shell, { type: "dev.har", tabId: tab.id })).data,
    ).toMatchObject({ saved: true, name: "fixture.har" });
    const data = await readFile(file, "utf8");
    expect(data).not.toContain("never-export");
    expect(data).not.toContain("#private");
    expect(data).not.toContain("/network");
    const har = JSON.parse(data);
    expect(har.log.version).toBe("1.2");
    expect(har.log.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          request: expect.objectContaining({
            url: `${origin}/`,
            headers: [],
            cookies: [],
          }),
          response: expect.objectContaining({
            status: 200,
            headers: [],
            cookies: [],
          }),
        }),
      ]),
    );
    await command(shell, {
      type: "dev.recording",
      tabId: tab.id,
      enabled: false,
    });
    await open(shell, `${origin}/network?token=after-stop`);
    expect(
      (await command(shell, { type: "dev.network", tabId: tab.id })).data,
    ).toEqual([]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("project sources and real command runner require selection, snippets require confirmation and isolate their target", async ({
  rainBrowser: { app, shell },
}) => {
  const folder = await mkdtemp(path.join(tmpdir(), "raincode-project-"));
  try {
    await mkdir(path.join(folder, "src"));
    await writeFile(
      path.join(folder, "src", "пример.ts"),
      "const привет = 'RainCode';\n",
    );
    await app.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selected],
      });
      dialog.showMessageBox = async () => ({
        response: 0,
        checkboxChecked: false,
      });
    }, folder);
    const noProject = await shell.evaluate(() =>
      window.raincode.command({ type: "dev.tree" }),
    );
    expect(noProject).toMatchObject({ ok: false });
    expect(noProject.error).toBeTruthy();
    await command(shell, { type: "action", action: "project" });
    expect((await state(shell)).projectPath).toBe(folder);
    expect((await command(shell, { type: "dev.tree" })).data).toMatchObject({
      root: folder,
      entries: expect.arrayContaining([
        expect.objectContaining({
          path: path.join("src", "пример.ts"),
          directory: false,
        }),
      ]),
    });
    expect(
      (await command(shell, { type: "dev.read", path: "src/пример.ts" })).data,
    ).toEqual({
      path: "src/пример.ts",
      source: "const привет = 'RainCode';\n",
    });
    expect(
      await shell.evaluate(() =>
        window.raincode.command({ type: "dev.read", path: "../secret.txt" }),
      ),
    ).toMatchObject({ ok: false });
    await open(shell, `${origin}/snippet-target`);
    const first = await activeTab(shell);
    const firstContents = await pageContentsId(app, first.url);
    await command(shell, { type: "tab.create", url: `${origin}/not-target` });
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    const secondContents = await pageContentsId(app, `${origin}/not-target`);
    const code = 'window.onlyChosenTarget = "confirmed"; document.title';
    expect(
      (await command(shell, { type: "dev.snippet", tabId: first.id, code }))
        .data,
    ).toEqual({ cancelled: true });
    expect(
      (
        await command(shell, {
          type: "dev.command",
          command: "Write-Output 'should-not-run'",
        })
      ).data,
    ).toEqual({ cancelled: true });
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async (
        windowOrOptions: Electron.BaseWindow | Electron.MessageBoxOptions,
        explicitOptions?: Electron.MessageBoxOptions,
      ) => {
        const options =
          explicitOptions || (windowOrOptions as Electron.MessageBoxOptions);
        if (
          options.defaultId !== 0 ||
          options.cancelId !== 0 ||
          !options.detail
        )
          throw new Error(
            "Confirmation must default to deny with reviewed content",
          );
        return { response: 1, checkboxChecked: false };
      };
    });
    expect(
      (await command(shell, { type: "dev.snippet", tabId: first.id, code }))
        .data,
    ).toMatchObject({ url: first.url, output: "'Developer /snippet-target'" });
    const values = await app.evaluate(
      async ({ webContents }, ids) =>
        Promise.all(
          ids.map((id) =>
            webContents
              .fromId(id)!
              .executeJavaScript("window.onlyChosenTarget || null"),
          ),
        ),
      [firstContents, secondContents],
    );
    expect(values).toEqual(["confirmed", null]);
    const result = await command(shell, {
      type: "dev.command",
      command:
        process.platform === "win32"
          ? "Write-Output 'raincode-real-shell'; (Get-Location).Path"
          : "printf 'raincode-real-shell\\n'; pwd",
    });
    expect(result.data).toMatchObject({ exitCode: 0, timedOut: false });
    expect((result.data as { output: string }).output).toContain(
      "raincode-real-shell",
    );
    expect((result.data as { output: string }).output).toContain(folder);
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en" },
    });
    await command(shell, { type: "tab.create", url: "raincode://devpanel" });
    const workspace = shell.locator(".developer-workspace");
    await expect(workspace).toBeVisible();
    await workspace
      .getByRole("button", { name: "Read file tree", exact: true })
      .click();
    await workspace
      .getByRole("button", { name: path.join("src", "пример.ts"), exact: true })
      .click();
    await expect(
      workspace.getByLabel("Source code", { exact: true }),
    ).toHaveText("const привет = 'RainCode';\n");
    await workspace
      .getByRole("textbox", { name: "Project notes", exact: true })
      .fill("Developer notes сохраняются");
    await workspace
      .getByRole("button", { name: "Save notes and snippet", exact: true })
      .click();
    await expect
      .poll(async () => (await state(shell)).notes)
      .toBe("Developer notes сохраняются");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
