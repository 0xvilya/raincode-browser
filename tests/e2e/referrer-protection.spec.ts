import http from "node:http";
import { once } from "node:events";
import { command, expect, open, pageContentsId, test } from "./fixtures";
test("strict removes a real cross-origin page referrer with a standard positive control", async ({
  rainBrowser: { app, shell },
}) => {
  const a = http.createServer((_q, r) =>
    r.end("<!doctype html><title>Source</title>"),
  );
  const refs: (string | undefined)[] = [];
  const b = http.createServer((q, r) => {
    refs.push(q.headers.referer);
    r.setHeader("Access-Control-Allow-Origin", "*");
    r.end("ok");
  });
  a.listen(0, "127.0.0.1");
  b.listen(0, "127.0.0.1");
  await Promise.all([once(a, "listening"), once(b, "listening")]);
  try {
    const aa = a.address(),
      ba = b.address();
    if (!aa || !ba || typeof aa === "string" || typeof ba === "string")
      throw Error("port");
    const source = `http://127.0.0.1:${aa.port}/source?private=owned-marker`,
      target = `http://127.0.0.1:${ba.port}/sink`;
    const probe = async () => {
      await open(shell, source);
      const id = await pageContentsId(app, source);
      await app.evaluate(
        ({ webContents }, { id, target }) =>
          webContents
            .fromId(id)!
            .executeJavaScript(
              `fetch(${JSON.stringify(target)},{referrerPolicy:'unsafe-url'}).then(r=>r.text())`,
            ),
        { id, target },
      );
    };
    await probe();
    expect(refs.at(-1)).toContain("owned-marker");
    await command(shell, {
      type: "settings.update",
      settings: { privacy: { level: "strict", siteOverrides: [] } },
    });
    await probe();
    expect(refs.at(-1)).toBeUndefined();
  } finally {
    a.closeAllConnections();
    b.closeAllConnections();
    await Promise.all([
      new Promise<void>((r) => a.close(() => r())),
      new Promise<void>((r) => b.close(() => r())),
    ]);
  }
});
