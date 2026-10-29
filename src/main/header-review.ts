export interface HeaderFinding {
  rule: string;
  status: "passed" | "warning";
  detail: string;
}
export interface HeaderReview {
  origin: string;
  capturedAt: number;
  findings: HeaderFinding[];
  limitation: string;
}

/** Pure passive heuristics. Raw values never enter the returned report. */
export function reviewHeaders(
  input: string,
  headers: Record<string, string[]>,
): HeaderReview {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("HEADER_REVIEW_INVALID_URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("HEADER_REVIEW_INVALID_URL");
  const values = (name: string) =>
    Object.entries(headers)
      .filter(([key]) => key.toLowerCase() === name)
      .flatMap(([, value]) => value)
      .slice(0, 20)
      .map((value) => value.slice(0, 16384));
  const findings: HeaderFinding[] = [];
  const add = (rule: string, passed: boolean, detail: string) =>
    findings.push({ rule, status: passed ? "passed" : "warning", detail });
  add(
    "https",
    url.protocol === "https:",
    url.protocol === "https:"
      ? "Response URL uses HTTPS; certificate validation and TLS configuration are not assessed here."
      : "Response URL uses plaintext HTTP; content may be observable in transit.",
  );
  const hsts = values("strict-transport-security");
  const age = hsts[0]?.match(
    /(?:^|;)\s*max-age\s*=\s*(?:"(\d+)"|(\d+))\s*(?:;|$)/i,
  );
  const positiveAge = !!age && BigInt(age[1] || age[2]) > 0n;
  add(
    "hsts",
    url.protocol === "https:" && hsts.length === 1 && positiveAge,
    url.protocol !== "https:"
      ? "HSTS is not honored from an HTTP response."
      : hsts.length === 1 && positiveAge
        ? "One HSTS header with positive max-age observed; preload, subdomains and effective browser state are not verified."
        : "No single HSTS header with a positive max-age was observed. Review transport requirements for this site.",
  );
  const csp = values("content-security-policy").filter((value) => value.trim());
  const reportOnly = values("content-security-policy-report-only").some(
    (value) => value.trim(),
  );
  add(
    "csp",
    csp.length > 0,
    csp.length
      ? "Enforcing CSP header observed; presence does not establish a safe or valid policy. Directive semantics, nonces and bypasses are not assessed."
      : reportOnly
        ? "Only report-only CSP observed; report-only policies do not enforce restrictions."
        : "No enforcing CSP header observed. Meta policies and application context are not assessed.",
  );
  const nosniff = values("x-content-type-options");
  add(
    "nosniff",
    nosniff.length === 1 && nosniff[0].trim().toLowerCase() === "nosniff",
    "Expected one X-Content-Type-Options header with the nosniff token; resource MIME correctness is not assessed.",
  );
  const referrers = values("referrer-policy")
    .join(",")
    .toLowerCase()
    .split(",")
    .map((value) => value.trim());
  const known = new Set([
    "no-referrer",
    "no-referrer-when-downgrade",
    "origin",
    "origin-when-cross-origin",
    "same-origin",
    "strict-origin",
    "strict-origin-when-cross-origin",
    "unsafe-url",
  ]);
  const effective = referrers.filter((value) => known.has(value)).at(-1);
  add(
    "referrer-policy",
    !!effective &&
      [
        "no-referrer",
        "same-origin",
        "strict-origin",
        "strict-origin-when-cross-origin",
      ].includes(effective),
    "Checks the last recognized header policy against conservative choices. Missing headers may still receive browser defaults or document policies.",
  );
  const permissions = values("permissions-policy");
  const shaped =
    permissions.length > 0 &&
    permissions.every(
      (value) =>
        value.length > 0 &&
        value
          .split(",")
          .every((part) =>
            /^\s*[a-z][a-z0-9-]*\s*=\s*(?:\*|\([^()]*\))\s*$/i.test(part),
          ),
    );
  add(
    "permissions-policy",
    shaped,
    "Checks only basic directive-list shape. Supported feature names, origin allowlists and effective permissions are not validated.",
  );
  return {
    origin: url.origin,
    capturedAt: Date.now(),
    findings,
    limitation:
      "Passive heuristics over supplied response headers only. Missing or suspicious headers are review warnings, not confirmed vulnerabilities. No active requests, exploitation, certificate audit, cookie-value collection or complete CSP validation is performed.",
  };
}
