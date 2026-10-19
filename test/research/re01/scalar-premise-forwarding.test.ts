/** Extension property equality preserves typed prerequisites for their existing owners. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {AttributeUseNode, ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import type {ComponentConstructionReceipt} from '../../../src/compiler/schemaConstructionAssessment.js';
import type {ScalarObligation} from '../../../src/compiler/scalarSchemaAssessment.js';
import {deriveActualComplexContent, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {checkRawParticleExtension} from '../../../src/compiler/particleExtension.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});

async function seed(nonprimitive = false) {
  const namespace = 'urn:recovery:scalar-premise-' + (nonprimitive ? 'nonprimitive' : 'forwarding');
  const id = (name: string) => globalId('type', {namespace, local: name});
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-premise-' + (nonprimitive ? 'nonprimitive' : 'forwarding') + '-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual;
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  assert.equal(actual.members.length, nonprimitive ? 22 : 20);
  const get = (target: string): GraphNode => {const found = actual.lookup(target); assert.equal(found.kind, 'found'); return found.node;};
  const complex = (name: string): ComplexTypeNode => {const node = get(id(name)); assert.equal(node.kind, 'complexType'); return node;};
  const innerTypes = request.graph.nodes.filter((node): node is ComplexTypeNode => node.kind === 'complexType'
    && node.identity.kind === 'scoped' && node.derivation?.kind === 'extension');
  assert.equal(innerTypes.length, 2);
  const actualNP = [];
  for (const target of actual.members) {
    const receipt = checkComponentConstruction(actual, target); assert.equal(receipt.kind, 'checked'); assert.deepEqual(receipt.obligations, []);
    if (receipt.re01 && !receipt.re01.primitive) actualNP.push(target);
  }
  assert.deepEqual(new Set(actualNP), new Set([id('X'), ...(nonprimitive ? innerTypes.map(node => node.id) : [])]));
  const rows: RawComplexTypeProperties[] = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const content = deriveActualComplexContent(actual, node.id), attrs = assessSourceAttributeUses(actual, node.id);
    assert.equal(content.kind, 'checked'); assert.deepEqual(content.view.synthetic, []); assert.equal(attrs.kind, 'checked');
    return [{type: node.id, targetNamespace: namespace, abstract: false, final: [], block: [], content: content.view.content,
      derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')},
      attributeUses: attrs.value.uses.map(use => use.id), wildcard: attrs.value.wildcard, provenance: {kind: 'actual-mapped', original: node.id}}];
  });
  const row = (target: string) => {const value = rows.find(row => row.type === target); assert.ok(value); return value;};
  const helper = (name: string, method: 'extension' | 'restriction', base: Reference): ComplexTypeNode => ({...complex('R'), id: id(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, derivation: {kind: method, contentKind: 'complex', base, facets: []},
    content: undefined, attributes: [], declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []});
  const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content'], uses: readonly string[] = []): RawComplexTypeProperties => ({type: node.id,
    targetNamespace: namespace, abstract: false, final: [], block: [], derivation: {method: node.derivation!.kind, base: node.derivation!.base}, content,
    attributeUses: uses, provenance: {kind: 'hypothetical-abstract', originals: []}});
  const scopes = ['Left', 'Right'].map(name => {
    const element = get(globalId('element', {namespace, local: name})); assert.equal(element.kind, 'element'); assert.equal(element.type.kind, 'local');
    const owner = get(element.type.target); assert.equal(owner.kind, 'complexType');
    const use = request.graph.nodes.find((node): node is AttributeUseNode => node.kind === 'attributeUse' && node.identity.kind === 'scoped' && node.identity.owner === owner.id);
    assert.ok(use); return {owner, use};
  });
  const fa = helper('FA', 'restriction', builtin('anyType')), fr = helper('FR', 'restriction', local(fa.id)), ft = helper('FT', 'extension', local(fr.id));
  const ds: ComplexTypeNode[] = ['D1', 'D2'].map(name => ({...helper(name, 'restriction', builtin('anyType')),
    id: scopedId(fa.id, '/' + name, 'complexType'), identity: {kind: 'scoped', owner: fa.id, path: '/' + name, role: 'complexType'}}));
  const elementSeed = get(globalId('element', {namespace, local: 'Left'})); assert.equal(elementSeed.kind, 'element');
  const elements: ElementNode[] = ds.map((node, index) => ({...elementSeed,
    id: scopedId(fa.id, '/l' + index, 'element'), identity: {kind: 'scoped', owner: fa.id, path: '/l' + index, role: 'element'},
    name: {namespace: '', local: 'l'}, type: local(node.id), declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []}));
  const particles: ParticleNode[] = elements.map((node, index) => ({kind: 'particle', context: node.context,
    id: scopedId(fa.id, '/p' + index, 'particle'), identity: {kind: 'scoped', owner: fa.id, path: '/p' + index, role: 'particle'},
    occurs: {min: '0', max: '1'}, term: {kind: 'element', declaration: local(node.id)}, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []}));
  const additions: GraphNode[] = [{...fa, content: particles[1].id}, fr, ft, ...ds, ...elements, ...particles];
  const x: ComplexTypeNode = {...complex('X'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('B')), facets: []}};
  const supplied = request.candidate({key: 'parent', active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint: x,
    rawTypes: [...rows.filter(row => row.type !== x.id), {...raw(x, {kind: 'empty'}), provenance: {kind: 'hypothetical-abstract', originals: [x.id]}},
      raw(fa, {kind: 'element-only', particle: particles[1].id}), raw(fr, {kind: 'empty'}), raw(ft, {kind: 'empty'}),
      ...ds.map((node, index) => raw(node, {kind: 'empty'}, [scopes[index].use.id]))],
    rawElements: elements.map(node => ({element: node.id, type: node.type, final: [], block: []}))});
  assert.equal(supplied.kind, 'prepared'); const parent = supplied.context;
  const parentCorrespondence = checkCandidateCorrespondence(actual, actual, parent, x.id, id('B'), local(id('A'))); assert.equal(parentCorrespondence.kind, 'checked');
  const parentChecked = new Set<string>(), queue = [x.id, id('B'), ...additions.map(node => node.id)], generated: string[] = [];
  while (queue.length) {
    const target = queue.pop()!; if (parentChecked.has(target)) continue;
    const receipt = checkComponentConstruction(parent, target, {correspondence: parentCorrespondence}); assert.equal(receipt.kind, 'checked'); assert.deepEqual(receipt.obligations, []);
    parentChecked.add(target); queue.push(...receipt.dependencies);
    if (receipt.re01 && !receipt.re01.primitive) generated.push(target);
    for (const dependency of receipt.typeDependencies) if (dependency.contextId === parent.contextId && dependency.type.kind === 'component') queue.push(dependency.type.id);
  }
  assert.deepEqual(generated, [ft.id]); for (const node of innerTypes) assert.equal(parentChecked.has(node.id), false);
  const et: ComplexTypeNode = {...helper('ET', 'extension', builtin('anySimpleType')),
    derivation: {kind: 'extension', contentKind: 'simple', base: builtin('anySimpleType'), facets: []}};
  const rawET = raw(et, {kind: 'simple', type: builtin('anySimpleType')});
  const innerProof = (owner: typeof parent, index: number, name: string): FiniteRe01EvidenceNode => {
    const node = innerTypes[index], endpoint: ComplexTypeNode = {...node, derivation: {kind: 'restriction', contentKind: 'simple', base: local(et.id), facets: []}};
    const delta = {key: name, active: [...owner.members, et.id], additions: [et], endpoint,
      rawTypes: [{...row(node.id), derivation: {method: 'restriction' as const, base: local(et.id)}, provenance: {kind: 'hypothetical-abstract' as const, originals: [node.id]}}, rawET]};
    const candidate = owner.kind === 'actual' ? request.candidate(delta) : forkSemanticCandidate(owner, delta); assert.equal(candidate.kind, 'prepared');
    return {id: name, parent: owner, context: candidate.context, target: node.id, intermediate: et.id, ancestor: builtin('anySimpleType'), premises: []};
  };
  const originals = nonprimitive ? innerTypes.map((_, index) => innerProof(actual, index, 'actual-' + index)) : [];
  const child = (identity: boolean, consume = false, support = false) => {
    const prefix = particles[identity ? 1 : 0], fe = helper('FE', 'extension', local(fa.id));
    const outer: ParticleNode = {...prefix, id: scopedId(fe.id, '/outer', 'particle'), identity: {kind: 'scoped', owner: fe.id, path: '/outer', role: 'particle'},
      occurs: {min: '1', max: '1'}, term: {kind: 'sequence', children: [prefix.id]}};
    const middle = {...fe, content: outer.id}, target: ComplexTypeNode = {...ft, derivation: {kind: 'restriction', contentKind: 'complex', base: local(fe.id), facets: []}};
    const consumed = nonprimitive ? consume ? [innerTypes[0]] : [] : innerTypes;
    const declarations: ElementNode[] = consumed.map((node, index) => ({...elementSeed, id: globalId('element', {namespace, local: 'Required' + index}),
      identity: {kind: 'global', role: 'element', name: {namespace, local: 'Required' + index}}, name: {namespace, local: 'Required' + index}, type: local(node.id),
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []}));
    const fresh: GraphNode[] = [middle, outer, ...declarations];
    const candidate = forkSemanticCandidate(parent, {key: identity ? 'identity' : 'copy', active: [...parent.members, ...fresh.map(node => node.id)], additions: fresh, endpoint: target,
      rawTypes: [raw(target, {kind: 'empty'}), raw(middle, {kind: 'element-only', particle: outer.id})],
      rawElements: declarations.map(node => ({element: node.id, type: node.type, final: [], block: []}))});
    assert.equal(candidate.kind, 'prepared'); const context = candidate.context;
    const correspondence = checkCandidateCorrespondence(actual, parent, context, target.id, middle.id, local(fa.id)); assert.equal(correspondence.kind, 'checked');
    const own = deriveRawComplexContent(context, middle.id), base = deriveRawComplexContent(context, fa.id); assert.equal(own.kind, 'checked'); assert.equal(base.kind, 'checked');
    const extension = checkRawParticleExtension(context, own.view, base.view);
    const extra = support ? (identity ? [0] : [0, 1]).map(index => innerProof(context, index, 'nested-' + index)) : [];
    const proof = verifyFiniteRe01Evidence(actual, x.id, {root: 'X', nodes: [
      {id: 'X', parent: actual, context: parent, target: x.id, intermediate: id('B'), ancestor: local(id('A')), premises: ['FT']},
      {id: 'FT', parent, context, target: ft.id, intermediate: middle.id, ancestor: local(fa.id), premises: extra.map(node => node.id)}, ...originals, ...extra,
    ]});
    return {context, correspondence, middle, extension, declarations, proof};
  };
  return {actual, parent, additions, innerTypes, id, child};
}

describe('typed scalar premise forwarding through particle extension', () => {
  it.each([true, false])('completes the simple-base caller with identity prefix %s and both genuine C owners', async identity => {
    const s = await seed(), c = s.child(identity); assert.equal(c.proof.kind, 'checked-candidate', JSON.stringify(c.proof));
    assertFiniteCandidateReceipt(s.actual, c.proof); expect(c.proof.proof).toHaveLength(2);
    expect(new Set(c.proof.actualComponents.map(receipt => receipt.component))).toEqual(new Set(s.actual.members));
    const step = c.proof.proof.find(step => step.target === s.id('FT')); assert.ok(step);
    for (const node of [...s.additions, ...c.declarations]) expect(step.components.some(receipt => receipt.component === node.id)).toBe(true);
    for (const node of s.innerTypes) {
      const receipt: ComponentConstructionReceipt | undefined = step.components.find(receipt => receipt.component === node.id); assert.ok(receipt);
      expect(receipt.re01).toBeUndefined(); expect(receipt.obligations).toEqual([]);
      expect(receipt.discharged).toContainEqual({rule: 'raw-simple-content-derivation-validity', component: node.id, contextId: c.context.contextId});
    }
    assert.equal(c.extension.kind, 'checked'); expect(c.extension.value).toBe(true);
    expect(Object.isFrozen(c.extension.scalarObligations)).toBe(true);
    if (!identity) for (const node of s.innerTypes) {
      const premise: ScalarObligation | undefined = c.extension.scalarObligations.find(item => item.rule === 'raw-simple-content-derivation-validity' && item.component === node.id); assert.ok(premise);
      expect(premise.contextId ?? c.context.contextId).toBe(c.context.contextId); expect(Object.isFrozen(premise)).toBe(true);
    }
  });

  it('retains the complete actual nonprimitive proofs without importing them into the identity child', async () => {
    const s = await seed(true), c = s.child(true); assert.equal(c.proof.kind, 'checked-candidate');
    assertFiniteCandidateReceipt(s.actual, c.proof); expect(c.proof.proof).toHaveLength(4);
    for (const node of s.innerTypes) expect(c.proof.proof.filter(step => step.target === node.id).map(step => step.parentContext)).toEqual([s.actual.contextId]);
  });

  it('still requires a separate exact-H proof for genuine nonprimitive C consumption', async () => {
    const s = await seed(true), missing = s.child(true, true), complete = s.child(true, true, true);
    expect(missing.proof).toMatchObject({kind: 'unresolved', component: s.innerTypes[0].id, rule: 'missing-nested-evidence'});
    assert.equal(complete.proof.kind, 'checked-candidate'); expect(complete.proof.proof).toHaveLength(5);
    expect(complete.proof.proof.filter(step => step.target === s.innerTypes[0].id).map(step => step.parentContext).sort())
      .toEqual([s.actual.contextId, complete.context.contextId].sort());
  });

  it('does not waive copied nonprimitive formation or the inherited FE method comparison', async () => {
    const s = await seed(true), missing = s.child(false), rebased = s.child(false, false, true);
    expect(missing.proof).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence'});
    assert.equal(missing.proof.kind, 'unresolved');
    expect(s.innerTypes.map(node => node.id)).toContain(missing.proof.component);
    assert.equal(rebased.proof.kind, 'candidate-rejected'); expect(rebased.proof).toMatchObject({component: rebased.middle.id, rule: 'cos-particle-extend'});
  });
});
