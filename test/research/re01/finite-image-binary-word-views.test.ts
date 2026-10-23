/** Whole tagged LIST labels precede common-core projection and retain native FIRST/maps. */
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
import {DEFAULT_MAX_WORK} from '../../../src/compiler/semanticBudget.js';
import {normalizeWhitespace} from '../../../src/compiler/schemaDatatypeValues.js';
import {prepareInheritedMiddleAssignments} from './shared-assignment.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:finite-image-word';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (name: string) => ({kind: 'local' as const, target: id(name)});
async function setup() {
  const loaded = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/finite-image-binary-word-views.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const actual = prepared.request.actual, owner = actual.lookup(id('A')); assert.equal(owner.kind, 'found');
  const kernel = createSchemaScalarKernel(actual), context = owner.node.context;
  const view = (name: string, image?: string, positive = true) => ({type: local(name), context,
    labels: image ? [{image: local(image), context, positive}] : []});
  return {actual, owner: owner.node, kernel, context, view};
}

it('constructs different physical LIST WORDs for positive and negative whole-image labels on one core', async () => {
  const s = await setup(), result = s.kernel.finiteImageBinaryWordViews([s.view('Choices', 'Image'), s.view('Choices', 'Image', false), s.view('Core')], s.owner.id);
  assert.equal(result.kind, 'checked'); assert.equal(result.value.kind, 'word-views');
  assert.equal(result.value.core, 'QUJD'); assert.equal(result.value.binary.canonical, '414243');
  assert.deepEqual(result.value.views.map(view => normalizeWhitespace(view.lexical.value, 'collapse')), ['QU JD', 'Q UJD', 'QUJD']);
  assert.deepEqual(result.value.views.slice(0, 2).map(view => view.operand.items?.map(value => value.canonical)), [
    ['["urn:re01:word:on","QU"]', '["urn:re01:word:on","JD"]'],
    ['["urn:re01:word:on","Q"]', '["urn:re01:word:on","UJD"]'],
  ]);
  const admitted = result.value.views[0]!, inverse = admitted.labels[0]!.inverseWord;
  assert.ok(inverse);
  const inverseValue = s.kernel.assess(local('Image'), inverse, s.owner.id); assert.equal(inverseValue.kind, 'checked');
  assert.deepEqual(inverseValue.value.operand, admitted.operand);
  assert.equal(result.value.views[1]!.labels[0]!.inverseWord, undefined);
  const plans = prepareInheritedMiddleAssignments(s.actual, s.actual, id('D')); assert.equal(plans.kind, 'prepared-inherited-assignments');
  const assignment = plans.assignments[0]!;
  const elements: ElementNode[] = result.value.views.map((view, index) => {
    assert.notEqual(view.type.kind, 'original-generated'); if (view.type.kind === 'original-generated') throw new Error('Unexpected scalar slot');
    const name = {namespace, local: 'view' + index};
    return {kind: 'element', id: globalId('element', name), identity: {kind: 'global', role: 'element', name}, name, context: view.lexical.context,
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [], type: view.type, nillable: false, abstract: false,
      value: {kind: 'fixed', lexical: view.lexical}};
  });
  const candidate = forkSemanticCandidate(s.actual, {...assignment.delta, key: 'finite-image-word-consumers', additions: elements,
    active: [...s.actual.members, ...elements.map(node => node.id)], rawElements: elements.map(node => ({element: node.id, type: node.type, final: [], block: []}))});
  assert.equal(candidate.kind, 'prepared');
  const proof = verifyFiniteRe01Evidence(s.actual, id('D'), {root: 'root', nodes: [{id: 'root', parent: s.actual, context: candidate.context,
    target: id('D'), intermediate: assignment.intermediate, ancestor: assignment.ancestor, premises: []}]});
  assert.equal(proof.kind, 'checked-candidate');
  assert.ok(elements.every(element => proof.proof[0]!.components.some(receipt => receipt.component === element.id)));
});

it('rejects whole-tuple correlation although both token values occur separately in the image', async () => {
  const s = await setup();
  for (const word of ['QU UJD', 'Q JD']) assert.equal(s.kernel.assess(local('WrongPairs'), {value: word, context: s.context}, s.owner.id).kind, 'checked');
  const alone = s.kernel.finiteImageBinaryWordViews([s.view('OnlySplit'), s.view('Core')], s.owner.id);
  assert.equal(alone.kind, 'checked'); assert.equal(alone.value.kind, 'word-views');
  const joint = s.kernel.finiteImageBinaryWordViews([s.view('OnlySplit', 'WrongPairs'), s.view('Core')], s.owner.id);
  assert.equal(joint.kind, 'checked'); assert.equal(joint.value.kind, 'empty-word-views');
});

it('keeps saved image maps and FIRST instead of treating identical words as identical tagged tuples', async () => {
  const s = await setup(), off = {...s.context, namespaces: {...s.context.namespaces, '': 'urn:re01:word:off'}};
  const mapped = s.kernel.finiteImageBinaryWordViews([{...s.view('OnlySplit', 'Image'), context: off}], s.owner.id);
  assert.equal(mapped.kind, 'checked'); assert.equal(mapped.value.kind, 'empty-word-views');
  const first = s.kernel.finiteImageBinaryWordViews([s.view('First', 'Image'), s.view('Core')], s.owner.id);
  assert.equal(first.kind, 'checked'); assert.equal(first.value.kind, 'empty-word-views');
});

it('conjoins a fixed complete LIST ROOT with its negative image label and preserves the empty tuple', async () => {
  const s = await setup(), root = {type: local('Image'), lexical: {value: 'QU JD', context: s.context}};
  const positive = s.kernel.finiteImageBinaryWordViews([{...s.view('Choices', 'Image'), root}], s.owner.id);
  assert.equal(positive.kind, 'checked'); assert.equal(positive.value.kind, 'word-views');
  const negative = s.kernel.finiteImageBinaryWordViews([{...s.view('Choices', 'Image', false), root}], s.owner.id);
  assert.equal(negative.kind, 'checked'); assert.equal(negative.value.kind, 'empty-word-views');
  const empty = s.kernel.finiteImageBinaryWordViews([s.view('Words', 'EmptyImage')], s.owner.id);
  assert.equal(empty.kind, 'checked'); assert.equal(empty.value.kind, 'word-views');
  assert.equal(empty.value.core, ''); assert.deepEqual(empty.value.views[0]!.operand.items, []);
});

it.each([false, true])('retains every fixed ROOT formation duty even when the joint language is empty: %s', async empty => {
  const loaded = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/regular-binary-word-views.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const actual = prepared.request.actual, ns = 'urn:re01:regular-binary-word-views';
  const type = (name: string) => globalId('type', {namespace: ns, local: name});
  const owner = actual.lookup(type('A')); assert.equal(owner.kind, 'found');
  const generated = {kind: 'original-generated' as const, owner: type('MixedScalar')};
  const view = {type: {kind: 'builtin' as const, name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}},
    context: owner.node.context, labels: [], root: {type: generated, lexical: {value: 'QUJD', context: owner.node.context}}};
  const result = createSchemaScalarKernel(actual).finiteImageBinaryWordViews(empty
    ? [{type: {kind: 'local', target: type('Right')}, context: owner.node.context, labels: []}, view] : [view], owner.node.id);
  assert.equal(result.kind, 'checked'); assert.equal(result.value.kind, empty ? 'empty-word-views' : 'word-views');
  assert.deepEqual(result.obligations, [{rule: 'simple-content-base-mixed-emptiable', component: type('MixedBase'), contextId: actual.contextId}]);
  assert.ok(result.typeDependencies.some(dependency => dependency.contextId === actual.contextId
    && dependency.type.kind === 'original-generated' && dependency.type.owner === generated.owner));
});

it('retains a proved regular nonexponential numeric guard on each actual LIST token', async () => {
  const s = await setup(), result = s.kernel.finiteImageBinaryWordViews([s.view('NumericList', 'NumericImage')], s.owner.id);
  assert.equal(result.kind, 'checked'); assert.equal(result.value.kind, 'word-views');
  assert.equal(result.value.core, '1020'); assert.equal(normalizeWhitespace(result.value.views[0]!.lexical.value, 'collapse'), '10 20');
  assert.deepEqual(result.value.views[0]!.operand.items?.map(item => item.family), ['float', 'float']);
});

it('qualifies nonfinite images and makes in-flight exhaustion sticky without partial WORDs', async () => {
  const s = await setup();
  const outside = s.kernel.finiteImageBinaryWordViews([s.view('Choices', 'Words')], s.owner.id);
  assert.equal(outside.kind, 'unsupported-capability'); assert.equal(outside.rule, 'finite-image-label-scope');
  const before = s.actual.budget.usage().work;
  s.actual.budget.guard(() => s.actual.budget.chargeWork(DEFAULT_MAX_WORK - before - 5_000));
  const atEntry = s.actual.budget.usage().work;
  const exhausted = s.kernel.finiteImageBinaryWordViews([s.view('Choices', 'Image')], s.owner.id);
  assert.equal(exhausted.kind, 'resource-limit'); assert.ok(s.actual.budget.usage().work > atEntry);
  assert.equal(s.kernel.finiteImageBinaryWordViews([s.view('Choices', 'Image')], s.owner.id), s.actual.budget.failure());
});
