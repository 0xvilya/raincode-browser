import { command, expect, launchBrowser, state, test } from "./fixtures";

test("all realistic wallpapers load locally and vector choice survives restart", async ({
  rainBrowser: { app, shell, userData },
}) => {
  for (const scene of [
    "london",
    "newyork",
    "tokyo",
    "paris",
    "forest",
    "mountain",
    "ocean",
    "sakura",
    "cyber",
    "space",
    "minimal-light",
    "minimal-dark",
  ] as const) {
    await command(shell, {
      type: "settings.update",
      settings: { scene, sceneArtwork: "realistic" },
    });
    const artwork = shell.locator(".scene-realistic > img");
    await expect(artwork).toBeVisible();
    await expect
      .poll(() =>
        artwork.evaluate(
          (image: HTMLImageElement) =>
            image.complete && image.naturalWidth >= 1600,
        ),
      )
      .toBe(true);
    expect(await artwork.getAttribute("src")).toMatch(
      /^\/(?:scenes\/|london-rain\.png)/,
    );
    await artwork.evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await shell.screenshot({ path: `artifacts/realistic-${scene}.png` });
  }
  await command(shell, { type: "navigate", url: "raincode://settings" });
  const gallery = shell.getByRole("group", { name: "Галерея фонов" });
  await expect(gallery.locator(".scene-realistic > img")).toHaveCount(12);
  await gallery.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      gallery
        .locator("img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth >= 1600,
          ),
        ),
    )
    .toBe(true);
  await gallery.locator("img").evaluateAll(async (images) => {
    await Promise.all(
      images.map((image) =>
        image instanceof HTMLImageElement ? image.decode() : undefined,
      ),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await shell.screenshot({ path: "artifacts/realistic-gallery-0.5.9.png" });
  await command(shell, { type: "navigate", url: "raincode://newtab" });
  await command(shell, {
    type: "settings.update",
    settings: { sceneArtwork: "vector" },
  });
  await expect(shell.locator(".scene > svg")).toBeVisible();
  await app.close();
  const next = await launchBrowser(userData);
  try {
    expect((await state(next.shell)).settings.sceneArtwork).toBe("vector");
    await expect(next.shell.locator(".scene > svg")).toBeVisible();
  } finally {
    await next.app.close();
  }
});

test("scene selection changes actual artwork and survives restart", async ({
  rainBrowser: { app, shell, userData },
}) => {
  await command(shell, {
    type: "settings.update",
    settings: { sceneArtwork: "vector" },
  });
  const scene = shell.locator(".scene");
  await expect(scene).toHaveAttribute("data-scene", "london");
  await expect(scene.locator("svg")).toHaveCount(0);

  await command(shell, { type: "navigate", url: "raincode://settings" });
  await shell
    .getByLabel("Фоновая сцена", { exact: true })
    .selectOption("tokyo");
  await command(shell, { type: "navigate", url: "raincode://newtab" });
  await expect(scene).toHaveAttribute("data-scene", "tokyo");
  await expect(shell.locator(".eyebrow")).toContainText("Неоновый Токио");
  await expect(scene.locator("svg")).toBeVisible();
  const tokyo = await scene.locator("svg").innerHTML();
  expect(tokyo).toContain("#e047c3");
  await shell.screenshot({ path: "artifacts/theme-tokyo.png" });

  await command(shell, {
    type: "settings.update",
    settings: { scene: "newyork" },
  });
  await expect(scene).toHaveAttribute("data-scene", "new-york");
  const newYork = await scene.locator("svg").innerHTML();
  expect(newYork).not.toBe(tokyo);
  expect(newYork).toContain("#e7b36f");
  await shell.screenshot({ path: "artifacts/theme-newyork.png" });
  expect(
    await scene
      .locator("svg")
      .evaluate(
        (element) => element.querySelectorAll("image, use, [href]").length,
      ),
  ).toBe(0);

  await app.close();
  const restarted = await launchBrowser(userData);
  try {
    expect((await state(restarted.shell)).settings.scene).toBe("newyork");
    await expect(restarted.shell.locator(".scene")).toHaveAttribute(
      "data-scene",
      "new-york",
    );
    await command(restarted.shell, {
      type: "settings.update",
      settings: { scene: "london" },
    });
    const london = restarted.shell.locator(".scene");
    await expect(london).toHaveAttribute("data-scene", "london");
    await expect(london.locator("svg")).toHaveCount(0);
    expect(
      await london.evaluate(
        (element) => getComputedStyle(element).backgroundImage,
      ),
    ).toContain("london-rain.png");
  } finally {
    await restarted.app.close();
  }
});
