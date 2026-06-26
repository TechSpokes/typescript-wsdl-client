/**
 * TypeScript Types Generator
 *
 * This module is responsible for transforming the compiled WSDL catalog into TypeScript
 * type definitions. It generates interfaces for complex types and type aliases for
 * simple types, handling features such as:
 *
 * - XML attribute flattening (attributes and elements as peer properties)
 * - Text content as "$value" property
 * - Type inheritance (extends) for complexContent extensions
 * - Proper JSDoc annotations for XML metadata
 * - Consistent property ordering and interface structuring
 * - Optional/required markers based on XML schema requirements
 */
import fs from "node:fs";
import type {CompiledCatalog, CompiledChoiceBranch, CompiledChoiceGroup, CompiledType} from "../compiler/schemaCompiler.js";
import {error} from "../util/cli.js";
import {hasAttributeWildcards, wildcardAttributeBagName} from "../util/attributeWildcards.js";

/**
 * Generates TypeScript interfaces and type aliases from a compiled WSDL catalog
 *
 * This function generates a TypeScript file containing all the types required to
 * work with the SOAP service, including:
 *
 * - Type aliases for simple types (enums, restrictions, etc.)
 * - Interfaces for complex types with proper inheritance
 * - JSDoc annotations with XML metadata for runtime marshaling
 *
 * Key design decisions:
 * - Text node is modeled as "$value" (not "value") to avoid collisions with real elements
 * - xs:complexType + xs:simpleContent/extension is flattened to `extends <BaseType>`
 * - All properties (attributes and elements) include @xsd JSDoc
 * - If a "$value" element is present, it is emitted last
 *
 * @param {string} outFile - Path to the output TypeScript file
 * @param {CompiledCatalog} compiled - The compiled WSDL catalog
 */
export function generateTypes(outFile: string, compiled: CompiledCatalog) {
  const lines: string[] = [];
  const normalizeDocLines = (text: string): string[] =>
    String(text)
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.replace(/\*\//g, "*\\/"));
  const emitDocBlock = (indent: string, docText?: string, xsdTag?: string) => {
    if (!docText && !xsdTag) {
      return;
    }
    lines.push(`${indent}/**`);
    if (docText) {
      for (const line of normalizeDocLines(docText)) {
        lines.push(`${indent} * ${line}`);
      }
    }
    if (xsdTag) {
      if (docText) {
        lines.push(`${indent} *`);
      }
      lines.push(`${indent} * @xsd ${xsdTag}`);
    }
    lines.push(`${indent} */`);
  };

  // Convenience lookups
  const typeNames = new Set(compiled.types.map((t) => t.name));
  const aliasNames = new Set(compiled.aliases.map((a) => a.name));
  const isValidIdent = (name: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
  const emitPropName = (name: string) => (isValidIdent(name) ? name : JSON.stringify(name));
  type ElementParticle = CompiledType["elems"][number] | CompiledChoiceBranch;
  const isChoiceUnionMode = compiled.options.choice === "union";
  const wildcardBagName = wildcardAttributeBagName(compiled.options);
  const elementType = (e: ElementParticle): string => {
    const isArray = e.max === "unbounded" || (e.max > 1);
    return `${e.tsType}${isArray ? "[]" : ""}`;
  };
  const elementOptionalMarker = (e: ElementParticle): string =>
    (compiled.options.nillableAsOptional && e.nillable) || (e.min ?? 0) === 0 ? "?" : "";
  const emitElementProperty = (
    indent: string,
    e: ElementParticle,
    options: {optionalMarker?: string; tsType?: string} = {},
  ) => {
    const annObj = {
      kind: e.name === "$value" ? "scalar value" : "element" as const,
      type: e.declaredType,
      occurs: {min: e.min, max: e.max, nillable: e.nillable ?? false},
    };
    lines.push("");
    if (e.doc) {
      emitDocBlock(indent, e.doc, JSON.stringify(annObj));
    } else {
      lines.push(`${indent}/** @xsd ${JSON.stringify(annObj)} */`);
    }
    lines.push(`${indent}${emitPropName(e.name)}${options.optionalMarker ?? elementOptionalMarker(e)}: ${options.tsType ?? elementType(e)};`);
  };
  const sortElementsForEmit = (elements: ElementParticle[]) => {
    elements.sort((a, b) => {
      if (a.name === "$value") return 1;
      if (b.name === "$value") return -1;
      if (a.min !== 0 && b.min === 0) return -1;
      if (a.min === 0 && b.min !== 0) return 1;
      return a.name.localeCompare(b.name);
    });
  };
  const sortAttributesForEmit = (attrs: CompiledType["attrs"]) => {
    attrs.sort((a, b) => {
      if (a.use === "required" && b.use !== "required") return -1;
      if (a.use !== "required" && b.use === "required") return 1;
      return a.name.localeCompare(b.name);
    });
  };
  const emitAttributeProperty = (indent: string, a: CompiledType["attrs"][number]) => {
    const opt = a.use === "required" ? "" : "?";
    const annObj = {
      kind: "attribute" as const,
      type: a.declaredType,
      use: a.use || "optional",
    };
    lines.push("");
    if (a.doc) {
      emitDocBlock(indent, a.doc, JSON.stringify(annObj));
    } else {
      lines.push(`${indent}/** @xsd ${JSON.stringify(annObj)} */`);
    }
    lines.push(`${indent}${emitPropName(a.name)}${opt}: ${a.tsType};`);
  };
  const emitWildcardAttributeBagProperty = (indent: string) => {
    const annObj = {
      kind: "attributeWildcard" as const,
      type: "xs:anyAttribute",
    };
    lines.push("");
    lines.push(`${indent}/** @xsd ${JSON.stringify(annObj)} */`);
    lines.push(`${indent}${emitPropName(wildcardBagName)}?: Record<string, string>;`);
  };
  const isSyntheticAliasSelfWrapper = (t: CompiledType): boolean => {
    const elems = t.elems || [];
    return aliasNames.has(t.name) &&
      (t.attrs || []).length === 0 &&
      elems.length === 1 &&
      elems[0].name === "$value" &&
      elems[0].tsType === t.name;
  };

  //
  // 1) Named simple types (aliases) first
  //
  // sort aliases by name to ensure consistent order
  compiled.aliases.sort((a, b) => a.name.localeCompare(b.name));
  for (const a of compiled.aliases) {
    if (a.doc) {
      emitDocBlock("", a.doc, a.jsdoc);
      lines.push(`export type ${a.name} = ${a.tsType};`);
    } else {
      const ann = a.jsdoc ? `/** @xsd ${a.jsdoc} */\n` : "";
      lines.push(`${ann}export type ${a.name} = ${a.tsType};`);
    }
    lines.push("");
  }

  //
  // 2) Complex types as interfaces
  //
  // sort types by name to ensure consistent order
  compiled.types.sort((a, b) => a.name.localeCompare(b.name));
  for (const t of compiled.types) {
    if (isSyntheticAliasSelfWrapper(t)) {
      continue;
    }
    // Detect complexContent extension via compiled metadata or mis-mapped simpleContent extension
    const complexBase = (t as any).base as string | undefined;
    // Detect mis-mapped simpleContent extension: single "$value" whose tsType is another named interface
    const valueElems = (t.elems || []).filter(
      (e) =>
        e.name === "$value" &&
        (e.max === 1 || e.max === undefined) &&
        typeof e.tsType === "string" &&
        e.tsType !== t.name &&
        typeNames.has(e.tsType as string)
    );
    const isSimpleContentExtension = !complexBase && (t.elems?.length || 0) === 1 && valueElems.length === 1;
    const baseName = complexBase ?? (isSimpleContentExtension ? (valueElems[0].tsType as string) : undefined);

    if (t.doc) {
      emitDocBlock("", t.doc);
    }

    // Prepare lists: for complexContent extension use only local additions
    const attrsToEmit: CompiledType["attrs"] = complexBase ? ((t as any).localAttrs || []) : (t.attrs || []);
    const wildcardCarrier = complexBase
      ? {attributeWildcards: t.localAttributeWildcards}
      : {attributeWildcards: t.attributeWildcards};
    // Elements list similar
    let elementsToEmit: CompiledType["elems"] = complexBase ? ((t as any).localElems || []) : (t.elems || []);
    // SimpleContent extension special handling drops synthetic $value
    if (isSimpleContentExtension && !complexBase) {
      const idx = elementsToEmit.findIndex(e => e.name === "$value");
      if (idx >= 0) elementsToEmit.splice(idx, 1);
    }

    const choiceGroupsToEmit: CompiledChoiceGroup[] = isChoiceUnionMode
      ? (complexBase ? ((t as any).localChoiceGroups || []) : (t.choiceGroups || []))
      : [];
    if (choiceGroupsToEmit.length > 0) {
      const choiceElementNames = new Set(choiceGroupsToEmit.flatMap((group) => group.branches.map((branch) => branch.name)));
      const baseElements = elementsToEmit.filter((e) => !choiceElementNames.has(e.name));
      const baseNameForChoice = `${t.name}ChoiceBase`;
      const choiceNames = choiceGroupsToEmit.map((group) => group.name).join(" & ");
      lines.push(`export type ${t.name} = ${baseNameForChoice} & ${choiceNames};`);
      lines.push("");
      if (baseName) {
        lines.push(`export interface ${baseNameForChoice} extends ${baseName} {`);
      } else {
        lines.push(`export interface ${baseNameForChoice} {`);
      }

      if (0 < attrsToEmit.length) {
        lines.push("");
        lines.push("  /**");
        lines.push((1 === attrsToEmit.length) ? "   * Attribute." : "   * Attributes.");
        lines.push("   */");
        sortAttributesForEmit(attrsToEmit);
      }
      for (const a of attrsToEmit) {
        emitAttributeProperty("  ", a);
      }
      if (hasAttributeWildcards(wildcardCarrier)) {
        emitWildcardAttributeBagProperty("  ");
      }

      if (0 < baseElements.length) {
        lines.push("");
        lines.push("  /**");
        lines.push((1 === baseElements.length) ? "   * Child element." : "   * Children elements.");
        lines.push("   */");
        sortElementsForEmit(baseElements);
      }
      for (const e of baseElements) {
        if ((e.name === "$value") && (1 < baseElements.length)) {
          lines.push("");
        }
        emitElementProperty("  ", e);
      }
      lines.push("}");
      lines.push("");

      for (const group of choiceGroupsToEmit) {
        const branchNames = group.branches.map((branch) => branch.name);
        lines.push(`export type ${group.name} =`);
        for (const branch of group.branches) {
          lines.push("  | {");
          emitElementProperty("    ", branch);
          for (const peerName of branchNames.filter((name) => name !== branch.name)) {
            lines.push("");
            lines.push(`    ${emitPropName(peerName)}?: never;`);
          }
          lines.push("  }");
        }
        if (group.min === 0) {
          lines.push("  | {");
          for (const peerName of branchNames) {
            lines.push("");
            lines.push(`    ${emitPropName(peerName)}?: never;`);
          }
          lines.push("  }");
        }
        lines.push(";");
        lines.push("");
      }
      continue;
    }

    // Header: extend base type if applicable
    if (baseName) {
      lines.push(`export interface ${t.name} extends ${baseName} {`);
    } else {
      lines.push(`export interface ${t.name} {`);
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

      sortAttributesForEmit(attrsToEmit);
    }
    for (const a of attrsToEmit) {
      emitAttributeProperty("  ", a);
    }
    if (hasAttributeWildcards(wildcardCarrier)) {
      emitWildcardAttributeBagProperty("  ");
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

      sortElementsForEmit(elementsToEmit);
    }

    for (const e of elementsToEmit) {
      // if the a.name === "$value" and we have more child elements, add an empty line before the annotation
      if ((e.name === "$value") && (1 < elementsToEmit.length)) {
        lines.push("");
      }
      emitElementProperty("  ", e);
    }

    lines.push("}");
    lines.push("");
  }

  try {
    fs.writeFileSync(outFile, lines.join("\n"), "utf8");
  } catch (e) {
    error(`Failed to write types to ${outFile}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
