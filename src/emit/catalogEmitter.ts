import fs from "node:fs";
import type {CompiledCatalog} from "../compiler/schemaCompiler.js";

export function emitCatalog(outFile: string, compiled: CompiledCatalog) {
  try {
    fs.writeFileSync(outFile, JSON.stringify(compiled, null, 2), "utf8");
    console.log(`Catalog written to ${outFile}`);
  } catch (err) {
    console.error(`Failed to write catalog to ${outFile}:`, err);
  }
}
