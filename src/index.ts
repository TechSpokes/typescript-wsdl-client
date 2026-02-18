/**
 * TypeScript WSDL Client Generator - API Entry Point
 *
 * This module exports the public API for programmatic usage of the TypeScript WSDL client
 * generator. It provides functions for:
 *
 * 1. Compiling WSDL to TypeScript client code (compileWsdlToProject)
 * 2. Generating OpenAPI specifications from WSDL (generateOpenAPI)
 * 3. Running the full generation pipeline (runGenerationPipeline)
 *
 * These functions provide a way to integrate the generator into other tools and workflows
 * without relying on the command-line interface.
 */
import fs from "node:fs";
import path from "node:path";
import type {CompilerOptions} from "./config.js";
import {resolveCompilerOptions} from "./config.js";
import {loadWsdl} from "./loader/wsdlLoader.js";
import {compileCatalog} from "./compiler/schemaCompiler.js";
import {generateTypes} from "./client/generateTypes.js";
import {generateUtils} from "./client/generateUtils.js";
import {generateCatalog} from "./compiler/generateCatalog.js";
import {generateClient} from "./client/generateClient.js";
import {generateOperations} from "./client/generateOperations.js";
import {info} from "./util/cli.js";

export {generateOpenAPI} from "./openapi/generateOpenAPI.js";
export {generateGateway} from "./gateway/generateGateway.js";
export {runGenerationPipeline} from "./pipeline.js";

// noinspection JSUnusedGlobalSymbols
/**
 * Compiles a WSDL file to TypeScript client code
 *
 * This function is the main programmatic entry point for generating TypeScript
 * client code from a WSDL file. It performs the full compilation process:
 *
 * 1. Loading and parsing the WSDL document
 * 2. Compiling the WSDL into a structured catalog
 * 3. Generating TypeScript artifacts (client, types, utilities)
 * 4. Optionally emitting a JSON catalog for introspection
 *
 * The function ensures the output directory exists and handles errors properly.
 *
 * @param {Object} input - Input configuration
 * @param {string} input.wsdl - Path or URL to the WSDL file
 * @param {string} input.outDir - Output directory for generated code
 * @param {CompilerOptions} [input.options] - Optional compiler configuration
 * @returns {Promise<void>}
 * @throws {Error} If no schemas or operations are found, or if compilation fails
 */
export async function compileWsdlToProject(
  input: { wsdl: string; outDir: string; options?: CompilerOptions }
): Promise<void> {
  // Merge defaults with overrides, always set wsdl+out
  const finalOptions = resolveCompilerOptions(
    input.options || {},
    {
      wsdl: input.wsdl,
      out: input.outDir,
    }
  );

  // Load & compile
  const wsdlCatalog = await loadWsdl(input.wsdl);
  info(`Loaded WSDL: ${wsdlCatalog.wsdlUri}`);
  if (wsdlCatalog.schemas.length === 0) {
    throw new Error(`No schemas found in WSDL: ${input.wsdl}`);
  }
  info(`Schemas discovered: ${wsdlCatalog.schemas.length}`);

  const compiled = compileCatalog(wsdlCatalog, finalOptions);
  info(`Compiled WSDL: ${wsdlCatalog.wsdlUri}`);

  // check if we have any types and operations
  if (compiled.types.length === 0) {
    throw new Error(`No types compiled from WSDL: ${input.wsdl}`);
  } else {
    info(`Types discovered: ${compiled.types.length}`);
  }
  if (compiled.operations.length === 0) {
    throw new Error(`No operations compiled from WSDL: ${input.wsdl}`);
  } else {
    info(`Operations discovered: ${compiled.operations.length}`);
  }

  // Emit artifacts
  const typesFile = path.join(input.outDir, "types.ts");
  const utilsFile = path.join(input.outDir, "utils.ts");
  const operationsFile = path.join(input.outDir, "operations.ts");
  const catalogFile = path.join(input.outDir, "catalog.json");
  const clientFile = path.join(input.outDir, "client.ts");

  // Prepare output dir
  try {
    fs.mkdirSync(input.outDir, {recursive: true});
  } catch (e) {
    throw new Error(`Failed to create output directory '${input.outDir}': ${e instanceof Error ? e.message : String(e)}`);
  }

  // Emit files
  generateClient(clientFile, compiled);
  generateTypes(typesFile, compiled);
  generateUtils(utilsFile, compiled);
  generateOperations(operationsFile, compiled);

  if (compiled.options.catalog) {
    generateCatalog(catalogFile, compiled);
  }
}
