import { describe, expect, it } from "vitest";
import { reviewHeaders } from "../../src/main/header-review";
import { formatHeaderReport } from "../../src/shared/security-report";

describe("security report export", () => {
  it.each(["json", "markdown", "html", "sarif"] as const)(
    "exports %s without raw values or URL secrets",
    (format) => {
      const report = reviewHeaders(
        "https://example.test/private?token=private-secret",
        {
          "set-cookie": ["secret-cookie=secret-value"],
          "x-secret": ["raw-header-secret"],
        },
      );
      const { content } = formatHeaderReport(report, format);
      expect(content).toContain(
        format === "markdown" ? "example\\.test" : "example.test",
      );
      for (const secret of [
        "private-secret",
        "secret-cookie",
        "secret-value",
        "raw-header-secret",
        "/private",
      ])
        expect(content).not.toContain(secret);
    },
  );
  it("escapes active HTML and emits a restrictive offline document", () => {
    const report = reviewHeaders("https://example.test", {});
    report.findings[0].detail =
      '<script>alert("unsafe")</script><img src="https://host.test">';
    const { content } = formatHeaderReport(report, "html");
    expect(content).not.toContain("<script>");
    expect(content).not.toContain("<img");
    expect(content).toContain("&lt;script&gt;");
    expect(content).toContain("default-src 'none'");
  });
  it("uses SARIF warnings, not invented confirmed vulnerability severity", () => {
    const data = JSON.parse(
      formatHeaderReport(reviewHeaders("https://example.test", {}), "sarif")
        .content,
    );
    expect(data.version).toBe("2.1.0");
    expect(data.runs[0].results.length).toBeGreaterThan(0);
    expect(
      data.runs[0].results.every(
        (result: {
          level: string;
          properties: { confirmedVulnerability: boolean };
        }) =>
          result.level === "warning" &&
          !result.properties.confirmedVulnerability,
      ),
    ).toBe(true);
    expect(
      data.runs[0].results.some(
        (result: { ruleId: string }) => result.ruleId === "https",
      ),
    ).toBe(false);
  });
  it("rejects credential-bearing and non-web origin metadata", () => {
    const report = reviewHeaders("https://example.test", {});
    expect(() =>
      formatHeaderReport(
        { ...report, origin: "https://secret:password@example.test" },
        "json",
      ),
    ).toThrow();
    expect(() =>
      formatHeaderReport({ ...report, origin: "file:///secret" }, "html"),
    ).toThrow();
  });
});
