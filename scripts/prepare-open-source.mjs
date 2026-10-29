import { execFileSync } from "node:child_process";
import { readFile, mkdir, copyFile, lstat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const target = path.resolve("artifacts", `raincode-source-${pkg.version}`);
try {
  await lstat(target);
  throw Error("Export directory already exists; preserve previous snapshot");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const operational = new Set([
  "RAIN_PROGRESS.md",
  "PROGRESS.md",
  "NEXT_SESSION.md",
  "MASTER_TASKS.md",
  "TEST_REPORT.md",
]);
const selected = files.filter(
  (file) =>
    !operational.has(file) &&
    !file
      .split("/")
      .some((part) =>
        [
          ".git",
          "node_modules",
          "vendor",
          "release",
          "dist",
          "dist-electron",
          "artifacts",
          ".cache",
          "test-results",
          "playwright-report",
          "protected-secrets",
          "password-vault",
        ].includes(part),
      ) &&
    !/(^|\/)\.env(?:\.|$)|\.(?:sqlite|db|pem|key|exe|zip|log)(?:$|\.)/i.test(
      file,
    ),
);
const manifest = [];
for (const file of selected) {
  const absolute = path.resolve(file);
  if (!absolute.startsWith(process.cwd() + path.sep))
    throw Error("Export path escaped workspace");
  const info = await lstat(absolute);
  if (info.isSymbolicLink() || !info.isFile())
    throw Error("Non-regular export path");
  const bytes = await readFile(absolute);
  if (/\.(?:[cm]?js|tsx?|json|md|ya?ml|html|txt)$/i.test(file)) {
    const text = bytes.toString("utf8");
    if (
      /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{64,}/.test(
        text,
      )
    )
      throw Error("Potential credential detected in " + file);
  }
  manifest.push({
    path: file,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await mkdir(target, { recursive: true });
for (const item of manifest) {
  const destination = path.join(target, item.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(item.path, destination);
}
await writeFile(
  path.join(target, "SOURCE_MANIFEST.json"),
  JSON.stringify(
    {
      version: pkg.version,
      files: manifest,
      excluded:
        "Runtime profiles, credentials, work logs, binary Tor bundle and Git history",
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    target,
    files: manifest.length,
    bytes: manifest.reduce((n, f) => n + f.bytes, 0),
    secretScan:
      "No high-confidence credential patterns found; not a guarantee of absence",
  }),
);
