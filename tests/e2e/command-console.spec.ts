import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { command, expect, test } from "./fixtures";

test("embedded command console preserves consent, handles Unicode/history and cancels an owned process", async ({
  rainBrowser: { app, shell },
}) => {
  const folder = await mkdtemp(path.join(tmpdir(), "raincode-console-"));
  try {
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en" },
    });
    await command(shell, { type: "tab.create", url: "raincode://devpanel" });
    const console = shell.getByRole("region", {
      name: "Project command console",
      exact: true,
    });
    const input = console.getByRole("textbox", {
      name: "Local command",
      exact: true,
    });
    await expect(input).toBeDisabled();
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
    await command(shell, { type: "action", action: "project" });
    await expect(input).toBeEnabled();
    const denied =
      process.platform === "win32"
        ? "Set-Content -LiteralPath 'must-not-run.txt' -Value 'denied'"
        : "printf denied > must-not-run.txt";
    await input.fill(denied);
    await input.press("Enter");
    await expect(
      console.getByLabel("Command output", { exact: true }),
    ).toContainText("Cancelled");
    expect(existsSync(path.join(folder, "must-not-run.txt"))).toBe(false);

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
          throw new Error("Commands must be reviewed and default to deny");
        return { response: 1, checkboxChecked: false };
      };
    });
    const unicode =
      process.platform === "win32"
        ? "Write-Output 'RainCode Кириллица 日本語'"
        : "printf 'RainCode Кириллица 日本語\\n'";
    await input.fill(unicode);
    await input.dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      isComposing: true,
      bubbles: true,
    });
    await expect(input).toHaveValue(unicode);
    await expect(
      console.getByRole("button", { name: "Stop command", exact: true }),
    ).toBeDisabled();
    await input.press("Shift+Enter");
    await expect(input).toHaveValue(`${unicode}\n`);
    await input.fill(unicode);
    await input.press("Enter");
    await expect(
      console.getByLabel("Command output", { exact: true }),
    ).toContainText(/\nRainCode Кириллица 日本語\r?\n/);
    await expect(
      console.getByLabel("Command output", { exact: true }),
    ).toContainText("Exit code: 0");
    await expect(input).toBeEnabled();
    await input.press("ArrowUp");
    await expect(input).toHaveValue(unicode);
    await input.press("ArrowUp");
    await expect(input).toHaveValue(denied);
    await input.press("ArrowDown");
    await expect(input).toHaveValue(unicode);
    await input.press("ArrowDown");
    await expect(input).toHaveValue("");

    const long =
      process.platform === "win32"
        ? "Set-Content -LiteralPath 'owned-command-started.txt' -Value 'owned'; Write-Output 'owned running'; Start-Sleep -Seconds 12; Write-Output 'must-not-complete'"
        : "printf owned > owned-command-started.txt; printf 'owned running\\n'; sleep 12; printf 'must-not-complete'";
    await input.fill(long);
    await input.press("Enter");
    await expect
      .poll(() => existsSync(path.join(folder, "owned-command-started.txt")))
      .toBe(true);
    const stoppedAt = Date.now();
    await console
      .getByRole("button", { name: "Stop command", exact: true })
      .click();
    await expect(input).toBeEnabled({ timeout: 7000 });
    expect(Date.now() - stoppedAt).toBeLessThan(7000);
    await expect(
      console.getByLabel("Command output", { exact: true }),
    ).toContainText("Process stopped");
    // The command text itself is echoed. Only inspect output after its prompt.
    const output = await console
      .getByLabel("Command output", { exact: true })
      .innerText();
    expect(
      output.slice(output.lastIndexOf(`$ ${long}`) + long.length + 2),
    ).not.toContain("must-not-complete");
    await console
      .getByRole("button", { name: "Copy output", exact: true })
      .click();
    await expect(
      console.getByRole("status").filter({ hasText: "Output copied" }),
    ).toBeVisible();
    expect(
      await app.evaluate(({ clipboard }) => clipboard.readText()),
    ).toContain("RainCode Кириллица 日本語");
    await console
      .getByRole("button", { name: "Clear output and history", exact: true })
      .click();
    await expect(
      console.getByLabel("Command output", { exact: true }),
    ).not.toContainText("$ ");
    await input.press("ArrowUp");
    await expect(input).toHaveValue("");
  } finally {
    // Only the explicitly created temporary project folder is removed.
    await rm(folder, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});
