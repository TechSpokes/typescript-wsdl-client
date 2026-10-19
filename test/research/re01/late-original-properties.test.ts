/** Reify unchanged original properties when their type is first consumed. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {deriveActualComplexContent, particleContentNode} from '../../../src/compiler/complexTypeContent.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:late-original-properties';
const typeId = (local: string) => globalId('type', {namespace, local});
const elementId = (local: string) => globalId('element', {namespace, local});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
function complex(context: SemanticContext, id: string): ComplexTypeNode {
  const found = context.lookup(id);
  assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
}

async function seed() {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/late-original-complex-properties.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input);
  assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual;
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  assert.equal(actual.members.length, 15);
  for (const id of actual.members) assert.equal(checkComponentConstruction(actual, id).kind, 'checked');
  const a2 = complex(actual, typeId('A2')), b2 = complex(actual, typeId('B2')), r2 = complex(actual, typeId('R2'));
  const mapped = (node: ComplexTypeNode) => {
    const result = deriveActualComplexContent(actual, node.id);
    assert.equal(result.kind, 'checked'); return result.view;
  };
  const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({type: node.id,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    abstract: false, final: [], block: [], content, attributeUses: [], targetNamespace: namespace,
    provenance: {kind: 'hypothetical-abstract', originals: actual.lookup(node.id).kind === 'found' ? [node.id] : []}});
  const x = {...complex(actual, typeId('X')), derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(typeId('B')), facets: []}};
  const t: ComplexTypeNode = {...r2, id: typeId('T'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'T'}},
    derivation: {kind: 'extension', contentKind: 'complex', base: local(r2.id), facets: []}};
  const n: ElementNode = {kind: 'element', id: elementId('N'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'N'}},
    name: {namespace, local: 'N'}, context: t.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    type: local(t.id), nillable: false, abstract: false, substitutionGroup: local(elementId('H'))};
  const content = mapped(a2).content;
  const originalRows = request.graph.nodes.flatMap(node => node.kind === 'complexType' && node.id !== b2.id
    ? [raw(node.id === x.id ? x : node, mapped(node).content)] : []);
  const additions = [t, n], rows = [...originalRows, raw(t, content)];
  const elements = [{element: n.id, type: local(t.id), block: [], final: []}];
  const parent = request.candidate({key: 'sparse-parent', active: [...actual.members, t.id, n.id], additions, endpoint: x,
    rawTypes: rows, rawElements: elements});
  assert.equal(parent.kind, 'prepared');
  const correspondence = checkCandidateCorrespondence(actual, actual, parent.context, x.id, typeId('B'), local(typeId('A')));
  assert.equal(correspondence.kind, 'checked');
  const view = mapped(b2);
  assert.equal(view.synthetic.length, 1); assert.ok('particle' in view.content);
  const generated = particleContentNode(actual, view, view.content.particle);
  assert.equal(generated?.kind, 'particle'); assert.equal(generated.term.kind, 'sequence');
  const outer: ParticleNode = {...generated, id: scopedId(b2.id, '/reified-outer', 'particle'),
    identity: {kind: 'scoped', owner: b2.id, role: 'particle', path: '/reified-outer'}};
  const b2Properties = raw(b2, {kind: 'element-only', particle: outer.id});
  const endpoint: ComplexTypeNode = {...t, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b2.id), facets: []}};
  const child = (properties = b2Properties, extra: readonly ParticleNode[] = []) => forkSemanticCandidate(parent.context, {
    key: 'late-original', active: [...parent.context.members, outer.id, ...extra.map(node => node.id)], additions: [outer, ...extra],
    endpoint, rawTypes: [raw(endpoint, content), properties]});
  const proof = (context: SemanticContext, intermediate = b2.id) => verifyFiniteRe01Evidence(actual, x.id, {root: 'root', nodes: [
    {id: 'root', parent: actual, context: parent.context, target: x.id, intermediate: typeId('B'), ancestor: local(typeId('A')), premises: ['T']},
    {id: 'T', parent: parent.context, context, target: t.id, intermediate, ancestor: local(a2.id), premises: []},
  ]});
  return {request, actual, a2, b2, r2, x, t, n, raw, content, additions, rows, elements, parent: parent.context,
    correspondence, outer, b2Properties, endpoint, child, proof};
}

describe('late unchanged original complex properties', () => {
  it('checks a complete direct-B2 child without installing its new particle in the parent', async () => {
    const s = await seed();
    expect(s.parent.rawTypeProperties(s.b2.id)).toBeUndefined();
    expect(s.parent.lookup(s.outer.id).kind).toBe('missing');
    const child = s.child();
    expect(child.kind).toBe('prepared'); assert.equal(child.kind, 'prepared');
    const result = s.proof(child.context);
    expect(result.kind).toBe('checked-candidate'); assert.equal(result.kind, 'checked-candidate');
    expect(result.proof).toHaveLength(2);
    const root = result.proof.find(step => step.target === s.x.id)!, nested = result.proof.find(step => step.target === s.t.id)!;
    expect(root.components.map(receipt => receipt.component)).not.toContain(s.b2.id);
    expect(root.components.map(receipt => receipt.component)).not.toContain(s.outer.id);
    expect(nested.components.map(receipt => receipt.component)).toEqual(expect.arrayContaining([s.b2.id, s.outer.id, s.n.id]));
    expect(child.context.members).toEqual([...s.parent.members, s.outer.id]);
    expect(s.parent.rawTypeProperties(s.b2.id)).toBeUndefined();
    expect(child.context.sourceNode(s.b2.id)).toBe(s.parent.sourceNode(s.b2.id));
  });

  it('preserves the eager-root EDC failure and a complete fresh-E2 alternative', async () => {
    const s = await seed();
    const eager = s.request.candidate({key: 'eager', active: [...s.parent.members, s.outer.id], additions: [...s.additions, s.outer], endpoint: s.x,
      rawTypes: [...s.rows, s.b2Properties], rawElements: s.elements});
    assert.equal(eager.kind, 'prepared');
    expect(verifyFiniteRe01Evidence(s.actual, s.x.id, {root: 'root', nodes: [
      {id: 'root', parent: s.actual, context: eager.context, target: s.x.id, intermediate: typeId('B'), ancestor: local(typeId('A')), premises: []},
    ]})).toMatchObject({kind: 'candidate-rejected', rule: 'cos-element-consistent', component: s.outer.id});
    const e: ComplexTypeNode = {...s.r2, id: typeId('E2'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'E2'}},
      derivation: {kind: 'extension', contentKind: 'complex', base: local(s.a2.id), facets: []}};
    const endpoint: ComplexTypeNode = {...s.t, derivation: {kind: 'restriction', contentKind: 'complex', base: local(e.id), facets: []}};
    const alternative = forkSemanticCandidate(s.parent, {key: 'fresh-E2', active: [...s.parent.members, e.id], additions: [e], endpoint,
      rawTypes: [s.raw(endpoint, s.content), s.raw(e, s.content)]});
    assert.equal(alternative.kind, 'prepared');
    expect(s.proof(alternative.context, e.id).kind).toBe('checked-candidate');
  });

  it('retains mandatory new roots even when the new B2 row does not consume them', async () => {
    const s = await seed(); assert.ok('particle' in s.content);
    const poison: ParticleNode = {...s.outer, id: scopedId(s.b2.id, '/ambiguous-extra', 'particle'),
      identity: {kind: 'scoped', owner: s.b2.id, role: 'particle', path: '/ambiguous-extra'},
      term: {kind: 'choice', children: [s.content.particle, s.content.particle]}};
    const child = s.child(s.b2Properties, [poison]); assert.equal(child.kind, 'prepared');
    expect(s.proof(child.context)).toMatchObject({kind: 'candidate-rejected', rule: 'cos-nonambig', component: poison.id});
  });

  it.each([
    ['content', (row: RawComplexTypeProperties): RawComplexTypeProperties => ({...row, content: {kind: 'empty'}}), 'endpoint-content-variety'],
    ['flags', (row: RawComplexTypeProperties): RawComplexTypeProperties => ({...row, block: ['restriction']}), 'original-type-property-correspondence'],
  ] as const)('requires authentic original %s correspondence after structural preparation', async (_name, change, rule) => {
    const s = await seed(), child = s.child(change(s.b2Properties));
    assert.equal(child.kind, 'prepared'); expect(child.context.acceptance).toBe('structural-only');
    expect(s.proof(child.context)).toMatchObject({kind: 'candidate-rejected', rule, component: s.b2.id});
  });

  it('compares a late unused original base even when the selected intermediate is valid', async () => {
    const s = await seed();
    const e: ComplexTypeNode = {...s.r2, id: typeId('E2'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'E2'}},
      derivation: {kind: 'extension', contentKind: 'complex', base: local(s.a2.id), facets: []}};
    const endpoint: ComplexTypeNode = {...s.t, derivation: {kind: 'restriction', contentKind: 'complex', base: local(e.id), facets: []}};
    const child = forkSemanticCandidate(s.parent, {key: 'unrelated-base-change', active: [...s.parent.members, s.outer.id, e.id],
      additions: [s.outer, e], endpoint, rawTypes: [s.raw(endpoint, s.content), s.raw(e, s.content),
        {...s.b2Properties, derivation: {...s.b2Properties.derivation, base: local(s.r2.id)}}]});
    assert.equal(child.kind, 'prepared');
    expect(s.proof(child.context, e.id)).toMatchObject({kind: 'candidate-rejected', rule: 'original-base-correspondence', component: s.b2.id});
  });

  it('keeps inherited rows, retained fresh owners and other raw categories immutable', async () => {
    const s = await seed(), child = s.child(); assert.equal(child.kind, 'prepared');
    expect(forkSemanticCandidate(child.context, {key: 'inherited-row', active: child.context.members, endpoint: s.endpoint,
      rawTypes: [s.b2Properties]})).toMatchObject({kind: 'candidate-rejected', code: 'endpoint', component: s.b2.id});
    expect(forkSemanticCandidate(s.parent, {key: 'fresh-owner', active: s.parent.members, endpoint: s.x,
      rawTypes: [s.raw(s.t, s.content)]})).toMatchObject({kind: 'candidate-rejected', code: 'endpoint', component: s.t.id});
    expect(forkSemanticCandidate(s.parent, {key: 'other-category', active: s.parent.members, endpoint: s.endpoint,
      rawElements: [{element: elementId('H'), type: local(s.a2.id), block: ['restriction'], final: []}]}))
      .toMatchObject({kind: 'candidate-rejected', code: 'endpoint', component: elementId('H')});
  });

  it('does not restore a prior canonical endpoint through an absent original row', async () => {
    const s = await seed();
    const prior = s.request.candidate({key: 'old-endpoint', active: [...s.actual.members, s.t.id], additions: [s.t],
      endpoint: {...s.b2, derivation: {kind: 'restriction', contentKind: 'complex', base: local(s.a2.id), facets: []}}});
    assert.equal(prior.kind, 'prepared');
    const later = forkSemanticCandidate(prior.context, {key: 'intervening', active: prior.context.members}); assert.equal(later.kind, 'prepared');
    expect(later.context.rawTypeProperties(s.b2.id)).toBeUndefined();
    expect(complex(later.context, s.b2.id).derivation?.kind).toBe('restriction');
    expect(later.context.sourceNode(s.b2.id)).toBe(s.actual.sourceNode(s.b2.id));
    expect(forkSemanticCandidate(later.context, {key: 'stale-actual-row', active: [...later.context.members, s.outer.id], additions: [s.outer],
      endpoint: s.endpoint, rawTypes: [s.raw(s.endpoint, s.content), s.b2Properties]}))
      .toMatchObject({kind: 'candidate-rejected', code: 'endpoint', component: s.b2.id});
    // The deliberately incomplete parent proves only this structural guard:
    // retained source membership alone does not imply an untouched owner.
  });

  it('does not promote a suppressed source-only complex projection through a late row', async () => {
    const fixtures = path.resolve('test/conformance/fixtures');
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-generated-absent-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    const request = prepared.request;
    const hidden = request.graph.nodes.find(node => node.kind === 'complexType' && request.actual.originalSourceComponentAbsent(node.id));
    assert.ok(hidden?.kind === 'complexType');
    const parent = request.candidate({key: 'structural-parent', active: request.actual.members}); assert.equal(parent.kind, 'prepared');
    expect(forkSemanticCandidate(parent.context, {key: 'source-only-row', active: parent.context.members,
      rawTypes: [{type: hidden.id, derivation: {method: hidden.derivation?.kind ?? 'restriction', base: hidden.derivation?.base ?? anyType},
        abstract: hidden.abstract, final: [], block: [], content: {kind: 'empty'}, attributeUses: [],
        targetNamespace: hidden.context.effectiveNamespace, provenance: {kind: 'hypothetical-abstract', originals: [hidden.id]}}]}))
      .toMatchObject({kind: 'candidate-rejected', code: 'endpoint', component: hidden.id});
    // This existing fixture also has invalid live scalar controls; only the
    // structural/source-absence guard is asserted here, not full validity.
  });
});
