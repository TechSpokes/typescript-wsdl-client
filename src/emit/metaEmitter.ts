import fs from "node:fs";
import type { CompiledCatalog } from "../compiler/schemaCompiler.js";
import type { CompilerOptions } from "../config.js";

export function emitMeta(outFile: string, compiled: CompiledCatalog, opts?: CompilerOptions) {
    const { attrSpec, childType, propMeta } = compiled.meta;
    const src =
        `export const ATTR_SPEC = ${JSON.stringify(attrSpec, null, 2)} as const;\n` +
        `export const CHILD_TYPE = ${JSON.stringify(childType, null, 2)} as const;\n` +
        `export const PROP_META = ${JSON.stringify(propMeta, null, 2)} as const;\n` +
        `export const OPTIONS = ${JSON.stringify(opts || {}, null, 2)} as const;\n`;
    fs.writeFileSync(outFile, src, "utf8");
}
