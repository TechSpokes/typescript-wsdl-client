#!/usr/bin/env node
import yargs from "yargs/yargs";
import {hideBin} from "yargs/helpers";
import fs from "node:fs";
import path from "node:path";

import {loadWsdl} from "./loader/wsdlLoader.js";
import {compileCatalog} from "./compiler/schemaCompiler.js";
import {emitRuntime} from "./emit/runtimeEmitter.js";
import {emitTypes} from "./emit/typesEmitter.js";
import {emitMeta} from "./emit/metaEmitter.js";
import {emitOps} from "./emit/opsEmitter.js";
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
        desc: "Intra-generated import specifiers: '.js', '.ts', or bare (no extension)",
    })
    .option("ops-ts", {
        type: "boolean",
        default: true,
        desc: "Emit operations.ts instead of JSON",
    })
    .option("attributes-key", {
        type: "string",
        default: "$attributes",
        desc: "Key used by runtime marshaller for XML attributes",
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
    .strict()
    .help()
    .parse();

const outDir = path.resolve(String(argv.out));
fs.mkdirSync(outDir, {recursive: true});

// Load & compile
const catalog = await loadWsdl(String(argv.wsdl));
const compiled = compileCatalog(catalog, {
    primitive: {
        int64As: argv["int64-as"] as any,
        bigIntegerAs: argv["bigint-as"] as any,
        decimalAs: argv["decimal-as"] as any,
        dateAs: argv["date-as"] as any,
    },
});

// Report counts of types and operations for user visibility
console.log(`Schemas discovered: ${catalog.schemas.length}`);
console.log(`Compiled types: ${compiled.types.length}`);
console.log(`Operations: ${compiled.operations.length}`);

// Emit files
const importExt = argv.imports === "js" ? ".js" : argv.imports === "ts" ? ".ts" : "";
emitTypes(path.join(outDir, "types.ts"), compiled);
emitMeta(path.join(outDir, "meta.ts"), compiled);
emitOps(path.join(outDir, argv["ops-ts"] ? "operations.ts" : "operations.json"), compiled);
emitRuntime(path.join(outDir, "runtime.ts"));
emitClient(path.join(outDir, "client.ts"), compiled, {
    // These fields are consumed by our client emitter options shape
    // to keep CLI flexible without exposing full CompilerOptions here.
    // @ts-ignore runtime-only options for emitter
    importExt,
    attributesKey: String(argv["attributes-key"]),
} as any);

console.log(`✅ Generated TypeScript client in ${outDir}`);
