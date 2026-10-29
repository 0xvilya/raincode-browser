import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { command, expect, open, pageContentsId, state, test } from "./fixtures";

test("privacy levels enforce live cross-origin cookies and per-site JavaScript exceptions", async ({
  rainBrowser: { app, shell },
}) => {
  const beacons: string[] = [];
  const cookiesSeen: string[] = [];
  let sourceOrigin = "";
  const source = http.createServer((request, response) => {
    const url = new URL(request.url || "/", sourceOrigin);
    if (url.pathname === "/beacon") {
      beacons.push(url.searchParams.get("phase") || "");
      response.end("ok");
      return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    const phase = url.searchParams.get("phase");
    response.end(
      `<!doctype html><title>Privacy fixture</title><h1>Privacy</h1>${
        phase
          ? `<script>fetch('/beacon?phase=${encodeURIComponent(phase)}')</script>`
          : ""
      }`,
    );
  });
  const destination = http.createServer((request, response) => {
    cookiesSeen.push(request.headers.cookie || "");
    response.setHeader("Access-Control-Allow-Origin", sourceOrigin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader(
      "Set-Cookie",
      `${request.url?.includes("strict") ? "strict_response" : "standard_response"}=1; Path=/; SameSite=Lax`,
    );
    response.end("ok");
  });
  source.listen(0, "127.0.0.1");
  destination.listen(0, "127.0.0.1");
  await Promise.all([
    once(source, "listening"),
    once(destination, "listening"),
  ]);
  sourceOrigin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`;
  const destinationOrigin = `http://127.0.0.1:${(destination.address() as AddressInfo).port}`;
  try {
    await open(shell, `${sourceOrigin}/`);
    let contentsId = await pageContentsId(app, `${sourceOrigin}/`);
    const callDestination = (id: number, path: string) =>
      app.evaluate(
        ({ webContents }, args) =>
          webContents
            .fromId(args.id)!
            .executeJavaScript(
              `fetch(${JSON.stringify(args.url)}, {credentials: 'include'}).then(r => r.text())`,
            ),
        { id, url: `${destinationOrigin}/${path}` },
      );
    const cookieNames = (id: number) =>
      app.evaluate(
        ({ webContents }, args) =>
          webContents
            .fromId(args.id)!
            .session.cookies.get({ url: args.url })
            .then((cookies) => cookies.map((item) => item.name)),
        { id, url: destinationOrigin },
      );
    await app.evaluate(
      ({ webContents }, args) =>
        webContents.fromId(args.id)!.session.cookies.set({
          url: args.url,
          name: "third_seed",
          value: "1",
          sameSite: "lax",
        }),
      { id: contentsId, url: destinationOrigin },
    );
    expect(await callDestination(contentsId, "standard")).toBe("ok");
    expect(cookiesSeen.at(-1)).toContain("third_seed=1");

    await command(shell, {
      type: "settings.update",
      settings: { privacy: { level: "strict", siteOverrides: [] } },
    });
    await open(shell, `${sourceOrigin}/strict`);
    contentsId = await pageContentsId(app, `${sourceOrigin}/strict`);
    expect(await callDestination(contentsId, "strict")).toBe("ok");
    expect(cookiesSeen.at(-1)).not.toContain("third_seed=1");
    // Strict filters the response too; an existing seed cookie may remain,
    // but this new cross-origin response cookie must not enter the jar.
    expect(await cookieNames(contentsId)).not.toContain("strict_response");

    await command(shell, {
      type: "settings.update",
      settings: { privacy: { level: "maximum", siteOverrides: [] } },
    });
    await open(shell, `${sourceOrigin}/js?phase=off`);
    const disabledId = await pageContentsId(
      app,
      `${sourceOrigin}/js?phase=off`,
    );
    const audit = (await command(shell, { type: "security.audit" })).data as {
      pages: { tabId?: string; javascript: boolean }[];
    };
    const active = (await state(shell)).activeTabId;
    expect(audit.pages.find((page) => page.tabId === active)?.javascript).toBe(
      false,
    );
    expect(beacons).not.toContain("off");

    await command(shell, {
      type: "settings.update",
      settings: {
        privacy: {
          level: "maximum",
          siteOverrides: [{ origin: sourceOrigin, javascript: "allow" }],
        },
      },
    });
    await open(shell, `${sourceOrigin}/js?phase=on`);
    const enabledId = await pageContentsId(app, `${sourceOrigin}/js?phase=on`);
    expect(enabledId).not.toBe(disabledId);
    await expect.poll(() => beacons.includes("on")).toBe(true);
    const allowedAudit = (await command(shell, { type: "security.audit" }))
      .data as { pages: { tabId?: string; javascript: boolean }[] };
    expect(
      allowedAudit.pages.find((page) => page.tabId === active)?.javascript,
    ).toBe(true);
  } finally {
    source.closeAllConnections();
    destination.closeAllConnections();
    await Promise.all([
      new Promise<void>((resolve) => source.close(() => resolve())),
      new Promise<void>((resolve) => destination.close(() => resolve())),
    ]);
  }
});

test("changing JavaScript policy during navigation respects beforeunload cancellation", async ({
  rainBrowser: { app, shell },
}) => {
  const a = http.createServer((_req, res) =>
    res.end('<!doctype html><title>Draft</title><input value="saved">'),
  );
  const b = http.createServer((_req, res) =>
    res.end("<!doctype html><title>Restricted</title>Restricted"),
  );
  a.listen(0, "127.0.0.1");
  b.listen(0, "127.0.0.1");
  await Promise.all([once(a, "listening"), once(b, "listening")]);
  const source = `http://127.0.0.1:${(a.address() as AddressInfo).port}`;
  const target = `http://127.0.0.1:${(b.address() as AddressInfo).port}`;
  try {
    await command(shell, {
      type: "settings.update",
      settings: {
        privacy: {
          level: "maximum",
          siteOverrides: [{ origin: source, javascript: "allow" }],
        },
      },
    });
    await open(shell, `${source}/`);
    const id = await pageContentsId(app, `${source}/`);
    await app.evaluate(async ({ webContents, dialog }, id) => {
      dialog.showMessageBoxSync = () => 0;
      const page = webContents.fromId(id)!;
      page.focus();
      page.sendInputEvent({
        type: "mouseDown",
        x: 20,
        y: 20,
        button: "left",
        clickCount: 1,
      });
      page.sendInputEvent({
        type: "mouseUp",
        x: 20,
        y: 20,
        button: "left",
        clickCount: 1,
      });
      await page.executeJavaScript(
        'document.querySelector("input").value="unsaved draft";onbeforeunload=event=>{event.preventDefault();event.returnValue="";};void 0',
        true,
      );
    }, id);
    const result = await shell.evaluate(
      (url) => window.raincode.command({ type: "navigate", url }),
      `${target}/`,
    );
    expect(result.ok).toBe(false);
    expect(
      await app.evaluate(
        ({ webContents }, id) =>
          webContents
            .fromId(id)
            ?.executeJavaScript('document.querySelector("input").value'),
        id,
      ),
    ).toBe("unsaved draft");
    const current = await state(shell);
    expect(
      current.tabs.find((tab) => tab.id === current.activeTabId)?.url,
    ).toBe(`${source}/`);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1;
    });
    await open(shell, `${target}/`);
    const audit = (await command(shell, { type: "security.audit" })).data as {
      pages: { origin: string; javascript: boolean }[];
    };
    expect(audit.pages.find((page) => page.origin === target)?.javascript).toBe(
      false,
    );
  } finally {
    a.closeAllConnections();
    b.closeAllConnections();
    await Promise.all([
      new Promise<void>((resolve) => a.close(() => resolve())),
      new Promise<void>((resolve) => b.close(() => resolve())),
    ]);
  }
});

test("unattributed native-session requests cannot bypass known trackers and never leave the controlled proxy", async ({
  rainBrowser: { app, shell },
}) => {
  const requests: string[] = [];
  const proxy = http.createServer((request, response) => {
    requests.push(request.url || "");
    response.end("controlled response");
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  try {
    await command(shell, {
      type: "settings.update",
      settings: { httpsOnly: false },
    });
    // A page only supplies the native session reference; session.fetch has no
    // document owner/initiator. All allowed traffic goes to our loopback proxy.
    await open(
      shell,
      `http://127.0.0.1:${(proxy.address() as AddressInfo).port}/fixture`,
    );
    const nativeId = await pageContentsId(
      app,
      `http://127.0.0.1:${(proxy.address() as AddressInfo).port}/fixture`,
    );
    await app.evaluate(
      async ({ webContents }, args) => {
        await webContents
          .fromId(args.id)!
          .session.setProxy({
            mode: "fixed_servers",
            proxyRules: `http://127.0.0.1:${args.port}`,
            proxyBypassRules: "<-loopback>",
          });
      },
      { id: nativeId, port: (proxy.address() as AddressInfo).port },
    );
    const fetchWithoutPage = (url: string) =>
      app.evaluate(
        async ({ webContents }, args) => {
          try {
            return await webContents
              .fromId(args.id)!
              .session.fetch(args.url)
              .then((r) => r.text());
          } catch {
            return "blocked";
          }
        },
        { id: nativeId, url },
      );
    expect(await fetchWithoutPage("http://news.example/control")).toBe(
      "controlled response",
    );
    expect(requests).toContain("http://news.example/control");
    expect(
      await fetchWithoutPage("http://stats.google-analytics.com/collect"),
    ).toBe("blocked");
    expect(await fetchWithoutPage("http://doubleclick.net/ad")).toBe("blocked");
    expect(
      requests.some((url) => /google-analytics|doubleclick/.test(url)),
    ).toBe(false);
  } finally {
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});
