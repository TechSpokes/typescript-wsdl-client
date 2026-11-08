/** Keep component-property equality distinct from nominal derivation in a frozen RAW input prefix. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {effectiveSubstitutionMembers, checkSubstitution} from '../../../src/compiler/schemaTypeRelations.js';
import {checkRawParticleExtension} from '../../../src/compiler/particleExtension.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:raw-property-prefix-host';
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
const tid = (name: string) => globalId('type', {namespace, local: name});
const eid = (name: string) => globalId('element', {namespace, local: name});
type Mode = 'clone' | 'exact-declaration' | 'disjoint-any-tail';

async function subject(mode: Mode) {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/input-property-copy-cut.xsd'), {policy: {fileRoots: [fixtures]}});
  const preparation = prepareSourceSchemaRequest(input); assert.equal(preparation.kind, 'prepared');
  const {request} = preparation, actual = request.actual, sourceSnapshot = JSON.stringify(request.graph);
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const original = (name: string): ComplexTypeNode => {
    const found = actual.lookup(tid(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const x = original('X'), d = original('D');
  const common = {context: x.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const complex = (name: string, method: 'extension' | 'restriction', base: Reference, anonymous = false): ComplexTypeNode => ({...common,
    kind: 'complexType', id: anonymous ? scopedId(d.id, '/raw/' + name, 'type') : tid(name),
    identity: anonymous ? {kind: 'scoped', owner: d.id, path: '/raw/' + name, role: 'type'}
      : {kind: 'global', role: 'type', name: {namespace, local: name}},
    abstract: false, mixed: false, attributes: [], derivation: {kind: method, contentKind: 'complex', base, facets: []}});
  const particle = (owner: string, slot: string, term: ParticleNode['term'], min = '1', max = '1'): ParticleNode => ({...common,
    kind: 'particle', id: scopedId(owner, slot, 'particle'), identity: {kind: 'scoped', owner, path: slot, role: 'particle'}, term, occurs: {min, max}});
  const declaration = (owner: string, slot: string, type: Reference): ElementNode => ({...common, kind: 'element',
    id: scopedId(owner, slot, 'element'), identity: {kind: 'scoped', owner, path: slot, role: 'element'},
    name: {namespace, local: 'gamma'}, type, nillable: false, abstract: false});
  const row = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation!.kind, base: node.derivation!.base}, abstract: node.abstract, final: [], block: [],
    content: node.content ? {kind: 'element-only', particle: node.content} : {kind: 'empty'}, attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
  const elementRow = (node: ElementNode) => ({element: node.id, type: node.type, final: [], block: []});

  // Anonymous b/bprime/p are inherited RAW P rows; source complex bases remain genuine QNames.
  const j0 = complex('J0', 'extension', local(x.id)), b = complex('b', 'extension', local(x.id), true);
  const bp = complex('bprime', 'extension', local(x.id), true), p = complex('p', 'restriction', local(b.id), true);
  const aBare = complex('A', 'restriction', builtin('anyType')), dg = declaration(aBare.id, '/declared-gamma', local(p.id));
  const aLeaf = particle(aBare.id, '/a-leaf', {kind: 'element', declaration: local(dg.id)});
  const aChoice = particle(aBare.id, '/a-choice', {kind: 'choice', children: [aLeaf.id]}, '0', 'unbounded');
  const a: ComplexTypeNode = {...aBare, content: aChoice.id}, q = complex('q', 'restriction', local(a.id));
  const h: ElementNode = {...common, kind: 'element', id: eid('alpha'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'alpha'}},
    name: {namespace, local: 'alpha'}, type: local(bp.id), nillable: false, abstract: true};
  const tBare = complex('T', 'extension', local(q.id)), tHead = particle(tBare.id, '/head', {kind: 'element', declaration: local(h.id)});
  const t: ComplexTypeNode = {...tBare, content: tHead.id};
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(j0.id), facets: []}};
  const old: GraphNode[] = [j0, b, bp, p, a, q, t, dg, h, aLeaf, aChoice, tHead];
  const opening = request.candidate({key: 'input-property-prefix', endpoint, active: [...actual.members, ...old.map(node => node.id)],
    additions: old, rawTypes: [endpoint, j0, b, bp, p, a, q, t].map(row), rawElements: [dg, h].map(elementRow)});
  assert.equal(opening.kind, 'prepared'); const parent = opening.context;

  const mBare = complex('M', 'extension', local(a.id)), pp = complex('pprime', 'restriction', local(bp.id), true);
  const xg = declaration(a.id, '/new-gamma', local(pp.id));
  const prefixLeaf = particle(mBare.id, '/prefix-leaf', {kind: 'element', declaration: local(mode === 'clone' ? xg.id : dg.id)});
  const prefix = particle(mBare.id, '/prefix', {kind: 'choice', children: [prefixLeaf.id]}, '0', 'unbounded');
  const tail = particle(mBare.id, '/tail', mode === 'disjoint-any-tail'
    ? {kind: 'any', wildcard: {namespace: {value: 'urn:re01:disjoint-tail', context: x.context}, processContents: 'skip'}}
    : {kind: 'choice', children: []}, '0', '1');
  const outer = particle(mBare.id, '/outer', {kind: 'sequence', children: [prefix.id, tail.id]});
  const middle: ComplexTypeNode = {...mBare, content: outer.id};
  const member: ElementNode = {...common, kind: 'element', id: eid('gamma'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'gamma'}},
    name: {namespace, local: 'gamma'}, type: local(pp.id), nillable: false, abstract: false, substitutionGroup: local(h.id)};
  const retired: ComplexTypeNode = {...t, derivation: {kind: 'restriction', contentKind: 'complex', base: local(middle.id), facets: []}};
  const fresh: GraphNode[] = [middle, pp, xg, prefixLeaf, prefix, tail, outer, member];
  const built = forkSemanticCandidate(parent, {key: mode, endpoint: retired, active: [...parent.members, ...fresh.map(node => node.id)],
    additions: fresh, rawTypes: [retired, middle, pp].map(row), rawElements: [xg, member].map(elementRow)});
  assert.equal(built.kind, 'prepared'); const child = built.context;
  const root: FiniteRe01EvidenceNode = {id: 'D', parent: actual, context: parent, target: d.id, intermediate: j0.id, ancestor: local(x.id), premises: ['T']};
  const nested: FiniteRe01EvidenceNode = {id: 'T', parent, context: child, target: t.id, intermediate: middle.id, ancestor: local(a.id), premises: []};
  const mapped = (id: string) => {const result = deriveRawComplexContent(child, id); assert.equal(result.kind, 'checked'); return result.view;};
  const mView = mapped(middle.id), aView = mapped(a.id), mv = prepareSemanticParticleView(child, mView, 'restriction');
  const tv = prepareSemanticParticleView(child, mapped(t.id), 'restriction');
  assert.equal(mv.kind, 'checked'); assert.equal(tv.kind, 'checked');
  const owned = (id: string) => {const found = child.lookup(id); assert.equal(found.kind, 'found'); return found.node;};
  return {actual, parent, child, old, fresh, a, b, bp, p, pp, dg, xg, t, tHead, middle, member, h, root, nested,
    sourceUnchanged: () => JSON.stringify(request.graph) === sourceSnapshot,
    forest: verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [root, nested]}),
    missing: verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [{...root, premises: []}]}),
    properties: [[b.id, bp.id], [p.id, pp.id], [dg.id, xg.id]].map(([left, right]) => compareComponentProperties(child, owned(left), owned(right))),
    extension: checkRawParticleExtension(child, mView, aView), restriction: checkParticleRestriction(child, tv.view, mv.view),
    middleRoot: mv.view.root, targetRoot: tv.view.root,
    affiliation: checkSubstitution(child, member.id, h.id, {mode: 'affiliation'}),
    local: [middle.id, pp.id, member.id].map(id => checkComponentConstruction(child, id))};
}

type Subject = Awaited<ReturnType<typeof subject>>;
let clone: Subject, exact: Subject, wildcard: Subject;
beforeAll(async () => {clone = await subject('clone'); exact = await subject('exact-declaration'); wildcard = await subject('disjoint-any-tail');});

function checkLocalPrerequisites(s: Subject) {
  for (const result of s.local) {assert.equal(result.kind, 'checked'); expect(result.obligations).toEqual([]);}
  assert.equal(s.extension.kind, 'checked'); expect(s.extension.value).toBe(true);
  assert.equal(s.affiliation.kind, 'checked'); expect(s.affiliation.value).toBe(true);
  const pool = effectiveSubstitutionMembers(s.child, s.h.id); assert.equal(pool.kind, 'checked'); expect(pool.value).toEqual([s.member.id]);
  // Global-head expansion returns an implicit CHOICE before singleton compositor cleanup.
  expect(s.targetRoot.kind).toBe('choice'); expect(s.targetRoot.occurs).toEqual({min: '1', max: '1'});
  expect(s.targetRoot.orderBlocks.some(block => block.kind === 'implicit' && block.particle === s.tHead.id && block.head === s.h.id)).toBe(true);
}

describe('input PROPERTY copy at a distinct nominal cut', () => {
  // The two negatives reject these recipes; they do not assert absence of another finite witness.
  it('checks the complete D/T forest with a property-equivalent cloned prefix TYPE', () => {
    checkLocalPrerequisites(clone); assert.equal(clone.forest.kind, 'checked-candidate');
    expect(new Set(clone.forest.actualComponents.map(item => item.component))).toEqual(new Set(clone.actual.members));
    expect(clone.forest.proof.map(step => step.target).sort()).toEqual([clone.root.target, clone.t.id].sort());
    for (const step of clone.forest.proof) {
      const owner = step.contextId === clone.parent.contextId ? clone.parent : clone.child;
      const checked = new Set(step.components.map(item => item.component));
      for (const id of owner.members) if (!clone.actual.members.includes(id)) expect(checked.has(id)).toBe(true);
      for (const receipt of step.components) {expect(receipt.contextId).toBe(owner.contextId); expect(receipt.obligations).toEqual([]);}
    }
    for (const pair of clone.properties) {assert.equal(pair.kind, 'checked'); expect(pair.value).toBe(true); expect(pair.scalarObligations).toEqual([]);}
    assert.equal(clone.restriction.kind, 'checked'); expect(clone.restriction.value).toBe(true);
    expect(clone.middleRoot.kind).toBe('choice'); expect(clone.middleRoot.occurs).toEqual({min: '0', max: 'unbounded'});
    expect(clone.sourceUnchanged()).toBe(true);
  });

  it('keeps the inherited raw TYPE and scope dependencies full in both proof contexts', () => {
    assert.equal(clone.forest.kind, 'checked-candidate');
    for (const step of clone.forest.proof) {
      const checked = new Set(step.components.map(item => item.component));
      for (const node of [clone.a, clone.b, clone.bp, clone.p, clone.dg]) expect(checked.has(node.id)).toBe(true);
    }
    for (const node of clone.old) if (node.id !== clone.t.id) expect(clone.child.lookup(node.id)).toEqual(clone.parent.lookup(node.id));
    expect(clone.xg.identity).toMatchObject({kind: 'scoped', owner: clone.a.id});
    expect(clone.child.rawElementProperties(clone.dg.id)?.type).toEqual(local(clone.p.id));
    expect(clone.child.rawElementProperties(clone.xg.id)?.type).toEqual(local(clone.pp.id));
    expect(clone.child.rawElementProperties(clone.member.id)?.type).toEqual(local(clone.pp.id));
    const initialPool = effectiveSubstitutionMembers(clone.parent, clone.h.id); assert.equal(initialPool.kind, 'checked'); expect(initialPool.value).toEqual([]);
  });

  it('rejects exact declaration reuse at the incoming restriction despite valid raw extension', () => {
    checkLocalPrerequisites(exact); expect(exact.middleRoot.kind).toBe('choice');
    assert.equal(exact.restriction.kind, 'checked'); expect(exact.restriction.value).toBe(false);
    expect(exact.forest).toMatchObject({kind: 'candidate-rejected', component: exact.t.id, rule: 'derivation-ok-restriction.5.4'});
  });

  it('rejects a surviving disjoint ANY tail at CHOICE-to-SEQUENCE restriction dispatch', () => {
    checkLocalPrerequisites(wildcard); expect(wildcard.middleRoot.kind).toBe('sequence'); expect(wildcard.middleRoot.children).toHaveLength(2);
    assert.equal(wildcard.restriction.kind, 'checked'); expect(wildcard.restriction.value).toBe(false);
    expect(wildcard.forest).toMatchObject({kind: 'candidate-rejected', component: wildcard.t.id, rule: 'derivation-ok-restriction.5.4'});
  });

  it('requires the genuine T child in every supplied reconstruction', () => {
    for (const s of [clone, exact, wildcard]) expect(s.missing).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.t.id});
  });
});
