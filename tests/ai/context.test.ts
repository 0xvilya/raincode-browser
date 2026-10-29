import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  AI_CONTEXT_PROBE,
  AI_CSS_CONTEXT_PROBE,
  AI_CONTEXT_READ_TIMEOUT_MS,
  AI_CONTEXT_WORLD_ID,
  collectPageContext,
  redactAiContextText,
  type AiContextPage,
} from "../../src/main/ai/context-collector";
import {
  AI_CONTEXT_LIMITS,
  aiContextProbeResultSchema,
  aiPageContextSchema,
  formatAiContextPreview,
} from "../../src/shared/ai-context";

const validResult = () => ({
  title: "Example article",
  text: "Visible article text",
  structure: "<body>\n <main>\n  <h1>\n  <p>",
  visitedNodes: 8,
  truncated: false,
});

function page(result: unknown = validResult()) {
  return {
    isDestroyed: vi.fn(() => false),
    getURL: vi.fn(
      () => "https://user:private@example.test/path?token=secret#secret",
    ),
    executeJavaScriptInIsolatedWorld: vi.fn(async () => result),
  } satisfies AiContextPage;
}

interface ProbeNode {
  nodeType: number;
  nodeValue?: string;
  tagName?: string;
  firstChild: ProbeNode | null;
  nextSibling: ProbeNode | null;
  parentNode: ProbeNode | null;
  hidden?: boolean;
  inert?: boolean;
  isContentEditable?: boolean;
  style?: Record<string, string | undefined>;
  getAttribute?: (name: string) => string | null;
  checkVisibility?: () => boolean;
}

function text(value: string): ProbeNode {
  return {
    nodeType: 3,
    nodeValue: value,
    firstChild: null,
    nextSibling: null,
    parentNode: null,
  };
}

function element(
  tagName: string,
  children: ProbeNode[] = [],
  attributes: Record<string, string | undefined> = {},
  style: Record<string, string | undefined> = {},
): ProbeNode {
  const node: ProbeNode = {
    nodeType: 1,
    tagName,
    firstChild: children[0] || null,
    nextSibling: null,
    parentNode: null,
    style,
    hidden: "hidden" in attributes,
    inert: "inert" in attributes,
    getAttribute: (name) => attributes[name] ?? null,
    checkVisibility: () => attributes.visible !== "false",
  };
  children.forEach((child, index) => {
    child.parentNode = node;
    child.nextSibling = children[index + 1] || null;
  });
  return node;
}

function probe(body: ProbeNode | null, title = "Title", designMode = "off") {
  return aiContextProbeResultSchema.parse(
    runInNewContext(AI_CONTEXT_PROBE, {
      document: { body, title, designMode },
      getComputedStyle: (node: ProbeNode) => ({
        display: "block",
        visibility: "visible",
        opacity: "1",
        contentVisibility: "visible",
        fontSize: "16px",
        ...node.style,
      }),
    }),
  );
}

describe("explicit read-only AI page context", () => {
  it("CSS inspection excludes text and sensitive CSS surfaces and bounds its sample", async () => {
    const body = element("BODY", [
      element("MAIN", [text("private article text"), element("INPUT", [])]),
      ...Array.from({ length: 30 }, () => element("P", [text("secret text")])),
    ]);
    const requested = new Set<string>();
    const result = aiContextProbeResultSchema.parse(
      runInNewContext(AI_CSS_CONTEXT_PROBE, {
        document: { body, title: "Layout", designMode: "off" },
        getComputedStyle: () => ({
          display: "block",
          visibility: "visible",
          opacity: "1",
          fontSize: "16px",
          getPropertyValue: (property: string) => {
            requested.add(property);
            if (property === "display") return "flex";
            if (property === "color") return "rgb(12, 34, 56)";
            if (property === "width")
              return 'url("https://secret.invalid/token")';
            return "auto";
          },
        }),
      }),
    );
    expect(result.text).toContain("display: flex;");
    expect(result.text).toContain("color: rgb(12, 34, 56);");
    expect(result.text).not.toMatch(/secret|private|url\(/);
    expect(result.text.length).toBeLessThanOrEqual(AI_CONTEXT_LIMITS.textChars);
    expect(result.truncated).toBe(true);
    for (const property of ["content", "background-image", "font-family"])
      expect(requested.has(property)).toBe(false);
    const target = page(result);
    const context = await collectPageContext(target, "css");
    expect(context.kind).toBe("css");
    expect(context.preview).toContain("Computed CSS layout sample");
    expect(aiPageContextSchema.safeParse(context).success).toBe(true);
    expect(target.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(
      AI_CONTEXT_WORLD_ID,
      [{ code: AI_CSS_CONTEXT_PROBE }],
      false,
    );
  });
  it("runs only the constant isolated probe and returns an exact bounded preview payload", async () => {
    const target = page();
    expect(target.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
    const context = await collectPageContext(target);
    expect(
      target.executeJavaScriptInIsolatedWorld,
    ).toHaveBeenCalledExactlyOnceWith(
      AI_CONTEXT_WORLD_ID,
      [{ code: AI_CONTEXT_PROBE }],
      false,
    );
    expect(context.origin).toBe("https://example.test");
    expect(context.preview).toBe(formatAiContextPreview(context));
    expect(context.preview).not.toMatch(/private|\/path|token=|#secret/);
    expect(aiPageContextSchema.safeParse(context).success).toBe(true);
    expect(
      new TextEncoder().encode(context.preview).byteLength,
    ).toBeLessThanOrEqual(AI_CONTEXT_LIMITS.previewBytes);
  });

  it("redacts obvious keys, JWT, bearer tokens, emails and URL credentials/query/fragment", async () => {
    const secrets = [
      "sk-proj-1234567890abcdefghijk",
      "AIza1234567890abcdefghijklmno",
      "AKIA1234567890123456",
      "ghp_1234567890123456789012345",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl",
      "Bearer private_token_123",
      "api_key=private123456",
      "person@example.test",
      "https://user:pass@example.test/account?token=private#private",
    ];
    const context = await collectPageContext(
      page({
        ...validResult(),
        title: "person@example.test",
        text: secrets.join(" "),
      }),
    );
    for (const secret of secrets) expect(context.preview).not.toContain(secret);
    expect(context.title).toBe("[REDACTED EMAIL]");
    expect(context.text).toContain("https://example.test");
    expect(context.text).not.toMatch(
      /user:pass|account|token=private|#private/,
    );
    expect(redactAiContextText("ordinary text\u202e\u0000")).toBe(
      "ordinary text",
    );
  });

  it.each([
    null,
    [],
    "body",
    {},
    { ...validResult(), text: "x".repeat(3_001) },
    { ...validResult(), title: "x".repeat(201) },
    { ...validResult(), structure: "<input value=secret>" },
    { ...validResult(), structure: "<script>" },
    { ...validResult(), structure: "<body>\nsecret" },
    { ...validResult(), visitedNodes: 1_501 },
    { ...validResult(), visitedNodes: -1 },
    { ...validResult(), truncated: "false" },
    { ...validResult(), cookies: "secret" },
  ])(
    "rejects malformed or over-limit untrusted probe results (%#)",
    async (result) => {
      await expect(collectPageContext(page(result))).rejects.toThrow(
        "AI_CONTEXT_RESULT_INVALID",
      );
    },
  );

  it.each([
    "file:///private/report",
    "about:blank",
    "javascript:secret()",
    "not a URL",
  ])("rejects unsupported origins before DOM access: %s", async (url) => {
    const target = page();
    target.getURL.mockReturnValue(url);
    await expect(collectPageContext(target)).rejects.toThrow(
      "AI_CONTEXT_ORIGIN_INVALID",
    );
    expect(target.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
  });

  it("does not leak native execution failures", async () => {
    const target = page();
    target.executeJavaScriptInIsolatedWorld.mockRejectedValue(
      new Error("secret page diagnostic"),
    );
    await expect(collectPageContext(target)).rejects.toThrow(
      /^AI_CONTEXT_READ_FAILED$/,
    );
    target.isDestroyed.mockReturnValue(true);
    await expect(collectPageContext(target)).rejects.toThrow(
      "AI_CONTEXT_PAGE_UNAVAILABLE",
    );
  });

  it("bounds an unresponsive renderer read and clears the one-shot timeout", async () => {
    vi.useFakeTimers();
    try {
      const target = page();
      target.executeJavaScriptInIsolatedWorld.mockImplementation(
        () => new Promise(() => {}),
      );
      const pending = expect(collectPageContext(target)).rejects.toThrow(
        "AI_CONTEXT_READ_FAILED",
      );
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(AI_CONTEXT_READ_TIMEOUT_MS);
      await pending;
      expect(vi.getTimerCount()).toBe(0);
      await collectPageContext(page());
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects destruction or cross-origin navigation during collection", async () => {
    const changed = page();
    changed.getURL
      .mockReturnValueOnce("https://example.test/")
      .mockReturnValue("https://other.test/");
    await expect(collectPageContext(changed)).rejects.toThrow(
      "AI_CONTEXT_DOCUMENT_CHANGED",
    );
    const destroyed = page();
    destroyed.isDestroyed.mockReturnValueOnce(false).mockReturnValue(true);
    await expect(collectPageContext(destroyed)).rejects.toThrow(
      "AI_CONTEXT_DOCUMENT_CHANGED",
    );
  });

  it("omits form subtrees, controls, scripts, embedded documents and editable content", () => {
    const excluded = [
      "FORM",
      "INPUT",
      "TEXTAREA",
      "SELECT",
      "SCRIPT",
      "STYLE",
      "NOSCRIPT",
      "TEMPLATE",
      "IFRAME",
      "OBJECT",
      "SVG",
      "BUTTON",
    ];
    const result = probe(
      element("BODY", [
        element("MAIN", [
          element("H1", [text("Visible heading")]),
          element("P", [text("Article")]),
        ]),
        ...excluded.map((tag) => element(tag, [text(`secret-${tag}`)])),
        element("DIV", [text("secret-editable")], { contenteditable: "true" }),
        element("DIV", [text("secret-editable-empty")], {
          contenteditable: "",
        }),
        element("DIV", [text("secret-role")], { role: "textbox" }),
      ]),
    );
    expect(result.text).toBe("Visible heading Article");
    expect(result.structure).toBe("<body>\n <main>\n  <h1>\n  <p>");
    expect(result.text + result.structure).not.toContain("secret");
  });

  it("omits hidden, inert, aria-hidden, style-hidden and non-visible subtrees", () => {
    const result = probe(
      element("BODY", [
        element("P", [text("Visible")]),
        ...[
          { hidden: "" },
          { inert: "" },
          { "aria-hidden": "true" },
          { visible: "false" },
        ].map((attrs) => element("DIV", [text("secret")], attrs)),
        ...[
          { display: "none" },
          { visibility: "hidden" },
          { opacity: "0" },
          { contentVisibility: "hidden" },
          { fontSize: "0px" },
        ].map((style) => element("DIV", [text("secret")], {}, style)),
      ]),
    );
    expect(result.text).toBe("Visible");
  });

  it("omits editing inherited from outside the body and document-wide editing", () => {
    const body = element("BODY", [element("P", [text("private draft")])]);
    body.isContentEditable = true;
    expect(probe(body).text).toBe("");
    body.isContentEditable = false;
    expect(probe(body, "Title", "on").text).toBe("");
    expect(probe(body).text).toBe("private draft");
  });

  it.each([
    " textbox ",
    "unknown textbox",
    "unknown\tsearchbox\n",
    "x".repeat(300) + " textbox",
  ])("omits custom input subtrees with role lists: %s", (role) => {
    const result = probe(
      element("BODY", [
        element("P", [text("Public article")]),
        element("DIV", [text("private custom input")], { role }),
      ]),
    );
    expect(result.text).toBe("Public article");
  });

  it("omits text with a fully transparent computed text fill", () => {
    const result = probe(
      element("BODY", [
        element("P", [text("Public article")]),
        element(
          "P",
          [text("invisible private text")],
          {},
          {
            webkitTextFillColor: "rgba(10, 20, 30, 0)",
          },
        ),
      ]),
    );
    expect(result.text).toBe("Public article");
  });

  it("bounds traversal, depth, large text nodes and complete structure lines", async () => {
    const textLimited = probe(
      element("BODY", [element("P", [text("界".repeat(100_000))])]),
    );
    expect(textLimited.text.length).toBe(3_000);
    expect(textLimited.truncated).toBe(true);
    const context = await collectPageContext(page(textLimited));
    expect(context.preview.length).toBeLessThanOrEqual(8_192);
    expect(
      new TextEncoder().encode(context.preview).byteLength,
    ).toBeLessThanOrEqual(16_384);
    const nodesLimited = probe(
      element(
        "BODY",
        Array.from({ length: 10_000 }, () => element("P", [text("x")])),
      ),
    );
    expect(nodesLimited.visitedNodes).toBe(1_500);
    expect(nodesLimited.truncated).toBe(true);
    expect(nodesLimited.structure.length).toBeLessThanOrEqual(1_500);
    await expect(collectPageContext(page(nodesLimited))).resolves.toBeDefined();
    let nested = element("P", [text("too deep")]);
    for (let i = 0; i < 100; i++) nested = element("DIV", [nested]);
    expect(probe(element("BODY", [nested])).text).toBe("");
    expect(probe(element("BODY", [nested])).truncated).toBe(true);
    expect(probe(null).text).toBe("");
  });

  it("rejects altered previews and payloads exceeding the UTF8 byte limit", async () => {
    const context = await collectPageContext(page());
    expect(
      aiPageContextSchema.safeParse({
        ...context,
        preview: "different payload",
      }).success,
    ).toBe(false);
    const invalid = { ...context, text: "界".repeat(6_000) };
    expect(
      aiPageContextSchema.safeParse({
        ...invalid,
        preview: formatAiContextPreview(invalid),
      }).success,
    ).toBe(false);
  });
});
