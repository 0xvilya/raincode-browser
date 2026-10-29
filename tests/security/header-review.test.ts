import { describe, expect, it } from "vitest";
import { reviewHeaders } from "../../src/main/header-review";

const status = (report: ReturnType<typeof reviewHeaders>, rule: string) =>
  report.findings.find((finding) => finding.rule === rule)?.status;
describe("passive header review", () => {
  it("recognizes mixed-case headers without claiming semantic validation", () => {
    const result = reviewHeaders("https://example.test/path", {
      "Strict-Transport-Security": ["max-age=31536000; includeSubDomains"],
      "Content-Security-Policy": ["default-src 'self'"],
      "X-Content-Type-Options": ["nosniff"],
      "Referrer-Policy": ["strict-origin-when-cross-origin"],
      "Permissions-Policy": ["camera=(), microphone=(self)"],
    });
    expect(
      result.findings.every((finding) => finding.status === "passed"),
    ).toBe(true);
    expect(result.limitation).toContain("not confirmed vulnerabilities");
  });
  it("returns warnings for plaintext, missing enforcement and invalid values", () => {
    const result = reviewHeaders("http://example.test/", {
      "strict-transport-security": ["max-age=31536000"],
      "content-security-policy-report-only": ["default-src 'none'"],
      "x-content-type-options": ["bad-token"],
      "referrer-policy": ["no-referrer, unsafe-url"],
      "permissions-policy": ["camera=broken"],
    });
    expect(
      result.findings.every((finding) => finding.status === "warning"),
    ).toBe(true);
    expect(
      result.findings.find((finding) => finding.rule === "csp")?.detail,
    ).toContain("report-only");
  });
  it.each([
    "max-age=0",
    "max-age=-1",
    "max-age=abc",
    "max-age=1garbage",
    'max-age="0"',
  ])("rejects ineffective/malformed HSTS %s", (value) => {
    expect(
      status(
        reviewHeaders("https://example.test/", {
          "strict-transport-security": [value],
        }),
        "hsts",
      ),
    ).toBe("warning");
  });
  it("warns on duplicate HSTS and follows the last recognized referrer token", () => {
    const result = reviewHeaders("https://example.test/", {
      "strict-transport-security": ["max-age=10", "max-age=20"],
      "referrer-policy": ["unsafe-url, no-referrer, unknown"],
    });
    expect(status(result, "hsts")).toBe("warning");
    expect(status(result, "referrer-policy")).toBe("passed");
  });
  it("does not retain URL paths, queries, fragments or supplied secrets", () => {
    const result = reviewHeaders(
      "https://example.test/private-path?token=query-secret#fragment-secret",
      {
        "set-cookie": ["auth=cookie-secret; HttpOnly"],
        "content-security-policy": [
          "report-uri https://secret-report.test/token",
        ],
        "permissions-policy": ['camera=("https://secret-origin.test")'],
        "x-private": ["header-secret"],
      },
    );
    const output = JSON.stringify(result);
    for (const value of [
      "private-path",
      "query-secret",
      "fragment-secret",
      "cookie-secret",
      "secret-report",
      "secret-origin",
      "header-secret",
    ])
      expect(output).not.toContain(value);
    expect(result.origin).toBe("https://example.test");
  });
  it.each([
    "file:///secret",
    "data:text/plain,secret",
    "not a url",
    "https://user:secret@example.test/",
  ])("rejects unsupported URL %s", (url) => {
    expect(() => reviewHeaders(url, {})).toThrow("HEADER_REVIEW_INVALID_URL");
  });
});
