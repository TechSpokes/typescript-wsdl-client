#!/usr/bin/env node
/**
 * CLI Entry Point for TypeScript WSDL Client Generator
 *
 * This file implements the command-line interface for the wsdl-tsc tool, which generates
 * fully-typed TypeScript SOAP clients from WSDL/XSD schemas. The CLI supports two main commands:
 *
 * 1. Default command (wsdl-tsc): Generates TypeScript client code from WSDL
 * 2. OpenAPI subcommand (wsdl-tsc openapi): Generates OpenAPI 3.1 specifications from WSDL
 *
 * The CLI is built using yargs for argument parsing and provides extensive options for
 * customizing the code generation process, including TypeScript output configurations and
 * OpenAPI specification details.
 */
import yargs from "yargs/yargs";
import {hideBin} from "yargs/helpers";
import fs from "node:fs";
import path from "node:path";

import {loadWsdl} from "./loader/wsdlLoader.js";
import {compileCatalog} from "./compiler/schemaCompiler.js";
import {emitTypes} from "./emit/typesEmitter.js";
import {emitUtils} from "./emit/utilsEmitter.js";
import {emitCatalog} from "./emit/catalogEmitter.js";
import {emitClient} from "./emit/clientEmitter.js";
import {generateOpenAPI} from "./openapi/generateOpenAPI.js";
import {runGenerationPipeline} from "./pipeline.js";

// Process command line arguments, removing the first two elements (node executable and script path)
const rawArgs = hideBin(process.argv);

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
    .usage("$0 --wsdl <file|url> --out <openapi.(json|yaml)> [options]")
    .option("wsdl", {type: "string", desc: "Path or URL to the WSDL (exclusive with --catalog)"})
    .option("catalog", {type: "string", desc: "Existing compiled catalog.json (exclusive with --wsdl)"})
    .option("out", {type: "string", demandOption: true, desc: "Output path (base or with extension)"})
    .option("format", {
      type: "string",
      choices: ["json", "yaml", "both"],
      desc: "Output format: json|yaml|both (default json)"
    })
    .option("yaml", {type: "boolean", default: false, desc: "[DEPRECATED] Use --format yaml or both"})
    .option("title", {type: "string", desc: "API title (defaults to derived service name)"})
    .option("version", {type: "string", desc: "API version for info.version (default 0.0.0)"})
    .option("servers", {type: "string", desc: "Comma-separated server URLs"})
    .option("basePath", {type: "string", desc: "Base path prefix added before operation segments (e.g. /v1/soap)"})
    .option("pathStyle", {
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
    .option("closedSchemas", {
      type: "boolean",
      default: false,
      desc: "Emit additionalProperties:false for object schemas"
    })
    .option("pruneUnusedSchemas", {
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
    // Standard envelope feature flags
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

  // Show deprecation warning for the legacy --yaml option
  if (openapiArgv.yaml && !openapiArgv.format) {
    console.warn("[deprecation] --yaml is deprecated; use --format yaml or --format both");
  }

  // Handle the no-validate flag which overrides the validate option
  if (openapiArgv["no-validate"]) {
    openapiArgv.validate = false;
  }

  // Validate that either --wsdl or --catalog is provided, but not both
  if (!openapiArgv.wsdl && !openapiArgv.catalog) {
    console.error("Error: either --wsdl or --catalog must be provided for openapi generation.");
    process.exit(1);
  }
  if (openapiArgv.wsdl && openapiArgv.catalog) {
    console.error("Error: provide only one of --wsdl or --catalog, not both.");
    process.exit(1);
  }

  // Parse server URLs from comma-separated string
  const servers = (openapiArgv.servers ? String(openapiArgv.servers).split(",").map(s => s.trim()).filter(Boolean) : []);

  // Determine output format, with backwards compatibility for the --yaml flag
  const inferredFormat = (openapiArgv.format as any) || (openapiArgv.yaml ? "yaml" : undefined);

  // Call the OpenAPI generator with the parsed options
  await generateOpenAPI({
    wsdl: openapiArgv.wsdl as string | undefined,
    catalogFile: openapiArgv.catalog as string | undefined,
    outFile: openapiArgv.out as string,
    title: openapiArgv.title as string | undefined,
    version: openapiArgv.version as string | undefined,
    servers,
    basePath: openapiArgv.basePath as string | undefined,
    pathStyle: openapiArgv.pathStyle as any,
    defaultMethod: openapiArgv.method as string | undefined,
    securityConfigFile: openapiArgv.security as string | undefined,
    tagsFile: openapiArgv.tags as string | undefined,
    opsFile: openapiArgv.ops as string | undefined,
    closedSchemas: openapiArgv.closedSchemas as boolean,
    pruneUnusedSchemas: openapiArgv.pruneUnusedSchemas as boolean,
    format: inferredFormat,
    skipValidate: openapiArgv.validate === false,
    tagStyle: openapiArgv["tag-style"] as any,
    envelopeNamespace: openapiArgv["envelope-namespace"] as string | undefined,
    errorNamespace: openapiArgv["error-namespace"] as string | undefined,
  });

  console.log(`✅ OpenAPI generation complete (${inferredFormat || 'json'})`);
  process.exit(0);
}

if (rawArgs[0] === "pipeline") {
  const pipelineArgv = await yargs(rawArgs.slice(1))
    .version(false)
    .scriptName("wsdl-tsc pipeline")
    .usage("$0 --wsdl <file|url> --out <dir> [options]")
    .option("wsdl", {type: "string", demandOption: true, desc: "Path or URL to the WSDL"})
    .option("out", {type: "string", demandOption: true, desc: "Output directory for TypeScript artifacts"})
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
    .option("basePath", {type: "string"})
    .option("pathStyle", {type: "string", choices: ["kebab", "asis", "lower"], default: "kebab"})
    .option("method", {type: "string", choices: ["post", "get", "put", "patch", "delete"], default: "post"})
    .option("security", {type: "string"})
    .option("tags", {type: "string"})
    .option("ops", {type: "string"})
    .option("closedSchemas", {type: "boolean", default: false})
    .option("pruneUnusedSchemas", {type: "boolean", default: false})
    // Envelope feature flags
    .option("envelope-namespace", {type: "string"})
    .option("error-namespace", {type: "string"})
    .strict()
    .help()
    .parse();
  if (pipelineArgv.yaml && !pipelineArgv.format) {
    console.warn("[deprecation] --yaml is deprecated; use --format yaml or --format both");
  }
  if (pipelineArgv["no-validate"]) {
    pipelineArgv.validate = false;
  }

  if (pipelineArgv.clean) {
    const resolvedOut = path.resolve(String(pipelineArgv.out));
    const projectRoot = path.resolve(process.cwd());
    if (resolvedOut === projectRoot) {
      console.error("Refusing to clean project root. Choose a subdirectory for --out.");
      process.exit(2);
    }
    if (fs.existsSync(resolvedOut)) {
      fs.rmSync(resolvedOut, {recursive: true, force: true});
    }
  }

  const servers = (pipelineArgv.servers ? String(pipelineArgv.servers).split(",").map(s => s.trim()).filter(Boolean) : []);
  const format = (pipelineArgv.format as any) || (pipelineArgv.yaml ? "yaml" : undefined);

  await runGenerationPipeline({
    wsdl: pipelineArgv.wsdl as string,
    outDir: pipelineArgv.out as string,
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
      outFile: pipelineArgv["openapi-out"] as string | undefined,
      format,
      skipValidate: pipelineArgv.validate === false,
      tagStyle: pipelineArgv["tag-style"] as any,
      servers,
      basePath: pipelineArgv.basePath as string | undefined,
      pathStyle: pipelineArgv.pathStyle as any,
      defaultMethod: pipelineArgv.method as string,
      securityConfigFile: pipelineArgv.security as string | undefined,
      tagsFile: pipelineArgv.tags as string | undefined,
      opsFile: pipelineArgv.ops as string | undefined,
      closedSchemas: pipelineArgv.closedSchemas as boolean,
      pruneUnusedSchemas: pipelineArgv.pruneUnusedSchemas as boolean,
      envelopeNamespace: pipelineArgv["envelope-namespace"] as string | undefined,
      errorNamespace: pipelineArgv["error-namespace"] as string | undefined,
    }
  });

  console.log(`✅ Pipeline complete (format=${format || 'json'})`);
  process.exit(0);
}

// ---------- Original generation CLI (unchanged) ----------
const argv = await yargs(rawArgs)
  .scriptName("wsdl-tsc")
  .option("wsdl", {
    type: "string",
    demandOption: true,
    desc: "Path or URL to the WSDL"
  })
  .option("out", {
    type: "string",
    demandOption: true,
    desc: "Output directory for generated files"
  })
  .option("imports", {
    type: "string",
    choices: ["js", "ts", "bare"] as const,
    default: "js",
    desc: "Intra-generated import specifiers: 'js', 'ts', or 'bare' (no extension). Default is 'js'.",
  })
  .option("catalog", {
    type: "boolean",
    default: false,
    desc: "Emit catalog.json file with complied catalog object for introspection. Default is false.",
  })
  .option("attributes-key", {
    type: "string",
    default: "$attributes",
    desc: "Key used by runtime marshaller for XML attributes",
  })
  .option("client-name", {
    type: "string",
    desc: "Override the generated client class name (exact export name). If not provided, it will be derived from the WSDL name or 'GeneratedSOAPClient' will be used.",
  })
  // Primitive mapping knobs (safe defaults)
  .option("int64-as", {
    type: "string",
    choices: ["string", "number", "bigint"] as const,
    default: "string",
    desc: "How to map xs:long/xs:unsignedLong",
  })
  .option("bigint-as", {
    type: "string",
    choices: ["string", "number"] as const,
    default: "string",
    desc: "How to map xs:integer family (positive/nonNegative/etc.)",
  })
  .option("decimal-as", {
    type: "string",
    choices: ["string", "number"] as const,
    default: "string",
    desc: "How to map xs:decimal (money/precision)",
  })
  .option("date-as", {
    type: "string",
    choices: ["string", "Date"] as const,
    default: "string",
    desc: "How to map date/time/duration types",
  })
  .option("choice", {
    type: "string",
    choices: ["all-optional", "union"] as const,
    default: "all-optional",
    desc: "Representation of <choice> elements: all-optional properties or discriminated union",
  })
  .option("fail-on-unresolved", {
    type: "boolean",
    default: true,
    desc: "Emit errors if any type references cannot be resolved in the WSDL schema",
  })
  .option("nillable-as-optional", {
    type: "boolean",
    default: false,
    desc: "Emit nillable elements as optional properties in types.",
  })
  .strict()
  .help()
  .parse();

const outDir = path.resolve(String(argv.out));

// Load & compile
const catalog = await loadWsdl(String(argv.wsdl));

const compiled = compileCatalog(
  catalog,
  {
    wsdl: argv.wsdl as string,
    out: argv.out as string,
    imports: argv.imports as "js" | "ts" | "bare",
    catalog: argv["catalog"] as boolean,
    primitive: {
      int64As: argv["int64-as"] as any,
      bigIntegerAs: argv["bigint-as"] as any,
      decimalAs: argv["decimal-as"] as any,
      dateAs: argv["date-as"] as any,
    },
    choice: argv.choice as any,
    failOnUnresolved: argv["fail-on-unresolved"] as boolean,
    attributesKey: argv["attributes-key"] as string,
    clientName: argv["client-name"] as string | undefined,
    nillableAsOptional: argv["nillable-as-optional"] as boolean,
  }
);

// Report counts of types and operations for user visibility
console.log(`Schemas discovered: ${catalog.schemas.length}`);
console.log(`Compiled types: ${compiled.types.length}`);
console.log(`Operations: ${compiled.operations.length}`);

// Ensure output directory exists
fs.mkdirSync(outDir, {recursive: true});

// Emit files
emitClient(path.join(outDir, "client.ts"), compiled);
emitTypes(path.join(outDir, "types.ts"), compiled);
emitUtils(path.join(outDir, "utils.ts"), compiled);

// Emit catalog if requested
if (compiled.options.catalog) {
  emitCatalog(path.join(outDir, "catalog.json"), compiled);
}

console.log(`✅ Generated TypeScript client in ${outDir}`);
