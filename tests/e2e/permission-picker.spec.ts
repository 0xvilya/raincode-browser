import http from "node:http";
import { once } from "node:events";
import { activeTab, command, expect, state, test } from "./fixtures";

test("permission picker discovers websites after opening Shield and saves real per-site decisions", async ({
  rainBrowser: { shell },
}) => {
  const server = http.createServer((_request, response) =>
    response.end(
      "<!doctype html><title>Permission picker fixture</title><h1>Permissions</h1>",
    ),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("port");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en" },
    });
    await command(shell, {
      type: "navigate",
      url: "raincode://privacy#security",
    });
    const shield = (await activeTab(shell)).id;
    const panel = shell.getByRole("region", {
      name: "Security Center",
      exact: true,
    });
    await expect(
      panel.getByLabel("Notifications", { exact: true }),
    ).toBeDisabled();
    await command(shell, { type: "tab.create", url: origin + "/" });
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    await command(shell, { type: "tab.activate", id: shield });
    await expect(panel.getByLabel("Site origin", { exact: true })).toHaveValue(
      origin,
    );
    const picker = panel.getByLabel("Choose website", { exact: true });
    await expect(picker).toBeEnabled();
    await panel.getByLabel("Site origin", { exact: true }).fill("");
    await expect(
      panel.getByLabel("Notifications", { exact: true }),
    ).toBeDisabled();
    await picker.selectOption(origin);
    await expect(
      panel.getByLabel("Notifications", { exact: true }),
    ).toBeEnabled();
    await panel
      .getByLabel("Notifications", { exact: true })
      .selectOption("deny");
    await expect
      .poll(
        async () =>
          (await state(shell)).permissions.find(
            (p) =>
              p.profileId === "default" &&
              p.origin === origin &&
              p.permission === "notifications",
          )?.allowed,
      )
      .toBe(false);
    await expect(
      panel
        .getByRole("status")
        .filter({ hasText: "Permission saved for the selected site" }),
    ).toBeVisible();
    await panel
      .getByLabel("Notifications", { exact: true })
      .selectOption("ask");
    await expect
      .poll(async () =>
        (await state(shell)).permissions.some(
          (p) =>
            p.profileId === "default" &&
            p.origin === origin &&
            p.permission === "notifications",
        ),
      )
      .toBe(false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

