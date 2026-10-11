import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, GraphNode} from '../../src/compiler/canonicalGraph.js';
import {canonicalJson} from '../../src/compiler/catalogErrors.js';
import {semanticGraphFingerprint} from '../../src/compiler/catalogProvenance.js';
import {prepareResolvedCompilationInput, serializeSemanticCatalog} from '../../src/compiler/semanticCatalog.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';

const root = path.resolve('test/conformance/fixtures/xsd/graph');
const prepare = (name: string) => prepareResolvedCompilationInput({kind: 'source', source: path.join(root, name)}, {
  loading: {policy: {fileRoots: [root]}},
});
const diagnosticBudget = () => createSemanticBudget({maxWork: 50_000_000});

describe('canonical semantic context adapter', () => {
  // Existing graph fixture independently specifies shared groups, a legal recursive
  // element/type boundary, exact large occurrences, and source-local QName operands.
  it('preserves the complete real graph and catalog fingerprints through one actual preparation', async () => {
    const input = await prepare('shared-recursive.xsd');
    if (input.kind !== 'semantic') throw new Error('semantic source required');
    const prepared = prepareSemanticRequest(input.resolved, {budget: diagnosticBudget()});
    if (prepared.kind !== 'prepared') throw new Error(`context ${prepared.kind}`);
    expect(canonicalJson(prepared.request.graph)).toBe(canonicalJson(input.resolved.graph));
    expect(semanticGraphFingerprint(prepared.request.graph)).toBe(input.catalog.semanticFingerprint);
    const fromCatalog = await prepareResolvedCompilationInput({kind: 'catalog', text: serializeSemanticCatalog(input.catalog)});
    if (fromCatalog.kind !== 'semantic') throw new Error('semantic catalog required');
    const catalogContext = prepareSemanticRequest(fromCatalog.resolved, {budget: diagnosticBudget()});
    if (catalogContext.kind !== 'prepared') throw new Error(`context ${catalogContext.kind}`);
    expect(canonicalJson(catalogContext.request.graph)).toBe(canonicalJson(prepared.request.graph));
    for (const node of input.resolved.graph.nodes) {
      const original = prepared.request.actual.sourceNode(node.id);
      expect(original).toEqual(node);
      expect(prepared.request.actual.lookup(node.id)).toEqual({kind: 'found', node});
      if (node.identity.kind === 'scoped') expect(prepared.request.actual.owner(node.id)).toBe(node.identity.owner);
    }
  });

  it('rejects a hypothetical base cycle while preserving the previously prepared actual graph', async () => {
    const input = await prepare('shared-recursive.xsd');
    if (input.kind !== 'semantic') throw new Error('semantic source required');
    const prepared = prepareSemanticRequest(input.resolved, {budget: diagnosticBudget()});
    if (prepared.kind !== 'prepared') throw new Error(`context ${prepared.kind}`);
    const original = prepared.request.graph.nodes.find((node): node is ComplexTypeNode => node.kind === 'complexType')!;
    const endpoint: ComplexTypeNode = {...original, derivation: {
      kind: 'extension', contentKind: 'complex', base: {kind: 'local', target: original.id}, facets: [],
    }};
    expect(prepared.request.candidate({key: 'cycle', active: prepared.request.actual.members, endpoint})).toMatchObject({kind: 'candidate-rejected', code: 'cycle'});
    expect(prepared.request.actual.lookup(original.id)).toEqual({kind: 'found', node: original});
    expect(prepared.request.actual.acceptance).toBe('structural-only');
  });

  // Independent review C05: a fresh identity must not smuggle an original
  // declaration QName through a contradictory name property.
  it('rejects a fresh global identity whose declaration name impersonates an original', async () => {
    const input = await prepare('shared-recursive.xsd');
    if (input.kind !== 'semantic') throw new Error('semantic source required');
    const prepared = prepareSemanticRequest(input.resolved, {budget: diagnosticBudget()});
    if (prepared.kind !== 'prepared') throw new Error(`context ${prepared.kind}`);
    const original = prepared.request.graph.nodes.find(node => node.kind === 'element' && node.identity.kind === 'global')!;
    const identity = {kind: 'global', role: 'element', name: {namespace: 'urn:fresh', local: 'Impersonator'}} as const;
    const addition = {...original, id: globalId(identity.role, identity.name), identity};
    expect(prepared.request.candidate({key: 'contradictory-name', active: [...prepared.request.actual.members, addition.id], additions: [addition]}))
      .toMatchObject({kind: 'candidate-rejected', code: 'identity', component: addition.id});
  });

  it('retains chameleon namespace interpretations and original source evidence in sibling candidates', async () => {
    const input = await prepare('chameleon.wsdl');
    if (input.kind !== 'semantic') throw new Error('semantic source required');
    const prepared = prepareSemanticRequest(input.resolved, {budget: diagnosticBudget()});
    if (prepared.kind !== 'prepared') throw new Error(`context ${prepared.kind}`);
    const contexts = [1, 2].map(index => prepared.request.candidate({key: String(index), active: prepared.request.actual.members}));
    for (const result of contexts) {
      if (result.kind !== 'prepared') throw new Error(`candidate ${result.kind}`);
      for (const node of input.resolved.graph.nodes) expect(result.context.sourceNode(node.id)?.context).toEqual(node.context);
    }
    const interpretations = new Set(prepared.request.graph.nodes.map(node => node.context.effectiveNamespace));
    expect(interpretations.size).toBeGreaterThan(1);
  });

  it('accounts candidate additions in the same sticky request after earlier successful preparation', async () => {
    const input = await prepare('shared-recursive.xsd');
    if (input.kind !== 'semantic') throw new Error('semantic source required');
    const budget = createSemanticBudget({maxNodes: input.resolved.graph.nodes.length, maxWork: 50_000_000});
    const prepared = prepareSemanticRequest(input.resolved, {budget});
    if (prepared.kind !== 'prepared') throw new Error(`context ${prepared.kind}`);
    const prior = prepared.request.candidate({key: 'prior', active: prepared.request.actual.members});
    expect(prior.kind).toBe('prepared');
    const sample = prepared.request.graph.nodes.find(node => node.identity.kind === 'global')!;
    const identity = {kind: 'global', role: 'type', name: {namespace: 'urn:fresh', local: 'Fresh'}} as const;
    const helper: GraphNode = {...sample, id: globalId(identity.role, identity.name), identity,
      kind: 'complexType', mixed: false, abstract: false, attributes: []};
    const failed = prepared.request.candidate({key: 'next', active: [...prepared.request.actual.members, helper.id], additions: [helper]});
    expect(failed).toMatchObject({kind: 'resource-limit', limit: 'nodes'});
    const usage = {...budget.usage()};
    expect(prepared.request.candidate({key: 'after', active: prepared.request.actual.members})).toBe(failed);
    expect(budget.usage()).toEqual(usage);
    expect(budget.guard(() => prepared.request.actual.lookup(sample.id))).toBe(failed);
  });
});
