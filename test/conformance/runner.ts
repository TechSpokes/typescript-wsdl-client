import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {generateClient} from "../../src/client/generateClient.js";
import {generateOperations} from "../../src/client/generateOperations.js";
import {generateTypes} from "../../src/client/generateTypes.js";
import {generateUtils} from "../../src/client/generateUtils.js";
import {resolveCompilerOptions} from "../../src/config.js";
import {compileCatalog, type CompiledCatalog} from "../../src/compiler/schemaCompiler.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";
import {generateOpenAPI} from "../../src";
import {WsdlCompilationError} from "../../src/util/errors.js";
import type {CapabilityCase} from "./types.js";

const require = createRequire(import.meta.url);
const conformanceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(conformanceDir, "..", "..");

export function fixturePathFor(capability: CapabilityCase): string {
  return resolve(conformanceDir, "fixtures", capability.fixture);
}

export async function runCompileCase(capability: CapabilityCase): Promise<void> {
  const fixturePath = fixturePathFor(capability);
  if (!existsSync(fixturePath)) {
    throw new Error(`Missing conformance fixture for ${capability.id}: ${fixturePath}`);
  }

  if (capability.compile.outcome === "research") {
    return;
  }

  const outDir = mkdtempSync(join(tmpdir(), `wsdl-conformance-${capability.id}-`));

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

  const outDir = mkdtempSync(join(tmpdir(), `wsdl-conformance-${capability.id}-client-`));
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
    generateClient(files.client, compiled);
    generateTypes(files.types, compiled);
    generateUtils(files.utils, compiled);
    generateOperations(files.operations, compiled);
    writeClientTsconfig(outDir);
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

  const outDir = mkdtempSync(join(tmpdir(), `wsdl-conformance-${capability.id}-openapi-`));
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

async function compileSuccess(capability: CapabilityCase, outDir: string): Promise<CompiledCatalog> {
  const fixturePath = fixturePathFor(capability);
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

function writeClientTsconfig(outDir: string): void {
  writeFileSync(
    join(outDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          skipLibCheck: true,
          esModuleInterop: true,
          ignoreDeprecations: "6.0",
          baseUrl: repoRoot,
          paths: {
            soap: ["node_modules/soap"],
          },
          typeRoots: [join(repoRoot, "node_modules", "@types")],
          types: ["node"],
          noEmit: true,
        },
        include: ["client/**/*.ts"],
      },
      null,
      2,
    ),
    "utf8",
  );
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
    throw new Error(`Generated client TypeScript check failed:\n${typed.stdout ?? ""}${typed.stderr ?? ""}`);
  }
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
