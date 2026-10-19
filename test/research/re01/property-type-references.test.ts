import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {AttributeUseNode, ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveActualComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:property-references';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
async function seed(omitOriginalRow = false) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/property-reference-nested-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked'); assert.equal(actual.members.length, 20);
  const actualNP: string[] = [];
  for (const target of actual.members) {
    const checked = checkComponentConstruction(actual, target); assert.equal(checked.kind, 'checked', JSON.stringify(checked)); assert.deepEqual(checked.obligations, []);
    if (checked.re01 && !checked.re01.primitive) actualNP.push(target);
  }
  const get = (target: string): GraphNode => {const found = actual.lookup(target); assert.equal(found.kind, 'found'); return found.node;};
  const complex = (name: string): ComplexTypeNode => {const node = get(id(name)); assert.equal(node.kind, 'complexType'); return node;};
  const innerTypes = request.graph.nodes.filter((node): node is ComplexTypeNode => node.kind === 'complexType' && node.identity.kind === 'scoped' && node.derivation?.kind === 'extension');
  assert.equal(innerTypes.length, 2); assert.deepEqual(new Set(actualNP), new Set([id('X'), ...innerTypes.map(node => node.id)]));
  const rows: RawComplexTypeProperties[] = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const mapped = deriveActualComplexContent(actual, node.id); assert.equal(mapped.kind, 'checked'); assert.deepEqual(mapped.view.synthetic, []);
    const attrs = assessSourceAttributeUses(actual, node.id); assert.equal(attrs.kind, 'checked');
    return [{type: node.id, targetNamespace: namespace, abstract: false, final: [], block: [], content: mapped.view.content,
      derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')}, attributeUses: attrs.value.uses.map(use => use.id),
      wildcard: attrs.value.wildcard, provenance: {kind: 'actual-mapped', original: node.id}}];
  });
  const helper = (name: string, method: 'extension' | 'restriction', base: Reference): ComplexTypeNode => ({...complex('R'), id: id(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, derivation: {kind: method, contentKind: 'complex', base, facets: []},
    content: undefined, attributes: [], declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []});
  const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content'], uses: readonly string[] = []): RawComplexTypeProperties => ({type: node.id,
    targetNamespace: namespace, abstract: false, final: [], block: [], derivation: {method: node.derivation!.kind, base: node.derivation!.base}, content,
    attributeUses: uses, provenance: {kind: 'hypothetical-abstract', originals: []}});
  const originalProofs = innerTypes.map((node, index) => {
    const endpoint: ComplexTypeNode = {...node, derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('B')), facets: []}};
    const supplied = request.candidate({key: 'actual-inner-' + index, active: actual.members, endpoint,
      rawTypes: [...rows.filter(row => row.type !== node.id), {...raw(endpoint, {kind: 'empty'}), provenance: {kind: 'hypothetical-abstract', originals: [node.id]}}]});
    assert.equal(supplied.kind, 'prepared');
    return {id: 'actual-inner-' + index, parent: actual, context: supplied.context, target: node.id, intermediate: id('B'), ancestor: local(id('A')), premises: []};
  });
  const scopes = ['Left', 'Right'].map(name => {
    const declaration = get(globalId('element', {namespace, local: name})); assert.equal(declaration.kind, 'element'); assert.equal(declaration.type.kind, 'local');
    const owner = get(declaration.type.target); assert.equal(owner.kind, 'complexType');
    const use = request.graph.nodes.find((node): node is AttributeUseNode => node.kind === 'attributeUse' && node.identity.kind === 'scoped' && node.identity.owner === owner.id);
    assert.ok(use); return {owner, use};
  });
  const fa = helper('FA', 'restriction', builtin('anyType')), fr = helper('FR', 'restriction', local(fa.id)), ft = helper('FT', 'extension', local(fr.id));
  const ds: ComplexTypeNode[] = ['D1', 'D2'].map(name => ({...helper(name, 'restriction', builtin('anyType')),
    id: scopedId(fa.id, '/' + name, 'complexType'), identity: {kind: 'scoped', owner: fa.id, path: '/' + name, role: 'complexType'}}));
  const elementSeed = get(globalId('element', {namespace, local: 'Left'})); assert.equal(elementSeed.kind, 'element');
  const elements: ElementNode[] = ds.map((node, index) => ({...elementSeed,
    id: scopedId(fa.id, '/l' + index, 'element'), identity: {kind: 'scoped', owner: fa.id, path: '/l' + index, role: 'element'}, name: {namespace: '', local: 'l'}, type: local(node.id),
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []}));
  const particles: ParticleNode[] = elements.map((node, index) => ({kind: 'particle', context: node.context,
    id: scopedId(fa.id, '/p' + index, 'particle'), identity: {kind: 'scoped', owner: fa.id, path: '/p' + index, role: 'particle'}, occurs: {min: '0', max: '1'},
    term: {kind: 'element', declaration: local(node.id)}, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []}));
  const originalPrefix = {kind: 'element-only' as const, particle: particles[1].id};
  const additions: GraphNode[] = [{...fa, content: particles[1].id}, fr, ft, ...ds, ...elements, ...particles];
  const x: ComplexTypeNode = {...complex('X'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('B')), facets: []}};
  const supplied = request.candidate({key: 'parent', active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint: x,
    rawTypes: [...rows.filter(row => row.type !== x.id && (!omitOriginalRow || row.type !== innerTypes[0].id)), {...raw(x, {kind: 'empty'}), provenance: {kind: 'hypothetical-abstract', originals: [x.id]}},
      raw(fa, originalPrefix), raw(fr, {kind: 'empty'}), raw(ft, {kind: 'empty'}), ...ds.map((node, index) => raw(node, {kind: 'empty'}, [scopes[index].use.id]))],
    rawElements: elements.map(node => ({element: node.id, type: node.type, final: [], block: []}))});
  assert.equal(supplied.kind, 'prepared'); const parent = supplied.context;
  const parentCorrespondence = checkCandidateCorrespondence(actual, actual, parent, x.id, id('B'), local(id('A'))); assert.equal(parentCorrespondence.kind, 'checked');
  const closed = new Set<string>(), pending = [x.id, id('B'), ...additions.map(node => node.id)], generated: string[] = [];
  while (pending.length) {
    const target = pending.pop()!; if (closed.has(target)) continue;
    const receipt = checkComponentConstruction(parent, target, {correspondence: parentCorrespondence}); assert.equal(receipt.kind, 'checked', JSON.stringify(receipt));
    assert.deepEqual(receipt.obligations, []); closed.add(target); pending.push(...receipt.dependencies);
    if (receipt.re01 && !receipt.re01.primitive) generated.push(target);
    for (const dependency of receipt.typeDependencies) if (dependency.contextId === parent.contextId && dependency.type.kind === 'component') pending.push(dependency.type.id);
  }
  assert.deepEqual(generated, [ft.id]); for (const node of innerTypes) assert.equal(closed.has(node.id), false);
  const build = (identity: boolean, support: boolean, consume: boolean) => {
    const prefix = particles[identity ? 1 : 0], fe = helper('FE', 'extension', local(fa.id));
    const outer: ParticleNode = {...prefix, id: scopedId(fe.id, '/outer', 'particle'), identity: {kind: 'scoped', owner: fe.id, path: '/outer', role: 'particle'},
      occurs: {min: '1', max: '1'}, term: {kind: 'sequence', children: [prefix.id]}};
    const middle = {...fe, content: outer.id}, target: ComplexTypeNode = {...ft, derivation: {kind: 'restriction', contentKind: 'complex', base: local(fe.id), facets: []}};
    const required: ElementNode = {...elementSeed, id: globalId('element', {namespace, local: 'Required'}), identity: {kind: 'global', role: 'element', name: {namespace, local: 'Required'}},
      name: {namespace, local: 'Required'}, type: local(innerTypes[0].id), declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const fresh: GraphNode[] = [middle, outer, ...(consume ? [required] : [])];
    const child = forkSemanticCandidate(parent, {key: identity ? 'identity' : 'copy', active: [...parent.members, ...fresh.map(node => node.id)], additions: fresh, endpoint: target,
      rawTypes: [raw(target, {kind: 'empty'}), raw(middle, {kind: 'element-only', particle: outer.id})],
      rawElements: consume ? [{element: required.id, type: required.type, final: [], block: []}] : []});
    assert.equal(child.kind, 'prepared'); const context = child.context;
    const correspondence = checkCandidateCorrespondence(actual, parent, context, target.id, middle.id, local(fa.id)); assert.equal(correspondence.kind, 'checked');
    const localFE = checkComponentConstruction(context, middle.id, {correspondence});
    const pair = elements.map(node => {const found = context.lookup(node.id); assert.equal(found.kind, 'found'); return found.node;});
    const equality = compareComponentProperties(context, pair[0], pair[1]);
    const needed = support ? consume ? [0] : [0, 1] : [];
    const roots = [
      {id: 'X', parent: actual, context: parent, target: x.id, intermediate: id('B'), ancestor: local(id('A')), premises: ['FT']},
      {id: 'FT', parent, context, target: ft.id, intermediate: fe.id, ancestor: local(fa.id), premises: needed.map(index => 'nested-' + index)}, ...originalProofs,
    ];
    for (const index of needed) {
      const node = innerTypes[index];
      const endpoint: ComplexTypeNode = {...node, derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('B')), facets: []}};
      const nested = forkSemanticCandidate(context, {key: 'inner-' + index, active: context.members, endpoint,
        rawTypes: [{...raw(endpoint, {kind: 'empty'}), provenance: {kind: 'hypothetical-abstract', originals: [node.id]}}]});
      assert.equal(nested.kind, 'prepared'); roots.push({...originalProofs[index], id: 'nested-' + index, parent: context, context: nested.context});
    }
    const proof = verifyFiniteRe01Evidence(actual, x.id, {root: 'X', nodes: roots});
    return {context, correspondence, middle, required, localFEKind: localFE.kind, equality, proof};
  };
  return {actual, parent, innerTypes, additions, build};
}

describe('complex property references preserve genuine validity roles', () => {
  it('publishes the current-H nonprimitive duty from an untouched original without a raw row', async () => {
    const s = await seed(true), missing = s.build(true, false, true), supported = s.build(true, true, true);
    expect(missing.context.rawTypeProperties(s.innerTypes[0].id)).toBeUndefined();
    expect(missing.proof).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.innerTypes[0].id});
    assert.equal(supported.proof.kind, 'checked-candidate'); expect(supported.proof.proof).toHaveLength(5);
    const child = supported.proof.proof.find(step => step.target === id('FT')); assert.ok(child);
    expect(child.components.find(receipt => receipt.component === s.innerTypes[0].id)?.re01?.primitive).toBe(false);
    expect(supported.proof.proof.filter(step => step.target === s.innerTypes[0].id).map(step => step.parentContext).sort())
      .toEqual([s.actual.contextId, supported.context.contextId].sort());
  });

  it.each([true, false])('checks a complete four-node forest with identity prefix %s', async identity => {
    const s = await seed(), c = s.build(identity, false, false);
    assert.equal(c.proof.kind, 'checked-candidate', JSON.stringify(c.proof)); assertFiniteCandidateReceipt(s.actual, c.proof);
    expect(c.proof.proof).toHaveLength(4); expect(c.localFEKind).toBe('checked');
    expect(c.equality).toMatchObject({kind: 'checked', value: true, obligations: ['component-validity']});
    expect(new Set(c.proof.actualComponents.map(receipt => receipt.component))).toEqual(new Set(s.actual.members));
    const child = c.proof.proof.find(step => step.target === id('FT')); assert.ok(child);
    for (const original of s.innerTypes) expect(child.components.some(receipt => receipt.component === original.id)).toBe(false);
    for (const fresh of s.additions) expect(child.components.some(receipt => receipt.component === fresh.id)).toBe(true);
  });

  it('still requires exact hypothetical proof when a fresh declaration genuinely consumes the original type', async () => {
    const s = await seed(), omitted = s.build(true, false, true), supplied = s.build(true, true, true);
    expect(omitted.proof).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.innerTypes[0].id});
    assert.equal(supplied.proof.kind, 'checked-candidate'); expect(supplied.proof.proof).toHaveLength(5);
    expect(supplied.correspondence.fresh).toContain(supplied.required.id);
    expect(supplied.proof.proof.filter(step => step.target === s.innerTypes[0].id).map(step => step.parentContext).sort())
      .toEqual([s.actual.contextId, supplied.context.contextId].sort());
  });

  it('retains the mandatory FE method-property failure when one original inner type is rebased', async () => {
    const s = await seed(), c = s.build(false, true, true);
    expect(c.localFEKind).toBe('checked');
    expect(c.proof).toMatchObject({kind: 'candidate-rejected', rule: 'cos-particle-extend', component: c.middle.id});
  });
});
