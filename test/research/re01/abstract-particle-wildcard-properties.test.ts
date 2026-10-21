/** Abstract EMPTY is a namespace property, with full ordinary fresh-root duties and exact inheritance. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveModelGroupContent, deriveOriginalComplexParticle, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkParticleAttribution} from '../../../src/compiler/particleAttribution.js';
import {checkElementDeclarationsConsistent} from '../../../src/compiler/particleDeclarationConsistency.js';
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

type DeadCellMode = 'old' | 'safe' | 'unsafe';

async function deadCellSubject(mode: DeadCellMode) {
  const ns = 'urn:re01:pure-any-dead-source-cell';
  const input = await loadSchemaInput(path.join(directory, 'xsd/recovery/pure-any-dead-source-cell.xsd'),
    {policy: {fileRoots: [directory]}});
  const preparation = prepareSourceSchemaRequest(input); assert.equal(preparation.kind, 'prepared', JSON.stringify(preparation));
  const {request} = preparation, actual = request.actual, snapshot = JSON.stringify(request.graph);
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const original = (name: string): ComplexTypeNode => {
    const found = actual.lookup(globalId('type', {namespace: ns, local: name}));
    assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const a = original('A'), i = original('I'), d = original('D');
  const source = deriveOriginalComplexParticle(actual, d.id); assert.equal(source.kind, 'checked', JSON.stringify(source));
  const common = {context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const pId = globalId('type', {namespace: ns, local: 'P'});
  const particle = (slot: string, term: ParticleNode['term'], min = '1', max = '1'): ParticleNode => ({...common,
    kind: 'particle', id: hypotheticalScopedId(pId, slot, 'particle'),
    identity: {kind: 'scoped', owner: pId, path: slot, role: 'particle'}, term, occurs: {min, max}});
  const wildcard = (value: string): ParticleNode['term'] => ({kind: 'any',
    wildcard: {namespace: {value, context: a.context}, processContents: 'skip'}});
  const declaration = (slot: string): ElementNode => ({...common, kind: 'element',
    id: hypotheticalScopedId(pId, slot, 'element'), identity: {kind: 'scoped', owner: pId, path: slot, role: 'element'},
    name: {namespace: ns, local: 'a'}, type: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}},
    nillable: false, abstract: false});
  const a1 = declaration('/a1'), a2 = declaration('/a2');
  // OLD's required empty choice is genuinely fresh; D alone retains its own authentic SOURCE P0.
  const p0 = particle('/old-p0', {kind: 'choice', children: []});
  const oldAny = particle('/old-any', wildcard(ns), '0', '1');
  const s = particle('/cell', mode === 'old' ? {kind: 'sequence', children: [p0.id, oldAny.id]}
    : mode === 'safe' ? {kind: 'choice', children: []} : wildcard('##any'),
    mode === 'unsafe' ? '0' : mode === 'safe' ? '2' : '1', mode === 'safe' ? '2' : '1');
  const first = particle('/a1-use', {kind: 'element', declaration: local(a1.id)});
  const second = particle('/a2-use', {kind: 'element', declaration: local(a2.id)});
  const branch = particle('/first-branch', {kind: 'sequence', children: [s.id, first.id]});
  const parent = particle('/parent', {kind: 'choice', children: [branch.id, second.id]});
  const target = particle('/target-any', wildcard('##any'), '0', '1');
  const p: ComplexTypeNode = {...common, kind: 'complexType', id: pId,
    identity: {kind: 'global', role: 'type', name: {namespace: ns, local: 'P'}},
    mixed: false, abstract: false, attributes: [], content: parent.id,
    derivation: {kind: 'extension', contentKind: 'complex', base: local(a.id), facets: []}};
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(p.id), facets: []}};
  const row = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: ns,
    derivation: {method: node.derivation!.kind, base: node.derivation!.base},
    content: node.id === d.id ? source.content : node.content ? {kind: 'element-only', particle: node.content} : {kind: 'empty'},
    abstract: false, final: [], block: [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
  const additions: GraphNode[] = [p, a1, a2, s, first, second, branch, parent, target, ...(mode === 'old' ? [p0, oldAny] : [])];
  const tuple: RawParticleWildcardProperties = {particle: s.id, namespace: {kind: 'set', namespaces: []}, processContents: 'strict'};
  const built = request.candidate({key: 'dead-cell-' + mode, endpoint, additions,
    active: [...actual.members, ...additions.map(node => node.id)], rawTypes: [a, i, endpoint, p].map(row),
    rawElements: [a1, a2].map(node => ({element: node.id, type: node.type, final: [], block: []})),
    rawParticleWildcards: mode === 'unsafe' ? [tuple] : []});
  assert.equal(built.kind, 'prepared', JSON.stringify(built)); const context = built.context;
  const view = (node: ParticleNode, purpose: 'declared' | 'restriction') => {
    const content = deriveModelGroupContent(context, node.id); assert.equal(content.kind, 'checked', JSON.stringify(content));
    expect(content.view.urTypeWildcards).toEqual([]);
    const result = prepareSemanticParticleView(context, content.view, purpose); assert.equal(result.kind, 'checked', JSON.stringify(result));
    return result.view;
  };
  const cell = view(s, 'restriction'), parentView = view(parent, 'declared');
  return {mode, actual, context, request, snapshot, d, p, s, parent, additions, tuple, cell, parentView, source,
    local: checkComponentConstruction(context, s.id),
    dependencies: (mode === 'old' ? [p0, oldAny] : []).map(node => checkComponentConstruction(context, node.id)),
    restriction: checkParticleRestriction(context, cell, view(target, 'restriction')),
    attribution: checkParticleAttribution(context, parentView), edc: checkElementDeclarationsConsistent(context, [parent.id]),
    parentConstruction: checkComponentConstruction(context, p.id),
    forest: verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [{id: 'D', parent: actual, context,
      target: d.id, intermediate: p.id, ancestor: local(a.id), premises: []}]})};
}

describe('dead source cells at ordinary ANY restriction ports', () => {
  let subjects: Awaited<ReturnType<typeof deadCellSubject>>[];
  beforeAll(async () => {subjects = []; for (const mode of ['old', 'safe', 'unsafe'] as const) subjects.push(await deadCellSubject(mode));});

  it('checks local cell premises and their actual dependencies without claiming a FULL unsafe forest', () => {
    for (const s of subjects) {
      assert.equal(s.local.kind, 'checked', JSON.stringify(s.local));
      expect(s.local).toMatchObject({scope: 'local-component-premises', contextId: s.context.contextId, obligations: [], re01: undefined});
      expect(new Set(s.local.dependencies)).toEqual(new Set(s.dependencies.map(item => {assert.equal(item.kind, 'checked'); return item.component;})));
      for (const dependency of s.dependencies) {
        expect(dependency).toMatchObject({kind: 'checked', scope: 'local-component-premises', contextId: s.context.contextId,
          obligations: [], dependencies: [], typeDependencies: [], identityConstraintDependencies: []});
      }
      expect(s.local.typeDependencies).toEqual([]); expect(s.local.identityConstraintDependencies).toEqual([]);
      expect(s.restriction).toMatchObject({kind: 'checked', value: true});
      expect(s.cell.root.summary).toMatchObject({effectiveTotalRange: {min: '0', max: s.mode === 'safe' ? '0' : '1'},
        nullable: s.mode === 'unsafe', hasRealization: s.mode === 'unsafe'});
      expect(s.parentView.root.summary.nullable).toBe(false);
      expect(s.cell.root.urTypeWildcard).toBe(false);
      if (s.mode === 'unsafe') {
        expect(s.context.rawParticleWildcardProperties(s.s.id)).toEqual(s.tuple);
        expect(s.cell.root.wildcard).toMatchObject({namespace: {kind: 'set', namespaces: []}, processContents: 'strict'});
      }
    }
  });

  it('checks complete OLD and SAFE one-node forests with every actual and fresh component', () => {
    for (const s of subjects.filter(item => item.mode !== 'unsafe')) {
      assert.equal(s.forest.kind, 'checked-candidate', JSON.stringify(s.forest));
      expect(new Set(s.forest.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
      expect(s.forest.proof).toHaveLength(1);
      const step = s.forest.proof[0], checked = new Set(step.components.map(item => item.component));
      for (const addition of s.additions) expect(checked.has(addition.id)).toBe(true);
      for (const receipt of [...s.forest.actualComponents, ...step.components]) {
        expect(receipt.obligations).toEqual([]);
        expect(receipt.contextId).toBe(s.forest.actualComponents.includes(receipt) ? s.actual.contextId : s.context.contextId);
      }
      expect(step.components.filter(item => item.re01 && !item.re01.primitive)).toEqual([]);
      expect(s.context.rawTypeProperties(s.d.id)?.content).toEqual(s.source.content);
      expect(s.attribution).toMatchObject({kind: 'checked', value: true});
      expect(s.edc).toMatchObject({kind: 'checked', value: true});
      expect(s.parentConstruction).toMatchObject({kind: 'checked', obligations: []});
      expect(JSON.stringify(s.request.graph)).toBe(s.snapshot);
    }
  });

  it('rejects the UNSAFE parent for UPA while its local cell, ANY restriction and EDC remain positive', () => {
    const s = subjects.find(item => item.mode === 'unsafe')!;
    expect(s.local).toMatchObject({kind: 'checked', scope: 'local-component-premises', obligations: []});
    expect(s.restriction).toMatchObject({kind: 'checked', value: true});
    expect(s.edc).toMatchObject({kind: 'checked', value: true});
    expect(s.attribution).toMatchObject({kind: 'checked', value: false, rule: 'cos-nonambig'});
    expect(s.parentConstruction).toMatchObject({kind: 'candidate-rejected', component: s.p.id, rule: 'cos-nonambig'});
    expect(s.forest).toMatchObject({kind: 'candidate-rejected', rule: 'cos-nonambig'});
    expect(JSON.stringify(s.request.graph)).toBe(s.snapshot);
  });
});
