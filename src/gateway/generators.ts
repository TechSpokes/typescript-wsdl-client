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
import {type OpenAPIDocument, rewriteSchemaRefs, slugName,} from "./helpers.js";

/**
 * Emits individual JSON Schema files for each OpenAPI component schema
 *
 * Process:
 * 1. Creates schemas/models/ directory
 * 2. For each component schema:
 *    - Generates URN $id: urn:{version}.services.{service}.schemas.models.{slug}
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
    schemaIdByName[name] = `urn:schema:${versionSlug}:services:${serviceSlug}:models:${slug}`;
  }

  // Second pass: rewrite refs and emit files
  for (const [name, schema] of Object.entries(schemas)) {
    const slug = modelSlugByName[name];
    const cloned = rewriteSchemaRefs(schema, schemaIdByName);
    cloned.$id = schemaIdByName[name];
    const outPath = path.join(modelsDir, `${slug}.json`);
    fs.writeFileSync(outPath, JSON.stringify(cloned, null, 2), "utf8");
  }

  return schemaIdByName;
}

/**
 * Operation metadata for route generation
 */
export interface OperationMetadata {
  operationSlug: string;
  method: string;
  path: string;
}

/**
 * Emits Fastify-compatible operation schema files
 *
 * Schema structure:
 * {
 *   "$id": "urn:{version}.services.{service}.schemas.operations.{slug}",
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
        $id: `urn:schema:${versionSlug}:services:${serviceSlug}:operations:${operationSlug}`,
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

