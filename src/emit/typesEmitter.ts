import fs from "node:fs";
import type {CompiledCatalog, CompiledType} from "../compiler/schemaCompiler.js";

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
  const isValidIdent = (name: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
  const emitPropName = (name: string) => (isValidIdent(name) ? name : JSON.stringify(name));

  //
  // 1) Named simple types (aliases) first
  //
  // sort aliases by name to ensure consistent order
  compiled.aliases.sort((a, b) => a.name.localeCompare(b.name));
  for (const a of compiled.aliases) {
    const ann = a.jsdoc ? `/** @xsd ${a.jsdoc} */\n` : "";
    lines.push(`${ann}export type ${a.name} = ${a.tsType};`);
    lines.push("");
  }

  //
  // 2) Complex types as interfaces
  //
  // sort types by name to ensure consistent order
  compiled.types.sort((a, b) => a.name.localeCompare(b.name));
  for (const t of compiled.types) {
    // Detect complexContent extension via compiled metadata or mis-mapped simpleContent extension
    const complexBase = (t as any).base as string | undefined;
    // Detect mis-mapped simpleContent extension: single "$value" whose tsType is another named interface
    const valueElems = (t.elems || []).filter(
      (e) =>
        e.name === "$value" &&
        (e.max === 1 || e.max === undefined) &&
        typeof e.tsType === "string" &&
        typeNames.has(e.tsType as string)
    );
    const isSimpleContentExtension = !complexBase && (t.elems?.length || 0) === 1 && valueElems.length === 1;
    const baseName = complexBase ?? (isSimpleContentExtension ? (valueElems[0].tsType as string) : undefined);

    // Header: extend base type if applicable
    if (baseName) {
      lines.push(`export interface ${t.name} extends ${baseName} {`);
    } else {
      lines.push(`export interface ${t.name} {`);
    }

    // Prepare lists: for complexContent extension use only local additions
    const attrsToEmit: CompiledType["attrs"] = complexBase ? ((t as any).localAttrs || []) : (t.attrs || []);
    // Elements list similar
    let elementsToEmit: CompiledType["elems"] = complexBase ? ((t as any).localElems || []) : (t.elems || []);
    // SimpleContent extension special handling drops synthetic $value
    if (isSimpleContentExtension && !complexBase) {
      const idx = elementsToEmit.findIndex(e => e.name === "$value");
      if (idx >= 0) elementsToEmit.splice(idx, 1);
    }
    //
    // Attributes — with JSDoc on every attribute
    //
    if (0 < attrsToEmit.length) {
      // add attributes header comment
      lines.push("");
      lines.push("  /**");
      lines.push((1 === t.attrs.length) ? "   * Attribute." : "   * Attributes.");
      lines.push("   */");

      // Sort the elements with the following logic: required first (sorted a-z), then optional (sorted a-z)
      attrsToEmit.sort((a, b) => {
        // Required attributes come before optional attributes
        if (a.use === "required" && b.use !== "required") return -1; // `a` is required, b is optional
        if (a.use !== "required" && b.use === "required") return 1;  // `a` is optional, b is required

        // Within the same group (required or optional), sort alphabetically
        return a.name.localeCompare(b.name);
      });
    }
    for (const a of attrsToEmit) {
      const opt = a.use === "required" ? "" : "?";
      const annObj = {
        kind: "attribute" as const,
        type: a.declaredType,
        use: a.use || "optional",
      };
      const ann = `  /** @xsd ${JSON.stringify(annObj)} */`;
      lines.push("");
      lines.push(ann);
      lines.push(`  ${emitPropName(a.name)}${opt}: ${a.tsType};`);
    }

    //
    // Elements — with JSDoc on every element
    //
    // elementsToEmit already prepared above

    if (0 < elementsToEmit.length) {
      // add elements header comment
      lines.push("");
      lines.push("  /**");
      lines.push((1 === elementsToEmit.length) ? "   * Child element." : "   * Children elements.");
      lines.push("   */");

      // Sort the elements with the following logic: required first (sorted a-z), then optional (sorted a-z), and finally "$value" if present.
      elementsToEmit.sort((a, b) => {
        // Special case: $value is always last
        if (a.name === "$value") return 1;
        if (b.name === "$value") return -1;

        // Required elements come before optional elements
        if (a.min !== 0 && b.min === 0) return -1; // `a` is required, b is optional
        if (a.min === 0 && b.min !== 0) return 1;  // `a` is optional, b is required

        // Within the same group (required or optional), sort alphabetically
        return a.name.localeCompare(b.name);
      });
    }

    for (const e of elementsToEmit) {
      const isArray = e.max === "unbounded" ||  (e.max > 1);
      const arr = isArray ? "[]" : "";
      const opt = (e.min ?? 0) === 0 ? "?" : "";
      const annObj = {
        // if a.name === "$value", the kind should be "scalar value"
        kind: e.name === "$value" ? "scalar value" : "element" as const,
        type: e.declaredType,
        occurs: {min: e.min, max: e.max, nillable: e.nillable ?? false},
      };
      // if the a.name === "$value" and we have more child elements, add an empty line before the annotation
      if ((e.name === "$value") && (1 < elementsToEmit.length)) {
        lines.push("");
      }
      const ann = `  /** @xsd ${JSON.stringify(annObj)} */`;
      lines.push("");
      lines.push(ann);
      lines.push(`  ${emitPropName(e.name)}${opt}: ${e.tsType}${arr};`);
    }

    lines.push("}");
    lines.push("");
  }

  fs.writeFileSync(outFile, lines.join("\n"), "utf8");
}
