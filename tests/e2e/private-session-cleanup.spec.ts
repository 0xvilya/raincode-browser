import http from "node:http";
import { once } from "node:events";
import {
  activeTab,
  command,
  expect,
  open,
  pageContentsId,
  state,
  test,
} from "./fixtures";

test("last private tab clears its session before reuse while other private tabs and normal storage remain intact", async ({
  rainBrowser: { app, shell },
}) => {
  const server = http.createServer((_request, response) =>
    response.end(
      "<!doctype html><title>Private cleanup fixture</title><h1>Owned fixture</h1>",
    ),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("port");
  const origin = `http://127.0.0.1:${address.port}`;
  const read = (id: number) =>
    app.evaluate(async ({ webContents }, contentsId) => {
      const contents = webContents.fromId(contentsId)!;
      return {
        cookies: (
          await contents.session.cookies.get({ url: contents.getURL() })
        ).map((c) => c.name),
        local: await contents.executeJavaScript(
          'localStorage.getItem("private-marker")',
        ),
      };
    }, id);
  try {
    await open(shell, origin + "/normal");
    const normalId = await pageContentsId(app, origin + "/normal");
    await app.evaluate(async ({ webContents }, id) => {
      const contents = webContents.fromId(id)!;
      await contents.session.cookies.set({
        url: contents.getURL(),
        name: "normal-marker",
        value: "preserved",
      });
    }, normalId);
    const created = await command(shell, {
      type: "profile.create",
      mode: "private",
      name: "Ephemeral fixture",
    });
    const profileId = created.data as string;
    await command(shell, {
      type: "tab.create",
      profileId,
      url: origin + "/first",
    });
    const first = await activeTab(shell);
    const firstId = await pageContentsId(app, origin + "/first");
    await app.evaluate(async ({ webContents }, id) => {
      const contents = webContents.fromId(id)!;
      await contents.session.cookies.set({
        url: contents.getURL(),
        name: "private-cookie",
        value: "secret",
      });
      await contents.executeJavaScript(
        'localStorage.setItem("private-marker","secret")',
      );
    }, firstId);
    await command(shell, {
      type: "tab.create",
      profileId,
      url: origin + "/second",
    });
    const second = await activeTab(shell);
    const secondId = await pageContentsId(app, origin + "/second");
    await command(shell, { type: "tab.close", id: first.id });
    expect(await read(secondId)).toEqual({
      cookies: ["private-cookie"],
      local: "secret",
    });
    await command(shell, { type: "tab.close", id: second.id });
    // Immediate reopen deliberately races the asynchronous cleanup barrier.
    await command(shell, {
      type: "tab.create",
      profileId,
      url: origin + "/fresh",
    });
    const freshId = await pageContentsId(app, origin + "/fresh");
    expect(await read(freshId)).toEqual({ cookies: [], local: null });
    expect((await state(shell)).profiles.some((p) => p.id === profileId)).toBe(
      true,
    );
    expect((await read(normalId)).cookies).toContain("normal-marker");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
