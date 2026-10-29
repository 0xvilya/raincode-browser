import http from "node:http";
import { once } from "node:events";
import { command, expect, open, pageContentsId, state, test } from "./fixtures";
test("WebGL protection is native, preserves Canvas2D, and can be reversed", async ({
  rainBrowser: { app, shell },
}) => {
  const server = http.createServer((_q, r) =>
    r.end("<!doctype html><title>Graphics fixture</title>"),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const addr = server.address();
    if (!addr || typeof addr === "string") throw Error("port");
    const url = `http://127.0.0.1:${addr.port}/`;
    await open(shell, url);
    const baselineId = await pageContentsId(app, url);
    const baseline = await app.evaluate(
      ({ webContents }, id) =>
        webContents
          .fromId(id)!
          .executeJavaScript(
            "!!document.createElement('canvas').getContext('webgl')",
          ),
      baselineId,
    );
    await command(shell, {
      type: "navigate",
      url: "raincode://privacy#protection",
    });
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en" },
    });
    await shell
      .getByRole("switch", { name: "Block WebGL", exact: true })
      .check();
    await shell
      .getByRole("button", { name: "Apply protection", exact: true })
      .click();
    await expect
      .poll(async () => (await state(shell)).settings.privacy.blockWebGL)
      .toBe(true);
    await open(shell, url);
    let id = await pageContentsId(app, url);
    const inspect = (id: number) =>
      app.evaluate(async ({ webContents }, id) => {
        const wc = webContents.fromId(id)!;
        return {
          result: await wc.executeJavaScript(
            `({gl:!!document.createElement('canvas').getContext('webgl'),gl2:!!document.createElement('canvas').getContext('webgl2'),two:!!document.createElement('canvas').getContext('2d')})`,
          ),
        };
      }, id);
    expect(await inspect(id)).toEqual({
      result: { gl: false, gl2: false, two: true },
    });
    const privacy = (await state(shell)).settings.privacy;
    await command(shell, {
      type: "settings.update",
      settings: { privacy: { ...privacy, blockWebGL: false } },
    });
    await command(shell, { type: "action", action: "reload" });
    await expect
      .poll(async () => (await state(shell)).tabs.some((t) => t.loading))
      .toBe(false);
    id = await pageContentsId(app, url);
    expect((await inspect(id)).result.two).toBe(true);
    expect((await inspect(id)).result.gl).toBe(baseline);
    if (!baseline)
      test.info().annotations.push({
        type: "limitation",
        description:
          "Baseline environment had no WebGL; runtime restoration lacks a positive GPU control",
      });
    expect((await state(shell)).settings.privacy.blockWebGL).toBe(false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
