import { describe, expect, it } from "vitest";
import {
  defaultPrivacyConfig,
  privacyConfigSchema,
  resolvePrivacyPolicy,
} from "../../src/shared/privacy-policy";
import {
  classifyNetworkSource,
  decideTrackerRequest,
  javascriptEnabled,
  shouldStripCrossOriginCookies,
  stripCookieHeaders,
  stripCrossOriginReferrer,
} from "../../src/main/privacy-policy";

const origin = "https://example.com";

describe("privacy policy", () => {
  it("does not disclose cross-origin referring pages in Tor", () => {
    const headers = {
      Referer: "https://private.example/path?secret=value",
      Accept: "text/html",
    };
    expect(stripCrossOriginReferrer(headers, "https://other.example/")).toEqual(
      { Accept: "text/html" },
    );
    expect(
      stripCrossOriginReferrer(headers, "wss://private.example/socket"),
    ).toEqual(headers);
    expect(
      stripCrossOriginReferrer({ referer: "invalid" }, "https://other.example"),
    ).toEqual({});
    expect(
      stripCrossOriginReferrer(headers, "http://private.example/"),
    ).toEqual({ Accept: "text/html" });
    expect(headers.Referer).toContain("secret=value");
  });
  it.each(["", "null", "not an origin"])(
    "does not bypass known tracker rules when a worker's origin is unavailable: %s",
    (source) => {
      const policy = resolvePrivacyPolicy(defaultPrivacyConfig, source);
      expect(
        decideTrackerRequest(
          "https://stats.google-analytics.com/collect",
          source,
          false,
          policy,
          ["example.com"],
        ),
      ).toMatchObject({ action: "block", category: "analytics" });
      expect(
        decideTrackerRequest(
          "https://doubleclick.net/ad",
          source,
          false,
          policy,
        ),
      ).toMatchObject({ action: "block", category: "advertising" });
      expect(
        decideTrackerRequest(
          "https://news.example/article",
          source,
          false,
          policy,
        ),
      ).toEqual({ action: "allow" });
      expect(
        decideTrackerRequest("https://doubleclick.net/ad", source, false, {
          ...policy,
          trackers: "allow",
        }),
      ).toEqual({ action: "allow" });
    },
  );
  it("has honest, distinct standard/strict/maximum defaults", () => {
    const standard = resolvePrivacyPolicy(defaultPrivacyConfig, origin);
    const strict = resolvePrivacyPolicy(
      { ...defaultPrivacyConfig, level: "strict" },
      origin,
    );
    const maximum = resolvePrivacyPolicy(
      { ...defaultPrivacyConfig, level: "maximum" },
      origin,
    );
    expect(standard).toMatchObject({
      trackers: "block",
      crossOriginCookies: "allow",
      javascript: "allow",
    });
    expect(strict).toMatchObject({
      trackers: "block",
      crossOriginCookies: "block",
      javascript: "allow",
    });
    expect(maximum).toMatchObject({
      trackers: "block",
      crossOriginCookies: "block",
      javascript: "block",
    });
    expect(javascriptEnabled(maximum)).toBe(false);
  });

  it("scopes exceptions to exact origin and supports user JS/cookie choices", () => {
    const config = {
      level: "maximum" as const,
      siteOverrides: [
        {
          origin,
          javascript: "allow" as const,
          crossOriginCookies: "allow" as const,
          trackers: "allow" as const,
        },
      ],
    };
    expect(resolvePrivacyPolicy(config, origin)).toMatchObject({
      trackers: "allow",
      crossOriginCookies: "allow",
      javascript: "allow",
    });
    expect(
      resolvePrivacyPolicy(config, "https://sub.example.com").javascript,
    ).toBe("block");
  });

  it("rejects paths, credentials, non-web origins and unbounded overrides", () => {
    for (const invalid of [
      "https://example.com/path",
      "https://u:p@example.com",
      "file:///etc/passwd",
      "null",
    ]) {
      expect(
        privacyConfigSchema.safeParse({
          level: "standard",
          siteOverrides: [{ origin: invalid }],
        }).success,
      ).toBe(false);
    }
  });

  it("blocks only known bundled hosts and honors tracker exceptions", () => {
    const policy = resolvePrivacyPolicy(defaultPrivacyConfig, origin);
    expect(
      decideTrackerRequest(
        "https://stats.google-analytics.com/collect",
        origin,
        false,
        policy,
      ),
    ).toMatchObject({ action: "block", category: "analytics" });
    expect(
      decideTrackerRequest("https://news.example/a", origin, false, policy),
    ).toEqual({ action: "allow" });
    expect(
      decideTrackerRequest(
        "https://stats.google-analytics.com/collect",
        origin,
        false,
        policy,
        ["example.com"],
      ),
    ).toEqual({ action: "allow" });
  });

  it("strips cross-origin Cookie and Set-Cookie without mutating other headers", () => {
    const policy = resolvePrivacyPolicy(
      { ...defaultPrivacyConfig, level: "strict" },
      origin,
    );
    expect(
      shouldStripCrossOriginCookies(
        "https://other.example/path",
        origin,
        policy,
      ),
    ).toBe(true);
    expect(
      shouldStripCrossOriginCookies("https://example.com/path", origin, policy),
    ).toBe(false);
    expect(
      shouldStripCrossOriginCookies("wss://example.com/socket", origin, policy),
    ).toBe(false);
    expect(
      shouldStripCrossOriginCookies(
        "wss://other.example/socket",
        origin,
        policy,
      ),
    ).toBe(true);
    expect(
      shouldStripCrossOriginCookies("wss://example.com/socket", "", policy),
    ).toBe(true);
    expect(
      shouldStripCrossOriginCookies("https://other.example/path", "", policy),
    ).toBe(true);
    expect(
      shouldStripCrossOriginCookies(
        "https://other.example/path",
        "not-a-url",
        policy,
      ),
    ).toBe(true);
    expect(shouldStripCrossOriginCookies("file:///tmp/test", "", policy)).toBe(
      false,
    );
    const request = { cOoKiE: "secret=1", Authorization: "keep" };
    const response = { "sEt-CoOkIe": ["secret=1"], Location: "keep" };
    expect(stripCookieHeaders(request, "request")).toEqual({
      Authorization: "keep",
    });
    expect(stripCookieHeaders(response, "response")).toEqual({
      Location: "keep",
    });
    expect(request.cOoKiE).toBe("secret=1");
  });

  it("never describes an unattributed Chromium request as shell or site traffic", () => {
    expect(classifyNetworkSource(undefined, "raincode-app://ui")).toBe(
      "unattributed",
    );
    expect(
      classifyNetworkSource("raincode-app://ui/x", "raincode-app://ui"),
    ).toBe("browser-shell");
    expect(
      classifyNetworkSource("https://example.com", "raincode-app://ui"),
    ).toBe("visited-site");
  });
});
