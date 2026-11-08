/** A private literal member class keeps its restriction dispatch at two representatives. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const directory = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:free-ur-common-mixed-payload';
const typeId = (name: string) => globalId('type', {namespace, local: name});
const elementId = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});

async function subject() {
  const loaded = await loadSchemaInput(path.join(directory, 'xsd/recovery/free-ur-common-mixed-payload.xsd'),
    {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual, originalGraph = JSON.stringify(request.graph);
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const original = (name: string): ComplexTypeNode => {
    const found = actual.lookup(typeId(name)); assert.equal(found.kind, 'found');
    assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const a = original('A'), b = original('B'), d = original('D'), head = elementId('h');
  const common = {context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const particle = (owner: string, suffix: string, term: ParticleNode['term']): ParticleNode => ({...common,
    kind: 'particle', id: scopedId(owner, suffix, 'particle'), identity: {kind: 'scoped', owner, path: suffix, role: 'particle'},
    occurs: {min: '1', max: '1'}, term});
  const baseHead = particle(typeId('FreshBase'), '/head', {kind: 'element', declaration: local(head)});
  const derivedHead = particle(typeId('FreshDerived'), '/head', {kind: 'element', declaration: local(head)});
  const baseChoice = particle(typeId('FreshBase'), '/content', {kind: 'choice', children: [baseHead.id]});
  const complex = (name: string, base: Reference, content: string): ComplexTypeNode => ({...common, kind: 'complexType',
    id: typeId(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    mixed: true, abstract: false, attributes: [], content,
    derivation: {kind: 'restriction', contentKind: 'complex', base, facets: []}});
  const base = complex('FreshBase', builtin('anyType'), baseChoice.id);
  const derived = complex('FreshDerived', local(base.id), derivedHead.id);
  const members: ElementNode[] = ['x', 'y', 'z'].map(name => ({...common, kind: 'element', id: elementId(name),
    identity: {kind: 'global', role: 'element', name: {namespace, local: name}}, name: {namespace, local: name},
    type: builtin('string'), nillable: false, abstract: false, substitutionGroup: local(head)}));
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')},
    content: node.content ? {kind: 'mixed', particle: node.content} : {kind: 'empty'},
    abstract: false, final: [], block: [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.lookup(node.id).kind === 'found' ? [node.id] : []}});
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
  const make = (count: 1 | 2 | 3) => {
    const retained = members.slice(0, count);
    const additions: GraphNode[] = [base, derived, baseHead, derivedHead, baseChoice, ...retained];
    const supplied = request.candidate({key: 'private-twins-' + count,
      active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint,
      rawTypes: [...request.graph.nodes.flatMap(node => node.kind === 'complexType' && node.id !== d.id ? [raw(node)] : []),
        raw(endpoint), raw(base), raw(derived)],
      rawElements: retained.map(node => ({element: node.id, type: node.type, final: [], block: []}))});
    assert.equal(supplied.kind, 'prepared', JSON.stringify(supplied)); const context = supplied.context;
    const content = (node: ComplexTypeNode) => {
      const mapped = deriveRawComplexContent(context, node.id); assert.equal(mapped.kind, 'checked');
      const semantic = prepareSemanticParticleView(context, mapped.view, 'restriction'); assert.equal(semantic.kind, 'checked');
      return semantic.view;
    };
    const baseView = content(base), derivedView = content(derived);
    const relation = checkParticleRestriction(context, derivedView, baseView);
    const forest = verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [
      {id: 'D', parent: actual, context, target: d.id, intermediate: b.id, ancestor: local(a.id), premises: []},
    ]});
    return {context, additions, retained, baseView, derivedView, relation, forest};
  };
  return {request, actual, originalGraph, head, members, base, derived, baseHead, derivedHead, baseChoice, make};
}

type Subject = Awaited<ReturnType<typeof subject>>;
function complete(s: Subject, value: ReturnType<Subject['make']>) {
  assert.equal(value.forest.kind, 'checked-candidate', JSON.stringify(value.forest));
  expect(new Set(value.forest.actualComponents.map(receipt => receipt.component))).toEqual(new Set(s.actual.members));
  expect(value.forest.actualComponents).toHaveLength(5); expect(value.forest.proof).toHaveLength(1);
  const step = value.forest.proof[0]; expect(step.contextId).toBe(value.context.contextId);
  expect(step.components).toHaveLength(value.context.members.length - 1);
  for (const node of value.additions) expect(step.components.some(receipt => receipt.component === node.id)).toBe(true);
  for (const receipt of step.components) {
    expect(receipt.contextId).toBe(value.context.contextId); expect(receipt.obligations).toEqual([]);
    expect(receipt.re01 && !receipt.re01.primitive).toBeFalsy();
  }
  expect(step.components.some(receipt => receipt.component === typeId('R'))).toBe(false); // R is independently checked in Gamma.
  expect(value.relation).toMatchObject({kind: 'checked', value: true, obligations: ['component-validity', 'particle-local-legality']});
  expect(value.forest.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  return value.forest;
}

describe('two representatives of a private literal substitution-member class', () => {
  it('checks complete three- and two-member forests with exact retained records and distinct head positions', async () => {
    const s = await subject(), old = s.make(3), capped = s.make(2);
    const oldReceipt = complete(s, old), cappedReceipt = complete(s, capped);
    expect(s.baseHead.id).not.toBe(s.derivedHead.id);
    expect([old.context.members.length, capped.context.members.length]).toEqual([13, 12]);
    expect([oldReceipt.proof[0].components.length, cappedReceipt.proof[0].components.length]).toEqual([12, 11]);
    // No particle, owner, TYPE or affiliation selects an individual twin; only the head census observes their names.
    expect(s.baseHead.term).toEqual(s.derivedHead.term);
    for (const member of s.members) {
      const {id: _id, identity: _identity, name: _name, ...ordinary} = member;
      const {id: _firstId, identity: _firstIdentity, name: _firstName, ...firstOrdinary} = s.members[0];
      expect(ordinary).toEqual(firstOrdinary);
    }
    expect(new Set(old.context.members.filter(id => !capped.context.members.includes(id)))).toEqual(new Set([s.members[2].id]));
    for (const id of capped.context.members) {
      expect(capped.context.lookup(id)).toEqual(old.context.lookup(id));
      expect(capped.context.rawTypeProperties(id)).toEqual(old.context.rawTypeProperties(id));
      expect(capped.context.rawElementProperties(id)).toEqual(old.context.rawElementProperties(id));
    }
    for (const value of [old, capped]) {
      const effective = effectiveSubstitutionMembers(value.context, s.head); assert.equal(effective.kind, 'checked');
      expect(new Set(effective.value)).toEqual(new Set(value.retained.map(node => node.id)));
      for (const view of [value.baseView, value.derivedView]) {
        expect(view.root.kind).toBe('choice'); expect(view.root.children).toHaveLength(value.retained.length);
        expect(view.root.children.every(child => child.kind === 'element' && child.occurs.min === '1' && child.occurs.max === '1')).toBe(true);
      }
      expect(value.baseView.root.originalParticle).not.toBe(value.derivedView.root.originalParticle);
    }
    expect(capped.context.lookup(s.members[2].id).kind).toBe('missing');
    expect(() => capped.context.rawElementProperties(s.members[2].id)).toThrow(/Semantic context missing/);
    expect(JSON.stringify(s.request.graph)).toBe(s.originalGraph);
  });

  it('retains a one-member implicit choice but collapses its explicit base wrapper and rejects the full restriction', async () => {
    const s = await subject(), one = s.make(1);
    expect(one.context.members).toHaveLength(11);
    expect(one.derivedView.root).toMatchObject({kind: 'choice', originalParticle: s.derivedHead.id});
    expect(one.derivedView.root.children).toHaveLength(1);
    expect(one.baseView.root).toMatchObject({kind: 'element', originalParticle: s.baseChoice.id, element: s.members[0]});
    expect(one.relation).toMatchObject({kind: 'checked', value: false});
    expect(one.forest).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: s.derived.id});
    expect(checkComponentConstruction(one.context, s.derived.id)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
    for (const node of [s.baseHead, s.derivedHead, s.baseChoice, s.base, s.derived]) expect(one.context.members).toContain(node.id);
    expect(JSON.stringify(s.request.graph)).toBe(s.originalGraph);
  });
});
