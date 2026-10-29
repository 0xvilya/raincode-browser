import { describe, expect, it, vi } from "vitest";
import { AiConsentGate } from "../../src/main/ai/consent";

const scope = {
  profileId: "personal",
  tabId: "tab-1",
  documentId: "doc-1",
  origin: "https://example.com",
};

describe("AI consent gate", () => {
  it("defaults to denied and requires a separate cloud upload grant", () => {
    const gate = new AiConsentGate();
    expect(() => gate.begin(scope, "pageContext")).toThrow(
      "AI_CONSENT_REQUIRED",
    );
    gate.grant(scope, "pageContext", "once");
    const ticket = gate.begin(scope, "pageContext");
    gate.stage(ticket, scope, new TextEncoder().encode("page text"), "Preview");
    expect(gate.preview(ticket, scope)).toBe("Preview");
    expect(() => gate.confirm(ticket, scope, true)).toThrow(
      "AI_CLOUD_CONSENT_REQUIRED",
    );
    gate.grant(scope, "cloudUpload", "once");
    expect(new TextDecoder().decode(gate.confirm(ticket, scope, true))).toBe(
      "page text",
    );
    expect(gate.has(scope, "pageContext")).toBe(false);
    expect(gate.has(scope, "cloudUpload")).toBe(false);
    expect(() => gate.confirm(ticket, scope, false)).toThrow(
      "AI_PREVIEW_EXPIRED",
    );
  });

  it("isolates profile, origin, tab, and document and invalidates previews on navigation", () => {
    const gate = new AiConsentGate();
    gate.grant(scope, "screenshot", "session");
    for (const other of [
      { ...scope, profileId: "other" },
      { ...scope, tabId: "tab-2" },
      { ...scope, documentId: "doc-2" },
      { ...scope, origin: "https://other.example" },
    ]) {
      expect(gate.has(other, "screenshot")).toBe(false);
      expect(() => gate.begin(other, "screenshot")).toThrow(
        "AI_CONSENT_REQUIRED",
      );
    }
    const ticket = gate.begin(scope, "screenshot");
    gate.stage(ticket, scope, new Uint8Array([1, 2, 3]), "Pixel preview");
    gate.endDocument(scope.tabId);
    expect(() => gate.confirm(ticket, scope, false)).toThrow(
      "AI_PREVIEW_EXPIRED",
    );
    expect(gate.has(scope, "screenshot")).toBe(false);
  });

  it("stops all pending and rejects oversize or expired data", () => {
    vi.useFakeTimers();
    try {
      const gate = new AiConsentGate();
      gate.grant(scope, "consoleAnalysis", "session");
      const ticket = gate.begin(scope, "consoleAnalysis");
      expect(() =>
        gate.stage(ticket, scope, new Uint8Array(2 * 1024 * 1024 + 1), "x"),
      ).toThrow("AI_PREVIEW_INVALID");
      gate.stage(ticket, scope, new Uint8Array([1]), "small");
      vi.advanceTimersByTime(60_001);
      expect(gate.preview(ticket, scope)).toBeUndefined();
      expect(gate.snapshot().pending).toBe(0);
      const next = gate.begin(scope, "consoleAnalysis");
      gate.stop();
      expect(() => gate.stage(next, scope, new Uint8Array([1]), "x")).toThrow(
        "AI_PREVIEW_EXPIRED",
      );
      expect(gate.snapshot().grants).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects URL paths and credentials as consent origins", () => {
    const gate = new AiConsentGate();
    expect(() =>
      gate.grant(
        { ...scope, origin: "https://example.com/page" },
        "pageContext",
        "session",
      ),
    ).toThrow();
    expect(() =>
      gate.grant(
        { ...scope, origin: "https://u:p@example.com" },
        "pageContext",
        "session",
      ),
    ).toThrow();
  });
});
