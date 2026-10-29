import { net, type AuthInfo, type Session } from "electron";
import { safeWebURL } from "./security";
import { proxySchema, type Profile } from "../shared/contracts";

/** Confirm Chromium accepted a single fixed route without a DIRECT fallback.
 * resolveProxy inspects configuration; it is not a reachability/anonymity test. */
export async function configureProfileProxy(
  current: Session,
  value: NonNullable<Profile["proxy"]>,
): Promise<void> {
  const proxy = proxySchema.parse(value);
  await current.setProxy({
    mode: "fixed_servers",
    proxyRules: `${proxy.scheme}://${proxy.host}:${proxy.port}`,
    proxyBypassRules: proxy.bypassLocal
      ? "<local>;localhost;127.0.0.1;[::1]"
      : "<-loopback>",
  });
  // Persistent sessions may retain the startup DIRECT result until reset.
  await current.forceReloadProxyConfig();
  const expected =
    `${proxy.scheme === "http" ? "PROXY" : proxy.scheme.toUpperCase()} ${proxy.host}:${proxy.port}`.toLowerCase();
  for (const url of [
    "http://raincode-route.invalid/",
    "https://raincode-route.invalid/",
    "ws://raincode-route.invalid/",
    "wss://raincode-route.invalid/",
    ...(!proxy.bypassLocal ? ["http://127.0.0.1/"] : []),
  ]) {
    if ((await current.resolveProxy(url)).toLowerCase() !== expected)
      throw new Error("PROXY_ROUTE_INVALID");
  }
}

export interface ProxyCredentials {
  username: string;
  password: string;
}

/** Bounded diagnostic request using a specific Chromium session. The caller
 * must authorize the exact proxy endpoint/profile before returning credentials.
 * No arbitrary URL is exposed through the renderer API by this helper.
 */
export async function requestProfileJSON(
  current: Session,
  url: string,
  authenticate: (auth: AuthInfo) => Promise<ProxyCredentials | undefined>,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!safeWebURL(url)) throw new Error("PROXY_REQUEST_INVALID");
  if (signal?.aborted) throw new Error("PROXY_REQUEST_ABORTED");
  return new Promise<unknown>((resolve, reject) => {
    const request = net.request({
      session: current,
      url,
      method: "GET",
      redirect: "error",
      cache: "no-store",
      useSessionCookies: false,
      headers: { Accept: "application/json" },
    });
    let settled = false;
    let authAttempts = 0;
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };
    const fail = (code: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(code));
      request.abort();
    };
    const onAbort = () => fail("PROXY_REQUEST_ABORTED");
    const timeout = setTimeout(() => fail("PROXY_REQUEST_TIMEOUT"), 12000);
    signal?.addEventListener("abort", onAbort, { once: true });
    request.on("error", () => fail("PROXY_REQUEST_FAILED"));
    request.on("abort", () => fail("PROXY_REQUEST_ABORTED"));
    // ClientRequest's Writable can close before the response stream ends.
    // Settle on response end/error or the bounded timeout, never that event.
    request.on("login", (auth, callback) => {
      let answered = false;
      const answer = (value?: ProxyCredentials) => {
        if (answered) return;
        answered = true;
        try {
          if (value) callback(value.username, value.password);
          else callback();
        } catch {
          /* The request may already have been aborted. */
        }
      };
      // Origin-server 401 challenges must never see a proxy secret.
      if (!auth.isProxy || settled || ++authAttempts > 1) {
        answer();
        fail("PROXY_AUTH_FAILED");
        return;
      }
      void (async () => {
        const value = await authenticate(auth);
        if (settled || signal?.aborted) {
          answer();
          return;
        }
        if (
          !value ||
          typeof value.username !== "string" ||
          !value.username.length ||
          value.username.length > 512 ||
          typeof value.password !== "string" ||
          value.password.length > 2048
        ) {
          answer();
          fail("PROXY_AUTH_FAILED");
          return;
        }
        answer(value);
      })().catch(() => {
        answer();
        fail("PROXY_AUTH_FAILED");
      });
    });
    request.on("response", (response) => {
      response.on("error", () => fail("PROXY_RESPONSE_FAILED"));
      response.on("aborted", () => fail("PROXY_RESPONSE_FAILED"));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        fail("PROXY_RESPONSE_STATUS");
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (data: Buffer) => {
        if (settled) return;
        size += data.length;
        if (size > 64 * 1024) {
          fail("PROXY_RESPONSE_TOO_LARGE");
          return;
        }
        chunks.push(data);
      });
      response.on("end", () => {
        if (settled) return;
        let value: unknown;
        try {
          value = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
        } catch {
          fail("PROXY_RESPONSE_INVALID");
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      });
    });
    if (signal?.aborted) onAbort();
    else request.end();
  });
}
