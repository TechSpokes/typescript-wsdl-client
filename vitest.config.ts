import { defineConfig } from "vitest/config";

// Keep resource-heavy files out of the fast parallel batch, including nested compiler work.
const heavy = [
  "test/integration/**/*.test.ts",
  "test/conformance/**/*.test.ts",
  "test/unit/schema-loading-budgets.test.ts",
  "test/unit/app-security.test.ts",
  "test/unit/client-choice-union-types.test.ts",
  "test/unit/schema-scalar-completeness-review.test.ts",
];

export default defineConfig({
  test: {
    globals: false,
    projects: [
      {extends: true, test: {name: "fast", include: ["test/**/*.test.ts"], exclude: heavy,
        testTimeout: 30_000, maxWorkers: "50%", sequence: {groupOrder: 0}}},
      {extends: true, test: {name: "workflows", include: heavy,
        testTimeout: 120_000, hookTimeout: 120_000, maxWorkers: 2, sequence: {groupOrder: 1}}},
    ],
    snapshotFormat: {
      escapeString: false,
      printBasicPrototype: false,
    },
  },
});
