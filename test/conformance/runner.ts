import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import Fastify from "fastify";
import {generateClient} from "../../src/client/generateClient.js";
import {generateOperations} from "../../src/client/generateOperations.js";
import {generateTypes} from "../../src/client/generateTypes.js";
import {generateUtils} from "../../src/client/generateUtils.js";
import {resolveCompilerOptions} from "../../src/config.js";
import {generateCatalog} from "../../src/compiler/generateCatalog.js";
import {compileCatalog, type CompiledCatalog} from "../../src/compiler/schemaCompiler.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";
import {generateGateway, generateOpenAPI, generateTests} from "../../src";
import {generateApp} from "../../src/app/generateApp.js";
import {WsdlCompilationError} from "../../src/util/errors.js";
import {deriveClientName} from "../../src/util/tools.js";
import {fixturesRoot, readFileUnder, resolveUnder, validateConformanceFixtureGraph} from "./fixturePolicy.js";
import type {AppArtifacts, CapabilityCase, GatewayArtifacts, GeneratedTestsArtifacts} from "./types.js";

const require = createRequire(import.meta.url);
const conformanceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(conformanceDir, "..", "..");
const conformanceTempRoot = join(repoRoot, "tmp", "conformance");

export function fixturePathFor(capability: CapabilityCase): string {
  return resolveUnder(fixturesRoot, capability.fixture);
}

export async function runCompileCase(capability: CapabilityCase): Promise<void> {
  const fixturePath = fixturePathFor(capability);
  if (!existsSync(fixturePath)) {
    throw new Error(`Missing conformance fixture for ${capability.id}: ${fixturePath}`);
  }

  if (capability.compile.outcome === "research") {
    return;
  }

  const outDir = createConformanceTempDir(capability, "compile");

  try {
    if (capability.compile.outcome === "success") {
      const compiled = await compileSuccess(capability, outDir);
      assertNames("type", capability.compile.typeNames, compiled.types.map(type => type.name));
      assertNames("alias", capability.compile.aliasNames, compiled.aliases.map(alias => alias.name));
      assertNames("operation", capability.compile.operationNames, compiled.operations.map(op => op.name));
      assertDiagnosticNotes(capability.compile.diagnosticNotes, compiled.diagnostics?.notes ?? []);
      capability.compile.assert?.(compiled);
      return;
    }

    try {
      await compileSuccess(capability, outDir);
    } catch (error) {
      assertExpectedError(capability, error);
      return;
    }

    throw new Error(`${capability.id} expected compilation to fail.`);
  } finally {
    rmSync(outDir, {recursive: true, force: true});
  }
}

export async function runClientCase(capability: CapabilityCase): Promise<void> {
  if (!capability.client) {
    throw new Error(`${capability.id} has no client expectation.`);
  }

  if (capability.compile.outcome !== "success") {
    throw new Error(`${capability.id} cannot run client evidence without successful compile evidence.`);
  }

  const outDir = createConformanceTempDir(capability, "client");
  const clientDir = join(outDir, "client");

  try {
    const compiled = await compileSuccess(capability, outDir);
    const files = {
      client: join(clientDir, "client.ts"),
      operations: join(clientDir, "operations.ts"),
      types: join(clientDir, "types.ts"),
      utils: join(clientDir, "utils.ts"),
    };

    mkdirSync(clientDir, {recursive: true});
    writePackageJson(outDir);
    generateClient(files.client, compiled);
    generateTypes(files.types, compiled);
    generateUtils(files.utils, compiled);
    generateOperations(files.operations, compiled);
    writeGeneratedTsconfig(outDir, false);
    runTypeScript(outDir, join(outDir, "tsconfig.json"));

    for (const expected of capability.client.sourceIncludes ?? []) {
      const source = readFileSync(files[expected.file], "utf8");
      if (!source.includes(expected.text)) {
        throw new Error(`${capability.id} expected ${expected.file} to include ${JSON.stringify(expected.text)}.`);
      }
    }

    capability.client.assert?.({
      clientDir,
      compiled,
      files,
      readFile: file => readFileSync(files[file], "utf8"),
    });
  } finally {
    rmSync(outDir, {recursive: true, force: true});
  }
}

export async function runOpenApiCase(capability: CapabilityCase): Promise<void> {
  if (!capability.openapi) {
    throw new Error(`${capability.id} has no OpenAPI expectation.`);
  }

  if (capability.compile.outcome !== "success") {
    throw new Error(`${capability.id} cannot run OpenAPI evidence without successful compile evidence.`);
  }

  const outDir = createConformanceTempDir(capability, "openapi");
  const openapiFile = join(outDir, "openapi.json");

  try {
    const compiled = await compileSuccess(capability, outDir);
    const result = await generateOpenAPI({
      compiledCatalog: compiled,
      format: "json",
      outFile: openapiFile,
      skipValidate: false,
    });

    capability.openapi.assert?.({
      compiled,
      doc: result.doc,
      openapiFile,
      outDir,
    });
  } finally {
    rmSync(outDir, {recursive: true, force: true});
  }
}

export async function runGatewayCase(capability: CapabilityCase): Promise<void> {
  if (!capability.gateway) {
    throw new Error(`${capability.id} has no gateway expectation.`);
  }

  if (capability.compile.outcome !== "success") {
    throw new Error(`${capability.id} cannot run gateway evidence without successful compile evidence.`);
  }

  const outDir = createConformanceTempDir(capability, "gateway");

  try {
    const project = await generateGatewayProject(capability, outDir);

    for (const expected of capability.gateway.sourceIncludes ?? []) {
      const source = readFileUnder(project.gatewayDir, expected.file);
      if (!source.includes(expected.text)) {
        throw new Error(`${capability.id} expected gateway ${expected.file} to include ${JSON.stringify(expected.text)}.`);
      }
    }

    const artifacts: GatewayArtifacts = {
      clientDir: project.clientDir,
      gatewayDir: project.gatewayDir,
      openapiFile: project.openapiFile,
      catalogFile: project.catalogFile,
      compiled: project.compiled,
      doc: project.doc,
      readGatewayFile: (relativePath: string) => readFileUnder(project.gatewayDir, relativePath),
    };

    await capability.gateway.assert?.(artifacts);

    for (const request of capability.gateway.requests ?? []) {
      const route = routeFor(project.doc, request.operationId);
      const observedArgs: Record<string, unknown> = {};
      const mockClient = Object.fromEntries(
        Object.entries(request.mockClient).map(([methodName, handler]) => [
          methodName,
          async (args: unknown) => {
            observedArgs[methodName] = args;
            return handler(args);
          },
        ]),
      );

      const pluginModule = await import(pathToFileURL(resolveUnder(project.gatewayDir, "plugin.ts")).href);
      const app = Fastify({logger: false});

      try {
        await app.register(pluginModule.default, {client: mockClient});
        await app.ready();
        const response = await app.inject({
          method: route.method.toUpperCase(),
          url: route.path,
          headers: {"content-type": "application/json"},
          payload: JSON.stringify(request.payload),
        });

        if (response.statusCode !== request.expectedStatus) {
          throw new Error(`${capability.id} expected ${request.operationId} to return ${request.expectedStatus}, got ${response.statusCode}: ${response.body}`);
        }

        request.assertBody?.(response.json());
        request.assertClientArgs?.(observedArgs[request.operationId]);
      } finally {
        await app.close();
      }
    }
  } finally {
    rmSync(outDir, {recursive: true, force: true});
  }
}

export async function runGeneratedTestsCase(capability: CapabilityCase): Promise<void> {
  if (!capability.generatedTests) {
    throw new Error(`${capability.id} has no generated-test expectation.`);
  }

  if (capability.compile.outcome !== "success") {
    throw new Error(`${capability.id} cannot run generated-test evidence without successful compile evidence.`);
  }

  const outDir = createConformanceTempDir(capability, "generated-tests");
  const testDir = join(outDir, "tests");

  try {
    const project = await generateGatewayProject(capability, outDir);

    await generateTests({
      testDir,
      gatewayDir: project.gatewayDir,
      clientDir: project.clientDir,
      catalogFile: project.catalogFile,
      imports: "js",
      force: true,
    });

    runGeneratedVitest(outDir, join(testDir, "vitest.config.ts"));

    for (const expected of capability.generatedTests.sourceIncludes ?? []) {
      const source = readFileUnder(testDir, expected.file);
      if (!source.includes(expected.text)) {
        throw new Error(`${capability.id} expected generated test ${expected.file} to include ${JSON.stringify(expected.text)}.`);
      }
    }

    const artifacts: GeneratedTestsArtifacts = {
      testDir,
      clientDir: project.clientDir,
      gatewayDir: project.gatewayDir,
      openapiFile: project.openapiFile,
      catalogFile: project.catalogFile,
      compiled: project.compiled,
      readTestFile: (relativePath: string) => readFileUnder(testDir, relativePath),
    };

    await capability.generatedTests.assert?.(artifacts);
  } finally {
    rmSync(outDir, {recursive: true, force: true});
  }
}

export async function runAppCase(capability: CapabilityCase): Promise<void> {
  if (!capability.app) {
    throw new Error(`${capability.id} has no app expectation.`);
  }

  if (capability.compile.outcome !== "success") {
    throw new Error(`${capability.id} cannot run app evidence without successful compile evidence.`);
  }

  const outDir = createConformanceTempDir(capability, "app");
  const appDir = join(outDir, "app");

  try {
    const project = await generateGatewayProject(capability, outDir);

    await generateApp({
      appDir,
      clientDir: project.clientDir,
      gatewayDir: project.gatewayDir,
      openapiFile: project.openapiFile,
      catalogFile: project.catalogFile,
      imports: "js",
      force: true,
    });

    runTypeScript(appDir, join(appDir, "tsconfig.json"));

    for (const expected of capability.app.sourceIncludes ?? []) {
      const source = readFileUnder(appDir, expected.file);
      if (!source.includes(expected.text)) {
        throw new Error(`${capability.id} expected app ${expected.file} to include ${JSON.stringify(expected.text)}.`);
      }
    }

    const artifacts: AppArtifacts = {
      appDir,
      clientDir: project.clientDir,
      gatewayDir: project.gatewayDir,
      openapiFile: project.openapiFile,
      catalogFile: project.catalogFile,
      compiled: project.compiled,
      readAppFile: (relativePath: string) => readFileUnder(appDir, relativePath),
    };

    await capability.app.assert?.(artifacts);
  } finally {
    rmSync(outDir, {recursive: true, force: true});
  }
}

async function compileSuccess(capability: CapabilityCase, outDir: string): Promise<CompiledCatalog> {
  const fixturePath = fixturePathFor(capability);
  validateConformanceFixtureGraph(fixturePath);
  const wsdlCatalog = await loadWsdl(fixturePath);
  const options = resolveCompilerOptions(
    capability.compilerOptions ?? {},
    {
      wsdl: fixturePath,
      out: outDir,
    },
  );

  return compileCatalog(wsdlCatalog, options);
}

function createConformanceTempDir(capability: CapabilityCase, stage: string): string {
  mkdirSync(conformanceTempRoot, {recursive: true});
  return mkdtempSync(join(conformanceTempRoot, `${capability.id}-${stage}-`));
}

function writePackageJson(outDir: string): void {
  writeFileSync(
    join(outDir, "package.json"),
    JSON.stringify({type: "module"}, null, 2),
    "utf8",
  );
}

function writeGeneratedTsconfig(outDir: string, includeGateway: boolean): void {
  const tsconfig = {
    compilerOptions: {
      strict: true,
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      resolveJsonModule: true,
      verbatimModuleSyntax: true,
      skipLibCheck: true,
      esModuleInterop: true,
      ignoreDeprecations: "6.0",
      types: ["node"],
      noEmit: true,
    },
    include: includeGateway
      ? ["client/**/*.ts", "gateway/**/*.ts"]
      : ["client/**/*.ts"],
  };

  writeFileSync(
    join(outDir, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2),
    "utf8",
  );
}

async function generateGatewayProject(capability: CapabilityCase, outDir: string): Promise<{
  clientDir: string;
  gatewayDir: string;
  openapiFile: string;
  catalogFile: string;
  compiled: CompiledCatalog;
  doc: any;
}> {
  const clientDir = join(outDir, "client");
  const gatewayDir = join(outDir, "gateway");
  const openapiFile = join(outDir, "openapi.json");
  const catalogFile = join(clientDir, "catalog.json");
  const compiled = await compileSuccess(capability, outDir);
  const clientFiles = {
    client: join(clientDir, "client.ts"),
    operations: join(clientDir, "operations.ts"),
    types: join(clientDir, "types.ts"),
    utils: join(clientDir, "utils.ts"),
  };

  mkdirSync(clientDir, {recursive: true});
  writePackageJson(outDir);
  generateClient(clientFiles.client, compiled);
  generateTypes(clientFiles.types, compiled);
  generateUtils(clientFiles.utils, compiled);
  generateOperations(clientFiles.operations, compiled);
  generateCatalog(catalogFile, compiled);

  const result = await generateOpenAPI({
    compiledCatalog: compiled,
    format: "json",
    outFile: openapiFile,
    skipValidate: false,
  });

  await generateGateway({
    openapiFile,
    outDir: gatewayDir,
    clientDir,
    catalogFile,
    versionSlug: "v1",
    serviceSlug: "conformance",
    clientClassName: deriveClientName(compiled),
  });

  writeGeneratedTsconfig(outDir, true);
  runTypeScript(outDir, join(outDir, "tsconfig.json"));

  return {
    clientDir,
    gatewayDir,
    openapiFile,
    catalogFile,
    compiled,
    doc: result.doc,
  };
}

function runTypeScript(cwd: string, projectFile: string): void {
  try {
    execFileSync(
      process.execPath,
      [require.resolve("typescript/bin/tsc"), "-p", projectFile],
      {cwd, encoding: "utf8", stdio: "pipe"},
    );
  } catch (error) {
    const typed = error as {stdout?: string; stderr?: string};
    throw new Error(`Generated TypeScript check failed:\n${typed.stdout ?? ""}${typed.stderr ?? ""}`);
  }
}

function runGeneratedVitest(cwd: string, configFile: string): void {
  let output: string;
  try {
    output = execFileSync(
      process.execPath,
      [join(dirname(require.resolve("vitest/package.json")), "vitest.mjs"), "run", "--config", configFile, "--reporter=json"],
      {cwd, encoding: "utf8", stdio: "pipe"},
    );
  } catch (error) {
    const typed = error as {stdout?: string; stderr?: string; message?: string};
    throw new Error(`Generated Vitest check failed:\n${typed.stdout ?? ""}${typed.stderr ?? typed.message ?? ""}`);
  }

  const jsonStart = output.indexOf("{");
  const parsed = JSON.parse(output.slice(jsonStart)) as {success?: boolean; numFailedTests?: number};
  if (!parsed.success || parsed.numFailedTests !== 0) {
    throw new Error(`Generated Vitest reported failures:\n${output}`);
  }
}

function routeFor(doc: any, operationId: string): {method: string; path: string} {
  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem as Record<string, any>)) {
      if ((operation as any).operationId === operationId) {
        return {method, path};
      }
    }
  }

  throw new Error(`Expected OpenAPI operation ${operationId}.`);
}

function assertNames(label: string, expected: string[] | undefined, actual: string[]): void {
  for (const name of expected ?? []) {
    if (!actual.includes(name)) {
      throw new Error(`Expected ${label} ${name}; actual ${label}s: ${actual.join(", ")}`);
    }
  }
}

function assertDiagnosticNotes(expected: string[] | undefined, actual: string[]): void {
  for (const note of expected ?? []) {
    if (!actual.some(actualNote => actualNote.includes(note))) {
      throw new Error(`Expected diagnostic note containing ${JSON.stringify(note)}; actual notes: ${actual.join(", ")}`);
    }
  }
}

function assertExpectedError(capability: CapabilityCase, error: unknown): void {
  if (capability.compile.outcome !== "error") {
    throw error;
  }

  if (capability.compile.errorClass === "WsdlCompilationError" && !(error instanceof WsdlCompilationError)) {
    throw new Error(`${capability.id} expected WsdlCompilationError but received ${String(error)}`);
  }

  if (!(error instanceof Error)) {
    throw new Error(`${capability.id} expected an Error but received ${String(error)}`);
  }

  for (const part of capability.compile.messageIncludes ?? []) {
    if (!error.message.includes(part)) {
      throw new Error(`${capability.id} expected error message to include ${JSON.stringify(part)}.`);
    }
  }

  if (error instanceof WsdlCompilationError) {
    for (const part of capability.compile.userMessageIncludes ?? []) {
      if (!error.toUserMessage().includes(part)) {
        throw new Error(`${capability.id} expected user message to include ${JSON.stringify(part)}.`);
      }
    }

    for (const [key, value] of Object.entries(capability.compile.context ?? {})) {
      if (error.context[key as keyof typeof error.context] !== value) {
        throw new Error(`${capability.id} expected error context ${key} to equal ${JSON.stringify(value)}.`);
      }
    }
  }
}
