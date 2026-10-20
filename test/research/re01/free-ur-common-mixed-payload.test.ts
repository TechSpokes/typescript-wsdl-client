/** Rebuild a nominally observed fresh family while preserving its complete NP child geometry. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveBuiltinAnyTypeContent, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const directory = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:free-ur-common-mixed-payload';
const typeId = (name: string) => globalId('type', {namespace, local: name});
const elementId = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
const anyType = builtin('anyType');
const wildcard: NonNullable<RawComplexTypeProperties['wildcard']> = {
  namespace: {kind: 'not', namespaces: []}, processContents: 'lax', sources: [],
};

async function subject() {
  const input = await loadSchemaInput(path.join(directory, 'xsd/recovery/free-ur-common-mixed-payload.xsd'),
    {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual, originalGraph = JSON.stringify(request.graph);
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const original = (name: string): ComplexTypeNode => {
    const found = actual.lookup(typeId(name)); assert.equal(found.kind, 'found');
    assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const a = original('A'), b = original('B'), d = original('D');
  const common = {context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const complex = (name: string, method: 'extension' | 'restriction', base: Reference, content?: string): ComplexTypeNode => ({
    ...common, kind: 'complexType', id: typeId(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    mixed: content !== undefined, abstract: false, attributes: [], content,
    derivation: {kind: method, contentKind: 'complex', base, facets: []},
  });
  const particle = (owner: string, suffix: string, term: ParticleNode['term'], min = '1', max = '1'): ParticleNode => ({
    ...common, kind: 'particle', id: scopedId(owner, suffix, 'particle'),
    identity: {kind: 'scoped', owner, path: suffix, role: 'particle'}, occurs: {min, max}, term,
  });
  const declaration = (owner: string, name: string): ElementNode => ({...common, kind: 'element',
    id: scopedId(owner, '/' + name, 'element'), identity: {kind: 'scoped', owner, path: '/' + name, role: 'element'},
    name: {namespace: '', local: name}, type: builtin('string'), nillable: false, abstract: false});
  const t0 = complex('T0', 'restriction', anyType);
  const leafA = declaration(typeId('T1'), 'a'), leafB = declaration(typeId('T2'), 'b');
  const pa = particle(typeId('T1'), '/a-use', {kind: 'element', declaration: local(leafA.id)}, '0');
  const pb = particle(typeId('T2'), '/b-use', {kind: 'element', declaration: local(leafB.id)}, '0');
  const root1 = particle(typeId('T1'), '/content', {kind: 'sequence', children: [pa.id]});
  const root2 = particle(typeId('T2'), '/content', {kind: 'sequence', children: [root1.id, pb.id]});
  const t1 = complex('T1', 'extension', local(t0.id), root1.id), t2 = complex('T2', 'extension', local(t1.id), root2.id);
  const oldW = particle(typeId('U'), '/wildcard', {kind: 'any', wildcard: {
    namespace: {value: '##any', context: a.context}, processContents: 'lax'}}, '0', 'unbounded');
  const oldQ = particle(typeId('U'), '/inner', {kind: 'sequence', children: [oldW.id]});
  const oldP = particle(typeId('U'), '/content', {kind: 'sequence', children: [oldQ.id]});
  const u = complex('U', 'extension', anyType, oldP.id), v = complex('V', 'extension', local(t0.id), root2.id);
  const observe = (name: string, type: string): ElementNode => ({...common, kind: 'element', id: elementId(name),
    identity: {kind: 'global', role: 'element', name: {namespace, local: name}}, name: {namespace, local: name},
    type: local(type), abstract: false, nillable: false, substitutionGroup: local(elementId('h')),
    value: {kind: 'fixed', lexical: {value: 'v', context: a.context}}});
  // These global TYPE paths protect the family nominally; the rebuild cannot erase or rebase its E identities.
  const m = observe('M', t2.id), mu = observe('Mu', u.id);
  const oldScaffolds: GraphNode[] = [leafA, leafB, pa, pb, root1, root2, oldW, oldQ, oldP];
  const w = particle(t0.id, '/common-wildcard', {kind: 'any', wildcard: {
    namespace: {value: '##any', context: a.context}, processContents: 'lax'}}, '0', 'unbounded');
  const q = particle(t0.id, '/common-inner', {kind: 'sequence', children: [w.id]});
  const p = particle(t0.id, '/common-content', {kind: 'sequence', children: [q.id]});
  const row = (node: ComplexTypeNode, universal = false): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    content: node.content ? {kind: 'mixed', particle: node.content} : {kind: 'empty'}, abstract: false, final: [], block: [],
    attributeUses: [], ...(universal ? {wildcard} : {}),
    provenance: {kind: 'hypothetical-abstract', originals: actual.lookup(node.id).kind === 'found' ? [node.id] : []}});
  const originalRows = request.graph.nodes.flatMap(node => node.kind === 'complexType' ? [row(node)] : []);
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
  const make = (rebuild: boolean, singleWrapper = false) => {
    const selected = (node: ComplexTypeNode): ComplexTypeNode => rebuild ? {...node, mixed: true, content: singleWrapper ? q.id : p.id} : node;
    const family = [t0, t1, t2, u].map(selected), middle = selected(v);
    const additions: GraphNode[] = [...family, m, mu, ...oldScaffolds, ...(rebuild ? [w, q, p] : [])];
    const raw = (node: ComplexTypeNode) => row(node, rebuild || node.id === u.id);
    const built = request.candidate({key: rebuild ? singleWrapper ? 'one-wrapper' : 'common-payload' : 'old-payload',
      active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint,
      rawTypes: [...originalRows.filter(item => item.type !== d.id), row(endpoint), ...family.map(raw)],
      rawElements: [m, mu, leafA, leafB].map(node => ({element: node.id, type: node.type, final: [], block: []}))});
    assert.equal(built.kind, 'prepared', JSON.stringify(built)); const parent = built.context;
    const childEndpoint: ComplexTypeNode = {...selected(t2), derivation: {kind: 'restriction', contentKind: 'complex', base: local(v.id), facets: []}};
    const child = forkSemanticCandidate(parent, {key: 'T2-child', active: [...parent.members, v.id], additions: [middle], endpoint: childEndpoint,
      rawTypes: [raw(childEndpoint), raw(middle)]});
    assert.equal(child.kind, 'prepared', JSON.stringify(child));
    const root: FiniteRe01EvidenceNode = {id: 'D', parent: actual, context: parent, target: d.id,
      intermediate: b.id, ancestor: local(a.id), premises: ['T2']};
    const nested: FiniteRe01EvidenceNode = {id: 'T2', parent, context: child.context, target: t2.id,
      intermediate: v.id, ancestor: local(t0.id), premises: []};
    const result = verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [root, nested]});
    const missing = () => verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [{...root, premises: []}]});
    return {parent, child: child.context, result, missing, additions, family, middle};
  };
  return {request, actual, originalGraph, make, t0, t1, t2, u, v, m, mu, oldScaffolds, w, q, p};
}

type Subject = Awaited<ReturnType<typeof subject>>;
function complete(s: Subject, value: ReturnType<Subject['make']>) {
  assert.equal(value.result.kind, 'checked-candidate', JSON.stringify(value.result));
  expect(new Set(value.result.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
  expect(value.result.actualComponents).toHaveLength(5); expect(value.result.proof).toHaveLength(2);
  for (const step of value.result.proof) {
    const context = step.contextId === value.parent.contextId ? value.parent : value.child;
    const checked = new Set(step.components.map(item => item.component));
    const originalClosure = context === value.parent ? [typeId('A'), typeId('B'), typeId('D'), elementId('h')] : [elementId('h')];
    expect(new Set([...checked].filter(id => s.actual.members.includes(id)))).toEqual(new Set(originalClosure));
    expect(checked.size).toBe(context.members.length - s.actual.members.length + originalClosure.length);
    for (const id of context.members) if (!s.actual.members.includes(id)) expect(checked.has(id)).toBe(true);
    for (const node of value.additions) expect(context.members).toContain(node.id);
    const nonprimitive = step.components.filter(item => item.re01 && !item.re01.primitive).map(item => item.component);
    expect(nonprimitive).toEqual(context === value.parent ? [s.t2.id] : []);
    for (const node of [s.t1, s.u]) expect(step.components.find(item => item.component === node.id)?.re01?.primitive).toBe(true);
    for (const component of step.components) {
      expect(component.contextId).toBe(context.contextId); expect(component.obligations).toEqual([]);
    }
    if (context === value.child) expect(step.components.find(item => item.component === s.v.id)?.re01?.primitive).toBe(true);
  }
  for (const context of [value.parent, value.child]) {
    const members = effectiveSubstitutionMembers(context, elementId('h')); assert.equal(members.kind, 'checked');
    expect(members.value).toContain(s.m.id); expect(members.value).toContain(s.mu.id);
    const own = deriveRawComplexContent(context, s.u.id), native = deriveBuiltinAnyTypeContent(context, s.u.id);
    assert.equal(own.kind, 'checked'); assert.equal(native.kind, 'checked');
    expect(own.view.synthetic).toEqual([]); expect(own.view.urTypeWildcards).toEqual([]);
    expect(native.view.urTypeWildcards).toHaveLength(1);
  }
  expect(value.result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
}

describe('common mixed payload for a nominally observed fresh family', () => {
  it('rebuilds two complete nodes with the same identities, method/base graph, fixed observers and inherited scaffolds', async () => {
    const s = await subject(), old = s.make(false); complete(s, old);
    const rebuilt = s.make(true); complete(s, rebuilt);
    expect([old.parent.members.length, old.child.members.length]).toEqual([20, 21]);
    expect([rebuilt.parent.members.length, rebuilt.child.members.length]).toEqual([23, 24]);
    const added = new Set([s.w.id, s.q.id, s.p.id]);
    for (const [before, after] of [[old.parent, rebuilt.parent], [old.child, rebuilt.child]] as const) {
      expect(new Set(after.members.filter(id => !before.members.includes(id)))).toEqual(added);
      for (const node of [...s.oldScaffolds, s.m, s.mu]) expect(after.lookup(node.id)).toEqual(before.lookup(node.id));
      for (const node of [s.t0, s.t1, s.t2, s.u, ...(before === old.child ? [s.v] : [])]) {
        const left = before.lookup(node.id), right = after.lookup(node.id); assert.equal(left.kind, 'found'); assert.equal(right.kind, 'found');
        assert.equal(left.node.kind, 'complexType'); assert.equal(right.node.kind, 'complexType');
        expect({...right.node, content: left.node.content, mixed: left.node.mixed}).toEqual(left.node);
        expect(after.rawTypeProperties(node.id)?.content).toEqual({kind: 'mixed', particle: s.p.id});
        expect(after.rawTypeProperties(node.id)?.wildcard).toEqual(wildcard);
      }
    }
    expect(old.child.rawTypeProperties(s.t2.id)?.derivation).toEqual(rebuilt.child.rawTypeProperties(s.t2.id)?.derivation);
    expect(JSON.stringify(s.request.graph)).toBe(s.originalGraph);
  });

  it('still requires the exact T2 child after the before-birth payload reconstruction', async () => {
    const s = await subject(), rebuilt = s.make(true); complete(s, rebuilt);
    expect(rebuilt.missing()).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.t2.id});
  });

  it('rejects the single-wrapper ordinary payload on the genuinely observed direct anyType extension', async () => {
    const s = await subject(), bad = s.make(true, true);
    expect(bad.result).toMatchObject({kind: 'candidate-rejected', rule: 'cos-particle-extend', component: s.u.id});
    expect(checkComponentConstruction(bad.parent, s.u.id)).toMatchObject({kind: 'candidate-rejected', rule: 'cos-particle-extend'});
    for (const node of [s.w, s.q, s.p, ...s.oldScaffolds]) expect(bad.parent.members).toContain(node.id);
    expect(bad.parent.lookup(s.mu.id)).toMatchObject({kind: 'found', node: s.mu});
  });
});
