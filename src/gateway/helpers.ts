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
