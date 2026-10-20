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
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const directory = path.resolve('test/conformance/fixtures');
const namespace = 'urn:re01:fresh-target-flattening';
const typeId = (local: string) => globalId('type', {namespace, local});
const elementId = (local: string) => globalId('element', {namespace, local});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
const filename = path.join(directory, 'xsd/recovery/fresh-target-flattening.xsd');
async function subject() {
  const input = await loadSchemaInput(filename, {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  const get = (name: string): ComplexTypeNode => {const found = actual.lookup(typeId(name));
    assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;};
  const a = get('A'), b = get('B'), d = get('D');
  const extension = (name: string, base: string): ComplexTypeNode => ({...a, id: typeId(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    derivation: {kind: 'extension', contentKind: 'complex', base: local(base), facets: []}});
  const restriction = (node: ComplexTypeNode): ComplexTypeNode => ({...node,
    derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}});
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    content: {kind: 'empty'}, abstract: false, final: [], block: [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.lookup(node.id).kind === 'found' ? [node.id] : []}});
  const declaration = (name: string, type: string, head: string, abstract = false): ElementNode => ({kind: 'element',
    id: elementId(name), identity: {kind: 'global', role: 'element', name: {namespace, local: name}},
    name: {namespace, local: name}, context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    type: local(type), nillable: false, abstract, substitutionGroup: local(head)});
  const e = extension('E', a.id), u = extension('U', b.id);
  const k = declaration('K', b.id, elementId('H'), true), m = declaration('M', u.id, k.id);
  const dPrime: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(e.id), facets: []}};
  const parentBuilt = request.candidate({key: 'parent', active: [...actual.members, e.id, u.id, k.id, m.id],
    additions: [e, u, k, m], endpoint: dPrime, rawTypes: [raw(a), raw(b), raw(e), raw(u), raw(dPrime)],
    rawElements: [k, m].map(node => ({element: node.id, final: [], block: []}))});
  assert.equal(parentBuilt.kind, 'prepared');
  const parent = parentBuilt.context;
  const parentSnapshot = parent.members.map(id => ({node: parent.lookup(id), rawType: parent.rawTypeProperties(id),
    rawSimple: parent.rawSimpleTypeProperties(id), rawElement: parent.rawElementProperties(id),
    rawAttribute: parent.rawAttributeProperties(id), rawGroup: parent.rawAttributeGroupProperties(id)}));

  const g1 = extension('G1', b.id), g2 = extension('G2', b.id);
  const n1 = declaration('N1', g1.id, k.id), n2 = declaration('N2', g2.id, k.id);
  const uPrime = restriction(u);
  const oldBuilt = forkSemanticCandidate(parent, {key: 'U-introduces-live-NP-support',
    active: [...parent.members, g1.id, g2.id, n1.id, n2.id], additions: [g1, g2, n1, n2], endpoint: uPrime,
    rawTypes: [raw(uPrime), raw(g1), raw(g2)], rawElements: [n1, n2].map(node => ({element: node.id, final: [], block: []}))});
  assert.equal(oldBuilt.kind, 'prepared'); const old = oldBuilt.context;
  const retire = (context: SemanticContext, node: ComplexTypeNode, key: string): SemanticContext => {
    const endpoint = restriction(node);
    const built = forkSemanticCandidate(context, {key, active: context.members, endpoint, rawTypes: [raw(endpoint)]});
    assert.equal(built.kind, 'prepared'); return built.context;
  };
  const firstG1 = retire(old, g1, 'G1'), firstG2 = retire(old, g2, 'G2');
  const terminal = retire(firstG1, g2, 'G1-G2'), otherTerminal = retire(firstG2, g1, 'G2-G1');
  const root = (premise: string): FiniteRe01EvidenceNode => ({id: 'root', parent: actual, context: parent,
    target: d.id, intermediate: e.id, ancestor: local(a.id), premises: [premise]});
  const node = (id: string, p: SemanticContext, c: SemanticContext, target: string,
    premises: readonly string[] = []): FiniteRe01EvidenceNode => ({id, parent: p, context: c, target,
      intermediate: b.id, ancestor: local(a.id), premises});
  const original = verifyFiniteRe01Evidence(actual, d.id, {root: 'root', nodes: [root('U-old'),
    node('U-old', parent, old, u.id, ['G1', 'G2']),
    node('G1', old, firstG1, g1.id, ['G1-G2']), node('G1-G2', firstG1, terminal, g2.id),
    node('G2', old, firstG2, g2.id, ['G2-G1']), node('G2-G1', firstG2, otherTerminal, g1.id),
  ]});
  assert.equal(original.kind, 'checked-candidate', JSON.stringify(original));

  const finalAdditions: GraphNode[] = [g1.id, g2.id, n1.id, n2.id].map(id => {
    const found = terminal.lookup(id); assert.equal(found.kind, 'found'); return found.node;
  });
  const finalTypes = [g1.id, g2.id].map(id => {const value = terminal.rawTypeProperties(id); assert.ok(value); return value;});
  const flattenedBuilt = forkSemanticCandidate(parent, {key: 'U-flattened-final-records',
    active: [...parent.members, ...finalAdditions.map(node => node.id)], additions: finalAdditions, endpoint: uPrime,
    rawTypes: [raw(uPrime), ...finalTypes], rawElements: [n1, n2].map(node => ({element: node.id, final: [], block: []}))});
  assert.equal(flattenedBuilt.kind, 'prepared'); const flattened = flattenedBuilt.context;
  for (const id of terminal.members) {
    const expected = terminal.lookup(id), received = flattened.lookup(id);
    assert.equal(expected.kind, 'found'); assert.equal(received.kind, 'found'); assert.deepEqual(received.node, expected.node);
    assert.deepEqual(flattened.rawTypeProperties(id), terminal.rawTypeProperties(id));
    assert.deepEqual(flattened.rawElementProperties(id), terminal.rawElementProperties(id));
  }
  const flat = verifyFiniteRe01Evidence(actual, d.id, {root: 'root', nodes: [root('U-flat'),
    node('U-flat', parent, flattened, u.id),
  ]});
  assert.equal(flat.kind, 'checked-candidate', JSON.stringify(flat));
  const observe = (context: SemanticContext) => {const result = effectiveSubstitutionMembers(context, elementId('H'));
    assert.equal(result.kind, 'checked'); return result.value;};
  assert.deepEqual(observe(flattened), observe(terminal));
  assert.ok(observe(old).includes(n1.id)); assert.ok(observe(old).includes(n2.id));
  assert.ok(!observe(flattened).includes(n1.id)); assert.ok(!observe(flattened).includes(n2.id));
  assert.deepEqual(parent.members.map(id => ({node: parent.lookup(id), rawType: parent.rawTypeProperties(id),
    rawSimple: parent.rawSimpleTypeProperties(id), rawElement: parent.rawElementProperties(id),
    rawAttribute: parent.rawAttributeProperties(id), rawGroup: parent.rawAttributeGroupProperties(id)})), parentSnapshot);
  return {actual, request, parent, old, terminal, flattened, original, flat, u, uPrime, m, e,
    finalAdditions, finalTypes, raw, root, node, observe};
}

function newlyNonprimitive(parent: SemanticContext, context: SemanticContext): string[] {
  const result: string[] = [];
  for (const id of context.members) {
    if (parent.lookup(id).kind === 'found') continue;
    const found = context.lookup(id);
    if (found.kind !== 'found' || found.node.kind !== 'complexType') continue;
    const checked = checkComponentConstruction(context, id);
    assert.equal(checked.kind, 'checked');
    if (checked.re01 && !checked.re01.primitive) result.push(id);
  }
  return result;
}

describe('fresh-target finite-forest final-record flattening', () => {
  it('checks a live six-node forest and its exact two-node flattened alternative', async () => {
    const s = await subject();
    expect(s.original.proof).toHaveLength(6);
    expect(s.flat.proof).toHaveLength(2);
    expect(newlyNonprimitive(s.parent, s.old)).toEqual([typeId('G1'), typeId('G2')]);
    expect(newlyNonprimitive(s.parent, s.flattened)).toEqual([]);
    expect(s.flattened.rawTypeProperties(s.u.id)?.content).toEqual(s.parent.rawTypeProperties(s.u.id)?.content);
    expect(s.flattened.lookup(s.u.id)).toMatchObject({kind: 'found', node: {content: s.u.content}});
    expect(s.parent.rawTypeProperties(s.u.id)?.derivation.method).toBe('extension');
    expect(s.flattened.rawTypeProperties(s.u.id)?.derivation.method).toBe('restriction');
    expect(s.flattened.members).toEqual(s.terminal.members);
    expect(s.observe(s.flattened)).toEqual(s.observe(s.terminal));
    for (const id of s.terminal.members) {
      expect(s.flattened.lookup(id)).toEqual(s.terminal.lookup(id));
      expect(s.flattened.rawTypeProperties(id)).toEqual(s.terminal.rawTypeProperties(id));
      expect(s.flattened.rawSimpleTypeProperties(id)).toEqual(s.terminal.rawSimpleTypeProperties(id));
      expect(s.flattened.rawElementProperties(id)).toEqual(s.terminal.rawElementProperties(id));
      expect(s.flattened.rawAttributeProperties(id)).toEqual(s.terminal.rawAttributeProperties(id));
      expect(s.flattened.rawAttributeGroupProperties(id)).toEqual(s.terminal.rawAttributeGroupProperties(id));
    }
    const step = s.flat.proof.find(item => item.target === s.u.id);
    expect(step).toBeDefined();
    for (const id of s.parent.members.filter(id => s.actual.lookup(id).kind !== 'found')) {
      expect(step?.components).toEqual(expect.arrayContaining([expect.objectContaining({component: id})]));
    }
    expect(s.flat.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  });

  it('rejects a flattening attempt that omits an inherited fresh declaration', async () => {
    const s = await subject();
    const omitted = forkSemanticCandidate(s.parent, {key: 'invalid-omitted-M',
      active: [...s.parent.members.filter(id => id !== s.m.id), ...s.finalAdditions.map(item => item.id)],
      additions: s.finalAdditions, endpoint: s.uPrime, rawTypes: [s.raw(s.uPrime), ...s.finalTypes],
      rawElements: ['N1', 'N2'].map(name => ({element: elementId(name), final: [], block: []}))});
    expect(omitted).toMatchObject({kind: 'candidate-rejected', code: 'outside-context', component: s.m.id});
  });
});

// Original-target negative control is already permanent in
// test/research/re01/anchored-helper-support.test.ts:
// 'checks the complete two-node witness and every inherited fresh root'.
// Its original X is valid at the parent but fails 5.4 in the helper child;
// flattening that child into a new original-X candidate would lose X's mapping.
