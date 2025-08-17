import fs from "node:fs";
import type { CompiledCatalog } from "../compiler/schemaCompiler.js";

export function emitOperations(outFile: string, compiled: CompiledCatalog) {
    fs.writeFileSync(outFile, JSON.stringify(compiled.operations, null, 2), "utf8");
}

export function emitOps(outFile: string, compiled: CompiledCatalog) {
    if (outFile.endsWith(".ts")) {
        const src = `export const OPERATIONS = ${JSON.stringify(compiled.operations, null, 2)} as const;\n`;
        fs.writeFileSync(outFile, src, "utf8");
    } else {
        emitOperations(outFile, compiled);
    }
}
