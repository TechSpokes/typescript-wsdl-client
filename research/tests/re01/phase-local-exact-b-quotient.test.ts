/** A closed co-born exact-B batch is projected from uniform old states, retaining every global member. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteCandidateReceipt, FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const directory = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:free-ur-common-mixed-payload';
const typeId = (name: string) => globalId('type', {namespace, local: name});
const elementId = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};

async function subject() {
  const loaded = await loadSchemaInput(path.join(directory, 'xsd/recovery/free-ur-common-mixed-payload.xsd'),
    {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual, originalGraph = JSON.stringify(request.graph);
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const original = (name: string): ComplexTypeNode => {
    const found = actual.lookup(typeId(name)); assert.equal(found.kind, 'found');
    assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const a = original('A'), b = original('B'), d = original('D');
  const common = {context: b.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const module = (name: string): ComplexTypeNode => ({...common, kind: 'complexType', id: typeId(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, mixed: false, abstract: false, attributes: [],
    derivation: {kind: 'extension', contentKind: 'complex', base: local(b.id), facets: []}});
  const u1 = module('U1'), u2 = module('U2');
  const declaration = (name: string, type: string, head: string, abstract = false): ElementNode => ({...common,
    kind: 'element', id: elementId(name), identity: {kind: 'global', role: 'element', name: {namespace, local: name}},
    name: {namespace, local: name}, type: local(type), nillable: false, abstract, substitutionGroup: local(head)});
  const h = declaration('H', b.id, elementId('h'), true);
  const m1 = declaration('m1', u1.id, h.id), m2 = declaration('m2', u2.id, h.id);
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    content: {kind: 'empty'}, abstract: false, final: [], block: [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.lookup(node.id).kind === 'found' ? [node.id] : []}});
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
  const opening = (quotient: boolean): SemanticContext => {
    const members = [h, m1, quotient ? {...m2, type: local(u1.id)} : m2];
    const types = quotient ? [u1] : [u1, u2], additions: GraphNode[] = [...types, ...members];
    const built = request.candidate({key: quotient ? 'representative-opening' : 'two-modules-opening',
      active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint,
      rawTypes: [...request.graph.nodes.flatMap(node => node.kind === 'complexType' && node.id !== d.id ? [raw(node)] : []),
        raw(endpoint), ...types.map(raw)],
      rawElements: members.map(node => ({element: node.id, type: node.type, final: [], block: node.id === h.id ? ['restriction'] : []}))});
    assert.equal(built.kind, 'prepared', JSON.stringify(built)); return built.context;
  };
  const retire = (parent: SemanticContext, target: ComplexTypeNode, key: string): SemanticContext => {
    const selected: ComplexTypeNode = {...target,
      derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
    const built = forkSemanticCandidate(parent, {key, active: parent.members, additions: [], endpoint: selected, rawTypes: [raw(selected)]});
    assert.equal(built.kind, 'prepared', JSON.stringify(built)); return built.context;
  };
  const oldRoot = opening(false), u1First = retire(oldRoot, u1, 'old-U1-first'), u1ThenU2 = retire(u1First, u2, 'old-U1-then-U2');
  const u2First = retire(oldRoot, u2, 'old-U2-first'), u2ThenU1 = retire(u2First, u1, 'old-U2-then-U1');
  const newRoot = opening(true), representativeChild = retire(newRoot, u1, 'new-U1-only');
  const root = (id: string, context: SemanticContext, premises: readonly string[]): FiniteRe01EvidenceNode => ({
    id, parent: actual, context, target: d.id, intermediate: b.id, ancestor: local(a.id), premises});
  const step = (id: string, parent: SemanticContext, context: SemanticContext, target: ComplexTypeNode,
    premises: readonly string[] = []): FiniteRe01EvidenceNode => ({
    id, parent, context, target: target.id, intermediate: b.id, ancestor: local(a.id), premises});
  const old = verifyFiniteRe01Evidence(actual, d.id, {root: 'old-D', nodes: [root('old-D', oldRoot, ['old-U1', 'old-U2']),
    step('old-U1', oldRoot, u1First, u1, ['old-U1-U2']), step('old-U1-U2', u1First, u1ThenU2, u2),
    step('old-U2', oldRoot, u2First, u2, ['old-U2-U1']), step('old-U2-U1', u2First, u2ThenU1, u1),
  ]});
  const replacement = verifyFiniteRe01Evidence(actual, d.id, {root: 'new-D', nodes: [root('new-D', newRoot, ['new-U1']),
    step('new-U1', newRoot, representativeChild, u1),
  ]});
  const missing = () => verifyFiniteRe01Evidence(actual, d.id, {root: 'new-D', nodes: [root('new-D', newRoot, [])]});
  const pool = (context: SemanticContext): ReadonlySet<string> => {
    const result = effectiveSubstitutionMembers(context, h.id); assert.equal(result.kind, 'checked'); return new Set(result.value);
  };
  const np = (receipt: FiniteCandidateReceipt, context: SemanticContext) => {
    const node = receipt.proof.find(item => item.contextId === context.contextId); assert.ok(node);
    return new Set(node.components.filter(item => item.re01 && !item.re01.primitive).map(item => item.component));
  };
  return {request, actual, originalGraph, u1, u2, h, m1, m2, old, replacement, missing, pool, np,
    oldContexts: [oldRoot, u1First, u1ThenU2, u2First, u2ThenU1], newContexts: [newRoot, representativeChild]};
}

type Subject = Awaited<ReturnType<typeof subject>>;
function complete(s: Subject, result: Subject['old'], contexts: readonly SemanticContext[]) {
  assert.equal(result.kind, 'checked-candidate', JSON.stringify(result));
  expect(result.proof).toHaveLength(contexts.length); expect(result.actualComponents).toHaveLength(5);
  expect(new Set(result.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
  for (const step of result.proof) {
    const context = contexts.find(item => item.contextId === step.contextId); assert.ok(context);
    expect(step.components).toHaveLength(context.members.length - (context === contexts[0] ? 1 : 2));
    for (const id of context.members) if (!s.actual.members.includes(id))
      expect(step.components.some(item => item.component === id)).toBe(true);
    for (const node of [s.h, s.m1, s.m2]) expect(step.components.some(item => item.component === node.id)).toBe(true);
    for (const receipt of step.components) {
      expect(receipt.contextId).toBe(context.contextId); expect(receipt.obligations).toEqual([]);
    }
    expect(context.rawElementProperties(s.h.id)?.block).toEqual(['restriction']);
  }
  expect(result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  return result;
}

describe('one closed co-born exact-B TYPE batch', () => {
  it('replays the complete five-node old forest as two nodes while retaining the exact global member census', async () => {
    const s = await subject(), old = complete(s, s.old, s.oldContexts), replacement = complete(s, s.replacement, s.newContexts);
    expect(s.oldContexts.map(context => context.members.length)).toEqual([10, 10, 10, 10, 10]);
    expect(s.newContexts.map(context => context.members.length)).toEqual([9, 9]);
    expect(s.oldContexts.map(context => [...s.np(old, context)].sort())).toEqual([
      [s.u1.id, s.u2.id].sort(), [s.u2.id], [], [s.u1.id], [],
    ]);
    expect(s.newContexts.map(context => [...s.np(replacement, context)])).toEqual([[s.u1.id], []]);
    const both = new Set([s.m1.id, s.m2.id]), empty = new Set<string>();
    expect(s.oldContexts.map(s.pool)).toEqual([both, new Set([s.m2.id]), empty, new Set([s.m1.id]), empty]);
    expect(s.newContexts.map(s.pool)).toEqual([both, empty]);
    // The representative child matches the serial uniform old terminal, not either mixed first child.
    for (const [before, after] of [[s.oldContexts[0], s.newContexts[0]], [s.oldContexts[2], s.newContexts[1]],
      [s.oldContexts[4], s.newContexts[1]]] as const) {
      expect(new Set(before.members.filter(id => !after.members.includes(id)))).toEqual(new Set([s.u2.id]));
      for (const id of after.members) {
        const left = before.lookup(id), right = after.lookup(id); assert.equal(left.kind, 'found'); assert.equal(right.kind, 'found');
        if (id === s.m2.id) {
          assert.equal(left.node.kind, 'element'); assert.equal(right.node.kind, 'element');
          expect({...right.node, type: left.node.type}).toEqual(left.node);
          expect(right.node.type).toEqual(local(s.u1.id));
          expect({...after.rawElementProperties(id), type: left.node.type}).toEqual(before.rawElementProperties(id));
        } else {
          expect(right.node).toEqual(left.node);
          expect(after.rawElementProperties(id)).toEqual(before.rawElementProperties(id));
        }
        expect(after.rawTypeProperties(id)).toEqual(before.rawTypeProperties(id));
      }
    }
    for (const context of s.newContexts) {
      expect(context.lookup(s.u2.id).kind).toBe('missing');
      for (const node of [s.h, s.m1, s.m2]) {
        const found = context.lookup(node.id); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'element');
        expect(found.node.value).toBeUndefined();
      }
    }
    expect(JSON.stringify(s.request.graph)).toBe(s.originalGraph);
  });

  it('retains the representative own-NP duty after omitting the second module before birth', async () => {
    const s = await subject(); complete(s, s.replacement, s.newContexts);
    expect(s.missing()).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.u1.id});
    expect(s.pool(s.newContexts[0])).toEqual(new Set([s.m1.id, s.m2.id]));
    for (const context of s.newContexts) for (const node of [s.u1, s.h, s.m1, s.m2]) expect(context.members).toContain(node.id);
  });
});
