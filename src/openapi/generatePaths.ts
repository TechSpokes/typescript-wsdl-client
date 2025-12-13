/**
 * OpenAPI Paths Generator
 *
 * This module transforms WSDL operations into OpenAPI 3.1 paths and operations.
 * It bridges the gap between SOAP's operation-centric model and REST's resource-oriented
 * approach by mapping each SOAP operation to a corresponding REST endpoint.
 *
 * Key features:
 * - Converts WSDL operations to RESTful paths with configurable styles
 * - Supports operation-specific overrides for methods, descriptions, etc.
 * - Handles security requirements and header parameters
 * - Organizes operations into tags for better API documentation
 * - Properly links request/response schemas to the components section
 */
import type {CompiledCatalog} from "../compiler/schemaCompiler.js";
import type {PathStyle} from "./casing.js";
import {toPathSegment} from "./casing.js";

/**
 * Schema for operation overrides file
 *
 * This interface defines the structure of the optional JSON file that can
 * provide operation-specific overrides for method, deprecation status,
 * and documentation.
 *
 * @interface OpsOverridesFile
 * @property {string} [method] - HTTP method to use (post, get, put, patch, delete)
 * @property {boolean} [deprecated] - Whether to mark the operation as deprecated
 * @property {string} [summary] - Short summary for the operation
 * @property {string} [description] - Detailed description for the operation
 */
export interface OpsOverridesFile {
  [opName: string]: {
    method?: string; // post|get|put|patch|delete
    deprecated?: boolean;
    summary?: string;
    description?: string;
  };
}

/**
 * Schema for operation to tag mapping file
 *
 * This interface defines the structure of the optional JSON file that maps
 * operation names to tags for better organization in the OpenAPI specification.
 *
 * @interface TagsMappingFile
 * @property {string} string Tag name to assign to the operation
 */
export interface TagsMappingFile {
  // Exact operation name -> tag OR pattern mapping in the future; for now simple map
  [opName: string]: string;
}

/**
 * Options for generating OpenAPI paths
 *
 * @interface GeneratePathsOptions
 * @property {string} [basePath] - Base path prefix for all operations (e.g., /v1/soap)
 * @property {PathStyle} pathStyle - Style for converting operation names to path segments
 * @property {string} defaultMethod - Default HTTP method for operations
 * @property {TagsMappingFile} [tagsMap] - Mapping of operation names to tags
 * @property {OpsOverridesFile} [overrides] - Operation-specific overrides
 * @property {string} defaultTag - Default tag for operations without explicit tags
 * @property {Record<string, any[]>} opSecurity - Operation-specific security requirements
 * @property {Record<string, string[]>} opHeaderParameters - Operation-specific header parameters
 */
export interface GeneratePathsOptions {
  basePath?: string;
  pathStyle: PathStyle;
  defaultMethod: string;
  tagsMap?: TagsMappingFile;
  overrides?: OpsOverridesFile;
  defaultTag: string;
  opSecurity: Record<string, any[] | undefined>;
  opHeaderParameters: Record<string, string[]>; // names of parameter components
}

export function generatePaths(compiled: CompiledCatalog, opts: GeneratePathsOptions) {
  const paths: Record<string, any> = {};
  const base = normalizeBase(opts.basePath || "/");

  for (const op of compiled.operations) {
    const seg = toPathSegment(op.name, opts.pathStyle);
    const fullPath = (base.endsWith("/") ? base.slice(0, -1) : base) + "/" + seg;
    const override = opts.overrides?.[op.name] || {};
    const method = (override.method || opts.defaultMethod || "post").toLowerCase();
    const tag = opts.tagsMap?.[op.name] || opts.defaultTag;

    const inputRef = op.inputElement?.local ? {$ref: `#/components/schemas/${op.inputElement.local}`} : {type: "object"};
    const outputRef = op.outputElement?.local ? {$ref: `#/components/schemas/${op.outputElement.local}`} : {type: "object"};

    const parameters: any[] = [];
    // Header parameters from security builder
    const headerParamNames = opts.opHeaderParameters[op.name] || [];
    for (const pName of headerParamNames) {
      parameters.push({$ref: `#/components/parameters/${pName}`});
    }

    const operationObject: any = {
      operationId: op.name,
      tags: [tag],
      requestBody: {
        required: true,
        content: {
          "application/json": {schema: inputRef}
        }
      },
      responses: {
        "200": {
          description: "Successful SOAP operation response",
          content: {
            "application/json": {schema: outputRef}
          }
        },
        default: {
          description: "Error response",
          content: {
            "application/json": {schema: {$ref: "#/components/schemas/ErrorEnvelope"}}
          }
        }
      },
    };
    if (override.summary) operationObject.summary = override.summary;
    if (override.description) operationObject.description = override.description;
    if (override.deprecated) operationObject.deprecated = true;
    if (parameters.length) operationObject.parameters = parameters;
    const opSec = opts.opSecurity[op.name];
    if (opSec) operationObject.security = opSec;

    if (!paths[fullPath]) paths[fullPath] = {};
    paths[fullPath][method] = operationObject;
  }

  return paths;
}

function normalizeBase(base: string): string {
  if (!base.startsWith("/")) base = "/" + base;
  if (base.endsWith("/")) return base;
  return base;
}
