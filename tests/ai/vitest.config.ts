import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/ai/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true,
  },
});
