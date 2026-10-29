import http from "node:http";
import { once } from "node:events";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import {
  command,
  expect,
  launchBrowser,
  open,
  pageContentsId,
  state,
  test,
} from "./fixtures";

test("two native panes keep focus, independent navigation, geometry, DevTools and restored tabs", async ({
  rainBrowser: { app, shell, userData },
}) => {
  const server = http.createServer((request, response) =>
    response.end(
      `<!doctype html><title>${request.url}</title><h1>${request.url}</h1>`,
    ),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  try {
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en", rain: "off" },
    });
    await open(shell, `${origin}/a`);
    const a = (await state(shell)).activeTabId;
    await command(shell, { type: "tab.create", url: `${origin}/b` });
    await expect
      .poll(
        async () =>
          (await state(shell)).tabs.find((tab) => tab.url === `${origin}/b`)
            ?.loading,
      )
      .toBe(false);
    const b = (await state(shell)).activeTabId;
    await command(shell, { type: "tab.activate", id: a });
    await command(shell, { type: "split", id: b });
    const geometry = () =>
      app.evaluate(
        ({ BrowserWindow }, origin) =>
          BrowserWindow.getAllWindows()[0].contentView.children.flatMap(
            (child) => {
              const view = child as import("electron").WebContentsView;
              if (
                !view.webContents ||
                view.webContents.isDestroyed() ||
                !view.webContents.getURL().startsWith(origin)
              )
                return [];
              return [
                {
                  url: view.webContents.getURL(),
                  visible: view.getVisible(),
                  bounds: view.getBounds(),
                },
              ];
            },
          ),
        origin,
      );
    await expect
      .poll(
        async () => (await geometry()).filter((view) => view.visible).length,
      )
      .toBe(2);
    const before = await geometry();
    expect(
      before.find((view) => view.url.endsWith("/a"))!.bounds.x,
    ).toBeLessThan(before.find((view) => view.url.endsWith("/b"))!.bounds.x);
    const bContents = await pageContentsId(app, `${origin}/b`);
    const canvasPixel = await app.evaluate(async ({ webContents }, id) => {
      const image = await webContents
        .fromId(id)!
        .capturePage({ x: 0, y: 0, width: 1, height: 1 });
      return [...image.toBitmap().subarray(0, 3)];
    }, bContents);
    expect(canvasPixel).toEqual([255, 255, 255]);
    await app.evaluate(
      ({ webContents }, id) => webContents.fromId(id)!.focus(),
      bContents,
    );
    await expect.poll(async () => (await state(shell)).activeTabId).toBe(b);
    expect((await state(shell)).splitPrimaryId).toBe(a);
    const first = shell.getByRole("form", { name: "First pane", exact: true });
    await first
      .getByLabel("Pane address", { exact: true })
      .fill(`${origin}/next`);
    await first.getByLabel("Pane address", { exact: true }).press("Enter");
    await expect
      .poll(
        async () => (await state(shell)).tabs.find((tab) => tab.id === a)?.url,
      )
      .toBe(`${origin}/next`);
    expect((await state(shell)).tabs.find((tab) => tab.id === b)?.url).toBe(
      `${origin}/b`,
    );
    await expect
      .poll(
        async () =>
          (await state(shell)).tabs.find((tab) => tab.id === a)?.loading,
      )
      .toBe(false);
    await command(shell, { type: "pane.action", tabId: a, action: "back" });
    await expect
      .poll(
        async () => (await state(shell)).tabs.find((tab) => tab.id === a)?.url,
      )
      .toBe(`${origin}/a`);
    const aContents = await pageContentsId(app, `${origin}/a`);
    await command(shell, { type: "pane.action", tabId: a, action: "zoomIn" });
    const zoom = await app.evaluate(
      ({ webContents }, ids) =>
        ids.map((id) => webContents.fromId(id)!.getZoomFactor()),
      [aContents, bContents],
    );
    expect(zoom[0]).toBeCloseTo(1.1, 2);
    expect(zoom[1]).toBeCloseTo(1, 2);
    await command(shell, { type: "pane.action", tabId: b, action: "devtools" });
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }, id) => webContents.fromId(id)!.isDevToolsOpened(),
          bContents,
        ),
      )
      .toBe(true);
    await app.evaluate(
      ({ webContents }, id) => webContents.fromId(id)!.closeDevTools(),
      bContents,
    );
    await command(shell, {
      type: "settings.update",
      settings: { verticalTabs: true },
    });
    await command(shell, {
      type: "tab.update",
      id: b,
      pinned: true,
      group: "split-work",
    });
    const strip = shell.locator(".vertical-strip");
    await expect(strip.locator(".tab.pinned.grouped")).toHaveCount(1);
    await strip.locator(".tab").nth(1).dragTo(strip.locator(".tab").nth(0));
    await expect.poll(async () => (await state(shell)).tabs[0].id).toBe(b);
    await strip.getByLabel("Search tabs", { exact: true }).fill("/b");
    await expect(strip.getByRole("tab")).toHaveCount(1);
    await strip.getByLabel("Search tabs", { exact: true }).fill("");
    await strip
      .getByRole("button", { name: "Collapse vertical tabs", exact: true })
      .click();
    await expect(strip).toHaveClass(/collapsed/);
    await shell
      .getByRole("combobox", { name: "Split View", exact: true })
      .selectOption("vertical");
    await shell.getByLabel("Pane size ratio", { exact: true }).focus();
    await shell.getByLabel("Pane size ratio", { exact: true }).press("Home");
    await expect.poll(async () => (await state(shell)).splitRatio).toBe(0.25);
    await expect
      .poll(async () => {
        const views = await geometry();
        return (
          views.find((view) => view.url.endsWith("/a"))!.bounds.y <
          views.find((view) => view.url.endsWith("/b"))!.bounds.y
        );
      })
      .toBe(true);
    const denied = await shell.evaluate(
      (id) => window.raincode.command({ type: "tab.suspend", id }),
      a,
    );
    expect(denied.ok).toBe(false);
    await shell
      .getByRole("button", { name: "Swap panes", exact: true })
      .click();
    expect((await state(shell)).splitPrimaryId).toBe(b);
    expect((await state(shell)).splitTabId).toBe(a);
    await shell.screenshot({ path: path.resolve("artifacts/split-view.png") });
    const frames = await app.evaluate(
      async ({ webContents }, urls) =>
        Promise.all(
          urls.map(async (url) => {
            const page = webContents
              .getAllWebContents()
              .find((contents) => contents.getURL() === url);
            if (!page) throw new Error("Missing native pane");
            return (await page.capturePage()).toPNG().toString("base64");
          }),
        ),
      [`${origin}/a`, `${origin}/b`],
    );
    for (let index = 0; index < frames.length; index++)
      await writeFile(
        path.resolve(`artifacts/split-native-${index}.png`),
        Buffer.from(frames[index], "base64"),
      );
    await app.close();
    const restored = await launchBrowser(userData);
    try {
      const current = await state(restored.shell);
      expect(current).toMatchObject({
        splitPrimaryId: b,
        splitTabId: a,
        splitOrientation: "vertical",
        splitRatio: 0.25,
      });
      expect(current.settings.verticalTabs).toBe(true);
      expect(current.settings.verticalTabsCollapsed).toBe(true);
      await command(restored.shell, { type: "split" });
      expect((await state(restored.shell)).tabs.map((tab) => tab.id)).toEqual(
        expect.arrayContaining([a, b]),
      );
    } finally {
      await restored.app.close();
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
