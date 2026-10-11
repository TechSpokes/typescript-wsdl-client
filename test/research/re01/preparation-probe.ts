/** Stage instrumentation is diagnostic only; stage durations are not complexity proofs. */
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import type {SchemaInput} from '../../../src/loader/schemaInput.js';
import type {SyntaxNode} from '../../../src/loader/orderedSyntax.js';
import {buildCanonicalGraph} from '../../../src/compiler/buildCanonicalGraph.js';
import type {CanonicalGraph} from '../../../src/compiler/canonicalGraph.js';
import {artifactGraph, semanticGraphFingerprint} from '../../../src/compiler/catalogProvenance.js';
import {canonicalJson} from '../../../src/compiler/catalogErrors.js';
import {referenceSlots, containedNodes} from '../../../src/compiler/graphTraversal.js';
import {createSemanticCatalog, prepareResolvedCompilationInput, readCatalog} from '../../../src/compiler/semanticCatalog.js';
import {countSemanticData, semanticBudget, resolveCanonicalGraph} from '../../../src/compiler/resolveCanonicalGraph.js';
import {mergeStructuralCompanions} from '../../../src/compiler/structuralCompanions.js';
import {composeCanonicalGraph} from '../../../src/compiler/composeCanonicalGraph.js';
import {digest, verifyCorpus} from './preparation-corpus.js';
import type {PreparationCorpus} from './preparation-corpus.js';

export type LimitProfile = 'default' | 'diagnostic';
export const PREPARATION_LIMITS = Object.freeze({default: {maxNodes: 100_000, maxSteps: 1_000_000}, diagnostic: {maxNodes: 100_000, maxSteps: 50_000_000}});
export interface StageRecord {
  readonly stage: string; readonly wallMs: number; readonly processPeakRssKiB: number;
  readonly rssBeforeBytes: number; readonly rssAfterBytes: number; readonly heapBeforeBytes: number; readonly heapAfterBytes: number;
  readonly classification: string; readonly logicalWork: number | null; readonly detail?: string;
}
export function errorClassification(error: unknown): {classification: string; detail: string} {
  return {classification: error && typeof error === 'object' && 'category' in error ? String(error.category) : 'instrumentation-error', detail: error instanceof Error ? error.message : String(error)};
}
export async function timed<T>(stage: string, records: StageRecord[], operation: () => T | Promise<T>, work?: () => number | null): Promise<T> {
  const before = process.memoryUsage(), start = performance.now();
  let status: {classification: string; detail?: string} = {classification: 'structurally-prepared'};
  try {
    const result = await operation();
    if (result && typeof result === 'object' && 'kind' in result && ['resource-limit', 'input-error', 'candidate-rejected'].includes(String(result.kind))) status = {classification: String(result.kind)};
    if (result && typeof result === 'object' && 'kind' in result && result.kind === 'source-preparation-failed') status = {classification: result.kind};
    return result;
  }
  catch (error) {status = errorClassification(error); throw error;}
  finally {
    const elapsed = performance.now() - start, after = process.memoryUsage();
    records.push({stage, wallMs: elapsed, processPeakRssKiB: process.resourceUsage().maxRSS, rssBeforeBytes: before.rss, rssAfterBytes: after.rss, heapBeforeBytes: before.heapUsed, heapAfterBytes: after.heapUsed, ...status, logicalWork: work?.() ?? null});
  }
}

/** Census follows unique object identities; serialized size separately counts repeated appearances. */
export function dataCensus(value: unknown) {
  const seen = new Set<object>(), sources = new Set<string>(), contexts = new Set<string>();
  const stack: unknown[] = [value]; let fields = 0, arrays = 0, repeatedReferences = 0, sourceAppearances = 0;
  while (stack.length) {
    const item = stack.pop(); if (!item || typeof item !== 'object') continue;
    if (seen.has(item)) {repeatedReferences++; continue;} seen.add(item);
    if (Array.isArray(item)) arrays++;
    else {
      const record = item as Record<string, unknown>;
      if (typeof record.digest === 'string' && typeof record.path === 'string' && record.start) {sourceAppearances++; sources.add(canonicalJson(record));}
      if (record.source && record.namespaces && typeof record.effectiveNamespace === 'string') contexts.add(canonicalJson(record));
    }
    const values = Object.values(item); fields += values.length; stack.push(...values);
  }
  return {uniqueObjects: seen.size, arrays, fields, repeatedReferences, sourceObjectCount: sourceAppearances, distinctSourceRecords: sources.size, distinctContextRecords: contexts.size};
}
function graphSizes(graph: CanonicalGraph) {
  const provenance = {origins: graph.origins, annotations: graph.schemaAnnotations, retained: graph.schemaRetained, loading: graph.loading};
  return {components: graph.nodes.length, globals: graph.globals.length,
    referenceEdges: graph.nodes.reduce((sum, node) => sum + referenceSlots(node).length, 0),
    containmentEdges: graph.nodes.reduce((sum, node) => sum + containedNodes(node).length, 0),
    ownershipEdges: graph.nodes.filter(node => node.identity.kind === 'scoped').length,
    serializedBytes: Buffer.byteLength(canonicalJson(graph)), provenanceTableBytes: Buffer.byteLength(canonicalJson(provenance)), ...dataCensus(graph)};
}
function inputSizes(input: SchemaInput) {
  const stack: SyntaxNode[] = input.documents.map(document => document.root); let syntaxNodes = 0;
  while (stack.length) {const node = stack.pop()!; syntaxNodes++; if (node.kind === 'element') stack.push(...node.children);}
  return {originalBytes: input.metrics.totalBytes, resources: input.resources.length, syntaxNodes, interpretations: input.schemas.length,
    closure: input.resources.map(resource => ({digest: resource.digest, bytes: resource.byteLength})).sort((a, b) => a.digest.localeCompare(b.digest))};
}

export async function measurePreparation(corpus: PreparationCorpus, root: string, profile: LimitProfile) {
  await verifyCorpus(corpus, root);
  const semantics = PREPARATION_LIMITS[profile], stages: StageRecord[] = [];
  const options = {loading: {policy: {fileRoots: [root]}}, semantics};
  const source = path.resolve(root, corpus.source);
  const loaded = await timed('loading', stages, () => loadSchemaInput(source, options.loading));
  const graph = await timed('canonical-graph', stages, () => buildCanonicalGraph(loaded));
  const rawSize = graphSizes(graph);
  const portable = await timed('portable-provenance-transform', stages, () => artifactGraph(graph));
  const fingerprint = await timed('semantic-fingerprinting', stages, () => semanticGraphFingerprint(portable));
  const catalog = await timed('catalog-validation-and-materialization', stages, () => createSemanticCatalog(graph));
  const catalogText = canonicalJson(catalog);
  const reload = await timed('catalog-roundtrip', stages, () => readCatalog(catalogText, {mode: 'faithful'}));
  if (reload.kind !== 'semantic' || reload.catalog.semanticFingerprint !== fingerprint || canonicalJson(reload.catalog) !== catalogText) throw new Error('Catalog roundtrip differs');
  const pipeline: StageRecord[] = [], gathering = semanticBudget(semantics);
  let stagedClassification = 'structurally-prepared';
  try {
    await timed('gathering-precharge', pipeline, () => countSemanticData(catalog.graph, gathering), () => gathering.steps);
    let mergeWork: number | null = null;
    const merge = await timed('companion-merge', pipeline, () => {const result = mergeStructuralCompanions(catalog.graph, [], semantics); mergeWork = result.metrics.steps; return result;}, () => mergeWork);
    const merged = await timed('merged-catalog-materialization', pipeline, () => createSemanticCatalog(merge.graph));
    let resolveWork: number | null = null, composeWork: number | null = null;
    const resolved = await timed('resolution', pipeline, () => {const result = resolveCanonicalGraph(merged.graph, semantics); resolveWork = result.metrics.steps; return result;}, () => resolveWork);
    await timed('composition', pipeline, () => {const result = composeCanonicalGraph(resolved, semantics); composeWork = result.metrics.steps; return result;}, () => composeWork);
  } catch (error) {stagedClassification = errorClassification(error).classification;}
  // These separate calls exercise the actual repository source and catalog entries, not merely an imitation.
  const entry: StageRecord[] = [];
  const entries: {source?: string; catalog?: string} = {};
  for (const kind of ['source', 'catalog'] as const) {
    try {
      const result = await timed(`resolved-${kind}-entry`, entry, () => prepareResolvedCompilationInput(kind === 'source' ? {kind, source} : {kind, text: catalogText}, options));
      entries[kind] = result.kind === 'semantic' ? 'structurally-prepared' : result.kind;
      if (result.kind === 'semantic' && result.catalog.semanticFingerprint !== fingerprint) throw new Error('Resolved entry fingerprint differs');
    } catch (error) {entries[kind] = errorClassification(error).classification;}
  }
  if (entries.source !== entries.catalog || entries.source !== stagedClassification) throw new Error('Source/catalog/staged result classifications differ');
  return {corpus, profile, options: {semantics, fileRoot: '<repository-root>', loadingLimits: loaded.limits}, input: inputSizes(loaded),
    rawGraph: rawSize, portableGraph: graphSizes(portable), catalogBytes: Buffer.byteLength(catalogText), catalogSha256: digest(catalogText), semanticFingerprint: fingerprint,
    stagedClassification, entries, stages, resolvedPipeline: pipeline, resolvedEntries: entry,
    accounting: {legacyStagesUseIndependentBudgets: true, observedPipelineWork: pipeline.reduce((sum, stage) => sum + (stage.logicalWork ?? 0), 0), uninstrumentedStages: 'null means the existing stage exposes no logical-work counter; census is not an allocation profiler'}};
}

export type PreparationMeasurement = Awaited<ReturnType<typeof measurePreparation>>;
