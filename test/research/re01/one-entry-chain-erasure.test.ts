import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteProofStep, FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const directory = path.resolve('test/conformance/fixtures');
const namespace = 'urn:re01:one-entry-chain-erasure';
const typeId = (name: string) => globalId('type', {namespace, local: name});
const elementId = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};

async function subject() {
  const input = await loadSchemaInput(path.join(directory, 'xsd/recovery/one-entry-chain-erasure.xsd'),
    {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  const get = (name: string): ComplexTypeNode => {
    const found = actual.lookup(typeId(name)); assert.equal(found.kind, 'found');
    assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const b = get('B'), c = get('C'), d = get('D');
  const extension = (name: string, base: string): ComplexTypeNode => ({...b, id: typeId(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    derivation: {kind: 'extension', contentKind: 'complex', base: local(base), facets: []}});
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    content: {kind: 'empty'}, abstract: false, final: [], block: node.id === typeId('W') ? ['restriction'] : [],
    attributeUses: [], provenance: {kind: 'hypothetical-abstract',
      originals: actual.lookup(node.id).kind === 'found' ? [node.id] : []}});
  const declaration = (name: string, type: string): ElementNode => ({kind: 'element', id: elementId(name),
    identity: {kind: 'global', role: 'element', name: {namespace, local: name}}, name: {namespace, local: name},
    context: b.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    type: local(type), nillable: false, abstract: false, substitutionGroup: local(elementId('H'))});
  const w = extension('W', b.id), x = extension('X', w.id), u = extension('U', x.id);
  const e = extension('E-root', b.id), eu = extension('E-U', b.id), ex = extension('E-X', b.id);
  const m = declaration('M', u.id), o = declaration('O', x.id);
  const dPrime: ComplexTypeNode = {...d,
    derivation: {kind: 'restriction', contentKind: 'complex', base: local(e.id), facets: []}};
  const buildRoot = (key: string, rootU: ComplexTypeNode, omitX: boolean): SemanticContext => {
    const additions = omitX ? [e, w, rootU, m] : [e, w, x, rootU, m];
    const built = request.candidate({key, active: [...actual.members, ...additions.map(node => node.id)],
      additions, endpoint: dPrime, rawTypes: [b, c, dPrime, ...additions.filter(node => node.kind === 'complexType')].map(raw),
      rawElements: [{element: m.id, final: [], block: []}]});
    assert.equal(built.kind, 'prepared'); return built.context;
  };
  const p = buildRoot('old-root', u, false);
  const retire = (parent: SemanticContext, target: ComplexTypeNode, intermediate: ComplexTypeNode,
    key: string, observer: boolean): SemanticContext => {
    const endpoint: ComplexTypeNode = {...target,
      derivation: {kind: 'restriction', contentKind: 'complex', base: local(intermediate.id), facets: []}};
    const additions = observer ? [intermediate, o] : [intermediate];
    const built = forkSemanticCandidate(parent, {key, active: [...parent.members, ...additions.map(node => node.id)],
      additions, endpoint, rawTypes: [raw(endpoint), raw(intermediate)],
      rawElements: observer ? [{element: o.id, final: [], block: []}] : []});
    assert.equal(built.kind, 'prepared'); return built.context;
  };
  const cu = retire(p, u, eu, 'U-first', true), cux = retire(cu, x, ex, 'U-then-X', false);
  const cx = retire(p, x, ex, 'X-first', false), cxu = retire(cx, u, eu, 'X-then-U', true);
  const root = (id: string, context: SemanticContext, premises: readonly string[]): FiniteRe01EvidenceNode => ({
    id, parent: actual, context, target: d.id, intermediate: e.id, ancestor: local(b.id), premises});
  const step = (id: string, parent: SemanticContext, context: SemanticContext, target: ComplexTypeNode,
    intermediate: ComplexTypeNode, premises: readonly string[] = []): FiniteRe01EvidenceNode => ({
    id, parent, context, target: target.id, intermediate: intermediate.id, ancestor: local(b.id), premises});
  const old = verifyFiniteRe01Evidence(actual, d.id, {root: 'old-root', nodes: [root('old-root', p, ['U', 'X']),
    step('U', p, cu, u, eu, ['UX']), step('UX', cu, cux, x, ex),
    step('X', p, cx, x, ex, ['XU']), step('XU', cx, cxu, u, eu),
  ]});
  assert.equal(old.kind, 'checked-candidate', JSON.stringify(old));
  const compressedU: ComplexTypeNode = {...u,
    derivation: {kind: 'extension', contentKind: 'complex', base: local(w.id), facets: []}};
  const compressed = buildRoot('compressed-root', compressedU, true);
  const snapshot = (context: SemanticContext) => context.members.map(id => ({node: context.lookup(id),
    rawType: context.rawTypeProperties(id), rawElement: context.rawElementProperties(id),
    rawSimple: context.rawSimpleTypeProperties(id), rawAttribute: context.rawAttributeProperties(id),
    rawGroup: context.rawAttributeGroupProperties(id)}));
  const parentSnapshot = snapshot(compressed);
  const additions: GraphNode[] = cux.members.filter(id => compressed.lookup(id).kind !== 'found').map(id => {
    const found = cux.lookup(id); assert.equal(found.kind, 'found'); return found.node;
  });
  const finalU = cux.lookup(u.id); assert.equal(finalU.kind, 'found'); assert.equal(finalU.node.kind, 'complexType');
  const finalRawU = cux.rawTypeProperties(u.id); assert.ok(finalRawU);
  const rawTypes = additions.filter(node => node.kind === 'complexType').map(node => {
    const value = cux.rawTypeProperties(node.id); assert.ok(value); return value;
  });
  const rawElements = additions.filter(node => node.kind === 'element').map(node => {
    const value = cux.rawElementProperties(node.id); assert.ok(value); return value;
  });
  const directBuilt = forkSemanticCandidate(compressed, {key: 'direct-old-terminal', active: cux.members,
    additions, endpoint: finalU.node, rawTypes: [finalRawU, ...rawTypes], rawElements});
  assert.equal(directBuilt.kind, 'prepared');
  const direct = directBuilt.context;
  const replacement = verifyFiniteRe01Evidence(actual, d.id, {root: 'compressed-root', nodes: [
    root('compressed-root', compressed, ['compressed-U']), step('compressed-U', compressed, direct, u, eu),
  ]});
  assert.equal(replacement.kind, 'checked-candidate', JSON.stringify(replacement));
  const members = (context: SemanticContext, head: string) => {
    const result = effectiveSubstitutionMembers(context, elementId(head)); assert.equal(result.kind, 'checked'); return result.value;
  };
  const np = (proofStep: FiniteProofStep) => proofStep.components.filter(component =>
    actual.lookup(component.component).kind !== 'found' && component.re01 && !component.re01.primitive)
    .map(component => component.component);
  return {actual, p, compressed, direct, cux, cu, cxu, m, o, u, x, old, replacement,
    snapshot, parentSnapshot, members, np, additions, finalU: finalU.node, finalRawU, rawTypes, rawElements};
}

describe('one-entry fresh support chain erasure', () => {
  it('rebuilds a five-node complete forest as two nodes with exact final records and future observer', async () => {
    const s = await subject();
    expect(s.old.proof).toHaveLength(5);
    expect(s.replacement.proof).toHaveLength(2);
    expect(s.snapshot(s.direct)).toEqual(s.snapshot(s.cux));
    expect(s.snapshot(s.compressed)).toEqual(s.parentSnapshot);
    expect(s.compressed.lookup(s.x.id).kind).toBe('missing');
    expect(s.compressed.lookup(s.o.id).kind).toBe('missing');
    for (const head of ['H', 'H-R']) expect(s.members(s.compressed, head)).toEqual(s.members(s.p, head));
    expect(s.members(s.cu, 'H-R')).toContain(s.o.id);
    expect(s.members(s.cxu, 'H-R')).not.toContain(s.o.id);
    expect(s.members(s.direct, 'H-R')).not.toContain(s.o.id);
    const oldRoot = s.old.proof.find(step => step.evidence === 'old-root'); assert.ok(oldRoot);
    const newRoot = s.replacement.proof.find(step => step.evidence === 'compressed-root'); assert.ok(newRoot);
    const child = s.replacement.proof.find(step => step.evidence === 'compressed-U'); assert.ok(child);
    expect(s.np(oldRoot).sort()).toEqual([s.u.id, s.x.id].sort());
    expect(s.np(newRoot)).toEqual([s.u.id]); expect(s.np(child)).toEqual([]);
    for (const id of s.compressed.members.filter(id => s.actual.lookup(id).kind !== 'found'))
      expect(child.components.some(component => component.component === id)).toBe(true);
    expect(s.compressed.rawTypeProperties(s.u.id)?.content).toEqual(s.p.rawTypeProperties(s.u.id)?.content);
    expect(s.replacement.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  });

  it('rejects a direct reconstruction that drops an inherited fresh member', async () => {
    const s = await subject();
    const dropped = forkSemanticCandidate(s.compressed, {key: 'dropped-inherited-M',
      active: s.cux.members.filter(id => id !== s.m.id), additions: s.additions, endpoint: s.finalU,
      rawTypes: [s.finalRawU, ...s.rawTypes], rawElements: s.rawElements});
    expect(dropped).toMatchObject({kind: 'candidate-rejected', code: 'outside-context', component: s.m.id});
  });
});
