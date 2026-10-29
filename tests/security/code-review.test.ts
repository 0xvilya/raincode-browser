import { describe, expect, it } from "vitest";
import {
  MAX_CODE_BYTES,
  MAX_CODE_FINDINGS,
  reviewCode,
} from "../../src/shared/code-review";

describe("passive supplied code review", () => {
  it("finds risky sinks and configurations with accurate lines", () => {
    const report = reviewCode(
      "eval(input);\nnew Function(input);\nnode.innerHTML = input;\ndocument.write(input);\n({nodeIntegration: true, sandbox: false, contextIsolation: false, webSecurity: false})",
    );
    expect(report.findings.map((item) => item.rule)).toEqual([
      "dynamic-eval",
      "dynamic-function",
      "html-assignment",
      "document-write",
      "node-integration",
      "sandbox-disabled",
      "context-isolation-disabled",
      "web-security-disabled",
    ]);
    expect(report.findings.map((item) => item.line)).toEqual([
      1, 2, 3, 4, 5, 5, 5, 5,
    ]);
    expect(report.limitation).toContain("not confirmed vulnerabilities");
  });
  it("does not execute input or include its content in findings", () => {
    const secret = "sensitive-value-never-export";
    const result = reviewCode(
      `throw Error('must not execute');\nconst apiKey = '${secret}';`,
    );
    expect(result.findings[0]).toMatchObject({
      rule: "embedded-credential",
      line: 2,
      confidence: "low",
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("must not execute");
  });
  it("masks comments and strings without corrupting line numbers", () => {
    const result = reviewCode(
      "// eval(bad)\n/* sandbox: false\n nodeIntegration: true */\nconst text = 'document.write(bad)';\nconst url = 'https://example.test';\neval(input);",
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].line).toBe(6);
  });
  it("handles escaped quotes and line endings", () => {
    const result = reviewCode(
      "const text = 'escaped \\' eval(x)';\r\neval(x);\rdocument.writeln(x);",
    );
    expect(result.findings.map((item) => item.line)).toEqual([2, 3]);
  });
  it("does not flag safe settings or a comparison", () => {
    expect(
      reviewCode(
        "({sandbox:true, nodeIntegration:false, contextIsolation:true,webSecurity:true}); if(x.innerHTML === '') {};",
      ).findings,
    ).toEqual([]);
  });
  it("enforces UTF-8 byte bound before analysis", () => {
    expect(() => reviewCode("a".repeat(MAX_CODE_BYTES + 1))).toThrow(
      RangeError,
    );
    expect(() => reviewCode("я".repeat(MAX_CODE_BYTES / 2 + 1))).toThrow(
      RangeError,
    );
    expect(reviewCode("a".repeat(MAX_CODE_BYTES)).findings).toEqual([]);
  });
  it("caps findings with an explicit incomplete result", () => {
    const result = reviewCode("eval(x);\n".repeat(MAX_CODE_FINDINGS + 1));
    expect(result.findings).toHaveLength(MAX_CODE_FINDINGS);
    expect(result.truncated).toBe(true);
    expect(reviewCode("eval(x);\n".repeat(MAX_CODE_FINDINGS)).truncated).toBe(
      false,
    );
  });
  it("does not extract commented credentials", () => {
    expect(
      reviewCode(
        "// apiKey = 'sensitive-test-value';\n/* password: 'sensitive-test-value' */",
      ).findings,
    ).toEqual([]);
  });
});
