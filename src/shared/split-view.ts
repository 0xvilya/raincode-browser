export const SPLIT_TOOLBAR_HEIGHT = 52;
export const SPLIT_CONTROLS_HEIGHT = 40;
export interface PaneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function splitRatio(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(0.75, Math.max(0.25, value))
    : 0.5;
}
export function splitRects(
  bounds: PaneRect,
  orientation: "horizontal" | "vertical",
  ratio: number,
) {
  const controls = Math.min(SPLIT_CONTROLS_HEIGHT, bounds.height);
  bounds = {
    ...bounds,
    y: bounds.y + controls,
    height: Math.max(0, bounds.height - controls),
  };
  const horizontal = orientation === "horizontal";
  const length = horizontal ? bounds.width : bounds.height;
  const gap = Math.min(6, length);
  const firstSize = Math.floor(Math.max(0, length - gap) * splitRatio(ratio));
  const remaining = Math.max(0, length - gap - firstSize);
  return horizontal
    ? {
        first: { ...bounds, width: firstSize },
        second: { ...bounds, x: bounds.x + firstSize + gap, width: remaining },
      }
    : {
        first: { ...bounds, height: firstSize },
        second: { ...bounds, y: bounds.y + firstSize + gap, height: remaining },
      };
}
