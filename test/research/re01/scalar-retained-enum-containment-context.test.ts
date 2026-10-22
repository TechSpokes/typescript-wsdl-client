/** Current containment maps are independent of a retained enum's introduction map. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {createSchemaScalarKernel, compareSchemaFacetProperties} from '../../../src/compiler/schemaScalarKernel.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawFacetComponentEntry, RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const folder = path.resolve('test/conformance/fixtures'), namespace = 'urn:scalar:retained-enum-context';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (name: string): Reference => ({kind: 'local', target: id(name)});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);

async function setup(mode: 'on' | 'off' | 'new-enum') {
  const loaded = await loadSemanticSchemaInput(path.join(folder, 'xsd/recovery/scalar-retained-enum-containment-context.xsd'), {policy: {fileRoots: [folder]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, graphBefore = JSON.stringify(request.graph);
  const source = (name: string): SimpleTypeNode => {
    const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'simpleType'); return found.node;
  };
  const complex = (name: string): ComplexTypeNode => {
    const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const a = source('A'), mapOff = a.context, mapOn = {...mapOff, namespaces: {...mapOff.namespaces, '': 'urn:scalar:on'}};
  assert.equal(mapOff.namespaces[''], 'urn:scalar:off'); assert.equal(a.variety.kind, 'restriction');
  const enums = a.variety.facets.filter(facet => facet.name === 'enumeration'); assert.equal(enums.length, 2);
  for (const facet of enums) {assert.equal(facet.lexical.value, ' INF '); assert.equal(facet.lexical.context.namespaces[''], 'urn:scalar:off');}
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  for (const type of actual.members) {
    const result = checkComponentConstruction(actual, type); assert.equal(result.kind, 'checked', json(result)); assert.deepEqual(result.obligations, []);
  }
  const actualScalar = createSchemaScalarKernel(actual);
  const stringPadded = actualScalar.assess(local('StringReplace'), enums[0]!.lexical, a.id);
  assert.equal(stringPadded.kind, 'invalid-schema'); assert.equal(stringPadded.rule, 'cvc-pattern-valid');
  const seed = actualScalar.assess(local('A'), enums[0]!.lexical, a.id); assert.equal(seed.kind, 'checked');
  assert.equal(seed.value.operand.family, 'float'); assert.equal(seed.value.operand.canonical, 'Infinity'); assert.deepEqual(seed.obligations, []);
  const annotation = compareSchemaFacetProperties(actual, local('A'), a.id, actual, local('A'), a.id);
  assert.equal(annotation.kind, 'checked'); assert.equal(annotation.sourceFacetAnnotations.left, 'unresolved');
  const scalar = (name: string, base: string, entries: readonly RawFacetComponentEntry[], member?: string, context = mapOff) => {
    const node: SimpleTypeNode = {kind: 'simpleType', id: id(name), context, identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
      variety: {kind: 'restriction', base: local(base), facets: []}, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const row: RawSimpleTypeProperties = {type: node.id, targetNamespace: namespace, base: local(base), final: [],
      variety: member ? {kind: 'union', members: [local(member), local('GuardQ'), local('Float')]} : {kind: 'atomic'},
      facetComponentSet: entries, provenance: {kind: 'hypothetical-abstract', originals: []}};
    return {node, row};
  };
  const literal = (name: string, value: string): RawFacetComponentEntry => ({annotation: 'absent', facets: [{name, fixed: false, lexical: {value, context: mapOff}}]});
  const collapse = scalar('StringCollapse', 'StringReplace', [literal('whiteSpace', 'collapse'), {baseComponent: 1}]);
  const b = scalar('B', 'A', [{baseComponent: 0}, {baseComponent: 1}], 'StringCollapse');
  const dead = scalar('StringDead', 'StringCollapse', [{baseComponent: 0}, {baseComponent: 1}, literal('pattern', 'DEAD')]);
  const extra: RawFacetComponentEntry[] = mode === 'new-enum' ? [{annotation: 'absent', facets: [{name: 'enumeration', fixed: false,
    lexical: {value: '2', context: mapOn}, operand: {context: 'active', type: builtin('float'), owner: id('RootA')}}]}] : [];
  const s = scalar('S', 'B', [{baseComponent: 0}, {baseComponent: 1}, ...extra], 'StringDead', mode === 'off' ? mapOff : mapOn);
  const scalars = [collapse, b, dead, s], endpoint: ComplexTypeNode = {...complex('RootD'),
    derivation: {kind: 'restriction', contentKind: 'complex', base: local('RootB'), facets: []}};
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace, abstract: false,
    final: [], block: [], attributeUses: [], content: {kind: 'empty'}, derivation: {method: node.derivation!.kind, base: node.derivation!.base},
    provenance: {kind: 'hypothetical-abstract', originals: [node.id]}});
  const built = request.candidate({key: mode, endpoint, active: [...actual.members, ...scalars.map(value => value.node.id)],
    additions: scalars.map(value => value.node), rawSimpleTypes: scalars.map(value => value.row), rawTypes: [raw(complex('RootB')), raw(endpoint)]});
  assert.equal(built.kind, 'prepared'); const context = built.context, kernel = createSchemaScalarKernel(context);
  for (const {node} of [collapse, b, dead]) {
    const result = checkComponentConstruction(context, node.id); assert.equal(result.kind, 'checked', json(result)); assert.deepEqual(result.obligations, []);
  }
  const retained = compareSchemaFacetProperties(context, local('A'), a.id, context, local('B'), b.node.id);
  assert.equal(retained.kind, 'checked'); assert.equal(retained.value, true); assert.equal(retained.annotationCorrespondence, 'equal');
  const collapsed = kernel.assess(local('StringCollapse'), enums[0]!.lexical, s.node.id); assert.equal(collapsed.kind, 'checked');
  assert.equal(collapsed.value.operand.family, 'string'); assert.equal(collapsed.value.operand.canonical, 'INF');
  const absent = kernel.assess(local('B'), enums[0]!.lexical, s.node.id); assert.equal(absent.kind, 'invalid-schema'); assert.equal(absent.rule, 'cvc-enumeration-valid');
  const qOn = kernel.assess(local('GuardQ'), {value: ' INF ', context: mapOn}, s.node.id); assert.equal(qOn.kind, 'checked');
  assert.equal(qOn.value.operand.family, 'QName');
  const qOff = kernel.assess(local('GuardQ'), enums[0]!.lexical, s.node.id); assert.equal(qOff.kind, 'invalid-schema'); assert.equal(qOff.rule, 'cvc-enumeration-valid');
  const forest = () => verifyFiniteRe01Evidence(actual, endpoint.id, {root: 'root', nodes: [{id: 'root', parent: actual, context,
    target: endpoint.id, intermediate: id('RootB'), ancestor: local('RootA'), premises: []}]});
  const finish = () => {assert.equal(JSON.stringify(request.graph), graphBefore); assert.equal(actual.budget.exhausted(), false);};
  return {actual, context, kernel, scalars, endpoint, s, mapOn, mapOff, enums, forest, finish};
}

describe('retained enum containment in the current datatype context', () => {
  it('checks own-ON emptiness while retaining the original OFF enum value and complete forest', async () => {
    const s = await setup('on'), full = checkComponentConstruction(s.context, s.s.node.id);
    assert.equal(full.kind, 'checked', json(full)); assert.deepEqual(full.obligations, []);
    const own = s.kernel.assess(local('S'), {value: ' INF ', context: s.mapOn}, s.s.node.id);
    assert.equal(own.kind, 'invalid-schema'); assert.equal(own.rule, 'cvc-enumeration-valid');
    const off = s.kernel.assess(local('S'), s.enums[0]!.lexical, s.s.node.id); assert.equal(off.kind, 'checked');
    assert.equal(off.value.operand.family, 'float'); assert.equal(off.value.operand.canonical, 'Infinity'); assert.deepEqual(off.obligations, []);
    const proof = s.forest(); assert.equal(proof.kind, 'checked-candidate', json(proof)); assert.equal(proof.proof.length, 1);
    for (const {node} of s.scalars) assert.ok(proof.proof[0]!.components.some(result => result.component === node.id));
    s.finish();
  });

  it('rejects the same retained program when its own definition map exposes FLOAT outside B', async () => {
    const s = await setup('off'), full = checkComponentConstruction(s.context, s.s.node.id);
    assert.equal(full.kind, 'candidate-rejected'); assert.equal(full.rule, 'scalar-value-space-restriction');
    const proof = s.forest(); assert.equal(proof.kind, 'candidate-rejected'); assert.equal(proof.rule, 'scalar-value-space-restriction'); s.finish();
  });

  it('still checks genuine NEW enum formation even when the own-ON whole image is empty', async () => {
    const s = await setup('new-enum'), point = s.kernel.assess(builtin('float'), {value: '2', context: s.mapOn}, s.s.node.id);
    assert.equal(point.kind, 'checked'); assert.equal(point.value.operand.family, 'float'); assert.equal(point.value.operand.canonical, '2');
    const full = checkComponentConstruction(s.context, s.s.node.id); assert.equal(full.kind, 'candidate-rejected'); assert.equal(full.rule, 'enumeration-valid-restriction');
    const proof = s.forest(); assert.equal(proof.kind, 'candidate-rejected'); assert.equal(proof.rule, 'enumeration-valid-restriction'); s.finish();
  });
});
