/** A retained HEAD P1 requires changed ITEM/FIRST before first LIST enum funding. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import type {RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';
import {DEFAULT_MAX_WORK} from '../../../src/compiler/semanticBudget.js';
import {prepareBooleanFreeListAssignments, prepareFreeListAssignments} from './free-list-assignment.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:free-list-boolean';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string) => ({kind: 'local' as const, target});
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);
async function setup(mode: 'true' | 'false' = 'true') {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/free-list-boolean-assignment' + (mode === 'false' ? '-false' : '') + '.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared'); return prepared.request;
}

it.each(['true', 'false'] as const)('derives one new shared ITEM and stage-funded LIST cohorts for the original %s demands', async mode => {
  const request = await setup(mode), actual = request.actual, before = JSON.stringify(request.graph);
  const exact = prepareFreeListAssignments(actual, actual, id('D'));
  expect(exact.kind).toBe('unresolved');
  const result = prepareBooleanFreeListAssignments(actual, actual, id('D'));
  assert.equal(result.kind, 'prepared-free-list-assignments', json(result));
  const assignment = result.assignments[0]!, kernel = createSchemaScalarKernel(assignment.context);
  expect(assignment.family).toBe('boolean-item-free-list-v1'); expect(assignment.introducedStoredNonprimitive).toBe(0);
  expect(assignment.cohorts[0]!.item).toEqual(assignment.cohorts[1]!.item);
  for (const cohort of assignment.cohorts) {
    const field = assignment.context.lookup(cohort.field), member = assignment.context.lookup(cohort.member);
    assert.equal(field.kind, 'found'); assert.equal(field.node.kind, 'element'); assert.ok(field.node.value);
    const item = assignment.context.resolve(cohort.item); assert.equal(item.kind, 'found');
    const guardNamespace = item.node.context.namespaces['']; assert.ok(guardNamespace);
    expect(Object.values(field.node.context.namespaces)).not.toContain(guardNamespace);
    assert.equal(member.kind, 'found'); assert.equal(member.node.kind, 'element'); assert.ok(member.node.value);
    const oldValue = kernel.assess(local(id('Words')), field.node.value.lexical, field.node.id);
    const unchanged = kernel.assess(local(id('HeadWords')), member.node.value.lexical, member.node.id);
    const prepared = kernel.assess(local(cohort.preparation), member.node.value.lexical, member.node.id);
    const selected = kernel.assess(local(cohort.enumeration), member.node.value.lexical, member.node.id);
    assert.equal(oldValue.kind, 'checked'); assert.equal(unchanged.kind, 'checked'); assert.equal(prepared.kind, 'checked'); assert.equal(selected.kind, 'checked');
    expect(oldValue.value.operand.items?.[0]).toMatchObject({family: 'boolean', canonical: mode});
    expect(unchanged.value.operand.items?.[0].family).toBe('QName');
    expect(prepared.value.operand.items?.map(item => ({family: item.family, canonical: item.canonical})))
      .toEqual([{family: 'boolean', canonical: mode}]);
    expect(selected.value.operand.items?.map(item => ({family: item.family, canonical: item.canonical})))
      .toEqual([{family: 'boolean', canonical: mode}]);
    expect(kernel.equivalent(local(id('Words')), field.node.value.lexical, local(cohort.enumeration), member.node.value.lexical, member.node.id))
      .toMatchObject({kind: 'checked', value: true});
    expect(member.node.value.lexical.value).toBe(mode);
  }
  const proof = verifyFiniteRe01Evidence(actual, id('D'), assignment.forest);
  assert.equal(proof.kind, 'checked-candidate', json(proof)); expect(proof.proof).toHaveLength(1);
  expect(JSON.stringify(request.graph)).toBe(before);
});

it('rejects unchanged inherited ITEM FIRST despite genuinely funded enum tuples', async () => {
  const {actual} = await setup(), result = prepareBooleanFreeListAssignments(actual, actual, id('D'));
  assert.equal(result.kind, 'prepared-free-list-assignments'); const assignment = result.assignments[0]!;
  const rows = assignment.delta.rawSimpleTypes!.map((row): RawSimpleTypeProperties => row.variety.kind === 'list'
    ? {...row, variety: {kind: 'list', item: local(id('Item'))}} : row);
  const built = forkSemanticCandidate(actual, {...assignment.delta, key: 'unchanged-first', rawSimpleTypes: rows});
  assert.equal(built.kind, 'prepared');
  expect(checkComponentConstruction(built.context, assignment.cohorts[0]!.enumeration).kind).toBe('checked');
  const proof = verifyFiniteRe01Evidence(actual, id('D'), {root: 'unchanged-first', nodes: [{...assignment.forest.nodes[0]!, id: 'unchanged-first', context: built.context}]});
  expect(proof).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: id('D')});
});

it('rejects later-L0 funding substituted for the real immediate enum BASE', async () => {
  const {actual} = await setup(), result = prepareBooleanFreeListAssignments(actual, actual, id('D'));
  assert.equal(result.kind, 'prepared-free-list-assignments'); const assignment = result.assignments[0]!;
  const enums = new Set(assignment.cohorts.map(cohort => cohort.enumeration));
  const rows = assignment.delta.rawSimpleTypes!.map(row => enums.has(row.type) ? {...row, base: local(id('HeadWords'))} : row);
  const built = forkSemanticCandidate(actual, {...assignment.delta, key: 'unfunded-direct-enum', rawSimpleTypes: rows});
  assert.equal(built.kind, 'prepared');
  expect(checkComponentConstruction(built.context, assignment.cohorts[0]!.enumeration))
    .toMatchObject({kind: 'candidate-rejected', rule: 'enumeration-valid-restriction'});
});

it('retains the smaller native UNION-to-atomic Boolean ITEM alternative', async () => {
  const {actual} = await setup(), result = prepareBooleanFreeListAssignments(actual, actual, id('D'));
  assert.equal(result.kind, 'prepared-free-list-assignments'); const assignment = result.assignments[0]!;
  const item = assignment.cohorts[0]!.item; assert.equal(item.kind, 'local');
  const itemRow = assignment.delta.rawSimpleTypes!.find(row => row.type === item.target); assert.ok(itemRow); assert.equal(itemRow.variety.kind, 'union');
  const guard = itemRow.variety.members[0]!; assert.equal(guard.kind, 'local');
  const omitted = new Set([item.target, guard.target]);
  const boolean = {kind: 'builtin' as const, name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'boolean'}};
  const rows = assignment.delta.rawSimpleTypes!.filter(row => !omitted.has(row.type)).map((row): RawSimpleTypeProperties =>
    row.variety.kind === 'list' ? {...row, variety: {kind: 'list', item: boolean}} : row);
  const built = forkSemanticCandidate(actual, {...assignment.delta, key: 'atomic-boolean-alternative',
    active: assignment.delta.active.filter(at => !omitted.has(at)), additions: assignment.delta.additions!.filter(at => !omitted.has(at.id)), rawSimpleTypes: rows});
  assert.equal(built.kind, 'prepared');
  const proof = verifyFiniteRe01Evidence(actual, id('D'), {root: 'atomic-boolean-alternative', nodes: [{...assignment.forest.nodes[0]!,
    id: 'atomic-boolean-alternative', context: built.context}]});
  assert.equal(proof.kind, 'checked-candidate', json(proof));
});

it('refuses in flight without publishing a partial Boolean family', async () => {
  const {actual} = await setup();
  actual.budget.guard(() => actual.budget.chargeWork(DEFAULT_MAX_WORK - actual.budget.usage().work - 2_000));
  const before = actual.budget.usage().work;
  expect(prepareBooleanFreeListAssignments(actual, actual, id('D')).kind).toBe('resource-limit');
  expect(actual.budget.usage().work).toBeGreaterThan(before);
  expect(prepareBooleanFreeListAssignments(actual, actual, id('D'))).toBe(actual.budget.failure());
});
