import { command, expect, state, test } from "./fixtures";
test("Shield 2 overview, search, keyboard navigation and real mode apply", async ({
  rainBrowser: { shell },
}) => {
  await command(shell, { type: "settings.update", settings: { locale: "en" } });
  await shell
    .locator(".sidebar")
    .getByRole("button", { name: "Privacy", exact: true })
    .click();
  await expect(
    shell.getByRole("heading", { name: "RAIN SHIELD", exact: true }),
  ).toBeVisible();
  expect(
    await shell
      .getByRole("tablist", { name: "Rain Shield", exact: true })
      .getByRole("tab")
      .count(),
  ).toBe(8);
  const overview = shell.getByRole("region", { name: "Rain Shield overview" });
  await expect(overview).toContainText("Direct connection");
  await expect(overview).toContainText("not tested");
  await overview
    .getByRole("button", { name: "Check configuration", exact: true })
    .click();
  await expect(overview).toContainText("Checked configuration flags passed");
  await overview.getByRole("button", { name: /ENHANCED/ }).click();
  expect((await state(shell)).settings.privacy.level).toBe("standard");
  await overview
    .getByRole("button", { name: "Apply mode", exact: true })
    .click();
  await expect
    .poll(async () => (await state(shell)).settings.privacy.level)
    .toBe("strict");
  await shell
    .getByRole("tab", { name: "Network and Tor", exact: true })
    .click();
  await expect(shell.locator('[data-privacy-section="dns"]')).toBeVisible();
  expect((await state(shell)).tor?.status).toBe("stopped");
  await shell.getByRole("tab", { name: "Overview", exact: true }).focus();
  await shell.keyboard.press("ArrowDown");
  await expect(
    shell.getByRole("tab", { name: "Network and Tor", exact: true }),
  ).toBeFocused();
  await shell
    .getByRole("searchbox", { name: "Search Shield settings" })
    .fill("camera");
  await expect(
    shell.getByRole("button", {
      name: "Site permissions, AI access and security audit",
      exact: true,
    }),
  ).toBeVisible();
  await shell
    .getByRole("button", {
      name: "Site permissions, AI access and security audit",
      exact: true,
    })
    .click();
  await expect(
    shell.locator('[data-privacy-section="security"]'),
  ).toBeVisible();
  await shell.getByRole("tab", { name: "Overview", exact: true }).click();
  await shell.screenshot({ path: "artifacts/shield2-overview.png" });
});
