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
    const raw = String(s ?? "");
    // Split on underscores to preserve them literally
    const segments = raw.split("_");
    const cased = segments.map(seg => {
        // Uppercase letters after common separators (start, space, dash, dot, colon, slash)
        const up = seg.replace(/(^|[-\s.:\/])([A-Za-z0-9_$])/g, (_m, _sep, c) => String(c).toUpperCase());
        // Remove disallowed identifier characters but preserve A-Z, a-z, 0-9, _ and $
        return up.replace(/[^A-Za-z0-9_$]/g, "");
    });
    let out = cased.join("_");
    if (!out) out = "_"; // fallback
    if (/^[0-9]/.test(out)) out = `_${out}`; // ensure valid identifier start

    // guard against TypeScript reserved keywords at the start of the identifier
    const reserved = [
      "break","case","catch","class","const","continue","debugger","default","delete",
      "do","else","enum","export","extends","false","finally","for","function","if",
      "import","in","instanceof","new","null","return","super","switch","this","throw",
      "true","try","typeof","var","void","while","with","as","implements","interface",
      "let","package","private","protected","public","static","yield","any","boolean",
      "constructor","declare","get","module","require","number","set","string","symbol",
      "type","from","of"
    ];
    const lower = out.toLowerCase();
    if (reserved.some(r => lower === r || lower.startsWith(r))) {
      out = `_${out}`;
    }
    return out;
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
