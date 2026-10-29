import { describe, expect, it } from "vitest";
import {
  completedDomain,
  displayedAddress,
  effectCommand,
  localSuggestions,
} from "../../src/renderer/omniboxHelpers";

describe("omnibox interpretation without network requests", () => {
  it("preserves Cyrillic, Latin, emoji, IDN and Punycode", () => {
    for (const text of [
      "https://пример.рф/путь",
      "https://xn--e1afmkfd.xn--p1ai/",
      "быстрый поиск 🚀",
      "fast search",
    ]) {
      expect(displayedAddress(text)).toBe(text);
    }
    expect(displayedAddress("raincode://newtab")).toBe("");
    expect(displayedAddress("raincode://recently-closed")).toBe(
      "raincode://recently-closed",
    );
  });
  it("CtrlEnter only completes a bare host label", () => {
    expect(completedDomain("raincode")).toBe("https://www.raincode.com/");
    expect(completedDomain("пример")).toBe("https://www.пример.com/");
    for (const text of [
      "localhost:3000",
      "example.org/path",
      "search query",
      "https://example.com",
      "a.onion",
      "-bad",
    ])
      expect(completedDomain(text)).toBe(text);
  });
  it("matches only bounded, unique local bookmark and history entries", () => {
    const bookmarks = [
      { id: "b", url: "https://example.com", title: "Пример", createdAt: 1 },
    ];
    const history = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      url: i ? `https://example.com/${i}` : "https://example.com",
      title: "Пример",
      visitedAt: i,
      profileId: "default",
    }));
    const result = localSuggestions("ПРИМЕР", history, bookmarks);
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual(bookmarks[0]);
    expect(new Set(result.map((item) => item.url)).size).toBe(6);
    expect(localSuggestions("", history, bookmarks)).toEqual([]);
    expect(localSuggestions("a.onion", history, bookmarks)).toEqual([]);
  });
  it("effect commands must match exactly and never become suggestions", () => {
    for (const effect of ["rain", "bokeh", "glass", "glow", "cinematic"])
      expect(effectCommand(`/${effect}`)).toBe(effect);
    expect(effectCommand("/rain extra")).toBeUndefined();
    expect(effectCommand("https://example.com/rain")).toBeUndefined();
  });
});
