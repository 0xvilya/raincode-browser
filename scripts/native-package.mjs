import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
const configure = process.argv.includes("--configure");
const requestedTarget = process.argv
  .find((arg) => arg.startsWith("--target="))
  ?.slice(9);
if (requestedTarget && !configure)
  throw Error("Target override is configuration-only");
const platform = requestedTarget || process.platform;
if (!["darwin", "linux"].includes(platform))
  throw Error(
    "This preview pipeline supports macOS/Linux only; Windows distribution requires the Tor source bundle review",
  );
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const output = `release/native-${platform}-${process.arch}`;
await mkdir("artifacts", { recursive: true });
if (process.argv.includes("--configure")) {
  // The existing Windows runtime is never copied into a different OS package.
  const config = {
    ...pkg.build,
    directories: { ...pkg.build.directories, output },
    extraResources: [],
    extraFiles: [],
    artifactName: `RainCode-${pkg.version}-${platform}-${process.arch}-preview.\${ext}`,
  };
  await writeFile(
    "artifacts/native-builder.json",
    JSON.stringify(config, null, 2),
  );
} else {
  const executable =
    platform === "darwin"
      ? path.join(
          output,
          process.arch === "arm64" ? "mac-arm64" : "mac",
          "RainCode Browser.app/Contents/MacOS/RainCode Browser",
        )
      : path.join(output, "linux-unpacked/raincode-browser");
  if (!(await stat(executable)).isFile())
    throw Error("Packaged executable missing");
  if (!process.env.GITHUB_ENV) throw Error("GITHUB_ENV is required in CI");
  await import("node:fs/promises").then(({ appendFile }) =>
    appendFile(
      process.env.GITHUB_ENV,
      `RAINCODE_E2E_EXECUTABLE=${path.resolve(executable)}\n`,
    ),
  );
  const files = [];
  for (const name of await readdir(output)) {
    if (!/\.(dmg|zip|AppImage|deb)$/.test(name)) continue;
    const data = await readFile(path.join(output, name));
    files.push({
      name,
      bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  }
  if (!files.length) throw Error("No installer artifacts produced");
  await writeFile(
    path.join(output, "SHA256SUMS.json"),
    JSON.stringify(
      {
        version: pkg.version,
        platform,
        arch: process.arch,
        torBundled: false,
        signed: false,
        files,
      },
      null,
      2,
    ),
  );
}
