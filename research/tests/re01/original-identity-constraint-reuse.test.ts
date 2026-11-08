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
import {checkIdentityConstraintFormation, originalIdentityConstraintId, readElementIdentityConstraints} from '../../../src/compiler/schemaIdentityConstraints.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:original-ic-no-owner';
const tid = (name: string) => globalId('type', {namespace, local: name});
const eid = (name: string, ns = namespace) => globalId('element', {namespace: ns, local: name});
const local = (target: string): Reference => ({kind: 'local', target});

async function subject() {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-ic-no-owner.xsd'), {policy: {fileRoots: [fixtures]}});
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
  const selectedIds = ['KR', 'K'].map(local => originalIdentityConstraintId({namespace, local}));
  const consumer: ElementNode = {...common, kind: 'element', id: eid('ICConsumer'),
    identity: {kind: 'global', role: 'element', name: {namespace, local: 'ICConsumer'}}, name: {namespace, local: 'ICConsumer'},
    type: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}}, abstract: false, nillable: false};
  const childFresh: GraphNode[] = [rp, rj, rq, delta, consumer, ...rjBody.support, head, sequence];
  const retiredZ: ComplexTypeNode = {...z, derivation: {kind: 'restriction', contentKind: 'complex', base: local(j.id), facets: []}};
  const built = forkSemanticCandidate(parent, {key: 'required-Z-child', endpoint: retiredZ,
    active: [...parent.members, ...childFresh.map(node => node.id)], additions: childFresh,
    rawTypes: [row(retiredZ), row(rp), row(rj), row(rq)],
    rawElements: [...[rjBody.declaration, delta].map(node => ({element: node.id, type: node.type, final: [] as const, block: [] as const})),
      {element: consumer.id, type: consumer.type, final: [], block: [], identityConstraints: selectedIds}]});
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
  return {actual, parent, child, x, p, q, j, z, rp, rj, rq, delta, jBody, rjBody, parentFresh, childFresh, consumer, selectedIds,
    sourceSyntax, actualComponents, forest, missing, states, sourceUnchanged: JSON.stringify(request.graph) === before,
    childTypes: [rq, rj, rp, delta].map(node => checkComponentConstruction(child, node.id)),
    affiliation: checkSubstitution(child, delta.id, eid('H'), {mode: 'affiliation'}),
    nominalRpToP: checkTypeDerivation(child, local(rp.id), local(p.id), ['extension']),
    rqRestriction: checkParticleRestriction(child, semantic(child, rq.id), semantic(child, rj.id)),
    properties: [[rp.id, p.id], [rj.id, j.id], [rq.id, q.id]].map(([left, right]) => compareComponentProperties(child, get(child, left!), get(child, right!)))};
}

let s: Awaited<ReturnType<typeof subject>>;
beforeAll(async () => {s = await subject();});
describe('authentic original IC reuse without a FULL source-owner premise', () => {
  // efb358bd/f4dc761f: IC identity has no semantic owner property. The genuine
  // hidden-FULL source geometry is independently classified in a7b11577.
  it('checks original Γ and both actual creator/child frontiers with all inherited fresh roots', () => {
    expect(s.sourceSyntax.kind).toBe('checked'); expect(s.sourceUnchanged).toBe(true);
    assert.equal(s.forest.kind, 'checked-candidate'); expect(s.forest.proof).toHaveLength(2);
    expect(new Set(s.forest.actualComponents.map(value => value.component))).toEqual(new Set(s.actual.members));
    expect(new Set(s.forest.actualIdentityConstraints.map(value => value.identity))).toEqual(new Set(s.selectedIds));
    for (const value of s.forest.actualIdentityConstraints) expect(value.contextId).toBe(s.actual.contextId);
    for (const [context, fresh] of [[s.parent, s.parentFresh], [s.child, [...s.parentFresh, ...s.childFresh]]] as const) {
      const proof: FiniteProofStep | undefined = s.forest.proof.find(value => value.contextId === context.contextId); assert.ok(proof);
      const checked = new Set(proof.components.map(value => value.component));
      for (const node of fresh) expect(checked.has(node.id)).toBe(true);
      for (const component of proof.components) {expect(component.contextId).toBe(context.contextId); expect(component.obligations).toEqual([]);}
      for (const constraint of proof.identityConstraints) expect(constraint.contextId).toBe(context.contextId);
    }
    const proof = s.forest.proof.find(value => value.contextId === s.child.contextId); assert.ok(proof);
    expect(new Set(proof.identityConstraints.map(value => value.identity))).toEqual(new Set(s.selectedIds));
  });

  it('forms keyrefs and selected unused elements while q and qCarrier stay outside FULL closure', () => {
    const source = s.child.lookup(eid('qCarrier')); assert.equal(source.kind, 'found');
    const properties = readElementIdentityConstraints(s.child, source.node.id); assert.equal(properties.kind, 'checked');
    expect(new Set(properties.value)).toEqual(new Set(s.selectedIds));
    for (const id of s.selectedIds) {
      const formed = checkIdentityConstraintFormation(s.child, id); assert.equal(formed.kind, 'checked');
      expect(formed.contextId).toBe(s.child.contextId);
      expect(formed.identityConstraintDependencies.every(value => s.selectedIds.includes(value.identity))).toBe(true);
    }
    const full = checkComponentConstruction(s.child, s.consumer.id); assert.equal(full.kind, 'checked');
    expect(full.dependencies).not.toContain(eid('qCarrier')); expect(full.dependencies).not.toContain(s.q.id);
    expect(full.identityConstraintDependencies.map(value => value.identity)).toEqual(s.selectedIds);
    expect(s.states[1].qFull).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: s.q.id});
    expect(checkComponentConstruction(s.child, eid('qCarrier'))).toMatchObject({kind: 'checked', dependencies: expect.arrayContaining([s.q.id])});
    for (const property of s.properties) expect(property).toMatchObject({kind: 'checked', value: true});
    assert.equal(s.forest.kind, 'checked-candidate'); const proof = s.forest.proof.find(value => value.contextId === s.child.contextId); assert.ok(proof);
    const checked = new Set(proof.components.map(value => value.component));
    expect(checked.has(eid('qCarrier'))).toBe(false); expect(checked.has(s.q.id)).toBe(false); expect(checked.has(s.p.id)).toBe(true);
    expect(s.missing).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.z.id});
  });

  it('checks a complete D/M construction with original IC sets, unused selected copies and zero-zero named ICs', async () => {
    const ns = 'urn:re01:original-ic', input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-identity-constraints.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared'); const {request} = prepared, actual = request.actual;
    const type = (name: string) => {
      const found = actual.lookup(globalId('type', {namespace: ns, local: name})); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
    };
    const x = type('X'), d = type('D');
    const name = {namespace: ns, local: 'M'}, m: ComplexTypeNode = {...x, id: globalId('type', name), identity: {kind: 'global', role: 'type', name},
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [], derivation: {kind: 'extension', contentKind: 'complex', base: local(x.id), facets: []}};
    const whole = deriveOriginalComplexParticle(actual, d.id); assert.equal(whole.kind, 'checked');
    const retired: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(m.id), facets: []}};
    const item = request.graph.nodes.find((node): node is ElementNode => node.kind === 'element' && node.name.local === 'item'); assert.ok(item);
    const selectedIds = ['K', 'KR'].map(local => originalIdentityConstraintId({namespace: ns, local}));
    const slot = '/unused-IC-copy', copy: ElementNode = {...item, id: hypotheticalScopedId(d.id, slot, 'element'),
      identity: {kind: 'scoped', owner: d.id, path: slot, role: 'element'}, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const raw = (node: ComplexTypeNode, content?: RawComplexContent): RawComplexTypeProperties => ({type: node.id, targetNamespace: ns,
      derivation: {method: node.derivation!.kind, base: node.derivation!.base}, abstract: false, final: [], block: [], attributeUses: [],
      content: content ?? {kind: 'empty'}, provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
    const built = request.candidate({key: 'D-M-IC', active: [...actual.members, m.id, copy.id], endpoint: retired, additions: [m, copy],
      rawTypes: [raw(x), raw(type('I')), raw(retired, whole.content), raw(m, whole.content)],
      rawElements: [{element: copy.id, final: [], block: [], identityConstraints: selectedIds}]}); assert.equal(built.kind, 'prepared');
    const result = verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [{id: 'D', parent: actual, context: built.context,
      target: d.id, intermediate: m.id, ancestor: local(x.id), premises: []}]});
    assert.equal(result.kind, 'checked-candidate'); expect(result.proof).toHaveLength(1);
    const all = ['K', 'KR', 'U', 'Zero'].map(local => originalIdentityConstraintId({namespace: ns, local}));
    expect(new Set(result.actualIdentityConstraints.map(value => value.identity))).toEqual(new Set(all));
    expect(new Set(result.proof[0].identityConstraints.map(value => value.identity))).toEqual(new Set(selectedIds.concat(originalIdentityConstraintId({namespace: ns, local: 'U'}))));
    expect(result.proof[0].components.map(value => value.component)).toEqual(expect.arrayContaining([copy.id, m.id, d.id]));
  });
});
