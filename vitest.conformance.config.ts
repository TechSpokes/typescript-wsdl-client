import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/conformance/stages/*.stage.ts"],
    globals: false,
    testTimeout: 30_000,
  },
});
