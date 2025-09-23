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
import {emitClient} from "./emit/clientEmitter.js";
import {emitTypes} from "./emit/typesEmitter.js";
import {emitUtils} from "./emit/utilsEmitter.js";
import {emitCatalog} from "./emit/catalogEmitter.js";
import {generateOpenAPI, type GenerateOpenAPIOptions} from "./openapi/generateOpenAPI.js";
import type {CompilerOptions} from "./config.js";
import {TYPESCRIPT_WSDL_CLIENT_DEFAULT_COMPLIER_OPTIONS} from "./config.js";

/**
 * Configuration options for the generation pipeline
 *
 * @interface PipelineOptions
 * @property {string} wsdl - Path or URL to the WSDL file to process
 * @property {string} outDir - Output directory for generated TypeScript artifacts
 * @property {Partial<CompilerOptions>} [compiler] - Compiler options for type generation
 * @property {object} [openapi] - OpenAPI generation configuration (optional)
 * @property {string} [openapi.outFile] - Optional output path for OpenAPI specification
 */
export interface PipelineOptions {
  wsdl: string;
  outDir: string;
  compiler?: Partial<CompilerOptions>;
  openapi?: Omit<GenerateOpenAPIOptions, "wsdl" | "catalogFile" | "compiledCatalog"> & { outFile?: string };
}

/**
 * Runs the complete generation pipeline from WSDL to TypeScript artifacts and optionally OpenAPI
 *
 * This function orchestrates the entire process:
 * 1. Loads and parses the WSDL from file or URL
 * 2. Compiles the WSDL into an internal catalog representation
 * 3. Emits TypeScript client code, types, and utilities
 * 4. Optionally emits a JSON catalog for introspection
 * 5. Optionally generates an OpenAPI 3.1 specification
 *
 * @param {PipelineOptions} opts - Configuration options for the pipeline
 * @returns {Promise<{compiled: any}>} - The compiled catalog for potential further processing
 */
export async function runGenerationPipeline(opts: PipelineOptions) {
  // Merge provided compiler options with defaults, ensuring required fields are set
  const finalCompiler: CompilerOptions = {
    ...TYPESCRIPT_WSDL_CLIENT_DEFAULT_COMPLIER_OPTIONS,
    catalog: opts.compiler?.catalog ?? true, // default to emitting catalog in pipeline mode
    ...(opts.compiler || {}),
    wsdl: opts.wsdl,
    out: opts.outDir,
  } as CompilerOptions;

  // Step 1: Load and parse the WSDL document
  const wsdlCatalog = await loadWsdl(opts.wsdl);

  // Step 2: Compile the WSDL into a structured catalog
  const compiled = compileCatalog(wsdlCatalog, finalCompiler);

  // Step 3: Ensure the output directory exists
  fs.mkdirSync(opts.outDir, {recursive: true});

  // Step 4: Emit TypeScript artifacts
  emitClient(path.join(opts.outDir, "client.ts"), compiled);
  emitTypes(path.join(opts.outDir, "types.ts"), compiled);
  emitUtils(path.join(opts.outDir, "utils.ts"), compiled);

  // Step 5: Optionally emit the JSON catalog for introspection
  if (finalCompiler.catalog) {
    emitCatalog(path.join(opts.outDir, "catalog.json"), compiled);
  }

  // Step 6: Optionally generate OpenAPI specification
  if (opts.openapi) {
    // Determine output path for OpenAPI specification
    let resolvedOut: string | undefined = opts.openapi.outFile;
    if (!resolvedOut) {
      const yamlPreferred = !!opts.openapi.asYaml;
      resolvedOut = path.join(opts.outDir, yamlPreferred ? "openapi.yaml" : "openapi.json");
    }

    // Generate the OpenAPI specification using the compiled catalog
    await generateOpenAPI({
      ...opts.openapi,
      compiledCatalog: compiled,
      outFile: resolvedOut,
    });
  }

  // Return the compiled catalog for potential further processing
  return {compiled};
}
