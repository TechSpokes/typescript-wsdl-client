/** Reuse versus rebuilding control for the same new structural adapter, not a historical semantic API comparison. */
import path from 'node:path';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, GraphNode} from '../../../src/compiler/canonicalGraph.js';
import {containedNodes, referenceSlots} from '../../../src/compiler/graphTraversal.js';
import {prepareResolvedCompilationInput} from '../../../src/compiler/semanticCatalog.js';
import type {ResolvedGraph} from '../../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest, SEMANTIC_CONTEXT_CONTRACT} from '../../../src/compiler/semanticContext.js';
import type {SemanticCandidateDelta, SemanticRequest} from '../../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import type {PreparationCorpus} from './preparation-corpus.js';
import {PREPARATION_LIMITS, dataCensus, errorClassification, timed} from './preparation-probe.js';
import type {LimitProfile, StageRecord} from './preparation-probe.js';

/** Closure selects a proper subset when the fixture has unrelated globals; source availability remains complete. */
export function candidateSequence(nodes: readonly GraphNode[]): readonly SemanticCandidateDelta[] {
  const endpoint = nodes.find((node): node is ComplexTypeNode => node.kind === 'complexType');
  if (!endpoint) throw new Error('Measurement corpus requires a complex endpoint');
  const index = new Map(nodes.map(node => [node.id, node]));
  const active = new Set<string>(), pending = [endpoint.id];
  while (pending.length) {
    const id = pending.pop()!; if (active.has(id)) continue;
    const node = index.get(id); if (!node) throw new Error('Fixture closure is incomplete');
    active.add(id); pending.push(...containedNodes(node));
    if (node.identity.kind === 'scoped') pending.push(node.identity.owner);
    for (const {reference} of referenceSlots(node)) {
      if (reference.kind === 'local') pending.push(reference.target);
      else if (reference.kind === 'symbol') pending.push(globalId(reference.role, reference.name));
    }
  }
  const all = nodes.map(node => node.id);
  return [{key: 'full-original', active: all},
    {key: 'endpoint-closure-changed', active: [...active], endpoint: {...endpoint, mixed: !endpoint.mixed}},
    {key: 'full-changed-sibling', active: all, endpoint: {...endpoint, abstract: !endpoint.abstract}}];
}

export async function measureContextSequence(resolved: ResolvedGraph, profile: LimitProfile, mode: 'reuse-actual' | 'rebuild-actual-control') {
  const limits = {maxNodes: PREPARATION_LIMITS[profile].maxNodes, maxWork: PREPARATION_LIMITS[profile].maxSteps};
  const budget = createSemanticBudget(limits), stages: StageRecord[] = [], candidates = [];
  let request: SemanticRequest | undefined, classification = 'structurally-prepared';
  for (const delta of candidateSequence(resolved.graph.nodes)) {
    if (!request || mode === 'rebuild-actual-control') {
      const prepared = await timed('actual-context-preparation', stages, () => prepareSemanticRequest(resolved, {budget}), () => budget.usage().work);
      if (prepared.kind !== 'prepared') {classification = prepared.kind; break;}
      request = prepared.request;
    }
    const before = {...budget.usage()};
    const result = await timed(`candidate-delta:${delta.key}`, stages, () => request!.candidate(delta), () => budget.usage().work);
    const after = {...budget.usage()};
    candidates.push({key: delta.key, activeMembers: delta.active.length, endpointChanged: Boolean(delta.endpoint), classification: result.kind,
      before, after, marginalWork: after.work - before.work, marginalNodes: after.nodes - before.nodes,
      ...(result.kind === 'resource-limit' ? {limit: result.limit} : result.kind === 'candidate-rejected' || result.kind === 'input-error' ? {code: result.code} : {})});
    if (result.kind !== 'prepared') {classification = result.kind; break;}
  }
  return {mode, contract: SEMANTIC_CONTEXT_CONTRACT, acceptance: 'structural-only', limits, classification, candidates, stages,
    finalUsage: {...budget.usage()}, accountingScope: 'One cumulative budget for actual snapshots/indexes plus every candidate in this workload. Existing source pipeline precedes this request and has separate legacy budgets.'};
}

/** Separate authentic source route used by the finite checker; no validity assessment is run here. */
export async function measureSourceOwnedPreparation(corpus: PreparationCorpus, root: string, profile: LimitProfile) {
  const limits = {maxNodes: PREPARATION_LIMITS[profile].maxNodes, maxWork: PREPARATION_LIMITS[profile].maxSteps};
  const budget = createSemanticBudget(limits), stages: StageRecord[] = [];
  const metadata = {mode: 'source-owned-actual-preparation', contract: SEMANTIC_CONTEXT_CONTRACT, acceptance: 'structural-only', limits,
    historicalComparison: 'Baseline main has no matching authenticated source-owned request API.',
    accountingScope: 'Loader runs before the shared request with its own limits. Authenticated source binding and semantic context index preparation share one cumulative SemanticBudget. Canonical build/reference resolution retain sourceLimits; their work is not fabricated as shared charges. No schema-validity, actual-obligation or candidate check is performed.'};
  try {
    const loaded = await timed('source-owned-loading', stages, () => loadSchemaInput(path.resolve(root, corpus.source), {policy: {fileRoots: [root]}}));
    const input = {originalBytes: loaded.metrics.totalBytes, resources: loaded.resources.length, interpretations: loaded.schemas.length,
      snapshotInputCensus: dataCensus(loaded)};
    const prepared = await timed('source-owned-actual-preparation', stages,
      () => prepareSourceSchemaRequest(loaded, {budget, sourceLimits: PREPARATION_LIMITS[profile]}), () => budget.usage().work);
    return {...metadata, classification: prepared.kind === 'prepared' ? 'structurally-prepared' : prepared.kind, input, stages,
      finalUsage: {...budget.usage()}, ...(prepared.kind === 'prepared' ? {graphComponents: prepared.request.graph.nodes.length, requestGraphCensus: dataCensus(prepared.request.graph)} : {}),
      ...(prepared.kind === 'source-preparation-failed' ? {sourceFailure: {stage: prepared.stage, category: prepared.category}} : {})};
  } catch (error) {return {...metadata, ...errorClassification(error), stages, finalUsage: {...budget.usage()}};}
}

export async function measureCandidatePreparation(corpus: PreparationCorpus, root: string, profile: LimitProfile) {
  const sourceOwned = await measureSourceOwnedPreparation(corpus, root, profile);
  const stages: StageRecord[] = [];
  try {
    const prepared = await timed('context-workload-source-entry', stages, () => prepareResolvedCompilationInput({kind: 'source', source: path.resolve(root, corpus.source)}, {
      loading: {policy: {fileRoots: [root]}}, semantics: PREPARATION_LIMITS[profile],
    }));
    if (prepared.kind !== 'semantic') return {classification: prepared.kind, stages, sourceOwned};
    return {classification: 'source-structurally-prepared', stages, sourceOwned, reuse: await measureContextSequence(prepared.resolved, profile, 'reuse-actual'),
      rebuildControl: await measureContextSequence(prepared.resolved, profile, 'rebuild-actual-control')};
  } catch (error) {return {...errorClassification(error), stages, sourceOwned};}
}
