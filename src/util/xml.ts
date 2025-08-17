/** Normalize a possibly-single value into an array. */
export function normalizeArray<T>(x: T | T[] | undefined | null): T[] {
    if (x == null) return [];
    return Array.isArray(x) ? x : [x];
}

/** Collect direct children whose LOCAL name matches (prefix-agnostic). */
export function getChildrenWithLocalName(node: any, local: string): any[] {
    const out: any[] = [];
    for (const [k, v] of Object.entries(node || {})) {
        if (k === local || k.endsWith(`:${local}`)) {
            const arr = Array.isArray(v) ? v : [v];
            out.push(...arr.filter(Boolean));
        }
    }
    return out;
}

/** Return the first direct child whose LOCAL name matches (prefix-agnostic). */
export function getFirstWithLocalName(node: any, local: string): any | undefined {
    for (const [k, v] of Object.entries(node || {})) {
        if (k === local || k.endsWith(`:${local}`)) return v;
    }
    return undefined;
}

/** Simple PascalCase helper used across emitters/parsers. */
export function pascal(s: string): string {
    return s.replace(/(^|[_\-\s])(\w)/g, (_, __, c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, "");
}

export function resolveQName(
  qname: string,
  defaultNS: string,
  prefixes: Record<string, string>
): { ns: string; local: string } {
  if (!qname) return { ns: defaultNS, local: "" };
  const parts = qname.split(":");
  if (parts.length === 2) {
    const [prefix, local] = parts;
    const ns = prefixes[prefix] || defaultNS;
    return { ns, local };
  }
  return { ns: defaultNS, local: qname };
}

