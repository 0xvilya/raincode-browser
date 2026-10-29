export const MAX_CODE_BYTES = 256 * 1024;
export const MAX_CODE_FINDINGS = 200;

export type CodeRule =
  | "dynamic-eval"
  | "dynamic-function"
  | "html-assignment"
  | "document-write"
  | "node-integration"
  | "sandbox-disabled"
  | "context-isolation-disabled"
  | "web-security-disabled"
  | "embedded-credential";

export interface CodeFinding {
  rule: CodeRule;
  line: number;
  confidence: "low" | "medium";
  recommendation: string;
}

export interface CodeReview {
  findings: CodeFinding[];
  truncated: boolean;
  limitation: string;
}

const rules: {
  rule: CodeRule;
  pattern: RegExp;
  recommendation: string;
}[] = [
  {
    rule: "dynamic-eval",
    pattern: /\beval\s*\(/g,
    recommendation:
      "Avoid evaluating strings; use structured data and explicit operations.",
  },
  {
    rule: "dynamic-function",
    pattern: /\b(?:new\s+)?Function\s*\(/g,
    recommendation:
      "Replace dynamically compiled strings with predefined functions.",
  },
  {
    rule: "html-assignment",
    pattern: /\.\s*(?:innerHTML|outerHTML)\s*=(?!=)/g,
    recommendation:
      "Use textContent for text; validate and sanitize any intentionally inserted markup.",
  },
  {
    rule: "document-write",
    pattern: /\bdocument\s*\.\s*write(?:ln)?\s*\(/g,
    recommendation:
      "Use DOM construction instead of document.write and validate untrusted input.",
  },
  {
    rule: "node-integration",
    pattern: /\bnodeIntegration\s*:\s*true\b/g,
    recommendation:
      "Keep Node integration disabled for untrusted renderer content and expose only a narrow validated bridge.",
  },
  {
    rule: "sandbox-disabled",
    pattern: /\bsandbox\s*:\s*false\b/g,
    recommendation:
      "Enable the renderer sandbox; do not grant untrusted content native privileges.",
  },
  {
    rule: "context-isolation-disabled",
    pattern: /\bcontextIsolation\s*:\s*false\b/g,
    recommendation:
      "Enable context isolation and validate every privileged bridge request.",
  },
  {
    rule: "web-security-disabled",
    pattern: /\bwebSecurity\s*:\s*false\b/g,
    recommendation:
      "Keep webSecurity enabled; resolve cross-origin access through explicit safe interfaces.",
  },
];

// Lightweight lexical masking, not a JavaScript parser. Preserve line positions.
function mask(source: string): { code: string; withoutComments: string } {
  let state: "code" | "line" | "block" | "string" = "code";
  let quote = "";
  let escaped = false;
  const code: string[] = [];
  const withoutComments: string[] = [];
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    const blank = char === "\n" || char === "\r" ? char : " ";
    if (state === "line" || state === "block") {
      code.push(blank);
      withoutComments.push(blank);
      if (state === "line" && (char === "\n" || char === "\r")) state = "code";
      else if (state === "block" && char === "*" && next === "/") {
        code.push(" ");
        withoutComments.push(" ");
        index++;
        state = "code";
      }
    } else if (state === "string") {
      code.push(blank);
      withoutComments.push(char);
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) state = "code";
    } else if (char === "/" && (next === "/" || next === "*")) {
      code.push(" ", " ");
      withoutComments.push(" ", " ");
      index++;
      state = next === "/" ? "line" : "block";
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char;
      state = "string";
      code.push(" ");
      withoutComments.push(char);
    } else {
      code.push(char);
      withoutComments.push(char);
    }
  }
  return { code: code.join(""), withoutComments: withoutComments.join("") };
}

/** Local, passive heuristics over explicitly supplied code. Never executes or transmits it. */
export function reviewCode(source: string): CodeReview {
  if (typeof source !== "string") throw new TypeError("Code must be text");
  if (
    source.length > MAX_CODE_BYTES ||
    new TextEncoder().encode(source).length > MAX_CODE_BYTES
  )
    throw new RangeError("Code exceeds the 256 KiB review limit");
  const { code, withoutComments } = mask(source);
  const findings: CodeFinding[] = [];
  let truncated = false;
  // Scan lines so matching cannot cause an unbounded number of retained results.
  const lines = code.split(/\r\n|\r|\n/);
  const originalLines = withoutComments.split(/\r\n|\r|\n/);
  function add(finding: CodeFinding) {
    if (findings.length < MAX_CODE_FINDINGS) findings.push(finding);
    else truncated = true;
  }
  for (let index = 0; index < lines.length; index++) {
    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(lines[index]))
        add({
          rule: rule.rule,
          line: index + 1,
          confidence: "medium",
          recommendation: rule.recommendation,
        });
    }
    if (
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*["']?\s*[:=]\s*["'][^"'\r\n]{8,}["']/i.test(
        originalLines[index],
      )
    ) {
      add({
        rule: "embedded-credential",
        line: index + 1,
        confidence: "low",
        recommendation:
          "Check whether this literal is a real secret; remove it from client code and rotate exposed credentials. Values are intentionally omitted.",
      });
    }
    if (truncated) break;
  }
  return {
    findings,
    truncated,
    limitation:
      "Heuristic review of supplied text only, not confirmed vulnerabilities or proof of safety. No execution, dependency database, data-flow analysis or runtime validation. Comments and ordinary strings are masked; computed properties, quoted configuration keys, template expressions, multiline constructs and regular expressions are not fully parsed. False positives and missed issues are possible. Findings include no source snippets or secret values.",
  };
}
