/** Independent lexical/tag expectations for the finite anchored grammar. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {createSemanticBudget, DEFAULT_MAX_WORK} from '../../../src/compiler/semanticBudget.js';
import {resolveSemanticType, semanticTypeKey} from '../../../src/compiler/schemaTypeIdentity.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import type {SemanticTypeReference} from '../../../src/compiler/semanticTypeReference.js';
import {assertAnchoredListAssignment, prepareAnchoredListAssignments} from './anchored-list-assignment.js';
import type {AnchoredListAssignment} from './anchored-list-assignment.js';

const fixtures = path.resolve('test/conformance/fixtures');
const local = (target: string) => ({kind: 'local' as const, target});
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);
const same = (context: SemanticContext, left: SemanticTypeReference, right: SemanticTypeReference): boolean => {
  const a = resolveSemanticType(context, left), z = resolveSemanticType(context, right);
  assert.ok('identity' in a); assert.ok('identity' in z);
  return semanticTypeKey(context, a.identity) === semanticTypeKey(context, z.identity);
};
const outcomes = (prepared: Extract<ReturnType<typeof prepareAnchoredListAssignments>, {kind: 'prepared-anchored-list-assignments'}>) =>
  json(prepared.outcomes.map(at => ({kind: at.choice.kind, result: at.result === 'prepared-local-evidence' ? at.result : {kind: at.result.kind, ...('rule' in at.result ? {rule: at.result.rule} : {})}})));
async function setup(file: string, maxWork?: number) {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery', file + '.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget(maxWork === undefined ? {} : {maxWork})});
  assert.equal(prepared.kind, 'prepared', json(prepared));
  return prepared.request.actual;
}

it('qualifies each actual decimal/float member against the protected fixed tuple without hiding rejected alternatives', async () => {
  const actual = await setup('free-list-changed-item'), namespace = 'urn:re01:free-list-changed-item';
  const id = (name: string) => globalId('type', {namespace, local: name});
  const prepared = prepareAnchoredListAssignments(actual, actual, id('D'));
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments', json(prepared));
  // Independent evidence: the fixture's first/later decimals select decimal(1),
  // FloatZero excludes 1, and FloatLater selects the wrong tagged float value.
  for (const [name, accepted] of [['DecFirst', true], ['FloatZero', false], ['FloatLater', false], ['DecLater', true]] as const) {
    const outcome: (typeof prepared.outcomes)[number] | undefined = prepared.outcomes.find(at => at.choice.kind === 'atomic' && same(actual, at.choice.members[0]!, local(id(name))));
    assert.ok(outcome, name + ': ' + outcomes(prepared));
    if (accepted) expect(outcome.result).toBe('prepared-local-evidence');
    else {assert.ok(typeof outcome.result !== 'string'); expect(outcome.result.kind).toBe('candidate-rejected');}
    const assignment: AnchoredListAssignment | undefined = prepared.assignments.find(at => at.itemChoice.kind === 'atomic' && same(actual, at.itemChoice.members[0]!, local(id(name))));
    if (!accepted) {expect(assignment).toBeUndefined(); continue;}
    assert.ok(assignment); assertAnchoredListAssignment(assignment);
    const kernel = createSchemaScalarKernel(assignment.context);
    for (const cohort of assignment.cohorts) {
      const member: ReturnType<SemanticContext['lookup']> = assignment.context.lookup(cohort.member); assert.equal(member.kind, 'found'); assert.equal(member.node.kind, 'element');
      assert.ok(member.node.value);
      const tuple = kernel.assess(local(cohort.preparation), member.node.value.lexical, cohort.member);
      assert.equal(tuple.kind, 'checked', json(tuple));
      expect(tuple.value.operand.items?.map(item => ({family: item.family, canonical: item.canonical})))
        .toEqual([{family: 'decimal', canonical: '1'}, {family: 'decimal', canonical: '1'}]);
      expect(kernel.assess(local(cohort.preparation), {...member.node.value.lexical, value: '1'}, cohort.member).kind).not.toBe('checked');
    }
    const proof: ReturnType<typeof verifyFiniteRe01Evidence> = verifyFiniteRe01Evidence(actual, id('D'), {root: assignment.evidence.id, nodes: [assignment.evidence]});
    assert.equal(proof.kind, 'checked-candidate', json(proof));
  }
  expect(prepared.universalCoverage).toBe(false);
});

it.each(['true', 'false'] as const)('continues past failed retained FIRST and materializes a native Boolean mask for %s', async word => {
  const actual = await setup('free-list-boolean-assignment' + (word === 'false' ? '-false' : ''));
  const id = globalId('type', {namespace: 'urn:re01:free-list-boolean', local: 'D'});
  const prepared = prepareAnchoredListAssignments(actual, actual, id);
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments', json(prepared));
  const retained = prepared.outcomes.filter(at => at.choice.kind === 'retained');
  expect(retained.length).toBeGreaterThan(0);
  expect(retained.every(at => at.result !== 'prepared-local-evidence')).toBe(true);
  const boolean = {kind: 'builtin' as const, name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'boolean'}};
  const direct = prepared.assignments.find(at => at.itemChoice.kind === 'atomic' && same(actual, at.itemChoice.members[0]!, boolean));
  const masked = prepared.assignments.find(at => at.itemChoice.kind === 'member-mask' && at.itemChoice.members.length === 1 && same(actual, at.itemChoice.members[0]!, boolean));
  assert.ok(direct, outcomes(prepared)); assert.ok(masked, outcomes(prepared));
  const shared = masked.cohorts[0]!.item;
  expect(masked.cohorts.every(at => json(at.item) === json(shared))).toBe(true);
  assert.equal(shared.kind, 'local');
  const row = masked.context.rawSimpleTypeProperties(shared.target); assert.ok(row);
  assert.equal(row.variety.kind, 'union');
  expect(row.variety.members).toHaveLength(2);
  expect(same(masked.context, row.variety.members[1]!, boolean)).toBe(true);
  expect(checkComponentConstruction(masked.context, shared.target).kind).toBe('checked');
  for (const assignment of [direct, masked]) {
    for (const cohort of assignment.cohorts) {
      const member = assignment.context.lookup(cohort.member); assert.equal(member.kind, 'found'); assert.equal(member.node.kind, 'element');
      expect(member.node.value?.lexical.value).toBe(word);
      const selected = createSchemaScalarKernel(assignment.context).assess(local(cohort.enumeration), member.node.value!.lexical, cohort.member);
      assert.equal(selected.kind, 'checked');
      expect(selected.value.operand.items?.map(item => ({family: item.family, canonical: item.canonical})))
        .toEqual([{family: 'boolean', canonical: word}]);
    }
    const proof = verifyFiniteRe01Evidence(actual, id, {root: assignment.evidence.id, nodes: [assignment.evidence]});
    assert.equal(proof.kind, 'checked-candidate', json(proof));
  }
  expect(() => assertAnchoredListAssignment({...direct} as AnchoredListAssignment)).toThrow('Unauthenticated');
});

it('rejects a jointly incompatible positive portfolio although each tagged demand has a native ITEM realization', async () => {
  const actual = await setup('anchored-list-cross-copy'), namespace = 'urn:re01:anchored-list-cross-copy';
  const id = (name: string) => globalId('type', {namespace, local: name});
  const owner = actual.lookup(id('A')); assert.equal(owner.kind, 'found');
  const kernel = createSchemaScalarKernel(actual), lexical = {value: 'true', context: owner.node.context};
  const boolean = {kind: 'builtin' as const, name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'boolean'}};
  const firstDemand = kernel.assess(local(id('Words')), {...lexical, value: '1'}, id('A'));
  const secondDemand = kernel.assess(local(id('Words')), lexical, id('A'));
  const firstRealization = kernel.assess(boolean, lexical, id('A'));
  assert.equal(firstDemand.kind, 'checked'); assert.equal(secondDemand.kind, 'checked'); assert.equal(firstRealization.kind, 'checked');
  expect(firstDemand.value.operand.items?.[0]).toMatchObject({family: 'boolean', canonical: 'true'});
  expect(firstRealization.value.operand).toMatchObject({family: 'boolean', canonical: 'true'});
  expect(secondDemand.value.operand.items?.[0].family).toBe('QName');
  const prepared = prepareAnchoredListAssignments(actual, actual, id('D'));
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments', json(prepared));
  // Every member-mask preserves [QName,boolean] order. At true a shared mode
  // selects either QName or Boolean; those cannot satisfy both protected tags.
  expect(prepared.assignments).toEqual([]);
  assert.equal(prepared.familyExhausted, true, outcomes(prepared));
  expect(prepared.universalCoverage).toBe(false);
  expect(prepared.outcomes.some(at => at.result !== 'prepared-local-evidence' && 'rule' in at.result
    && ['anchored-list-fixed-value', 'derivation-ok-restriction.5.4'].includes(at.result.rule))).toBe(true);
});

it('retains the same inclusive request budget through candidate publication and sticky exhaustion', async () => {
  const namespace = 'urn:re01:free-list-boolean', target = globalId('type', {namespace, local: 'D'});
  const actual = await setup('free-list-boolean-assignment');
  const complete = prepareAnchoredListAssignments(actual, actual, target);
  assert.equal(complete.kind, 'prepared-anchored-list-assignments', json(complete));
  expect(complete.assignments.length).toBeGreaterThan(0);
  for (const assignment of complete.assignments) expect(assignment.context.budget).toBe(actual.budget);
  const remaining = DEFAULT_MAX_WORK - actual.budget.usage().work;
  const inclusive = actual.budget.guard(() => {actual.budget.chargeWork(remaining); return 'inclusive';});
  expect(inclusive).toBe('inclusive'); expect(actual.budget.usage().work).toBe(DEFAULT_MAX_WORK);
  const exhausted = actual.budget.guard(() => actual.budget.chargeWork());
  assert.ok(exhausted && typeof exhausted === 'object'); expect(exhausted.kind).toBe('resource-limit');
  expect(prepareAnchoredListAssignments(actual, actual, target)).toBe(exhausted);
  expect(actual.budget.usage().work).toBe(DEFAULT_MAX_WORK);
});

it('never publishes a truncated candidate family when the shared request exhausts in flight', async () => {
  const actual = await setup('free-list-boolean-assignment', 1_000_000);
  const target = globalId('type', {namespace: 'urn:re01:free-list-boolean', local: 'D'}), before = actual.budget.usage().work;
  const exhausted = prepareAnchoredListAssignments(actual, actual, target);
  expect(exhausted.kind).toBe('resource-limit'); expect(actual.budget.usage().work).toBeGreaterThan(before);
  const usage = {...actual.budget.usage()};
  expect(prepareAnchoredListAssignments(actual, actual, target)).toBe(exhausted);
  expect(actual.budget.usage()).toEqual(usage);
});
