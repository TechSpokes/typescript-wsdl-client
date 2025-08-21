import fs from "node:fs";
import type {CompiledCatalog} from "../compiler/schemaCompiler.js";
import {deriveClientName, pascalToSnakeCase} from "../util/tools.js";

export function emitUtils(outFile: string, compiled: CompiledCatalog) {
  const clientName = deriveClientName(compiled);
  const clientConstant = pascalToSnakeCase(clientName).toUpperCase();
  const {attrSpec, childType} = compiled.meta;
  if (!attrSpec || !childType) {
    throw new Error("Metadata not found in compiled catalog. Ensure schemaCompiler runs before metaEmitter.");
  }
  if (typeof attrSpec !== "object" || typeof childType !== "object") {
    throw new Error("Invalid metadata structure. Expected objects for Attributes and ChildrenTypes.");
  }
  const metas = JSON.stringify(
    {Attributes: attrSpec, ChildrenTypes: childType},
    null,
    2
  );
  const dataTypes = `/**
 * ${clientName} WSDL data types for proper serialization/deserialization.
 * Used to distinguish between XML attributes and elements during conversion.
 */
export interface ${clientName}DataTypes {
  /** Maps type names to lists of property names that should be treated as XML attributes */
  Attributes: Record<string, readonly string[]>;
  /** Maps type names to their child element types for recursive processing */
  ChildrenTypes: Record<string, Readonly<Record<string, string>>>;
}

export const ${clientConstant}_DATA_TYPES: ${clientName}DataTypes = ${metas} as const;\n`;
  try {
    fs.writeFileSync(outFile, dataTypes, "utf8");
    console.log(`Utils written to ${outFile}`);
  } catch (e) {
    console.error(`Failed to write utils to ${outFile}:`, e);
  }
}
