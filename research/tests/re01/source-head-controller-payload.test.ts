/** A supplied whole SOURCE payload can require a joint nominal-controller reconstruction. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle, deriveRawComplexContent, deriveOriginalComplexPropertyContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkRawParticleExtension} from '../../../src/compiler/particleExtension.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {checkSubstitution, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteProofStep, FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexContent, RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:source-head-payload-shadow';
const tid = (name: string) => globalId('type', {namespace, local: name});
const eid = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
type Mode = 'OLD' | 'INTERNAL' | 'JOINT';

async function subject(mode: Mode) {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/source-head-controller-payload.xsd'), {policy: {fileRoots: [fixtures]}});
  const preparation = prepareSourceSchemaRequest(input); assert.equal(preparation.kind, 'prepared');
  const {request} = preparation, actual = request.actual, snapshot = JSON.stringify(request.graph);
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  // These are actual-Gamma checks before m exists, not transported FULL receipts in a later H.
  const actualComponents = actual.members.map(id => checkComponentConstruction(actual, id));
  const get = (context: SemanticContext, id: string): GraphNode => {
    const found = context.lookup(id); assert.equal(found.kind, 'found'); return found.node;
  };
  const original = (name: string): ComplexTypeNode => {
    const node = get(actual, tid(name)); assert.equal(node.kind, 'complexType'); return node;
  };
  const a = original('A'), b = original('B'), i = original('I'), d = original('D');
  const carrier = get(actual, eid('carrier')); assert.equal(carrier.kind, 'element');
  const resolved = actual.resolve(carrier.type); assert.equal(resolved.kind, 'found'); assert.equal(resolved.node.kind, 'complexType');
  const tau = resolved.node; assert.equal(tau.identity.kind, 'scoped');
  const whole = deriveOriginalComplexParticle(actual, tau.id); assert.equal(whole.kind, 'checked');
  const common = {context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const complex = (name: string, method: 'extension' | 'restriction', base: Reference, body?: string, anonymous = false): ComplexTypeNode => {
    const slot = '/source-head/' + name;
    return {...common, kind: 'complexType', id: anonymous ? hypotheticalScopedId(d.id, slot, 'type') : tid(name),
      identity: anonymous ? {kind: 'scoped', owner: d.id, path: slot, role: 'type'} : {kind: 'global', role: 'type', name: {namespace, local: name}},
      mixed: false, abstract: false, attributes: [], content: body, derivation: {kind: method, contentKind: 'complex', base, facets: []}};
  };
  const row = (node: ComplexTypeNode, content: RawComplexContent): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation!.kind, base: node.derivation!.base}, content, abstract: false, final: [], block: [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
  const originalRows = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const mapped = deriveActualComplexContent(actual, node.id); assert.equal(mapped.kind, 'checked');
    if ('particle' in mapped.view.content) {
      const issued = deriveOriginalComplexParticle(actual, node.id); assert.equal(issued.kind, 'checked'); return [row(node, issued.content)];
    }
    return [row(node, mapped.view.content)];
  });
  const j0 = complex('J0', 'extension', local(a.id)), c = complex('c', 'restriction', local(b.id), whole.content.particle, true);
  const u = complex('U', 'extension', local(mode === 'OLD' ? i.id : c.id), whole.content.particle, true);
  const member: ElementNode = {...common, kind: 'element', id: eid('delta'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'delta'}},
    name: {namespace, local: 'delta'}, type: local(mode === 'JOINT' ? c.id : u.id), abstract: false, nillable: false, substitutionGroup: local(eid('rho'))};
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(j0.id), facets: []}};
  const sourceD = originalRows.find(value => value.type === d.id); assert.ok(sourceD);
  const fresh: GraphNode[] = [j0, u, member, ...(mode === 'OLD' ? [] : [c])];
  const built = request.candidate({key: 'source-head-' + mode, endpoint, active: [...actual.members, ...fresh.map(node => node.id)], additions: fresh,
    rawTypes: [...originalRows.filter(value => value.type !== d.id), row(endpoint, sourceD.content), row(j0, {kind: 'empty'}), row(u, whole.content),
      ...(mode === 'OLD' ? [] : [row(c, whole.content)])], rawElements: [{element: member.id, type: member.type, final: [], block: []}]});
  assert.equal(built.kind, 'prepared'); const parent = built.context;
  const retired: ComplexTypeNode = {...u, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
  const next = forkSemanticCandidate(parent, {key: mode + '-U-child', endpoint: retired, active: parent.members, rawTypes: [row(retired, whole.content)]});
  assert.equal(next.kind, 'prepared'); const child = next.context;
  const root: FiniteRe01EvidenceNode = {id: 'D', parent: actual, context: parent, target: d.id, intermediate: j0.id, ancestor: local(a.id), premises: ['U']};
  const nested: FiniteRe01EvidenceNode = {id: 'U', parent, context: child, target: u.id, intermediate: b.id, ancestor: local(a.id), premises: []};
  const forest = verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [root, nested]});
  const missing = verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [{...root, premises: []}]});
  const state = (context: SemanticContext) => {
    const uv = deriveRawComplexContent(context, u.id), bv = deriveOriginalComplexPropertyContent(context, b.id);
    assert.equal(uv.kind, 'checked'); assert.equal(bv.kind, 'checked');
    const us = prepareSemanticParticleView(context, uv.view, 'restriction'), bs = prepareSemanticParticleView(context, bv.view, 'restriction');
    assert.equal(us.kind, 'checked'); assert.equal(bs.kind, 'checked');
    const uNode = get(context, u.id); assert.equal(uNode.kind, 'complexType');
    const base = uNode.derivation!.base; assert.equal(base.kind, 'local');
    const mappedBase = deriveRawComplexContent(context, base.target); assert.equal(mappedBase.kind, 'checked');
    return {context, uNode, pool: effectiveSubstitutionMembers(context, eid('rho')), affiliation: checkSubstitution(context, member.id, eid('rho'), {mode: 'affiliation'}),
      restriction: checkParticleRestriction(context, us.view, bs.view), extension: context === parent ? checkRawParticleExtension(context, uv.view, mappedBase.view) : undefined,
      u: checkComponentConstruction(context, u.id), c: mode === 'OLD' ? undefined : checkComponentConstruction(context, c.id),
      tauFull: checkComponentConstruction(context, tau.id), property: compareComponentProperties(context, uNode, get(context, tau.id))};
  };
  return {mode, actual, parent, child, actualComponents, a, b, i, d, j0, c, u, member, tau, carrier, whole: whole.content, fresh, forest, missing,
    states: [state(parent), state(child)], graphUnchanged: JSON.stringify(request.graph) === snapshot};
}

type Subject = Awaited<ReturnType<typeof subject>>;
let old: Subject, internal: Subject, joint: Subject;
beforeAll(async () => {old = await subject('OLD'); internal = await subject('INTERNAL'); joint = await subject('JOINT');});

function checkCommon(s: Subject) {
  expect(s.actual.members).toHaveLength(14); expect(s.actualComponents).toHaveLength(14);
  for (const result of s.actualComponents) {
    assert.equal(result.kind, 'checked'); expect(result.contextId).toBe(s.actual.contextId); expect(result.obligations).toEqual([]);
  }
  expect(s.fresh).toHaveLength(s.mode === 'OLD' ? 3 : 4);
  expect(s.parent.members).toHaveLength(14 + s.fresh.length); expect(s.child.members).toEqual(s.parent.members);
  expect(s.graphUnchanged).toBe(true);
  for (const node of s.fresh.filter(node => node.id !== s.u.id)) expect(s.child.lookup(node.id)).toEqual(s.parent.lookup(node.id));
  for (const [index, state] of s.states.entries()) {
    expect(state.context.rawTypeProperties(s.u.id)?.content).toEqual(s.whole);
    expect(state.uNode.content).toBe(s.whole.particle);
    expect(state.context.rawElementProperties(s.member.id)?.type).toEqual(s.member.type);
    assert.equal(state.pool.kind, 'checked'); expect(new Set(state.pool.value)).toEqual(new Set([eid('rho'), s.member.id]));
    assert.equal(state.affiliation.kind, 'checked'); expect(state.affiliation.value).toBe(true);
    assert.equal(state.u.kind, 'checked'); expect(state.u.obligations).toEqual([]);
    expect(state.u.contextId).toBe(state.context.contextId);
    assert.equal(state.property.kind, 'checked'); expect(state.property.value).toBe(index === 1);
  }
  expect(s.parent.rawTypeProperties(s.u.id)?.derivation).toEqual({method: 'extension', base: local(s.mode === 'OLD' ? s.i.id : s.c.id)});
  expect(s.child.rawTypeProperties(s.u.id)?.derivation).toEqual({method: 'restriction', base: local(s.b.id)});
  if (s.mode !== 'OLD') {
    expect(s.parent.rawTypeProperties(s.c.id)?.content).toEqual(s.whole);
    const current = s.child.lookup(s.c.id); assert.equal(current.kind, 'found');
    assert.equal(current.node.kind, 'complexType'); expect(current.node.content).toBe(s.whole.particle);
  }
}

function checkPositive(s: Subject, consumed: readonly [number, number]) {
  checkCommon(s); assert.equal(s.forest.kind, 'checked-candidate');
  expect(new Set(s.forest.actualComponents.map(receipt => receipt.component))).toEqual(new Set(s.actual.members));
  expect(s.forest.proof).toHaveLength(2);
  for (const [index, state] of s.states.entries()) {
    const proof: FiniteProofStep | undefined = s.forest.proof.find(step => step.contextId === state.context.contextId); assert.ok(proof);
    expect(proof.components).toHaveLength(consumed[index]!);
    const ids = new Set(proof.components.map(receipt => receipt.component));
    for (const node of s.fresh) expect(ids.has(node.id)).toBe(true);
    // The original whole-content owner is available; it is not silently a current FULL root.
    expect(ids.has(s.tau.id)).toBe(false); expect(ids.has(s.carrier.id)).toBe(false);
    for (const receipt of proof.components) {
      expect(receipt.contextId).toBe(state.context.contextId); expect(receipt.obligations).toEqual([]);
      for (const dependency of receipt.typeDependencies) expect(dependency.contextId).toBe(state.context.contextId);
    }
    const uReceipt = proof.components.find(receipt => receipt.component === s.u.id); assert.ok(uReceipt);
    if (index === 0) expect(uReceipt.re01).toMatchObject({target: s.u.id, primitive: false});
    else expect(uReceipt.re01).toBeUndefined();
  }
  expect(s.missing).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.u.id});
}

describe('SOURCE whole payload with a nominal head controller', () => {
  // Source plan aa6707e4 independently classifies these supplied constructions, not all possible witnesses.
  it('checks OLD with every current root and a genuine U child without FULL tau in H', () => {
    checkPositive(old, [15, 13]); expect(old.parent.lookup(old.c.id).kind).toBe('missing');
    const [parent, child] = old.states; assert.ok(parent && child);
    assert.equal(parent.restriction.kind, 'checked'); expect(parent.restriction.value).toBe(false);
    expect(parent.tauFull).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
    assert.equal(child.restriction.kind, 'checked'); expect(child.restriction.value).toBe(true); expect(child.tauFull.kind).toBe('checked');
    // The production EMPTY-base constructor skips this standalone nonempty-particle predicate.
    assert.equal(parent.extension?.kind, 'checked'); expect(parent.extension.value).toBe(false);
  });

  it('rejects INTERNAL at c 5.4 despite the same-whole U/c raw extension and local U proof', () => {
    checkCommon(internal);
    expect(internal.forest).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: internal.c.id});
    const [parent, child] = internal.states; assert.ok(parent && child);
    assert.equal(parent.extension?.kind, 'checked'); expect(parent.extension.value).toBe(true);
    assert.equal(parent.restriction.kind, 'checked'); expect(parent.restriction.value).toBe(false);
    expect(parent.c).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: internal.c.id});
    expect(child.c?.kind).toBe('checked');
  });

  it('checks JOINT after m TYPE c is chosen at birth, retaining the required exact-B U child', () => {
    checkPositive(joint, [15, 14]); expect(joint.member.type).toEqual(local(joint.c.id));
    for (const state of joint.states) {
      assert.equal(state.c?.kind, 'checked'); expect(state.c.obligations).toEqual([]);
      assert.equal(state.restriction.kind, 'checked'); expect(state.restriction.value).toBe(true); expect(state.tauFull.kind).toBe('checked');
    }
    const parent = joint.states[0]; assert.ok(parent); assert.equal(parent.extension?.kind, 'checked'); expect(parent.extension.value).toBe(true);
    assert.equal(joint.forest.kind, 'checked-candidate');
    const proof = joint.forest.proof.find(step => step.contextId === joint.parent.contextId); assert.ok(proof);
    const c = proof.components.find(receipt => receipt.component === joint.c.id); assert.ok(c);
    const member = proof.components.find(receipt => receipt.component === joint.member.id); assert.ok(member);
    expect(c.typeDependencies.some(dep => dep.type.kind === 'component' && dep.type.id === joint.c.id)).toBe(true);
    expect(member.typeDependencies.some(dep => dep.type.kind === 'component' && dep.type.id === joint.c.id)).toBe(true);
  });
});
