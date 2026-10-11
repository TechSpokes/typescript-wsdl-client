import path from 'node:path';
import {expect, it} from 'vitest';
import type {ComplexTypeNode, ParticleNode} from '../../src/compiler/canonicalGraph.js';
import {analyzeOccurrences} from '../../src/compiler/occurrenceAnalysis.js';
import {prepareResolvedCompilationInput} from '../../src/compiler/semanticCatalog.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {restrictParticleToWildcard} from '../../src/compiler/particleWildcardRelation.js';
import type {DecisionParticle} from '../../src/compiler/particleWildcardRelation.js';
import {wildcardNamespaces} from '../../src/compiler/wildcardAlgebra.js';

const root = path.resolve('test/conformance/fixtures/xsd/s06-pw01');
async function input(file: string) {
  const source = await prepareResolvedCompilationInput({kind: 'source', source: path.join(root, file)}, {loading: {policy: {fileRoots: [root]}}});
  if (source.kind !== 'semantic') throw new Error('semantic input required');
  const prepared = prepareSemanticRequest(source.resolved, {budget: createSemanticBudget({maxWork: 20_000_000})});
  if (prepared.kind !== 'prepared') throw new Error(`context ${prepared.kind}`);
  const analysis = analyzeOccurrences(source.composed);
  if (analysis.kind !== 'analyzed') throw analysis.diagnostic;
  const nodes = new Map(source.resolved.graph.nodes.map(node => [node.id, node]));
  const ranges = new Map(analysis.analysis.particles.map(summary => [summary.id, summary.effectiveTotalRange]));
  // This adapter is deliberately limited to the independently authored flat
  // sequence fixtures. It consumes #178 totals without calculating replacements.
  const view = (particle: ParticleNode): DecisionParticle => {
    const term = particle.term;
    if (term.kind === 'group') throw new Error('outside fixture adapter');
    const members = 'children' in term ? term.children.map(id => {
      const child = nodes.get(id); if (child?.kind !== 'particle') throw new Error('particle child');
      return view(child);
    }) : [];
    const declaration = term.kind === 'element' ? prepared.request.actual.resolve(term.declaration) : undefined;
    return {owner: particle, kind: term.kind, occurs: particle.occurs, total: ranges.get(particle.id)!, members,
      namespace: declaration?.kind === 'found' && declaration.node.kind === 'element' ? declaration.node.name.namespace : undefined,
      wildcard: term.kind === 'any' ? {constraint: wildcardNamespaces(term.wildcard), processContents: term.wildcard.processContents,
        lexical: {value: term.wildcard.namespace.value, effectiveNamespace: term.wildcard.namespace.context.effectiveNamespace}} : undefined};
  };
  const derived = source.resolved.graph.nodes.find((node): node is ComplexTypeNode => node.kind === 'complexType' && node.identity.kind === 'global' && node.identity.name.local === 'D')!;
  const base = source.resolved.graph.nodes.find((node): node is ParticleNode => node.kind === 'particle' && node.term.kind === 'any')!;
  return {context: prepared.request.actual, request: prepared.request, derived: view(nodes.get(derived.content!) as ParticleNode), base: view(base)};
}

it('uses selected zero member minima with original group totals from #178 and reports its remaining premises', async () => {
  const data = await input('direct-optional-member.xsd');
  const result = restrictParticleToWildcard(data.context, data.derived, data.base);
  expect(result).toMatchObject({kind: 'conditional-relation', ruleVersion: 'PW-R-240-v1', validRestriction: true, contextId: data.context.contextId});
  if (result.kind !== 'conditional-relation') throw new Error('relation');
  expect(result.requirements).toContain('view-total-ranges-from-178');
  expect(result.requirements).toContain('upa-edc');
  // The formal minimum contrast is independent of member lowering.
  expect(restrictParticleToWildcard(data.context, data.derived, {...data.base, occurs: {min: '3', max: '3'}})).toMatchObject({kind: 'conditional-relation', validRestriction: false});
});

it('retains optional element namespace constraints and authentic context boundaries', async () => {
  const data = await input('direct-optional-member.xsd');
  const restricted = {...data.base, wildcard: {...data.base.wildcard!, constraint: {kind: 'set', namespaces: ['urn:elsewhere']} as const}};
  expect(restrictParticleToWildcard(data.context, data.derived, restricted)).toMatchObject({kind: 'conditional-relation', validRestriction: false});
  expect(() => restrictParticleToWildcard({...data.context}, data.derived, data.base)).toThrow('Unauthenticated');
  const omitted = data.request.candidate({key: 'empty', active: []});
  if (omitted.kind !== 'prepared') throw new Error('candidate');
  expect(restrictParticleToWildcard(omitted.context, data.derived, data.base)).toMatchObject({kind: 'input-error'});
});

it('shares resource exhaustion with the existing request and emits no partial relation', async () => {
  const data = await input('direct-optional-member.xsd');
  const first = restrictParticleToWildcard(data.context, data.derived, data.base);
  expect(first.kind).toBe('conditional-relation');
  const failure = data.context.budget.guard(() => data.context.budget.chargeWork(20_000_000));
  expect(failure).toMatchObject({kind: 'resource-limit'});
  expect(restrictParticleToWildcard(data.context, data.derived, data.base)).toBe(failure);
});
