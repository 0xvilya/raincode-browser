import { activeTab, command, expect, test } from "./fixtures";

test("password sidebar icon opens and focuses the existing vault in both languages", async ({
  rainBrowser: { shell },
}) => {
  for (const [locale, label] of [
    ["en", "Password manager"],
    ["ru", "Менеджер паролей"],
  ] as const) {
    await command(shell, { type: "settings.update", settings: { locale } });
    await command(shell, { type: "navigate", url: "raincode://newtab" });
    await shell
      .locator(".sidebar")
      .getByRole("button", { name: label, exact: true })
      .click();
    await expect
      .poll(async () => (await activeTab(shell)).url)
      .toBe("raincode://privacy#sites");
    const vault = shell.getByRole("region", {
      name: "Password vault",
      exact: true,
    });
    await expect(vault).toHaveCount(1);
    await expect(vault).toBeVisible();
    await expect(vault).toBeFocused();
    await shell
      .locator(".sidebar")
      .getByRole("button", { name: label, exact: true })
      .click();
    await expect(vault).toBeFocused();
  }
});
