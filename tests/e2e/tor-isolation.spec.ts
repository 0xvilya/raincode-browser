import http from "node:http";
import net from "node:net";
import { once } from "node:events";
import path from "node:path";
import { build } from "esbuild";
import { fixtureOnion } from "../tor/fixture-onion";
import { expect, open, pageContentsId, test } from "./fixtures";

test("production Tor session policy uses SOCKS domain names, isolates storage, disables frame WebRTC and fails closed", async ({
  rainBrowser: { app, shell },
}) => {
  const policyPath = test.info().outputPath("tor-policy.cjs");
  await build({
    entryPoints: [path.resolve("src/main/tor-policy.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    outfile: policyPath,
  });
  const onion = fixtureOnion(19);
  const socksRequests: { host: string; port: number; addressType: number }[] =
    [];
  const sockets = new Set<net.Socket>();
  // Owned OS-level TCP listeners are positive-controlled before probing the
  // browser. This observes loopback bypass only, not all NIC/DNS traffic.
  const canaries: {
    server: net.Server;
    host: string;
    port: number;
    hits: number;
  }[] = [];
  for (const host of ["127.0.0.1", "::1"]) {
    const canary = { server: net.createServer(), host, port: 0, hits: 0 };
    canary.server.on("connection", (socket) => {
      canary.hits++;
      socket.end();
    });
    canary.server.listen(0, host);
    await once(canary.server, "listening");
    const bound = canary.server.address();
    if (!bound || typeof bound === "string") throw new Error("Canary port");
    canary.port = bound.port;
    const accepted = once(canary.server, "connection");
    const control = net.connect(canary.port, host);
    await once(control, "connect");
    await accepted;
    control.destroy();
    expect(canary.hits).toBe(1);
    canaries.push(canary);
  }
  const fixture = http.createServer((request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(
      request.url?.startsWith("/cross") || request.url?.startsWith("/direct")
        ? "<!doctype html><title>Cross-origin Tor fixture</title><p>controlled frame</p>"
        : `<!doctype html><title>Owned onion fixture</title><h1 id="onion">Controlled onion transport</h1><iframe src="http://frame.${onion}/cross"></iframe><iframe srcdoc="<p>srcdoc guard</p>"></iframe>`,
    );
  });
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  const backend = fixture.address();
  if (!backend || typeof backend === "string") throw new Error("Fixture port");
  const socks = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    let buffered = Buffer.alloc(0);
    let greeted = false;
    const receive = (data: Buffer) => {
      buffered = Buffer.concat([buffered, data]);
      if (!greeted) {
        if (buffered.length < 2 || buffered.length < 2 + buffered[1]) return;
        if (buffered[0] !== 5) {
          socket.destroy();
          return;
        }
        buffered = buffered.subarray(2 + buffered[1]);
        socket.write(Buffer.from([5, 0]));
        greeted = true;
      }
      if (buffered.length < 5) return;
      if (buffered[0] !== 5 || buffered[1] !== 1 || buffered[3] !== 3) {
        socket.destroy();
        return;
      }
      const length = buffered[4];
      if (buffered.length < 7 + length) return;
      const host = buffered.subarray(5, 5 + length).toString("utf8");
      const port = buffered.readUInt16BE(5 + length);
      socksRequests.push({ host, port, addressType: buffered[3] });
      if (![onion, `frame.${onion}`].includes(host)) {
        socket.end(Buffer.from([5, 2, 0, 1, 0, 0, 0, 0, 0, 0]));
        return;
      }
      socket.removeListener("data", receive);
      const remainder = buffered.subarray(7 + length);
      const upstream = net.connect(backend.port, "127.0.0.1");
      sockets.add(upstream);
      upstream.on("close", () => sockets.delete(upstream));
      upstream.on("error", () => socket.destroy());
      socket.on("close", () => upstream.destroy());
      upstream.once("connect", () => {
        const respond = () => {
          socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
          if (remainder.length) upstream.write(remainder);
          socket.pipe(upstream);
          upstream.pipe(socket);
        };
        if (socksRequests.length === 1) {
          // Deliberately exceed Chromium's 30s SOCKS handshake deadline.
          // The Tor-only preconnect must finish before Chromium starts its job.
          const timer = setTimeout(respond, 31_000);
          socket.once("close", () => clearTimeout(timer));
        } else respond();
      });
    };
    socket.on("data", receive);
  });
  socks.listen(0, "127.0.0.1");
  await once(socks, "listening");
  const address = socks.address();
  if (!address || typeof address === "string") throw new Error("SOCKS port");
  const view = await app.evaluateHandle(
    async ({ WebContentsView, session }, options) => {
      const { createRequire } = process.getBuiltinModule("module");
      const policy = createRequire(options.policyPath)(
        options.policyPath,
      ) as typeof import("../../src/main/tor-policy");
      const isolated = session.fromPartition(`tor-policy-test-${Date.now()}`);
      await policy.configureTorSession(
        isolated,
        options.port,
        options.guardPath,
      );
      const requests: { url: string; allowed: boolean }[] = [];
      const preconnect = new policy.OnionPreconnect();
      isolated.webRequest.onBeforeRequest((details, callback) => {
        const allowed = policy.torRequestAllowed(details.url, true);
        requests.push({ url: details.url, allowed });
        if (allowed && new URL(details.url).hostname.endsWith(".onion")) {
          void preconnect.prepare(details.url, options.port).then(
            () => callback({ cancel: false }),
            () => callback({ cancel: true }),
          );
        } else callback({ cancel: !allowed });
      });
      const view = new WebContentsView({
        webPreferences: {
          session: isolated,
          contextIsolation: true,
          nodeIntegration: false,
          nodeIntegrationInSubFrames: true,
          sandbox: true,
          webSecurity: true,
          backgroundThrottling: false,
        },
      });
      view.webContents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
      return Object.assign(view, {
        testGuardRequests: requests,
        testPreconnect: preconnect,
      });
    },
    {
      policyPath,
      port: address.port,
      guardPath: path.resolve("dist-electron/tor-guard.cjs"),
    },
  );
  try {
    await open(shell, `http://127.0.0.1:${backend.port}/direct`);
    const directId = await pageContentsId(
      app,
      `http://127.0.0.1:${backend.port}/direct`,
    );
    await app.evaluate(async ({ webContents }, id) => {
      await webContents
        .fromId(id)!
        .executeJavaScript(
          'localStorage.setItem("profile-secret", "direct"); document.cookie="direct=secret; SameSite=Lax"',
        );
    }, directId);
    const loaded = await view.evaluate(async (value, url) => {
      try {
        await value.webContents.loadURL(url);
        return { error: null, requests: value.testGuardRequests };
      } catch (error) {
        return { error: String(error), requests: value.testGuardRequests };
      }
    }, `http://${onion}/`);
    expect(loaded, JSON.stringify({ loaded, socksRequests })).toMatchObject({
      error: null,
    });
    expect(socksRequests).toEqual(
      expect.arrayContaining([
        { host: onion, port: 80, addressType: 3 },
        { host: `frame.${onion}`, port: 80, addressType: 3 },
      ]),
    );
    const frameGuards = await view.evaluate(async (value) =>
      Promise.all(
        value.webContents.mainFrame.framesInSubtree.map(async (frame) => ({
          url: frame.url,
          guard: await frame.executeJavaScript(
            `({rtc:typeof RTCPeerConnection, vendorRTC:typeof webkitRTCPeerConnection, transport:typeof WebTransport, node:typeof process, require:typeof require, bridge:typeof window.raincode})`,
          ),
        })),
      ),
    );
    expect(frameGuards.length).toBeGreaterThanOrEqual(3);
    for (const frame of frameGuards)
      expect(frame.guard, frame.url).toEqual({
        rtc: "undefined",
        vendorRTC: "undefined",
        transport: "undefined",
        node: "undefined",
        require: "undefined",
        bridge: "undefined",
      });
    expect(
      await view.evaluate(async (value) =>
        value.webContents.executeJavaScript(
          '({local:localStorage.getItem("profile-secret"),cookie:document.cookie,title:document.title})',
        ),
      ),
    ).toEqual({ local: null, cookie: "", title: "Owned onion fixture" });
    // Check a shared origin too: different onion and clearnet origins alone do
    // not establish that session storage is isolated.
    const directCookieIsolation = await view.evaluate(
      async (value, urls) => ({
        cookies: await value.webContents.session.cookies.get({
          url: urls.direct,
        }),
        persistent: value.webContents.session.isPersistent(),
        proxy: await value.webContents.session.resolveProxy(urls.onion),
        geolocation: await value.webContents.executeJavaScript(
          'navigator.permissions.query({name:"geolocation"}).then(permission=>permission.state)',
        ),
      }),
      { direct: `http://127.0.0.1:${backend.port}`, onion: `http://${onion}/` },
    );
    expect(directCookieIsolation.cookies).toEqual([]);
    expect(directCookieIsolation.persistent).toBe(false);
    expect(directCookieIsolation.proxy).toContain(`127.0.0.1:${address.port}`);
    expect(directCookieIsolation.proxy).not.toContain("DIRECT");
    expect(directCookieIsolation.geolocation).toBe("denied");
    const probeLocalRoutes = async () => {
      for (const canary of canaries) {
        const url = `http://${canary.host.includes(":") ? `[${canary.host}]` : canary.host}:${canary.port}/owned-leak-probe`;
        const outcome = await view.evaluate(async (value, target) => {
          try {
            await value.webContents.loadURL(target);
            return "unexpected-success";
          } catch (error) {
            return String(error);
          }
        }, url);
        expect(outcome).toContain("ERR_BLOCKED_BY_CLIENT");
        expect(canary.hits).toBe(1);
      }
    };
    await probeLocalRoutes();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => socks.close(() => resolve()));
    const refused = await view.evaluate(async (value) => {
      try {
        await value.webContents.loadURL(
          "http://controlled-proxy-failure.invalid/",
        );
        return "unexpected-success";
      } catch (error) {
        return String(error);
      }
    });
    expect(refused).toMatch(
      /ERR_PROXY_CONNECTION_FAILED|ERR_SOCKS_CONNECTION_FAILED/,
    );
    await probeLocalRoutes();
    await test.info().attach("owned-os-socket-probes", {
      body: JSON.stringify(
        {
          scope:
            "Owned loopback TCP listeners before/after SOCKS shutdown; not a packet capture or OS-wide DNS/WebRTC leak audit",
          results: canaries.map(({ host, hits }) => ({
            host,
            positiveControlConnections: 1,
            totalConnections: hits,
            browserConnections: hits - 1,
          })),
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    await view.evaluate(async (value, path) => {
      const { createRequire } = process.getBuiltinModule("module");
      const policy = createRequire(path)(
        path,
      ) as typeof import("../../src/main/tor-policy");
      value.webContents.session.webRequest.onBeforeRequest(
        (details, callback) =>
          callback({ cancel: !policy.torRequestAllowed(details.url, false) }),
      );
    }, policyPath);
    const stopped = await view.evaluate(async (value) => {
      try {
        await value.webContents.loadURL("https://example.invalid/");
        return "unexpected-success";
      } catch (error) {
        return String(error);
      }
    });
    expect(stopped).toContain("ERR_BLOCKED_BY_CLIENT");
  } finally {
    for (const canary of canaries)
      await new Promise<void>((resolve) =>
        canary.server.close(() => resolve()),
      );
    await view
      .evaluate((value) => {
        value.testPreconnect.clear();
        value.webContents.close();
      })
      .catch(() => undefined);
    await view.dispose();
    for (const socket of sockets) socket.destroy();
    if (socks.listening)
      await new Promise<void>((resolve) => socks.close(() => resolve()));
    fixture.closeAllConnections();
    await new Promise<void>((resolve) => fixture.close(() => resolve()));
  }
});
