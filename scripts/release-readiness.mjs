import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const installer = path.resolve(
  `release/${pkg.version}/RainCode Browser Setup ${pkg.version}.exe`,
);
const checks = [];
let exists = false;
try {
  exists = (await stat(installer)).isFile();
} catch {}
checks.push({
  name: "Windows installer",
  status: exists ? "passed" : "not-tested",
  detail: exists
    ? path.basename(installer)
    : "Build the versioned installer first",
});
if (exists && process.platform === "win32") {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "(Get-AuthenticodeSignature -LiteralPath $env:RAIN_RELEASE_ARTIFACT).Status.ToString()",
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      // Let Windows PowerShell load its own modules when launched from PowerShell 7.
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([name]) => name.toLowerCase() !== "psmodulepath",
          ),
        ),
        RAIN_RELEASE_ARTIFACT: installer,
      },
    },
  );
  const signature = result.status === 0 ? result.stdout.trim() : "Unavailable";
  checks.push({
    name: "Authenticode",
    status: signature === "Valid" ? "passed" : "blocked",
    detail: signature,
  });
} else
  checks.push({
    name: "Authenticode",
    status: "not-tested",
    detail:
      "Requires a built Windows installer and Windows signature verification",
  });
checks.push({
  name: "Signing enabled in build",
  status: pkg.build?.win?.signExecutable === false ? "blocked" : "not-tested",
  detail:
    "A release requires a trusted publisher signature; no certificate or signing identity is fabricated",
});
checks.push({
  name: "Tor corresponding source package",
  status: "blocked",
  detail:
    "Current LICENSES.md records missing complete source/patch/build materials for the shipped GPL bundle; resolve before public distribution",
});
checks.push({
  name: "Signed update and recovery",
  status: "not-tested",
  detail:
    "No verified signed updater/rollback is available in the current release",
});
checks.push({
  name: "Independent privacy and OS packet audit",
  status: "not-tested",
  detail:
    "Controlled browser tests do not certify all OS DNS/IP/UDP traffic or population-level fingerprint resistance",
});
const report = {
  version: pkg.version,
  createdAt: new Date().toISOString(),
  ready: checks.every((c) => c.status === "passed"),
  checks,
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  `artifacts/release-readiness-${pkg.version}.json`,
  JSON.stringify(report, null, 2),
);
for (const check of checks)
  console.log(`${check.status.toUpperCase()}: ${check.name} — ${check.detail}`);
process.exitCode = report.ready ? 0 : 1;
