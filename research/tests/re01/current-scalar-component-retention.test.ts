import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import type {SemanticTypeReference} from '../../../src/compiler/semanticTypeReference.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {createSchemaScalarKernel, compareSchemaFacetProperties} from '../../../src/compiler/schemaScalarKernel.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkSubstitution, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawScalarFacetComponent, RawSimpleFacetInput, RawSimpleTypeProperties, ScalarFacet} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const namespace = 'urn:scalar:intrinsic-keep', fixtures = path.resolve('test/conformance/fixtures');
const id = (name: string) => globalId('type', {namespace, local: name});
const eid = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
type Scalar = Readonly<{node: SimpleTypeNode; row: RawSimpleTypeProperties}>;

async function setup() {
  const loaded = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/current-scalar-component-retention.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, graphBefore = JSON.stringify(request.graph);
  const complex = (name: string): ComplexTypeNode => {
    const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const storage = complex('RootA'), common = {context: storage.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const facet = (name: string, value: string, fixed = false, type: Reference = builtin('decimal')): ScalarFacet => ({name, fixed,
    lexical: {value, context: storage.context}, ...(['enumeration', 'minInclusive', 'minExclusive', 'maxInclusive', 'maxExclusive'].includes(name)
      ? {operand: {context: 'original' as const, owner: storage.id, type}} : {})});
  const component = (name: string, values: readonly string[], fixed = false, opaque = false, type?: Reference): RawScalarFacetComponent => ({
    ...(opaque ? {} : {annotation: 'absent' as const}), facets: values.map(value => facet(name, value, fixed, type)),
  });
  const scalar = (name: string, base: SemanticTypeReference, input: RawSimpleFacetInput,
    variety: RawSimpleTypeProperties['variety'] = {kind: 'atomic'}, named = false): Scalar => {
    const key = '/' + name, typeName = {namespace, local: name}, type = named ? id(name) : hypotheticalScopedId(storage.id, key, 'type');
    const node: SimpleTypeNode = {...common, kind: 'simpleType', id: type,
      identity: named ? {kind: 'global', role: 'type', name: typeName} : {kind: 'scoped', owner: storage.id, path: key, role: 'type'},
      variety: {kind: 'restriction', base: builtin('decimal'), facets: []}};
    return {node, row: {type, base, targetNamespace: namespace, final: [], variety, ...input,
      provenance: {kind: 'hypothetical-abstract', originals: []}}};
  };
  const whole = deriveOriginalComplexParticle(actual, id('RootB')); assert.equal(whole.kind, 'checked');
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')}, abstract: false, final: [], block: [],
    content: {kind: 'empty'}, attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
  const endpoint: ComplexTypeNode = {...complex('RootD'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('RootB')), facets: []}};
  const build = (key: string, scalars: readonly Scalar[], elements: readonly ElementNode[] = []) => {
    const zPath = '/child-' + key, z: ComplexTypeNode = {...common, kind: 'complexType', id: hypotheticalScopedId(storage.id, zPath, 'type'),
      identity: {kind: 'scoped', owner: storage.id, path: zPath, role: 'type'}, abstract: false, mixed: false, attributes: [],
      derivation: {kind: 'extension', contentKind: 'complex', base: local(id('RootB')), facets: []}};
    const zRow: RawComplexTypeProperties = {...raw(z), content: whole.content};
    const additions = [z, ...scalars.map(item => item.node), ...elements];
    const built = request.candidate({key, active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint,
      rawSimpleTypes: scalars.map(item => item.row), rawElements: elements.map(node => ({element: node.id, type: node.type, final: [], block: []})),
      rawTypes: [...['RootA', 'RootR'].map(name => raw(complex(name))), {...raw(complex('RootB')), content: whole.content}, raw(endpoint), zRow]});
    assert.equal(built.kind, 'prepared'); const context = built.context;
    const retired: ComplexTypeNode = {...z, derivation: {...z.derivation!, kind: 'restriction'}};
    const child = forkSemanticCandidate(context, {key: 'child-' + key, active: context.members, endpoint: retired,
      rawTypes: [{...zRow, derivation: {method: 'restriction', base: local(id('RootB'))}}]}); assert.equal(child.kind, 'prepared');
    const forest = verifyFiniteRe01Evidence(actual, endpoint.id, {root: key, nodes: [{id: key, parent: actual, context,
      target: endpoint.id, intermediate: id('RootB'), ancestor: local(id('RootA')), premises: ['child']},
      {id: 'child', parent: context, context: child.context, target: z.id, intermediate: id('RootB'), ancestor: local(id('RootA')), premises: []}]});
    expect(JSON.stringify(request.graph)).toBe(graphBefore);
    return {context, child: child.context, forest};
  };
  return {request, actual, common, storage, component, scalar, build};
}

describe('complete current scalar component replay', () => {
  it.each(['exact-base', 'source-binding', 'literal', 'keep'] as const)('checks a proper named SOURCE alias profile: %s', async mode => {
    const s = await setup();
    for (const type of s.actual.members) expect(checkComponentConstruction(s.actual, type)).toMatchObject({kind: 'checked', obligations: []});
    const keep = [0, 1, 2, 3, 4].map(baseComponent => ({baseComponent}));
    const input: RawSimpleFacetInput = mode === 'source-binding' ? {facetBinding: {kind: 'original', type: local(id('NamedA1'))}}
      : mode === 'literal' ? {facetComponentSet: [s.component('whiteSpace', ['collapse']), s.component('pattern', ['\\i\\c*']),
        s.component('pattern', ['[\\i-[:]][\\c-[:]]*']), s.component('pattern', ['b']), s.component('enumeration', ['a', 'b'], false, true, builtin('NCName'))]}
      : {facetComponentSet: keep};
    const alias = s.scalar('Alias-' + mode, local(id('NamedA1')), input, {kind: 'atomic'}, true);
    const name = {namespace, local: 'member-' + mode};
    const member: ElementNode = {...s.common, kind: 'element', id: eid(name.local), identity: {kind: 'global', role: 'element', name}, name,
      type: local(mode === 'exact-base' ? id('NamedA1') : alias.node.id), abstract: false, nillable: false, substitutionGroup: local(eid('Q'))};
    const built = s.build(mode, mode === 'exact-base' ? [] : [alias], [member]);
    for (const context of [built.context, built.child]) {
      expect(checkSubstitution(context, member.id, eid('H'), {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: mode === 'exact-base'});
      expect(checkSubstitution(context, member.id, eid('Q'), {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: true});
      const members = effectiveSubstitutionMembers(context, eid('Q'));
      expect(members).toMatchObject({kind: 'checked', value: [member.id]});
    }
    if (mode === 'keep') {
      expect(built.forest.kind).toBe('checked-candidate'); assert.equal(built.forest.kind, 'checked-candidate');
      expect(built.forest.proof).toHaveLength(2);
      for (const context of [built.context, built.child]) for (const type of [alias.node.id, member.id])
        expect(checkComponentConstruction(context, type)).toMatchObject({kind: 'checked', obligations: []});
      expect(compareSchemaFacetProperties(built.context, local(alias.node.id), alias.node.id, built.child, local(alias.node.id), alias.node.id))
        .toMatchObject({kind: 'checked', value: true, annotationCorrespondence: 'equal', obligations: []});
      const kernel = createSchemaScalarKernel(built.child);
      expect(kernel.assess(local(alias.node.id), {value: 'b', context: s.storage.context}, alias.node.id)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(local(alias.node.id), {value: 'a', context: s.storage.context}, alias.node.id)).toMatchObject({kind: 'invalid-schema'});
    } else expect(built.forest).toMatchObject(mode === 'exact-base' ? {kind: 'candidate-rejected', rule: 'cos-nonambig'}
      : mode === 'source-binding' ? {kind: 'unresolved', rule: 'raw-simple-facet-restriction-validity'} : {kind: 'unsupported-capability', rule: 'pattern-subset'});
  });

  it.each(['opaque', 'multi-new', 'bad-fixed', 'bad-membership', 'mixed-kind'] as const)('retains actual RAW normal forms and ordinary F2 for %s', async mode => {
    const s = await setup();
    const opaque = s.scalar('opaque', builtin('decimal'), {facetLayers: [s.component('maxInclusive', ['3']), s.component('enumeration', ['1', '2'], false, true)]});
    const lower = s.scalar('lower', builtin('decimal'), {facetLayers: [s.component('minInclusive', ['0'], mode === 'bad-fixed'), s.component('enumeration', ['0', '1', '2'], false, true)]});
    const base = mode === 'opaque' ? opaque : lower;
    const bounds = mode === 'bad-fixed' ? [s.component('minInclusive', ['1'], true), s.component('minInclusive', ['2'], true)]
      : mode === 'bad-membership' ? [s.component('minInclusive', ['1'], true), s.component('minInclusive', ['3'])]
      : [s.component('minInclusive', ['1'], true), s.component('minInclusive', ['2'])];
    const selected = s.scalar('selected', local(base.node.id), {facetComponentSet: mode === 'opaque' ? [{baseComponent: 0}, {baseComponent: 1}]
      : mode === 'mixed-kind' ? [{baseComponent: 0}, {baseComponent: 1}, s.component('minInclusive', ['1'])] : [{baseComponent: 1}, ...bounds]});
    const template = s.scalar('template', local(base.node.id), {facetComponentSet: [s.component('enumeration', ['0', '1', '2'], false, true), ...bounds]});
    const rows = mode === 'multi-new' ? [base, selected, template] : [base, selected];
    const built = s.build(mode, rows);
    if (mode === 'opaque' || mode === 'multi-new') {
      expect(built.forest.kind).toBe('checked-candidate'); assert.equal(built.forest.kind, 'checked-candidate');
      expect(built.forest.proof).toHaveLength(2);
      for (const context of [built.context, built.child]) for (const {node} of rows)
        expect(checkComponentConstruction(context, node.id)).toMatchObject({kind: 'checked', obligations: []});
      for (const {node} of [base, selected]) expect(compareSchemaFacetProperties(built.context, local(node.id), node.id, built.child, local(node.id), node.id))
        .toMatchObject({kind: 'checked', value: true, annotationCorrespondence: 'equal', obligations: []});
      if (mode === 'multi-new') {
        const first = built.context.lookup(selected.node.id), second = built.context.lookup(template.node.id);
        assert.equal(first.kind, 'found'); assert.equal(second.kind, 'found');
        expect(compareComponentProperties(built.context, first.node, second.node)).toMatchObject({kind: 'checked', value: true, scalarObligations: []});
        const kernel = createSchemaScalarKernel(built.child);
        expect(kernel.assess(local(selected.node.id), {value: '2', context: s.storage.context}, selected.node.id)).toMatchObject({kind: 'checked', obligations: []});
        expect(kernel.assess(local(selected.node.id), {value: '1', context: s.storage.context}, selected.node.id)).toMatchObject({kind: 'invalid-schema'});
      }
    } else expect(built.forest).toMatchObject(mode === 'mixed-kind' ? {kind: 'unresolved', rule: 'raw-simple-facet-restriction-validity'}
      : {kind: 'candidate-rejected', rule: mode === 'bad-fixed' ? 'facet-fixed' : 'minInclusive-value'});
  });

  it('copies an anonymous SOURCE template over the actual nominal BASE without borrowing opaque annotations', async () => {
    const s = await setup();
    const source = s.actual.lookup(eid('a1')), template = s.actual.lookup(eid('y'));
    assert.equal(source.kind, 'found'); assert.equal(source.node.kind, 'element');
    assert.equal(template.kind, 'found'); assert.equal(template.node.kind, 'element');
    const peer = s.scalar('source-copy', source.node.type, {facetComponentSet: [
      ...[0, 1, 2, 3, 4].map(baseComponent => ({baseComponent})), s.component('enumeration', ['b'], false, false, builtin('NCName'))]});
    const built = s.build('source-copy', [peer]), left = built.context.lookup(peer.node.id), right = built.context.resolve(template.node.type);
    assert.equal(left.kind, 'found'); assert.equal(right.kind, 'found');
    expect(compareComponentProperties(built.context, left.node, right.node)).toMatchObject({kind: 'checked', value: true, scalarObligations: []});
    expect(built.forest.kind).toBe('checked-candidate'); assert.equal(built.forest.kind, 'checked-candidate');
    expect(built.forest.proof).toHaveLength(2);
    for (const context of [built.context, built.child]) expect(checkComponentConstruction(context, peer.node.id)).toMatchObject({kind: 'checked', obligations: []});
  });

  it('exports a completed authentic RAW facetBinding with opaque enum and exact union members', async () => {
    const s = await setup(), original: SemanticTypeReference = {kind: 'original-generated', owner: id('UnionA1')};
    const variety: RawSimpleTypeProperties['variety'] = {kind: 'union', members: [builtin('decimal'), builtin('string')]};
    const bound = s.scalar('bound', original, {facetBinding: {kind: 'original', type: original}}, variety);
    const peer = s.scalar('bound-keep', local(bound.node.id), {facetComponentSet: [{baseComponent: 0}, {baseComponent: 1}]}, variety);
    const built = s.build('raw-binding', [bound, peer]);
    expect(built.forest.kind).toBe('checked-candidate'); assert.equal(built.forest.kind, 'checked-candidate');
    expect(built.forest.proof).toHaveLength(2);
    for (const context of [built.context, built.child]) for (const {node} of [bound, peer])
      expect(checkComponentConstruction(context, node.id)).toMatchObject({kind: 'checked', obligations: []});
  });

  it.each(['List', 'Union'] as const)('retains %s GSC components and typed enum operands', async kind => {
    const s = await setup(), base: SemanticTypeReference = {kind: 'original-generated', owner: id(kind + 'A1')};
    const variety: RawSimpleTypeProperties['variety'] = kind === 'List' ? {kind: 'list', item: builtin('decimal')}
      : {kind: 'union', members: [builtin('decimal'), builtin('string')]};
    const accepted = kind === 'List' ? '1' : '2', excluded = kind === 'List' ? '1 2' : '1';
    const kernel = createSchemaScalarKernel(s.actual), description = kernel.describe(base, s.storage.id);
    assert.equal(description.kind, 'checked'); expect(description.obligations).toEqual([]);
    const groups = description.value.layers.filter(layer => layer.facets.length);
    const count = groups.filter(layer => !['pattern', 'enumeration'].includes(layer.facets[0].name)).length
      + groups.filter(layer => ['pattern', 'enumeration'].includes(layer.facets[0].name)).length;
    const keep = Array.from({length: count}, (_entry, baseComponent) => ({baseComponent}));
    for (const invalid of [false, true]) {
      const peer = s.scalar(kind + '-' + invalid, base, {facetComponentSet: [...keep,
        s.component('enumeration', [invalid ? excluded : accepted], false, false, local(id(kind)))]}, variety);
      const built = s.build(kind + '-' + invalid, [peer]);
      if (invalid) expect(built.forest).toMatchObject({kind: 'candidate-rejected', rule: 'enumeration-valid-restriction'});
      else {
        expect(built.forest.kind).toBe('checked-candidate'); assert.equal(built.forest.kind, 'checked-candidate');
        expect(built.forest.proof).toHaveLength(2);
        for (const context of [built.context, built.child]) expect(checkComponentConstruction(context, peer.node.id)).toMatchObject({kind: 'checked', obligations: []});
        const scalar = createSchemaScalarKernel(built.child);
        expect(scalar.assess(local(peer.node.id), {value: accepted, context: s.storage.context}, peer.node.id)).toMatchObject({kind: 'checked', obligations: []});
        expect(scalar.assess(local(peer.node.id), {value: excluded, context: s.storage.context}, peer.node.id)).toMatchObject({kind: 'invalid-schema'});
      }
    }
  });
});
