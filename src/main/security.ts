import { internalPages, privacySections } from "../shared/contracts";
import type { Mode } from "../shared/contracts";
import { sha3_256 } from "@noble/hashes/sha3.js";

export function isV3OnionHost(host: string): boolean {
  const parts = host.toLowerCase().replace(/\.+$/, "").split(".");
  const label = parts.at(-2) || "";
  if (parts.at(-1) !== "onion" || !/^[a-z2-7]{56}$/.test(label)) return false;
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes: number[] = [];
  let buffer = 0,
    bits = 0;
  for (const letter of label) {
    buffer = (buffer << 5) | alphabet.indexOf(letter);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  if (bytes.length !== 35 || bytes[34] !== 3) return false;
  // Electron uses BoringSSL, whose Node crypto does not implement SHA3. Use the
  // same audited portable hash in Electron and the Node unit-test environment.
  const hash = sha3_256(
    Buffer.concat([
      Buffer.from(".onion checksum"),
      Buffer.from(bytes.slice(0, 32)),
      Buffer.from([3]),
    ]),
  );
  return hash[0] === bytes[32] && hash[1] === bytes[33];
}

export function isOnionHost(host: string): boolean {
  // WHATWG URL performs IDNA/percent decoding for network hosts. Normalize the
  // spelling here too, because this helper also receives unparsed host strings.
  const normalized = host
    .normalize("NFKC")
    .replace(/[\u3002\uff0e\uff61]/g, ".")
    .toLowerCase()
    .replace(/\.+$/, "");
  return normalized === "onion" || normalized.endsWith(".onion");
}
export function safeWebURL(input: string, mode: Mode = "direct"): boolean {
  try {
    if (input.length > 8192 || /[\x00-\x20\x7f]/.test(input)) return false;
    const u = new URL(input);
    return (
      ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      (!isOnionHost(u.hostname) ||
        (mode === "tor" && isV3OnionHost(u.hostname)))
    );
  } catch {
    return false;
  }
}
export function validateSearchTemplate(
  template: string,
  mode: Mode = "direct",
): boolean {
  if (template.split("{query}").length !== 2) return false;
  try {
    const u = new URL(template.replace("{query}", "raincode-query"));
    // Search text must never become part of an authority/hostname. Path and
    // query based search engines remain supported.
    const alternate = new URL(template.replace("{query}", "different-query"));
    return (
      (u.protocol === "https:" ||
        (mode === "tor" &&
          u.protocol === "http:" &&
          isV3OnionHost(u.hostname))) &&
      safeWebURL(u.href, mode) &&
      u.origin === alternate.origin
    );
  } catch {
    return false;
  }
}

export function mentionsOnion(input: string): boolean {
  let spelling = input.normalize("NFKC").replace(/[\u3002\uff0e\uff61]/g, ".");
  // Detect ordinary percent-encoded address spellings before they can enter a
  // search query. Repeated encoding is not a valid URL host, but do not leak it
  // to a search provider either. Each pass shortens the string.
  for (
    let remaining = spelling.length;
    remaining > 0 && /%[0-9a-f]{2}/i.test(spelling);
    remaining--
  ) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(spelling);
    } catch {
      decoded = spelling.replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
    }
    if (decoded === spelling) break;
    spelling = decoded.normalize("NFKC").replace(/[\u3002\uff0e\uff61]/g, ".");
  }
  // Bare word “onion” is an ordinary search term; actual .onion address
  // mentions (including subdomains/trailing dots) must not reach search/DNS.
  if (/\.onion\.*(?=$|[^a-z0-9.-])/i.test(spelling)) return true;
  for (const token of spelling.split(/\s+/)) {
    try {
      const candidate = token.replace(/^["'(<]+|["'),;>]+$/g, "");
      const u = new URL(
        /^[a-z][a-z0-9+.-]*:/i.test(candidate)
          ? candidate
          : `https://${candidate}`,
      );
      if (
        (candidate.includes(".") || /^[a-z][a-z0-9+.-]*:/i.test(candidate)) &&
        isOnionHost(u.hostname)
      )
        return true;
    } catch {
      /* Malformed tokens are handled by normal URL validation. */
    }
  }
  return false;
}
export function normalizeNavigation(
  input: string,
  searchTemplate: string,
  mode: Mode = "direct",
): string {
  const value = input.trim();
  if (!value || value.length > 8192 || /[\x00-\x1f\x7f]/.test(value))
    throw new Error("URL_INVALID");
  const onionMentioned = mentionsOnion(value);
  let onionAddress: URL | undefined;
  if (onionMentioned) {
    // Check the actual host before offering Tor. Names such as facebook.onion
    // are neither registered domains nor aliases for a service's v3 identity.
    // URL parsing also canonicalizes IDN, encoded dots and Unicode full stops.
    const target = value.replace(/^view-source:/i, "");
    let parsed: URL;
    try {
      parsed = new URL(
        /^[a-z][a-z0-9+.-]*:\/\//i.test(target) || /^https?:/i.test(target)
          ? target
          : `http://${target}`,
      );
    } catch {
      throw new Error("ONION_INVALID");
    }
    if (isOnionHost(parsed.hostname)) {
      if (!isV3OnionHost(parsed.hostname)) throw new Error("ONION_INVALID");
      onionAddress = parsed;
    }
  }
  // Never pass onion names to a search engine, a direct resolver, or an unverified generic proxy.
  if (onionMentioned && mode !== "tor") throw new Error("TOR_UNAVAILABLE");
  if (/^raincode:/i.test(value)) {
    const match = /^raincode:\/\/([a-z-]+)\/?(?:#([a-z]+))?$/i.exec(value);
    const page = match?.[1]?.toLowerCase();
    const section = match?.[2]?.toLowerCase();
    if (!internalPages.includes(page as (typeof internalPages)[number]))
      throw new Error("URL_INVALID");
    if (
      section &&
      (page !== "privacy" ||
        !privacySections.includes(section as (typeof privacySections)[number]))
    )
      throw new Error("URL_INVALID");
    return `raincode://${page}${section ? `#${section}` : ""}`;
  }
  if (/^view-source:/i.test(value)) {
    const target = value.slice(12);
    if (!safeWebURL(target, mode)) throw new Error("URL_INVALID");
    return `view-source:${new URL(target).href}`;
  }
  let candidate = value;
  const local =
    /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/i.test(value);
  const domain = /^(?:[^\s./:]+\.)+[^\s./:]+(?::\d+)?(?:[/?#]|$)/.test(value);
  if (onionAddress) candidate = onionAddress.href;
  else if (local) candidate = `http://${value}`;
  else if (domain)
    candidate = `${mentionsOnion(value) ? "http" : "https"}://${value}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    if (mentionsOnion(value)) throw new Error("URL_INVALID");
    if (!validateSearchTemplate(searchTemplate, mode))
      throw new Error("SEARCH_INVALID");
    return searchTemplate.replace("{query}", encodeURIComponent(value));
  }
  if (!safeWebURL(candidate, mode)) throw new Error("URL_INVALID");
  return new URL(candidate).href;
}
export function isExternalProtocol(input: string): boolean {
  try {
    const u = new URL(input);
    return (
      ["mailto:", "tel:"].includes(u.protocol) &&
      input.length < 2048 &&
      !/[\x00-\x1f\x7f]/.test(decodeURIComponent(input))
    );
  } catch {
    return false;
  }
}
