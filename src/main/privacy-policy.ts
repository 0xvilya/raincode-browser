import { classifyTrackerRequest } from "./content-policy";
import type { ResolvedPrivacyPolicy } from "../shared/privacy-policy";

export type RequestPrivacyDecision =
  | { action: "allow" }
  | {
      action: "block";
      rule: string;
      category: "advertising" | "analytics";
    };

/** A bounded decision over known, bundled host rules only; no URL-keyword
 * or search-result filtering. The caller must pass the actual top-level
 * document origin and record blocks from real webRequest events. */
export function decideTrackerRequest(
  targetURL: string,
  topLevelOrigin: string,
  isMainFrame: boolean,
  policy: ResolvedPrivacyPolicy,
  exceptions: readonly string[] = [],
): RequestPrivacyDecision {
  if (policy.trackers !== "block") return { action: "allow" };
  let sourceHost = "";
  try {
    sourceHost = new URL(topLevelOrigin).hostname.toLowerCase();
  } catch {
    // Detached workers can have no attributable page. Missing attribution
    // must not disable known-host rules or inherit a site's exception.
    sourceHost = "";
  }
  const match = classifyTrackerRequest(
    targetURL,
    sourceHost,
    isMainFrame,
    true,
    exceptions,
  );
  return match ? { action: "block", ...match } : { action: "allow" };
}

/** Exact-origin check. Strict/Maximum fail closed when an HTTP(S) request has
 * no attributable page (for example a detached worker): it cannot send or
 * receive cookies until the initiator is known. */
export function shouldStripCrossOriginCookies(
  targetURL: string,
  topLevelOrigin: string,
  policy: ResolvedPrivacyPolicy,
): boolean {
  if (policy.crossOriginCookies !== "block") return false;
  try {
    const target = new URL(targetURL);
    if (!["http:", "https:", "ws:", "wss:"].includes(target.protocol))
      return false;
    if (target.protocol === "ws:") target.protocol = "http:";
    if (target.protocol === "wss:") target.protocol = "https:";
    try {
      const top = new URL(topLevelOrigin);
      return (
        !["http:", "https:"].includes(top.protocol) ||
        target.origin !== top.origin
      );
    } catch {
      return true;
    }
  } catch {
    return false;
  }
}

/** Case-insensitive header filtering for Electron webRequest maps. Does not
 * mutate the caller's map, and removes only cookie headers, not credentials. */
export function stripCookieHeaders(
  headers: Record<string, string | string[]>,
  direction: "request" | "response",
): Record<string, string | string[]> {
  const forbidden = direction === "request" ? "cookie" : "set-cookie";
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => name.toLowerCase() !== forbidden,
    ),
  );
}

export function javascriptEnabled(policy: ResolvedPrivacyPolicy): boolean {
  return policy.javascript === "allow";
}

const identifyingNetworkHints = new Set([
  "device-memory",
  "dpr",
  "width",
  "viewport-width",
  "viewport-height",
  "downlink",
  "rtt",
  "ect",
  "sec-ch-device-memory",
  "sec-ch-dpr",
  "sec-ch-width",
  "sec-ch-viewport-width",
  "sec-ch-viewport-height",
]);

/** Network-only data minimization. JavaScript fingerprint APIs are unchanged.
 * Keep the ordinary low-entropy UA brand/mobile/platform hints: removing only
 * their high-entropy extensions avoids inventing contradictory browser values.
 * DPR/width removal may reduce server-selected image quality/efficiency. */
export function stripHighEntropyClientHints<T extends string | string[]>(
  headers: Record<string, T>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => {
      const key = name.toLowerCase();
      return (
        !identifyingNetworkHints.has(key) &&
        !(
          key.startsWith("sec-ch-ua-") &&
          !["sec-ch-ua-mobile", "sec-ch-ua-platform"].includes(key)
        )
      );
    }),
  );
}

/** Stop new server hint opt-in/retry negotiation. Request filtering is still
 * needed for previously cached opt-ins. Never removes security policy headers. */
export function stripClientHintNegotiation<T extends string | string[]>(
  headers: Record<string, T>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) =>
        !["accept-ch", "critical-ch", "accept-ch-lifetime"].includes(
          name.toLowerCase(),
        ),
    ),
  );
}

/** In Tor, do not disclose the referring page to a different origin. */
export function stripCrossOriginReferrer(
  headers: Record<string, string>,
  targetURL: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name, value]) => {
      if (name.toLowerCase() !== "referer") return true;
      try {
        const source = new URL(value);
        const target = new URL(targetURL);
        if (target.protocol === "ws:") target.protocol = "http:";
        if (target.protocol === "wss:") target.protocol = "https:";
        return (
          ["http:", "https:"].includes(source.protocol) &&
          source.origin === target.origin
        );
      } catch {
        return false;
      }
    }),
  );
}

/** The UI must not call this a complete Zero Google audit. The browser's own
 * requests can be counted separately from visited sites, but Chromium/OS
 * background connections require process-scoped capture to certify. */
export function classifyNetworkSource(
  initiatingURL: string | undefined,
  shellOrigin: string,
): "browser-shell" | "visited-site" | "unattributed" {
  if (!initiatingURL) return "unattributed";
  try {
    const initiator = new URL(initiatingURL);
    const shell = new URL(shellOrigin);
    // WHATWG returns origin="null" for unregistered custom schemes, so
    // compare the browser's own scheme and authority explicitly.
    return initiator.protocol === shell.protocol &&
      initiator.host === shell.host
      ? "browser-shell"
      : "visited-site";
  } catch {
    return "unattributed";
  }
}
