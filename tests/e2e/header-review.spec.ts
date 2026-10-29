import http from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  activeTab,
  command,
  expect,
  open,
  pageContentsId,
  test,
} from "./fixtures";

test("passive header review needs consent, captures real headers without values and clears on stop", async ({
  rainBrowser: { app, shell, userData },
}) => {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests++;
    response.writeHead(200, {
      "Content-Type": "text/html",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'",
      "X-Private-Secret": "never-export-secret",
    });
    response.end(
      "<!doctype html><title>Header fixture</title><h1>Owned fixture</h1>",
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Port");
  const url = `http://127.0.0.1:${address.port}/private-path?token=secret`;
  try {
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en" },
    });
    await open(shell, url);
    const source = await activeTab(shell);
    const id = await pageContentsId(app, url);
    expect(
      (await command(shell, { type: "security.headers", action: "read" })).data,
    ).toEqual({ active: false });
    await command(shell, {
      type: "tab.create",
      url: "raincode://privacy#security",
    });
    const panel = shell.getByRole("region", {
      name: "Website header review",
      exact: true,
    });
    await panel
      .getByLabel("Reviewed tab", { exact: true })
      .selectOption(source.id);
    await app.evaluate(
      async ({ webContents }, options) => {
        await webContents.fromId(options.id)!.session.cookies.set({
          url: options.url,
          name: "private-cookie-name",
          value: "private-cookie-value",
          httpOnly: true,
          sameSite: "lax",
        });
      },
      { id, url },
    );
    await panel
      .getByRole("button", { name: "Inspect cookie attributes", exact: true })
      .click();
    await expect(
      panel.getByRole("region", { name: "Cookie attributes", exact: true }),
    ).toContainText("Cookies for root URL: 1");
    const cookieReport = (
      await command(shell, { type: "security.cookies", tabId: source.id })
    ).data;
    expect(cookieReport).toMatchObject({ total: 1, withoutHttpOnly: 0 });
    expect(JSON.stringify(cookieReport)).not.toContain("private-cookie");
    const before = requests;
    await panel
      .getByRole("button", { name: "Enable header review", exact: true })
      .click();
    expect(requests).toBe(before);
    await app.evaluate(
      ({ webContents }, contentsId) =>
        webContents.fromId(contentsId)!.reloadIgnoringCache(),
      id,
    );
    await expect
      .poll(
        async () =>
          (
            (await command(shell, { type: "security.headers", action: "read" }))
              .data as { report?: unknown }
          ).report,
      )
      .toBeTruthy();
    await panel
      .getByRole("button", { name: "Refresh header review", exact: true })
      .click();
    const report = (
      await command(shell, { type: "security.headers", action: "read" })
    ).data;
    for (const secret of [
      "private-path",
      "never-export-secret",
      "token=secret",
    ])
      expect(JSON.stringify(report)).not.toContain(secret);
    // Exercise the production shell download handler, only mocking the user's
    // native destination choice. No test-only download listener writes files.
    const filename = path.join(userData, "header-review-export.json");
    await app.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialogSync = (() =>
        destination) as typeof dialog.showSaveDialogSync;
    }, filename);
    await panel
      .getByRole("button", { name: "Save JSON report", exact: true })
      .click();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(filename, "utf8")).origin;
        } catch {
          return undefined;
        }
      })
      .toBe(new URL(url).origin);
    const exported = await readFile(filename, "utf8");
    expect(JSON.parse(exported).findings).toHaveLength(6);
    for (const secret of [
      "private-path",
      "never-export-secret",
      "token=secret",
      "private-cookie",
    ])
      expect(exported).not.toContain(secret);
    await app.evaluate(({ dialog, BrowserWindow }) => {
      dialog.showSaveDialogSync = (() =>
        undefined) as unknown as typeof dialog.showSaveDialogSync;
      const shellWindow = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().startsWith("raincode-app://ui/"),
      )!;
      const testState = globalThis as typeof globalThis & {
        reportDownloadCancelled?: boolean;
      };
      testState.reportDownloadCancelled = false;
      shellWindow.webContents.session.once("will-download", (event) => {
        testState.reportDownloadCancelled = event.defaultPrevented;
      });
    });
    await panel
      .getByRole("button", { name: "Save JSON report", exact: true })
      .click();
    await expect
      .poll(() =>
        app.evaluate(
          () =>
            (
              globalThis as typeof globalThis & {
                reportDownloadCancelled?: boolean;
              }
            ).reportDownloadCancelled,
        ),
      )
      .toBe(true);
    expect(await readFile(filename, "utf8")).toBe(exported);
    await panel
      .getByRole("button", {
        name: "Explain with AI — prepare draft",
        exact: true,
      })
      .click();
    await expect(shell.locator("#rain-ai-prompt")).toHaveValue(
      /Explain this passive review/,
    );
    await expect(shell.locator("#rain-ai-prompt")).not.toHaveValue(
      /never-export-secret/,
    );
    await command(shell, { type: "tab.close", id: source.id });
    await expect(
      panel.getByRole("button", { name: "Save JSON report", exact: true }),
    ).toBeDisabled();
    await panel
      .getByRole("button", { name: "Stop and clear review", exact: true })
      .click();
    expect(
      (await command(shell, { type: "security.headers", action: "read" })).data,
    ).toEqual({ active: false });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
