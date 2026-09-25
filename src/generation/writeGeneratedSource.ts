/**
 * Applies output policy once at the complete TypeScript file boundary.
 * @since 1.1.0
 */
import fs from "node:fs";
import {composeGeneratedSource, resolvePreamble} from "./preamble.js";

/**
 * Writes a generated TypeScript file after resolving its packaged preamble.
 * @param filePath - Destination whose parent directory already exists.
 * @param content - Fresh complete source body.
 * @param artifact - Logical scope, independent of the consumer output directory.
 * @returns Nothing.
 * @throws If resource resolution, composition, or writing fails.
 * @constraints Call only after any scaffold skip/force guard.
 */
export function writeGeneratedSource(filePath: string, content: string, artifact: string): void {
  try {
    const source = composeGeneratedSource(content, resolvePreamble(artifact));
    fs.writeFileSync(filePath, source, "utf8");
  } catch (cause) {
    throw new Error(`Failed to generate ${filePath} (${artifact} preamble): ${cause instanceof Error ? cause.message : String(cause)}`, {cause});
  }
}
