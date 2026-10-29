import { command, expect, launchBrowser, state, test } from "./fixtures";

test("gallery, custom chrome colors, snow lifecycle and AI shortcut persist and work", async ({
  rainBrowser: { app, shell, userData },
}) => {
  await command(shell, {
    type: "settings.update",
    settings: { locale: "en", motionPreference: "full", rain: "medium" },
  });
  const native = await app.browserWindow(shell);
  await native.evaluate((window) => {
    window.show();
    window.focus();
    window.webContents.focus();
  });
  await command(shell, { type: "navigate", url: "raincode://settings" });
  const gallery = shell.getByRole("group", {
    name: "Scene gallery",
    exact: true,
  });
  await expect(gallery.getByRole("button")).toHaveCount(12);
  await gallery
    .getByRole("button", { name: "New York Snow", exact: true })
    .click();
  await expect(
    gallery.getByRole("button", { name: "New York Snow", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const canvas = shell.getByTestId("rain-canvas");
  await expect(canvas).toHaveAttribute("data-weather", "snow");
  await expect(canvas).toHaveAttribute("data-running", "true");
  const moving = await canvas.evaluate(async (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")!;
    const a = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    await new Promise((resolve) => setTimeout(resolve, 200));
    const b = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0,
      changed = 0;
    for (let i = 3; i < a.length; i += 4) {
      if (b[i] > 30) visible++;
      if (a[i] !== b[i]) changed++;
    }
    return { visible, changed };
  });
  expect(moving.visible).toBeGreaterThan(100);
  expect(moving.changed).toBeGreaterThan(100);
  const before = await shell
    .locator(".toolbar")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await shell.getByLabel("Browser color", { exact: true }).fill("#c9217d");
  await shell.getByLabel("Accent color", { exact: true }).fill("#ffb020");
  await expect
    .poll(async () => (await state(shell)).settings.shellColor)
    .toBe("#c9217d");
  await expect(shell.locator(".app")).toHaveClass(/custom-colors/);
  expect(
    await shell
      .locator(".toolbar")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe(before);
  await shell
    .locator("#settings-appearance")
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await shell.screenshot({ path: "artifacts/appearance-0.5.6-gallery.png" });
  await command(shell, { type: "navigate", url: "raincode://newtab" });
  await shell.screenshot({ path: "artifacts/appearance-0.5.6-snow.png" });
  await command(shell, {
    type: "settings.update",
    settings: { graphicsEnabled: false },
  });
  await expect(canvas).toHaveAttribute("data-running", "false");
  await command(shell, {
    type: "settings.update",
    settings: { graphicsEnabled: true, motionPreference: "reduced" },
  });
  await expect(canvas).toHaveAttribute("data-pause-reason", "reduced-motion");
  await command(shell, { type: "navigate", url: "raincode://settings" });
  await shell
    .locator(".settings-shortcuts")
    .getByRole("button", { name: "RainCode AI", exact: true })
    .click();
  await expect(shell.locator(".rain-ai-panel")).toBeVisible();
  await app.close();
  const restarted = await launchBrowser(userData);
  try {
    expect((await state(restarted.shell)).settings).toMatchObject({
      scene: "newyork",
      shellColor: "#c9217d",
      accentColor: "#ffb020",
      customColors: true,
    });
    await command(restarted.shell, {
      type: "navigate",
      url: "raincode://settings",
    });
    await restarted.shell
      .getByRole("button", { name: "Reset colors", exact: true })
      .click();
    await expect(restarted.shell.locator(".app")).not.toHaveClass(
      /custom-colors/,
    );
  } finally {
    await restarted.app.close();
  }
});
