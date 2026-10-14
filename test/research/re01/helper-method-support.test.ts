import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {containedNodes, referenceSlots} from '../../../src/compiler/graphTraversal.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {checkSubstitution, checkTypeDerivation, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import {deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:helper-methods';
const typeId = (name: string) => globalId('type', {namespace, local: name});
const elementId = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
type Shape = 'identity' | 'extension' | 'restriction' | 'extension-restriction' | 'restriction-extension' | 'live-content';
type Method = 'extension' | 'restriction';
type CompanionPath = Readonly<{methods: readonly Method[]; shared?: boolean; unused?: boolean}>;

async function subject(shape: Shape, names: readonly [string, string, string] = ['U', 'V', 'M'], consumedRoot = false,
  companionPaths: readonly CompanionPath[] = [], blockedType?: 'member' | 'interior', emptyHelpers: readonly string[] = []) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const source = consumedRoot ? 'helper-method-consumed-root.xsd' : 'helper-method-support.xsd';
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery', source), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared));
  const request = prepared.request;
  const get = (name: string): ComplexTypeNode => {
    const found = request.actual.lookup(typeId(name));
    if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error(name);
    return found.node;
  };
  const a = get('A'), b = get('B'), r = get('R'), x = get('X');
  if (!a.content) throw new Error('Expected anchored particle');
  const helper = (name: string, base: Reference, method: 'extension' | 'restriction'): ComplexTypeNode => ({...b,
    id: typeId(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    derivation: {kind: method, contentKind: 'complex', base, facets: []}});
  const u = helper(names[0], local(b.id), shape === 'restriction' || shape === 'restriction-extension' ? 'restriction' : 'extension');
  const v = helper(names[1], local(u.id), shape === 'restriction-extension' ? 'extension' : 'restriction');
  const compound = shape === 'extension-restriction' || shape === 'restriction-extension';
  const memberType = shape === 'identity' ? b : compound ? v : u;
  const m: ElementNode = {kind: 'element', id: elementId(names[2]), identity: {kind: 'global', role: 'element', name: {namespace, local: names[2]}},
    name: {namespace, local: names[2]}, context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    type: local(memberType.id), nillable: false, abstract: false, substitutionGroup: local(elementId('H'))};
  const additions: GraphNode[] = [m, ...(shape === 'identity' ? [] : [u]), ...(compound ? [v] : [])];
  const companions: ComplexTypeNode[] = [], companionMembers: ElementNode[] = [];
  for (const [index, path] of companionPaths.entries()) {
    let base = path.shared ? u : b;
    for (const [position, method] of path.methods.entries()) {
      const next = helper(`Support${index}_${position}`, local(base.id), method);
      companions.push(next); additions.push(next); base = next;
    }
    if (path.unused) continue;
    const name = `Member${index}`;
    const member: ElementNode = {...m, id: elementId(name), name: {namespace, local: name},
      identity: {kind: 'global', role: 'element', name: {namespace, local: name}}, type: local(base.id)};
    companionMembers.push(member); additions.push(member);
  }
  let helperParticle = a.content;
  if (shape === 'live-content') {
    const suffixId = scopedId(u.id, '/suffix', 'particle'), rootId = scopedId(u.id, '/root', 'particle');
    const particle = (id: string, nodePath: string, term: ParticleNode['term'], min: string, max: string): ParticleNode => ({
      kind: 'particle', id, identity: {kind: 'scoped', owner: u.id, path: nodePath, role: 'particle'}, context: a.context,
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [], occurs: {min, max}, term});
    additions.push(particle(suffixId, '/suffix', {kind: 'any', wildcard: {
      namespace: {value: 'urn:recovery:separate-suffix', context: a.context}, processContents: 'skip'}}, '0', '1'),
      particle(rootId, '/root', {kind: 'sequence', children: [a.content, suffixId]}, '1', '1'));
    helperParticle = rootId;
  }
  const raw = (node: ComplexTypeNode, particle = a.content!): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    content: node.id === r.id || emptyHelpers.some(name => node.id === typeId(name)) ? {kind: 'empty'}
      : {kind: 'element-only', particle: node.id === x.id ? x.content! : particle},
    abstract: false, final: [], block: blockedType && node.id === (blockedType === 'member' ? memberType.id : u.id) ? ['extension'] : [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: [a.id, b.id, r.id, x.id].includes(node.id) ? [node.id] : []}});
  const endpoint = {...x, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(b.id), facets: []}};
  const parent = request.candidate({key: shape, active: [...request.actual.members, ...additions.map(node => node.id)], additions, endpoint,
    rawTypes: [raw(a), raw(b), raw(r), raw(endpoint), ...(shape === 'identity' ? [] : [raw(u, helperParticle)]),
      ...(compound ? [raw(v)] : []), ...companions.map(node => raw(node))],
    rawElements: [m, ...companionMembers].map(node => ({element: node.id, final: [], block: []}))});
  if (parent.kind !== 'prepared') throw new Error(JSON.stringify(parent));
  const target = shape === 'restriction-extension' ? v : u;
  const childEndpoint = {...target, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(b.id), facets: []}};
  const child = shape === 'identity' || shape === 'restriction' ? undefined
    : forkSemanticCandidate(parent.context, {key: 'helper-child', active: parent.context.members,
      endpoint: childEndpoint, rawTypes: [raw(childEndpoint, helperParticle)]});
  if (child && child.kind !== 'prepared') throw new Error(JSON.stringify(child));
  const root = {id: 'root', parent: request.actual, context: parent.context,
    target: x.id, intermediate: b.id, ancestor: local(a.id), premises: ['helper']};
  const nested = child?.kind === 'prepared' ? {id: 'helper', parent: parent.context, context: child.context,
    target: target.id, intermediate: b.id, ancestor: local(a.id), premises: []}
    : undefined;
  return {request, parent: parent.context, child: child?.kind === 'prepared' ? child.context : undefined,
    a, r, x, b, u, v, m, target, root, nested, companions, companionMembers, raw};
}

// Two concrete alternative roots over the same immutable request. No inherited
// child is edited and no general particle transformation is implemented here.
async function privateParticleControl(dag: boolean) {
  const copied = await subject('restriction-extension', ['S', 'U', 'M']);
  const {request, a, b, r, x, m, raw} = copied;
  const particle = (id: string): ParticleNode => {
    const found = request.actual.lookup(id);
    if (found.kind !== 'found' || found.node.kind !== 'particle') throw new Error(id);
    return found.node;
  };
  const outer = particle(a.content!);
  if (outer.term.kind !== 'sequence') throw new Error('Expected B outer sequence');
  const particles: ParticleNode[] = [];
  const fresh = (source: ParticleNode, name: string, term = source.term): ParticleNode => {
    const node: ParticleNode = {...source, id: scopedId(copied.u.id, '/' + name, 'particle'),
      identity: {kind: 'scoped', owner: copied.u.id, path: '/' + name, role: 'particle'},
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [], term};
    particles.push(node); return node;
  };
  let children = outer.term.children;
  if (dag) {
    const first = fresh(particle(children[0]!), 'first');
    const choice1 = particle(children[2]!), choice2 = particle(children[3]!);
    if (choice1.term.kind !== 'choice' || choice2.term.kind !== 'choice') throw new Error('Expected choices');
    // Reuse original declarations, with shared fresh H/Q1 particles in the
    // two choices. The original string delimiter and Q2 particle stay exact.
    const h = fresh(particle(choice1.term.children[0]!), 'localH');
    const q1 = fresh(particle(choice1.term.children[1]!), 'localQ1');
    const c1 = fresh(choice1, 'choice1', {kind: 'choice', children: [h.id, q1.id]});
    const c2 = fresh(choice2, 'choice2', {kind: 'choice', children: [h.id, q1.id, choice2.term.children[2]!]});
    children = [first.id, children[1]!, c1.id, c2.id];
  }
  const pPlus = fresh({...outer, occurs: {min: '1', max: '1'}}, 'P+', {kind: 'sequence', children});
  const s = {...copied.u, content: pPlus.id}, u = {...copied.v, content: pPlus.id};
  const endpoint = {...x, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(b.id), facets: []}};
  const additions = [m, s, u, ...particles];
  const original = request.candidate({key: dag ? 'private-dag' : 'private-P+',
    active: [...request.actual.members, ...additions.map(node => node.id)], additions, endpoint,
    rawTypes: [raw(a), raw(b), raw(r), raw(endpoint), raw(s, pPlus.id), raw(u, pPlus.id)],
    rawElements: [{element: m.id, final: [], block: []}]});
  if (original.kind !== 'prepared') throw new Error(JSON.stringify(original));
  const childEndpoint = {...u, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(b.id), facets: []}};
  const child = forkSemanticCandidate(original.context, {key: 'private-child', active: original.context.members,
    endpoint: childEndpoint, rawTypes: [raw(childEndpoint, pPlus.id)]});
  if (child.kind !== 'prepared') throw new Error(JSON.stringify(child));
  const root = {...copied.root, context: original.context};
  const nested = {id: 'helper', parent: original.context, context: child.context,
    target: u.id, intermediate: b.id, ancestor: local(a.id), premises: []};
  const copiedS = {...s, content: a.content}, copiedU = {...u, content: a.content};
  const replacement = request.candidate({key: 'private-copied-alternative',
    active: [...request.actual.members, m.id, s.id, u.id], additions: [m, copiedS, copiedU], endpoint,
    rawTypes: [raw(a), raw(b), raw(r), raw(endpoint), raw(copiedS), raw(copiedU)],
    rawElements: [{element: m.id, final: [], block: []}]});
  if (replacement.kind !== 'prepared') throw new Error(JSON.stringify(replacement));
  const copiedEndpoint = {...copiedU, derivation: childEndpoint.derivation};
  const copiedChild = forkSemanticCandidate(replacement.context, {key: 'private-copied-child', active: replacement.context.members,
    endpoint: copiedEndpoint, rawTypes: [raw(copiedEndpoint)]});
  if (copiedChild.kind !== 'prepared') throw new Error(JSON.stringify(copiedChild));
  return {copied: {...copied, parent: replacement.context, child: copiedChild.context,
    root: {...copied.root, context: replacement.context},
    nested: {...nested, parent: replacement.context, context: copiedChild.context}},
    s, u, m, particles, pPlus, parent: original.context, child: child.context, root, nested};
}

function members(context: SemanticContext, head: string) {
  const result = effectiveSubstitutionMembers(context, elementId(head));
  if (result.kind !== 'checked') throw new Error(JSON.stringify(result));
  return result.value;
}

// Only the proved copied-B fixture template. Each branch installs one exact
// restriction of B, adds nothing, and supplies every remaining extension's
// evidence in that branch's context. This is not a general RE01 search.
function forestEvidence(fixture: Awaited<ReturnType<typeof subject>>) {
  const {parent, a, b, x, target, companions, raw} = fixture;
  const extensions = [target, ...companions.filter(node => node.derivation?.kind === 'extension')];
  const nodes: FiniteRe01EvidenceNode[] = [];
  const children = (context: SemanticContext, remaining: readonly ComplexTypeNode[]): string[] => remaining.map(node => {
    const id = `proof${nodes.length}`;
    const endpoint = {...node, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(b.id), facets: []}};
    const child = forkSemanticCandidate(context, {key: id, active: context.members, endpoint, rawTypes: [raw(endpoint)]});
    if (child.kind !== 'prepared') throw new Error(JSON.stringify(child));
    const premises: string[] = [];
    nodes.push({id, parent: context, context: child.context, target: node.id, intermediate: b.id, ancestor: local(a.id), premises});
    premises.push(...children(child.context, remaining.filter(other => other.id !== node.id)));
    return id;
  });
  const premises: string[] = [];
  nodes.push({id: 'root', parent: fixture.request.actual, context: parent, target: x.id, intermediate: b.id, ancestor: local(a.id), premises});
  premises.push(...children(parent, extensions));
  return {root: 'root', nodes};
}

async function namedComparison(shape: 'extension-restriction' | 'restriction-extension') {
  const fixture = await subject(shape), {parent, x, u, v} = fixture;
  const additions: GraphNode[] = [], hosts: ComplexTypeNode[] = [];
  for (const [label, type] of [['Base', u], ['Derived', v]] as const) {
    const host: ComplexTypeNode = {...u, id: typeId('View' + label),
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'View' + label}}};
    const id = scopedId(host.id, '/p', 'element'), particle = scopedId(host.id, '/p', 'particle');
    additions.push({kind: 'element', id, identity: {kind: 'scoped', owner: host.id, path: '/p', role: 'element'},
      name: {namespace, local: 'p'}, context: u.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
      type: local(type.id), nillable: false, abstract: false},
    {kind: 'particle', id: particle, identity: {kind: 'scoped', owner: host.id, path: '/p', role: 'particle'},
      context: u.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
      occurs: {min: '0', max: '1'}, term: {kind: 'element', declaration: local(id)}});
    hosts.push({...host, content: particle});
  }
  additions.push(...hosts);
  const endpoint = parent.lookup(x.id);
  if (endpoint.kind !== 'found' || endpoint.node.kind !== 'complexType') throw new Error('Expected endpoint');
  const fork = forkSemanticCandidate(parent, {key: 'named-role', active: [...parent.members, ...additions.map(node => node.id)], additions,
    endpoint: endpoint.node, rawTypes: hosts.map(host => ({...fixture.raw(host), content: {kind: 'element-only', particle: host.content!}})),
    rawElements: additions.filter((node): node is ElementNode => node.kind === 'element').map(node => ({element: node.id, final: [], block: []}))});
  if (fork.kind !== 'prepared') throw new Error(JSON.stringify(fork));
  const view = (host: ComplexTypeNode) => {
    const content = deriveRawComplexContent(fork.context, host.id);
    if (content.kind !== 'checked') throw new Error(JSON.stringify(content));
    const prepared = prepareSemanticParticleView(fork.context, content.view, 'restriction');
    if (prepared.kind !== 'checked') throw new Error(JSON.stringify(prepared));
    return prepared.view;
  };
  return {fixture, context: fork.context, base: view(hosts[0]!), derived: view(hosts[1]!)};
}

describe('helper method support with explicit contextual reconstruction', () => {
  // Stated in #234 before execution: exact common B and empty type blocks make
  // Q1 exclusion require extension, and Q2 exclusion require restriction.
  // The anchored final choices admit only original QNames under both heads.
  it.each([
    ['identity', true, true], ['extension', false, true], ['restriction', true, false],
    ['extension-restriction', false, false], ['restriction-extension', false, false],
  ] as const)('distinguishes membership and root construction for %s', async (shape, q1, q2) => {
    const {parent, x, m} = await subject(shape);
    expect(checkSubstitution(parent, m.id, elementId('H'), {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
    expect(members(parent, 'H')).toContain(m.id);
    expect(members(parent, 'Q1').includes(m.id)).toBe(q1);
    expect(members(parent, 'Q2').includes(m.id)).toBe(q2);
    expect(checkComponentConstruction(parent, x.id)).toMatchObject(q1 || q2
      ? {kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'} : {kind: 'checked'});
  });

  it.each(['extension-restriction', 'restriction-extension'] as const)('reconstructs complete finite evidence for %s', async shape => {
    const {request, parent, child, x, u, v, m, root, nested} = await subject(shape);
    if (!child || !nested) throw new Error('Expected helper evidence');
    const verified = verifyFiniteRe01Evidence(request.actual, x.id, {root: root.id, nodes: [root, nested]});
    expect(verified, JSON.stringify(verified)).toMatchObject({kind: 'checked-candidate'});
    if (verified.kind !== 'checked-candidate') throw new Error(verified.kind);
    expect(verified.proof.find(step => step.target === nested.target)?.components).toEqual(expect.arrayContaining(
      [u, v, m].map(node => expect.objectContaining({component: node.id, contextId: child.contextId}))));
    expect(members(parent, 'Q1')).not.toContain(m.id);
    expect(members(child, 'Q1')).toContain(m.id);
    expect(checkComponentConstruction(child, x.id)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
    expect(verified.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  });

  it('requires helper evidence even when the root mapping succeeds', async () => {
    const {request, x, target, root} = await subject('extension-restriction');
    const verified = verifyFiniteRe01Evidence(request.actual, x.id, {root: root.id, nodes: [{...root, premises: []}]});
    expect(verified).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: target.id});
  });

  it.each(['extension-restriction', 'restriction-extension'] as const)('rechecks X when the %s child consumes it', async shape => {
    const {request, parent, child, x, root, nested} = await subject(shape, ['U', 'V', 'M'], true);
    if (!child || !nested) throw new Error('Expected helper evidence');
    // Changing only z's type to X makes B/A's copied content consume X. The
    // same child membership change now invalidates a required local premise.
    expect(checkComponentConstruction(parent, x.id)).toMatchObject({kind: 'checked'});
    expect(verifyFiniteRe01Evidence(request.actual, x.id, {root: root.id, nodes: [root, nested]}))
      .toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: x.id, contextId: child.contextId});
  });

  it('preserves the role guarantee after fresh names change', async () => {
    const {request, x, root, nested} = await subject('extension-restriction', ['Helper_71', 'Restricted_29', 'Member_83']);
    if (!nested) throw new Error('Expected helper evidence');
    expect(verifyFiniteRe01Evidence(request.actual, x.id, {root: root.id, nodes: [root, nested]})).toMatchObject({kind: 'checked-candidate'});
  });

  it('does not infer the restriction-to-B child from B eligibility and method signatures', async () => {
    const {parent, child, u, m} = await subject('live-content');
    if (!child) throw new Error('Expected helper context');
    // Raw extension adds a live disjoint wildcard after the optional A prefix.
    // Its preserved 1..1 sequence cannot restrict B's 0..1 anchored sequence.
    expect(checkComponentConstruction(parent, u.id)).toMatchObject({kind: 'checked'});
    expect(checkSubstitution(parent, m.id, elementId('H'), {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
    expect(checkComponentConstruction(child, u.id)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
  });

  it('replaces empty S/U simultaneously in a new root with complete contextual evidence', async () => {
    const expansions: string[][][] = [];
    const ancestry: [RawComplexTypeProperties['derivation'], RawComplexTypeProperties['derivation'], ElementNode][] = [];
    for (const emptyHelpers of [['S', 'U'], ['S'], []]) {
      // S restricts the formally emptiable B to actual empty content; U's
      // empty/empty extension is legal. Its child restricts U to unchanged B.
      // The copied alternative is built from immutable actual, never by
      // rewriting inherited S inside U's required child.
      const fixture = await subject('restriction-extension', ['S', 'U', 'M'], false, [], undefined, emptyHelpers);
      const {request, parent, child, x, u: s, v: u, m, root, nested, raw} = fixture;
      if (!child || !nested) throw new Error('Expected empty-helper child');
      for (const context of [parent, child]) {
        for (const [name, helper] of [['S', s], ['U', u]] as const) {
          const expectedContent = emptyHelpers.includes(name) ? {kind: 'empty'} : {kind: 'element-only', particle: fixture.a.content};
          const content = deriveRawComplexContent(context, helper.id);
          expect(content).toMatchObject({kind: 'checked'});
          if (content.kind !== 'checked') throw new Error(JSON.stringify(content));
          expect(content.view.content).toEqual(expectedContent);
          expect(checkComponentConstruction(context, helper.id)).toMatchObject({kind: 'checked'});
        }
        expect(checkComponentConstruction(context, m.id)).toMatchObject({kind: 'checked'});
      }
      expect(checkComponentConstruction(parent, x.id)).toMatchObject({kind: 'checked'});
      const verified = verifyFiniteRe01Evidence(request.actual, x.id, {root: root.id, nodes: [root, nested]});
      expect(verified, JSON.stringify(verified)).toMatchObject({kind: 'checked-candidate'});
      if (verified.kind !== 'checked-candidate') throw new Error(verified.kind);
      for (const step of verified.proof) {
        expect(step.components).toEqual(expect.arrayContaining([s, u, m, fixture.a, fixture.b]
          .map(node => expect.objectContaining({component: node.id, contextId: step.contextId}))));
        if (step.target === u.id) expect(step.components.map(receipt => receipt.component)).not.toContain(x.id);
      }
      expansions.push(['H', 'Q1', 'Q2'].map(head => [...members(parent, head)]));
      ancestry.push([raw(s).derivation, raw(u).derivation, m]);
      expect(members(parent, 'H')).toEqual([elementId('H'), m.id]);
      expect(members(parent, 'Q1')).not.toContain(m.id);
      expect(members(parent, 'Q2')).not.toContain(m.id);
      expect(verified.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
    }
    expect(expansions[0]).toEqual(expansions[1]);
    expect(expansions[0]).toEqual(expansions[2]);
    expect(ancestry[0]).toEqual(ancestry[1]);
    expect(ancestry[0]).toEqual(ancestry[2]);
  });

  it.each([
    ['extension-restriction', ['U'], 'U', 'cos-ct-extends.1.4'],
    ['restriction-extension', ['V'], 'V', 'cos-ct-extends.1.4'],
    ['extension-restriction', ['U'], 'V', 'derivation-ok-restriction.5.4'],
  ] as const)('checks actual local content rules for %s with empty %j at %s', async (shape, empty, target, rule) => {
    const {parent} = await subject(shape, ['U', 'V', 'M'], false, [], undefined, empty);
    // These edge labels still give the mixed membership vector. A root X
    // mapping alone does not qualify an illegal fresh helper for the lemma.
    expect(members(parent, 'Q1')).not.toContain(elementId('M'));
    expect(members(parent, 'Q2')).not.toContain(elementId('M'));
    expect(checkComponentConstruction(parent, typeId(target))).toMatchObject({kind: 'candidate-rejected', rule});
  });

  it.each([false, true])('erases private helper particles in a new copied-B root (shared DAG: %s)', async dag => {
    // Expected before execution: P+ 1..1 restricts B 0..1 by Recurse;
    // U's extension is raw identity. Its child preserves P+ and restricts B.
    // Both methods still exclude M under Q1/Q2 in the original root.
    const control = await privateParticleControl(dag);
    const {copied, parent, child, s, u, m, particles, pPlus, root, nested} = control;
    expect(pPlus.occurs).toEqual({min: '1', max: '1'});
    expect(parent.owner(pPlus.id)).toBe(s.id);
    if (!dag) {
      const outer = copied.request.actual.lookup(copied.a.content!);
      if (outer.kind !== 'found' || outer.node.kind !== 'particle') throw new Error('Expected B particle');
      expect(pPlus.term).toEqual(outer.node.term);
      expect(outer.node.occurs).toEqual({min: '0', max: '1'});
    }
    const omitted = new Set(particles.map(node => node.id));
    for (const context of [parent, child]) {
      for (const node of [s, u, m, ...particles])
        expect(checkComponentConstruction(context, node.id), node.id).toMatchObject({kind: 'checked'});
      for (const helper of [s, u]) {
        const content = deriveRawComplexContent(context, helper.id);
        expect(content).toMatchObject({kind: 'checked', view: {content: {kind: 'element-only', particle: pPlus.id}}});
      }
      expect(context.members).toEqual(parent.members);
    }
    expect(checkComponentConstruction(parent, copied.x.id)).toMatchObject({kind: 'checked'});
    const original = verifyFiniteRe01Evidence(copied.request.actual, copied.x.id, {root: root.id, nodes: [root, nested]});
    expect(original, JSON.stringify(original)).toMatchObject({kind: 'checked-candidate'});
    if (original.kind !== 'checked-candidate') throw new Error(original.kind);
    for (const step of original.proof) {
      const ids = new Set(step.components.map(receipt => receipt.component));
      for (const node of [s, u, m, copied.a, copied.b, ...particles]) expect(ids.has(node.id)).toBe(true);
      for (const receipt of step.components) {
        expect(receipt.contextId).toBe(step.contextId);
        for (const dependency of receipt.dependencies) expect(ids.has(dependency)).toBe(true);
      }
      if (step.target === u.id) expect(ids.has(copied.x.id)).toBe(false);
    }

    // Privacy audit: inspect every retained node, both canonical and effective
    // raw inventories, owners and provenance. Only S/U content edges to the
    // private set may disappear; checking just one content pointer is unsound.
    const contentUsers = new Set<string>();
    for (const id of parent.members.filter(id => !omitted.has(id))) {
      const found = parent.lookup(id);
      if (found.kind !== 'found') throw new Error(id);
      const node = found.node, properties = parent.rawTypeProperties(id);
      const canonical = containedNodes(node).filter(target => omitted.has(target));
      const effective = properties && 'particle' in properties.content && omitted.has(properties.content.particle);
      if (canonical.length || effective) {
        expect([s.id, u.id]).toContain(id);
        expect(canonical).toEqual([pPlus.id]);
        expect(properties?.content).toEqual({kind: 'element-only', particle: pPlus.id});
        contentUsers.add(id);
      }
      expect(omitted.has(parent.owner(id) ?? '')).toBe(false);
      for (const slot of [...referenceSlots(node), ...parent.references(id)]) {
        if (slot.reference.kind === 'original-generated') throw new Error('No scalar slots in template');
        const resolved = parent.resolve(slot.reference);
        if (resolved.kind === 'found') expect(omitted.has(resolved.node.id)).toBe(false);
      }
      if (properties) {
        expect(properties.attributeUses.some(id => omitted.has(id))).toBe(false);
        expect(properties.wildcard).toBeUndefined();
        const origins = properties.provenance.kind === 'actual-mapped'
          ? [properties.provenance.original] : properties.provenance.originals;
        expect(origins.some(id => omitted.has(id))).toBe(false);
      }
    }
    expect([...contentUsers].sort()).toEqual([s.id, u.id].sort());

    // The copied root was independently constructed from the same immutable
    // actual request, retaining exactly S/U/M and omitting all private nodes.
    if (!copied.child || !copied.nested) throw new Error('Expected copied child');
    expect(copied.parent.members).toEqual(parent.members.filter(id => !omitted.has(id)));
    expect(copied.request.actual.members.some(id => omitted.has(id))).toBe(false);
    for (const context of [copied.parent, copied.child]) {
      for (const helper of [s, u]) {
        expect(context.rawTypeProperties(helper.id)?.content).toEqual({kind: 'element-only', particle: copied.a.content});
        expect(checkComponentConstruction(context, helper.id)).toMatchObject({kind: 'checked'});
      }
      for (const id of context.members) {
        const found = context.lookup(id);
        if (found.kind !== 'found') throw new Error(id);
        expect(containedNodes(found.node).some(id => omitted.has(id))).toBe(false);
        expect(omitted.has(context.owner(id) ?? '')).toBe(false);
        for (const slot of [...referenceSlots(found.node), ...context.references(id)]) {
          if (slot.reference.kind === 'original-generated') throw new Error('Unexpected scalar slot');
          const resolved = context.resolve(slot.reference);
          if (resolved.kind === 'found') expect(omitted.has(resolved.node.id)).toBe(false);
        }
      }
    }
    const replacement = verifyFiniteRe01Evidence(copied.request.actual, copied.x.id,
      {root: copied.root.id, nodes: [copied.root, copied.nested]});
    expect(replacement, JSON.stringify(replacement)).toMatchObject({kind: 'checked-candidate'});
    if (replacement.kind !== 'checked-candidate') throw new Error(replacement.kind);
    for (const step of replacement.proof) {
      const ids = new Set(step.components.map(receipt => receipt.component));
      for (const node of [s, u, m, copied.a, copied.b]) expect(ids.has(node.id)).toBe(true);
      expect([...ids].some(id => omitted.has(id))).toBe(false);
      expect(step.correspondence.fresh.some(id => omitted.has(id))).toBe(false);
      if (step.target === u.id) expect(ids.has(copied.x.id)).toBe(false);
    }
    for (const head of ['H', 'Q1', 'Q2']) {
      expect(members(parent, head)).toEqual(members(copied.parent, head));
      expect(members(child, head)).toEqual(members(copied.child, head));
    }
    expect(members(parent, 'H')).toEqual([elementId('H'), m.id]);
    for (const head of ['Q1', 'Q2']) expect(members(parent, head)).not.toContain(m.id);
    for (const helper of [s, u])
      expect(parent.rawTypeProperties(helper.id)?.derivation).toEqual(copied.parent.rawTypeProperties(helper.id)?.derivation);
    expect(parent.lookup(m.id)).toEqual(copied.parent.lookup(m.id));
    expect(parent.rawTypeProperties(copied.x.id)).toEqual(copied.parent.rawTypeProperties(copied.x.id));
    expect(replacement.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  });

  it.each(['extension-restriction', 'restriction-extension'] as const)('keeps exact interior anchors observable for %s', async shape => {
    const {fixture, context, base, derived} = await namedComparison(shape);
    // Both paths have the same method set to B; V->U has only its own edge.
    // Distinct local p declarations avoid global and particle-identity shortcuts.
    expect(members(context, 'H')).toContain(fixture.m.id);
    expect(members(context, 'Q1')).not.toContain(fixture.m.id);
    expect(members(context, 'Q2')).not.toContain(fixture.m.id);
    const expected = shape === 'extension-restriction';
    expect(checkTypeDerivation(context, local(fixture.v.id), local(fixture.u.id), ['extension', 'list', 'union']))
      .toMatchObject({kind: 'checked', value: expected});
    expect(checkParticleRestriction(context, derived, base)).toMatchObject({kind: 'checked', value: expected});
    expect(checkTypeDerivation(context, local(fixture.v.id), local(fixture.v.id), ['extension', 'restriction', 'list', 'union']))
      .toMatchObject({kind: 'checked', value: true});
  });

  it.each([['member', true], ['interior', false]] as const)('distinguishes the %s type block from entered blocks', async (role, effective) => {
    const {parent, v, b, m} = await subject('extension-restriction', ['U', 'V', 'M'], false, [], role);
    // The departure V.block is excluded; U.block is entered on V->U->B.
    expect(checkTypeDerivation(parent, local(v.id), local(b.id), [])).toMatchObject({kind: 'checked', value: true});
    expect(checkSubstitution(parent, m.id, elementId('H'), {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
    expect(members(parent, 'H').includes(m.id)).toBe(effective);
  });

  it.each([
    ['opposite orientations', ['restriction', 'extension']],
    ['padded mixed path', ['extension', 'restriction', 'extension', 'restriction']],
  ] as const)('reconstructs the simultaneous copied-B forest with %s', async (_label, methods) => {
    const fixture = await subject('extension-restriction', ['U', 'V', 'M'], false, [{methods}]);
    const evidence = forestEvidence(fixture);
    const verified = verifyFiniteRe01Evidence(fixture.request.actual, fixture.x.id, evidence);
    expect(verified, JSON.stringify(verified)).toMatchObject({kind: 'checked-candidate'});
    if (verified.kind !== 'checked-candidate') throw new Error(verified.kind);
    const fresh = [fixture.u, fixture.v, fixture.m, ...fixture.companions, ...fixture.companionMembers];
    for (const step of verified.proof) {
      expect(step.components).toEqual(expect.arrayContaining(fresh.map(node => expect.objectContaining({component: node.id, contextId: step.contextId}))));
      if (step.target !== fixture.x.id) expect(step.components.map(receipt => receipt.component)).not.toContain(fixture.x.id);
    }
    // Retain the complete name set, rather than merging members by signature.
    expect(members(fixture.parent, 'H')).toEqual(expect.arrayContaining([fixture.m.id, ...fixture.companionMembers.map(node => node.id)]));
    expect(members(fixture.parent, 'H')).toHaveLength(3);
    expect(members(fixture.parent, 'Q1')).not.toContain(fixture.m.id);
    expect(members(fixture.parent, 'Q1')).not.toContain(fixture.companionMembers[0]!.id);
    expect(members(fixture.parent, 'Q2')).not.toContain(fixture.companionMembers[0]!.id);
    expect(verified.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  });

  it('extracts a padded support path without merging names or evidence contexts', async () => {
    const expansions: string[][] = [];
    for (const methods of [['extension', 'restriction', 'extension', 'restriction'], ['extension', 'restriction']] as const) {
      const fixture = await subject('extension-restriction', ['U', 'V', 'M'], false, [{methods}]);
      const evidence = forestEvidence(fixture);
      expect(verifyFiniteRe01Evidence(fixture.request.actual, fixture.x.id, evidence)).toMatchObject({kind: 'checked-candidate'});
      expansions.push(...['H', 'Q1', 'Q2'].map(head => [...members(fixture.parent, head)]));
    }
    expect(expansions.slice(0, 3)).toEqual(expansions.slice(3));
  });

  it('does not reuse a sibling-context proof when a simultaneous premise is missing', async () => {
    const fixture = await subject('extension-restriction', ['U', 'V', 'M'], false, [{methods: ['restriction', 'extension']}]);
    const evidence = forestEvidence(fixture), root = evidence.nodes[0]!;
    const missing = {...evidence, nodes: [{...root, premises: root.premises.slice(0, 1)}, ...evidence.nodes.slice(1)]};
    expect(verifyFiniteRe01Evidence(fixture.request.actual, fixture.x.id, missing))
      .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: fixture.companions[1]!.id, contextId: fixture.parent.contextId});
  });

  it('rejects simultaneous reconstruction when copied content consumes X', async () => {
    const fixture = await subject('extension-restriction', ['U', 'V', 'M'], true, [{methods: ['restriction', 'extension']}]);
    expect(checkComponentConstruction(fixture.parent, fixture.x.id)).toMatchObject({kind: 'checked'});
    expect(verifyFiniteRe01Evidence(fixture.request.actual, fixture.x.id, forestEvidence(fixture)))
      .toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: fixture.x.id});
  });

  it('requires evidence for an unused fresh extension root', async () => {
    const fixture = await subject('extension-restriction', ['U', 'V', 'M'], false,
      [{methods: ['restriction', 'extension'], unused: true}]);
    const evidence = forestEvidence(fixture), root = evidence.nodes[0]!;
    expect(verifyFiniteRe01Evidence(fixture.request.actual, fixture.x.id,
      {...evidence, nodes: [{...root, premises: root.premises.slice(0, 1)}, ...evidence.nodes.slice(1)]}))
      .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: fixture.companions[1]!.id});
  });

  it.each([
    {label: 'shared support', methods: ['restriction'], shared: true},
    {label: 'unused extension root', methods: ['restriction', 'extension'], unused: true},
  ] as const)('preserves every inherited root with $label', async path => {
    const fixture = await subject('extension-restriction', ['U', 'V', 'M'], false, [path]);
    const verified = verifyFiniteRe01Evidence(fixture.request.actual, fixture.x.id, forestEvidence(fixture));
    expect(verified, JSON.stringify(verified)).toMatchObject({kind: 'checked-candidate'});
    if (verified.kind !== 'checked-candidate') throw new Error(verified.kind);
    for (const step of verified.proof) expect(step.components).toEqual(expect.arrayContaining(
      fixture.companions.map(node => expect.objectContaining({component: node.id, contextId: step.contextId}))));
  });
});
