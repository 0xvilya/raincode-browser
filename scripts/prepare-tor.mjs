import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  lstat,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative, join, isAbsolute } from "node:path";
import { readKey, readSignature, createMessage, verify } from "openpgp";
import * as tar from "tar";

const version = "15.0.26";
const fingerprint = "EF6E286DDA85EA2A4BA7DE684E2C6E8793298290";
const filename = `tor-expert-bundle-windows-x86_64-${version}.tar.gz`;
const url = `https://dist.torproject.org/torbrowser/${version}/${filename}`;
const directory = resolve("vendor/tor/win32-x64");
const cache = resolve(".cache/tor");
await mkdir(cache, { recursive: true });
async function fetchBytes(address, limit) {
  const response = await fetch(address, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok || new URL(response.url).protocol !== "https:")
    throw new Error(`Tor download failed ${response.status}`);
  if (Number(response.headers.get("content-length")) > limit || !response.body)
    throw new Error("Tor download exceeded limit");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > limit) throw new Error("Tor download exceeded limit");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new Uint8Array(Buffer.concat(chunks));
}
let archive;
try {
  archive = new Uint8Array(await readFile(join(cache, filename)));
} catch {
  archive = await fetchBytes(url, 40 * 1024 * 1024);
  await writeFile(join(cache, filename), archive);
}
const signatureText = new TextDecoder().decode(
  await fetchBytes(`${url}.asc`, 32000),
);
const keyBytes = await fetchBytes(
  "https://openpgpkey.torproject.org/.well-known/openpgpkey/torproject.org/hu/kounek7zrdx745qydx6p59t9mqjpuhdf",
  1024 * 1024,
);
const key = await readKey({ binaryKey: keyBytes });
const keyText = key.armor();
if (key.getFingerprint().toUpperCase() !== fingerprint)
  throw new Error("Tor signing key fingerprint mismatch");
const signature = await readSignature({ armoredSignature: signatureText });
const verified = await verify({
  message: await createMessage({ binary: archive }),
  signature,
  verificationKeys: key,
  format: "binary",
});
if (!verified.signatures.length) throw new Error("Missing Tor signature");
await Promise.all(verified.signatures.map((item) => item.verified));
console.log(`Tor OpenPGP signature verified: ${fingerprint}`);
if (relative(resolve("vendor/tor"), directory) !== "win32-x64")
  throw new Error("Unsafe Tor destination");
try {
  if ((await lstat(directory)).isSymbolicLink())
    throw new Error("Unsafe Tor destination");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
await tar.t({
  file: join(cache, filename),
  strict: true,
  onReadEntry(entry) {
    const name = entry.path.replaceAll("\\", "/");
    if (
      isAbsolute(name) ||
      name.includes(":") ||
      name.split("/").includes("..") ||
      !["File", "Directory", "OldFile"].includes(entry.type) ||
      entry.size > 100 * 1024 * 1024
    )
      throw new Error("Unsafe Tor archive member");
  },
});
await tar.x({
  file: join(cache, filename),
  cwd: directory,
  strict: true,
  preservePaths: false,
});
const files = {};
async function walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const target = join(folder, entry.name);
    if ((await lstat(target)).isSymbolicLink())
      throw new Error("Tor symlink rejected");
    if (entry.isDirectory()) await walk(target);
    else if (entry.isFile())
      files[relative(directory, target).replaceAll("\\", "/")] = createHash(
        "sha256",
      )
        .update(await readFile(target))
        .digest("hex");
  }
}
await walk(directory);
const manifest = {
  version,
  platform: "win32-x64",
  source: url,
  signer: fingerprint,
  archiveSha256: createHash("sha256").update(archive).digest("hex"),
  files,
};
await writeFile(
  join(directory, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
await writeFile(
  "build/tor-bundle.json",
  JSON.stringify(
    {
      version,
      source: url,
      signer: fingerprint,
      archiveSha256: manifest.archiveSha256,
      files,
    },
    null,
    2,
  ),
);
await writeFile("build/tor-signing-key.asc", keyText);
await writeFile("build/tor-bundle.asc", signatureText);
console.log(
  JSON.stringify({
    version,
    files: Object.keys(files).length,
    archiveSha256: manifest.archiveSha256,
  }),
);
