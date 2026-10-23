import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:scalar:union-activation-shields';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
type Mode = 'top-dead' | 'regular-shield' | 'enum-shield' | 'list-mask';

async function setup(mode: Mode) {
  const loaded = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-union-activation-shields.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, graphBefore = JSON.stringify(request.graph);
  const complex = (name: string): ComplexTypeNode => {
    const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const shield = mode === 'regular-shield' || mode === 'enum-shield', storage = complex('RootA');
  const definition = {...storage.context, namespaces: {...storage.context.namespaces, '': shield ? namespace : 'urn:scalar:nu1'}};
  const later = {...storage.context, namespaces: {...storage.context.namespaces, '': 'urn:scalar:nu0'}};
  const common = {context: definition, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const scalar = (name: string, base: Reference): SimpleTypeNode => ({...common, kind: 'simpleType', id: id(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, variety: {kind: 'restriction', base, facets: []}});
  const baseName = shield ? 'ShieldBase' : mode === 'top-dead' ? 'TopDeadBase' : 'ListBase';
  const guardBase = shield ? local(id('StringShield')) : builtin('QName');
  const guard = scalar('Guard', guardBase), result = scalar('S', local(id(baseName)));
  const guardRow: RawSimpleTypeProperties = {type: guard.id, targetNamespace: namespace, base: guardBase, final: [], variety: {kind: 'atomic'},
    facetComponentSet: [...(shield ? [{baseComponent: 0}] : []), {annotation: 'absent', facets: [mode === 'regular-shield'
      ? {name: 'pattern', fixed: false, lexical: {value: 'P1Y|[ \\t\\r\\n]+P1Y[ \\t\\r\\n]*|P1Y[ \\t\\r\\n]+', context: definition}}
      : {name: 'enumeration', fixed: false, lexical: {value: mode === 'top-dead' ? 'foo' : 'P1Y', context: definition},
        operand: {context: 'active', type: guardBase, owner: storage.id}}]}], provenance: {kind: 'hypothetical-abstract', originals: []}};
  const additions: GraphNode[] = [guard, result], rows: RawSimpleTypeProperties[] = [guardRow];
  let first = local(guard.id);
  if (mode === 'list-mask') {
    const list = scalar('GuardList', local(id('QNameList'))); additions.push(list); first = local(list.id);
    rows.push({type: list.id, targetNamespace: namespace, base: local(id('QNameList')), final: [], variety: {kind: 'list', item: local(guard.id)},
      facetComponentSet: [{baseComponent: 0}], provenance: {kind: 'hypothetical-abstract', originals: []}});
  }
  rows.push({type: result.id, targetNamespace: namespace, base: local(id(baseName)), final: [],
    variety: {kind: 'union', members: [first, shield ? local(id('ShieldQName')) : builtin(mode === 'top-dead' ? 'string' : 'duration')]},
    facetComponentSet: [{baseComponent: 0}], provenance: {kind: 'hypothetical-abstract', originals: []}});
  let member: ElementNode | undefined;
  if (!shield) {
    const elementId = globalId('element', {namespace, local: 'x'});
    member = {...common, context: later, kind: 'element', id: elementId,
      identity: {kind: 'global', role: 'element', name: {namespace, local: 'x'}}, name: {namespace, local: 'x'},
      type: local(result.id), abstract: false, nillable: false, value: {kind: 'fixed', lexical: {value: mode === 'top-dead' ? ' foo ' : 'P1Y', context: later}}};
    additions.push(member);
  }
  const endpoint: ComplexTypeNode = {...complex('RootD'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('RootB')), facets: []}};
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace, abstract: false, final: [], block: [], attributeUses: [],
    content: {kind: 'empty'}, derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')},
    provenance: {kind: 'hypothetical-abstract', originals: [node.id]}});
  const built = request.candidate({key: mode, active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint, rawSimpleTypes: rows,
    rawTypes: [...['RootA', 'RootB', 'RootR'].map(name => raw(complex(name))), raw(endpoint)],
    ...(member ? {rawElements: [{element: member.id, type: member.type, final: [], block: []}]} : {})});
  assert.equal(built.kind, 'prepared'); const context = built.context, kernel = createSchemaScalarKernel(context);
  const assess = (name: string, value: string, lexicalContext = definition) => kernel.assess(local(id(name)), {value, context: lexicalContext}, storage.id);
  const forest = () => verifyFiniteRe01Evidence(actual, endpoint.id, {root: mode, nodes: [{id: mode, parent: actual, context,
    target: endpoint.id, intermediate: id('RootB'), ancestor: local(id('RootA')), premises: []}]});
  const finish = () => {
    expect(context.budget.usage().work).toBeLessThan(125_000_000);
    expect(JSON.stringify(request.graph)).toBe(graphBefore);
  };
  for (const type of actual.members) expect(checkComponentConstruction(actual, type)).toMatchObject({kind: 'checked', obligations: []});
  return {actual, context, additions, definition, later, member, assess, forest, finish};
}

it('keeps a definition TOP rejection while a later real VALUE selects STRING', async () => {
  const s = await setup('top-dead');
  for (const type of [...s.actual.members, ...s.additions.map(node => node.id)])
    expect(checkComponentConstruction(s.context, type)).toMatchObject({kind: 'checked', obligations: []});
  for (const context of [s.definition, s.later])
    expect(s.assess('TopDeadBase', ' foo ', context)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-pattern-valid'});
  expect(s.assess('S', ' foo ')).toMatchObject({kind: 'invalid-schema', rule: 'cvc-pattern-valid'});
  expect(s.assess('Guard', ' foo ')).toMatchObject({kind: 'checked', value: {operand: {family: 'QName', normalized: 'foo'}}});
  expect(s.assess('Guard', ' foo ', s.later)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-enumeration-valid'});
  assert.ok(s.member?.value);
  expect(createSchemaScalarKernel(s.context).assess(s.member.type, s.member.value.lexical, s.member.id)).toMatchObject({
    kind: 'checked', obligations: [], value: {operand: {family: 'string', canonical: ' foo ', normalized: ' foo '}}});
  const forest = s.forest(); expect(forest.kind).toBe('checked-candidate'); assert.equal(forest.kind, 'checked-candidate');
  expect(forest.proof).toHaveLength(1);
  s.finish();
});

it.each(['regular-shield', 'enum-shield'] as const)('checks the actual rejected-result fiber for %s', async mode => {
  const s = await setup(mode);
  expect(s.assess('ShieldBase', 'P1Y')).toMatchObject({kind: 'checked', value: {operand: {family: 'string'}}});
  expect(checkComponentConstruction(s.context, id('Guard'))).toMatchObject({kind: 'checked', obligations: []});
  for (const word of [' P1Y ', '\tP1Y\r\n']) {
    expect(s.assess('ShieldBase', word)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-pattern-valid'});
    expect(s.assess('ShieldQName', word)).toMatchObject({kind: 'checked', value: {operand: {family: 'QName', normalized: 'P1Y'}}});
    expect(s.assess('Guard', word).kind).toBe(mode === 'regular-shield' ? 'checked' : 'invalid-schema');
  }
  if (mode === 'enum-shield') {
    expect(checkComponentConstruction(s.context, id('S'))).toMatchObject({kind: 'candidate-rejected', rule: 'scalar-value-space-restriction'});
    expect(s.forest()).toMatchObject({kind: 'candidate-rejected', rule: 'scalar-value-space-restriction', component: id('S')});
  } else {
    for (const type of [...s.actual.members, ...s.additions.map(node => node.id)])
      expect(checkComponentConstruction(s.context, type)).toMatchObject({kind: 'checked', obligations: []});
    expect(s.assess('S', 'P1Y')).toMatchObject({kind: 'checked', value: {operand: {family: 'string'}}});
    expect(s.assess('S', '\tP1Y\r\n')).toMatchObject({kind: 'invalid-schema', rule: 'cvc-pattern-valid'});
    const forest = s.forest(); expect(forest.kind).toBe('checked-candidate'); assert.equal(forest.kind, 'checked-candidate');
    expect(forest.proof).toHaveLength(1);
  }
  s.finish();
});

it('keeps the singleton LIST QName tuple at definition and releases a later duration VALUE', async () => {
  const s = await setup('list-mask');
  for (const type of [...s.actual.members, ...s.additions.map(node => node.id)])
    expect(checkComponentConstruction(s.context, type)).toMatchObject({kind: 'checked', obligations: []});
  for (const context of [s.definition, s.later])
    expect(s.assess('ListBase', 'P1Y', context)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [{family: 'QName'}]}}});
  expect(s.assess('S', 'P1Y')).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [{family: 'QName', canonical: '["urn:scalar:nu1","P1Y"]'}]}}});
  expect(s.assess('GuardList', 'P1Y', s.later).kind).toBe('invalid-schema');
  assert.ok(s.member?.value);
  expect(createSchemaScalarKernel(s.context).assess(s.member.type, s.member.value.lexical, s.member.id)).toMatchObject({
    kind: 'checked', obligations: [], value: {operand: {family: 'duration', duration: {months: 12n, seconds: {coefficient: 0n}}}}});
  const forest = s.forest(); expect(forest.kind).toBe('checked-candidate'); assert.equal(forest.kind, 'checked-candidate');
  expect(forest.proof).toHaveLength(1);
  s.finish();
});
