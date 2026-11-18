/**
 * Integration tests for generated test suite (--test-dir).
 *
 * Runs generated Vitest projects and checks consumer ownership on regeneration.
 */
import {verificationPath} from "../helpers/verificationPath.js";
import {afterAll, describe, it, expect, beforeAll, type TestContext} from "vitest";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import { dirname, join } from "node:path";
import {pathToFileURL} from "node:url";
import type {FastifyInstance} from "fastify";
import {runOwnedNode} from '../helpers/ownedNodeProcess.js';
import {buildChoiceWsdl, buildSearchChoiceSchema, SEARCH_CHOICE_SCHEMA} from "../helpers/choiceWsdl.js";
import {generateTests, parseStreamConfig, runGenerationPipeline} from "../../src/index.js";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..");
const TEST_GENERATION_TMP = join(PROJECT_ROOT, verificationPath("tmp/test-generation"));
const WSDL = join(PROJECT_ROOT, "examples", "minimal", "weather.wsdl");
const workspaces: string[] = [];

function createWorkspace(prefix: string): string {
  mkdirSync(TEST_GENERATION_TMP, {recursive: true});
  const directory = mkdtempSync(join(TEST_GENERATION_TMP, prefix));
  workspaces.push(directory);
  return directory;
}

afterAll(() => {
  for (const directory of workspaces) rmSync(directory, {recursive: true, force: true});
});

async function runGeneratedVitest(configPath: string, context: TestContext): Promise<string[]> {
  const reportPath = join(dirname(configPath), ".vitest-report.json");
  rmSync(reportPath, {force: true});
  const work = runOwnedNode(
    [join(PROJECT_ROOT, "node_modules", "vitest", "vitest.mjs"), "run", "--config", configPath, "--reporter=json", "--outputFile", reportPath],
    {
      cwd: PROJECT_ROOT,
      timeoutMs: 60_000,
      signal: context.signal,
      env: {...process.env, NODE_ENV: "test"},
    }
  );
  context.onTestFinished(async () => {await work.catch(() => undefined);}, 60_000);
  await work;
  const parsed = JSON.parse(readFileSync(reportPath, "utf-8")) as {
    success: boolean;
    numFailedTests: number;
    testResults: {assertionResults: {fullName: string; status: string}[]}[];
  };
  expect(parsed.success).toBe(true);
  expect(parsed.numFailedTests).toBe(0);
  return parsed.testResults.flatMap(file => file.assertionResults.filter(test => test.status === 'passed').map(test => test.fullName));
}

describe("test generation pipeline", () => {
  let outDir: string;
  let testDir: string;

  beforeAll(async () => {
    outDir = createWorkspace("testgen-");
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

  it("runs the generated tests for every Weather operation", async context => {
    const passed = await runGeneratedVitest(join(testDir, "vitest.config.ts"), context);
    expect(passed).toEqual(expect.arrayContaining([
      expect.stringContaining("get-city-forecast-by-zip"),
      expect.stringContaining("get-city-weather-by-zip"),
      expect.stringContaining("get-weather-information"),
    ]));
  }, 120_000);

  it("preserves a custom scaffold until regeneration is forced", async () => {
    const file = join(testDir, "gateway/routes.test.ts");
    const generated = readFileSync(file, "utf8");
    const custom = generated + "\n// Consumer-owned scaffold addition.\n";
    writeFileSync(file, custom);
    const options = {
      testDir,
      gatewayDir: join(outDir, "gateway"),
      clientDir: join(outDir, "client"),
      catalogFile: join(outDir, "client/catalog.json"),
      imports: "js" as const,
    };
    await generateTests(options);
    expect(readFileSync(file, "utf8")).toBe(custom);
    await generateTests({...options, force: true});
    expect(readFileSync(file, "utf8")).toBe(generated);
  });
});

describe("choice union test generation", () => {
  it("emits valid choice fixtures and invalid multi-branch validation coverage", async context => {
    const outDir = createWorkspace("choice-testgen-");
    const testDir = join(outDir, "tests");
    const wsdlPath = join(outDir, "choice.wsdl");
    writeFileSync(
      wsdlPath,
      buildChoiceWsdl(SEARCH_CHOICE_SCHEMA, {
        namespace: "http://example.com/choice-testgen",
        servicePrefix: "ChoiceTestgen",
      }),
      "utf8",
    );

    await runGenerationPipeline({
      wsdl: wsdlPath,
      catalogOut: join(outDir, "client", "catalog.json"),
      clientOutDir: join(outDir, "client"),
      compiler: {choice: "union"},
      openapi: {
        outFile: join(outDir, "openapi.json"),
        format: "json",
      },
      gateway: {
        outDir: join(outDir, "gateway"),
        versionSlug: "v1",
        serviceSlug: "choice",
      },
      test: {
        testDir,
        force: false,
      },
    });

    const routesContent = readFileSync(join(testDir, "gateway", "routes.test.ts"), "utf-8");
    expect(routesContent).toContain('"email": "sample"');
    expect(routesContent).not.toContain('"phone": 0');

    const validationContent = readFileSync(join(testDir, "gateway", "validation.test.ts"), "utf-8");
    expect(validationContent).toContain("rejects invalid SearchRequest choice payload");
    expect(validationContent).toContain('"email": "sample"');
    expect(validationContent).toContain('"phone": 0');

    await runGeneratedVitest(join(testDir, "vitest.config.ts"), context);
  }, 120_000);

  it("emits missing-branch validation coverage for required choices", async context => {
    const outDir = createWorkspace("required-choice-testgen-");
    const testDir = join(outDir, "tests");
    const wsdlPath = join(outDir, "choice.wsdl");
    writeFileSync(
      wsdlPath,
      buildChoiceWsdl(buildSearchChoiceSchema({choiceMinOccurs: 1}), {
        namespace: "http://example.com/required-choice-testgen",
        servicePrefix: "RequiredChoiceTestgen",
      }),
      "utf8",
    );

    await runGenerationPipeline({
      wsdl: wsdlPath,
      catalogOut: join(outDir, "client", "catalog.json"),
      clientOutDir: join(outDir, "client"),
      compiler: {choice: "union"},
      openapi: {
        outFile: join(outDir, "openapi.json"),
        format: "json",
      },
      gateway: {
        outDir: join(outDir, "gateway"),
        versionSlug: "v1",
        serviceSlug: "choice",
      },
      test: {
        testDir,
        force: false,
      },
    });

    const validationContent = readFileSync(join(testDir, "gateway", "validation.test.ts"), "utf-8");
    expect(validationContent).toContain("rejects invalid SearchRequest choice payload");
    expect(validationContent).toContain("rejects missing SearchRequest choice payload");

    await runGeneratedVitest(join(testDir, "vitest.config.ts"), context);
  }, 120_000);
});

describe("JSON array stream test generation", () => {
  it("emits JSON array route handlers and generated route tests", async context => {
    const outDir = createWorkspace("json-array-stream-testgen-");
    const testDir = join(outDir, "tests");

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
      streamConfig: parseStreamConfig({
        operations: {
          GetWeatherInformation: {
            format: "json-array",
            recordType: "WeatherDescription",
            recordPath: [
              "GetWeatherInformationResponse",
              "GetWeatherInformationResult",
              "WeatherDescription",
            ],
          },
        },
      }),
    });

    // @why Exercise the generated app through its advertised operation rather than freeze import lists, mapper helpers or handler syntax.
    const spec = JSON.parse(readFileSync(join(outDir, "openapi.json"), "utf8")) as {
      paths: Record<string, {post?: {operationId?: string}}>;
    };
    const route = Object.entries(spec.paths).find(([, item]) => item.post?.operationId === "GetWeatherInformation")?.[0];
    expect(route).toBeDefined();
    const {createTestApp} = await import(pathToFileURL(join(testDir, "helpers/test-app.ts")).href) as {
      createTestApp(): Promise<FastifyInstance>;
    };
    const app = await createTestApp();
    try {
      const response = await app.inject({method: "POST", url: route!, payload: {}});
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");
      const records: unknown = response.json();
      expect(Array.isArray(records)).toBe(true);
      expect((records as unknown[]).length).toBeGreaterThan(0);
    } finally {await app.close();}
    await runGeneratedVitest(join(testDir, "vitest.config.ts"), context);
  }, 120_000);
});
