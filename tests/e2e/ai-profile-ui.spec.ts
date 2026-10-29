import { activeTab, command, expect, test } from "./fixtures";

test("AI profile boundary clears unsent prompts and API-key inputs", async ({
  rainBrowser: { shell },
}) => {
  await command(shell, {
    type: "settings.update",
    settings: { locale: "en" },
  });
  const original = await activeTab(shell);
  const created = await command(shell, {
    type: "profile.create",
    name: "Isolated AI fixture",
    mode: "direct",
  });
  expect(created.ok).toBe(true);
  await shell.getByRole("button", { name: "RainCode AI", exact: true }).click();
  const panel = shell.getByRole("complementary", { name: "RainCode AI" });
  await panel.locator("#rain-ai-prompt").fill("private unsent report");
  await panel.getByRole("button", { name: "Connection", exact: true }).click();
  await panel
    .getByLabel("Provider", { exact: true })
    .selectOption("openai-compatible");
  await panel
    .getByLabel("API key", { exact: true })
    .fill("private-unsaved-api-key");
  await command(shell, {
    type: "tab.create",
    profileId: created.data as string,
    url: "raincode://newtab",
  });
  await expect(panel.locator("#rain-ai-prompt")).toHaveValue("");
  await panel.getByRole("button", { name: "Connection", exact: true }).click();
  await panel
    .getByLabel("Provider", { exact: true })
    .selectOption("openai-compatible");
  await expect(panel.getByLabel("API key", { exact: true })).toHaveValue("");
  await command(shell, { type: "tab.activate", id: original.id });
  await expect(panel.locator("#rain-ai-prompt")).toHaveValue("");
  await panel.getByRole("button", { name: "Connection", exact: true }).click();
  await panel
    .getByLabel("Provider", { exact: true })
    .selectOption("openai-compatible");
  await expect(panel.getByLabel("API key", { exact: true })).toHaveValue("");
});
