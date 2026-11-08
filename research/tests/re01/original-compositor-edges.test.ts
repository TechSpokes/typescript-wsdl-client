/** Original syntax-only children are not semantic particle incidences in H. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveActualComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {declarationMethods} from '../../../src/compiler/schemaTypeRelations.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures');
async function seed() {
  const namespace = 'urn:recovery:raw-original-edge', id = (local: string) => globalId('type', {namespace, local});
  const local = (target: string): Reference => ({kind: 'local', target});
  const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-compositor-edge-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const checks = actual.members.map(component => {
    const checked = checkComponentConstruction(actual, component); assert.equal(checked.kind, 'checked');
    assert.deepEqual(checked.obligations, []); return checked;
  });
  assert.equal(actual.members.length, 10);
  assert.deepEqual(checks.flatMap(checked => checked.re01 && !checked.re01.primitive ? [checked.component] : []), [id('X')]);
  const types = request.graph.nodes.filter((node): node is ComplexTypeNode => node.kind === 'complexType');
  const x = types.find(node => node.id === id('X')); assert.ok(x);
  const endpoint: ComplexTypeNode = {...x, derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('B')), facets: []}};
  const rows: RawComplexTypeProperties[] = types.map(original => {
    const node = original.id === endpoint.id ? endpoint : original;
    const attrs = assessSourceAttributeUses(actual, node.id), content = deriveActualComplexContent(actual, node.id);
    assert.equal(attrs.kind, 'checked'); assert.equal(content.kind, 'checked');
    return {type: node.id, targetNamespace: namespace, abstract: node.abstract,
      final: declarationMethods(actual, node, 'final') as RawComplexTypeProperties['final'],
      block: declarationMethods(actual, node, 'block') as RawComplexTypeProperties['block'],
      derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
      content: content.view.content, attributeUses: attrs.value.uses.map(use => use.id), wildcard: attrs.value.wildcard,
      provenance: {kind: 'actual-mapped', original: node.id}};
  });
  const candidate = request.candidate({key: 'raw-original-incidences', active: actual.members, endpoint, rawTypes: rows}); assert.equal(candidate.kind, 'prepared');
  const context = candidate.context, correspondence = checkCandidateCorrespondence(actual, actual, context, id('X'), id('B'), local(id('A')));
  assert.equal(correspondence.kind, 'checked');
  const zero = request.graph.nodes.find((node): node is ParticleNode => node.kind === 'particle' && node.occurs.max === '0'); assert.ok(zero);
  const r = types.find(node => node.id === id('R')); assert.ok(r?.content);
  const root = actual.lookup(r.content); assert.equal(root.kind, 'found'); assert.equal(root.node.kind, 'particle'); assert.ok('children' in root.node.term);
  return {request, actual, id, local, rows, endpoint, context, correspondence, zero, root: root.node};
}

describe('retained original compositor edges', () => {
  it('checks the complete raw-endpoint forest without promoting syntax-only zero particles', async () => {
    const s = await seed(), absent = s.actual.members.filter(component => s.actual.originalSourceComponentAbsent(component));
    expect(absent).toHaveLength(2); assert.ok('children' in s.root.term);
    expect(s.root.term.children).toContain(s.zero.id);
    expect(s.context.originalCompositorChildren(s.root.id)).toEqual(s.root.term.children.filter(child => !absent.includes(child)));
    const result = verifyFiniteRe01Evidence(s.actual, s.id('X'), {root: 'X', nodes: [
      {id: 'X', parent: s.actual, context: s.context, target: s.id('X'), intermediate: s.id('B'), ancestor: s.local(s.id('A')), premises: []},
    ]}); assert.equal(result.kind, 'checked-candidate', JSON.stringify(result));
    expect(result.proof).toHaveLength(1); expect(s.correspondence.fresh).toEqual([]);
    expect(new Set(result.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
    expect(result.proof[0].components).toHaveLength(7);
    expect(result.proof[0].components.some(item => item.component === s.id('R'))).toBe(false);
    expect(result.proof[0].components.some(item => absent.includes(item.component))).toBe(false);
    const root = result.proof[0].components.find(item => item.component === s.root.id); assert.ok(root);
    expect(root.dependencies).not.toContain(s.zero.id);
    const x = s.context.rawTypeProperties(s.id('X')); assert.ok(x && 'particle' in x.content);
    expect(x.content.particle).toBe(s.root.id);
  });

  it('keeps direct zero particles and fresh explicit parent lists subject to ordinary legality', async () => {
    const s = await seed();
    expect(checkComponentConstruction(s.context, s.zero.id)).toMatchObject({kind: 'candidate-rejected', rule: 'p-props-correct'});
    assert.equal(s.root.identity.kind, 'scoped');
    const fresh: ParticleNode = {...s.root, id: scopedId(s.root.identity.owner, '/literal-compositor', 'particle'),
      identity: {kind: 'scoped', owner: s.root.identity.owner, path: '/literal-compositor', role: 'particle'}};
    const candidate = s.request.candidate({key: 'literal-new-parent', active: [...s.actual.members, fresh.id], additions: [fresh], endpoint: s.endpoint, rawTypes: s.rows});
    assert.equal(candidate.kind, 'prepared'); expect(candidate.context.originalCompositorChildren(fresh.id)).toBeUndefined();
    const checked = checkComponentConstruction(candidate.context, fresh.id); assert.equal(checked.kind, 'checked');
    expect(checked.dependencies).toContain(s.zero.id);
    const aggregate = verifyFiniteRe01Evidence(s.actual, s.id('X'), {root: 'X', nodes: [
      {id: 'X', parent: s.actual, context: candidate.context, target: s.id('X'), intermediate: s.id('B'), ancestor: s.local(s.id('A')), premises: []},
    ]}); expect(aggregate).toMatchObject({kind: 'candidate-rejected', rule: 'p-props-correct', component: s.zero.id});
    const wildcard = s.request.graph.nodes.find((node): node is ParticleNode => node.kind === 'particle' && node.term.kind === 'any'); assert.ok(wildcard);
    const freshZero: ParticleNode = {...fresh, occurs: {min: '0', max: '0'}, term: wildcard.term};
    const zeroCandidate = s.request.candidate({key: 'literal-zero', active: [...s.actual.members, freshZero.id], additions: [freshZero]}); assert.equal(zeroCandidate.kind, 'prepared');
    expect(checkComponentConstruction(zeroCandidate.context, freshZero.id)).toMatchObject({kind: 'candidate-rejected', rule: 'p-props-correct'});
  });
});
