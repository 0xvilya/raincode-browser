import { build } from "esbuild";
await build({
  entryPoints: ["src/main/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/main.cjs",
  external: ["electron", "node:sqlite"],
  target: "node24",
});
await build({
  entryPoints: ["src/preload/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/preload.cjs",
  external: ["electron"],
  target: "node24",
});
await build({
  entryPoints: ["src/preload/tor-guard.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/tor-guard.cjs",
  external: ["electron"],
  target: "node24",
});

await build({
  entryPoints: ["src/preload/passwords.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/passwords.cjs",
  external: ["electron"],
  target: "node24",
});
