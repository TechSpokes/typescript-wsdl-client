/** Expected frontiers follow the fixture's written extension chains, not builder output. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {assertFiniteRe01Frontier, prepareFiniteRe01Frontier, verifyFiniteRe01EvidenceWithFrontier} from '../../../src/compiler/finiteRe01Verification.js';
import {prepareInheritedMiddleAssignments, replaySharedAssignment} from './shared-assignment.js';

const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:re01:anchored-inherited-list';
const id = (local: string) => globalId('type', {namespace, local});
const local = (target: string) => ({kind: 'local' as const, target});

async function setup() {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/anchored-inherited-list.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  return prepared.request.actual;
}

it('discovers every actual extension, distinguishes primitive identity, and retains scalar/component duties', async () => {
  const actual = await setup();
  const session = prepareFiniteRe01Frontier(actual); assert.equal(session.kind, 'native-frontier-session');
  expect(session.actual.requirements).toHaveLength(2);
  expect(session.actual.requirements).toEqual(expect.arrayContaining([
    expect.objectContaining({target: id('RootB'), primitive: true, ancestor: expect.objectContaining({target: id('RootA')})}),
    expect.objectContaining({target: id('RootD'), primitive: false, ancestor: expect.objectContaining({target: id('RootA')})}),
  ]));
  expect(new Set(session.actual.components.map(at => at.component))).toEqual(new Set(actual.members));
  expect(session.actual.components.map(at => at.component)).toEqual(expect.arrayContaining([id('Words'), id('Item'), id('HeadWords')]));
  assertFiniteRe01Frontier(actual, session.actual);
  expect(() => assertFiniteRe01Frontier(actual, {...session.actual})).toThrow('Unauthenticated native frontier');
  // Inspecting RootD's requirement never asserts that its construction exists.
  expect(session.actual.kind).toBe('inspected-frontier');
  expect('claims' in session.actual).toBe(false);
});

it('finds a born child without a child list, keeps its parent context, and cannot impersonate complete evidence', async () => {
  const actual = await setup(), session = prepareFiniteRe01Frontier(actual);
  assert.equal(session.kind, 'native-frontier-session');
  const plans = prepareInheritedMiddleAssignments(actual, actual, id('RootD')); assert.equal(plans.kind, 'prepared-inherited-assignments');
  const plan = plans.assignments.find(at => at.intermediate === id('RootB')); assert.ok(plan);
  const replay = replaySharedAssignment(plan); assert.equal(replay.kind, 'prepared-local-evidence');
  const carrier = actual.lookup(id('Heads')); assert.equal(carrier.kind, 'found'); assert.equal(carrier.node.kind, 'complexType');
  const whole = deriveOriginalComplexParticle(actual, id('Heads')); assert.equal(whole.kind, 'checked');
  const target = hypotheticalScopedId(id('A'), '/frontier-child', 'type');
  const fresh: ComplexTypeNode = {...carrier.node, id: target,
    identity: {kind: 'scoped', owner: id('A'), path: '/frontier-child', role: 'type'},
    derivation: {kind: 'extension', contentKind: 'complex', base: local(id('R')), facets: []}};
  const built = forkSemanticCandidate(actual, {...plan.delta, key: 'frontier-parent', additions: [fresh], active: [...actual.members, target],
    rawTypes: [...plan.delta.rawTypes!, {type: target, targetNamespace: namespace,
      derivation: {method: 'extension', base: local(id('R'))}, abstract: false, final: [], block: [], content: whole.content,
      attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}}]});
  assert.equal(built.kind, 'prepared');
  const root = {...replay.evidence, context: built.context};
  const frontier = session.inspectCandidate(root); assert.equal(frontier.kind, 'inspected-frontier');
  assertFiniteRe01Frontier(built.context, frontier);
  expect(frontier.context).toBe(built.context);
  expect(frontier.requirements.filter(at => !at.primitive)).toEqual([
    expect.objectContaining({target, primitive: false, ancestor: expect.objectContaining({target: id('A')})}),
  ]);
  expect(frontier.components.map(at => at.component)).toEqual(expect.arrayContaining([target, id('RootD'), id('RootB')]));
  expect(verifyFiniteRe01EvidenceWithFrontier(actual, id('RootD'), {root: root.id, nodes: [{...root, premises: []}]}, session))
    .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', contextId: built.context.contextId, component: target});
});

it('refuses non-NP NOTATION formation before any requested RE01 target can hide it', async () => {
  // The bare NOTATION constructor lacks the required enumeration. This duty
  // exists independently of all extension targets and witness availability.
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/notation-constituent-direct-use.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  expect(prepareFiniteRe01Frontier(prepared.request.actual)).toMatchObject({kind: 'invalid-schema', rule: 'enumeration-required-notation'});
});

it('exposes original generated scalar slots and their exact-context typed support independently of NP duties', async () => {
  // Four simple-content restrictions in the written fixture own distinct
  // generated slots; extension D consumes R rather than minting a D slot.
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/original-generated-binding-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const actual = prepared.request.actual, session = prepareFiniteRe01Frontier(actual);
  assert.equal(session.kind, 'native-frontier-session');
  const generatedId = (name: string) => globalId('type', {namespace: 'urn:recovery:original-generated-binding', local: name});
  expect(new Set(session.actual.scalarSlots.map(at => at.slot.owner))).toEqual(new Set(['R', 'R2', 'ZeroR', 'U'].map(generatedId)));
  for (const receipt of session.actual.scalarSlots) expect(receipt.contextId).toBe(actual.contextId);
  expect(session.actual.typeDependencies).toEqual(expect.arrayContaining([
    expect.objectContaining({from: actual, dependency: expect.objectContaining({contextId: actual.contextId,
      type: {kind: 'original-generated', owner: generatedId('R')}})}),
  ]));
});
