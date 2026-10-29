import { safeStorage } from "electron";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, parse, relative, resolve, sep } from "node:path";

export interface SecretStorageAdapter {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(
    value: Buffer,
  ): Promise<{ result: string; shouldReEncrypt: boolean }>;
  getSelectedStorageBackend?(): string;
  platform?: NodeJS.Platform;
}

const systemAdapter: SecretStorageAdapter = {
  platform: process.platform,
  isAsyncEncryptionAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
  encryptStringAsync: (value) => safeStorage.encryptStringAsync(value),
  decryptStringAsync: (value) => safeStorage.decryptStringAsync(value),
  getSelectedStorageBackend: () => safeStorage.getSelectedStorageBackend(),
};
const MAX_PLAIN_BYTES = 16 * 1024;

const LINUX_BACKENDS = new Set([
  "gnome_libsecret",
  "kwallet",
  "kwallet5",
  "kwallet6",
]);

function missing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

/** Ciphertext-only storage. The caller never exports decrypted values to sites.
 * OS encryption does not protect against malware running as the same OS user.
 */
export class SecretStore {
  private get maxCipherBytes() {
    return Math.max(64 * 1024, this.maxPlainBytes * 4);
  }
  private readonly directory: string;
  private readonly adapter: SecretStorageAdapter;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    directory: string,
    adapter: SecretStorageAdapter = systemAdapter,
    private readonly maxPlainBytes = MAX_PLAIN_BYTES,
  ) {
    if (
      !Number.isSafeInteger(maxPlainBytes) ||
      maxPlainBytes < 1 ||
      maxPlainBytes > 1024 * 1024
    )
      throw new Error("SECRET_LIMIT_INVALID");
    this.directory = resolve(directory);
    if (this.directory === parse(this.directory).root)
      throw new Error("SECRET_DIRECTORY_INVALID");
    this.adapter = adapter;
  }

  async available(): Promise<boolean> {
    try {
      if (!(await this.adapter.isAsyncEncryptionAvailable())) return false;
      if ((this.adapter.platform || process.platform) === "linux") {
        const backend = this.adapter.getSelectedStorageBackend?.();
        if (!backend || !LINUX_BACKENDS.has(backend)) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private idPath(id: string): string {
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id))
      throw new Error("SECRET_ID_INVALID");
    return join(this.directory, `${id}.bin`);
  }
  private validatePlain(value: string): void {
    if (
      typeof value !== "string" ||
      Buffer.byteLength(value, "utf8") > this.maxPlainBytes
    )
      throw new Error("SECRET_VALUE_INVALID");
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async requireEncryption(): Promise<void> {
    if (!(await this.available()))
      throw new Error("SECRET_STORAGE_UNAVAILABLE");
  }

  /** Reject a linked root or ancestor, including Windows directory junctions. */
  private async checkedDirectory(create: boolean): Promise<boolean> {
    const root = parse(this.directory).root;
    const check = async () => {
      let current = root;
      for (const part of relative(root, this.directory).split(sep)) {
        current = join(current, part);
        try {
          const info = await lstat(current);
          if (info.isSymbolicLink() || !info.isDirectory())
            throw new Error("SECRET_PATH_DENIED");
        } catch (error) {
          if (missing(error)) return false;
          throw error;
        }
      }
      return true;
    };
    if (await check()) return true;
    if (!create) return false;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (!(await check())) throw new Error("SECRET_PATH_DENIED");
    return true;
  }
  private async checkedFile(path: string) {
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1)
        throw new Error("SECRET_PATH_DENIED");
      return info;
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
  }

  private async save(id: string, value: string): Promise<void> {
    const path = this.idPath(id);
    this.validatePlain(value);
    await this.requireEncryption();
    let encrypted: Buffer;
    try {
      encrypted = await this.adapter.encryptStringAsync(value);
    } catch {
      throw new Error("SECRET_ENCRYPT_FAILED");
    }
    if (
      !Buffer.isBuffer(encrypted) ||
      !encrypted.length ||
      encrypted.length > this.maxCipherBytes
    )
      throw new Error("SECRET_ENCRYPT_FAILED");
    await this.checkedDirectory(true);
    await this.checkedFile(path);
    const temporary = join(this.directory, `.${id}.${randomUUID()}.tmp`);
    let committed = false;
    try {
      const handle = await open(
        temporary,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          (constants.O_NOFOLLOW || 0),
        0o600,
      );
      try {
        await handle.writeFile(encrypted);
        await handle.sync();
      } finally {
        await handle.close();
      }
      if (!(await this.checkedDirectory(false)))
        throw new Error("SECRET_PATH_DENIED");
      await this.checkedFile(path);
      await this.checkedFile(temporary);
      await rename(temporary, path);
      committed = true;
    } finally {
      if (!committed)
        await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
  set(id: string, value: string): Promise<void> {
    return this.serial(() => this.save(id, value));
  }
  get(id: string): Promise<string | undefined> {
    return this.serial(async () => {
      const path = this.idPath(id);
      await this.requireEncryption();
      if (!(await this.checkedDirectory(false))) return undefined;
      const initial = await this.checkedFile(path);
      if (!initial) return undefined;
      const handle = await open(
        path,
        constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
      );
      let encrypted: Buffer;
      try {
        const info = await handle.stat();
        if (
          !info.isFile() ||
          info.size < 1 ||
          info.size > this.maxCipherBytes ||
          info.nlink !== 1
        )
          throw new Error("SECRET_CIPHER_INVALID");
        const buffer = Buffer.alloc(this.maxCipherBytes + 1);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        if (!bytesRead || bytesRead > this.maxCipherBytes)
          throw new Error("SECRET_CIPHER_INVALID");
        if (!(await this.checkedDirectory(false)))
          throw new Error("SECRET_PATH_DENIED");
        const current = await this.checkedFile(path);
        if (!current || current.ino !== info.ino || current.dev !== info.dev)
          throw new Error("SECRET_PATH_DENIED");
        encrypted = buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
      let decrypted: { result: string; shouldReEncrypt: boolean };
      try {
        decrypted = await this.adapter.decryptStringAsync(encrypted);
        this.validatePlain(decrypted.result);
      } catch {
        throw new Error("SECRET_DECRYPT_FAILED");
      }
      if (decrypted.shouldReEncrypt) await this.save(id, decrypted.result);
      return decrypted.result;
    });
  }
  delete(id: string): Promise<void> {
    return this.serial(async () => {
      const path = this.idPath(id);
      if (!(await this.checkedDirectory(false))) return;
      if (!(await this.checkedFile(path))) return;
      await rm(path);
    });
  }
}
