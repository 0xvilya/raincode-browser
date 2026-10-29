import { command, expect, test } from "./fixtures";

test("space uses sparse moving debris without rain and stops on reduced motion or graphics off", async ({
  rainBrowser: { app, shell },
}) => {
  const win = await app.browserWindow(shell);
  await win.evaluate((window) => {
    window.show();
    window.focus();
    window.webContents.focus();
  });
  await command(shell, {
    type: "settings.update",
    settings: {
      scene: "space",
      rain: "cinematic",
      cinematic: true,
      motionPreference: "full",
      graphicsEnabled: true,
    },
  });
  const canvas = shell.getByTestId("rain-canvas");
  await expect(canvas).toHaveAttribute("data-effect", "space-debris");
  await expect(canvas).toHaveAttribute("data-running", "true");
  expect(
    Number(await canvas.getAttribute("data-particles")),
  ).toBeLessThanOrEqual(40);
  const pixels = await canvas.evaluate(async (element: HTMLCanvasElement) => {
    const ctx = element.getContext("2d")!;
    const first = ctx.getImageData(0, 0, element.width, element.height).data;
    await new Promise((resolve) => setTimeout(resolve, 350));
    const next = ctx.getImageData(0, 0, element.width, element.height).data;
    let visible = 0,
      changed = 0;
    for (let i = 3; i < next.length; i += 4) {
      if (next[i] >= 20) visible++;
      if (Math.abs(next[i] - first[i]) >= 12) changed++;
    }
    return { visible, changed };
  });
  expect(pixels.visible).toBeGreaterThan(30);
  expect(pixels.changed).toBeGreaterThan(10);
  await shell.screenshot({ path: "artifacts/space-debris.png" });
  await command(shell, {
    type: "settings.update",
    settings: { motionPreference: "reduced" },
  });
  await expect(canvas).toHaveAttribute("data-running", "false");
  await command(shell, {
    type: "settings.update",
    settings: { motionPreference: "full", graphicsEnabled: false },
  });
  await expect(canvas).toHaveAttribute("data-pause-reason", "disabled");
  await command(shell, {
    type: "settings.update",
    settings: { graphicsEnabled: true, rain: "off" },
  });
  await expect(canvas).toHaveAttribute("data-pause-reason", "off");
  await command(shell, {
    type: "settings.update",
    settings: { scene: "london", rain: "low" },
  });
  await expect(canvas).toHaveAttribute("data-effect", "rain");
});

test("cinematic rain produces moving pixels and honors motion and power settings", async ({
  rainBrowser: { app, shell },
}) => {
  const nativeWindow = await app.browserWindow(shell);
  await nativeWindow.evaluate((window) => {
    window.show();
    window.focus();
    window.webContents.focus();
  });
  await command(shell, {
    type: "settings.update",
    settings: {
      rain: "cinematic",
      cinematic: true,
      motionPreference: "full",
      powerSave: false,
      theme: "amber",
      fontSize: 16,
    },
  });
  const canvas = shell.getByTestId("rain-canvas");
  await expect(canvas).toHaveAttribute("data-running", "true");
  // Read real rendered pixels twice, rather than accepting an animation state
  // attribute or a mocked drawing call as evidence that the effect is visible.
  const pixels = await canvas.evaluate(async (element: HTMLCanvasElement) => {
    const context = element.getContext("2d")!;
    const first = context.getImageData(
      0,
      0,
      element.width,
      element.height,
    ).data;
    await new Promise((resolve) => setTimeout(resolve, 220));
    const second = context.getImageData(
      0,
      0,
      element.width,
      element.height,
    ).data;
    let visible = 0;
    let changed = 0;
    for (let i = 3; i < first.length; i += 4) {
      if (second[i] >= 20) visible++;
      if (Math.abs(second[i] - first[i]) >= 12) changed++;
    }
    return { visible, changed };
  });
  expect(pixels.visible).toBeGreaterThan(1_000);
  expect(pixels.changed).toBeGreaterThan(800);
  expect(
    Number(await canvas.getAttribute("data-particles")),
  ).toBeLessThanOrEqual(440);

  await shell.emulateMedia({ reducedMotion: "reduce" });
  await command(shell, {
    type: "settings.update",
    settings: { motionPreference: "system" },
  });
  await expect(canvas).toHaveAttribute("data-pause-reason", "reduced-motion");
  await expect(canvas).not.toBeVisible();
  await command(shell, {
    type: "settings.update",
    settings: { motionPreference: "full" },
  });
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-running", "true");
  await command(shell, {
    type: "settings.update",
    settings: { powerSave: true },
  });
  await expect(canvas).toHaveAttribute("data-fps-limit", "15");
  expect(
    Number(await canvas.getAttribute("data-particles")),
  ).toBeLessThanOrEqual(28);
  expect(
    await shell
      .locator(".atmosphere-bokeh")
      .evaluate((element) => getComputedStyle(element).animationPlayState),
  ).toBe("paused");

  await command(shell, { type: "settings.update", settings: { rain: "off" } });
  await expect(canvas).toHaveAttribute("data-pause-reason", "off");
  expect(
    await canvas.evaluate((element: HTMLCanvasElement) =>
      element
        .getContext("2d")!
        .getImageData(0, 0, element.width, element.height)
        .data.some((value) => value !== 0),
    ),
  ).toBe(false);
});

test("home search stays sharp, editable and inside its frame at fractional display scales", async ({
  rainBrowser: { app, shell },
}) => {
  await command(shell, {
    type: "settings.update",
    settings: {
      fontSize: 16,
      parallax: true,
      cinematic: true,
      motionPreference: "full",
    },
  });
  const nativeWindow = await app.browserWindow(shell);
  await nativeWindow.evaluate((window) => {
    window.focus();
    window.webContents.focus();
  });
  const cdp = await shell.context().newCDPSession(shell);
  const input = shell.locator('.home-search input[name="search"]');
  // Chromium device-scale emulation is repeatable; physical Windows DPI/GPU
  // combinations still need manual visual verification on the target device.
  try {
    for (const scale of [1, 1.25, 1.5, 2]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 1365,
        height: 900,
        deviceScaleFactor: scale,
        mobile: false,
      });
      await input.fill("");
      await input.pressSequentially("RainCode-123", { delay: 1 });
      await shell.keyboard.insertText(" Кириллица пример.рф 日本語");
      await expect(input).toHaveValue(
        "RainCode-123 Кириллица пример.рф 日本語",
      );
      await input.press("Control+a");
      expect(
        await input.evaluate(
          (element: HTMLInputElement) =>
            element.selectionEnd! - element.selectionStart!,
        ),
      ).toBe((await input.inputValue()).length);
      await shell.mouse.move(1000, 600);
      const geometry = await input.evaluate((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const parent = element.parentElement!;
        const frame = parent.getBoundingClientRect();
        return {
          fontSize: parseFloat(style.fontSize),
          filter: style.filter,
          backdrop: style.backdropFilter,
          transform: style.transform,
          weight: style.fontWeight,
          spacing: style.letterSpacing,
          parentBackdrop: getComputedStyle(parent).backdropFilter,
          contentTransform: getComputedStyle(element.closest(".home-content")!)
            .transform,
          leftGap: rect.left - frame.left,
          rightGap: frame.right - rect.right,
          height: rect.height,
          frameHeight: frame.height,
          dpr: devicePixelRatio,
        };
      });
      expect(geometry).toMatchObject({
        filter: "none",
        backdrop: "none",
        transform: "none",
        parentBackdrop: "none",
        contentTransform: "none",
        weight: "400",
        spacing: "normal",
        dpr: scale,
      });
      expect(geometry.fontSize).toBeGreaterThanOrEqual(16);
      expect(geometry.leftGap).toBeGreaterThan(35);
      expect(geometry.leftGap).toBeLessThan(50);
      expect(geometry.rightGap).toBeGreaterThan(30);
      expect(geometry.height).toBeLessThan(geometry.frameHeight);
    }
  } finally {
    await cdp.send("Emulation.clearDeviceMetricsOverride");
    await cdp.detach();
  }
});
