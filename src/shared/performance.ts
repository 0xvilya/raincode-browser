import type { Settings } from "./contracts";

/** Decorative UI only: never changes native page FPS or site JavaScript. */
export function decorationBudget(settings: Settings, hardware = 4) {
  const economy = settings.powerSave || settings.performanceMode === "eco";
  const cap = settings.powerSave
    ? 15
    : settings.performanceMode === "eco"
      ? 20
      : settings.performanceMode === "ultra"
        ? 60
        : 30;
  return {
    economy,
    fps: Math.min(settings.fps, cap, hardware <= 2 ? 24 : 60),
    particles: economy ? 28 : hardware <= 2 ? 110 : hardware <= 4 ? 240 : 520,
  };
}
