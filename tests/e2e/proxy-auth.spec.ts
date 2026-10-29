import http from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import {
  activeTab,
  command,
  expect,
  launchBrowser,
  open,
  state,
  test,
} from "./fixtures";

const username = "synthetic-proxy-user";
const password = "synthetic-proxy-password";
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
let fixture: http.Server;
let proxy: http.Server;
let origin = "";
let proxyPort = 0;
const authorized: string[] = [];
const originAuthorization: string[] = [];
const destinations: string[] = [];

test.beforeAll(async () => {
  fixture = http.createServer((request, response) => {
    destinations.push(request.url || "");
    if (request.headers.authorization)
      originAuthorization.push(request.headers.authorization);
    if (request.url === "/origin-auth") {
      response.writeHead(401, {
        "WWW-Authenticate":
          'Basic realm="Origin must not receive proxy password"',
        "Content-Type": "text/html",
      });
      response.end(
        "<!doctype html><title>Origin authentication denied</title>",
      );
    } else if (request.url === "/json") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ip: "192.0.2.1", fixture: true }));
    } else if (request.url === "/redirect") {
      response.writeHead(302, { Location: "/must-not-follow" });
      response.end();
    } else if (request.url === "/oversize") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ padding: "x".repeat(65537) }));
    } else if (request.url === "/slow") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.write('{"pending":');
    } else {
      response.writeHead(200, {
        "Content-Type": "text/html",
        "Cache-Control": "no-store",
      });
      response.end(
        `<!doctype html><title>Authenticated ${request.url}</title><h1>Native HTTP proxy fixture</h1>`,
      );
    }
  });
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  const fixtureAddress = fixture.address();
  if (!fixtureAddress || typeof fixtureAddress === "string")
    throw new Error("Fixture port");
  origin = `http://127.0.0.1:${fixtureAddress.port}`;
  proxy = http.createServer((request, response) => {
    if (request.headers["proxy-authorization"] !== authorization) {
      response.writeHead(407, {
        "Proxy-Authenticate": 'Basic realm="RainCode controlled proxy"',
        "Content-Length": "0",
      });
      response.end();
      return;
    }
    authorized.push(request.url || "");
    const headers = { ...request.headers };
    delete headers["proxy-authorization"];
    const upstream = http.request(
      request.url!,
      { method: request.method, headers },
      (result) => {
        response.writeHead(result.statusCode || 502, result.headers);
        result.pipe(response);
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const proxyAddress = proxy.address();
  if (!proxyAddress || typeof proxyAddress === "string")
    throw new Error("Proxy port");
  proxyPort = proxyAddress.port;
});
test.afterAll(async () => {
  for (const server of [proxy, fixture]) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("native proxy credentials persist encrypted across restart, stay session-scoped and clear correctly", async () => {
  const userData = await mkdtemp(path.join(tmpdir(), "raincode-proxy-auth-"));
  let browser = await launchBrowser(userData);
  try {
    expect((await state(browser.shell)).secretsAvailable).toBe(true);
    const created = await command(browser.shell, {
      type: "profile.create",
      name: "Authenticated controlled proxy",
      mode: "proxy",
      proxy: {
        scheme: "http",
        host: "127.0.0.1",
        port: proxyPort,
        bypassLocal: false,
      },
    });
    const id = created.data as string;
    await command(browser.shell, {
      type: "settings.update",
      settings: { locale: "en" },
    });
    await command(browser.shell, {
      type: "navigate",
      url: "raincode://privacy",
    });
    await browser.shell
      .getByRole("tab", { name: "Isolation and identities", exact: true })
      .click();
    await browser.shell
      .getByLabel("Proxy username", { exact: true })
      .fill(username);
    await browser.shell
      .getByLabel("Proxy password", { exact: true })
      .fill(password);
    await browser.shell
      .getByRole("button", {
        name: "Save proxy credentials · Authenticated controlled proxy",
        exact: true,
      })
      .click();
    await expect(
      browser.shell.getByLabel("Proxy password", { exact: true }),
    ).toHaveValue("");
    await expect(
      browser.shell.getByText("Credentials saved", { exact: true }),
    ).toBeVisible();
    expect(
      (await state(browser.shell)).profiles.find((profile) => profile.id === id)
        ?.hasCredentials,
    ).toBe(true);
    const serialized = JSON.stringify(await state(browser.shell));
    expect(serialized.includes(username) || serialized.includes(password)).toBe(
      false,
    );
    const cipher = await readFile(
      path.join(userData, "protected-secrets", `${id}.bin`),
    );
    expect(
      cipher.includes(Buffer.from(username)) ||
        cipher.includes(Buffer.from(password)),
    ).toBe(false);
    await command(browser.shell, {
      type: "tab.create",
      profileId: id,
      url: `${origin}/native-auth`,
    });
    await expect
      .poll(async () => (await activeTab(browser.shell)).title)
      .toBe("Authenticated /native-auth");
    expect(authorized.includes(`${origin}/native-auth`)).toBe(true);
    const rejectedChallenges = await browser.app.evaluate(
      async ({ app, webContents }, options) => {
        const native = webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === options.url)!;
        const shell = webContents
          .getAllWebContents()
          .find((contents) =>
            contents.getURL().startsWith("raincode-app://ui/"),
          )!;
        return Promise.all(
          [
            {
              contents: native,
              host: "wrong-proxy.invalid",
              port: options.port,
            },
            { contents: native, host: "127.0.0.1", port: options.port + 1 },
            { contents: shell, host: "127.0.0.1", port: options.port },
          ].map(
            (challenge) =>
              new Promise<boolean>((resolve, reject) => {
                const timer = setTimeout(
                  () => reject(new Error("Auth callback timeout")),
                  1000,
                );
                app.emit(
                  "login",
                  { preventDefault() {} },
                  challenge.contents,
                  { url: options.url },
                  {
                    isProxy: true,
                    scheme: "basic",
                    realm: "controlled",
                    host: challenge.host,
                    port: challenge.port,
                  },
                  (providedUser?: string, providedPassword?: string) => {
                    clearTimeout(timer);
                    resolve(
                      providedUser !== undefined ||
                        providedPassword !== undefined,
                    );
                  },
                );
              }),
          ),
        );
      },
      { url: `${origin}/native-auth`, port: proxyPort },
    );
    expect(rejectedChallenges).toEqual([false, false, false]);
    await open(browser.shell, `${origin}/origin-auth`);
    expect(originAuthorization).toEqual([]);
    const unrelated = await command(browser.shell, {
      type: "profile.create",
      name: "No credentials",
      mode: "proxy",
      proxy: {
        scheme: "http",
        host: "127.0.0.1",
        port: proxyPort,
        bypassLocal: false,
      },
    });
    await command(browser.shell, {
      type: "tab.create",
      profileId: unrelated.data as string,
      url: `${origin}/wrong-profile`,
    });
    await expect
      .poll(async () => (await activeTab(browser.shell)).loading)
      .toBe(false);
    expect(authorized.includes(`${origin}/wrong-profile`)).toBe(false);
    await command(browser.shell, {
      type: "tab.create",
      profileId: id,
      url: `${origin}/before-restart`,
    });
    await expect
      .poll(async () => (await activeTab(browser.shell)).title)
      .toBe("Authenticated /before-restart");
    const exportPath = path.join(userData, "exported-settings.json");
    await browser.app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, exportPath);
    await command(browser.shell, { type: "action", action: "exportSettings" });
    const exported = await readFile(exportPath, "utf8");
    expect(exported.includes(username) || exported.includes(password)).toBe(
      false,
    );
    await browser.app.close();
    for (const name of (await readdir(userData)).filter((name) =>
      name.startsWith("raincode.sqlite"),
    )) {
      const sqlite = await readFile(path.join(userData, name));
      expect(
        sqlite.includes(Buffer.from(username)) ||
          sqlite.includes(Buffer.from(password)),
      ).toBe(false);
    }
    browser = await launchBrowser(userData);
    await expect
      .poll(async () => (await activeTab(browser.shell)).title)
      .toBe("Authenticated /before-restart");
    await open(browser.shell, `${origin}/after-restart`);
    expect(authorized.includes(`${origin}/after-restart`)).toBe(true);
    await command(browser.shell, {
      type: "proxy.credentials.clear",
      profileId: id,
    });
    expect(
      (await state(browser.shell)).profiles.find((profile) => profile.id === id)
        ?.hasCredentials,
    ).toBe(false);
    expect(await readdir(path.join(userData, "protected-secrets"))).toEqual([]);
    await command(browser.shell, {
      type: "navigate",
      url: `${origin}/after-clear`,
    });
    await expect
      .poll(async () => (await activeTab(browser.shell)).loading)
      .toBe(false);
    expect(authorized.includes(`${origin}/after-clear`)).toBe(false);
    expect(originAuthorization).toEqual([]);
  } finally {
    await browser.app.close().catch(() => undefined);
    await rm(userData, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});

test("diagnostic helper authenticates only proxy challenges and bounds JSON, redirects and cancellation", async ({
  rainBrowser: { app },
}) => {
  const helper = test.info().outputPath("proxy-auth.cjs");
  await build({
    entryPoints: [path.resolve("src/main/proxy-auth.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    outfile: helper,
  });
  const results = await app.evaluate(
    async ({ session }, options) => {
      const { createRequire } = process.getBuiltinModule("module");
      const { requestProfileJSON } = createRequire(options.helper)(
        options.helper,
      ) as typeof import("../../src/main/proxy-auth");
      const current = session.fromPartition(`proxy-helper-test-${Date.now()}`);
      await current.setProxy({
        mode: "fixed_servers",
        proxyRules: `http://127.0.0.1:${options.proxyPort}`,
        proxyBypassRules: "<-loopback>",
      });
      const challenges: { isProxy: boolean; host: string; port: number }[] = [];
      const authenticate = async (auth: Electron.AuthInfo) => {
        challenges.push({
          isProxy: auth.isProxy,
          host: auth.host,
          port: auth.port,
        });
        return auth.isProxy &&
          auth.host === "127.0.0.1" &&
          auth.port === options.proxyPort
          ? { username: options.username, password: options.password }
          : undefined;
      };
      const json = await requestProfileJSON(
        current,
        `${options.origin}/json`,
        authenticate,
      );
      const beforeOrigin = challenges.length;
      const failure = async (route: string, signal?: AbortSignal) => {
        try {
          await requestProfileJSON(
            current,
            `${options.origin}${route}`,
            authenticate,
            signal,
          );
          return false;
        } catch {
          return true;
        }
      };
      const originRejected = await failure("/origin-auth");
      const originCalledAuthenticator = challenges.length !== beforeOrigin;
      const redirectRejected = await failure("/redirect");
      const oversizeRejected = await failure("/oversize");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 100);
      let abortRejected: boolean;
      try {
        abortRejected = await failure("/slow", controller.signal);
      } finally {
        clearTimeout(timer);
      }
      await current.closeAllConnections();
      return {
        json,
        challenges,
        originRejected,
        originCalledAuthenticator,
        redirectRejected,
        oversizeRejected,
        abortRejected,
      };
    },
    { helper, proxyPort, origin, username, password },
  );
  expect(results).toMatchObject({
    json: { ip: "192.0.2.1", fixture: true },
    originRejected: true,
    originCalledAuthenticator: false,
    redirectRejected: true,
    oversizeRejected: true,
    abortRejected: true,
  });
  expect(results.challenges).toEqual([
    { isProxy: true, host: "127.0.0.1", port: proxyPort },
  ]);
  expect(destinations.includes("/must-not-follow")).toBe(false);
  expect(originAuthorization).toEqual([]);
});

test("native proxy configuration covers every web protocol and rejects a silent DIRECT route", async ({
  rainBrowser: { app },
}) => {
  const helper = test.info().outputPath("proxy-route.cjs");
  await build({
    entryPoints: [path.resolve("src/main/proxy-auth.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    outfile: helper,
  });
  const evidence = await app.evaluate(async ({ session }, helper) => {
    const { createRequire } = process.getBuiltinModule("module");
    const { configureProfileProxy } = createRequire(helper)(
      helper,
    ) as typeof import("../../src/main/proxy-auth");
    const routes: string[] = [];
    for (const scheme of ["http", "https", "socks5"] as const) {
      for (const host of [
        "127.0.0.1",
        "[::1]",
        "[0:0:0:0:0:0:0:1]",
        "proxy.example",
      ]) {
        const current = session.fromPartition(
          `persist:route-config-${scheme}-${host}`,
        );
        await configureProfileProxy(current, {
          scheme,
          host,
          port: 12345,
          bypassLocal: false,
        });
        routes.push(
          await current.resolveProxy("https://raincode-route.invalid/"),
        );
      }
    }
    const ignored = session.fromPartition("route-config-ignored");
    ignored.setProxy = async () => {};
    let rejectedDirect = false;
    try {
      await configureProfileProxy(ignored, {
        scheme: "http",
        host: "127.0.0.1",
        port: 12345,
        bypassLocal: false,
      });
    } catch {
      rejectedDirect = true;
    }
    return { routes, rejectedDirect };
  }, helper);
  expect(evidence.rejectedDirect).toBe(true);
  expect(evidence.routes).toHaveLength(12);
  expect(evidence.routes.every((route) => !route.includes("DIRECT"))).toBe(
    true,
  );
});

test("revoking proxy credentials cancels an authentication already awaiting OS decryption", async ({
  rainBrowser: { app, shell, userData },
}) => {
  const created = await command(shell, {
    type: "profile.create",
    name: "Revoke race",
    mode: "proxy",
    proxy: {
      scheme: "http",
      host: "127.0.0.1",
      port: proxyPort,
      bypassLocal: false,
    },
  });
  const id = created.data as string;
  await command(shell, {
    type: "proxy.credentials.set",
    profileId: id,
    username,
    password,
  });
  const url = `${origin}/revoke-race`;
  await command(shell, { type: "tab.create", profileId: id, url });
  await expect
    .poll(async () => (await activeTab(shell)).title)
    .toBe("Authenticated /revoke-race");
  const pending = await app.evaluateHandle(
    ({ app, safeStorage, webContents }, options) => {
      const contents = webContents
        .getAllWebContents()
        .find((value) => value.getURL() === options.url)!;
      const original = safeStorage.decryptStringAsync;
      const observed = {
        started: false,
        provided: undefined as boolean | undefined,
        release: () => {},
        restore: () => {
          safeStorage.decryptStringAsync = original;
        },
      };
      safeStorage.decryptStringAsync = async (encrypted) => {
        observed.started = true;
        await new Promise<void>((resolve) => {
          observed.release = resolve;
        });
        return original.call(safeStorage, encrypted);
      };
      app.emit(
        "login",
        { preventDefault() {} },
        contents,
        { url: options.url },
        {
          isProxy: true,
          scheme: "basic",
          host: "127.0.0.1",
          port: options.port,
          realm: "owned",
        },
        (user?: string, pass?: string) => {
          observed.provided = user !== undefined || pass !== undefined;
        },
      );
      return observed;
    },
    { url, port: proxyPort },
  );
  try {
    await expect
      .poll(() => pending.evaluate((value) => value.started))
      .toBe(true);
    const clearing = shell.evaluate(
      (profileId) =>
        window.raincode.command({ type: "proxy.credentials.clear", profileId }),
      id,
    );
    await expect
      .poll(
        async () =>
          (await state(shell)).profiles.find((value) => value.id === id)
            ?.hasCredentials,
      )
      .toBe(false);
    await pending.evaluate((value) => value.release());
    expect((await clearing).ok).toBe(true);
    await expect
      .poll(() => pending.evaluate((value) => value.provided))
      .toBe(false);
    expect(await readdir(path.join(userData, "protected-secrets"))).toEqual([]);
  } finally {
    await pending
      .evaluate((value) => {
        value.release();
        value.restore();
      })
      .catch(() => undefined);
    await pending.dispose();
  }
});
