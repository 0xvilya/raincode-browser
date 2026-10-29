import http from "node:http";
import { once } from "node:events";
import { activeTab, command, expect, open, test } from "./fixtures";

test("quick Dev Panel tools inspect and modify the selected website, never the internal UI", async ({
  rainBrowser: { app, shell },
}) => {
  const agents = new Map<string, string>();
  const server = http.createServer((req, res) => {
    agents.set(req.url || "", req.headers["user-agent"] || "");
    res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
    res.end(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Target ${req.url}</title><div id="probe">Native target</div><input id="draft">`,
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture port");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en" },
    });
    await open(shell, origin + "/a");
    const a = await activeTab(shell);
    await command(shell, { type: "tab.create", url: origin + "/b" });
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    await command(shell, { type: "tab.create", url: "raincode://devpanel" });
    const panel = await activeTab(shell);
    await shell
      .getByLabel("Quick tools target", { exact: true })
      .selectOption(a.id);
    const quick = shell.locator(".dev-tabs + section");
    await quick
      .getByRole("button", { name: "Inspect active website", exact: true })
      .click();
    await expect(quick.locator(".data-view")).toContainText(origin + "/a");
    const network = shell
      .getByRole("heading", { name: "Connection", exact: true })
      .locator("..");
    await network
      .getByLabel("User-Agent override", { exact: true })
      .fill("RainCode-Controlled-UA");
    await network.getByRole("button", { name: "Apply", exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }, url) =>
            webContents
              .getAllWebContents()
              .find((w) => w.getURL() === url)
              ?.getUserAgent(),
          origin + "/a",
        ),
      )
      .toBe("RainCode-Controlled-UA");
    await command(shell, { type: "tab.activate", id: a.id });
    await command(shell, { type: "action", action: "reload" });
    await expect.poll(() => agents.get("/a")).toBe("RainCode-Controlled-UA");
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    await app.evaluate(
      async ({ webContents }, url) =>
        webContents
          .getAllWebContents()
          .find((w) => w.getURL() === url)!
          .executeJavaScript(
            'document.querySelector("#draft").value="keep-draft"',
          ),
      origin + "/a",
    );
    await command(shell, { type: "tab.activate", id: panel.id });
    await network.getByLabel("Mobile viewport", { exact: true }).check();
    await command(shell, { type: "tab.activate", id: a.id });
    const inspect = async (url: string, code: string) =>
      app.evaluate(
        async ({ webContents }, value) =>
          webContents
            .getAllWebContents()
            .find((w) => w.getURL() === value.url)!
            .executeJavaScript(value.code),
        { url, code },
      );
    await expect.poll(() => inspect(origin + "/a", "innerWidth")).toBe(390);
    expect(
      await inspect(origin + "/a", 'document.querySelector("#draft").value'),
    ).toBe("keep-draft");
    expect(await inspect(origin + "/b", "innerWidth")).toBeGreaterThan(390);
    await command(shell, { type: "tab.activate", id: panel.id });
    await expect(
      network.getByLabel("Mobile viewport", { exact: true }),
    ).toBeChecked();
    const css = shell
      .getByRole("heading", { name: "Custom CSS", exact: true })
      .locator("..");
    await css
      .getByRole("textbox")
      .fill("#probe { color: rgb(12,34,56) !important; }");
    await css.getByRole("button", { name: "Apply", exact: true }).click();
    const color = 'getComputedStyle(document.querySelector("#probe")).color';
    await expect
      .poll(() => inspect(origin + "/a", color))
      .toBe("rgb(12, 34, 56)");
    expect(await inspect(origin + "/b", color)).not.toBe("rgb(12, 34, 56)");
    await css.getByRole("button", { name: "Clear", exact: true }).click();
    await expect
      .poll(() => inspect(origin + "/a", color))
      .not.toBe("rgb(12, 34, 56)");
    await network.getByLabel("Mobile viewport", { exact: true }).uncheck();
    await command(shell, { type: "tab.activate", id: a.id });
    await expect
      .poll(() => inspect(origin + "/a", "innerWidth"))
      .toBeGreaterThan(390);
    expect(
      await inspect(origin + "/a", 'document.querySelector("#draft").value'),
    ).toBe("keep-draft");
    await command(shell, { type: "tab.activate", id: panel.id });
    await quick
      .getByRole("button", { name: "Developer tools", exact: true })
      .click();
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }, url) =>
            webContents
              .getAllWebContents()
              .find((w) => w.getURL() === url)
              ?.isDevToolsOpened(),
          origin + "/a",
        ),
      )
      .toBe(true);
    expect(
      await app.evaluate(
        ({ webContents }, url) =>
          webContents
            .getAllWebContents()
            .find((w) => w.getURL() === url)
            ?.isDevToolsOpened(),
        origin + "/b",
      ),
    ).toBe(false);
    expect(
      (
        await shell.evaluate(
          (id) =>
            window.raincode.command({
              type: "dev.css",
              tabId: id,
              css: "body{}",
            }),
          panel.id,
        )
      ).ok,
    ).toBe(false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
