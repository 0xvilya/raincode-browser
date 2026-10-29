import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const faults = vi.hoisted(() => ({ rename: false }));
vi.mock("electron", () => ({ safeStorage: {} }));
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (faults.rename) {
        faults.rename = false;
        throw new Error("FIXTURE_RENAME_FAILED");
      }
      return actual.rename(...args);
    },
  };
});
import {
  SecretStore,
  type SecretStorageAdapter,
} from "../../src/main/secret-store";

let directory = "";
beforeEach(async () => {
  // macOS exposes /var through a system symlink. Start the fixture from its
  // canonical temp directory while retaining every production link check.
  directory = await mkdtemp(
    join(await realpath(tmpdir()), "raincode-secret-unit-"),
  );
  faults.rename = false;
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function adapter(): SecretStorageAdapter {
  const key = randomBytes(32);
  return {
    platform: "win32",
    isAsyncEncryptionAvailable: vi.fn(async () => true),
    encryptStringAsync: vi.fn(async (plain: string) => {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      const encrypted = Buffer.concat([
        cipher.update(plain, "utf8"),
        cipher.final(),
      ]);
      return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    }),
    decryptStringAsync: vi.fn(async (encrypted: Buffer) => {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        encrypted.subarray(0, 12),
      );
      decipher.setAuthTag(encrypted.subarray(12, 28));
      return {
        result: Buffer.concat([
          decipher.update(encrypted.subarray(28)),
          decipher.final(),
        ]).toString("utf8"),
        shouldReEncrypt: false,
      };
    }),
  };
}

describe("ciphertext-only secret storage", () => {
  it("roundtrips Unicode through encryption, persists ciphertext and deletes it", async () => {
    const store = new SecretStore(directory, adapter());
    expect(await store.available()).toBe(true);
    expect(await store.get("default")).toBeUndefined();
    const value = JSON.stringify({
      username: "fixture-user",
      password: "секрет-только-теста",
    });
    await store.set("default", value);
    const raw = await readFile(join(directory, "default.bin"));
    expect(raw.includes(Buffer.from(value))).toBe(false);
    expect(raw.includes(Buffer.from("fixture-user"))).toBe(false);
    expect(await store.get("default")).toBe(value);
    expect(await readdir(directory)).toEqual(["default.bin"]);
    await store.delete("default");
    expect(await readdir(directory)).toEqual([]);
    await store.delete("default");
  });
  it.each([
    "../default",
    "a/b",
    "a\\b",
    "C:secret",
    ".",
    "",
    "\0",
    "default.bin",
    "UPPERCASE",
    "a".repeat(81),
  ])("rejects unsafe identifiers: %s", async (id) => {
    const store = new SecretStore(directory, adapter());
    await expect(store.set(id, "fixture")).rejects.toThrow("SECRET_ID_INVALID");
    await expect(store.get(id)).rejects.toThrow("SECRET_ID_INVALID");
    await expect(store.delete(id)).rejects.toThrow("SECRET_ID_INVALID");
    expect(await readdir(directory)).toEqual([]);
  });
  it("supports profile UUID identifiers and enforces the UTF-8 byte limit", async () => {
    const store = new SecretStore(directory, adapter());
    const id = "8d804a24-7f91-489a-81bd-0bc2ff7bc7f2";
    await store.set(id, "a".repeat(16384));
    expect(await store.get(id)).toHaveLength(16384);
    await expect(store.set(id, "а".repeat(8193))).rejects.toThrow(
      "SECRET_VALUE_INVALID",
    );
    expect(await store.get(id)).toHaveLength(16384);
  });
  it("preserves the previous ciphertext if atomic replacement fails and cleans temp files", async () => {
    const store = new SecretStore(directory, adapter());
    await store.set("default", "fixture-before");
    const before = await readFile(join(directory, "default.bin"));
    faults.rename = true;
    await expect(store.set("default", "fixture-after")).rejects.toThrow(
      "FIXTURE_RENAME_FAILED",
    );
    expect(await readFile(join(directory, "default.bin"))).toEqual(before);
    expect(await store.get("default")).toBe("fixture-before");
    expect(await readdir(directory)).toEqual(["default.bin"]);
  });
  it("serializes concurrent updates to avoid lost replacement or temporary files", async () => {
    const store = new SecretStore(directory, adapter());
    await Promise.all([
      store.set("default", "first"),
      store.set("default", "second"),
      store.set("default", "third"),
    ]);
    expect(await store.get("default")).toBe("third");
    expect(await readdir(directory)).toEqual(["default.bin"]);
  });
  it("rejects corrupted ciphertext and oversized files without returning plaintext", async () => {
    const crypto = adapter();
    const store = new SecretStore(directory, crypto);
    await store.set("default", "fixture");
    await writeFile(join(directory, "default.bin"), Buffer.from("corrupt"));
    await expect(store.get("default")).rejects.toThrow("SECRET_DECRYPT_FAILED");
    vi.mocked(crypto.decryptStringAsync).mockClear();
    await writeFile(join(directory, "default.bin"), Buffer.alloc(65537));
    await expect(store.get("default")).rejects.toThrow("SECRET_CIPHER_INVALID");
    expect(crypto.decryptStringAsync).not.toHaveBeenCalled();
  });
  it("refreshes ciphertext after provider key rotation", async () => {
    const crypto = adapter();
    const decrypt = crypto.decryptStringAsync;
    crypto.decryptStringAsync = vi.fn(async (cipher) => ({
      ...(await decrypt(cipher)),
      shouldReEncrypt: true,
    }));
    const store = new SecretStore(directory, crypto);
    await store.set("default", "fixture-rotation");
    const before = await readFile(join(directory, "default.bin"));
    expect(await store.get("default")).toBe("fixture-rotation");
    expect(crypto.encryptStringAsync).toHaveBeenCalledTimes(2);
    expect(await readFile(join(directory, "default.bin"))).not.toEqual(before);
  });
});

describe("unavailable or unsafe OS backends", () => {
  it("fails closed on unavailable encryption but still allows deleting ciphertext", async () => {
    const crypto = adapter();
    const store = new SecretStore(directory, crypto);
    await store.set("default", "fixture");
    vi.mocked(crypto.isAsyncEncryptionAvailable).mockResolvedValue(false);
    expect(await store.available()).toBe(false);
    await expect(store.set("default", "fixture-other")).rejects.toThrow(
      "SECRET_STORAGE_UNAVAILABLE",
    );
    await expect(store.get("default")).rejects.toThrow(
      "SECRET_STORAGE_UNAVAILABLE",
    );
    await store.delete("default");
    expect(await readdir(directory)).toEqual([]);
  });
  it.each(["basic_text", "unknown", "unrecognized"])(
    "rejects Linux backend %s even when availability returns true",
    async (backend) => {
      const crypto = adapter();
      crypto.platform = "linux";
      crypto.getSelectedStorageBackend = () => backend;
      const store = new SecretStore(directory, crypto);
      expect(await store.available()).toBe(false);
      await expect(store.set("default", "fixture")).rejects.toThrow(
        "SECRET_STORAGE_UNAVAILABLE",
      );
      expect(crypto.encryptStringAsync).not.toHaveBeenCalled();
    },
  );
  it("accepts a recognized Linux secret-store backend", async () => {
    const crypto = adapter();
    crypto.platform = "linux";
    crypto.getSelectedStorageBackend = () => "gnome_libsecret";
    expect(await new SecretStore(directory, crypto).available()).toBe(true);
  });
  it("sanitizes provider encryption errors and never stores their plaintext", async () => {
    const crypto = adapter();
    vi.mocked(crypto.encryptStringAsync).mockRejectedValue(
      new Error("provider error containing secret"),
    );
    await expect(
      new SecretStore(directory, crypto).set("default", "fixture"),
    ).rejects.toThrow(/^SECRET_ENCRYPT_FAILED$/);
    expect(await readdir(directory)).toEqual([]);
  });
});

describe("filesystem boundaries", () => {
  it("rejects a symlink/junction root and linked ancestors", async () => {
    const actual = join(directory, "actual");
    await mkdir(actual);
    const linked = join(directory, "linked");
    await symlink(
      actual,
      linked,
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(
      new SecretStore(linked, adapter()).set("default", "fixture"),
    ).rejects.toThrow("SECRET_PATH_DENIED");
    await expect(
      new SecretStore(join(linked, "nested"), adapter()).set(
        "default",
        "fixture",
      ),
    ).rejects.toThrow("SECRET_PATH_DENIED");
    expect(await readdir(actual)).toEqual([]);
  });
  it("rejects directories/junctions in place of a secret file", async () => {
    const actual = join(directory, "actual");
    await mkdir(actual);
    await symlink(
      actual,
      join(directory, "default.bin"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const store = new SecretStore(directory, adapter());
    await expect(store.set("default", "fixture")).rejects.toThrow(
      "SECRET_PATH_DENIED",
    );
    await expect(store.get("default")).rejects.toThrow("SECRET_PATH_DENIED");
    await expect(store.delete("default")).rejects.toThrow("SECRET_PATH_DENIED");
  });
  it("rejects hardlinked ciphertext files", async () => {
    const store = new SecretStore(directory, adapter());
    await store.set("default", "fixture");
    await link(join(directory, "default.bin"), join(directory, "other.bin"));
    await expect(store.get("default")).rejects.toThrow("SECRET_PATH_DENIED");
    await expect(store.set("default", "replacement")).rejects.toThrow(
      "SECRET_PATH_DENIED",
    );
  });
});
