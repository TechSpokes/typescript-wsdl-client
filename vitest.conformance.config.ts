import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/conformance/stages/*.stage.ts"],
    globals: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    maxWorkers: 2,
  },
});
