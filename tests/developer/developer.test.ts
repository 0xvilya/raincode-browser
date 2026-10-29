import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import type { BrowserWindow, WebContents, Session } from "electron";

const { showMessageBox, showSaveDialog } = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
  showSaveDialog: vi.fn(),
}));
vi.mock("electron", () => ({
  dialog: { showMessageBox, showSaveDialog },
  webContents: { fromId: vi.fn() },
}));
import {
  DeveloperController,
  exportNetworkOrigin,
  listProject,
  readProjectSource,
  redactNetworkURL,
  resolveProjectFile,
} from "../../src/main/developer";

let root = "";
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "raincode-dev-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function controller() {
  return new DeveloperController({
    window: () => ({}) as BrowserWindow,
    projectPath: () => root,
    locale: () => "en",
  });
}
function contents() {
  return Object.assign(new EventEmitter(), {
    id: 12,
    getURL: vi.fn(() => "https://example.test/a"),
    isDestroyed: vi.fn(() => false),
    isDevToolsOpened: vi.fn(() => false),
    closeDevTools: vi.fn(),
    openDevTools: vi.fn(),
    executeJavaScript: vi.fn(async () => ({ title: "Fixture" })),
  });
}

describe("local project boundary", () => {
  it("reads Unicode source verbatim only below selected root", async () => {
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "src", "пример.ts"),
      "const привет = 'RainCode';\n",
    );
    expect(await readProjectSource(root, "src/пример.ts")).toEqual({
      path: "src/пример.ts",
      source: "const привет = 'RainCode';\n",
    });
  });
  it.each([
    "../secret",
    "/etc/passwd",
    "C:\\Windows\\win.ini",
    "file.txt:secret",
    "src/../secret",
    "src//file",
    "src/./file",
    "\0",
    "\\\\server\\share\\file",
  ])("rejects traversal and alternative paths: %s", async (path) => {
    await expect(resolveProjectFile(root, path)).rejects.toThrow(
      "PROJECT_PATH_DENIED",
    );
  });
  it("rejects directory symlinks/junctions and omits them from the tree", async () => {
    const outside = await mkdtemp(join(tmpdir(), "raincode-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "secret");
      await symlink(
        outside,
        join(root, "escape"),
        process.platform === "win32" ? "junction" : "dir",
      );
      await expect(
        readProjectSource(root, "escape/secret.txt"),
      ).rejects.toThrow("PROJECT_PATH_DENIED");
      expect((await listProject(root)).entries).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
  it("rejects binary and oversize files", async () => {
    await writeFile(join(root, "binary"), Buffer.from([0, 1, 2]));
    await writeFile(join(root, "huge"), Buffer.alloc(1024 * 1024 + 1));
    await expect(readProjectSource(root, "binary")).rejects.toThrow(
      "PROJECT_BINARY_FILE",
    );
    await expect(readProjectSource(root, "huge")).rejects.toThrow(
      "PROJECT_FILE_TOO_LARGE",
    );
  });
  it("omits dependency/git/build directories and bounds recursion", async () => {
    await mkdir(join(root, "node_modules"));
    await mkdir(join(root, ".git"));
    await mkdir(join(root, "src", "a", "b", "c", "d", "e"), {
      recursive: true,
    });
    await writeFile(join(root, "README.md"), "hello");
    const tree = await listProject(root);
    expect(
      tree.entries.some((entry) => /node_modules|\.git/.test(entry.path)),
    ).toBe(false);
    expect(tree.entries.some((entry) => entry.path === "README.md")).toBe(true);
    expect(tree.truncated).toBe(true);
  });
});

describe("developer actions", () => {
  it("opens actual tools on the provided WebContents without selecting a different tab", () => {
    const page = contents();
    controller().toggleTools(page as unknown as WebContents, "right");
    expect(page.openDevTools).toHaveBeenCalledWith({
      mode: "right",
      activate: true,
      title: "RainCode DevTools — https://example.test",
    });
  });
  it("closes open tools and rejects internal shell pages", () => {
    const page = contents();
    page.isDevToolsOpened.mockReturnValue(true);
    controller().toggleTools(page as unknown as WebContents);
    expect(page.closeDevTools).toHaveBeenCalledOnce();
    page.getURL.mockReturnValue("raincode-app://ui/");
    expect(() =>
      controller().openTools(page as unknown as WebContents),
    ).toThrow("DEV_PAGE_REQUIRED");
    expect(() => controller().openTools(undefined)).toThrow(
      "DEV_PAGE_REQUIRED",
    );
  });
  it("does not run snippets when native confirmation is cancelled", async () => {
    showMessageBox.mockResolvedValue({ response: 0 });
    const page = contents();
    expect(
      await controller().runSnippet(
        page as unknown as WebContents,
        "document.title",
      ),
    ).toEqual({ cancelled: true });
    expect(page.executeJavaScript).not.toHaveBeenCalled();
    expect(showMessageBox.mock.calls.at(-1)?.[1].detail).toContain(
      "https://example.test",
    );
  });
  it("runs only the confirmed snippet and rejects navigated targets", async () => {
    showMessageBox.mockResolvedValue({ response: 1 });
    const page = contents();
    await controller().runSnippet(
      page as unknown as WebContents,
      "document.title",
    );
    expect(page.executeJavaScript).toHaveBeenCalledWith("document.title", true);
    const changed = contents();
    changed.getURL
      .mockReturnValueOnce("https://example.test/a")
      .mockReturnValueOnce("https://example.test/a")
      .mockReturnValue("https://other.test/");
    await expect(
      controller().runSnippet(
        changed as unknown as WebContents,
        "document.title",
      ),
    ).rejects.toThrow("DEV_PAGE_CHANGED");
    expect(changed.executeJavaScript).not.toHaveBeenCalled();
  });
  it("does not start commands when cancelled, and requires a selected project", async () => {
    showMessageBox.mockResolvedValue({ response: 0 });
    expect(await controller().runCommand("echo hello")).toEqual({
      cancelled: true,
    });
    expect(showMessageBox.mock.calls.at(-1)?.[1].detail).toContain(
      "echo hello",
    );
    const unselected = new DeveloperController({
      window: () => ({}) as BrowserWindow,
      locale: () => "en",
      projectPath: () => undefined,
    });
    await expect(unselected.runCommand("echo hello")).rejects.toThrow(
      "PROJECT_REQUIRED",
    );
  });
  it("rejects a pending command approval after emergency disposal", async () => {
    const developer = controller();
    showMessageBox.mockImplementationOnce(async () => {
      developer.dispose();
      return { response: 1 };
    });
    expect(await developer.runCommand("echo must-not-run")).toEqual({
      cancelled: true,
    });
  });
  it("rechecks the command policy after native approval", async () => {
    let allowed = true;
    const developer = new DeveloperController({
      window: () => ({}) as BrowserWindow,
      projectPath: () => root,
      locale: () => "en",
      canRunCommands: () => allowed,
    });
    showMessageBox.mockImplementationOnce(async () => {
      allowed = false;
      return { response: 1 };
    });
    expect(await developer.runCommand("echo must-not-run")).toEqual({
      cancelled: true,
    });
  });
  it("rejects snippet consent after a same-URL reload and removes its listener", async () => {
    const page = contents();
    showMessageBox.mockImplementationOnce(async () => {
      page.emit("did-start-navigation");
      return { response: 1 };
    });
    await expect(
      controller().runSnippet(page as unknown as WebContents, "document.title"),
    ).rejects.toThrow("DEV_PAGE_CHANGED");
    expect(page.executeJavaScript).not.toHaveBeenCalled();
    expect(page.listenerCount("did-start-navigation")).toBe(0);
  });
});

describe("network export privacy", () => {
  it("rejects delayed requests from an earlier consent and registers one cleanup listener", () => {
    const developer = controller();
    const page = contents();
    const target = page as unknown as WebContents;
    const hooks = {
      onSendHeaders: vi.fn(),
      onCompleted: vi.fn(),
      onErrorOccurred: vi.fn(),
    };
    developer.recordNetwork({ webRequest: hooks } as unknown as Session);
    const start = hooks.onSendHeaders.mock.calls[0][0];
    const finish = hooks.onCompleted.mock.calls[0][0];
    const request = {
      id: 1,
      webContentsId: page.id,
      webContents: page,
      url: "https://example.test/secret",
      method: "GET",
      statusCode: 200,
    };
    developer.setRecording(target, true);
    start(request);
    developer.setRecording(target, false);
    developer.setRecording(target, true);
    finish(request);
    expect(developer.network(target)).toEqual([]);
    start({ ...request, id: 2 });
    finish({ ...request, id: 2 });
    expect(developer.network(target)).toHaveLength(1);
    developer.retainRecordings([page.id]);
    expect(developer.network(target)).toHaveLength(1);
    developer.retainRecordings([]);
    start({ ...request, id: 3 });
    finish({ ...request, id: 3 });
    expect(developer.network(target)).toEqual([]);
    for (let i = 0; i < 20; i++) {
      developer.setRecording(target, false);
      developer.setRecording(target, true);
    }
    expect(page.listenerCount("destroyed")).toBe(1);
    page.emit("destroyed");
    expect(developer.network(target)).toEqual([]);
  });
  it("omits secrets in paths and all other URL components from HAR", () => {
    expect(
      exportNetworkOrigin(
        "https://user:password@example.test:8443/reset/secret-token?key=secret#private",
      ),
    ).toBe("https://example.test:8443/");
    expect(exportNetworkOrigin("file:///private/secret")).toBe("[invalid URL]");
    expect(exportNetworkOrigin("invalid")).toBe("[invalid URL]");
  });
  it("removes credentials, query values and fragments", () => {
    expect(
      redactNetworkURL(
        "https://user:password@example.test/api?token=secret#private",
      ),
    ).toBe("https://example.test/api?redacted");
    expect(redactNetworkURL("https://example.test/plain")).toBe(
      "https://example.test/plain",
    );
    expect(redactNetworkURL("invalid")).toBe("[invalid URL]");
  });
});
