import { defaultOptions } from "./config.js";
import type { CompilerOptions } from "./config.js";
import { loadWsdl } from "./loader/wsdlLoader.js";
import { compileCatalog } from "./compiler/schemaCompiler.js";
import { emitTypes } from "./emit/typesEmitter.js";
import { emitMeta } from "./emit/metaEmitter.js";
import { emitOperations } from "./emit/opsEmitter.js";
import { emitClient } from "./emit/clientEmitter.js";
import { emitRuntime } from "./emit/runtimeEmitter.js";
import fs from "node:fs";
import path from "node:path";

// Entry point for programmatic API: compile a WSDL into a set of TypeScript files in a project layout

// noinspection JSUnusedGlobalSymbols
export async function compileWsdlToProject(
    input: { wsdl: string; outDir: string; options?: CompilerOptions }
) {
    // Merge defaults with user overrides
    const baseOptions = { ...defaultOptions, ...(input.options || {}) } as CompilerOptions;

    // Backward compatibility: legacy flags map to the new primitive preferences if not set
    const normalizedPrimitive = { ...(baseOptions.primitive || {}) } as NonNullable<CompilerOptions["primitive"]>;
    if (baseOptions.dateAs && normalizedPrimitive.dateAs == null) {
        // dateAs legacy: choose Date or string based on flag
        normalizedPrimitive.dateAs = baseOptions.dateAs === "date" ? "Date" : "string";
    }
    if (baseOptions.intAs && (normalizedPrimitive.int64As == null || normalizedPrimitive.bigIntegerAs == null)) {
        // intAs legacy: apply to both 64-bit and big integer types
        const as = baseOptions.intAs;
        if (normalizedPrimitive.int64As == null) normalizedPrimitive.int64As = as as any;
        if (normalizedPrimitive.bigIntegerAs == null) normalizedPrimitive.bigIntegerAs = as as any;
    }
    // Final merged options including computed primitive mappings
    const finalOptions: CompilerOptions = { ...baseOptions, primitive: normalizedPrimitive };

    // Load WSDL definitions and schema catalog (remote or local file)
    const wsdlCatalog = await loadWsdl(input.wsdl);
    console.log(`Loaded WSDL: ${wsdlCatalog.wsdlUri}`);

    // Compile schemas and operations into intermediate data structures
    const compiledCatalog = compileCatalog(wsdlCatalog, finalOptions);
    console.log(`Schemas discovered: ${wsdlCatalog.schemas.length}`);
    console.log(`Compiled types: ${compiledCatalog.types.length}`);
    console.log(`Operations: ${compiledCatalog.operations.length}`);

    // Prepare output directory for generated files
    fs.mkdirSync(input.outDir, { recursive: true });
    // Define target paths
    const typesFile = path.join(input.outDir, "types.ts");
    const metaFile = path.join(input.outDir, "meta.ts");
    const opsFile = path.join(input.outDir, "operations.json");
    const clientFile = path.join(input.outDir, "client.ts");
    const runtimeFile = path.join(input.outDir, "runtime.ts");

    // Emit code artifacts: types, metadata, operations listing, client harness, runtime helpers
    emitTypes(typesFile, compiledCatalog);
    emitMeta(metaFile, compiledCatalog, finalOptions);
    emitOperations(opsFile, compiledCatalog);
    emitClient(clientFile, compiledCatalog, finalOptions);
    emitRuntime(runtimeFile);
}

// Re-export public API for library consumers
export { compileCatalog } from "./compiler/schemaCompiler.js";
export type { PrimitiveOptions } from "./xsd/primitives.js";
export { xsdToTsPrimitive } from "./xsd/primitives.js";
export type { CompilerOptions } from "./config.js";
