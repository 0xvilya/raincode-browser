import { command, expect, test } from "./fixtures";
test("AI panel has short model choice and actionable setup without clipping at narrow widths", async ({
  rainBrowser: { shell },
}) => {
  await command(shell, {
    type: "settings.update",
    settings: { locale: "ru", fontSize: 20 },
  });
  await shell.getByRole("button", { name: "RainCode ИИ", exact: true }).click();
  const panel = shell.getByRole("complementary", { name: "RainCode ИИ" });
  for (const width of [300, 360, 480]) {
    await panel.evaluate((element, width) => {
      (element as HTMLElement).style.width = width + "px";
    }, width);
    await expect(
      panel.getByRole("combobox", {
        name: "Выбрать настроенную модель",
        exact: true,
      }),
    ).toHaveValue("");
    await expect(
      panel
        .getByRole("combobox", {
          name: "Выбрать настроенную модель",
          exact: true,
        })
        .locator("option:checked"),
    ).toHaveText("Выберите модель");
    const dimensions = await panel.evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
    const outside = await panel
      .locator("button,select,textarea")
      .evaluateAll((elements) =>
        elements
          .filter((element) => {
            if (!(element as HTMLElement).offsetParent) return false;
            const r = element.getBoundingClientRect(),
              p = element.closest(".rain-ai-panel")!.getBoundingClientRect();
            return r.left < p.left - 1 || r.right > p.right + 1;
          })
          .map((element) => element.textContent),
      );
    expect(outside).toEqual([]);
  }
  await panel
    .getByRole("button", { name: "Подключить модель", exact: true })
    .click();
  await expect(
    panel.getByRole("textbox", { name: "Адрес API", exact: true }),
  ).toBeVisible();
  await shell.screenshot({ path: "artifacts/ai-panel-narrow-ru.png" });
});

