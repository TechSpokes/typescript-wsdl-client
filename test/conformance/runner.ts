import {existsSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {resolveCompilerOptions} from "../../src/config.js";
import {compileCatalog} from "../../src/compiler/schemaCompiler.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";
import {WsdlCompilationError} from "../../src/util/errors.js";
import type {CapabilityCase} from "./types.js";

const conformanceDir = dirname(fileURLToPath(import.meta.url));

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
    const wsdlCatalog = await loadWsdl(fixturePath);
    const options = resolveCompilerOptions(
      capability.compilerOptions ?? {},
      {
        wsdl: fixturePath,
        out: outDir,
      },
    );

    if (capability.compile.outcome === "success") {
      const compiled = compileCatalog(wsdlCatalog, options);
      assertNames("type", capability.compile.typeNames, compiled.types.map(type => type.name));
      assertNames("alias", capability.compile.aliasNames, compiled.aliases.map(alias => alias.name));
      assertNames("operation", capability.compile.operationNames, compiled.operations.map(op => op.name));
      assertDiagnosticNotes(capability.compile.diagnosticNotes, compiled.diagnostics?.notes ?? []);
      capability.compile.assert?.(compiled);
      return;
    }

    try {
      compileCatalog(wsdlCatalog, options);
    } catch (error) {
      assertExpectedError(capability, error);
      return;
    }

    throw new Error(`${capability.id} expected compilation to fail.`);
  } finally {
    rmSync(outDir, {recursive: true, force: true});
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
