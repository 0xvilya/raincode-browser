import { command, expect, test } from "./fixtures";

test("local code review never executes source and shares only findings in AI draft", async ({
  rainBrowser: { shell },
}) => {
  await command(shell, { type: "settings.update", settings: { locale: "en" } });
  await command(shell, {
    type: "tab.create",
    url: "raincode://privacy#security",
  });
  const panel = shell.getByRole("region", {
    name: "Local code review",
    exact: true,
  });
  await panel
    .getByLabel("Source to review")
    .fill(
      'globalThis.RAIN_REVIEW_EXECUTED = true;\neval("private-source-marker");\nconst options = { sandbox: false };',
    );
  await panel
    .getByRole("button", { name: "Review code locally", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("dynamic-eval");
  await expect(panel.getByRole("status")).toContainText("sandbox-disabled");
  expect(
    await shell.evaluate(() => Reflect.has(globalThis, "RAIN_REVIEW_EXECUTED")),
  ).toBe(false);
  await panel
    .getByRole("button", { name: "Explain findings — AI draft", exact: true })
    .click();
  await expect(shell.locator("#rain-ai-prompt")).toHaveValue(/dynamic-eval/);
  await expect(shell.locator("#rain-ai-prompt")).not.toHaveValue(
    /private-source-marker/,
  );
  await panel
    .getByRole("button", { name: "Clear code and results", exact: true })
    .click();
  await expect(panel.getByLabel("Source to review")).toHaveValue("");
  await expect(
    panel.getByRole("button", {
      name: "Explain findings — AI draft",
      exact: true,
    }),
  ).toBeDisabled();
});
