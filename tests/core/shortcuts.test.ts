import { describe, expect, it } from "vitest";
import { browserShortcut, type ShortcutInput } from "../../src/main/shortcuts";

const input = (
  key: string,
  update: Partial<ShortcutInput> = {},
): ShortcutInput => ({
  type: "keyDown",
  key,
  control: true,
  meta: false,
  alt: false,
  shift: false,
  ...update,
});

describe("native browser shortcuts", () => {
  it("opens the AI panel through the same native shortcut path as the shell", () => {
    expect(browserShortcut(input("y", { shift: true }), "win32")).toEqual({
      kind: "shell",
      action: "ai",
    });
  });
  it.each([
    [false, false, "reload"],
    [true, false, "hardReload"],
    [false, true, "hardReload"],
  ] as const)("supports F5 shift=%s control=%s", (shift, control, action) => {
    expect(browserShortcut(input("F5", { control, shift }), "win32")).toEqual({
      kind: "command",
      command: { type: "action", action },
    });
  });
  it.each([
    ["r", false, "reload"],
    ["r", true, "hardReload"],
    ["u", false, "source"],
    ["i", true, "devtools"],
    ["+", false, "zoomIn"],
    ["-", false, "zoomOut"],
    ["0", false, "zoomReset"],
  ])("maps %s shift=%s", (key, shift, action) => {
    expect(
      browserShortcut(
        input(key as string, { shift: shift as boolean }),
        "win32",
      ),
    ).toEqual({ kind: "command", command: { type: "action", action } });
  });
  it("keeps IME, AltGr, select/copy/paste, Enter, and shell Escape in inputs", () => {
    for (const value of [
      input("t", { isComposing: true }),
      input("t", { keyCode: 229 }),
      input("t", { alt: true }),
      input("a"),
      input("c"),
      input("v"),
      input("Enter"),
    ])
      expect(browserShortcut(value, "win32")).toBeUndefined();
    expect(
      browserShortcut(input("Escape", { control: false }), "win32", true),
    ).toBeUndefined();
    expect(
      browserShortcut(input("Escape", { control: false }), "win32", false),
    ).toEqual({ kind: "command", command: { type: "action", action: "stop" } });
  });
  it("handles non-Latin layouts by physical letter code", () => {
    expect(browserShortcut(input("д", { code: "KeyL" }), "win32")).toEqual({
      kind: "shell",
      action: "address",
    });
    expect(browserShortcut(input("k"), "win32")).toEqual({
      kind: "shell",
      action: "search",
    });
    expect(browserShortcut(input("p", { shift: true }), "win32")).toEqual({
      kind: "shell",
      action: "palette",
    });
  });
  it("cycles tabs and restores tabs without conflicting with editable text", () => {
    expect(browserShortcut(input("Tab"), "win32")).toEqual({
      kind: "cycle",
      offset: 1,
    });
    expect(browserShortcut(input("Tab", { shift: true }), "win32")).toEqual({
      kind: "cycle",
      offset: -1,
    });
    expect(browserShortcut(input("t", { shift: true }), "win32")).toEqual({
      kind: "command",
      command: { type: "tab.restore" },
    });
    expect(browserShortcut(input("w"), "win32")).toEqual({ kind: "close" });
  });
  it("supports platform modifiers and native history keys", () => {
    expect(
      browserShortcut(input("t", { control: false, meta: true }), "darwin"),
    ).toEqual({ kind: "command", command: { type: "tab.create" } });
    expect(
      browserShortcut(
        input("ArrowLeft", { control: false, alt: true }),
        "win32",
      ),
    ).toEqual({ kind: "command", command: { type: "action", action: "back" } });
    expect(
      browserShortcut(
        input("ArrowRight", { control: false, alt: true }),
        "win32",
      ),
    ).toEqual({
      kind: "command",
      command: { type: "action", action: "forward" },
    });
  });
  it("keeps ordinary site typing and non-keydown events untouched", () => {
    for (const key of ["t", "w", "r", "l", "k", "d", "u", "+", "-", "0"])
      expect(
        browserShortcut(input(key, { control: false }), "win32"),
      ).toBeUndefined();
    expect(
      browserShortcut(input("t", { type: "keyUp" }), "win32"),
    ).toBeUndefined();
  });
  it("maps browser history, downloads, bookmark and native zoom key codes", () => {
    expect(browserShortcut(input("h"), "win32")).toEqual({
      kind: "command",
      command: { type: "navigate", url: "raincode://history" },
    });
    expect(browserShortcut(input("j"), "win32")).toEqual({
      kind: "command",
      command: { type: "navigate", url: "raincode://downloads" },
    });
    expect(browserShortcut(input("d"), "win32")).toEqual({
      kind: "command",
      command: { type: "bookmark.toggle" },
    });
    expect(
      browserShortcut(input("+", { code: "Equal", shift: true }), "win32"),
    ).toEqual({
      kind: "command",
      command: { type: "action", action: "zoomIn" },
    });
    expect(
      browserShortcut(input("Add", { code: "NumpadAdd" }), "win32"),
    ).toEqual({
      kind: "command",
      command: { type: "action", action: "zoomIn" },
    });
    expect(
      browserShortcut(input("Subtract", { code: "NumpadSubtract" }), "win32"),
    ).toEqual({
      kind: "command",
      command: { type: "action", action: "zoomOut" },
    });
  });
});
