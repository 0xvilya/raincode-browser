import http from "node:http";
import { once } from "node:events";
import type { ElectronApplication } from "@playwright/test";
import {
  activeTab,
  command,
  expect,
  open,
  pageContentsId,
  state,
  test,
} from "./fixtures";

let server: http.Server;
let origin = "";
const requests: string[] = [];
test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    requests.push(request.url || "");
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(`<!doctype html><title>Shortcut ${request.url}</title>
      <h1>Native keyboard fixture</h1><input id="site-input" value="website text">
      <p>raincode-match raincode-match raincode-match</p>`);
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

async function key(
  app: ElectronApplication,
  id: number,
  keyCode: string,
  modifiers: NonNullable<Electron.KeyboardInputEvent["modifiers"]> = [
    "control",
  ],
) {
  await app.evaluate(
    ({ webContents }, input) => {
      const contents = webContents.fromId(input.id)!;
      for (const type of ["keyDown", "keyUp"] as const)
        contents.sendInputEvent({
          type,
          keyCode: input.keyCode,
          modifiers: input.modifiers,
        });
    },
    { id, keyCode, modifiers },
  );
}

test("native reload, zoom, tab cycling and website edit keys reach the correct content", async ({
  rainBrowser: { app, shell },
}) => {
  await open(shell, `${origin}/reload-key`);
  const first = await activeTab(shell);
  const firstId = await pageContentsId(app, first.url);
  const previousLoads = requests.filter((url) => url === "/reload-key").length;
  await key(app, firstId, "R");
  await expect
    .poll(() => requests.filter((url) => url === "/reload-key").length)
    .toBeGreaterThan(previousLoads);
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  const beforeF5 = requests.filter((url) => url === "/reload-key").length;
  await key(app, firstId, "F5", []);
  await expect
    .poll(() => requests.filter((url) => url === "/reload-key").length)
    .toBeGreaterThan(beforeF5);
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  await key(app, firstId, "+", ["control", "shift"]);
  await expect.poll(async () => (await activeTab(shell)).zoom).toBeCloseTo(1.1);
  await key(app, firstId, "-");
  await expect.poll(async () => (await activeTab(shell)).zoom).toBeCloseTo(1);
  await key(app, firstId, "=");
  await expect.poll(async () => (await activeTab(shell)).zoom).toBeCloseTo(1.1);
  await key(app, firstId, "0");
  await expect.poll(async () => (await activeTab(shell)).zoom).toBe(1);
  await app.evaluate(async ({ webContents }, id) => {
    await webContents
      .fromId(id)!
      .executeJavaScript('document.querySelector("#site-input").focus()');
  }, firstId);
  await key(app, firstId, "A");
  expect(
    await app.evaluate(
      async ({ webContents }, id) =>
        webContents
          .fromId(id)!
          .executeJavaScript(
            "({start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd,value:document.activeElement.value})",
          ),
      firstId,
    ),
  ).toEqual({ start: 0, end: 12, value: "website text" });
  await app.evaluate(async ({ webContents }, id) => {
    await webContents.fromId(id)!.insertText("Кириллица Latin 123");
  }, firstId);
  expect(
    await app.evaluate(
      async ({ webContents }, id) =>
        webContents
          .fromId(id)!
          .executeJavaScript('document.querySelector("#site-input").value'),
      firstId,
    ),
  ).toBe("Кириллица Latin 123");
  expect((await activeTab(shell)).id).toBe(first.id);
  await command(shell, { type: "tab.create", url: `${origin}/second-key` });
  await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
  const second = await activeTab(shell);
  const secondId = await pageContentsId(app, second.url);
  await key(app, secondId, "Tab", ["control", "shift"]);
  await expect.poll(async () => (await activeTab(shell)).id).toBe(first.id);
  await key(app, firstId, "Tab");
  await expect.poll(async () => (await activeTab(shell)).id).toBe(second.id);
});

test("native bookmark, find, DevTools and internal-page shortcuts execute real actions", async ({
  rainBrowser: { app, shell },
}) => {
  await command(shell, { type: "settings.update", settings: { locale: "en" } });
  await open(shell, `${origin}/find-and-bookmark`);
  const tab = await activeTab(shell);
  const contentsId = await pageContentsId(app, tab.url);
  await key(app, contentsId, "D");
  await expect
    .poll(async () =>
      (await state(shell)).bookmarks.some((item) => item.url === tab.url),
    )
    .toBe(true);
  await key(app, contentsId, "D");
  await expect
    .poll(async () =>
      (await state(shell)).bookmarks.some((item) => item.url === tab.url),
    )
    .toBe(false);
  const results = await app.evaluateHandle(({ webContents }, id) => {
    const contents = webContents.fromId(id)!;
    const matches: Electron.Result[] = [];
    const listener = (_event: Electron.Event, result: Electron.Result) =>
      matches.push(result);
    contents.on("found-in-page", listener);
    return { contents, matches, listener };
  }, contentsId);
  try {
    await key(app, contentsId, "F");
    const find = shell.getByRole("textbox", {
      name: "Find in page",
      exact: true,
    });
    await expect(find).toBeFocused();
    await find.fill("raincode-match");
    await expect
      .poll(() =>
        results.evaluate((value) =>
          value.matches.some(
            (result) => result.finalUpdate && result.matches === 3,
          ),
        ),
      )
      .toBe(true);
    await shell
      .locator(".find-bar")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await expect(find).toHaveCount(0);
  } finally {
    await results.evaluate((value) => {
      value.contents.removeListener("found-in-page", value.listener);
    });
    await results.dispose();
  }
  await key(app, contentsId, "I", ["control", "shift"]);
  await expect
    .poll(() =>
      app.evaluate(
        ({ webContents }, id) => webContents.fromId(id)!.isDevToolsOpened(),
        contentsId,
      ),
    )
    .toBe(true);
  await app.evaluate(
    ({ webContents }, id) => webContents.fromId(id)!.closeDevTools(),
    contentsId,
  );
  await key(app, contentsId, "H");
  await expect
    .poll(async () => (await activeTab(shell)).url)
    .toBe("raincode://history");
  const shellId = await pageContentsId(app, shell.url());
  await key(app, shellId, "J");
  await expect
    .poll(async () => (await activeTab(shell)).url)
    .toBe("raincode://downloads");
});
