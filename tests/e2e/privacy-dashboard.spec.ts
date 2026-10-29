import { activeTab, command, expect, state, test } from "./fixtures";

test("privacy and security dashboards route correctly and the private button opens a real private profile", async ({
  rainBrowser: { shell },
}) => {
  await command(shell, { type: "settings.update", settings: { locale: "en" } });
  await command(shell, { type: "navigate", url: "raincode://privacy" });
  await shell.getByRole("tab", { name: "Diagnostics", exact: true }).click();
  await shell
    .getByRole("button", { name: "Security dashboard", exact: true })
    .click();
  await expect
    .poll(async () => (await activeTab(shell)).url)
    .toBe("raincode://privacy");
  await expect(
    shell.getByRole("heading", { name: "Security Center", exact: true }),
  ).toBeVisible();
  await shell.getByRole("tab", { name: "Diagnostics", exact: true }).click();
  await shell
    .getByRole("switch", { name: "Browsing history", exact: true })
    .uncheck();
  await expect
    .poll(async () => (await state(shell)).settings.historyEnabled)
    .toBe(false);
  await shell
    .getByRole("tab", { name: "Data and private sessions", exact: true })
    .click();
  await shell.getByRole("button", { name: "Private tab", exact: true }).click();
  await expect
    .poll(async () => {
      const s = await state(shell);
      const t = s.tabs.find((t) => t.id === s.activeTabId);
      return s.profiles.find((p) => p.id === t?.profileId)?.mode;
    })
    .toBe("private");
  expect((await activeTab(shell)).profileId).not.toBe("default");
});
