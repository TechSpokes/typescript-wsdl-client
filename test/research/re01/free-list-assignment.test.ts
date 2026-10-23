/** Original fixed tuples force genuinely new affiliated LIST consumers on the ordinary candidate. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {DEFAULT_MAX_WORK} from '../../../src/compiler/semanticBudget.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {RawFacetComponentEntry} from '../../../src/compiler/schemaSimpleTypeProperties.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {prepareInheritedMiddleAssignments} from './shared-assignment.js';
import {assertFreeListAssignment, prepareFreeListAssignments} from './free-list-assignment.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:free-list';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string) => ({kind: 'local' as const, target});
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);
async function setup() {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/free-list-assignment.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared'); return prepared.request;
}

it('derives new first-enum LIST cohorts and their actual ordinary affiliates solely from original input', async () => {
  const request = await setup(), actual = request.actual, before = JSON.stringify(request.graph);
  const inherited = prepareInheritedMiddleAssignments(actual, actual, id('D'));
  assert.equal(inherited.kind, 'prepared-inherited-assignments'); expect(inherited.assignments).toEqual([]);
  const result = prepareFreeListAssignments(actual, actual, id('D'));
  assert.equal(result.kind, 'prepared-free-list-assignments', json(result));
  const assignment = result.assignments[0]!; assertFreeListAssignment(assignment);
  expect(assignment.cohorts).toHaveLength(2);
  expect(assignment.receipt.kind).toBe('checked-candidate'); expect(assignment.receipt.proof).toHaveLength(1);
  expect(assignment.introducedStoredNonprimitive).toBe(0);
  const kernel = createSchemaScalarKernel(assignment.context);
  const expected = [['foo', 'bar'], ['bar', 'baz']];
  for (let i = 0; i < assignment.cohorts.length; i++) {
    const cohort = assignment.cohorts[i]!, member = assignment.context.lookup(cohort.member);
    assert.equal(member.kind, 'found'); assert.equal(member.node.kind, 'element');
    assert.ok(member.node.value);
    const value = kernel.assess(local(cohort.enumeration), member.node.value.lexical, member.node.id);
    assert.equal(value.kind, 'checked', json(value));
    expect(value.value.operand.items?.map(item => item.canonical)).toEqual(expected[i]!.map(name => JSON.stringify(['', name])));
    expect(assignment.receipt.proof[0]!.components.some(at => at.component === cohort.member)).toBe(true);
    expect(assignment.receipt.proof[0]!.components.some(at => at.component === cohort.preparation)).toBe(true);
  }
  const proof = verifyFiniteRe01Evidence(actual, id('D'), assignment.forest);
  assert.equal(proof.kind, 'checked-candidate', json(proof));
  expect(proof.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  expect(JSON.stringify(request.graph)).toBe(before);
});

it('keeps every unseen positive token funded in each complete pre-mask program and masks whole tuples', async () => {
  const {actual} = await setup(), result = prepareFreeListAssignments(actual, actual, id('D'));
  assert.equal(result.kind, 'prepared-free-list-assignments', json(result));
  const assignment = result.assignments[0]!, kernel = createSchemaScalarKernel(assignment.context);
  for (const cohort of assignment.cohorts) {
    const member = assignment.context.lookup(cohort.member); assert.equal(member.kind, 'found');
    for (const token of ['foo', 'bar', 'baz']) {
      const word = {value: token, context: member.node.context};
      const item = kernel.assess(cohort.item, word, cohort.member), prepared = kernel.assess(local(cohort.preparation), word, cohort.member);
      assert.equal(item.kind, 'checked'); assert.equal(prepared.kind, 'checked');
      expect(prepared.value.operand.items).toEqual([item.value.operand]);
      expect(kernel.assess(local(cohort.enumeration), word, cohort.member).kind).toBe('invalid-schema');
    }
    for (const tuple of ['foo bar', 'bar baz']) {
      const word = {value: tuple, context: member.node.context};
      const original = kernel.assess(local(id('Words')), word, cohort.member), prepared = kernel.assess(local(cohort.preparation), word, cohort.member);
      assert.equal(original.kind, 'checked'); assert.equal(prepared.kind, 'checked'); expect(prepared.value.operand).toEqual(original.value.operand);
    }
  }
});

it('refuses in flight with one sticky request budget and no partial family', async () => {
  const {actual} = await setup();
  // Leave enough work for entry and source extraction, but not full construction.
  const before = actual.budget.usage().work;
  actual.budget.guard(() => actual.budget.chargeWork(DEFAULT_MAX_WORK - before - 2_000));
  const atEntry = actual.budget.usage().work;
  const result = prepareFreeListAssignments(actual, actual, id('D'));
  expect(result.kind).toBe('resource-limit'); expect(actual.budget.usage().work).toBeGreaterThan(atEntry);
  expect(prepareFreeListAssignments(actual, actual, id('D'))).toBe(actual.budget.failure());
});

it('rejects locally funded enum operands whose saved QName map disagrees with the ordinary fixed VALUE', async () => {
  const {actual} = await setup(), result = prepareFreeListAssignments(actual, actual, id('D'));
  assert.equal(result.kind, 'prepared-free-list-assignments'); const assignment = result.assignments[0]!;
  const first = assignment.cohorts[0]!;
  const changed = assignment.delta.rawSimpleTypes!.map(row => row.type !== first.enumeration || row.facetComponentSet === undefined ? row : {...row,
    facetComponentSet: row.facetComponentSet!.map((entry): RawFacetComponentEntry => !('facets' in entry) ? entry : {...entry,
      facets: entry.facets.map(facet => ({...facet, lexical: {...facet.lexical, context: {...facet.lexical.context,
        namespaces: {...facet.lexical.context.namespaces, '': 'urn:re01:wrong-value'}}}}))})});
  const built = forkSemanticCandidate(actual, {...assignment.delta, key: 'wrong-saved-map', rawSimpleTypes: changed});
  assert.equal(built.kind, 'prepared');
  expect(checkComponentConstruction(built.context, first.enumeration).kind).toBe('checked');
  const proof = verifyFiniteRe01Evidence(actual, id('D'), {root: 'wrong-map', nodes: [{...assignment.forest.nodes[0]!,
    id: 'wrong-map', context: built.context}]});
  expect(proof).toMatchObject({kind: 'candidate-rejected', rule: 'cvc-enumeration-valid', component: first.member});
});
