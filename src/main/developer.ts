import {
  dialog,
  webContents,
  type BrowserWindow,
  type Session,
  type WebContents,
} from "electron";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath, writeFile } from "node:fs/promises";
import {
  basename,
  isAbsolute,
  join,
  relative,
  resolve,
  win32,
} from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { inspect } from "node:util";
import { StringDecoder } from "node:string_decoder";

export type DevToolsMode = "detach" | "undocked" | "right" | "bottom";
export interface ProjectEntry {
  path: string;
  directory: boolean;
}
export interface ProjectTree {
  root: string;
  entries: ProjectEntry[];
  truncated: boolean;
}
interface NetworkEntry {
  startedAt: number;
  elapsed: number;
  url: string;
  method: string;
  status: number;
  mimeType: string;
  error?: string;
}
interface DeveloperOptions {
  canRunCommands?: () => boolean;
  window: () => BrowserWindow;
  projectPath: () => string | undefined;
  locale: () => "ru" | "en";
}

const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_OUTPUT = 64 * 1024;
const MAX_RECORDS = 1000;

export function redactNetworkURL(input: string): string {
  try {
    const value = new URL(input);
    value.username = "";
    value.password = "";
    value.hash = "";
    if (value.search) value.search = "?redacted";
    return value.href;
  } catch {
    return "[invalid URL]";
  }
}

/** Export only the origin: secrets can occur in paths as well as queries. */
export function exportNetworkOrigin(input: string): string {
  try {
    const value = new URL(input);
    return /^https?:$/.test(value.protocol)
      ? `${value.origin}/`
      : "[invalid URL]";
  } catch {
    return "[invalid URL]";
  }
}

/** Every relative component is checked. Symlinks/junctions are never followed. */
export async function resolveProjectFile(
  root: string,
  input: string,
): Promise<string> {
  if (
    !input ||
    input.includes("\0") ||
    input.includes(":") ||
    isAbsolute(input) ||
    win32.isAbsolute(input)
  )
    throw new Error("PROJECT_PATH_DENIED");
  const components = input.split(/[\\/]/);
  if (components.some((part) => !part || part === "." || part === ".."))
    throw new Error("PROJECT_PATH_DENIED");
  const base = await realpath(root);
  let target = base;
  for (const component of components) {
    target = join(target, component);
    if ((await lstat(target)).isSymbolicLink())
      throw new Error("PROJECT_PATH_DENIED");
  }
  const canonical = await realpath(target);
  const within = relative(base, canonical);
  if (
    !within ||
    within.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    within === ".." ||
    isAbsolute(within)
  )
    throw new Error("PROJECT_PATH_DENIED");
  return canonical;
}

export async function readProjectSource(
  root: string,
  input: string,
): Promise<{ path: string; source: string }> {
  const target = await resolveProjectFile(root, input);
  const handle = await open(
    target,
    constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
  );
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_SOURCE_BYTES)
      throw new Error("PROJECT_FILE_TOO_LARGE");
    // Recheck after open to fail closed if an ancestor was replaced by a link.
    if ((await resolveProjectFile(root, input)) !== target)
      throw new Error("PROJECT_PATH_DENIED");
    const bytes = Buffer.alloc(MAX_SOURCE_BYTES + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_SOURCE_BYTES) throw new Error("PROJECT_FILE_TOO_LARGE");
    const source = bytes.subarray(0, bytesRead).toString("utf8");
    if (source.includes("\0")) throw new Error("PROJECT_BINARY_FILE");
    return { path: input, source };
  } finally {
    await handle.close();
  }
}

export async function listProject(root: string): Promise<ProjectTree> {
  const base = await realpath(root);
  const entries: ProjectEntry[] = [];
  let truncated = false;
  async function walk(directory: string, depth: number) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort(
      (a, b) =>
        Number(b.isDirectory()) - Number(a.isDirectory()) ||
        a.name.localeCompare(b.name),
    );
    for (const child of children) {
      if (
        [".git", "node_modules", ".pnpm", "dist", "release"].includes(
          child.name,
        ) ||
        child.isSymbolicLink()
      )
        continue;
      if (entries.length >= 1500) {
        truncated = true;
        return;
      }
      const path = relative(base, join(directory, child.name));
      try {
        const target = await resolveProjectFile(base, path);
        entries.push({ path, directory: child.isDirectory() });
        if (child.isDirectory()) {
          if (depth < 4) await walk(target, depth + 1);
          else truncated = true;
        }
      } catch {
        /* A deleted/unreadable/symlink entry is omitted. */
      }
    }
  }
  await walk(base, 0);
  return { root: base, entries, truncated };
}

export class DeveloperController {
  private sessions = new WeakSet<Session>();
  private records = new Map<number, NetworkEntry[]>();
  private recording = new Map<number, symbol>();
  private observedPages = new WeakSet<WebContents>();
  private processes = new Set<ChildProcess>();
  private cancelledProcesses = new WeakSet<ChildProcess>();
  private confirmed = false;
  private generation = 0;
  constructor(private readonly options: DeveloperOptions) {}

  private label(ru: string, en: string) {
    return this.options.locale() === "ru" ? ru : en;
  }
  private requirePage(contents: WebContents | undefined): WebContents {
    if (
      !contents ||
      contents.isDestroyed() ||
      !/^https?:\/\//.test(contents.getURL())
    )
      throw new Error("DEV_PAGE_REQUIRED");
    return contents;
  }
  private async root(): Promise<string> {
    const path = this.options.projectPath();
    if (!path) throw new Error("PROJECT_REQUIRED");
    const root = await realpath(resolve(path));
    if (!(await lstat(root)).isDirectory()) throw new Error("PROJECT_REQUIRED");
    return root;
  }
  private async confirm(title: string, detail: string): Promise<boolean> {
    if (this.confirmed) throw new Error("DEV_CONFIRM_PENDING");
    this.confirmed = true;
    try {
      const result = await dialog.showMessageBox(this.options.window(), {
        type: "warning",
        title,
        message: title,
        detail,
        buttons: [
          this.label("Отмена", "Cancel"),
          this.label("Выполнить", "Run"),
        ],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      return result.response === 1;
    } finally {
      this.confirmed = false;
    }
  }
  toggleTools(
    contents: WebContents | undefined,
    mode: DevToolsMode = "detach",
  ) {
    const page = this.requirePage(contents);
    if (page.isDevToolsOpened()) page.closeDevTools();
    else this.openTools(page, mode);
  }
  openTools(contents: WebContents | undefined, mode: DevToolsMode = "detach") {
    const page = this.requirePage(contents);
    if (page.isDevToolsOpened()) page.closeDevTools();
    page.openDevTools({
      mode,
      activate: true,
      title: `RainCode DevTools — ${new URL(page.getURL()).origin}`,
    });
  }
  readTree() {
    return this.root().then(listProject);
  }
  async readFile(path: string) {
    return readProjectSource(await this.root(), path);
  }

  async runSnippet(contents: WebContents | undefined, code: string) {
    const page = this.requirePage(contents);
    if (!code.trim() || code.length > 100000)
      throw new Error("SNIPPET_INVALID");
    const target = page.getURL();
    // A reload or a navigation away and back can leave getURL() unchanged.
    // Never apply consent to a different document than the one reviewed.
    let navigated = false;
    const invalidate = () => {
      navigated = true;
    };
    page.on("did-start-navigation", invalidate);
    try {
      if (
        !(await this.confirm(
          this.label(
            "Выполнить JavaScript на странице?",
            "Run JavaScript on this page?",
          ),
          `${new URL(target).origin}\n\n${code.slice(0, 6000)}${code.length > 6000 ? "\n…" : ""}`,
        ))
      )
        return { cancelled: true };
      if (navigated || page.isDestroyed() || page.getURL() !== target)
        throw new Error("DEV_PAGE_CHANGED");
      const value: unknown = await page.executeJavaScript(code, true);
      return {
        output: inspect(value, {
          depth: 3,
          maxStringLength: 5000,
          maxArrayLength: 100,
        }).slice(0, 20000),
        url: target,
      };
    } finally {
      page.removeListener("did-start-navigation", invalidate);
    }
  }

  /** A bounded command runner, deliberately not presented as a PTY terminal. */
  async runCommand(command: string): Promise<{
    output?: string;
    exitCode?: number | null;
    timedOut?: boolean;
    cancelled?: boolean;
    terminated?: boolean;
    truncated?: boolean;
  }> {
    const generation = this.generation;
    if (!command.trim() || command.length > 4096 || command.includes("\0"))
      throw new Error("COMMAND_INVALID");
    if (this.processes.size) throw new Error("COMMAND_BUSY");
    const cwd = await this.root();
    const detail =
      this.label(
        "Команда получит доступ к вашим файлам с правами пользователя. Сетевые вызовы используют системное соединение, а не Tor/Proxy вкладки.\n",
        "The command runs as your user and can access your files. Network calls use the system connection, not the tab's Tor/Proxy.\n",
      ) + `${cwd}\n\n${command}`;
    if (
      !(await this.confirm(
        this.label("Запустить локальную команду?", "Run local command?"),
        detail,
      ))
    )
      return { cancelled: true };
    if ((await this.root()) !== cwd) throw new Error("PROJECT_PATH_DENIED");
    if (
      generation !== this.generation ||
      this.options.canRunCommands?.() === false
    )
      return { cancelled: true };
    if (this.processes.size) throw new Error("COMMAND_BUSY");
    const windows = process.platform === "win32";
    const executable = windows
      ? join(
          process.env.SystemRoot || "C:\\Windows",
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        )
      : "/bin/sh";
    const args = windows
      ? [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [Console]::OutputEncoding; & {\n${command}\n}`,
        ]
      : ["-c", command];
    const env: NodeJS.ProcessEnv = {};
    for (const key of [
      "PATH",
      "Path",
      "SystemRoot",
      "USERPROFILE",
      "HOME",
      "APPDATA",
      "LOCALAPPDATA",
      "TEMP",
      "TMP",
      "LANG",
    ])
      if (process.env[key]) env[key] = process.env[key];
    return new Promise((resolveResult, reject) => {
      const child = spawn(executable, args, {
        cwd,
        shell: false,
        windowsHide: true,
        detached: !windows,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.processes.add(child);
      let output = "";
      let timedOut = false;
      let truncated = false;
      const stdout = new StringDecoder("utf8");
      const stderr = new StringDecoder("utf8");
      const append = (value: string) => {
        const available = MAX_OUTPUT - output.length;
        if (value.length > available) truncated = true;
        if (available > 0) output += value.slice(0, available);
      };
      child.stdout.on("data", (chunk: Buffer) => append(stdout.write(chunk)));
      child.stderr.on("data", (chunk: Buffer) => append(stderr.write(chunk)));
      const timer = setTimeout(() => {
        timedOut = true;
        this.terminate(child);
      }, 15000);
      child.on("error", (error) => {
        clearTimeout(timer);
        this.processes.delete(child);
        reject(error);
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        this.processes.delete(child);
        append(stdout.end());
        append(stderr.end());
        resolveResult({
          output,
          exitCode,
          timedOut,
          truncated,
          terminated: this.cancelledProcesses.has(child),
        });
      });
    });
  }
  private terminate(child: ChildProcess) {
    if (!child.pid) return;
    if (process.platform === "win32") {
      const executable = join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "taskkill.exe",
      );
      const killer = spawn(
        executable,
        ["/PID", String(child.pid), "/T", "/F"],
        { shell: false, windowsHide: true, stdio: "ignore" },
      );
      killer.on("error", () => child.kill());
    } else {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill();
      }
    }
  }
  cancelCommands() {
    this.generation++;
    for (const child of this.processes) {
      this.cancelledProcesses.add(child);
      this.terminate(child);
    }
  }
  dispose() {
    this.cancelCommands();
    this.records.clear();
    this.recording.clear();
  }

  setRecording(contents: WebContents | undefined, enabled: boolean) {
    const page = this.requirePage(contents);
    if (enabled && !this.recording.has(page.id)) {
      this.recording.set(page.id, Symbol("recording"));
      this.records.set(page.id, []);
      if (!this.observedPages.has(page)) {
        this.observedPages.add(page);
        page.once("destroyed", () => {
          this.recording.delete(page.id);
          this.records.delete(page.id);
        });
      }
    } else if (!enabled) {
      this.recording.delete(page.id);
      this.records.delete(page.id);
    }
    return { recording: this.recording.has(page.id) };
  }

  retainRecordings(contentsIds: number[]) {
    const allowed = new Set(contentsIds);
    for (const id of this.recording.keys()) {
      if (!allowed.has(id)) {
        this.recording.delete(id);
        this.records.delete(id);
      }
    }
  }

  /** Does not replace security's onBeforeRequest/onBeforeSendHeaders hooks. */
  recordNetwork(session: Session) {
    if (this.sessions.has(session)) return;
    this.sessions.add(session);
    const starts = new Map<number, { time: number; recording: symbol }>();
    session.webRequest.onSendHeaders((details) => {
      if (
        !details.webContentsId ||
        !this.recording.has(details.webContentsId) ||
        !/^https?:/.test(details.url)
      )
        return;
      starts.set(details.id, {
        time: Date.now(),
        recording: this.recording.get(details.webContentsId)!,
      });
      if (starts.size > MAX_RECORDS) starts.delete(starts.keys().next().value!);
    });
    const record = (
      details:
        | Electron.OnCompletedListenerDetails
        | Electron.OnErrorOccurredListenerDetails,
    ) => {
      const started = starts.get(details.id);
      starts.delete(details.id);
      const id = details.webContentsId;
      if (
        !id ||
        started === undefined ||
        this.recording.get(id) !== started.recording ||
        !/^https?:/.test(details.url)
      )
        return;
      const startedAt = started.time;
      if (!this.records.has(id)) {
        const contents = details.webContents || webContents.fromId(id);
        if (!contents || contents.isDestroyed()) return;
        this.records.set(id, []);
        contents.once("destroyed", () => this.records.delete(id));
      }
      const entries = this.records.get(id)!;
      const headers: Record<string, string[]> =
        "responseHeaders" in details ? details.responseHeaders || {} : {};
      const contentType =
        Object.entries(headers)
          .find(([key]) => key.toLowerCase() === "content-type")?.[1]?.[0]
          ?.split(";")[0] || "";
      entries.push({
        startedAt,
        elapsed: Math.max(0, Date.now() - startedAt),
        url: redactNetworkURL(details.url),
        method: details.method,
        status: "statusCode" in details ? details.statusCode : 0,
        mimeType: contentType,
        ...("error" in details ? { error: details.error } : {}),
      });
      if (entries.length > MAX_RECORDS) entries.shift();
    };
    session.webRequest.onCompleted(record);
    session.webRequest.onErrorOccurred(record);
  }
  network(contents: WebContents | undefined) {
    return [...(this.records.get(this.requirePage(contents).id) || [])];
  }
  async exportHAR(contents: WebContents | undefined) {
    const page = this.requirePage(contents);
    const records = this.network(page);
    const save = await dialog.showSaveDialog(this.options.window(), {
      title: this.label(
        "Экспорт HAR — только домены и метаданные",
        "Export HAR — origins and metadata only",
      ),
      defaultPath: "raincode-network.har",
      filters: [{ name: "HTTP Archive", extensions: ["har"] }],
    });
    if (save.canceled || !save.filePath) return { cancelled: true };
    const entries = records.map((entry) => ({
      startedDateTime: new Date(entry.startedAt).toISOString(),
      time: entry.elapsed,
      request: {
        method: entry.method,
        url: exportNetworkOrigin(entry.url),
        httpVersion: "",
        cookies: [],
        headers: [],
        queryString: [],
        headersSize: -1,
        bodySize: -1,
      },
      response: {
        status: entry.status,
        statusText: "",
        httpVersion: "",
        cookies: [],
        headers: [],
        content: { size: 0, mimeType: entry.mimeType },
        redirectURL: "",
        headersSize: -1,
        bodySize: -1,
      },
      cache: {},
      timings: { send: 0, wait: entry.elapsed, receive: 0 },
      comment:
        "Metadata only. URL paths, queries, fragments, credentials, headers, cookies and bodies omitted.",
    }));
    await writeFile(
      save.filePath,
      JSON.stringify(
        {
          log: {
            version: "1.2",
            creator: { name: "RainCode Browser", version: "0.2" },
            entries,
            comment:
              "Bounded to latest 1000 requests per live tab; metadata, approximate timings only.",
          },
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    return {
      saved: true,
      name: basename(save.filePath),
      count: entries.length,
    };
  }
}
