/**
 * Operations Interface Generator
 *
 * Generates a fully-typed operations interface for the SOAP client.
 * This standalone interface enables mocking and testing without importing
 * the concrete SOAP client class or its runtime dependencies.
 */
import fs from "node:fs";
import type { CompiledCatalog } from "../compiler/schemaCompiler.js";
import { deriveClientName, pascal } from "../util/tools.js";
import { error } from "../util/cli.js";

/**
 * Generates an operations.ts file with a fully-typed interface for all SOAP operations
 *
 * The interface mirrors the async method signatures of the generated client class
 * but uses concrete input/output types from types.ts instead of generic parameters.
 * This enables type-safe mocking without SOAP runtime dependencies.
 *
 * @param outFile - Path to the output TypeScript file
 * @param compiled - The compiled WSDL catalog
 */
export function generateOperations(outFile: string, compiled: CompiledCatalog): void {
  const ext = compiled.options.imports ?? "bare";
  const suffix = ext === "bare" ? "" : `.${ext}`;
  const clientName = deriveClientName(compiled);

  // Collect type names used in method signatures for the import statement
  const importedTypes = new Set<string>();
  const methods: string[] = [];

  for (const op of compiled.operations) {
    const inTypeName = op.inputElement ? pascal(op.inputElement.local) : undefined;
    const outTypeName = op.outputElement ? pascal(op.outputElement.local) : undefined;

    if (!inTypeName && !outTypeName) {
      continue;
    }

    const inTs = inTypeName ?? "Record<string, unknown>";
    const outTs = outTypeName ?? "unknown";

    if (inTypeName) importedTypes.add(inTypeName);
    if (outTypeName) importedTypes.add(outTypeName);

    methods.push(
      `  ${op.name}(\n` +
      `    args: ${inTs}\n` +
      `  ): Promise<{ response: ${outTs}; headers: unknown }>;\n`
    );
  }

  // Build sorted import list for deterministic output
  const sortedImports = Array.from(importedTypes).sort();
  const typeImport = sortedImports.length > 0
    ? `import type {\n${sortedImports.map((t) => `  ${t},`).join("\n")}\n} from "./types${suffix}";\n\n`
    : "";

  const content = `/**
 * Typed operations interface for the ${clientName} service.
 *
 * Implement this interface to create mock clients or alternative
 * transport layers without depending on the SOAP runtime.
 *
 * Auto-generated - do not edit manually.
 */
${typeImport}/**
 * All operations exposed by the ${clientName} SOAP service.
 *
 * The concrete ${clientName} class satisfies this interface.
 * Use this type for dependency injection, mocking, or testing.
 */
export interface ${clientName}Operations {
${methods.join("\n")}}\n`;

  try {
    fs.writeFileSync(outFile, content, "utf8");
  } catch (e) {
    error(`Failed to write operations interface to ${outFile}`);
  }
}
