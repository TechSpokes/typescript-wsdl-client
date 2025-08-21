#!/usr/bin/env node
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

const argv = await yargs(hideBin(process.argv))
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
