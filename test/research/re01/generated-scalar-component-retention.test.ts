import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import type {SemanticTypeReference} from '../../../src/compiler/semanticTypeReference.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {createSchemaScalarKernel, compareSchemaFacetProperties} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawScalarFacetComponent, RawSimpleFacetInput, RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const namespace = 'urn:scalar:gsc-current-keep', fixtures = path.resolve('test/conformance/fixtures');
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const slot = (name: string): SemanticTypeReference => ({kind: 'original-generated', owner: id(name)});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
type Mode = 'keep' | 'omitted' | 'bad-index' | 'bad-enum' | 'exact-binding' | 'sibling-binding' | 'literal' | 'forged';

async function setup(mode: Mode) {
  const loaded = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/generated-scalar-component-retention.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, graphBefore = JSON.stringify(request.graph);
  const complex = (name: string): ComplexTypeNode => {
    const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const base = complex('B'), common = {context: base.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const component = (name: string, values: readonly string[], opaque = false): RawScalarFacetComponent => ({
    ...(opaque ? {} : {annotation: 'absent' as const}), facets: values.map(value => ({name, fixed: false,
      lexical: {value, context: base.context}, operand: {context: 'original', owner: base.id, type: builtin('decimal')}})),
  });
  let input: RawSimpleFacetInput = {facetComponentSet: [{baseComponent: 0}, {baseComponent: 1}, component('enumeration', ['2'])]};
  if (mode === 'omitted') input = {facetComponentSet: [{baseComponent: 0}, component('enumeration', ['2'])]};
  if (mode === 'bad-index') input = {facetComponentSet: [{baseComponent: 2}]};
  if (mode === 'bad-enum') input = {facetComponentSet: [{baseComponent: 0}, {baseComponent: 1}, component('enumeration', ['1'])]};
  if (mode === 'exact-binding' || mode === 'sibling-binding') input = {facetBinding: {kind: 'original', type: slot(mode === 'exact-binding' ? 'A1' : 'Y')}};
  if (mode === 'literal' || mode === 'forged') {
    const enumeration = component('enumeration', ['1', '2'], true);
    input = {facetComponentSet: [component('minExclusive', ['1']), mode === 'literal' ? enumeration
      : Object.assign({}, enumeration, {identity: 'caller', annotationIdentity: 'caller'}), component('enumeration', ['2'])]};
  }
  const scalar = (key: string, base: SemanticTypeReference, input: RawSimpleFacetInput) => {
    const type = hypotheticalScopedId(id('B'), key, 'type');
    const node: SimpleTypeNode = {...common, kind: 'simpleType', id: type,
      identity: {kind: 'scoped', owner: id('B'), path: key, role: 'type'}, variety: {kind: 'restriction', base: builtin('decimal'), facets: []}};
    const row: RawSimpleTypeProperties = {type, targetNamespace: namespace, base, final: [], variety: {kind: 'atomic'}, ...input,
      provenance: {kind: 'hypothetical-abstract', originals: []}};
    return {node, row};
  };
  const peer = scalar('/' + mode, slot('A1'), input);
  const endpoint: ComplexTypeNode = {...complex('RootD'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('RootB')), facets: []}};
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')},
    abstract: false, final: [], block: [], content: {kind: 'empty'}, attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: [node.id]}});
  const built = request.candidate({key: mode, active: [...actual.members, peer.node.id], additions: [peer.node], endpoint,
    rawTypes: ['RootA', 'RootB', 'RootR'].map(name => raw(complex(name))).concat(raw(endpoint)), rawSimpleTypes: [peer.row]});
  assert.equal(built.kind, 'prepared');
  const context = built.context, root = {id: mode, parent: actual, context, target: endpoint.id,
    intermediate: id('RootB'), ancestor: local(id('RootA')), premises: []};
  return {request, actual, context, root, endpoint, peer, scalar, graphBefore, lexicalContext: base.context};
}

describe('actual immediate GSC1 scalar component retention', () => {
  it.each(['keep', 'omitted', 'bad-index', 'bad-enum', 'exact-binding', 'sibling-binding', 'literal', 'forged'] as const)
  ('closes genuine KEEP and preserves scalar/forest duties for %s', async mode => {
    const s = await setup(mode), kernel = createSchemaScalarKernel(s.context);
    for (const component of s.actual.members) expect(checkComponentConstruction(s.actual, component)).toMatchObject({kind: 'checked', obligations: []});
    const forest = verifyFiniteRe01Evidence(s.actual, s.endpoint.id, {root: mode, nodes: [s.root]});
    if (mode === 'keep' || mode === 'exact-binding') {
      expect(forest.kind).toBe('checked-candidate'); assert.equal(forest.kind, 'checked-candidate');
      expect(forest.proof).toHaveLength(1);
      expect(forest.proof[0].components).toEqual(expect.arrayContaining([expect.objectContaining({component: s.peer.node.id, obligations: []})]));
      expect(new Set(forest.actualComponents.map(receipt => receipt.component))).toEqual(new Set(s.actual.members));
      expect(checkComponentConstruction(s.context, s.peer.node.id)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.describe(local(s.peer.node.id), s.peer.node.id)).toMatchObject({kind: 'checked', obligations: [],
        typeDependencies: expect.arrayContaining([{contextId: s.context.contextId, type: {kind: 'original-generated', owner: id('A1')}}])});
      expect(kernel.assess(local(s.peer.node.id), {value: '2', context: s.lexicalContext}, s.peer.node.id)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(local(s.peer.node.id), {value: '1', context: s.lexicalContext}, s.peer.node.id)).toMatchObject({kind: 'invalid-schema'});
      expect(compareSchemaFacetProperties(s.context, local(s.peer.node.id), s.peer.node.id, s.context, slot('Y'), s.peer.node.id))
        .toMatchObject({kind: 'checked', value: mode === 'keep', obligations: []});
    } else if (mode === 'omitted' || mode === 'bad-index' || mode === 'bad-enum') {
      expect(forest).toMatchObject({kind: 'candidate-rejected', component: s.peer.node.id, contextId: s.context.contextId,
        rule: mode === 'omitted' ? 'st-restrict-facets' : mode === 'bad-index' ? 'raw-base-facet-component' : 'enumeration-valid-restriction'});
    } else {
      expect(checkComponentConstruction(s.context, s.peer.node.id)).toMatchObject({kind: 'checked',
        obligations: [expect.objectContaining({rule: 'raw-simple-facet-restriction-validity', component: s.peer.node.id})]});
      expect(forest).toMatchObject({kind: 'unresolved', rule: 'raw-simple-facet-restriction-validity', component: s.peer.node.id, contextId: s.context.contextId});
      expect(compareSchemaFacetProperties(s.context, local(s.peer.node.id), s.peer.node.id, s.context, slot('Y'), s.peer.node.id))
        .toMatchObject({kind: 'checked', value: true});
    }
    expect(JSON.stringify(s.request.graph)).toBe(s.graphBefore);
  });

  it('keeps ordinal/typed-value authority through inherited and chained selectors', async () => {
    const s = await setup('keep'), first = createSchemaScalarKernel(s.context);
    // Reading a property snapshot first must not alter the current replay table.
    expect(compareSchemaFacetProperties(s.context, slot('A1'), s.peer.node.id, s.context, slot('A2'), s.peer.node.id))
      .toMatchObject({kind: 'checked', value: true});
    expect(first.describe(local(s.peer.node.id), s.peer.node.id)).toMatchObject({kind: 'checked', obligations: []});
    const inherited = forkSemanticCandidate(s.context, {key: 'inherited', active: s.context.members}); assert.equal(inherited.kind, 'prepared');
    expect(compareSchemaFacetProperties(s.context, local(s.peer.node.id), s.peer.node.id, inherited.context, local(s.peer.node.id), s.peer.node.id))
      .toMatchObject({kind: 'checked', value: true, annotationCorrespondence: 'equal', obligations: []});
    const follower = s.scalar('/follower', local(s.peer.node.id), {facetComponentSet: [{baseComponent: 0}, {baseComponent: 1}, {baseComponent: 2}]});
    const chained = forkSemanticCandidate(inherited.context, {key: 'chained', active: [...inherited.context.members, follower.node.id], additions: [follower.node], rawSimpleTypes: [follower.row]});
    assert.equal(chained.kind, 'prepared');
    expect(checkComponentConstruction(chained.context, follower.node.id)).toMatchObject({kind: 'checked', obligations: []});
    const kernel = createSchemaScalarKernel(chained.context);
    expect(kernel.assess(local(follower.node.id), {value: '2', context: s.lexicalContext}, follower.node.id)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(local(follower.node.id), {value: '1', context: s.lexicalContext}, follower.node.id)).toMatchObject({kind: 'invalid-schema'});
    expect(compareSchemaFacetProperties(chained.context, local(follower.node.id), follower.node.id, s.context, local(s.peer.node.id), s.peer.node.id))
      .toMatchObject({kind: 'checked', value: true, annotationCorrespondence: 'equal', obligations: []});
  });

  it('retains the compiler mark on a genuine intrinsic pattern layer and its selected successor', async () => {
    const s = await setup('keep');
    const selected = s.scalar('/language', slot('LanguageA'), {facetComponentSet: [{baseComponent: 0}, {baseComponent: 1}, {baseComponent: 2}]});
    const next = s.scalar('/language-next', local(selected.node.id), {facetComponentSet: [{baseComponent: 0}, {baseComponent: 1}, {baseComponent: 2}]});
    const built = forkSemanticCandidate(s.context, {key: 'intrinsic-layer', active: [...s.context.members, selected.node.id, next.node.id],
      additions: [next.node, selected.node], rawSimpleTypes: [next.row, selected.row]}); assert.equal(built.kind, 'prepared');
    const kernel = createSchemaScalarKernel(built.context);
    for (const node of [selected.node, next.node]) {
      expect(checkComponentConstruction(built.context, node.id)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(local(node.id), {value: 'en-US', context: s.lexicalContext}, node.id)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(local(node.id), {value: 'bad_tag', context: s.lexicalContext}, node.id)).toMatchObject({kind: 'invalid-schema'});
    }
  });

  it.each(['list', 'union'] as const)('leaves %s GSC inventories outside the atomic exporter', async kind => {
    const s = await setup('keep'), selected = s.scalar('/unsupported-' + kind, slot(kind === 'list' ? 'ListA' : 'UnionA'), {facetComponentSet: [{baseComponent: 0}]});
    const row: RawSimpleTypeProperties = {...selected.row, variety: kind === 'list' ? {kind: 'list', item: builtin('string')}
      : {kind: 'union', members: [builtin('decimal'), builtin('string')]}};
    const built = forkSemanticCandidate(s.context, {key: 'unsupported-' + kind, active: [...s.context.members, selected.node.id], additions: [selected.node], rawSimpleTypes: [row]});
    assert.equal(built.kind, 'prepared');
    expect(checkComponentConstruction(built.context, selected.node.id)).toMatchObject({kind: 'unresolved', rule: 'raw-simple-facet-restriction-validity', component: selected.node.id});
  });
});
