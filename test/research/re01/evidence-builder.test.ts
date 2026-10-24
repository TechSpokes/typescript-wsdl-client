/** Expectations derive from the native LIST/ordinary contrasts, never a supplied successful forest. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import type {CorrespondenceReceipt} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {buildRe01Evidence, completeSeededRe01Evidence} from './evidence-builder.js';
import {prepareInheritedMiddleAssignments, replaySharedAssignment} from './shared-assignment.js';

const fixtures = path.resolve('test/conformance/fixtures');
const anchoredNamespace = 'urn:re01:anchored-inherited-list';
const sharedNamespace = 'urn:re01:shared-inherited-list';
const type = (namespace: string, name: string) => globalId('type', {namespace, local: name});
const local = (target: string) => ({kind: 'local' as const, target});
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);

// Independent final-universe census from native component duties, separate from the builder's ancestry-only rank classifier.
function nativeStoredRank(actual: SemanticContext, context: SemanticContext, correspondence: CorrespondenceReceipt) {
  expect(context.membership).toBe('complete-actual-plus-additions');
  let q = 0, n = 0;
  for (const member of context.members) {
    const qualified = checkComponentConstruction(context, member, {correspondence});
    assert.equal(qualified.kind, 'checked', json(qualified));
    if (qualified.re01 && !qualified.re01.primitive) {
      if (actual.lookup(member).kind === 'found') q++; else n++;
    }
  }
  return {q, n};
}

async function source(name: string, maxWork?: number) {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery', name + '.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork})}); assert.equal(prepared.kind, 'prepared', json(prepared));
  return prepared.request;
}

async function seeded(options: {anchored?: boolean; children?: number; empty?: boolean; conflict?: boolean; multipleActual?: boolean; inactive?: boolean} = {}) {
  const namespace = options.anchored ? anchoredNamespace : sharedNamespace;
  const id = (name: string) => type(namespace, name);
  const request = await source(options.anchored ? 'anchored-inherited-list' : options.multipleActual ? 'shared-inherited-list-multiple' : 'shared-inherited-list');
  const {actual} = request;
  const rootTarget = id(options.anchored ? 'RootD' : 'D');
  const opening = prepareInheritedMiddleAssignments(actual, actual, rootTarget);
  assert.equal(opening.kind, 'prepared-inherited-assignments', json(opening));
  const plan = opening.assignments.find(at => at.intermediate === id(options.anchored ? 'RootB' : 'B')); assert.ok(plan);
  const carrier = actual.lookup(id(options.anchored ? 'Heads' : 'B'));
  assert.equal(carrier.kind, 'found'); assert.equal(carrier.node.kind, 'complexType');
  const carrierNode = carrier.node;
  const whole = deriveOriginalComplexParticle(actual, carrierNode.id); assert.equal(whole.kind, 'checked');
  const targets = Array.from({length: options.children ?? 1}, (_, index) => hypotheticalScopedId(id('A'), '/automatic-child-' + index, 'type'));
  const children: ComplexTypeNode[] = targets.map((target, index) => ({...carrierNode, id: target,
    identity: {kind: 'scoped', owner: id('A'), path: '/automatic-child-' + index, role: 'type'},
    derivation: {kind: 'extension', contentKind: 'complex', base: local(id('R')), facets: []}}));
  const consumerId = hypotheticalScopedId(id('OffA'), '/automatic-consumer', 'type');
  const consumer: ComplexTypeNode = {...carrierNode, id: consumerId,
    identity: {kind: 'scoped', owner: id('OffA'), path: '/automatic-consumer', role: 'type'},
    derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('OffA')), facets: []}};
  const additions = [...children, ...(options.conflict ? [consumer] : [])];
  const parent = forkSemanticCandidate(actual, {...plan.delta, key: 'automatic-completion-hypothesis', additions,
    active: [...actual.members.filter(at => !options.inactive || at !== globalId('element', {namespace, local: 'unused'})), ...additions.map(at => at.id)], rawTypes: [...plan.delta.rawTypes!,
      ...children.map(child => ({type: child.id, targetNamespace: namespace, derivation: {method: 'extension' as const, base: local(id('R'))},
        abstract: false, final: [], block: [], content: options.empty ? {kind: 'empty' as const} : whole.content, attributeUses: [],
        provenance: {kind: 'hypothetical-abstract' as const, originals: []}})),
      ...(options.conflict ? [{type: consumerId, targetNamespace: namespace,
        derivation: {method: 'restriction' as const, base: local(id('OffA'))}, abstract: false, final: [], block: [],
        content: whole.content, attributeUses: [], provenance: {kind: 'hypothetical-abstract' as const, originals: []}}] : [])]});
  assert.equal(parent.kind, 'prepared', json(parent));
  // Only this root hypothesis crosses the API. targets are retained here solely for independent assertions.
  const hypothesis = {parent: actual, context: parent.context, target: rootTarget, intermediate: plan.intermediate, ancestor: plan.ancestor};
  return {request, actual, hypothesis, targets, consumerId};
}

it('discovers an original-root forest from Gamma and target alone', async () => {
  const request = await source('shared-inherited-list'), actual = request.actual;
  const before = JSON.stringify(request.graph);
  const target = type(sharedNamespace, 'D');
  const result = buildRe01Evidence(actual, target);
  assert.equal(result.kind, 'checked-witness', json(result));
  expect(result.mode).toBe('input-only');
  assert.equal(result.receipt.kind, 'checked-candidate');
  assertFiniteCandidateReceipt(actual, result.receipt);
  expect(result.receipt.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  expect(result.receipt.proof).toHaveLength(1);
  expect(result.receipt.proof[0]!.correspondence.intermediate).toBe(type(sharedNamespace, 'B'));
  expect(verifyFiniteRe01Evidence(actual, target, result.evidence).kind).toBe('checked-candidate');
  expect(JSON.stringify(request.graph)).toBe(before);
});

it('automatically chooses the materially required anchored ITEM and LIST repair for the born child', async () => {
  const {request, actual, hypothesis, targets} = await seeded({anchored: true});
  const before = JSON.stringify(request.graph);
  const result = completeSeededRe01Evidence(actual, hypothesis.target, hypothesis);
  assert.equal(result.kind, 'checked-witness', json(result));
  expect(result.mode).toBe('seeded-completion');
  assert.equal(result.receipt.kind, 'checked-candidate'); assertFiniteCandidateReceipt(actual, result.receipt);
  const child = result.evidence.nodes.find(at => at.target === targets[0]); assert.ok(child);
  expect(child.parent).toBe(hypothesis.context);
  expect(actual.lookup(child.target).kind).toBe('missing');
  expect(child.context.rawTypeProperties(child.target)?.derivation.method).toBe('restriction');
  expect(child.context.rawTypeProperties(hypothesis.target)).toBe(hypothesis.context.rawTypeProperties(hypothesis.target));
  const newElements = child.context.members.filter(id => hypothesis.context.lookup(id).kind !== 'found')
    .map(id => child.context.lookup(id)).filter(at => at.kind === 'found' && at.node.kind === 'element');
  expect(newElements.length).toBeGreaterThan(0);
  for (const at of newElements) {
    assert.equal(at.kind, 'found'); assert.equal(at.node.kind, 'element'); assert.ok(at.node.value);
    const value = createSchemaScalarKernel(child.context).assess(at.node.type, at.node.value.lexical, at.node.id);
    assert.equal(value.kind, 'checked', json(value));
    expect(value.value.operand).toMatchObject({family: 'list', items: [{family: 'boolean', canonical: 'true'}]});
    expect(at.node.value.lexical.value).toBe('true');
  }
  expect(result.receipt.proof).toHaveLength(2);
  const rootStep = result.receipt.proof.find(at => at.contextId === hypothesis.context.contextId); assert.ok(rootStep);
  const childStep = result.receipt.proof.find(at => at.contextId === child.context.contextId); assert.ok(childStep);
  expect(nativeStoredRank(actual, hypothesis.context, rootStep.correspondence)).toEqual({q: 0, n: 1});
  expect(nativeStoredRank(actual, child.context, childStep.correspondence)).toEqual({q: 0, n: 0});
  expect(verifyFiniteRe01Evidence(actual, hypothesis.target, result.evidence).kind).toBe('checked-candidate');
  expect(JSON.stringify(request.graph)).toBe(before);
});

it('completes two inherited duties in their distinct contexts and separate original-Gamma support', async () => {
  const {actual, hypothesis, targets} = await seeded({children: 2, multipleActual: true});
  const result = completeSeededRe01Evidence(actual, hypothesis.target, hypothesis);
  assert.equal(result.kind, 'checked-witness', json(result));
  assert.equal(result.receipt.kind, 'checked-candidate');
  expect(result.evidence.nodes.some(at => at.parent === actual && at.target === type(sharedNamespace, 'D2'))).toBe(true);
  for (const target of targets) {
    const occurrences = result.evidence.nodes.filter(at => at.target === target);
    expect(occurrences.length).toBeGreaterThan(1);
    expect(new Set(occurrences.map(at => at.parent)).size).toBe(occurrences.length);
    expect(occurrences.some(at => at.parent === hypothesis.context)).toBe(true);
    expect(occurrences.some(at => at.parent !== hypothesis.context)).toBe(true);
  }
  const root = result.evidence.nodes.find(at => at.parent === actual && at.target === hypothesis.target); assert.ok(root);
  expect(root.premises).toHaveLength(2);
  expect(result.evidence.nodes.some(at => at.parent !== actual && at.parent !== hypothesis.context && at.premises.length === 0)).toBe(true);
  // Native verification rejects duplicate subjects or unused proof nodes, so this also establishes legitimate sharing.
  expect(verifyFiniteRe01Evidence(actual, hypothesis.target, result.evidence).kind).toBe('checked-candidate');
});

it('retains inherited-consumer rejection rather than publishing a merely locally feasible child', async () => {
  const {actual, hypothesis, consumerId} = await seeded({anchored: true, conflict: true});
  const result = completeSeededRe01Evidence(actual, hypothesis.target, hypothesis);
  assert.equal(result.kind, 'no-witness-found', json(result));
  expect(result).toMatchObject({universalCoverage: false, completeNegativeAnswer: false});
  expect(result.outcomes.some(at => at.failure.kind === 'candidate-rejected' && at.failure.component === consumerId)).toBe(true);
});

it('keeps unsupported authoritative RAW geometry and exhausted local families inconclusive', async () => {
  const {actual, hypothesis} = await seeded({anchored: true, empty: true});
  const result = completeSeededRe01Evidence(actual, hypothesis.target, hypothesis);
  assert.equal(result.kind, 'no-witness-found', json(result));
  expect(result).toMatchObject({universalCoverage: false, completeNegativeAnswer: false});
  expect(result.outcomes.some(at => 'rule' in at.failure && at.failure.rule === 'anchored-list-body-ports')).toBe(true);
  const conflict = await source('shared-inherited-list-conflict');
  const noProof = buildRe01Evidence(conflict.actual, type(sharedNamespace, 'D'));
  expect(noProof).toMatchObject({kind: 'no-witness-found', universalCoverage: false, completeNegativeAnswer: false});
});

it('returns sticky resource exhaustion during exploration without partial evidence', async () => {
  // The preparation succeeds under this budget; the multi-context forest search cannot complete in the remainder.
  const request = await source('shared-inherited-list-multiple', 150_000);
  const actual = request.actual;
  const result = buildRe01Evidence(actual, type(sharedNamespace, 'D'));
  expect(result.kind).toBe('resource-limit');
  expect(result).toBe(actual.budget.failure());
  expect(buildRe01Evidence(actual, type(sharedNamespace, 'D'))).toBe(result);
});

it('backtracks from a locally feasible alternative that loses an inherited affiliate to one retaining its exact head type', async () => {
  const request = await source('finite-proof-independent'), actual = request.actual;
  const namespace = 'urn:recovery:finite-proof';
  const id = (name: string) => type(namespace, name);
  const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
  const b = actual.lookup(id('B')), d = actual.lookup(id('D'));
  assert.equal(b.kind, 'found'); assert.equal(b.node.kind, 'complexType');
  assert.equal(d.kind, 'found'); assert.equal(d.node.kind, 'complexType');
  const prototype = b.node;
  const helper = (name: string, base: Reference): ComplexTypeNode => ({...prototype, id: id(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    derivation: {kind: 'extension', contentKind: 'simple', base, facets: []}});
  const properties = (target: string, base: Reference, method: 'extension' | 'restriction', scalar: Reference): RawComplexTypeProperties => ({
    type: target, derivation: {base, method}, abstract: false, final: [], block: [], content: {kind: 'simple', type: scalar},
    attributeUses: prototype.attributes, provenance: {kind: 'hypothetical-abstract', originals: actual.lookup(target).kind === 'found' ? [target] : []}});
  const middle = helper('FirstMiddle', builtin('anySimpleType'));
  const retained = helper('RetainedHeadType', builtin('anySimpleType'));
  const child = helper('BornAffiliateType', local(retained.id));
  const element = (name: string, elementType: Reference, head?: Reference): ElementNode => ({kind: 'element',
    id: globalId('element', {namespace, local: name}), identity: {kind: 'global', role: 'element', name: {namespace, local: name}},
    name: {namespace, local: name}, context: prototype.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    type: elementType, nillable: false, abstract: false, substitutionGroup: head});
  const head = element('RetainedHead', local(retained.id));
  const member = element('InheritedMember', local(child.id), local(head.id));
  const additions = [middle, retained, child, head, member];
  const built = forkSemanticCandidate(actual, {key: 'backtracking-affiliate-root', active: [...actual.members, ...additions.map(at => at.id)], additions,
    endpoint: {...d.node, derivation: {kind: 'restriction', contentKind: 'simple', base: local(middle.id), facets: []}},
    rawTypes: [properties(id('B'), builtin('string'), 'extension', builtin('string')),
      properties(id('D'), local(middle.id), 'restriction', builtin('string')),
      properties(middle.id, builtin('anySimpleType'), 'extension', builtin('anySimpleType')),
      properties(retained.id, builtin('anySimpleType'), 'extension', builtin('anySimpleType')),
      properties(child.id, local(retained.id), 'extension', builtin('anySimpleType'))],
    rawElements: [head, member].map(at => ({element: at.id, final: [], block: []}))});
  assert.equal(built.kind, 'prepared', json(built));
  expect(checkComponentConstruction(built.context, member.id).kind).toBe('checked');
  // FirstMiddle is locally lawful for the child, but the affiliate must still derive from RetainedHeadType.
  const family = prepareInheritedMiddleAssignments(actual, built.context, child.id);
  assert.equal(family.kind, 'prepared-inherited-assignments', json(family));
  const losing = family.assignments.find(at => at.intermediate === middle.id); assert.ok(losing);
  const replay = replaySharedAssignment(losing); assert.equal(replay.kind, 'prepared-local-evidence');
  expect(checkComponentConstruction(replay.evidence.context, child.id).kind).toBe('checked');
  expect(checkComponentConstruction(replay.evidence.context, member.id)).toMatchObject({kind: 'candidate-rejected', rule: 'e-props-correct.4'});
  const hypothesis = {parent: actual, context: built.context, target: id('D'), intermediate: middle.id, ancestor: builtin('anySimpleType')};
  const result = completeSeededRe01Evidence(actual, id('D'), hypothesis);
  assert.equal(result.kind, 'checked-witness', json(result));
  expect(result.outcomes.some(at => at.failure.kind === 'candidate-rejected' && at.failure.component === member.id)).toBe(true);
  const chosen = result.evidence.nodes.find(at => at.parent === built.context && at.target === child.id); assert.ok(chosen);
  expect(chosen.intermediate).toBe(retained.id);
  expect(chosen.context.rawTypeProperties(retained.id)).toBe(built.context.rawTypeProperties(retained.id));
  expect(checkComponentConstruction(chosen.context, member.id).kind).toBe('checked');
  expect(verifyFiniteRe01Evidence(actual, id('D'), result.evidence).kind).toBe('checked-candidate');
});

it('refuses a structural subset instead of treating inactive stored components as absent', async () => {
  const {actual, hypothesis} = await seeded({multipleActual: true, inactive: true});
  expect(hypothesis.context.membership).toBe('structural-subset');
  const result = completeSeededRe01Evidence(actual, hypothesis.target, hypothesis);
  assert.equal(result.kind, 'no-witness-found', json(result));
  expect(result).toMatchObject({universalCoverage: false, completeNegativeAnswer: false});
  expect(result.outcomes.some(at => 'rule' in at.failure && at.failure.rule === 'complete-domain-membership')).toBe(true);
});

it('does not accept child lists, a mismatched root target or a false ancestor in a seed', async () => {
  const {actual, hypothesis} = await seeded();
  expect(completeSeededRe01Evidence(actual, hypothesis.target, {...hypothesis, target: type(sharedNamespace, 'B')}))
    .toMatchObject({kind: 'invalid-evidence', rule: 'builder-seed-root'});
  const suppliedChildren = {...hypothesis, premises: ['borrowed-child']};
  expect(completeSeededRe01Evidence(actual, hypothesis.target, suppliedChildren))
    .toMatchObject({kind: 'invalid-evidence', rule: 'builder-seed-syntax'});
  const wrongAncestor = completeSeededRe01Evidence(actual, hypothesis.target, {...hypothesis, ancestor: local(type(sharedNamespace, 'B'))});
  assert.equal(wrongAncestor.kind, 'no-witness-found', json(wrongAncestor));
  expect(wrongAncestor.outcomes.some(at => 'rule' in at.failure && at.failure.rule === 'ancestor-correspondence')).toBe(true);
});
