import http from "node:http";
import { once } from "node:events";
import { command, expect, open, test } from "./fixtures";
test("form offers password save and explicit autofill without exposing IPC to page", async ({
  rainBrowser: { app, shell },
}) => {
  const server = http.createServer((_q, r) =>
    r.end(
      '<!doctype html><form onsubmit="event.preventDefault()"><input name="username" autocomplete="username"><input type="password" name="password"><button>Sign in</button></form>',
    ),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const addr = server.address();
    if (!addr || typeof addr === "string") throw Error("port");
    const url = `http://127.0.0.1:${addr.port}/`;
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({
        response: 1,
        checkboxChecked: false,
      })) as typeof dialog.showMessageBox;
    });
    await open(shell, url);
    const page = app.windows().find((p) => p.url().startsWith(url));
    expect(page).toBeTruthy();
    await page!.locator('input[name="username"]').fill("form-user");
    await page!.locator('input[type="password"]').fill("form-secret");
    await page!.evaluate(() =>
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect((await command(shell, { type: "vault.list" })).data).toEqual([]);
    await page!.getByRole("button", { name: "Sign in" }).click();
    await expect
      .poll(async () =>
        JSON.stringify((await command(shell, { type: "vault.list" })).data),
      )
      .toContain("form-user");
    await page!.reload();
    await app.evaluate(({dialog}) => {
      dialog.showMessageBox = (async () => ({response:0,checkboxChecked:false})) as typeof dialog.showMessageBox;
    });
    await page!.locator('input[type="password"]').click();
    await expect(page!.locator('input[type="password"]')).toHaveValue("");
    await app.evaluate(({dialog}) => {
      dialog.showMessageBox = (async () => ({response:1,checkboxChecked:false})) as typeof dialog.showMessageBox;
    });
    await page!.locator('input[name="username"]').click();
    await page!.locator('input[type="password"]').click();
    await expect(page!.locator('input[name="username"]')).toHaveValue(
      "form-user",
    );
    await expect(page!.locator('input[type="password"]')).toHaveValue(
      "form-secret",
    );
    expect(
      await page!.evaluate(
        () => typeof (window as unknown as { raincode?: unknown }).raincode,
      ),
    ).toBe("undefined");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
