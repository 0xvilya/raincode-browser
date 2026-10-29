import { describe, expect, it } from "vitest";
import { PrivacyMonitor } from "../../src/main/privacy-monitor";

describe("privacy monitor consent and bounds", () => {
  it("only collects the selected contents and profile, strips URL data, bounds and clears", () => {
    const monitor = new PrivacyMonitor();
    monitor.record(
      1,
      "https://secret.test/private?q=secret",
      "script",
      "observed",
    );
    expect(monitor.snapshot("p")).toEqual({ active: false, records: [] });
    monitor.start("tab", "p", 1, "https://site.test");
    monitor.record(2, "https://elsewhere.test/?q=secret", "script", "observed");
    for (let i = 0; i < 205; i++)
      monitor.record(
        1,
        `https://h${i}.example/path?q=secret`,
        "script",
        "observed",
      );
    expect(monitor.snapshot("other")).toEqual({ active: false, records: [] });
    expect(monitor.snapshot("p").records).toHaveLength(200);
    expect(JSON.stringify(monitor.snapshot("p"))).not.toContain("secret");
    expect(monitor.shouldStop(1, "mainFrame", "https://site.test/next")).toBe(
      false,
    );
    expect(monitor.shouldStop(1, "mainFrame", "https://other.test/")).toBe(
      true,
    );
    monitor.stop();
    expect(monitor.snapshot("p")).toEqual({ active: false, records: [] });
  });
});
