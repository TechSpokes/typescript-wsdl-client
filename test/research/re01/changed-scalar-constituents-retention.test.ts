import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkSubstitution} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:scalar:ordered-union-value-role';
const id = (name: string) => globalId('type', {namespace, local: name});
const eid = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
type Mode = 'keep' | 'wrong-guard' | 'new-enum' | 'unchanged-members';

async function setup(mode: Mode) {
  const loaded = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/changed-scalar-constituents-retention.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, graphBefore = JSON.stringify(request.graph);
  const get = (name: string): ComplexTypeNode => {
    const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const storage = get('RootA'), definition = {...storage.context, namespaces: {...storage.context.namespaces, '': 'urn:scalar:ns0', w: 'urn:scalar:wrong'}};
  const later = {...storage.context, namespaces: {...storage.context.namespaces, '': 'urn:scalar:ns1'}};
  const common = {context: definition, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const scalar = (name: string, base: Reference): SimpleTypeNode => ({...common, kind: 'simpleType', id: id(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, variety: {kind: 'restriction', base, facets: []}});
  const guard = scalar('GuardQName', builtin('QName')), result = scalar('S', local(id('A'))), alias = scalar('Alias', local(id('A')));
  const scalars: RawSimpleTypeProperties[] = [
    {type: guard.id, base: builtin('QName'), targetNamespace: namespace, final: [], variety: {kind: 'atomic'}, facetComponentSet: [{annotation: 'absent', facets: [
      {name: 'enumeration', fixed: false, lexical: {value: 'foo', context: mode === 'wrong-guard'
        ? {...definition, namespaces: {...definition.namespaces, '': 'urn:scalar:wrong'}} : definition},
      operand: {type: builtin('QName'), owner: storage.id, context: 'original'}}]}], provenance: {kind: 'hypothetical-abstract', originals: []}},
    {type: result.id, base: local(id('A')), targetNamespace: namespace, final: [], variety: {kind: 'union', members: [local(guard.id), builtin('string')]},
      facetComponentSet: [{baseComponent: 0}, ...(mode === 'new-enum' ? [{annotation: 'absent' as const, facets: [{name: 'enumeration', fixed: false,
        lexical: {value: 'foo', context: later}, operand: {type: builtin('string'), owner: storage.id, context: 'original' as const}}]}] : [])],
      provenance: {kind: 'hypothetical-abstract', originals: []}},
    {type: alias.id, base: local(id('A')), targetNamespace: namespace, final: [], variety: {kind: 'union', members: [builtin('QName'), builtin('string')]},
      facetComponentSet: [{baseComponent: 0}], provenance: {kind: 'hypothetical-abstract', originals: []}},
  ];
  const member: ElementNode = {...common, context: later, kind: 'element', id: eid('x'),
    identity: {kind: 'global', role: 'element', name: {namespace, local: 'x'}}, name: {namespace, local: 'x'},
    type: local(mode === 'unchanged-members' ? alias.id : result.id), abstract: false, nillable: false, substitutionGroup: local(eid('Q')),
    value: {kind: 'fixed', lexical: {value: 'foo', context: later}}};
  const holder: ComplexTypeNode = {...common, kind: 'complexType', id: id('Holder'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'Holder'}},
    abstract: false, mixed: false, attributes: [], derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('ValueTarget')), facets: []}};
  const particle: ParticleNode = {...common, kind: 'particle', id: hypotheticalScopedId(holder.id, '/value', 'particle'),
    identity: {kind: 'scoped', owner: holder.id, path: '/value', role: 'particle'}, occurs: {min: '1', max: '1'}, term: {kind: 'element', declaration: local(member.id)}};
  const endpoint: ComplexTypeNode = {...get('RootD'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('RootB')), facets: []}};
  const originals: RawComplexTypeProperties[] = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const content = deriveActualComplexContent(actual, node.id); assert.equal(content.kind, 'checked');
    const whole = 'particle' in content.view.content ? deriveOriginalComplexParticle(actual, node.id) : undefined;
    if (whole) assert.equal(whole.kind, 'checked');
    return [{type: node.id, targetNamespace: namespace, derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')},
      content: whole?.kind === 'checked' ? whole.content : content.view.content, attributeUses: [], abstract: false, final: [], block: [],
      provenance: {kind: 'hypothetical-abstract', originals: [node.id]}}];
  });
  const additions: GraphNode[] = [guard, result, alias, member, {...holder, content: particle.id}, particle];
  const built = request.candidate({key: mode, active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint, rawSimpleTypes: scalars,
    rawElements: [{element: member.id, type: member.type, final: [], block: []}], rawTypes: [...originals.filter(row => row.type !== endpoint.id),
      {...originals.find(row => row.type === endpoint.id)!, derivation: {method: 'restriction', base: local(id('RootB'))}},
      {type: holder.id, targetNamespace: namespace, derivation: {method: 'restriction', base: local(id('ValueTarget'))}, abstract: false, final: [], block: [],
        content: {kind: 'element-only', particle: particle.id}, attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}}]});
  assert.equal(built.kind, 'prepared'); const context = built.context;
  const view = (type: string) => {
    const content = deriveRawComplexContent(context, type); assert.equal(content.kind, 'checked');
    const prepared = prepareSemanticParticleView(context, content.view, 'restriction'); assert.equal(prepared.kind, 'checked'); return prepared.view;
  };
  const forest = verifyFiniteRe01Evidence(actual, endpoint.id, {root: mode, nodes: [{id: mode, parent: actual, context,
    target: endpoint.id, intermediate: id('RootB'), ancestor: local(id('RootA')), premises: []}]});
  return {request, actual, context, graphBefore, storage, definition, later, scalar, guard, result, alias, member, holder, additions, forest, view};
}

describe('retained BASE components with narrowed scalar constituents', () => {
  it.each(['keep', 'wrong-guard', 'new-enum', 'unchanged-members'] as const)('keeps ordinary F2 and fixed VALUE evidence for %s', async mode => {
    const s = await setup(mode), kernel = createSchemaScalarKernel(s.context);
    for (const type of s.actual.members) expect(checkComponentConstruction(s.actual, type)).toMatchObject({kind: 'checked', obligations: []});
    expect(checkComponentConstruction(s.context, s.guard.id)).toMatchObject({kind: 'checked', obligations: []});
    if (mode === 'wrong-guard' || mode === 'new-enum') {
      // The wrong guard widens the own-map image. The NEW enum instead fails
      // genuine BASE qualification at its supplied facet map, even with an empty own-map image.
      const rule = mode === 'new-enum' ? 'enumeration-valid-restriction' : 'scalar-value-space-restriction';
      expect(checkComponentConstruction(s.context, s.result.id)).toMatchObject({kind: 'candidate-rejected', rule});
      expect(s.forest).toMatchObject({kind: 'candidate-rejected', rule});
    } else {
      for (const type of [s.result.id, s.alias.id, s.member.id]) expect(checkComponentConstruction(s.context, type)).toMatchObject({kind: 'checked', obligations: []});
      for (const [type, family] of [['A', 'QName'], ['S', 'string'], ['Alias', 'QName']] as const)
        expect(kernel.assess(local(id(type)), {value: 'foo', context: s.later}, s.storage.id)).toMatchObject({kind: 'checked', obligations: [], value: {operand: {family}}});
      expect(checkSubstitution(s.context, s.member.id, eid('H'), {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: false});
      expect(checkSubstitution(s.context, s.member.id, eid('Q'), {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: true});
      expect(checkComponentConstruction(s.context, id('Observer'))).toMatchObject({kind: 'checked', obligations: []});
      expect(checkParticleRestriction(s.context, s.view(s.holder.id), s.view(id('ValueTarget')))).toMatchObject({kind: 'checked', value: mode === 'keep'});
      if (mode === 'keep') {
        expect(s.forest.kind).toBe('checked-candidate'); assert.equal(s.forest.kind, 'checked-candidate');
        expect(s.forest.proof).toHaveLength(1);
        for (const component of s.additions.filter(node => node.kind !== 'particle'))
          expect(checkComponentConstruction(s.context, component.id)).toMatchObject({kind: 'checked', obligations: []});
        expect(new Set(s.forest.actualComponents.map(receipt => receipt.component))).toEqual(new Set(s.actual.members));
        for (const type of [s.guard.id, s.result.id, s.alias.id, s.member.id, s.holder.id])
          expect(s.forest.proof[0].components).toEqual(expect.arrayContaining([expect.objectContaining({component: type, obligations: []})]));
      } else expect(s.forest).toMatchObject({kind: 'candidate-rejected', component: s.holder.id});
    }
    expect(JSON.stringify(s.request.graph)).toBe(s.graphBefore);
  });

  it('rejects an incompatible LIST item independently of a valid BASE component selector', async () => {
    const s = await setup('keep'), peer = s.scalar('BadListItem', local(id('ListBase')));
    const built = s.request.candidate({key: 'bad-list', active: [...s.actual.members, peer.id], additions: [peer], rawSimpleTypes: [{type: peer.id,
      base: local(id('ListBase')), targetNamespace: namespace, final: [], variety: {kind: 'list', item: builtin('QName')}, facetComponentSet: [{baseComponent: 0}],
      provenance: {kind: 'hypothetical-abstract', originals: []}}]}); assert.equal(built.kind, 'prepared');
    expect(checkComponentConstruction(built.context, peer.id)).toMatchObject({kind: 'candidate-rejected', rule: 'cos-st-restricts'});
    expect(JSON.stringify(s.request.graph)).toBe(s.graphBefore);
  });
});
