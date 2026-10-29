import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  readFile,
  writeFile,
  mkdir,
  lstat,
  rm,
  readdir,
} from "node:fs/promises";
import { connect, type Socket } from "node:net";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import type { TorState } from "../shared/contracts";
import pinned from "../../build/tor-bundle.json";
import { bootstrapDetails, BootstrapDeadline } from "./tor-bootstrap";
import { OnionPreconnect } from "./tor-onion";

export async function verifyTorBundle(directory: string): Promise<string> {
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  ) as {
    version: string;
    archiveSha256: string;
    signer: string;
    files: Record<string, string>;
  };
  if (
    manifest.version !== pinned.version ||
    manifest.archiveSha256 !== pinned.archiveSha256 ||
    manifest.signer !== pinned.signer
  )
    throw new Error("TOR_INTEGRITY");
  if (JSON.stringify(manifest.files) !== JSON.stringify(pinned.files))
    throw new Error("TOR_INTEGRITY");
  const inspect = async (folder: string) => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if ((await lstat(path)).isSymbolicLink())
        throw new Error("TOR_INTEGRITY");
      if (entry.isDirectory()) await inspect(path);
      else {
        const name = relative(directory, path).replaceAll("\\", "/");
        if (name !== "manifest.json" && !Object.hasOwn(pinned.files, name))
          throw new Error("TOR_INTEGRITY");
      }
    }
  };
  await inspect(directory);
  for (const [name, expected] of Object.entries(pinned.files)) {
    const path = resolve(directory, name);
    const rel = relative(directory, path);
    if (
      isAbsolute(rel) ||
      rel.startsWith("..") ||
      name.includes("\\") ||
      name.includes(":") ||
      !/^[a-f0-9]{64}$/.test(expected)
    )
      throw new Error("TOR_INTEGRITY");
    if (
      (await lstat(path)).isSymbolicLink() ||
      createHash("sha256")
        .update(await readFile(path))
        .digest("hex") !== expected
    )
      throw new Error("TOR_INTEGRITY");
  }
  if (!manifest.files["tor/tor.exe"]) throw new Error("TOR_INTEGRITY");
  return join(directory, "tor/tor.exe");
}

export class TorControl {
  socket: Socket;
  private buffered = "";
  private lines: string[] = [];
  private pending?: {
    resolve: (lines: string[]) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    port: number,
    onEvent: (line: string) => void,
    onClose?: () => void,
  ) {
    this.socket = connect({ host: "127.0.0.1", port });
    this.socket.on("data", (data) => {
      this.buffered += data.toString("utf8");
      if (this.buffered.length > 1024 * 1024) {
        this.socket.destroy();
        return;
      }
      let end: number;
      while ((end = this.buffered.indexOf("\r\n")) >= 0) {
        const line = this.buffered.slice(0, end);
        this.buffered = this.buffered.slice(end + 2);
        if (line.startsWith("650")) {
          onEvent(line);
          continue;
        }
        this.lines.push(line);
        if (/^\d{3} /.test(line)) {
          const pending = this.pending;
          this.pending = undefined;
          const lines = this.lines;
          this.lines = [];
          if (pending) {
            clearTimeout(pending.timer);
            if (line.startsWith("250 ")) pending.resolve(lines);
            else pending.reject(new Error("TOR_CONTROL"));
          }
        }
      }
    });
    const failed = () => {
      if (this.pending) {
        clearTimeout(this.pending.timer);
        this.pending.reject(new Error("TOR_CONTROL"));
        this.pending = undefined;
      }
    };
    this.socket.on("error", failed);
    this.socket.on("close", () => {
      failed();
      onClose?.();
    });
  }
  command(value: string): Promise<string[]> {
    if (/[\r\n]/.test(value)) return Promise.reject(new Error("TOR_CONTROL"));
    const next = this.queue.then(
      () =>
        new Promise<string[]>((resolve, reject) => {
          if (this.socket.destroyed) {
            reject(new Error("TOR_CONTROL"));
            return;
          }
          const timer = setTimeout(() => {
            this.pending = undefined;
            reject(new Error("TOR_CONTROL_TIMEOUT"));
            // A late reply must never be mistaken for the next command's reply.
            this.socket.destroy();
          }, 7000);
          this.pending = { resolve, reject, timer };
          this.socket.write(value + "\r\n");
        }),
    );
    this.queue = next.catch(() => undefined);
    return next;
  }
  close() {
    this.socket.destroy();
  }
}

interface TorOptions {
  bundlePath: string;
  dataPath: string;
  onChange: (state: TorState) => void;
}
export class TorController {
  private options: TorOptions;
  state: TorState;
  private child?: ChildProcess;
  private control?: TorControl;
  private runDirectories = new Set<string>();
  private stopping = false;
  private generation = 0;
  private bootstrapDeadline?: BootstrapDeadline;
  private onionPreconnect = new OnionPreconnect();
  // Retain consensus/guard state for stop/restart within this browser session.
  // Browsing profiles remain ephemeral; explicit clear/exit removes this too.
  private networkDataPath?: string;
  constructor(options: TorOptions) {
    this.options = options;
    this.state = {
      status: "stopped",
      progress: 0,
      message: "Tor stopped",
      version: pinned.version,
      bundled:
        process.platform === "win32" &&
        process.arch === "x64" &&
        existsSync(join(options.bundlePath, "manifest.json")),
    };
  }
  private update(update: Partial<TorState>) {
    this.state = { ...this.state, ...update };
    this.options.onChange({ ...this.state });
  }
  private bootstrap(line: string, generation = this.generation) {
    if (generation !== this.generation) return;
    const match =
      /BOOTSTRAP PROGRESS=(\d+)/.exec(line) || /Bootstrapped (\d+)%/.exec(line);
    if (
      !match ||
      this.stopping ||
      this.state.status === "error" ||
      this.state.status === "stopped"
    )
      return;
    const progress = Math.min(100, Number(match[1]));
    if (progress < this.state.progress) return;
    this.bootstrapDeadline?.advance(progress);
    const details = bootstrapDetails(line);
    const diagnosticChanged = Object.entries(details).some(
      ([key, value]) =>
        value !== undefined && value !== this.state[key as keyof TorState],
    );
    if (
      !diagnosticChanged &&
      progress === this.state.progress &&
      this.state.status ===
        (progress === 100 && this.state.socksPort ? "ready" : "bootstrapping")
    )
      return;
    this.update({
      progress,
      ...(details.phase ? { phase: details.phase } : {}),
      ...(details.reason ? { reason: details.reason } : {}),
      ...(details.problems !== undefined ? { problems: details.problems } : {}),
      ...(details.recommendation
        ? { recommendation: details.recommendation }
        : {}),
      status:
        progress === 100 && this.state.socksPort ? "ready" : "bootstrapping",
      message: `Tor bootstrap ${progress}%`,
    });
  }
  async start(): Promise<void> {
    if (this.child || this.state.status === "starting") return;
    if (!this.state.bundled) {
      this.update({
        status: "error",
        error: "TOR_COMPONENT_MISSING",
        message: "Tor component missing",
      });
      throw new Error("TOR_COMPONENT_MISSING");
    }
    this.stopping = false;
    this.onionPreconnect.clear();
    this.bootstrapDeadline = new BootstrapDeadline();
    const generation = ++this.generation;
    this.update({
      status: "starting",
      progress: 0,
      error: undefined,
      phase: undefined,
      reason: undefined,
      problems: undefined,
      recommendation: undefined,
      socksPort: undefined,
      message: "Verifying Tor component",
    });
    let executable: string;
    try {
      executable = await verifyTorBundle(this.options.bundlePath);
    } catch {
      // Verification can finish after Stop or a later Start. A stale failure
      // must not overwrite the current daemon generation's state.
      if (this.stopping || generation !== this.generation) return;
      this.update({
        status: "error",
        error: "TOR_INTEGRITY",
        message: "Tor integrity check failed",
      });
      throw new Error("TOR_INTEGRITY");
    }
    if (this.stopping || generation !== this.generation) return;
    const directory = join(this.options.dataPath, randomUUID());
    this.runDirectories.add(directory);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    this.networkDataPath ??= join(directory, "data");
    const quoted = (value: string) =>
      '"' + value.replaceAll("\\", "/").replaceAll('"', '\\"') + '"';
    const config = [
      `DataDirectory ${quoted(this.networkDataPath)}`,
      "SocksPort 127.0.0.1:auto IsolateSOCKSAuth",
      "ControlPort auto",
      `ControlPortWriteToFile ${quoted(join(directory, "control.port"))}`,
      "CookieAuthentication 1",
      `CookieAuthFile ${quoted(join(directory, "control.cookie"))}`,
      `GeoIPFile ${quoted(join(this.options.bundlePath, "data/geoip"))}`,
      `GeoIPv6File ${quoted(join(this.options.bundlePath, "data/geoip6"))}`,
      "ClientOnly 1",
      "AvoidDiskWrites 1",
      "SafeLogging 1",
      "Log notice stdout",
      "RunAsDaemon 0",
    ].join("\n");
    const configPath = join(directory, "torrc");
    await writeFile(configPath, config, { mode: 0o600 });
    if (this.stopping || generation !== this.generation) return;
    const child = spawn(executable, ["-f", configPath], {
      cwd: dirname(executable),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
    });
    this.child = child;
    let output = "";
    child.stdout?.on("data", (data) => {
      output = (output + data.toString("utf8")).slice(-8192);
      const lines = output.split(/\r?\n/);
      output = lines.pop() || "";
      for (const line of lines) this.bootstrap(line, generation);
    });
    child.stderr?.resume();
    child.on("error", () => {
      if (!this.stopping && generation === this.generation)
        this.fail("TOR_PROCESS");
    });
    child.on("exit", () => {
      if (this.child === child) this.child = undefined;
      if (!this.stopping && generation === this.generation)
        this.fail("TOR_PROCESS_EXIT");
    });
    void this.initialize(directory, generation).catch(() => {
      if (!this.stopping && generation === this.generation)
        this.fail("TOR_START_FAILED");
    });
  }
  private fail(error: string) {
    // Killing a failed daemon emits exit; retain the original failure reason.
    if (this.state.status === "error") return;
    this.onionPreconnect.clear();
    this.update({
      status: "error",
      error,
      message: "Tor connection unavailable",
      socksPort: undefined,
    });
    this.child?.kill();
    this.control?.close();
    this.control = undefined;
  }
  private async initialize(directory: string, generation: number) {
    const deadline = Date.now() + 30000;
    let controlPort = 0,
      cookie: Buffer | undefined;
    while (
      Date.now() < deadline &&
      this.child &&
      generation === this.generation
    ) {
      try {
        const portFile = await readFile(
          join(directory, "control.port"),
          "utf8",
        );
        controlPort = Number(/PORT=127\.0\.0\.1:(\d+)/.exec(portFile)?.[1]);
        cookie = await readFile(join(directory, "control.cookie"));
        if (controlPort && cookie.length === 32) break;
      } catch {
        /* Daemon not ready. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (
      !controlPort ||
      !cookie ||
      generation !== this.generation ||
      this.stopping
    )
      throw new Error("TOR_START_FAILED");
    const control = new TorControl(
      controlPort,
      (line) => this.bootstrap(line, generation),
      () => {
        if (!this.stopping && generation === this.generation)
          this.fail("TOR_CONTROL_LOST");
      },
    );
    this.control = control;
    await control.command(`AUTHENTICATE ${cookie.toString("hex")}`);
    await control.command("SETEVENTS STATUS_CLIENT");
    const listeners = await control.command("GETINFO net/listeners/socks");
    const port = Number(/127\.0\.0\.1:(\d+)/.exec(listeners.join("\n"))?.[1]);
    if (!port) throw new Error("TOR_SOCKS");
    if (
      generation !== this.generation ||
      this.stopping ||
      !this.child ||
      this.state.status === "error"
    )
      return;
    this.update({
      socksPort: port,
      status: this.state.progress === 100 ? "ready" : "bootstrapping",
      message: `Tor bootstrap ${this.state.progress}%`,
    });
    this.bootstrap(
      (await control.command("GETINFO status/bootstrap-phase")).join("\n"),
      generation,
    );
    while (
      this.child &&
      generation === this.generation &&
      !this.stopping &&
      this.state.status !== "ready"
    ) {
      if (this.bootstrapDeadline?.expired()) {
        this.fail("TOR_BOOTSTRAP_TIMEOUT");
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  async newCircuit() {
    if (this.state.status !== "ready" || !this.control)
      throw new Error("TOR_NOT_READY");
    await this.control.command("SIGNAL NEWNYM");
    this.onionPreconnect.clear();
  }
  async prepareOnion(url: string) {
    const generation = this.generation;
    if (this.state.status !== "ready" || !this.state.socksPort)
      throw new Error("TOR_NOT_READY");
    await this.onionPreconnect.prepare(url, this.state.socksPort);
    if (generation !== this.generation || this.state.status !== "ready")
      throw new Error("TOR_NOT_READY");
  }
  async createTestOnion(targetPort: number): Promise<string> {
    if (
      !Number.isInteger(targetPort) ||
      targetPort < 1 ||
      targetPort > 65535 ||
      !this.control ||
      this.state.status !== "ready"
    )
      throw new Error("TOR_NOT_READY");
    const reply = await this.control.command(
      `ADD_ONION NEW:ED25519-V3 Flags=DiscardPK Port=80,127.0.0.1:${targetPort}`,
    );
    const service = /ServiceID=([a-z2-7]{56})/.exec(reply.join("\n"))?.[1];
    if (!service) throw new Error("TOR_CONTROL");
    return `http://${service}.onion/`;
  }
  async stop(immediate = false) {
    this.stopping = true;
    this.onionPreconnect.clear();
    ++this.generation;
    const child = this.child;
    if (child) {
      if (immediate) child.kill();
      else
        try {
          await this.control?.command("SIGNAL SHUTDOWN");
        } catch {
          /* Already disconnected. */
        }
      await Promise.race([
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) resolve();
          else child.once("exit", () => resolve());
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
      if (child.exitCode === null) {
        child.kill();
        await Promise.race([
          new Promise<void>((resolve) => {
            if (child.exitCode !== null) resolve();
            else child.once("exit", () => resolve());
          }),
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ]);
      }
    }
    this.control?.close();
    this.control = undefined;
    this.child = undefined;
    this.update({
      status: "stopped",
      progress: 0,
      socksPort: undefined,
      error: undefined,
      message: "Tor stopped",
    });
  }
  async clear() {
    await this.stop();
    this.networkDataPath = undefined;
    for (const directory of this.runDirectories) {
      const rel = relative(resolve(this.options.dataPath), resolve(directory));
      if (!rel || rel.startsWith("..") || isAbsolute(rel))
        throw new Error("TOR_PATH");
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
      this.runDirectories.delete(directory);
    }
  }
}
