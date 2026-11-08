/** Same-declaration value equality does not discharge full scalar validity. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {deriveActualComplexContent, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:scalar-premise-forwarding';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});

async function subject(wrapped: boolean, valid: boolean) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const prepared = prepareSourceSchemaRequest(await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-premise-forwarding-independent.xsd'), {policy: {fileRoots: [fixtures]}}));
  assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual;
  const source = actual.lookup(id('X')); assert.equal(source.kind, 'found'); assert.equal(source.node.kind, 'complexType');
  const endpoint: ComplexTypeNode = {...source.node, derivation: {kind: 'restriction', base: local(id('B')), contentKind: 'complex', facets: []}};
  const holder = (name: string, base: Reference): ComplexTypeNode => ({...endpoint, id: id(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, content: undefined,
    derivation: {kind: 'restriction', base, contentKind: 'complex', facets: []}});
  const h = holder('AliasH', local(id('AliasK'))), k = holder('AliasK', builtin('anyType'));
  const scalar: ComplexTypeNode = {...holder('AliasScalar', builtin('integer')),
    derivation: {kind: 'extension', base: builtin('integer'), contentKind: 'simple', facets: []}};
  const seed = request.graph.nodes.find((node): node is ElementNode => node.kind === 'element' && node.value !== undefined); assert.ok(seed?.value);
  const declaration: ElementNode = {...seed, id: scopedId(h.id, '/fixed', 'element'),
    identity: {kind: 'scoped', owner: h.id, path: '/fixed', role: 'element'}, type: local(scalar.id),
    value: {...seed.value, kind: 'fixed', lexical: {...seed.value.lexical, value: valid ? '01' : 'not-an-integer'}}};
  const particle = (name: string): ParticleNode => ({kind: 'particle', id: scopedId(h.id, name, 'particle'),
    identity: {kind: 'scoped', owner: h.id, path: name, role: 'particle'}, context: declaration.context,
    occurs: {min: '1', max: '1'}, term: {kind: 'element', declaration: local(declaration.id)},
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []});
  const p = particle('/p'), q = particle('/q');
  const wrapper = (name: string, child: ParticleNode): ParticleNode => ({...particle(name), term: {kind: 'sequence', children: [child.id]}});
  const s = wrapper('/s', p), t = wrapper('/t', p);
  const additions = [h, k, scalar, declaration, p, q, ...(wrapped ? [s, t] : [])];
  const rows: RawComplexTypeProperties[] = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const body = deriveActualComplexContent(actual, node.id), attrs = assessSourceAttributeUses(actual, node.id);
    assert.equal(body.kind, 'checked'); assert.equal(attrs.kind, 'checked');
    return [{type: node.id, targetNamespace: namespace, abstract: false, final: [], block: [], content: body.view.content,
      derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')},
      attributeUses: attrs.value.uses.map(use => use.id), wildcard: attrs.value.wildcard, provenance: {kind: 'actual-mapped', original: node.id}}];
  });
  const row = (node: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({type: node.id,
    targetNamespace: namespace, abstract: false, final: [], block: [], content, attributeUses: [],
    derivation: {method: node.derivation!.kind, base: node.derivation!.base}, provenance: {kind: 'hypothetical-abstract', originals: []}});
  const built = request.candidate({key: `fixed-reflexivity-${wrapped}-${valid}`, active: [...actual.members, ...additions.map(node => node.id)],
    additions, endpoint, rawTypes: [...rows.filter(row => row.type !== endpoint.id), row(endpoint, {kind: 'empty'}),
      row(h, {kind: 'element-only', particle: wrapped ? s.id : p.id}), row(k, {kind: 'element-only', particle: wrapped ? t.id : q.id}),
      row(scalar, {kind: 'simple', type: builtin('integer')})], rawElements: [{element: declaration.id, type: declaration.type, final: [], block: []}]});
  assert.equal(built.kind, 'prepared'); const context = built.context;
  const correspondence = checkCandidateCorrespondence(actual, actual, context, endpoint.id, id('B'), local(id('A'))); assert.equal(correspondence.kind, 'checked');
  const view = (type: string) => {
    const body = deriveRawComplexContent(context, type); assert.equal(body.kind, 'checked');
    const normalized = prepareSemanticParticleView(context, body.view, 'restriction'); assert.equal(normalized.kind, 'checked'); return normalized.view;
  };
  return {actual, context, correspondence, endpoint, additions, declaration, h, k, view};
}

describe('fixed declaration identity retains complete finite evidence duties', () => {
  it.each([false, true])('checks distinct normalized particles, wrapped=%s, while validating their common value', async wrapped => {
    const s = await subject(wrapped, true), derived = s.view(s.h.id), base = s.view(s.k.id);
    expect(derived.root.originalParticle).not.toBe(base.root.originalParticle);
    expect(checkParticleRestriction(s.context, derived, base)).toMatchObject({kind: 'checked', value: true});
    const result = verifyFiniteRe01Evidence(s.actual, s.endpoint.id, {root: 'X', nodes: [{id: 'X', parent: s.actual,
      context: s.context, target: s.endpoint.id, intermediate: id('B'), ancestor: local(id('A')), premises: []}]});
    assert.equal(result.kind, 'checked-candidate');
    const checked = new Set(result.proof[0].components.map(item => item.component));
    for (const node of s.additions) expect(checked.has(node.id)).toBe(true);
  });

  it('refuses an invalid common fixed value through full declaration and aggregate checks', async () => {
    const s = await subject(true, false);
    expect(checkParticleRestriction(s.context, s.view(s.h.id), s.view(s.k.id))).toMatchObject({kind: 'checked', value: true});
    expect(checkComponentConstruction(s.context, s.declaration.id, {correspondence: s.correspondence})).toMatchObject({
      kind: 'candidate-rejected', rule: 'cvc-datatype-valid', component: s.declaration.id});
    const result = verifyFiniteRe01Evidence(s.actual, s.endpoint.id, {root: 'X', nodes: [{id: 'X', parent: s.actual,
      context: s.context, target: s.endpoint.id, intermediate: id('B'), ancestor: local(id('A')), premises: []}]});
    expect(result).toMatchObject({kind: 'candidate-rejected', rule: 'cvc-datatype-valid', component: s.declaration.id});
  });
});
