import http from "node:http";
import { once } from "node:events";
import { command, expect, open, test } from "./fixtures";

let server: http.Server;
let origin = "";
test.beforeAll(async () => {
  server = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(
      "<!doctype html><title>Visible native page</title><h1>Native WebContentsView</h1>",
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

test("scene effects stop behind native pages and resume for visible internal content", async ({
  rainBrowser: { app, shell },
}) => {
  const nativeWindow = await app.browserWindow(shell);
  await nativeWindow.evaluate((window) => {
    window.show();
    window.focus();
    window.webContents.focus();
  });
  const canvas = shell.getByTestId("rain-canvas");
  await expect(canvas).toHaveAttribute("data-running", "true");
  // Observe actual canvas work, not just the state attribute.
  await shell.evaluate(() => {
    const original = CanvasRenderingContext2D.prototype.stroke;
    let strokes = 0;
    Object.defineProperty(window, "rainStrokeCount", { get: () => strokes });
    CanvasRenderingContext2D.prototype.stroke = function (path?: Path2D) {
      strokes++;
      const stroke = original.bind(this);
      if (path) stroke(path);
      else stroke();
    };
  });
  await open(shell, origin + "/page");
  await expect(canvas).toHaveAttribute("data-running", "false");
  expect(await shell.evaluate(() => document.hidden)).toBe(false);
  expect(
    await shell
      .locator(".atmosphere-bokeh")
      .evaluate((element) => getComputedStyle(element).animationPlayState),
  ).toBe("paused");
  expect(
    await shell
      .locator(".scene")
      .evaluate((element) => getComputedStyle(element).display),
  ).not.toBe("none");
  expect(
    await shell.evaluate(async () => {
      const count = () => Reflect.get(window, "rainStrokeCount") as number;
      const before = count();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return count() === before;
    }),
  ).toBe(true);

  // An overlay hides the native view; the scene can animate while it is visible.
  await shell
    .getByRole("button", { name: "Меню браузера", exact: true })
    .click();
  await nativeWindow.evaluate((window) => window.webContents.focus());
  await expect(canvas).toHaveAttribute("data-running", "true");
  await shell.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-running", "false");

  await command(shell, { type: "navigate", url: "raincode://newtab" });
  await nativeWindow.evaluate((window) => window.webContents.focus());
  await expect(canvas).toHaveAttribute("data-running", "true");
  await shell.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas).toHaveAttribute("data-running", "false");
  await shell.emulateMedia({ reducedMotion: "no-preference" });
  await expect(canvas).toHaveAttribute("data-running", "true");
  await command(shell, { type: "settings.update", settings: { rain: "off" } });
  await expect(canvas).toHaveAttribute("data-running", "false");
});

test("native window blur and minimize pause effects until restored and focused", async ({
  rainBrowser: { app, shell },
}) => {
  const nativeWindow = await app.browserWindow(shell);
  const canvas = shell.getByTestId("rain-canvas");
  await nativeWindow.evaluate((window) => {
    window.show();
    window.focus();
    window.webContents.focus();
  });
  await expect(canvas).toHaveAttribute("data-running", "true");
  // BrowserWindow.blur() is a no-op on some Windows desktops. Focus another
  // actual native window and verify that this browser window lost OS focus.
  const otherWindow = await app.evaluateHandle(({ BrowserWindow }) => {
    const other = new BrowserWindow({
      width: 320,
      height: 220,
      show: true,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    void other.loadURL("about:blank");
    other.focus();
    return other;
  });
  await expect
    .poll(() => nativeWindow.evaluate((window) => window.isFocused()))
    .toBe(false);
  await expect(canvas).toHaveAttribute("data-running", "false");
  await otherWindow.evaluate((window) => window.destroy());
  await nativeWindow.evaluate((window) => {
    window.focus();
    window.webContents.focus();
  });
  await expect(canvas).toHaveAttribute("data-running", "true");
  await nativeWindow.evaluate((window) => window.minimize());
  await expect(canvas).toHaveAttribute("data-running", "false");
  await nativeWindow.evaluate((window) => {
    window.restore();
    window.focus();
    window.webContents.focus();
  });
  await expect(canvas).toHaveAttribute("data-running", "true");
});
