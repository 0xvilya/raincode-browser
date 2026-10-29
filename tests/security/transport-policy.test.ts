import { describe, expect, it } from "vitest";
import { secureTransport } from "../../src/main/transport-policy";
import { fixtureOnion } from "../tor/fixture-onion";

describe("HTTPS-only transport", () => {
  it.each(["direct", "private", "proxy", "tor"] as const)(
    "upgrades before sending a public HTTP request in %s",
    (mode) => {
      expect(
        secureTransport("http://example.test/path?q=a", "GET", mode, true),
      ).toEqual({ redirectURL: "https://example.test/path?q=a" });
      expect(
        secureTransport("http://example.test:8080/", "HEAD", mode, true),
      ).toEqual({ redirectURL: "https://example.test:8080/" });
      for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
        expect(
          secureTransport("http://example.test/", method, mode, true),
        ).toEqual({ cancel: true });
      expect(
        secureTransport("ws://example.test/socket", "GET", mode, true),
      ).toEqual({ cancel: true });
    },
  );
  it.each([
    "http://localhost:3000",
    "http://dev.localhost:3000",
    "http://127.0.0.1:8080",
    "http://[::1]:8000",
    "ws://127.0.0.1/socket",
  ])("allows explicit loopback development: %s", (url) => {
    expect(secureTransport(url, "POST", "direct", true)).toEqual({});
  });
  it.each([
    "http://localhost.evil.test/",
    "http://127.0.0.1.evil.test/",
    "http://192.168.1.1/",
    "http://10.0.0.1/",
  ])("does not exempt LAN or lookalikes: %s", (url) => {
    expect(secureTransport(url, "POST", "direct", true)).toEqual({
      cancel: true,
    });
  });
  it("retains TLS and valid Tor onion end-to-end encryption", () => {
    expect(
      secureTransport("https://example.test/", "POST", "direct", true),
    ).toEqual({});
    expect(
      secureTransport("wss://example.test/", "GET", "direct", true),
    ).toEqual({});
    expect(
      secureTransport(`http://${fixtureOnion(1)}/`, "POST", "tor", true),
    ).toEqual({});
    expect(
      secureTransport("http://facebook.onion/", "POST", "tor", true),
    ).toEqual({ cancel: true });
  });
  it("only permits public plaintext when explicitly disabled", () => {
    expect(
      secureTransport("http://example.test/", "POST", "direct", false),
    ).toEqual({});
    expect(
      secureTransport("ws://example.test/", "GET", "direct", false),
    ).toEqual({});
  });
});
