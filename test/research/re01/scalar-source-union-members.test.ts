import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaScalarKernel, compareSchemaFacetProperties, checkOriginalGeneratedScalar} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkTypeDerivation} from '../../../src/compiler/schemaTypeRelations.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:scalar-source-union-members';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (name: string): Reference => ({kind: 'local', target: id(name)});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});

it('retains effective SOURCE members through the first RAW overlay, original Gamma and a complete evidence forest', async () => {
  const loaded = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-source-union-members.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, originalGraph = JSON.stringify(request.graph);
  const complex = (name: string): ComplexTypeNode => {
    const selected = actual.lookup(id(name)); assert.equal(selected.kind, 'found');
    assert.equal(selected.node.kind, 'complexType'); return selected.node;
  };
  const storage = complex('RootA'), originalEndpoint = complex('RootB');
  const middle: ComplexTypeNode = {...storage, id: id('Middle'),
    identity: {kind: 'global', role: 'type', name: {namespace, local: 'Middle'}},
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    derivation: {kind: 'extension', contentKind: 'complex', base: local('RootA'), facets: []}};
  const endpoint: ComplexTypeNode = {...originalEndpoint,
    derivation: {kind: 'restriction', contentKind: 'complex', base: local('Middle'), facets: []}};
  const raw = (node: ComplexTypeNode, method: 'extension' | 'restriction', base: Reference): RawComplexTypeProperties => ({
    type: node.id, targetNamespace: namespace, derivation: {method, base}, abstract: false,
    final: [], block: [], content: {kind: 'empty'}, attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: node.id === endpoint.id ? [node.id] : []}});
  const overlay: RawSimpleTypeProperties = {type: id('P'), targetNamespace: namespace,
    base: builtin('anySimpleType'), final: [], variety: {kind: 'union', members: [builtin('string'), builtin('boolean')]},
    facetBinding: {kind: 'original', type: local('P')}, provenance: {kind: 'actual-mapped', original: id('P')}};
  const candidate = request.candidate({key: 'source-union-member-overlay', active: [...actual.members, middle.id], additions: [middle], endpoint,
    rawTypes: [raw(middle, 'extension', local('RootA')), raw(endpoint, 'restriction', local('Middle'))], rawSimpleTypes: [overlay]});
  assert.equal(candidate.kind, 'prepared'); const current = candidate.context;
  for (const world of [actual, current]) {
    for (const name of ['X', 'P', 'A', 'ConstrainedX', 'ConstrainedP', 'StringList', 'Mixed', 'ConstrainedMixed', 'MixedP', 'LockedP'])
      expect(checkComponentConstruction(world, id(name))).toMatchObject({kind: 'checked', obligations: []});
    const kernel = createSchemaScalarKernel(world);
    for (const name of ['P', 'A', 'ConstrainedP']) {
      const properties = kernel.contentProperties(local(name), storage.id); assert.equal(properties.kind, 'checked');
      expect(properties.value.members).toEqual([expect.objectContaining(builtin('string')), expect.objectContaining(builtin('boolean'))]);
      expect(checkTypeDerivation(world, local('X'), local(name), [])).toMatchObject({kind: 'checked', value: false});
      expect(checkTypeDerivation(world, builtin('boolean'), local(name), [])).toMatchObject({kind: 'checked', value: true});
    }
    expect(checkTypeDerivation(world, local('A'), local('P'), [])).toMatchObject({kind: 'checked', value: true});
    const mixed = kernel.contentProperties(local('MixedP'), storage.id); assert.equal(mixed.kind, 'checked');
    expect(mixed.value.members).toEqual([expect.objectContaining(local('StringList')), expect.objectContaining(builtin('boolean'))]);
    expect(kernel.assess(local('ConstrainedX'), {value: 'anything', context: storage.context}, storage.id)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-pattern-valid'});
    expect(kernel.assess(local('ConstrainedP'), {value: 'anything', context: storage.context}, storage.id)).toMatchObject({kind: 'checked', value: {operand: {family: 'string', canonical: 'anything'}}});
    const slot = {kind: 'original-generated' as const, owner: id('ContentRestricted')};
    expect(checkOriginalGeneratedScalar(world, slot)).toMatchObject({kind: 'checked', obligations: []});
    expect(checkTypeDerivation(world, builtin('boolean'), slot, [])).toMatchObject({kind: 'checked', value: true});
    expect(checkTypeDerivation(world, local('X'), slot, [])).toMatchObject({kind: 'checked', value: false});
  }
  expect(compareSchemaFacetProperties(actual, local('P'), storage.id, current, local('P'), storage.id)).toMatchObject({kind: 'checked', value: true});
  expect(verifyFiniteRe01Evidence(actual, id('RootB'), {root: {kind: 'primitive-no-change'}, nodes: []})).toMatchObject({kind: 'checked-primitive'});
  const correspondence = checkCandidateCorrespondence(actual, actual, current, endpoint.id, middle.id, local('RootA'));
  expect(correspondence).toMatchObject({kind: 'checked'});
  if (correspondence.kind === 'checked') expect(correspondence.originalProperties).toContain(id('P'));
  const forest = verifyFiniteRe01Evidence(actual, endpoint.id, {root: 'root', nodes: [{id: 'root', parent: actual, context: current,
    target: endpoint.id, intermediate: middle.id, ancestor: local('RootA'), premises: []}]});
  expect(forest).toMatchObject({kind: 'checked-candidate'});
  if (forest.kind === 'checked-candidate') {
    expect(forest.proof).toHaveLength(1);
    expect(forest.actualScalarSlots.some(entry => entry.slot.owner === id('ContentRestricted'))).toBe(true);
    expect(forest.proof[0]!.components.some(entry => entry.component === middle.id)).toBe(true);
    expect(forest.proof[0]!.primitiveNoChange).toContain(middle.id);
  }
  expect(JSON.stringify(request.graph)).toBe(originalGraph);
  expect(actual.budget.exhausted()).toBe(false);
});
