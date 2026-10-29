import type { Command } from "../shared/contracts";

export interface ShortcutInput {
  type: string;
  key: string;
  code?: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

export type BrowserShortcut =
  | { kind: "command"; command: Command }
  | { kind: "close" }
  | { kind: "cycle"; offset: number }
  | { kind: "shell"; action: "address" | "search" | "palette" | "find" | "ai" };

/** One native handler serves both the browser chrome and untrusted pages.
 * DOM edit keys (including Escape in the omnibox) remain with the shell. */
export function browserShortcut(
  input: ShortcutInput,
  platform: string,
  fromShell = false,
): BrowserShortcut | undefined {
  if (input.type !== "keyDown" || input.isComposing || input.keyCode === 229)
    return;
  const modifier = platform === "darwin" ? input.meta : input.control;
  // Ctrl+Alt can be AltGr: never steal international text entry.
  if (modifier && input.alt) return;
  const key = /^Key[A-Z]$/.test(input.code || "")
    ? input.code!.slice(3).toLowerCase()
    : input.key.toLowerCase();
  const command = (value: Command): BrowserShortcut => ({
    kind: "command",
    command: value,
  });
  const action = (value: Extract<Command, { type: "action" }>["action"]) =>
    command({ type: "action", action: value });
  if (key === "f5" && !input.alt)
    return action(input.shift || modifier ? "hardReload" : "reload");
  if (input.alt && !modifier && !input.meta) {
    if (key === "arrowleft") return action("back");
    if (key === "arrowright") return action("forward");
    if (key === "home") return action("home");
    return;
  }
  if (key === "f12" || (modifier && input.shift && key === "i"))
    return action("devtools");
  if (key === "f11") return action("fullscreen");
  if (key === "escape" && !modifier && !fromShell) return action("stop");
  if (!modifier) return;
  if (key === "t")
    return command(
      input.shift ? { type: "tab.restore" } : { type: "tab.create" },
    );
  if (key === "w" && !input.shift) return { kind: "close" };
  if (key === "tab") return { kind: "cycle", offset: input.shift ? -1 : 1 };
  if (key === "r") return action(input.shift ? "hardReload" : "reload");
  if (!input.shift && ["l", "k", "f"].includes(key))
    return {
      kind: "shell",
      action: key === "l" ? "address" : key === "k" ? "search" : "find",
    };
  if (key === "p" && input.shift) return { kind: "shell", action: "palette" };
  if (key === "y" && input.shift) return { kind: "shell", action: "ai" };
  if (input.shift) {
    if (key === "+" || input.code === "Equal" || input.code === "NumpadAdd")
      return action("zoomIn");
    return;
  }
  if (key === "h" || key === "j")
    return command({
      type: "navigate",
      url: `raincode://${key === "h" ? "history" : "downloads"}`,
    });
  if (key === "d") return command({ type: "bookmark.toggle" });
  if (key === "u") return action("source");
  if (key === "p") return action("print");
  if (["+", "="].includes(key) || input.code === "NumpadAdd")
    return action("zoomIn");
  if (key === "-" || input.code === "NumpadSubtract") return action("zoomOut");
  if (key === "0" || input.code === "Digit0" || input.code === "Numpad0")
    return action("zoomReset");
}
