/** Joint choices differ from independent unary proposals; native comparisons are partial. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ElementNode, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {EndpointTupleFormula, EndpointTupleTerm} from '../../../src/compiler/scalarSchemaAssessment.js';
import {DEFAULT_MAX_WORK} from '../../../src/compiler/semanticBudget.js';
import {prepareInheritedMiddleAssignments} from './shared-assignment.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:endpoint-tuples';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (name: string) => ({kind: 'local' as const, target: id(name)});
const builtin = (name: string) => ({kind: 'builtin' as const, name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
const role = (index: number): EndpointTupleTerm => ({kind: 'role', index});
const constant = (index: number): EndpointTupleTerm => ({kind: 'constant', index});
const order = (left: number, right: number, outcome: 'less' | 'equal' | 'greater' | 'undefined'): EndpointTupleFormula[number] =>
  ({kind: 'order', left: role(left), right: role(right), outcome});
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);
async function setup() {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/private-alias-endpoint-tuples.xsd'), {policy: {fileRoots: [fixtures]}});
  const source = prepareSourceSchemaRequest(input); assert.equal(source.kind, 'prepared');
  const request = source.request, actual = request.actual, found = actual.lookup(id('A')); assert.equal(found.kind, 'found');
  return {request, actual, owner: found.node, kernel: createSchemaScalarKernel(actual)};
}

it('chooses a coherent strict tuple when initial unary witnesses coincide and consumes it natively', async () => {
  const {actual, owner, kernel} = await setup();
  const unary = kernel.privateAliasEndpointAdmission(local('Pair'), owner.id); assert.equal(unary.kind, 'checked');
  assert.equal(unary.value.kind, 'admitted-witness'); expect(unary.value.operand.canonical).toBe('1');
  const tuple = kernel.privateAliasEndpointTuples({roles: [{type: local('Pair')}, {type: local('Pair')}], constants: [], formula: [order(0, 1, 'less')]}, owner.id);
  assert.equal(tuple.kind, 'checked', json(tuple)); assert.equal(tuple.value.kind, 'endpoint-tuple');
  expect(tuple.value.roles.map(at => at.operand.canonical)).toEqual(['1', '2']);
  const plans = prepareInheritedMiddleAssignments(actual, actual, id('D')); assert.equal(plans.kind, 'prepared-inherited-assignments');
  const plan = plans.assignments[0]!;
  const additions: ElementNode[] = tuple.value.roles.map((choice, at) => {
    assert.equal(choice.branch.kind, 'current'); assert.ok(choice.membershipWord);
    const name = {namespace, local: 'selected' + at};
    return {context: owner.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [], kind: 'element',
      id: globalId('element', name), identity: {kind: 'global', role: 'element', name}, name, type: local('Pair'), abstract: false, nillable: false,
      value: {kind: 'fixed', lexical: choice.membershipWord}};
  });
  const built = forkSemanticCandidate(actual, {...plan.delta, key: 'joint-tuple', additions,
    active: [...actual.members, ...additions.map(at => at.id)], rawElements: additions.map(at => ({element: at.id, type: at.type, final: [], block: []}))});
  assert.equal(built.kind, 'prepared');
  const checked = verifyFiniteRe01Evidence(actual, id('D'), {root: 'joint-tuple', nodes: [{id: 'joint-tuple', parent: actual, context: built.context,
    target: id('D'), intermediate: plan.intermediate, ancestor: plan.ancestor, premises: []}]});
  assert.equal(checked.kind, 'checked-candidate', json(checked));
  for (const element of additions) expect(checked.proof[0]!.components.some(at => at.component === element.id)).toBe(true);
});

it('proves a contradictory tuple empty despite both nonempty unary masks', async () => {
  const {owner, kernel} = await setup();
  const result = kernel.privateAliasEndpointTuples({roles: [{type: local('Pair')}, {type: local('Pair')}], constants: [],
    formula: [order(0, 1, 'less'), order(1, 0, 'less'), {kind: 'and', operands: [0, 1]}]}, owner.id);
  assert.equal(result.kind, 'checked'); expect(result.value.kind).toBe('empty-endpoint-tuples');
});

it('reconstructs distinct genuine spellings for a shared semantic value', async () => {
  const {owner, kernel} = await setup();
  const result = kernel.privateAliasEndpointTuples({roles: [{type: local('Padded')}, {type: local('Fractional')}], constants: [],
    formula: [{kind: 'same-value', left: role(0), right: role(1)}]}, owner.id);
  assert.equal(result.kind, 'checked', json(result)); assert.equal(result.value.kind, 'endpoint-tuple');
  expect(result.value.roles.map(at => at.membershipWord?.value.trim())).toEqual(['01', '1.0']);
  expect(result.value.roles.map(at => at.operand.canonical)).toEqual(['1', '1']);
});

it.each([['Month', 'Days'], ['Zoned', 'Local']])('preserves undefined native order for %s / %s', async (left, right) => {
  const {owner, kernel} = await setup();
  const result = kernel.privateAliasEndpointTuples({roles: [{type: local(left)}, {type: local(right)}], constants: [],
    formula: [order(0, 1, 'undefined'), {kind: 'same-value', left: role(0), right: role(1)}, {kind: 'not', operand: 1}, {kind: 'and', operands: [0, 2]}]}, owner.id);
  assert.equal(result.kind, 'checked', json(result)); assert.equal(result.value.kind, 'endpoint-tuple');
  const contradicted = kernel.privateAliasEndpointTuples({roles: [{type: local(left)}, {type: local(right)}], constants: [], formula: [order(0, 1, 'equal')]}, owner.id);
  assert.equal(contradicted.kind, 'checked'); expect(contradicted.value.kind).toBe('empty-endpoint-tuples');
});

it.each(['BoundedFloat', 'BoundedDouble'])('proves the practical nonenumerated %s CURRENT role singleton', async name => {
  const {actual, owner, kernel} = await setup();
  const family = name === 'BoundedFloat' ? 'float' : 'double';
  const result = kernel.privateAliasEndpointTuples({roles: [{type: local(name)}], constants: [{type: builtin(family), lexical: {value: '1.5', context: owner.context}}],
    formula: [{kind: 'same-value', left: role(0), right: constant(0)}]}, owner.id);
  assert.equal(result.kind, 'checked', json(result)); assert.equal(result.value.kind, 'endpoint-tuple');
  expect(result.value.roles[0]!.operand.canonical).toBe('1.5');
  const empty = kernel.privateAliasEndpointTuples({roles: [{type: local(name)}], constants: [{type: builtin(family), lexical: {value: '2', context: owner.context}}],
    formula: [{kind: 'same-value', left: role(0), right: constant(0)}]}, owner.id);
  assert.equal(empty.kind, 'checked'); expect(empty.value.kind).toBe('empty-endpoint-tuples');
  expect(actual.budget.usage().work).toBeLessThan(DEFAULT_MAX_WORK);
});

it('selects a genuine exclusive repeat outside empty CURRENT and retains native component formation', async () => {
  const {actual, owner, kernel} = await setup();
  const input = {constants: [{type: builtin('float'), lexical: {value: '1', context: owner.context}}],
    formula: [{kind: 'same-value' as const, left: role(0), right: constant(0)}]};
  const absent = kernel.privateAliasEndpointTuples({...input, roles: [{type: local('EmptyFloat')}]}, owner.id);
  assert.equal(absent.kind, 'checked'); expect(absent.value.kind).toBe('empty-endpoint-tuples');
  const result = kernel.privateAliasEndpointTuples({...input, roles: [{type: local('EmptyFloat'), exclusiveRepeat: 'minExclusive'}]}, owner.id);
  assert.equal(result.kind, 'checked', json(result)); assert.equal(result.value.kind, 'endpoint-tuple');
  const choice = result.value.roles[0]!; assert.equal(choice.branch.kind, 'exclusive-repeat'); expect(choice.operand.canonical).toBe('1');
  const repeatedComponent = choice.branch.component;
  expect(choice.membershipWord).toBeUndefined();
  const capacity = kernel.privateAliasEndpointWordCapacity(local('EmptyFloat'), owner.id); assert.equal(capacity.kind, 'checked');
  const name = {namespace, local: 'Repeated'}, node: SimpleTypeNode = {context: owner.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    kind: 'simpleType', id: id('Repeated'), identity: {kind: 'global', role: 'type', name}, variety: {kind: 'restriction', base: local('EmptyFloat'), facets: []}};
  const plans = prepareInheritedMiddleAssignments(actual, actual, id('D')); assert.equal(plans.kind, 'prepared-inherited-assignments'); const plan = plans.assignments[0]!;
  const built = forkSemanticCandidate(actual, {...plan.delta, key: 'exclusive-tuple', additions: [node], active: [...actual.members, node.id],
    rawSimpleTypes: [{type: node.id, targetNamespace: namespace, base: local('EmptyFloat'), final: [], variety: {kind: 'atomic'},
      facetComponentSet: [...capacity.value.inventory.filter(at => at.ordinal !== repeatedComponent).map(at => ({baseComponent: at.ordinal})),
        {annotation: 'absent', facets: [{name: 'minExclusive', fixed: false, lexical: choice.primitiveWord, operand: {type: choice.primitive, owner: owner.id, context: 'active'}}]}],
      provenance: {kind: 'hypothetical-abstract', originals: []}}]});
  assert.equal(built.kind, 'prepared');
  const checked = verifyFiniteRe01Evidence(actual, id('D'), {root: 'exclusive-tuple', nodes: [{id: 'exclusive-tuple', parent: actual, context: built.context,
    target: id('D'), intermediate: plan.intermediate, ancestor: plan.ancestor, premises: []}]});
  assert.equal(checked.kind, 'checked-candidate', json(checked));
});

it('retains every role formation debt even when the finite joint problem is empty', async () => {
  const {actual, owner, kernel} = await setup();
  const result = kernel.privateAliasEndpointTuples({roles: [{type: {kind: 'original-generated', owner: id('MixedScalar')}}, {type: local('EmptyFloat')}], constants: [], formula: []}, owner.id);
  assert.equal(result.kind, 'checked', json(result)); expect(result.value.kind).toBe('empty-endpoint-tuples');
  expect(result.obligations).toEqual([{rule: 'simple-content-base-mixed-emptiable', component: id('MixedBase'), contextId: actual.contextId}]);
  expect(result.typeDependencies.length).toBeGreaterThan(0);
});

it('distinguishes nonfinite qualification, malformed circuits and in-flight sticky exhaustion', async () => {
  const {actual, owner, kernel} = await setup();
  expect(kernel.privateAliasEndpointTuples({roles: [{type: builtin('decimal')}], constants: [], formula: []}, owner.id).kind).toBe('unsupported-capability');
  expect(kernel.privateAliasEndpointTuples({roles: [{type: local('Pair')}], constants: [], formula: [{kind: 'not', operand: 0}]}, owner.id).kind).toBe('unresolved');
  actual.budget.guard(() => actual.budget.chargeWork(DEFAULT_MAX_WORK - actual.budget.usage().work - 2_000));
  const start = actual.budget.usage().work;
  const result = kernel.privateAliasEndpointTuples({roles: [{type: local('Pair')}, {type: local('Pair')}], constants: [], formula: [order(0, 1, 'less')]}, owner.id);
  expect(result.kind).toBe('resource-limit'); expect(actual.budget.usage().work).toBeGreaterThan(start);
  expect(kernel.privateAliasEndpointTuples({roles: [], constants: [], formula: []}, owner.id)).toBe(actual.budget.failure());
});
