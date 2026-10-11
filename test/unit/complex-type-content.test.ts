import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {prepareResolvedCompilationInput} from '../../src/compiler/semanticCatalog.js';
import {prepareSemanticRequest, contextsShareRequest, graphForSemanticContext} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {assertParticleContentView, deriveActualComplexContent} from '../../src/compiler/complexTypeContent.js';
import {analyzeOccurrences} from '../../src/compiler/occurrenceAnalysis.js';

const fixture = path.resolve('test/conformance/fixtures/xsd/graph');
const id = (name: string) => globalId('type', {namespace: 'urn:graph', local: name});
async function request() {
  const source = await prepareResolvedCompilationInput({kind: 'source', source: path.join(fixture, 'shared-recursive.xsd')}, {loading: {policy: {fileRoots: [fixture]}}});
  if (source.kind !== 'semantic') throw Error('source');
  const prepared = prepareSemanticRequest(source.resolved, {budget: createSemanticBudget({maxWork: 50_000_000})});
  if (prepared.kind !== 'prepared') throw Error('context');
  return {source, request: prepared.request};
}

describe('actual effective complex content', () => {
  it('retains inherited base content before the local extension contribution without rewriting source', async () => {
    const {request: r} = await request(), before = JSON.stringify(r.graph);
    const mapped = deriveActualComplexContent(r.actual, id('Extended'));
    if (mapped.kind !== 'checked') throw Error(mapped.kind);
    expect(mapped.view.content.kind).toBe('mixed');
    if (!('particle' in mapped.view.content)) throw Error('particle');
    const particleId = mapped.view.content.particle;
    const particle = mapped.view.graph.nodes.find(node => node.id === particleId);
    const base = r.actual.lookup(id('Shared')), local = r.actual.lookup(id('Extended'));
    if (base.kind !== 'found' || base.node.kind !== 'complexType' || local.kind !== 'found' || local.node.kind !== 'complexType') throw Error('types');
    expect(particle).toMatchObject({kind: 'particle', occurs: {min: '1', max: '1'}, term: {kind: 'sequence', children: [base.node.content, local.node.content]}});
    expect(r.actual.lookup(particle!.id).kind).toBe('missing');
    expect(JSON.stringify(r.graph)).toBe(before);
    const again = deriveActualComplexContent(r.actual, id('Extended'));
    expect(again.kind === 'checked' && again.view).toBe(mapped.view);
  });

  it('keeps source scalar content separate and authenticates exact context/request ownership', async () => {
    const {request: r} = await request();
    const view = deriveActualComplexContent(r.actual, id('ScalarBase'));
    if (view.kind !== 'checked') throw Error(view.kind);
    expect(view.view.content).toEqual({kind: 'simple', type: expect.objectContaining({kind: 'symbol', role: 'type', name: {namespace: 'urn:graph', local: 'Exact'}})});
    const candidate = r.candidate({key: 'complete', active: r.actual.members});
    if (candidate.kind !== 'prepared') throw Error(candidate.kind);
    expect(contextsShareRequest(r.actual, candidate.context)).toBe(true);
    expect(candidate.context.membership).toBe('complete-actual-plus-additions');
    expect(graphForSemanticContext(candidate.context).nodes[0]).toBe(r.graph.nodes[0]);
    expect(graphForSemanticContext(candidate.context)).toBe(graphForSemanticContext(candidate.context));
    expect(deriveActualComplexContent(candidate.context, id('ScalarBase')).kind).toBe('unresolved');
    expect(() => assertParticleContentView(candidate.context, view.view)).toThrow(TypeError);
    expect(() => assertParticleContentView(r.actual, {...view.view})).toThrow(TypeError);
    const foreign = await request();
    expect(contextsShareRequest(r.actual, foreign.request.actual)).toBe(false);
  });

  it('runs the existing occurrence implementation against one cumulative inclusive sticky budget', async () => {
    const {source} = await request();
    const broad = createSemanticBudget({maxWork: 50_000_000});
    expect(analyzeOccurrences(source.composed, {}, {budget: broad}).kind).toBe('analyzed');
    const exact = createSemanticBudget({maxWork: broad.usage().work});
    expect(analyzeOccurrences(source.composed, {}, {budget: exact}).kind).toBe('analyzed');
    const failure = analyzeOccurrences(source.composed, {}, {budget: exact});
    expect(failure.kind).toBe('resource-limit');
    const usage = exact.usage();
    expect(analyzeOccurrences(source.composed, {}, {budget: exact})).toBe(failure);
    expect(exact.usage()).toEqual(usage);
  });
});
