/**
 * WSDL Document Loader and Schema Resolver
 *
 * This module handles the loading, parsing, and resolution of WSDL documents and their
 * associated XSD schemas. It supports both local file paths and remote URLs, recursively
 * resolving schema includes and imports to build a complete catalog of all schemas
 * referenced by the WSDL.
 *
 * The loader uses fast-xml-parser for XML parsing and handles namespace prefixes,
 * target namespaces, and schema relationships to prepare a comprehensive representation
 * for the compiler stage.
 */
import {XMLParser} from "fast-xml-parser";
import {fetchText} from "./fetch.js";
import path from "node:path";
// noinspection ES6UnusedImports
import {getChildrenWithLocalName, normalizeArray} from "../util/tools.js";

/**
 * Represents a single XSD schema document with its associated context
 *
 * @interface SchemaDoc
 * @property {string} uri - Base directory or URL path of the schema document
 * @property {any} xml - Parsed XML structure of the schema node
 * @property {string} targetNS - Target namespace of the schema
 * @property {Record<string, string>} prefixes - Namespace prefix-to-URI mapping for this schema
 */
export type SchemaDoc = {
  uri: string;          // directory/URL base of this schema document
  xml: any;             // parsed <schema> node
  targetNS: string;
  prefixes: Record<string, string>; // xmlns prefixes in scope for this schema
};

/**
 * Complete catalog of WSDL and all associated schemas
 *
 * @interface WsdlCatalog
 * @property {string} wsdlUri - URI/path of the source WSDL document
 * @property {any} wsdlXml - Parsed XML structure of the entire WSDL
 * @property {SchemaDoc[]} schemas - Array of all schema documents (from WSDL and imports)
 * @property {Record<string, string>} prefixMap - Global namespace prefix-to-URI mapping
 */
export type WsdlCatalog = {
  wsdlUri: string;
  wsdlXml: any;
  schemas: SchemaDoc[];
  prefixMap: Record<string, string>;
};

// Configure XML parser to preserve attributes with @_ prefix
const parser = new XMLParser({ignoreAttributes: false, attributeNamePrefix: "@_"});

/**
 * Loads a WSDL document from a URL or file path and resolves all associated schemas
 *
 * This function:
 * 1. Fetches and parses the WSDL document
 * 2. Extracts namespace information and target namespace
 * 3. Locates schema definitions in the WSDL types section
 * 4. Recursively resolves all schema imports and includes
 * 5. Returns a complete catalog of all schemas for compilation
 *
 * @param {string} wsdlUrlOrPath - URL or file path to the WSDL document
 * @returns {Promise<WsdlCatalog>} - Complete catalog of WSDL and schemas
 * @throws {Error} - If the document is not a valid WSDL 1.1 file
 */
export async function loadWsdl(wsdlUrlOrPath: string): Promise<WsdlCatalog> {
  // Fetch and parse the WSDL document
  const {uri: wsdlUri, text} = await fetchText(wsdlUrlOrPath);
  const wsdlXml = parser.parse(text);

  // Extract the WSDL definitions node (with or without namespace prefix)
  const defs = wsdlXml["wsdl:definitions"] || wsdlXml["definitions"];
  if (!defs) throw new Error("Not a WSDL 1.1 file: missing wsdl:definitions");

  // Extract namespace prefixes declared at the WSDL level
  const prefixMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(defs)) {
    if (k.startsWith("@_xmlns:")) prefixMap[k.slice(8)] = String(v);
  }

  // Extract target namespace from the WSDL
  const tns = (defs["@_targetNamespace"] as string) || "";

  // Locate the types section which contains schema definitions
  const types = defs["wsdl:types"] || defs["types"];
  const schemas: SchemaDoc[] = [];
  const visited = new Set<string>(); // de-dupe fetched schema docs by absolute URL/path

  if (types) {
    // Find any <xsd:schema> (prefix-agnostic) directly under wsdl:types
    const rawSchemas = getChildrenWithLocalName(types, "schema");
    const baseDir = path.dirname(wsdlUri);

    // Process each schema node, resolving imports and includes
    for (const s of rawSchemas) {
      const discovered = await resolveSchema(s, baseDir, visited);
      schemas.push(...discovered);
    }
  }

  console.log(`[wsdl] types->schemas: ${schemas.length}`);
  return {wsdlUri, wsdlXml, schemas, prefixMap: {...prefixMap, tns}};
}

/**
 * Recursively resolves a schema node and all its imports and includes
 *
 * This function processes a schema node, extracts its namespace information,
 * and recursively fetches and resolves any imported or included schemas.
 *
 * @param {any} schemaNode - The XML schema node to process
 * @param {string} baseDir - Base directory/URL for resolving relative paths
 * @param {Set<string>} visited - Set of already processed schema URIs to prevent cycles
 * @returns {Promise<SchemaDoc[]>} - Array of resolved schema documents
 */
async function resolveSchema(schemaNode: any, baseDir: string, visited: Set<string>): Promise<SchemaDoc[]> {
  const out: SchemaDoc[] = [];

  // Extract target namespace and prefix declarations
  const targetNS = schemaNode["@_targetNamespace"] || "";
  const prefixes: Record<string, string> = {};
  for (const [k, v] of Object.entries(schemaNode)) {
    if (k.startsWith("@_xmlns:")) prefixes[k.slice(8)] = String(v);
  }

  // Add this schema to the output collection
  out.push({uri: baseDir, xml: schemaNode, targetNS, prefixes});

  // Process <include> elements (schemas from same namespace)
  for (const inc of getChildrenWithLocalName(schemaNode, "include")) {
    const loc = inc?.["@_schemaLocation"];
    if (!loc) continue;
    const more = await fetchAndResolveSchemaDoc(loc, baseDir, visited);
    out.push(...more);
  }

  // Process <import> elements (schemas from different namespaces)
  for (const imp of getChildrenWithLocalName(schemaNode, "import")) {
    const loc = imp?.["@_schemaLocation"];
    if (!loc) continue;
    const more = await fetchAndResolveSchemaDoc(loc, baseDir, visited);
    out.push(...more);
  }

  return out;
}

/**
 * Fetches and resolves an external schema document
 *
 * This function fetches an external schema document from a URL or file path,
 * parses it, and recursively resolves any imports or includes it contains.
 *
 * @param {string} schemaLocation - URL or file path to the schema document
 * @param {string} baseDir - Base directory/URL for resolving relative paths
 * @param {Set<string>} visited - Set of already processed schema URIs to prevent cycles
 * @returns {Promise<SchemaDoc[]>} - Array of resolved schema documents
 */
async function fetchAndResolveSchemaDoc(schemaLocation: string, baseDir: string, visited: Set<string>): Promise<SchemaDoc[]> {
  // Fetch and parse the schema document
  const {uri, text} = await fetchText(schemaLocation, baseDir);
  const docKey = uri;

  // Skip if already processed to prevent infinite recursion
  if (visited.has(docKey)) return [];
  visited.add(docKey);

  const sx = parser.parse(text);

  // The fetched document may contain one or more <schema> nodes at the root (prefix-agnostic)
  const roots = getChildrenWithLocalName(sx, "schema");
  const docs: SchemaDoc[] = [];

  // Process each schema node in the document
  for (const sn of roots) {
    // Extract target namespace and prefix declarations
    const tns = sn["@_targetNamespace"] || "";
    const prefixes: Record<string, string> = {};
    for (const [k, v] of Object.entries(sn)) {
      if (k.startsWith("@_xmlns:")) prefixes[k.slice(8)] = String(v);
    }

    // Add this schema to the output collection
    const thisDir = path.dirname(uri);
    docs.push({uri: thisDir, xml: sn, targetNS: tns, prefixes});

    // Recursively process any imports and includes
    for (const inc of getChildrenWithLocalName(sn, "include")) {
      const loc = inc?.["@_schemaLocation"];
      if (!loc) continue;
      const more = await fetchAndResolveSchemaDoc(loc, thisDir, visited);
      docs.push(...more);
    }
    for (const imp of getChildrenWithLocalName(sn, "import")) {
      const loc = imp?.["@_schemaLocation"];
      if (!loc) continue;
      const more = await fetchAndResolveSchemaDoc(loc, thisDir, visited);
      docs.push(...more);
    }
  }
  return docs;
}
