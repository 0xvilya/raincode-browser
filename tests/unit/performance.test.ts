import { afterEach, expect, it, vi } from "vitest";
import { TabSleepScheduler } from "../../src/main/tab-sleep";
import { decorationBudget } from "../../src/shared/performance";
import { defaultSettings } from "../../src/shared/contracts";

afterEach(() => vi.useRealTimers());
it("keeps one background deadline, cancels activation/off, never repeatedly probes a protected tab", () => {
  vi.useFakeTimers();
  const expire = vi.fn();
  const scheduler = new TabSleepScheduler(expire);
  scheduler.sync(["a", "b"], 300000);
  vi.advanceTimersByTime(100000);
  scheduler.sync(["a", "b"], 300000);
  vi.advanceTimersByTime(100000);
  scheduler.sync(["b"], 300000);
  vi.advanceTimersByTime(100000);
  expect(expire.mock.calls).toEqual([["b"]]);
  scheduler.sync(["b"], 300000);
  vi.advanceTimersByTime(600000);
  expect(expire).toHaveBeenCalledTimes(1);
  scheduler.sync(["a", "b"], 300000);
  scheduler.sync(["a", "b"], 0);
  vi.advanceTimersByTime(600000);
  expect(expire).toHaveBeenCalledTimes(1);
  scheduler.sync(["a"], 300000);
  scheduler.dispose();
  vi.advanceTimersByTime(600000);
  expect(expire).toHaveBeenCalledTimes(1);
});
it("caps only decorative work for ECO/BALANCED/ULTRA and weak hardware", () => {
  for (const [mode, fps] of [
    ["eco", 20],
    ["balanced", 30],
    ["ultra", 60],
  ] as const)
    expect(
      decorationBudget(
        { ...defaultSettings, performanceMode: mode, fps: 60 },
        8,
      ).fps,
    ).toBe(fps);
  expect(
    decorationBudget(
      { ...defaultSettings, performanceMode: "ultra", fps: 60 },
      2,
    ).fps,
  ).toBe(24);
  expect(
    decorationBudget({ ...defaultSettings, powerSave: true, fps: 60 }, 8),
  ).toMatchObject({ fps: 15, particles: 28, economy: true });
});
