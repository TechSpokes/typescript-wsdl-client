/**
 * Helpers to load wsdl-tsc's own runtime modules as source text, for embedding
 * into generated client and gateway output.
 *
 * The runtime modules live at `src/runtime/*.ts` and are published alongside
 * `dist/` via the `files` field in package.json. Resolving via
 * `import.meta.url` works both in dev (tsx runs the .ts directly from src/) and
 * in a published install (generator code lives under dist/, and `../../src/runtime/…`
 * climbs to the package root where the source .ts files sit beside `dist/`).
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const HEADER = (sourceName: string) => `// -----------------------------------------------------------------------------
// Embedded from @techspokes/typescript-wsdl-client runtime (${sourceName}).
// This file is generated output — do not edit; regenerate via wsdl-tsc.
// -----------------------------------------------------------------------------
`;

function resolveRuntimeSourcePath(filename: string): string {
  // Walk candidates in order: dev layout (src/util -> src/runtime),
  // then published layout (dist/util -> ../src/runtime), then package root.
  const candidates = [
    path.resolve(MODULE_DIR, "..", "runtime", filename),
    path.resolve(MODULE_DIR, "..", "..", "src", "runtime", filename),
    path.resolve(MODULE_DIR, "..", "..", "..", "src", "runtime", filename),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `Could not locate runtime source "${filename}". Looked in:\n${candidates.join("\n")}`,
  );
}

export function loadRuntimeSource(filename: string): string {
  const abs = resolveRuntimeSourcePath(filename);
  const raw = fs.readFileSync(abs, "utf-8");
  return HEADER(filename) + "\n" + raw;
}
