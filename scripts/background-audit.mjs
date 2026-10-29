import { _electron as electron } from "@playwright/test";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import http from "node:http";
import { release, tmpdir } from "node:os";
import path from "node:path";

const seconds = Number(
  process.argv.find((arg) => arg.startsWith("--seconds="))?.split("=")[1] || 30,
);
if (!Number.isInteger(seconds) || seconds < 10 || seconds > 120)
  throw new Error("Audit duration must be 10–120 seconds");
await mkdir("artifacts", { recursive: true });
const logPath = path.resolve("artifacts/background-netlog.json");
const reportPath = path.resolve("artifacts/background-audit.json");
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
const history = path.resolve("artifacts/background-audit-history");
await mkdir(history, { recursive: true });
const previousCaptures = [];
for (const [source, label] of [
  [reportPath, "report"],
  [logPath, "netlog"],
]) {
  const destination = path.join(history, `${runId}-previous-${label}.json`);
  try {
    await copyFile(source, destination);
    previousCaptures.push(path.relative(process.cwd(), destination));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const userData = await mkdtemp(path.join(tmpdir(), "raincode-idle-audit-"));
const env = { ...process.env, RAINCODE_USER_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE;
delete env.RAINCODE_DEV_URL;
const markerPath = `/raincode-netlog-control-${randomUUID()}`;
let controlledServerObserved = false;
const markerTitle = "RainCode owned NetLog positive control";
const fixture = http.createServer((request, response) => {
  if (request.url !== markerPath) {
    response.writeHead(404);
    response.end();
    return;
  }
  controlledServerObserved = true;
  response.writeHead(200, {
    "Content-Type": "text/html;charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "close",
  });
  response.end(
    `<!doctype html><title>${markerTitle}</title><h1>Owned local positive control</h1>`,
  );
});
let app;
let markerURL = "";
let runtime;
let idleStartedAt;
let markerRequestedAt;
try {
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  const address = fixture.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  markerURL = `http://127.0.0.1:${address.port}${markerPath}`;
  app = await electron.launch({
    args: [
      path.resolve("dist-electron/main.cjs"),
      `--log-net-log=${logPath}`,
      "--net-log-capture-mode=Default",
      "--net-log-max-size-mb=10",
    ],
    env,
    timeout: 30000,
  });
  runtime = await app.evaluate(({ app }) => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    platform: process.platform,
    arch: process.arch,
    startupSwitches: {
      proxyServer: app.commandLine.getSwitchValue("proxy-server"),
      dnsPrefetchDisabled: app.commandLine.hasSwitch("dns-prefetch-disable"),
      quicDisabled: app.commandLine.hasSwitch("disable-quic"),
      hostResolverRules: app.commandLine.getSwitchValue("host-resolver-rules"),
    },
  }));
  runtime.osRelease = release();
  runtime.mainBundleSha256 = createHash("sha256")
    .update(await readFile("dist-electron/main.cjs"))
    .digest("hex");
  const shell = await app.firstWindow();
  await shell.waitForSelector(".home-page");
  const initial = await shell.evaluate(() => window.raincode.getState());
  if (initial.tor?.status !== "stopped")
    throw new Error("Idle audit unexpectedly started Tor");
  console.log(
    `Observing ${seconds} seconds of idle Chromium traffic from a fresh Direct profile; no sites, searches or Tor started.`,
  );
  idleStartedAt = Date.now();
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  markerRequestedAt = Date.now();
  const navigated = await shell.evaluate(
    (url) => window.raincode.command({ type: "navigate", url }),
    markerURL,
  );
  if (!navigated.ok)
    throw new Error("Local positive-control navigation failed");
  let loaded = false;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const state = await shell.evaluate(() => window.raincode.getState());
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (
      active?.url === markerURL &&
      active.title === markerTitle &&
      !active.loading &&
      !active.error
    ) {
      loaded = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!loaded || !controlledServerObserved)
    throw new Error("Local positive control did not finish loading");
} finally {
  try {
    await app?.close();
  } finally {
    try {
      fixture.closeAllConnections();
      if (fixture.listening)
        await new Promise((resolve, reject) =>
          fixture.close((error) => (error ? reject(error) : resolve())),
        );
    } finally {
      const relative = path.relative(
        path.resolve(tmpdir()),
        path.resolve(userData),
      );
      if (
        !relative ||
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        !path.basename(userData).startsWith("raincode-idle-audit-")
      )
        throw new Error("Unsafe temporary audit cleanup path");
      await rm(userData, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  }
}
const log = JSON.parse(await readFile(logPath, "utf8"));
const types = Object.fromEntries(
  Object.entries(log.constants.logEventTypes).map(([key, value]) => [
    value,
    key,
  ]),
);
const requests = new Set(),
  dns = new Set(),
  connections = new Set();
const markerRequests = log.events.filter(
  (event) =>
    types[event.type] === "URL_REQUEST_START_JOB" &&
    event.params?.url === markerURL,
);
const markerTime = Math.min(
  ...markerRequests.map((event) => Number(event.time)),
);
const controlledRequestObserved = markerRequests.length > 0;
let controlledTCPObserved = false;
const idleRequests = new Set(),
  idleDNS = new Set(),
  idleConnections = new Set();
let idleEventCount = 0;
const host = (value) => {
  try {
    return new URL(
      value.includes("://") ? value : `http://${value}`,
    ).hostname.toLowerCase();
  } catch {
    return undefined;
  }
};
for (const event of log.events) {
  const name = types[event.type],
    params = event.params || {};
  const idle =
    controlledRequestObserved &&
    Number.isFinite(markerTime) &&
    Number(event.time) < markerTime;
  if (idle) idleEventCount++;
  if (
    name === "URL_REQUEST_START_JOB" &&
    /^https?:|^wss?:/.test(params.url || "")
  ) {
    const value = host(params.url);
    if (value) {
      requests.add(value);
      if (idle) idleRequests.add(value);
    }
  }
  if (name === "HOST_RESOLVER_MANAGER_REQUEST") {
    const value = host(params.host || "");
    if (value) {
      dns.add(value);
      if (idle) idleDNS.add(value);
    }
  }
  if (name === "TCP_CONNECT" || name === "TCP_CONNECT_ATTEMPT")
    for (const address of [
      ...(params.address_list || []),
      ...(params.address ? [params.address] : []),
    ]) {
      const value = host(address);
      if (value) {
        connections.add(value);
        if (idle) idleConnections.add(value);
      }
      if (address === new URL(markerURL).host) controlledTCPObserved = true;
    }
}
const local = (host) =>
  ["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0", "[::]"].includes(
    host,
  ) || host.endsWith(".localhost");
const external = (values) =>
  [...values].filter((value) => !local(value)).sort();
const knownGoogleDomains = [
  "google.com",
  "googleapis.com",
  "gstatic.com",
  "googleusercontent.com",
  "gvt1.com",
  "gvt2.com",
  "doubleclick.net",
  "googlesyndication.com",
  "google-analytics.com",
  "googletagmanager.com",
  "youtube.com",
  "ytimg.com",
];
const hosts = [...new Set([...requests, ...dns])];
const googleHosts = hosts
  .filter((host) =>
    knownGoogleDomains.some(
      (domain) => host === domain || host.endsWith("." + domain),
    ),
  )
  .sort();
const result = {
  timestamp: new Date().toISOString(),
  seconds,
  idleObservationStartedAt: new Date(idleStartedAt).toISOString(),
  positiveControlRequestedAt: new Date(markerRequestedAt).toISOString(),
  idleObservedMilliseconds: markerRequestedAt - idleStartedAt,
  scope:
    "Chromium startup and idle newtab from a fresh temporary Direct profile, followed by an owned loopback HTTP positive control",
  runtime,
  previousCaptures,
  eventCount: log.events.length,
  idleEventCount,
  idleExternalRequestHosts: external(idleRequests),
  idleExternalResolvedHosts: external(idleDNS),
  idleExternalTCPAddresses: external(idleConnections),
  externalRequestHosts: external(requests),
  externalResolvedHosts: external(dns),
  externalTCPAddresses: external(connections),
  knownGoogleHostsObserved: googleHosts,
  knownGoogleDomains,
  controlledMarkerObserved:
    controlledServerObserved &&
    controlledRequestObserved &&
    controlledTCPObserved &&
    Number.isFinite(markerTime),
  positiveControl: {
    requestedAfterIdleSeconds: seconds,
    serverRequestObserved: controlledServerObserved,
    netlogURLObserved: controlledRequestObserved,
    netlogTCPObserved: controlledTCPObserved,
    idleBoundaryTimeAvailable: Number.isFinite(markerTime),
    excludedFromExternalHosts:
      "Owned 127.0.0.1 fixture only; other loopback traffic is also local, not proof of no traffic.",
  },
  noExternalTrafficObserved:
    external(requests).length +
      external(dns).length +
      external(connections).length ===
    0,
  limitations: [
    "Not an OS/Node/Tor packet capture. The owned marker is requested only after the idle interval.",
    "No address-ownership attribution, UDP/QUIC completeness, long sessions, website browsing, all profiles or all OS versions certified.",
    "Known domain matching is an audit classifier, not a site blocklist. Raw NetLog may contain sensitive URLs; this fixture never loads personal profiles.",
  ],
};
await writeFile(reportPath, JSON.stringify(result, null, 2));
await copyFile(reportPath, path.join(history, `${runId}-report.json`));
await copyFile(logPath, path.join(history, `${runId}-netlog.json`));
console.log(JSON.stringify(result));
if (!result.controlledMarkerObserved)
  throw new Error(
    "NetLog positive control failed: owned HTTP URL and TCP endpoint must both be observed",
  );
