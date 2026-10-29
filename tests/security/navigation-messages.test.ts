import { describe, expect, it } from "vitest";
import { message, pageLoadMessage } from "../../src/main/messages";

describe("page load diagnostics", () => {
  it("keeps Tor failures distinct from TLS/direct and proxy failures in both locales", () => {
    for (const locale of ["ru", "en"] as const) {
      expect(pageLoadMessage(locale, "tor", "ERR_TIMED_OUT")).toContain(
        "ERR_TIMED_OUT",
      );
      expect(pageLoadMessage(locale, "tor")).toBe(
        message(locale, "torLoadFailed"),
      );
      expect(pageLoadMessage(locale, "direct", "ERR_TIMED_OUT")).toBe(
        message(locale, "tlsError"),
      );
      expect(
        pageLoadMessage(locale, "proxy", "ERR_PROXY_CONNECTION_FAILED"),
      ).toBe(message(locale, "proxyFailed"));
    }
  });
  it("never copies private URLs, paths, proxy credentials or arbitrary error text", () => {
    for (const value of [
      new Error(
        "ERR_TIMED_OUT https://user:password@private.onion/?secret=value",
      ),
      "ERR_TIMED_OUT https://user:password@private.onion/",
      "C:\\Users\\private\\secret",
      "ERR_" + "A".repeat(65),
      undefined,
      -7,
    ])
      expect(pageLoadMessage("en", "tor", value)).toBe(
        message("en", "torLoadFailed"),
      );
  });
});
