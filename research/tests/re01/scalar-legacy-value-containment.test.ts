/** A reduced public component does not erase physical legacy VALUE conjuncts. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleFacetInput, RawSimpleTypeProperties, ScalarFacet} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const folder = path.resolve('test/conformance/fixtures'), namespace = 'urn:scalar:legacy-value-containment';
const id = (name: string) => globalId('type', {namespace, local: name});
const ref = (target: string): Reference => ({kind: 'local', target});
const builtin: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'duration'}};
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);

async function setup() {
  const loaded = await loadSemanticSchemaInput(path.join(folder, 'xsd/recovery/scalar-legacy-value-containment.xsd'), {policy: {fileRoots: [folder]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, before = JSON.stringify(request.graph);
  const complex = (name: string): ComplexTypeNode => {
    const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const sourceBound = (word: string): SimpleTypeNode => {
    const found = request.graph.nodes.find(node => node.kind === 'simpleType' && node.variety.kind === 'restriction'
      && node.variety.facets.some(facet => facet.name === 'maxInclusive' && facet.lexical.value === word));
    assert.ok(found); assert.equal(found.kind, 'simpleType'); assert.equal(found.identity.kind, 'scoped'); return found;
  };
  const a = complex('RootA'), sourceB = sourceBound('P2M'), sourceC = sourceBound('P1M'), map = sourceC.context;
  assert.equal(sourceC.variety.kind, 'restriction'); assert.deepEqual(sourceC.variety.base, ref(sourceB.id));
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  for (const component of actual.members) {
    const full = checkComponentConstruction(actual, component); assert.equal(full.kind, 'checked', json({component, full})); assert.deepEqual(full.obligations, []);
  }
  const original = createSchemaScalarKernel(actual), lexical = (value: string) => ({value, context: map});
  const order = original.compare(builtin, lexical('P1M'), builtin, lexical('P30D'), a.id);
  assert.equal(order.kind, 'checked', json(order)); assert.equal(order.value, 'indeterminate');
  for (const reference of [builtin, ref(sourceB.id), ref(sourceC.id)]) {
    const plan = original.describe(reference, a.id); assert.equal(plan.kind, 'checked', json(plan)); assert.deepEqual(plan.obligations, []);
    assert.equal(plan.value.whitespace, 'collapse');
    assert.ok(plan.value.layers.every(layer => layer.facets.every(facet => facet.name === 'maxInclusive')));
  }
  const scalar = (name: string, base: Reference, facets: RawSimpleFacetInput) => {
    const path = 'legacy-value/' + name, type = scopedId(a.id, path, 'type');
    const node: SimpleTypeNode = {kind: 'simpleType', id: type, context: map, identity: {kind: 'scoped', owner: a.id, path, role: 'type'},
      variety: {kind: 'restriction', base, facets: []}, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const row: RawSimpleTypeProperties = {type, targetNamespace: namespace, base, final: [], variety: {kind: 'atomic'}, ...facets,
      provenance: {kind: 'hypothetical-abstract', originals: []}};
    return {node, row};
  };
  const bound = (word: string): ScalarFacet => ({name: 'maxInclusive', fixed: false, lexical: lexical(word),
    operand: {context: 'original', type: builtin, owner: a.id}});
  const bp = scalar('B-prime', builtin, {facetComponentSet: [{annotation: 'absent', facets: [bound('P2M')]}]});
  const cp = scalar('C-prime', ref(bp.node.id), {facetLayers: [{facets: [{...bound('P1M'), annotation: 'absent'}]},
    {facets: [{...bound('P30D'), annotation: 'absent'}]}]});
  const endpoint: ComplexTypeNode = {...complex('RootD'), derivation: {kind: 'restriction', contentKind: 'complex', base: ref(id('RootB')), facets: []}};
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace, abstract: false,
    final: [], block: [], attributeUses: [], content: {kind: 'empty'}, derivation: {method: node.derivation!.kind, base: node.derivation!.base},
    provenance: {kind: 'hypothetical-abstract', originals: [node.id]}});
  const build = (key: string, extra: readonly ReturnType<typeof scalar>[] = []) => {
    const rows = [bp, cp, ...extra], built = request.candidate({key, endpoint, additions: rows.map(row => row.node),
      active: [...actual.members, ...rows.map(row => row.node.id)], rawSimpleTypes: rows.map(row => row.row),
      rawTypes: [raw(complex('RootB')), raw(endpoint)]});
    assert.equal(built.kind, 'prepared', json(built)); return {context: built.context, rows};
  };
  const full = (context: SemanticContext, component: string) => {
    const result = checkComponentConstruction(context, component); assert.equal(result.kind, 'checked', json(result)); assert.deepEqual(result.obligations, []); return result;
  };
  const baseline = (context: SemanticContext) => {
    const kernel = createSchemaScalarKernel(context); full(context, bp.node.id); full(context, cp.node.id);
    for (const [left, right] of [[bp.node, sourceB], [cp.node, sourceC]] as const) {
      const currentLeft = context.lookup(left.id), currentRight = context.lookup(right.id);
      assert.equal(currentLeft.kind, 'found'); assert.equal(currentRight.kind, 'found');
      const properties = compareComponentProperties(context, currentLeft.node, currentRight.node);
      assert.equal(properties.kind, 'checked', json(properties)); assert.equal(properties.value, true); assert.deepEqual(properties.scalarObligations, []);
    }
    for (const word of ['P1M', 'P30D']) {
      const qualification = kernel.assess(ref(bp.node.id), lexical(word), a.id);
      assert.equal(qualification.kind, 'checked', json(qualification)); assert.deepEqual(qualification.obligations, []);
    }
    const source = kernel.assess(ref(sourceC.id), lexical('P1M'), a.id); assert.equal(source.kind, 'checked'); assert.deepEqual(source.obligations, []);
    const hidden = kernel.assess(ref(cp.node.id), lexical('P1M'), a.id);
    assert.equal(hidden.kind, 'invalid-schema'); assert.equal(hidden.rule, 'cvc-maxInclusive-valid');
    return kernel;
  };
  const forest = (context: SemanticContext) => verifyFiniteRe01Evidence(actual, endpoint.id, {root: 'root', nodes: [{id: 'root', parent: actual, context,
    target: endpoint.id, intermediate: id('RootB'), ancestor: ref(a.id), premises: []}]});
  const complete = (context: SemanticContext, rows: readonly ReturnType<typeof scalar>[]) => {
    const proof = forest(context); assert.equal(proof.kind, 'checked-candidate', json(proof)); assert.equal(proof.proof.length, 1);
    for (const {node} of rows) assert.ok(proof.proof[0]!.components.some(component => component.component === node.id));
  };
  const finish = () => {assert.equal(JSON.stringify(request.graph), before); assert.equal(actual.budget.exhausted(), false);};
  return {a, original, lexical, scalar, bound, bp, cp, build, full, baseline, forest, complete, finish};
}

it('preserves valid legacy SOURCE properties without equating their VALUE functions', async () => {
  const s = await setup(), {context, rows} = s.build('legacy-source');
  s.baseline(context); s.complete(context, rows); s.finish();
});

it('rejects CURRENT and legacy aliases that drop a hidden BASE VALUE conjunct', async () => {
  const s = await setup();
  for (const [name, facets] of [['Current', {facetComponentSet: [{baseComponent: 0}]}],
    ['Legacy', {facetLayers: [{facets: [{...s.bound('P1M'), annotation: 'absent'}]}]}]] as const) {
    const d = s.scalar(name, ref(s.cp.node.id), facets), {context} = s.build(name, [d]); s.baseline(context);
    const rejected = checkComponentConstruction(context, d.node.id);
    assert.equal(rejected.kind, 'candidate-rejected', json(rejected)); assert.equal(rejected.rule, 'scalar-value-space-restriction');
    const proof = s.forest(context); assert.equal(proof.kind, 'candidate-rejected'); assert.equal(proof.rule, 'scalar-value-space-restriction');
  }
  s.finish();
});

it('accepts actual enum and stronger-bound compensation for hidden BASE constraints', async () => {
  const s = await setup();
  const enumFacet: ScalarFacet = {...s.bound('P15D'), name: 'enumeration'};
  const candidates = [s.scalar('Finite', ref(s.cp.node.id), {facetComponentSet: [{baseComponent: 0}, {annotation: 'absent', facets: [enumFacet]}]}),
    s.scalar('Stronger', ref(s.cp.node.id), {facetComponentSet: [{annotation: 'absent', facets: [s.bound('P20D')]}]})];
  for (const [index, d] of candidates.entries()) {
    const word = index === 0 ? 'P15D' : 'P20D', {context, rows} = s.build(String(index), [d]), kernel = s.baseline(context);
    const provider = s.original.assess(builtin, s.lexical(word), s.a.id); assert.equal(provider.kind, 'checked'); assert.deepEqual(provider.obligations, []);
    const qualification = kernel.assess(ref(s.cp.node.id), s.lexical(word), s.a.id);
    assert.equal(qualification.kind, 'checked', json(qualification)); assert.deepEqual(qualification.obligations, []);
    s.full(context, d.node.id);
    const admitted = kernel.assess(ref(d.node.id), s.lexical(word), s.a.id); assert.equal(admitted.kind, 'checked'); assert.deepEqual(admitted.obligations, []);
    assert.deepEqual(admitted.value.operand, qualification.value.operand);
    const outside = kernel.assess(ref(d.node.id), s.lexical('P1M'), s.a.id); assert.equal(outside.kind, 'invalid-schema');
    s.complete(context, rows);
  }
  s.finish();
});
