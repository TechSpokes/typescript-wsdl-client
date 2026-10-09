export class CatalogError extends Error {
  constructor(readonly category: "incompatible-artifact" | "invalid-schema" | "resource-limit", message: string, readonly field?: string) {
    super(message); this.name = "CatalogError";
  }
}
export const DEFAULT_CATALOG_BYTES = 64 * 1024 * 1024;
export const DEFAULT_CATALOG_DEPTH = 1024;
export type CatalogLimits = {maxBytes?: number; maxDepth?: number; maxNodes?: number};

/** Property ordering is display ordering; array ordering always remains semantic. */
export function canonicalJson(value: unknown): string {
  const order = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(order);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().filter(k => (v as Record<string, unknown>)[k] !== undefined).map(k => [k, order((v as Record<string, unknown>)[k])]));
    return v;
  };
  return JSON.stringify(order(value));
}

export function positiveLimit(value: number | undefined, fallback: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1) throw new RangeError(`${name} must be a positive safe integer`);
  return result;
}

/** Scan nesting before JSON.parse can allocate an arbitrarily deep input. */
export function parseCatalogJson(text: string, limits: CatalogLimits = {}): unknown {
  const maxBytes = positiveLimit(limits.maxBytes, DEFAULT_CATALOG_BYTES, "maxBytes");
  const maxDepth = positiveLimit(limits.maxDepth, DEFAULT_CATALOG_DEPTH, "maxDepth");
  if (maxDepth > DEFAULT_CATALOG_DEPTH) throw new RangeError(`maxDepth cannot exceed the reader safety ceiling ${DEFAULT_CATALOG_DEPTH}`);
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new CatalogError("resource-limit", `Catalog exceeds ${maxBytes} UTF-8 bytes`);
  let depth = 0, quoted = false, escaped = false, quoteStart = 0;
  const stack: {object: boolean; keys: Set<string>}[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') {
        quoted = false;
        let next = i + 1; while (/[\t\r\n ]/.test(text[next] ?? "x")) next++;
        if (text[next] === ":" && stack.at(-1)?.object) {
          let key: string;
          try {key = JSON.parse(text.slice(quoteStart, i + 1));} catch {throw new CatalogError("invalid-schema", "Catalog is not valid JSON");}
          if (stack.at(-1)!.keys.has(key)) throw new CatalogError("invalid-schema", "Catalog contains duplicate object fields");
          stack.at(-1)!.keys.add(key);
        }
      }
    } else if (char === '"') {quoted = true; quoteStart = i;}
    else if (char === "{" || char === "[") {
      if (++depth > maxDepth) throw new CatalogError("resource-limit", `Catalog exceeds nesting depth ${maxDepth}`);
      stack.push({object: char === "{", keys: new Set()});
    }
    else if (char === "}" || char === "]") {depth--; stack.pop();}
  }
  try { return JSON.parse(text); } catch { throw new CatalogError("invalid-schema", "Catalog is not valid JSON"); }
}
