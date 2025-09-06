import fs from "node:fs";
import path from "node:path";
import type {CompilerOptions} from "./config.js";
import {loadWsdl} from "./loader/wsdlLoader.js";
import {compileCatalog} from "./compiler/schemaCompiler.js";
import {emitTypes} from "./emit/typesEmitter.js";
import {emitUtils} from "./emit/utilsEmitter.js";
import {emitCatalog} from "./emit/catalogEmitter.js";
import {emitClient} from "./emit/clientEmitter.js";
import {TYPESCRIPT_WSDL_CLIENT_DEFAULT_COMPLIER_OPTIONS} from "./config.js";

// noinspection JSUnusedGlobalSymbols
export async function compileWsdlToProject(
  input: { wsdl: string; outDir: string; options?: CompilerOptions }
) {
  // Merge defaults with overrides, always set wsdl+out
  const finalOptions: CompilerOptions = {
    ...TYPESCRIPT_WSDL_CLIENT_DEFAULT_COMPLIER_OPTIONS,
    ...(input.options || {}),
    wsdl: input.wsdl,
    out: input.outDir,
  };

  // Load & compile
  const wsdlCatalog = await loadWsdl(input.wsdl);
  console.log(`Loaded WSDL: ${wsdlCatalog.wsdlUri}`);
  if (wsdlCatalog.schemas.length === 0) {
    throw new Error(`No schemas found in WSDL: ${input.wsdl}`);
  }
  console.log(`Schemas discovered: ${wsdlCatalog.schemas.length}`);

  const compiled = compileCatalog(wsdlCatalog, finalOptions);
  console.log(`Compiled WSDL: ${wsdlCatalog.wsdlUri}`);

  // check if we have any types and operations
  if (compiled.types.length === 0) {
    throw new Error(`No types compiled from WSDL: ${input.wsdl}`);
  } else {
    console.log(`Types discovered: ${compiled.types.length}`);
  }
  if (compiled.operations.length === 0) {
    throw new Error(`No operations compiled from WSDL: ${input.wsdl}`);
  } else {
    console.log(`Operations discovered: ${compiled.operations.length}`);
  }

  // Emit artifacts
  const typesFile = path.join(input.outDir, "types.ts");
  const utilsFile = path.join(input.outDir, "utils.ts");
  const catalogFile = path.join(input.outDir, "catalog.json");
  const clientFile = path.join(input.outDir, "client.ts");

  // Prepare output dir
  try {
    fs.mkdirSync(input.outDir, {recursive: true});
  } catch (e) {
    throw new Error(`Failed to create output directory '${input.outDir}': ${e instanceof Error ? e.message : String(e)}`);
  }

  // Emit files
  emitClient(clientFile, compiled);
  emitTypes(typesFile, compiled);
  emitUtils(utilsFile, compiled);

  if (compiled.options.catalog) {
    emitCatalog(catalogFile, compiled);
  }
}
