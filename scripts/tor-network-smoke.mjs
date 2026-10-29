import { _electron as electron } from "@playwright/test";
import { build } from "esbuild";
import http from "node:http";
import { once } from "node:events";
import {
  mkdtemp,
  readdir,
  readFile,
  mkdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
// Every network wait has a finite budget. Values are milliseconds, and explicit
// retry mode grants a fresh navigation budget while preserving the first failure.
const timeoutOption = (name, fallback) => {
  const flag = `--${name}-timeout-ms`;
  const index = process.argv.findIndex(
    (arg) => arg === flag || arg.startsWith(`${flag}=`),
  );
  if (index < 0) return fallback;
  const argument = process.argv[index];
  const raw =
    argument === flag
      ? process.argv[index + 1]
      : argument.slice(flag.length + 1);
  const value = Number(raw);
  if (
    !/^\d+$/.test(raw || "") ||
    !Number.isSafeInteger(value) ||
    value < 1000 ||
    value > 1800000
  )
    throw new Error(`${flag} must be an integer from 1000 to 1800000`);
  return value;
};
const timeouts = {
  bootstrap: timeoutOption("bootstrap", 630000),
  publication: timeoutOption("publication", 180000),
  descriptor: timeoutOption("descriptor", 180000),
  navigation: timeoutOption("navigation", 180000),
  auxiliary: timeoutOption("auxiliary", 90000),
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeToken = (value) =>
  typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)
    ? value
    : undefined;
const bootstrapSnapshot = (tor) => ({
  status: safeToken(tor?.status),
  progress: Number.isFinite(tor?.progress) ? tor.progress : undefined,
  phase: safeToken(tor?.phase),
  reason: safeToken(tor?.reason),
  problems: Number.isSafeInteger(tor?.problems) ? tor.problems : undefined,
  recommendation: safeToken(tor?.recommendation),
});
const smokeFailure = (kind, message) =>
  Object.assign(new Error(message), { smokeKind: kind, safeMessage: message });
const defaultSearchSnapshot = (target, profileId) => {
  let hostnameApproved = false;
  try {
    const destination = new URL(target?.url);
    hostnameApproved =
      destination.protocol === "https:" &&
      destination.hostname === "html.duckduckgo.com";
  } catch {
    /* An absent or invalid URL is represented only by the boolean. */
  }
  return {
    targetPresent: !!target,
    loading: target?.loading === true,
    profileMatch: !!target && target.profileId === profileId,
    hostnameApproved,
    errorPresent: !!target?.error,
  };
};
const startedAt = Date.now();
await build({
  entryPoints: ["src/main/tor.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: ".cache/tor-controller.mjs",
});
const { TorControl } = await import("../.cache/tor-controller.mjs");
let ownedFixtureRequests = 0;
const fixture = http.createServer((req, res) => {
  ownedFixtureRequests++;
  res.writeHead(200, {
    "Content-Type": "text/html;charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (req.url === "/frame") {
    res.end(
      '<script>parent.postMessage({rtc:typeof RTCPeerConnection,node:typeof process,bridge:typeof window.raincode},"*")</script>',
    );
    return;
  }
  res.end(
    '<!doctype html><title>RainCode owned onion fixture</title><h1>Real Tor connection</h1><a id="next" href="/next">Owned onion next page</a><script>window.frameResult=null;addEventListener("message",e=>window.frameResult=e.data)</script><iframe id="child" src="http://child.' +
      req.headers.host +
      '/frame"></iframe>',
  );
});
fixture.listen(0, "127.0.0.1");
await once(fixture, "listening");
const profile = await mkdtemp(path.join(tmpdir(), "raincode-tor-network-"));
const env = { ...process.env, RAINCODE_USER_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
delete env.RAINCODE_DEV_URL;
let app;
let shell;
let control;
let defaultSearchProfileId;
const result = {
  capturedAt: new Date().toISOString(),
  sourceVersion: JSON.parse(await readFile("package.json", "utf8")).version,
  passed: false,
  stage: "launch",
  checkpoint: "launch",
  checkpoints: [],
  nativeFailures: [],
  timeouts,
  fixtureTopology: "same-tor-daemon-client-and-owned-service",
  publicationEvidence:
    "owned-service-upload-event; not independent descriptor reachability",
  descriptorReadinessEvidence: process.argv.includes("--wait-descriptor")
    ? "owned-service-HSFETCH-received-by-same-daemon; not independent-client reachability"
    : "not-requested; cold-navigation-discovers-owned-descriptor",
  loadAttempts: 0,
  navigationAttempts: [],
  bootstrapProgress: [],
  descriptorStatuses: {},
  descriptorEvents: [],
  streamStatuses: {},
  streamEvents: [],
};
const checkpoint = async (stage, step = "start") => {
  result.stage = stage;
  result.checkpoint = step;
  const point = { stage, step, elapsedMs: Date.now() - startedAt };
  result.checkpoints.push(point);
  console.log("Tor smoke checkpoint", JSON.stringify(point));
  if (app)
    await app.evaluate(
      (_electron, context) => {
        globalThis.__raincodeSmokeContext = context;
      },
      { stage, checkpoint: step },
    );
};
const rememberNativeFailures = async () => {
  if (!app) return;
  result.nativeFailures = await app.evaluate(
    () => globalThis.__raincodeSmokeNativeFailures || [],
  );
  if (result.defaultTorSearch) {
    result.defaultTorSearch.nativeCode =
      result.nativeFailures
        .filter((event) => event.stage === "default-tor-search")
        .at(-1)?.code ?? null;
  }
};
const rememberBootstrap = (tor) => {
  const snapshot = bootstrapSnapshot(tor);
  const previous = result.bootstrapState;
  result.bootstrapState = snapshot;
  if (JSON.stringify(snapshot) !== JSON.stringify(previous)) {
    result.bootstrapProgress.push({
      elapsedMs: Date.now() - startedAt,
      ...snapshot,
    });
    // Keep diagnostics bounded even if a daemon repeatedly changes its status.
    if (result.bootstrapProgress.length > 200)
      result.bootstrapProgress.splice(1, 1);
    console.log("Tor bootstrap progress", JSON.stringify(snapshot));
  }
};
try {
  app = await electron.launch({
    ...(process.env.RAINCODE_EXECUTABLE
      ? { executablePath: process.env.RAINCODE_EXECUTABLE }
      : {}),
    args: process.env.RAINCODE_EXECUTABLE
      ? [`--user-data-dir=${profile}`]
      : [path.resolve("dist-electron/main.cjs")],
    env,
    timeout: 30000,
  });
  shell = await app.firstWindow();
  await shell.waitForSelector(".home-page");
  result.version = await app.evaluate(({ app }) => app.getVersion());
  result.packaged = await app.evaluate(({ app }) => app.isPackaged);
  await app.evaluate(({ app }, startedAt) => {
    globalThis.__raincodeSmokeNativeFailures = [];
    globalThis.__raincodeSmokeContext = {
      stage: "launch",
      checkpoint: "launch",
    };
    app.on("web-contents-created", (_event, wc) =>
      wc.on("did-fail-load", (_e, code, _description, url, main) => {
        if (main && Number.isSafeInteger(code)) {
          globalThis.__raincodeSmokeNativeFailures.push({
            ...globalThis.__raincodeSmokeContext,
            code,
            elapsedMs: Date.now() - startedAt,
          });
          if (globalThis.__raincodeSmokeNativeFailures.length > 100)
            globalThis.__raincodeSmokeNativeFailures.shift();
        }
        if (
          main &&
          globalThis.__raincodeOwnedTorURL &&
          url === globalThis.__raincodeOwnedTorURL
        ) {
          globalThis.__raincodeOwnedTorFailureCode = code;
        }
      }),
    );
  }, startedAt);
  const call = async (command) => {
    const r = await shell.evaluate((c) => window.raincode.command(c), command);
    if (!r.ok)
      throw smokeFailure("command-failed", "Application command failed");
    return r;
  };
  await call({ type: "navigate", url: "raincode://tor" });
  await shell
    .getByText("VPN не обязателен для Tor", { exact: false })
    .waitFor();
  await checkpoint("bootstrap");
  await call({ type: "tor.start" });
  const bootstrapStartedAt = Date.now();
  result.bootstrapStartedAfterMs = bootstrapStartedAt - startedAt;
  const deadline = bootstrapStartedAt + timeouts.bootstrap;
  let tor;
  while (Date.now() < deadline) {
    tor = (await shell.evaluate(() => window.raincode.getState())).tor;
    rememberBootstrap(tor);
    if (tor?.status === "ready") break;
    if (tor?.status === "error")
      throw smokeFailure("bootstrap-error", "Tor bootstrap reported an error");
    await new Promise((r) => setTimeout(r, 1000));
  }
  result.bootstrapDurationMs = Date.now() - bootstrapStartedAt;
  if (tor?.status !== "ready")
    throw smokeFailure(
      "bootstrap-timeout",
      "Tor bootstrap exceeded the test deadline",
    );
  console.log("Actual Tor bootstrap 100%");
  result.bootstrap = 100;
  await checkpoint("owned-descriptor");
  const runtime = path.join(profile, "tor-runtime");
  const ownedRuntimeDirectories = async () => {
    const entries = await readdir(runtime, { withFileTypes: true });
    const directories = entries.filter(
      (entry) =>
        entry.isDirectory() &&
        /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(entry.name),
    );
    if (!directories.length || directories.length > 32)
      throw smokeFailure(
        "owned-runtime-directory-count",
        "Owned Tor runtime directory count was invalid",
      );
    return directories.map((entry) => entry.name);
  };
  const ownedDataDirectorySettings = async () => {
    const directories = await ownedRuntimeDirectories();
    const settings = [];
    for (const directory of directories) {
      // Inspect only this test profile's bounded top-level UUID run configs.
      // DataDirectory values are compared in memory, never logged or followed.
      let config;
      try {
        config = await readFile(path.join(runtime, directory, "torrc"), "utf8");
      } catch {
        throw smokeFailure(
          "owned-runtime-config-read",
          "Owned Tor runtime configuration could not be read",
        );
      }
      const matches = [...config.matchAll(/^DataDirectory[ \t]+([^\r\n]+)$/gm)];
      if (matches.length !== 1 || !matches[0][1].trim())
        throw smokeFailure(
          "owned-runtime-data-setting",
          "Owned Tor runtime configuration had an invalid DataDirectory setting",
        );
      settings.push(matches[0][1].trim());
    }
    return settings;
  };
  const dirs = await ownedRuntimeDirectories();
  const initialDataDirectorySettings = await ownedDataDirectorySettings();
  const run = path.join(runtime, dirs.at(-1));
  const port = Number(
    /PORT=127\.0\.0\.1:(\d+)/.exec(
      await readFile(path.join(run, "control.port"), "utf8"),
    )?.[1],
  );
  const cookie = await readFile(path.join(run, "control.cookie"));
  let service;
  const pendingDescriptorEvents = [];
  const recordDescriptor = (event) => {
    if (event.address !== service) return;
    const key = `${event.action}:${event.reason}`;
    result.descriptorStatuses[key] = (result.descriptorStatuses[key] || 0) + 1;
    result.descriptorEvents.push({
      elapsedMs: Date.now() - startedAt,
      stage: result.stage,
      action: event.action,
      reason: event.reason,
    });
    if (result.descriptorEvents.length > 200)
      result.descriptorEvents.splice(1, 1);
    const readiness = result.descriptorReadiness;
    const attempt = readiness?.attempts.at(-1);
    if (readiness?.status === "pending" && event.action === "RECEIVED") {
      readiness.receivedObserved = true;
      if (attempt) {
        attempt.outcome = "received";
        attempt.durationMs = Date.now() - startedAt - attempt.startedAfterMs;
      }
    } else if (
      attempt &&
      attempt.outcome === "pending" &&
      event.action === "FAILED" &&
      event.reason !== "UPLOAD_REJECTED"
    ) {
      attempt.outcome = "descriptor-fetch-failed";
      attempt.reason = event.reason;
      attempt.durationMs = Date.now() - startedAt - attempt.startedAfterMs;
    }
  };
  control = new TorControl(port, (line) => {
    // Retain only event categories for this owned fixture, never addresses,
    // directory identities, descriptor contents, cookies or control replies.
    if (line.startsWith("650 HS_DESC ")) {
      const fields = line.split(" ");
      const action = safeToken(fields[2]);
      const reason = /\bREASON=([A-Z_]{1,32})\b/.exec(line)?.[1] || "NONE";
      if (action) {
        const event = { action, reason, address: fields[3] };
        if (service) recordDescriptor(event);
        else if (pendingDescriptorEvents.length < 100)
          pendingDescriptorEvents.push(event);
      }
    }
    if (line.startsWith("650 STREAM ")) {
      const status = line.split(" ")[3];
      const reason = /\bREASON=([A-Z_]+)\b/.exec(line)?.[1] || "NONE";
      if (/^[A-Z_]{1,32}$/.test(status)) {
        const key = `${status}:${reason}`;
        result.streamStatuses[key] = (result.streamStatuses[key] || 0) + 1;
        result.streamEvents.push({
          elapsedMs: Date.now() - startedAt,
          stage: result.stage,
          attempt: result.loadAttempts,
          status,
          reason,
        });
        if (result.streamEvents.length > 200) result.streamEvents.splice(1, 1);
      }
    }
  });
  await control.command("AUTHENTICATE " + cookie.toString("hex"));
  await control.command("SETEVENTS HS_DESC STREAM");
  const response = await control.command(
    `ADD_ONION NEW:ED25519-V3 Flags=DiscardPK Port=80,127.0.0.1:${fixture.address().port}`,
  );
  service = /ServiceID=([a-z2-7]{56})/.exec(response.join("\n"))?.[1];
  if (!service) throw new Error("Missing controlled onion service");
  pendingDescriptorEvents.forEach(recordDescriptor);
  pendingDescriptorEvents.length = 0;
  const publicationStartedAt = Date.now();
  const publishedDeadline = publicationStartedAt + timeouts.publication;
  const uploadCount = () =>
    Object.entries(result.descriptorStatuses)
      .filter(([key]) => key.startsWith("UPLOADED:"))
      .reduce((count, [, value]) => count + value, 0);
  let nextPublicationProgress = 0;
  while (!uploadCount() && Date.now() < publishedDeadline) {
    if (Date.now() >= nextPublicationProgress) {
      console.log(
        "Owned descriptor publication pending",
        JSON.stringify(result.descriptorStatuses),
      );
      nextPublicationProgress = Date.now() + 15000;
    }
    await sleep(1000);
  }
  result.publicationDurationMs = Date.now() - publicationStartedAt;
  result.descriptorUploadObserved = uploadCount() > 0;
  if (!result.descriptorUploadObserved)
    throw smokeFailure(
      "descriptor-publication-timeout",
      "Owned onion descriptor publication was not observed before the deadline",
    );
  console.log(
    "Owned descriptor upload observed; connection still requires verification",
  );
  if (process.argv.includes("--wait-descriptor")) {
    await checkpoint("owned-descriptor-readiness", "fetch-owned-descriptor");
    const readinessStartedAt = Date.now();
    const readinessDeadline = readinessStartedAt + timeouts.descriptor;
    result.descriptorReadiness = {
      status: "pending",
      receivedObserved: false,
      attempts: [],
    };
    let nextReadinessProgressAt = 0;
    while (
      !result.descriptorReadiness.receivedObserved &&
      Date.now() < readinessDeadline
    ) {
      const previous = result.descriptorReadiness.attempts.at(-1);
      const ageMs = previous
        ? Date.now() - startedAt - previous.startedAfterMs
        : 0;
      // A fresh service can upload to one directory before its client's selected
      // directory has the descriptor. Record failed fetches and space retries;
      // do not turn an upload event into a claim of client descriptor readiness.
      if (
        !previous ||
        (previous.outcome === "descriptor-fetch-failed" && ageMs >= 15000) ||
        ageMs >= 65000
      ) {
        if (previous?.outcome === "pending") {
          previous.outcome = "no-terminal-event-before-refetch";
          previous.durationMs = ageMs;
        }
        const attempt = {
          attempt: result.descriptorReadiness.attempts.length + 1,
          startedAfterMs: Date.now() - startedAt,
          outcome: "pending",
        };
        result.descriptorReadiness.attempts.push(attempt);
        console.log("Owned descriptor fetch attempt", JSON.stringify(attempt));
        // Only the validated random service created above is eligible. Never
        // fetch a browsing URL, fetch descriptor contents, or copy control replies.
        if (!/^[a-z2-7]{56}$/.test(service))
          throw smokeFailure(
            "owned-descriptor-invalid-service",
            "Owned descriptor service identifier was invalid",
          );
        try {
          await control.command(`HSFETCH ${service}`);
        } catch {
          attempt.outcome = "control-command-error";
          attempt.durationMs = Date.now() - startedAt - attempt.startedAfterMs;
          result.descriptorReadiness.status = "control-command-error";
          throw smokeFailure(
            "owned-descriptor-fetch-command-error",
            "Owned descriptor fetch command failed",
          );
        }
      }
      if (Date.now() >= nextReadinessProgressAt) {
        console.log(
          "Owned descriptor readiness pending",
          JSON.stringify({
            elapsedMs: Date.now() - readinessStartedAt,
            attempts: result.descriptorReadiness.attempts,
            descriptorStatuses: result.descriptorStatuses,
          }),
        );
        nextReadinessProgressAt = Date.now() + 15000;
      }
      if (!result.descriptorReadiness.receivedObserved) await sleep(500);
    }
    result.descriptorReadiness.durationMs = Date.now() - readinessStartedAt;
    result.descriptorReadiness.status = result.descriptorReadiness
      .receivedObserved
      ? "received"
      : "timeout";
    if (!result.descriptorReadiness.receivedObserved) {
      const lastAttempt = result.descriptorReadiness.attempts.at(-1);
      if (lastAttempt?.outcome === "pending") {
        lastAttempt.outcome = "readiness-deadline";
        lastAttempt.durationMs =
          Date.now() - startedAt - lastAttempt.startedAfterMs;
      }
      throw smokeFailure(
        "owned-descriptor-readiness-timeout",
        "Owned onion descriptor was not received before the readiness deadline",
      );
    }
    console.log(
      "Owned descriptor receipt observed by fixture daemon; verifying connection next",
    );
  } else {
    result.descriptorReadiness = {
      status: "not-requested",
      receivedObserved: false,
      attempts: [],
    };
  }
  await checkpoint("owned-onion-navigation");
  const state = await shell.evaluate(() => window.raincode.getState());
  const torProfile = state.profiles.find((p) => p.mode === "tor");
  if (!torProfile) throw new Error("Missing Tor profile");
  const url = `http://${service}.onion/`;
  await app.evaluate((_electron, target) => {
    globalThis.__raincodeOwnedTorURL = target;
    globalThis.__raincodeOwnedTorFailureCode = undefined;
  }, url);
  let attemptStartedAt = Date.now();
  let loadDeadline = attemptStartedAt + timeouts.navigation;
  result.loadAttempts = 1;
  let attempt = { attempt: 1, startedAfterMs: attemptStartedAt - startedAt };
  result.navigationAttempts.push(attempt);
  await call({ type: "tab.create", profileId: torProfile.id, url });
  const resolvedProxy = await app.evaluate(
    async ({ session }, { id, url }) =>
      session.fromPartition(`tor:${id}`).resolveProxy(url),
    { id: torProfile.id, url },
  );
  result.proxyIsSocks = /^SOCKS5 127\.0\.0\.1:\d+$/.test(resolvedProxy);
  if (!result.proxyIsSocks)
    throw new Error("Tor session did not select isolated SOCKS5");
  let loaded = false;
  let nextNavigationProgress = 0;
  while (true) {
    const s = await shell.evaluate(() => window.raincode.getState());
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (tab?.title === "RainCode owned onion fixture" && !tab.loading) {
      loaded = true;
      attempt.outcome = "loaded";
      attempt.durationMs = Date.now() - attemptStartedAt;
      break;
    }
    const deadlineExpired = Date.now() >= loadDeadline;
    if (tab?.error || deadlineExpired) {
      const nativeCode = await app.evaluate(
        () => globalThis.__raincodeOwnedTorFailureCode,
      );
      attempt.durationMs = Date.now() - attemptStartedAt;
      attempt.outcome = deadlineExpired
        ? "test-deadline"
        : nativeCode === -7
          ? "native-timeout"
          : "navigation-error";
      if (Number.isSafeInteger(nativeCode)) attempt.nativeCode = nativeCode;
      console.log(
        "Owned fixture navigation attempt failed",
        JSON.stringify(attempt),
      );
      if (
        process.argv.includes("--retry-timeout") &&
        (deadlineExpired || nativeCode === -7) &&
        result.loadAttempts < 2
      ) {
        // Explicit test-only retry of our own service; record it rather than
        // claiming the first navigation succeeded. Production never retries
        // through a different transport or falls back to a direct connection.
        result.loadAttempts++;
        console.log(
          "Explicit owned-fixture timeout retry",
          result.loadAttempts,
        );
        await app.evaluate(() => {
          globalThis.__raincodeOwnedTorFailureCode = undefined;
        });
        attemptStartedAt = Date.now();
        loadDeadline = attemptStartedAt + timeouts.navigation;
        attempt = {
          attempt: result.loadAttempts,
          startedAfterMs: attemptStartedAt - startedAt,
        };
        result.navigationAttempts.push(attempt);
        await call({ type: "action", action: "reload" });
      } else
        throw smokeFailure(
          deadlineExpired || nativeCode === -7
            ? "owned-onion-connection-timeout"
            : "owned-onion-connection-error",
          "Owned onion connection failed after descriptor publication was observed",
        );
    }
    if (Date.now() >= nextNavigationProgress) {
      console.log(
        "Owned fixture connection pending",
        JSON.stringify({
          attempt: result.loadAttempts,
          elapsedMs: Date.now() - attemptStartedAt,
          streamStatuses: result.streamStatuses,
          descriptorStatuses: result.descriptorStatuses,
        }),
      );
      nextNavigationProgress = Date.now() + 15000;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!loaded)
    throw smokeFailure(
      "owned-onion-connection-timeout",
      "Owned onion connection did not finish",
    );
  const page = await app.evaluate(async ({ webContents }, url) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL() === url);
    if (!wc) throw new Error("No onion WebContents");
    return {
      title: wc.getTitle(),
      security: await wc.executeJavaScript(
        "({rtc:typeof RTCPeerConnection,node:typeof process,bridge:typeof window.raincode,frame:window.frameResult})",
      ),
      snapshot: (await wc.capturePage()).toPNG().toString("base64"),
    };
  }, url);
  if (
    page.title !== "RainCode owned onion fixture" ||
    page.security.rtc !== "undefined" ||
    page.security.node !== "undefined" ||
    page.security.bridge !== "undefined"
  )
    throw new Error("Tor page security assertion failed");
  if (page.security.frame?.rtc !== "undefined")
    throw new Error("Tor iframe RTC not disabled");
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/tor-owned-onion.png",
    Buffer.from(page.snapshot, "base64"),
  );
  result.ownedOnionLoaded = true;
  result.title = page.title;
  result.security = page.security;
  const onionTabId = (await shell.evaluate(() => window.raincode.getState()))
    .activeTabId;
  await call({ type: "bookmark.toggle" });
  if (
    !(await shell.evaluate(() => window.raincode.getState())).bookmarks.some(
      (item) => item.url === url,
    )
  )
    throw new Error("Tor bookmark missing");
  await call({ type: "bookmark.toggle" });
  await checkpoint("view-source");
  await call({ type: "action", action: "source" });
  const sourceURL = `view-source:${url}`;
  const sourceDeadline = Date.now() + timeouts.auxiliary;
  let sourceReady = false;
  while (Date.now() < sourceDeadline) {
    const s = await shell.evaluate(() => window.raincode.getState());
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    if (active?.url === sourceURL && !active.loading && !active.error) {
      sourceReady = true;
      break;
    }
    if (active?.error) throw new Error(active.error);
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!sourceReady) throw new Error("Tor view-source timeout");
  const source = await app.evaluate(async ({ webContents }, url) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL() === url);
    if (!wc) throw new Error("Missing Tor source WebContents");
    return wc.executeJavaScript("document.body.innerText");
  }, sourceURL);
  if (!source.includes("Real Tor connection"))
    throw new Error("Tor source does not contain actual fixture HTML");
  result.sourceLoaded = true;
  result.torHistoryAbsent = !(
    await shell.evaluate(() => window.raincode.getState())
  ).history.some((visit) => visit.url.includes(service));
  if (!result.torHistoryAbsent)
    throw new Error("Tor visit entered persistent history");
  await call({ type: "tab.activate", id: onionTabId });
  await checkpoint("tor-search-and-clearnet");
  const waitForURL = async (expected) => {
    const deadline = Date.now() + timeouts.auxiliary;
    while (Date.now() < deadline) {
      const current = await shell.evaluate(() => window.raincode.getState());
      const target = current.tabs.find((tab) => tab.id === current.activeTabId);
      if (target?.error) throw new Error(target.error);
      if (target?.url === expected && !target.loading) {
        if (target.profileId !== torProfile.id)
          throw new Error("Tor navigation changed profile");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Tor search/link navigation timeout");
  };
  await call({
    type: "settings.update",
    settings: { torSearchTemplate: `${url}search?q={query}` },
  });
  const query = "RainCode controlled поиск";
  await call({ type: "navigate", url: query });
  const searchURL = `${url}search?q=${encodeURIComponent(query)}`;
  await waitForURL(searchURL);
  result.torSearchLoaded = true;
  await app.evaluate(async ({ webContents }, target) => {
    const page = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL() === target);
    if (!page) throw new Error("Missing Tor search page");
    await page.executeJavaScript("document.getElementById('next').click()");
  }, searchURL);
  await waitForURL(`${url}next`);
  result.onionLinkLoaded = true;
  const infoResult = await call({
    type: "dev.diagnostics",
    tabId: onionTabId,
    registration: true,
  });
  const info = infoResult.data;
  if (info?.status !== "onion" || info?.addresses?.length)
    throw new Error("Onion diagnostics exposed destination IP");
  result.onionDiagnosticsProtected = true;
  await call({ type: "navigate", url: "https://example.com/" });
  await waitForURL("https://example.com/");
  const clearnetProxy = await app.evaluate(
    ({ session }, id) =>
      session.fromPartition(`tor:${id}`).resolveProxy("https://example.com/"),
    torProfile.id,
  );
  if (!/^SOCKS5 127\.0\.0\.1:\d+$/.test(clearnetProxy))
    throw new Error("Clearnet left Tor proxy");
  result.torClearnetLoaded = true;
  if (process.argv.includes("--default-search")) {
    defaultSearchProfileId = torProfile.id;
    await checkpoint("default-tor-search", "restore-default-template");
    result.defaultTorSearch = {
      status: "not-observed",
      checkpoint: result.checkpoint,
      nativeCode: null,
      ...defaultSearchSnapshot(undefined, torProfile.id),
    };
    try {
      await call({
        type: "settings.update",
        settings: { torSearchTemplate: state.settings.torSearchTemplate },
      });
    } catch {
      throw smokeFailure(
        "default-search-template-error",
        "Default Tor search template could not be restored",
      );
    }
    await checkpoint("default-tor-search", "submit-query");
    result.defaultTorSearch.checkpoint = result.checkpoint;
    try {
      await call({ type: "navigate", url: "Electron official documentation" });
    } catch {
      throw smokeFailure(
        "default-search-submit-error",
        "Default Tor search query command failed",
      );
    }
    await checkpoint("default-tor-search", "wait-for-navigation");
    result.defaultTorSearch.checkpoint = result.checkpoint;
    const searchStartedAt = Date.now();
    const deadline = Date.now() + timeouts.auxiliary;
    let target;
    while (Date.now() < deadline) {
      const current = await shell.evaluate(() => window.raincode.getState());
      target = current.tabs.find((tab) => tab.id === current.activeTabId);
      Object.assign(
        result.defaultTorSearch,
        defaultSearchSnapshot(target, torProfile.id),
        {
          elapsedMs: Date.now() - searchStartedAt,
        },
      );
      if (target?.error)
        throw smokeFailure(
          "default-search-navigation-error",
          "Default Tor search reported a navigation error",
        );
      if (target && !result.defaultTorSearch.profileMatch)
        throw smokeFailure(
          "default-search-profile-mismatch",
          "Default Tor search changed profile",
        );
      if (target && !target.loading && result.defaultTorSearch.hostnameApproved)
        break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await rememberNativeFailures();
    if (!target)
      throw smokeFailure(
        "default-search-tab-missing",
        "Default Tor search has no active tab",
      );
    if (target.loading)
      throw smokeFailure(
        "default-search-navigation-timeout",
        "Default Tor search exceeded the navigation deadline",
      );
    if (!result.defaultTorSearch.hostnameApproved)
      throw smokeFailure(
        "default-search-unexpected-destination",
        "Default Tor search did not reach the approved provider host",
      );
    await checkpoint("default-tor-search", "inspect-document");
    result.defaultTorSearch.checkpoint = result.checkpoint;
    let observed;
    try {
      observed = await app.evaluate(async ({ webContents }, url) => {
        const page = webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === url);
        if (!page) return { pagePresent: false };
        return {
          pagePresent: true,
          data: await page.executeJavaScript(
            `({organic:document.querySelectorAll('.result:not(.result--ad) .result__a').length,challenge:!!document.querySelector('#anomaly-form,.anomaly-modal'),empty:!!document.querySelector('.no-results__message'),visibleAds:[...document.querySelectorAll('.result--ad,[data-testid="serp-popover-promo"],.footer--text_promo')].filter(element=>element.getClientRects().length && getComputedStyle(element).display!=='none').length})`,
          ),
          screenshot: (await page.capturePage()).toPNG().toString("base64"),
        };
      }, target.url);
    } catch {
      throw smokeFailure(
        "default-search-inspection-error",
        "Default Tor search document inspection failed",
      );
    }
    if (!observed.pagePresent)
      throw smokeFailure(
        "default-search-document-missing",
        "Default Tor search document is missing",
      );
    result.defaultTorSearch = {
      ...result.defaultTorSearch,
      status: observed.data.challenge
        ? "challenge"
        : observed.data.organic
          ? "results"
          : observed.data.empty
            ? "empty"
            : "unrecognized",
      organicCount: observed.data.organic,
      challengePresent: observed.data.challenge,
      emptyMessagePresent: observed.data.empty,
      visibleAdSlots: observed.data.visibleAds,
    };
    await checkpoint("default-tor-search", "save-screenshot");
    result.defaultTorSearch.checkpoint = result.checkpoint;
    await writeFile(
      "artifacts/tor-default-search.png",
      Buffer.from(observed.screenshot, "base64"),
    );
    await checkpoint("default-tor-search", "complete");
    result.defaultTorSearch.checkpoint = result.checkpoint;
  }
  await checkpoint("owned-onion-return");
  await call({ type: "navigate", url });
  await waitForURL(url);
  await checkpoint("identity-and-kill");
  if (process.argv.includes("--crash-check")) {
    await checkpoint("daemon-crash");
    // The authenticated control socket belongs to this test's random runtime
    // directory. Never enumerate or terminate unrelated Tor processes.
    // https://spec.torproject.org/control-spec/commands.html#getinfo
    const pidReply = await control.command("GETINFO process/pid");
    const ownedPid = Number(
      /process\/pid=(\d+)/.exec(pidReply.join("\n"))?.[1],
    );
    if (
      !Number.isSafeInteger(ownedPid) ||
      ownedPid <= 1 ||
      ownedPid === process.pid ||
      ownedPid === app.process().pid
    )
      throw new Error("Invalid owned Tor PID");
    process.kill(ownedPid);
    const crashDeadline = Date.now() + 8000;
    while (Date.now() < crashDeadline) {
      if (
        (await shell.evaluate(() => window.raincode.getState())).tor.status ===
        "error"
      )
        break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const crashed = await shell.evaluate(() => window.raincode.getState());
    result.crashDetected = crashed.tor.status === "error";
    result.crashStayedTor =
      crashed.tabs.some(
        (tab) => tab.id === onionTabId && tab.profileId === torProfile.id,
      ) &&
      crashed.profiles.some((p) => p.id === torProfile.id && p.mode === "tor");
    const requestsBefore = ownedFixtureRequests;
    const blocked = await app.evaluate(async ({ webContents }, url) => {
      const wc = webContents
        .getAllWebContents()
        .find((w) => w.getURL() === url);
      if (!wc) throw new Error("Missing owned page after daemon failure");
      const rejected = await wc.executeJavaScript(
        'fetch("/crash-probe", {cache:"no-store"}).then(() => false, () => true)',
      );
      const proxy = await wc.session.resolveProxy(url);
      return {
        rejected,
        socksOnly: /^SOCKS5 127\.0\.0\.1:\d+$/.test(proxy),
        id: wc.id,
      };
    }, url);
    result.crashFetchBlocked =
      blocked.rejected &&
      blocked.socksOnly &&
      ownedFixtureRequests === requestsBefore;
    if (
      !result.crashDetected ||
      !result.crashStayedTor ||
      !result.crashFetchBlocked
    )
      throw new Error(
        "Tor daemon failure did not remain isolated and fail closed",
      );
    control.close();
    await call({ type: "tor.start" });
    const restartStartedAt = Date.now();
    const restartDeadline = restartStartedAt + timeouts.bootstrap;
    let restarted;
    while (Date.now() < restartDeadline) {
      restarted = await shell.evaluate(() => window.raincode.getState());
      rememberBootstrap(restarted.tor);
      if (restarted.tor.status === "ready") break;
      if (restarted.tor.status === "error")
        throw new Error("Tor restart failed");
      await new Promise((r) => setTimeout(r, 500));
    }
    result.crashRestartFreshProfile =
      restarted?.tor.status === "ready" &&
      restarted.profiles.some(
        (p) => p.mode === "tor" && p.id !== torProfile.id,
      ) &&
      (await app.evaluate(
        ({ webContents }, id) => !webContents.fromId(id),
        blocked.id,
      ));
    result.restartBootstrapDurationMs = Date.now() - restartStartedAt;
    const restartedDataDirectorySettings = await ownedDataDirectorySettings();
    result.restartNetworkCacheReused =
      initialDataDirectorySettings.length === 1 &&
      restartedDataDirectorySettings.length === 2 &&
      restartedDataDirectorySettings.every(
        (value) => value === initialDataDirectorySettings[0],
      );
    if (!result.restartNetworkCacheReused)
      throw smokeFailure(
        "restart-network-cache-not-reused",
        "Tor restart did not reuse the owned network cache across two run configurations",
      );
    if (!result.crashRestartFreshProfile)
      throw new Error("Tor restart retained a stale page or profile");
    console.log(
      "Owned daemon crash: detected, blocked fetch, explicit restart with fresh profile",
    );
  }
  await checkpoint("identity-and-kill");
  await call({ type: "tor.circuit" });
  const identityProfileId = (
    await shell.evaluate(() => window.raincode.getState())
  ).profiles.find((p) => p.mode === "tor")?.id;
  await call({ type: "tor.identity" });
  result.identityReplacedProfile =
    (await shell.evaluate(() => window.raincode.getState())).profiles.find(
      (p) => p.mode === "tor",
    )?.id !== identityProfileId;
  await call({
    type: "settings.update",
    settings: { networkKillSwitch: true },
  });
  result.killStoppedTor =
    (await shell.evaluate(() => window.raincode.getState())).tor.status ===
    "stopped";
  const deniedStart = await shell.evaluate(() =>
    window.raincode.command({ type: "tor.start" }),
  );
  result.killBlockedRestart = deniedStart.ok === false;
  if (!result.killStoppedTor || !result.killBlockedRestart)
    throw new Error("Network Kill Switch did not stop and gate Tor");
  await call({
    type: "settings.update",
    settings: { networkKillSwitch: false },
  });
  if (
    (await shell.evaluate(() => window.raincode.getState())).tor.status !==
    "stopped"
  )
    throw new Error("Tor restarted without consent");
  await call({ type: "tor.clear" });
  result.stopped =
    (await shell.evaluate(() => window.raincode.getState())).tor.status ===
    "stopped";
  result.runtimeDataCleared = (await readdir(runtime)).length === 0;
  if (
    !result.stopped ||
    !result.identityReplacedProfile ||
    !result.runtimeDataCleared
  )
    throw new Error("Tor lifecycle cleanup failed");
  await checkpoint("complete");
  result.passed = true;
  result.firstNavigationAttemptPassed =
    result.navigationAttempts[0]?.outcome === "loaded";
  result.elapsedMs = Date.now() - startedAt;
  result.ownedFixtureRequests = ownedFixtureRequests;
  await rememberNativeFailures();
  await writeFile(
    "artifacts/tor-network-smoke.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  // Overwrite stale success evidence even when a public Tor circuit times out.
  // Do not copy control replies, private URLs or credentials into the report.
  result.passed = false;
  result.elapsedMs = Date.now() - startedAt;
  if (
    result.stage === "bootstrap" &&
    result.bootstrapStartedAfterMs !== undefined
  )
    result.bootstrapDurationMs =
      result.elapsedMs - result.bootstrapStartedAfterMs;
  if (shell) {
    try {
      const current = await shell.evaluate(() => window.raincode.getState());
      rememberBootstrap(current.tor);
      if (result.stage === "default-tor-search" && result.defaultTorSearch) {
        const target = current.tabs.find(
          (tab) => tab.id === current.activeTabId,
        );
        Object.assign(
          result.defaultTorSearch,
          defaultSearchSnapshot(target, defaultSearchProfileId),
        );
      }
    } catch {
      // Preserve the last observed status if the renderer has already exited.
    }
  }
  try {
    await rememberNativeFailures();
  } catch {
    /* Preserve prior diagnostic events. */
  }
  result.failure = {
    kind: safeToken(error?.smokeKind) || "test-or-application-error",
    message:
      error?.safeMessage ||
      "Test or application failed; raw error omitted for privacy",
    stage: result.stage,
    checkpoint: result.checkpoint,
  };
  result.ownedFixtureRequests = ownedFixtureRequests;
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/tor-network-smoke.json",
    JSON.stringify(result, null, 2),
  );
  console.error("Tor smoke failure", JSON.stringify(result));
  throw new Error(
    `Tor smoke failed during ${result.stage}: ${result.failure.kind}`,
  );
} finally {
  control?.close();
  await app?.close();
  fixture.closeAllConnections();
  await new Promise((r) => fixture.close(r));
  if (
    path.dirname(path.resolve(profile)) !== path.resolve(tmpdir()) ||
    !path.basename(profile).startsWith("raincode-tor-network-")
  )
    throw new Error("Refusing cleanup outside owned temporary profile");
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 300,
  });
}
