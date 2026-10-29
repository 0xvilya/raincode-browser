import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verifyTorBundle } from "../../src/main/tor";

let copied = "";
beforeAll(async () => {
  copied = await mkdtemp(join(tmpdir(), "raincode-tor-integrity-"));
  await cp(resolve("vendor/tor/win32-x64"), copied, { recursive: true });
});
afterAll(async () => {
  if (copied) await rm(copied, { recursive: true, force: true });
});

describe("bundled Tor trust anchor", () => {
  it("accepts the pinned verified distribution", async () => {
    expect(await verifyTorBundle(copied)).toBe(join(copied, "tor/tor.exe"));
  });
  it("rejects a tampered executable even with an unchanged manifest", async () => {
    const path = join(copied, "tor/tor.exe");
    const original = await readFile(path);
    try {
      await writeFile(path, Buffer.from("tampered executable"));
      await expect(verifyTorBundle(copied)).rejects.toThrow("TOR_INTEGRITY");
    } finally {
      await writeFile(path, original);
    }
  });
  it("rejects an attacker-rewritten manifest and downgrade", async () => {
    const path = join(copied, "manifest.json");
    const original = await readFile(path);
    try {
      const manifest = JSON.parse(original.toString("utf8"));
      manifest.version = "0.0.1";
      await writeFile(path, JSON.stringify(manifest));
      await expect(verifyTorBundle(copied)).rejects.toThrow("TOR_INTEGRITY");
    } finally {
      await writeFile(path, original);
    }
  });
  it("rejects an injected DLL before executing the daemon", async () => {
    const path = join(copied, "tor/evil.dll");
    try {
      await writeFile(path, "untrusted side-loaded DLL");
      await expect(verifyTorBundle(copied)).rejects.toThrow("TOR_INTEGRITY");
    } finally {
      await rm(path, { force: true });
    }
  });
});
