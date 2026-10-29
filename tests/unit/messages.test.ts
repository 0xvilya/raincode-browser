import { describe, expect, it } from "vitest";
import { errorMessage, message } from "../../src/main/messages";

describe("safe diagnostic messages", () => {
  it.each(["ru", "en"] as const)(
    "does not expose raw network errors or proxy secrets in %s",
    (locale) => {
      const secret = "https://user:proxy-password@proxy.example/private-token";
      const result = errorMessage(
        locale,
        new Error(`ERR_PROXY_CONNECTION_FAILED: ${secret}`),
      );
      expect(result).toBe(message(locale, "OPERATION_FAILED"));
      expect(result).not.toContain("proxy-password");
      expect(result).not.toContain("private-token");
      expect(errorMessage(locale, { message: secret })).toBe(result);
    },
  );

  it.each(["ru", "en"] as const)(
    "preserves the actionable Tor restriction in %s",
    (locale) => {
      expect(errorMessage(locale, new Error("TOR_UNAVAILABLE"))).toBe(
        message(locale, "TOR_UNAVAILABLE"),
      );
      expect(errorMessage(locale, new Error("TOR_UNAVAILABLE"))).not.toBe(
        message(locale, "OPERATION_FAILED"),
      );
    },
  );
});
