import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {deriveActualComplexContent} from '../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../src/compiler/particleRestriction.js';

const fixtures = path.resolve('test/conformance/fixtures');
async function setup() {
  const source = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/particle-mapping-alternatives.xsd'), {policy: {fileRoots: [fixtures]}});
  // This local backtracking control intentionally has retained-only IC data.
  // Genuine SOURCE sets now form; their empty-subset positive is tested in the
  // independent IC suite. No complete SOURCE receipt is claimed by this harness.
  const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(source)), {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected structural source preparation');
  const context = prepared.request.actual;
  expect(context.originalIdentityConstraints().sourceBound).toBe(false);
  const view = (local: string) => {
    const content = deriveActualComplexContent(context, globalId('type', {namespace: 'urn:recovery:mapping-alternatives', local}));
    if (content.kind !== 'checked') throw new Error('Expected effective content');
    const normalized = prepareSemanticParticleView(context, content.view, 'restriction');
    if (normalized.kind !== 'checked') throw new Error('Expected normalized view');
    return normalized.view;
  };
  return {context, view};
}

describe('particle mapping alternatives with explicit local prerequisites', () => {
  it.each([
    ['A', 'ChoicePendingFirst'], ['AB', 'SequencePendingFirst'],
    ['AB', 'AllPendingFirst'], ['AA', 'SumPendingFirst'],
  ])('finds a checked %s to %s mapping after an unresolved alternative', async (derived, base) => {
    const {context, view} = await setup();
    expect(checkParticleRestriction(context, view(derived), view(base))).toMatchObject({kind: 'checked', value: true,
      obligations: ['component-validity', 'particle-local-legality']});
  });

  it('retains unresolved when no checked alternative succeeds', async () => {
    const {context, view} = await setup();
    expect(checkParticleRestriction(context, view('A'), view('ChoiceOnlyPending'))).toMatchObject({kind: 'unresolved', rule: 'component-identity-constraint-properties'});
  });

  it('does not hide malformed component input behind another mapping', async () => {
    const {context, view} = await setup();
    expect(checkParticleRestriction(context, view('A'), view('ChoiceMalformedFirst'))).toMatchObject({kind: 'invalid-input', rule: 'block-lexical'});
  });
});
