import { command, expect, test } from "./fixtures";
test("Russian Tor controls fit narrow windows and large interface text", async ({
  rainBrowser: { app, shell },
}) => {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1000, 800),
  );
  await command(shell, {
    type: "settings.update",
    settings: { locale: "ru", fontSize: 20 },
  });
  await command(shell, { type: "navigate", url: "raincode://privacy#tor" });
  await expect(shell.locator('[data-privacy-section="tor"]')).toBeVisible();
  const overflow = await shell
    .locator(".shield-main")
    .evaluate((root) => ({
      width: root.clientWidth,
      scroll: root.scrollWidth,
    }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1);
  const escaped = await shell
    .locator('[data-privacy-section="tor"] .page-actions')
    .evaluateAll((rows) =>
      rows.flatMap((row) =>
        Array.from(row.querySelectorAll("button"))
          .filter((button) => {
            const r = button.getBoundingClientRect(),
              p = row.getBoundingClientRect();
            return r.right > p.right + 1 || r.left < p.left - 1;
          })
          .map((button) => button.textContent),
      ),
    );
  expect(escaped).toEqual([]);
  await shell.screenshot({ path: "artifacts/tor-layout-ru-large.png" });
});
