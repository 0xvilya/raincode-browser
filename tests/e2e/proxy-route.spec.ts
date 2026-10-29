import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import {
  activeTab,
  command,
  expect,
  launchBrowser,
  pageContentsId,
  state,
  test,
} from "./fixtures";

test("shield proxy change preserves storage, rejects active tabs, and persists fail-closed recovery", async ({
  rainBrowser: { app, shell, userData },
}) => {
  let directHits = 0;
  const origin = http.createServer((_request, response) => {
    directHits++;
    response.end("DIRECT");
  });
  const routes: string[][] = [[], []];
  const proxies = routes.map((seen, index) =>
    http.createServer((request, response) => {
      seen.push(request.url || "");
      response.setHeader("Content-Type", "text/html");
      response.setHeader("Cache-Control", "no-store");
      response.end(
        `<!doctype html><title>Route ${index}</title><input id="draft">`,
      );
    }),
  );
  const servers = [origin, ...proxies];
  for (const server of servers) server.listen(0, "127.0.0.1");
  await Promise.all(servers.map((server) => once(server, "listening")));
  const port = (server: http.Server) => (server.address() as AddressInfo).port;
  const target = `http://127.0.0.1:${port(origin)}`;
  const proxyPorts = proxies.map(port);
  const config = (index: number) => ({
    scheme: "http" as const,
    host: "127.0.0.1",
    port: proxyPorts[index],
    bypassLocal: false,
  });
  try {
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en" },
    });
    const id = (
      await command(shell, {
        type: "profile.create",
        name: "Route test",
        mode: "proxy",
        proxy: config(0),
      })
    ).data as string;
    await command(shell, {
      type: "proxy.credentials.set",
      profileId: id,
      username: "old-route-user",
      password: "old-route-secret",
    });
    await command(shell, {
      type: "tab.create",
      profileId: id,
      url: `${target}/before`,
    });
    await expect
      .poll(async () => (await activeTab(shell)).title)
      .toBe("Route 0");
    const nativeId = await pageContentsId(app, `${target}/before`);
    await app.evaluate(async ({ webContents }, nativeId) => {
      await webContents
        .fromId(nativeId)!
        .executeJavaScript(
          "localStorage.setItem('retained','yes'); document.cookie='retained=yes; SameSite=Lax'; document.querySelector('#draft').value='unsaved';",
        );
    }, nativeId);
    const busy = await shell.evaluate(
      (payload) => window.raincode.command(payload),
      { type: "proxy.update" as const, profileId: id, proxy: config(1) },
    );
    expect(busy).toMatchObject({
      ok: false,
      error: expect.stringContaining("close this profile's web tabs"),
    });
    expect(
      await app.evaluate(
        ({ webContents }, id) =>
          webContents
            .fromId(id)!
            .executeJavaScript("document.querySelector('#draft').value"),
        nativeId,
      ),
    ).toBe("unsaved");
    await command(shell, {
      type: "tab.close",
      id: (await activeTab(shell)).id,
    });
    await command(shell, { type: "navigate", url: "raincode://privacy" });
    await shell
      .getByRole("tab", { name: "Isolation and identities", exact: true })
      .click();
    await shell.getByText("Change proxy · Route test", { exact: true }).click();
    await shell
      .getByLabel("Proxy port", { exact: true })
      .fill(String(port(proxies[1])));
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 0,
        checkboxChecked: false,
      });
    });
    await shell
      .getByRole("button", { name: "Apply proxy", exact: true })
      .click();
    await expect(
      shell.getByText("Change canceled", { exact: true }),
    ).toBeVisible();
    expect(
      (await state(shell)).profiles.find((profile) => profile.id === id)?.proxy
        ?.port,
    ).toBe(port(proxies[0]));
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    await shell
      .getByRole("button", { name: "Apply proxy", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await state(shell)).profiles.find((profile) => profile.id === id)
            ?.proxy?.port,
      )
      .toBe(port(proxies[1]));
    expect(
      (await state(shell)).profiles.find((profile) => profile.id === id)
        ?.hasCredentials,
    ).toBe(false);
    await expect(
      shell.getByText(
        "Proxy configuration applied — reachability has not been tested",
        { exact: true },
      ),
    ).toBeVisible();
    await shell.screenshot({
      path: "artifacts/shield-proxy-configuration.png",
    });
    await command(shell, {
      type: "tab.create",
      profileId: id,
      url: `${target}/after`,
    });
    await expect
      .poll(async () => (await activeTab(shell)).title)
      .toBe("Route 1");
    expect(routes[0]).not.toContain(`${target}/after`);
    expect(routes[1]).toContain(`${target}/after`);
    const secondId = await pageContentsId(app, `${target}/after`);
    expect(
      await app.evaluate(
        ({ webContents }, nativeId) =>
          webContents
            .fromId(nativeId)!
            .executeJavaScript(
              "[localStorage.getItem('retained'),document.cookie]",
            ),
        secondId,
      ),
    ).toEqual(["yes", "retained=yes"]);
    await command(shell, {
      type: "tab.close",
      id: (await activeTab(shell)).id,
    });
    // Inject a native configuration failure, not a failed connectivity probe.
    await app.evaluate(({ session }, id) => {
      const current = session.fromPartition(`persist:raincode-${id}`);
      current.setProxy = async () => {
        throw new Error("controlled setProxy failure");
      };
    }, id);
    const failed = await shell.evaluate(
      (payload) => window.raincode.command(payload),
      { type: "proxy.update" as const, profileId: id, proxy: config(0) },
    );
    expect(failed).toMatchObject({
      ok: false,
      error: expect.stringContaining("network is blocked"),
    });
    expect(
      (await state(shell)).profiles.find((profile) => profile.id === id)
        ?.proxyBlocked,
    ).toBe(true);
    await app.close();
    const restarted = await launchBrowser(userData);
    try {
      expect(
        (await state(restarted.shell)).profiles.find(
          (profile) => profile.id === id,
        )?.proxyBlocked,
      ).toBe(true);
      const counts = routes.map((route) => route.length);
      await command(restarted.shell, {
        type: "tab.create",
        profileId: id,
        url: `${target}/must-block`,
      });
      await expect
        .poll(async () => (await activeTab(restarted.shell)).loading)
        .toBe(false);
      await command(restarted.shell, {
        type: "settings.update",
        settings: { networkKillSwitch: true },
      });
      await command(restarted.shell, {
        type: "settings.update",
        settings: { networkKillSwitch: false },
      });
      const blocked = await restarted.app.evaluate(
        async ({ session }, options) => {
          try {
            await session
              .fromPartition(`persist:raincode-${options.id}`)
              .fetch(`${options.target}/native-blocked`);
            return false;
          } catch {
            return true;
          }
        },
        { id, target },
      );
      expect(blocked).toBe(true);
      expect(routes.map((route) => route.length)).toEqual(counts);
      await command(restarted.shell, {
        type: "tab.close",
        id: (await activeTab(restarted.shell)).id,
      });
      await restarted.app.evaluate(({ dialog }) => {
        dialog.showMessageBox = async () => ({
          response: 1,
          checkboxChecked: false,
        });
      });
      await command(restarted.shell, {
        type: "proxy.update",
        profileId: id,
        proxy: config(0),
      });
      await command(restarted.shell, {
        type: "tab.create",
        profileId: id,
        url: `${target}/recovered`,
      });
      await expect
        .poll(async () => (await activeTab(restarted.shell)).title)
        .toBe("Route 0");
      expect(directHits).toBe(0);
      expect(routes[0]).toContain(`${target}/recovered`);
      proxies[0].closeAllConnections();
      await new Promise<void>((resolve) => proxies[0].close(() => resolve()));
      await command(restarted.shell, {
        type: "navigate",
        url: `${target}/dead-proxy`,
      });
      await expect
        .poll(async () => (await activeTab(restarted.shell)).loading)
        .toBe(false);
      expect((await activeTab(restarted.shell)).error).toBeTruthy();
      expect(directHits).toBe(0);
      // Recovery must not depend on successfully applying a broken OLD route
      // when this profile has not initialized its native session yet.
      const dormant = (
        await command(restarted.shell, {
          type: "profile.create",
          name: "Dormant route recovery",
          mode: "proxy",
          proxy: config(0),
        })
      ).data as string;
      await restarted.app.evaluate(
        ({ session }, options) => {
          const current = session.fromPartition(
            `persist:raincode-${options.id}`,
          );
          const original = current.setProxy.bind(current);
          current.setProxy = async (config) => {
            if (config.proxyRules === `http://127.0.0.1:${options.oldPort}`)
              throw new Error("owned old route configuration failure");
            return original(config);
          };
        },
        { id: dormant, oldPort: proxyPorts[0] },
      );
      await command(restarted.shell, {
        type: "proxy.update",
        profileId: dormant,
        proxy: config(1),
      });
      await command(restarted.shell, {
        type: "tab.create",
        profileId: dormant,
        url: `${target}/dormant-recovered`,
      });
      await expect
        .poll(async () => (await activeTab(restarted.shell)).title)
        .toBe("Route 1");
      expect(directHits).toBe(0);
    } finally {
      await restarted.app.close();
    }
  } finally {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});
