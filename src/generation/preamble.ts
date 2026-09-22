/**
 * Resolves trusted packaged TypeScript preambles by logical artifact scope.
 * @since 1.1.0
 * @constraints Resource content is validated by package tooling, without a runtime TypeScript dependency.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const packagedRoot = fileURLToPath(new URL("../../src/generation/preambles/", import.meta.url));

/**
 * Creates an internal resolver with an isolated cache for immutable resources.
 * @param root - Absolute resource root; production uses only the module-relative packaged root.
 * @returns Resolver selecting the nearest nonempty preamble, never concatenating resources.
 * @throws If a scope is unsafe or a required/selected resource cannot be read.
 */
export function createPreambleResolver(root: string = packagedRoot): (artifact: string) => string {
  const absoluteRoot = path.resolve(root);
  const cache = new Map<string, string>();
  function readResource(file: string, optional: boolean): string | undefined {
    try {
      if (!fs.statSync(file).isFile()) throw new Error("Resource is not a regular file");
      const content = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
      if (!content.trim()) throw new Error("Resource is empty");
      return content;
    } catch (cause) {
      if (optional && (cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error(`Could not load TypeScript preamble ${file}: ${cause instanceof Error ? cause.message : String(cause)}`, {cause});
    }
  }
  return (artifact: string): string => {
    if (!/^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)*$/.test(artifact)) {
      throw new Error(`Invalid preamble artifact scope: ${artifact}`);
    }
    const cached = cache.get(artifact);
    if (cached !== undefined) return cached;
    const rootFile = path.join(absoluteRoot, "typescript.preamble");
    const fallback = cache.get("") ?? readResource(rootFile, false)!;
    cache.set("", fallback);
    const segments = artifact.split("/");
    while (segments.length > 0) {
      const selected = readResource(path.join(absoluteRoot, ...segments, "typescript.preamble"), true);
      if (selected !== undefined) {
        cache.set(artifact, selected);
        return selected;
      }
      segments.pop();
    }
    cache.set(artifact, fallback);
    return fallback;
  };
}

export const resolvePreamble = createPreambleResolver();

/**
 * Prefixes a fresh complete source body, preserving its shebang and remaining bytes.
 * @param body - Generator body, not an existing output file.
 * @param preamble - Validated comment-only resource.
 * @returns BOM-free source with one supplied preamble and a separating blank line.
 * @constraints Embedded fragments must not pass through this composer separately.
 */
export function composeGeneratedSource(body: string, preamble: string): string {
  const source = body.replace(/^\uFEFF/, "");
  const header = preamble.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\n+$/, "") + "\n\n";
  if (!source.startsWith("#!")) return header + source;
  const shebang = source.match(/^#![^\r\n]*(?:\r\n|\r|\n|$)/)![0];
  const separator = /[\r\n]$/.test(shebang) ? "" : "\n";
  return shebang + separator + header + source.slice(shebang.length);
}
