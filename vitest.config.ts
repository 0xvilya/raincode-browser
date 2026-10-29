import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/core/**/*.test.ts",
      "tests/developer/**/*.test.ts",
      "tests/omnibox/**/*.test.ts",
      "tests/tor/**/*.test.ts",
      "tests/security/**/*.test.ts",
      "tests/ai/**/*.test.ts",
      "tests/privacy/**/*.test.ts",
    ],
    restoreMocks: true,
    clearMocks: true,
  },
});
