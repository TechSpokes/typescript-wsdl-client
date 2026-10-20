/** Finite positive normalization controls, not a general bound or search. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures');
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};

async function passiveSeed() {
  const namespace = 'urn:recovery:anchored-helper';
  const type = (name: string) => globalId('type', {namespace, local: name}), element = (name: string) => globalId('element', {namespace, local: name});
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/anchored-helper-support.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const get = (name: string): ComplexTypeNode => {const found = actual.lookup(type(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;};
  const a = get('A'), b = get('B'), r = get('R'), x = get('X'); assert.ok(a.content && x.content);
  const u: ComplexTypeNode = {...b, id: type('U'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'U'}},
    derivation: {kind: 'extension', contentKind: 'complex', base: local(b.id), facets: []}};
  const endpoint: ComplexTypeNode = {...x, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    content: node.id === r.id ? {kind: 'empty'} : {kind: 'element-only', particle: node.id === x.id ? x.content! : a.content!},
    abstract: false, final: [], block: [], attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: actual.sourceNode(node.id) ? [node.id] : []}});
  const make = (count: number) => {
    const pool: ElementNode[] = Array.from({length: count}, (_, index) => {
      const name = {namespace, local: `M${index + 1}`};
      return {kind: 'element', id: element(name.local), identity: {kind: 'global', role: 'element', name}, name, context: a.context,
        declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [], type: local(u.id), nillable: false, abstract: false, substitutionGroup: local(element('H'))};
    });
    const additions = [u, ...pool], root = request.candidate({key: 'passive-pool-' + count, active: [...actual.members, ...additions.map(node => node.id)], additions,
      endpoint, rawTypes: [raw(a), raw(b), raw(r), raw(endpoint), raw(u)], rawElements: pool.map(member => ({element: member.id, final: [], block: []}))}); assert.equal(root.kind, 'prepared');
    const restricted: ComplexTypeNode = {...u, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
    const child = forkSemanticCandidate(root.context, {key: 'passive-child-' + count, active: root.context.members, endpoint: restricted, rawTypes: [raw(restricted)]}); assert.equal(child.kind, 'prepared');
    const result = verifyFiniteRe01Evidence(actual, x.id, {root: 'root', nodes: [
      {id: 'root', parent: actual, context: root.context, target: x.id, intermediate: b.id, ancestor: local(a.id), premises: ['helper']},
      {id: 'helper', parent: root.context, context: child.context, target: u.id, intermediate: b.id, ancestor: local(a.id), premises: []},
    ]}); assert.equal(result.kind, 'checked-candidate', JSON.stringify(result));
    const profiles = pool.map(member => [root.context, child.context].flatMap(context => ['H', 'Q'].map(head => {
      const members = effectiveSubstitutionMembers(context, element(head)); assert.equal(members.kind, 'checked'); return members.value.includes(member.id);
    })));
    return {root: root.context, child: child.context, result, pool, profiles, additions};
  };
  return {actual, element, u, make};
}

async function freshHeadSeed() {
  const namespace = 'urn:recovery:fresh-head-observation';
  const type = (name: string) => globalId('type', {namespace, local: name}), element = (name: string) => globalId('element', {namespace, local: name});
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/fresh-head-observation-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const get = (name: string): ComplexTypeNode => {const found = actual.lookup(type(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;};
  const a = get('A'), b = get('B'), d = get('D'); assert.ok(d.content);
  const helper = (name: string, base: Reference): ComplexTypeNode => ({...b, id: type(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    derivation: {kind: 'extension', contentKind: 'complex', base, facets: []}});
  const u = helper('U', local(b.id)), e0 = helper('E', local(a.id)), particle = scopedId(e0.id, '/head-use', 'particle');
  const e: ComplexTypeNode = {...e0, content: particle};
  const k: ElementNode = {kind: 'element', id: element('k'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'k'}},
    name: {namespace, local: 'k'}, context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [], type: local(b.id), nillable: false, abstract: false};
  const m: ElementNode = {...k, id: element('m'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'm'}},
    name: {namespace, local: 'm'}, type: local(u.id), substitutionGroup: local(k.id)};
  const use: ParticleNode = {kind: 'particle', id: particle, identity: {kind: 'scoped', owner: e.id, path: '/head-use', role: 'particle'}, context: a.context,
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [], occurs: {min: '2', max: '2'}, term: {kind: 'element', declaration: local(k.id)}};
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(e.id), facets: []}};
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    content: node.content ? {kind: 'element-only', particle: node.content} : {kind: 'empty'}, abstract: false, final: [], block: [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.sourceNode(node.id) ? [node.id] : []}});
  const make = (withMember: boolean) => {
    const additions: GraphNode[] = [e, u, use, k, ...(withMember ? [m] : [])];
    const root = request.candidate({key: 'fresh-head-' + withMember, active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint,
      rawTypes: [raw(a), raw(b), raw(endpoint), raw(e), raw(u)], rawElements: [{element: k.id, final: [], block: ['restriction']}, ...(withMember ? [{element: m.id, final: [], block: []}] : [])]}); assert.equal(root.kind, 'prepared');
    const restricted: ComplexTypeNode = {...u, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
    const child = forkSemanticCandidate(root.context, {key: 'fresh-head-child-' + withMember, active: root.context.members, endpoint: restricted, rawTypes: [raw(restricted)]}); assert.equal(child.kind, 'prepared');
    const result = verifyFiniteRe01Evidence(actual, d.id, {root: 'root', nodes: [
      {id: 'root', parent: actual, context: root.context, target: d.id, intermediate: e.id, ancestor: local(a.id), premises: ['helper']},
      {id: 'helper', parent: root.context, context: child.context, target: u.id, intermediate: b.id, ancestor: local(a.id), premises: []},
    ]});
    const members = [root.context, child.context].map(context => {const checked = effectiveSubstitutionMembers(context, k.id); assert.equal(checked.kind, 'checked'); return checked.value;});
    return {root: root.context, child: child.context, result, members, additions};
  };
  return {request, actual, a, b, d, e, u, k, m, use, endpoint, raw, make};
}

describe('scoped finite-forest observation pruning', () => {
  it('reconstructs a passive birth batch with two retained identities and complete changing-context support', async () => {
    const s = await passiveSeed(), padded = s.make(5), reduced = s.make(2);
    expect(padded.root.members).toHaveLength(30); expect(reduced.root.members).toHaveLength(27);
    expect(reduced.pool.map(member => member.id)).toEqual(padded.pool.slice(0, 2).map(member => member.id));
    expect(padded.profiles).toEqual(Array.from({length: 5}, () => [true, false, false, true]));
    expect(reduced.profiles).toEqual(padded.profiles.slice(0, 2));
    for (const sample of [padded, reduced]) {
      expect(sample.result.proof).toHaveLength(2);
      expect(new Set(sample.result.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
      const root = sample.result.proof.find(step => step.contextId === sample.root.contextId), child = sample.result.proof.find(step => step.contextId === sample.child.contextId);
      assert.ok(root && child);
      expect(new Set(root.correspondence.fresh)).toEqual(new Set(sample.additions.map(node => node.id)));
      for (const step of sample.result.proof) for (const member of sample.pool) expect(step.components.some(item => item.component === member.id)).toBe(true);
      expect(child.target).toBe(s.u.id);
    }
    // Both forests are rebuilt from the SAME Γ. No issued child's inherited
    // members are deleted and no root relation receipt is installed in a child.
  });

  it('refutes original-global-head-only deletion while retaining a complete fresh-head forest', async () => {
    const s = await freshHeadSeed(), originalElements = s.actual.members.flatMap(id => {const found = s.actual.lookup(id); return found.kind === 'found' && found.node.kind === 'element' ? [found.node] : [];});
    expect(originalElements).toHaveLength(2); expect(originalElements.every(node => node.identity.kind === 'scoped' && node.name.local === 'k')).toBe(true);
    const kept = s.make(true), deleted = s.make(false); assert.equal(kept.result.kind, 'checked-candidate', JSON.stringify(kept.result));
    expect(kept.members.map(members => new Set(members))).toEqual([new Set([s.k.id, s.m.id]), new Set([s.k.id])]);
    expect(kept.root.members).toHaveLength(13); expect(kept.child.members).toHaveLength(13); expect(kept.result.proof).toHaveLength(2);
    expect(new Set(kept.result.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
    for (const step of kept.result.proof) for (const node of kept.additions) expect(step.components.some(item => item.component === node.id)).toBe(true);
    const child = kept.result.proof.find(step => step.contextId === kept.child.contextId); assert.ok(child);
    expect(child.components.some(item => item.component === s.d.id)).toBe(false);
    expect(deleted.root.members).toHaveLength(12); expect(deleted.members.map(members => [...members])).toEqual([[s.k.id], [s.k.id]]);
    expect(deleted.result).toMatchObject({kind: 'candidate-rejected', component: s.d.id, rule: 'derivation-ok-restriction.5.4'});
    // K's global identity is fresh but its QName is an ORIGINAL LOCAL role.
    // The failed same-structure deletion does not refute another SOME witness.
  });

  it('rebuilds another complete root when pointwise recolouring loses a consumed fresh head member', async () => {
    const s = await freshHeadSeed(), original = s.make(true);
    assert.equal(original.result.kind, 'checked-candidate', JSON.stringify(original.result));
    const restricted: ComplexTypeNode = {...s.u, derivation: {kind: 'restriction', contentKind: 'complex', base: local(s.b.id), facets: []}};
    const recoloured = s.request.candidate({key: 'first-birth-recoloured-head', active: original.root.members,
      additions: original.additions.map(node => node.id === s.u.id ? restricted : node), endpoint: s.endpoint,
      rawTypes: [s.raw(s.a), s.raw(s.b), s.raw(s.endpoint), s.raw(s.e), s.raw(restricted)],
      rawElements: [{element: s.k.id, final: [], block: ['restriction']}, {element: s.m.id, final: [], block: []}]});
    assert.equal(recoloured.kind, 'prepared');
    const verifyRoot = (context: typeof s.actual) => verifyFiniteRe01Evidence(s.actual, s.d.id, {root: 'root', nodes: [
      {id: 'root', parent: s.actual, context, target: s.d.id, intermediate: s.e.id, ancestor: local(s.a.id), premises: []},
    ]});
    expect(verifyRoot(recoloured.context)).toMatchObject({kind: 'candidate-rejected',
      component: s.d.id, rule: 'derivation-ok-restriction.5.4'});

    // A is empty in THIS source, so E may select exact original D.content.
    // This new root never introduces the old helpers; no inherited row is removed.
    const e: ComplexTypeNode = {...s.e, content: s.d.content};
    const rebuilt = s.request.candidate({key: 'exact-original-content-alternative', active: [...s.actual.members, e.id],
      additions: [e], endpoint: s.endpoint, rawTypes: [s.raw(s.a), s.raw(s.b), s.raw(s.endpoint), s.raw(e)]});
    assert.equal(rebuilt.kind, 'prepared');
    const result = verifyRoot(rebuilt.context);
    assert.equal(result.kind, 'checked-candidate', JSON.stringify(result));
    expect(result.proof).toHaveLength(1);
    expect(new Set(result.actualComponents.map(receipt => receipt.component))).toEqual(new Set(s.actual.members));
    expect(new Set(result.proof[0]!.correspondence.fresh)).toEqual(new Set([e.id]));
    expect(result.proof[0]!.components.some(receipt => receipt.component === e.id)).toBe(true);
    expect(rebuilt.context.members).toEqual(expect.arrayContaining([...s.actual.members]));
    expect(rebuilt.context.members).toHaveLength(s.actual.members.length + 1);
    expect(rebuilt.context.lookup(s.d.id)).toEqual(original.root.lookup(s.d.id));
  });
});
