/** Independent continuation controls: the fresh child supplies the actual anchored repair. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import type {CorrespondenceReceipt} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {prepareInheritedMiddleAssignments, replaySharedAssignment} from './shared-assignment.js';
import {prepareAnchoredListAssignments, assertAnchoredListAssignment} from './anchored-list-assignment.js';

const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:re01:anchored-inherited-list';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string) => ({kind: 'local' as const, target});
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);

function storedRank(actual: SemanticContext, context: SemanticContext, correspondence: CorrespondenceReceipt) {
  // Complete membership equals the entire stored universe in this issuer's
  // qualification. Scan after verification to include native materialization.
  assert.equal(context.membership, 'complete-actual-plus-additions');
  const originals = new Set(actual.members);
  let q = 0, n = 0;
  for (const member of context.members) {
    const receipt = checkComponentConstruction(context, member, {correspondence});
    assert.equal(receipt.kind, 'checked', json(receipt));
    if (receipt.re01 && !receipt.re01.primitive) {
      if (originals.has(member)) q++; else n++;
    }
  }
  return {q, n};
}

async function setup(conflict = false, emptyInheritedBody = false) {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/anchored-inherited-list.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const {actual} = prepared.request;
  const opening = prepareInheritedMiddleAssignments(actual, actual, id('RootD'));
  assert.equal(opening.kind, 'prepared-inherited-assignments', json(opening));
  const plan = opening.assignments.find(at => at.intermediate === id('RootB')); assert.ok(plan);
  const replay = replaySharedAssignment(plan); assert.equal(replay.kind, 'prepared-local-evidence');
  const carrier = actual.lookup(id('Heads')); assert.equal(carrier.kind, 'found'); assert.equal(carrier.node.kind, 'complexType');
  const whole = deriveOriginalComplexParticle(actual, id('Heads')); assert.equal(whole.kind, 'checked');
  const target = hypotheticalScopedId(id('A'), '/anchored-child', 'type');
  const fresh: ComplexTypeNode = {...carrier.node, id: target,
    identity: {kind: 'scoped', owner: id('A'), path: '/anchored-child', role: 'type'},
    derivation: {kind: 'extension', contentKind: 'complex', base: local(id('R')), facets: []}};
  const consumerId = hypotheticalScopedId(id('OffA'), '/inherited-consumer', 'type');
  const consumer: ComplexTypeNode = {...carrier.node, id: consumerId,
    identity: {kind: 'scoped', owner: id('OffA'), path: '/inherited-consumer', role: 'type'},
    derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('OffA')), facets: []}};
  const built = forkSemanticCandidate(actual, {...plan.delta, key: 'anchored-parent',
    additions: [fresh, ...(conflict ? [consumer] : [])], active: [...actual.members, target, ...(conflict ? [consumerId] : [])], rawTypes: [...plan.delta.rawTypes!,
      {type: target, targetNamespace: namespace, derivation: {method: 'extension', base: local(id('R'))},
        abstract: false, final: [], block: [], content: emptyInheritedBody ? {kind: 'empty'} : whole.content, attributeUses: [],
        provenance: {kind: 'hypothetical-abstract', originals: []}}, ...(conflict ? [{type: consumerId, targetNamespace: namespace,
          derivation: {method: 'restriction' as const, base: local(id('OffA'))}, abstract: false, final: [], block: [],
          content: whole.content, attributeUses: [], provenance: {kind: 'hypothetical-abstract' as const, originals: []}}] : [])]});
  assert.equal(built.kind, 'prepared', json(built));
  return {actual, parent: built.context, target, consumerId, root: {...replay.evidence, context: built.context}};
}

it('uses input-derived ITEM and LIST choices at a genuinely born child in a complete actual-root forest', async () => {
  const {actual, parent, target, root} = await setup();
  expect(parent).not.toBe(actual); expect(actual.lookup(target).kind).toBe('missing');
  const before = checkComponentConstruction(parent, target); assert.equal(before.kind, 'checked', json(before));
  expect(before.re01?.primitive).toBe(false);
  const prepared = prepareAnchoredListAssignments(actual, parent, target);
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments', json(prepared));
  expect(prepared.outcomes.length).toBeGreaterThan(0);
  const complete = prepared.assignments.map(assignment => {
    assertAnchoredListAssignment(assignment);
    const evidence = assignment.evidence;
    return {assignment, result: verifyFiniteRe01Evidence(actual, id('RootD'), {
      root: root.id, nodes: [{...root, premises: [evidence.id]}, evidence]})};
  });
  const winner = complete.find(at => at.result.kind === 'checked-candidate'); assert.ok(winner, json(complete.map(at => at.result)));
  const {assignment, result} = winner; assert.equal(result.kind, 'checked-candidate');
  // The enclosing native proof supplies context-specific RAW correspondence.
  const parentStep = result.proof.find(step => step.contextId === parent.contextId); assert.ok(parentStep);
  const childStep = result.proof.find(step => step.contextId === assignment.context.contextId); assert.ok(childStep);
  expect(storedRank(actual, parent, parentStep.correspondence)).toEqual({q: 0, n: 1});
  expect(result.proof).toHaveLength(2);
  expect(result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  expect(assignment.evidence.parent).toBe(parent);
  expect(assignment.context.rawTypeProperties(id('RootD'))).toBe(parent.rawTypeProperties(id('RootD')));
  expect(assignment.context.rawTypeProperties(target)?.derivation.method).toBe('restriction');
  expect(assignment.delta.additions!.length).toBeGreaterThan(0);
  expect(storedRank(actual, assignment.context, childStep.correspondence)).toEqual({q: 0, n: 0});
  const inheritedIds = new Set(parent.members);
  const newStored = assignment.context.members.filter(member => !inheritedIds.has(member));
  expect(newStored.length).toBeGreaterThan(0);
  for (const member of newStored) {
    const qualified = checkComponentConstruction(assignment.context, member, {correspondence: childStep.correspondence}); assert.equal(qualified.kind, 'checked');
    expect(qualified.re01?.primitive).not.toBe(false);
  }
  const after = checkComponentConstruction(assignment.context, target); assert.equal(after.kind, 'checked');
  expect(after.re01).toBeUndefined();
  // q is unchanged; n loses the one stored fresh extension target and gains no NP.
  expect(parent.lookup(target).kind).toBe('found'); expect(assignment.context.lookup(target).kind).toBe('found');
  for (const cohort of assignment.cohorts) {
    const member = assignment.context.lookup(cohort.member); assert.equal(member.kind, 'found'); assert.equal(member.node.kind, 'element'); assert.ok(member.node.value);
    const selected = createSchemaScalarKernel(assignment.context).assess(local(cohort.preparation), member.node.value.lexical, member.node.id);
    assert.equal(selected.kind, 'checked', json(selected));
    expect(selected.value.operand.items).toMatchObject([{family: 'boolean', canonical: 'true'}]);
    expect(member.node.value.lexical.value).toBe('true');
  }
  const missing = verifyFiniteRe01Evidence(actual, id('RootD'), {root: root.id, nodes: [{...root, premises: []}]});
  expect(missing).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence'});
});

it('rechecks an inherited consumer even when the fresh target and scalar stages succeed locally', async () => {
  const {actual, parent, target, root, consumerId} = await setup(true);
  const prepared = prepareAnchoredListAssignments(actual, parent, target);
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments', json(prepared));
  const candidate = prepared.assignments.find(at => checkComponentConstruction(at.context, target).kind === 'checked');
  assert.ok(candidate, json(prepared));
  const local = checkComponentConstruction(candidate.context, target);
  expect(local.kind).toBe('checked');
  const inherited = checkComponentConstruction(candidate.context, consumerId);
  expect(inherited).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: consumerId});
  const result = verifyFiniteRe01Evidence(actual, id('RootD'), {root: root.id,
    nodes: [{...root, premises: [candidate.evidence.id]}, candidate.evidence]});
  expect(result).toMatchObject({kind: 'candidate-rejected', component: consumerId});
});

it('reads authoritative inherited RAW BODY rather than constructing from stale nominal HEAD ports', async () => {
  const {actual, parent, target} = await setup(false, true);
  const row = parent.rawTypeProperties(target); assert.ok(row);
  expect(row.content.kind).toBe('empty');
  const found = parent.lookup(target); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType');
  expect(found.node.content).toBeDefined();
  expect(prepareAnchoredListAssignments(actual, parent, target))
    .toMatchObject({kind: 'unresolved', rule: 'anchored-list-body-ports', component: target});
  expect(parent.rawTypeProperties(target)).toBe(row);
});
