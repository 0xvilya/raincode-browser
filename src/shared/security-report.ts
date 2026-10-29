import type { HeaderReview } from "../main/header-review";

export type SecurityReportFormat = "json" | "markdown" | "html" | "sarif";
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const escapeMarkdown = (text: string) =>
  escapeHtml(text)
    .replace(/[\\`*_{}\[\]()#+.!|>-]/g, "\\$&")
    .replace(/\r?\n/g, " ");

/** Serializes only the bounded analyzer result, never response headers or page source. */
export function formatHeaderReport(
  report: HeaderReview,
  format: SecurityReportFormat,
): { content: string; mime: string; extension: string } {
  const url = new URL(report.origin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !Number.isFinite(report.capturedAt)
  )
    throw new Error("Invalid report metadata");
  const origin = url.origin;
  const date = new Date(report.capturedAt).toISOString();
  const findings = report.findings
    .slice(0, 100)
    .map((finding) => ({
      rule: finding.rule.slice(0, 128),
      status: finding.status,
      detail: finding.detail.slice(0, 4096),
    }));
  const data = {
    title: "Rain passive header review",
    origin,
    capturedAt: report.capturedAt,
    method: "Observed main-frame response header heuristics",
    findings,
    limitation: report.limitation.slice(0, 8192),
  };
  if (format === "json")
    return {
      content: JSON.stringify(data, null, 2),
      mime: "application/json",
      extension: "json",
    };
  if (format === "sarif") {
    const rules = [...new Set(findings.map((finding) => finding.rule))];
    return {
      mime: "application/sarif+json",
      extension: "sarif",
      content: JSON.stringify(
        {
          version: "2.1.0",
          $schema: "https://json.schemastore.org/sarif-2.1.0.json",
          runs: [
            {
              tool: {
                driver: {
                  name: "Rain passive header review",
                  rules: rules.map((id) => ({
                    id,
                    shortDescription: { text: id },
                  })),
                },
              },
              invocations: [
                {
                  executionSuccessful: true,
                  startTimeUtc: date,
                  properties: {
                    method: data.method,
                    limitation: data.limitation,
                  },
                },
              ],
              results: findings
                .filter((finding) => finding.status === "warning")
                .map((finding) => ({
                  ruleId: finding.rule,
                  level: "warning",
                  message: { text: finding.detail },
                  locations: [
                    {
                      physicalLocation: {
                        artifactLocation: { uri: origin + "/" },
                      },
                    },
                  ],
                  properties: {
                    confidence: "heuristic",
                    confirmedVulnerability: false,
                  },
                })),
            },
          ],
        },
        null,
        2,
      ),
    };
  }
  if (format === "markdown")
    return {
      mime: "text/markdown;charset=utf-8",
      extension: "md",
      content: `# Rain passive header review\n\nOrigin: ${escapeMarkdown(origin)}\n\nCaptured: ${date}\n\nMethod: ${data.method}\n\n${findings.map((finding) => `- **${escapeMarkdown(finding.rule)}** (${finding.status}): ${escapeMarkdown(finding.detail)}`).join("\n")}\n\n## Limitations\n\n${escapeMarkdown(data.limitation)}\n`,
    };
  if (format !== "html") throw new Error("Unsupported report format");
  return {
    mime: "text/html;charset=utf-8",
    extension: "html",
    content: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><title>Rain passive header review</title></head><body><h1>Rain passive header review</h1><p>Origin: ${escapeHtml(origin)}</p><p>Captured: ${escapeHtml(date)}</p><p>Method: ${escapeHtml(data.method)}</p><ul>${findings.map((finding) => `<li><strong>${escapeHtml(finding.rule)}</strong> (${escapeHtml(finding.status)}): ${escapeHtml(finding.detail)}</li>`).join("")}</ul><h2>Limitations</h2><p>${escapeHtml(data.limitation)}</p></body></html>`,
  };
}
