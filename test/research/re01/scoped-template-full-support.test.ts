/** A FULL scoped copy can match a current input template that is only PROPERTY-readable. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {checkSubstitution, checkTypeDerivation, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteProofStep, FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexContent, RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:scoped-cover-hidden-full';
const tid = (name: string) => globalId('type', {namespace, local: name});
const eid = (name: string, ns = namespace) => globalId('element', {namespace: ns, local: name});
const local = (target: string): Reference => ({kind: 'local', target});

async function subject() {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scoped-template-full-support.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, before = JSON.stringify(request.graph);
  const get = (context: SemanticContext, id: string): GraphNode => {
    const found = context.lookup(id); assert.equal(found.kind, 'found'); return found.node;
  };
  const complexAt = (context: SemanticContext, id: string): ComplexTypeNode => {
    const found = get(context, id); assert.equal(found.kind, 'complexType'); return found;
  };
  const fromCarrier = (name: string): ComplexTypeNode => {
    const carrier = get(actual, eid(name)); assert.equal(carrier.kind, 'element');
    const resolved = actual.resolve(carrier.type); assert.equal(resolved.kind, 'found');
    assert.equal(resolved.node.kind, 'complexType'); assert.equal(resolved.node.identity.kind, 'scoped'); return resolved.node;
  };
  const x = complexAt(actual, tid('X')), i = complexAt(actual, tid('I')), p = fromCarrier('pCarrier'), q = fromCarrier('qCarrier');
  const whole = deriveOriginalComplexParticle(actual, q.id); assert.equal(whole.kind, 'checked');
  const sourceSyntax = checkSchemaDocumentSyntax(actual), actualComponents = actual.members.map(id => checkComponentConstruction(actual, id));
  const common = {context: x.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const complex = (name: string, method: 'extension' | 'restriction', base: Reference): ComplexTypeNode => {
    const slot = '/hidden-full/' + name, owner = eid('pCarrier');
    return {...common, kind: 'complexType', id: hypotheticalScopedId(owner, slot, 'type'),
      identity: {kind: 'scoped', owner, path: slot, role: 'type'}, mixed: false, abstract: false, attributes: [],
      derivation: {kind: method, contentKind: 'complex', base, facets: []}};
  };
  const particle = (owner: string, slot: string, term: ParticleNode['term'], min = '1', max = '1'): ParticleNode => ({...common,
    kind: 'particle', id: hypotheticalScopedId(owner, slot, 'particle'), identity: {kind: 'scoped', owner, path: slot, role: 'particle'},
    occurs: {min, max}, term});
  const body = (owner: ComplexTypeNode, type: ComplexTypeNode) => {
    const slot = '/delta';
    const declaration: ElementNode = {...common, kind: 'element', id: hypotheticalScopedId(owner.id, slot, 'element'),
      identity: {kind: 'scoped', owner: owner.id, path: slot, role: 'element'}, name: {namespace: '', local: 'delta'},
      type: local(type.id), abstract: false, nillable: false};
    const any = particle(owner.id, '/any', {kind: 'any', wildcard: {namespace: {value: namespace, context: x.context}, processContents: 'lax'}});
    const leaf = particle(owner.id, '/local-delta', {kind: 'element', declaration: local(declaration.id)});
    const choice = particle(owner.id, '/content', {kind: 'choice', children: [any.id, leaf.id]}, '0', 'unbounded');
    return {node: {...owner, content: choice.id}, declaration, support: [declaration, any, leaf, choice]};
  };
  const row = (node: ComplexTypeNode, content?: RawComplexContent): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation!.kind, base: node.derivation!.base}, abstract: false, final: [], block: [], attributeUses: [],
    content: content ?? (node.content ? {kind: 'element-only', particle: node.content} : {kind: 'empty'}),
    provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
  const originalRows = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const mapped = deriveActualComplexContent(actual, node.id); assert.equal(mapped.kind, 'checked');
    if ('particle' in mapped.view.content) {
      const issued = deriveOriginalComplexParticle(actual, node.id); assert.equal(issued.kind, 'checked'); return [row(node, issued.content)];
    }
    return [row(node, mapped.view.content)];
  });
  const jBody = body(complex('J', 'extension', local(x.id)), p), j = jBody.node, z = complex('Z', 'extension', local(i.id));
  const retiredQ: ComplexTypeNode = {...q, derivation: {kind: 'restriction', contentKind: 'complex', base: local(j.id), facets: []}};
  const parentFresh: GraphNode[] = [j, z, ...jBody.support];
  const creator = request.candidate({key: 'creator-q', endpoint: retiredQ, active: [...actual.members, ...parentFresh.map(node => node.id)], additions: parentFresh,
    rawTypes: [...originalRows.filter(value => value.type !== q.id), row(retiredQ, whole.content), row(j), row(z)],
    rawElements: [{element: jBody.declaration.id, type: jBody.declaration.type, final: [], block: []}]});
  assert.equal(creator.kind, 'prepared'); const parent = creator.context;
  const rp = complex('rp', 'restriction', local(x.id)), rjBody = body(complex('rJ', 'extension', local(x.id)), rp), rj = rjBody.node;
  const rqBare = complex('rq', 'restriction', local(rj.id));
  const head = particle(rqBare.id, '/head', {kind: 'element', declaration: local(eid('H'))});
  const sequence = particle(rqBare.id, '/content', {kind: 'sequence', children: [head.id]});
  const rq: ComplexTypeNode = {...rqBare, content: sequence.id};
  const delta: ElementNode = {...common, context: {...x.context, effectiveNamespace: ''}, kind: 'element', id: eid('delta', ''),
    identity: {kind: 'global', role: 'element', name: {namespace: '', local: 'delta'}}, name: {namespace: '', local: 'delta'},
    type: local(rp.id), abstract: false, nillable: false, substitutionGroup: local(eid('H'))};
  const childFresh: GraphNode[] = [rp, rj, rq, delta, ...rjBody.support, head, sequence];
  const retiredZ: ComplexTypeNode = {...z, derivation: {kind: 'restriction', contentKind: 'complex', base: local(j.id), facets: []}};
  const built = forkSemanticCandidate(parent, {key: 'required-Z-child', endpoint: retiredZ,
    active: [...parent.members, ...childFresh.map(node => node.id)], additions: childFresh,
    rawTypes: [row(retiredZ), row(rp), row(rj), row(rq)],
    rawElements: [rjBody.declaration, delta].map(node => ({element: node.id, type: node.type, final: [], block: []}))});
  assert.equal(built.kind, 'prepared'); const child = built.context;
  const root: FiniteRe01EvidenceNode = {id: 'q', parent: actual, context: parent, target: q.id, intermediate: j.id, ancestor: local(x.id), premises: ['Z']};
  const nested: FiniteRe01EvidenceNode = {id: 'Z', parent, context: child, target: z.id, intermediate: j.id, ancestor: local(x.id), premises: []};
  const forest = verifyFiniteRe01Evidence(actual, q.id, {root: 'q', nodes: [root, nested]});
  const missing = verifyFiniteRe01Evidence(actual, q.id, {root: 'q', nodes: [{...root, premises: []}]});
  const semantic = (context: SemanticContext, id: string) => {
    const mapped = deriveRawComplexContent(context, id); assert.equal(mapped.kind, 'checked');
    const normalized = prepareSemanticParticleView(context, mapped.view, 'restriction'); assert.equal(normalized.kind, 'checked'); return normalized.view;
  };
  const states = [parent, child].map(context => ({context, pool: effectiveSubstitutionMembers(context, eid('H')),
    qFull: checkComponentConstruction(context, q.id), jFull: checkComponentConstruction(context, j.id),
    pFull: checkComponentConstruction(context, p.id), zFull: checkComponentConstruction(context, z.id), jView: semantic(context, j.id),
    qRestriction: checkParticleRestriction(context, semantic(context, q.id), semantic(context, j.id))}));
  return {actual, parent, child, x, p, q, j, z, rp, rj, rq, delta, jBody, rjBody, parentFresh, childFresh,
    sourceSyntax, actualComponents, forest, missing, states, sourceUnchanged: JSON.stringify(request.graph) === before,
    childTypes: [rq, rj, rp, delta].map(node => checkComponentConstruction(child, node.id)),
    affiliation: checkSubstitution(child, delta.id, eid('H'), {mode: 'affiliation'}),
    nominalRpToP: checkTypeDerivation(child, local(rp.id), local(p.id), ['extension']),
    rqRestriction: checkParticleRestriction(child, semantic(child, rq.id), semantic(child, rj.id)),
    properties: [[rp.id, p.id], [rj.id, j.id], [rq.id, q.id]].map(([left, right]) => compareComponentProperties(child, get(child, left!), get(child, right!)))};
}

let s: Awaited<ReturnType<typeof subject>>;
beforeAll(async () => {s = await subject();});

describe('scoped template PROPERTY and actual FULL support', () => {
  // Independently source-classified plan a7b11577; one supplied forest, not general cover extraction.
  it('checks the complete creator and required child with every inherited fresh root', () => {
    expect(s.sourceSyntax.kind).toBe('checked'); expect(s.sourceUnchanged).toBe(true);
    expect(s.actual.members).toHaveLength(9); expect(s.parent.members).toHaveLength(15); expect(s.child.members).toHaveLength(25);
    for (const receipt of s.actualComponents) {assert.equal(receipt.kind, 'checked'); expect(receipt.contextId).toBe(s.actual.contextId); expect(receipt.obligations).toEqual([]);}
    assert.equal(s.forest.kind, 'checked-candidate'); expect(s.forest.proof).toHaveLength(2);
    expect(new Set(s.forest.actualComponents.map(receipt => receipt.component))).toEqual(new Set(s.actual.members));
    for (const [index, state] of s.states.entries()) {
      const proof: FiniteProofStep | undefined = s.forest.proof.find(value => value.contextId === state.context.contextId); assert.ok(proof);
      expect(proof.components).toHaveLength(index === 0 ? 13 : 19);
      const checked = new Set(proof.components.map(value => value.component));
      for (const node of index === 0 ? s.parentFresh : [...s.parentFresh, ...s.childFresh]) expect(checked.has(node.id)).toBe(true);
      for (const receipt of proof.components) {
        expect(receipt.contextId).toBe(state.context.contextId); expect(receipt.obligations).toEqual([]);
        for (const dependency of receipt.typeDependencies) expect(dependency.contextId).toBe(state.context.contextId);
      }
      expect(checked.has(s.p.id)).toBe(true); expect(checked.has(s.q.id)).toBe(index === 0);
      expect(checked.has(eid('qCarrier'))).toBe(false); expect(proof.primitiveNoChange).toContain(s.j.id);
      expect(state.jView.root.summary.schemaEmptiable).toBe(true);
      for (const full of [state.jFull, state.pFull, state.zFull]) {assert.equal(full.kind, 'checked'); expect(full.obligations).toEqual([]);}
    }
    const child = s.states[1]; assert.ok(child); assert.equal(child.zFull.kind, 'checked'); expect(child.zFull.re01).toBeUndefined();
    expect(s.child.rawTypeProperties(s.z.id)?.derivation).toEqual({method: 'restriction', base: local(s.j.id)});
    expect(s.child.rawTypeProperties(s.j.id)?.derivation).toEqual({method: 'extension', base: local(s.x.id)});
    for (const node of [...s.parentFresh.filter(node => node.id !== s.z.id), s.q]) {
      expect(s.child.lookup(node.id)).toEqual(s.parent.lookup(node.id)); expect(s.child.rawTypeProperties(node.id)).toEqual(s.parent.rawTypeProperties(node.id));
    }
  });

  it('keeps current input q property-equal to FULL rq while q itself fails restriction 5.4', () => {
    const [parent, child] = s.states; assert.ok(parent && child);
    expect(parent.qFull.kind).toBe('checked'); expect(parent.qRestriction).toMatchObject({kind: 'checked', value: true});
    expect(child.qFull).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: s.q.id});
    expect(child.qRestriction).toMatchObject({kind: 'checked', value: false}); expect(s.rqRestriction).toMatchObject({kind: 'checked', value: true});
    for (const full of s.childTypes) {assert.equal(full.kind, 'checked'); expect(full.contextId).toBe(s.child.contextId); expect(full.obligations).toEqual([]);}
    for (const property of s.properties) {
      assert.equal(property.kind, 'checked'); expect(property.value).toBe(true); expect(property.obligations).toContain('component-validity');
      expect(property.typeDependencies).toEqual([]); expect(property.scalarObligations).toEqual([]);
    }
    expect(s.nominalRpToP).toMatchObject({kind: 'checked', value: false}); expect(s.affiliation).toMatchObject({kind: 'checked', value: true});
    expect(parent.pool).toMatchObject({kind: 'checked', value: [eid('H')]});
    assert.equal(child.pool.kind, 'checked'); expect(new Set(child.pool.value)).toEqual(new Set([eid('H'), s.delta.id]));
    expect(s.q.id).not.toBe(s.rq.id); expect(s.q.identity.kind).toBe('scoped'); expect(s.rq.identity.kind).toBe('scoped');
    expect(s.child.rawTypeProperties(s.q.id)?.derivation).toEqual({method: 'restriction', base: local(s.j.id)});
    expect(s.child.rawTypeProperties(s.rq.id)?.derivation).toEqual({method: 'restriction', base: local(s.rj.id)});
    for (const [body, owner, type] of [[s.jBody, s.j, s.p], [s.rjBody, s.rj, s.rp]] as const) {
      expect(body.declaration.identity).toMatchObject({kind: 'scoped', owner: owner.id});
      expect(body.declaration.name.namespace).toBe(''); expect(s.child.rawElementProperties(body.declaration.id)?.type).toEqual(local(type.id));
    }
    expect(s.delta.name.namespace).toBe(''); expect(s.delta.context.effectiveNamespace).toBe('');
    expect(s.child.rawElementProperties(s.delta.id)?.type).toEqual(local(s.rp.id));
  });

  it('requires the genuine Z child instead of accepting the creator alone', () => {
    expect(s.missing).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.z.id, contextId: s.parent.contextId});
  });
});
