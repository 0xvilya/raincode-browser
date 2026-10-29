import { _electron as electron } from "@playwright/test";
import http from "node:http";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const userData = await mkdtemp(path.join(tmpdir(), "raincode-https-smoke-"));
const env = {
  ...process.env,
  RAINCODE_USER_DATA: userData,
  RAINCODE_TEST: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  ...(process.env.RAINCODE_EXECUTABLE
    ? { executablePath: process.env.RAINCODE_EXECUTABLE }
    : {}),
  args: process.env.RAINCODE_EXECUTABLE
    ? [`--user-data-dir=${userData}`]
    : [path.resolve("dist-electron/main.cjs")],
  env,
  timeout: 30_000,
});
app.process().stderr.on("data", (chunk) => process.stderr.write(chunk));
const results = [];
try {
  const shell = await app.firstWindow();
  await shell.waitForFunction(() => Boolean(window.raincode));
  await shell.waitForSelector(".home-page");
  // Reproduce the reported appearance in this disposable smoke profile.
  await shell.evaluate(() =>
    window.raincode.command({
      type: "settings.update",
      settings: {
        rain: "cinematic",
        theme: "amber",
        fontSize: 16,
        fps: 30,
        motionPreference: "full",
        powerSave: false,
      },
    }),
  );
  const nativeWindow = await app.browserWindow(shell);
  await nativeWindow.evaluate((window) => {
    window.show();
    window.focus();
    window.webContents.focus();
  });
  await shell.waitForFunction(
    () => document.querySelector(".rain-canvas")?.dataset.running === "true",
  );
  await shell.evaluate(async () => {
    const source = getComputedStyle(
      document.querySelector(".scene"),
    ).backgroundImage;
    const url = /^url\(["']?(.*?)["']?\)$/.exec(source)?.[1];
    if (!url) throw new Error("Missing London Rain scene");
    const image = new Image();
    image.src = url;
    await image.decode();
  });
  await mkdir("artifacts", { recursive: true });
  const browserState = await shell.evaluate(() => window.raincode.getState());
  if (process.env.RAINCODE_EXECUTABLE) {
    const expected = JSON.parse(await readFile("package.json", "utf8")).version;
    if (browserState.appVersion !== expected)
      throw new Error("Installed application version mismatch");
  }
  await writeFile(
    "artifacts/production-smoke-info.json",
    JSON.stringify(
      {
        version: browserState.appVersion,
        bundledTor: browserState.tor?.bundled,
        appearance: {
          rain: browserState.settings.rain,
          motionPreference: browserState.settings.motionPreference,
          fontSize: browserState.settings.fontSize,
        },
        httpsOnly: browserState.settings.httpsOnly,
      },
      null,
      2,
    ),
  );
  await shell.screenshot({ path: "artifacts/home.png" });
  for (const url of [
    "https://example.com/",
    "https://developer.mozilla.org/en-US/",
  ]) {
    const result = await shell.evaluate(
      (target) => window.raincode.command({ type: "tab.create", url: target }),
      url,
    );
    if (!result.ok) throw new Error(result.error);
    const deadline = Date.now() + 45_000;
    let tab;
    while (Date.now() < deadline) {
      const current = await shell.evaluate(() => window.raincode.getState());
      tab = current.tabs.find((item) => item.id === current.activeTabId);
      if (
        tab &&
        !tab.loading &&
        (tab.error || tab.url.startsWith(new URL(url).origin))
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!tab || tab.loading) throw new Error("HTTPS navigation timed out");
    if (tab.error)
      throw new Error(
        `HTTPS load failed for ${new URL(url).host}: ${tab.error}`,
      );
    const page = await app.evaluate(async ({ webContents }, target) => {
      const contents = webContents
        .getAllWebContents()
        .find((item) => item.getURL() === target);
      if (!contents) throw new Error("Missing native WebContents");
      return {
        title: contents.getTitle(),
        url: contents.getURL(),
        node: await contents.executeJavaScript("typeof process"),
        bridge: await contents.executeJavaScript("typeof window.raincode"),
        screenshot: (await contents.capturePage()).toPNG().toString("base64"),
      };
    }, tab.url);
    const expectedTitle =
      new URL(url).host === "example.com" ? "Example Domain" : "MDN Web Docs";
    if (
      !page.title.includes(expectedTitle) ||
      page.node !== "undefined" ||
      page.bridge !== "undefined"
    )
      throw new Error("HTTPS page content or isolation assertion failed");
    await writeFile(
      `artifacts/${new URL(url).host}.png`,
      Buffer.from(page.screenshot, "base64"),
    );
    results.push({
      url: page.url,
      title: page.title,
      node: page.node,
      bridge: page.bridge,
    });
    console.log(JSON.stringify(results.at(-1)));
  }
  await writeFile(
    "artifacts/https-smoke.json",
    JSON.stringify(results, null, 2),
  );
  if (process.argv.includes("--diagnostics")) {
    await writeFile(
      "artifacts/site-diagnostics-smoke.json",
      JSON.stringify(
        {
          version: browserState.appVersion,
          passed: false,
          stage: "live-lookup",
          capturedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    const diagnostic = await shell.evaluate(() =>
      window.raincode.command({ type: "dev.diagnostics", registration: true }),
    );
    if (
      !diagnostic.ok ||
      diagnostic.data?.status !== "resolved" ||
      diagnostic.data?.registrationStatus !== "available" ||
      !diagnostic.data?.network?.asns?.length
    )
      throw new Error("Live site DNS/RIPEstat diagnostics failed");
    await writeFile(
      "artifacts/site-diagnostics-smoke.json",
      JSON.stringify(
        {
          version: browserState.appVersion,
          passed: true,
          publicIPCount: diagnostic.data.addresses.length,
          asns: diagnostic.data.network.asns,
          provider: diagnostic.data.network.provider,
          holder: diagnostic.data.network.holder,
        },
        null,
        2,
      ),
    );
  }
  if (process.env.RAINCODE_EXECUTABLE) {
    await shell.evaluate(async () => {
      await window.raincode.command({
        type: "tab.create",
        url: "raincode://newtab",
        profileId: "default",
      });
      const state = await window.raincode.getState();
      for (const tab of state.tabs)
        if (tab.id !== state.activeTabId)
          await window.raincode.command({ type: "tab.close", id: tab.id });
      await window.raincode.command({ type: "history.clear" });
    });
  }
  if (process.argv.includes("--ui-check")) {
    const fixture = http.createServer((_request, response) => {
      response.writeHead(404, { "Content-Type": "text/html;charset=utf-8" });
      response.end(
        "<!doctype html><title>Owned missing-page response</title>Owned404fixture",
      );
    });
    fixture.listen(0, "127.0.0.1");
    await once(fixture, "listening");
    try {
      const address = fixture.address();
      if (!address || typeof address === "string")
        throw new Error("Fixture port");
      await shell.evaluate(
        (url) => window.raincode.command({ type: "tab.create", url }),
        `http://127.0.0.1:${address.port}/missing`,
      );
      await shell
        .getByRole("heading", { name: "Страница не найдена", exact: true })
        .waitFor();
      await shell.screenshot({ path: "artifacts/not-found.png" });
      await shell.evaluate(() =>
        window.raincode.command({
          type: "tab.create",
          url: "raincode://devpanel",
        }),
      );
      await shell
        .getByRole("region", { name: "IP и сеть сайта", exact: true })
        .getByRole("button", { name: "Определить IP", exact: true })
        .click();
      await shell
        .getByRole("region", { name: "IP и сеть сайта", exact: true })
        .getByText("127.0.0.1", { exact: true })
        .last()
        .waitFor();
      await shell.screenshot({ path: "artifacts/developer-panel.png" });
    } finally {
      fixture.closeAllConnections();
      await new Promise((resolve) => fixture.close(resolve));
    }
  }
} finally {
  await app.close();
  await rm(userData, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 300,
  });
}
