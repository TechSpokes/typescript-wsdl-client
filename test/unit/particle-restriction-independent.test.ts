import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {deriveActualComplexContent} from '../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../src/compiler/particleSemanticView.js';
import type {SemanticParticleView} from '../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../src/compiler/particleRestriction.js';

// Literal outcomes specified from dated primary before relation implementation:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/270#issuecomment-6111969140
const fixtures = path.resolve('test/conformance/fixtures');
const named = (local: string) => globalId('type', {namespace: 'urn:recovery:restriction', local});
async function setup() {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/restriction-independent.xsd'), {policy: {fileRoots: [fixtures]}});
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
  it('recognizes the same raw particle across views without choosing an implicit substitution order', async () => {
    const request = await setup();
    const base = view(request.actual, 'HeadOnly'), inherited = view(request.actual, 'HeadExtended');
    expect(base.root.orderUnspecified).toBe(true);
    expect(inherited).not.toBe(base);
    expect(checkParticleRestriction(request.actual, inherited, base)).toMatchObject({kind: 'checked', value: true});
    expect(checkParticleRestriction(request.actual, view(request.actual, 'HeadCopy'), base)).toMatchObject({kind: 'unresolved'});
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

  it('requires authenticated restriction views and preserves sticky request exhaustion', async () => {
    const request = await setup(), derived = view(request.actual, 'ChoiceA'), base = view(request.actual, 'ChoiceAB');
    expect(() => checkParticleRestriction(request.actual, {...derived}, base)).toThrow(/Unauthenticated/);
    expect(checkParticleRestriction(request.actual, view(request.actual, 'ChoiceA', 'declared'), base)).toMatchObject({kind: 'unresolved'});
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(checkParticleRestriction(request.actual, derived, base)).toBe(request.budget.failure());
    expect(prepareSemanticParticleView(request.actual, derived.content, 'restriction')).toBe(request.budget.failure());
  });
});
