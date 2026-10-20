/** Preserve one observed original-target copy and erase its private recursive descendants before birth. */
import assert from 'node:assert/strict';
import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle, deriveOriginalComplexPropertyContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import type {SemanticParticle} from '../../../src/compiler/particleSemanticView.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

// Reviewed supplied-retained-role control: private-recursive-cone review ac29e13f.
// No universal privacy extractor, observed-role bound or general copy fold is asserted.
const directory = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:private-observed-copy-erasure';
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
const typeId = (name: string) => globalId('type', {namespace, local: name});
const filename = path.join(directory, 'xsd/recovery/private-observed-copy-erasure.xsd');
async function subject() {
  const loaded = await loadSchemaInput(filename, {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual; assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const originalGraph = JSON.stringify(request.graph);
  const get = (id: string): GraphNode => {const found = actual.lookup(id); assert.equal(found.kind, 'found'); return found.node;};
  const original = (name: string): ComplexTypeNode => {const node = get(typeId(name)); assert.equal(node.kind, 'complexType'); return node;};
  const p = original('P'), r = original('R'), d = original('D'); assert.ok(p.content && r.content);
  const group = get(globalId('group', {namespace, local: 'G'})); assert.equal(group.kind, 'group');
  const groupRoot = get(group.content); assert.equal(groupRoot.kind, 'particle'); assert.equal(groupRoot.term.kind, 'sequence');
  const q = request.graph.nodes.find((node): node is ComplexTypeNode => node.kind === 'complexType'
    && node.identity.kind === 'scoped' && node.derivation?.kind === 'extension'); assert.ok(q && q.content);
  const next = request.graph.nodes.find((node): node is ElementNode => node.kind === 'element' && node.name.local === 'next'); assert.ok(next);
  assert.equal(next.type.kind, 'local'); assert.equal(next.type.target, q.id);
  const hParticle = get(groupRoot.term.children[0]); assert.equal(hParticle.kind, 'particle');
  const nextParticle = get(groupRoot.term.children[1]); assert.equal(nextParticle.kind, 'particle');
  const endParticle = get(groupRoot.term.children[2]); assert.equal(endParticle.kind, 'particle');
  const nodeId = (pathValue: string, role: string) => scopedId(group.id, pathValue, role);
  const particle = (pathValue: string, term: ParticleNode['term'], occurs = {min: '1', max: '1'}): ParticleNode => ({...groupRoot,
    id: nodeId(pathValue, 'particle'), identity: {kind: 'scoped', owner: group.id, path: pathValue, role: 'particle'}, occurs, term});
  const declaration = (pathValue: string, type: string): ElementNode => ({...next, id: nodeId(pathValue, 'element'),
    identity: {kind: 'scoped', owner: group.id, path: pathValue, role: 'element'}, type: local(type)});
  const cycleLength = 3;
  const decls = Array.from({length: cycleLength}, (_, i) => declaration(`/cycle/${i}/next`, 'placeholder'));
  const types = decls.map((owner, i): ComplexTypeNode => ({...q, id: scopedId(owner.id, '/copy-type', 'type'),
    identity: {kind: 'scoped', owner: owner.id, path: '/copy-type', role: 'type'},
    content: nodeId(`/cycle/${i}/content`, 'particle')}));
  const cone: GraphNode[] = [];
  for (let i = 0; i < cycleLength; i++) {
    const selected = {...decls[i], type: local(types[(i + 1) % cycleLength].id)};
    const copiedH = particle(`/cycle/${i}/H`, hParticle.term);
    const copiedNext = particle(`/cycle/${i}/next-position`, {kind: 'element', declaration: local(selected.id)}, nextParticle.occurs);
    const prefix = particle(`/cycle/${i}/prefix`, {kind: 'sequence', children: [copiedH.id, copiedNext.id, endParticle.id]});
    const content = particle(`/cycle/${i}/content`, {kind: 'sequence', children: [prefix.id, q.content]});
    cone.push(selected, types[i], copiedH, copiedNext, prefix, content);
  }
  const privateTail = cone.slice(6), coneIds = new Set(privateTail.map(node => node.id));
  const entry = declaration('/entry/next', types[0].id);
  const entryH = particle('/entry/H', hParticle.term);
  const entryNext = particle('/entry/next-position', {kind: 'element', declaration: local(entry.id)}, nextParticle.occurs);
  const entryPrefix = particle('/entry/prefix', {kind: 'sequence', children: [entryH.id, entryNext.id, endParticle.id]});
  const extension = (name: string, base: string, content: string): ComplexTypeNode => ({...p, id: typeId(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, content,
    derivation: {kind: 'extension', contentKind: 'complex', base: local(base), facets: []}});
  const eRoot = extension('E-root', p.id, nodeId('/entry/wrapper', 'particle'));
  const eContent = particle('/entry/wrapper', {kind: 'sequence', children: [entryPrefix.id]});
  const v = extension('V', r.id, r.content), eChild = extension('E-V', p.id, p.content);
  const raw = (node: ComplexTypeNode, content?: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({
    type: node.id, targetNamespace: namespace, derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    content: content ?? (node.content ? {kind: 'element-only', particle: node.content} : {kind: 'empty'}),
    abstract: false, final: [], block: [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.lookup(node.id).kind === 'found' ? [node.id] : []},
  });
  const originalRows = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const mapped = deriveActualComplexContent(actual, node.id); assert.equal(mapped.kind, 'checked');
    if ('particle' in mapped.view.content) {const issued = deriveOriginalComplexParticle(actual, node.id); assert.equal(issued.kind, 'checked'); return [raw(node, issued.content)];}
    return [raw(node, mapped.view.content)];
  });
  const keys = (context: SemanticContext, type: string): readonly string[] => {
    const mapped = deriveOriginalComplexPropertyContent(context, type); assert.equal(mapped.kind, 'checked');
    const semantic = prepareSemanticParticleView(context, mapped.view, 'restriction'); assert.equal(semantic.kind, 'checked');
    const result = new Set<string>(), stack: SemanticParticle[] = [semantic.view.root];
    while (stack.length) {
      const current = stack.pop()!;
      for (const block of current.orderBlocks) if (block.kind === 'implicit') result.add(JSON.stringify([block.particle, block.head]));
      stack.push(...current.children);
    }
    return [...result].sort();
  };
  const retainedOwnerObserver: ParticleNode = {...entryH, id: scopedId(types[1].id, '/retained-owner-observer', 'particle'),
    identity: {kind: 'scoped', owner: types[1].id, path: '/retained-owner-observer', role: 'particle'}};
  assert.equal(retainedOwnerObserver.identity.kind, 'scoped');
  assert.ok(coneIds.has(retainedOwnerObserver.identity.owner));
  for (const target of coneIds) assert.ok(!JSON.stringify(retainedOwnerObserver.term).includes(target));
  const make = (erase: boolean, withRetainedOwnerObserver = false) => {
    const selectedCone = erase ? cone.slice(0, 6).map(node => node.id === decls[0].id ? {...node as ElementNode, type: local(q.id)} : node) : cone;
    const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(types[0].id), facets: []}};
    const additions: GraphNode[] = [...selectedCone, entry, entryH, entryNext, entryPrefix, eRoot, eContent, v,
      ...(withRetainedOwnerObserver ? [retainedOwnerObserver] : [])];
    const dRow = originalRows.find(row => row.type === d.id); assert.ok(dRow);
    const rows = [...originalRows.filter(row => row.type !== d.id), raw(endpoint, dRow.content), raw(eRoot), raw(v), ...(erase ? types.slice(0, 1) : types).map(type => raw(type))];
    if (erase) {
      const audit = (value: unknown): void => {
        if (typeof value === 'string') assert.ok(!coneIds.has(value), 'retained canonical/raw/owner field still selects erased cone');
        else if (Array.isArray(value)) value.forEach(audit);
        else if (value && typeof value === 'object') Object.values(value).forEach(audit);
      };
      audit({additions, rows, endpoint, eChild,
        evidenceParameters: [{target: d.id, intermediate: types[0].id, ancestor: local(p.id)}, {target: v.id, intermediate: eChild.id, ancestor: local(p.id)}]});
    }
    const active = [...actual.members, ...additions.map(node => node.id)];
    const built = request.candidate({key: erase ? 'private-cone-erased' : 'recursive-copy-cycle', active, additions, endpoint,
      rawTypes: rows, rawElements: additions.flatMap(node => node.kind === 'element' ? [{element: node.id, type: node.type, final: [], block: []}] : [])});
    assert.equal(built.kind, 'prepared', JSON.stringify(built));
    const childEndpoint: ComplexTypeNode = {...v, derivation: {kind: 'restriction', contentKind: 'complex', base: local(eChild.id), facets: []}};
    const child = forkSemanticCandidate(built.context, {key: 'V-child', active: [...active, eChild.id], additions: [eChild], endpoint: childEndpoint,
      rawTypes: [raw(eChild), raw(childEndpoint)]}); assert.equal(child.kind, 'prepared', JSON.stringify(child));
    const forest = verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [
      {id: 'D', parent: actual, context: built.context, target: d.id, intermediate: types[0].id, ancestor: local(p.id), premises: ['V']},
      {id: 'V', parent: built.context, context: child.context, target: v.id, intermediate: eChild.id, ancestor: local(p.id), premises: []},
    ]}); assert.equal(forest.kind, 'checked-candidate', JSON.stringify(forest));
    assert.deepEqual(new Set(forest.actualComponents.map(item => item.component)), new Set(actual.members));
    for (const step of forest.proof) {
      const context: SemanticContext = step.contextId === built.context.contextId ? built.context : child.context;
      const checked: Set<string> = new Set(step.components.map(item => item.component));
      assert.ok(checked.has(q.id), 'original q support is genuine full closure, not property-only');
      for (const id of context.members) if (!actual.members.includes(id)) assert.ok(checked.has(id), 'fresh mandatory root escaped: ' + id);
      for (const id of additions.map(node => node.id)) assert.ok(context.members.includes(id), 'inherited fresh root omitted in a child');
      for (const removed of privateTail) assert.equal(context.members.includes(removed.id), !erase, 'private tail membership differs from the selected birth');
    }
    for (const type of erase ? types.slice(0, 1) : types) {
      const looked: ReturnType<SemanticContext['lookup']> = built.context.lookup(type.id); assert.equal(looked.kind, 'found');
      const eq = compareComponentProperties(built.context, looked.node, q); assert.equal(eq.kind, 'checked'); assert.equal(eq.value, true);
      const formation = checkComponentConstruction(built.context, type.id); assert.equal(formation.kind, 'checked'); assert.equal(formation.re01?.primitive, true);
    }
    return {kind: forest.kind, forest, contexts: [built.context, child.context] as const,
      proofNodes: forest.proof.length, contextSizes: [built.context.members.length, child.context.members.length],
      actualComponents: forest.actualComponents.length,
      retainedQueryKeys: [built.context, child.context].map(context => ({derived: keys(context, d.id), base: keys(context, types[0].id)}))};
  };
  return {make, request, originalGraph, derived: d.id, retainedIntermediate: types[0].id,
    privateIds: privateTail.map(node => node.id), retainedOwnerObserver};
}

describe('guarded erasure below a retained observed recursive copy', () => {
  it('retains exact D-to-t0 observations while omitting only the private tail before birth in both complete forests', async () => {
    const s = await subject(), old = s.make(false), erased = s.make(true);
    expect(old.contextSizes).toEqual([51, 52]); expect(erased.contextSizes).toEqual([39, 40]);
    expect(old.actualComponents).toBe(26); expect(erased.actualComponents).toBe(26);
    expect(old.proofNodes).toBe(2); expect(erased.proofNodes).toBe(2); expect(s.privateIds).toHaveLength(12);
    for (const result of [old, erased]) {
      expect(result.forest.proof.find(step => step.target === s.derived)?.correspondence)
        .toMatchObject({target: s.derived, intermediate: s.retainedIntermediate});
      for (const keys of result.retainedQueryKeys) {expect(keys.derived).toHaveLength(2); expect(keys.base).toHaveLength(2);}
    }
    expect(old.retainedQueryKeys).toEqual(erased.retainedQueryKeys);
    for (let i = 0; i < old.contexts.length; i++) {
      const original = new Set(old.contexts[i].members), replacement = new Set(erased.contexts[i].members);
      expect(new Set([...original].filter(target => !replacement.has(target)))).toEqual(new Set(s.privateIds));
      expect([...replacement].every(target => original.has(target))).toBe(true);
    }
    expect(JSON.stringify(s.request.graph)).toBe(s.originalGraph);
  });

  it('refuses erasure when only a retained particle owner observes the tail, despite complete old evidence', async () => {
    const s = await subject(), old = s.make(false, true);
    expect(old.kind).toBe('checked-candidate'); expect(old.proofNodes).toBe(2); expect(old.actualComponents).toBe(26);
    expect(old.contextSizes).toEqual([52, 53]);
    expect(s.retainedOwnerObserver.identity.kind).toBe('scoped'); assert.equal(s.retainedOwnerObserver.identity.kind, 'scoped');
    expect(s.privateIds).toContain(s.retainedOwnerObserver.identity.owner);
    for (const target of s.privateIds) expect(JSON.stringify(s.retainedOwnerObserver.term)).not.toContain(target);
    expect(() => s.make(true, true)).toThrow(/retained canonical\/raw\/owner field still selects erased cone/);
    expect(JSON.stringify(s.request.graph)).toBe(s.originalGraph);
  });
});
