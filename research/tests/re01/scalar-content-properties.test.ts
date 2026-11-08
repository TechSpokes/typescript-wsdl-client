/** A scalar content property is distinct from its complex provenance owner. */
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
import {checkCandidateCorrespondence, re01Ancestor} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:scalar-content-properties';
const typeId = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});

async function seed(different = false, requiredContent = false) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-content-property-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual;
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked'); assert.equal(actual.members.length, 19);
  const nonprimitive: string[] = [];
  for (const target of actual.members) {
    const checked = checkComponentConstruction(actual, target); assert.equal(checked.kind, 'checked'); assert.deepEqual(checked.obligations, []);
    if (checked.re01 && !checked.re01.primitive) nonprimitive.push(target);
  }
  assert.deepEqual(new Set(nonprimitive), new Set([typeId('X'), typeId('T')]));
  const get = (target: string): GraphNode => {const found = actual.lookup(target); assert.equal(found.kind, 'found'); return found.node;};
  const complex = (name: string): ComplexTypeNode => {const node = get(typeId(name)); assert.equal(node.kind, 'complexType'); return node;};
  const rows: RawComplexTypeProperties[] = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const mapped = deriveActualComplexContent(actual, node.id); assert.equal(mapped.kind, 'checked'); assert.deepEqual(mapped.view.synthetic, []);
    const attrs = assessSourceAttributeUses(actual, node.id); assert.equal(attrs.kind, 'checked');
    return [{type: node.id, targetNamespace: namespace, abstract: false, final: [], block: [], content: mapped.view.content,
      derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')},
      attributeUses: attrs.value.uses.map(use => use.id), wildcard: attrs.value.wildcard, provenance: {kind: 'actual-mapped', original: node.id}}];
  });
  const row = (target: string): RawComplexTypeProperties => {const result = rows.find(row => row.type === target); assert.ok(result); return result;};
  const helper = (name: string, method: 'restriction' | 'extension', base: Reference, contentKind: 'complex' | 'simple' = 'complex'): ComplexTypeNode => ({...complex('R'),
    id: typeId(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    derivation: {kind: method, contentKind, base, facets: []}, content: undefined, attributes: [], declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []});
  const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content'], uses: readonly string[] = []): RawComplexTypeProperties => ({type: node.id,
    targetNamespace: namespace, abstract: false, final: [], block: [], content, attributeUses: uses,
    derivation: {method: node.derivation!.kind, base: node.derivation!.base}, provenance: {kind: 'hypothetical-abstract', originals: []}});
  const scopedUse = (name: string) => {
    const owner = get(globalId('element', {namespace, local: name})); assert.equal(owner.kind, 'element'); assert.equal(owner.type.kind, 'local');
    const scope = get(owner.type.target); assert.equal(scope.kind, 'complexType');
    const use = request.graph.nodes.find((node): node is AttributeUseNode => node.kind === 'attributeUse'
      && node.identity.kind === 'scoped' && node.identity.owner === scope.id);
    assert.ok(use); return {scope, use};
  };
  const scopes = [scopedUse('Left'), scopedUse(different ? 'Narrow' : 'Right')];
  const fa = helper('FA', 'restriction', builtin('anyType')), fr = helper('FR', 'restriction', local(fa.id)), ft = helper('FT', 'extension', local(fr.id));
  const ds: ComplexTypeNode[] = ['D1', 'D2'].map(name => ({...helper(name, 'restriction', builtin('anyType')),
    id: scopedId(fa.id, '/' + name, 'complexType'), identity: {kind: 'scoped', owner: fa.id, path: '/' + name, role: 'complexType'}}));
  const elementSeed = get(globalId('element', {namespace, local: 'Left'})); assert.equal(elementSeed.kind, 'element');
  const elements: ElementNode[] = ds.map((node, index) => ({...elementSeed,
    id: scopedId(fa.id, '/l' + index, 'element'), identity: {kind: 'scoped', owner: fa.id, path: '/l' + index, role: 'element'},
    name: {namespace: '', local: 'l'}, type: local(node.id), declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []}));
  const particles: ParticleNode[] = elements.map((element, index) => ({kind: 'particle', context: element.context,
    id: scopedId(fa.id, '/p' + index, 'particle'), identity: {kind: 'scoped', owner: fa.id, path: '/p' + index, role: 'particle'},
    occurs: {min: requiredContent ? '1' : '0', max: '1'}, term: {kind: 'element', declaration: local(element.id)}, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []}));
  const content = {kind: 'element-only' as const, particle: particles[1].id};
  const rootTypes = [fa, fr, ft].map(node => node.id === fa.id || requiredContent ? {...node, content: particles[1].id} : node);
  const additions: GraphNode[] = [...rootTypes, ...ds, ...elements, ...particles];
  const endpoint: ComplexTypeNode = {...complex('X'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(typeId('B')), facets: []}};
  const supplied = request.candidate({key: 'scalar-property-parent', active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint,
    rawTypes: [...rows.filter(row => row.type !== endpoint.id), {...row(endpoint.id), derivation: {method: 'restriction', base: local(typeId('B'))},
      provenance: {kind: 'hypothetical-abstract', originals: [endpoint.id]}}, ...rootTypes.map(node => raw(node, node.id === fa.id || requiredContent ? content : {kind: 'empty'})),
      ...ds.map((node, index) => raw(node, {kind: 'empty'}, [scopes[index].use.id]))],
    rawElements: elements.map(element => ({element: element.id, type: element.type, final: [], block: []}))});
  assert.equal(supplied.kind, 'prepared'); const parent = supplied.context;
  const parentCorrespondence = checkCandidateCorrespondence(actual, actual, parent, endpoint.id, typeId('B'), local(typeId('A')));
  assert.equal(parentCorrespondence.kind, 'checked');
  const parentChecked = new Set<string>(), queue = [endpoint.id, typeId('B'), ...additions.map(node => node.id)], generated: string[] = [];
  while (queue.length) {
    const target = queue.pop()!; if (parentChecked.has(target)) continue;
    const receipt = checkComponentConstruction(parent, target, {correspondence: parentCorrespondence}); assert.equal(receipt.kind, 'checked');
    assert.deepEqual(receipt.obligations, []); parentChecked.add(target); queue.push(...receipt.dependencies);
    if (receipt.re01 && !receipt.re01.primitive) generated.push(target);
    for (const required of receipt.typeDependencies) if (required.contextId === parent.contextId && required.type.kind === 'component') queue.push(required.type.id);
  }
  assert.deepEqual(generated, [ft.id]); assert.equal(parentChecked.has(typeId('T')), false);

  // Γ's nonprimitive T is supplied independently; Γ evidence cannot discharge H's T.
  const et = helper('ET', 'extension', builtin('anySimpleType'), 'simple');
  const rawET: RawComplexTypeProperties = {...raw(et, {kind: 'simple', type: builtin('anySimpleType')}), wildcard: row(typeId('T')).wildcard};
  const changedT: ComplexTypeNode = {...complex('T'), derivation: {kind: 'restriction', contentKind: 'simple', base: local(et.id), facets: []}};
  const rawT: RawComplexTypeProperties = {...row(changedT.id), derivation: {method: 'restriction', base: local(et.id)}, provenance: {kind: 'hypothetical-abstract', originals: [changedT.id]}};
  const tContext = request.candidate({key: 'actual-T', active: [...actual.members, et.id], additions: [et], endpoint: changedT,
    rawTypes: [...rows.filter(row => row.type !== changedT.id), rawT, rawET]});
  assert.equal(tContext.kind, 'prepared'); const ancestorT = re01Ancestor(actual, changedT.id); assert.equal(ancestorT.kind, 'checked');
  const actualT = {id: 'actual-T', parent: actual, context: tContext.context, target: changedT.id, intermediate: et.id, ancestor: ancestorT.ancestor, premises: []};

  const child = (identity: boolean, consumeT = false, supportT = false) => {
    const prefix = particles[identity ? 1 : 0], fe = helper('FE', 'extension', local(fa.id));
    const outer: ParticleNode = {...prefix, id: scopedId(fe.id, '/outer', 'particle'), identity: {kind: 'scoped', owner: fe.id, path: '/outer', role: 'particle'},
      occurs: {min: '1', max: '1'}, term: {kind: 'sequence', children: [prefix.id]}};
    const middle = {...fe, content: outer.id}, changed: ComplexTypeNode = {...rootTypes[2], derivation: {kind: 'restriction', contentKind: 'complex', base: local(fe.id), facets: []}};
    const required: ElementNode = {...elementSeed, id: globalId('element', {namespace, local: 'RequiredT'}),
      identity: {kind: 'global', role: 'element', name: {namespace, local: 'RequiredT'}}, name: {namespace, local: 'RequiredT'}, type: local(typeId('T')),
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const fresh: GraphNode[] = [middle, outer, ...(consumeT ? [required] : [])];
    const nested = forkSemanticCandidate(parent, {key: identity ? 'identity' : 'property-equal', active: [...parent.members, ...fresh.map(node => node.id)], additions: fresh, endpoint: changed,
      rawTypes: [raw(changed, requiredContent ? content : {kind: 'empty'}), raw(middle, {kind: 'element-only', particle: outer.id})],
      rawElements: consumeT ? [{element: required.id, type: required.type, final: [], block: []}] : []});
    assert.equal(nested.kind, 'prepared'); const context = nested.context;
    const correspondence = checkCandidateCorrespondence(actual, parent, context, ft.id, middle.id, local(fa.id)); assert.equal(correspondence.kind, 'checked');
    const extra = supportT ? forkSemanticCandidate(context, {key: 'hypothetical-T', active: [...context.members, et.id], additions: [et], endpoint: changedT, rawTypes: [rawT, rawET]}) : undefined;
    if (extra) assert.equal(extra.kind, 'prepared');
    const proof = verifyFiniteRe01Evidence(actual, endpoint.id, {root: 'X', nodes: [
      {id: 'X', parent: actual, context: parent, target: endpoint.id, intermediate: typeId('B'), ancestor: local(typeId('A')), premises: ['FT']},
      {id: 'FT', parent, context, target: ft.id, intermediate: middle.id, ancestor: local(fa.id), premises: supportT ? ['nested-T'] : []}, actualT,
      ...(extra?.kind === 'prepared' ? [{...actualT, id: 'nested-T', parent: context, context: extra.context}] : []),
    ]});
    return {context, correspondence, proof, middle, required};
  };
  return {actual, parent, child, scopes, elements, additions};
}

describe('candidate scalar content-property selection', () => {
  it.each([true, false])('checks the complete caller with identity prefix %s and all actual proofs', async identity => {
    const s = await seed(), c = s.child(identity); assert.equal(c.proof.kind, 'checked-candidate', JSON.stringify(c.proof));
    assertFiniteCandidateReceipt(s.actual, c.proof); expect(c.proof.proof).toHaveLength(3);
    expect(new Set(c.proof.actualComponents.map(receipt => receipt.component))).toEqual(new Set(s.actual.members));
    const step = c.proof.proof.find(step => step.target === typeId('FT')); assert.ok(step);
    expect(step.components.some(receipt => receipt.component === typeId('T'))).toBe(false);
    for (const node of s.additions) expect(step.components.some(receipt => receipt.component === node.id)).toBe(true);
    const values = s.scopes.map(({scope}) => {
      const content = c.context.rawTypeProperties(scope.id)?.content; assert.equal(content?.kind, 'simple'); assert.equal(content.type.kind, 'original-generated');
      const property = createSchemaScalarKernel(c.context).contentProperties(content.type, scope.id); assert.equal(property.kind, 'checked');
      expect(property.obligations).toEqual([]); expect(property.typeDependencies.some(dependency => dependency.contextId === s.actual.contextId)).toBe(true);
      return {selector: content.type, property: property.value};
    });
    expect(values[0].selector).not.toEqual(values[1].selector);
    const {definition: first, ...left} = values[0].property, {definition: second, ...right} = values[1].property;
    expect(first).not.toBe(second); expect(left).toEqual(right);
  });

  it('rejects the copied prefix when the source scalar facet properties differ', async () => {
    const s = await seed(true), c = s.child(false);
    expect(c.proof).toMatchObject({kind: 'candidate-rejected', component: c.middle.id, rule: 'cos-particle-extend'});
    const nodes = s.elements.map(node => {const found = c.context.lookup(node.id); assert.equal(found.kind, 'found'); return found.node;});
    expect(compareComponentProperties(c.context, nodes[0], nodes[1])).toMatchObject({kind: 'checked', value: false});
  });

  it('does not treat property-equal anonymous declared types as an exact restriction derivation', async () => {
    const s = await seed(false, true), c = s.child(false);
    expect(checkComponentConstruction(c.context, c.middle.id, {correspondence: c.correspondence}).kind).toBe('checked');
    expect(c.proof).toMatchObject({kind: 'candidate-rejected', component: typeId('FT'), rule: 'derivation-ok-restriction.5.4'});
  });

  it('still requires and accepts separate hypothetical proof for a genuinely consumed complex type', async () => {
    const s = await seed(), missing = s.child(true, true), complete = s.child(true, true, true);
    expect(missing.proof).toMatchObject({kind: 'unresolved', component: typeId('T'), rule: 'missing-nested-evidence'});
    expect(complete.proof.kind).toBe('checked-candidate'); assert.equal(complete.proof.kind, 'checked-candidate');
    expect(complete.proof.proof).toHaveLength(4); expect(complete.correspondence.fresh).toContain(complete.required.id);
    expect(complete.proof.proof.filter(step => step.target === typeId('T')).map(step => step.parentContext).sort())
      .toEqual([s.actual.contextId, complete.context.contextId].sort());
  });
});
