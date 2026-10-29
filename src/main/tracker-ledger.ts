import type { TrackerSnapshot } from "../shared/trackers";

/** Session-only counters, bounded groups. Never retain full URLs/headers/query. */
export class TrackerLedger {
  private groups = new Map<
    string,
    TrackerSnapshot["records"][number] & { profileId: string }
  >();
  private totals = new Map<string, number>();
  record(
    profileId: string,
    site: string,
    rule: string,
    category: "advertising" | "analytics",
    privateMode = false,
  ) {
    const source = privateMode ? "$private" : site || "$background";
    const key = `${profileId}\0${source}\0${rule}`;
    const previous = this.groups.get(key);
    this.groups.delete(key);
    this.groups.set(key, {
      profileId,
      site: source,
      rule,
      category,
      count: (previous?.count || 0) + 1,
      lastBlockedAt: Date.now(),
    });
    this.totals.set(profileId, (this.totals.get(profileId) || 0) + 1);
    if (this.groups.size > 200)
      this.groups.delete(this.groups.keys().next().value!);
  }
  snapshot(profileId: string): TrackerSnapshot {
    return {
      profileId,
      total: this.totals.get(profileId) || 0,
      records: [...this.groups.values()]
        .filter((item) => item.profileId === profileId)
        .map(({ profileId: _id, ...record }) => ({ ...record }))
        .reverse(),
    };
  }
  clear(profileId: string) {
    this.totals.delete(profileId);
    for (const [key, value] of this.groups)
      if (value.profileId === profileId) this.groups.delete(key);
  }
}
