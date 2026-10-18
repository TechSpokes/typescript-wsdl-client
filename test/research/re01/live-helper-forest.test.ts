import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkRawParticleExtension} from '../../../src/compiler/particleExtension.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import {measureMeaningfulPrefixBounds} from './meaningful-prefix-bound.js';

const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
const namespace = 'urn:review';
const named = (name: string) => globalId('type', {namespace, local: name});
function complex(context: SemanticContext, id: string): ComplexTypeNode {
  const found = context.lookup(id);
  if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error(id);
  return found.node;
}
function particle(context: SemanticContext, id: string): ParticleNode {
  const found = context.lookup(id);
  if (found.kind !== 'found' || found.node.kind !== 'particle') throw new Error(id);
  return found.node;
}
function raw(node: ComplexTypeNode): RawComplexTypeProperties {
  if (!node.content) throw new Error(node.id);
  return {type: node.id, derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    targetNamespace: namespace, abstract: false, final: [], block: [], attributeUses: [],
    content: {kind: 'element-only', particle: node.content}, provenance: {kind: 'hypothetical-abstract', originals: []}};
}
function content(context: SemanticContext, id: string) {
  const result = deriveRawComplexContent(context, id);
  if (result.kind !== 'checked') throw new Error(JSON.stringify(result));
  return result.view;
}
function restricted(context: SemanticContext, id: string) {
  const result = prepareSemanticParticleView(context, content(context, id), 'restriction');
  if (result.kind !== 'checked') throw new Error(JSON.stringify(result));
  return result.view;
}

async function forest() {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/re01/reordered-particle-int.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const request = prepared.request, a = complex(request.actual, named('A')), d = complex(request.actual, named('D'));
  if (!a.content || !d.content) throw new Error('Expected source particles');
  const aRoot = particle(request.actual, a.content), dRoot = particle(request.actual, d.content);
  if (dRoot.term.kind !== 'sequence') throw new Error('Expected integer sequence');
  const leaf = particle(request.actual, dRoot.term.children[0]!);
  if (leaf.term.kind !== 'element') throw new Error('Expected exact integer declaration');
  const eId = named('LiveE');
  const makeParticle = (name: string, term: ParticleNode['term'], occurs = {min: '1', max: '1'}): ParticleNode => ({
    ...aRoot, id: scopedId(eId, '/' + name, 'particle'),
    identity: {kind: 'scoped', owner: eId, path: '/' + name, role: 'particle'}, term, occurs,
  });
  const separator = makeParticle('separator', {kind: 'choice', children: []});
  const tail = makeParticle('tail', {kind: 'any', wildcard: {
    namespace: {value: '##any', context: a.context}, processContents: 'skip',
  }}, {min: '0', max: 'unbounded'});
  const extra = makeParticle('extra', tail.term, tail.occurs);
  const wrapper = makeParticle('content', {kind: 'sequence', children: [a.content, separator.id, tail.id, extra.id]});
  const old = makeParticle('old-helper-content', {kind: 'sequence', children: [d.content, d.content]});
  const unused = makeParticle('unused-dag', {kind: 'sequence', children: [old.id, old.id]});
  const e: ComplexTypeNode = {...a, id: eId, identity: {kind: 'global', role: 'type', name: {namespace, local: 'LiveE'}},
    content: wrapper.id, derivation: {kind: 'extension', contentKind: 'complex', base: local(a.id), facets: []}};
  const helper = (name: string, base: string, method: 'extension' | 'restriction', owner?: string): ComplexTypeNode => ({
    ...e, id: owner ? scopedId(owner, '/' + name, 'type') : named(name),
    identity: owner ? {kind: 'scoped', owner, path: '/' + name, role: 'type'}
      : {kind: 'global', role: 'type', name: {namespace, local: name}},
    content: old.id, derivation: {kind: method, contentKind: 'complex', base: local(base), facets: []},
  });
  const f = helper('F', e.id, 'restriction');
  const u = helper('U', f.id, 'extension', old.id);
  const r = helper('R', u.id, 'restriction', u.id);
  const v = helper('V', r.id, 'extension', unused.id); // No declaration/content consumes V.
  const helpers = [f, u, r, v], particles = [wrapper, separator, tail, extra, old, unused];
  const endpoint = {...d, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(e.id), facets: []}};
  const build = (mode: 'original' | 'trim-only' | 'repair', damage?: 'live' | 'unused') => {
    const copied = helpers.map(node => mode === 'repair' ? {...node, content: wrapper.id} : node);
    const replacements = particles.map(node => {
      if (node.id === wrapper.id && mode !== 'original') return {...node,
        term: {kind: 'sequence' as const, children: [a.content!, separator.id, tail.id]}};
      if (mode === 'repair' && [extra.id, old.id, unused.id].includes(node.id))
        return {...node, occurs: {min: '1', max: '1'}, term: leaf.term};
      return node;
    }).map(node => damage === 'live' && node.id === separator.id ? {...node, term: leaf.term}
      : damage === 'unused' && node.id === unused.id ? {...node, occurs: {min: '2', max: '1'}} : node);
    const additions = [e, ...copied, ...replacements];
    const result = request.candidate({key: mode + (damage ?? ''),
      active: [...request.actual.members, ...additions.map(node => node.id)], additions, endpoint,
      rawTypes: [{...raw(a), derivation: {method: 'restriction', base: anyType}}, raw(e), raw(endpoint), ...copied.map(raw)],
    });
    if (result.kind !== 'prepared') throw new Error(JSON.stringify(result));
    return result.context;
  };
  // This finite fixture builder instantiates the proof's no-addition induction;
  // it is neither a search nor a claim that a Γ-derived evidence bound exists.
  const evidence = (context: SemanticContext) => {
    const nodes: FiniteRe01EvidenceNode[] = [];
    const descend = (parent: SemanticContext, remaining: readonly string[]): string[] => remaining.map(target => {
      const node = complex(parent, target), id = 'child-' + nodes.length;
      const endpoint = {...node, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(e.id), facets: []}};
      const child = forkSemanticCandidate(parent, {key: id, active: parent.members, endpoint, rawTypes: [raw(endpoint)]});
      if (child.kind !== 'prepared') throw new Error(JSON.stringify(child));
      const premises: string[] = [];
      nodes.push({id, parent, context: child.context, target, intermediate: e.id, ancestor: local(a.id), premises});
      premises.push(...descend(child.context, remaining.filter(other => other !== target)));
      return id;
    });
    const premises: string[] = [];
    nodes.push({id: 'root', parent: request.actual, context, target: d.id, intermediate: e.id, ancestor: local(a.id), premises});
    premises.push(...descend(context, [u.id, v.id]));
    return {root: 'root', nodes};
  };
  return {request, a, d, e, f, u, r, v, helpers, particles, wrapper, separator, tail, extra, old, unused, leaf, build, evidence};
}

describe('simultaneous live-E and finite helper forest reconstruction', () => {
  it('keeps the original two-position witness and trim-only failure, then repairs the complete mixed forest', async () => {
    const seed = await forest();
    const {request, a, d, e, f, u, v, helpers, particles, wrapper, separator, tail, build, evidence} = seed;
    const original = build('original'), trimmed = build('trim-only'), repaired = build('repair');
    expect(checkParticleRestriction(trimmed, restricted(trimmed, d.id), restricted(trimmed, e.id)))
      .toMatchObject({kind: 'checked', value: true});
    expect(checkComponentConstruction(trimmed, f.id)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
    expect(measureMeaningfulPrefixBounds(request.actual, a.id, d.id)).toMatchObject({maxFinalMembers: '1'});
    expect(repaired.members).toEqual(original.members);
    for (const id of request.actual.members) expect(repaired.lookup(id)).toEqual(original.lookup(id));
    for (const node of [...helpers, ...particles, e]) {
      const found = repaired.lookup(node.id);
      if (found.kind !== 'found') throw new Error(node.id);
      expect(found.node.identity).toEqual(node.identity);
    }
    expect(particle(repaired, wrapper.id).term).toEqual({kind: 'sequence', children: [a.content, separator.id, tail.id]});
    for (const node of [e, separator, tail]) expect(repaired.lookup(node.id)).toEqual(original.lookup(node.id));
    for (const node of helpers) {
      expect(complex(repaired, node.id)).toEqual({...node, content: wrapper.id});
      expect(repaired.rawTypeProperties(node.id)?.content).toEqual({kind: 'element-only', particle: wrapper.id});
    }
    for (const context of [original, repaired]) {
      const proof = evidence(context), result = verifyFiniteRe01Evidence(request.actual, d.id, proof);
      expect(result).toMatchObject({kind: 'checked-candidate'});
      if (result.kind !== 'checked-candidate') throw new Error(JSON.stringify(result));
      assertFiniteCandidateReceipt(request.actual, result);
      expect(result.proof).toHaveLength(5);
      expect(result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
      for (const step of result.proof) {
        const item = proof.nodes.find(node => node.id === step.evidence)!;
        for (const id of item.parent.kind === 'candidate' ? item.parent.members : []) {
          if (id !== item.target) {
            expect(item.context.lookup(id)).toEqual(item.parent.lookup(id));
            expect(item.context.rawTypeProperties(id)).toEqual(item.parent.rawTypeProperties(id));
          }
        }
        expect(item.context.members).toEqual(item.parent === request.actual ? context.members : item.parent.members);
        expect(checkComponentConstruction(item.context, d.id)).toMatchObject({kind: 'checked', obligations: []});
        expect(step.primitiveNoChange).toContain(e.id);
        expect(step.correspondence.contextId).toBe(item.context.contextId);
        expect(checkCandidateCorrespondence(request.actual, item.parent, item.context, item.target, e.id, local(a.id))).toMatchObject({kind: 'checked'});
        expect(step.components.map(receipt => receipt.component)).toEqual(expect.arrayContaining([...helpers, ...particles, e].map(node => node.id)));
        for (const receipt of step.components) expect(receipt.contextId).toBe(item.context.contextId);
        if (context === repaired) {
          for (const node of [seed.extra, seed.old, seed.unused]) {
            expect(particle(item.context, node.id)).toEqual({...node, occurs: {min: '1', max: '1'}, term: seed.leaf.term});
            expect(checkComponentConstruction(item.context, node.id)).toMatchObject({kind: 'checked', obligations: []});
          }
          expect(checkRawParticleExtension(item.context, content(item.context, e.id), content(item.context, a.id))).toMatchObject({kind: 'checked', value: true});
        }
      }
      expect(proof.nodes.filter(node => node.target === u.id)).toHaveLength(2);
      expect(proof.nodes.filter(node => node.target === v.id)).toHaveLength(2);
    }
  });

  it('requires unused sibling extension evidence inside a required child', async () => {
    const seed = await forest(), context = seed.build('repair'), proof = seed.evidence(context);
    const child = proof.nodes.find(node => node.parent === context && node.target === seed.u.id)!;
    const omitted = new Set(child.premises);
    const nodes = proof.nodes.filter(node => !omitted.has(node.id)).map(node => node === child ? {...node, premises: []} : node);
    expect(verifyFiniteRe01Evidence(seed.request.actual, seed.d.id, {root: 'root', nodes}))
      .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', contextId: child.context.contextId, component: seed.v.id});
  });

  it('checks unused detached roots and forbids inherited particle replacement', async () => {
    const seed = await forest(), context = seed.build('repair');
    const damaged = seed.build('repair', 'unused');
    expect(verifyFiniteRe01Evidence(seed.request.actual, seed.d.id, seed.evidence(damaged)))
      .toMatchObject({kind: 'candidate-rejected', component: seed.unused.id});
    const node = complex(context, seed.u.id);
    expect(forkSemanticCandidate(context, {key: 'inherited-rewrite', active: context.members,
      endpoint: node, additions: [seed.wrapper]})).toMatchObject({kind: 'candidate-rejected', code: 'identity', component: seed.wrapper.id});
  });

  it('cannot flatten the live empty-choice barrier into a detached declaration leaf', async () => {
    const seed = await forest(), context = seed.build('repair', 'live');
    expect(checkComponentConstruction(context, seed.e.id)).toMatchObject({kind: 'candidate-rejected'});
    expect(verifyFiniteRe01Evidence(seed.request.actual, seed.d.id, seed.evidence(context))).toMatchObject({kind: 'candidate-rejected'});
  });
});
