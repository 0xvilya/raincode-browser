import { expect, it } from "vitest";
import { TrackerLedger } from "../../src/main/tracker-ledger";
import { classifyTrackerRequest } from "../../src/main/content-policy";
import { commandSchema } from "../../src/shared/contracts";

it("uses exact site exceptions without exempting safety guards or lookalike hosts", () => {
  const request = "https://a.google-analytics.com/collect?secret=discard";
  expect(
    classifyTrackerRequest(request, "example.org", false, true, []),
  ).toEqual({ rule: "google-analytics.com", category: "analytics" });
  expect(
    classifyTrackerRequest(request, "example.org", false, true, [
      "example.org",
    ]),
  ).toBeUndefined();
  expect(
    classifyTrackerRequest(request, "www.example.org", false, true, [
      "example.org",
    ]),
  ).toBeTruthy();
  expect(
    classifyTrackerRequest(request, "google-analytics.com", false, true, []),
  ).toBeUndefined();
  expect(
    classifyTrackerRequest(request, "example.org", true, true, []),
  ).toBeUndefined();
  expect(
    classifyTrackerRequest(
      "https://google-analytics.com.evil.test/",
      "example.org",
      false,
      true,
      [],
    ),
  ).toBeUndefined();
  expect(
    classifyTrackerRequest(request, "example.org", false, false, []),
  ).toBeUndefined();
});
it("keeps bounded per-profile real counters, masks private sources and clears without cross-profile deletion", () => {
  const ledger = new TrackerLedger();
  ledger.record("tor", "private.onion", "doubleclick.net", "advertising", true);
  ledger.record("other", "example.org", "google-analytics.com", "analytics");
  expect(JSON.stringify(ledger.snapshot("tor"))).not.toContain("private.onion");
  for (let i = 0; i < 250; i++)
    ledger.record(
      "other",
      `site${i}.example`,
      "doubleclick.net",
      "advertising",
    );
  expect(ledger.snapshot("other").records.length).toBeLessThanOrEqual(200);
  expect(ledger.snapshot("other").total).toBe(251);
  const copy = ledger.snapshot("other");
  copy.records[0].count = 999;
  expect(ledger.snapshot("other").records[0].count).toBe(1);
  ledger.clear("other");
  expect(ledger.snapshot("other").total).toBe(0);
  expect(ledger.snapshot("tor").total).toBe(1);
});
it.each([
  "user:secret@example.org",
  "https://example.org/path",
  "*.example.org",
  "example..org",
  "bad\nhost",
])("rejects unsafe persisted exception %s", (host) => {
  expect(
    commandSchema.safeParse({
      type: "settings.update",
      settings: { trackerExceptions: [host] },
    }).success,
  ).toBe(false);
});
