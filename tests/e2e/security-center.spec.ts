import http from "node:http";
import { once } from "node:events";
import path from "node:path";
import {
  command,
  expect,
  launchBrowser,
  open,
  pageContentsId,
  state,
  test,
} from "./fixtures";

test("Security Center applies scoped deny/once/ask and exposes measured configuration without AI access", async ({
  rainBrowser: { app, shell, userData },
}) => {
  const server = http.createServer((_request, response) =>
    response.end(
      "<!doctype html><title>Permission fixture</title><h1>Permissions</h1>",
    ),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  try {
    await app.evaluate(({ dialog }) => {
      (
        globalThis as typeof globalThis & { __permissionPrompts: number }
      ).__permissionPrompts = 0;
      dialog.showMessageBox = (async () => {
        (globalThis as typeof globalThis & { __permissionPrompts: number })
          .__permissionPrompts++;
        return { response: 0, checkboxChecked: false };
      }) as typeof dialog.showMessageBox;
    });
    await open(shell, `${origin}/`);
    const a = (await state(shell)).activeTabId;
    const aId = await pageContentsId(app, `${origin}/`);
    await command(shell, {
      type: "permission.set",
      profileId: "default",
      origin,
      permission: "notifications",
      decision: "deny",
    });
    await expect
      .poll(
        async () =>
          (await state(shell)).tabs.find((tab) => tab.id === a)?.loading,
      )
      .toBe(false);
    const ask = (id: number) =>
      app.evaluate(
        async ({ webContents }, id) =>
          webContents
            .fromId(id)!
            .executeJavaScript("Notification.requestPermission()"),
        id,
      );
    expect(await ask(aId)).toBe("denied");
    expect(await ask(aId)).toBe("denied");
    expect(
      await app.evaluate(
        () =>
          (globalThis as typeof globalThis & { __permissionPrompts: number })
            .__permissionPrompts,
      ),
    ).toBe(0);
    const created = await command(shell, {
      type: "profile.create",
      name: "Private scope",
      mode: "private",
    });
    const privateId = created.data as string;
    await command(shell, {
      type: "tab.create",
      profileId: privateId,
      url: `${origin}/other`,
    });
    await expect
      .poll(async () => {
        const current = await state(shell);
        return current.tabs.find((tab) => tab.id === current.activeTabId)
          ?.loading;
      })
      .toBe(false);
    const b = (await state(shell)).activeTabId;
    const bId = await pageContentsId(app, `${origin}/other`);
    await command(shell, {
      type: "permission.set",
      profileId: privateId,
      origin,
      permission: "notifications",
      decision: "once",
      tabId: b,
    });
    expect(await ask(bId)).toBe("granted");
    await command(shell, {
      type: "permission.revoke",
      profileId: "default",
      origin,
      permission: "notifications",
    });
    const audit = (await command(shell, { type: "security.audit" }))
      .data as import("../../src/shared/security-center").SecurityAudit;
    expect(audit.once).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tabId: b,
          profileId: privateId,
          permission: "notifications",
        }),
      ]),
    );
    expect(audit.preferenceSource).toBe("creation-options");
    expect(audit.profileIsolation).toBe(true);
    expect(audit.ai).toBe("not-connected-no-context-access");
    expect(
      audit.pages.every(
        (page) =>
          page.sandbox &&
          page.contextIsolation &&
          page.webSecurity &&
          !page.nodeIntegration,
      ),
    ).toBe(true);
    expect(Object.values(audit.unsafeFlags).some(Boolean)).toBe(false);
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en" },
    });
    await command(shell, {
      type: "tab.create",
      profileId: "default",
      url: "raincode://security",
    });
    const panel = shell.getByRole("region", {
      name: "Security Center",
      exact: true,
    });
    await expect(
      panel.getByRole("heading", { name: "Security Center", exact: true }),
    ).toBeVisible();
    await panel.getByLabel("Site origin", { exact: true }).fill(origin);
    await panel
      .getByLabel("Notifications", { exact: true })
      .selectOption("deny");
    await expect
      .poll(
        async () =>
          (await state(shell)).permissions.find(
            (item) => item.origin === origin && item.profileId === "default",
          )?.allowed,
      )
      .toBe(false);
    const stored = (await state(shell)).permissions.find(
      (item) => item.origin === origin && item.profileId === "default",
    );
    expect(stored?.updatedAt).toBeGreaterThan(0);
    await expect(panel.getByText(/No AI provider is configured/)).toBeVisible();
    await shell.locator("main.page").evaluate((element) => {
      element.scrollTop = 0;
    });
    await shell.screenshot({
      path: path.resolve("artifacts/security-center.png"),
    });
    await app.close();
    const restored = await launchBrowser(userData);
    try {
      expect((await state(restored.shell)).permissions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            origin,
            profileId: "default",
            allowed: false,
            updatedAt: stored!.updatedAt,
          }),
        ]),
      );
    } finally {
      await restored.app.close();
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
