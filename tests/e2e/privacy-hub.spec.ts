import {
  activeTab,
  command,
  expect,
  launchBrowser,
  state,
  test,
} from "./fixtures";

test("shield center keeps Tor, DNS, permissions and privacy controls on one page without auto-connect", async ({
  rainBrowser: { app, shell, userData },
}) => {
  await command(shell, { type: "settings.update", settings: { locale: "en" } });
  await shell
    .locator(".sidebar")
    .getByRole("button", { name: "Privacy", exact: true })
    .click();
  await expect(
    shell.getByRole("heading", {
      name: "RAIN SHIELD",
      exact: true,
    }),
  ).toBeVisible();
  expect((await activeTab(shell)).url).toBe("raincode://privacy");
  expect((await state(shell)).tor?.status).toBe("stopped");
  await expect(
    shell.getByRole("tablist", { name: "Rain Shield" }).getByRole("tab"),
  ).toHaveCount(8);
  await shell.getByRole("tab", { name: "Diagnostics", exact: true }).click();
  const proof = shell.getByRole("region", {
    name: "Privacy Proof Center",
    exact: true,
  });
  await proof
    .getByRole("button", { name: "Check local configuration", exact: true })
    .click();
  await expect(proof).toContainText("Sandbox: Passed");
  await expect(proof).toContainText("DNS: Not Tested");
  await expect(
    proof.getByRole("button", { name: "Export diagnostics JSON", exact: true }),
  ).toBeEnabled();
  await shell
    .getByRole("tab", { name: "Advanced settings", exact: true })
    .click();
  await expect(
    shell.getByRole("tab", { name: "Advanced settings", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    shell.locator('[data-privacy-section="security"]'),
  ).toBeVisible();
  await shell.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(
    shell.getByRole("tab", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  for (const [label, key] of [
    ["Network and Tor", "tor"],
    ["Advanced settings", "security"],
    ["Isolation and identities", "network"],
    ["Network and Tor", "dns"],
  ]) {
    await shell.getByRole("tab", { name: label, exact: true }).click();
    await expect(
      shell.locator(`[data-privacy-section="${key}"]`),
    ).toBeVisible();
    expect((await activeTab(shell)).url).toBe("raincode://privacy");
  }
  expect((await state(shell)).tor?.status).toBe("stopped");
  const dns = shell.locator('[data-privacy-section="dns"]');
  await dns.getByRole("combobox").selectOption("secure");
  await dns.getByRole("textbox").fill("http://127.0.0.1/not-secure");
  await dns.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dns.getByRole("status")).not.toBeEmpty();
  expect((await state(shell)).settings.dnsMode).toBe("system");
  await shell
    .getByRole("tab", {
      name: "Tracking protection",
      exact: true,
    })
    .click();
  const protection = shell.locator('[data-privacy-section="protection"]');
  await protection.getByRole("button", { name: "Strict", exact: true }).click();
  await shell
    .getByRole("tab", {
      name: "Diagnostics",
      exact: true,
    })
    .click();
  await shell
    .getByRole("switch", { name: "Browsing history", exact: true })
    .uncheck();
  await shell
    .getByRole("tab", { name: "Tracking protection", exact: true })
    .click();
  await expect(
    protection.getByRole("button", { name: "Strict", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect((await state(shell)).settings.privacy.level).toBe("standard");
  await shell.screenshot({ path: "artifacts/privacy-hub.png" });
  // Legacy bookmarks remain functional; no route or component is removed.
  for (const route of ["security", "tor", "network", "settings"]) {
    await command(shell, { type: "navigate", url: `raincode://${route}` });
    expect((await activeTab(shell)).url).toBe(`raincode://${route}`);
    if (route !== "settings") {
      await expect(
        shell.getByRole("heading", {
          name: "RAIN SHIELD",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        shell.locator(`[data-privacy-section="${route}"]`),
      ).toBeVisible();
    } else {
      await expect(
        shell.getByRole("region", { name: "Privacy protection", exact: true }),
      ).toHaveCount(0);
      await expect(
        shell.getByRole("heading", { name: "DNS", exact: true }),
      ).toHaveCount(0);
      await expect(
        shell.getByRole("switch", {
          name: "Restore previous session",
          exact: true,
        }),
      ).toHaveCount(0);
    }
  }
  await shell
    .locator(".sidebar")
    .getByRole("button", { name: "Privacy", exact: true })
    .click();
  await shell
    .getByRole("tab", {
      name: "Data and private sessions",
      exact: true,
    })
    .click();
  const sites = shell.locator('[data-privacy-section="sites"]');
  await expect(
    sites.getByRole("switch", {
      name: "Restore previous session",
      exact: true,
    }),
  ).toBeVisible();
  await sites
    .getByRole("switch", { name: "Restore previous session", exact: true })
    .uncheck();
  await command(shell, { type: "navigate", url: "raincode://privacy#ai" });
  const ai = shell.locator('[data-privacy-section="ai"]');
  await expect(ai).toBeVisible();
  await ai
    .getByRole("switch", { name: "Permit cloud AI providers", exact: true })
    .uncheck();
  await ai
    .getByRole("switch", { name: "Enable AI integrations", exact: true })
    .uncheck();
  await app.close();
  const restarted = await launchBrowser(userData);
  try {
    expect((await state(restarted.shell)).settings).toMatchObject({
      restoreSession: false,
      aiEnabled: false,
      aiCloudEnabled: false,
    });
  } finally {
    await restarted.app.close();
  }
});
