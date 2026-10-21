/** A disappearing own-E scope continuation permits an exact-input prefix repair. */
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
import {checkRawParticleExtension} from '../../../src/compiler/particleExtension.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteProofStep, FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexContent, RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:own-e-source-scope';
const tid = (name: string) => globalId('type', {namespace, local: name});
const eid = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
type Mode = 'ORIGINAL' | 'REPAIR';

async function subject(mode: Mode) {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/own-extension-scope-repair.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual;
  const sourceSyntax = checkSchemaDocumentSyntax(actual);
  const get = (context: SemanticContext, id: string): GraphNode => {
    const found = context.lookup(id); assert.equal(found.kind, 'found'); return found.node;
  };
  const complexAt = (id: string): ComplexTypeNode => {
    const node = get(actual, id); assert.equal(node.kind, 'complexType'); return node;
  };
  const resolvedComplex = (reference: Reference): ComplexTypeNode => {
    const found = actual.resolve(reference); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const x = complexAt(tid('X')), r = complexAt(tid('R'));
  assert.ok(r.content); const rRoot = get(actual, r.content); assert.equal(rRoot.kind, 'particle'); assert.equal(rRoot.term.kind, 'sequence');
  const gammaUse = get(actual, rRoot.term.children[0]!); assert.equal(gammaUse.kind, 'particle'); assert.equal(gammaUse.term.kind, 'element');
  const gammaFound = actual.resolve(gammaUse.term.declaration); assert.equal(gammaFound.kind, 'found');
  const gamma = gammaFound.node; assert.equal(gamma.kind, 'element'); const u = resolvedComplex(gamma.type);
  const qCarrier = get(actual, eid('qCarrier')); assert.equal(qCarrier.kind, 'element'); const q = resolvedComplex(qCarrier.type);
  const whole = deriveOriginalComplexParticle(actual, q.id); assert.equal(whole.kind, 'checked');
  const common = {context: x.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const complex = (name: string, method: 'extension' | 'restriction', base: Reference): ComplexTypeNode => {
    const slot = '/own-e/' + name, owner = qCarrier.id;
    return {...common, kind: 'complexType', id: hypotheticalScopedId(owner, slot, 'type'),
      identity: {kind: 'scoped', owner, path: slot, role: 'type'}, mixed: false, abstract: false, attributes: [],
      derivation: {kind: method, contentKind: 'complex', base, facets: []}};
  };
  const particle = (owner: string, slot: string, term: ParticleNode['term'], min = '1'): ParticleNode => ({...common,
    kind: 'particle', id: hypotheticalScopedId(owner, slot, 'particle'), identity: {kind: 'scoped', owner, path: slot, role: 'particle'},
    occurs: {min, max: '1'}, term});
  const declaration = (owner: string, name: string, type: Reference): ElementNode => {
    const slot = '/own-e/' + name;
    return {...common, kind: 'element', id: hypotheticalScopedId(owner, slot, 'element'),
      identity: {kind: 'scoped', owner, path: slot, role: 'element'}, name: {namespace, local: name}, type, abstract: false, nillable: false};
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
  const j: ComplexTypeNode = {...complex('J', 'extension', local(x.id)), content: whole.content.particle};
  const vBare = complex('v', 'extension', local(r.id)), rjBare = complex('rJ', 'extension', local(x.id)), ru = complex('ru', 'restriction', local(rjBare.id));
  const gammaCopy = declaration(r.id, 'gamma', local(mode === 'ORIGINAL' ? ru.id : u.id));
  const deltaCopy = declaration(vBare.id, 'delta', {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}});
  const gc = particle(vBare.id, '/gamma-use', {kind: 'element', declaration: local(gammaCopy.id)}, '0');
  const dc = particle(vBare.id, '/delta-use', {kind: 'element', declaration: local(deltaCopy.id)}, '0');
  const rc = particle(vBare.id, '/R-prefix', {kind: 'sequence', children: [gc.id]});
  const d = particle(vBare.id, '/delta-group', {kind: 'sequence', children: [dc.id]});
  const vr = particle(vBare.id, '/content', {kind: 'sequence', children: [rc.id, d.id]});
  const v: ComplexTypeNode = {...vBare, content: vr.id}, rj: ComplexTypeNode = {...rjBare, content: vr.id};
  const fresh: GraphNode[] = [j, v, ...(mode === 'ORIGINAL' ? [rj, ru] : []), gammaCopy, deltaCopy, gc, dc, rc, d, vr];
  const retiredU: ComplexTypeNode = {...u, derivation: {kind: 'restriction', contentKind: 'complex', base: local(j.id), facets: []}};
  const creator = request.candidate({key: 'creator-u', endpoint: retiredU, active: [...actual.members, ...fresh.map(node => node.id)], additions: fresh,
    rawTypes: [...originalRows.filter(value => value.type !== u.id), row(retiredU), row(j, whole.content), row(v), ...(mode === 'ORIGINAL' ? [row(rj), row(ru)] : [])],
    rawElements: [gammaCopy, deltaCopy].map(node => ({element: node.id, type: node.type, final: [], block: []}))});
  assert.equal(creator.kind, 'prepared'); const parent = creator.context, middle = mode === 'ORIGINAL' ? rj : j;
  const retiredV: ComplexTypeNode = {...v, derivation: {kind: 'restriction', contentKind: 'complex', base: local(middle.id), facets: []}};
  const cutV = forkSemanticCandidate(parent, {key: 'carrier-v-child', endpoint: retiredV, active: parent.members, additions: [], rawTypes: [row(retiredV)]});
  assert.equal(cutV.kind, 'prepared'); const child = cutV.context;
  // Original q has its own actual-Gamma duty, independent of its PROPERTY-only role above.
  const mq: ComplexTypeNode = {...complex('Mq', 'extension', local(x.id)), content: whole.content.particle};
  const retiredQ: ComplexTypeNode = {...q, derivation: {kind: 'restriction', contentKind: 'complex', base: local(mq.id), facets: []}};
  const qRoot = request.candidate({key: 'independent-actual-q', endpoint: retiredQ, active: [...actual.members, mq.id], additions: [mq],
    rawTypes: [...originalRows.filter(value => value.type !== q.id), row(retiredQ, whole.content), row(mq, whole.content)]});
  assert.equal(qRoot.kind, 'prepared'); const qParent = qRoot.context, mu = complex('Mu', 'extension', local(x.id));
  const qRetiredU: ComplexTypeNode = {...u, derivation: {kind: 'restriction', contentKind: 'complex', base: local(mu.id), facets: []}};
  const qCutU = forkSemanticCandidate(qParent, {key: 'q-branch-u-child', endpoint: qRetiredU,
    active: [...qParent.members, mu.id], additions: [mu], rawTypes: [row(qRetiredU), row(mu)]});
  assert.equal(qCutU.kind, 'prepared'); const qChild = qCutU.context;
  const root: FiniteRe01EvidenceNode = {id: 'creator-u', parent: actual, context: parent, target: u.id, intermediate: j.id, ancestor: local(x.id), premises: ['carrier-v']};
  const nodes: FiniteRe01EvidenceNode[] = [root,
    {id: 'carrier-v', parent, context: child, target: v.id, intermediate: middle.id, ancestor: local(x.id), premises: []},
    {id: 'actual-q', parent: actual, context: qParent, target: q.id, intermediate: mq.id, ancestor: local(x.id), premises: ['q-branch-u']},
    {id: 'q-branch-u', parent: qParent, context: qChild, target: u.id, intermediate: mu.id, ancestor: local(x.id), premises: []}];
  const raw = (context: SemanticContext, id: string) => {
    const mapped = deriveRawComplexContent(context, id); assert.equal(mapped.kind, 'checked'); return mapped.view;
  };
  const semantic = (context: SemanticContext, id: string) => {
    const view = prepareSemanticParticleView(context, raw(context, id), 'restriction'); assert.equal(view.kind, 'checked'); return view.view;
  };
  return {mode, actual, parent, child, qParent, qChild, x, r, u, q, qCarrier, j, v, rj, ru, mq, mu, gamma, gammaCopy, deltaCopy, fresh, whole: whole.content, sourceSyntax,
    forest: verifyFiniteRe01Evidence(actual, u.id, {root: root.id, nodes}),
    missingV: verifyFiniteRe01Evidence(actual, u.id, {root: root.id,
      nodes: nodes.filter(node => node.id !== 'carrier-v').map(node => node === root ? {...root, premises: []} : node)}),
    missingQ: verifyFiniteRe01Evidence(actual, u.id, {root: root.id, nodes: [root, nodes[1]!]}),
    rawExtension: checkRawParticleExtension(parent, raw(parent, v.id), raw(parent, r.id)),
    childRestriction: checkParticleRestriction(child, semantic(child, v.id), semantic(child, middle.id)),
    properties: [parent, child].map(context => [[v.id, q.id], ...(mode === 'ORIGINAL' ? [[ru.id, u.id], [rj.id, j.id]] : [])]
      .map(([left, right]) => compareComponentProperties(context, get(context, left!), get(context, right!)))),
    contexts: [{role: 'P', context: parent, fresh}, {role: 'H', context: child, fresh},
      {role: 'Q0', context: qParent, fresh: [mq]}, {role: 'Q1', context: qChild, fresh: [mq, mu]}]};
}

type Subject = Awaited<ReturnType<typeof subject>>;
let original: Subject, repair: Subject;
beforeAll(async () => {original = await subject('ORIGINAL'); repair = await subject('REPAIR');});

describe('own extension scope continuation and exact-input repair', () => {
  // Source plan3c738 and independently replayed two-mode packet classify this supplied host only.
  it('checks both complete source-scope forests with every original and inherited fresh root', () => {
    for (const s of [original, repair]) {
      expect(s.sourceSyntax.kind).toBe('checked'); assert.equal(s.forest.kind, 'checked-candidate'); expect(s.forest.proof).toHaveLength(4);
      expect(new Set(s.forest.actualComponents.map(receipt => receipt.component))).toEqual(new Set(s.actual.members));
      expect(new Set(s.forest.actualComponents.filter(receipt => receipt.re01 && !receipt.re01.primitive).map(receipt => receipt.component)))
        .toEqual(new Set([s.u.id, s.q.id]));
      for (const {context, fresh, role} of s.contexts) {
        const proof: FiniteProofStep | undefined = s.forest.proof.find(step => step.contextId === context.contextId); assert.ok(proof);
        const full: Set<string> = new Set(proof.components.map(receipt => receipt.component));
        for (const node of fresh) expect(full.has(node.id)).toBe(true);
        for (const receipt of proof.components) {
          expect(receipt.contextId).toBe(context.contextId); expect(receipt.obligations).toEqual([]);
          for (const dependency of receipt.typeDependencies) expect(dependency.contextId).toBe(context.contextId);
        }
        const duties = new Set(proof.components.filter(receipt => receipt.re01 && !receipt.re01.primitive).map(receipt => receipt.component));
        expect(duties).toEqual(new Set(role === 'P' ? [s.v.id] : role === 'Q0' ? [s.u.id] : []));
      }
      const qProof = s.forest.proof.find(step => step.contextId === s.qParent.contextId); assert.ok(qProof);
      expect(qProof.target).toBe(s.q.id); expect(qProof.premises).toEqual(['q-branch-u']);
      const uProof = s.forest.proof.find(step => step.contextId === s.qChild.contextId); assert.ok(uProof); expect(uProof.target).toBe(s.u.id);
      for (const node of s.fresh.filter(node => node.id !== s.v.id)) expect(s.child.lookup(node.id)).toEqual(s.parent.lookup(node.id));
    }
  });

  it('keeps the own-E scope continuation positive only before the carrier cut without requiring FULL q', () => {
    const s = original; assert.equal(s.forest.kind, 'checked-candidate');
    assert.equal(s.rawExtension.kind, 'checked'); expect(s.rawExtension.value).toBe(true);
    expect(s.parent.rawElementProperties(s.gammaCopy.id)?.type).toEqual(local(s.ru.id));
    expect(s.gammaCopy.identity).toMatchObject({kind: 'scoped', owner: s.r.id});
    expect(s.deltaCopy.identity).toMatchObject({kind: 'scoped', owner: s.v.id});
    for (const [index, context] of [s.parent, s.child].entries()) {
      const proof: FiniteProofStep | undefined = s.forest.proof.find(step => step.contextId === context.contextId); assert.ok(proof);
      const full: Set<string> = new Set(proof.components.map(receipt => receipt.component));
      expect(full.has(s.q.id)).toBe(false); expect(full.has(s.qCarrier.id)).toBe(false);
      expect(full.has(s.r.id)).toBe(index === 0); expect(context.lookup(s.r.id).kind).toBe('found');
      expect(full.has(s.u.id)).toBe(true); expect(full.has(s.j.id)).toBe(true);
      for (const property of s.properties[index]!) {
        assert.equal(property.kind, 'checked'); expect(property.value).toBe(index === 0);
        expect(property.obligations).toContain('component-validity'); expect(property.scalarObligations).toEqual([]);
      }
    }
    expect(s.parent.rawTypeProperties(s.v.id)?.derivation).toEqual({method: 'extension', base: local(s.r.id)});
    expect(s.child.rawTypeProperties(s.v.id)?.derivation).toEqual({method: 'restriction', base: local(s.rj.id)});
    assert.equal(s.childRestriction.kind, 'checked'); expect(s.childRestriction.value).toBe(true);
  });

  it('repairs the writable prefix with exact u and an existing J middle before birth', () => {
    const s = repair;
    for (const context of [s.parent, s.child]) {
      expect(context.lookup(s.ru.id).kind).toBe('missing'); expect(context.lookup(s.rj.id).kind).toBe('missing');
      expect(context.rawElementProperties(s.gammaCopy.id)?.type).toEqual(local(s.u.id));
      expect(context.rawTypeProperties(s.j.id)?.content).toEqual(s.whole);
    }
    // Exact prefix TYPE u and exact scope R close the complex seed, while the optional v/q diagnostic is still true in P.
    expect(s.gammaCopy.identity).toMatchObject({kind: 'scoped', owner: s.r.id});
    assert.equal(s.rawExtension.kind, 'checked'); expect(s.rawExtension.value).toBe(true);
    expect(s.child.rawTypeProperties(s.v.id)?.derivation).toEqual({method: 'restriction', base: local(s.j.id)});
    assert.equal(s.childRestriction.kind, 'checked'); expect(s.childRestriction.value).toBe(true);
    for (const [index, properties] of s.properties.entries()) {
      expect(properties).toHaveLength(1); const property = properties[0]!;
      assert.equal(property.kind, 'checked'); expect(property.value).toBe(index === 0);
    }
  });

  it('requires the actual v child in each source-scope reconstruction', () => {
    for (const s of [original, repair]) expect(s.missingV).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.v.id, contextId: s.parent.contextId});
  });

  it('requires the independent actual q tree as well as the selected u tree', () => {
    for (const s of [original, repair]) expect(s.missingQ).toMatchObject({kind: 'unresolved', rule: 'missing-actual-evidence', component: s.q.id, contextId: s.actual.contextId});
  });
});
