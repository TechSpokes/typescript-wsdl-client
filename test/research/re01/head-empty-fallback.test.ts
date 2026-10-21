/** Effective substitution exceptions exclude the raw label restored by an empty head pool. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveRawComplexContent, deriveOriginalComplexPropertyContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkSubstitution, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures');
const n1 = 'urn:re01:head-empty-fallback:n1', n2 = 'urn:re01:head-empty-fallback:n2';
const tid = (name: string) => globalId('type', {namespace: n1, local: name});
const eid = (namespace: string, name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});

async function subject() {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/head-empty-fallback.xsd'), {policy: {fileRoots: [fixtures]}});
  const preparation = prepareSourceSchemaRequest(input); assert.equal(preparation.kind, 'prepared');
  const {request} = preparation, actual = request.actual, snapshot = JSON.stringify(request.graph);
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const original = (name: string): ComplexTypeNode => {
    const found = actual.lookup(tid(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const x = original('X'), d = original('D'), b = original('B'), hi = eid(n1, 'Hi');
  const common = {context: x.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const complex = (name: string, method: 'extension' | 'restriction', base: Reference, content?: string): ComplexTypeNode => ({...common,
    kind: 'complexType', id: tid(name), identity: {kind: 'global', role: 'type', name: {namespace: n1, local: name}},
    mixed: false, abstract: false, attributes: [], content, derivation: {kind: method, contentKind: 'complex', base, facets: []}});
  const declaration = (namespace: string, name: string, type: string, head: string, abstract: boolean): ElementNode => ({...common,
    kind: 'element', id: eid(namespace, name), identity: {kind: 'global', role: 'element', name: {namespace, local: name}},
    name: {namespace, local: name}, type: local(type), abstract, nillable: false, substitutionGroup: local(head)});
  const j = complex('J', 'extension', local(x.id)), c = complex('C', 'extension', local(j.id)), p = complex('p', 'extension', local(c.id));
  const k = declaration(n2, 'K', j.id, hi, true), member = declaration(n1, 'm', p.id, k.id, false), bare = complex('M', 'extension', local(x.id));
  const particle: ParticleNode = {...common, kind: 'particle', id: scopedId(bare.id, '/head-K', 'particle'),
    identity: {kind: 'scoped', owner: bare.id, path: '/head-K', role: 'particle'}, occurs: {min: '0', max: 'unbounded'},
    term: {kind: 'element', declaration: local(k.id)}};
  const middle: ComplexTypeNode = {...bare, content: particle.id}, u = complex('U', 'restriction', local(b.id), particle.id);
  const row = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: n1,
    derivation: {method: node.derivation!.kind, base: node.derivation!.base}, abstract: false, final: [], block: node.id === c.id ? ['restriction'] : [],
    content: node.content ? {kind: 'element-only', particle: node.content} : {kind: 'empty'}, attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(middle.id), facets: []}};
  const fresh: GraphNode[] = [middle, j, c, p, u, k, member, particle];
  const built = request.candidate({key: 'empty-K', endpoint, active: [...actual.members, ...fresh.map(node => node.id)], additions: fresh,
    rawTypes: [endpoint, middle, j, c, p, u].map(row), rawElements: [k, member].map(node => ({element: node.id, type: node.type, final: [], block: []}))});
  assert.equal(built.kind, 'prepared'); const root = built.context;
  const retire = (parent: SemanticContext, target: ComplexTypeNode, key: string) => {
    const updated: ComplexTypeNode = {...target, derivation: {kind: 'restriction', contentKind: 'complex', base: local(j.id), facets: []}};
    const next = forkSemanticCandidate(parent, {key, endpoint: updated, active: parent.members, additions: [], rawTypes: [row(updated)]});
    assert.equal(next.kind, 'prepared'); return next.context;
  };
  const cFirst = retire(root, c, 'C'), cThenP = retire(cFirst, p, 'Cp'), pFirst = retire(root, p, 'p'), pThenC = retire(pFirst, c, 'pC');
  const contexts = [root, cFirst, cThenP, pFirst, pThenC];
  const step = (id: string, parent: SemanticContext, context: SemanticContext, target: ComplexTypeNode, premises: readonly string[] = []): FiniteRe01EvidenceNode =>
    ({id, parent, context, target: target.id, intermediate: j.id, ancestor: local(x.id), premises});
  const outer: FiniteRe01EvidenceNode = {id: 'D', parent: actual, context: root, target: d.id, intermediate: middle.id, ancestor: local(x.id), premises: ['C', 'p']};
  const nodes = [outer, step('C', root, cFirst, c, ['Cp']), step('Cp', cFirst, cThenP, p), step('p', root, pFirst, p, ['pC']), step('pC', pFirst, pThenC, c)];
  const states = contexts.map(context => {
    const mapped = deriveRawComplexContent(context, middle.id), mappedU = deriveRawComplexContent(context, u.id), mappedB = deriveOriginalComplexPropertyContent(context, b.id);
    assert.equal(mapped.kind, 'checked'); assert.equal(mappedU.kind, 'checked'); assert.equal(mappedB.kind, 'checked');
    const mv = prepareSemanticParticleView(context, mapped.view, 'restriction'), uv = prepareSemanticParticleView(context, mappedU.view, 'restriction');
    const bv = prepareSemanticParticleView(context, mappedB.view, 'restriction');
    assert.equal(mv.kind, 'checked'); assert.equal(uv.kind, 'checked'); assert.equal(bv.kind, 'checked');
    return {context, poolK: effectiveSubstitutionMembers(context, k.id), poolHi: effectiveSubstitutionMembers(context, hi), root: mv.view.root,
      restriction: checkParticleRestriction(context, uv.view, bv.view), affiliations: [checkSubstitution(context, k.id, hi, {mode: 'affiliation'}),
        checkSubstitution(context, member.id, k.id, {mode: 'affiliation'})]};
  });
  return {actual, fresh, contexts, states, c, p, j, middle, u, k, member, particle,
    unchanged: () => JSON.stringify(request.graph) === snapshot,
    forest: verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes}),
    missing: verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [{...outer, premises: []}]})};
}

let s: Awaited<ReturnType<typeof subject>>;
beforeAll(async () => {s = await subject();});

describe('a transient empty effective head pool', () => {
  it('checks every full root through both C/p retirement orders', () => {
    assert.equal(s.forest.kind, 'checked-candidate'); expect(s.actual.members).toHaveLength(8); expect(s.fresh).toHaveLength(8);
    expect(new Set(s.forest.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
    expect(s.forest.proof).toHaveLength(5);
    for (const [index, context] of s.contexts.entries()) {
      const proof: typeof s.forest.proof[number] | undefined = s.forest.proof.find(item => item.contextId === context.contextId); assert.ok(proof);
      expect(context.members).toHaveLength(16); expect(proof.components).toHaveLength(index === 0 ? 15 : 14);
      expect(proof.components.filter(item => item.re01 && !item.re01.primitive)).toHaveLength([2, 1, 0, 1, 0][index]);
      const checked = new Set(proof.components.map(item => item.component));
      for (const node of s.fresh) expect(checked.has(node.id)).toBe(true);
      for (const receipt of proof.components) {expect(receipt.contextId).toBe(context.contextId); expect(receipt.obligations).toEqual([]);}
      for (const node of s.fresh) if (node.id !== s.c.id && node.id !== s.p.id) expect(context.lookup(node.id)).toEqual(s.contexts[0].lookup(node.id));
      expect(context.rawTypeProperties(s.c.id)?.block).toEqual(['restriction']);
      expect(context.rawTypeProperties(s.middle.id)?.content).toEqual(context.rawTypeProperties(s.u.id)?.content);
    }
    expect(s.unchanged()).toBe(true);
  });

  it('uses the raw N2 head at C-only even though the K-minus-Hi exception set stays empty', () => {
    for (const [index, state] of s.states.entries()) {
      assert.equal(state.poolK.kind, 'checked'); assert.equal(state.poolHi.kind, 'checked');
      const poolHi = state.poolHi.value;
      expect(state.poolK.value).toEqual(index === 1 ? [] : [s.member.id]); expect(state.poolK.value).toEqual(poolHi);
      expect(state.poolK.value.filter(id => !poolHi.includes(id))).toEqual([]);
      for (const edge of state.affiliations) {assert.equal(edge.kind, 'checked'); expect(edge.value).toBe(true);}
      assert.equal(state.restriction.kind, 'checked'); expect(state.restriction.value).toBe(true);
      expect(state.root.occurs).toEqual({min: '0', max: 'unbounded'}); expect(state.root.summary.schemaEmptiable).toBe(true);
      expect(state.root.kind).toBe(index === 1 ? 'element' : 'choice');
      if (index === 1) {expect(state.root.element?.id).toBe(s.k.id); expect(state.root.element?.abstract).toBe(true); expect(state.root.source).toBe(s.particle.id);}
      else {expect(state.root.children.map(child => child.element?.id)).toEqual([s.member.id]);
        expect(state.root.orderBlocks).toMatchObject([{kind: 'implicit', particle: s.particle.id, head: s.k.id}]);}
    }
  });

  // This checks the supplied reconstruction, not necessity of K or a general decoder/count bound.
  it('requires actual C/p child evidence', () => {
    expect(s.missing).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence'});
  });
});
