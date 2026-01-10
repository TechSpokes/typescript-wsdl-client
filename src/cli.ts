#!/usr/bin/env node
// noinspection RequiredAttributes,XmlDeprecatedElement,HtmlDeprecatedTag

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
import {generateCatalog} from "./compiler/generateCatalog.js";
import {generateClient} from "./client/generateClient.js";
import {generateOpenAPI} from "./openapi/generateOpenAPI.js";
import {runGenerationPipeline} from "./pipeline.js";
import {resolveCompilerOptions} from "./config.js";
import {
  emitClientArtifacts,
  handleCLIError,
  parseServers,
  parseStatusCodes,
  reportCompilationStats,
  reportOpenApiSuccess,
  success,
  validateGatewayRequirements,
} from "./util/cli.js";
import {buildCompilerOptionsFromArgv, buildOpenApiOptionsFromArgv} from "./util/builder.js";


// Process command line arguments, removing the first two elements (node executable and script path)
const rawArgs = hideBin(process.argv);

// ---------------------------------------------------------------------------
// Show help if no subcommand provided
// ---------------------------------------------------------------------------

if (!rawArgs[0] || !["compile", "client", "openapi", "gateway", "pipeline"].includes(rawArgs[0])) {
  await yargs(rawArgs)
    .version(false)
    .scriptName("wsdl-tsc")
    .usage("$0 <command> [options]")
    .command("compile", "Compile WSDL to catalog.json")
    .command("client", "Generate TypeScript SOAP client from WSDL or catalog")
    .command("openapi", "Generate OpenAPI specification from WSDL or catalog")
    .command("gateway", "Generate Fastify gateway from OpenAPI specification")
    .command("pipeline", "Run full generation pipeline (client + OpenAPI + gateway)")
    .demandCommand(1, "Please specify a command: compile, client, openapi, gateway, or pipeline")
    .strict()
    .help()
    .parse();
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Compile subcommand - Parse WSDL and generate catalog
// ---------------------------------------------------------------------------

if (rawArgs[0] === "compile") {
  const compileArgv = await yargs(rawArgs.slice(1))
    .version(false)
    .scriptName("wsdl-tsc compile")
    .usage("$0 --wsdl-source <file|url> --catalog-file <path> [options]")
    .option("wsdl-source", {type: "string", demandOption: true, desc: "Path or URL to the WSDL"})
    .option("catalog-file", {type: "string", demandOption: true, desc: "Output path for catalog.json"})
    // Compiler flags
    .option("import-extensions", {
      type: "string",
      choices: ["js", "ts", "bare"],
      default: "js",
      desc: "Intra-generated import specifiers: 'js', 'ts', or 'bare'.",
    })
    .option("client-attributes-key", {type: "string", default: "$attributes"})
    .option("client-class-name", {type: "string"})
    .option("client-int64-as", {type: "string", choices: ["string", "number", "bigint"], default: "string"})
    .option("client-bigint-as", {type: "string", choices: ["string", "number"], default: "string"})
    .option("client-decimal-as", {type: "string", choices: ["string", "number"], default: "string"})
    .option("client-date-as", {type: "string", choices: ["string", "Date"], default: "string"})
    .option("client-choice-mode", {type: "string", choices: ["all-optional", "union"], default: "all-optional"})
    .option("client-fail-on-unresolved", {type: "boolean", default: false})
    .option("client-nillable-as-optional", {type: "boolean", default: false})
    .strict()
    .help()
    .parse();

  const catalogOut = path.resolve(String(compileArgv["catalog-file"]));

  // Load WSDL
  const wsdlCatalog = await loadWsdl(String(compileArgv["wsdl-source"]));

  // Build compiler options using shared resolver and builder
  const compilerOptions = resolveCompilerOptions(
    {
      ...buildCompilerOptionsFromArgv(compileArgv),
      catalog: true, // Always emit catalog for compile subcommand
    },
    {
      wsdl: String(compileArgv["wsdl-source"]),
      out: path.dirname(catalogOut),
    }
  );

  const compiled = compileCatalog(wsdlCatalog, compilerOptions);

  // Report compilation statistics
  reportCompilationStats(wsdlCatalog, compiled);

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(catalogOut), {recursive: true});

  // Emit catalog
  generateCatalog(catalogOut, compiled);

  success(`Compiled catalog written to ${catalogOut}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Client generation subcommand
// ---------------------------------------------------------------------------

if (rawArgs[0] === "client") {
  const clientArgv = await yargs(rawArgs.slice(1))
    .version(false)
    .scriptName("wsdl-tsc client")
    .usage("$0 [--wsdl-source <file|url> | --catalog-file <file>] --client-dir <dir> [--catalog-file <path>] [options]")
    .option("wsdl-source", {
      type: "string",
      desc: "Path or URL to the WSDL (exclusive with --catalog-file when used as input)"
    })
    .option("catalog-file", {
      type: "string",
      desc: "Existing compiled catalog.json (for input), or output path when compiling from WSDL (default: tmp/catalog.json)"
    })
    .option("client-dir", {
      type: "string",
      demandOption: true,
      desc: "Directory for generated client (client.ts, types.ts, utils.ts)"
    })
    // Compiler flags
    .option("import-extensions", {
      type: "string",
      choices: ["js", "ts", "bare"],
      default: "js",
      desc: "Intra-generated import specifiers: 'js', 'ts', or 'bare'.",
    })
    .option("client-attributes-key", {type: "string", default: "$attributes"})
    .option("client-class-name", {type: "string"})
    .option("client-int64-as", {type: "string", choices: ["string", "number", "bigint"], default: "string"})
    .option("client-bigint-as", {type: "string", choices: ["string", "number"], default: "string"})
    .option("client-decimal-as", {type: "string", choices: ["string", "number"], default: "string"})
    .option("client-date-as", {type: "string", choices: ["string", "Date"], default: "string"})
    .option("client-choice-mode", {type: "string", choices: ["all-optional", "union"], default: "all-optional"})
    .option("client-fail-on-unresolved", {type: "boolean", default: false})
    .option("client-nillable-as-optional", {type: "boolean", default: false})
    .strict()
    .help()
    .parse();

  // Validate mutually exclusive options
  const hasWsdl = !!clientArgv["wsdl-source"];
  const hasCatalog = !!clientArgv["catalog-file"];

  if (!hasWsdl && !hasCatalog) {
    handleCLIError("either --wsdl-source or --catalog-file must be provided for client generation");
  }

  const clientOutDir = path.resolve(String(clientArgv["client-dir"]));

  let compiled: any;
  let catalogOutPath: string | undefined;

  // Determine if catalog-file is input or output based on wsdl-source presence
  if (hasWsdl && !hasCatalog) {
    // WSDL provided, no catalog-file: default catalog output to client-dir/catalog.json
    catalogOutPath = path.join(clientOutDir, "catalog.json");
  } else if (hasWsdl && hasCatalog) {
    // Both provided: catalog-file is output path
    catalogOutPath = path.resolve(String(clientArgv["catalog-file"]));
  } else {
    // Only catalog-file provided: it's an input, load it
    const catalogPath = path.resolve(String(clientArgv["catalog-file"]));
    const catalogContent = fs.readFileSync(catalogPath, "utf-8");
    compiled = JSON.parse(catalogContent);
    success(`Loaded catalog from ${catalogPath}`);
  }

  // If we need to compile from WSDL
  if (hasWsdl) {
    const wsdlCatalog = await loadWsdl(String(clientArgv["wsdl-source"]));

    // Build compiler options using shared resolver and builder
    const compilerOptions = resolveCompilerOptions(
      {
        ...buildCompilerOptionsFromArgv(clientArgv),
        catalog: true, // Always generate catalog when compiling from WSDL
      },
      {
        wsdl: String(clientArgv["wsdl-source"]),
        out: clientOutDir,
      }
    );

    compiled = compileCatalog(wsdlCatalog, compilerOptions);

    // Report compilation statistics
    reportCompilationStats(wsdlCatalog, compiled);

    // Emit catalog
    fs.mkdirSync(path.dirname(catalogOutPath!), {recursive: true});
    generateCatalog(catalogOutPath!, compiled);
    success(`Compiled catalog written to ${catalogOutPath}`);
  }

  // Emit client artifacts (excluding catalog since we already emitted it above if needed)
  emitClientArtifacts(clientOutDir, compiled, generateClient, generateTypes, generateUtils);
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
    .usage("$0 [--wsdl-source <file|url> | --catalog-file <file>] --openapi-file <path> [options]")
    .option("wsdl-source", {type: "string", desc: "Path or URL to the WSDL (exclusive with --catalog-file)"})
    .option("catalog-file", {type: "string", desc: "Existing compiled catalog.json (default: tmp/catalog.json if --wsdl-source not provided)"})
    .option("openapi-file", {type: "string", demandOption: true, desc: "Output file or base path for OpenAPI"})
    .option("openapi-format", {
      type: "string",
      choices: ["json", "yaml", "both"],
      desc: "Output format: json|yaml|both (default json)"
    })
    .option("openapi-title", {type: "string", desc: "API title (defaults to derived service name)"})
    .option("openapi-version-tag", {
      type: "string",
      desc: "API version tag for info.version (e.g. 1.0.2; default 0.0.0)"
    })
    .option("openapi-servers", {type: "string", desc: "Comma-separated server URLs"})
    .option("openapi-base-path", {
      type: "string",
      desc: "Base path prefix added before operation segments (e.g. /v1/soap)"
    })
    .option("openapi-path-style", {
      type: "string",
      choices: ["kebab", "asis", "lower"],
      default: "kebab",
      desc: "Path segment style applied to operation names"
    })
    .option("openapi-default-method", {
      type: "string",
      choices: ["post", "get", "put", "patch", "delete"],
      default: "post",
      desc: "Default HTTP method for all operations (can be overridden via --openapi-ops-file)"
    })
    .option("openapi-security-file", {type: "string", desc: "Path to security.json configuration"})
    .option("openapi-tags-file", {type: "string", desc: "Path to tags.json mapping operation name -> tag"})
    .option("openapi-ops-file", {
      type: "string",
      desc: "Path to ops.json per-operation overrides (method, deprecated, summary, description)"
    })
    .option("openapi-closed-schemas", {
      type: "boolean",
      default: false,
      desc: "Emit additionalProperties:false for object schemas"
    })
    .option("openapi-prune-unused-schemas", {
      type: "boolean",
      default: false,
      desc: "Emit only schemas reachable from operations"
    })
    .option("openapi-tag-style", {
      type: "string",
      choices: ["default", "first", "service"],
      default: "default",
      desc: "Heuristic for inferring tags when no map is provided"
    })
    .option("openapi-envelope-namespace", {
      type: "string",
      desc: "Override the standard response envelope base name segment"
    })
    .option("openapi-error-namespace", {
      type: "string",
      desc: "Override the standard error object schema name segment"
    })
    .strict()
    .help()
    .parse();

  // Resolve format
  const format = (openapiArgv["openapi-format"] as "json" | "yaml" | "both") ?? "json";

  // Default to {openapi-file-dir}/catalog.json if neither wsdl-source nor catalog-file provided
  if (!openapiArgv["wsdl-source"] && !openapiArgv["catalog-file"]) {
    const openapiFileArg = String(openapiArgv["openapi-file"]);
    const openapiDir = path.dirname(path.resolve(openapiFileArg));
    openapiArgv["catalog-file"] = path.join(openapiDir, "catalog.json");
  }

  if (openapiArgv["wsdl-source"] && openapiArgv["catalog-file"]) {
    handleCLIError("provide only one of --wsdl-source or --catalog-file, not both");
  }

  const servers = parseServers(openapiArgv["openapi-servers"] as string | undefined);
  const outBase = path.resolve(String(openapiArgv["openapi-file"]));

  const openApiOptions = buildOpenApiOptionsFromArgv(openapiArgv, format, servers);

  const result = await generateOpenAPI({
    ...openApiOptions,
    catalogFile: openapiArgv["catalog-file"] as string | undefined,
    outFile: outBase,
    wsdl: openapiArgv["wsdl-source"] as string | undefined,
  });

  // Report success
  reportOpenApiSuccess(result);
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
    .usage("$0 --openapi-file <file> --client-dir <dir> --gateway-dir <dir> --gateway-service-name <slug> --gateway-version-prefix <slug> [options]")
    .option("openapi-file", {
      type: "string",
      demandOption: true,
      desc: "Path to OpenAPI 3.1 JSON/YAML file"
    })
    .option("client-dir", {
      type: "string",
      demandOption: true,
      desc: "Path to client directory (where client.ts is located)"
    })
    .option("gateway-dir", {
      type: "string",
      demandOption: true,
      desc: "Output directory for gateway code"
    })
    .option("gateway-version-prefix", {
      type: "string",
      demandOption: true,
      desc: "Version prefix for URN generation (e.g. v1, v2, urn:1.0.2:schema)"
    })
    .option("gateway-service-name", {
      type: "string",
      demandOption: true,
      desc: "Service identifier for URN generation"
    })
    .option("import-extensions", {
      type: "string",
      choices: ["js", "ts", "bare"],
      default: "js",
      desc: "Import-extension mode for generated TypeScript modules",
    })
    .option("gateway-default-status-codes", {
      type: "string",
      desc: "Comma-separated status codes to backfill with default response (default: 200,400,401,403,404,409,422,429,500,502,503,504)"
    })
    .option("catalog-file", {
      type: "string",
      desc: "Path to catalog.json for operation metadata (enables type-safe handlers)"
    })
    .option("gateway-client-class-name", {
      type: "string",
      desc: "Override auto-detected SOAP client class name"
    })
    .option("gateway-decorator-name", {
      type: "string",
      desc: "Fastify decorator name for client (default: derived from service slug)"
    })
    .option("gateway-stub-handlers", {
      type: "boolean",
      default: false,
      desc: "Generate stub handlers instead of full implementations"
    })
    .option("gateway-skip-plugin", {
      type: "boolean",
      default: false,
      desc: "Skip generating plugin.ts wrapper"
    })
    .option("gateway-skip-runtime", {
      type: "boolean",
      default: false,
      desc: "Skip generating runtime.ts utilities"
    })
    .strict()
    .help()
    .parse();

  // Parse default response status codes
  let defaultResponseStatusCodes: number[] | undefined;
  if (gatewayArgv["gateway-default-status-codes"]) {
    try {
      defaultResponseStatusCodes = parseStatusCodes(
        String(gatewayArgv["gateway-default-status-codes"]),
        "--gateway-default-status-codes"
      );
    } catch (err) {
      handleCLIError(err);
    }
  }

  const outDir = path.resolve(gatewayArgv["gateway-dir"] as string);
  const clientDir = path.resolve(gatewayArgv["client-dir"] as string);

  await generateGateway({
    openapiFile: gatewayArgv["openapi-file"] as string,
    outDir,
    clientDir,
    versionSlug: gatewayArgv["gateway-version-prefix"] as string,
    serviceSlug: gatewayArgv["gateway-service-name"] as string,
    defaultResponseStatusCodes,
    imports: gatewayArgv["import-extensions"] as "js" | "ts" | "bare",
    catalogFile: gatewayArgv["catalog-file"] as string | undefined,
    clientClassName: gatewayArgv["gateway-client-class-name"] as string | undefined,
    clientDecoratorName: gatewayArgv["gateway-decorator-name"] as string | undefined,
    stubHandlers: gatewayArgv["gateway-stub-handlers"] as boolean,
    // Only override defaults if explicitly skipping (otherwise let generateGateway decide based on stubHandlers)
    emitPlugin: gatewayArgv["gateway-skip-plugin"] ? false : undefined,
    emitRuntime: gatewayArgv["gateway-skip-runtime"] ? false : undefined,
  });

  success(`Gateway code generated in ${outDir}`);
  process.exit(0);
}

if (rawArgs[0] === "pipeline") {
  const pipelineArgv = await yargs(rawArgs.slice(1))
    .version(false)
    .scriptName("wsdl-tsc pipeline")
    .usage("$0 --wsdl-source <file|url> [--client-dir <dir>] [--openapi-file <path>] [--gateway-dir <dir> --gateway-service-name <slug> --gateway-version-prefix <slug>] [--catalog-file <path>] [options]")
    .option("wsdl-source", {type: "string", demandOption: true, desc: "Path or URL to the WSDL"})
    // Per-artifact outputs
    .option("client-dir", {
      type: "string",
      desc: "Output directory for generated client (client.ts, types.ts, utils.ts)"
    })
    .option("openapi-file", {
      type: "string",
      desc: "Output base or file for OpenAPI (enables OpenAPI generation when provided)"
    })
    .option("gateway-dir", {
      type: "string",
      desc: "Output directory for gateway code (enables gateway generation when provided)"
    })
    .option("catalog-file", {
      type: "string",
      desc: "Output path for catalog.json (default: tmp/catalog.json)"
    })
    .option("clean", {
      type: "boolean",
      default: false,
      desc: "Remove existing contents of the client output directory before generation (safety: will refuse if it resolves to project root)"
    })
    // Compiler flags
    .option("import-extensions", {type: "string", choices: ["js", "ts", "bare"], default: "js"})
    .option("client-attributes-key", {type: "string", default: "$attributes"})
    .option("client-class-name", {type: "string"})
    .option("client-bigint-as", {type: "string", choices: ["string", "number"], default: "string"})
    .option("client-choice-mode", {type: "string", choices: ["all-optional", "union"], default: "all-optional"})
    .option("client-date-as", {type: "string", choices: ["string", "Date"], default: "string"})
    .option("client-decimal-as", {type: "string", choices: ["string", "number"], default: "string"})
    .option("client-fail-on-unresolved", {type: "boolean", default: false})
    .option("client-int64-as", {type: "string", choices: ["string", "number", "bigint"], default: "string"})
    .option("client-nillable-as-optional", {type: "boolean", default: false})
    // OpenAPI flags
    .option("openapi-format", {
      type: "string",
      choices: ["json", "yaml", "both"],
      desc: "OpenAPI output format (default json)"
    })
    .option("openapi-title", {type: "string"})
    .option("openapi-version-tag", {type: "string"})
    .option("openapi-tag-style", {type: "string", choices: ["default", "first", "service"], default: "default"})
    .option("openapi-servers", {type: "string"})
    .option("openapi-base-path", {type: "string"})
    .option("openapi-path-style", {type: "string", choices: ["kebab", "asis", "lower"], default: "kebab"})
    .option("openapi-default-method", {
      type: "string",
      choices: ["post", "get", "put", "patch", "delete"],
      default: "post"
    })
    .option("openapi-security-file", {type: "string"})
    .option("openapi-tags-file", {type: "string"})
    .option("openapi-ops-file", {type: "string"})
    .option("openapi-closed-schemas", {type: "boolean", default: false})
    .option("openapi-prune-unused-schemas", {type: "boolean", default: false})
    .option("openapi-envelope-namespace", {type: "string"})
    .option("openapi-error-namespace", {type: "string"})
    // Gateway flags
    .option("gateway-service-name", {
      type: "string",
      desc: "Service name for gateway URN generation (required when --gateway-dir is provided)"
    })
    .option("gateway-version-prefix", {
      type: "string",
      desc: "Version prefix for gateway URN generation (required when --gateway-dir is provided)"
    })
    .option("gateway-default-status-codes", {
      type: "string",
      desc: "Comma-separated status codes for gateway (default: 200,400,401,403,404,409,422,429,500,502,503,504)"
    })
    .strict()
    .help()
    .parse();

  const format = (pipelineArgv["openapi-format"] as "json" | "yaml" | "both") ?? "json";

  const clientOut = pipelineArgv["client-dir"] as string | undefined;
  const openapiOut = pipelineArgv["openapi-file"] as string | undefined;
  const gatewayOut = pipelineArgv["gateway-dir"] as string | undefined;
  const catalogOutArg = pipelineArgv["catalog-file"] as string | undefined;

  if (!clientOut && !openapiOut && !gatewayOut) {
    handleCLIError("At least one of --catalog-file, --client-dir, --openapi-file, or --gateway-dir must be provided for pipeline generation.");
  }

  // Determine catalog output path (always required since we always compile WSDL)
  let catalogOut: string;
  if (catalogOutArg) {
    catalogOut = path.resolve(catalogOutArg);
  } else if (clientOut) {
    // Default to client-dir/catalog.json
    catalogOut = path.join(path.resolve(clientOut), "catalog.json");
  } else if (openapiOut) {
    // Default to openapi-file-dir/catalog.json
    const openapiDir = path.dirname(path.resolve(openapiOut));
    catalogOut = path.join(openapiDir, "catalog.json");
  } else if (gatewayOut) {
    // Default to gateway-dir/catalog.json
    catalogOut = path.join(path.resolve(gatewayOut), "catalog.json");
  } else {
    // Fallback to tmp/catalog.json (should rarely happen due to validation above)
    catalogOut = path.resolve("tmp/catalog.json");
  }

  // Handle --clean flag for client output
  if (pipelineArgv.clean && clientOut) {
    const clientOutDir = path.resolve(clientOut);
    const projectRoot = path.resolve(process.cwd());
    if (clientOutDir === projectRoot) {
      handleCLIError("Refusing to clean project root. Choose a subdirectory for --client-dir.", 2);
    }
    if (fs.existsSync(clientOutDir)) {
      fs.rmSync(clientOutDir, {recursive: true, force: true});
    }
  }

  const servers = parseServers(pipelineArgv["openapi-servers"] as string | undefined);

  // Validate gateway requirements
  validateGatewayRequirements(
    gatewayOut,
    openapiOut,
    pipelineArgv["gateway-service-name"] as string | undefined,
    pipelineArgv["gateway-version-prefix"] as string | undefined
  );

  // Parse gateway default response status codes if provided
  let gatewayDefaultResponseStatusCodes: number[] | undefined;
  if (pipelineArgv["gateway-default-status-codes"]) {
    try {
      gatewayDefaultResponseStatusCodes = parseStatusCodes(
        String(pipelineArgv["gateway-default-status-codes"]),
        "--gateway-default-status-codes"
      );
    } catch (err) {
      handleCLIError(err);
    }
  }

  // Build options using helpers
  const compilerOptions = buildCompilerOptionsFromArgv(pipelineArgv);
  const openApiOptions = openapiOut
    ? buildOpenApiOptionsFromArgv(pipelineArgv, format, servers)
    : undefined;

  await runGenerationPipeline({
    wsdl: pipelineArgv["wsdl-source"] as string,
    clientOutDir: clientOut ? path.resolve(clientOut) : undefined,
    catalogOut,
    compiler: compilerOptions,
    openapi: openApiOptions ? {
      ...openApiOptions,
      outFile: path.resolve(openapiOut!),
    } : undefined,
    gateway: gatewayOut ? {
      defaultResponseStatusCodes: gatewayDefaultResponseStatusCodes,
      outDir: path.resolve(gatewayOut),
      serviceSlug: pipelineArgv["gateway-service-name"] as string,
      versionSlug: pipelineArgv["gateway-version-prefix"] as string,
    } : undefined,
  });

  process.exit(0);
}
