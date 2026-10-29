import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import {
  command,
  expect,
  launchBrowser,
  pageContentsId,
  state,
  test,
} from "./fixtures";

test("more than thirty profiles remain isolated, use their own proxy and survive restart", async ({
  rainBrowser: { app, shell, userData },
}) => {
  const requests: string[][] = [[], []];
  const proxies = requests.map((seen, index) =>
    http.createServer((request, response) => {
      seen.push(request.url || "");
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader(
        "Set-Cookie",
        `profile_session=${index + 1}; Path=/; SameSite=Lax`,
      );
      response.end(
        `<!doctype html><title>Proxy ${index + 1}</title><h1>Owned proxy fixture</h1>`,
      );
    }),
  );
  for (const proxy of proxies) proxy.listen(0, "127.0.0.1");
  await Promise.all(proxies.map((proxy) => once(proxy, "listening")));
  try {
    // Count real session creation calls in the test-owned Electron instance.
    await app.evaluate(({ session }) => {
      const original = session.fromPartition.bind(session);
      const audit = { calls: 0 };
      (
        globalThis as typeof globalThis & { profileSessionAudit: typeof audit }
      ).profileSessionAudit = audit;
      session.fromPartition = ((
        ...args: Parameters<typeof session.fromPartition>
      ) => {
        if (args[0].startsWith("persist:raincode-")) audit.calls++;
        return original(...args);
      }) as typeof session.fromPartition;
    });
    for (let i = 0; i < 32; i++)
      await command(shell, {
        type: "profile.create",
        mode: "direct",
        name: `Profile ${i + 1}`,
      });
    const ids: string[] = [];
    for (let i = 0; i < proxies.length; i++) {
      const created = await command(shell, {
        type: "profile.create",
        mode: "proxy",
        name: `Proxy ${i + 1}`,
        proxy: {
          scheme: "http",
          host: "127.0.0.1",
          port: (proxies[i].address() as AddressInfo).port,
          bypassLocal: false,
        },
      });
      ids.push(created.data as string);
    }
    expect((await state(shell)).profiles).toHaveLength(35);
    expect(
      await app.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              profileSessionAudit: { calls: number };
            }
          ).profileSessionAudit.calls,
      ),
    ).toBe(0);
    const urls = [
      "http://127.0.0.1:62317/first",
      "http://127.0.0.1:62317/second",
    ];
    for (let i = 0; i < ids.length; i++) {
      await command(shell, {
        type: "tab.create",
        profileId: ids[i],
        url: urls[i],
      });
      await expect
        .poll(
          async () =>
            (await state(shell)).tabs.find((tab) => tab.profileId === ids[i])
              ?.title,
        )
        .toBe(`Proxy ${i + 1}`);
      expect(requests[i]).toContain(urls[i]);
      expect(requests[1 - i]).not.toContain(urls[i]);
    }
    expect(
      await app.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              profileSessionAudit: { calls: number };
            }
          ).profileSessionAudit.calls,
      ),
    ).toBe(2);
    for (let i = 0; i < ids.length; i++) {
      const contentsId = await pageContentsId(app, urls[i]);
      const cookies = await app.evaluate(
        ({ webContents }, args) =>
          webContents.fromId(args.id)!.session.cookies.get({ url: args.url }),
        { id: contentsId, url: urls[i] },
      );
      expect(
        cookies.find((cookie) => cookie.name === "profile_session")?.value,
      ).toBe(String(i + 1));
    }
    await app.close();
    const restarted = await launchBrowser(userData);
    try {
      const restored = await state(restarted.shell);
      expect(restored.profiles).toHaveLength(35);
      for (let i = 0; i < ids.length; i++)
        expect(
          restored.profiles.find((profile) => profile.id === ids[i])?.proxy
            ?.port,
        ).toBe((proxies[i].address() as AddressInfo).port);
    } finally {
      await restarted.app.close();
    }
  } finally {
    for (const proxy of proxies) {
      proxy.closeAllConnections();
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  }
});
