import { describe, expect, it } from "vitest";
import {
  commandSchema,
  defaultSettings,
  settingsSchema,
} from "../../src/shared/contracts";

describe("typed IPC runtime boundary", () => {
  it.each([
    "localhost:",
    "[::1",
    "127.0.0.1:80",
    "0x7f000001",
    "proxy;direct://",
  ])("rejects ambiguous proxy endpoint %s", (host) => {
    expect(
      commandSchema.safeParse({
        type: "proxy.update",
        profileId: "owned",
        proxy: { scheme: "http", host, port: 8080, bypassLocal: false },
      }).success,
    ).toBe(false);
  });
  it.each(["::1", "[0:0:0:0:0:0:0:1]"])(
    "normalizes valid IPv6 proxy endpoints without dropping protection: %s",
    (host) => {
      const command = commandSchema.parse({
        type: "proxy.update",
        profileId: "owned",
        proxy: { scheme: "socks5", host, port: 1080, bypassLocal: false },
      });
      expect(command.type === "proxy.update" && command.proxy.host).toBe(
        "[::1]",
      );
    },
  );
  it.each(["localhost", "proxy.example", "127.0.0.1", "[::1]"])(
    "accepts canonical proxy endpoint %s",
    (host) => {
      expect(
        commandSchema.safeParse({
          type: "proxy.update",
          profileId: "owned",
          proxy: { scheme: "socks5", host, port: 1080, bypassLocal: false },
        }).success,
      ).toBe(true);
    },
  );
  it("never adds migration defaults to a partial settings IPC update", () => {
    for (const settings of [
      {},
      { rain: "cinematic" },
      { fontSize: 16 },
      { networkKillSwitch: true },
    ]) {
      expect(
        commandSchema.parse({ type: "settings.update", settings }),
      ).toEqual({ type: "settings.update", settings });
    }
    const migrated = settingsSchema.parse({
      ...defaultSettings,
      httpsOnly: undefined,
      motionPreference: undefined,
    });
    expect(migrated.httpsOnly).toBe(true);
    expect(migrated.motionPreference).toBe("system");
  });
  it("accepts supported commands and default settings", () => {
    expect(
      commandSchema.parse({ type: "tab.create", url: "https://example.com" }),
    ).toEqual({ type: "tab.create", url: "https://example.com" });
    expect(settingsSchema.parse(defaultSettings)).toEqual(defaultSettings);
    expect(
      commandSchema.parse({
        type: "settings.update",
        settings: { rain: "off", fps: 15 },
      }),
    ).toBeTruthy();
  });

  it.each([
    { type: "exec", command: "powershell.exe" },
    { type: "tab.create", nodeIntegration: true },
    { type: "action", action: "openExternal" },
    { type: "tab.update", id: "tab", url: "javascript:alert(1)" },
    { type: "settings.update", settings: { allowInsecureContent: true } },
    { type: "profile.create", name: "Tor", mode: "tor" },
    { type: "layout", bounds: { x: -1, y: 0, width: 100, height: 100 } },
    { type: "download.reveal", id: "" },
    null,
    ["tab.create"],
  ])("rejects unrecognized or malformed payload %j", (payload) => {
    expect(commandSchema.safeParse(payload).success).toBe(false);
  });

  it.each([
    {
      scheme: "socks5",
      host: "127.0.0.1; calc.exe",
      port: 9050,
      bypassLocal: false,
    },
    { scheme: "socks5", host: "127.0.0.1", port: 0, bypassLocal: false },
    {
      scheme: "http",
      host: "proxy.example.com",
      port: 65536,
      bypassLocal: false,
    },
    {
      scheme: "https",
      host: "proxy.example.com",
      port: 443,
      bypassLocal: false,
      password: "secret",
    },
  ])("rejects unsafe proxy configuration %j", (proxy) => {
    expect(
      commandSchema.safeParse({
        type: "profile.create",
        name: "Proxy",
        mode: "proxy",
        proxy,
      }).success,
    ).toBe(false);
  });

  it("limits attacker-controlled input sizes", () => {
    expect(
      commandSchema.safeParse({ type: "navigate", url: "x".repeat(8193) })
        .success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: "notes.save",
        notes: "x".repeat(100001),
        snippets: "",
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: "tab.reorder",
        ids: Array.from({ length: 101 }, (_, i) => `${i}`),
      }).success,
    ).toBe(false);
  });

  it.each(["off", "low", "medium", "high", "cinematic"])(
    "supports rain quality %s",
    (rain) => {
      expect(
        commandSchema.safeParse({ type: "settings.update", settings: { rain } })
          .success,
      ).toBe(true);
    },
  );

  it.each([
    { fps: 0 },
    { fps: 61 },
    { fps: 29.5 },
    { brightness: 0 },
    { fontSize: 100 },
  ])("rejects unbounded animation/UI values %j", (settings) => {
    expect(
      commandSchema.safeParse({ type: "settings.update", settings }).success,
    ).toBe(false);
  });
});
