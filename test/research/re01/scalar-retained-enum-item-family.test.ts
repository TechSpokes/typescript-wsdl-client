/** Enum introduction belongs to its actual BASE, independently of the result ITEM family. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {createSchemaScalarKernel, compareSchemaFacetProperties} from '../../../src/compiler/schemaScalarKernel.js';
import {checkTypeDerivation} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawFacetComponentEntry, RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const folder = path.resolve('test/conformance/fixtures'), namespace = 'urn:scalar:retained-enum-item-family';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (name: string): Reference => ({kind: 'local', target: id(name)});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);

async function setup() {
  const loaded = await loadSemanticSchemaInput(path.join(folder, 'xsd/recovery/scalar-retained-enum-item-family.xsd'), {policy: {fileRoots: [folder]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, graphBefore = JSON.stringify(request.graph);
  const source = (name: string): SimpleTypeNode => {
    const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'simpleType'); return found.node;
  };
  const complex = (name: string): ComplexTypeNode => {
    const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const a = source('A'), storage = complex('RootA'), map = a.context;
  assert.equal(map.namespaces[''], 'urn:scalar:qname-value'); assert.equal(a.variety.kind, 'restriction');
  const enumFacet = a.variety.facets.find(facet => facet.name === 'enumeration'); assert.ok(enumFacet);
  assert.equal(enumFacet.lexical.value, 'foo'); assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  for (const type of actual.members) {
    const result = checkComponentConstruction(actual, type); assert.equal(result.kind, 'checked', json({type, result})); assert.deepEqual(result.obligations, []);
  }
  const originalKernel = createSchemaScalarKernel(actual), seed = originalKernel.assess(local('A'), enumFacet.lexical, a.id);
  assert.equal(seed.kind, 'checked', json(seed)); assert.deepEqual(seed.obligations, []);
  assert.equal(seed.value.operand.family, 'list'); assert.equal(seed.value.operand.items?.length, 1);
  assert.equal(seed.value.operand.items![0]!.family, 'QName');
  assert.equal(seed.value.operand.items![0]!.canonical, JSON.stringify(['urn:scalar:qname-value', 'foo']));
  const originalFacets = compareSchemaFacetProperties(actual, local('A'), a.id, actual, local('A'), a.id);
  assert.equal(originalFacets.kind, 'checked'); assert.equal(originalFacets.value, true); assert.equal(originalFacets.sourceFacetAnnotations.left, 'present');
  const itemRelation = checkTypeDerivation(actual, builtin('string'), local('ItemU'), []);
  assert.equal(itemRelation.kind, 'checked'); assert.equal(itemRelation.value, true);
  const scalar = (name: string, base: string, item: Reference, entries: readonly RawFacetComponentEntry[]) => {
    const node: SimpleTypeNode = {kind: 'simpleType', id: id(name), context: map,
      identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, variety: {kind: 'restriction', base: local(base), facets: []},
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const row: RawSimpleTypeProperties = {type: node.id, targetNamespace: namespace, base: local(base), final: [],
      variety: {kind: 'list', item}, facetComponentSet: entries, provenance: {kind: 'hypothetical-abstract', originals: []}};
    return {node, row};
  };
  const endpoint: ComplexTypeNode = {...complex('RootD'), derivation: {kind: 'restriction', contentKind: 'complex', base: local('RootB'), facets: []}};
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace, abstract: false,
    final: [], block: [], attributeUses: [], content: {kind: 'empty'}, derivation: {method: node.derivation!.kind, base: node.derivation!.base},
    provenance: {kind: 'hypothetical-abstract', originals: [node.id]}});
  const build = (key: string, rows: readonly ReturnType<typeof scalar>[]) => {
    const result = request.candidate({key, endpoint, additions: rows.map(row => row.node), active: [...actual.members, ...rows.map(row => row.node.id)],
      rawSimpleTypes: rows.map(row => row.row), rawTypes: [raw(complex('RootB')), raw(endpoint)]}); assert.equal(result.kind, 'prepared'); return result.context;
  };
  const forest = (context: SemanticContext) => verifyFiniteRe01Evidence(actual, endpoint.id, {root: 'root', nodes: [{id: 'root', parent: actual,
    context, target: endpoint.id, intermediate: id('RootB'), ancestor: local('RootA'), premises: []}]});
  const full = (context: SemanticContext, name: string) => {
    const result = checkComponentConstruction(context, id(name)); assert.equal(result.kind, 'checked', json(result)); assert.deepEqual(result.obligations, []); return result;
  };
  const introduced = (provider: string, word: string): RawFacetComponentEntry => ({annotation: 'absent', facets: [{name: 'enumeration', fixed: false,
    lexical: {value: word, context: map}, operand: {context: 'original', type: local(provider), owner: storage.id}}]});
  const finish = () => {assert.equal(JSON.stringify(request.graph), graphBefore); assert.equal(actual.budget.exhausted(), false);};
  return {actual, a, storage, map, enumFacet, originalKernel, scalar, build, full, forest, introduced, finish};
}

it('keeps a real enum after ITEM narrowing and again over its already empty BASE', async () => {
  const s = await setup(), keep = [{baseComponent: 0}, {baseComponent: 1}] as const;
  const alias = s.scalar('Alias', 'A', local('ItemU'), keep), c = s.scalar('C', 'A', builtin('string'), keep);
  const d = s.scalar('D', 'C', builtin('string'), keep), rows = [alias, c, d], context = s.build('retained', rows);
  for (const name of ['Alias', 'C', 'D']) {
    s.full(context, name);
    const retained = compareSchemaFacetProperties(context, local('A'), s.a.id, context, local(name), id(name));
    assert.equal(retained.kind, 'checked', json(retained)); assert.equal(retained.value, true); assert.equal(retained.annotationCorrespondence, 'equal');
  }
  const kernel = createSchemaScalarKernel(context), aliasSeed = kernel.assess(local('Alias'), s.enumFacet.lexical, id('Alias'));
  assert.equal(aliasSeed.kind, 'checked'); assert.equal(aliasSeed.value.operand.items?.[0]?.family, 'QName');
  for (const name of ['C', 'D']) for (const word of ['foo', '']) {
    const value = kernel.assess(local(name), {value: word, context: s.map}, id(name));
    assert.equal(value.kind, 'invalid-schema'); assert.equal(value.rule, 'cvc-enumeration-valid');
  }
  const proof = s.forest(context); assert.equal(proof.kind, 'checked-candidate', json(proof)); assert.equal(proof.proof.length, 1);
  for (const {node} of rows) assert.ok(proof.proof[0]!.components.some(component => component.component === node.id));
  s.finish();
});

it('forms a genuine NEW BASE-qualified enum outside the narrowed result ITEM family', async () => {
  const s = await setup(), c = s.scalar('NewEnum', 'L', builtin('string'), [{baseComponent: 0}, s.introduced('L', 'foo')]);
  const source = s.originalKernel.assess(local('L'), s.enumFacet.lexical, s.storage.id);
  assert.equal(source.kind, 'checked'); assert.equal(source.value.operand.items?.[0]?.family, 'QName');
  const context = s.build('new-enum', [c]), full = s.full(context, 'NewEnum');
  assert.ok(full.typeDependencies.some(dependency => dependency.contextId === s.actual.contextId
    && dependency.type.kind === 'component' && dependency.type.id === id('L')));
  const value = createSchemaScalarKernel(context).assess(local('NewEnum'), s.enumFacet.lexical, c.node.id);
  assert.equal(value.kind, 'invalid-schema'); assert.equal(value.rule, 'cvc-enumeration-valid');
  const proof = s.forest(context); assert.equal(proof.kind, 'checked-candidate', json(proof)); assert.equal(proof.proof.length, 1);
  assert.ok(proof.proof[0]!.components.some(component => component.component === c.node.id)); s.finish();
});

for (const [name, provider, word, family] of [['QNameBar', 'L', 'bar', 'QName'], ['Decimal', 'DecimalList', '1', 'decimal']] as const) {
  it(`still rejects a genuinely NEW ${name} enum excluded by actual BASE`, async () => {
    const s = await setup(), point = s.originalKernel.assess(local(provider), {value: word, context: s.map}, s.storage.id);
    assert.equal(point.kind, 'checked'); assert.equal(point.value.operand.items?.[0]?.family, family);
    const c = s.scalar(name, 'A', builtin('string'), [{baseComponent: 0}, {baseComponent: 1}, s.introduced(provider, word)]);
    const context = s.build(name, [c]), rejected = checkComponentConstruction(context, c.node.id);
    assert.equal(rejected.kind, 'candidate-rejected', json(rejected)); assert.equal(rejected.rule, 'enumeration-valid-restriction');
    const proof = s.forest(context); assert.equal(proof.kind, 'candidate-rejected'); assert.equal(proof.rule, 'enumeration-valid-restriction'); s.finish();
  });
}
