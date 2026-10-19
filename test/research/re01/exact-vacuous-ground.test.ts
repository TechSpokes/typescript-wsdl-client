/** Exact content equality does not discharge retained consumer obligations. */
import path from 'node:path';
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
import {checkSubstitution, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

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
});
