/**
 * Test Suite Generator Orchestrator
 *
 * Generates a complete, runnable Vitest test suite that validates all
 * generated gateway artifacts. Opt-in via --test-dir flag.
 *
 * Steps:
 * 1. Validate gatewayDir, clientDir, catalogFile exist
 * 2. Read and parse catalog.json
 * 3. Resolve ClientMeta and OperationMetadata
 * 4. Create output directories
 * 5. For each file: skip-if-exists check, then write
 */
import fs from "node:fs";
import path from "node:path";
import {info, success} from "../util/cli.js";
import {resolveClientMeta, resolveOperationMeta} from "../gateway/helpers.js";
import type {ResolvedOperationMeta} from "../gateway/helpers.js";
import type {CatalogForMocks} from "./mockData.js";
import {generateAllOperationMocks} from "./mockData.js";
import {
  emitVitestConfig,
  emitMockClientHelper,
  emitTestAppHelper,
  emitRoutesTest,
  emitErrorsTest,
  emitEnvelopeTest,
  emitValidationTest,
  emitClassifyErrorTest,
  emitEnvelopeBuildersTest,
  emitUnwrapTest,
} from "./generators.js";

/**
 * Options for test suite generation
 */
export interface GenerateTestsOptions {
  testDir: string;
  gatewayDir: string;
  clientDir: string;
  catalogFile: string;
  imports?: "js" | "ts" | "bare";
  force?: boolean;
  versionSlug?: string;
  serviceSlug?: string;
  flattenArrayWrappers?: boolean;
}

/**
 * Checks whether a test file should be written.
 * Returns true if the file does not exist or force is enabled.
 * Logs an info message and returns false if the file exists and force is disabled.
 */
function shouldWriteTestFile(filePath: string, force: boolean): boolean {
  if (!fs.existsSync(filePath)) return true;
  if (force) return true;
  info(`Skipping ${path.basename(filePath)} (already exists, use --force-test to overwrite)`);
  return false;
}

/**
 * Writes a test file if it should be written (skip-if-exists with force override).
 */
function writeTestFile(filePath: string, content: string, force: boolean): void {
  if (!shouldWriteTestFile(filePath, force)) return;
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Generates a complete Vitest test suite for the generated gateway artifacts.
 *
 * @param opts - Test generation options
 */
export async function generateTests(opts: GenerateTestsOptions): Promise<void> {
  const testDir = path.resolve(opts.testDir);
  const gatewayDir = path.resolve(opts.gatewayDir);
  const clientDir = path.resolve(opts.clientDir);
  const catalogFile = path.resolve(opts.catalogFile);
  const importsMode = opts.imports ?? "js";
  const force = opts.force ?? false;

  // Validate required files exist
  if (!fs.existsSync(gatewayDir)) {
    throw new Error(`Gateway directory does not exist: ${gatewayDir}`);
  }
  if (!fs.existsSync(clientDir)) {
    throw new Error(`Client directory does not exist: ${clientDir}`);
  }
  if (!fs.existsSync(catalogFile)) {
    throw new Error(`Catalog file does not exist: ${catalogFile}`);
  }

  // Read and parse catalog
  const catalogRaw = fs.readFileSync(catalogFile, "utf-8");
  const catalog: CatalogForMocks = JSON.parse(catalogRaw);

  // Resolve client metadata
  const clientMeta = resolveClientMeta({
    clientDir,
    catalogFile,
    serviceSlug: opts.serviceSlug ?? "service",
    importsMode,
  }, catalog);

  // Build operation metadata from catalog + OpenAPI paths
  const operations: ResolvedOperationMeta[] = [];
  if (catalog.operations) {
    // Read OpenAPI doc paths from the gateway's generated routes to get URL paths
    // We use the catalog operations and derive paths using the same pattern as gateway generation
    for (const op of catalog.operations) {
      const operationSlug = op.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

      // Try to find the path from the generated operation schema
      const opSchemaPath = path.join(gatewayDir, "schemas", "operations", `${operationSlug}.json`);
      let urlPath = `/${operationSlug.replace(/_/g, "-")}`;

      if (fs.existsSync(opSchemaPath)) {
        // Read the route file to extract the actual URL path
        const routeFilePath = path.join(gatewayDir, "routes", `${operationSlug}.ts`);
        if (fs.existsSync(routeFilePath)) {
          const routeContent = fs.readFileSync(routeFilePath, "utf-8");
          const urlMatch = routeContent.match(/url:\s*"([^"]+)"/);
          if (urlMatch) {
            urlPath = urlMatch[1];
          }
        }
      }

      const resolved = resolveOperationMeta(
        op.name,
        operationSlug,
        "post", // Default method for SOAP operations
        urlPath,
        catalog.operations
      );

      // Try to read method from the route file
      const routeFilePath = path.join(gatewayDir, "routes", `${operationSlug}.ts`);
      if (fs.existsSync(routeFilePath)) {
        const routeContent = fs.readFileSync(routeFilePath, "utf-8");
        const methodMatch = routeContent.match(/method:\s*"([^"]+)"/);
        if (methodMatch) {
          resolved.method = methodMatch[1].toLowerCase();
        }
      }

      operations.push(resolved);
    }
  }

  // Create output directories
  fs.mkdirSync(path.join(testDir, "helpers"), {recursive: true});
  fs.mkdirSync(path.join(testDir, "gateway"), {recursive: true});
  fs.mkdirSync(path.join(testDir, "runtime"), {recursive: true});

  // Compute mock data once for all emitters
  const mocks = generateAllOperationMocks(catalog, {
    flattenArrayWrappers: opts.flattenArrayWrappers,
  });

  // Emit vitest.config.ts
  writeTestFile(
    path.join(testDir, "vitest.config.ts"),
    emitVitestConfig(),
    force
  );

  // Emit helpers/mock-client.ts
  writeTestFile(
    path.join(testDir, "helpers", "mock-client.ts"),
    emitMockClientHelper(testDir, clientDir, importsMode, clientMeta, operations, mocks),
    force
  );

  // Emit helpers/test-app.ts
  writeTestFile(
    path.join(testDir, "helpers", "test-app.ts"),
    emitTestAppHelper(testDir, gatewayDir, importsMode, clientMeta),
    force
  );

  // Emit gateway/routes.test.ts
  writeTestFile(
    path.join(testDir, "gateway", "routes.test.ts"),
    emitRoutesTest(testDir, importsMode, operations, mocks),
    force
  );

  // Emit gateway/errors.test.ts
  writeTestFile(
    path.join(testDir, "gateway", "errors.test.ts"),
    emitErrorsTest(testDir, importsMode, operations, mocks),
    force
  );

  // Emit gateway/envelope.test.ts
  writeTestFile(
    path.join(testDir, "gateway", "envelope.test.ts"),
    emitEnvelopeTest(testDir, importsMode, operations, mocks),
    force
  );

  // Emit gateway/validation.test.ts
  writeTestFile(
    path.join(testDir, "gateway", "validation.test.ts"),
    emitValidationTest(testDir, importsMode, operations),
    force
  );

  // Emit runtime/classify-error.test.ts
  writeTestFile(
    path.join(testDir, "runtime", "classify-error.test.ts"),
    emitClassifyErrorTest(testDir, gatewayDir, importsMode),
    force
  );

  // Emit runtime/envelope-builders.test.ts
  writeTestFile(
    path.join(testDir, "runtime", "envelope-builders.test.ts"),
    emitEnvelopeBuildersTest(testDir, gatewayDir, importsMode),
    force
  );

  // Emit runtime/unwrap.test.ts (conditional: only when ArrayOf* wrappers exist)
  const unwrapContent = emitUnwrapTest(testDir, gatewayDir, importsMode, catalog);
  if (unwrapContent) {
    writeTestFile(
      path.join(testDir, "runtime", "unwrap.test.ts"),
      unwrapContent,
      force
    );
  }

  success(`Test suite generated in ${testDir}`);
}
