import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { command, expect, open, pageContentsId, test } from "./fixtures";

test("strict minimizes high-entropy hints on the wire while standard preserves a positive control", async ({
  rainBrowser: { app, shell },
}) => {
  const observed = new Map<string, http.IncomingHttpHeaders>();
  const server = http.createServer((request, response) => {
    observed.set(request.url || "/", request.headers);
    response.setHeader("Content-Type", "text/html");
    response.setHeader("Accept-CH", "Sec-CH-UA-Arch, Device-Memory");
    response.setHeader("Critical-CH", "Sec-CH-UA-Arch");
    response.end(
      "<!doctype html><title>Owned hint fixture</title><h1>Hints</h1>",
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const hints = {
    "Sec-CH-UA-Arch": '"x86"',
    "Sec-CH-UA-Bitness": '"64"',
    "Sec-CH-UA-Full-Version": '"fixture-version"',
    "Sec-CH-UA-Full-Version-List": '"fixture-browser";v="fixture-version"',
    "Sec-CH-UA-Model": '"fixture-device"',
    "Sec-CH-UA-Platform-Version": '"fixture-platform-version"',
    "Sec-CH-UA-WoW64": "?0",
    "Sec-CH-UA-Form-Factors": '"Desktop"',
    "Device-Memory": "8",
    DPR: "2",
    "Viewport-Width": "1280",
    Width: "640",
    RTT: "50",
    Downlink: "10",
    ECT: "4g",
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "X-Owned-Control": "preserved",
  };
  try {
    await open(shell, `${origin}/standard`);
    let id = await pageContentsId(app, `${origin}/standard`);
    const jsAgent = await app.evaluate(
      ({ webContents }, id) =>
        webContents.fromId(id)!.executeJavaScript("navigator.userAgent"),
      id,
    );
    expect(jsAgent).toBe(observed.get("/standard")!["user-agent"]);
    expect(jsAgent).not.toMatch(/Electron|raincode/i);
    expect(jsAgent).toMatch(/Chrome\//);
    const fetchOwned = (contentsId: number, phase: string) =>
      app.evaluate(
        async ({ webContents }, args) => {
          const response = await webContents
            .fromId(args.id)!
            .session.fetch(args.url, {
              headers: args.headers,
              redirect: "error",
            });
          await response.text();
          return {
            acceptCH: response.headers.get("Accept-CH"),
            criticalCH: response.headers.get("Critical-CH"),
          };
        },
        { id: contentsId, url: `${origin}/${phase}`, headers: hints },
      );
    const standard = await fetchOwned(id, "probe-standard");
    expect(standard.acceptCH).toContain("Sec-CH-UA-Arch");
    expect(standard.criticalCH).toBe("Sec-CH-UA-Arch");
    const control = observed.get("/probe-standard")!;
    // Positive controls prove these headers reached the owned TCP receiver.
    for (const [name, value] of Object.entries(hints))
      expect(control[name.toLowerCase()], name).toBe(value);

    await command(shell, {
      type: "settings.update",
      settings: { privacy: { level: "strict", siteOverrides: [] } },
    });
    await open(shell, `${origin}/strict`);
    id = await pageContentsId(app, `${origin}/strict`);
    const strict = await fetchOwned(id, "probe-strict");
    expect(strict).toEqual({ acceptCH: null, criticalCH: null });
    const minimized = observed.get("/probe-strict")!;
    for (const name of Object.keys(hints)) {
      const key = name.toLowerCase();
      if (
        ["sec-ch-ua-mobile", "sec-ch-ua-platform", "x-owned-control"].includes(
          key,
        )
      )
        expect(minimized[key], name).toBe(hints[name as keyof typeof hints]);
      else expect(minimized[key], name).toBeUndefined();
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
