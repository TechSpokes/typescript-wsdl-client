/**
 * Catalog Emitter for TypeScript WSDL Client Generator
 *
 * This module is responsible for writing the complete compiled catalog to a JSON file,
 * which serves as a structured representation of the WSDL for introspection and further
 * processing. The catalog includes all types, operations, metadata, and compilation options,
 * making it useful for:
 *
 * - Debugging the compilation process
 * - Providing input for other tools (like OpenAPI generators)
 * - Supporting runtime introspection of the service structure
 * - Enabling incremental compilation workflows
 */
import fs from "node:fs";
import type {CompiledCatalog} from "../compiler/schemaCompiler.js";

/**
 * Emits the compiled catalog as a JSON file
 *
 * This function writes the complete compiled catalog to a JSON file, preserving all
 * type definitions, operation information, and metadata in a structured format.
 * The output is useful for introspection, debugging, and as input for other tools.
 *
 * The catalog includes:
 * - All compiled types (complex types as interfaces)
 * - Type aliases (simple types)
 * - Operation definitions with input/output types
 * - Metadata for XML serialization
 * - Original compiler options
 * - Service information from the WSDL
 *
 * @param {string} outFile - Path to the output JSON file
 * @param {CompiledCatalog} compiled - The compiled WSDL catalog to write
 */
export function emitCatalog(outFile: string, compiled: CompiledCatalog) {
  try {
    fs.writeFileSync(outFile, JSON.stringify(compiled, null, 2), "utf8");
    console.log(`Catalog written to ${outFile}`);
  } catch (err) {
    console.error(`Failed to write catalog to ${outFile}:`, err);
  }
}
