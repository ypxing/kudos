import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{api,web,infra,scripts}/**/*.test.ts"],
    testTimeout: 30000,
  },
});
