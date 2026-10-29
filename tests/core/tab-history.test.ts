import { describe, expect, it } from "vitest";
import {
  appendTimeline,
  applyTimelineFlags,
  timelineTarget,
} from "../../src/main/tab-history";
import type { Tab } from "../../src/shared/contracts";

function tab(): Tab {
  return {
    id: "history-test",
    title: "Start",
    url: "raincode://newtab",
    profileId: "default",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    pinned: false,
    muted: false,
    zoom: 1,
  };
}

describe("logical tab history", () => {
  it("keeps native and internal routes in one ordered navigation timeline", () => {
    const current = tab();
    appendTimeline(current, "https://example.com/first", "First", 0);
    appendTimeline(current, "https://example.com/second", "Second", 1);
    appendTimeline(current, "raincode://newtab", "New tab");
    expect(current).toMatchObject({ canGoBack: true, canGoForward: false });
    expect(timelineTarget(current, -1)).toEqual({
      url: "https://example.com/second",
      title: "Second",
      nativeIndex: 1,
      index: 1,
    });
    expect(current.timeline?.index).toBe(2);
    expect(timelineTarget(current, 1)).toBeUndefined();
    current.timeline!.index = 1;
    applyTimelineFlags(current);
    expect(current).toMatchObject({ canGoBack: true, canGoForward: true });
    expect(timelineTarget(current, 1)?.url).toBe("raincode://newtab");
  });

  it("cuts abandoned forward entries when a new navigation commits", () => {
    const current = tab();
    appendTimeline(current, "raincode://newtab", "Start");
    appendTimeline(current, "raincode://history", "History");
    appendTimeline(current, "raincode://recently-closed", "Closed");
    current.timeline!.index = 1;
    appendTimeline(current, "https://example.com/", "Example", 0);
    expect(current.timeline?.entries.map((entry) => entry.url)).toEqual([
      "raincode://newtab",
      "raincode://history",
      "https://example.com/",
    ]);
    expect(current).toMatchObject({ canGoBack: true, canGoForward: false });
  });

  it("deduplicates current URL while refreshing its title and native index", () => {
    const current = tab();
    appendTimeline(current, "https://example.com/", "Loading", 0);
    appendTimeline(current, "raincode://history", "History");
    current.timeline!.index = 0;
    appendTimeline(current, "https://example.com/", "Example", 2);
    appendTimeline(current, "https://example.com/", "Example renamed");
    expect(current.timeline).toEqual({
      entries: [
        {
          url: "https://example.com/",
          title: "Example renamed",
          nativeIndex: 2,
        },
        { url: "raincode://history", title: "History" },
      ],
      index: 0,
    });
    expect(current).toMatchObject({ canGoBack: false, canGoForward: true });
  });

  it("caps persisted navigation without changing retained native indices", () => {
    const current = tab();
    for (let index = 0; index < 110; index++)
      appendTimeline(
        current,
        `https://example.com/${index}`,
        `${index}`,
        index,
      );
    expect(current.timeline?.entries).toHaveLength(100);
    expect(current.timeline?.index).toBe(99);
    expect(current.timeline?.entries[0]).toEqual({
      url: "https://example.com/10",
      title: "10",
      nativeIndex: 10,
    });
    expect(timelineTarget(current, -99)?.nativeIndex).toBe(10);
    expect(timelineTarget(current, -100)).toBeUndefined();
  });

  it("leaves native flags intact before a logical history exists", () => {
    const current = tab();
    current.canGoBack = true;
    applyTimelineFlags(current);
    expect(current.canGoBack).toBe(true);
    expect(timelineTarget(current, -1)).toBeUndefined();
    appendTimeline(current, "raincode://newtab", "Start");
    expect(timelineTarget(current, -1)).toBeUndefined();
    expect(timelineTarget(current, 0.5)).toBeUndefined();
    expect(current).toMatchObject({ canGoBack: false, canGoForward: false });
  });
});
