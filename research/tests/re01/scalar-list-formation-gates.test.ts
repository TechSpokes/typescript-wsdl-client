/** Native LIST ITEM formation, real enum qualification, and enclosing UNION gates. */
import assert from 'node:assert/strict';
import {it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawFacetComponentEntry, RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const folder = path.resolve('test/conformance/fixtures'), namespace = 'urn:scalar:list-formation-gates';
const id = (name: string) => globalId('type', {namespace, local: name}), local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at, 2);
const a = '1', b = '0' + a, words = [a + ' ' + b, b + ' ' + a];

async function setup() {
  const loaded = await loadSemanticSchemaInput(path.join(folder, 'xsd/recovery/scalar-list-formation-gates.xsd'), {policy: {fileRoots: [folder]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, graphBefore = JSON.stringify(request.graph);
  const complex = (name: string): ComplexTypeNode => {const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;};
  const storage = complex('RootA'), common = {context: storage.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const scalar = (name: string, base: Reference, variety: RawSimpleTypeProperties['variety'], facets: readonly RawFacetComponentEntry[], context = storage.context) => {
    const node: SimpleTypeNode = {...common, context, kind: 'simpleType', id: id(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
      variety: {kind: 'restriction', base, facets: []}};
    const row: RawSimpleTypeProperties = {type: node.id, base, targetNamespace: namespace, final: [], variety, facetComponentSet: facets,
      provenance: {kind: 'hypothetical-abstract', originals: []}};
    return {node, row};
  };
  type Scalar = ReturnType<typeof scalar>;
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace, abstract: false, final: [], block: [], attributeUses: [], content: {kind: 'empty'},
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')}, provenance: {kind: 'hypothetical-abstract', originals: []}});
  const endpoint: ComplexTypeNode = {...complex('RootD'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('RootB')), facets: []}};
  const build = (key: string, scalars: readonly Scalar[], element?: ElementNode) => {
    const additions = [...scalars.map(scalar => scalar.node), ...(element ? [element] : [])];
    const result = request.candidate({key, active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint,
      rawSimpleTypes: scalars.map(scalar => scalar.row), rawTypes: [...['RootA', 'RootB', 'RootR'].map(name => raw(complex(name))), raw(endpoint)],
      ...(element ? {rawElements: [{element: element.id, type: element.type, final: [], block: []}]} : {})}); assert.equal(result.kind, 'prepared');
    return result.context;
  };
  const full = (context: SemanticContext) => {for (const type of context.members) {
    const result = checkComponentConstruction(context, type); assert.equal(result.kind, 'checked', json({type, result})); assert.deepEqual(result.obligations, []);
  }};
  const forest = (context: SemanticContext) => verifyFiniteRe01Evidence(actual, endpoint.id, {root: 'root', nodes: [{id: 'root', parent: actual, context,
    target: endpoint.id, intermediate: id('RootB'), ancestor: local(id('RootA')), premises: []}]});
  const finish = () => {assert.equal(JSON.stringify(request.graph), graphBefore); assert.ok(actual.budget.usage().work < 125_000_000);};
  full(actual);
  return {request, actual, storage, common, scalar, build, full, forest, finish};
}

it('forms changed-ITEM DD/FF LISTs but rejects serial ITEM UNION restoration', async () => {
  const s = await setup(), pattern = (value: string): RawFacetComponentEntry => ({annotation: 'absent', facets: [{name: 'pattern', fixed: false, lexical: {value, context: s.storage.context}}]});
  const killA = s.scalar('KillA', local(id('A')), {kind: 'atomic'}, [{baseComponent: 0}, pattern('z')]);
  const killB = s.scalar('KillB', local(id('B')), {kind: 'atomic'}, [{baseComponent: 0}, pattern('z')]);
  const members = (first: Reference, second: Reference): RawSimpleTypeProperties['variety'] => ({kind: 'union', members: [first, second, local(id('C')), local(id('D'))]});
  const ua = s.scalar('UA', local(id('U')), members(local(killA.node.id), local(id('B'))), [{baseComponent: 0}]);
  const ub = s.scalar('UB', local(id('U')), members(local(id('A')), local(killB.node.id)), [{baseComponent: 0}]);
  const bundled = s.scalar('Bundled', local(id('U')), members(local(killA.node.id), local(killB.node.id)), [{baseComponent: 0}]);
  const la = s.scalar('FF', local(id('L')), {kind: 'list', item: local(ua.node.id)}, [{baseComponent: 0}, {baseComponent: 1}]);
  const lb = s.scalar('DD', local(id('L')), {kind: 'list', item: local(ub.node.id)}, [{baseComponent: 0}, {baseComponent: 1}]);
  const direct = s.scalar('Swapped', local(id('L')), {kind: 'list', item: local(bundled.node.id)}, [{baseComponent: 0}, {baseComponent: 1}]);
  const rows = [killA, killB, ua, ub, bundled, la, lb, direct], context = s.build('numeric', rows); s.full(context);
  const kernel = createSchemaScalarKernel(context), families = (name: string, word: string) => {
    const result = kernel.assess(local(id(name)), {value: word, context: s.storage.context}, s.storage.id); assert.equal(result.kind, 'checked', json(result));
    assert.equal(result.value.operand.family, 'list'); return result.value.operand.items!.map(item => item.family);
  };
  const tables = Object.fromEntries(['L', 'FF', 'DD', 'Swapped'].map(name => [name, words.map(word => families(name, word))]));
  assert.deepEqual(tables.L, [['decimal', 'float'], ['float', 'decimal']]);
  assert.deepEqual(tables.FF, [['float', 'float'], ['float', 'float']]);
  assert.deepEqual(tables.DD, [['decimal', 'decimal'], ['decimal', 'decimal']]);
  assert.deepEqual(tables.Swapped, [['float', 'decimal'], ['decimal', 'float']]);
  const proof: ReturnType<typeof verifyFiniteRe01Evidence> = s.forest(context); assert.equal(proof.kind, 'checked-candidate', json(proof));
  // Both float(1) coordinates occur in the original ITEM image, but the
  // original whole LIST only selects [decimal,float] or [float,decimal].
  // FF genuinely funds [float,float] at L0; per-ITEM or later-image funding
  // cannot replace immediate-BASE whole-tuple containment for a NEW enum.
  const tupleEnum: RawFacetComponentEntry = {annotation: 'absent', facets: [{name: 'enumeration', fixed: false,
    lexical: {value: words[0]!, context: s.storage.context}, operand: {context: 'active', type: local(la.node.id), owner: s.storage.id}}]};
  const funded = s.scalar('FundedTuple', local(la.node.id), {kind: 'list', item: local(ua.node.id)}, [{baseComponent: 0}, {baseComponent: 1}, tupleEnum]);
  const unfunded = s.scalar('UnfundedTuple', local(id('L')), {kind: 'list', item: local(ua.node.id)}, [{baseComponent: 0}, {baseComponent: 1}, tupleEnum]);
  const fundedContext = s.build('funded-tuple', [...rows, funded]);
  assert.equal(s.forest(fundedContext).kind, 'checked-candidate');
  const unfundedContext = s.build('unfunded-tuple', [...rows, unfunded]);
  assert.deepEqual(checkComponentConstruction(unfundedContext, unfunded.node.id).kind, 'candidate-rejected');
  const unfundedProof = s.forest(unfundedContext);
  assert.equal(unfundedProof.kind, 'candidate-rejected', json(unfundedProof)); assert.equal(unfundedProof.rule, 'enumeration-valid-restriction');
  [ua, ub].forEach(base => {
    const role = s.scalar(base === ua ? 'SerialA' : 'SerialB', local(base.node.id), members(local(killA.node.id), local(killB.node.id)), [{baseComponent: 0}]);
    const failed = s.build('serial-' + base.node.id, [...rows, role]);
    const check = checkComponentConstruction(failed, role.node.id), proof = s.forest(failed);
    assert.equal(check.kind, 'candidate-rejected'); assert.equal(check.rule, 'scalar-value-space-restriction');
    assert.equal(proof.kind, 'candidate-rejected'); assert.equal(proof.rule, 'scalar-value-space-restriction');
  });
  assert.equal(proof.proof.length, 1); s.finish();
});

it.each([['direct', 'enumeration-valid-restriction'], ['outer', 'scalar-value-space-restriction']] as const)(
  'prepares a genuinely qualified LIST enum and checks the %s consumer', async (mode, rule) => {
  const s = await setup(), on = {...s.storage.context, namespaces: {...s.storage.context.namespaces, '': 'urn:scalar:on'}},
    off = {...s.storage.context, namespaces: {...s.storage.context.namespaces, '': 'urn:scalar:off'}};
  const guard = s.scalar('QGuard', builtin('QName'), {kind: 'atomic'}, [{annotation: 'absent', facets: [{name: 'enumeration', fixed: false,
    lexical: {value: 'foo', context: on}, operand: {context: 'active', type: builtin('QName'), owner: s.storage.id}}]}], on);
  const item = s.scalar('QStage', local(id('QItem')), {kind: 'union', members: [local(guard.node.id), builtin('string')]}, [{baseComponent: 0}], on);
  const l0 = s.scalar('L0', local(id('QList')), {kind: 'list', item: local(item.node.id)}, [{baseComponent: 0}], on);
  const enumValue: RawFacetComponentEntry = {annotation: 'absent', facets: [{name: 'enumeration', fixed: false, lexical: {value: 'foo', context: off},
    operand: {context: 'active', type: local(l0.node.id), owner: s.storage.id}}]};
  const l1 = s.scalar('L1', local(l0.node.id), {kind: 'list', item: local(item.node.id)}, [{baseComponent: 0}, enumValue], off);
  const elementId = globalId('element', {namespace, local: 'value'}), element: ElementNode = {...s.common, context: off, kind: 'element', id: elementId,
    identity: {kind: 'global', role: 'element', name: {namespace, local: 'value'}}, name: {namespace, local: 'value'}, type: local(l1.node.id), abstract: false, nillable: false,
    value: {kind: 'fixed', lexical: {value: 'foo', context: off}}};
  const rows = [guard, item, l0, l1], context = s.build('qualification', rows, element); s.full(context);
  const kernel = createSchemaScalarKernel(context), assess = (name: string, map = off) => {
    const result = kernel.assess(local(id(name)), {value: 'foo', context: map}, s.storage.id); assert.equal(result.kind, 'checked', json(result));
    return result.value.operand;
  };
  assert.equal(assess('QList').items?.[0].family, 'QName'); assert.equal(assess('L0', on).items?.[0].family, 'QName');
  assert.equal(assess('L0').items?.[0].family, 'string'); assert.equal(assess('L1').items?.[0].family, 'string');
  const proof: ReturnType<typeof verifyFiniteRe01Evidence> = s.forest(context); assert.equal(proof.kind, 'checked-candidate', json(proof));
  const direct = s.scalar('DirectEnum', local(id('QList')), {kind: 'list', item: local(item.node.id)}, [{baseComponent: 0}, enumValue], off);
  const outer = s.scalar('Outer', local(id('QOuter')), {kind: 'union', members: [local(l0.node.id), builtin('duration')]}, [], off);
  const role = mode === 'direct' ? direct : outer, failed = s.build(role.node.id, [...rows, role]);
  const check = checkComponentConstruction(failed, role.node.id), rejected = s.forest(failed);
  assert.equal(check.kind, 'candidate-rejected'); assert.equal(check.rule, rule);
  assert.equal(rejected.kind, 'candidate-rejected'); assert.equal(rejected.rule, rule);
  assert.equal(proof.proof.length, 1); s.finish();
});
