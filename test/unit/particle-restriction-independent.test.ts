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
import {prepareSemanticParticleView} from '../../src/compiler/particleSemanticView.js';
import type {SemanticParticleView} from '../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../src/compiler/particleRestriction.js';
import {checkComponentConstruction} from '../../src/compiler/schemaConstructionAssessment.js';

// Literal outcomes specified from dated primary before relation implementation:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/270#issuecomment-6111969140
const fixtures = path.resolve('test/conformance/fixtures');
const named = (local: string) => globalId('type', {namespace: 'urn:recovery:restriction', local});
async function setup(file = 'restriction-independent.xsd') {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery', file), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input)), {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error(`Expected structural preparation: ${prepared.kind}`);
  return prepared.request;
}
function view(context: SemanticContext, local: string, purpose: 'restriction' | 'declared' = 'restriction'): SemanticParticleView {
  const content = deriveActualComplexContent(context, named(local));
  if (content.kind !== 'checked') throw new Error(`Expected effective content ${local}: ${content.kind}`);
  const result = prepareSemanticParticleView(context, content.view, purpose);
  if (result.kind !== 'checked') throw new Error(`Expected ${purpose} view ${local}: ${JSON.stringify(result)}`);
  return result.view;
}

describe('independent normalized XSD1.0 particle relation controls', () => {
  it('recognizes raw particle identity and the selected existential order for distinct implicit copies', async () => {
    const request = await setup();
    const base = view(request.actual, 'HeadOnly'), inherited = view(request.actual, 'HeadExtended');
    expect(base.root.orderUnspecified).toBe(true);
    expect(inherited).not.toBe(base);
    expect(checkParticleRestriction(request.actual, inherited, base)).toMatchObject({kind: 'checked', value: true});
    expect(checkParticleRestriction(request.actual, view(request.actual, 'HeadCopy'), base)).toMatchObject({kind: 'checked', value: true});
  });

  it.each([
    ['ChoiceBA', 'ChoiceAB', false], ['ChoiceA', 'ChoiceAB', true],
    ['SeqBA', 'SeqAB', false], ['AllBA', 'AllAB', false], ['SeqBA', 'AllAB', true],
    ['SeqAA', 'AllAOptionalB', false], ['ChoiceA', 'AllAOptionalB', true], ['ChoiceA', 'AllAB', false],
    ['SeqAA', 'ChoiceAB2', true], ['SeqAA', 'ChoiceAB', false],
    ['Big', 'BigMinusOne', false], ['Big', 'Big', true],
  ] as const)('checks %s restricting %s as %s without replacing mappings with language inclusion', async (derived, base, expected) => {
    const request = await setup();
    expect(checkParticleRestriction(request.actual, view(request.actual, derived), view(request.actual, base)))
      .toMatchObject({kind: 'checked', value: expected, rule: 'cos-particle-restrict',
        obligations: ['component-validity', 'particle-local-legality']});
  });

  it('preserves singleton all optionality and required empty choice in a separate normalized graph', async () => {
    const request = await setup(), before = JSON.stringify(request.graph);
    const declared = view(request.actual, 'OptionalAllA', 'declared');
    const normalized = view(request.actual, 'OptionalAllA');
    expect(declared.root.kind).toBe('all');
    expect(normalized.root).toMatchObject({kind: 'element', occurs: {min: '0', max: '1'}});
    expect(checkParticleRestriction(request.actual, normalized, view(request.actual, 'ChoiceA'))).toMatchObject({kind: 'checked', value: false});
    expect(view(request.actual, 'RequiredEmptyChoice').root).toMatchObject({kind: 'choice', occurs: {min: '1', max: '1'}, children: []});
    expect(view(request.actual, 'Empty').root.kind).toBe('sequence');
    expect(JSON.stringify(request.graph)).toBe(before);
  });

  it('ignores an optional choice made empty by flattening required nested choices', async () => {
    // cos-particle-restrict.2.2: each unit nested choice is pointless; the
    // resulting empty outer choice with min=0 is also pointless.
    const request = await setup('pointless-optional-choice.xsd'), before = JSON.stringify(request.graph);
    const declared = view(request.actual, 'Carrier', 'declared');
    expect(declared.root).toMatchObject({kind: 'choice', occurs: {min: '0', max: '1'}, children: [
      {kind: 'choice', occurs: {min: '1', max: '1'}, children: []},
      {kind: 'choice', occurs: {min: '1', max: '1'}, children: []},
    ]});
    const normalized = view(request.actual, 'Carrier');
    expect(normalized.root).toMatchObject({kind: 'sequence', occurs: {min: '1', max: '1'}, children: []});
    expect(normalized.root.summary).toMatchObject({nullable: true, schemaEmptiable: true, effectiveTotalRange: {min: '0', max: '0'}});
    for (const name of ['RequiredAfterFlatten', 'RequiredEmpty'])
      expect(view(request.actual, name).root).toMatchObject({kind: 'choice', occurs: {min: '1', max: '1'}, children: [],
        summary: {nullable: false, schemaEmptiable: true}});
    expect(view(request.actual, 'NewlySingleton').root.kind).toBe('element');
    expect(view(request.actual, 'Carrier', 'declared')).toBe(declared);
    expect(JSON.stringify(request.graph)).toBe(before);
  });

  it('keeps raw construction and direct-zero rejection separate from pointless comparison removal', async () => {
    const request = await setup('pointless-optional-choice.xsd'), source = request.actual.lookup(named('Carrier'));
    if (source.kind !== 'found' || source.node.kind !== 'complexType' || !source.node.content) throw new Error('Expected original carrier');
    const original = request.actual.lookup(source.node.content);
    if (original.kind !== 'found' || original.node.kind !== 'particle') throw new Error('Expected original choice');
    const freshId = named('RawCarrier'), fresh: ComplexTypeNode = {...source.node, id: freshId,
      identity: {kind: 'global', role: 'type', name: {namespace: 'urn:recovery:restriction', local: 'RawCarrier'}}};
    const candidate = request.candidate({key: 'raw-optional-carrier', active: [...request.actual.members, freshId], additions: [fresh],
      rawTypes: [{type: freshId, derivation: {method: 'restriction', base: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}},
        abstract: false, final: [], block: [], content: {kind: 'element-only', particle: original.node.id}, attributeUses: [],
        provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected literal raw candidate');
    const rawBefore = JSON.stringify(candidate.context.rawTypeProperties(freshId));
    const content = deriveRawComplexContent(candidate.context, freshId);
    if (content.kind !== 'checked') throw new Error('Expected authenticated raw content');
    const declared = prepareSemanticParticleView(candidate.context, content.view, 'declared');
    const normalized = prepareSemanticParticleView(candidate.context, content.view, 'restriction');
    expect(declared).toMatchObject({kind: 'checked', view: {root: {kind: 'choice', occurs: {min: '0', max: '1'}, children: [{}, {}]}}});
    expect(normalized).toMatchObject({kind: 'checked', view: {root: {kind: 'sequence', occurs: {min: '1', max: '1'}, children: []}}});
    expect(checkComponentConstruction(candidate.context, freshId)).toMatchObject({kind: 'checked', obligations: []});
    expect(JSON.stringify(candidate.context.rawTypeProperties(freshId))).toBe(rawBefore);
    const zeroId = scopedId(source.node.id, '/fresh-zero', 'particle');
    const zero: ParticleNode = {...original.node, id: zeroId,
      identity: {kind: 'scoped', owner: source.node.id, path: '/fresh-zero', role: 'particle'}, occurs: {min: '0', max: '0'}};
    const zeroCandidate = request.candidate({key: 'raw-zero-remains-invalid', active: [...request.actual.members, zeroId], additions: [zero]});
    if (zeroCandidate.kind !== 'prepared') throw new Error('Expected zero structural candidate');
    expect(checkComponentConstruction(zeroCandidate.context, zeroId)).toMatchObject({kind: 'candidate-rejected', rule: 'p-props-correct', component: zeroId});
  });

  it('requires authenticated restriction views and preserves sticky request exhaustion', async () => {
    const request = await setup(), derived = view(request.actual, 'ChoiceA'), base = view(request.actual, 'ChoiceAB');
    expect(() => checkParticleRestriction(request.actual, {...derived}, base)).toThrow(/Unauthenticated/);
    expect(checkParticleRestriction(request.actual, view(request.actual, 'ChoiceA', 'declared'), base)).toMatchObject({kind: 'unresolved'});
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(checkParticleRestriction(request.actual, derived, base)).toBe(request.budget.failure());
    expect(prepareSemanticParticleView(request.actual, derived.content, 'restriction')).toBe(request.budget.failure());
  });
});
