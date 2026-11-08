/** Private WORDs retain their own tags; real inherited consumers still constrain the whole candidate. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {createSemanticBudget, DEFAULT_MAX_WORK} from '../../../src/compiler/semanticBudget.js';
import {prepareAnchoredListAssignments, preparePrivateAnchoredListAssignments} from './anchored-list-assignment.js';
import {buildRe01Evidence, completeSeededRe01Evidence, storedRe01Rank} from './evidence-builder.js';
import {prepareInheritedMiddleAssignments} from './shared-assignment.js';

const fixtures = path.resolve('test/conformance/fixtures');
const local = (target: string) => ({kind: 'local' as const, target});
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);
async function source(name: string, maxWork?: number) {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery', name + '.xsd'), {policy: {fileRoots: [fixtures]}});
  const result = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork})});
  assert.equal(result.kind, 'prepared', json(result)); return result.request;
}

it.each([
  ['anchored-list-cross-copy', 'urn:re01:anchored-list-cross-copy', 'D', 'true', 2],
  ['private-list-false-three', 'urn:private:false:three', 'Finish', 'false', 3],
] as const)('constructs heterogeneous complete input-only evidence for %s', async (file, namespace, name, spelling, arity) => {
  const {actual, graph} = await source(file), before = JSON.stringify(graph), target = globalId('type', {namespace, local: name});
  const old = prepareAnchoredListAssignments(actual, actual, target);
  assert.equal(old.kind, 'prepared-anchored-list-assignments');
  expect(old.assignments).toHaveLength(0); expect(old.familyExhausted).toBe(true);
  const prepared = preparePrivateAnchoredListAssignments(actual, actual, target);
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments', json(prepared));
  expect(prepared.assignments).toHaveLength(1);
  const assignment = prepared.assignments[0]!, kernel = createSchemaScalarKernel(assignment.context);
  expect(assignment.family).toBe('private-anchored-item-list-v1'); expect(assignment.cohorts).toHaveLength(arity);
  for (let i = 0; i < arity; i++) {
    const cohort = assignment.cohorts[i]!, field = actual.lookup(cohort.field), member = assignment.context.lookup(cohort.member);
    assert.equal(field.kind, 'found'); assert.equal(field.node.kind, 'element'); assert.ok(field.node.value);
    assert.equal(member.kind, 'found'); assert.equal(member.node.kind, 'element'); assert.ok(member.node.value);
    expect(member.node.value.lexical.value).toBe(spelling);
    expect(member.node.value.lexical.context).toEqual(field.node.value.lexical.context);
    const funded = kernel.assess(local(cohort.preparation), member.node.value.lexical, member.node.id);
    const selected = kernel.assess(local(cohort.enumeration), member.node.value.lexical, member.node.id);
    assert.equal(funded.kind, 'checked', json(funded)); assert.equal(selected.kind, 'checked', json(selected));
    const expected = i === 1 ? 'QName' : 'boolean';
    expect(funded.value.operand.items?.[0]?.family).toBe(expected);
    expect(selected.value.operand.items?.[0]?.family).toBe(expected);
    if (expected === 'QName') expect(selected.value.operand.items?.[0]?.canonical).toContain(spelling);
    expect(kernel.equivalent(field.node.type, field.node.value.lexical, local(cohort.enumeration), member.node.value.lexical, member.node.id))
      .toMatchObject({kind: 'checked', value: true});
    const row = assignment.context.rawSimpleTypeProperties(cohort.enumeration); assert.ok(row);
    expect(row.base).toEqual(local(cohort.preparation));
    expect(row.facetComponentSet?.at(-1)).toMatchObject({facets: [{name: 'enumeration', operand: {context: 'active', type: local(cohort.preparation), owner: assignment.intermediate}}]});
  }
  const proof = verifyFiniteRe01Evidence(actual, target, {root: assignment.evidence.id, nodes: [assignment.evidence]});
  assert.equal(proof.kind, 'checked-candidate', json(proof));
  expect(storedRe01Rank(actual, assignment.context)).toEqual({q: 0, n: 0});
  expect(buildRe01Evidence(actual, target)).toMatchObject({kind: 'checked-witness', mode: 'input-only'});
  expect(JSON.stringify(graph)).toBe(before);
});

async function inherited(conflict = false) {
  const {actual} = await source('private-list-inherited'), namespace = 'urn:private:inherited';
  const id = (name: string) => globalId('type', {namespace, local: name});
  const opening = prepareInheritedMiddleAssignments(actual, actual, id('RootD'));
  assert.equal(opening.kind, 'prepared-inherited-assignments');
  const plan = opening.assignments.find(at => at.intermediate === id('RootB')); assert.ok(plan);
  const carrier = actual.lookup(id('Heads')); assert.equal(carrier.kind, 'found'); assert.equal(carrier.node.kind, 'complexType');
  const body = deriveOriginalComplexParticle(actual, carrier.node.id); assert.equal(body.kind, 'checked');
  const target = hypotheticalScopedId(id('A'), '/private-child', 'type');
  const child: ComplexTypeNode = {...carrier.node, id: target, identity: {kind: 'scoped', owner: id('A'), path: '/private-child', role: 'type'},
    derivation: {kind: 'extension', contentKind: 'complex', base: local(id('R')), facets: []}};
  const consumerId = hypotheticalScopedId(id('OffA'), '/real-consumer', 'type');
  const consumer: ComplexTypeNode = {...carrier.node, id: consumerId, identity: {kind: 'scoped', owner: id('OffA'), path: '/real-consumer', role: 'type'},
    derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('OffA')), facets: []}};
  const additions = [child, ...(conflict ? [consumer] : [])];
  const parent = forkSemanticCandidate(actual, {...plan.delta, key: 'private-parent', additions, active: [...actual.members, ...additions.map(at => at.id)],
    rawTypes: [...plan.delta.rawTypes!, {type: target, targetNamespace: namespace, derivation: {method: 'extension', base: local(id('R'))},
      abstract: false, final: [], block: [], content: body.content, attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}},
    ...(conflict ? [{type: consumerId, targetNamespace: namespace, derivation: {method: 'restriction' as const, base: local(id('OffA'))},
      abstract: false, final: [], block: [], content: body.content, attributeUses: [], provenance: {kind: 'hypothetical-abstract' as const, originals: []}}] : [])]});
  assert.equal(parent.kind, 'prepared', json(parent));
  return {actual, target, consumerId, hypothesis: {parent: actual, context: parent.context, target: id('RootD'), intermediate: plan.intermediate, ancestor: plan.ancestor}};
}

it('automatically completes a material heterogeneous fresh target in its inherited context', async () => {
  const {actual, target, hypothesis} = await inherited();
  expect(actual.lookup(target).kind).toBe('missing');
  expect(storedRe01Rank(actual, hypothesis.context)).toEqual({q: 0, n: 1});
  const result = completeSeededRe01Evidence(actual, hypothesis.target, hypothesis);
  assert.equal(result.kind, 'checked-witness', json(result));
  expect(result.mode).toBe('seeded-completion');
  const child = result.evidence.nodes.find(at => at.target === target); assert.ok(child);
  expect(child.parent).toBe(hypothesis.context);
  expect(child.context.rawTypeProperties(hypothesis.target)).toBe(hypothesis.context.rawTypeProperties(hypothesis.target));
  expect(storedRe01Rank(actual, child.context)).toEqual({q: 0, n: 0});
  expect(result.receipt.proof).toHaveLength(2);
  expect(verifyFiniteRe01Evidence(actual, hypothesis.target, result.evidence).kind).toBe('checked-candidate');
  const families = child.context.members.filter(at => hypothesis.context.lookup(at).kind === 'missing').map(at => child.context.lookup(at))
    .filter(at => at.kind === 'found' && at.node.kind === 'element').map(at => {
      assert.equal(at.kind, 'found'); assert.equal(at.node.kind, 'element'); assert.ok(at.node.value);
      const value = createSchemaScalarKernel(child.context).assess(at.node.type, at.node.value.lexical, at.node.id);
      assert.equal(value.kind, 'checked'); return value.value.operand.items?.[0]?.family;
    });
  expect(families.sort()).toEqual(['QName', 'boolean']);
  console.log('private inherited work', actual.budget.usage().work);
});

it('retains a real incompatible inherited reader despite locally successful private cohorts', async () => {
  const {actual, target, consumerId, hypothesis} = await inherited(true);
  const prepared = preparePrivateAnchoredListAssignments(actual, hypothesis.context, target);
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments'); assert.equal(prepared.assignments.length, 1);
  const assignment = prepared.assignments[0]!;
  expect(checkComponentConstruction(assignment.context, consumerId)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
  const result = completeSeededRe01Evidence(actual, hypothesis.target, hypothesis);
  assert.equal(result.kind, 'no-witness-found', json(result));
  expect(result.completeNegativeAnswer).toBe(false);
  expect(result.outcomes.some(at => at.failure.kind === 'candidate-rejected' && at.failure.component === consumerId)).toBe(true);
});

it('precharges private construction and keeps exhaustion sticky without partial output', async () => {
  const {actual} = await source('anchored-list-cross-copy');
  const target = globalId('type', {namespace: 'urn:re01:anchored-list-cross-copy', local: 'D'});
  actual.budget.guard(() => actual.budget.chargeWork(DEFAULT_MAX_WORK - actual.budget.usage().work - 500));
  const result = preparePrivateAnchoredListAssignments(actual, actual, target);
  expect(result.kind).toBe('resource-limit'); expect(result).toBe(actual.budget.failure());
  const usage = actual.budget.usage().work;
  expect(preparePrivateAnchoredListAssignments(actual, actual, target)).toBe(result);
  expect(buildRe01Evidence(actual, target)).toBe(result); expect(actual.budget.usage().work).toBe(usage);
});
