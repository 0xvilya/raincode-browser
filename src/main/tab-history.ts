import type { Tab } from "../shared/contracts";

type Timeline = NonNullable<Tab["timeline"]>;
type TimelineEntry = Timeline["entries"][number];

/** Reflect logical browser history, including trusted internal pages. Native
 * history remains responsible for each remote document's actual navigation. */
export function applyTimelineFlags(tab: Tab): void {
  const history = tab.timeline;
  if (!history) return;
  tab.canGoBack = history.index > 0;
  tab.canGoForward = history.index < history.entries.length - 1;
}

/** Add a committed page or internal route without retaining form/page state. */
export function appendTimeline(
  tab: Tab,
  url: string,
  title: string,
  nativeIndex?: number,
): void {
  const history = tab.timeline || { entries: [], index: -1 };
  const current = history.entries[history.index];
  if (current?.url === url) {
    current.title = title;
    if (nativeIndex !== undefined) current.nativeIndex = nativeIndex;
  } else {
    history.entries = history.entries.slice(0, history.index + 1);
    const entry: TimelineEntry = { url, title };
    if (nativeIndex !== undefined) entry.nativeIndex = nativeIndex;
    history.entries.push(entry);
    if (history.entries.length > 100)
      history.entries = history.entries.slice(-100);
    history.index = history.entries.length - 1;
  }
  tab.timeline = history;
  applyTimelineFlags(tab);
}

/** Look up a traversal destination; the caller commits its index only after
 * native navigation succeeds, so a failed load cannot silently advance it. */
export function timelineTarget(
  tab: Tab,
  offset: number,
): (TimelineEntry & { index: number }) | undefined {
  const history = tab.timeline;
  if (!history || !Number.isInteger(offset)) return;
  const index = history.index + offset;
  if (index < 0 || index >= history.entries.length) return;
  return { ...history.entries[index], index };
}
