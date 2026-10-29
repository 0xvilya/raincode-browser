import { _electron } from "@playwright/test";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import http from "node:http";
import { once } from "node:events";
import { join, resolve, relative, isAbsolute } from "node:path";

// Own clean profile only. Default NetLog metadata, no user sites, keys or cookies.
const profile = await mkdtemp(join(tmpdir(), "raincode-background-audit-"));
const log = join(profile, "startup-netlog.json");
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !["ELECTRON_RUN_AS_NODE", "RAINCODE_DEV_URL"].includes(key),
  ),
);
let app;
let version;
const fixture = http.createServer((_request, response) =>
  response.end(
    "<!doctype html><title>Owned network audit</title><h1>Local positive control</h1>",
  ),
);
fixture.listen(0, "127.0.0.1");
await once(fixture, "listening");
const localOrigin = `http://127.0.0.1:${fixture.address().port}`;
try {
  app = await _electron.launch({
    ...(env.RAINCODE_E2E_EXECUTABLE
      ? { executablePath: env.RAINCODE_E2E_EXECUTABLE }
      : {}),
    args: env.RAINCODE_E2E_EXECUTABLE
      ? [`--log-net-log=${log}`, `--user-data-dir=${profile}`]
      : [`--log-net-log=${log}`, resolve("dist-electron/main.cjs")],
    env: { ...env, RAINCODE_USER_DATA: profile, RAINCODE_TEST: "1" },
  });
  const shell = await app.firstWindow();
  await shell.waitForFunction(
    () => typeof window.raincode?.getState === "function",
  );
  version = await app.evaluate(({ app }) => ({
    reportedAppVersion: app.getVersion(),
    electronVersion: process.versions.electron,
  }));
  const opened = await shell.evaluate(
    (url) => window.raincode.command({ type: "navigate", url }),
    `${localOrigin}/`,
  );
  if (!opened.ok) throw new Error("AUDIT_LOCAL_CONTROL_FAILED");
  await shell.waitForFunction(
    (url) =>
      window.raincode
        .getState()
        .then((state) =>
          state.tabs.some(
            (tab) => tab.url === url && !tab.loading && !tab.error,
          ),
        ),
    `${localOrigin}/`,
  );
  await new Promise((resolve) => setTimeout(resolve, 15000));
  await app.evaluate(({ netLog }) =>
    netLog.currentlyLogging ? netLog.stopLogging() : undefined,
  );
  await app.close();
  app = undefined;
  const parsed = JSON.parse(await readFile(log, "utf8"));
  const origins = new Set();
  const hosts = new Set();
  function scan(value, key = "") {
    if (typeof value === "string") {
      if (/^https?:\/\//.test(value)) {
        try {
          const url = new URL(value);
          origins.add(url.origin);
          hosts.add(url.hostname);
        } catch {
          /* diagnostic metadata only */
        }
      } else if (
        ["host", "hostname", "server_name"].includes(key) &&
        /^[a-z0-9.-]+(?::\d+)?$/i.test(value)
      )
        hosts.add(value.replace(/:\d+$/, ""));
    } else if (value && typeof value === "object")
      for (const [childKey, child] of Object.entries(value))
        scan(child, childKey);
  }
  for (const event of parsed.events || []) scan(event.params);
  const googleSuffixes = [
    "google.com",
    "googleapis.com",
    "gstatic.com",
    "googleusercontent.com",
    "googlevideo.com",
    "googlehosted.com",
    "gvt1.com",
    "gvt2.com",
    "ggpht.com",
    "1e100.net",
    "doubleclick.net",
    "googlesyndication.com",
  ];
  const report = {
    ...version,
    sourceVersion: JSON.parse(await readFile("package.json", "utf8")).version,
    packaged: Boolean(env.RAINCODE_E2E_EXECUTABLE),
    capturedAt: new Date().toISOString(),
    cleanProfile: true,
    idleAfterReadyMs: 15000,
    events: parsed.events?.length || 0,
    observedHTTPOrigins: [...origins].sort(),
    localControlObserved: origins.has(localOrigin),
    externalHTTPOrigins: [...origins]
      .filter((origin) => origin !== localOrigin)
      .sort(),
    observedHosts: [...hosts].sort(),
    knownGoogleHosts: [...hosts].filter((host) =>
      googleSuffixes.some(
        (suffix) => host === suffix || host.endsWith(`.${suffix}`),
      ),
    ),
    scope:
      "Chromium NetLog startup plus own loopback page/profile creation and 15 seconds idle. No external visited sites or AI configuration. Not OS packet capture or proof of all future background traffic.",
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    join(
      "artifacts",
      `background-network-${/^\d+\.\d+\.\d+$/.test(report.sourceVersion) ? report.sourceVersion : "development"}.json`,
    ),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.localControlObserved)
    throw new Error("AUDIT_NETLOG_POSITIVE_CONTROL_MISSING");
} finally {
  await app?.close().catch(() => undefined);
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(() => resolve()));
  const rel = relative(resolve(tmpdir()), resolve(profile));
  if (
    isAbsolute(rel) ||
    !rel.startsWith("raincode-background-audit-") ||
    rel.includes("..") ||
    (await lstat(profile)).isSymbolicLink()
  )
    throw new Error("AUDIT_CLEANUP_PATH_INVALID");
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
