import { describe, expect, it } from "vitest";
import { splitRatio, splitRects } from "../../src/shared/split-view";
import { commandSchema } from "../../src/shared/contracts";
describe("native pane geometry", () => {
  it.each(["horizontal", "vertical"] as const)(
    "bounds %s panes with controls and a gap",
    (orientation) => {
      const bounds = { x: 20, y: 100, width: 1200, height: 800 };
      const { first, second } = splitRects(bounds, orientation, 0.25);
      expect(first.y).toBe(140);
      for (const pane of [first, second]) {
        expect(pane.width).toBeGreaterThanOrEqual(0);
        expect(pane.height).toBeGreaterThanOrEqual(0);
        expect(pane.x + pane.width).toBeLessThanOrEqual(1220);
        expect(pane.y + pane.height).toBeLessThanOrEqual(900);
      }
      if (orientation === "horizontal")
        expect(first.x + first.width + 6).toBe(second.x);
      else expect(first.y + first.height + 6).toBe(second.y);
    },
  );
  it("handles tiny containers and corrupt restored ratios", () => {
    expect(
      splitRects({ x: 0, y: 0, width: 0, height: 0 }, "vertical", NaN).second
        .height,
    ).toBe(0);
    expect(splitRatio(Infinity)).toBe(0.5);
    expect(splitRatio(-1)).toBe(0.25);
    expect(splitRatio(100)).toBe(0.75);
    expect(
      commandSchema.safeParse({ type: "split.configure", ratio: 1 }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: "pane.action",
        tabId: "x",
        action: "executeJavaScript",
      }).success,
    ).toBe(false);
  });
});
