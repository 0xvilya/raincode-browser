import {
  AI_CONTEXT_LIMITS,
  aiContextProbeResultSchema,
  aiPageContextSchema,
  formatAiContextPreview,
  type AiPageContext,
} from "../../shared/ai-context";

/** Only the native methods needed for an explicit, permission-gated read. */
export interface AiContextPage {
  isDestroyed(): boolean;
  getURL(): string;
  executeJavaScriptInIsolatedWorld(
    worldId: number,
    scripts: { code: string }[],
    userGesture?: boolean,
  ): Promise<unknown>;
}

export const AI_CONTEXT_WORLD_ID = 1_004;
export const AI_CONTEXT_READ_TIMEOUT_MS = 3_000;

// Self-contained: no page-supplied program, callbacks, timers, or main-world APIs.
// Isolated-world DOM prototypes avoid main-world JavaScript monkey-patching.
function readPageProbe(kind: "page" | "css" = "page") {
  const MAX_NODES = 1_500;
  const MAX_TEXT = 3_000;
  const MAX_STRUCTURE = 1_500;
  const excluded = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "HEAD",
    "META",
    "LINK",
    "FORM",
    "INPUT",
    "TEXTAREA",
    "SELECT",
    "OPTION",
    "DATALIST",
    "BUTTON",
    "IFRAME",
    "FRAME",
    "OBJECT",
    "EMBED",
    "SVG",
    "CANVAS",
    "AUDIO",
    "VIDEO",
  ]);
  const editableRoles = new Set([
    "textbox",
    "searchbox",
    "combobox",
    "spinbutton",
    "listbox",
  ]);
  const semantic = new Set([
    "BODY",
    "MAIN",
    "ARTICLE",
    "SECTION",
    "HEADER",
    "FOOTER",
    "NAV",
    "ASIDE",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "P",
    "UL",
    "OL",
    "LI",
    "TABLE",
    "THEAD",
    "TBODY",
    "TR",
    "TH",
    "TD",
    "BLOCKQUOTE",
    "PRE",
    "CODE",
    "A",
  ]);
  let text = "";
  let structure = "";
  let visitedNodes = 0;
  let truncated = false;
  let sampledElements = 0;
  // Editing can be enabled on <html> or the entire document, outside our walk.
  const root = document.designMode === "on" ? null : document.body;
  let node: Node | null = root;
  let depth = 0;
  while (node && visitedNodes < MAX_NODES) {
    visitedNodes++;
    let descend = false;
    if (node.nodeType === 1) {
      const element = node as HTMLElement;
      const editable = element.getAttribute("contenteditable");
      const role = element.getAttribute("role") || "";
      let visible =
        !excluded.has(element.tagName) &&
        !element.hidden &&
        !element.inert &&
        !element.isContentEditable &&
        element.getAttribute("aria-hidden") !== "true" &&
        (editable === null ||
          (editable.length === 5 && editable.toLowerCase() === "false")) &&
        // ARIA roles are whitespace-separated fallback tokens. Exclude any
        // input-like token; skip oversized attributes without parsing them.
        role.length <= 256 &&
        !role
          .toLowerCase()
          .split(/\s+/)
          .some((token) => editableRoles.has(token));
      if (visible) {
        const style = getComputedStyle(element);
        visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.visibility !== "collapse" &&
          style.opacity !== "0" &&
          style.contentVisibility !== "hidden" &&
          style.fontSize !== "0px" &&
          style.color !== "transparent" &&
          !/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(style.color) &&
          style.webkitTextFillColor !== "transparent" &&
          !/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(style.webkitTextFillColor) &&
          element.checkVisibility({
            contentVisibilityAuto: true,
            opacityProperty: true,
            visibilityProperty: true,
          });
      }
      if (visible) {
        if (semantic.has(element.tagName)) {
          const line = `${" ".repeat(Math.min(depth, 8))}<${element.tagName.toLowerCase()}>\n`;
          const available = MAX_STRUCTURE - structure.length;
          if (line.length <= available) structure += line;
          else truncated = true;
          if (kind === "css") {
            if (sampledElements >= 12) {
              truncated = true;
            } else {
              sampledElements++;
              const style = getComputedStyle(element);
              let sample = `Element ${sampledElements}: ${element.tagName.toLowerCase()}\n`;
              // Never read cssText, custom properties, selectors, URLs, content,
              // font names, form values or attributes. Only bounded computed
              // layout/color values from a fixed allowlist are returned.
              for (const property of [
                "display",
                "position",
                "box-sizing",
                "width",
                "height",
                "min-width",
                "max-width",
                "min-height",
                "max-height",
                "margin-top",
                "margin-right",
                "margin-bottom",
                "margin-left",
                "padding-top",
                "padding-right",
                "padding-bottom",
                "padding-left",
                "gap",
                "flex-direction",
                "flex-wrap",
                "align-items",
                "justify-content",
                "overflow-x",
                "overflow-y",
                "font-size",
                "font-weight",
                "line-height",
                "color",
                "background-color",
                "border-radius",
                "opacity",
              ]) {
                const value = style.getPropertyValue(property);
                if (value.length > 96) {
                  truncated = true;
                  continue;
                }
                if (
                  /^(?:[\d.%,+() -]|px|em|rem|vh|vw|rgb|rgba)+$/.test(value) ||
                  /^(?:none|auto|normal|block|inline|inline-block|flex|inline-flex|grid|inline-grid|contents|table|table-row|table-cell|static|relative|absolute|fixed|sticky|border-box|content-box|row|row-reverse|column|column-reverse|nowrap|wrap|wrap-reverse|stretch|start|end|center|flex-start|flex-end|space-between|space-around|space-evenly|baseline|visible|hidden|clip|scroll)$/.test(
                    value,
                  )
                )
                  sample += `${property}: ${value};\n`;
              }
              const remaining = MAX_TEXT - text.length;
              if (sample.length > remaining) truncated = true;
              text += sample.slice(0, remaining);
            }
          }
        }
        descend = depth < 32;
        if (!descend && node.firstChild) truncated = true;
      }
    } else if (kind === "page" && node.nodeType === 3 && node.nodeValue) {
      const remaining = MAX_TEXT - text.length;
      // Slice before normalization so one huge text node cannot cause unbounded work.
      const raw = node.nodeValue;
      const fragment = raw
        .slice(0, remaining + 1)
        .replace(/\s+/g, " ")
        .trim();
      const addition = `${text && fragment ? " " : ""}${fragment}`;
      text += addition.slice(0, remaining);
      if (raw.length > remaining || addition.length > remaining)
        truncated = true;
    }
    if (descend && node.firstChild) {
      node = node.firstChild;
      depth++;
      continue;
    }
    while (node && node !== root && !node.nextSibling) {
      node = node.parentNode;
      depth--;
    }
    node = node === root ? null : node?.nextSibling || null;
  }
  if (node) truncated = true;
  const title = document.title;
  if (title.length > 200) truncated = true;
  return {
    title: title.slice(0, 200),
    text,
    structure: structure.trimEnd(),
    visitedNodes,
    truncated,
  };
}

export const AI_CONTEXT_PROBE = `(${readPageProbe.toString()})()`;
export const AI_CSS_CONTEXT_PROBE = `(${readPageProbe.toString()})("css")`;

/** Best-effort obvious-token reduction, not a guarantee that all secrets are found. */
export function redactAiContextText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s<>"']+/gi, (value) => {
      try {
        return new URL(value).origin;
      } catch {
        return "[REDACTED URL]";
      }
    })
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "[REDACTED TOKEN]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[REDACTED TOKEN]",
    )
    .replace(
      /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,})\b/g,
      "[REDACTED KEY]",
    )
    .replace(
      /\b(api[_ -]?key|access[_ -]?token|secret|password)\s*[:=]\s*["']?[^\s"'<>]{6,}/gi,
      "$1=[REDACTED]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED EMAIL]")
    .replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,
      "",
    )
    .trim();
}

function safeOrigin(page: AiContextPage): string {
  try {
    const url = new URL(page.getURL());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin.length > AI_CONTEXT_LIMITS.originChars
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error("AI_CONTEXT_ORIGIN_INVALID");
  }
}

/** Caller must consume page-read consent before this method and recheck document identity after. */
export async function collectPageContext(
  page: AiContextPage,
  kind: "page" | "css" = "page",
): Promise<AiPageContext> {
  if (page.isDestroyed()) throw new Error("AI_CONTEXT_PAGE_UNAVAILABLE");
  const origin = safeOrigin(page);
  let result: unknown;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    result = await Promise.race([
      page.executeJavaScriptInIsolatedWorld(
        AI_CONTEXT_WORLD_ID,
        [{ code: kind === "css" ? AI_CSS_CONTEXT_PROBE : AI_CONTEXT_PROBE }],
        false,
      ),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error()),
          AI_CONTEXT_READ_TIMEOUT_MS,
        );
      }),
    ]);
  } catch {
    throw new Error("AI_CONTEXT_READ_FAILED");
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
  if (page.isDestroyed() || safeOrigin(page) !== origin)
    throw new Error("AI_CONTEXT_DOCUMENT_CHANGED");
  const parsed = aiContextProbeResultSchema.safeParse(result);
  if (!parsed.success) throw new Error("AI_CONTEXT_RESULT_INVALID");
  const bounded = (value: string, limit: number) =>
    redactAiContextText(value).slice(0, limit);
  const context = {
    ...(kind === "css" ? { kind: "css" as const } : {}),
    origin,
    title: bounded(parsed.data.title, AI_CONTEXT_LIMITS.titleChars),
    text: bounded(parsed.data.text, AI_CONTEXT_LIMITS.textChars),
    // Runtime schema permits only our semantic tags, without attributes or text.
    structure: parsed.data.structure,
    truncated: parsed.data.truncated,
  };
  // Unicode can cost up to four UTF8 bytes per code point. Trim the excerpt if
  // necessary, and always regenerate the preview so it matches the sent bytes.
  let preview = formatAiContextPreview(context);
  while (
    preview.length > AI_CONTEXT_LIMITS.previewChars ||
    new TextEncoder().encode(preview).byteLength >
      AI_CONTEXT_LIMITS.previewBytes
  ) {
    context.text = context.text.slice(
      0,
      Math.max(0, context.text.length - 100),
    );
    context.truncated = true;
    preview = formatAiContextPreview(context);
  }
  return aiPageContextSchema.parse({ ...context, preview });
}
