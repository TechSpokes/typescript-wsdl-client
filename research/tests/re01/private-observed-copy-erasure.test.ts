/** Preserve observed recursive copies or rebuild an unobserved family without dropping its fresh roots. */
import assert from 'node:assert/strict';
import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId as legacyScopedId} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle, deriveOriginalComplexPropertyContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import type {SemanticParticle} from '../../../src/compiler/particleSemanticView.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
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
async function subject({encoding = 'legacy', scopedEndpoint = false, originalMiddle = false}:
  Readonly<{encoding?: 'legacy' | 'injective'; scopedEndpoint?: boolean; originalMiddle?: boolean}> = {}) {
  const scopedId = encoding === 'legacy' ? legacyScopedId : hypotheticalScopedId;
  const loaded = await loadSchemaInput(filename, {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual; assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  for (const node of request.graph.nodes) if (node.identity.kind === 'scoped')
    assert.equal(node.id, legacyScopedId(node.identity.owner, node.identity.path, node.identity.role));
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
  const globalV = extension('V', r.id, r.content), eChild = extension('E-V', p.id, p.content);
  const v: ComplexTypeNode = scopedEndpoint ? {...globalV, id: nodeId('/scoped-V', 'type'),
    identity: {kind: 'scoped', owner: group.id, path: '/scoped-V', role: 'type'}} : globalV;
  const middle = originalMiddle ? q.id : types[0].id;
  const family = new Set([...types, eRoot, v].map(node => node.id));
  const k: ComplexTypeNode = {...p, id: typeId('K-empty'),
    identity: {kind: 'global', role: 'type', name: {namespace, local: 'K-empty'}},
    derivation: {kind: 'restriction', contentKind: 'complex', base: anyType, facets: []}, content: undefined,
    attributes: [], abstract: false};
  assert.equal(actual.lookup(k.id).kind, 'missing');
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
  const make = (erase: boolean, withRetainedOwnerObserver = false, {emptyCone = false}: Readonly<{emptyCone?: boolean}> = {}) => {
    assert.ok(!emptyCone || originalMiddle && !erase, 'C/K reduction requires the fixed original middle and every old cone root');
    const rebuild = (node: ComplexTypeNode): ComplexTypeNode => {
      if (!emptyCone || !family.has(node.id)) return node;
      assert.equal(node.derivation?.kind, 'extension');
      return {...node, content: undefined, attributes: [], derivation: {...node.derivation, base: local(k.id)}};
    };
    const selectedCone = erase ? cone.slice(0, 6).map(node => node.id === decls[0].id ? {...node as ElementNode, type: local(q.id)} : node) : cone;
    const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(middle), facets: []}};
    const additions: GraphNode[] = [...selectedCone, entry, entryH, entryNext, entryPrefix, eRoot, eContent, v,
      ...(withRetainedOwnerObserver ? [retainedOwnerObserver] : [])].map(node => node.kind === 'complexType' ? rebuild(node) : node);
    if (emptyCone) additions.push(k);
    const dRow = originalRows.find(row => row.type === d.id); assert.ok(dRow);
    const rows = [...originalRows.filter(row => row.type !== d.id), raw(endpoint, dRow.content), raw(rebuild(eRoot)), raw(rebuild(v)),
      ...(erase ? types.slice(0, 1) : types).map(type => raw(rebuild(type))), ...(emptyCone ? [raw(k)] : [])];
    if (erase) {
      const audit = (value: unknown): void => {
        if (typeof value === 'string') assert.ok(!coneIds.has(value), 'retained canonical/raw/owner field still selects erased cone');
        else if (Array.isArray(value)) value.forEach(audit);
        else if (value && typeof value === 'object') Object.values(value).forEach(audit);
      };
      audit({additions, rows, endpoint, eChild,
        evidenceParameters: [{target: d.id, intermediate: middle, ancestor: local(p.id)}, {target: v.id, intermediate: eChild.id, ancestor: local(p.id)}]});
    }
    const active = [...actual.members, ...additions.map(node => node.id)];
    const built = request.candidate({key: emptyCone ? 'owner-conditioned-empty-cone' : erase ? 'private-cone-erased' : 'recursive-copy-cycle', active, additions, endpoint,
      rawTypes: rows, rawElements: additions.flatMap(node => node.kind === 'element' ? [{element: node.id, type: node.type, final: [], block: []}] : [])});
    assert.equal(built.kind, 'prepared', JSON.stringify(built));
    const contexts: SemanticContext[] = [built.context];
    const nodes: FiniteRe01EvidenceNode[] = [
      {id: 'D', parent: actual, context: built.context, target: d.id, intermediate: middle, ancestor: local(p.id), premises: emptyCone ? [] : ['V']}];
    if (!emptyCone) {
      const childEndpoint: ComplexTypeNode = {...v, derivation: {kind: 'restriction', contentKind: 'complex', base: local(eChild.id), facets: []}};
      const child = forkSemanticCandidate(built.context, {key: 'V-child', active: [...active, eChild.id], additions: [eChild], endpoint: childEndpoint,
        rawTypes: [raw(eChild), raw(childEndpoint)]}); assert.equal(child.kind, 'prepared', JSON.stringify(child));
      contexts.push(child.context);
      nodes.push({id: 'V', parent: built.context, context: child.context, target: v.id, intermediate: eChild.id, ancestor: local(p.id), premises: []});
    }
    const forest = verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes});
    assert.equal(forest.kind, 'checked-candidate', JSON.stringify(forest));
    assert.deepEqual(new Set(forest.actualComponents.map(item => item.component)), new Set(actual.members));
    for (const step of forest.proof) {
      const context = contexts.find(item => item.contextId === step.contextId); assert.ok(context);
      const checked: Set<string> = new Set(step.components.map(item => item.component));
      assert.ok(checked.has(q.id), 'original q support is genuine full closure, not property-only');
      for (const id of context.members) if (!actual.members.includes(id)) assert.ok(checked.has(id), 'fresh mandatory root escaped: ' + id);
      for (const id of additions.map(node => node.id)) assert.ok(context.members.includes(id), 'inherited fresh root omitted in a child');
      for (const removed of privateTail) assert.equal(context.members.includes(removed.id), !erase, 'private tail membership differs from the selected birth');
    }
    for (const type of erase ? types.slice(0, 1) : types) {
      const looked: ReturnType<SemanticContext['lookup']> = built.context.lookup(type.id); assert.equal(looked.kind, 'found');
      const eq = compareComponentProperties(built.context, looked.node, q); assert.equal(eq.kind, 'checked'); assert.equal(eq.value, !emptyCone);
      const formation = checkComponentConstruction(built.context, type.id); assert.equal(formation.kind, 'checked'); assert.equal(formation.re01?.primitive, true);
    }
    return {kind: forest.kind, forest, contexts,
      proofNodes: forest.proof.length, contextSizes: contexts.map(context => context.members.length),
      actualComponents: forest.actualComponents.length,
      retainedQueryKeys: contexts.map(context => ({derived: keys(context, d.id), base: keys(context, middle)}))};
  };
  return {make, request, originalGraph, derived: d.id, retainedIntermediate: middle,
    privateIds: privateTail.map(node => node.id), retainedOwnerObserver, freshEndpoint: v, family, k, r};
}

describe('guarded reconstruction of recursive complex copies', () => {
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

  it('checks complete legacy and injective forests while retiring the same inherited scoped endpoint', async () => {
    for (const encoding of ['legacy', 'injective'] as const) {
      const s = await subject({encoding, scopedEndpoint: true}), old = s.make(false), erased = s.make(true);
      expect(old.contextSizes).toEqual([51, 52]); expect(erased.contextSizes).toEqual([39, 40]);
      expect(old.actualComponents).toBe(26); expect(erased.actualComponents).toBe(26);
      expect(old.proofNodes).toBe(2); expect(erased.proofNodes).toBe(2);
      expect(old.retainedQueryKeys).toEqual(erased.retainedQueryKeys);
      assert.equal(s.freshEndpoint.identity.kind, 'scoped');
      const encode = encoding === 'legacy' ? legacyScopedId : hypotheticalScopedId;
      expect(s.freshEndpoint.id).toBe(encode(s.freshEndpoint.identity.owner, s.freshEndpoint.identity.path, s.freshEndpoint.identity.role));
      for (const result of [old, erased]) {
        for (const context of result.contexts) {
          expect(context.lookup(s.freshEndpoint.id)).toMatchObject({kind: 'found',
            node: {id: s.freshEndpoint.id, identity: s.freshEndpoint.identity}});
          expect(context.sourceNode(s.freshEndpoint.id)).toBeUndefined();
        }
        expect(result.forest.proof.find(step => step.target === s.freshEndpoint.id)?.parentContext)
          .toBe(result.contexts[0].contextId);
      }
      expect(JSON.stringify(s.request.graph)).toBe(s.originalGraph);
    }
  });

  it('empties the owner-conditioned family while keeping every old root, scope and outside construction', async () => {
    // The original q middle protects D independently of the copied types.
    // Only C-owned queries connect the recursive copies to q; empty C clauses remove those queries.
    const s = await subject({originalMiddle: true}), old = s.make(false), replacement = s.make(false, false, {emptyCone: true});
    expect(old.contextSizes).toEqual([51, 52]); expect(replacement.contextSizes).toEqual([52]);
    expect(old.proofNodes).toBe(2); expect(replacement.proofNodes).toBe(1);
    expect(old.actualComponents).toBe(26); expect(replacement.actualComponents).toBe(26);
    const before = old.contexts[0], after = replacement.contexts[0], step = replacement.forest.proof[0];
    expect(after.members.filter(id => !before.members.includes(id))).toEqual([s.k.id]);
    expect(before.members.every(id => after.members.includes(id))).toBe(true);
    expect(before.members.filter(id => !s.request.actual.members.includes(id))).toHaveLength(25);
    const fresh = after.members.filter(id => !s.request.actual.members.includes(id)); expect(fresh).toHaveLength(26);
    const checked = new Set(step.components.map(item => item.component));
    expect(checked.size).toBe(51); expect(fresh.every(id => checked.has(id))).toBe(true);
    expect(after.members.filter(id => !checked.has(id))).toEqual([s.r.id]);
    expect(replacement.forest.actualComponents.map(item => item.component)).toContain(s.r.id);
    expect(step.correspondence).toMatchObject({target: s.derived, intermediate: s.retainedIntermediate});
    expect(step.components.filter(item => item.re01 && !item.re01.primitive)).toEqual([]);
    expect(step.components.flatMap(item => item.obligations)).toEqual([]);
    expect(s.family.size).toBe(5);
    let scaffolds = 0;
    for (const id of before.members) {
      const a = before.lookup(id), b = after.lookup(id); assert.equal(a.kind, 'found'); assert.equal(b.kind, 'found');
      if (!s.family.has(id)) {
        expect(b.node).toEqual(a.node);
        expect(after.rawTypeProperties(id)).toEqual(before.rawTypeProperties(id));
      } else {
        assert.equal(a.node.kind, 'complexType'); assert.equal(b.node.kind, 'complexType');
        expect({...b.node, content: a.node.content, attributes: a.node.attributes,
          derivation: {...b.node.derivation, base: a.node.derivation!.base}}).toEqual(a.node);
        expect(after.rawTypeProperties(id)).toMatchObject({content: {kind: 'empty'}, attributeUses: [],
          derivation: {method: 'extension', base: local(s.k.id)}});
        expect(after.rawTypeProperties(id)?.wildcard).toBeUndefined();
        expect(step.components.find(item => item.component === id)).toMatchObject({re01: {primitive: true}});
      }
      expect(after.rawElementProperties(id)).toEqual(before.rawElementProperties(id));
      if (a.node.kind !== 'complexType' && !s.request.actual.members.includes(id)) scaffolds++;
    }
    expect(scaffolds).toBe(20);
    expect(step.components.find(item => item.component === s.k.id)).toMatchObject({kind: 'checked', obligations: []});
    expect(replacement.retainedQueryKeys[0]).toEqual(old.retainedQueryKeys[0]);
    expect(JSON.stringify(s.request.graph)).toBe(s.originalGraph);
  });
});
