/**
 * TypeScript WSDL Client Generation Pipeline
 *
 * This file implements the high-level generation pipeline that orchestrates the entire
 * process of converting a WSDL file into TypeScript client code and optionally an OpenAPI
 * specification. It serves as an integration layer between the various stages of the generation
 * process.
 */
import path from "node:path";
import fs from "node:fs";
import {loadWsdl} from "./loader/wsdlLoader.js";
import {compileCatalog} from "./compiler/schemaCompiler.js";
import {generateClient} from "./client/generateClient.js";
import {generateTypes} from "./client/generateTypes.js";
import {generateUtils} from "./client/generateUtils.js";
import {generateCatalog} from "./compiler/generateCatalog.js";
import {generateOpenAPI, type GenerateOpenAPIOptions} from "./openapi/generateOpenAPI.js";
import {generateGateway, type GenerateGatewayOptions} from "./gateway/generateGateway.js";
import {type CompilerOptions, resolveCompilerOptions} from "./config.js";
import {emitClientArtifacts, reportCompilationStats, reportOpenApiSuccess, success} from "./util/cli.js";

/**
 * Configuration options for the generation pipeline
 *
 * @interface PipelineOptions
 * @property {string} wsdl - Path or URL to the WSDL file to process
 * @property {string} catalogOut - Output path for catalog.json (always generated when compiling WSDL)
 * @property {string} [clientOutDir] - Optional client output directory; when provided, client artifacts are generated
 * @property {Partial<CompilerOptions>} [compiler] - Compiler options for type generation
 * @property {object} [openapi] - OpenAPI generation configuration (optional)
 * @property {string} openapi.outFile - Output path for OpenAPI specification
 * @property {object} [gateway] - Gateway generation configuration (optional, requires openapi and explicit versionSlug/serviceSlug)
 * @property {string} gateway.outDir - Output directory for gateway code
 * @property {string} gateway.versionSlug - Version identifier for URN generation (required)
 * @property {string} gateway.serviceSlug - Service identifier for URN generation (required)
 * @property {object} [app] - App generation configuration (optional, requires client, gateway, and openapi)
 * @property {string} app.appDir - Output directory for generated Fastify app
 * @property {"copy"|"reference"} [app.openapiMode] - How to handle OpenAPI file (default: "copy")
 */
export interface PipelineOptions {
  wsdl: string;
  catalogOut: string;
  clientOutDir?: string;
  compiler?: Partial<CompilerOptions>;
  openapi?: Omit<GenerateOpenAPIOptions, "wsdl" | "catalogFile" | "compiledCatalog"> & { outFile?: string };
  gateway?: Omit<GenerateGatewayOptions, "openapiFile" | "openapiDocument"> & {
    outDir?: string;
    versionSlug: string;
    serviceSlug: string;
  };
  app?: {
    appDir: string;
    openapiMode?: "copy" | "reference";
    force?: boolean;
    host?: string;
    port?: number;
    prefix?: string;
  };
}

/**
 * Runs the complete generation pipeline from WSDL to TypeScript artifacts and optionally OpenAPI/Gateway/App
 *
 * This function orchestrates the entire process:
 * 1. Loads and parses the WSDL from file or URL
 * 2. Compiles the WSDL into an internal catalog representation
 * 3. Emits TypeScript client code, types, and utilities
 * 4. Optionally emits a JSON catalog for introspection
 * 5. Optionally generates an OpenAPI 3.1 specification
 * 6. Optionally generates Fastify gateway code from the OpenAPI spec
 * 7. Optionally generates a runnable Fastify app that uses client and gateway
 *
 * @param {PipelineOptions} opts - Configuration options for the pipeline
 * @returns {Promise<{compiled: any; openapiDoc?: any}>} - The compiled catalog and optional OpenAPI document
 */
export async function runGenerationPipeline(opts: PipelineOptions): Promise<{ compiled: any; openapiDoc?: any; }> {
  // Determine a working directory for the compiler (used for relative path resolution)
  // Use the first available output location as the base
  const workingDir = opts.clientOutDir
    ? opts.clientOutDir
    : opts.openapi?.outFile
      ? path.dirname(opts.openapi.outFile)
      : opts.gateway?.outDir
        ? opts.gateway.outDir
        : path.dirname(opts.catalogOut);

  // Merge provided compiler options with defaults, ensuring required fields are set
  const finalCompiler = resolveCompilerOptions(
    {
      ...opts.compiler,
      catalog: true, // Always emit catalog in pipeline mode
    },
    {
      wsdl: opts.wsdl,
      out: workingDir,
    }
  );

  // Step 1: Load and parse the WSDL document
  const wsdlCatalog = await loadWsdl(opts.wsdl);

  // Step 2: Compile the WSDL into a structured catalog
  const compiled = compileCatalog(wsdlCatalog, finalCompiler);

  // Report compilation statistics
  reportCompilationStats(wsdlCatalog, compiled);

  // Step 3: Emit catalog.json (always, to the specified catalogOut path)
  fs.mkdirSync(path.dirname(opts.catalogOut), {recursive: true});
  generateCatalog(opts.catalogOut, compiled);
  success(`Compiled catalog written to ${opts.catalogOut}`);

  // Step 4: Optionally generate TypeScript client artifacts
  if (opts.clientOutDir) {
    emitClientArtifacts(
      opts.clientOutDir,
      compiled,
      generateClient,
      generateTypes,
      generateUtils
    );
  }

  // Step 4: Optionally generate OpenAPI specification
  let openapiDoc: any;
  if (opts.openapi) {
    // OpenAPI output file must be explicitly provided
    if (!opts.openapi.outFile) {
      throw new Error("OpenAPI generation requires an explicit output file path via openapi.outFile");
    }

    // Generate the OpenAPI specification using the compiled catalog
    const result = await generateOpenAPI({
      ...opts.openapi,
      compiledCatalog: compiled,
      outFile: opts.openapi.outFile,
    });
    openapiDoc = result.doc;

    // Report OpenAPI generation success
    reportOpenApiSuccess(result);
  }

  // Step 5: Optionally generate Fastify gateway code
  if (opts.gateway) {
    if (!openapiDoc) {
      throw new Error("Gateway generation requires OpenAPI generation to be enabled in the pipeline");
    }

    if (!opts.gateway.outDir) {
      throw new Error("Gateway generation requires an explicit output directory via gateway.outDir");
    }

    const gatewayOutDir = path.resolve(opts.gateway.outDir);

    await generateGateway({
      ...opts.gateway,
      openapiDocument: openapiDoc,
      outDir: gatewayOutDir,
      // Pass the client directory if client is being generated
      clientDir: opts.clientOutDir ? path.resolve(opts.clientOutDir) : undefined,
      // Reuse the same imports mode as the TypeScript client/types/utils emitters
      imports: finalCompiler.imports,
    });

    success(`Gateway code generated in ${gatewayOutDir}`);
  }

  // Step 6: Optionally generate Fastify app
  if (opts.app) {
    // App generation requires client, gateway, and openapi to be generated
    if (!opts.clientOutDir || !opts.gateway?.outDir || !opts.openapi?.outFile) {
      throw new Error("App generation requires client, gateway, and OpenAPI to be generated in the pipeline");
    }

    const {generateApp} = await import("./app/generateApp.js");

    await generateApp({
      clientDir: path.resolve(opts.clientOutDir),
      gatewayDir: path.resolve(opts.gateway.outDir),
      openapiFile: path.resolve(opts.openapi.outFile),
      catalogFile: path.resolve(opts.catalogOut),
      appDir: path.resolve(opts.app.appDir),
      imports: finalCompiler.imports,
      openapiMode: opts.app.openapiMode || "copy",
      force: opts.app.force,
      host: opts.app.host,
      port: opts.app.port,
      prefix: opts.app.prefix,
    });
  }

  // Return the compiled catalog and OpenAPI doc for potential further processing
  return {compiled, openapiDoc};
}
