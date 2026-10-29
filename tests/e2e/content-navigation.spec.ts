import http from "node:http";
import { once } from "node:events";
import { fixtureOnion } from "../tor/fixture-onion";
import {
  activeTab,
  command,
  expect,
  pageContentsId,
  state,
  test,
} from "./fixtures";

test("branded 404 and connection errors hide the native blank view and preserve original response", async ({
  rainBrowser: { app, shell },
}) => {
  const origin = http.createServer((request, response) => {
    response.writeHead(request.url === "/missing" ? 404 : 200, {
      "Content-Type": "text/html;charset=utf-8",
    });
    response.end(
      "<!doctype html><title>Owned response</title><h1>Actual site response</h1>",
    );
  });
  origin.listen(0, "127.0.0.1");
  await once(origin, "listening");
  const address = origin.address();
  if (!address || typeof address === "string") throw new Error("port");
  const url = `http://127.0.0.1:${address.port}`;
  try {
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en" },
    });
    await command(shell, { type: "navigate", url: `${url}/missing` });
    await expect(
      shell.getByRole("heading", { name: "Page not found", exact: true }),
    ).toBeVisible();
    expect((await activeTab(shell)).notice).toBe("not-found");
    const contentsId = await pageContentsId(app, `${url}/missing`);
    const visible = () =>
      app.evaluate(
        ({ BrowserWindow }, id) =>
          BrowserWindow.getAllWindows()
            .flatMap((w) => w.contentView.children)
            .some(
              (v) =>
                "webContents" in v &&
                (v.webContents as Electron.WebContents).id === id &&
                v.getVisible(),
            ),
        contentsId,
      );
    expect(await visible()).toBe(false);
    await shell
      .getByRole("button", { name: "View original response", exact: true })
      .click();
    await expect.poll(visible).toBe(true);
    expect(
      await app.evaluate(
        ({ webContents }, id) =>
          webContents
            .fromId(id)!
            .executeJavaScript("document.querySelector('h1').textContent"),
        contentsId,
      ),
    ).toBe("Actual site response");
    await command(shell, { type: "navigate", url: `${url}/ok` });
    await expect
      .poll(async () => (await activeTab(shell)).error || "")
      .toBe("");
    await origin.closeAllConnections();
    await new Promise<void>((resolve) => origin.close(() => resolve()));
    await command(shell, { type: "navigate", url: `${url}/offline` });
    await expect(
      shell.getByRole("heading", {
        name: "Could not open this page",
        exact: true,
      }),
    ).toBeVisible();
    expect((await activeTab(shell)).notice).toBeUndefined();
    await command(shell, { type: "navigate", url: "raincode://newtab" });
    const input = shell.locator(".home-search input");
    await input.fill("facebook.onion");
    await input.press("Enter");
    await expect(
      shell.getByRole("dialog", { name: "Check this address" }),
    ).toBeVisible();
    await shell.keyboard.press("Escape");
    await expect(
      shell.getByRole("dialog", { name: "Check this address" }),
    ).not.toBeVisible();
    expect((await activeTab(shell)).url).toBe("raincode://newtab");
  } finally {
    origin.closeAllConnections();
    if (origin.listening)
      await new Promise<void>((resolve) => origin.close(() => resolve()));
  }
});

test("local ad protection removes DDG promotions, blocks ad requests and preserves organic/empty results", async ({
  rainBrowser: { app, shell },
}) => {
  const received: string[] = [];
  const proxy = http.createServer((request, response) => {
    received.push(request.url || "");
    response.writeHead(200, {
      "Content-Type": "text/html;charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    const empty = request.url?.includes("q=owned-empty");
    response.end(`<!doctype html><title>Owned DDG markup fixture</title>
      <aside data-testid="serp-popover-promo">Download our browser</aside><footer class="footer--text_promo">Footer browser promo</footer>
      <div class="result result--ad">Sponsored result</div>
      ${empty ? '<div class="no-results__message">No results found for this query</div>' : '<div class="result"><a class="result__a" href="https://example.org/actual-organic">Actual organic result</a></div>'}`);
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  if (!address || typeof address === "string") throw new Error("port");
  try {
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en", httpsOnly: false },
    });
    const profileResult = await command(shell, {
      type: "profile.create",
      mode: "proxy",
      name: "Owned ad fixture",
      proxy: {
        scheme: "http",
        host: "127.0.0.1",
        port: address.port,
        bypassLocal: false,
      },
    });
    const profileId = String(profileResult.data);
    const url = "http://html.duckduckgo.com/html/?q=owned-organic";
    await command(shell, { type: "tab.create", url, profileId });
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    const id = await pageContentsId(app, url);
    const inspect = () =>
      app.evaluate(
        ({ webContents }, target) =>
          webContents
            .fromId(target)!
            .executeJavaScript(
              `({promo:getComputedStyle(document.querySelector('[data-testid="serp-popover-promo"]')).display,footer:getComputedStyle(document.querySelector('footer')).display,ad:getComputedStyle(document.querySelector('.result--ad')).display,organic:document.querySelector('.result__a').getAttribute('href')})`,
            ),
        id,
      );
    await expect.poll(inspect).toMatchObject({
      promo: "none",
      footer: "none",
      ad: "none",
      organic: "https://example.org/actual-organic",
    });
    const fetchAd = () =>
      app.evaluate(
        async ({ webContents }, target) =>
          webContents
            .fromId(target)!
            .executeJavaScript(
              `fetch('http://ads.doubleclick.net/owned-ad?secret=never-record').then(()=>true,()=>false)`,
            ),
        id,
      );
    expect(await fetchAd()).toBe(false);
    expect(received.some((u) => u.includes("owned-ad"))).toBe(false);
    const blocked = await command(shell, { type: "privacy.trackers" });
    expect(blocked.data).toMatchObject({
      profileId,
      total: 1,
      records: [
        {
          category: "advertising",
          rule: "doubleclick.net",
          site: "html.duckduckgo.com",
          count: 1,
        },
      ],
    });
    expect(JSON.stringify(blocked.data)).not.toContain("never-record");
    expect(
      await app.evaluate(
        ({ webContents }, id) =>
          webContents
            .fromId(id)!
            .executeJavaScript(
              "fetch('http://a.google-analytics.com/collect').then(()=>true,()=>false)",
            ),
        id,
      ),
    ).toBe(false);
    expect(
      (await command(shell, { type: "privacy.trackers" })).data,
    ).toMatchObject({
      total: 2,
      records: expect.arrayContaining([
        expect.objectContaining({ category: "analytics" }),
      ]),
    });
    await command(shell, {
      type: "settings.update",
      settings: { adBlock: false },
    });
    await expect.poll(async () => (await inspect()).promo).not.toBe("none");
    expect(await fetchAd()).toBe(true);
    expect(received.some((u) => u.includes("owned-ad"))).toBe(true);
    await command(shell, {
      type: "settings.update",
      settings: { adBlock: true },
    });
    await command(shell, {
      type: "navigate",
      url: "http://html.duckduckgo.com/html/?q=owned-empty",
    });
    await expect(
      shell.getByRole("heading", { name: "No results found", exact: true }),
    ).toBeVisible();
    expect((await activeTab(shell)).notice).toBe("empty-search");
    await command(shell, { type: "tab.create", url: "raincode://privacy" });
    await shell
      .getByRole("tab", { name: "Data and private sessions", exact: true })
      .click();
    const panel = shell.getByRole("region", {
      name: "Network protection events",
      exact: true,
    });
    await panel
      .getByRole("button", { name: "Reset counters", exact: true })
      .click();
    await expect(panel.getByRole("status")).toHaveText("Blocked: 0");
    await panel
      .getByLabel("Exception hostname or URL")
      .fill("https://html.duckduckgo.com/owned");
    await panel
      .getByRole("button", { name: "Add exception", exact: true })
      .click();
    await expect
      .poll(async () => (await state(shell)).settings.trackerExceptions)
      .toEqual(["html.duckduckgo.com"]);
    expect(await fetchAd()).toBe(true);
    expect(
      (await command(shell, { type: "privacy.trackers" })).data,
    ).toMatchObject({ total: 0 });
    await panel
      .getByRole("button", { name: "Remove exception", exact: true })
      .click();
    await expect
      .poll(async () => (await state(shell)).settings.trackerExceptions)
      .toEqual([]);
    expect(await fetchAd()).toBe(false);
    expect(
      (await state(shell)).profiles.find((p) => p.id === profileId)?.mode,
    ).toBe("proxy");
  } finally {
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});

test("developer IP diagnostics are explicit and onion links offer isolated Tor without auto-connect", async ({
  rainBrowser: { app, shell },
}) => {
  const onion = fixtureOnion(40);
  const server = http.createServer((_req, res) =>
    res.end(
      `<!doctype html><title>Owned diagnostics</title><a id="same" href="http://${onion}/">Onion link</a><a id="popup" target="_blank" href="http://${onion}/popup">Onion new tab</a>`,
    ),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("port");
  const url = `http://127.0.0.1:${address.port}/`;
  try {
    await command(shell, {
      type: "settings.update",
      settings: { locale: "en" },
    });
    await command(shell, { type: "navigate", url });
    await expect.poll(async () => (await activeTab(shell)).loading).toBe(false);
    const tab = await activeTab(shell),
      id = await pageContentsId(app, url);
    expect(
      (
        await command(shell, {
          type: "dev.diagnostics",
          tabId: tab.id,
          registration: true,
        })
      ).data,
    ).toMatchObject({
      status: "resolved",
      addresses: ["127.0.0.1"],
      registrationStatus: "private-address",
    });
    await command(shell, { type: "tab.create", url: "raincode://devpanel" });
    const panel = shell.getByRole("region", {
      name: "Site IP and network",
      exact: true,
    });
    await panel
      .getByRole("button", { name: "Resolve IP", exact: true })
      .click();
    await expect(panel).toContainText("127.0.0.1");
    await command(shell, { type: "tab.activate", id: tab.id });
    await app.evaluate(({ dialog }) => {
      Object.assign(globalThis, { ownedTorPrompts: 0 });
      dialog.showMessageBox = async (
        windowOrOptions: Electron.BaseWindow | Electron.MessageBoxOptions,
        explicit?: Electron.MessageBoxOptions,
      ) => {
        const options =
          explicit || (windowOrOptions as Electron.MessageBoxOptions);
        if (options?.title !== "Tor" || options.defaultId !== 0)
          throw new Error("Missing explicit Tor consent");
        const global = globalThis as unknown as { ownedTorPrompts: number };
        global.ownedTorPrompts++;
        return { response: 0, checkboxChecked: false };
      };
    });
    for (const selector of ["same", "popup"]) {
      await app.evaluate(
        ({ webContents }, args) =>
          webContents
            .fromId(args.id)!
            .executeJavaScript(
              `document.getElementById('${args.selector}').click()`,
            ),
        { id, selector },
      );
      await expect
        .poll(() =>
          app.evaluate(
            () =>
              (globalThis as unknown as { ownedTorPrompts: number })
                .ownedTorPrompts,
          ),
        )
        .toBe(selector === "same" ? 1 : 2);
    }
    expect((await activeTab(shell)).url).toBe(url);
    expect((await state(shell)).tor?.status).toBe("stopped");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
