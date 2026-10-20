/** Abstract EMPTY is a namespace property, with full ordinary fresh-root duties and exact inheritance. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import type {ComplexTypeNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawParticleWildcardProperties} from '../../../src/compiler/schemaParticleWildcardProperties.js';

const directory = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:abstract-particle-wildcard';
const tid = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};

async function subject(withChild = false, processContents: RawParticleWildcardProperties['processContents'] = 'strict') {
  const loaded = await loadSchemaInput(path.join(directory, 'xsd/recovery/abstract-particle-wildcard-properties.xsd'),
    {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared', JSON.stringify(prepared));
  const {request} = prepared, actual = request.actual, snapshot = JSON.stringify(request.graph);
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const original = (name: string): ComplexTypeNode => {
    const found = actual.lookup(tid(name)); assert.equal(found.kind, 'found');
    assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const a = original('A'), b = original('B'), r = original('R'), d = original('D');
  const b0 = original('B0'), b1 = original('B1');
  const common = {context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const w: ParticleNode = {...common, kind: 'particle', id: hypotheticalScopedId(d.id, '/empty-wildcard', 'particle'),
    identity: {kind: 'scoped', owner: d.id, path: '/empty-wildcard', role: 'particle'}, occurs: {min: '1', max: '1'},
    term: {kind: 'any', wildcard: {namespace: {value: '##any', context: a.context}, processContents: 'skip'}}};
  const helper = (name: string, method: 'restriction' | 'extension', base: string, content?: string): ComplexTypeNode => ({...common,
    kind: 'complexType', id: tid(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    mixed: false, abstract: false, attributes: [], content,
    derivation: {kind: method, contentKind: 'complex', base: local(base), facets: []}});
  const u = helper('U', 'restriction', b0.id, w.id), v = helper('V', 'restriction', b1.id, w.id);
  const c = helper('C', 'extension', a.id), z = helper('Z', 'extension', c.id);
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    content: node.content ? {kind: 'element-only', particle: node.content} : {kind: 'empty'},
    abstract: false, final: [], block: [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.lookup(node.id).kind === 'found' ? [node.id] : []}});
  const additions = [u, v, w, ...(withChild ? [c, z] : [])];
  const tuple: RawParticleWildcardProperties = {particle: w.id, namespace: {kind: 'set', namespaces: []}, processContents};
  const built = request.candidate({key: 'shared-empty', endpoint, active: [...actual.members, ...additions.map(node => node.id)],
    additions, rawTypes: [a, b, r, endpoint, b0, b1, u, v, ...(withChild ? [c, z] : [])].map(raw), rawParticleWildcards: [tuple]});
  assert.equal(built.kind, 'prepared', JSON.stringify(built)); const context = built.context;
  const root: FiniteRe01EvidenceNode = {id: 'D', parent: actual, context, target: d.id, intermediate: b.id, ancestor: local(a.id),
    premises: withChild ? ['Z'] : []};
  let child = context;
  const nodes: FiniteRe01EvidenceNode[] = [root];
  if (withChild) {
    const endpoint: ComplexTypeNode = {...z, derivation: {kind: 'restriction', contentKind: 'complex', base: local(c.id), facets: []}};
    const fork = forkSemanticCandidate(context, {key: 'Z-child', active: context.members, endpoint, rawTypes: [raw(endpoint)]});
    assert.equal(fork.kind, 'prepared', JSON.stringify(fork)); child = fork.context;
    nodes.push({id: 'Z', parent: context, context: child, target: z.id, intermediate: c.id, ancestor: local(a.id), premises: []});
  }
  return {actual, request, snapshot, context, child, additions, u, v, w, z, tuple,
    result: verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes}),
    missing: () => verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [{...root, premises: []}]})};
}

describe('complete abstract particle wildcard properties', () => {
  it.each([false, true])('checks shared EMPTY against both disjoint singleton bases, inherited child=%s', async withChild => {
    const s = await subject(withChild), result = s.result;
    assert.equal(result.kind, 'checked-candidate', JSON.stringify(result));
    expect(result.actualComponents).toHaveLength(11); expect(new Set(result.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
    expect(result.proof).toHaveLength(withChild ? 2 : 1);
    for (const step of result.proof) {
      const owner = step.contextId === s.context.contextId ? s.context : s.child;
      expect(step.components).toHaveLength(withChild && owner === s.context ? 14 : 12);
      const checked = new Set(step.components.map(item => item.component));
      for (const fresh of s.additions) expect(checked.has(fresh.id)).toBe(true);
      for (const receipt of step.components) {expect(receipt.contextId).toBe(owner.contextId); expect(receipt.obligations).toEqual([]);}
      expect(owner.rawParticleWildcardProperties(s.w.id)).toEqual(s.context.rawParticleWildcardProperties(s.w.id));
      expect(step.components.filter(item => item.re01 && !item.re01.primitive).map(item => item.component))
        .toEqual(withChild && owner === s.context ? [s.z.id] : []);
    }
    expect(s.context.members).toHaveLength(withChild ? 16 : 14);
    for (const node of [s.u, s.v]) {
      const content = deriveRawComplexContent(s.context, node.id); assert.equal(content.kind, 'checked');
      expect(content.view.urTypeWildcards).toEqual([]);
      const view = prepareSemanticParticleView(s.context, content.view, 'restriction'); assert.equal(view.kind, 'checked');
      expect(view.view.root.wildcard).toMatchObject({namespace: {kind: 'set', namespaces: []}, processContents: 'strict'});
      expect(view.view.root.summary).toMatchObject({nullable: false, hasRealization: false, wildcard: {min: '0', max: '0'},
        effectiveTotalRange: {min: '1', max: '1'}, schemaEmptiable: false});
    }
    expect(checkComponentConstruction(s.context, s.w.id)).toMatchObject({kind: 'checked', obligations: []});
    if (withChild) expect(s.missing()).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.z.id});
    expect(JSON.stringify(s.request.graph)).toBe(s.snapshot);
  });

  it('retains strict process requirements even when the selected namespace is EMPTY', async () => {
    const s = await subject(false, 'skip');
    expect(s.result).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
    expect(checkComponentConstruction(s.context, s.w.id)).toMatchObject({kind: 'checked'});
    expect(s.context.rawParticleWildcardProperties(s.w.id)).toEqual({...s.tuple, processContents: 'skip'});
  });
});
