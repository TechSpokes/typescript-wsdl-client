/** Fixed regular programmes share one native BASE64 core; general grounded WORD remains separate. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ElementNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {prepareInheritedMiddleAssignments, replaySharedAssignment} from './shared-assignment.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:regular-binary-word-views';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (name: string) => ({kind: 'local' as const, target: id(name)});
const builtin = (name: string) => ({kind: 'builtin' as const, name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
async function setup() {
  const loaded = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/regular-binary-word-views.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {actual} = prepared.request, kernel = createSchemaScalarKernel(actual), owner = actual.lookup(id('A'));
  assert.equal(owner.kind, 'found');
  const view = (name: string) => ({type: local(name), context: owner.node.context});
  return {actual, kernel, owner: owner.node, view};
}

it('reconstructs distinct physical WORDs sharing a core and replays their fixed VALUEs on one native graph', async () => {
  const s = await setup(), result = s.kernel.regularBinaryWordViews([s.view('Left'), s.view('Right')], s.owner.id);
  assert.equal(result.kind, 'checked'); assert.equal(result.value.kind, 'word-views');
  assert.equal(result.value.core, 'QQ=='); assert.equal(result.value.binary.canonical, '41');
  assert.deepEqual(result.value.views.map(view => view.lexical.value), ['QQ==', 'Q Q==']);
  for (const view of result.value.views) assert.equal(s.kernel.assess(view.type, view.lexical, s.owner.id).kind, 'checked');
  const common = s.kernel.equivalent(builtin('base64Binary'), result.value.views[0]!.lexical,
    builtin('base64Binary'), result.value.views[1]!.lexical, s.owner.id);
  assert.equal(common.kind, 'checked'); assert.equal(common.value, true);
  const plans = prepareInheritedMiddleAssignments(s.actual, s.actual, id('D')); assert.equal(plans.kind, 'prepared-inherited-assignments');
  const assignment = plans.assignments[0]!;
  const elements: ElementNode[] = result.value.views.map((view, index) => {
    const name = {namespace, local: 'view' + index};
    assert.ok(view.type.kind !== 'original-generated');
    return {declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
      kind: 'element', id: globalId('element', name), identity: {kind: 'global', role: 'element', name},
      name, type: view.type, context: view.lexical.context, abstract: false, nillable: false,
      value: {kind: 'fixed', lexical: view.lexical}};
  });
  const candidate = forkSemanticCandidate(s.actual, {...assignment.delta, key: 'reconstructed-word-views', additions: elements,
    active: [...s.actual.members, ...elements.map(node => node.id)],
    rawElements: elements.map(node => ({element: node.id, type: node.type, final: [], block: []}))});
  assert.equal(candidate.kind, 'prepared');
  const replay = replaySharedAssignment(assignment); assert.equal(replay.kind, 'prepared-local-evidence');
  const root = {...replay.evidence, context: candidate.context};
  const proof = verifyFiniteRe01Evidence(s.actual, id('D'), {root: root.id, nodes: [root]});
  assert.equal(proof.kind, 'checked-candidate');
  assert.equal(proof.proof[0]!.components.filter(at => elements.some(node => node.id === at.component)).length, 2);
});

it('rejects jointly incompatible core constraints although each view is feasible separately', async () => {
  const s = await setup();
  for (const name of ['OnlyOther', 'Right']) {
    const single = s.kernel.regularBinaryWordViews([s.view(name)], s.owner.id);
    assert.equal(single.kind, 'checked'); assert.equal(single.value.kind, 'word-views');
  }
  const joint = s.kernel.regularBinaryWordViews([s.view('OnlyOther'), s.view('Right')], s.owner.id);
  assert.equal(joint.kind, 'checked'); assert.equal(joint.value.kind, 'empty-word-views');
  assert.equal(joint.value.scope, 'regular-atomic-binary-word-views-v1');
  assert.deepEqual(joint.value.excluded, ['LIST', 'duration', 'numeric-guards', 'whole-value-image-labels']);
});

it('preserves FIRST and the complete tagged fixed ROOT before projection', async () => {
  const s = await setup(), lexical = {value: 'QUJD', context: s.owner.context};
  const root = {type: builtin('string'), lexical};
  const guarded = s.kernel.regularBinaryWordViews([{...s.view('GuardedFirst'), root}], s.owner.id);
  assert.equal(guarded.kind, 'checked'); assert.equal(guarded.value.kind, 'word-views');
  assert.equal(guarded.value.views[0]!.operand.family, 'string');
  // QName accepts QUJD, so FIRST forbids selecting the later STRING alternative.
  const first = s.kernel.regularBinaryWordViews([{...s.view('QNameFirst'), root}], s.owner.id);
  assert.equal(first.kind, 'checked'); assert.equal(first.value.kind, 'empty-word-views');
});

it('keeps per-view maps while matching fixed QName ROOT values', async () => {
  const s = await setup(), on = {...s.owner.context, namespaces: {...s.owner.context.namespaces, '': 'urn:on'}},
    off = {...s.owner.context, namespaces: {...s.owner.context.namespaces, '': 'urn:off'}};
  const root = {type: builtin('QName'), lexical: {value: 'QUJD', context: on}};
  const positive = s.kernel.regularBinaryWordViews([{type: builtin('QName'), context: on, root}], s.owner.id);
  assert.equal(positive.kind, 'checked'); assert.equal(positive.value.kind, 'word-views');
  const negative = s.kernel.regularBinaryWordViews([{type: builtin('QName'), context: off, root}], s.owner.id);
  assert.equal(negative.kind, 'checked'); assert.equal(negative.value.kind, 'empty-word-views');
});

it('covers empty cores, XML whitespace, P-free cores and canonical BASE64 low bits', async () => {
  const s = await setup();
  for (const name of ['Empty', 'AllWhitespace']) {
    const result = s.kernel.regularBinaryWordViews([s.view(name)], s.owner.id);
    assert.equal(result.kind, 'checked'); assert.equal(result.value.kind, 'word-views'); assert.equal(result.value.core, '');
    assert.equal(result.value.views[0]!.lexical.value.replace(/[\t\r\n ]/g, ''), '');
  }
  const unpadded = s.kernel.regularBinaryWordViews([s.view('OnlyOther')], s.owner.id);
  assert.equal(unpadded.kind, 'checked'); assert.equal(unpadded.value.kind, 'word-views'); assert.equal(unpadded.value.core, 'QUJD');
  const invalid = s.kernel.regularBinaryWordViews([s.view('InvalidLowBits')], s.owner.id);
  assert.equal(invalid.kind, 'checked'); assert.equal(invalid.value.kind, 'empty-word-views');
});

it('forwards generated formation duties and rejects excluded programmes without claiming emptiness', async () => {
  const s = await setup(), generated = {kind: 'original-generated' as const, owner: id('MixedScalar')};
  const result = s.kernel.regularBinaryWordViews([{type: generated, context: s.owner.context}], s.owner.id);
  assert.equal(result.kind, 'checked'); assert.equal(result.value.kind, 'word-views');
  assert.deepEqual(result.obligations, [{rule: 'simple-content-base-mixed-emptiable', component: id('MixedBase'), contextId: s.actual.contextId}]);
  for (const type of [local('List'), local('Float'), builtin('duration')]) {
    const outside = s.kernel.regularBinaryWordViews([{type, context: s.owner.context}], s.owner.id);
    assert.equal(outside.kind, 'unsupported-capability');
  }
  s.actual.budget.guard(() => s.actual.budget.chargeWork(Number.MAX_SAFE_INTEGER));
  assert.equal(s.kernel.regularBinaryWordViews([s.view('Empty')], s.owner.id), s.actual.budget.failure());
});

it.each(['Q', 'QQ', 'QQ=', 'QQ===', '=AAA', 'QR=='])('rejects invalid canonical BASE64 residue/padding %s', async word => {
  const s = await setup();
  const result = s.kernel.regularBinaryWordViews([{type: builtin('string'), context: s.owner.context,
    root: {type: builtin('string'), lexical: {value: word, context: s.owner.context}}}], s.owner.id);
  assert.equal(result.kind, 'checked'); assert.equal(result.value.kind, 'empty-word-views');
});

it.each([false, true])('retains fixed ROOT formation debt when joint emptiness is %s', async empty => {
  const s = await setup(), generated = {kind: 'original-generated' as const, owner: id('MixedScalar')};
  const view = {type: builtin('string'), context: s.owner.context,
    root: {type: generated, lexical: {value: 'QUJD', context: s.owner.context}}};
  const result = s.kernel.regularBinaryWordViews(empty ? [view, s.view('Right')] : [view], s.owner.id);
  assert.equal(result.kind, 'checked'); assert.equal(result.value.kind, empty ? 'empty-word-views' : 'word-views');
  assert.deepEqual(result.obligations, [{rule: 'simple-content-base-mixed-emptiable', component: id('MixedBase'), contextId: s.actual.contextId}]);
  assert.ok(result.typeDependencies.some(dependency => dependency.contextId === s.actual.contextId
    && dependency.type.kind === 'original-generated' && dependency.type.owner === id('MixedScalar')), JSON.stringify(result.typeDependencies));
});
