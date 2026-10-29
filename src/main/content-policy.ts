/**
 * Small, explicit, locally bundled advertising rules written for RainCode.
 * No remote subscriptions, user tracking, topic filtering or search ranking.
 * These are service hosts rather than keywords in URLs or page content.
 */
export const advertisingHosts = Object.freeze([
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "adservice.google.com",
  "adnxs.com",
  "ads.pubmatic.com",
  "adsrvr.org",
  "adform.net",
  "casalemedia.com",
  "rubiconproject.com",
  "openx.net",
  "criteo.net",
  "smartadserver.com",
  "amazon-adsystem.com",
]);
export const analyticsHosts = Object.freeze([
  "google-analytics.com",
  "analytics.google.com",
  "scorecardresearch.com",
  "hotjar.com",
  "mouseflow.com",
  "clarity.ms",
  "fullstory.com",
  "segment.io",
]);
export function siteHost(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase().replace(/\.+$/, "");
  } catch {
    return "";
  }
}
export function classifyTrackerRequest(
  input: string,
  source: string,
  mainFrame: boolean,
  enabled: boolean,
  exceptions: readonly string[],
) {
  if (!enabled || exceptions.includes(source)) return undefined;
  const url = webURL(input);
  if (!url) return undefined;
  const host = siteHost(url.href);
  const matches = (rule: string) => host === rule || host.endsWith(`.${rule}`);
  const ad = advertisingHosts.find(matches);
  if (ad) return { rule: ad, category: "advertising" as const };
  if (mainFrame) return undefined;
  const analytic = analyticsHosts.find(
    (rule) => matches(rule) && source !== rule && !source.endsWith(`.${rule}`),
  );
  return analytic
    ? { rule: analytic, category: "analytics" as const }
    : undefined;
}

export const duckDuckGoOnionHost =
  "duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion";

const duckDuckGoHosts = new Set([
  "duckduckgo.com",
  "www.duckduckgo.com",
  "start.duckduckgo.com",
  "html.duckduckgo.com",
  "lite.duckduckgo.com",
  "noai.duckduckgo.com",
  duckDuckGoOnionHost,
]);

function webURL(input: string): URL | undefined {
  try {
    const url = new URL(input);
    return ["http:", "https:", "ws:", "wss:"].includes(url.protocol)
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

export function shouldBlockAdvertisement(
  input: string,
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  const url = webURL(input);
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  return advertisingHosts.some(
    (rule) => host === rule || host.endsWith(`.${rule}`),
  );
}

export function isDuckDuckGoSearchURL(input: string): boolean {
  const url = webURL(input);
  if (!url || !["http:", "https:"].includes(url.protocol)) return false;
  return (
    duckDuckGoHosts.has(url.hostname.toLowerCase().replace(/\.+$/, "")) &&
    ["/", "/html", "/html/", "/lite", "/lite/"].includes(url.pathname) &&
    url.searchParams.has("q")
  );
}

// Precise semantic selectors only. In particular, never use [class*="ad"],
// link destinations or result text: those hide unrelated/organic content.
const genericAdvertisingSelectors = [
  "ins.adsbygoogle",
  "[data-ad-client][data-ad-slot]",
  '[data-advertisement="true"]',
];

// Provider identifiers observed in DDG's own public search markup/scripts.
// CSS remains effective when a matching promo appears after initial load.
const duckDuckGoAdvertisingSelectors = [
  ".result--ad",
  ".results--ads",
  '[data-testid="ad"]',
  '[data-testid="ad-block"]',
  '[data-layout="ad"]',
  '[data-testid="serp-popover-promo"]',
  '[data-testid="onboarding-popover-promo"]',
  ".js-serp-bottom-right-promo",
  ".js-browser-promo",
  ".js-promo-bottom",
  ".js-promo-sidebar",
  ".js-side-menu-promo",
  ".js-text-promo",
  ".footer--text_promo",
  ".header--text_promo",
  ".atb-banner__bottom",
  ".js-extension-overlay--mobile-promotion",
];

/** Local cosmetic CSS: no script, page bridge, observer, fetch or telemetry. */
export function cosmeticCSSForURL(input: string, enabled: boolean): string {
  if (!enabled) return "";
  const url = webURL(input);
  if (!url || !["http:", "https:"].includes(url.protocol)) return "";
  const selectors = isDuckDuckGoSearchURL(input)
    ? [...genericAdvertisingSelectors, ...duckDuckGoAdvertisingSelectors]
    : genericAdvertisingSelectors;
  return `${selectors.join(",\n")} { display: none !important; }`;
}
