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

// noinspection JSUnusedGlobalSymbols
export async function compileWsdlToProject(input: { wsdl: string; outDir: string; options?: CompilerOptions }) {
    const opts = { ...defaultOptions, ...(input.options || {}) } as CompilerOptions;

    // Backward-compat: map legacy flags to primitive preferences unless explicitly provided
    const primitive = { ...(opts.primitive || {}) } as NonNullable<CompilerOptions["primitive"]>;
    if (opts.dateAs && primitive.dateAs == null) primitive.dateAs = opts.dateAs === "date" ? "Date" : "string";
    if (opts.intAs && (primitive.int64As == null || primitive.bigIntegerAs == null)) {
        const as = opts.intAs; // "number" | "string"
        if (primitive.int64As == null) primitive.int64As = as as any;
        if (primitive.bigIntegerAs == null) primitive.bigIntegerAs = as as any;
    }
    const mergedOpts: CompilerOptions = { ...opts, primitive };

    const catalog = await loadWsdl(input.wsdl);
    console.log(`Loaded WSDL: ${catalog.wsdlUri}`);

    const compiled = compileCatalog(catalog, mergedOpts);
    console.log(`Schemas discovered: ${catalog.schemas.length}`);
    console.log(`Compiled types: ${compiled.types.length}`);
    console.log(`Operations: ${compiled.operations.length}`);

    fs.mkdirSync(input.outDir, { recursive: true });
    const typesPath = path.join(input.outDir, "types.ts");
    const metaPath = path.join(input.outDir, "meta.ts");
    const opsPath = path.join(input.outDir, "operations.json");
    const clientPath = path.join(input.outDir, "client.ts");
    const runtimePath = path.join(input.outDir, "runtime.ts");

    emitTypes(typesPath, compiled);
    emitMeta(metaPath, compiled, mergedOpts);
    emitOperations(opsPath, compiled);
    emitClient(clientPath, compiled, mergedOpts);
    emitRuntime(path.join(runtimePath, "runtime.ts"));
}


// Public API re-exports for library users
export { compileCatalog } from "./compiler/schemaCompiler.js";
export type { PrimitiveOptions } from "./xsd/primitives.js";
export { xsdToTsPrimitive } from "./xsd/primitives.js";
export type { CompilerOptions } from "./config.js";
