import assert from 'node:assert/strict';
import path from 'node:path';
import {it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, GraphNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:scalar:unbound-inverse';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
const cases = [['QName', 'QNameEnum', 'QNameUnion', 2], ['NOTATION', 'NotationEnum', 'NotationUnion', 2], ['LIST', 'ListEnum', 'ListUnion', 3],
  ['empty-default-absent', 'EmptyNameEnum', 'EmptyNameUnion', 2], ['empty-default-empty', 'EmptyNameEnum', 'EmptyNameUnion', 2],
  ['empty-named-entry', 'EmptyNameEnum', 'EmptyNameUnion', 2]] as const;
type Case = readonly [kind: typeof cases[number][0], enumName: typeof cases[number][1], unionName: typeof cases[number][2], count: number];

async function control([kind, enumName, unionName, count]: Case, eraseFirstMember = false) {
  const loaded = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-empty-name-inverse.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, graphBefore = JSON.stringify(request.graph);
  const complex = (name: string): ComplexTypeNode => {
    const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const storage = complex('RootA'), enumNamespace = enumName === 'EmptyNameEnum' ? '' : namespace;
  const namespaces: Record<string, string> = {xs: 'http://www.w3.org/2001/XMLSchema'};
  if (kind !== 'empty-default-absent') namespaces[''] = kind === 'empty-default-empty' ? '' : 'urn:unrelated';
  if (kind === 'empty-named-entry') namespaces.yes = '';
  if (eraseFirstMember) {namespaces[''] = namespace; namespaces.yes = namespace;}
  const lexicalContext = {...storage.context, namespaces};
  const scalar = (name: string, base: string): SimpleTypeNode => ({kind: 'simpleType', id: id(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, context: lexicalContext,
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [], variety: {kind: 'restriction', base: local(id(base)), facets: []}});
  const alias = scalar('Alias', enumName), changed = scalar('Changed', unionName), original = createSchemaScalarKernel(actual);
  for (const member of actual.members) {
    const full = checkComponentConstruction(actual, member); assert.equal(full.kind, 'checked', JSON.stringify(full)); assert.deepEqual(full.obligations, []);
  }
  const sourceEnum = original.assess(local(id(enumName)), {value: 'Foo',
    context: {...storage.context, namespaces: {...storage.context.namespaces, '': enumNamespace}}}, storage.id);
  assert.equal(sourceEnum.kind, 'checked'); assert.deepEqual(sourceEnum.obligations, []);
  const row: RawSimpleTypeProperties = {type: alias.id, base: local(id(enumName)), targetNamespace: namespace, final: [],
    variety: kind === 'LIST' ? {kind: 'list', item: builtin('QName')} : {kind: 'atomic'},
    facetComponentSet: [...Array.from({length: count}, (_unused, baseComponent) => ({baseComponent})),
      ...(eraseFirstMember ? [{annotation: 'absent' as const, facets: [{name: 'pattern', fixed: false, lexical: {value: 'never', context: lexicalContext}}]}] : [])],
    provenance: {kind: 'hypothetical-abstract', originals: []}};
  const changedRow: RawSimpleTypeProperties = {type: changed.id, base: local(id(unionName)), targetNamespace: namespace, final: [],
    variety: {kind: 'union', members: [local(alias.id), local(id(kind === 'LIST' ? 'QNameList' : 'StringFoo'))]},
    facetComponentSet: [], provenance: {kind: 'hypothetical-abstract', originals: []}};
  const endpoint: ComplexTypeNode = {...complex('RootD'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('RootB')), facets: []}};
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace, abstract: false, final: [], block: [], attributeUses: [], content: {kind: 'empty'},
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')},
    provenance: {kind: 'hypothetical-abstract', originals: [node.id]}});
  const additions: GraphNode[] = [alias, changed], rawTypes = [...['RootA', 'RootB', 'RootR'].map(name => raw(complex(name))), raw(endpoint)];
  const candidate = request.candidate({key: kind, active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint, rawTypes, rawSimpleTypes: [row, changedRow]});
  assert.equal(candidate.kind, 'prepared'); const context = candidate.context, kernel = createSchemaScalarKernel(context);
  const fullAlias = checkComponentConstruction(context, alias.id); assert.equal(fullAlias.kind, 'checked', JSON.stringify(fullAlias)); assert.deepEqual(fullAlias.obligations, []);
  const plainMatches = kind === 'empty-default-absent' || kind === 'empty-default-empty';
  const plain = kernel.assess(local(alias.id), {value: 'Foo', context: lexicalContext}, storage.id);
  assert.equal(plain.kind, plainMatches ? 'checked' : 'invalid-schema');
  assert.equal(kernel.assess(local(alias.id), {value: 'missing:Foo', context: lexicalContext}, storage.id).kind, 'invalid-schema');
  if (!eraseFirstMember) {
    const rebound = kernel.assess(local(alias.id), {value: 'yes:Foo', context: {...lexicalContext, namespaces: {...namespaces, yes: enumNamespace}}}, storage.id);
    assert.equal(rebound.kind, 'checked'); assert.deepEqual(rebound.obligations, []);
    assert.equal(rebound.value.operand.family, sourceEnum.value.operand.family); assert.equal(rebound.value.operand.canonical, sourceEnum.value.operand.canonical);
  }
  const fullChanged = checkComponentConstruction(context, changed.id);
  if (eraseFirstMember) {
    assert.equal(fullChanged.kind, 'candidate-rejected'); assert.equal(fullChanged.rule, 'scalar-value-space-restriction');
  } else {
    assert.equal(fullChanged.kind, 'checked', JSON.stringify(fullChanged)); assert.deepEqual(fullChanged.obligations, []);
    const fallback = kernel.assess(local(changed.id), {value: 'Foo', context: lexicalContext}, storage.id);
    assert.equal(fallback.kind, 'checked'); assert.equal(fallback.value.operand.family, kind === 'LIST' ? 'list' : plainMatches ? 'QName' : 'string');
    const forest = verifyFiniteRe01Evidence(actual, endpoint.id, {root: 'root', nodes: [{id: 'root', parent: actual, context,
      target: endpoint.id, intermediate: id('RootB'), ancestor: local(id('RootA')), premises: []}]});
    assert.equal(forest.kind, 'checked-candidate', JSON.stringify(forest));
  }
  assert.ok(context.budget.usage().work < 125_000_000, 'All controls must finish within the ordinary default work budget');
  assert.equal(JSON.stringify(request.graph), graphBefore);
}

it.each(cases)('forms the actual KEEP and changed-member UNION for %s without a namespace inverse exception',
  async (...parameters) => control(parameters));

it('still rejects a derived STRING value exposed outside the BASE selected image', async () => control(cases[0], true));
