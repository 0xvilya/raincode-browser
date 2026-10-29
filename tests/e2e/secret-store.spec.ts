import { build } from "esbuild";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";

test("Windows DPAPI stores and decrypts ciphertext without a plaintext fallback", async ({
  rainBrowser: { app, userData },
}) => {
  test.skip(
    process.platform !== "win32",
    "This integration verifies the real Windows DPAPI provider.",
  );
  const helper = test.info().outputPath("secret-store.cjs");
  await build({
    entryPoints: [path.resolve("src/main/secret-store.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    outfile: helper,
  });
  const result = await app.evaluate(
    async (_electron, options) => {
      const { createRequire } = process.getBuiltinModule("module");
      const { readFile, readdir } = process.getBuiltinModule("fs/promises");
      const { join } = process.getBuiltinModule("path");
      const { SecretStore } = createRequire(options.helper)(
        options.helper,
      ) as typeof import("../../src/main/secret-store");
      const store = new SecretStore(options.directory);
      const available = await store.available();
      if (!available)
        return {
          available,
          roundtrip: false,
          ciphertextOnly: false,
          deleted: false,
        };
      await store.set("default", options.fixture);
      try {
        const ciphertext = await readFile(
          join(options.directory, "default.bin"),
        );
        const names = await readdir(options.directory);
        const restored = await store.get("default");
        const roundtrip = restored === options.fixture;
        const ciphertextOnly =
          ciphertext.length > 0 &&
          !ciphertext.includes(Buffer.from(options.fixture, "utf8")) &&
          names.length === 1 &&
          names[0] === "default.bin";
        await store.delete("default");
        return {
          available,
          roundtrip,
          ciphertextOnly,
          deleted: (await readdir(options.directory)).length === 0,
        };
      } finally {
        await store.delete("default");
      }
    },
    {
      helper,
      directory: path.join(userData, "secret-store-e2e"),
      fixture: `synthetic-test-only:${randomUUID()}:Кириллица`,
    },
  );
  expect(result).toEqual({
    available: true,
    roundtrip: true,
    ciphertextOnly: true,
    deleted: true,
  });
});
