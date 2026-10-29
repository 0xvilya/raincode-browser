import { isIP } from "node:net";
import type { Mode } from "../shared/contracts";
import type { SiteDiagnostics } from "../shared/site-diagnostics";
import { isOnionHost } from "./security";

export interface DiagnosticsSession {
  resolveHost(host: string): Promise<{ endpoints: { address: string }[] }>;
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

interface DiagnosticsOptions {
  url: string;
  mode: Mode;
  session: DiagnosticsSession;
  registration: boolean;
  /** Rechecked after awaits so an emergency kill cannot start another request. */
  canConnect?: () => boolean;
}

const MAX_BODY = 64 * 1024;
const PROVIDER = "https://stat.ripe.net";

/** Conservative globally-routable eligibility, not an exhaustive IANA registry. */
export function isPublicDiagnosticIP(value: string): boolean {
  if (isIP(value) === 4) {
    const [a, b, c] = value.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 ||
          (b === 0 && (c === 0 || c === 2)) ||
          (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(value) !== 6 || value.includes(".")) return false;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const [first, second] = canonical
    .split(":")
    .map((word) => parseInt(word || "0", 16));
  // Global unicast only. Exclude special IETF, documentation and 6to4 ranges.
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) &&
    !(first === 0x3fff && second < 0x1000)
  );
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function shortText(value: unknown): string | undefined {
  return typeof value === "string"
    ? value
        .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "")
        .slice(0, 240) || undefined
    : undefined;
}

async function providerData(
  session: DiagnosticsSession,
  endpoint: "network-info" | "as-overview",
  resource: string,
  canConnect: () => boolean,
): Promise<Record<string, unknown>> {
  if (!canConnect()) throw new Error("DIAGNOSTICS_BLOCKED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    // Only fixed official endpoints, through the supplied profile session.
    // No Node fetch, cookies, redirect follow, destination URL or hostname.
    const response = await session.fetch(
      `${PROVIDER}/data/${endpoint}/data.json?resource=${encodeURIComponent(resource)}`,
      {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (
      !canConnect() ||
      !response.ok ||
      response.redirected ||
      Number(response.headers.get("content-length")) > MAX_BODY ||
      !response.body
    )
      throw new Error("DIAGNOSTICS_PROVIDER_FAILED");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (!canConnect() || size > MAX_BODY)
          throw new Error("DIAGNOSTICS_PROVIDER_FAILED");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    const parsed = asObject(JSON.parse(new TextDecoder().decode(body)));
    if (parsed.status !== "ok") throw new Error("DIAGNOSTICS_PROVIDER_FAILED");
    return asObject(parsed.data);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Explicit developer action only. Never call this on navigation or page load. */
export async function inspectSite(
  options: DiagnosticsOptions,
): Promise<SiteDiagnostics> {
  const { mode, session, registration } = options;
  const canConnect = options.canConnect || (() => true);
  let url: URL;
  try {
    url = new URL(options.url);
  } catch {
    throw new Error("DIAGNOSTICS_INVALID_URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hostname.length > 253
  )
    throw new Error("DIAGNOSTICS_INVALID_URL");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const base = { hostname, addresses: [] as string[] };
  if (isOnionHost(hostname)) return { ...base, status: "onion" };
  // session.resolveHost does not promise proxy-side DNS. Never call it for
  // Tor/Proxy, even for a public host or an IP literal that appears harmless.
  if (mode === "tor" || mode === "proxy")
    return { ...base, status: "protected" };
  if (!canConnect()) throw new Error("DIAGNOSTICS_BLOCKED");
  let addresses: string[];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const resolved = isIP(hostname)
      ? { endpoints: [{ address: hostname }] }
      : await Promise.race([
          session.resolveHost(hostname),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("DIAGNOSTICS_TIMEOUT")),
              8000,
            );
          }),
        ]);
    addresses = [
      ...new Set(
        resolved.endpoints
          .map((item) => item.address)
          .filter((ip) => isIP(ip) > 0),
      ),
    ].slice(0, 16);
  } catch {
    return { ...base, status: "failed" };
  } finally {
    clearTimeout(timer);
  }
  if (!canConnect()) throw new Error("DIAGNOSTICS_BLOCKED");
  const result: SiteDiagnostics = {
    hostname,
    addresses,
    status: addresses.length ? "resolved" : "failed",
  };
  if (!registration || !addresses.length) return result;
  const ip = addresses.find(isPublicDiagnosticIP);
  if (!ip) return { ...result, registrationStatus: "private-address" };
  try {
    const info = await providerData(session, "network-info", ip, canConnect);
    const asns = Array.isArray(info.asns)
      ? [
          ...new Set(
            info.asns
              .map((value) =>
                typeof value === "string" && /^\d+$/.test(value)
                  ? Number(value)
                  : value,
              )
              .filter(
                (value): value is number =>
                  typeof value === "number" &&
                  Number.isSafeInteger(value) &&
                  value > 0 &&
                  value <= 0xffffffff,
              )
              .slice(0, 16),
          ),
        ]
      : [];
    const prefix =
      typeof info.prefix === "string" &&
      /^[0-9a-fA-F:.]+\/\d{1,3}$/.test(info.prefix)
        ? info.prefix.slice(0, 80)
        : undefined;
    let holder: string | undefined;
    if (asns[0]) {
      try {
        holder = shortText(
          (
            await providerData(
              session,
              "as-overview",
              `AS${asns[0]}`,
              canConnect,
            )
          ).holder,
        );
      } catch {
        /* The observed ASN/prefix remain useful if its holder is unavailable. */
      }
    }
    if (!canConnect()) throw new Error("DIAGNOSTICS_BLOCKED");
    result.network = { ip, asns, prefix, holder, provider: "RIPEstat" };
    result.registrationStatus = "available";
  } catch {
    if (!canConnect()) throw new Error("DIAGNOSTICS_BLOCKED");
    result.registrationStatus = "unavailable";
  }
  return result;
}
