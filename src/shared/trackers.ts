export interface TrackerSnapshot {
  profileId: string;
  total: number;
  records: {
    site: string;
    rule: string;
    category: "advertising" | "analytics";
    count: number;
    lastBlockedAt: number;
  }[];
}
