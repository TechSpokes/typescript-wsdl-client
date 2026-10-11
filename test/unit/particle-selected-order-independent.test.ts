import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {deriveActualComplexContent} from '../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../src/compiler/particleRestriction.js';

// Selected existential implicit ordering, preserving explicit lists: #270 6114385585.
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:selected-order';
const maximum = 100_000_000;
async function setup() {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/selected-particle-order.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: maximum})});
  if (prepared.kind !== 'prepared') throw new Error('Expected original schema');
  const request = prepared.request;
  const view = (local: string) => {
    const content = deriveActualComplexContent(request.actual, globalId('type', {namespace, local}));
    if (content.kind !== 'checked') throw new Error('Expected mapped content');
    const normalized = prepareSemanticParticleView(request.actual, content.view, 'restriction');
    if (normalized.kind !== 'checked') throw new Error('Expected authenticated normalized view');
    return normalized.view;
  };
  return {request, view};
}

describe('independent selected implicit choice enumeration', () => {
  it.each([
    ['ImplicitCopy', 'Implicit', true], ['ExplicitBA', 'Implicit', true], ['Implicit', 'ExplicitBA', true],
    ['ExplicitBA', 'ExplicitAB', false], ['ImplicitBlock', 'ReverseBlock', true], ['ReverseBlock', 'ImplicitBlock', true],
    ['ImplicitBlock', 'Interleaved', false], ['Interleaved', 'ImplicitBlock', false],
    ['SameReverseUses', 'ImplicitTwo', true], ['OppositeUses', 'ImplicitTwo', false],
    ['OppositeUses', 'DistinctImplicitBlocks', true],
  ] as const)('checks %s restricting %s as %s without reordering explicit siblings', async (derived, base, expected) => {
    const {request, view} = await setup();
    expect(checkParticleRestriction(request.actual, view(derived), view(base)))
      .toMatchObject({kind: 'checked', value: expected, rule: 'cos-particle-restrict', obligations: ['component-validity', 'particle-local-legality']});
  });

  it('chooses afresh on each root query using the same authenticated implicit view', async () => {
    const {request, view} = await setup();
    const base = view('Implicit'), ab = view('ExplicitAB'), ba = view('ExplicitBA');
    for (const derived of [ab, ba, ab]) {
      expect(checkParticleRestriction(request.actual, derived, base)).toMatchObject({kind: 'checked', value: true});
    }
  });

  it('never treats incomplete enumeration under the shared budget as a semantic negative', async () => {
    const measured = await setup();
    const md = measured.view('OppositeUses'), mb = measured.view('ImplicitTwo');
    const before = measured.request.budget.usage().work;
    expect(checkParticleRestriction(measured.request.actual, md, mb)).toMatchObject({kind: 'checked', value: false});
    const queryWork = measured.request.budget.usage().work - before;
    expect(queryWork).toBeGreaterThan(1);
    const bounded = await setup(), derived = bounded.view('OppositeUses'), base = bounded.view('ImplicitTwo');
    const remaining = Math.max(1, Math.floor(queryWork / 2));
    bounded.request.budget.chargeWork(maximum - bounded.request.budget.usage().work - remaining);
    const result = checkParticleRestriction(bounded.request.actual, derived, base);
    expect(result).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(result).toBe(bounded.request.budget.failure());
    expect(checkParticleRestriction(bounded.request.actual, derived, base)).toBe(result);
  });
});
