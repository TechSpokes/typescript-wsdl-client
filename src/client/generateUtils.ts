/**
 * TypeScript SOAP Client Utilities Generator
 *
 * This module generates utility types and constants needed for the TypeScript SOAP client
 * to properly handle XML serialization and deserialization. It creates metadata mappings
 * that enable the client to distinguish between XML attributes and child elements during
 * the conversion process between TypeScript objects and XML.
 *
 * The generated utilities include:
 * - A DataTypes interface defining the structure of the metadata
 * - A constant containing the actual metadata mappings extracted from the compiled catalog
 */
import fs from "node:fs";
import type {CompiledCatalog} from "../compiler/schemaCompiler.js";
import {deriveClientName, pascalToSnakeCase} from "../util/tools.js";
import {error} from "../util/cli.js";

/**
 * Generates utility types and constants for XML serialization/deserialization
 *
 * This function generates a TypeScript file containing metadata mappings that help
 * the SOAP client distinguish between XML attributes and child elements during
 * the conversion process. It exports:
 *
 * 1. A DataTypes interface defining the structure of the metadata
 * 2. A constant containing the actual mappings extracted from the compiled catalog
 *
 * The metadata is critical for proper XML marshaling and unmarshalling, as it enables
 * the client to correctly handle XML attributes vs. child elements, maintain type information
 * during recursive processing, and ensure that the XML structure matches the WSDL specification.
 *
 * @param {string} outFile - Path to the output TypeScript file
 * @param {CompiledCatalog} compiled - The compiled WSDL catalog containing metadata
 * @throws {Error} If metadata is missing or has an invalid structure
 */
export function generateUtils(outFile: string, compiled: CompiledCatalog) {
  const clientName = deriveClientName(compiled);
  const clientConstant = pascalToSnakeCase(clientName).toUpperCase();
  const {attrSpec, childType} = compiled.meta;
  if (!attrSpec || !childType) {
    throw new Error("Metadata not found in compiled catalog. Ensure schemaCompiler runs before generator.");
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
  } catch (e) {
    error(`Failed to write utils to ${outFile}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
