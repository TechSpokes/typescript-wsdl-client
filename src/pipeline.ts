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
import {generateCatalog} from "./client/generateCatalog.js";
import {generateOpenAPI, type GenerateOpenAPIOptions} from "./openapi/generateOpenAPI.js";
import {generateGateway, type GenerateGatewayOptions} from "./gateway/generateGateway.js";
import {resolveCompilerOptions, type CompilerOptions} from "./config.js";

/**
 * Configuration options for the generation pipeline
 *
 * @interface PipelineOptions
 * @property {string} wsdl - Path or URL to the WSDL file to process
 * @property {string} outDir - Output directory for generated TypeScript artifacts
 * @property {Partial<CompilerOptions>} [compiler] - Compiler options for type generation
 * @property {object} [openapi] - OpenAPI generation configuration (optional)
 * @property {string} [openapi.outFile] - Optional output path for OpenAPI specification
 * @property {object} [gateway] - Gateway generation configuration (optional, requires openapi)
 * @property {string} [gateway.outDir] - Output directory for gateway code (defaults to {outDir}/gateway)
 */
export interface PipelineOptions {
  wsdl: string;
  outDir: string;
  compiler?: Partial<CompilerOptions>;
  openapi?: Omit<GenerateOpenAPIOptions, "wsdl" | "catalogFile" | "compiledCatalog"> & { outFile?: string };
  gateway?: Omit<GenerateGatewayOptions, "openapiFile" | "openapiDocument"> & { outDir?: string };
}

/**
 * Runs the complete generation pipeline from WSDL to TypeScript artifacts and optionally OpenAPI/Gateway
 *
 * This function orchestrates the entire process:
 * 1. Loads and parses the WSDL from file or URL
 * 2. Compiles the WSDL into an internal catalog representation
 * 3. Emits TypeScript client code, types, and utilities
 * 4. Optionally emits a JSON catalog for introspection
 * 5. Optionally generates an OpenAPI 3.1 specification
 * 6. Optionally generates Fastify gateway code from the OpenAPI spec
 *
 * @param {PipelineOptions} opts - Configuration options for the pipeline
 * @returns {Promise<{compiled: any; openapiDoc?: any}>} - The compiled catalog and optional OpenAPI document
 */
export async function runGenerationPipeline(opts: PipelineOptions) {
  // Merge provided compiler options with defaults, ensuring required fields are set
  const finalCompiler = resolveCompilerOptions(
    {
      ...opts.compiler,
      catalog: opts.compiler?.catalog ?? true, // default to emitting catalog in pipeline mode
    },
    {
      wsdl: opts.wsdl,
      out: opts.outDir,
    }
  );

  // Step 1: Load and parse the WSDL document
  const wsdlCatalog = await loadWsdl(opts.wsdl);

  // Step 2: Compile the WSDL into a structured catalog
  const compiled = compileCatalog(wsdlCatalog, finalCompiler);

  // Step 3: Ensure the output directory exists
  fs.mkdirSync(opts.outDir, {recursive: true});

  // Step 4: Emit TypeScript artifacts
  generateClient(path.join(opts.outDir, "client.ts"), compiled);
  generateTypes(path.join(opts.outDir, "types.ts"), compiled);
  generateUtils(path.join(opts.outDir, "utils.ts"), compiled);

  // Step 5: Optionally emit the JSON catalog for introspection
  if (finalCompiler.catalog) {
    generateCatalog(path.join(opts.outDir, "catalog.json"), compiled);
  }

  // Step 6: Optionally generate OpenAPI specification
  let openapiDoc: any;
  if (opts.openapi) {
    // Determine output path for OpenAPI specification
    let resolvedOut: string | undefined = opts.openapi.outFile;
    if (!resolvedOut) {
      const yamlPreferred = !!opts.openapi.asYaml;
      resolvedOut = path.join(opts.outDir, yamlPreferred ? "openapi.yaml" : "openapi.json");
    }

    // Generate the OpenAPI specification using the compiled catalog
    const result = await generateOpenAPI({
      ...opts.openapi,
      compiledCatalog: compiled,
      outFile: resolvedOut,
    });
    openapiDoc = result.doc;
  }

  // Step 7: Optionally generate Fastify gateway code
  if (opts.gateway) {
    if (!openapiDoc) {
      throw new Error("Gateway generation requires OpenAPI generation to be enabled in the pipeline");
    }

    const gatewayOutDir = opts.gateway.outDir || path.join(opts.outDir, "gateway");

    await generateGateway({
      ...opts.gateway,
      openapiDocument: openapiDoc,
      outDir: gatewayOutDir,
      // Reuse the same imports mode as the TypeScript client/types/utils emitters
      imports: finalCompiler.imports,
    });

    console.log(`✅ Gateway code generated in ${gatewayOutDir}`);
  }

  // Return the compiled catalog and OpenAPI doc for potential further processing
  return {compiled, openapiDoc};
}
