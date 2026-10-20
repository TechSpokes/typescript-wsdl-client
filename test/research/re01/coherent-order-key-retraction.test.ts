/** Independent discriminator for implicit-order-key merging during original-content folding. */
import assert from 'node:assert/strict';
import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const directory = path.resolve('test/conformance/fixtures');
const namespace = 'urn:review:copy-order-key-collision';
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
const typeId = (name: string) => globalId('type', {namespace, local: name});
const filename = path.join(directory, 'xsd/recovery/coherent-order-key-retraction.xsd');

async function subject() {
  const loaded = await loadSchemaInput(filename, {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual, originalGraph = JSON.stringify(prepared.request.graph);
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const get = (id: string): GraphNode => {const found = actual.lookup(id); assert.equal(found.kind, 'found'); return found.node;};
  const original = (name: string): ComplexTypeNode => {const node = get(typeId(name)); assert.equal(node.kind, 'complexType'); return node;};
  const a = original('A'), d = original('D'), p = original('P'); assert.ok(p.content);
  const group = get(globalId('group', {namespace, local: 'G'})); assert.equal(group.kind, 'group');
  const q = request.graph.nodes.find((node): node is ComplexTypeNode => node.kind === 'complexType' && node.identity.kind === 'scoped' && node.derivation?.kind === 'extension');
  assert.ok(q && q.content);
  const copyIds = new Map<string, string>();
  const identities = new Map<string, Extract<GraphNode['identity'], {kind: 'scoped'}>>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of request.graph.nodes) if (node.identity.kind === 'scoped' && !copyIds.has(node.id)) {
      const owner = copyIds.get(node.identity.owner) ?? (node.identity.owner === group.id ? group.id : undefined);
      if (owner) {
        const identity = {...node.identity, owner, path: node.identity.owner === group.id ? node.identity.path + '/copy' : node.identity.path};
        identities.set(node.id, identity); copyIds.set(node.id, scopedId(owner, identity.path, identity.role)); changed = true;
      }
    }
  }
  const rewrite = (value: unknown, replacements: ReadonlyMap<string, string>): unknown => {
    if (typeof value === 'string') return replacements.get(value) ?? value;
    if (Array.isArray(value)) return value.map(item => rewrite(item, replacements));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item, replacements)]));
    return value;
  };
  const copies: GraphNode[] = request.graph.nodes.filter(node => copyIds.has(node.id)).map(node => ({...rewrite(node, copyIds) as GraphNode, identity: identities.get(node.id)!, id: copyIds.get(node.id)!}));
  const t = copies.find((node): node is ComplexTypeNode => node.id === copyIds.get(q.id) && node.kind === 'complexType'); assert.ok(t && t.content);
  const particle = (owner: string, suffix: string, term: ParticleNode['term']): ParticleNode => ({kind: 'particle', id: scopedId(owner, suffix, 'particle'),
    identity: {kind: 'scoped', owner, path: suffix, role: 'particle'}, context: p.context, occurs: {min: '1', max: '1'}, term,
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []});
  const prefix = get(p.content); assert.equal(prefix.kind, 'particle'); assert.ok('children' in prefix.term);
  const prefixLeaf = get(prefix.term.children[0]); assert.equal(prefixLeaf.kind, 'particle');
  const copiedPrefixLeaf = particle(t.id, '/copied-prefix-leaf', prefixLeaf.term);
  const copiedPrefix = particle(t.id, '/copied-prefix', {kind: 'sequence', children: [copiedPrefixLeaf.id]});
  const tFull = particle(t.id, '/effective-content', {kind: 'sequence', children: [copiedPrefix.id, t.content]});
  const e: ComplexTypeNode = {...a, id: typeId('E'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'E'}},
    derivation: {kind: 'extension', contentKind: 'complex', base: local(a.id), facets: []}};
  const eContent = particle(e.id, '/content', {kind: 'sequence', children: [copyIds.get(group.content)!]});
  const w: ComplexTypeNode = {...t, id: typeId('W'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'W'}},
    derivation: {kind: 'restriction', contentKind: 'complex', base: local(t.id), facets: []}};
  const suffix = get(q.content); assert.equal(suffix.kind, 'particle'); assert.equal(suffix.term.kind, 'choice');
  const reversedChoice = particle(w.id, '/H-then-M', {kind: 'choice', children: [...suffix.term.children].reverse()});
  const wContent = particle(w.id, '/content', {kind: 'sequence', children: [reversedChoice.id, p.content]});
  const row = (node: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({
    type: node.id, targetNamespace: namespace, derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    content, abstract: false, final: [], block: [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.lookup(node.id).kind === 'found' ? [node.id] : []},
  });
  const originalRows = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const mapped = deriveActualComplexContent(actual, node.id); assert.equal(mapped.kind, 'checked');
    if ('particle' in mapped.view.content) {const issued = deriveOriginalComplexParticle(actual, node.id); assert.equal(issued.kind, 'checked'); return [row(node, issued.content)];}
    return [row(node, mapped.view.content)];
  });
  const qSource = deriveOriginalComplexParticle(actual, q.id); assert.equal(qSource.kind, 'checked');
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(e.id), facets: []}};
  const make = (fold: boolean, repairW = false) => {
    const retraction = new Map([[t.id, q.id]]);
    const additions = [...copies, copiedPrefixLeaf, copiedPrefix, tFull, {...e, content: eContent.id}, eContent, {...w, content: wContent.id}, reversedChoice, wContent]
      .map(node => fold ? node.kind === 'element' ? {...node, type: rewrite(node.type, retraction) as Reference}
        : node.kind === 'complexType' && node.derivation ? {...node, derivation: {...node.derivation, base: rewrite(node.derivation.base, retraction) as Reference}}
        : repairW && node.id === wContent.id ? {...wContent, term: {kind: 'sequence', children: [reversedChoice.id, copiedPrefix.id]} as const} : node : node);
    const rows = additions.flatMap(node => node.kind === 'complexType' ? [row(node,
      node.id === t.id ? fold ? qSource.content : {kind: 'element-only', particle: tFull.id}
        : {kind: 'element-only', particle: node.content!})] : []);
    const built = request.candidate({key: fold ? 'joint-fold' : 'original-copy', active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint,
      rawTypes: [...originalRows.filter(item => item.type !== d.id), row(endpoint, {kind: 'empty'}), ...rows],
      rawElements: additions.flatMap(node => node.kind === 'element' ? [{element: node.id, type: node.type, final: [], block: []}] : [])});
    assert.equal(built.kind, 'prepared', JSON.stringify(built));
    const result = verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [
      {id: 'D', parent: actual, context: built.context, target: d.id, intermediate: e.id, ancestor: local(a.id), premises: []},
    ]});
    const qIn = built.context.lookup(q.id), tIn = built.context.lookup(t.id); assert.equal(qIn.kind, 'found'); assert.equal(tIn.kind, 'found');
    return {context: built.context, result, wCheck: checkComponentConstruction(built.context, w.id),
      qCheck: checkComponentConstruction(built.context, q.id), tCheck: checkComponentConstruction(built.context, t.id),
      qEqualsT: compareComponentProperties(built.context, qIn.node, tIn.node)};
  };
  return {actual, request, originalGraph, old: make(false), folded: make(true), repaired: make(true, true),
    copies, copyIds, q, t, p, w, prefixLeaf, copiedPrefixLeaf, copiedPrefix, wContent};
}

type Subject = Awaited<ReturnType<typeof subject>>;
function complete(s: Subject, candidate: Subject['old']) {
  assert.equal(candidate.result.kind, 'checked-candidate');
  expect(candidate.context.members).toHaveLength(36);
  expect(candidate.result.actualComponents).toHaveLength(19);
  expect(new Set(candidate.result.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
  expect(candidate.result.proof).toHaveLength(1);
  expect(candidate.result.proof[0].components).toHaveLength(35);
  const checked = new Set(candidate.result.proof[0].components.map(item => item.component));
  for (const id of candidate.context.members) if (s.actual.lookup(id).kind !== 'found') expect(checked.has(id)).toBe(true);
  for (const copy of s.copies) {
    expect(candidate.context.lookup(copy.id).kind).toBe('found');
    expect(checked.has(copy.id)).toBe(true);
  }
  for (const result of [candidate.qCheck, candidate.tCheck]) expect(result).toMatchObject({kind: 'checked', re01: {primitive: true}});
  expect(candidate.result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
}

describe('coherent implicit-order keys under a specified complex-copy retraction', () => {
  it('checks the original complete one-node forest with property-equal primitive original and copy', async () => {
    const s = await subject(); complete(s, s.old);
    expect(s.copies).toHaveLength(9);
    expect(s.old.qEqualsT).toMatchObject({kind: 'checked', value: true});
    expect(s.copiedPrefixLeaf.id).not.toBe(s.prefixLeaf.id);
    expect(s.old.context.rawTypeProperties(s.t.id)?.content).not.toEqual(s.old.context.rawTypeProperties(s.q.id)?.content);
    expect(JSON.stringify(s.request.graph)).toBe(s.originalGraph);
  });

  it('rejects the specified retain-all fold when two independent order keys become one', async () => {
    const s = await subject();
    expect(s.folded.context.members).toEqual(s.old.context.members);
    expect(s.folded.result).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: s.w.id});
    expect(s.folded.wCheck).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: s.w.id});
    expect(s.folded.context.rawTypeProperties(s.w.id)?.derivation.base).toEqual(local(s.q.id));
    const consumer = s.folded.context.lookup(s.wContent.id); assert.equal(consumer.kind, 'found'); assert.equal(consumer.node.kind, 'particle');
    assert.equal(s.wContent.term.kind, 'sequence');
    expect(consumer.node.term).toEqual({kind: 'sequence', children: [s.wContent.term.children[0], s.p.content]});
    for (const copy of s.copies) expect(s.folded.context.lookup(copy.id).kind).toBe('found');
    expect(s.folded.context.lookup(s.p.id)).toEqual(s.actual.lookup(s.p.id));
    expect(JSON.stringify(s.request.graph)).toBe(s.originalGraph);
  });

  it('completes a separate first-birth consumer repair for the same input without removing a scaffold', async () => {
    const s = await subject(); complete(s, s.repaired);
    expect(s.repaired.context.members).toEqual(s.old.context.members);
    expect(s.repaired.context.rawTypeProperties(s.w.id)?.derivation.base).toEqual(local(s.q.id));
    const consumer = s.repaired.context.lookup(s.wContent.id); assert.equal(consumer.kind, 'found'); assert.equal(consumer.node.kind, 'particle');
    assert.equal(consumer.node.term.kind, 'sequence');
    expect(consumer.node.term.children[1]).toBe(s.copiedPrefix.id);
    expect(s.repaired.context.lookup(s.p.id)).toEqual(s.actual.lookup(s.p.id));
    expect(s.repaired.context.lookup(s.q.id)).toEqual(s.actual.lookup(s.q.id));
    expect(JSON.stringify(s.request.graph)).toBe(s.originalGraph);
  });
});
