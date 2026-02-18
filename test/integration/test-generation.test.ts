/**
 * Integration tests for generated test suite (--test-dir).
 *
 * Runs the pipeline with --test-dir, then verifies:
 * - All expected files are created
 * - Generated test files are valid TypeScript (importable)
 * - Generated tests actually pass (vitest run on generated config)
 * - Skip-if-exists: second run does not overwrite
 * - --force-test overrides skip-if-exists
 *
 * Uses a project-local tmp/ directory so that Node ESM module resolution
 * can find fastify, vitest, and other dependencies from node_modules.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { runGenerationPipeline } from "../../src/pipeline.js";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..");
const WSDL = join(PROJECT_ROOT, "examples", "minimal", "weather.wsdl");

describe("test generation pipeline", () => {
  let outDir: string;
  let testDir: string;

  beforeAll(async () => {
    // Use a project-local tmp/ directory so ESM module resolution finds
    // fastify, vitest, etc. from the project's node_modules.
    const tmpBase = join(PROJECT_ROOT, "tmp");
    mkdirSync(tmpBase, { recursive: true });
    outDir = mkdtempSync(join(tmpBase, "testgen-"));
    testDir = join(outDir, "tests");

    await runGenerationPipeline({
      wsdl: WSDL,
      catalogOut: join(outDir, "client", "catalog.json"),
      clientOutDir: join(outDir, "client"),
      openapi: {
        outFile: join(outDir, "openapi.json"),
        format: "json",
      },
      gateway: {
        outDir: join(outDir, "gateway"),
        versionSlug: "v1",
        serviceSlug: "weather",
      },
      test: {
        testDir,
        force: false,
      },
    });
  }, 60_000);

  // --- File creation ---

  const expectedFiles = [
    "vitest.config.ts",
    "helpers/mock-client.ts",
    "helpers/test-app.ts",
    "gateway/routes.test.ts",
    "gateway/errors.test.ts",
    "gateway/envelope.test.ts",
    "gateway/validation.test.ts",
    "runtime/classify-error.test.ts",
    "runtime/envelope-builders.test.ts",
    "runtime/unwrap.test.ts",
  ];

  it("creates all expected test files", () => {
    for (const file of expectedFiles) {
      const filePath = join(testDir, file);
      expect(existsSync(filePath), `Missing: ${file}`).toBe(true);
    }
  });

  it("generated files are non-empty", () => {
    for (const file of expectedFiles) {
      const filePath = join(testDir, file);
      const stat = statSync(filePath);
      expect(stat.size, `Empty: ${file}`).toBeGreaterThan(0);
    }
  });

  // --- Content validation ---

  it("vitest.config.ts has root set to __dirname", () => {
    const content = readFileSync(join(testDir, "vitest.config.ts"), "utf-8");
    expect(content).toContain("root: __dirname");
    expect(content).toContain("gateway/**/*.test.ts");
    expect(content).toContain("runtime/**/*.test.ts");
  });

  it("mock-client.ts imports from operations", () => {
    const content = readFileSync(join(testDir, "helpers", "mock-client.ts"), "utf-8");
    expect(content).toContain("WeatherOperations");
    expect(content).toContain("createMockClient");
    expect(content).toContain("GetCityForecastByZIP");
    expect(content).toContain("GetCityWeatherByZIP");
    expect(content).toContain("GetWeatherInformation");
  });

  it("test-app.ts imports plugin and mock client", () => {
    const content = readFileSync(join(testDir, "helpers", "test-app.ts"), "utf-8");
    expect(content).toContain("gatewayPlugin");
    expect(content).toContain("createMockClient");
    expect(content).toContain("createTestApp");
  });

  it("routes.test.ts has one test per operation", () => {
    const content = readFileSync(join(testDir, "gateway", "routes.test.ts"), "utf-8");
    expect(content).toContain("get-city-forecast-by-zip");
    expect(content).toContain("get-city-weather-by-zip");
    expect(content).toContain("get-weather-information");
    expect(content).toContain("returns SUCCESS envelope");
  });

  it("errors.test.ts tests various error types", () => {
    const content = readFileSync(join(testDir, "gateway", "errors.test.ts"), "utf-8");
    expect(content).toContain("500");
    expect(content).toContain("502");
    expect(content).toContain("503");
    expect(content).toContain("504");
    expect(content).toContain("SOAP_FAULT");
    expect(content).toContain("ETIMEDOUT");
  });

  it("unwrap.test.ts tests ArrayOf wrappers", () => {
    const content = readFileSync(join(testDir, "runtime", "unwrap.test.ts"), "utf-8");
    expect(content).toContain("unwrapArrayWrappers");
    expect(content).toContain("ArrayOfForecast");
    expect(content).toContain("ArrayOfWeatherDescription");
  });

  // --- Generated tests actually pass ---

  it("generated tests pass when run with vitest", () => {
    const configPath = join(testDir, "vitest.config.ts");

    // Run vitest from the project root so node_modules is accessible.
    // Generated tests live under the project tree, so ESM resolution works.
    const result = execSync(
      `npx vitest run --config "${configPath}" --reporter=json`,
      {
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
        timeout: 60_000,
        env: { ...process.env, NODE_ENV: "test" },
      }
    );

    // Parse the JSON output to verify all tests passed
    // vitest --reporter=json may include non-JSON output before the JSON block
    const jsonStart = result.indexOf("{");
    if (jsonStart >= 0) {
      const parsed = JSON.parse(result.slice(jsonStart));
      expect(parsed.success).toBe(true);
      expect(parsed.numPassedTests).toBeGreaterThan(0);
      expect(parsed.numFailedTests).toBe(0);
    }
  }, 60_000);

  // --- Skip-if-exists ---

  it("does not overwrite existing files on second run", async () => {
    // Record modification times
    const routesTestPath = join(testDir, "gateway", "routes.test.ts");
    const originalMtime = statSync(routesTestPath).mtimeMs;

    // Small delay to ensure filesystem time resolution catches any change
    await new Promise(resolve => setTimeout(resolve, 100));

    // Run test generation again without force (reuses existing gateway/client)
    const { generateTests } = await import("../../src/test/generateTests.js");
    await generateTests({
      testDir,
      gatewayDir: join(outDir, "gateway"),
      clientDir: join(outDir, "client"),
      catalogFile: join(outDir, "client", "catalog.json"),
      imports: "js",
      force: false,
    });

    const newMtime = statSync(routesTestPath).mtimeMs;
    expect(newMtime).toBe(originalMtime);
  }, 60_000);

  // --- Force override ---

  it("overwrites existing files when force is true", async () => {
    const routesTestPath = join(testDir, "gateway", "routes.test.ts");
    const originalMtime = statSync(routesTestPath).mtimeMs;

    // Small delay to ensure filesystem time resolution catches any change
    await new Promise(resolve => setTimeout(resolve, 100));

    // Run test generation again with force
    const { generateTests } = await import("../../src/test/generateTests.js");
    await generateTests({
      testDir,
      gatewayDir: join(outDir, "gateway"),
      clientDir: join(outDir, "client"),
      catalogFile: join(outDir, "client", "catalog.json"),
      imports: "js",
      force: true,
    });

    const newMtime = statSync(routesTestPath).mtimeMs;
    expect(newMtime).toBeGreaterThan(originalMtime);
  }, 60_000);
});
