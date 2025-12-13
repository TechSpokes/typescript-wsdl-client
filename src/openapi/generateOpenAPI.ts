/**
 * OpenAPI 3.1 Generator from WSDL
 *
 * Generates OpenAPI 3.1 specs from WSDL documents or compiled catalogs.
 * Converts SOAP web services into REST-style APIs by producing an OpenAPI
 * definition aligned with the TypeScript model from the WSDL client generator.
 *
 * Core features:
 * - Supports multiple input types: WSDL URL, file path, compiled catalog, or in-memory catalog
 * - Emits deterministic schemas and paths matching generated TypeScript output
 * - Integrates security schemes and header parameters from `security.json`
 * - Uses tagging heuristics with optional tag and operation override files
 * - Outputs in JSON, YAML, or both, with optional schema validation
 * - Includes a Standard Response Envelope (since 0.7.1)
 *   - Automatically wraps responses in a base envelope plus per-payload extensions
 *   - Provides consistent top-level fields: `status`, `message`, `data`, `error`
 *   - Customizable via `--envelope-namespace` and `--error-namespace`
 *
 * Naming rules:
 * - Namespace flags are used verbatim for component names
 * - Defaults: `${serviceName}ResponseEnvelope` and `${serviceName}ErrorObject`
 * - Each operation output defines `<PayloadType|OpName><EnvelopeNamespace>` extension schemas
 * - All schemas, paths, methods, security schemes, and parameters are alphabetically sorted for easy diffs
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import {loadWsdl} from "../loader/wsdlLoader.js";
import {compileCatalog, type CompiledCatalog} from "../compiler/schemaCompiler.js";
import {generateSchemas} from "./generateSchemas.js";
import {generatePaths} from "./generatePaths.js";
import {error, info, warn} from "../util/cli.js";
import {buildSecurity, loadSecurityConfig} from "./security.js";
import type {PathStyle} from "./casing.js";

/**
 * Options for OpenAPI generation from WSDL
 *
 * @interface GenerateOpenAPIOptions
 * @property {string} [wsdl] - Path or URL to WSDL file (exclusive with catalogFile and compiledCatalog)
 * @property {string} [catalogFile] - Path to existing compiled catalog.json (exclusive with wsdl and compiledCatalog)
 * @property {CompiledCatalog} [compiledCatalog] - Pre-compiled catalog in memory (exclusive with wsdl and catalogFile)
 * @property {string} [outFile] - Output path for generated OpenAPI specification
 * @property {string} [title] - API title (defaults to derived service name)
 * @property {string} [version] - API version for info.version (default 0.0.0)
 * @property {string} [description] - API description
 * @property {string[]} [servers] - List of server URLs
 * @property {string} [basePath] - Base path prefix (e.g., /v1/soap)
 * @property {PathStyle} [pathStyle] - Path segment style: kebab, asis, or lower
 * @property {string} [defaultMethod] - Default HTTP method: post, get, put, patch, delete
 * @property {string} [securityConfigFile] - Path to security.json configuration
 * @property {string} [tagsFile] - Path to tags.json mapping operation names to tags
 * @property {string} [opsFile] - Path to ops.json with per-operation overrides
 * @property {boolean} [closedSchemas] - Whether to emit additionalProperties:false
 * @property {boolean} [pruneUnusedSchemas] - Whether to exclude schemas not referenced by operations
 * @property {boolean} [asYaml] - Force YAML output regardless of extension (deprecated)
 * @property {boolean} [validate] - Whether to validate using swagger-parser
 * @property {"default"|"first"|"service"} [tagStyle] - Heuristic for deriving tags
 * @property {"json"|"yaml"|"both"} [format] - Output format (default: JSON)
 * @property {boolean} [skipValidate] - Skip validation (default: false)
 * @property {string} [envelopeNamespace] - Namespace segment for envelope (default ResponseEnvelope)
 * @property {string} [errorNamespace] - Namespace segment for error object (default ErrorObject)
 */
export interface GenerateOpenAPIOptions {
  wsdl?: string;
  catalogFile?: string;
  outFile?: string;
  title?: string;
  version?: string;
  description?: string;
  servers?: string[];
  basePath?: string;
  pathStyle?: PathStyle;
  defaultMethod?: string;
  securityConfigFile?: string;
  tagsFile?: string;
  opsFile?: string;
  closedSchemas?: boolean;
  pruneUnusedSchemas?: boolean;
  asYaml?: boolean;
  validate?: boolean;
  tagStyle?: "default" | "first" | "service";
  compiledCatalog?: CompiledCatalog;
  format?: "json" | "yaml" | "both";
  skipValidate?: boolean;
  envelopeNamespace?: string;
  errorNamespace?: string;
}

export async function generateOpenAPI(opts: GenerateOpenAPIOptions): Promise<{
  doc: any;
  jsonPath?: string;
  yamlPath?: string;
}> {
  // Normalize format (back-compat: asYaml overrides if provided and format not set)
  let format: "json" | "yaml" | "both" = opts.format || (opts.asYaml ? "yaml" : "json");
  if (format === "yaml" && opts.asYaml && opts.outFile && /\.json$/i.test(opts.outFile)) {
    // user asked for YAML but provided .json path → we'll still switch extension
  }

  if (!opts.compiledCatalog && !opts.wsdl && !opts.catalogFile) {
    throw new Error("Provide one of: compiledCatalog, wsdl, or catalogFile");
  }
  if ((opts.wsdl && opts.catalogFile) || (opts.compiledCatalog && (opts.wsdl || opts.catalogFile))) {
    // Not strictly an error, but disallow ambiguous multi-source inputs to keep deterministic
    // Users should supply only ONE source of truth.
    throw new Error("Provide only one source: compiledCatalog OR wsdl OR catalogFile");
  }

  let compiled: CompiledCatalog;
  if (opts.compiledCatalog) {
    compiled = opts.compiledCatalog;
  } else if (opts.catalogFile) {
    const raw = fs.readFileSync(opts.catalogFile, "utf8");
    compiled = JSON.parse(raw);
  } else {
    const wsdlCatalog = await loadWsdl(String(opts.wsdl));
    compiled = compileCatalog(wsdlCatalog, {
      // minimal compiler options (no generation side effects needed here)
      wsdl: String(opts.wsdl),
      out: "",
      imports: "js",
      catalog: false,
      primitive: {int64As: "string", bigIntegerAs: "string", decimalAs: "string", dateAs: "string"},
      choice: "all-optional",
      failOnUnresolved: false,
      attributesKey: "$attributes",
      nillableAsOptional: false,
      clientName: undefined,
    });
  }

  const title = opts.title || (compiled.serviceName ? `${compiled.serviceName} SOAP API` : "Generated SOAP API");
  const infoVersion = opts.version || "0.0.0";

  // Load external config files (optional)
  const tagsMap = opts.tagsFile ? safeJson(opts.tagsFile) : undefined;
  const opsOverrides = opts.opsFile ? safeJson(opts.opsFile) : undefined;
  const securityCfg = loadSecurityConfig(opts.securityConfigFile);
  const securityBuilt = buildSecurity(securityCfg);

  // Build components.schemas
  const schemas = generateSchemas(compiled, {
    closedSchemas: opts.closedSchemas,
    pruneUnusedSchemas: opts.pruneUnusedSchemas,
  });

  // Build paths
  const tagStyle = opts.tagStyle || "default";
  const defaultTag = (() => {
    if (tagStyle === "service") return compiled.serviceName || "SOAP";
    if (tagStyle === "first") return "General"; // fallback; per-op derivation below
    return compiled.serviceName || "SOAP";
  })();
  const paths = generatePaths(compiled, {
    basePath: opts.basePath || "/",
    pathStyle: opts.pathStyle || "kebab",
    defaultMethod: opts.defaultMethod || "post",
    tagsMap,
    overrides: opsOverrides,
    defaultTag,
    opSecurity: securityBuilt.opSecurity,
    opHeaderParameters: securityBuilt.opHeaderParameters,
  });

  // --- Standard Envelope (always enabled since 0.7.1) ---
  const serviceName = compiled.serviceName || "Service";
  const envelopeNamespace = opts.envelopeNamespace || "ResponseEnvelope";
  const errorNamespace = opts.errorNamespace || "ErrorObject";

  function leadingToken(ns: string): string {
    return ns.match(/^[A-Z][a-z0-9]*/)?.[0] || ns;
  }

  function joinWithNamespace(base: string, ns: string): string {
    const token = leadingToken(ns);
    return base.endsWith(token) ? `${base}_${ns}` : `${base}${ns}`;
  }

  const baseEnvelopeName = opts.envelopeNamespace
    ? envelopeNamespace
    : joinWithNamespace(serviceName, envelopeNamespace);
  const errorSchemaName = opts.errorNamespace
    ? errorNamespace
    : joinWithNamespace(serviceName, errorNamespace);

  const errorSchema = {
    type: "object",
    properties: {
      code: {type: "string"},
      message: {type: "string"},
      details: {anyOf: [{type: "object", additionalProperties: true}, {type: "null"}]},
    },
    required: ["code", "message"],
    additionalProperties: false,
    description: "Standard error object for REST responses (not reused for underlying SOAP faults).",
  };

  const baseEnvelopeSchema = {
    type: "object",
    properties: {
      status: {type: "string", description: "Machine-readable high-level status (e.g. SUCCESS, FAILURE, PENDING)."},
      message: {
        anyOf: [{type: "string"}, {type: "null"}],
        description: "Diagnostic/logging message (not for end-user display)."
      },
      data: {anyOf: [{}, {type: "null"}], description: "Primary payload; per-operation extension refines the shape."},
      error: {
        anyOf: [{$ref: `#/components/schemas/${errorSchemaName}`}, {type: "null"}],
        description: "Error details when status indicates failure; null otherwise."
      },
    },
    required: ["status", "data", "error", "message"],
    additionalProperties: true,
    description: "Standard API response envelope base schema.",
  };

  const extensionSchemas: Record<string, any> = {};
  for (const op of compiled.operations) {
    const payloadType = op.outputElement?.local;
    const payloadRef = payloadType && schemas[payloadType] ? {$ref: `#/components/schemas/${payloadType}`} : {type: "object"};
    const baseForExt = payloadType || op.name;
    const extName = joinWithNamespace(baseForExt, envelopeNamespace);
    if (extensionSchemas[extName]) continue; // de-dupe
    extensionSchemas[extName] = {
      allOf: [
        {$ref: `#/components/schemas/${baseEnvelopeName}`},
        {type: "object", properties: {data: {anyOf: [payloadRef, {type: "null"}]}}, additionalProperties: true}
      ],
      description: `Envelope for ${payloadType || op.name} operation output wrapping its payload in 'data'.`
    };
  }

  // Merge all schemas: add base + extensions + error then original schemas, then final alphabetical sort of all keys
  const mergedSchemas: Record<string, any> = {
    [baseEnvelopeName]: baseEnvelopeSchema,
    ...extensionSchemas,
    [errorSchemaName]: errorSchema,
    ...schemas,
  };
  const sortedSchemaKeys = Object.keys(mergedSchemas).sort((a, b) => a.localeCompare(b));
  const finalSchemas: Record<string, any> = {};
  for (const k of sortedSchemaKeys) finalSchemas[k] = mergedSchemas[k];

  // Update paths response schemas to reference extension envelopes
  for (const pathItem of Object.values(paths)) {
    for (const methodObj of Object.values(pathItem as any)) {
      const opId = (methodObj as any).operationId;
      if (!opId) continue;
      const op = compiled.operations.find(o => o.name === opId);
      if (!op) continue;
      const payloadType = op.outputElement?.local;
      const baseForExt = payloadType || op.name;
      const extName = joinWithNamespace(baseForExt, envelopeNamespace);
      if ((methodObj as any).responses?.["200"]) {
        (methodObj as any).responses["200"].description = "Successful operation (standard envelope)";
        (methodObj as any).responses["200"].content = {"application/json": {schema: {$ref: `#/components/schemas/${extName}`}}};
      }
      if ((methodObj as any).responses?.default) {
        (methodObj as any).responses.default.description = "Error response (standard envelope with populated error object)";
        (methodObj as any).responses.default.content = {"application/json": {schema: {$ref: `#/components/schemas/${baseEnvelopeName}`}}};
      }
    }
  }
  // --- End Standard Envelope ---

  // Sort paths and methods alphabetically for diff-friendly output
  const sortedPathKeys = Object.keys(paths).sort((a, b) => a.localeCompare(b));
  const sortedPaths: Record<string, any> = {};
  for (const p of sortedPathKeys) {
    const ops = paths[p];
    const methodKeys = Object.keys(ops).sort((a, b) => a.localeCompare(b));
    const sortedOps: Record<string, any> = {};
    for (const m of methodKeys) sortedOps[m] = ops[m];
    sortedPaths[p] = sortedOps;
  }

  // Sort securitySchemes & parameters if present
  let sortedSecuritySchemes: Record<string, any> | undefined;
  if (securityBuilt.securitySchemes) {
    sortedSecuritySchemes = {};
    for (const k of Object.keys(securityBuilt.securitySchemes).sort((a, b) => a.localeCompare(b))) {
      sortedSecuritySchemes[k] = securityBuilt.securitySchemes[k];
    }
  }
  let sortedParameters: Record<string, any> | undefined;
  if (Object.keys(securityBuilt.headerParameters).length) {
    sortedParameters = {};
    for (const k of Object.keys(securityBuilt.headerParameters).sort((a, b) => a.localeCompare(b))) {
      sortedParameters[k] = securityBuilt.headerParameters[k];
    }
  }

  // Ensure operation tags arrays are deterministic (alphabetical unique) for diff-friendly output
  for (const p of Object.keys(sortedPaths)) {
    const pathItem = sortedPaths[p];
    for (const m of Object.keys(pathItem)) {
      const op = (pathItem as any)[m];
      if (Array.isArray(op.tags)) {
        const tags: string[] = Array.from(new Set(op.tags as string[])).map(t => String(t));
        tags.sort((a, b) => a.localeCompare(b));
        op.tags = tags;
      }
    }
  }

  // Build components object then sort its top-level keys for stable ordering
  const componentsRaw: Record<string, any> = {
    schemas: finalSchemas,
    ...(sortedSecuritySchemes ? {securitySchemes: sortedSecuritySchemes} : {}),
    ...(sortedParameters ? {parameters: sortedParameters} : {}),
  };
  const componentKeyOrder = Object.keys(componentsRaw).sort((a, b) => a.localeCompare(b));
  const components: Record<string, any> = {};
  for (const k of componentKeyOrder) components[k] = componentsRaw[k];

  const doc: any = {
    openapi: "3.1.0",
    // NOTE: jsonSchemaDialect intentionally omitted unless a future flag requires non-default dialect.
    info: {title, version: infoVersion},
    paths: sortedPaths,
    components,
  };
  if (opts.description) doc.info.description = opts.description;
  if (opts.servers && opts.servers.length) {
    doc.servers = opts.servers.map(u => ({url: u}));
  } else {
    // Provide a deterministic default relative server for spec completeness & gateway friendliness.
    doc.servers = [{url: "/"}];
  }

  if (opts.skipValidate !== true) {
    try {
      const parser = await import("@apidevtools/swagger-parser");
      await parser.default.validate(JSON.parse(JSON.stringify(doc)));
      // Validation passed - no message needed (only report failures)
    } catch (e) {
      error(`OpenAPI validation failed: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  } else {
    info("OpenAPI validation skipped by flag");
  }

  // Determine base path for writing
  let base: string | undefined = opts.outFile;
  if (base) {
    const extMatch = base.match(/\.(json|ya?ml)$/i);
    if (extMatch) {
      base = base.slice(0, -extMatch[0].length); // strip extension
    }
  }
  let jsonPath: string | undefined;
  let yamlPath: string | undefined;

  if (opts.outFile) {
    const dir = path.dirname(opts.outFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});

    if (format === "json") {
      jsonPath = base ? `${base}.json` : opts.outFile;
      fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2), "utf8");
    } else if (format === "yaml") {
      yamlPath = base ? `${base}.yaml` : opts.outFile.replace(/\.(json)$/i, ".yaml");
      fs.writeFileSync(yamlPath, yaml.dump(doc), "utf8");
    } else { // both
      jsonPath = `${base}.json`;
      yamlPath = `${base}.yaml`;
      fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2), "utf8");
      fs.writeFileSync(yamlPath, yaml.dump(doc), "utf8");
    }
  }

  return {doc, jsonPath, yamlPath};
}

function safeJson(file: string): any | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    warn(`Failed to parse JSON file '${file}': ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}
