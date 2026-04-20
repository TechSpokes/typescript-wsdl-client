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
import { loadRuntimeSource } from "../util/runtimeSource.js";

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
  const normalizeDocLines = (text: string): string[] =>
    String(text)
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.replace(/\*\//g, "*\\/"));

  // Collect type names used in method signatures for the import statement
  const importedTypes = new Set<string>();
  const methods: string[] = [];
  // Does any operation opt into streaming? If so we also emit the
  // StreamOperationResponse helper type below.
  let anyStream = false;

  for (const op of compiled.operations) {
    const inTypeName = op.inputTypeName ?? (op.inputElement ? pascal(op.inputElement.local) : undefined);
    const outTypeName = op.outputTypeName ?? (op.outputElement ? pascal(op.outputElement.local) : undefined);

    if (!inTypeName && !outTypeName) {
      continue;
    }

    const inTs = inTypeName ?? "Record<string, unknown>";
    const outTs = outTypeName ?? "unknown";

    if (inTypeName) importedTypes.add(inTypeName);
    if (outTypeName) importedTypes.add(outTypeName);

    const docLines = op.doc ? normalizeDocLines(op.doc) : [];
    const docBlock = docLines.length > 0
      ? `  /**\n${docLines.map(line => `   * ${line}`).join("\n")}\n   */\n`
      : "";

    if (op.stream) {
      anyStream = true;
      const recordTs = op.stream.recordTypeName;
      importedTypes.add(recordTs);
      methods.push(
        `${docBlock}  ${op.name}(\n` +
        `    args: ${inTs}\n` +
        `  ): Promise<StreamOperationResponse<${recordTs}>>;\n`
      );
    } else {
      methods.push(
        `${docBlock}  ${op.name}(\n` +
        `    args: ${inTs}\n` +
        `  ): Promise<{ response: ${outTs}; headers: unknown }>;\n`
      );
    }
  }

  // Build sorted import list for deterministic output
  const sortedImports = Array.from(importedTypes).sort();
  const typeImport = sortedImports.length > 0
    ? `import type {\n${sortedImports.map((t) => `  ${t},`).join("\n")}\n} from "./types${suffix}";\n\n`
    : "";

  // Emit the StreamOperationResponse helper type iff at least one operation
  // is stream-configured. Kept inside operations.ts so that mocks and gateway
  // code can import it without pulling in the SOAP runtime. The raw template
  // lives in a sibling .tpl file so the IDE does not try to parse embedded
  // TypeScript type-parameter defaults (HeadersType = Record<...>) as
  // JavaScript assignment expressions.
  const streamHelper = anyStream
    ? loadRuntimeSource("operationsStreamHelper.tpl.txt").replace(/__CLIENT_NAME__/g, clientName)
    : "";

  const content = `/**
 * Typed operations interface for the ${clientName} service.
 *
 * Implement this interface to create mock clients or alternative
 * transport layers without depending on the SOAP runtime.
 *
 * Auto-generated - do not edit manually.
 */
${typeImport}${streamHelper}/**
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
