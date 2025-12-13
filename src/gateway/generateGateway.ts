/**
 * Fastify Gateway Generator from OpenAPI 3.1
 *
 * This module generates production-ready Fastify gateway code from OpenAPI 3.1 specifications.
 * It creates a complete "slice" (schemas + routes) for a single SOAP service and version,
 * bridging the gap between OpenAPI specs and running Fastify applications.
 *
 * Core capabilities:
 * - Generates JSON Schema files with URN-based IDs for all components
 * - Creates Fastify-compatible operation schemas (body, params, querystring, headers, response)
 * - Emits route registration code with handler stubs
 * - Supports automatic version/service detection from paths
 * - Enforces strict contract validation (no inline schemas, proper $refs)
 *
 * Output structure:
 *   {outDir}/
 *     schemas/
 *       models/      - JSON Schema components (re-ID'd with URNs)
 *       operations/  - Fastify operation schemas
 *     routes/        - Individual route registration files
 *     schemas.ts     - Schema registration module
 *     routes.ts      - Route registration module
 */
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import {
  type OpenAPIDocument,
  determineVersionAndService,
  isNumericStatus,
  getJsonSchemaRefName,
  buildParamSchemasForOperation,
} from "./helpers.js";
import {
  emitModelSchemas,
  emitOperationSchemas,
  emitSchemasModule,
  emitRouteFiles,
} from "./generators.js";

/**
 * Options for gateway code generation
 *
 * @interface GenerateGatewayOptions
 * @property {string} [openapiFile] - Path to OpenAPI 3.1 JSON or YAML file (exclusive with openapiDocument)
 * @property {any} [openapiDocument] - Pre-loaded OpenAPI document object (exclusive with openapiFile)
 * @property {string} outDir - Output directory for generated gateway code
 * @property {string} [clientDir] - Path to client directory (where client.ts is located) for importing client code
 * @property {string} [versionSlug] - Version identifier for URN generation (auto-detected if omitted)
 * @property {string} [serviceSlug] - Service identifier for URN generation (auto-detected if omitted)
 * @property {number[]} [defaultResponseStatusCodes] - Status codes to backfill with default response
 * @property {"js"|"ts"|"bare"} [imports] - Import-extension mode for generated TypeScript modules (mirrors global --imports)
 */
export interface GenerateGatewayOptions {
  openapiFile?: string;
  openapiDocument?: any;
  outDir: string;
  clientDir?: string;
  versionSlug?: string;
  serviceSlug?: string;
  defaultResponseStatusCodes?: number[];
  imports?: "js" | "ts" | "bare";
}

/**
 * Generates Fastify gateway code from an OpenAPI 3.1 specification
 *
 * This function orchestrates the complete gateway generation process:
 * 1. Loads/validates the OpenAPI document
 * 2. Determines version and service slugs
 * 3. Generates model schemas with URN IDs
 * 4. Generates operation schemas with Fastify structure
 * 5. Emits schema registration module
 * 6. Emits route files and aggregator module
 *
 * Contract assumptions (strict validation):
 * - All request/response bodies use $ref to components.schemas (no inline schemas)
 * - Every operation has a default response with application/json content
 * - All schemas referenced by operations exist in components.schemas
 *
 * @param {GenerateGatewayOptions} opts - Generation options
 * @returns {Promise<void>}
 * @throws {Error} If OpenAPI validation fails or contract assumptions are violated
 *
 * @example
 * // From JSON file
 * await generateGateway({
 *   openapiFile: "openapi.json",
 *   outDir: "gateway",
 *   versionSlug: "v1",
 *   serviceSlug: "weather"
 * });
 *
 * @example
 * // From YAML file
 * await generateGateway({
 *   openapiFile: "openapi.yaml",
 *   outDir: "gateway",
 *   versionSlug: "v1",
 *   serviceSlug: "weather"
 * });
 *
 * @example
 * // From in-memory document
 * await generateGateway({
 *   openapiDocument: openapiDoc,
 *   outDir: "gateway",
 *   defaultResponseStatusCodes: [200, 400, 500]
 * });
 */
export async function generateGateway(opts: GenerateGatewayOptions): Promise<void> {
  // Validate input sources
  if (!opts.openapiDocument && !opts.openapiFile) {
    throw new Error("Provide one of: openapiDocument or openapiFile");
  }
  if (opts.openapiDocument && opts.openapiFile) {
    throw new Error("Provide only one source: openapiDocument OR openapiFile");
  }

  // Load OpenAPI document
  let doc: OpenAPIDocument;
  if (opts.openapiFile) {
    const raw = fs.readFileSync(opts.openapiFile, "utf8");
    const ext = path.extname(opts.openapiFile).toLowerCase();

    // Parse based on file extension
    if (ext === ".yaml" || ext === ".yml") {
      doc = yaml.load(raw) as OpenAPIDocument;
    } else if (ext === ".json") {
      doc = JSON.parse(raw);
    } else {
      throw new Error(
        `Unsupported OpenAPI file extension: ${ext}. Expected .json, .yaml, or .yml`
      );
    }
  } else {
    doc = opts.openapiDocument;
  }

  // Validate OpenAPI document structure
  if (!doc || typeof doc !== "object" || typeof doc.paths !== "object") {
    throw new Error("Invalid OpenAPI document: missing 'paths'");
  }
  if (!doc.components || !doc.components.schemas) {
    throw new Error("Invalid OpenAPI document: missing 'components.schemas'");
  }

  // Determine version and service slugs
  const {versionSlug, serviceSlug} = determineVersionAndService(
    doc,
    opts.versionSlug,
    opts.serviceSlug
  );

  // Set default response status codes if not provided
  const defaultResponseStatusCodes = opts.defaultResponseStatusCodes || [
    200, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504,
  ];

  // Determine import-extension mode (defaults to "js" like the client/compiler)
  const importsMode: "js" | "ts" | "bare" = opts.imports ?? "js";

  // Prepare output directories
  const outDir = opts.outDir;
  const modelsDir = path.join(outDir, "schemas", "models");
  const opsDir = path.join(outDir, "schemas", "operations");
  const routesDir = path.join(outDir, "routes");

  // Step 1: Generate model schemas and build URN mapping
  const schemaIdByName = emitModelSchemas(
    doc.components.schemas,
    modelsDir,
    versionSlug,
    serviceSlug
  );

  // Step 2: Generate operation schemas
  const operations = emitOperationSchemas(
    doc,
    opsDir,
    versionSlug,
    serviceSlug,
    schemaIdByName,
    defaultResponseStatusCodes,
    buildParamSchemasForOperation,
    getJsonSchemaRefName,
    isNumericStatus
  );

  // Step 3: Emit schemas.ts module
  emitSchemasModule(outDir, modelsDir, versionSlug, serviceSlug);

  // Step 4: Emit route files and routes.ts module
  emitRouteFiles(outDir, routesDir, versionSlug, serviceSlug, operations, importsMode);
}
