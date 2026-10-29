import type { Mode } from "../shared/contracts";
import { isV3OnionHost } from "./security";

export type TransportDecision = { cancel?: boolean; redirectURL?: string };

/** Only loopback development origins bypass TLS. Never exempt arbitrary LANs. */
export function isLoopbackHost(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, "");
  return (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name === "[::1]" ||
    /^127\.\d+\.\d+\.\d+$/.test(name)
  );
}

export function secureTransport(
  input: string,
  method: string,
  mode: Mode,
  enabled: boolean,
): TransportDecision {
  if (!enabled) return {};
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { cancel: true };
  }
  if (url.protocol !== "http:" && url.protocol !== "ws:") return {};
  // Onion v3 HTTP is carried end-to-end inside Tor. The caller independently
  // gates bootstrap/mode/checksum and must never use this as a routing rule.
  if (mode === "tor" && isV3OnionHost(url.hostname)) return {};
  if (mode !== "tor" && isLoopbackHost(url.hostname)) return {};
  // Chromium does not reliably support WebSocket handshake redirects. Fail
  // closed rather than send an unencrypted handshake. Sites must use wss:.
  if (url.protocol === "ws:" || !["GET", "HEAD"].includes(method.toUpperCase()))
    return { cancel: true };
  url.protocol = "https:";
  return { redirectURL: url.href };
}
