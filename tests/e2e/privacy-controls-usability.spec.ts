import { command, expect, state, test } from "./fixtures";

test("privacy drafts survive other settings updates and apply only when requested", async ({
  rainBrowser: { shell },
}) => {
  await command(shell, {
    type: "settings.update",
    settings: {
      locale: "en",
      privacy: { level: "standard", siteOverrides: [] },
      adBlock: true,
      historyEnabled: true,
      clearOnExit: false,
    },
  });
  await command(shell, { type: "navigate", url: "raincode://privacy" });
  await shell
    .getByRole("tab", { name: "Tracking protection", exact: true })
    .click();
  const controls = shell.getByRole("region", {
    name: "Privacy protection",
    exact: true,
  });
  const apply = controls.getByRole("button", {
    name: "Apply protection",
    exact: true,
  });
  await expect(apply).toBeDisabled();
  await controls.getByRole("button", { name: "Strict", exact: true }).click();
  await expect(
    controls.getByRole("combobox", { name: "Protection level", exact: true }),
  ).toHaveValue("strict");
  expect((await state(shell)).settings.privacy.level).toBe("standard");
  await expect(
    controls.getByText("Changes waiting to be applied", { exact: true }),
  ).toBeVisible();
  await controls
    .getByRole("switch", { name: "Save browsing history", exact: true })
    .uncheck();
  await expect
    .poll(async () => (await state(shell)).settings.historyEnabled)
    .toBe(false);
  // Unrelated published state must not replace the pending privacy draft.
  await expect(
    controls.getByRole("button", { name: "Strict", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await apply.click();
  await expect
    .poll(async () => (await state(shell)).settings.privacy.level)
    .toBe("strict");
  await expect(apply).toBeDisabled();
  await controls
    .getByLabel("Website JavaScript", { exact: true })
    .selectOption("block");
  await controls
    .getByLabel("Website JavaScript", { exact: true })
    .selectOption("auto");
  await expect(apply).toBeDisabled();
  await controls
    .getByText("Exact site origin exception (0)", { exact: true })
    .click();
  await controls
    .getByRole("textbox", { name: "Exact site origin exception", exact: true })
    .fill("https://example.com");
  await controls
    .getByLabel("Exact site origin exception: Website JavaScript", {
      exact: true,
    })
    .selectOption("allow");
  await controls
    .getByRole("button", { name: "Save exception", exact: true })
    .click();
  expect((await state(shell)).settings.privacy.siteOverrides).toHaveLength(0);
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect
    .poll(async () => (await state(shell)).settings.privacy.siteOverrides)
    .toEqual([{ origin: "https://example.com", javascript: "allow" }]);
  await expect(apply).toBeDisabled();
  await controls.getByRole("button", { name: "Maximum", exact: true }).click();
  await controls
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(
    controls.getByRole("combobox", { name: "Protection level", exact: true }),
  ).toHaveValue("strict");
  await expect(apply).toBeDisabled();
  await controls
    .getByRole("switch", { name: "Clear site data on exit", exact: true })
    .check();
  await expect
    .poll(async () => (await state(shell)).settings.clearOnExit)
    .toBe(true);
});
