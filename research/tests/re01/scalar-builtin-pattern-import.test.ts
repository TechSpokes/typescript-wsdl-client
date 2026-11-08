import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {createSchemaScalarKernel, compareSchemaFacetProperties} from '../../../src/compiler/schemaScalarKernel.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {checkTypeDerivation} from '../../../src/compiler/schemaTypeRelations.js';
import {projectFacetAnnotation} from '../../../src/compiler/schemaFacetAnnotation.js';
import type {FacetAnnotation} from '../../../src/compiler/schemaFacetAnnotation.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawFacetComponentEntry, RawScalarFacetComponent, RawSimpleFacetInput, RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:scalar:template-intrinsic-mix', xs = 'http://www.w3.org/2001/XMLSchema';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: xs, local: name}});

async function setup() {
  const loaded = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-builtin-pattern-import.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, graphBefore = JSON.stringify(request.graph);
  const complex = (name: string): ComplexTypeNode => {
    const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const storage = complex('RootA'), common = {context: storage.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const scalar = (name: string, base: Reference, input: RawSimpleFacetInput) => {
    const key = '/' + name, type = hypotheticalScopedId(storage.id, key, 'type');
    const node: SimpleTypeNode = {...common, kind: 'simpleType', id: type, identity: {kind: 'scoped', owner: storage.id, path: key, role: 'type'},
      variety: {kind: 'restriction', base, facets: []}};
    const row: RawSimpleTypeProperties = {type, base, targetNamespace: namespace, final: [], variety: {kind: 'atomic'}, ...input,
      provenance: {kind: 'hypothetical-abstract', originals: []}};
    return {node, row};
  };
  const component = (name: string, value: string, annotation: FacetAnnotation = 'absent'): RawScalarFacetComponent => ({annotation,
    facets: [{name, fixed: false, lexical: {value, context: storage.context}, ...(name === 'enumeration'
      ? {operand: {context: 'original' as const, type: builtin('string'), owner: storage.id}} : {})}]});
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace, abstract: false, final: [], block: [], attributeUses: [],
    content: {kind: 'empty'}, derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')},
    provenance: {kind: 'hypothetical-abstract', originals: []}});
  const endpoint: ComplexTypeNode = {...complex('RootD'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('RootB')), facets: []}};
  const full = (context: SemanticContext) => {
    for (const type of context.members) expect(checkComponentConstruction(context, type)).toMatchObject({kind: 'checked', obligations: []});
  };
  const finish = (context: SemanticContext) => {
    expect(context.budget.usage().work).toBeLessThan(125_000_000);
    expect(JSON.stringify(request.graph)).toBe(graphBefore);
  };
  full(actual);
  return {request, actual, storage, common, complex, scalar, component, raw, endpoint, full, finish};
}

it('combines actual BASE KEEP with NEW builtin patterns and preserves the copy through a complete three-node forest', async () => {
  const s = await setup(), source = s.actual.lookup(id('C'));
  assert.equal(source.kind, 'found'); assert.equal(source.node.kind, 'simpleType'); assert.equal(source.node.variety.kind, 'restriction');
  const enumSyntax = source.node.variety.facets.find(facet => facet.name === 'enumeration')?.syntax;
  assert.ok(enumSyntax); const annotation = enumSyntax.children.find(node => node.kind === 'element' && node.name.local === 'annotation');
  assert.ok(annotation); assert.equal(annotation.kind, 'element');
  const payload = projectFacetAnnotation(annotation, s.actual.budget);
  const aPrime = s.scalar('a-prime', builtin('string'), {facetComponentSet: [s.component('whiteSpace', 'collapse'), s.component('enumeration', 'a', payload), s.component('pattern', 'b')]}),
    b = s.scalar('b', builtin('string'), {facetComponentSet: [s.component('whiteSpace', 'collapse'), s.component('enumeration', 'a'), s.component('pattern', 'b')]}),
    template = s.scalar('template', local(aPrime.node.id), {facetBinding: {kind: 'original', type: local(id('C'))}});
  const childPath = '/child', childNode: ComplexTypeNode = {...s.common, kind: 'complexType', id: hypotheticalScopedId(s.storage.id, childPath, 'type'),
    identity: {kind: 'scoped', owner: s.storage.id, path: childPath, role: 'type'}, abstract: false, mixed: false, attributes: [],
    derivation: {kind: 'extension', contentKind: 'complex', base: local(id('RootB')), facets: []}};
  const additions = [aPrime.node, b.node, template.node, childNode];
  const parent = s.request.candidate({key: 'input', active: [...s.actual.members, ...additions.map(node => node.id)], additions, endpoint: s.endpoint,
    rawSimpleTypes: [aPrime.row, b.row, template.row], rawTypes: [...['RootA', 'RootB', 'RootR'].map(name => s.raw(s.complex(name))), s.raw(s.endpoint), s.raw(childNode)]});
  assert.equal(parent.kind, 'prepared'); s.full(parent.context);
  const left = parent.context.lookup(aPrime.node.id), right = parent.context.lookup(b.node.id), target = parent.context.lookup(template.node.id);
  assert.equal(left.kind, 'found'); assert.equal(right.kind, 'found'); assert.equal(target.kind, 'found');
  expect(compareComponentProperties(parent.context, left.node, right.node)).toMatchObject({kind: 'checked', value: true});
  expect(compareComponentProperties(parent.context, right.node, target.node)).toMatchObject({kind: 'checked', value: false});
  expect(checkTypeDerivation(parent.context, local(template.node.id), local(b.node.id), [])).toMatchObject({kind: 'checked', value: false});
  const plan = createSchemaScalarKernel(parent.context).describe(local(template.node.id), s.storage.id); assert.equal(plan.kind, 'checked');
  expect(new Set(plan.value.layers.flatMap(layer => layer.facets.filter(facet => facet.name === 'pattern').map(facet => facet.lexical.value))))
    .toEqual(new Set(['\\i\\c*', '[\\i-[:]][\\c-[:]]*', 'b']));
  for (const mode of ['baseline', 'binding', 'literal', 'import'] as const) {
    const peer = s.scalar('copy-' + mode, local(b.node.id), mode === 'binding' ? {facetBinding: {kind: 'original', type: local(id('C'))}}
      : {facetComponentSet: [{baseComponent: 0}, {baseComponent: 1}, {baseComponent: 2}, ...(mode === 'import'
        ? [{builtinPattern: {name: 'NCName', index: 0}}, {builtinPattern: {name: 'NCName', index: 1}}]
        : [s.component('pattern', '\\i\\c*'), s.component('pattern', '[\\i-[:]][\\c-[:]]*')])]});
    const laterPath = '/later', laterNode: ComplexTypeNode = {...childNode, id: hypotheticalScopedId(s.storage.id, laterPath, 'type'),
      identity: {kind: 'scoped', owner: s.storage.id, path: laterPath, role: 'type'}};
    const next = forkSemanticCandidate(parent.context, {key: mode, active: [...parent.context.members, ...(mode === 'baseline' ? [] : [peer.node.id]), ...(mode === 'import' ? [laterNode.id] : [])],
      endpoint: {...childNode, derivation: {...childNode.derivation!, kind: 'restriction'}}, additions: mode === 'baseline' ? [] : mode === 'import' ? [peer.node, laterNode] : [peer.node],
      rawTypes: [{...s.raw(childNode), derivation: {method: 'restriction', base: local(id('RootB'))}}, ...(mode === 'import' ? [s.raw(laterNode)] : [])],
      rawSimpleTypes: mode === 'baseline' ? [] : [peer.row]}); assert.equal(next.kind, 'prepared');
    if (mode === 'import') {
      s.full(next.context);
      const alias = s.scalar('keep-import', local(peer.node.id), {facetComponentSet: [0, 1, 2, 3, 4].map(baseComponent => ({baseComponent}))});
      const later = forkSemanticCandidate(next.context, {key: 'keep-import', active: [...next.context.members, alias.node.id], additions: [alias.node],
        endpoint: {...laterNode, derivation: {...laterNode.derivation!, kind: 'restriction'}}, rawSimpleTypes: [alias.row],
        rawTypes: [{...s.raw(laterNode), derivation: {method: 'restriction', base: local(id('RootB'))}}]}); assert.equal(later.kind, 'prepared'); s.full(later.context);
      const copy = later.context.lookup(peer.node.id), old = later.context.lookup(template.node.id); assert.equal(copy.kind, 'found'); assert.equal(old.kind, 'found');
      expect(compareComponentProperties(later.context, copy.node, old.node)).toMatchObject({kind: 'checked', value: true, scalarObligations: []});
      expect(checkTypeDerivation(later.context, local(peer.node.id), local(b.node.id), [])).toMatchObject({kind: 'checked', value: true});
      expect(compareSchemaFacetProperties(next.context, local(peer.node.id), peer.node.id, later.context, local(peer.node.id), peer.node.id))
        .toMatchObject({kind: 'checked', value: true, annotationCorrespondence: 'equal'});
      expect(compareSchemaFacetProperties(later.context, local(peer.node.id), peer.node.id, later.context, local(template.node.id), template.node.id))
        .toMatchObject({kind: 'checked', value: true, annotationCorrespondence: 'different'});
      const proof: ReturnType<typeof verifyFiniteRe01Evidence> = verifyFiniteRe01Evidence(s.actual, s.endpoint.id, {root: 'root', nodes: [{id: 'root', parent: s.actual, context: parent.context,
        target: s.endpoint.id, intermediate: id('RootB'), ancestor: local(id('RootA')), premises: ['child']}, {id: 'child', parent: parent.context, context: next.context,
        target: childNode.id, intermediate: id('RootB'), ancestor: local(id('RootA')), premises: ['later']}, {id: 'later', parent: next.context, context: later.context,
        target: laterNode.id, intermediate: id('RootB'), ancestor: local(id('RootA')), premises: []}]});
      assert.equal(proof.kind, 'checked-candidate'); expect(proof.proof).toHaveLength(3);
    } else {
      const proof: ReturnType<typeof verifyFiniteRe01Evidence> = verifyFiniteRe01Evidence(s.actual, s.endpoint.id, {root: 'root', nodes: [{id: 'root', parent: s.actual, context: parent.context,
        target: s.endpoint.id, intermediate: id('RootB'), ancestor: local(id('RootA')), premises: ['child']}, {id: 'child', parent: parent.context, context: next.context,
        target: childNode.id, intermediate: id('RootB'), ancestor: local(id('RootA')), premises: []}]});
      const expected = mode === 'binding' ? {kind: 'candidate-rejected', rule: 'enumeration-valid-restriction'}
        : {kind: 'unsupported-capability', rule: 'pattern-subset'};
      if (mode === 'baseline') {assert.equal(proof.kind, 'checked-candidate'); expect(proof.proof).toHaveLength(2);}
      else {expect(checkComponentConstruction(next.context, peer.node.id)).toMatchObject(expected); expect(proof).toMatchObject(expected);}
    }
  }
  s.finish(parent.context);
});

it('forms real GLOBAL builtin-name shadows without merging their nominal identities', async () => {
  const s = await setup();
  const shadow = (name: string, base: Reference) => {
    const type = globalId('type', {namespace: xs, local: name});
    const node: SimpleTypeNode = {...s.common, kind: 'simpleType', id: type, identity: {kind: 'global', role: 'type', name: {namespace: xs, local: name}},
      variety: {kind: 'restriction', base, facets: []}};
    const row: RawSimpleTypeProperties = {type, targetNamespace: xs, base, final: [], variety: {kind: 'atomic'},
      facetComponentSet: name === 'Name' ? [{baseComponent: 0}, {builtinPattern: {name: 'Name', index: 0}}]
        : [{baseComponent: 0}, {baseComponent: 1}, {builtinPattern: {name: 'NCName', index: 1}}], provenance: {kind: 'hypothetical-abstract', originals: []}};
    return {name, node, row};
  };
  const name = shadow('Name', builtin('token')), ncname = shadow('NCName', local(name.node.id));
  const wrapper = (label: string, type: Reference) => {
    const key = '/' + label, typeId = hypotheticalScopedId(s.storage.id, key, 'type');
    const node: ComplexTypeNode = {...s.common, kind: 'complexType', id: typeId, identity: {kind: 'scoped', owner: s.storage.id, path: key, role: 'type'},
      mixed: false, abstract: false, attributes: [], derivation: {kind: 'extension', contentKind: 'simple', base: type, facets: []}};
    const row: RawComplexTypeProperties = {...s.raw(node), content: {kind: 'simple', type}};
    return {node, row};
  };
  const pairs = [name, ncname].map(entry => ({entry, shadow: wrapper('shadow-' + entry.name, local(entry.node.id)), builtin: wrapper('builtin-' + entry.name, builtin(entry.name))}));
  const additions = [name.node, ncname.node, ...pairs.flatMap(pair => [pair.shadow.node, pair.builtin.node])];
  const built = s.request.candidate({key: 'builtin-name-shadow', active: [...s.actual.members, ...additions.map(node => node.id)], additions, endpoint: s.endpoint,
    rawSimpleTypes: [name.row, ncname.row], rawTypes: [...['RootA', 'RootB', 'RootR'].map(label => s.raw(s.complex(label))), s.raw(s.endpoint),
      ...pairs.flatMap(pair => [pair.shadow.row, pair.builtin.row])]}); assert.equal(built.kind, 'prepared'); s.full(built.context);
  for (const pair of pairs) {
    const left = built.context.lookup(pair.shadow.node.id), right = built.context.lookup(pair.builtin.node.id); assert.equal(left.kind, 'found'); assert.equal(right.kind, 'found');
    expect(compareComponentProperties(built.context, left.node, right.node)).toMatchObject({kind: 'checked', value: true, scalarObligations: []});
    expect(checkTypeDerivation(built.context, local(pair.entry.node.id), builtin(pair.entry.name), [])).toMatchObject({kind: 'checked', value: false});
  }
  const proof = verifyFiniteRe01Evidence(s.actual, s.endpoint.id, {root: 'root', nodes: [{id: 'root', parent: s.actual, context: built.context,
    target: s.endpoint.id, intermediate: id('RootB'), ancestor: local(id('RootA')), premises: []}]}); assert.equal(proof.kind, 'checked-candidate'); expect(proof.proof).toHaveLength(1);
  s.finish(built.context);
});

it('rejects forged or invalid imports and replays a NEW import-only component through a genuine KEEP fork', async () => {
  const s = await setup();
  const cases = [
    ['unknown', {builtinPattern: {name: 'Missing', index: 0}}, 'src-resolve'],
    ['no-pattern', {builtinPattern: {name: 'decimal', index: 0}}, 'raw-builtin-pattern-component'],
    ['complex', {builtinPattern: {name: 'anyType', index: 0}}, 'src-simple-type'],
    ['item-not-own', {builtinPattern: {name: 'NMTOKENS', index: 0}}, 'raw-builtin-pattern-component'],
    ['bad-index', {builtinPattern: {name: 'Name', index: 1}}, 'raw-builtin-pattern-component'],
    ['negative-index', {builtinPattern: {name: 'Name', index: -1}}, 'representation'],
    ['forged', {...s.component('pattern', '\\i\\c*'), intrinsicPattern: true}, 'pattern-subset'],
    ['mixed', {...s.component('pattern', '\\i\\c*'), builtinPattern: {name: 'Name', index: 0}}, 'representation'],
    ['annotation', {builtinPattern: {name: 'Name', index: 0}, annotation: 'absent'}, 'representation'],
  ] satisfies readonly (readonly [string, RawFacetComponentEntry & {intrinsicPattern?: boolean}, string])[];
  for (const [label, component, rule] of cases) {
    const scalar = s.scalar(label, builtin('string'), {facetComponentSet: [component]});
    const candidate = s.request.candidate({key: label, active: [...s.actual.members, scalar.node.id], additions: [scalar.node], rawSimpleTypes: [scalar.row]});
    if (rule === 'representation') {expect(candidate).toMatchObject({kind: 'candidate-rejected', code: rule}); continue;}
    assert.equal(candidate.kind, 'prepared');
    expect(checkComponentConstruction(candidate.context, scalar.node.id)).toMatchObject({kind: label === 'forged' ? 'unsupported-capability' : 'candidate-rejected', rule});
  }
  const union = s.scalar('ur-union', builtin('anySimpleType'), {facetComponentSet: [{builtinPattern: {name: 'Name', index: 0}}]});
  const rejected = s.request.candidate({key: 'ur-union', active: [...s.actual.members, union.node.id], additions: [union.node],
    rawSimpleTypes: [{...union.row, variety: {kind: 'union', members: [builtin('string')]}}]}); assert.equal(rejected.kind, 'prepared');
  expect(checkComponentConstruction(rejected.context, union.node.id)).toMatchObject({kind: 'candidate-rejected', rule: 'cos-st-restricts'});
  const only = s.scalar('only-import', builtin('string'), {facetComponentSet: [{builtinPattern: {name: 'Name', index: 0}}]});
  const parent = s.request.candidate({key: 'only-import', active: [...s.actual.members, only.node.id], additions: [only.node], rawSimpleTypes: [only.row]});
  assert.equal(parent.kind, 'prepared');
  const alias = s.scalar('keep-only-import', local(only.node.id), {facetComponentSet: [{baseComponent: 0}]});
  const child = forkSemanticCandidate(parent.context, {key: 'keep-only-import', active: [...parent.context.members, alias.node.id], additions: [alias.node], rawSimpleTypes: [alias.row]});
  assert.equal(child.kind, 'prepared'); s.full(parent.context); s.full(child.context);
  expect(compareSchemaFacetProperties(parent.context, local(only.node.id), only.node.id, child.context, local(only.node.id), only.node.id))
    .toMatchObject({kind: 'checked', value: true, annotationCorrespondence: 'equal'});
  const plan = createSchemaScalarKernel(child.context).describe(local(alias.node.id), s.storage.id); assert.equal(plan.kind, 'checked');
  expect(JSON.stringify(plan.value.layers.map(layer => layer.facets.map(facet => ({name: facet.name, lexical: facet.lexical})))))
    .toBe(JSON.stringify([[{name: 'pattern', lexical: {value: '\\i\\c*', context: s.storage.context}}]]));
  s.finish(child.context);
});
