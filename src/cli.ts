#!/usr/bin/env node
/**
 * CLI Entry Point for TypeScript WSDL Client Generator
 *
 * This file implements the command-line interface for the wsdl-tsc tool, which generates
 * fully-typed TypeScript SOAP clients from WSDL/XSD schemas. The CLI supports subcommands for
 * client generation, OpenAPI generation, full pipeline, and gateway generation. The bare
 * invocation (no subcommand) is kept for backward compatibility and behaves like the client
 * command with legacy flags.
 */
import yargs from "yargs/yargs";
import {hideBin} from "yargs/helpers";
import fs from "node:fs";
import path from "node:path";

import {loadWsdl} from "./loader/wsdlLoader.js";
import {compileCatalog} from "./compiler/schemaCompiler.js";
import {generateTypes} from "./client/generateTypes.js";
import {generateUtils} from "./client/generateUtils.js";
import {generateCatalog} from "./client/generateCatalog.js";
import {generateClient} from "./client/generateClient.js";
import {generateOpenAPI} from "./openapi/generateOpenAPI.js";
import {runGenerationPipeline} from "./pipeline.js";
import {resolveCompilerOptions} from "./config.js";
import {
  resolveClientOut,
  resolveOpenApiOutBase,
  handleCLIError,
  warnDeprecated,
  resolveFormatOption,
  resolveValidateOption,
  parseStatusCodes,
  parseServers,
  info,
  success,
} from "./util/cli.js";


// Process command line arguments, removing the first two elements (node executable and script path)
const rawArgs = hideBin(process.argv);

// ---------------------------------------------------------------------------
// Client generation (default / legacy entrypoint)
// ---------------------------------------------------------------------------

// If first argument is not a known subcommand, treat this as client generation.
if (!rawArgs[0] || !["openapi", "pipeline", "gateway", "client"].includes(rawArgs[0])) {
  const clientArgv = await yargs(rawArgs)
    .version(false)
    .scriptName("wsdl-tsc")
    .usage("$0 --wsdl <file|url> [options]")
    .option("wsdl", {type: "string", demandOption: true, desc: "Path or URL to the WSDL"})
    // New layout flags
    .option("out", {type: "string", demandOption: true, desc: "Base output directory (root or legacy client dir)"})
    .option("service", {type: "string", desc: "Service slug used for folder layout"})
    .option("version", {type: "string", desc: "Version slug used for folder layout"})
    .option("client-out", {type: "string", desc: "Explicit client output directory (overrides standard layout)"})
    // Compiler flags (mirroring original CLI)
    .option("imports", {
      type: "string",
      choices: ["js", "ts", "bare"],
      default: "js",
      desc: "Intra-generated import specifiers: 'js', 'ts', or 'bare'.",
    })
    .option("catalog", {type: "boolean", default: false, desc: "Emit catalog.json for introspection"})
    .option("attributes-key", {type: "string", default: "$attributes"})
    .option("client-name", {type: "string"})
    .option("int64-as", {type: "string", choices: ["string", "number", "bigint"], default: "string"})
    .option("bigint-as", {type: "string", choices: ["string", "number"], default: "string"})
    .option("decimal-as", {type: "string", choices: ["string", "number"], default: "string"})
    .option("date-as", {type: "string", choices: ["string", "Date"], default: "string"})
    .option("choice", {type: "string", choices: ["all-optional", "union"], default: "all-optional"})
    .option("fail-on-unresolved", {type: "boolean", default: true})
    .option("nillable-as-optional", {type: "boolean", default: false})
    .strict()
    .help()
    .parse();

  // Determine client output directory
  let clientOutDir: string;
  const hasServiceOrVersion = !!clientArgv.service || !!clientArgv.version || !!clientArgv.clientOut;
  try {
    clientOutDir = resolveClientOut({
      out: clientArgv.out,
      service: clientArgv.service,
      version: clientArgv.version,
      clientOut: clientArgv.clientOut,
    });
  } catch (err) {
    // For pure legacy usage (no service/version and no client-out), fall back to treating --out as direct client folder
    if (!hasServiceOrVersion) {
      warnDeprecated(
        "Treating --out as direct client folder",
        "--service/--version or --client-out to opt into the standardized layout"
      );
      clientOutDir = path.resolve(String(clientArgv.out));
    } else {
      handleCLIError(err);
    }
  }

  // Load WSDL
  const wsdlCatalog = await loadWsdl(String(clientArgv.wsdl));

  // Build compiler options using shared resolver
  const compilerOptions = resolveCompilerOptions(
    {
      imports: clientArgv.imports as "js" | "ts" | "bare",
      catalog: clientArgv.catalog as boolean,
      primitive: {
        int64As: clientArgv["int64-as"] as any,
        bigIntegerAs: clientArgv["bigint-as"] as any,
        decimalAs: clientArgv["decimal-as"] as any,
        dateAs: clientArgv["date-as"] as any,
      },
      choice: clientArgv.choice as any,
      failOnUnresolved: clientArgv["fail-on-unresolved"] as boolean,
      attributesKey: clientArgv["attributes-key"] as string,
      clientName: clientArgv["client-name"] as string | undefined,
      nillableAsOptional: clientArgv["nillable-as-optional"] as boolean,
    },
    {
      wsdl: String(clientArgv.wsdl),
      out: clientOutDir,
    }
  );

  const compiled = compileCatalog(wsdlCatalog, compilerOptions);

  // Report counts of types and operations for user visibility
  info(`Schemas discovered: ${wsdlCatalog.schemas.length}`);
  info(`Compiled types: ${compiled.types.length}`);
  info(`Operations: ${compiled.operations.length}`);

  // Ensure output directory exists
  fs.mkdirSync(clientOutDir, {recursive: true});

  // Emit files (paths relative to clientOutDir)
  generateClient(path.join(clientOutDir, "client.ts"), compiled);
  generateTypes(path.join(clientOutDir, "types.ts"), compiled);
  generateUtils(path.join(clientOutDir, "utils.ts"), compiled);

  // Emit catalog if requested
  if (compiled.options.catalog) {
    generateCatalog(path.join(clientOutDir, "catalog.json"), compiled);
  }

  success(`Generated TypeScript client in ${clientOutDir}`);
  process.exit(0);
}

/**
 * Command handler for "openapi" subcommand
 *
 * This branch handles the OpenAPI generation mode, which creates OpenAPI 3.1 specifications
 * from either a direct WSDL source or a pre-compiled catalog.json file.
 */
if (rawArgs[0] === "openapi") {
  const openapiArgv = await yargs(rawArgs.slice(1))
    .version(false)
    .scriptName("wsdl-tsc openapi")
    .usage("$0 --wsdl <file|url> --out <dir> --service <slug> --version <slug> [options]")
    .option("wsdl", {type: "string", desc: "Path or URL to the WSDL (exclusive with --catalog)"})
    .option("catalog", {type: "string", desc: "Existing compiled catalog.json (exclusive with --wsdl)"})
    .option("out", {type: "string", demandOption: true, desc: "Base output directory (root)"})
    .option("service", {type: "string", demandOption: true, desc: "Service slug used for folder layout"})
    .option("version", {type: "string", demandOption: true, desc: "Version slug used for folder layout"})
    .option("openapi-out", {type: "string", desc: "Explicit OpenAPI output base (overrides standard layout)"})
    .option("format", {
      type: "string",
      choices: ["json", "yaml", "both"],
      desc: "Output format: json|yaml|both (default json)"
    })
    .option("yaml", {type: "boolean", default: false, desc: "[DEPRECATED] Use --format yaml or both"})
    .option("title", {type: "string", desc: "API title (defaults to derived service name)"})
    .option("version-tag", {type: "string", desc: "API version for info.version (default 0.0.0)"})
    .option("servers", {type: "string", desc: "Comma-separated server URLs"})
    .option("base-path", {type: "string", desc: "Base path prefix added before operation segments (e.g. /v1/soap)"})
    .option("path-style", {
      type: "string",
      choices: ["kebab", "asis", "lower"],
      default: "kebab",
      desc: "Path segment style applied to operation names"
    })
    .option("method", {
      type: "string",
      choices: ["post", "get", "put", "patch", "delete"],
      default: "post",
      desc: "Default HTTP method for all operations (can be overridden via --ops)"
    })
    .option("security", {type: "string", desc: "Path to security.json configuration"})
    .option("tags", {type: "string", desc: "Path to tags.json mapping operation name -> tag"})
    .option("ops", {
      type: "string",
      desc: "Path to ops.json per-operation overrides (method, deprecated, summary, description)"
    })
    .option("closed-schemas", {
      type: "boolean",
      default: false,
      desc: "Emit additionalProperties:false for object schemas"
    })
    .option("prune-unused-schemas", {
      type: "boolean",
      default: false,
      desc: "Emit only schemas reachable from operations"
    })
    .option("validate", {type: "boolean", default: true, desc: "Validate generated document (always on unless false)"})
    .option("no-validate", {type: "boolean", default: false, desc: "Alias for --validate=false"})
    .option("tag-style", {
      type: "string",
      choices: ["default", "first", "service"],
      default: "default",
      desc: "Heuristic for inferring tags when no --tags map provided"
    })
    .option("envelope-namespace", {
      type: "string",
      desc: "Override the standard response envelope base name segment (default <ServiceName>ResponseEnvelope or provided segment alone)"
    })
    .option("error-namespace", {
      type: "string",
      desc: "Override the standard error object schema name segment (default <ServiceName>ErrorObject or provided segment alone)"
    })
    .strict()
    .help()
    .parse();

  // Handle deprecated and conflicting options
  const format = resolveFormatOption(openapiArgv);
  const skipValidate = !resolveValidateOption(openapiArgv);

  if (!openapiArgv.wsdl && !openapiArgv.catalog) {
    handleCLIError("either --wsdl or --catalog must be provided for openapi generation");
  }
  if (openapiArgv.wsdl && openapiArgv.catalog) {
    handleCLIError("provide only one of --wsdl or --catalog, not both");
  }

  const servers = parseServers(openapiArgv.servers as string | undefined);

  let outBase: string;
  try {
    outBase = resolveOpenApiOutBase({
      out: openapiArgv.out,
      service: openapiArgv.service,
      version: openapiArgv.version,
      openapiOut: openapiArgv.openapiOut,
    });
  } catch (err) {
    handleCLIError(err);
  }

  const result = await generateOpenAPI({
    wsdl: openapiArgv.wsdl as string | undefined,
    catalogFile: openapiArgv.catalog as string | undefined,
    outFile: outBase,
    title: openapiArgv.title as string | undefined,
    version: (openapiArgv["version-tag"] as string | undefined) || undefined,
    servers,
    basePath: openapiArgv["base-path"] as string | undefined,
    pathStyle: openapiArgv["path-style"] as any,
    defaultMethod: openapiArgv.method as string | undefined,
    securityConfigFile: openapiArgv.security as string | undefined,
    tagsFile: openapiArgv.tags as string | undefined,
    opsFile: openapiArgv.ops as string | undefined,
    closedSchemas: openapiArgv["closed-schemas"] as boolean,
    pruneUnusedSchemas: openapiArgv["prune-unused-schemas"] as boolean,
    format,
    skipValidate,
    tagStyle: openapiArgv["tag-style"] as any,
    envelopeNamespace: openapiArgv["envelope-namespace"] as string | undefined,
    errorNamespace: openapiArgv["error-namespace"] as string | undefined,
  });

  // Report success with actual output path
  const generatedFiles = [result.jsonPath, result.yamlPath].filter(Boolean);
  if (generatedFiles.length > 0) {
    const outputPath = generatedFiles.length === 1
      ? generatedFiles[0]!
      : path.dirname(generatedFiles[0]!);
    success(`Generated OpenAPI specification in ${outputPath}`);
  }
  process.exit(0);
}

if (rawArgs[0] === "pipeline") {
  const pipelineArgv = await yargs(rawArgs.slice(1))
    .version(false)
    .scriptName("wsdl-tsc pipeline")
    .usage("$0 --wsdl <file|url> --out <dir> [--service <slug> --version <slug>] [options]")
    .option("wsdl", {type: "string", demandOption: true, desc: "Path or URL to the WSDL"})
    .option("out", {type: "string", demandOption: true, desc: "Base output directory (root)"})
    .option("service", {type: "string", desc: "Service slug used for folder layout (optional for legacy mode)"})
    .option("version", {type: "string", desc: "Version slug used for folder layout (optional for legacy mode)"})
    .option("clean", {
      type: "boolean",
      default: false,
      desc: "Remove existing contents of --out before generation (safety: will refuse if --out is project root)"
    })
    // Compiler flags
    .option("imports", {type: "string", choices: ["js", "ts", "bare"], default: "js"})
    .option("catalog", {type: "boolean", default: true})
    .option("attributes-key", {type: "string", default: "$attributes"})
    .option("int64-as", {type: "string", choices: ["string", "number", "bigint"], default: "string"})
    .option("bigint-as", {type: "string", choices: ["string", "number"], default: "string"})
    .option("decimal-as", {type: "string", choices: ["string", "number"], default: "string"})
    .option("date-as", {type: "string", choices: ["string", "Date"], default: "string"})
    .option("choice", {type: "string", choices: ["all-optional", "union"], default: "all-optional"})
    .option("fail-on-unresolved", {type: "boolean", default: false})
    .option("nillable-as-optional", {type: "boolean", default: false})
    // OpenAPI flags
    .option("openapi-out", {type: "string", desc: "Output base or file for OpenAPI (if omitted chooses openapi.json)"})
    .option("format", {type: "string", choices: ["json", "yaml", "both"], desc: "OpenAPI output format (default json)"})
    .option("yaml", {type: "boolean", default: false, desc: "[DEPRECATED] Use --format yaml or both"})
    .option("validate", {type: "boolean", default: true, desc: "Validate OpenAPI output"})
    .option("no-validate", {type: "boolean", default: false, desc: "Alias for --validate=false"})
    .option("tag-style", {type: "string", choices: ["default", "first", "service"], default: "default"})
    .option("servers", {type: "string"})
    .option("base-path", {type: "string"})
    .option("path-style", {type: "string", choices: ["kebab", "asis", "lower"], default: "kebab"})
    .option("method", {type: "string", choices: ["post", "get", "put", "patch", "delete"], default: "post"})
    .option("security", {type: "string"})
    .option("tags", {type: "string"})
    .option("ops", {type: "string"})
    .option("closed-schemas", {type: "boolean", default: false})
    .option("prune-unused-schemas", {type: "boolean", default: false})
    // Envelope feature flags
    .option("envelope-namespace", {type: "string"})
    .option("error-namespace", {type: "string"})
    // Gateway flags
    .option("gateway-out", {type: "string", desc: "Output directory for gateway code (enables gateway generation)"})
    .option("gateway-version", {
      type: "string",
      desc: "Version slug for gateway URN generation (auto-detected if omitted)"
    })
    .option("gateway-service", {
      type: "string",
      desc: "Service slug for gateway URN generation (auto-detected if omitted)"
    })
    .option("gateway-default-response-status-codes", {
      type: "string",
      desc: "Comma-separated status codes for gateway (default: 200,400,401,403,404,409,422,429,500,502,503,504)"
    })
    .strict()
    .help()
    .parse();

  // Handle deprecated and conflicting options
  const format = resolveFormatOption(pipelineArgv);
  const skipValidate = !resolveValidateOption(pipelineArgv);

  const outRoot = path.resolve(String(pipelineArgv.out));
  const serviceSlug = pipelineArgv.service as string | undefined;
  const versionSlug = pipelineArgv.version as string | undefined;
  const hasSlugs = !!serviceSlug && !!versionSlug;

  if (pipelineArgv.clean) {
    const projectRoot = path.resolve(process.cwd());
    if (outRoot === projectRoot) {
      handleCLIError("Refusing to clean project root. Choose a subdirectory for --out.", 2);
    }
    if (fs.existsSync(outRoot)) {
      fs.rmSync(outRoot, {recursive: true, force: true});
    }
  }

  const servers = parseServers(pipelineArgv.servers as string | undefined);

  // Derive OpenAPI output base when not explicitly provided and slugs are available
  const explicitOpenapiOut = pipelineArgv["openapi-out"] as string | undefined;
  const effectiveOpenapiOut = explicitOpenapiOut
    ? explicitOpenapiOut
    : (hasSlugs ? path.join(outRoot, "openapi", serviceSlug!, versionSlug!, "openapi") : undefined);

  // Parse gateway default response status codes if provided
  let gatewayDefaultResponseStatusCodes: number[] | undefined;
  if (pipelineArgv["gateway-default-response-status-codes"]) {
    try {
      gatewayDefaultResponseStatusCodes = parseStatusCodes(
        String(pipelineArgv["gateway-default-response-status-codes"]),
        "--gateway-default-response-status-codes"
      );
    } catch (err) {
      handleCLIError(err);
    }
  }

  const explicitGatewayOut = pipelineArgv["gateway-out"] as string | undefined;
  const effectiveGatewayOut = explicitGatewayOut
    ? explicitGatewayOut
    : (hasSlugs ? path.join(outRoot, "src", versionSlug!, serviceSlug!) : undefined);

  await runGenerationPipeline({
    wsdl: pipelineArgv.wsdl as string,
    outDir: outRoot,
    compiler: {
      imports: pipelineArgv.imports as any,
      catalog: pipelineArgv.catalog as boolean,
      attributesKey: pipelineArgv["attributes-key"] as string,
      primitive: {
        int64As: pipelineArgv["int64-as"] as any,
        bigIntegerAs: pipelineArgv["bigint-as"] as any,
        decimalAs: pipelineArgv["decimal-as"] as any,
        dateAs: pipelineArgv["date-as"] as any,
      },
      choice: pipelineArgv.choice as any,
      failOnUnresolved: pipelineArgv["fail-on-unresolved"] as boolean,
      nillableAsOptional: pipelineArgv["nillable-as-optional"] as boolean,
    },
    openapi: {
      outFile: effectiveOpenapiOut,
      format,
      skipValidate,
      tagStyle: pipelineArgv["tag-style"] as any,
      servers,
      basePath: pipelineArgv["base-path"] as string | undefined,
      pathStyle: pipelineArgv["path-style"] as any,
      defaultMethod: pipelineArgv.method as string,
      securityConfigFile: pipelineArgv.security as string | undefined,
      tagsFile: pipelineArgv.tags as string | undefined,
      opsFile: pipelineArgv.ops as string | undefined,
      closedSchemas: pipelineArgv["closed-schemas"] as boolean,
      pruneUnusedSchemas: pipelineArgv["prune-unused-schemas"] as boolean,
      envelopeNamespace: pipelineArgv["envelope-namespace"] as string | undefined,
      errorNamespace: pipelineArgv["error-namespace"] as string | undefined,
    },
    gateway: effectiveGatewayOut ? {
      outDir: effectiveGatewayOut,
      versionSlug: (pipelineArgv["gateway-version"] as string | undefined) || versionSlug,
      serviceSlug: (pipelineArgv["gateway-service"] as string | undefined) || serviceSlug,
      defaultResponseStatusCodes: gatewayDefaultResponseStatusCodes,
    } : undefined,
  });

  process.exit(0);
}

/**
 * Command handler for "gateway" subcommand
 *
 * This branch handles the Fastify gateway generation mode, which creates production-ready
 * Fastify route scaffolding and JSON Schema validation from OpenAPI 3.1 specifications.
 */
if (rawArgs[0] === "gateway") {
  const {generateGateway} = await import("./gateway/generateGateway.js");

  const gatewayArgv = await yargs(rawArgs.slice(1))
    .version(false)
    .scriptName("wsdl-tsc gateway")
    .usage("$0 --openapi <file> --out <dir> [options]")
    .option("openapi", {
      type: "string",
      demandOption: true,
      desc: "Path to OpenAPI 3.1 JSON file"
    })
    .option("out", {
      type: "string",
      demandOption: true,
      desc: "Output directory for gateway code"
    })
    .option("version", {
      type: "string",
      desc: "Version slug for URN generation (auto-detected if omitted)"
    })
    .option("service", {
      type: "string",
      desc: "Service slug for URN generation (auto-detected if omitted)"
    })
    .option("imports", {
      type: "string",
      choices: ["js", "ts", "bare"],
      default: "js",
      desc: "Import-extension mode for generated TypeScript modules (mirrors global --imports)",
    })
    .option("default-response-status-codes", {
      type: "string",
      desc: "Comma-separated status codes to backfill with default response (default: 200,400,401,403,404,409,422,429,500,502,503,504)"
    })
    .strict()
    .help()
    .parse();

  // Parse default response status codes
  let defaultResponseStatusCodes: number[] | undefined;
  if (gatewayArgv["default-response-status-codes"]) {
    try {
      defaultResponseStatusCodes = parseStatusCodes(
        String(gatewayArgv["default-response-status-codes"]),
        "--default-response-status-codes"
      );
    } catch (err) {
      handleCLIError(err);
    }
  }

  // Generate gateway code
  const outDir = path.resolve(gatewayArgv.out as string);
  await generateGateway({
    openapiFile: gatewayArgv.openapi as string,
    outDir,
    versionSlug: gatewayArgv.version as string | undefined,
    serviceSlug: gatewayArgv.service as string | undefined,
    defaultResponseStatusCodes,
    imports: gatewayArgv.imports as "js" | "ts" | "bare",
  });

  success(`Gateway code generated in ${outDir}`);
  process.exit(0);
}
