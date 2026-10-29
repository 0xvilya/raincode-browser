import { describe, expect, it } from "vitest";
import {
  advertisingHosts,
  cosmeticCSSForURL,
  duckDuckGoOnionHost,
  isDuckDuckGoSearchURL,
  shouldBlockAdvertisement,
} from "../../src/main/content-policy";

describe("transparent local advertising protection", () => {
  it.each([
    "https://doubleclick.net/ad.js",
    "https://googleads.g.doubleclick.net/pagead/ads",
    "http://ads.pubmatic.com/ad",
    "https://DOUBLECLICK.NET.:443/ad",
    "https://%64oubleclick.net/ad",
    "https://doubleclick。net/ad",
    "wss://ib.adnxs.com/socket",
  ])("blocks a canonical advertising service and subdomain: %s", (input) => {
    expect(shouldBlockAdvertisement(input, true)).toBe(true);
    expect(shouldBlockAdvertisement(input, false)).toBe(false);
  });

  it.each([
    "https://doubleclick.net.evil.test/",
    "https://notdoubleclick.net/",
    "https://doubleclick.net@publisher.test/",
    "https://publisher.test/?next=https://doubleclick.net/ad",
    "https://publisher.test/articles/ad-blocking",
    "https://duckduckgo.com/?q=advertising",
    `http://${duckDuckGoOnionHost}/?q=advertising`,
    "https://pubmatic.com/",
    "https://github.com/",
    "data:text/html,https://doubleclick.net/",
    "not a URL",
  ])("preserves ordinary navigation, onion and lookalikes: %s", (input) => {
    expect(shouldBlockAdvertisement(input, true)).toBe(false);
  });

  it("bundles a small inspectable list without remote subscriptions or keywords", () => {
    expect(advertisingHosts.length).toBeLessThan(30);
    expect(advertisingHosts.every((host) => /^[a-z0-9.-]+$/.test(host))).toBe(
      true,
    );
    expect(advertisingHosts.some((host) => host.endsWith(".onion"))).toBe(
      false,
    );
  });
});

describe("cosmetic promotion/advertisement suppression", () => {
  it.each([
    "https://duckduckgo.com/?q=raincode",
    "https://duckduckgo.com./?q=raincode",
    "https://html.duckduckgo.com/html/?q=raincode",
    `https://${duckDuckGoOnionHost}/?q=raincode`,
  ])("scopes provider promotions to known search origins: %s", (input) => {
    expect(isDuckDuckGoSearchURL(input)).toBe(true);
    const css = cosmeticCSSForURL(input, true);
    expect(css).toContain('[data-testid="serp-popover-promo"]');
    expect(css).toContain(".result--ad");
    expect(css).toContain(".footer--text_promo");
    expect(css).not.toContain(".result__a");
    expect(css).not.toContain('[data-testid="result"]');
    expect(css).not.toContain('[class*="ad"]');
  });

  it.each([
    "https://duckduckgo.com.evil.test/?q=raincode",
    "https://duckduckgo.com/windows?q=raincode",
    "https://duckduckgo.com/duckduckgo-help-pages/?q=raincode",
    "https://publisher.test/?q=raincode",
    "https://duckduckgo.com/",
  ])(
    "does not hide provider-looking content on unrelated pages: %s",
    (input) => {
      expect(isDuckDuckGoSearchURL(input)).toBe(false);
      expect(cosmeticCSSForURL(input, true)).not.toContain(".result--ad");
      expect(cosmeticCSSForURL(input, true)).not.toContain(
        "serp-popover-promo",
      );
    },
  );

  it("can be fully disabled and never injects script or external CSS assets", () => {
    expect(cosmeticCSSForURL("https://duckduckgo.com/?q=raincode", false)).toBe(
      "",
    );
    expect(cosmeticCSSForURL("data:text/html,anything", true)).toBe("");
    const css = cosmeticCSSForURL("https://duckduckgo.com/?q=raincode", true);
    expect(css).not.toMatch(/@import|url\(|<script|javascript:/i);
  });
});
