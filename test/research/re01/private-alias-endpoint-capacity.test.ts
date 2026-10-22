import assert from 'node:assert/strict';
import path from 'node:path';
import {it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import type {EndpointCapacityExpression} from '../../../src/compiler/schemaEndpointWordCapacity.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {RawSimpleTypeProperties, RawScalarFacetComponent, ScalarFacet} from '../../../src/compiler/schemaSimpleTypeProperties.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';

const namespace = 'urn:scalar:private-alias-endpoint-capacity';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
const maxWork = 125_000_000;

async function setup() {
  const directory = path.resolve('test/conformance/fixtures');
  const loaded = await loadSemanticSchemaInput(path.join(directory, 'xsd/recovery/private-alias-endpoint-capacity.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(loaded, {budget: createSemanticBudget({maxWork})});
  assert.equal(prepared.kind, 'prepared', 'The maintained SOURCE fixture must prepare');
  const {request} = prepared, actual = request.actual;
  const complex = (name: string): ComplexTypeNode => {
    const found = actual.lookup(id(name)); assert.equal(found.kind, 'found', name);
    assert.equal(found.node.kind, 'complexType', name); return found.node;
  };
  const owner = complex('A'), kernel = createSchemaScalarKernel(actual);
  return {request, actual, complex, owner, kernel};
}

// Evaluate min(cap, expression) without constructing the enormous power numerals.
// This is a test-only reader of the published bound, independent of its compiler.
function capped(expression: EndpointCapacityExpression, cap: bigint): bigint {
  const product = (left: bigint, right: bigint): bigint => left === 0n || right === 0n ? 0n
    : left > cap / right ? cap : left * right;
  if (expression.kind === 'integer') {const value = BigInt(expression.value); return value > cap ? cap : value;}
  if (expression.kind === 'add') return expression.children.reduce((sum, child) => {
    const value = capped(child, cap); return sum >= cap - value ? cap : sum + value;
  }, 0n);
  if (expression.kind === 'multiply') return expression.children.reduce((value, child) => product(value, capped(child, cap)), 1n);
  assert.equal(expression.kind, 'power');
  let result = 1n, base = capped(expression.base, cap), exponent = BigInt(expression.exponent);
  while (exponent > 0n) {
    if (exponent % 2n) result = product(result, base);
    exponent /= 2n; if (exponent) base = product(base, base);
  }
  return result;
}

it('bounds SOURCE alias tuples and returns zero capacity when no bound kind exists', async () => {
  const {actual, owner, kernel} = await setup();
  for (const [name, family] of [['DecimalA', 'decimal'], ['DecimalB', 'decimal'], ['DurationA', 'duration'], ['FloatA', 'float']]) {
    assert.equal(checkComponentConstruction(actual, id(name)).kind, 'checked', name + ' must be genuinely formed');
    const result = kernel.privateAliasEndpointWordCapacity(local(id(name)), owner.id);
    assert.equal(result.kind, 'checked', name + ' capacity'); assert.equal(result.value.family, family, name + ' family');
  }
  const decimal = kernel.privateAliasEndpointWordCapacity(local(id('DecimalB')), owner.id);
  assert.equal(decimal.kind, 'checked'); assert.equal(decimal.value.kind, 'finite-capacity');
  assert.equal(decimal.value.roles, 2, 'Both actual inherited upper-bound kinds are selectable roles');
  if (decimal.value.kind !== 'finite-capacity') throw new Error('Expected symbolic decimal capacity');
  // .25 < .5 < 1 < 2 satisfies both same-kind prior comparisons, the cross-kind
  // guards and the new upper pair. Both points lie in the actual DecimalB image.
  // Each point has a membership word and an independent primitive operand word.
  const words = ['0.25', '0.5'];
  for (const word of words) {
    assert.equal(kernel.assess(local(id('DecimalB')), {value: word, context: owner.context}, owner.id).kind, 'checked', 'CURRENT admission of ' + word);
    assert.equal(kernel.assess(builtin('decimal'), {value: word, context: owner.context}, owner.id).kind, 'checked', 'Primitive operand ' + word);
  }
  const knownTupleUnits = 2 * words.reduce((length, word) => length + word.length, 0);
  assert.equal(knownTupleUnits, 14);
  assert.ok(capped(decimal.value.encodedTuple, 1024n) >= BigInt(knownTupleUnits), 'The numeric bound must cover the independently assessed four-word tuple');
  assert.equal(kernel.assess(local(id('DecimalB')), {value: ' \t0.1\r ', context: owner.context}, owner.id).kind, 'checked', 'Native whitespace normalization');
  assert.equal(kernel.assess(local(id('DecimalB')), {value: '2', context: owner.context}, owner.id).kind, 'invalid-schema', 'The CURRENT mask must retain its strict upper bound');

  const zero = kernel.privateAliasEndpointWordCapacity(builtin('decimal'), owner.id);
  assert.equal(zero.kind, 'checked'); assert.equal(zero.value.kind, 'finite-capacity');
  assert.equal(zero.value.roles, 0, 'Intrinsic decimal has no existing bound kinds');
  assert.ok(zero.value.inventory.every(component => !component.kind.startsWith('min') && !component.kind.startsWith('max')));
  if (zero.value.kind !== 'finite-capacity') throw new Error('Expected symbolic intrinsic capacity');
  assert.equal(capped(zero.value.encodedTuple, 1024n), 0n, 'No endpoint roles require no words');
});

it('counts an authentic IEEE exclusive-repeat operand even when CURRENT admission is empty', async () => {
  const {owner, kernel} = await setup();
  const result = kernel.privateAliasEndpointWordCapacity(local(id('EmptyFloat')), owner.id);
  assert.equal(result.kind, 'checked'); assert.equal(result.value.kind, 'finite-ieee-capacity');
  assert.equal(result.value.roles, 1);
  if (result.value.kind !== 'finite-ieee-capacity') throw new Error('Expected finite IEEE capacity');
  assert.equal(kernel.assess(local(id('EmptyFloat')), {value: '2', context: owner.context}, owner.id).kind, 'invalid-schema', 'The spelling mask is empty');
  assert.equal(kernel.assess(builtin('float'), {value: '1', context: owner.context}, owner.id).kind, 'checked', 'The inherited exclusive endpoint still has a primitive word');
  assert.ok(result.value.maximumWordUnits >= 1, 'An empty Image must not erase the exceptional primitive operand');
  assert.ok(result.value.encodedTupleUnits >= 2, 'One role reserves both qualification words conservatively');
});

it('reads generated CURRENT components and retains their genuine mixed-base formation debt', async () => {
  const {actual, owner, kernel} = await setup();
  assert.equal(checkComponentConstruction(actual, id('SCA')).kind, 'checked', 'Ordinary generated scalar formation');
  const generated = kernel.privateAliasEndpointWordCapacity({kind: 'original-generated', owner: id('SCA')}, owner.id);
  assert.equal(generated.kind, 'checked'); assert.equal(generated.value.family, 'decimal');
  assert.equal(generated.value.roles, 1, 'The generated CURRENT table, rather than the source ancestry syntax, determines its kinds');

  const indebted = kernel.privateAliasEndpointWordCapacity({kind: 'original-generated', owner: id('MixedScalar')}, owner.id);
  assert.equal(indebted.kind, 'checked', 'A conditional formed mask can still have a finite capacity');
  assert.equal(indebted.value.family, 'decimal'); assert.equal(indebted.value.roles, 1);
  assert.deepEqual(indebted.obligations, [{rule: 'simple-content-base-mixed-emptiable', component: id('MixedBase'), contextId: actual.contextId}], 'The capacity receipt must forward the actual pending formation premise in its genuine H');
  const described = kernel.describe({kind: 'original-generated', owner: id('MixedScalar')}, owner.id);
  assert.equal(described.kind, 'checked');
  assert.deepEqual(indebted.typeDependencies, described.typeDependencies, 'Capacity must retain every type dependency of the actual declared plan');
  assert.equal(checkComponentConstruction(actual, id('MixedScalar')).kind, 'checked', 'The separate ordinary constructor discharges the displayed emptiability debt');
});

it('uses authentic RAW tables, layers, bindings and KEEP ordinals and replays them in a child H', async () => {
  const {request, actual, complex, owner} = await setup();
  const common = {context: owner.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const facet = (name: string, value: string, fixed = false, primitive = 'decimal'): ScalarFacet => ({name, fixed, lexical: {value, context: owner.context},
    ...(['enumeration', 'minInclusive', 'minExclusive', 'maxInclusive', 'maxExclusive'].includes(name)
      ? {operand: {context: 'original' as const, owner: owner.id, type: builtin(primitive)}} : {})});
  const component = (name: string, value: string, fixed = false, opaque = false, primitive?: string): RawScalarFacetComponent => ({
    ...(opaque ? {} : {annotation: 'absent' as const}), facets: [facet(name, value, fixed, primitive)]});
  const scalar = (name: string, row: Omit<RawSimpleTypeProperties, 'type' | 'targetNamespace' | 'final' | 'provenance'>) => {
    const key = '/' + name, type = hypotheticalScopedId(owner.id, key, 'type');
    const node: SimpleTypeNode = {...common, kind: 'simpleType', id: type, identity: {kind: 'scoped', owner: owner.id, path: key, role: 'type'},
      variety: {kind: 'restriction', base: builtin('decimal'), facets: []}};
    return {node, row: {type, targetNamespace: namespace, final: [], provenance: {kind: 'hypothetical-abstract' as const, originals: []}, ...row} as RawSimpleTypeProperties};
  };
  const exact = scalar('Exact', {base: builtin('decimal'), variety: {kind: 'atomic'}, facetComponentSet: [component('minInclusive', '1', true), component('minInclusive', '0'), component('enumeration', '1', false, true)]});
  const layers = scalar('Layers', {base: builtin('decimal'), variety: {kind: 'atomic'}, facetLayers: [component('maxInclusive', '2'), component('maxExclusive', '1')]});
  const binding = scalar('Binding', {base: local(id('DecimalA')), variety: {kind: 'atomic'}, facetBinding: {kind: 'original', type: local(id('DecimalA'))}});
  const plain = scalar('Plain', {base: builtin('decimal'), variety: {kind: 'atomic'}, facetComponentSet: [component('maxInclusive', '3'), component('enumeration', '1', false, true)]});
  const keep = scalar('Keep', {base: local(plain.node.id), variety: {kind: 'atomic'}, facetComponentSet: [{baseComponent: 0}, {baseComponent: 1}]});
  const calendar = scalar('Calendar', {base: builtin('dateTime'), variety: {kind: 'atomic'}, facetComponentSet: [
    component('maxExclusive', '2000-01-01T00:00:02Z', false, false, 'dateTime'), component('pattern', 'a')]});
  const scalars = [exact, layers, binding, plain, keep, calendar];
  const endpoint: ComplexTypeNode = {...complex('D'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('B')), facets: []}};
  const candidate = request.candidate({key: 'private-alias-endpoint-capacity', active: [...actual.members, ...scalars.map(item => item.node.id)], additions: scalars.map(item => item.node), endpoint,
    rawSimpleTypes: scalars.map(item => item.row)});
  assert.equal(candidate.kind, 'prepared'); const kernel = createSchemaScalarKernel(candidate.context);
  for (const item of scalars) {
    assert.equal(checkComponentConstruction(candidate.context, item.node.id).kind, 'checked', item.node.id + ' ordinary formation');
    const result = kernel.privateAliasEndpointWordCapacity(local(item.node.id), owner.id);
    assert.equal(result.kind, 'checked', item.node.id + ' capacity'); assert.ok(result.value.inventory.length, item.node.id + ' CURRENT inventory');
    if (result.value.kind === 'finite-capacity') assert.ok(capped(result.value.encodedTuple, 1024n) >= 2n, item.node.id + ' positive word capacity');
  }
  const exactResult = kernel.privateAliasEndpointWordCapacity(local(exact.node.id), owner.id); assert.equal(exactResult.kind, 'checked');
  assert.deepEqual(exactResult.value.inventory.filter(item => item.kind === 'minInclusive').map(item => item.fixed), [[true], [false]], 'Unequal actual components of one kind must remain distinct');
  assert.equal(exactResult.value.inventory.find(item => item.kind === 'enumeration')?.annotation, 'unresolved', 'Capacity must not invent opaque annotation correspondence');
  const child = forkSemanticCandidate(candidate.context, {key: 'private-alias-endpoint-capacity-child', active: candidate.context.members}); assert.equal(child.kind, 'prepared');
  const childResult = createSchemaScalarKernel(child.context).privateAliasEndpointWordCapacity(local(exact.node.id), owner.id);
  assert.equal(childResult.kind, 'checked'); assert.equal(childResult.contextId, child.context.contextId);
  assert.deepEqual(childResult.value, exactResult.value, 'Inherited RAW components are requalified in the actual child H');
});

it('keeps unsupported families separate from sticky resource refusal before a partial capacity is published', async () => {
  const {request, owner, kernel} = await setup();
  assert.equal(kernel.privateAliasEndpointWordCapacity(local(id('NotBound')), owner.id).kind, 'unsupported-capability', 'LIST is outside the bound-capable atomic alias operation');
  const reference = local(id('DecimalB')), testedOwner = owner.id;
  assert.equal(kernel.privateAliasEndpointWordCapacity(reference, testedOwner).kind, 'checked', 'Warm the actual owner before the resource boundary');
  const remaining = maxWork - request.budget.usage().work; assert.ok(remaining > 256);
  request.budget.chargeWork(remaining - 100);
  const refused = request.budget.guard(() => kernel.privateAliasEndpointWordCapacity(reference, testedOwner));
  assert.equal(refused.kind, 'resource-limit', 'Insufficient reservation cannot return a partial symbolic maximum');
  assert.equal(kernel.privateAliasEndpointWordCapacity(reference, testedOwner).kind, 'resource-limit', 'Resource refusal remains sticky after the first failed operation');
});
