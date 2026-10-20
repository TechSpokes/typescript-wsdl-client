/** A complete forest refutes transport of one fixed dead prefix to every retirement child. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {deriveOriginalComplexParticle, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkComplexParticleContent} from '../../../src/compiler/particleLocalAssessment.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

// Hs loses its blocked affiliate only after T0 retires; V's frozen prefix is tested in its own current context.
// The old complete forest and specified rejected recook do not exclude SOME or common-suffix alternatives.
const directory = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:sandwich-dead-prefix', inside = namespace + ':inside';
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
const typeId = (name: string) => globalId('type', {namespace, local: name});
const elementId = (name: string, ns = namespace) => globalId('element', {namespace: ns, local: name});

async function subject(recook: boolean) {
  const input = await loadSchemaInput(path.join(directory, 'xsd/recovery/frozen-prefix-transport.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 200_000_000, maxNodes: 1_000_000})});
  assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const get = (name: string): ComplexTypeNode => {
    const found = actual.lookup(typeId(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const a = get('A'), b = get('B'), t0 = get('T0'), d = get('D');
  const actualChecks = actual.members.map(id => {const checked = checkComponentConstruction(actual, id);
    assert.equal(checked.kind, 'checked', JSON.stringify(checked)); assert.deepEqual(checked.obligations, []); return checked;});
  assert.deepEqual(new Set(actualChecks.filter(row => row.re01 && !row.re01.primitive).map(row => row.component)), new Set([d.id, t0.id]));
  const headFound = actual.lookup(elementId('H_B')); assert.equal(headFound.kind, 'found'); assert.equal(headFound.node.kind, 'element');
  const bContent = deriveOriginalComplexParticle(actual, b.id), tContent = deriveOriginalComplexParticle(actual, t0.id);
  assert.equal(bContent.kind, 'checked'); assert.equal(tContent.kind, 'checked');
  const make = (name: string, method: 'extension' | 'restriction', base: string): ComplexTypeNode => ({...a,
    id: typeId(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    derivation: {kind: method, contentKind: 'complex', base: local(base), facets: []}});
  const u = make('U', 'restriction', t0.id), v = make('V', 'extension', u.id);
  const n: ElementNode = {...headFound.node, id: elementId('N'), name: {namespace, local: 'N'},
    identity: {kind: 'global', role: 'element', name: {namespace, local: 'N'}}, type: local(v.id), substitutionGroup: local(headFound.node.id)};
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
  const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({type: node.id,
    targetNamespace: namespace, derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    content, abstract: false, final: [], block: [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.lookup(node.id).kind === 'found' ? [node.id] : []}});
  const additions = [u, v, n];
  const built = request.candidate({key: recook ? 'recooked-U-V' : 'old-U-V', active: [...actual.members, ...additions.map(node => node.id)],
    additions, endpoint, rawTypes: [raw(endpoint, {kind: 'empty'}), raw(b, bContent.content), raw(t0, tContent.content),
      raw(u, recook ? tContent.content : {kind: 'empty'}), raw(v, recook ? tContent.content : {kind: 'empty'})],
    rawElements: [{element: n.id, type: n.type, final: [], block: []}]});
  assert.equal(built.kind, 'prepared', JSON.stringify(built));
  assert.equal(checkCandidateCorrespondence(actual, actual, built.context, d.id, b.id, local(a.id)).kind, 'checked');
  const fresh = additions.map(node => node.id);
  const census = (context: SemanticContext) => {const result = effectiveSubstitutionMembers(context, elementId('Hs'));
    assert.equal(result.kind, 'checked'); return result.value;};
  const view = (context: SemanticContext, id: string) => {
    const content = deriveRawComplexContent(context, id); assert.equal(content.kind, 'checked');
    const normalized = prepareSemanticParticleView(context, content.view, 'restriction'); assert.equal(normalized.kind, 'checked'); return normalized.view;
  };
  const restriction = (context: SemanticContext) => {
    const result = checkParticleRestriction(context, view(context, t0.id), view(context, b.id));
    assert.equal(result.kind, 'checked'); return result.value;
  };
  const content = deriveRawComplexContent(built.context, t0.id); assert.equal(content.kind, 'checked');
  expect(checkComplexParticleContent(built.context, content.view)).toMatchObject({kind: 'checked', value: true});
  assert.deepEqual(new Set(census(built.context)), new Set([elementId('G'), elementId('M', inside)]));
  assert.equal(restriction(built.context), false);
  for (const node of [u, v]) expect(checkComponentConstruction(built.context, node.id)).toMatchObject({kind: 'checked'});
  const evidence: FiniteRe01EvidenceNode[] = [], contexts = new Map<string, SemanticContext>([[built.context.contextId, built.context]]);
  const observations: {id: string; census: readonly string[]; restriction: boolean;
    fresh: {component: string; kind: string; rule?: string}[]}[] = [];
  const descend = (parent: SemanticContext, pending: readonly ComplexTypeNode[], prefix: string): string[] => pending.map(type => {
    const id = prefix + '/' + (type.id === t0.id ? 'T0' : 'V');
    const replacement: ComplexTypeNode = {...type, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
    const selected = type.id === t0.id || recook ? tContent.content : {kind: 'empty'} as const;
    const child = forkSemanticCandidate(parent, {key: id, active: parent.members, additions: [], endpoint: replacement,
      rawTypes: [raw(replacement, selected)]}); assert.equal(child.kind, 'prepared');
    contexts.set(child.context.contextId, child.context);
    assert.equal(checkCandidateCorrespondence(actual, parent, child.context, type.id, b.id, local(a.id)).kind, 'checked');
    const checkedFresh = fresh.map(component => {
      const checked = checkComponentConstruction(child.context, component);
      if (!recook) assert.equal(checked.kind, 'checked', JSON.stringify(checked));
      return {component, kind: checked.kind, rule: checked.kind === 'checked' || checked.kind === 'resource-limit' ? undefined : checked.rule};
    });
    observations.push({id, census: census(child.context), restriction: restriction(child.context), fresh: checkedFresh});
    const premises = descend(child.context, pending.filter(other => other.id !== type.id), id);
    evidence.push({id, parent, context: child.context, target: type.id, intermediate: b.id, ancestor: local(a.id), premises}); return id;
  });
  const premises = descend(built.context, [t0, v], 'D');
  const actualT0: ComplexTypeNode = {...t0, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
  const actualChild = request.candidate({key: 'actual-T0-proof', active: actual.members, additions: [], endpoint: actualT0,
    rawTypes: [raw(actualT0, tContent.content), raw(b, bContent.content)]}); assert.equal(actualChild.kind, 'prepared');
  contexts.set(actualChild.context.contextId, actualChild.context);
  const nodes: FiniteRe01EvidenceNode[] = [{id: 'D', parent: actual, context: built.context, target: d.id,
    intermediate: b.id, ancestor: local(a.id), premises}, ...evidence,
    {id: 'actual-T0', parent: actual, context: actualChild.context, target: t0.id, intermediate: b.id, ancestor: local(a.id), premises: []}];
  const result = verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes});
  return {actual, root: built.context, contexts, result, fresh, nodes, observations, v};
}

describe('complete frozen-prefix transport boundary', () => {
  it('qualifies both retirement orders and every inherited fresh root in the old six-node forest', async () => {
    const s = await subject(false); assert.equal(s.result.kind, 'checked-candidate', JSON.stringify(s.result));
    expect(s.actual.members).toHaveLength(14); expect(s.root.members).toHaveLength(17);
    expect(new Set(s.result.actualComponents.map(row => row.component))).toEqual(new Set(s.actual.members));
    expect(s.result.proof).toHaveLength(6); expect(s.nodes).toHaveLength(6);
    for (const row of s.result.proof) {
      const context = s.contexts.get(row.contextId); assert.ok(context);
      if (row.evidence === 'actual-T0') {expect(row.parentContext).toBe(s.actual.contextId); continue;}
      expect(context.members).toHaveLength(17);
      for (const fresh of s.fresh) {expect(context.members).toContain(fresh); expect(row.components.map(item => item.component)).toContain(fresh);}
    }
    for (const step of s.observations) {
      expect(step.restriction).toBe(step.id.includes('/T0'));
      expect(new Set(step.census)).toEqual(new Set(step.id.includes('/T0') ? [elementId('M', inside)] : [elementId('G'), elementId('M', inside)]));
    }
  });

  it('rejects the specified recook in the mandatory V-first child despite positive parent U/V checks', async () => {
    const s = await subject(true);
    expect(s.result).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: s.v.id});
    const vFirst = s.observations.find(row => row.id === 'D/V'); assert.ok(vFirst);
    expect(vFirst.restriction).toBe(false);
    expect(vFirst.fresh.find(row => row.component === s.v.id)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
    for (const row of vFirst.fresh.filter(row => row.component !== s.v.id)) expect(row.kind).toBe('checked');
    for (const row of s.observations.filter(row => row.id.startsWith('D/T0'))) {
      expect(row.restriction).toBe(true); expect(row.fresh.every(item => item.kind === 'checked')).toBe(true);
    }
    // This exact bad recook is not another complete positive or a refutation of a SOME alternative.
  });
});
