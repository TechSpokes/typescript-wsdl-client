/** Internal catalog format 2: graph persistence and narrow format/model dispatch. */
import {closeSync, fstatSync, openSync, readSync, constants} from "node:fs";
import {GRAPH_MODEL, DEFAULT_GRAPH_NODES, deepFreeze} from "./canonicalGraph.js";
import type {CanonicalGraph} from "./canonicalGraph.js";
import {buildCanonicalGraph} from "./buildCanonicalGraph.js";
import {loadSchemaInput} from "../loader/schemaInput.js";
import {loadWsdl} from "../loader/wsdlLoader.js";
import {compileCatalog} from "./schemaCompiler.js";
import type {CompiledCatalog} from "./schemaCompiler.js";
import {resolveCompilerOptions} from "../config.js";
import type {CompilerOptions} from "../config.js";
import {CatalogError, DEFAULT_CATALOG_BYTES, canonicalJson, parseCatalogJson, positiveLimit} from "./catalogErrors.js";
import type {CatalogLimits} from "./catalogErrors.js";
import {artifactGraph, normalizeGraphTables, semanticGraphFingerprint} from "./catalogProvenance.js";
import {validateSemanticGraph} from "./validateSemanticGraph.js";

export {CatalogError} from "./catalogErrors.js";
export const CATALOG_FORMAT = 2 as const;
export type CompilationMode = "legacy" | "faithful";
export type SemanticCatalog = Readonly<{catalogFormat: typeof CATALOG_FORMAT; model: typeof GRAPH_MODEL; profile: typeof GRAPH_MODEL; graph: CanonicalGraph; semanticFingerprint: string}>;
export type CatalogReadResult = Readonly<
  {kind: "legacy"; catalog: CompiledCatalog} |
  {kind: "semantic"; catalog: SemanticCatalog} |
  {kind: "regeneration-required"; category: "incompatible-artifact"; reason: string; requiredInput: "original-source"; command: string}
>;

export function createSemanticCatalog(graph: CanonicalGraph, limits: CatalogLimits = {}): SemanticCatalog {
  const maxNodes = positiveLimit(limits.maxNodes, DEFAULT_GRAPH_NODES, "maxNodes");
  if (graph.nodes.length > maxNodes) throw new CatalogError("resource-limit", `Catalog graph exceeds ${maxNodes} nodes`);
  const portable = artifactGraph(graph);
  validateSemanticGraph(portable, limits);
  return deepFreeze({catalogFormat: CATALOG_FORMAT, model: GRAPH_MODEL, profile: GRAPH_MODEL, graph: portable, semanticFingerprint: semanticGraphFingerprint(portable)});
}

export function serializeSemanticCatalog(catalog: SemanticCatalog, limits: CatalogLimits = {}): string {
  const text = canonicalJson(catalog) + "\n";
  // The writer obeys the same byte/depth/field/reference boundary as the reader.
  readCatalog(text, {mode: "faithful", ...limits});
  return text;
}

function legacyCatalog(value: unknown): CompiledCatalog {
  const bad = () => {throw new CatalogError("invalid-schema", "Malformed legacy catalog");};
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.types) || !Array.isArray(v.aliases) || !Array.isArray(v.operations) || !v.options || typeof v.options !== "object" || !v.meta || typeof v.meta !== "object" || typeof v.wsdlTargetNS !== "string" || typeof v.wsdlUri !== "string") return bad();
  for (const item of [...v.types, ...v.aliases, ...v.operations]) if (!item || typeof item !== "object" || typeof item.name !== "string") return bad();
  // Legacy metadata remains unchanged; this adapter never invents graph structure or rename/options migrations.
  return value as CompiledCatalog;
}

export function readCatalog(text: string, options: CatalogLimits & {mode?: CompilationMode} = {}): CatalogReadResult {
  const mode = options.mode ?? "legacy";
  if (mode !== "legacy" && mode !== "faithful") throw new CatalogError("incompatible-artifact", "Unknown compilation mode");
  const parsed = parseCatalogJson(text, options);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new CatalogError("invalid-schema", "Catalog must be an object");
  const o = parsed as Record<string, unknown>;
  if (!Object.hasOwn(o, "catalogFormat")) {
    if (["model", "profile", "graph", "bundleFormat", "semanticFingerprint"].some(k => Object.hasOwn(o, k))) throw new CatalogError("incompatible-artifact", "Unrecognized or missing catalog format identifier");
    const catalog = legacyCatalog(parsed);
    return mode === "legacy" ? {kind: "legacy", catalog} : {kind: "regeneration-required", category: "incompatible-artifact", reason: "Flattened legacy catalog lacks ordered schema structure; regenerate through the internal faithful source entry", requiredInput: "original-source", command: "prepareCompilationInput({kind: 'source', source: '<original.wsdl>'}, {mode: 'faithful', loading: {policy: {fileRoots: ['<authorized-root>']}}})"};
  }
  if (o.catalogFormat !== CATALOG_FORMAT || o.model !== GRAPH_MODEL || o.profile !== GRAPH_MODEL) throw new CatalogError("incompatible-artifact", "Expected catalogFormat 2, model/profile xsd10-faithful-v1", "catalogFormat/model/profile");
  if (Object.keys(o).some(k => !["catalogFormat", "model", "profile", "graph", "semanticFingerprint"].includes(k))) throw new CatalogError("invalid-schema", "Unknown mandatory catalog field");
  if (typeof o.semanticFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(o.semanticFingerprint)) throw new CatalogError("invalid-schema", "Malformed semantic fingerprint");
  validateSemanticGraph(o.graph, options);
  const portable = artifactGraph(o.graph);
  if (canonicalJson(normalizeGraphTables(o.graph)) !== canonicalJson(portable)) throw new CatalogError("invalid-schema", "Catalog contains nonportable retrieval provenance");
  if (semanticGraphFingerprint(o.graph) !== o.semanticFingerprint) throw new CatalogError("incompatible-artifact", "Catalog semantic fingerprint mismatch");
  if (mode === "legacy") throw new CatalogError("incompatible-artifact", "Legacy consumer cannot read a structural catalog; regenerate matched legacy artifacts from original source");
  return {kind: "semantic", catalog: deepFreeze({...parsed as SemanticCatalog, graph: portable})};
}

/** Bounded regular-file read; no giant allocation or special-file blocking before format dispatch. */
export function readCatalogFile(file: string, options: CatalogLimits & {mode?: CompilationMode} = {}): CatalogReadResult {
  const maxBytes = positiveLimit(options.maxBytes, DEFAULT_CATALOG_BYTES, "maxBytes");
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new CatalogError("invalid-schema", "Catalog input must be a regular file");
    if (stat.size > maxBytes) throw new CatalogError("resource-limit", `Catalog exceeds ${maxBytes} bytes`);
    const chunks: Buffer[] = [], chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1));
    let total = 0, count: number;
    while ((count = readSync(fd, chunk, 0, Math.min(chunk.length, maxBytes + 1 - total), null)) > 0) {
      total += count; if (total > maxBytes) throw new CatalogError("resource-limit", `Catalog exceeds ${maxBytes} bytes`);
      chunks.push(Buffer.from(chunk.subarray(0, count)));
    }
    let text: string;
    try {text = new TextDecoder("utf-8", {fatal: true}).decode(Buffer.concat(chunks));} catch {throw new CatalogError("invalid-schema", "Catalog is not valid UTF-8");}
    return readCatalog(text, options);
  } finally {closeSync(fd);}
}

export function readLegacyCatalogFile(file: string, limits: CatalogLimits = {}): CompiledCatalog {
  const result = readCatalogFile(file, {...limits, mode: "legacy"});
  if (result.kind !== "legacy") throw new CatalogError("incompatible-artifact", "Expected legacy catalog");
  return result.catalog;
}

/** Development boundary for the S02 source/catalog matrix; no faithful emitter or activation. */
export async function prepareCompilationInput(input: {kind: "source"; source: string} | {kind: "catalog"; text: string}, options: {
  mode?: CompilationMode; limits?: CatalogLimits; compilerOptions?: Partial<CompilerOptions>;
  loading?: Parameters<typeof loadSchemaInput>[1];
} = {}): Promise<CatalogReadResult> {
  const mode = options.mode ?? "legacy";
  if (input.kind === "catalog") return readCatalog(input.text, {mode, ...options.limits});
  if (mode === "legacy") return {kind: "legacy", catalog: compileCatalog(await loadWsdl(input.source), resolveCompilerOptions(options.compilerOptions ?? {}, {wsdl: input.source, out: ""}))};
  if (mode !== "faithful") throw new CatalogError("incompatible-artifact", "Unknown compilation mode");
  const loaded = await loadSchemaInput(input.source, options.loading ?? {policy: {}});
  return {kind: "semantic", catalog: createSemanticCatalog(buildCanonicalGraph(loaded, {maxNodes: options.limits?.maxNodes}), options.limits)};
}

/** Inspectable transitional view, always derived; it cannot replace the structural graph or feed emitters. */
export function deriveCompatibilityView(graph: CanonicalGraph) {
  return deepFreeze({derived: true as const, model: graph.model, symbols: graph.nodes.filter(n => n.identity.kind === "global").map(n => ({id: n.id, kind: n.kind, identity: n.identity})).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)});
}
