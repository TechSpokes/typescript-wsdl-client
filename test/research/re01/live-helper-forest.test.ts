import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
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
import {checkSubstitution, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {checkComplexParticleContent} from '../../../src/compiler/particleLocalAssessment.js';
import {checkElementDeclarationsConsistent} from '../../../src/compiler/particleDeclarationConsistency.js';
import {checkParticleAttribution} from '../../../src/compiler/particleAttribution.js';

type ForestType = 'E' | 'F' | 'U' | 'R' | 'V';
type Affiliation = Readonly<{head: ForestType; member: ForestType;
  final?: readonly ('extension' | 'restriction')[];
  block?: readonly ('extension' | 'restriction' | 'substitution')[];
  memberBlock?: readonly ('extension' | 'restriction' | 'substitution')[];
  headAbstract?: boolean; memberAbstract?: boolean; extensionOnly?: boolean; detachedHeadUse?: boolean;
  liveHeadUse?: 'before-separator' | 'after-separator'; requiredLiveHead?: boolean;
  memberName?: string; memberNamespace?: string}>;

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

async function forest(affiliation?: Affiliation) {
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
    content: affiliation?.extensionOnly ? wrapper.id : old.id,
    derivation: {kind: method, contentKind: 'complex', base: local(base), facets: []},
  });
  const f = helper('F', e.id, affiliation?.extensionOnly ? 'extension' : 'restriction');
  const u = helper('U', f.id, 'extension', old.id);
  const r = helper('R', u.id, 'restriction', u.id);
  const v = helper('V', r.id, 'extension', unused.id); // No declaration/content consumes V.
  const helpers = [f, u, r, v];
  const types = {E: e, F: f, U: u, R: r, V: v};
  const element = (name: string, type: ForestType, abstract: boolean, head?: Reference, elementNamespace = namespace): ElementNode => ({
    kind: 'element', id: globalId('element', {namespace: elementNamespace, local: name}),
    identity: {kind: 'global', role: 'element', name: {namespace: elementNamespace, local: name}}, name: {namespace: elementNamespace, local: name},
    context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    type: local(types[type].id), nillable: false, abstract, substitutionGroup: head,
  });
  const h = affiliation ? element('H', affiliation.head, affiliation.headAbstract ?? false) : undefined;
  const m = affiliation && h ? element(affiliation.memberName ?? 'M', affiliation.member, affiliation.memberAbstract ?? false,
    local(h.id), affiliation.memberNamespace) : undefined;
  const declarations = h && m ? [h, m] : [];
  const headUse = h && affiliation?.liveHeadUse ? makeParticle('retained-head',
    {kind: 'element', declaration: local(h.id)}, {min: affiliation.requiredLiveHead ? '1' : '0', max: '1'}) : undefined;
  const particles = [wrapper, separator, tail, extra, old, unused, ...(headUse ? [headUse] : [])];
  const rawElements = declarations.map(node => ({element: node.id, type: node.type,
    final: node === h ? affiliation?.final ?? [] : [],
    block: node === h ? affiliation?.block ?? [] : affiliation?.memberBlock ?? []}));
  const endpoint = {...d, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(e.id), facets: []}};
  const build = (mode: 'original' | 'trim-only' | 'repair', damage?: 'live' | 'unused') => {
    const copied = helpers.map(node => mode === 'repair' ? {...node, content: wrapper.id} : node);
    const replacements = particles.map(node => {
      if (node.id === wrapper.id && (mode !== 'original' || headUse)) {
        const live = headUse ? [headUse.id] : [];
        return {...node, term: {kind: 'sequence' as const, children: [a.content!,
          ...(affiliation?.liveHeadUse === 'before-separator' ? live : []), separator.id,
          ...(affiliation?.liveHeadUse === 'after-separator' ? live : []), tail.id,
          ...(mode === 'original' ? [extra.id] : [])]}};
      }
      if (mode === 'repair' && [extra.id, old.id, unused.id].includes(node.id))
        return {...node, occurs: {min: '1', max: '1'}, term: leaf.term};
      if (node.id === unused.id && affiliation?.detachedHeadUse && h)
        return {...node, term: {kind: 'element' as const, declaration: local(h.id)}};
      return node;
    }).map(node => damage === 'live' && node.id === separator.id ? {...node, term: leaf.term}
      : damage === 'unused' && node.id === unused.id ? {...node, occurs: {min: '2', max: '1'}} : node);
    const additions = [e, ...copied, ...replacements, ...declarations];
    const result = request.candidate({key: mode + (damage ?? ''),
      active: [...request.actual.members, ...additions.map(node => node.id)], additions, endpoint,
      rawTypes: [{...raw(a), derivation: {method: 'restriction', base: anyType}}, raw(e), raw(endpoint), ...copied.map(raw)],
      rawElements,
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
    premises.push(...descend(context, helpers.filter(node => node.derivation?.kind === 'extension').map(node => node.id)));
    return {root: 'root', nodes};
  };
  return {request, a, d, e, f, u, r, v, helpers, particles, declarations, h, m,
    wrapper, separator, tail, extra, old, unused, headUse, leaf, build, evidence};
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

describe('one declared-type affiliation in the live-E forest', () => {
  // e-props-correct.4 uses the exact immediate head type and H.final.
  // Equal types stop before an edge; a restriction-only segment to an
  // interior head survives rebasing that head or any ancestor above it.
  it.each<Affiliation>([
    {head: 'U', member: 'U', final: ['extension', 'restriction'], block: ['substitution']},
    {head: 'U', member: 'R', final: ['extension'], headAbstract: true},
    {head: 'E', member: 'V', memberBlock: ['extension', 'restriction', 'substitution']},
  ])('reconstructs complete original and repaired evidence for %j', async options => {
    const seed = await forest(options), {request, d, h, m, build, evidence} = seed;
    if (!h || !m) throw new Error('Expected declarations');
    const original = build('original'), repaired = build('repair');
    for (const context of [original, repaired]) {
      const proof = evidence(context), result = verifyFiniteRe01Evidence(request.actual, d.id, proof);
      expect(result).toMatchObject({kind: 'checked-candidate'});
      if (result.kind !== 'checked-candidate') throw new Error(JSON.stringify(result));
      assertFiniteCandidateReceipt(request.actual, result);
      expect(result.proof).toHaveLength(5);
      const fresh = [...seed.helpers, ...seed.particles, seed.e, h, m].map(node => node.id);
      for (const step of result.proof) {
        const item = proof.nodes.find(node => node.id === step.evidence)!;
        expect(step.components.map(receipt => receipt.component)).toEqual(expect.arrayContaining(fresh));
        expect(step.components.every(receipt => receipt.contextId === item.context.contextId)).toBe(true);
        for (const declaration of [h, m]) {
          expect(item.context.lookup(declaration.id)).toEqual(original.lookup(declaration.id));
          expect(item.context.rawElementProperties(declaration.id)).toEqual(original.rawElementProperties(declaration.id));
          expect(checkComponentConstruction(item.context, declaration.id)).toMatchObject({kind: 'checked', obligations: []});
        }
        expect(checkSubstitution(item.context, m.id, h.id, {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
        for (const id of item.parent.kind === 'candidate' ? item.parent.members : []) if (id !== item.target) {
          expect(item.context.lookup(id)).toEqual(item.parent.lookup(id));
          expect(item.context.rawTypeProperties(id)).toEqual(item.parent.rawTypeProperties(id));
        }
      }
      expect(result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
    }
    expect(repaired.members).toEqual(original.members);
    for (const node of [...seed.helpers, ...seed.particles, seed.e, h, m]) {
      const found = repaired.lookup(node.id);
      if (found.kind !== 'found') throw new Error(node.id);
      expect(found.node.identity).toEqual(node.identity);
    }
  });

  it.each(['restriction', 'extension'] as const)('rechecks changed effective membership under block=%s without transferring it', async block => {
    const seed = await forest({head: 'E', member: 'F', extensionOnly: true, block: [block],
      memberBlock: ['substitution'], detachedHeadUse: true});
    const {request, d, f, h, m, build, evidence} = seed;
    if (!h || !m) throw new Error('Expected declarations');
    const original = build('original'), repaired = build('repair');
    expect(particle(original, seed.unused.id).term).toEqual({kind: 'element', declaration: local(h.id)});
    expect(particle(repaired, seed.unused.id).term).toEqual(seed.leaf.term);
    for (const context of [original, repaired]) {
      const proof = evidence(context), child = proof.nodes.find(node => node.parent === context && node.target === f.id)!;
      const before = block === 'restriction';
      expect(checkSubstitution(context, m.id, h.id, {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: before});
      expect(checkSubstitution(child.context, m.id, h.id, {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: !before});
      for (const current of [context, child.context]) {
        expect(checkSubstitution(current, m.id, h.id, {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
        const members = effectiveSubstitutionMembers(current, h.id);
        expect(members.kind).toBe('checked');
        if (members.kind === 'checked') expect(members.value.includes(m.id)).toBe(current === context ? before : !before);
      }
      const result = verifyFiniteRe01Evidence(request.actual, d.id, proof);
      expect(result).toMatchObject({kind: 'checked-candidate'});
      if (result.kind !== 'checked-candidate') throw new Error(JSON.stringify(result));
      expect(result.proof).toHaveLength(16);
      for (const step of result.proof) {
        const item = proof.nodes.find(node => node.id === step.evidence)!;
        expect(step.components.map(receipt => receipt.component))
          .toEqual(expect.arrayContaining([...seed.helpers, ...seed.particles, seed.e, h, m].map(node => node.id)));
        expect(step.components.every(receipt => receipt.contextId === item.context.contextId)).toBe(true);
        for (const declaration of [h, m]) {
          expect(item.context.lookup(declaration.id)).toEqual(original.lookup(declaration.id));
          expect(item.context.rawElementProperties(declaration.id)).toEqual(original.rawElementProperties(declaration.id));
        }
      }
    }
  });

  it('rejects the prescribed child when rebasing the member type cuts out the exact interior head', async () => {
    const seed = await forest({head: 'R', member: 'V'}), context = seed.build('repair');
    const {h, m, v} = seed;
    if (!h || !m) throw new Error('Expected declarations');
    expect(checkComponentConstruction(context, m.id)).toMatchObject({kind: 'checked'});
    const proof = seed.evidence(context), child = proof.nodes.find(node => node.parent === context && node.target === v.id)!;
    expect(child.context.lookup(h.id)).toEqual(context.lookup(h.id));
    expect(child.context.lookup(m.id)).toEqual(context.lookup(m.id));
    expect(checkComponentConstruction(child.context, m.id)).toMatchObject({kind: 'candidate-rejected', rule: 'e-props-correct.4'});
    expect(verifyFiniteRe01Evidence(seed.request.actual, seed.d.id, proof))
      .toMatchObject({kind: 'candidate-rejected', rule: 'e-props-correct.4'});
    // This parent is locally legal, not a successful original witness.
    // The result obstructs this E-rebase recipe, not all possible witnesses.
  });

  it('separates head final from block when a rebase adds restriction to an E path', async () => {
    const seed = await forest({head: 'E', member: 'F', extensionOnly: true, final: ['restriction']}), context = seed.build('repair');
    const {h, m, f} = seed;
    if (!h || !m) throw new Error('Expected declarations');
    expect(checkComponentConstruction(context, m.id)).toMatchObject({kind: 'checked'});
    const proof = seed.evidence(context), child = proof.nodes.find(node => node.parent === context && node.target === f.id)!;
    expect(checkSubstitution(child.context, m.id, h.id, {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: true});
    expect(checkSubstitution(child.context, m.id, h.id, {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: false});
    expect(verifyFiniteRe01Evidence(seed.request.actual, seed.d.id, proof))
      .toMatchObject({kind: 'candidate-rejected', rule: 'e-props-correct.4'});
    // Again only the attempted recipe is refuted; no general negative follows.
  });

  it('does not replace exact head ancestry by equal repaired particle content', async () => {
    const seed = await forest({head: 'V', member: 'R'}), context = seed.build('repair');
    const {h, m, r, v} = seed;
    if (!h || !m) throw new Error('Expected declarations');
    expect(complex(context, r.id).content).toBe(complex(context, v.id).content);
    expect(checkComponentConstruction(context, m.id)).toMatchObject({kind: 'candidate-rejected', rule: 'e-props-correct.4'});
  });
});

describe('one retained optional head in shared live content', () => {
  // The H use remains before the required empty choice in every repaired S.
  // D maps to the wildcard, skipping optional A/H and the formally emptiable
  // separator. Local particle checks stop at declaration identities, while
  // complete closure must also check the S -> H -> H.type -> S content cycle.
  it.each<Affiliation>([
    {head: 'U', member: 'U', final: ['extension', 'restriction'], block: ['substitution']},
    {head: 'U', member: 'R', final: ['extension'], headAbstract: true},
    {head: 'E', member: 'V', headAbstract: true, memberAbstract: true},
    {head: 'E', member: 'F', extensionOnly: true, block: ['restriction']},
    {head: 'E', member: 'F', extensionOnly: true, block: ['extension']},
  ])('closes the retained content cycle with complete contextual evidence for %j', async options => {
    const seed = await forest({...options, liveHeadUse: 'before-separator'});
    const {request, d, e, h, m, headUse, wrapper, separator, tail, helpers, particles} = seed;
    if (!h || !m || !headUse) throw new Error('Expected retained head');
    const original = seed.build('original'), repaired = seed.build('repair');
    expect(particle(repaired, wrapper.id).term).toEqual({kind: 'sequence', children: [seed.a.content, headUse.id, separator.id, tail.id]});
    expect(particle(repaired, headUse.id)).toEqual(headUse);
    expect(headUse.occurs).toEqual({min: '0', max: '1'});
    expect(repaired.members).toEqual(original.members);
    expect(measureMeaningfulPrefixBounds(request.actual, seed.a.id, d.id))
      .toMatchObject({maxFinalMembers: '1', maxNewParticleRecords: '3'});
    // The old k+2 allocation expression excludes this extra retained use:
    // repaired live fresh particles are wrapper, H use, separator, wildcard.
    expect([wrapper, headUse, separator, tail]).toHaveLength(4);
    for (const context of [original, repaired]) {
      const proof = seed.evidence(context), result = verifyFiniteRe01Evidence(request.actual, d.id, proof);
      expect(result).toMatchObject({kind: 'checked-candidate'});
      if (result.kind !== 'checked-candidate') throw new Error(JSON.stringify(result));
      assertFiniteCandidateReceipt(request.actual, result);
      expect(result.proof).toHaveLength(options.extensionOnly ? 16 : 5);
      const fresh = [...helpers, ...particles, e, h, m].map(node => node.id);
      for (const step of result.proof) {
        const item = proof.nodes.find(node => node.id === step.evidence)!;
        expect(step.components.map(receipt => receipt.component)).toEqual(expect.arrayContaining(fresh));
        expect(step.components.every(receipt => receipt.contextId === item.context.contextId)).toBe(true);
        expect(particle(item.context, headUse.id)).toEqual(headUse);
        expect(item.context.lookup(h.id)).toEqual(context.lookup(h.id));
        expect(item.context.lookup(m.id)).toEqual(context.lookup(m.id));
        for (const id of item.parent.kind === 'candidate' ? item.parent.members : []) if (id !== item.target) {
          expect(item.context.lookup(id)).toEqual(item.parent.lookup(id));
          expect(item.context.rawTypeProperties(id)).toEqual(item.parent.rawTypeProperties(id));
        }
        expect(checkSubstitution(item.context, m.id, h.id, {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
        expect(checkComplexParticleContent(item.context, content(item.context, e.id))).toMatchObject({kind: 'checked', value: true});
        expect(checkParticleRestriction(item.context, restricted(item.context, d.id), restricted(item.context, e.id)))
          .toMatchObject({kind: 'checked', value: true});
        const normalized = restricted(item.context, e.id).root.children.find(node => node.source === headUse.id);
        expect(normalized).toMatchObject({occurs: {min: '0', max: '1'}, summary: {schemaEmptiable: true}});
        if (!normalized) throw new Error('H was erased during reconstruction');
        const members = effectiveSubstitutionMembers(item.context, h.id);
        if (members.kind !== 'checked') throw new Error(JSON.stringify(members));
        const expanded = members.value.some(id => id !== h.id);
        expect(normalized.kind).toBe(expanded ? 'choice' : 'element');
        if (expanded) expect(normalized.children.map(node => node.element?.id)).toEqual(members.value);
        if (context === repaired) {
          // Each edge of the actual content-dependency cycle has its own local
          // receipt; this is not a claim that graph visitation proves validity.
          const get = (id: string) => step.components.find(receipt => receipt.component === id)!;
          expect(get(e.id).dependencies).toContain(wrapper.id);
          expect(get(wrapper.id).dependencies).toContain(headUse.id);
          expect(get(headUse.id).dependencies).toEqual(expect.arrayContaining([h.id, m.id]));
          if (h.type?.kind !== 'local') throw new Error('Expected exact head type');
          expect(get(h.id).dependencies).toContain(h.type.target);
          expect(get(h.type.target).dependencies).toContain(wrapper.id);
          for (const node of helpers) expect(complex(item.context, node.id).content).toBe(wrapper.id);
        }
      }
      if (options.extensionOnly) {
        const child = proof.nodes.find(node => node.parent === context && node.target === seed.f.id)!;
        const before = options.block?.includes('restriction');
        expect(checkSubstitution(context, m.id, h.id, {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: before});
        expect(checkSubstitution(child.context, m.id, h.id, {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: !before});
      }
      expect(result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
    }
  });

  it('keeps the retained use and inherited unused extension obligation inside the recursive child', async () => {
    const seed = await forest({head: 'U', member: 'R', liveHeadUse: 'before-separator'});
    const context = seed.build('repair'), proof = seed.evidence(context);
    const child = proof.nodes.find(node => node.parent === context && node.target === seed.u.id)!;
    const omitted = new Set(child.premises);
    const nodes = proof.nodes.filter(node => !omitted.has(node.id)).map(node => node === child ? {...node, premises: []} : node);
    expect(verifyFiniteRe01Evidence(seed.request.actual, seed.d.id, {root: 'root', nodes}))
      .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', contextId: child.context.contextId, component: seed.v.id});
  });

  it('needs the optional range for the ordered D mapping; a required disjoint head cannot be skipped', async () => {
    const seed = await forest({head: 'U', member: 'R', liveHeadUse: 'before-separator', requiredLiveHead: true});
    const context = seed.build('repair');
    expect(checkComplexParticleContent(context, content(context, seed.e.id))).toMatchObject({kind: 'checked', value: true});
    expect(checkComponentConstruction(context, seed.d.id))
      .toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
    expect(verifyFiniteRe01Evidence(seed.request.actual, seed.d.id, seed.evidence(context)))
      .toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
  });

  it('checks EDC against a member even beyond the dead separator, rather than erasing its live head use', async () => {
    const seed = await forest({head: 'E', member: 'F', extensionOnly: true,
      liveHeadUse: 'after-separator', memberName: 'a', memberNamespace: ''});
    const context = seed.build('repair');
    expect(checkElementDeclarationsConsistent(context, [seed.wrapper.id])).toMatchObject({kind: 'checked', value: false});
    expect(checkComponentConstruction(context, seed.e.id)).toMatchObject({kind: 'candidate-rejected', rule: 'cos-element-consistent'});
    // The QName/type collision is outside the admitted disjoint-name family;
    // it rejects this local construction, not every retained-head witness.
  });

  it('rejects an actual child EDC duty when rebasing exposes a member with the original local QName', async () => {
    const seed = await forest({head: 'E', member: 'F', extensionOnly: true, block: ['extension'],
      liveHeadUse: 'before-separator', memberName: 'a', memberNamespace: ''});
    const context = seed.build('repair'), proof = seed.evidence(context);
    const child = proof.nodes.find(node => node.parent === context && node.target === seed.f.id)!;
    expect(checkComponentConstruction(context, seed.e.id)).toMatchObject({kind: 'checked'});
    for (const current of [context, child.context]) {
      expect(checkSubstitution(current, seed.m!.id, seed.h!.id, {mode: 'affiliation'}))
        .toMatchObject({kind: 'checked', value: true});
      expect(checkParticleRestriction(current, restricted(current, seed.d.id), restricted(current, seed.e.id)))
        .toMatchObject({kind: 'checked', value: true});
      const declared = prepareSemanticParticleView(current, content(current, seed.e.id), 'declared');
      if (declared.kind !== 'checked') throw new Error(JSON.stringify(declared));
      // A and H are before the empty choice: their conflicting a positions
      // become reachable together when M enters H's effective group.
      expect(checkParticleAttribution(current, declared.view)).toMatchObject({kind: 'checked', value: current === context});
    }
    expect(checkElementDeclarationsConsistent(context, [seed.wrapper.id])).toMatchObject({kind: 'checked', value: true});
    expect(checkElementDeclarationsConsistent(child.context, [seed.wrapper.id])).toMatchObject({kind: 'checked', value: false});
    expect(checkComponentConstruction(child.context, seed.e.id)).toMatchObject({kind: 'candidate-rejected', rule: 'cos-element-consistent'});
    expect(verifyFiniteRe01Evidence(seed.request.actual, seed.d.id, proof))
      .toMatchObject({kind: 'candidate-rejected', rule: 'cos-element-consistent', contextId: child.context.contextId});
    // E and every fresh inherited root are actual child duties. The locally
    // legal parent is not a complete witness; this does not prove nonexistence.
  });
});
