import type { Session } from "electron";
import { isOnionHost, isV3OnionHost } from "./security";
export { OnionPreconnect } from "./tor-onion";

export function torRequestAllowed(input: string, ready: boolean): boolean {
  if (!ready) return false;
  try {
    const url = new URL(input);
    if (
      !["http:", "https:", "ws:", "wss:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return false;
    if (isOnionHost(url.hostname)) return isV3OnionHost(url.hostname);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local")
    )
      return false;
    const ipv6 = host.replace(/[\[\]]/g, "");
    if (
      ipv6.includes(":") &&
      (/^(::|::1)$/.test(ipv6) ||
        /^::ffff:/i.test(ipv6) ||
        /^(f[cd]|fe[89ab]|ff)/i.test(ipv6))
    )
      return false;
    const ip = host.split(".").map(Number);
    if (
      ip.length === 4 &&
      ip.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ) {
      if (
        [0, 10, 127].includes(ip[0]) ||
        ip[0] >= 224 ||
        (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) ||
        (ip[0] === 192 && ip[1] === 168) ||
        (ip[0] === 169 && ip[1] === 254) ||
        (ip[0] === 100 && ip[1] >= 64 && ip[1] <= 127)
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
export async function configureTorSession(
  current: Session,
  port: number,
  guardPath: string,
): Promise<void> {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("TOR_NOT_READY");
  await current.setProxy({
    mode: "fixed_servers",
    proxyRules: `socks5://127.0.0.1:${port}`,
    proxyBypassRules: "<-loopback>",
  });
  current.registerPreloadScript({ type: "frame", filePath: guardPath });
  current.setPermissionCheckHandler(() => false);
  current.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  current.setDevicePermissionHandler(() => false);
}
