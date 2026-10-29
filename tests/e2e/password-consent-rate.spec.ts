import http from "node:http";
import { once } from "node:events";
import { command, expect, open, test } from "./fixtures";

test("one form activation cannot queue repeated native password consent prompts", async ({
  rainBrowser: { app, shell },
}) => {
  const server = http.createServer((_request, response) =>
    response.end(
      '<!doctype html><form onsubmit="event.preventDefault()"><input autocomplete="username" value="owned-user"><input type="password" value="owned-password"><button>Sign in</button></form>',
    ),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Port");
  const url = `http://127.0.0.1:${address.port}/`;
  try {
    await app.evaluate(({ dialog }) => {
      const audit = globalThis as typeof globalThis & {
        passwordPromptCount: number;
        releasePasswordPrompt?: () => void;
      };
      audit.passwordPromptCount = 0;
      dialog.showMessageBox = (() => {
        audit.passwordPromptCount++;
        return new Promise<{ response: number; checkboxChecked: boolean }>(
          (resolve) => {
            audit.releasePasswordPrompt = () =>
              resolve({ response: 0, checkboxChecked: false });
          },
        );
      }) as typeof dialog.showMessageBox;
    });
    await open(shell, url);
    const page = app.windows().find((item) => item.url() === url);
    if (!page) throw new Error("Owned page unavailable");
    await page.locator("form").waitFor();
    // Playwright's evaluation supplies a transient activation. The three
    // requests deliberately occur in that same activation; no no-gesture
    // bypass or protection is inferred from this test.
    await page.evaluate(() => {
      const form = document.querySelector("form")!;
      for (let index = 0; index < 3; index++) form.requestSubmit();
    });
    await expect
      .poll(() =>
        app.evaluate(
          () =>
            (globalThis as typeof globalThis & { passwordPromptCount: number })
              .passwordPromptCount,
        ),
      )
      .toBe(1);
    // The first consent remains held while a further scripted submission is
    // delivered, ensuring the in-flight guard, not a quick dialog response,
    // limits collection and prompts.
    await page.evaluate(() => document.querySelector("form")!.requestSubmit());
    expect(
      await app.evaluate(
        () =>
          (globalThis as typeof globalThis & { passwordPromptCount: number })
            .passwordPromptCount,
      ),
    ).toBe(1);
    await app.evaluate(() =>
      (
        globalThis as typeof globalThis & { releasePasswordPrompt?: () => void }
      ).releasePasswordPrompt?.(),
    );
    expect((await command(shell, { type: "vault.list" })).data).toEqual([]);
    expect(
      await app.evaluate(
        () =>
          (globalThis as typeof globalThis & { passwordPromptCount: number })
            .passwordPromptCount,
      ),
    ).toBe(1);
  } finally {
    await app
      .evaluate(() =>
        (
          globalThis as typeof globalThis & {
            releasePasswordPrompt?: () => void;
          }
        ).releasePasswordPrompt?.(),
      )
      .catch(() => undefined);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
