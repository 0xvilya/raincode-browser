import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import {
  activeTab,
  command,
  expect,
  open,
  pageContentsId,
  state,
  test,
} from "./fixtures";

test("shield monitor requires explicit start, records real bounded host events and clears on stop and navigation", async ({
  rainBrowser: { app, shell, userData },
}) => {
  const seen: string[] = [];
  const site = http.createServer((request, response) => {
    seen.push(request.url || "");
    response.setHeader("Content-Type", "text/html");
    response.end("<!doctype html><title>Owned monitor page</title>");
  });
  const third = http.createServer((request, response) => {
    seen.push(request.url || "");
    response.end("fixture");
  });
  for (const server of [site, third]) server.listen(0, "127.0.0.1");
  await Promise.all([once(site, "listening"), once(third, "listening")]);
  const origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
  const other = `http://127.0.0.1:${(third.address() as AddressInfo).port}`;
  try {
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en" },
    });
    await open(shell, `${origin}/page`);
    const source = await activeTab(shell);
    const contentsId = await pageContentsId(app, `${origin}/page`);
    const inject = async (url: string) =>
      app.evaluate(
        ({ webContents }, args) =>
          webContents
            .fromId(args.id)!
            .executeJavaScript(
              `(() => { const image = new Image(); image.src = ${JSON.stringify(args.url)}; document.body.appendChild(image); })()`,
            ),
        { id: contentsId, url },
      );
    await inject(`${origin}/before?secret=do-not-record`);
    await expect
      .poll(() => seen.includes("/before?secret=do-not-record"))
      .toBe(true);
    expect(
      (await command(shell, { type: "privacy.monitor.snapshot" })).data,
    ).toEqual({ active: false, records: [] });
    await command(shell, { type: "tab.create", url: "raincode://privacy" });
    const privacyTab = (await activeTab(shell)).id;
    await shell
      .getByRole("tab", { name: "Tracking protection", exact: true })
      .click();
    const panel = shell.getByRole("region", {
      name: "Network monitor",
      exact: true,
    });
    await panel
      .getByRole("combobox", { name: "Tab to monitor", exact: true })
      .selectOption(source.id);
    await panel
      .getByRole("button", { name: "Start monitoring", exact: true })
      .click();
    await expect(
      shell.getByRole("button", { name: "Network monitor: stop", exact: true }),
    ).toBeVisible();
    await inject(`${origin}/after?token=secret-value`);
    await inject(`${other}/cross?token=other-secret`);
    await inject("http://doubleclick.net/collect?secret=tracker-secret");
    await expect
      .poll(() => seen.includes("/cross?token=other-secret"))
      .toBe(true);
    await expect
      .poll(async () => {
        const value = (
          await command(shell, { type: "privacy.monitor.snapshot" })
        ).data as { records: { action: string }[] };
        return value.records.some((record) => record.action === "tracker");
      })
      .toBe(true);
    await panel
      .getByRole("button", { name: "Refresh results", exact: true })
      .click();
    const search = panel.getByRole("searchbox", {
      name: "Search domain or resource type",
    });
    await search.fill("doubleclick");
    await expect(panel.locator(".list-row")).toHaveCount(1);
    await expect(panel.locator(".list-row")).toContainText("doubleclick.net");
    await search.fill("no-matching-domain");
    await expect(panel.locator(".list-row")).toHaveCount(0);
    await search.fill("");
    const snapshot = (
      await command(shell, { type: "privacy.monitor.snapshot" })
    ).data as {
      active: boolean;
      records: { host: string; action: string; crossOrigin: boolean }[];
    };
    await panel.scrollIntoViewIfNeeded();
    await shell.screenshot({ path: "artifacts/privacy-monitor-0.5.13.png" });
    expect(snapshot.active).toBe(true);
    expect(snapshot.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          host: "127.0.0.1",
          action: "observed",
          crossOrigin: false,
        }),
        expect.objectContaining({
          host: "127.0.0.1",
          action: "observed",
          crossOrigin: true,
        }),
        expect.objectContaining({
          host: "doubleclick.net",
          action: "tracker",
          crossOrigin: true,
        }),
      ]),
    );
    for (const secret of [
      "secret-value",
      "other-secret",
      "tracker-secret",
      "/after",
      "/before",
    ])
      expect(JSON.stringify(snapshot)).not.toContain(secret);
    const db = new DatabaseSync(path.join(userData, "raincode.sqlite"), {
      readOnly: true,
    });
    try {
      const row = db
        .prepare("SELECT value FROM state WHERE key = 'browser'")
        .get() as { value: string };
      for (const sensitive of [
        "privacyMonitorTabId",
        "doubleclick.net",
        "secret-value",
        "tracker-secret",
      ])
        expect(row.value).not.toContain(sensitive);
    } finally {
      db.close();
    }
    await shell
      .getByRole("button", { name: "Network monitor: stop", exact: true })
      .click();
    expect(
      (await command(shell, { type: "privacy.monitor.snapshot" })).data,
    ).toEqual({ active: false, records: [] });
    await inject(`${origin}/after-stop?token=still-private`);
    await expect
      .poll(() => seen.includes("/after-stop?token=still-private"))
      .toBe(true);
    expect(
      (await command(shell, { type: "privacy.monitor.snapshot" })).data,
    ).toEqual({ active: false, records: [] });
    await panel
      .getByRole("button", { name: "Start monitoring", exact: true })
      .click();
    const privateProfile = (
      await command(shell, {
        type: "profile.create",
        name: "Isolated monitor test",
        mode: "private",
      })
    ).data as string;
    await command(shell, { type: "tab.create", profileId: privateProfile });
    expect((await state(shell)).privacyMonitorTabId).toBeUndefined();
    const denied = await shell.evaluate(
      (tabId) =>
        window.raincode.command({ type: "privacy.monitor.start", tabId }),
      source.id,
    );
    expect(denied.ok).toBe(false);
    await command(shell, { type: "tab.activate", id: privacyTab });
    await shell
      .getByRole("tab", { name: "Tracking protection", exact: true })
      .click();
    await panel
      .getByRole("combobox", { name: "Tab to monitor", exact: true })
      .selectOption(source.id);
    await panel
      .getByRole("button", { name: "Start monitoring", exact: true })
      .click();
    await app.evaluate(
      ({ webContents }, args) =>
        webContents
          .fromId(args.id)!
          .executeJavaScript(`location.href = ${JSON.stringify(args.url)}`),
      { id: contentsId, url: `${other}/new-origin` },
    );
    await expect
      .poll(async () => (await state(shell)).privacyMonitorTabId)
      .toBeUndefined();
    expect(
      (await command(shell, { type: "privacy.monitor.snapshot" })).data,
    ).toEqual({ active: false, records: [] });
  } finally {
    for (const server of [site, third]) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});
