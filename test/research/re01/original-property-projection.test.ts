import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {AttributeUseNode, ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveActualComplexContent, deriveOriginalComplexPropertyContent, particleContentNode} from '../../../src/compiler/complexTypeContent.js';
import type {ParticleContentView} from '../../../src/compiler/complexTypeContent.js';
import {assessSourceAttributeUses, readOriginalAttributeProperties} from '../../../src/compiler/schemaAttributeUses.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence, assertFiniteCandidateReceipt} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const folder = path.resolve('test/conformance/fixtures');
const namespace = 'urn:property-only-projection';
const id = (name: string) => globalId('type', {namespace, local: name});
const eid = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
async function seed() {
  const input = await loadSchemaInput(path.join(folder, 'xsd/recovery/original-property-projection-independent.xsd'), {policy: {fileRoots: [folder]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual;
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked'); assert.equal(actual.members.length, 25);
  const get = (target: string): GraphNode => {const found = actual.lookup(target); assert.equal(found.kind, 'found'); return found.node;};
  const complex = (name: string): ComplexTypeNode => {const node = get(id(name)); assert.equal(node.kind, 'complexType'); return node;};
  const scopes = ['Left', 'Right'].map(name => {
    const element = get(eid(name)); assert.equal(element.kind, 'element'); assert.equal(element.type.kind, 'local');
    const owner = get(element.type.target); assert.equal(owner.kind, 'complexType');
    const use = request.graph.nodes.find((node): node is AttributeUseNode => node.kind === 'attributeUse' && node.identity.kind === 'scoped' && node.identity.owner === owner.id);
    assert.ok(use); return {owner, use};
  });
  const actualReceipts = actual.members.map(target => checkComponentConstruction(actual, target));
  for (const receipt of actualReceipts) {assert.equal(receipt.kind, 'checked'); assert.deepEqual(receipt.obligations, []);}
  const actualNP = actualReceipts.flatMap(receipt => receipt.kind === 'checked' && receipt.re01 && !receipt.re01.primitive ? [receipt.component] : []);
  assert.deepEqual(actualNP, [id('X')]);
  const mapped = (type: string): ParticleContentView => {const result = deriveActualComplexContent(actual, type); assert.equal(result.kind, 'checked'); return result.view;};
  const actualA2 = mapped(id('A2')); assert.deepEqual(actualA2.synthetic, []);
  const sourceScopes = scopes.map(({owner, use}) => {
    const view = mapped(owner.id); assert.equal(view.synthetic.length, 1); assert.ok('particle' in view.content);
    const sourceOuter = particleContentNode(actual, view, view.content.particle); assert.equal(sourceOuter?.kind, 'particle'); assert.equal(sourceOuter.term.kind, 'sequence');
    const outer: ParticleNode = {...sourceOuter, id: scopedId(owner.id, '/reified-effective-content', 'particle'),
      identity: {kind: 'scoped', owner: owner.id, path: '/reified-effective-content', role: 'particle'}};
    const attrs = assessSourceAttributeUses(actual, owner.id); assert.equal(attrs.kind, 'checked');
    assert.deepEqual(attrs.value.uses.map(item => item.id), [use.id]);
    return {owner, use, view, sourceOuter, outer};
  });
  assert.notEqual(sourceScopes[0].sourceOuter.id, sourceScopes[1].sourceOuter.id);
  for (const scope of sourceScopes) {
    assert.equal(scope.sourceOuter.term.kind, 'sequence');
    assert.equal(scope.sourceOuter.term.children[0], 'particle' in actualA2.content ? actualA2.content.particle : undefined);
    assert.equal(actual.lookup(scope.sourceOuter.id).kind, 'missing');
  }
  const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content'], uses: readonly string[] = []): RawComplexTypeProperties => ({type: node.id,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')}, content,
    targetNamespace: namespace, abstract: false, block: [], final: [], attributeUses: uses,
    provenance: {kind: 'hypothetical-abstract', originals: actual.lookup(node.id).kind === 'found' ? [node.id] : []}});
  const helper = (name: string, method: 'extension' | 'restriction', base: Reference): ComplexTypeNode => ({...complex('R'), id: id(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, derivation: {kind: method, contentKind: 'complex', base, facets: []},
    content: undefined, attributes: [], declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []});
  const t = helper('T', 'extension', local(id('A2')));
  const head = get(eid('H')); assert.equal(head.kind, 'element');
  const n: ElementNode = {...head, id: eid('N'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'N'}}, name: {namespace, local: 'N'},
    type: local(t.id), substitutionGroup: local(head.id), declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const fa = helper('FA', 'restriction', builtin('anyType')), fr = helper('FR', 'restriction', local(fa.id)), ft = helper('FT', 'extension', local(fr.id));
  const ds: ComplexTypeNode[] = ['D1', 'D2'].map(name => ({...helper(name, 'restriction', builtin('anyType')),
    id: scopedId(fa.id, '/' + name, 'complexType'), identity: {kind: 'scoped', owner: fa.id, path: '/' + name, role: 'complexType'}}));
  const elements: ElementNode[] = ds.map((node, index) => ({...head, id: scopedId(fa.id, '/l' + index, 'element'),
    identity: {kind: 'scoped', owner: fa.id, path: '/l' + index, role: 'element'}, name: {namespace: '', local: 'l'}, type: local(node.id),
    substitutionGroup: undefined, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []}));
  const particles: ParticleNode[] = elements.map((node, index) => ({kind: 'particle', context: node.context,
    id: scopedId(fa.id, '/p' + index, 'particle'), identity: {kind: 'scoped', owner: fa.id, path: '/p' + index, role: 'particle'},
    occurs: {min: '0', max: '1'}, term: {kind: 'element', declaration: local(node.id)}, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []}));
  const parentAdditions: GraphNode[] = [t, n, {...fa, content: particles[1].id}, fr, ft, ...ds, ...elements, ...particles];
  const x: ComplexTypeNode = {...complex('X'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('B')), facets: []}};
  const sourceRows = request.graph.nodes.flatMap(node => node.kind === 'complexType' && !scopes.some(scope => scope.owner.id === node.id)
    ? [raw(node.id === x.id ? x : node, mapped(node.id).content)] : []);
  const root = request.candidate({key: 'projection-parent', active: [...actual.members, ...parentAdditions.map(node => node.id)], additions: parentAdditions, endpoint: x,
    rawTypes: [...sourceRows, raw(t, actualA2.content), raw(fa, {kind: 'element-only', particle: particles[1].id}), raw(fr, {kind: 'empty'}), raw(ft, {kind: 'empty'}),
      ...ds.map((node, index) => raw(node, {kind: 'empty'}, [scopes[index].use.id]))],
    rawElements: [n, ...elements].map(node => ({element: node.id, type: node.type, final: [], block: []}))});
  assert.equal(root.kind, 'prepared'); const parent = root.context;
  const rootCorrespondence = checkCandidateCorrespondence(actual, actual, parent, x.id, id('B'), local(id('A'))); assert.equal(rootCorrespondence.kind, 'checked');
  const parentChecked = new Set<string>(), queue = [x.id, id('B'), ...parentAdditions.map(node => node.id)], parentOwed: string[] = [];
  while (queue.length) {
    const target = queue.pop()!; if (parentChecked.has(target)) continue;
    const receipt = checkComponentConstruction(parent, target, {correspondence: rootCorrespondence}); assert.equal(receipt.kind, 'checked'); assert.deepEqual(receipt.obligations, []);
    parentChecked.add(target); queue.push(...receipt.dependencies);
    if (receipt.re01 && !receipt.re01.primitive) parentOwed.push(target);
    for (const dependency of receipt.typeDependencies) if (dependency.contextId === parent.contextId && dependency.type.kind === 'component') queue.push(dependency.type.id);
  }
  assert.deepEqual(parentOwed, [ft.id]); for (const scope of scopes) assert.equal(parentChecked.has(scope.owner.id), false);
  const membership = effectiveSubstitutionMembers(parent, head.id); assert.equal(membership.kind, 'checked'); assert.ok(membership.value.includes(n.id));
  const collision: ParticleNode = {...sourceScopes[0].sourceOuter, term: {kind: 'element', declaration: local(n.id)}};
  const child = (identity: boolean, reify = false, consume = false, collide = false) => {
    const prefix = particles[identity ? 1 : 0], fe = helper('FE', 'extension', local(fa.id));
    const outer: ParticleNode = {...prefix, id: scopedId(fe.id, '/outer', 'particle'), identity: {kind: 'scoped', owner: fe.id, path: '/outer', role: 'particle'},
      occurs: {min: '1', max: '1'}, term: {kind: 'sequence', children: [prefix.id]}};
    const middle = {...fe, content: outer.id}, endpoint: ComplexTypeNode = {...ft, derivation: {kind: 'restriction', contentKind: 'complex', base: local(fe.id), facets: []}};
    const required: ElementNode = {...head, id: eid('RequiredC'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'RequiredC'}}, name: {namespace, local: 'RequiredC'},
      type: local(scopes[0].owner.id), declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const additions: GraphNode[] = [middle, outer, ...(reify ? sourceScopes.map(scope => scope.outer) : []), ...(consume ? [required] : []), ...(collide ? [collision] : [])];
    const candidate = forkSemanticCandidate(parent, {key: [identity, reify, consume, collide].join('-'), active: [...parent.members, ...additions.map(node => node.id)], additions, endpoint,
      rawTypes: [raw(endpoint, {kind: 'empty'}), raw(middle, {kind: 'element-only', particle: outer.id}),
        ...(reify ? sourceScopes.map(scope => raw(scope.owner, {kind: 'element-only', particle: scope.outer.id}, [scope.use.id])) : [])],
      rawElements: consume ? [{element: required.id, type: required.type, final: [], block: []}] : []});
    assert.equal(candidate.kind, 'prepared'); const context = candidate.context;
    const correspondence = checkCandidateCorrespondence(actual, parent, context, endpoint.id, middle.id, local(fa.id)); assert.equal(correspondence.kind, 'checked', JSON.stringify(correspondence));
    const pair = elements.map(node => {const found = context.lookup(node.id); assert.equal(found.kind, 'found'); return found.node;});
    const equality = compareComponentProperties(context, pair[0], pair[1]);
    const localFE = checkComponentConstruction(context, middle.id, {correspondence});
    const wrappers = reify ? sourceScopes.map(scope => checkComponentConstruction(context, scope.outer.id, {correspondence})) : [];
    const proof = verifyFiniteRe01Evidence(actual, x.id, {root: 'X', nodes: [
      {id: 'X', parent: actual, context: parent, target: x.id, intermediate: id('B'), ancestor: local(id('A')), premises: ['FT']},
      {id: 'FT', parent, context, target: ft.id, intermediate: middle.id, ancestor: local(fa.id), premises: []},
    ]});
    return {context, correspondence, equality, localFE, wrappers, proof, required};
  };
  return {request, actual, scopes, sourceScopes, parent, parentChecked, parentOwed, child, t, x, raw, helper, collision, elements, id, local};
}

describe('guarded original property views in exact candidate contexts', () => {
  it.each([true, false])('checks a complete two-node forest with identity=%s and no installed source wrappers', async identity => {
    const s = await seed(), child = s.child(identity);
    assert.equal(child.proof.kind, 'checked-candidate'); assertFiniteCandidateReceipt(s.actual, child.proof);
    expect(child.proof.proof).toHaveLength(2);
    expect(child.context.members).toHaveLength(s.parent.members.length + 2);
    expect(child.context.members).toEqual(expect.arrayContaining([...s.actual.members]));
    expect(new Set(child.proof.actualComponents.map(receipt => receipt.component))).toEqual(new Set(s.actual.members));
    for (const scope of s.sourceScopes) {
      expect(child.context.rawTypeProperties(scope.owner.id)).toBeUndefined();
      expect(child.context.lookup(scope.sourceOuter.id).kind).toBe('missing');
      expect(child.proof.proof.flatMap(step => step.components.map(receipt => receipt.component))).not.toContain(scope.owner.id);
      expect(checkComponentConstruction(child.context, scope.owner.id, {correspondence: child.correspondence}).kind).toBe('unresolved');
    }
    const t = child.proof.proof.flatMap(step => step.components.filter(receipt => receipt.component === s.t.id));
    expect(t.length).toBeGreaterThan(0); for (const receipt of t) expect(receipt.re01?.primitive).toBe(true);
  });

  it('issues a private H view with the original graph sharing and checks individual AUs in H', async () => {
    const s = await seed(), child = s.child(false);
    for (const scope of s.sourceScopes) {
      const result = deriveOriginalComplexPropertyContent(child.context, scope.owner.id); assert.equal(result.kind, 'checked');
      expect(result.view).toMatchObject({contextId: child.context.contextId, scope: 'original-property-projection', content: scope.view.content,
        synthetic: scope.view.synthetic, urTypeWildcards: scope.view.urTypeWildcards});
      expect(particleContentNode(child.context, result.view, scope.sourceOuter.id)).toBe(scope.sourceOuter);
      expect(() => particleContentNode(child.context, scope.view, scope.sourceOuter.id)).toThrow(/Unauthenticated or foreign/);
      expect(() => particleContentNode(child.context, {...result.view}, scope.sourceOuter.id)).toThrow(/Unauthenticated or foreign/);
      const attrs = readOriginalAttributeProperties(child.context, scope.owner.id); assert.equal(attrs.kind, 'checked');
      expect(attrs.authority).toBe('AU01-C1-original-properties-v1'); expect(attrs.contextId).toBe(child.context.contextId);
      expect(attrs.value.uses.map(use => use.id)).toEqual([scope.use.id]); expect(attrs.obligations).toEqual(['aggregate-type-validity']);
      expect(attrs.typeDependencies.every(dependency => dependency.contextId === s.actual.contextId || dependency.contextId === child.context.contextId)).toBe(true);
    }
  });

  it('keeps literal raw rows authoritative and installed source wrappers mandatory', async () => {
    const s = await seed(), copied = s.child(false, true);
    expect(copied.equality).toMatchObject({kind: 'checked', value: true});
    expect(copied.localFE).toMatchObject({kind: 'checked', obligations: []});
    for (const scope of s.sourceScopes) {
      const result = deriveOriginalComplexPropertyContent(copied.context, scope.owner.id); assert.equal(result.kind, 'checked');
      expect(result.view.scope).toBe('candidate-raw-properties');
      expect(result.view.content).toEqual({kind: 'element-only', particle: scope.outer.id});
    }
    for (const result of copied.wrappers) expect(result).toMatchObject({kind: 'candidate-rejected', rule: 'cos-element-consistent'});
    expect(copied.proof).toMatchObject({kind: 'candidate-rejected', rule: 'cos-element-consistent'});
    const consumed = s.child(true, true, true);
    expect(checkComponentConstruction(consumed.context, s.scopes[0].owner.id, {correspondence: consumed.correspondence}))
      .toMatchObject({kind: 'candidate-rejected', rule: 'cos-element-consistent'});
    expect(consumed.proof).toMatchObject({kind: 'candidate-rejected', rule: 'cos-element-consistent'});
  });

  it('refuses active and outside-context synthetic-ID collisions without shadowing real H nodes', async () => {
    const s = await seed(), colliding = s.child(true, false, false, true);
    expect(colliding.proof.kind).toBe('checked-candidate');
    expect(colliding.equality).toMatchObject({kind: 'unresolved', rule: 'original-property-synthetic-collision'});
    expect(colliding.context.lookup(s.collision.id)).toMatchObject({kind: 'found', node: {kind: 'particle', term: {kind: 'element'}}});
    const sparse = forkSemanticCandidate(colliding.context, {key: 'outside-synthetic', active: colliding.context.members.filter(id => id !== s.collision.id)});
    assert.equal(sparse.kind, 'prepared'); expect(sparse.context.lookup(s.collision.id).kind).toBe('outside-context');
    expect(deriveOriginalComplexPropertyContent(sparse.context, s.scopes[0].owner.id))
      .toMatchObject({kind: 'unresolved', rule: 'original-property-synthetic-collision'});
    // This last structurally incomplete context proves only the nonshadowing guard.
  });

  it('requires a factory-authenticated untouched original, not retained source metadata', async () => {
    const s = await seed(), scope = s.scopes[0].owner;
    const changed = forkSemanticCandidate(s.parent, {key: 'changed-scope', active: s.parent.members, endpoint: scope});
    assert.equal(changed.kind, 'prepared');
    const later = forkSemanticCandidate(changed.context, {key: 'retained-scope', active: changed.context.members}); assert.equal(later.kind, 'prepared');
    expect(later.context.sourceNode(scope.id)).toBe(s.actual.sourceNode(scope.id));
    expect(later.context.originalComplexPropertySource(scope.id)).toBeUndefined();
    expect(deriveOriginalComplexPropertyContent(later.context, scope.id)).toMatchObject({kind: 'unresolved', rule: 'component-complex-properties'});
    const fresh = s.helper('NoRow', 'restriction', builtin('anyType'));
    const candidate = forkSemanticCandidate(s.parent, {key: 'fresh-no-row', active: [...s.parent.members, fresh.id], additions: [fresh]});
    assert.equal(candidate.kind, 'prepared');
    expect(deriveOriginalComplexPropertyContent(candidate.context, fresh.id)).toMatchObject({kind: 'unresolved', rule: 'component-complex-properties'});
  });

  it('keeps suppressed source-only complex records ineligible', async () => {
    const input = await loadSchemaInput(path.join(folder, 'xsd/recovery/original-generated-absent-independent.xsd'), {policy: {fileRoots: [folder]}});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    const hidden = prepared.request.graph.nodes.find(node => node.kind === 'complexType' && prepared.request.actual.originalSourceComponentAbsent(node.id));
    assert.ok(hidden?.kind === 'complexType');
    const candidate = prepared.request.candidate({key: 'suppressed-original', active: prepared.request.actual.members}); assert.equal(candidate.kind, 'prepared');
    expect(candidate.context.originalComplexPropertySource(hidden.id)).toBeUndefined();
    expect(deriveOriginalComplexPropertyContent(candidate.context, hidden.id)).toMatchObject({kind: 'unresolved', rule: 'component-complex-properties'});
    // The fixture also has invalid live scalar cases: only structural eligibility is asserted.
  });
});
