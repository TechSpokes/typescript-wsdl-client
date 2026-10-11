import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {globalId, scopedId} from '../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ParticleNode} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {deriveActualComplexContent, deriveRawComplexContent} from '../../src/compiler/complexTypeContent.js';
import {assertSemanticParticleView, prepareSemanticParticleView} from '../../src/compiler/particleSemanticView.js';
import {checkDeclaredParticleLegality, checkComplexParticleContent} from '../../src/compiler/particleLocalAssessment.js';

// Primary cos-nonambig and cos-all-limited: UPA concerns declaration positions,
// not QName uniqueness; restriction pointlessness cannot waive all placement.
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:upa';
const named = (local: string) => globalId('type', {namespace, local});
async function setup(file = 'upa-independent.xsd', budget = createSemanticBudget({maxWork: 100_000_000})) {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery', file), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input)), {budget});
  if (prepared.kind !== 'prepared') throw new Error('Expected structural source preparation');
  return prepared.request;
}

describe('independent declared particle legality and attribution', () => {
  for (const maxWork of [undefined, 2_000_000]) {
    it.each([['HugeFixed', true], ['HugeOptional', false], ['HugeNarrow', false], ['HugeOuterRepeat', false], ['HugeFixedGroup', true], ['HugeNarrowGroup', false]] as const)
      (`keeps %s exact symbolic with ${maxWork === undefined ? 'default' : 'diagnostic'} shared request limits`, async (name, expected) => {
        // N=9007199254740993: fixed boundaries distinguish p^N,q;
        // variable N..N+1 has two possible next positions after prefix a^N.
        // Neither the fixture nor this oracle constructs that event prefix.
        const budget = maxWork === undefined ? createSemanticBudget() : createSemanticBudget({maxWork});
        const file = name === 'HugeFixedGroup' ? 'upa-symbolic-group-independent.xsd'
          : name === 'HugeNarrowGroup' ? 'upa-symbolic-narrow-group-independent.xsd' : 'upa-symbolic-independent.xsd';
        const request = await setup(file, budget);
        const preparedWork = budget.usage().work;
        const content = deriveActualComplexContent(request.actual, named(name));
        if (content.kind !== 'checked') throw new Error('Expected compact effective content');
        const result = checkComplexParticleContent(request.actual, content.view);
        // General giant composite state exploration has no fixed-budget
        // success guarantee. A resource result here is an honest measurement;
        // the independent semantic answer, whenever checked, is still true.
        if (name === 'HugeFixedGroup' && result.kind === 'resource-limit') {
          expect(result).toBe(budget.failure());
          expect(checkComplexParticleContent(request.actual, content.view)).toBe(result);
          return;
        }
        expect(result).toMatchObject({kind: 'checked', value: expected,
          ...(expected ? {} : {failedRule: 'cos-nonambig'})});
        expect(budget.usage().work).toBeGreaterThan(preparedWork);
        expect(budget.exhausted()).toBe(false);
        budget.guard(() => budget.chargeWork(maxWork ?? 1_000_000));
        expect(checkComplexParticleContent(request.actual, content.view)).toBe(budget.failure());
      });
  }

  it.each([
    ['FixedPair', true, undefined], ['OptionalPair', false, 'cos-nonambig'],
    ['SharedFixed', true, undefined], ['SharedOptional', false, 'cos-nonambig'],
    ['SubstitutionConflict', false, 'cos-nonambig'], ['WildcardConflict', false, 'cos-nonambig'],
    ['FlatAll', true, undefined], ['OuterRepeat', false, 'cos-nonambig'], ['FixedGroupBoundary', true, undefined],
    ['DeadPrefixAmbiguous', false, 'cos-nonambig'], ['UnreachableSuffix', true, undefined],
  ] as const)('checks %s without using normalized restriction content', async (name, expected, failedRule) => {
    const request = await setup(), content = deriveActualComplexContent(request.actual, named(name));
    if (content.kind !== 'checked') throw new Error('Expected local effective mapping');
    expect(checkComplexParticleContent(request.actual, content.view)).toMatchObject({kind: 'checked', value: expected,
      ...(failedRule ? {failedRule} : {}), obligations: ['component-validity']});
  });

  it.each([['FixedPair', true], ['OptionalPair', false]] as const)('keeps two edges to the same raw declaration position distinct for %s', async (source, expected) => {
    const request = await setup(), actual = request.actual.lookup(named(source));
    if (actual.kind !== 'found' || actual.node.kind !== 'complexType' || !actual.node.content) throw new Error('Expected pair');
    const root = request.actual.lookup(actual.node.content);
    if (root.kind !== 'found' || root.node.kind !== 'particle' || root.node.term.kind !== 'sequence') throw new Error('Expected source sequence');
    const freshId = named('SharedRaw'), particleId = scopedId(freshId, '/content', 'particle');
    const particle: ParticleNode = {...root.node, id: particleId,
      identity: {kind: 'scoped', owner: freshId, path: '/content', role: 'particle'},
      term: {kind: 'sequence', children: [root.node.term.children[0], root.node.term.children[0]]}};
    const type: ComplexTypeNode = {...actual.node, id: freshId, identity: {kind: 'global', role: 'type', name: {namespace, local: 'SharedRaw'}}, content: particleId};
    const candidate = request.candidate({key: 'shared-raw-edges', active: [...request.actual.members, freshId, particleId], additions: [type, particle],
      rawTypes: [{type: freshId, derivation: {method: 'restriction', base: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}},
        abstract: false, final: [], block: [], content: {kind: 'element-only', particle: particleId}, attributeUses: [],
        provenance: {kind: 'hypothetical-abstract', originals: [actual.node.id]}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected literal particle graph');
    const content = deriveRawComplexContent(candidate.context, freshId);
    if (content.kind !== 'checked') throw new Error('Expected raw content');
    expect(checkComplexParticleContent(candidate.context, content.view)).toMatchObject({kind: 'checked', value: expected,
      ...(expected ? {} : {failedRule: 'cos-nonambig'})});
  });

  it('checks nested all before normalization and refuses normalized/copied legality authority', async () => {
    const request = await setup(), actual = request.actual.lookup(named('FlatAll'));
    if (actual.kind !== 'found' || actual.node.kind !== 'complexType' || !actual.node.content) throw new Error('Expected all source');
    const root = request.actual.lookup(actual.node.content);
    if (root.kind !== 'found' || root.node.kind !== 'particle') throw new Error('Expected all root');
    const freshId = named('NestedAll'), particleId = scopedId(freshId, '/content', 'particle');
    const wrapper: ParticleNode = {...root.node, id: particleId,
      identity: {kind: 'scoped', owner: freshId, path: '/content', role: 'particle'},
      term: {kind: 'sequence', children: [root.node.id]}};
    const type: ComplexTypeNode = {...actual.node, id: freshId, identity: {kind: 'global', role: 'type', name: {namespace, local: 'NestedAll'}}, content: particleId};
    const candidate = request.candidate({key: 'raw-nested-all', active: [...request.actual.members, freshId, particleId], additions: [type, wrapper],
      rawTypes: [{type: freshId, derivation: {method: 'restriction', base: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}},
        abstract: false, final: [], block: [], content: {kind: 'element-only', particle: particleId}, attributeUses: [],
        provenance: {kind: 'hypothetical-abstract', originals: [actual.node.id]}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected raw nested candidate');
    const context = candidate.context, content = deriveRawComplexContent(context, freshId);
    if (content.kind !== 'checked') throw new Error('Expected raw content');
    expect(checkComplexParticleContent(context, content.view)).toMatchObject({kind: 'checked', value: false, failedRule: 'cos-all-limited'});
    const normalized = prepareSemanticParticleView(context, content.view, 'restriction');
    if (normalized.kind !== 'checked') throw new Error('Expected normalized view');
    expect(checkDeclaredParticleLegality(context, normalized.view)).toMatchObject({kind: 'unresolved'});
    expect(() => checkDeclaredParticleLegality(context, {...normalized.view})).toThrow(/Unauthenticated/);
    let getterCalls = 0;
    const forged = {...normalized.view, get content() {getterCalls++; return content.view;}};
    expect(() => checkDeclaredParticleLegality(context, forged)).toThrow(TypeError);
    expect(() => assertSemanticParticleView(undefined as unknown as SemanticContext, forged)).toThrow(TypeError);
    expect(getterCalls).toBe(0);
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(checkComplexParticleContent(context, content.view)).toBe(request.budget.failure());
  });
});
