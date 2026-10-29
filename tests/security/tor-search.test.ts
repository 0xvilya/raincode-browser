import { expect, it } from "vitest";
import {
  normalizeNavigation,
  validateSearchTemplate,
} from "../../src/main/security";
import { fixtureOnion } from "../tor/fixture-onion";
import { commandSchema, defaultSettings } from "../../src/shared/contracts";

it("permits onion v3 search templates only in Tor and keeps query out of authority", () => {
  const template = `http://${fixtureOnion(13)}/search?q={query}`;
  expect(validateSearchTemplate(template, "tor")).toBe(true);
  expect(validateSearchTemplate(template)).toBe(false);
  expect(normalizeNavigation("hidden wiki справка", template, "tor")).toBe(
    template.replace("{query}", encodeURIComponent("hidden wiki справка")),
  );
  expect(() => normalizeNavigation("test", template, "direct")).toThrow(
    "SEARCH_INVALID",
  );
  expect(
    validateSearchTemplate("http://facebook.onion/?q={query}", "tor"),
  ).toBe(false);
  expect(
    validateSearchTemplate("http://plain.example/search?q={query}", "tor"),
  ).toBe(false);
  expect(validateSearchTemplate("https://{query}.example/", "tor")).toBe(false);
  expect(validateSearchTemplate(defaultSettings.torSearchTemplate, "tor")).toBe(
    true,
  );
});
it("partial appearance updates do not reset ad/search or network security preferences", () => {
  expect(
    commandSchema.parse({
      type: "settings.update",
      settings: { fontSize: 16 },
    }),
  ).toEqual({ type: "settings.update", settings: { fontSize: 16 } });
});
