/**
 * Gateway Generation Helpers
 *
 * This module provides utility functions for generating Fastify gateway code from OpenAPI 3.1 specifications.
 * It handles slug generation, schema reference rewriting, parameter resolution, and version/service detection.
 *
 * Key capabilities:
 * - Deterministic slug generation from OpenAPI component names
 * - Schema $ref rewriting from OpenAPI references to URN-style IDs
 * - Parameter resolution with path-level and operation-level override support
 * - Automatic version/service detection from OpenAPI paths
 */

import {pascal} from "../util/tools.js";

/**
 * OpenAPI document structure (minimal type for internal use)
 */
export interface OpenAPIDocument {
  openapi: string;
  info?: any;
  paths: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
    parameters?: Record<string, any>;
  };
}

/**
 * Converts a name to a deterministic slug for use in file names and URN IDs
 *
 * Rules:
 * - Lowercase all characters
 * - Replace non-alphanumeric sequences with single underscores
 * - Strip leading/trailing underscores
 * - Collapse multiple underscores to single underscore
 *
 * @param {string} name - Original name to convert
 * @returns {string} - Slugified name
 *
 * @example
 * slugName("GetUserDetails") // "getuserdetails"
 * slugName("User-Profile_Data") // "user_profile_data"
 */
export function slugName(name: string): string {
  const lower = String(name ?? "").toLowerCase();
  const collapsed = lower.replace(/[^a-z0-9]+/g, "_");
  return collapsed.replace(/^_+|_+$/g, "");
}

/**
 * Checks if a status code string is numeric
 *
 * @param {string} code - Status code to check
 * @returns {boolean} - True if the code is numeric
 */
export function isNumericStatus(code: string): boolean {
  return /^\d+$/.test(code);
}

/**
 * Recursively rewrites all $ref properties in a schema object from OpenAPI component references
 * to URN-style schema IDs
 *
 * Contract enforcement:
 * - All $ref values must start with "#/components/schemas/"
 * - The referenced schema name must exist in schemaIdByName map
 * - Throws if unknown schema is referenced
 *
 * @param {any} node - Schema object or primitive value to process
 * @param {Record<string, string>} schemaIdByName - Map from OpenAPI component name to URN ID
 * @returns {any} - Deep clone with rewritten $ref properties
 * @throws {Error} If unknown schema reference is encountered
 */
export function rewriteSchemaRefs(node: any, schemaIdByName: Record<string, string>): any {
  if (Array.isArray(node)) {
    return node.map((v) => rewriteSchemaRefs(v, schemaIdByName));
  }
  if (node && typeof node === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string" && v.startsWith("#/components/schemas/")) {
        const name = v.slice("#/components/schemas/".length);
        const id = schemaIdByName[name];
        if (!id) {
          throw new Error(`Unknown schema reference '${name}' in $ref '${v}'`);
        }
        out["$ref"] = id + "#";
      } else {
        out[k] = rewriteSchemaRefs(v, schemaIdByName);
      }
    }
    return out;
  }
  return node;
}

/**
 * Flattens allOf compositions into a single merged schema for Fastify compatibility.
 *
 * This is necessary because fast-json-stringify cannot handle deeply nested allOf
 * compositions, especially when referenced schemas also use allOf for inheritance.
 *
 * The function:
 * - Recursively resolves $ref references within allOf members
 * - Merges properties, required arrays, and other keywords
 * - Handles circular references by keeping them as $ref
 * - Preserves anyOf/oneOf without flattening (only allOf is problematic)
 *
 * @param {any} schema - The schema to flatten
 * @param {Record<string, any>} allSchemas - All available schemas for $ref resolution
 * @param {Set<string>} [visited] - Set of visited schema names to detect circular references
 * @returns {any} - Flattened schema without allOf (or original if no allOf present)
 */
export function flattenAllOf(
  schema: any,
  allSchemas: Record<string, any>,
  visited: Set<string> = new Set()
): any {
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  // Handle arrays
  if (Array.isArray(schema)) {
    return schema.map(item => flattenAllOf(item, allSchemas, visited));
  }

  // If no allOf, recursively process nested schemas but preserve structure
  if (!schema.allOf) {
    const result: any = {};
    for (const [key, value] of Object.entries(schema)) {
      if (key === "properties" && value && typeof value === "object") {
        result[key] = {};
        for (const [propName, propSchema] of Object.entries(value as Record<string, any>)) {
          result[key][propName] = flattenAllOf(propSchema, allSchemas, visited);
        }
      } else if (key === "items" && value && typeof value === "object") {
        result[key] = flattenAllOf(value, allSchemas, visited);
      } else if ((key === "anyOf" || key === "oneOf") && Array.isArray(value)) {
        result[key] = value.map(v => flattenAllOf(v, allSchemas, visited));
      } else if (key === "additionalProperties" && value && typeof value === "object") {
        result[key] = flattenAllOf(value, allSchemas, visited);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  // Flatten allOf: merge all schemas into one
  const merged: any = {
    type: "object",
    properties: {},
  };
  const requiredSet = new Set<string>();

  for (const member of schema.allOf) {
    let resolvedMember = member;

    // Resolve $ref if present
    if (member.$ref && typeof member.$ref === "string") {
      const refPath = member.$ref;
      let schemaName: string | null = null;

      if (refPath.startsWith("#/components/schemas/")) {
        schemaName = refPath.slice("#/components/schemas/".length);
      }

      if (schemaName && allSchemas[schemaName]) {
        if (visited.has(schemaName)) {
          // Circular reference - keep the $ref as-is in properties that reference it
          continue;
        }
        const newVisited = new Set(visited);
        newVisited.add(schemaName);
        resolvedMember = flattenAllOf(allSchemas[schemaName], allSchemas, newVisited);
      } else {
        // Unknown ref - keep as-is (will be rewritten later by rewriteSchemaRefs)
        continue;
      }
    }

    // Merge properties
    if (resolvedMember.properties && typeof resolvedMember.properties === "object") {
      for (const [propName, propSchema] of Object.entries(resolvedMember.properties)) {
        merged.properties[propName] = flattenAllOf(propSchema, allSchemas, visited);
      }
    }

    // Merge required
    if (Array.isArray(resolvedMember.required)) {
      for (const req of resolvedMember.required) {
        requiredSet.add(req);
      }
    }

    // Copy other keywords (last one wins for conflicts)
    if (resolvedMember.additionalProperties !== undefined) {
      merged.additionalProperties = resolvedMember.additionalProperties;
    }
    if (resolvedMember.description !== undefined) {
      merged.description = resolvedMember.description;
    }
    if (resolvedMember.title !== undefined) {
      merged.title = resolvedMember.title;
    }
  }

  // Apply description from the original allOf schema if present (overrides merged)
  if (schema.description !== undefined) {
    merged.description = schema.description;
  }

  // Convert required set to array
  if (requiredSet.size > 0) {
    merged.required = Array.from(requiredSet).sort();
  }

  // Clean up empty properties object
  if (Object.keys(merged.properties).length === 0) {
    delete merged.properties;
    delete merged.type; // No properties means we shouldn't force type: object
  }

  return merged;
}

/**
 * Extracts the component schema name from a $ref object
 *
 * Contract enforcement (strict validation):
 * - Schema must be an object with a $ref property
 * - $ref must start with "#/components/schemas/"
 * - Throws if inline schema or invalid $ref format
 *
 * @param {any} schema - Schema object expected to contain a $ref
 * @returns {string} - Extracted schema component name
 * @throws {Error} If schema is not a proper $ref or uses unsupported format
 */
export function getJsonSchemaRefName(schema: any): string {
  if (!schema || typeof schema !== "object" || typeof schema.$ref !== "string") {
    throw new Error(
      "Expected schema with $ref to '#/components/schemas/Name', but got inline or missing $ref"
    );
  }
  const ref: string = schema.$ref;
  const prefix = "#/components/schemas/";
  if (!ref.startsWith(prefix)) {
    throw new Error(
      `Unsupported $ref '${ref}'. Expected to start with '${prefix}'.`
    );
  }
  return ref.slice(prefix.length);
}

/**
 * Resolves a parameter object or $ref to a component parameter
 *
 * Supports:
 * - Inline parameter objects (returned as-is)
 * - $ref to "#/components/parameters/Name" (resolved from document)
 *
 * @param {any} paramOrRef - Parameter object or reference
 * @param {OpenAPIDocument} doc - OpenAPI document containing components
 * @returns {any} - Resolved parameter object
 * @throws {Error} If $ref format is invalid or referenced parameter not found
 */
export function resolveParameter(paramOrRef: any, doc: OpenAPIDocument): any {
  if (paramOrRef && typeof paramOrRef === "object" && typeof paramOrRef.$ref === "string") {
    const ref = paramOrRef.$ref;
    const prefix = "#/components/parameters/";
    if (!ref.startsWith(prefix)) {
      throw new Error(
        `Unsupported parameter $ref '${ref}'. Expected to start with '${prefix}'.`
      );
    }
    const name = ref.slice(prefix.length);
    const p = doc.components?.parameters?.[name];
    if (!p) {
      throw new Error(`Parameter '${name}' not found in components.parameters`);
    }
    return p;
  }
  return paramOrRef;
}

/**
 * Result of building Fastify-compatible param schemas from OpenAPI parameters
 */
export interface ParamSchemaBuildResult {
  paramsSchema?: any;
  querySchema?: any;
  headersSchema?: any;
}

/**
 * Builds Fastify-compatible params/querystring/headers schemas from OpenAPI parameters
 *
 * Logic:
 * 1. Merges path-level and operation-level parameters (operation overrides path)
 * 2. Partitions by "in" field: path -> params, query -> querystring, header -> headers
 * 3. Builds inline object schemas with properties/required arrays
 * 4. Lowercases header names (Fastify convention)
 * 5. Rewrites any schema $refs to URN format
 *
 * @param {any} pathItem - Path-level object (may have parameters array)
 * @param {any} operation - Operation object (may have parameters array)
 * @param {OpenAPIDocument} doc - OpenAPI document for resolving parameter refs
 * @param {Record<string, string>} schemaIdByName - Schema name to URN ID mapping
 * @returns {ParamSchemaBuildResult} - Object with optional params/querystring/headers schemas
 */
export function buildParamSchemasForOperation(
  pathItem: any,
  operation: any,
  doc: OpenAPIDocument,
  schemaIdByName: Record<string, string>
): ParamSchemaBuildResult {
  const all: any[] = [];

  if (Array.isArray(pathItem?.parameters)) {
    all.push(...pathItem.parameters);
  }
  if (Array.isArray(operation?.parameters)) {
    all.push(...operation.parameters);
  }

  // Map by (in + ":" + name), last one wins (operation-level override)
  const byKey: Record<string, any> = {};
  for (const p of all) {
    const resolved = resolveParameter(p, doc);
    if (!resolved || typeof resolved !== "object") continue;
    const loc = resolved.in;
    const name = resolved.name;
    if (!loc || !name) continue;
    const key = `${loc}:${name}`;
    byKey[key] = resolved;
  }

  const pathParams: any[] = [];
  const queryParams: any[] = [];
  const headerParams: any[] = [];

  for (const param of Object.values(byKey)) {
    switch ((param as any).in) {
      case "path":
        pathParams.push(param);
        break;
      case "query":
        queryParams.push(param);
        break;
      case "header":
        headerParams.push(param);
        break;
      default:
        // ignore cookie or other locations for now
        break;
    }
  }

  function buildObjectFromParams(params: any[], header: boolean): any | undefined {
    if (params.length === 0) return undefined;
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const p of params) {
      let name: string = p.name;
      if (header) {
        name = name.toLowerCase();
      }
      let propSchema: any = {};
      if (p.schema) {
        propSchema = rewriteSchemaRefs(p.schema, schemaIdByName);
      }
      properties[name] = propSchema;
      if (p.required) {
        required.push(name);
      }
    }

    const obj: any = {
      type: "object",
      properties,
      additionalProperties: false,
    };
    if (required.length > 0) {
      obj.required = required;
    }
    return obj;
  }

  const paramsSchema = buildObjectFromParams(pathParams, false);
  const querySchema = buildObjectFromParams(queryParams, false);
  const headersSchema = buildObjectFromParams(headerParams, true);

  return {
    paramsSchema,
    querySchema,
    headersSchema,
  };
}

/**
 * Client Metadata Resolution
 *
 * Types and functions for resolving SOAP client metadata used in handler generation.
 */

/**
 * Metadata about the SOAP client for handler generation
 *
 * @interface ClientMeta
 * @property {string} className - Client class name (e.g., "EVRNService")
 * @property {string} decoratorName - Fastify decorator name (e.g., "evrnserviceClient")
 * @property {string} importPath - Import path relative to routes/ directory — for future typed route handlers
 * @property {string} typesImportPath - Types import path relative to routes/ directory — for future typed route handlers
 * @property {string} pluginImportPath - Import path relative to gateway output directory — used by emitPluginModule()
 */
export interface ClientMeta {
  className: string;
  decoratorName: string;
  importPath: string;
  typesImportPath: string;
  pluginImportPath: string;
}

/**
 * Extended operation metadata for full handler generation
 *
 * @interface ResolvedOperationMeta
 * @property {string} operationId - OpenAPI operationId
 * @property {string} operationSlug - Slugified for filenames
 * @property {string} method - HTTP method
 * @property {string} path - URL path
 * @property {string} clientMethodName - SOAP client method to call
 * @property {string} [requestTypeName] - TypeScript request type
 * @property {string} [responseTypeName] - TypeScript response type
 */
export interface ResolvedOperationMeta {
  operationId: string;
  operationSlug: string;
  method: string;
  path: string;
  clientMethodName: string;
  requestTypeName?: string;
  responseTypeName?: string;
}


/**
 * Options for resolving client metadata
 *
 * @interface ResolveClientMetaOptions
 * @property {string} [clientDir] - Path to client directory
 * @property {string} [catalogFile] - Path to catalog.json
 * @property {string} [clientClassName] - Override client class name
 * @property {string} [clientDecoratorName] - Override decorator name
 * @property {string} serviceSlug - Service slug for derivation
 * @property {"js"|"ts"|"bare"} importsMode - Import extension mode
 */
export interface ResolveClientMetaOptions {
  clientDir?: string;
  catalogFile?: string;
  clientClassName?: string;
  clientDecoratorName?: string;
  serviceSlug: string;
  importsMode: "js" | "ts" | "bare";
}

/**
 * Resolves client metadata from available sources
 *
 * Resolution priority:
 * 1. Explicit clientClassName/clientDecoratorName options
 * 2. serviceName from catalog.json if catalogFile provided
 * 3. Derive from serviceSlug
 *
 * @param {ResolveClientMetaOptions} opts - Options for resolving client metadata
 * @param {any} [catalog] - Optional loaded catalog object
 * @returns {ClientMeta} - Resolved client metadata
 */
export function resolveClientMeta(opts: ResolveClientMetaOptions, catalog?: any): ClientMeta {
  const suffix = opts.importsMode === "bare" ? "" : `.${opts.importsMode}`;

  // Determine client class name
  let className: string;
  if (opts.clientClassName) {
    className = opts.clientClassName;
  } else if (catalog?.serviceName) {
    className = pascal(catalog.serviceName);
  } else {
    className = pascal(opts.serviceSlug);
  }

  // Determine decorator name
  let decoratorName: string;
  if (opts.clientDecoratorName) {
    decoratorName = opts.clientDecoratorName;
  } else {
    decoratorName = slugName(className) + "Client";
  }

  // Build import paths for different directory depths.
  //
  // Standard layout (enforced by pipeline convention):
  //   {parent}/
  //     client/client.ts    ← --client-dir
  //     gateway/            ← --gateway-dir
  //       plugin.ts         ← pluginImportPath: one level up
  //       routes/foo.ts     ← importPath: two levels up
  const importPath = opts.clientDir
    ? `../../client/client${suffix}`
    : `../client/client${suffix}`;
  const typesImportPath = opts.clientDir
    ? `../../client/types${suffix}`
    : `../client/types${suffix}`;
  const pluginImportPath = opts.clientDir
    ? `../client/client${suffix}`
    : `./client/client${suffix}`;

  return {
    className,
    decoratorName,
    importPath,
    typesImportPath,
    pluginImportPath,
  };
}

/**
 * Resolves operation metadata by matching OpenAPI operationId to catalog operations
 *
 * @param {string} operationId - OpenAPI operation ID
 * @param {string} operationSlug - Slugified operation name for filenames
 * @param {string} method - HTTP method
 * @param {string} path - URL path
 * @param {Array} [catalogOperations] - Optional catalog operations to match against
 * @returns {ResolvedOperationMeta} - Resolved operation metadata with type names
 */
export function resolveOperationMeta(
  operationId: string,
  operationSlug: string,
  method: string,
  path: string,
  catalogOperations?: Array<{
    name: string;
    inputTypeName?: string;
    outputTypeName?: string;
  }>
): ResolvedOperationMeta {
  // Try to find matching operation in catalog
  const catalogOp = catalogOperations?.find(
    op => op.name === operationId || slugName(op.name) === operationSlug
  );

  // Use catalog type names if available, otherwise derive by convention
  const requestTypeName = catalogOp?.inputTypeName ?? pascal(operationId);
  const responseTypeName = catalogOp?.outputTypeName ?? pascal(operationId);

  return {
    operationId,
    operationSlug,
    method,
    path,
    clientMethodName: operationId, // Client methods use the original operation name
    requestTypeName,
    responseTypeName,
  };
}

