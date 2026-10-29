import { describe, expect, it } from "vitest";
import {
  isOnionHost,
  normalizeNavigation,
  safeWebURL,
  validateSearchTemplate,
} from "../../src/main/security";

const search = "https://search.example/?q={query}";
const onion = `${"a".repeat(56)}.onion`;

describe("navigation security", () => {
  it("loads explicit HTTPS URLs without turning them into searches", () => {
    expect(
      normalizeNavigation(
        "https://example.com/path?q=test#fragment",
        search,
        "direct",
      ),
    ).toBe("https://example.com/path?q=test#fragment");
  });

  it("encodes search text through the selected search engine", () => {
    const result = new URL(
      normalizeNavigation("typescript async await", search, "direct"),
    );
    expect(result.origin).toBe("https://search.example");
    expect(result.searchParams.get("q")).toBe("typescript async await");
  });

  it("supports localhost development URLs", () => {
    expect(
      new URL(
        normalizeNavigation("http://localhost:5173/demo", search, "direct"),
      ).host,
    ).toBe("localhost:5173");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///etc/passwd",
    "file:///C:/Windows/win.ini",
    "vbscript:msgbox(1)",
    "chrome://settings",
    "devtools://devtools/bundled/inspector.html",
  ])("rejects unsafe scheme %s", (url) => {
    expect(safeWebURL(url, "direct")).toBe(false);
    expect(() => normalizeNavigation(url, search, "direct")).toThrow();
  });

  it.each([
    `http://${onion}`,
    `https://${onion}/`,
    `https://${onion.toUpperCase()}/`,
    `https://${onion}./`,
    `http://sub.${onion}/`,
  ])("does not resolve onion addresses in direct mode: %s", (url) => {
    expect(safeWebURL(url, "direct")).toBe(false);
    expect(() => normalizeNavigation(url, search, "direct")).toThrow();
  });

  it("does not enable onion navigation in an arbitrary proxy profile", () => {
    expect(safeWebURL(`http://${onion}`, "proxy")).toBe(false);
    expect(() =>
      normalizeNavigation(`http://${onion}`, search, "proxy"),
    ).toThrow();
  });

  it("recognizes onion suffixes without misclassifying similarly named websites", () => {
    expect(isOnionHost(onion)).toBe(true);
    expect(isOnionHost(`sub.${onion}`)).toBe(true);
    expect(isOnionHost(`${onion.toUpperCase()}.`)).toBe(true);
    expect(isOnionHost("example.onion.example.com")).toBe(false);
    expect(isOnionHost("onion.example.com")).toBe(false);
  });

  it.each(["http://user:password@example.com/", "https://user@example.com/"])(
    "rejects embedded credentials: %s",
    (url) => {
      expect(safeWebURL(url, "direct")).toBe(false);
      expect(() => normalizeNavigation(url, search, "direct")).toThrow();
    },
  );

  it("only accepts registered internal pages", () => {
    expect(normalizeNavigation("raincode://privacy#ai", search, "direct")).toBe(
      "raincode://privacy#ai",
    );
    expect(() =>
      normalizeNavigation("raincode://settings#ai", search, "direct"),
    ).toThrow();
    expect(() =>
      normalizeNavigation("raincode://privacy#arbitrary", search, "direct"),
    ).toThrow();
    expect(normalizeNavigation("raincode://settings", search, "direct")).toBe(
      "raincode://settings",
    );
    expect(() =>
      normalizeNavigation("raincode://arbitrary-file", search, "direct"),
    ).toThrow();
    expect(() =>
      normalizeNavigation(
        "raincode://settings/../../etc/passwd",
        search,
        "direct",
      ),
    ).toThrow();
  });

  it.each([
    `${"a".repeat(56)}%2eonion`,
    `${"a".repeat(56)}%252eonion`,
    `${"a".repeat(56)}\u3002onion`,
    `${"a".repeat(56)}.ｏｎｉｏｎ`,
    `open http://${onion}/ now`,
    `https://${"a".repeat(56)}.%6fnion`,
  ])(
    "does not leak encoded or embedded onion addresses to search: %s",
    (input) => {
      expect(() => normalizeNavigation(input, search, "direct")).toThrow(
        "ONION_INVALID",
      );
    },
  );

  it("keeps search queries out of the search provider authority", () => {
    expect(validateSearchTemplate("https://{query}.example.com/")).toBe(false);
    expect(validateSearchTemplate("https://search.example/find/{query}")).toBe(
      true,
    );
    expect(validateSearchTemplate("https://search.example/?q={query}")).toBe(
      true,
    );
    expect(validateSearchTemplate("http://search.example/?q={query}")).toBe(
      false,
    );
    expect(
      validateSearchTemplate("https://user:secret@search.example/?q={query}"),
    ).toBe(false);
  });

  it("allows ordinary onion-related words and non-onion suffixes", () => {
    expect(
      new URL(
        normalizeNavigation("onion architecture", search),
      ).searchParams.get("q"),
    ).toBe("onion architecture");
    expect(
      normalizeNavigation("https://example.onion.example.com/", search),
    ).toBe("https://example.onion.example.com/");
  });
});
