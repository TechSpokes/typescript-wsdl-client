/** A free ur-parent QName proxy switch with genuine local FULL and F2 duties. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {GraphContext, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkTypeDerivation} from '../../../src/compiler/schemaTypeRelations.js';
import type {RawFacetComponentEntry, RawScalarFacetComponent, RawSimpleTypeProperties, ScalarFacet} from '../../../src/compiler/schemaSimpleTypeProperties.js';
import {DEFAULT_MAX_NODES, DEFAULT_MAX_WORK} from '../../../src/compiler/semanticBudget.js';

const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:re01:qname-proxy-batch', ownNamespace = 'urn:re01:qname-proxy-batch:own';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (name: string): Reference => ({kind: 'local', target: id(name)});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});

it('funds a two-port QName batch before switching the own-map first winner without stealing BASE64 inverses', async () => {
  const loaded = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-qname-proxy-batch.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, graphBefore = JSON.stringify(request.graph);
  const source = actual.lookup(id('S')); assert.equal(source.kind, 'found');
  const rootMap = source.node.context;
  const ownMap: GraphContext = {...rootMap, namespaces: {...rootMap.namespaces, '': ownNamespace, p: ownNamespace}};
  expect(Object.values(rootMap.namespaces)).not.toContain(ownNamespace);
  expect(checkSchemaDocumentSyntax(actual)).toMatchObject({kind: 'checked'});

  const metadata = {context: ownMap, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const scalar = (name: string, base: Reference): SimpleTypeNode => ({...metadata, kind: 'simpleType', id: id(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, variety: {kind: 'restriction', base, facets: []}});
  const facet = (name: string, value: string, fixed = false): ScalarFacet => ({name, fixed, lexical: {value, context: ownMap}});
  const component = (...facets: ScalarFacet[]): RawScalarFacetComponent => ({annotation: 'absent', facets});
  const enumeration = (word: string): ScalarFacet => ({...facet('enumeration', word),
    operand: {type: local('L0'), owner: source.node.id, context: 'active'}});
  const raw = (name: string, base: Reference, variety: RawSimpleTypeProperties['variety'],
    facetComponentSet: readonly RawFacetComponentEntry[]): RawSimpleTypeProperties => ({type: id(name), targetNamespace: namespace,
      base, final: [], variety, facetComponentSet, provenance: {kind: 'hypothetical-abstract', originals: []}});
  const additions = [
    scalar('C_T', builtin('string')), scalar('C_empty', local('C_T')),
    scalar('J0', builtin('anySimpleType')), scalar('J1', local('J0')),
    scalar('L0', builtin('anySimpleType')), scalar('Lcap', local('L0')), scalar('Lchange', local('Lcap')),
    scalar('U0', builtin('anySimpleType')), scalar('U1', local('U0')),
  ];
  const rows: RawSimpleTypeProperties[] = [
    // Primitive STRING has no facet component to select: the first WS is NEW.
    raw('C_T', builtin('string'), {kind: 'atomic'},
      [component(facet('whiteSpace', 'preserve')), component(facet('pattern', 'TWFu|T'))]),
    raw('C_empty', local('C_T'), {kind: 'atomic'},
      [{baseComponent: 0}, {baseComponent: 1}, component(facet('pattern', ':'))]),
    raw('J0', builtin('anySimpleType'), {kind: 'union', members: [local('C_T'), builtin('QName'), builtin('string')]}, []),
    raw('J1', local('J0'), {kind: 'union', members: [local('C_empty'), builtin('QName'), builtin('string')]}, []),
    raw('L0', builtin('anySimpleType'), {kind: 'list', item: local('J0')}, [component(facet('whiteSpace', 'collapse', true))]),
    raw('Lcap', local('L0'), {kind: 'list', item: local('J0')},
      [{baseComponent: 0}, component(enumeration('p:TWFu'), enumeration('p:T WFu'))]),
    raw('Lchange', local('Lcap'), {kind: 'list', item: local('J1')}, [{baseComponent: 0}, {baseComponent: 1}]),
    raw('U0', builtin('anySimpleType'), {kind: 'union', members: [local('Lcap'), builtin('base64Binary')]}, []),
    raw('U1', local('U0'), {kind: 'union', members: [local('Lchange'), builtin('base64Binary')]}, []),
  ];
  const candidate = request.candidate({key: 'qname-proxy-batch',
    active: [...actual.members, ...additions.map(node => node.id)], additions, rawSimpleTypes: rows});
  assert.equal(candidate.kind, 'prepared');
  const context = candidate.context, kernel = createSchemaScalarKernel(context);
  for (const type of [...actual.members, ...additions.map(node => node.id)])
    expect(checkComponentConstruction(context, type), type).toMatchObject({kind: 'checked', obligations: []});
  for (const [derived, base] of [['C_empty', 'C_T'], ['J1', 'J0'], ['Lchange', 'Lcap'], ['U1', 'U0']] as const)
    expect(checkTypeDerivation(context, local(derived), local(base), []), `${derived} -> ${base}`)
      .toMatchObject({kind: 'checked', value: true});

  const assess = (type: string, word: string, map: GraphContext) =>
    kernel.assess(local(type), {value: word, context: map}, source.node.id);
  const cases = [
    {word: 'TWFu', auxiliary: 'p:TWFu', items: [
      {family: 'QName', canonical: '["urn:re01:qname-proxy-batch:own","TWFu"]'},
    ]},
    {word: 'T WFu', auxiliary: 'p:T WFu', items: [
      {family: 'QName', canonical: '["urn:re01:qname-proxy-batch:own","T"]'},
      {family: 'QName', canonical: '["urn:re01:qname-proxy-batch:own","WFu"]'},
    ]},
  ];
  for (const {word, auxiliary, items} of cases) {
    for (const [type, map] of [['U0', ownMap], ['U0', rootMap], ['U1', rootMap]] as const)
      expect(assess(type, word, map)).toMatchObject({kind: 'checked', obligations: [],
        value: {operand: {family: 'base64Binary', canonical: '4d616e'}}});
    for (const [type, spelling] of [['U0', auxiliary], ['U1', word], ['U1', auxiliary]] as const) {
      const result = assess(type, spelling, ownMap);
      expect(result).toMatchObject({kind: 'checked', obligations: [], value: {operand: {family: 'list'}}});
      assert.equal(result.kind, 'checked');
      expect(result.value.operand.items?.map(item => ({family: item.family, canonical: item.canonical}))).toEqual(items);
    }
    expect(assess('Lcap', word, ownMap)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-enumeration-valid'});
    expect(assess('Lchange', word, rootMap)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-enumeration-valid'});
    for (const type of ['U0', 'U1'])
      expect(assess(type, auxiliary, rootMap)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-datatype-valid'});
  }
  expect(assess('J0', 'T', ownMap)).toMatchObject({kind: 'checked', obligations: [], value: {operand: {family: 'string', canonical: 'T'}}});
  for (const [type, word] of [['J1', 'T'], ['J0', 'p:T']] as const)
    expect(assess(type, word, ownMap)).toMatchObject({kind: 'checked', obligations: [],
      value: {operand: {family: 'QName', canonical: '["urn:re01:qname-proxy-batch:own","T"]'}}});
  expect(JSON.stringify(request.graph)).toBe(graphBefore);
  expect(context.budget.exhausted()).toBe(false);
  expect(context.budget.usage().nodes).toBeLessThanOrEqual(DEFAULT_MAX_NODES);
  expect(context.budget.usage().work).toBeLessThanOrEqual(DEFAULT_MAX_WORK);
});
