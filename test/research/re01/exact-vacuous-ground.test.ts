/** Exact content equality does not discharge retained consumer obligations. */
import path from 'node:path';
import assert from 'node:assert/strict';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveActualComplexContent, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import {checkSubstitution, declarationMethods, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import {declaredType} from '../../../src/compiler/schemaTypeIdentity.js';
import type {SemanticTypeReference} from '../../../src/compiler/semanticTypeReference.js';
import {assessRawAttributeUses, assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';

const namespace = 'urn:recovery:exact-vacuous-consumer';
const typeId = (name: string) => globalId('type', {namespace, local: name});
const elementId = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
function complex(context: SemanticContext, id: string): ComplexTypeNode {
  const found = context.lookup(id);
  if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error(id);
  return found.node;
}
function restriction(context: SemanticContext, id: string) {
  const content = deriveRawComplexContent(context, id);
  if (content.kind !== 'checked') throw new Error(JSON.stringify(content));
  const prepared = prepareSemanticParticleView(context, content.view, 'restriction');
  if (prepared.kind !== 'checked') throw new Error(JSON.stringify(prepared));
  return prepared.view;
}

async function seed(stable: boolean) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/exact-vacuous-consumer.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared));
  const request = prepared.request, a = complex(request.actual, typeId('A')), b = complex(request.actual, typeId('B')),
    x = complex(request.actual, typeId('X'));
  if (!a.content) throw new Error('Original A particle');
  const found = request.actual.lookup(a.content);
  if (found.kind !== 'found' || found.node.kind !== 'particle') throw new Error(a.content);
  const sourceRoot = found.node;
  const raw = (type: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({type: type.id,
    derivation: {method: type.derivation?.kind ?? 'restriction', base: type.derivation?.base ?? anyType}, content,
    abstract: false, final: [], block: [], attributeUses: [], targetNamespace: namespace,
    provenance: {kind: 'hypothetical-abstract', originals: request.actual.lookup(type.id).kind === 'found' ? [type.id] : []}});
  const rawContent = (type: ComplexTypeNode) => raw(type, {kind: 'element-only', particle: type.content!});
  const originals = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const content = deriveActualComplexContent(request.actual, node.id);
    if (content.kind !== 'checked') throw new Error(JSON.stringify(content));
    return [raw(node, content.view.content)];
  });
  const u: ComplexTypeNode = {...b, id: typeId('U'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'U'}},
    content: a.content, derivation: {kind: 'extension', contentKind: 'complex', base: local(b.id), facets: []}};
  const m: ElementNode = {kind: 'element', id: elementId('M'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'M'}},
    name: {namespace, local: 'M'}, context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    type: local(stable ? b.id : u.id), nillable: false, abstract: false, substitutionGroup: local(elementId('H'))};
  const consumer = (name: string, base: string, declaration: string) => {
    const id = typeId(name);
    const use: ParticleNode = {...sourceRoot, id: scopedId(id, '/use', 'particle'),
      identity: {kind: 'scoped', role: 'particle', owner: id, path: '/use'}, occurs: {min: '1', max: '1'},
      term: {kind: 'element', declaration: local(declaration)}};
    const root: ParticleNode = {...sourceRoot, id: scopedId(id, '/content', 'particle'),
      identity: {kind: 'scoped', role: 'particle', owner: id, path: '/content'}, occurs: {min: '1', max: '1'},
      term: {kind: 'sequence', children: [use.id]}};
    const type: ComplexTypeNode = {...b, id, identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, content: root.id,
      derivation: {kind: 'restriction', contentKind: 'complex', base: local(base), facets: []}};
    return {type, root, use};
  };
  const rh = consumer('R_H', b.id, elementId('H')), rm = consumer('R_M', rh.type.id, m.id);
  const endpoint = {...x, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(b.id), facets: []}};
  const originalRaw = [...originals.filter(properties => properties.type !== x.id), raw(endpoint, {kind: 'empty'})];
  const clean = request.candidate({key: 'complete-original-X', active: request.actual.members, endpoint, rawTypes: originalRaw});
  if (clean.kind !== 'prepared') throw new Error(JSON.stringify(clean));
  const cleanProof: FiniteRe01EvidenceNode = {id: 'clean', parent: request.actual, context: clean.context,
    target: x.id, intermediate: b.id, ancestor: local(a.id), premises: []};
  const additions = [u, m, rh.type, rh.root, rh.use, rm.type, rm.root, rm.use];
  const parent = request.candidate({key: 'exact-vacuous-parent', active: [...request.actual.members, ...additions.map(node => node.id)], additions,
    endpoint, rawTypes: [...originalRaw, ...[u, rh.type, rm.type].map(rawContent)], rawElements: [{element: m.id, type: m.type, final: [], block: []}]});
  if (parent.kind !== 'prepared') throw new Error(JSON.stringify(parent));
  const changed = {...u, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(b.id), facets: []}};
  const child = forkSemanticCandidate(parent.context, {key: 'exact-vacuous-child', active: parent.context.members, endpoint: changed,
    rawTypes: [rawContent(changed)]});
  if (child.kind !== 'prepared') throw new Error(JSON.stringify(child));
  const root: FiniteRe01EvidenceNode = {id: 'root', parent: request.actual, context: parent.context,
    target: x.id, intermediate: b.id, ancestor: local(a.id), premises: ['child']};
  const next: FiniteRe01EvidenceNode = {id: 'child', parent: parent.context, context: child.context,
    target: u.id, intermediate: b.id, ancestor: local(a.id), premises: []};
  return {request, a, b, x, u, m, rh, rm, additions, cleanProof, root, next};
}

/** An explicit property projection, not equality of source/provenance/anchor records. */
function compareParentComponents(left: SemanticContext, right: SemanticContext): ReadonlyMap<string, string> {
  const map = new Map<string, string>(), inverse = new Map<string, string>();
  const bind = (a: string, b: string): void => {
    if (map.has(a)) {assert.equal(map.get(a), b); return;}
    assert.equal(inverse.has(b), false); map.set(a, b); inverse.set(b, a);
  };
  const reference = (context: SemanticContext, ref: SemanticTypeReference): string => {
    if (ref.kind === 'original-generated') throw new Error('No scalar slot in this pair');
    const found = context.resolve(ref);
    if (found.kind === 'builtin') return `builtin:${found.name.namespace}:${found.name.local}`;
    if (found.kind !== 'found') throw new Error(JSON.stringify(found));
    return found.node.id;
  };
  const content = (context: SemanticContext, id: string) => {
    const result = context.kind === 'actual' ? deriveActualComplexContent(context, id) : deriveRawComplexContent(context, id);
    assert.equal(result.kind, 'checked'); return result.view.content;
  };
  const particle = (context: SemanticContext, id: string) => {
    const found = context.lookup(id);
    assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'particle');
    assert.equal(found.node.identity.kind, 'scoped'); assert.equal(found.node.identity.role, 'particle');
    assert.deepEqual(found.node.annotations, []); assert.deepEqual(found.node.retained, []);
    return found.node;
  };
  for (const name of ['A', 'B', 'R', 'X', 'U', 'R_H', 'R_M']) {
    const pair = [left, right].map(context => {
      const node = complex(context, typeId(name));
      assert.deepEqual(node.identity, {kind: 'global', role: 'type', name: {namespace, local: name}});
      assert.deepEqual(node.annotations, []); assert.deepEqual(node.attributes, []);
      assert.deepEqual(node.derivation?.facets ?? [], []);
      const attributes = context.kind === 'actual' ? assessSourceAttributeUses(context, node.id) : assessRawAttributeUses(context, node.id);
      assert.equal(attributes.kind, 'checked'); assert.deepEqual(attributes.value.uses, []);
      assert.deepEqual(attributes.value.schemaOperands, []); assert.equal(attributes.value.wildcard, undefined);
      return {method: node.derivation?.kind ?? 'restriction', base: reference(context, node.derivation?.base ?? anyType),
        abstract: node.abstract, mixed: node.mixed, final: declarationMethods(context, node, 'final'), block: declarationMethods(context, node, 'block')};
    });
    assert.deepEqual(pair[0], pair[1]); bind(typeId(name), typeId(name));
  }
  for (const name of ['H', 'M']) {
    const pair = [left, right].map(context => {
      const found = context.lookup(elementId(name));
      assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'element');
      const node = found.node;
      assert.deepEqual(node.identity, {kind: 'global', role: 'element', name: {namespace, local: name}});
      assert.deepEqual(node.annotations, []); assert.deepEqual(node.retained, []); assert.equal(node.value, undefined);
      return {name: node.name, type: reference(context, declaredType(context, node)), abstract: node.abstract, nillable: node.nillable,
        affiliation: node.substitutionGroup ? reference(context, node.substitutionGroup) : undefined,
        final: declarationMethods(context, node, 'final'), block: declarationMethods(context, node, 'block')};
    });
    assert.deepEqual(pair[0], pair[1]); bind(elementId(name), elementId(name));
  }
  // Map every wrapper/use incidence separately; preserve opaque equality and
  // scoped ownership rather than treating unfolded property equality as identity.
  for (const name of ['A', 'R_H', 'R_M']) {
    const a = content(left, typeId(name)), b = content(right, typeId(name));
    assert.equal(a.kind, 'element-only'); assert.equal(b.kind, 'element-only');
    const p = particle(left, a.particle), q = particle(right, b.particle);
    assert.equal(p.term.kind, 'sequence'); assert.equal(q.term.kind, 'sequence');
    assert.equal(p.term.children.length, 1); assert.equal(q.term.children.length, 1);
    const pu = particle(left, p.term.children[0]!), qu = particle(right, q.term.children[0]!);
    assert.equal(pu.term.kind, 'element'); assert.equal(qu.term.kind, 'element');
    bind(p.id, q.id); bind(pu.id, qu.id);
    for (const [a, b] of [[p, q], [pu, qu]] as const) {
      assert.deepEqual(a.occurs, b.occurs);
      assert.equal(a.identity.kind, 'scoped'); assert.equal(b.identity.kind, 'scoped');
      assert.equal(map.get(a.identity.owner), b.identity.owner);
    }
    assert.equal(map.get(reference(left, pu.term.declaration)), reference(right, qu.term.declaration));
  }
  for (const context of [left, right]) {
    const shared = ['A', 'B', 'U'].map(name => {
      const value = content(context, typeId(name)); assert.equal(value.kind, 'element-only'); return value.particle;
    });
    assert.equal(new Set(shared).size, 1);
    for (const name of ['R', 'X']) assert.equal(content(context, typeId(name)).kind, 'empty');
    assert.deepEqual(context.scalarSlots, []);
  }
  assert.equal(map.size, 15); assert.equal(inverse.size, 15);
  assert.deepEqual(new Set(map.keys()), new Set(left.members)); assert.deepEqual(new Set(map.values()), new Set(right.members));
  return map;
}

describe('exact-vacuous extension ground and retained member identity', () => {
  it.each([false, true])('qualifies every local premise and distinguishes stable exact-B membership=%s', async stable => {
    const s = await seed(stable), actual = s.request.actual, parent = s.root.context, child = s.next.context;
    expect(checkSchemaDocumentSyntax(actual)).toMatchObject({kind: 'checked'});
    for (const id of actual.members) expect(checkComponentConstruction(actual, id)).toMatchObject({kind: 'checked', obligations: []});
    const clean = verifyFiniteRe01Evidence(actual, s.x.id, {root: 'clean', nodes: [s.cleanProof]});
    expect(clean).toMatchObject({kind: 'checked-candidate', proof: [{evidence: 'clean'}]});
    if (clean.kind !== 'checked-candidate') throw new Error(JSON.stringify(clean));
    expect(() => assertFiniteCandidateReceipt(actual, clean)).not.toThrow();
    const duties: string[] = [];
    for (const id of parent.members) {
      const result = checkComponentConstruction(parent, id);
      expect(result, id).toMatchObject({kind: 'checked', obligations: []});
      if (result.kind === 'checked' && result.re01 && !result.re01.primitive) duties.push(id);
    }
    expect(duties).toEqual([s.u.id]);
    // Original B's absent source contribution is not a supplied property:
    // the source owner derives its effective particle from exact A.
    for (const id of [s.a.id, s.b.id]) expect(deriveActualComplexContent(actual, id))
      .toMatchObject({kind: 'checked', view: {content: {kind: 'element-only', particle: s.a.content}}});
    expect(deriveRawComplexContent(parent, s.u.id))
      .toMatchObject({kind: 'checked', view: {content: {kind: 'element-only', particle: s.a.content}}});
    for (const id of [s.a.id, s.b.id, s.u.id]) expect(parent.rawTypeProperties(id)).toMatchObject({
      content: {kind: 'element-only', particle: s.a.content}, attributeUses: [], final: [], block: [], abstract: false,
    });
    for (const id of [s.a.id, s.b.id, s.u.id]) expect(parent.rawTypeProperties(id)?.wildcard).toBeUndefined();
    expect(parent.rawTypeProperties(s.u.id)?.derivation).toEqual({method: 'extension', base: local(s.b.id)});
    for (const step of [s.root, s.next]) expect(checkCandidateCorrespondence(actual, step.parent, step.context,
      step.target, step.intermediate, step.ancestor)).toMatchObject({kind: 'checked'});
    expect(effectiveSubstitutionMembers(parent, elementId('H'))).toMatchObject({kind: 'checked', value: expect.arrayContaining([elementId('H'), s.m.id])});
    expect(checkParticleRestriction(parent, restriction(parent, s.rm.type.id), restriction(parent, s.rh.type.id)))
      .toMatchObject({kind: 'checked', value: true});
    expect(checkSubstitution(child, s.m.id, elementId('H'), {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
    expect(checkSubstitution(child, s.m.id, elementId('H'), {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: stable});
    const group = effectiveSubstitutionMembers(child, elementId('H'));
    expect(group.kind).toBe('checked');
    if (group.kind !== 'checked') throw new Error(JSON.stringify(group));
    expect(new Set(group.value)).toEqual(new Set([elementId('H'), ...(stable ? [s.m.id] : [])]));
    expect(checkParticleRestriction(child, restriction(child, s.rm.type.id), restriction(child, s.rh.type.id)))
      .toMatchObject({kind: 'checked', value: stable});
    const result = verifyFiniteRe01Evidence(actual, s.x.id, {root: 'root', nodes: [s.root, s.next]});
    if (!stable) {
      // Universal failure under arbitrary additions follows from the proof's
      // first-edge/QName argument; this supplied child is one discriminator.
      expect(checkComponentConstruction(child, s.rm.type.id)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
      expect(result).toMatchObject({kind: 'candidate-rejected', component: s.rm.type.id, rule: 'derivation-ok-restriction.5.4'});
    } else {
      expect(result).toMatchObject({kind: 'checked-candidate', claims: {universalCoverage: false, completeNegativeAnswer: false, searchTermination: false}});
      if (result.kind !== 'checked-candidate') throw new Error(JSON.stringify(result));
      expect(() => assertFiniteCandidateReceipt(actual, result)).not.toThrow();
      expect(result.proof).toHaveLength(2);
      for (const step of result.proof) expect(step.components.map(component => component.component))
        .toEqual(expect.arrayContaining(s.additions.map(node => node.id)));
    }
    for (const node of s.additions) if (node.id !== s.u.id) expect(child.lookup(node.id)).toEqual(parent.lookup(node.id));
  });

  it('distinguishes immutable anchors under a complete component-property graph correspondence', async () => {
    const old = await seed(false), fixtures = path.resolve('test/conformance/fixtures');
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/exact-vacuous-consumer-reanchored.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input);
    if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared));
    const request = prepared.request, actual = request.actual;
    expect(checkSchemaDocumentSyntax(actual)).toMatchObject({kind: 'checked'});
    const parentCorrespondence = checkCandidateCorrespondence(old.request.actual, old.root.parent, old.root.context,
      old.root.target, old.root.intermediate, old.root.ancestor);
    assert.equal(parentCorrespondence.kind, 'checked');
    for (const id of old.root.context.members)
      expect(checkComponentConstruction(old.root.context, id, {correspondence: parentCorrespondence})).toMatchObject({kind: 'checked', obligations: []});
    const duties: string[] = [];
    for (const id of actual.members) {
      const result = checkComponentConstruction(actual, id);
      expect(result).toMatchObject({kind: 'checked', obligations: []});
      if (result.kind === 'checked' && result.re01 && !result.re01.primitive) duties.push(id);
    }
    expect(duties).toEqual([typeId('U')]);
    compareParentComponents(old.root.context, actual);
    const u = complex(actual, typeId('U'));
    const endpoint = {...u, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(typeId('B')), facets: []}};
    const rawTypes = request.graph.nodes.flatMap(node => {
      if (node.kind !== 'complexType') return [];
      const result = deriveActualComplexContent(actual, node.id);
      assert.equal(result.kind, 'checked');
      const type = node.id === u.id ? endpoint : node;
      return [{type: type.id, derivation: {method: type.derivation?.kind ?? 'restriction', base: type.derivation?.base ?? anyType},
        abstract: false, final: [], block: [], content: result.view.content, attributeUses: [], targetNamespace: namespace,
        provenance: {kind: 'hypothetical-abstract' as const, originals: [type.id]}}];
    });
    const child = request.candidate({key: 'distinct-actual-anchor-U', active: actual.members, endpoint, rawTypes});
    if (child.kind !== 'prepared') throw new Error(JSON.stringify(child));
    const node: FiniteRe01EvidenceNode = {id: 'U', parent: actual, context: child.context, target: u.id,
      intermediate: typeId('B'), ancestor: local(typeId('A')), premises: []};
    const positive = verifyFiniteRe01Evidence(actual, u.id, {root: 'U', nodes: [node]});
    expect(positive).toMatchObject({kind: 'checked-candidate', claims: {actualObligations: 'checked'}, proof: [{evidence: 'U'}]});
    assert.equal(positive.kind, 'checked-candidate'); assertFiniteCandidateReceipt(actual, positive);
    const actualChecked = new Set(positive.actualComponents.map(receipt => receipt.component));
    const step = positive.proof[0]!, hypotheticalChecked = new Set(step.components.map(receipt => receipt.component));
    for (const name of ['R_H', 'R_M']) {
      expect(actualChecked.has(typeId(name))).toBe(true);
      expect(child.context.lookup(typeId(name))).toMatchObject({kind: 'found'});
    }
    expect(hypotheticalChecked.has(typeId('R_H'))).toBe(true);
    expect(hypotheticalChecked.has(typeId('R_M'))).toBe(false);
    expect(checkComponentConstruction(child.context, typeId('R_M'), {correspondence: step.correspondence}))
      .toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
    expect(verifyFiniteRe01Evidence(old.request.actual, old.x.id, {root: 'root', nodes: [old.root, old.next]}))
      .toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
    // Distinct authenticated inputs preserve their own original/fresh root
    // policies. No existing request is reanchored and no receipt is transferred.
    expect(actual).not.toBe(old.root.context);
  });
});
