import fs from "node:fs";
import type { CompiledCatalog } from "../compiler/schemaCompiler.js";

/**
 * Emit TypeScript types from a compiled XSD catalog.
 *
 * - Text node is modeled as "$value" (not "value") to avoid collisions with real elements.
 * - xs:complexType + xs:simpleContent/extension is flattened to `extends <BaseType>`.
 * - All properties (attributes and elements) include @xsd JSDoc.
 * - If a "$value" element is present, it is emitted last.
 */
export function emitTypes(outFile: string, compiled: CompiledCatalog) {
  const lines: string[] = [];

  // Convenience lookups
  const typeNames = new Set(compiled.types.map((t) => t.name));

  //
  // 1) Named simple types (aliases) first
  //
  for (const a of compiled.aliases) {
    const ann = a.jsdoc ? `  /** @xsd ${a.jsdoc} */\n` : "";
    lines.push(`${ann}export type ${a.name} = ${a.tsType};`);
    lines.push("");
  }

  //
  // 2) Complex types as interfaces
  //
  for (const t of compiled.types) {
    // Detect mis-mapped simpleContent extension:
    //   single "$value" whose tsType is another named interface ⇒ extend that interface
    const valueElems = (t.elems || []).filter(
      (e) =>
        e.name === "$value" &&
        (e.max === 1 || e.max === undefined) &&
        typeof e.tsType === "string" &&
        typeNames.has(e.tsType as string)
    );

    const isSimpleContentExtension =
      (t.elems?.length || 0) === 1 && valueElems.length === 1;

    const baseName = isSimpleContentExtension ? (valueElems[0].tsType as string) : undefined;

    // Header
    if (baseName) {
      lines.push(`export interface ${t.name} extends ${baseName} {`);
    } else {
      lines.push(`export interface ${t.name} {`);
    }

    //
    // Attributes — with JSDoc on every attribute
    //
    for (const a of t.attrs || []) {
      const opt = a.use === "required" ? "" : "?";
      const annObj = {
        kind: "attribute" as const,
        type: a.declaredType,
        use: a.use || "optional",
      };
      const ann = `  /** @xsd ${JSON.stringify(annObj)} */`;
      lines.push(ann);
      lines.push(`  ${a.name}${opt}: ${a.tsType};`);
    }

    //
    // Elements — with JSDoc on every element
    //
    const elementsToEmit = [...(t.elems || [])];

    // If we detected simpleContent extension, drop the synthetic $value (we're extending instead).
    if (isSimpleContentExtension) {
      const idx = elementsToEmit.findIndex((e) => e.name === "$value");
      if (idx >= 0) elementsToEmit.splice(idx, 1);
    }

    // Ensure "$value" is last if present
    elementsToEmit.sort((a, b) => {
      if (a.name === "$value" && b.name !== "$value") return 1;
      if (a.name !== "$value" && b.name === "$value") return -1;
      return 0;
    });

    for (const e of elementsToEmit) {
      const isArray =
        e.max === "unbounded" ||
        (typeof e.max === "number" && e.max > 1);
      const arr = isArray ? "[]" : "";
      const opt = (e.min ?? 0) === 0 ? "?" : "";
      const annObj = {
        kind: "element" as const,
        type: e.declaredType,
        occurs: { min: e.min, max: e.max, nillable: e.nillable ?? false },
      };
      const ann = `  /** @xsd ${JSON.stringify(annObj)} */`;
      lines.push(ann);
      lines.push(`  ${e.name}${opt}: ${e.tsType}${arr};`);
    }

    lines.push("}");
    lines.push("");
  }

  fs.writeFileSync(outFile, lines.join("\n"), "utf8");
}
