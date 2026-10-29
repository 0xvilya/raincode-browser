import { spawnSync } from "node:child_process";
const steps = [
  [
    "lint",
    [
      "node_modules/eslint/bin/eslint.js",
      "src",
      "tests",
      "scripts",
      "*.ts",
      "*.mjs",
    ],
  ],
  ["typecheck", ["node_modules/typescript/bin/tsc", "--noEmit"]],
  ["unit", ["node_modules/vitest/vitest.mjs", "run"]],
  ["build", ["scripts/build.mjs"]],
  ["e2e", ["node_modules/@playwright/test/cli.js", "test"]],
];
for (const [name, args] of steps) {
  console.log(`RainCode: ${name}`);
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
