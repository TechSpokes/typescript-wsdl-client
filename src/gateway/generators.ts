/**
 * Gateway Code Generators
 *
 * This module contains functions for generating various gateway code artifacts:
 * - Model JSON Schema files with URN IDs
 * - Operation schema files with Fastify-compatible structure
 * - schemas.ts module for registering all model schemas
 * - Individual route files with handler stubs
 * - routes.ts module for registering all routes
 *
 * All emitters follow deterministic generation rules for diff-friendly output.
 */
import fs from "node:fs";
import path from "node:path";
import {type ClientMeta, type OpenAPIDocument, flattenAllOf, rewriteSchemaRefs, slugName,} from "./helpers.js";

/**
 * Emits individual JSON Schema files for each OpenAPI component schema
 *
 * Process:
 * 1. Creates schemas/models/ directory
 * 2. For each component schema:
 *    - Generates URN $id: urn:services:{service}:{version}:schemas:models:{slug}
 *    - Rewrites all internal $refs to URN format
 *    - Writes to {slug}.json
 *
 * @param {Record<string, any>} schemas - OpenAPI components.schemas object
 * @param {string} modelsDir - Output directory for model schema files
 * @param {string} versionSlug - Version slug for URN generation
 * @param {string} serviceSlug - Service slug for URN generation
 * @returns {Record<string, string>} - Map from original schema name to URN ID
 */
export function emitModelSchemas(
  schemas: Record<string, any>,
  modelsDir: string,
  versionSlug: string,
  serviceSlug: string
): Record<string, string> {
  fs.mkdirSync(modelsDir, {recursive: true});

  const schemaIdByName: Record<string, string> = {};
  const modelSlugByName: Record<string, string> = {};

  // First pass: generate all URN IDs
  for (const name of Object.keys(schemas)) {
    const slug = slugName(name);
    if (modelSlugByName[name]) {
      throw new Error(`Duplicate schema name '${name}'`);
    }
    modelSlugByName[name] = slug;
    schemaIdByName[name] = `urn:services:${serviceSlug}:${versionSlug}:schemas:models:${slug}`;
  }

  // Second pass: flatten allOf, rewrite refs, and emit files
  for (const [name, schema] of Object.entries(schemas)) {
    const slug = modelSlugByName[name];
    // Flatten allOf compositions for Fastify/fast-json-stringify compatibility
    const flattened = flattenAllOf(schema, schemas);
    // Rewrite $refs to URN format
    const cloned = rewriteSchemaRefs(flattened, schemaIdByName);
    cloned.$id = schemaIdByName[name];
    const outPath = path.join(modelsDir, `${slug}.json`);
    fs.writeFileSync(outPath, JSON.stringify(cloned, null, 2), "utf8");
  }

  return schemaIdByName;
}

/**
 * Operation metadata for route generation
 *
 * @interface OperationMetadata
 * @property {string} operationSlug - Slugified operation name for filenames
 * @property {string} method - HTTP method (lowercase)
 * @property {string} path - URL path
 * @property {string} [operationId] - OpenAPI operationId
 * @property {string} [clientMethodName] - SOAP client method to call
 * @property {string} [requestTypeName] - TypeScript request type name
 * @property {string} [responseTypeName] - TypeScript response type name
 */
export interface OperationMetadata {
  operationSlug: string;
  method: string;
  path: string;
  operationId?: string;
  clientMethodName?: string;
  requestTypeName?: string;
  responseTypeName?: string;
}

/**
 * Emits Fastify-compatible operation schema files
 *
 * Schema structure:
 * {
 *   "$id": "urn:services:{service}:{version}:schemas:operations:{slug}",
 *   "body": { $ref: "..." },           // optional
 *   "params": { type: object, ... },   // optional
 *   "querystring": { type: object, ... }, // optional
 *   "headers": { type: object, ... },  // optional
 *   "response": {
 *     "200": { $ref: "..." },
 *     "400": { $ref: "..." },
 *     ...
 *   }
 * }
 *
 * @param {OpenAPIDocument} doc - OpenAPI document
 * @param {string} opsDir - Output directory for operation schema files
 * @param {string} versionSlug - Version slug for URN generation
 * @param {string} serviceSlug - Service slug for URN generation
 * @param {Record<string, string>} schemaIdByName - Schema name to URN ID mapping
 * @param {number[]} defaultResponseStatusCodes - Status codes to backfill with default response
 * @param {Function} buildParamSchemas - Function to build param schemas
 * @param {Function} getRefName - Function to extract $ref name
 * @param {Function} isNumeric - Function to check if status code is numeric
 * @returns {OperationMetadata[]} - Array of operation metadata for route generation
 */
export function emitOperationSchemas(
  doc: OpenAPIDocument,
  opsDir: string,
  versionSlug: string,
  serviceSlug: string,
  schemaIdByName: Record<string, string>,
  defaultResponseStatusCodes: number[],
  buildParamSchemas: (pathItem: any, operation: any, doc: OpenAPIDocument, schemaIdByName: Record<string, string>) => any,
  getRefName: (schema: any) => string,
  isNumeric: (code: string) => boolean
): OperationMetadata[] {
  fs.mkdirSync(opsDir, {recursive: true});

  const operations: OperationMetadata[] = [];
  const seenOperationSlugs = new Set<string>();

  for (const [p, pathItem] of Object.entries(doc.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    const pathLevel = pathItem as any;

    for (const [method, opVal] of Object.entries(pathItem)) {
      const lowerMethod = method.toLowerCase();
      if (!["get", "post", "put", "patch", "delete", "options", "head"].includes(lowerMethod)) {
        continue;
      }
      const operation = opVal as any;
      if (!operation || typeof operation !== "object") continue;

      let operationId: string = operation.operationId;
      if (!operationId) {
        operationId = `${lowerMethod}_${p}`;
      }
      const operationSlug = slugName(operationId);
      if (seenOperationSlugs.has(operationSlug)) {
        throw new Error(`Duplicate operation slug '${operationSlug}' derived from operationId '${operationId}'`);
      }
      seenOperationSlugs.add(operationSlug);

      // Build request body schema
      let bodySchema: any | undefined;
      const rbSchema = operation.requestBody?.content?.["application/json"]?.schema;
      if (rbSchema) {
        const name = getRefName(rbSchema);
        const id = schemaIdByName[name];
        if (!id) {
          throw new Error(`Unknown request body schema component '${name}'`);
        }
        bodySchema = {$ref: id + "#"};
      }

      // Build parameter schemas
      const {paramsSchema, querySchema, headersSchema} = buildParamSchemas(
        pathLevel,
        operation,
        doc,
        schemaIdByName
      );

      // Build response schemas
      const responses = operation.responses || {};
      const responseObj: Record<string, any> = {};

      const explicitCodes = Object.keys(responses).filter(isNumeric);

      for (const code of explicitCodes) {
        const r = responses[code];
        if (!r || typeof r !== "object") continue;
        const rSchema = r.content?.["application/json"]?.schema;
        if (!rSchema) {
          throw new Error(
            `Response ${code} for operation '${operationId}' is missing application/json schema`
          );
        }
        const name = getRefName(rSchema);
        const id = schemaIdByName[name];
        if (!id) {
          throw new Error(`Unknown response schema component '${name}' for code ${code}`);
        }
        responseObj[code] = {$ref: id + "#"};
      }

      // Validate and get default response
      const defaultResp = responses.default;
      if (!defaultResp || typeof defaultResp !== "object") {
        throw new Error(
          `Operation '${operationId}' is missing default response; required by gateway codegen`
        );
      }
      const defaultSchema = defaultResp.content?.["application/json"]?.schema;
      if (!defaultSchema) {
        throw new Error(
          `Operation '${operationId}' default response is missing application/json schema`
        );
      }
      const defaultName = getRefName(defaultSchema);
      const defaultId = schemaIdByName[defaultName];
      if (!defaultId) {
        throw new Error(
          `Unknown default response schema component '${defaultName}' for operation '${operationId}'`
        );
      }

      // Backfill default response codes
      for (const code of defaultResponseStatusCodes) {
        const codeStr = String(code);
        if (!responseObj[codeStr]) {
          responseObj[codeStr] = {$ref: defaultId + "#"};
        }
      }

      // Build operation schema object
      const opSchema: any = {
        $id: `urn:services:${serviceSlug}:${versionSlug}:schemas:operations:${operationSlug}`,
        response: responseObj,
      };
      if (bodySchema) opSchema.body = bodySchema;
      if (paramsSchema) opSchema.params = paramsSchema;
      if (querySchema) opSchema.querystring = querySchema;
      if (headersSchema) opSchema.headers = headersSchema;

      const opOutPath = path.join(opsDir, `${operationSlug}.json`);
      fs.writeFileSync(opOutPath, JSON.stringify(opSchema, null, 2), "utf8");

      operations.push({
        operationSlug,
        method: lowerMethod,
        path: p,
      });
    }
  }

  return operations;
}

/**
 * Emits schemas.ts module that registers all model schemas with Fastify
 *
 * Generated code:
 * - Imports all JSON files from schemas/models/
 * - Exports registerSchemas_{version}_{service}(fastify) function
 * - Calls fastify.addSchema for each model schema
 *
 * @param {string} outDir - Root output directory
 * @param {string} modelsDir - Directory containing model schema files
 * @param {string} versionSlug - Version slug for function naming
 * @param {string} serviceSlug - Service slug for function naming
 */
export function emitSchemasModule(
  outDir: string,
  modelsDir: string,
  versionSlug: string,
  serviceSlug: string
): void {
  const modelFiles = fs.readdirSync(modelsDir).filter((f) => f.endsWith(".json"));
  modelFiles.sort();

  let schemasTs = "";
  schemasTs += `import type { FastifyInstance } from "fastify";\n`;
  modelFiles.forEach((file, idx) => {
    const varName = `m${idx}`;
    schemasTs += `import ${varName} from "./schemas/models/${file}" with { type: "json" };\n`;
  });
  schemasTs += `\nexport async function registerSchemas_${slugName(
    versionSlug
  )}_${slugName(serviceSlug)}(fastify: FastifyInstance) {\n`;
  schemasTs += `  const schemas = [${modelFiles
    .map((_, idx) => `m${idx}`)
    .join(", ")}];\n`;
  schemasTs += `  for (const s of schemas) {\n`;
  schemasTs += `    fastify.addSchema(s as any);\n`;
  schemasTs += `  }\n`;
  schemasTs += `}\n`;

  fs.writeFileSync(path.join(outDir, "schemas.ts"), schemasTs, "utf8");
}

/**
 * Emits individual route files and routes.ts aggregator module
 *
 * For each operation:
 * - Creates routes/{slug}.ts with registerRoute_{slug} function
 * - Imports operation schema from schemas/operations/{slug}.json
 * - Defines fastify.route() with method, url, schema, and stub handler
 *
 * Then creates routes.ts:
 * - Imports all route registration functions
 * - Exports registerRoutes_{version}_{service}(fastify) function
 *
 * Note: Route URLs come from OpenAPI paths which already include any base path
 * configured during OpenAPI generation (--openapi-base-path).
 *
 * @param {string} outDir - Root output directory
 * @param {string} routesDir - Directory for individual route files
 * @param {string} versionSlug - Version slug for function naming
 * @param {string} serviceSlug - Service slug for function naming
 * @param {OperationMetadata[]} operations - Array of operation metadata
 * @param {"js"|"ts"|"bare"} importsMode - Import-extension mode for generated TypeScript modules
 */
export function emitRouteFiles(
  outDir: string,
  routesDir: string,
  versionSlug: string,
  serviceSlug: string,
  operations: OperationMetadata[],
  importsMode: "js" | "ts" | "bare"
): void {
  fs.mkdirSync(routesDir, {recursive: true});

  // Sort operations for deterministic output
  operations.sort((a, b) => a.operationSlug.localeCompare(b.operationSlug));

  const suffix = importsMode === "bare" ? "" : `.${importsMode}`;

  let routesTs = `import type { FastifyInstance } from "fastify";\n`;

  operations.forEach((op) => {
    const fnName = `registerRoute_${slugName(versionSlug)}_${slugName(serviceSlug)}_${op.operationSlug.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    const routeFileBase = op.operationSlug;
    routesTs += `import { ${fnName} } from "./routes/${routeFileBase}${suffix}";\n`;

    // Generate individual route file
    // Note: op.path comes from OpenAPI and already includes any base path
    let routeTs = "";
    routeTs += `import type { FastifyInstance } from "fastify";\n`;
    routeTs += `import schema from "../schemas/operations/${op.operationSlug}.json" with { type: "json" };\n\n`;
    routeTs += `export async function ${fnName}(fastify: FastifyInstance) {\n`;
    routeTs += `  fastify.route({\n`;
    routeTs += `    method: "${op.method.toUpperCase()}",\n`;
    routeTs += `    url: "${op.path}",\n`;
    routeTs += `    schema: schema as any,\n`;
    routeTs += `    handler: async (request, reply) => {\n`;
    routeTs += `      throw new Error("Not implemented");\n`;
    routeTs += `    }\n`;
    routeTs += `  });\n`;
    routeTs += `}\n`;

    fs.writeFileSync(path.join(routesDir, `${routeFileBase}.ts`), routeTs, "utf8");
  });

  const routeFnName = `registerRoutes_${slugName(versionSlug)}_${slugName(serviceSlug)}`;
  routesTs += `\nexport async function ${routeFnName}(fastify: FastifyInstance) {\n`;
  operations.forEach((op) => {
    const fnName = `registerRoute_${slugName(versionSlug)}_${slugName(serviceSlug)}_${op.operationSlug.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    routesTs += `  await ${fnName}(fastify);\n`;
  });
  routesTs += `}\n`;

  fs.writeFileSync(path.join(outDir, "routes.ts"), routesTs, "utf8");
}


/**
 * Emits runtime.ts module with envelope builders and error handling utilities
 *
 * Generated code includes:
 * - Response envelope types (SuccessEnvelope, ErrorEnvelope)
 * - buildSuccessEnvelope() and buildErrorEnvelope() functions
 * - classifyError() for mapping errors to HTTP status codes
 * - createGatewayErrorHandler_{version}_{service}() factory function
 *
 * @param {string} outDir - Root output directory
 * @param {string} versionSlug - Version slug for function naming
 * @param {string} serviceSlug - Service slug for function naming
 */
export function emitRuntimeModule(
  outDir: string,
  versionSlug: string,
  serviceSlug: string
): void {
  const vSlug = slugName(versionSlug);
  const sSlug = slugName(serviceSlug);

  const runtimeTs = `/**
 * Gateway Runtime Utilities
 *
 * Provides envelope builders and error handling for the generated gateway.
 * Auto-generated - do not edit manually.
 */
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Success response envelope
 */
export interface SuccessEnvelope<T> {
  status: "SUCCESS";
  message: string | null;
  data: T;
  error: null;
}

/**
 * Error response envelope
 */
export interface ErrorEnvelope {
  status: "ERROR";
  message: string;
  data: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Union type for response envelopes
 */
export type ResponseEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

/**
 * Builds a success response envelope
 *
 * @param data - The response data
 * @param message - Optional success message
 * @returns Success envelope wrapping the data
 */
export function buildSuccessEnvelope<T>(data: T, message?: string): SuccessEnvelope<T> {
  return {
    status: "SUCCESS",
    message: message ?? null,
    data,
    error: null,
  };
}

/**
 * Builds an error response envelope
 *
 * @param code - Error code (e.g., "VALIDATION_ERROR")
 * @param message - Human-readable error message
 * @param details - Optional error details
 * @returns Error envelope with the error information
 */
export function buildErrorEnvelope(
  code: string,
  message: string,
  details?: unknown
): ErrorEnvelope {
  return {
    status: "ERROR",
    message,
    data: null,
    error: { code, message, details },
  };
}

/**
 * Classified error with HTTP status and details
 */
export interface ClassifiedError {
  httpStatus: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Classifies an error and maps it to an appropriate HTTP status code
 *
 * @param err - The error to classify
 * @returns Classified error with HTTP status, code, and message
 */
export function classifyError(err: unknown): ClassifiedError {
  // Fastify validation errors
  if (err && typeof err === "object" && "validation" in err) {
    return {
      httpStatus: 400,
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: (err as Record<string, unknown>).validation,
    };
  }

  // SOAP fault errors (node-soap throws these)
  if (err && typeof err === "object" && "root" in err) {
    const root = (err as Record<string, unknown>).root as Record<string, unknown> | undefined;
    const envelope = root?.Envelope as Record<string, unknown> | undefined;
    const body = envelope?.Body as Record<string, unknown> | undefined;
    const fault = body?.Fault as Record<string, unknown> | undefined;
    if (fault) {
      return {
        httpStatus: 502,
        code: "SOAP_FAULT",
        message: (fault.faultstring as string) || "SOAP service returned a fault",
        details: fault,
      };
    }
  }

  // Connection/timeout errors
  if (err instanceof Error) {
    if (err.message.includes("ECONNREFUSED") || err.message.includes("ENOTFOUND")) {
      return {
        httpStatus: 503,
        code: "SERVICE_UNAVAILABLE",
        message: "Unable to connect to SOAP service",
        details: err.message,
      };
    }
    if (err.message.includes("ETIMEDOUT") || err.message.includes("timeout")) {
      return {
        httpStatus: 504,
        code: "GATEWAY_TIMEOUT",
        message: "SOAP service request timed out",
        details: err.message,
      };
    }
  }

  // Generic error fallback
  const message = err instanceof Error ? err.message : String(err);
  return {
    httpStatus: 500,
    code: "INTERNAL_ERROR",
    message,
    details: process.env.NODE_ENV === "development" ? err : undefined,
  };
}

/**
 * Creates a gateway error handler for this service
 *
 * @returns Fastify error handler function
 */
export function createGatewayErrorHandler_${vSlug}_${sSlug}() {
  return async function gatewayErrorHandler(
    error: Error,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<ErrorEnvelope> {
    const classified = classifyError(error);

    request.log.error({
      err: error,
      classified,
      url: request.url,
      method: request.method,
    }, "Gateway error");

    reply.status(classified.httpStatus);
    return buildErrorEnvelope(classified.code, classified.message, classified.details);
  };
}
`;

  fs.writeFileSync(path.join(outDir, "runtime.ts"), runtimeTs, "utf8");
}

/**
 * Emits plugin.ts module as the primary Fastify plugin wrapper
 *
 * Generated code includes:
 * - Plugin options interface with client and prefix support
 * - Named operations interface for decorator type autocomplete
 * - Fastify decorator type augmentation
 * - Plugin implementation that registers schemas, routes, and error handler
 *
 * @param {string} outDir - Root output directory
 * @param {string} versionSlug - Version slug for function naming
 * @param {string} serviceSlug - Service slug for function naming
 * @param {ClientMeta} clientMeta - Client class metadata
 * @param {"js"|"ts"|"bare"} importsMode - Import-extension mode
 * @param {OperationMetadata[]} operations - Operation metadata for generating the operations interface
 */
export function emitPluginModule(
  outDir: string,
  versionSlug: string,
  serviceSlug: string,
  clientMeta: ClientMeta,
  importsMode: "js" | "ts" | "bare",
  operations: OperationMetadata[]
): void {
  const vSlug = slugName(versionSlug);
  const sSlug = slugName(serviceSlug);
  const suffix = importsMode === "bare" ? "" : `.${importsMode}`;

  // Build named operations interface methods from operation metadata
  const operationMethods = operations
    .filter(op => op.clientMethodName)
    .map(op => `  ${op.clientMethodName}(args: unknown): Promise<{ response: unknown; headers: unknown }>;`)
    .join("\n");

  const pluginTs = `/**
 * ${clientMeta.className} Gateway Plugin
 *
 * Fastify plugin that registers the SOAP-to-REST gateway for ${serviceSlug}.
 * Auto-generated - do not edit manually.
 */
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import type { ${clientMeta.className} } from "${clientMeta.pluginImportPath}";
import { registerSchemas_${vSlug}_${sSlug} } from "./schemas${suffix}";
import { registerRoutes_${vSlug}_${sSlug} } from "./routes${suffix}";
import { createGatewayErrorHandler_${vSlug}_${sSlug} } from "./runtime${suffix}";

/**
 * Options for the ${clientMeta.className} gateway plugin
 */
export interface ${clientMeta.className}GatewayOptions extends FastifyPluginOptions {
  /**
   * SOAP client instance (pre-configured).
   * The client should be instantiated with appropriate source and security settings.
   */
  client: ${clientMeta.className};
  /**
   * Optional additional route prefix applied at runtime.
   * Note: If you used --openapi-base-path during generation, routes already have that prefix baked in.
   * Only use this for additional runtime prefixing (e.g., mounting under a versioned sub-path).
   */
  prefix?: string;
}

/**
 * Named operations interface for Fastify decorator type.
 *
 * Lists all SOAP operations with \`args: unknown\` signatures. This provides
 * method name autocomplete on the decorator without requiring the concrete
 * client class import (which would cascade into route handler type errors
 * since request.body is untyped).
 */
export interface ${clientMeta.className}Operations {
${operationMethods}
}

declare module "fastify" {
  interface FastifyInstance {
    ${clientMeta.decoratorName}: ${clientMeta.className}Operations;
  }
}

/**
 * Gateway plugin implementation
 *
 * @param fastify - Fastify instance
 * @param opts - Plugin options including client and optional prefix
 */
async function ${sSlug}GatewayPlugin(
  fastify: FastifyInstance,
  opts: ${clientMeta.className}GatewayOptions
): Promise<void> {
  // Decorate with SOAP client.
  // Cast required: the concrete client class has typed method args (e.g. args: T.Foo)
  // while the operations interface uses args: unknown for route handler compatibility.
  if (!fastify.hasDecorator("${clientMeta.decoratorName}")) {
    fastify.decorate("${clientMeta.decoratorName}", opts.client as any);
  }

  // Register model schemas
  await registerSchemas_${vSlug}_${sSlug}(fastify);

  // Register error handler (scoped to this plugin)
  fastify.setErrorHandler(createGatewayErrorHandler_${vSlug}_${sSlug}());

  // Register routes (optionally prefixed)
  if (opts.prefix) {
    await fastify.register(async (child) => {
      await registerRoutes_${vSlug}_${sSlug}(child);
    }, { prefix: opts.prefix });
  } else {
    await registerRoutes_${vSlug}_${sSlug}(fastify);
  }
}

// Export as Fastify plugin (encapsulated)
export default fp(${sSlug}GatewayPlugin, {
  fastify: "5.x",
  name: "${sSlug}-gateway",
});

// Named export for convenience
export { ${sSlug}GatewayPlugin };
`;

  fs.writeFileSync(path.join(outDir, "plugin.ts"), pluginTs, "utf8");
}

/**
 * Emits a type-check fixture that verifies plugin-client type compatibility
 *
 * Generates `_typecheck.ts` in the gateway output directory. This file is
 * picked up by tsconfig.smoke.json and will fail to compile if the plugin
 * options interface diverges from the concrete client class.
 *
 * @param {string} outDir - Gateway output directory
 * @param {ClientMeta} clientMeta - Client metadata (className, pluginImportPath)
 * @param {"js"|"ts"|"bare"} importsMode - Import-extension mode
 */
export function emitTypeCheckFixture(
  outDir: string,
  clientMeta: ClientMeta,
  importsMode: "js" | "ts" | "bare"
): void {
  const suffix = importsMode === "bare" ? "" : `.${importsMode}`;

  const content = `/**
 * Type-check fixture — verifies plugin options accept the concrete client class.
 * Auto-generated. Not intended for runtime use.
 */
import type { ${clientMeta.className} } from "${clientMeta.pluginImportPath}";
import type { ${clientMeta.className}GatewayOptions } from "./plugin${suffix}";

// This function verifies structural compatibility at the type level.
// If the plugin options interface diverges from the client class, this
// will produce a compile error with a clear message.
function _assertClientCompatible(client: ${clientMeta.className}): void {
  const _opts: ${clientMeta.className}GatewayOptions = { client };
  void _opts;
}
void _assertClientCompatible;
`;

  fs.writeFileSync(path.join(outDir, "_typecheck.ts"), content, "utf8");
}

/**
 * Emits individual route files with full handler implementations
 *
 * For each operation:
 * - Creates routes/{slug}.ts with registerRoute_{slug} function
 * - Imports operation schema, types, and runtime utilities
 * - Implements handler that calls decorated client and returns envelope
 *
 * Note: Route URLs come from OpenAPI paths which already include any base path
 * configured during OpenAPI generation (--openapi-base-path).
 *
 * @param {string} outDir - Root output directory
 * @param {string} routesDir - Directory for individual route files
 * @param {string} versionSlug - Version slug for function naming
 * @param {string} serviceSlug - Service slug for function naming
 * @param {OperationMetadata[]} operations - Array of operation metadata
 * @param {"js"|"ts"|"bare"} importsMode - Import-extension mode
 * @param {ClientMeta} clientMeta - Client class metadata
 */
export function emitRouteFilesWithHandlers(
  outDir: string,
  routesDir: string,
  versionSlug: string,
  serviceSlug: string,
  operations: OperationMetadata[],
  importsMode: "js" | "ts" | "bare",
  clientMeta: ClientMeta
): void {
  fs.mkdirSync(routesDir, {recursive: true});

  // Sort operations for deterministic output
  operations.sort((a, b) => a.operationSlug.localeCompare(b.operationSlug));

  const suffix = importsMode === "bare" ? "" : `.${importsMode}`;
  const vSlug = slugName(versionSlug);
  const sSlug = slugName(serviceSlug);

  let routesTs = `import type { FastifyInstance } from "fastify";\n`;

  operations.forEach((op) => {
    const fnName = `registerRoute_${vSlug}_${sSlug}_${op.operationSlug.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    const routeFileBase = op.operationSlug;
    routesTs += `import { ${fnName} } from "./routes/${routeFileBase}${suffix}";\n`;

    // Generate individual route file with full handler
    const clientMethod = op.clientMethodName || op.operationId || op.operationSlug;
    // Type names for documentation; we use unknown at runtime since schema validation handles it
    const reqTypeName = op.requestTypeName || "unknown";
    const resTypeName = op.responseTypeName || "unknown";

    // Note: op.path comes from OpenAPI and already includes any base path
    let routeTs = `/**
 * Route: ${op.method.toUpperCase()} ${op.path}
 * Operation: ${op.operationId || op.operationSlug}
 * Request Type: ${reqTypeName}
 * Response Type: ${resTypeName} (wrapped in envelope)
 * Auto-generated - do not edit manually.
 */
import type { FastifyInstance } from "fastify";
import schema from "../schemas/operations/${op.operationSlug}.json" with { type: "json" };
import { buildSuccessEnvelope } from "../runtime${suffix}";

export async function ${fnName}(fastify: FastifyInstance) {
  fastify.route({
    method: "${op.method.toUpperCase()}",
    url: "${op.path}",
    schema,
    handler: async (request) => {
      const client = fastify.${clientMeta.decoratorName};
      const result = await client.${clientMethod}(request.body);
      return buildSuccessEnvelope(result.response);
    },
  });
}
`;

    fs.writeFileSync(path.join(routesDir, `${routeFileBase}.ts`), routeTs, "utf8");
  });

  // Generate routes.ts aggregator module
  const routeFnName = `registerRoutes_${vSlug}_${sSlug}`;
  routesTs += `
/**
 * Registers all ${serviceSlug} routes with the Fastify instance.
 * Route paths are determined by the OpenAPI specification (--openapi-base-path).
 */
export async function ${routeFnName}(fastify: FastifyInstance): Promise<void> {
`;

  // Generate route registration calls
  const routeCalls = operations.map((op) => {
    const fnName = `registerRoute_${vSlug}_${sSlug}_${op.operationSlug.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    return `  await ${fnName}(fastify);`;
  }).join("\n");

  routesTs += `  // Register all routes\n${routeCalls}\n`;
  routesTs += `}\n`;

  fs.writeFileSync(path.join(outDir, "routes.ts"), routesTs, "utf8");
}
