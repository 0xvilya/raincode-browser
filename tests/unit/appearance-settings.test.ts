import { expect, it } from "vitest";
import {
  commandSchema,
  defaultSettings,
  settingsSchema,
} from "../../src/shared/contracts";

it("migrates colors without injecting them into unrelated security patches", () => {
  expect(
    settingsSchema.parse({
      ...defaultSettings,
      customColors: undefined,
      shellColor: undefined,
      accentColor: undefined,
    }),
  ).toMatchObject({
    customColors: false,
    shellColor: "#244b68",
    accentColor: "#a2d3cc",
  });
  expect(
    commandSchema.parse({
      type: "settings.update",
      settings: { shellColor: "#fa00aa" },
    }),
  ).toEqual({ type: "settings.update", settings: { shellColor: "#fa00aa" } });
});
it.each([
  "red",
  "#fff",
  "url(https://example.com)",
  "#ffffff;display:none",
  "#abcdef00",
])("rejects non-hex color %s", (color) => {
  expect(
    commandSchema.safeParse({
      type: "settings.update",
      settings: { shellColor: color },
    }).success,
  ).toBe(false);
});
