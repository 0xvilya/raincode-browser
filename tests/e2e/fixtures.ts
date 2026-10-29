import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  BrowserState,
  Command,
  CommandResult,
} from "../../src/shared/contracts";

export interface BrowserFixture {
  app: ElectronApplication;
  shell: Page;
  userData: string;
}

export async function launchBrowser(userData: string): Promise<BrowserFixture> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" &&
        !["ELECTRON_RUN_AS_NODE", "RAINCODE_DEV_URL"].includes(entry[0]),
    ),
  );
  const app = await electron.launch({
    ...(process.env.RAINCODE_E2E_EXECUTABLE
      ? { executablePath: process.env.RAINCODE_E2E_EXECUTABLE }
      : {}),
    args: process.env.RAINCODE_E2E_EXECUTABLE
      ? [`--user-data-dir=${userData}`]
      : [path.resolve("dist-electron/main.cjs")],
    env: { ...env, RAINCODE_USER_DATA: userData, RAINCODE_TEST: "1" },
    timeout: 30_000,
  });
  try {
    // Restored WebContentsViews can emit a page event before the shell finishes
    // loading. Select the trusted UI explicitly, never a remote page.
    await expect
      .poll(() =>
        app
          .windows()
          .some((page) => page.url().startsWith("raincode-app://ui/")),
      )
      .toBe(true);
    const shell = app
      .windows()
      .find((page) => page.url().startsWith("raincode-app://ui/"))!;
    await shell.waitForFunction(
      () => typeof window.raincode?.getState === "function",
    );
    await expect
      .poll(async () => (await state(shell)).tabs.length)
      .toBeGreaterThan(0);
    return { app, shell, userData };
  } catch (error) {
    await app.close().catch(() => undefined);
    throw error;
  }
}

export const test = base.extend<{ rainBrowser: BrowserFixture }>({
  rainBrowser: async ({}, use) => {
    const userData = await mkdtemp(path.join(tmpdir(), "raincode-e2e-"));
    let browser: BrowserFixture | undefined;
    try {
      browser = await launchBrowser(userData);
      await use(browser);
    } finally {
      await browser?.app.close().catch(() => undefined);
      await rm(userData, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  },
});

export async function state(shell: Page): Promise<BrowserState> {
  return shell.evaluate(() => window.raincode.getState());
}

export async function command(
  shell: Page,
  payload: Command,
): Promise<CommandResult> {
  const result = await shell.evaluate(
    (value) => window.raincode.command(value),
    payload,
  );
  expect(result, JSON.stringify(payload)).toMatchObject({ ok: true });
  return result;
}

export async function activeTab(shell: Page) {
  const current = await state(shell);
  const tab = current.tabs.find((item) => item.id === current.activeTabId);
  if (!tab) throw new Error("No active tab");
  return tab;
}

export async function open(shell: Page, url: string) {
  await command(shell, { type: "navigate", url });
  await expect
    .poll(async () => {
      const tab = await activeTab(shell);
      return { url: tab.url, loading: tab.loading, error: tab.error || "" };
    })
    .toMatchObject({ url, loading: false, error: "" });
}

export async function pageContentsId(app: ElectronApplication, url: string) {
  const find = () =>
    app.evaluate(
      ({ webContents }, target) =>
        webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === target)?.id,
      url,
    );
  // Browser state includes a requested URL before the native document commits.
  // Wait for that WebContents commit, rather than treating navigation latency
  // as a missing/destroyed page.
  await expect.poll(find).toBeDefined();
  const id = await find();
  if (id === undefined) throw new Error(`No WebContents for ${url}`);
  return id;
}

export { expect };
