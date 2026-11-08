/** Preserve incoming CHOICE dispatch while coalescing a supplied homogeneous HEAD bag. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveRawComplexContent, deriveOriginalComplexPropertyContent, deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkSubstitution, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures');
const n1 = 'urn:re01:head-two-groups:n1', n2 = 'urn:re01:head-two-groups:n2';
const tid = (name: string) => globalId('type', {namespace: n1, local: name});
const eid = (namespace: string, name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
type Mode = 'old' | 'two' | 'one' | 'direct';

async function subject(mode: Mode) {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/head-two-groups.xsd'), {policy: {fileRoots: [fixtures]}});
  const preparation = prepareSourceSchemaRequest(input); assert.equal(preparation.kind, 'prepared');
  const {request} = preparation, actual = request.actual, snapshot = JSON.stringify(request.graph);
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const original = (name: string): ComplexTypeNode => {
    const found = actual.lookup(tid(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const x = original('X'), d = original('D'), b = original('B'), hi = eid(n1, 'Hi');
  const sourceD = deriveOriginalComplexParticle(actual, d.id); assert.equal(sourceD.kind, 'checked');
  const common = {context: x.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const complex = (name: string, method: 'extension' | 'restriction', base: Reference, content?: string): ComplexTypeNode => ({...common,
    kind: 'complexType', id: tid(name), identity: {kind: 'global', role: 'type', name: {namespace: n1, local: name}}, mixed: false,
    abstract: false, attributes: [], content, derivation: {kind: method, contentKind: 'complex', base, facets: []}});
  const particle = (owner: string, slot: string, term: ParticleNode['term']): ParticleNode => ({...common, kind: 'particle',
    id: scopedId(owner, slot, 'particle'), identity: {kind: 'scoped', owner, path: slot, role: 'particle'}, occurs: {min: '1', max: '1'}, term});
  const declaration = (namespace: string, name: string, type: string, head: string, abstract: boolean): ElementNode => ({...common,
    kind: 'element', id: eid(namespace, name), identity: {kind: 'global', role: 'element', name: {namespace, local: name}},
    name: {namespace, local: name}, type: local(type), abstract, nillable: false, substitutionGroup: local(head)});
  const j = complex('J', 'extension', local(x.id)), c = complex('C', 'extension', local(j.id)), p = complex('p', 'extension', local(c.id));
  const heads = [1, 2, 3, 4].map(i => declaration(n2, 'K' + i, j.id, hi, true)), bare = complex('M', 'extension', local(x.id));
  const uses = heads.map((head, i) => particle(bare.id, '/K' + (i + 1), {kind: 'element', declaration: local(head.id)}));
  const selected = mode === 'old' ? uses : mode === 'two' ? [uses[0], uses[2]] : [uses[0]];
  const rootParticle = particle(bare.id, '/choice', mode === 'direct' ? {kind: 'element', declaration: local(heads[0].id)}
    : {kind: 'choice', children: selected.map(node => node.id)});
  const middle: ComplexTypeNode = {...bare, content: rootParticle.id}, u = complex('U', 'restriction', local(b.id), rootParticle.id);
  const vBare = complex('V', 'restriction', local(middle.id)), incoming = particle(vBare.id, '/incoming-Hi', {kind: 'element', declaration: local(hi)});
  const v: ComplexTypeNode = {...vBare, content: incoming.id};
  const members = heads.map((head, i) => declaration(n1, 'm' + (i + 1), i === 1 ? j.id : p.id,
    mode === 'old' ? head.id : mode === 'two' ? heads[i < 2 ? 0 : 2].id : heads[0].id, false));
  const row = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: n1,
    derivation: {method: node.derivation!.kind, base: node.derivation!.base}, abstract: false, final: [], block: node.id === c.id ? ['restriction'] : [],
    content: node.id === d.id ? sourceD.content : node.content ? {kind: 'element-only', particle: node.content} : {kind: 'empty'},
    attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(middle.id), facets: []}};
  const fresh: GraphNode[] = [middle, j, c, p, u, v, ...heads, ...members, ...uses, rootParticle, incoming];
  const built = request.candidate({key: mode, endpoint, active: [...actual.members, ...fresh.map(node => node.id)], additions: fresh,
    rawTypes: [endpoint, middle, j, c, p, u, v].map(row), rawElements: [...heads, ...members].map(node => ({element: node.id, type: node.type, final: [], block: []}))});
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
    const rawView = (id: string) => {
      const mapped = deriveRawComplexContent(context, id); assert.equal(mapped.kind, 'checked');
      const prepared = prepareSemanticParticleView(context, mapped.view, 'restriction'); assert.equal(prepared.kind, 'checked'); return prepared.view;
    };
    const mv = rawView(middle.id), uv = rawView(u.id), vv = rawView(v.id), mappedB = deriveOriginalComplexPropertyContent(context, b.id);
    assert.equal(mappedB.kind, 'checked'); const bv = prepareSemanticParticleView(context, mappedB.view, 'restriction'); assert.equal(bv.kind, 'checked');
    return {context, root: mv.root, incomingRoot: vv.root, pools: heads.map(head => effectiveSubstitutionMembers(context, head.id)), hiPool: effectiveSubstitutionMembers(context, hi),
      incoming: checkParticleRestriction(context, vv, mv), outgoing: checkParticleRestriction(context, uv, bv.view),
      affiliations: [...heads.map(head => checkSubstitution(context, head.id, hi, {mode: 'affiliation'})), ...members.map(member =>
        checkSubstitution(context, member.id, (member.substitutionGroup as Extract<Reference, {kind: 'local'}>).target, {mode: 'affiliation'}))],
      local: [middle.id, c.id, p.id, u.id, v.id, ...heads.map(node => node.id), ...members.map(node => node.id), ...uses.map(node => node.id)]
        .map(id => checkComponentConstruction(context, id))};
  });
  return {actual, mode, fresh, contexts, states, c, p, middle, u, v, heads, members, uses, rootParticle, incoming,
    unchanged: () => JSON.stringify(request.graph) === snapshot,
    forest: verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes}),
    missing: verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [{...outer, premises: []}]})};
}

type Subject = Awaited<ReturnType<typeof subject>>;
let old: Subject, two: Subject, one: Subject, direct: Subject;
beforeAll(async () => {old = await subject('old'); two = await subject('two'); one = await subject('one'); direct = await subject('direct');});

function checkComplete(s: Subject) {
  assert.equal(s.forest.kind, 'checked-candidate'); expect(s.actual.members).toHaveLength(9); expect(s.fresh).toHaveLength(20);
  expect(new Set(s.forest.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members)); expect(s.forest.proof).toHaveLength(5);
  for (const [index, context] of s.contexts.entries()) {
    const proof: typeof s.forest.proof[number] | undefined = s.forest.proof.find(item => item.contextId === context.contextId); assert.ok(proof);
    expect(context.members).toHaveLength(29); expect(proof.components).toHaveLength(index === 0 ? 28 : 25);
    expect(proof.components.filter(item => item.re01 && !item.re01.primitive)).toHaveLength([2, 1, 0, 1, 0][index]);
    const checked = new Set(proof.components.map(item => item.component));
    for (const node of s.fresh) expect(checked.has(node.id)).toBe(true);
    for (const receipt of proof.components) {expect(receipt.contextId).toBe(context.contextId); expect(receipt.obligations).toEqual([]);}
    for (const node of s.fresh) if (node.id !== s.c.id && node.id !== s.p.id) expect(context.lookup(node.id)).toEqual(s.contexts[0].lookup(node.id));
    expect(context.rawTypeProperties(s.middle.id)?.content).toEqual(context.rawTypeProperties(s.u.id)?.content);
  }
  expect(s.unchanged()).toBe(true);
}

function checkPrerequisites(s: Subject) {
  for (const [index, state] of s.states.entries()) {
    const rejected: boolean = s.mode === 'one' && index === 1;
    assert.equal(state.hiPool.kind, 'checked'); expect(state.hiPool.value).toEqual(index === 1 ? [s.members[1].id] : s.members.map(node => node.id));
    for (const edge of state.affiliations) {assert.equal(edge.kind, 'checked'); expect(edge.value).toBe(true);}
    assert.equal(state.outgoing.kind, 'checked'); expect(state.outgoing.value).toBe(true);
    assert.equal(state.incoming.kind, 'checked'); expect(state.incoming.value).toBe(!rejected);
    for (const result of state.local) {
      if (rejected && result.kind === 'candidate-rejected' && result.component === s.v.id) expect(result).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
      else {assert.equal(result.kind, 'checked'); expect(result.obligations).toEqual([]);}
    }
  }
}

describe('two contiguous groups of homogeneous abstract heads', () => {
  it('checks the original four-head complete forest with a nonempty incoming pool', () => {
    checkComplete(old); checkPrerequisites(old);
    expect(old.states[1].root.kind).toBe('choice');
    expect(old.states[1].root.children.map(node => node.element?.id)).toEqual([old.heads[0].id, old.members[1].id, old.heads[2].id, old.heads[3].id]);
    for (const [index, state] of old.states.entries()) for (const [head, pool] of state.pools.entries()) {
      assert.equal(pool.kind, 'checked'); expect(pool.value).toEqual(index === 1 && head !== 1 ? [] : [old.members[head].id]);
    }
  });

  it('coalesces the two contiguous groups at birth while retaining every dormant head and particle', () => {
    checkComplete(two); checkPrerequisites(two);
    expect(two.states[1].root.kind).toBe('choice'); expect(two.states[1].root.occurs).toEqual({min: '1', max: '1'});
    expect(two.states[1].root.children.map(node => node.element?.id)).toEqual([two.members[1].id, two.heads[2].id]);
    for (const [index, state] of two.states.entries()) {
      const expected = index === 1 ? [[two.members[1].id], [], [], []] : [[two.members[0].id, two.members[1].id], [], [two.members[2].id, two.members[3].id], []];
      for (const [head, pool] of state.pools.entries()) {assert.equal(pool.kind, 'checked'); expect(pool.value).toEqual(expected[head]);}
    }
    expect(two.rootParticle.term).toEqual({kind: 'choice', children: [two.uses[0].id, two.uses[2].id]});
    for (const node of [...two.heads, ...two.uses]) expect(two.contexts[0].lookup(node.id)).toEqual(old.contexts[0].lookup(node.id));
    for (const [index, member] of two.members.entries()) {
      const previous = old.members[index]; expect({...member, substitutionGroup: previous.substitutionGroup}).toEqual(previous);
      expect(two.contexts[0].rawElementProperties(member.id)).toEqual(old.contexts[0].rawElementProperties(previous.id));
    }
  });

  it('keeps a direct real-root head as an implicit choice even with a singleton pool', () => {
    checkComplete(direct); checkPrerequisites(direct);
    expect(direct.rootParticle.id).toBe(one.rootParticle.id); expect(direct.rootParticle.identity).toEqual(one.rootParticle.identity);
    expect(direct.rootParticle.occurs).toEqual({min: '1', max: '1'});
    expect(direct.rootParticle.term).toEqual({kind: 'element', declaration: local(direct.heads[0].id)});
    expect(direct.members).toEqual(one.members);
    for (const [index, state] of direct.states.entries()) {
      expect(state.root.kind).toBe('choice'); expect(state.root.children).toHaveLength(index === 1 ? 1 : 4);
      expect(state.root.orderBlocks).toMatchObject([{kind: 'implicit', particle: direct.rootParticle.id, head: direct.heads[0].id}]);
      assert.equal(state.pools[0].kind, 'checked'); assert.equal(state.hiPool.kind, 'checked'); expect(state.pools[0].value).toEqual(state.hiPool.value);
      for (const pool of state.pools.slice(1)) {assert.equal(pool.kind, 'checked'); expect(pool.value).toEqual([]);}
      const stored = state.context.lookup(direct.rootParticle.id); assert.equal(stored.kind, 'found'); expect(stored.node).toEqual(direct.rootParticle);
    }
  });

  // One wrapper rejects this recipe at the genuine V frontier; DIRECT is a separate positive constructor.
  it('rejects the one-group wrapper at the C-cut incoming CHOICE-to-ELEMENT restriction', () => {
    checkPrerequisites(one); const state = one.states[1];
    expect(one.forest).toMatchObject({kind: 'candidate-rejected', component: one.v.id, contextId: state.context.contextId, rule: 'derivation-ok-restriction.5.4'});
    expect(state.root.kind).toBe('element'); expect(state.root.element?.id).toBe(one.members[1].id);
    expect(state.incomingRoot.kind).toBe('choice'); expect(state.incomingRoot.children).toHaveLength(1);
    expect(state.incomingRoot.orderBlocks).toMatchObject([{kind: 'implicit', particle: one.incoming.id}]);
    expect(one.unchanged()).toBe(true);
  });

  it('requires the actual C/p children even when all local head formations pass', () => {
    for (const s of [old, two, one, direct]) expect(s.missing).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence'});
  });
});
