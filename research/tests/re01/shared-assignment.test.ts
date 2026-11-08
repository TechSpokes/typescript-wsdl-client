/** Independent expectations: one retained LIST VALUE and a QName-map conflict in ordinary RP. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {prepareInheritedMiddleAssignments, replaySharedAssignment} from './shared-assignment.js';

const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:re01:shared-inherited-list';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string) => ({kind: 'local' as const, target});
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);

async function setup(conflict = false) {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/shared-inherited-list' + (conflict ? '-conflict' : '') + '.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual;
  return {request, actual};
}

it('derives a physical ordinary/LIST assignment from input and checks the actual-root replay', async () => {
  const {request, actual} = await setup(), before = JSON.stringify(request.graph);
  const result = prepareInheritedMiddleAssignments(actual, actual, id('D')); assert.equal(result.kind, 'prepared-inherited-assignments', json(result));
  // B is the only retained extension directly over A. No successful forest or helper roster is supplied.
  expect(result.assignments.map(at => at.intermediate)).toEqual([id('B')]);
  const assignment = result.assignments[0]!;
  expect(assignment.introducedStoredNonprimitive).toBe(0);
  const replay = replaySharedAssignment(assignment); assert.equal(replay.kind, 'prepared-local-evidence', json(replay));
  const proof = verifyFiniteRe01Evidence(actual, id('D'), {root: replay.evidence.id, nodes: [replay.evidence]});
  assert.equal(proof.kind, 'checked-candidate', json(proof));
  expect(proof.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  expect(proof.proof).toHaveLength(1);
  // The ordinary BODY observes the same LIST enum with its QName token, not an independently chosen scalar palette.
  const owner = replay.evidence.context.lookup(id('D')); assert.equal(owner.kind, 'found');
  const assessed = createSchemaScalarKernel(replay.evidence.context).assess(local(id('Enum')), {value: 'foo', context: owner.node.context}, id('D'));
  assert.equal(assessed.kind, 'checked', json(assessed));
  expect(assessed.value.operand).toMatchObject({family: 'list', items: [{family: 'QName', canonical: '["urn:scalar:on","foo"]'}]});
  expect(proof.proof[0]!.components.some(at => at.component === id('Enum'))).toBe(true);
  expect(JSON.stringify(request.graph)).toBe(before);
});

it('retains the real parent and inherited roots through a zero-addition fresh-target child', async () => {
  const {actual} = await setup();
  const openingPlan = prepareInheritedMiddleAssignments(actual, actual, id('D')); assert.equal(openingPlan.kind, 'prepared-inherited-assignments');
  const opening = replaySharedAssignment(openingPlan.assignments[0]!); assert.equal(opening.kind, 'prepared-local-evidence');
  const whole = deriveOriginalComplexParticle(actual, id('B')); assert.equal(whole.kind, 'checked');
  const base = actual.lookup(id('B')); assert.equal(base.kind, 'found'); assert.equal(base.node.kind, 'complexType');
  const target = hypotheticalScopedId(id('A'), '/inherited-list-owner', 'type');
  const node: ComplexTypeNode = {...base.node, id: target, identity: {kind: 'scoped', owner: id('A'), path: '/inherited-list-owner', role: 'type'},
    derivation: {kind: 'extension', contentKind: 'complex', base: local(id('B')), facets: []}};
  // This genuinely born owner is part of P, which the constructor must retain exactly.
  const parent = forkSemanticCandidate(actual, {...openingPlan.assignments[0]!.delta, key: 'opening-with-inherited-owner',
    additions: [node], active: [...actual.members, target], rawTypes: [...openingPlan.assignments[0]!.delta.rawTypes!,
      {type: target, targetNamespace: namespace, derivation: {method: 'extension', base: local(id('B'))}, abstract: false, final: [], block: [],
        content: whole.content, attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}}]});
  assert.equal(parent.kind, 'prepared', json(parent));
  const plans = prepareInheritedMiddleAssignments(actual, parent.context, target); assert.equal(plans.kind, 'prepared-inherited-assignments');
  const recipe = plans.assignments.find(at => at.intermediate === id('B')); assert.ok(recipe);
  expect(recipe.delta.additions).toEqual([]); expect(recipe.delta.active).toEqual(parent.context.members);
  const child = replaySharedAssignment(recipe); assert.equal(child.kind, 'prepared-local-evidence');
  expect(child.evidence.parent).toBe(parent.context);
  const root = {...opening.evidence, context: parent.context, premises: [child.evidence.id]};
  const proof = verifyFiniteRe01Evidence(actual, id('D'), {root: root.id, nodes: [root, child.evidence]});
  assert.equal(proof.kind, 'checked-candidate', json(proof));
  expect(proof.proof).toHaveLength(2);
  const missing = verifyFiniteRe01Evidence(actual, id('D'), {root: root.id, nodes: [{...root, premises: []}]});
  expect(missing).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence'});
});

it('rejects the same locally feasible LIST word when ordinary fixed VALUEs require different QName maps', async () => {
  const {actual} = await setup(true);
  // Each WORD is admitted separately. The common ordinary arm requires equal tagged LIST values.
  const owner = actual.lookup(id('D')); assert.equal(owner.kind, 'found');
  const values = ['urn:scalar:on', 'urn:scalar:off'].map(uri => {
    const result = createSchemaScalarKernel(actual).assess(local(id('Words')), {value: 'foo', context: {...owner.node.context,
      namespaces: {...owner.node.context.namespaces, '': uri}}}, id('D'));
    assert.equal(result.kind, 'checked'); return result.value.operand;
  });
  expect(values[0]).not.toEqual(values[1]);
  expect(checkComponentConstruction(actual, id('B')).kind).toBe('checked');
  expect(checkComponentConstruction(actual, id('D')).kind).toBe('checked');
  const plans = prepareInheritedMiddleAssignments(actual, actual, id('D')); assert.equal(plans.kind, 'prepared-inherited-assignments');
  const replay = replaySharedAssignment(plans.assignments[0]!); assert.equal(replay.kind, 'prepared-local-evidence');
  const proof = verifyFiniteRe01Evidence(actual, id('D'), {root: replay.evidence.id, nodes: [replay.evidence]});
  expect(proof).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: id('D')});
});

it('keeps exhaustion sticky and never publishes a partial assignment family', async () => {
  const {actual} = await setup();
  actual.budget.guard(() => actual.budget.chargeWork(Number.MAX_SAFE_INTEGER));
  expect(prepareInheritedMiddleAssignments(actual, actual, id('D'))).toBe(actual.budget.failure());
});

it('assembles the synthesized IEEE membership WORD into the exact candidate checked by the native forest', async () => {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/private-alias-endpoint-capacity.xsd'), {policy: {fileRoots: [fixtures]}});
  const source = prepareSourceSchemaRequest(input); assert.equal(source.kind, 'prepared');
  const actual = source.request.actual, ns = 'urn:scalar:private-alias-endpoint-capacity';
  const type = (name: string) => globalId('type', {namespace: ns, local: name});
  const owner = actual.lookup(type('A')); assert.equal(owner.kind, 'found');
  const word = createSchemaScalarKernel(actual).privateAliasEndpointAdmission(local(type('BoundedFloat')), owner.node.id);
  assert.equal(word.kind, 'checked'); assert.equal(word.value.kind, 'admitted-witness');
  const plans = prepareInheritedMiddleAssignments(actual, actual, type('D')); assert.equal(plans.kind, 'prepared-inherited-assignments');
  const plan = plans.assignments.find(at => at.intermediate === type('B')); assert.ok(plan);
  const name = {namespace: ns, local: 'synthesized-endpoint'};
  const element: ElementNode = {...owner.node, id: globalId('element', name), identity: {kind: 'global', role: 'element', name},
    kind: 'element', name, type: local(type('BoundedFloat')), abstract: false, nillable: false,
    value: {kind: 'fixed', lexical: word.value.membershipWord}};
  const built = forkSemanticCandidate(actual, {...plan.delta, key: 'endpoint-word-consumer', additions: [element],
    active: [...actual.members, element.id], rawElements: [{element: element.id, type: element.type, final: [], block: []}]});
  assert.equal(built.kind, 'prepared');
  const proof = verifyFiniteRe01Evidence(actual, type('D'), {root: 'root', nodes: [{id: 'root', parent: actual, context: built.context,
    target: type('D'), intermediate: plan.intermediate, ancestor: plan.ancestor, premises: []}]});
  assert.equal(proof.kind, 'checked-candidate', json(proof));
  expect(proof.proof[0]!.components.some(at => at.component === element.id)).toBe(true);
  expect(built.context.lookup(element.id)).toMatchObject({kind: 'found', node: {value: {lexical: {value: word.value.membershipWord.value}}}});
});
