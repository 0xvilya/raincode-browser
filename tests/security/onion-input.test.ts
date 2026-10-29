import { describe, expect, it } from "vitest";
import { errorMessage } from "../../src/main/messages";
import {
  mentionsOnion,
  normalizeNavigation,
  safeWebURL,
} from "../../src/main/security";
import { fixtureOnion } from "../tor/fixture-onion";

const onion = fixtureOnion(37);
const search = "https://search.example/?q={query}";

describe("onion input diagnostics without DNS or search fallback", () => {
  it.each([
    "facebook.onion",
    "https://FACEBOOK.onion/path",
    "facebook.onion:443/path",
    "facebookcorewwwi.onion",
    `http://${"a".repeat(56)}.onion/`,
    "facebook%2eonion",
    "facebook%252eonion",
    "facebook。onion",
    "facebook.ｏｎｉｏｎ",
    "view-source:http://facebook.onion/",
    `open http://${onion}/ now`,
  ])(
    "rejects malformed or ambiguous onion input before mode selection: %s",
    (input) => {
      expect(mentionsOnion(input)).toBe(true);
      for (const mode of ["direct", "proxy", "private", "tor"] as const) {
        expect(() => normalizeNavigation(input, search, mode)).toThrow(
          "ONION_INVALID",
        );
      }
    },
  );

  it.each([
    [onion, `http://${onion}/`],
    [`${onion}:8080/path?q=value`, `http://${onion}:8080/path?q=value`],
    [`https://docs.${onion.toUpperCase()}/path`, `https://docs.${onion}/path`],
    [onion.replace(".onion", "%2eonion"), `http://${onion}/`],
    [onion.replace(".onion", "。ｏｎｉｏｎ"), `http://${onion}/`],
    [`http://${onion}./`, `http://${onion}./`],
  ])(
    "opens canonical checksum-valid v3 only in an explicitly chosen Tor profile: %s",
    (input, expected) => {
      expect(normalizeNavigation(input, search, "tor")).toBe(expected);
      expect(safeWebURL(expected, "tor")).toBe(true);
      for (const mode of ["direct", "proxy", "private"] as const) {
        expect(() => normalizeNavigation(input, search, mode)).toThrow(
          "TOR_UNAVAILABLE",
        );
        expect(safeWebURL(expected, mode)).toBe(false);
      }
    },
  );

  it("does not weaken URL credentials or protocol validation for a valid v3 hostname", () => {
    for (const input of [`http://user:secret@${onion}/`, `ftp://${onion}/`]) {
      expect(() => normalizeNavigation(input, search, "tor")).toThrow(
        "URL_INVALID",
      );
    }
    expect(
      normalizeNavigation(`view-source:http://${onion}/`, search, "tor"),
    ).toBe(`view-source:http://${onion}/`);
  });

  it("explains v3 requirements in both locales without echoing private input", () => {
    for (const locale of ["ru", "en"] as const) {
      const text = errorMessage(locale, new Error("ONION_INVALID"));
      expect(text).toContain("56");
      expect(text).toContain("facebook.onion");
      expect(text).not.toContain("ONION_INVALID");
      expect(text).not.toContain(onion);
    }
  });
});
