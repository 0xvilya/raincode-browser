export type MonitorAction = "observed" | "tracker" | "blocked" | "redirected";
export interface MonitorEntry {
  host: string;
  resourceType: string;
  action: MonitorAction;
  crossOrigin: boolean | null;
  count: number;
}

/** Explicitly started, memory-only, single-document-origin counters. No URLs,
 * paths, queries, request headers, cookies or payloads are retained. */
export class PrivacyMonitor {
  private current?: {
    tabId: string;
    profileId: string;
    contentsId: number;
    origin: string;
    records: Map<string, MonitorEntry>;
  };
  start(tabId: string, profileId: string, contentsId: number, origin: string) {
    this.current = { tabId, profileId, contentsId, origin, records: new Map() };
  }
  stop() {
    this.current = undefined;
  }
  owns(tabId: string) {
    return this.current?.tabId === tabId;
  }
  snapshot(profileId: string) {
    const current = this.current;
    if (!current || current.profileId !== profileId)
      return { active: false, records: [] as MonitorEntry[] };
    return {
      active: true,
      tabId: current.tabId,
      records: [...current.records.values()].reverse(),
    };
  }
  shouldStop(
    contentsId: number | undefined,
    resourceType: string,
    url: string,
  ) {
    if (
      !this.current ||
      contentsId !== this.current.contentsId ||
      resourceType !== "mainFrame"
    )
      return false;
    try {
      return new URL(url).origin !== this.current.origin;
    } catch {
      return true;
    }
  }
  record(
    contentsId: number | undefined,
    url: string,
    resourceType: string,
    action: MonitorAction,
  ) {
    const current = this.current;
    if (!current || contentsId !== current.contentsId) return;
    try {
      const target = new URL(url);
      if (!["http:", "https:", "ws:", "wss:"].includes(target.protocol)) return;
      const comparable = new URL(target.href);
      if (comparable.protocol === "ws:") comparable.protocol = "http:";
      if (comparable.protocol === "wss:") comparable.protocol = "https:";
      const crossOrigin =
        resourceType === "mainFrame"
          ? false
          : comparable.origin !== current.origin;
      const host = target.hostname.slice(0, 253);
      const kind = resourceType.slice(0, 40);
      const key = `${host}\0${kind}\0${action}\0${crossOrigin}`;
      const previous = current.records.get(key);
      current.records.delete(key);
      current.records.set(key, {
        host,
        resourceType: kind,
        action,
        crossOrigin,
        count: (previous?.count || 0) + 1,
      });
      if (current.records.size > 200)
        current.records.delete(current.records.keys().next().value!);
    } catch {
      /* Invalid URLs are not recorded. */
    }
  }
}
