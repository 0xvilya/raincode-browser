import { describe, expect, it } from "vitest";
import {
  isV3OnionHost,
  normalizeNavigation,
  safeWebURL,
} from "../../src/main/security";
import { torRequestAllowed } from "../../src/main/tor-policy";
import { fixtureOnion } from "./fixture-onion";

const onion = fixtureOnion();
const search = "https://example.test/search?q={query}";

describe("v3 onion validation and transport boundary", () => {
  it("accepts checksum-valid v3 names, uppercase and onion subdomains", () => {
    expect(isV3OnionHost(onion)).toBe(true);
    expect(isV3OnionHost(onion.toUpperCase())).toBe(true);
    expect(isV3OnionHost(`docs.${onion}`)).toBe(true);
    expect(isV3OnionHost(`${onion}.`)).toBe(true);
  });
  it.each([
    `${"a".repeat(16)}.onion`,
    `${"a".repeat(56)}.onion`,
    `z${onion.slice(1)}`,
    onion.replace(/\.onion$/, ".example"),
    `${"0".repeat(56)}.onion`,
    "onion",
  ])("rejects legacy, invalid alphabet/version/checksum hosts: %s", (host) => {
    expect(isV3OnionHost(host)).toBe(false);
  });
  it("only admits onion navigation under the explicit Tor profile", () => {
    for (const mode of ["direct", "private", "proxy"] as const) {
      expect(safeWebURL(`http://${onion}/`, mode)).toBe(false);
      expect(() => normalizeNavigation(onion, search, mode)).toThrow(
        "TOR_UNAVAILABLE",
      );
    }
    expect(safeWebURL(`http://${onion}/`, "tor")).toBe(true);
    expect(normalizeNavigation(onion, search, "tor")).toBe(`http://${onion}/`);
    expect(safeWebURL(`http://${"a".repeat(56)}.onion/`, "tor")).toBe(false);
    expect(safeWebURL(`http://user:secret@${onion}/`, "tor")).toBe(false);
  });
  it("fails closed for every request until the daemon is ready", () => {
    for (const input of [
      `http://${onion}/`,
      "https://example.test/",
      "wss://example.test/socket",
    ])
      expect(torRequestAllowed(input, false)).toBe(false);
    expect(torRequestAllowed(`http://${onion}/`, true)).toBe(true);
    expect(torRequestAllowed("https://example.test/", true)).toBe(true);
    expect(torRequestAllowed("wss://example.test/socket", true)).toBe(true);
  });
  it.each([
    "file:///C:/Windows/win.ini",
    "javascript:alert(1)",
    "ftp://example.test/",
    "https://user:password@example.test/",
    "http://localhost/",
    "http://sub.localhost/",
    "http://host.local/",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.0.1/",
    "http://169.254.169.254/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fd00::1]/",
    "http://[ff02::1]/",
    "https://[ff05::2]/",
    "http://[ff0e::101]/",
    "http://224.0.0.1/",
    "invalid",
    `http://${"a".repeat(56)}.onion/`,
  ])("blocks unsafe URLs, local networks and malformed onion: %s", (input) => {
    expect(torRequestAllowed(input, true)).toBe(false);
  });
});
