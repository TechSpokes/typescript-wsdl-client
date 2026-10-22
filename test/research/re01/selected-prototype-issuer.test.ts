/** Supplied initial section, genuine first-birth allocation and native current-H checks. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId, semanticIdentityTuple} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexContent, RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import {prepareSelectedPrototypes} from './selected-prototype-issuer.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:scoped-cover-hidden-full';
const local = (target: string): Reference => ({kind: 'local', target});
const tid = (name: string) => globalId('type', {namespace, local: name});

async function subject() {
  const source = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scoped-template-full-support.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(source); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, sourceBefore = JSON.stringify(request.graph);
  const get = (context: SemanticContext, id: string): GraphNode => {const found = context.lookup(id); assert.equal(found.kind, 'found'); return found.node;};
  const x = get(actual, tid('X')); assert.equal(x.kind, 'complexType');
  const qCarrier = get(actual, globalId('element', {namespace, local: 'qCarrier'})); assert.equal(qCarrier.kind, 'element');
  const qFound = actual.resolve(qCarrier.type); assert.equal(qFound.kind, 'found'); assert.equal(qFound.node.kind, 'complexType'); const q = qFound.node;
  const whole = deriveOriginalComplexParticle(actual, q.id); assert.equal(whole.kind, 'checked');
  const common = {context: x.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const complex = (name: string, method: 'extension' | 'restriction', base: Reference): ComplexTypeNode => ({...common,
    kind: 'complexType', id: hypotheticalScopedId(x.id, '/' + name, 'type'), identity: {kind: 'scoped', owner: x.id, path: '/' + name, role: 'type'},
    mixed: false, abstract: false, attributes: [], derivation: {kind: method, contentKind: 'complex', base, facets: []}});
  const particle = (name: string, term: ParticleNode['term'], min = '1', max = '1'): ParticleNode => ({...common, kind: 'particle',
    id: hypotheticalScopedId(x.id, '/' + name, 'particle'), identity: {kind: 'scoped', owner: x.id, path: '/' + name, role: 'particle'}, occurs: {min, max}, term});
  const j1Bare = complex('J1', 'extension', local(x.id)), j2Bare = complex('J2', 'extension', local(x.id));
  const u1Bare = complex('U1', 'extension', local(j1Bare.id)), u2Bare = complex('U2', 'extension', local(j2Bare.id));
  const declaration = (owner: string, name: string, type: Reference): ElementNode => ({...common, kind: 'element',
    id: hypotheticalScopedId(owner, '/same-slot', 'element'), identity: {kind: 'scoped', owner, path: '/same-slot', role: 'element'},
    name: {namespace: '', local: name}, type, abstract: false, nillable: false});
  const d1 = declaration(j1Bare.id, 'x', local(u2Bare.id)), d2 = declaration(j2Bare.id, 'y', local(u1Bare.id));
  const a = particle('any', {kind: 'any', wildcard: {namespace: {value: namespace, context: x.context}, processContents: 'skip'}});
  const p1 = particle('x', {kind: 'element', declaration: local(d1.id)}), p2 = particle('y', {kind: 'element', declaration: local(d2.id)});
  const body = particle('shared', {kind: 'choice', children: [a.id, p1.id, p2.id]}, '0', 'unbounded');
  const j1 = {...j1Bare, content: body.id}, j2 = {...j2Bare, content: body.id}, u1 = {...u1Bare, content: body.id}, u2 = {...u2Bare, content: body.id};
  const row = (node: ComplexTypeNode, content?: RawComplexContent): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation!.kind, base: node.derivation!.base}, abstract: false, final: [], block: [], attributeUses: [],
    content: content ?? (node.content ? {kind: 'element-only', particle: node.content} : {kind: 'empty'}),
    provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
  const originalRows = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const content = deriveActualComplexContent(actual, node.id); assert.equal(content.kind, 'checked');
    if ('particle' in content.view.content) {const original = deriveOriginalComplexParticle(actual, node.id); assert.equal(original.kind, 'checked'); return [row(node, original.content)];}
    return [row(node, content.view.content)];
  });
  const fresh: GraphNode[] = [j1, j2, u1, u2, d1, d2, a, p1, p2, body];
  const endpoint: ComplexTypeNode = {...q, derivation: {kind: 'restriction', contentKind: 'complex', base: local(j1.id), facets: []}};
  const donorBuilt = request.candidate({key: 'donor', endpoint, active: [...actual.members, ...fresh.map(node => node.id)], additions: fresh,
    rawTypes: [...originalRows.filter(item => item.type !== q.id), row(endpoint, whole.content), ...[j1, j2, u1, u2].map(node => row(node))],
    rawElements: [d1, d2].map(node => ({element: node.id, type: node.type, final: [], block: []}))});
  assert.equal(donorBuilt.kind, 'prepared'); const donor = donorBuilt.context;
  const section = new Map([[j1.id, j1.id], [j2.id, j1.id], [u1.id, u1.id], [u2.id, u1.id]]);
  const issued = prepareSelectedPrototypes({parent: actual, donor, carrier: x.id, section});
  assert.equal(issued.kind, 'prepared-prototypes', JSON.stringify(issued));
  const mappedJ = issued.typeMap.get(j1.id)!, mappedU = issued.typeMap.get(u1.id)!;
  const mappedEndpoint: ComplexTypeNode = {...q, derivation: {kind: 'restriction', contentKind: 'complex', base: local(mappedJ), facets: []}};
  const rebuilt = request.candidate({key: 'rebuilt', ...issued.delta, endpoint: mappedEndpoint,
    active: [...actual.members, ...issued.delta.additions!.map(node => node.id)],
    rawTypes: [...originalRows.filter(item => item.type !== q.id), row(mappedEndpoint, whole.content), ...issued.delta.rawTypes!]});
  assert.equal(rebuilt.kind, 'prepared', JSON.stringify(rebuilt));
  const mappedBody = issued.particleMap.get(body.id)!;
  const k = {...complex('K', 'extension', local(x.id)), content: mappedBody};
  const mappedUNode = get(rebuilt.context, mappedU); assert.equal(mappedUNode.kind, 'complexType');
  const retiredU: ComplexTypeNode = {...mappedUNode, derivation: {kind: 'restriction', contentKind: 'complex', base: local(k.id), facets: []}};
  const child = forkSemanticCandidate(rebuilt.context, {key: 'required-U-child', endpoint: retiredU,
    active: [...rebuilt.context.members, k.id], additions: [k], rawTypes: [row(retiredU), row(k)]
      .map(value => ({...value, content: {kind: 'element-only' as const, particle: mappedBody}}))});
  assert.equal(child.kind, 'prepared');
  const root: FiniteRe01EvidenceNode = {id: 'q', parent: actual, context: rebuilt.context, target: q.id, intermediate: mappedJ,
    ancestor: local(x.id), premises: ['U']};
  const forest = verifyFiniteRe01Evidence(actual, q.id, {root: 'q', nodes: [root,
    {id: 'U', parent: rebuilt.context, context: child.context, target: mappedU, intermediate: k.id, ancestor: local(x.id), premises: []}]});
  const missing = verifyFiniteRe01Evidence(actual, q.id, {root: 'q', nodes: [{...root, premises: []}]});
  return {request, actual, donor, x, q, whole, originalRows, j1, j2, u1, u2, d1, d2, body, fresh, endpoint, row, complex, section,
    issued, rebuilt: rebuilt.context, child: child.context, forest, missing, mappedJ, mappedU, mappedBody, sourceBefore, get};
}

let s: Awaited<ReturnType<typeof subject>>;
beforeAll(async () => {s = await subject();});

describe('initial selected prototype issuer', () => {
  it('reissues an actual adjacent pair with coherent NP SELF and a genuinely required child', () => {
    for (const node of s.fresh) expect(checkComponentConstruction(s.donor, node.id).kind).toBe('checked');
    expect(s.forest).toMatchObject({kind: 'checked-candidate'});
    assert.equal(s.forest.kind, 'checked-candidate', JSON.stringify(s.forest));
    expect(s.forest.proof).toHaveLength(2);
    expect(s.missing.kind).toBe('unresolved');
    expect(s.issued.typeMap.get(s.j2.id)).toBe(s.mappedJ);
    expect(s.issued.typeMap.get(s.u2.id)).toBe(s.mappedU);
    expect(s.rebuilt.rawTypeProperties(s.mappedU)?.derivation.base).toEqual(local(s.mappedJ));
    expect(s.rebuilt.rawTypeProperties(s.mappedJ)?.derivation.base).toEqual(local(s.x.id));
    for (const context of [s.rebuilt, s.child]) {
      for (const id of s.issued.delta.additions!.map(node => node.id)) expect(checkComponentConstruction(context, id).kind).toBe('checked');
      const d = s.get(context, s.issued.declarationMap.get(s.d1.id)!); assert.equal(d.kind, 'element');
      expect(d.type).toEqual(local(s.mappedU));
    }
    expect(JSON.stringify(s.request.graph)).toBe(s.sourceBefore);
  });

  it('preserves whole sharing and distinct particle keys while allocating merged scopes without collisions', () => {
    expect(s.rebuilt.rawTypeProperties(s.mappedJ)?.content).toEqual(s.rebuilt.rawTypeProperties(s.mappedU)?.content);
    expect(new Set(s.issued.particleMap.values()).size).toBe(s.issued.particleMap.size);
    const nodes = s.issued.delta.additions!;
    expect(new Set(nodes.map(node => semanticIdentityTuple(node.identity))).size).toBe(nodes.length);
    const declarations = [s.d1, s.d2].map(old => s.get(s.rebuilt, s.issued.declarationMap.get(old.id)!));
    for (const node of declarations) {assert.equal(node.identity.kind, 'scoped'); expect(node.identity.owner).toBe(s.mappedJ);}
    expect(declarations[0]!.id).not.toBe(declarations[1]!.id);
    const content = deriveRawComplexContent(s.rebuilt, s.mappedJ); assert.equal(content.kind, 'checked');
    const declared = prepareSemanticParticleView(s.rebuilt, content.view, 'declared'); assert.equal(declared.kind, 'checked');
    expect(declared.view.root.originalParticle).toBe(s.mappedBody);
  });

  it('respects inactive stored identity reservations in the destination parent', () => {
    const reserved: ComplexTypeNode = {...s.complex('Reserved', 'restriction', local(s.x.id)),
      id: hypotheticalScopedId(s.x.id, '/$hypothetical/0', 'type'),
      identity: {kind: 'scoped', owner: s.x.id, path: '/$hypothetical/0', role: 'type'}};
    const first = s.request.candidate({key: 'reserve', active: [...s.actual.members, reserved.id], additions: [reserved]});
    assert.equal(first.kind, 'prepared');
    const hidden = forkSemanticCandidate(first.context, {key: 'inactive-reservation', active: s.actual.members}); assert.equal(hidden.kind, 'prepared');
    expect(hidden.context.lookup(reserved.id).kind).toBe('outside-context');
    const issued = prepareSelectedPrototypes({parent: hidden.context, donor: s.donor, carrier: s.x.id, section: s.section});
    assert.equal(issued.kind, 'prepared-prototypes');
    expect(issued.delta.additions!.some(node => node.id === reserved.id)).toBe(false);
    expect(new Set(issued.delta.additions!.map(node => semanticIdentityTuple(node.identity))).size).toBe(issued.delta.additions!.length);
  });

  it('keeps repeated and independent future implicit HEAD keys distinct through one particle map', () => {
    const keyType = s.complex('KeyType', 'extension', local(s.x.id));
    const head = globalId('element', {namespace, local: 'H'});
    const particle = (name: string, term: ParticleNode['term']): ParticleNode => ({...s.body,
      id: hypotheticalScopedId(keyType.id, '/' + name, 'particle'), identity: {kind: 'scoped', owner: keyType.id, path: '/' + name, role: 'particle'},
      occurs: {min: '1', max: '1'}, term});
    const shared = particle('shared-head', {kind: 'element', declaration: local(head)});
    const independent = particle('independent-head', {kind: 'element', declaration: local(head)});
    const root = particle('content', {kind: 'sequence', children: [shared.id, shared.id, independent.id]});
    const prototype = {...keyType, content: root.id}, support = [prototype, shared, independent, root];
    const donor = s.request.candidate({key: 'key-donor', active: [...s.actual.members, ...support.map(node => node.id)], additions: support,
      rawTypes: [s.row(prototype)]}); assert.equal(donor.kind, 'prepared');
    expect(checkComponentConstruction(donor.context, prototype.id)).toMatchObject({kind: 'checked', obligations: []});
    const issued = prepareSelectedPrototypes({parent: s.actual, donor: donor.context, carrier: s.x.id,
      section: new Map([[prototype.id, prototype.id]]), reserved: s.issued.delta.additions}); assert.equal(issued.kind, 'prepared-prototypes');
    const memberName = {namespace, local: 'future-member'};
    const member: ElementNode = {...s.d1, id: globalId('element', memberName), identity: {kind: 'global', role: 'element', name: memberName},
      name: memberName, type: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}, substitutionGroup: local(head)};
    const endpoint: ComplexTypeNode = {...s.q, derivation: {kind: 'restriction', contentKind: 'complex', base: local(s.mappedJ), facets: []}};
    const additions = [...s.issued.delta.additions!, ...issued.delta.additions!, member];
    const context = s.request.candidate({key: 'future-key-pool', endpoint, active: [...s.actual.members, ...additions.map(node => node.id)], additions,
      rawTypes: [...s.originalRows.filter(row => row.type !== s.q.id), s.row(endpoint, s.whole.content), ...s.issued.delta.rawTypes!, ...issued.delta.rawTypes!],
      rawElements: [...s.issued.delta.rawElements!, {element: member.id, type: member.type, final: [], block: []}],
      rawParticleWildcards: [...s.issued.delta.rawParticleWildcards!, ...issued.delta.rawParticleWildcards!]}); assert.equal(context.kind, 'prepared');
    const selected = issued.typeMap.get(prototype.id)!;
    expect(checkComponentConstruction(context.context, selected)).toMatchObject({kind: 'checked', obligations: []});
    const content = deriveRawComplexContent(context.context, selected); assert.equal(content.kind, 'checked');
    const view = prepareSemanticParticleView(context.context, content.view, 'restriction'); assert.equal(view.kind, 'checked');
    const keys = view.view.root.children.flatMap(child => child.orderBlocks.flatMap(block => block.kind === 'implicit' ? [block.particle] : []));
    expect(keys).toEqual([issued.particleMap.get(shared.id), issued.particleMap.get(shared.id), issued.particleMap.get(independent.id)]);
    expect(keys[0]).not.toBe(keys[2]);
  });

  it('retains an authentic SOURCE WHOLE as an opaque root without admitting its backing', () => {
    const original = s.complex('SourceBorrower', 'extension', local(s.x.id));
    const donor = s.request.candidate({key: 'source-donor', endpoint: s.endpoint,
      active: [...s.actual.members, ...s.fresh.map(node => node.id), original.id], additions: [...s.fresh, original],
      rawTypes: [...s.originalRows.filter(item => item.type !== s.q.id), s.row(s.endpoint, s.whole.content),
        ...[s.j1, s.j2, s.u1, s.u2].map(node => s.row(node)), s.row(original, s.whole.content)],
      rawElements: [s.d1, s.d2].map(node => ({element: node.id, type: node.type, final: [], block: []}))});
    assert.equal(donor.kind, 'prepared');
    const issued = prepareSelectedPrototypes({parent: s.actual, donor: donor.context, carrier: s.x.id,
      section: new Map([[original.id, original.id]])}); assert.equal(issued.kind, 'prepared-prototypes');
    const content = issued.delta.rawTypes![0]!.content; assert.ok('particle' in content);
    expect(content.original).toBe(s.whole.content.original);
    expect(content.particle).toBe(s.whole.content.particle);
    expect(issued.particleMap.size).toBe(0);
    expect(issued.delta.additions).toHaveLength(1);
    expect(issued.requiredExternal).toContain(s.q.id);
    const installed = s.request.candidate({key: 'source-borrower-issued', ...issued.delta,
      active: [...s.actual.members, ...issued.delta.additions!.map(node => node.id)]}); assert.equal(installed.kind, 'prepared');
    const check = checkComponentConstruction(installed.context, issued.typeMap.get(original.id)!);
    expect(check).toMatchObject({kind: 'checked', obligations: []});
    assert.equal(check.kind, 'checked'); expect(check.dependencies).not.toContain(s.q.id);
    const view = deriveRawComplexContent(installed.context, issued.typeMap.get(original.id)!); assert.equal(view.kind, 'checked');
    expect(view.view.content).toEqual(s.whole.content);
  });

  it('returns outside-frame for a non-adjacent section, inherited rewrite and unavailable scope carrier', () => {
    expect(prepareSelectedPrototypes({parent: s.actual, donor: s.donor, carrier: s.x.id,
      section: new Map([[s.j1.id, s.j1.id], [s.j2.id, s.j1.id], [s.u2.id, s.u2.id]])}))
      .toMatchObject({kind: 'outside-frame', rule: 'selected-base-not-selected'});
    expect(prepareSelectedPrototypes({parent: s.actual, donor: s.donor, carrier: s.x.id,
      section: new Map([[s.x.id, s.x.id]])})).toMatchObject({kind: 'outside-frame', rule: 'inherited-type-rewrite'});
    expect(prepareSelectedPrototypes({parent: s.actual, donor: s.donor, carrier: 'unavailable', section: s.section}))
      .toMatchObject({kind: 'outside-frame', rule: 'carrier-unavailable'});
  });

  it('rejects foreign source authority before copying any WHOLE selection', async () => {
    const foreign = await subject();
    expect(prepareSelectedPrototypes({parent: foreign.actual, donor: s.donor, carrier: foreign.x.id, section: s.section}))
      .toMatchObject({kind: 'outside-frame', rule: 'foreign-source-context'});
    const forged = {...s.whole.content.original!};
    expect(s.request.candidate({key: 'forged-source', endpoint: s.endpoint, active: [...s.actual.members, ...s.fresh.map(node => node.id)], additions: s.fresh,
      rawTypes: [s.row(s.endpoint, {...s.whole.content, original: forged})]})).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
  });

  it('leaves a valid typed VALUE declaration outside this first issuer frame', () => {
    const valued: ElementNode = {...s.d1, type: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}},
      value: {kind: 'default', lexical: {value: 'kept', context: s.x.context}}};
    const donor = s.request.candidate({key: 'value-donor', endpoint: s.endpoint,
      active: [...s.actual.members, ...s.fresh.map(node => node.id)], additions: s.fresh.map(node => node.id === valued.id ? valued : node),
      rawTypes: [...s.originalRows.filter(item => item.type !== s.q.id), s.row(s.endpoint, s.whole.content),
        ...[s.j1, s.j2, s.u1, s.u2].map(node => s.row(node))],
      rawElements: [valued, s.d2].map(node => ({element: node.id, type: node.type, final: [], block: []}))});
    assert.equal(donor.kind, 'prepared');
    expect(checkComponentConstruction(donor.context, valued.id)).toMatchObject({kind: 'checked', obligations: []});
    expect(prepareSelectedPrototypes({parent: s.actual, donor: donor.context, carrier: s.x.id, section: s.section}))
      .toMatchObject({kind: 'outside-frame', rule: 'declaration-value-or-sg-outside-frame', component: valued.id});
  });

  it('does not activate a private SOURCE wrapper as an ordinary RAW child', async () => {
    const source = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-particle-handles-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(source); assert.equal(prepared.kind, 'prepared');
    const {request} = prepared, actual = request.actual, ns = 'urn:research:endpoint-origin-frontier';
    const id = (name: string) => globalId('type', {namespace: ns, local: name});
    const found = actual.lookup(id('D')); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType');
    const view = deriveActualComplexContent(actual, found.node.id); assert.equal(view.kind, 'checked'); assert.ok('particle' in view.view.content);
    expect(view.view.synthetic).toContain(view.view.content.particle);
    const helper: ComplexTypeNode = {...found.node, id: hypotheticalScopedId(found.node.id, '/not-source', 'type'),
      identity: {kind: 'scoped', owner: found.node.id, path: '/not-source', role: 'type'},
      derivation: {kind: 'restriction', contentKind: 'complex', base: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}, facets: []}};
    expect(request.candidate({key: 'unauthorized-private-root', active: [...actual.members, helper.id], additions: [helper],
      rawTypes: [{...s.row(helper), targetNamespace: ns, content: view.view.content}]}))
      .toMatchObject({kind: 'candidate-rejected', code: 'missing', component: view.view.content.particle});
  });

  it('returns the native request resource limit rather than an outside-frame negative', async () => {
    const fresh = await subject();
    const failure = fresh.actual.budget.guard(() => fresh.actual.budget.chargeWork(Number.MAX_SAFE_INTEGER));
    expect(failure).toMatchObject({kind: 'resource-limit'});
    expect(prepareSelectedPrototypes({parent: fresh.actual, donor: fresh.donor, carrier: fresh.x.id, section: fresh.section})).toBe(failure);
  });
});
