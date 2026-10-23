/** Unary endpoint construction through authentic CURRENT plans; tuple synthesis remains separate. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {Reference} from '../../../src/compiler/canonicalGraph.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';

const directory = path.resolve('test/conformance/fixtures');
const namespace = 'urn:scalar:private-alias-endpoint-capacity';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (name: string): Reference => ({kind: 'local', target: id(name)});
async function setup() {
  const loaded = await loadSemanticSchemaInput(path.join(directory, 'xsd/recovery/private-alias-endpoint-capacity.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {actual} = prepared.request, kernel = createSchemaScalarKernel(actual);
  const found = actual.lookup(id('A')); assert.equal(found.kind, 'found');
  return {actual, kernel, owner: found.node};
}

it.each(['BoundedFloat', 'BoundedDouble'])('constructs a non-enumerated %s endpoint and both genuine words', async name => {
  const {actual, kernel, owner} = await setup();
  assert.equal(checkComponentConstruction(actual, id(name)).kind, 'checked');
  // The sole normalized spelling is 1.5E0, and 1 <= 1.5 < 2 in both formats.
  const result = kernel.privateAliasEndpointAdmission(local(name), owner.id);
  assert.equal(result.kind, 'checked'); assert.equal(result.value.kind, 'admitted-witness');
  assert.equal(result.value.scope, 'current-atomic-admission');
  assert.equal(result.value.operand.canonical, '1.5');
  assert.equal(result.value.membershipWord.value.trim(), '1.5E0');
  assert.equal(kernel.assess(local(name), result.value.membershipWord, owner.id).kind, 'checked');
  assert.equal(kernel.assess(result.value.primitive, result.value.primitiveWord, owner.id).kind, 'checked');
  const same = kernel.equivalent(local(name), result.value.membershipWord, result.value.primitive, result.value.primitiveWord, owner.id);
  assert.equal(same.kind, 'checked'); assert.equal(same.value, true);
  assert.equal(result.contextId, actual.contextId); assert.deepEqual(result.obligations, []);
  assert.ok(actual.budget.usage().work < 125_000_000, 'The practical path must complete within the maintained default');
});

it.each(['DisjointFloat', 'DisjointDouble', 'AdjacentFloat', 'AdjacentDouble'])('proves only CURRENT admission empty for %s', async name => {
  const {actual, kernel, owner} = await setup();
  assert.equal(checkComponentConstruction(actual, id(name)).kind, 'checked');
  // Disjoint patterns require 3 outside [1,2); adjacent format values leave
  // no representable value strictly between 1 and its immediate successor.
  const result = kernel.privateAliasEndpointAdmission(local(name), owner.id);
  assert.equal(result.kind, 'checked');
  assert.equal(result.value.kind, 'empty-current-admission');
  assert.equal(result.value.scope, 'current-atomic-admission');
  assert.deepEqual(result.obligations, []);
});

it.each(['DecimalB', 'DurationA', 'CalendarA'])('reconstructs both words with the existing exact %s owner', async name => {
  const {kernel, owner} = await setup();
  // These source types admit respectively 0, PT1S and 2000-01-01T00:00:01Z.
  // Their exact source bounds/enum predicates are conjoined with lexical tests.
  const result = kernel.privateAliasEndpointAdmission(local(name), owner.id);
  assert.equal(result.kind, 'checked'); assert.equal(result.value.kind, 'admitted-witness');
  const same = kernel.equivalent(local(name), result.value.membershipWord, result.value.primitive, result.value.primitiveWord, owner.id);
  assert.equal(same.kind, 'checked'); assert.equal(same.value, true);
});

it('keeps exclusive-repeat capacity when unary CURRENT admission is empty', async () => {
  const {kernel, owner} = await setup();
  const empty = kernel.privateAliasEndpointAdmission(local('EmptyFloat'), owner.id);
  assert.equal(empty.kind, 'checked'); assert.equal(empty.value.kind, 'empty-current-admission');
  const capacity = kernel.privateAliasEndpointWordCapacity(local('EmptyFloat'), owner.id);
  assert.equal(capacity.kind, 'checked'); assert.equal(capacity.value.kind, 'finite-ieee-capacity');
  assert.ok(capacity.value.maximumWordUnits >= 1, 'Inherited exclusive 1 retains its primitive spelling');
});

it('forwards generated mixed-content formation duties and dependencies', async () => {
  const {actual, kernel, owner} = await setup();
  const reference = {kind: 'original-generated', owner: id('MixedScalar')} as const;
  const result = kernel.privateAliasEndpointAdmission(reference, owner.id);
  assert.equal(result.kind, 'checked'); assert.equal(result.value.kind, 'admitted-witness');
  assert.deepEqual(result.obligations, [{rule: 'simple-content-base-mixed-emptiable', component: id('MixedBase'), contextId: actual.contextId}]);
  const plan = kernel.describe(reference, owner.id); assert.equal(plan.kind, 'checked');
  assert.deepEqual(result.typeDependencies, plan.typeDependencies);
});

it('keeps unsupported families and sticky exhaustion distinct from empty admission', async () => {
  const {actual, kernel, owner} = await setup();
  assert.equal(kernel.privateAliasEndpointAdmission(local('NotBound'), owner.id).kind, 'unsupported-capability');
  actual.budget.guard(() => actual.budget.chargeWork(125_000_000));
  const first = kernel.privateAliasEndpointAdmission(local('BoundedFloat'), owner.id);
  assert.equal(first.kind, 'resource-limit');
  assert.deepEqual(kernel.privateAliasEndpointAdmission(local('DisjointFloat'), owner.id), first);
});
