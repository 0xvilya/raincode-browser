import { spawn } from "node:child_process";
import path from "node:path";
import { expect, state, test } from "./fixtures";

test("a second launch reuses the existing window without opening the profile twice", async ({
  rainBrowser: { app, shell, userData },
}) => {
  const before = await state(shell);
  const observed = await app.evaluateHandle(({ app, BrowserWindow }) => {
    const value = { secondInstances: 0 };
    app.on("second-instance", () => value.secondInstances++);
    BrowserWindow.getAllWindows()[0].minimize();
    return value;
  });
  const executable = await app.evaluate(() => process.execPath);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    RAINCODE_USER_DATA: userData,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.RAINCODE_DEV_URL;
  const second = spawn(executable, [path.resolve("dist-electron/main.cjs")], {
    env,
    windowsHide: true,
    stdio: "ignore",
  });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        second.kill();
        reject(new Error("Duplicate process did not exit"));
      }, 15000);
      second.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      second.once("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    expect(code).toBe(0);
    await expect
      .poll(() => observed.evaluate((value) => value.secondInstances))
      .toBe(1);
    expect(
      await app.evaluate(({ BrowserWindow }) => ({
        windows: BrowserWindow.getAllWindows().length,
        minimized: BrowserWindow.getAllWindows()[0].isMinimized(),
      })),
    ).toEqual({ windows: 1, minimized: false });
    expect((await state(shell)).tabs.map((tab) => tab.id)).toEqual(
      before.tabs.map((tab) => tab.id),
    );
    expect((await state(shell)).activeTabId).toBe(before.activeTabId);
  } finally {
    if (second.exitCode === null) second.kill();
    await observed.dispose();
  }
});
