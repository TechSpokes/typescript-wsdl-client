import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {containedNodes, referenceSlots} from '../../../src/compiler/graphTraversal.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {checkSubstitution, checkTypeDerivation, declarationMethods, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import {deriveModelGroupContent, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkRawParticleExtension} from '../../../src/compiler/particleExtension.js';
import {checkElementDeclarationsConsistent} from '../../../src/compiler/particleDeclarationConsistency.js';
import {checkParticleAttribution} from '../../../src/compiler/particleAttribution.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:helper-methods';
const typeId = (name: string) => globalId('type', {namespace, local: name});
const elementId = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
type Shape = 'identity' | 'extension' | 'restriction' | 'extension-restriction' | 'restriction-extension' | 'live-content';
type Method = 'extension' | 'restriction';
type CompanionPath = Readonly<{methods: readonly Method[]; shared?: boolean; unused?: boolean}>;
type BridgeSource = 'final' | 'blocked';

async function subject(shape: Shape, names: readonly [string, string, string] = ['U', 'V', 'M'], consumedRoot = false,
  companionPaths: readonly CompanionPath[] = [], blockedType?: 'member' | 'interior', emptyHelpers: readonly string[] = [], bridgeSource?: BridgeSource) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const source = bridgeSource ? `helper-method-${bridgeSource}.xsd`
    : consumedRoot ? 'helper-method-consumed-root.xsd' : 'helper-method-support.xsd';
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
async function privateParticleControl(dag: boolean, repeatedHead = false, bridgeSource?: BridgeSource) {
  const copied = await subject('restriction-extension', ['S', 'U', 'M'], false, [], undefined, [], bridgeSource);
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
  if (repeatedHead) {
    const choice = particle(outer.term.children[2]!);
    if (choice.term.kind !== 'choice') throw new Error('Expected local choice');
    // Two distinct incidence paths to the same required Q1 particle. In the
    // root, Q1 expands only named original declarations; a child can add an
    // anonymous member to both positions without changing this particle DAG.
    const q1 = fresh(particle(choice.term.children[1]!), 'shared-global-Q1',
      {kind: 'element', declaration: local(elementId('Q1'))});
    children = [children[0]!, children[1]!, q1.id, q1.id];
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

// The abstract B-v1 identity contract permits fresh scoped helpers. P+ owns U;
// S owns P+, so ownership is acyclic even though S/U share content P+.
async function particleOwnedHelperControl(particleOwner: boolean) {
  const original = await privateParticleControl(false);
  const {copied, s, pPlus} = original;
  const {request, a, b, r, x, raw} = copied;
  const owner = particleOwner ? pPlus.id : s.id;
  const u: ComplexTypeNode = {...original.u, id: scopedId(owner, '/U', 'type'),
    identity: {kind: 'scoped', owner, path: '/U', role: 'type'},
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const m: ElementNode = {...original.m, type: local(u.id)};
  const endpoint = {...x, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(b.id), facets: []}};
  const alternative = (replace: boolean, omit: boolean) => {
    const helpers = [s, u].map(node => replace ? {...node, content: a.content} : node);
    const additions = [m, ...helpers, ...(omit ? [] : [pPlus])];
    return request.candidate({key: `scoped-${replace}-${omit}`,
      active: [...request.actual.members, ...additions.map(node => node.id)], additions, endpoint,
      rawTypes: [raw(a), raw(b), raw(r), raw(endpoint), ...helpers.map(node => raw(node, replace ? a.content : pPlus.id))],
      rawElements: [{element: m.id, final: [], block: []}]});
  };
  const evidence = (replace: boolean, omit = false) => {
    const parent = alternative(replace, omit);
    if (parent.kind !== 'prepared') throw new Error(JSON.stringify(parent));
    const childEndpoint = {...u, content: replace ? a.content : pPlus.id,
      derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(b.id), facets: []}};
    const child = forkSemanticCandidate(parent.context, {key: 'scoped-child', active: parent.context.members,
      endpoint: childEndpoint, rawTypes: [raw(childEndpoint, replace ? a.content : pPlus.id)]});
    if (child.kind !== 'prepared') throw new Error(JSON.stringify(child));
    const root = {...copied.root, context: parent.context};
    const nested = {...original.nested, parent: parent.context, context: child.context, target: u.id};
    return {parent: parent.context, child: child.context, root, nested};
  };
  return {request, a, b, x, s, u, m, pPlus, original: evidence(false), replaced: evidence(true), alternative, evidence};
}

// A supplied finite allocation, not an allocator or a graph-renaming API.
// U/V are particle-owned; D is owned by U; C occupies a retained S-owned path.
// Two declarations share U, another uses D, and V/C remain unused roots.
async function simultaneousScopedControl(dag = false, repeatedHead = false, named = false, bridgeSource?: BridgeSource) {
  const seed = await privateParticleControl(dag, repeatedHead, bridgeSource);
  const {request, a, b, r, x, raw} = seed.copied;
  const {s, pPlus} = seed;
  const scoped = (owner: string, nodePath: string, base: string, method: Method): ComplexTypeNode => ({...seed.u,
    id: named ? typeId(nodePath.replaceAll('/', '_')) : scopedId(owner, nodePath, 'type'),
    identity: named ? {kind: 'global', role: 'type', name: {namespace, local: nodePath.replaceAll('/', '_')}}
      : {kind: 'scoped', owner, path: nodePath, role: 'type'},
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    derivation: {kind: method, contentKind: 'complex', base: local(base), facets: []}});
  const u = scoped(pPlus.id, '/U', s.id, 'extension');
  const v = scoped(pPlus.id, '/V', s.id, 'extension');
  const d = scoped(u.id, '/D', u.id, 'restriction');
  const c = scoped(s.id, '/occupied', s.id, 'restriction');
  const helpers = [s, u, v, d, c];
  const bridge: ElementNode | undefined = bridgeSource ? {...seed.m, id: elementId('F'),
    identity: {kind: 'global', role: 'element', name: {namespace, local: 'F'}}, name: {namespace, local: 'F'},
    type: local(b.id), abstract: true} : undefined;
  const declarations: ElementNode[] = [u, u, d].map((type, index) => {
    const name = {namespace, local: `ScopedMember${index}`};
    return {...seed.m, id: globalId('element', name), identity: {kind: 'global', role: 'element', name}, name,
      type: local(type.id), substitutionGroup: local(bridge?.id ?? elementId('H'))};
  });
  if (bridge) declarations.push(bridge);
  const endpoint = {...x, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(b.id), facets: []}};
  type Defect = 'collision' | 'dependent-owner' | 'canonical-reference' | 'raw-reference' | 'raw-key' | 'raw-base';
  const build = (reconstruct: boolean, defect?: Defect) => {
    // Every derived ID is computed from its final owner, then checked by the
    // existing context factory. Distinct paths alone do not prove hash freshness.
    const nextU = scoped(s.id, defect === 'collision' ? '/occupied' : '/reconstructed/U', s.id, 'extension');
    const nextV = scoped(s.id, '/reconstructed/V', s.id, 'extension');
    const nextD = scoped(defect === 'dependent-owner' ? u.id : nextU.id, '/D', nextU.id, 'restriction');
    const identities = new Map([[u.id, nextU], [v.id, nextV], [d.id, nextD]]);
    const rebind = (reference: Reference): Reference => reference.kind === 'local'
      ? local(identities.get(reference.target)?.id ?? reference.target) : reference;
    const types = reconstruct ? helpers.map(node => ({...(identities.get(node.id) ?? node), content: a.content})) : helpers;
    const elements = reconstruct ? declarations.map((node, index) => ({...node,
      type: defect === 'canonical-reference' && index === 1 ? node.type : rebind(node.type)})) : declarations;
    const additions = [...types, ...elements, ...(reconstruct ? [] : seed.particles)];
    const rawTypes = types.map(node => raw(node, reconstruct ? a.content : pPlus.id));
    if (reconstruct) {
      if (defect === 'raw-key') rawTypes[1] = {...rawTypes[1]!, type: u.id};
      if (defect === 'raw-base') rawTypes[3] = {...rawTypes[3]!, derivation: {method: 'restriction', base: local(u.id)}};
    }
    const candidate = request.candidate({key: `simultaneous-${reconstruct}-${defect ?? 'valid'}`,
      active: [...request.actual.members, ...additions.map(node => node.id)], additions, endpoint,
      rawTypes: [raw(a), raw(b), raw(r), raw(endpoint), ...rawTypes],
      rawElements: elements.map((node, index) => ({element: node.id, final: [], block: [],
        type: reconstruct ? defect === 'raw-reference' && index === 1 ? declarations[index]!.type
          : rebind(declarations[index]!.type) : node.type}))});
    return {candidate, types, elements, identities};
  };
  const original = build(false), reconstructed = build(true);
  if (original.candidate.kind !== 'prepared' || reconstructed.candidate.kind !== 'prepared')
    throw new Error(JSON.stringify([original.candidate, reconstructed.candidate]));
  // A separate new root over immutable Gamma: preserve all component IDs,
  // owner chains, raw keys, member references and the complete particle DAG.
  const retainedTypes = helpers.map(node => ({...node, content: a.content}));
  const retained = request.candidate({key: 'identity-preserving-particles',
    active: original.candidate.context.members, additions: [...retainedTypes, ...declarations, ...seed.particles], endpoint,
    rawTypes: [raw(a), raw(b), raw(r), raw(endpoint), ...retainedTypes.map(node => raw(node))],
    rawElements: declarations.map(node => ({element: node.id, final: [], block: [], type: node.type}))});
  if (retained.kind !== 'prepared') throw new Error(JSON.stringify(retained));
  // One alternative root recipe, not a normalizer: each detached fresh
  // particle keeps its identity/owner and becomes the same original z leaf.
  const outer = request.actual.lookup(a.content!);
  if (outer.kind !== 'found' || outer.node.kind !== 'particle' || outer.node.term.kind !== 'sequence')
    throw new Error('Expected original B content');
  const delimiter = request.actual.lookup(outer.node.term.children[1]!);
  if (delimiter.kind !== 'found' || delimiter.node.kind !== 'particle' || delimiter.node.term.kind !== 'element')
    throw new Error('Expected original delimiter particle');
  const delimiterDeclaration = request.actual.resolve(delimiter.node.term.declaration);
  if (delimiterDeclaration.kind !== 'found' || delimiterDeclaration.node.kind !== 'element')
    throw new Error('Expected original delimiter declaration');
  const delimiterReference = delimiter.node.term.declaration;
  const repairedParticles: ParticleNode[] = seed.particles.map(node => ({...node,
    occurs: {min: '1', max: '1'}, term: {kind: 'element', declaration: delimiterReference}}));
  const repaired = request.candidate({key: 'identity-preserving-delimiter-payloads',
    active: original.candidate.context.members, additions: [...retainedTypes, ...declarations, ...repairedParticles], endpoint,
    rawTypes: [raw(a), raw(b), raw(r), raw(endpoint), ...retainedTypes.map(node => raw(node))],
    rawElements: declarations.map(node => ({element: node.id, final: [], block: [], type: node.type}))});
  if (repaired.kind !== 'prepared') throw new Error(JSON.stringify(repaired));
  const evidence = (context: SemanticContext, types: readonly ComplexTypeNode[]) => {
    const nodes: FiniteRe01EvidenceNode[] = [];
    const children = (parent: SemanticContext, remaining: readonly ComplexTypeNode[]): string[] => remaining.map(node => {
      const id = `scoped-proof-${nodes.length}`;
      const childEndpoint = {...node, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const,
        base: local(b.id), facets: []}};
      const child = forkSemanticCandidate(parent, {key: id, active: parent.members, endpoint: childEndpoint,
        rawTypes: [raw(childEndpoint, node.content)]});
      if (child.kind !== 'prepared') throw new Error(JSON.stringify(child));
      const premises: string[] = [];
      nodes.push({id, parent, context: child.context, target: node.id, intermediate: b.id, ancestor: local(a.id), premises});
      premises.push(...children(child.context, remaining.filter(other => other.id !== node.id)));
      return id;
    });
    const premises: string[] = [];
    nodes.push({id: 'root', parent: request.actual, context, target: x.id, intermediate: b.id, ancestor: local(a.id), premises});
    premises.push(...children(context, types.filter(node => node.derivation?.kind === 'extension')));
    return {root: 'root', nodes};
  };
  return {request, a, b, x, s, u, v, d, c, bridge, pPlus, particles: seed.particles, helpers, declarations, build, evidence,
    repaired: {context: repaired.context, types: retainedTypes, elements: declarations, particles: repairedParticles},
    delimiter: delimiterDeclaration.node,
    retained: {context: retained.context, types: retainedTypes, elements: declarations},
    original: {...original, context: original.candidate.context},
    reconstructed: {...reconstructed, context: reconstructed.candidate.context}};
}

function members(context: SemanticContext, head: string) {
  const result = effectiveSubstitutionMembers(context, elementId(head));
  if (result.kind !== 'checked') throw new Error(JSON.stringify(result));
  return result.value;
}

// Separate mixed direct-H construction for the exact old live-content shape.
// S/C keep B; U/V extend S by [exact B, optional disjoint skip wildcard];
// D restricts U with that same raw particle. Canonical content is exact B.
// S owns wrapper/suffix, wrapper owns U/V, and U owns D.
async function wildcardSuffixControl() {
  const seed = await simultaneousScopedControl();
  const {request, a, b, x, s, u, v, d, c, declarations, pPlus, delimiter} = seed;
  const suffix: ParticleNode = {...pPlus, id: scopedId(s.id, '/suffix', 'particle'),
    identity: {kind: 'scoped', owner: s.id, path: '/suffix', role: 'particle'}, occurs: {min: '0', max: '1'},
    term: {kind: 'any', wildcard: {namespace: {value: 'urn:recovery:separate-suffix', context: a.context}, processContents: 'skip'}}};
  const wrapper: ParticleNode = {...pPlus, occurs: {min: '1', max: '1'},
    term: {kind: 'sequence', children: [a.content!, suffix.id]}};
  const helpers = [s, u, v, d, c].map(node => ({...node, content: a.content}));
  const raw = (node: ComplexTypeNode, particle: string): RawComplexTypeProperties => ({
    ...seed.repaired.context.rawTypeProperties(node.id)!, content: {kind: 'element-only', particle}});
  const endpoint = seed.repaired.context.lookup(x.id);
  if (endpoint.kind !== 'found' || endpoint.node.kind !== 'complexType') throw new Error(x.id);
  const endpointNode = endpoint.node;
  const particles = [wrapper, suffix];
  const replacement = particles.map(node => ({...node, occurs: {min: '1', max: '1'},
    term: {kind: 'element' as const, declaration: local(delimiter.id)}}));
  const build = (repair: boolean) => {
    const live = new Set([u.id, v.id, d.id]);
    const candidate = request.candidate({key: repair ? 'suffix-repaired' : 'suffix-mixed-original',
      active: [...request.actual.members, ...helpers.map(node => node.id), ...declarations.map(node => node.id), ...particles.map(node => node.id)],
      endpoint: endpointNode, additions: [...helpers, ...declarations, ...(repair ? replacement : particles)],
      rawTypes: [...request.actual.members.flatMap(id => {
        const value = seed.repaired.context.rawTypeProperties(id); return value ? [value] : [];
      }), ...helpers.map(node => raw(node, !repair && live.has(node.id) ? wrapper.id : a.content!))],
      rawElements: declarations.map(node => ({element: node.id, type: node.type, final: [], block: []}))});
    if (candidate.kind !== 'prepared') throw new Error(JSON.stringify(candidate));
    return candidate.context;
  };
  const original = build(false), repaired = build(true);
  const child = forkSemanticCandidate(original, {key: 'suffix-original-child', active: original.members,
    endpoint: {...helpers[1]!, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}},
    rawTypes: [{...original.rawTypeProperties(u.id)!, derivation: {method: 'restriction', base: local(b.id)}}]});
  if (child.kind !== 'prepared') throw new Error(JSON.stringify(child));
  return {...seed, helpers, particles, replacement, original, repaired, child: child.context};
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
  it('reconstructs one exact-B abstract bridge with complete own-context helper evidence', async () => {
    const control = await simultaneousScopedControl(false, true, false, 'final');
    const {request, a, b, x, u, v, c, helpers, declarations, particles, repaired, bridge, evidence, delimiter} = control;
    if (!bridge) throw new Error('Expected bridge');
    expect(bridge).toMatchObject({abstract: true, type: local(b.id), substitutionGroup: local(elementId('H'))});
    const h = request.actual.lookup(elementId('H'));
    if (h.kind !== 'found') throw new Error('Expected original H');
    expect(declarationMethods(request.actual, h.node, 'final')).toEqual(['restriction']);
    expect(repaired.context.lookup(elementId('H'))).toEqual(request.actual.lookup(elementId('H')));
    expect(repaired.context.rawElementProperties(elementId('H'))).toEqual(request.actual.rawElementProperties(elementId('H')));
    expect(repaired.context.members).toEqual(control.original.context.members);
    for (const node of [...helpers, ...declarations]) {
      expect(repaired.context.lookup(node.id)).toEqual(control.retained.context.lookup(node.id));
      expect(repaired.context.owner(node.id)).toBe(control.original.context.owner(node.id));
    }
    for (const node of repaired.types) {
      expect(node.content).toBe(a.content);
      expect(repaired.context.rawTypeProperties(node.id)?.content).toEqual({kind: 'element-only', particle: a.content});
    }
    for (const head of ['H', 'Q1', 'Q2']) {
      expect(members(repaired.context, head)).toEqual(members(control.original.context, head));
      expect(members(repaired.context, head)).not.toContain(bridge.id);
    }
    expect(members(repaired.context, 'H')).toHaveLength(4);
    expect(members(repaired.context, 'Q1')).toEqual([elementId('H'), elementId('Q1')].sort());
    expect(members(repaired.context, 'Q2')).toEqual([elementId('H'), elementId('Q1'), elementId('Q2')].sort());
    const supplied = evidence(repaired.context, repaired.types);
    const verified = verifyFiniteRe01Evidence(request.actual, x.id, supplied);
    expect(verified, JSON.stringify(verified)).toMatchObject({kind: 'checked-candidate',
      claims: {universalCoverage: false, completeNegativeAnswer: false, searchTermination: false}});
    if (verified.kind !== 'checked-candidate') throw new Error(verified.kind);
    expect(verified.proof).toHaveLength(5);
    for (const step of verified.proof) {
      const context = supplied.nodes.find(node => node.context.contextId === step.contextId)!.context;
      const ids = new Set(step.components.map(receipt => receipt.component));
      for (const node of [...helpers, ...declarations, ...particles, a, b, delimiter]) expect(ids.has(node.id), node.id).toBe(true);
      expect(context.members).toEqual(repaired.context.members);
      expect(context.lookup(bridge.id)).toEqual(repaired.context.lookup(bridge.id));
      expect(context.rawElementProperties(bridge.id)).toEqual({element: bridge.id, final: [], block: [], type: local(b.id)});
      expect(checkSubstitution(context, bridge.id, elementId('H'), {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
      for (const member of declarations.filter(node => !node.abstract)) {
        expect(checkSubstitution(context, member.id, bridge.id, {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
        expect(members(context, 'H')).toContain(member.id);
      }
      for (const head of ['H', 'Q1', 'Q2']) expect(members(context, head)).not.toContain(bridge.id);
      for (const particle of repaired.particles) expect(context.lookup(particle.id)).toEqual(repaired.context.lookup(particle.id));
      if (step.target !== x.id) expect(ids.has(x.id)).toBe(false);
      expect(ids.has(c.id)).toBe(true);
      for (const receipt of step.components) {
        expect(receipt.contextId).toBe(step.contextId);
        for (const dependency of receipt.dependencies) expect(ids.has(dependency), dependency).toBe(true);
      }
    }
    const child = supplied.nodes.find(node => node.parent === repaired.context && node.target === u.id)!;
    for (const member of declarations.slice(0, 3)) {
      expect(members(child.context, 'Q1')).toContain(member.id);
      expect(members(child.context, 'Q2')).not.toContain(member.id);
    }
    expect(verifyFiniteRe01Evidence(request.actual, x.id,
      {...supplied, nodes: supplied.nodes.map(node => node === child ? {...node, premises: []} : node)}))
      .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', contextId: child.context.contextId, component: v.id});
  });

  it('rejects direct mixed-method affiliation under actual H.final restriction', async () => {
    const control = await simultaneousScopedControl(false, false, false, 'final');
    const {request, a, b, x, repaired, declarations, evidence} = control;
    const target = repaired.context.lookup(x.id);
    if (target.kind !== 'found' || target.node.kind !== 'complexType') throw new Error(x.id);
    const direct = declarations.map((node, index) => index === 0 ? {...node, substitutionGroup: local(elementId('H'))} : node);
    const candidate = request.candidate({key: 'direct-final-control', active: repaired.context.members,
      additions: [...repaired.types, ...direct, ...repaired.particles], endpoint: target.node,
      rawTypes: [a, b, ...repaired.types, target.node].map(node => repaired.context.rawTypeProperties(node.id)!),
      rawElements: direct.map(node => ({element: node.id, final: [], block: [], type: node.type}))});
    if (candidate.kind !== 'prepared') throw new Error(JSON.stringify(candidate));
    expect(checkTypeDerivation(candidate.context, direct[0]!.type, local(b.id), ['restriction']))
      .toMatchObject({kind: 'checked', value: false});
    expect(checkSubstitution(candidate.context, direct[0]!.id, elementId('H'), {mode: 'affiliation'}))
      .toMatchObject({kind: 'checked', value: false});
    expect(verifyFiniteRe01Evidence(request.actual, x.id, evidence(candidate.context, repaired.types)))
      .toMatchObject({kind: 'candidate-rejected', rule: 'e-props-correct.4', component: direct[0]!.id});
  });

  it('keeps ultimate-head blocking effective through the same legal abstract bridge', async () => {
    const {request, b, x, bridge, declarations, repaired, evidence} = await simultaneousScopedControl(false, false, false, 'blocked');
    if (!bridge) throw new Error('Expected bridge');
    const context = repaired.context, member = declarations[0]!;
    const h = request.actual.lookup(elementId('H'));
    if (h.kind !== 'found') throw new Error('Expected original H');
    expect(declarationMethods(request.actual, h.node, 'final')).toEqual(['restriction']);
    expect(declarationMethods(request.actual, h.node, 'block')).toEqual(['restriction']);
    expect(checkSubstitution(context, bridge.id, elementId('H'), {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
    expect(checkSubstitution(context, member.id, bridge.id, {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
    expect(checkTypeDerivation(context, member.type, local(b.id), [])).toMatchObject({kind: 'checked', value: true});
    expect(checkSubstitution(context, member.id, elementId('H'), {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: false});
    expect(members(context, 'H')).toEqual([elementId('H')]);
    // Without another effective H member the first particle is no implicit
    // choice, so X's grouped four H positions cannot use MapAndSum there.
    expect(verifyFiniteRe01Evidence(request.actual, x.id, evidence(context, repaired.types)))
      .toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: x.id});
    // H.block is specific to the queried head; it does not become Q2.block.
    expect(checkSubstitution(context, bridge.id, elementId('Q2'), {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: true});
  });

  it.each([false, true])('reconstructs detached particle payloads without allocating identities (shared DAG: %s)', async dag => {
    // The non-DAG variant is exactly #295's repeated-global-Q1 EDC trap.
    // Both variants retain particle-owned U/V, dependent D, shared members,
    // unused V/C and every particle as a required root in all five contexts.
    const control = await simultaneousScopedControl(dag, !dag);
    const {request, a, b, x, u, v, d, c, helpers, declarations, particles, original, retained, repaired, delimiter, evidence} = control;
    expect(delimiter).toMatchObject({kind: 'element', identity: {kind: 'scoped'}, name: {local: 'z'},
      abstract: false, type: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}}});
    expect(delimiter.substitutionGroup).toBeUndefined();
    expect(repaired.context.members).toEqual(original.context.members);
    for (const id of request.actual.members) {
      expect(repaired.context.sourceNode(id)).toBe(request.actual.sourceNode(id));
      expect(repaired.context.lookup(id)).toEqual(retained.context.lookup(id));
      if (id !== x.id) expect(repaired.context.lookup(id)).toEqual(request.actual.lookup(id));
    }
    for (const node of [...helpers, ...declarations]) {
      expect(repaired.context.lookup(node.id)).toEqual(retained.context.lookup(node.id));
      expect(repaired.context.owner(node.id)).toBe(original.context.owner(node.id));
    }
    expect(repaired.context.owner(d.id)).toBe(u.id);
    expect(repaired.context.owner(u.id)).toBe(control.pPlus.id);
    expect(repaired.elements.map(node => node.type)).toEqual(original.elements.map(node => node.type));
    for (const [index, node] of particles.entries()) {
      const replacement = repaired.particles[index]!;
      expect(replacement).toEqual({...node, occurs: {min: '1', max: '1'},
        term: {kind: 'element', declaration: local(delimiter.id)}});
      expect(repaired.context.owner(node.id)).toBe(original.context.owner(node.id));
      expect(containedNodes(replacement)).toEqual([]);
      expect(replacement.identity.kind).toBe('scoped');
      if (replacement.identity.kind !== 'scoped') throw new Error('Expected scoped particle');
      expect(replacement.id).toBe(scopedId(replacement.identity.owner, replacement.identity.path, replacement.identity.role));
    }
    for (const head of ['H', 'Q1', 'Q2']) expect(members(repaired.context, head)).toEqual(members(original.context, head));
    const supplied = evidence(repaired.context, repaired.types);
    const verified = verifyFiniteRe01Evidence(request.actual, x.id, supplied);
    expect(verified, JSON.stringify(verified)).toMatchObject({kind: 'checked-candidate',
      claims: {universalCoverage: false, completeNegativeAnswer: false, searchTermination: false}});
    if (verified.kind !== 'checked-candidate') throw new Error(verified.kind);
    expect(verified.proof).toHaveLength(5);
    for (const step of verified.proof) {
      const context = supplied.nodes.find(node => node.context.contextId === step.contextId)!.context;
      const ids = new Set(step.components.map(receipt => receipt.component));
      expect(context.members).toEqual(original.context.members);
      for (const node of [...helpers, ...declarations, ...particles, a, b, delimiter])
        expect(ids.has(node.id), node.id).toBe(true);
      for (const node of repaired.particles) {
        expect(context.lookup(node.id)).toEqual(repaired.context.lookup(node.id));
        expect(checkComponentConstruction(context, node.id)).toMatchObject({kind: 'checked'});
        expect(checkElementDeclarationsConsistent(context, [node.id])).toMatchObject({kind: 'checked', value: true});
        const content = deriveModelGroupContent(context, node.id);
        if (content.kind !== 'checked') throw new Error(JSON.stringify(content));
        const view = prepareSemanticParticleView(context, content.view, 'declared');
        if (view.kind !== 'checked') throw new Error(JSON.stringify(view));
        expect(checkParticleAttribution(context, view.view)).toMatchObject({kind: 'checked', value: true});
      }
      if (step.target !== x.id) expect(ids.has(x.id)).toBe(false);
      for (const receipt of step.components) {
        expect(receipt.contextId).toBe(step.contextId);
        for (const dependency of receipt.dependencies) expect(ids.has(dependency)).toBe(true);
      }
    }
    const child = supplied.nodes.find(node => node.parent === repaired.context && node.target === u.id)!;
    expect(members(child.context, 'Q1')).toContain(declarations[0]!.id);
    expect(members(child.context, 'Q1')).toContain(declarations[1]!.id);
    expect(members(child.context, 'Q2')).not.toContain(declarations[0]!.id);
    expect(verified.proof.every(step => step.components.some(receipt => receipt.component === c.id))).toBe(true);
    expect(verifyFiniteRe01Evidence(request.actual, x.id,
      {...supplied, nodes: supplied.nodes.map(node => node === child ? {...node, premises: []} : node)}))
      .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', contextId: child.context.contextId, component: v.id});
    // The new-root freedom does not authorize rewriting an inherited particle.
    const endpoint = child.context.lookup(u.id);
    if (endpoint.kind !== 'found' || endpoint.node.kind !== 'complexType') throw new Error(u.id);
    expect(forkSemanticCandidate(repaired.context, {key: 'forbidden-inherited-rewrite', active: repaired.context.members,
      endpoint: endpoint.node, additions: [particles[0]!]}))
      .toMatchObject({kind: 'candidate-rejected', code: 'identity', component: particles[0]!.id});
  });

  it.each([false, true])('retains scoped identities and every particle with complete evidence (shared DAG: %s)', async dag => {
    const control = await simultaneousScopedControl(dag);
    const {request, x, a, b, helpers, declarations, particles, original, retained, evidence} = control;
    expect(retained.context.members).toEqual(original.context.members);
    for (const helper of helpers) {
      const found = retained.context.lookup(helper.id);
      expect(found).toMatchObject({kind: 'found', node: {...helper, content: a.content}});
      expect(retained.context.owner(helper.id)).toBe(original.context.owner(helper.id));
      expect(retained.context.rawTypeProperties(helper.id)?.content).toEqual({kind: 'element-only', particle: a.content});
    }
    for (const node of [...declarations, ...particles]) expect(retained.context.lookup(node.id)).toEqual(original.context.lookup(node.id));
    for (const head of ['H', 'Q1', 'Q2']) expect(members(retained.context, head)).toEqual(members(original.context, head));
    for (const record of [original, retained]) {
      const supplied = evidence(record.context, record.types);
      const verified = verifyFiniteRe01Evidence(request.actual, x.id, supplied);
      expect(verified, JSON.stringify(verified)).toMatchObject({kind: 'checked-candidate'});
      if (verified.kind !== 'checked-candidate') throw new Error(verified.kind);
      expect(verified.proof).toHaveLength(5);
      for (const step of verified.proof) {
        const context = supplied.nodes.find(node => node.context.contextId === step.contextId)!.context;
        const ids = new Set(step.components.map(receipt => receipt.component));
        expect(context.members).toEqual(record.context.members);
        for (const node of [...helpers, ...declarations, ...particles, a, b]) expect(ids.has(node.id), node.id).toBe(true);
        if (step.target !== x.id) expect(ids.has(x.id)).toBe(false);
        for (const receipt of step.components) {
          expect(receipt.contextId).toBe(step.contextId);
          for (const dependency of receipt.dependencies) expect(ids.has(dependency)).toBe(true);
        }
      }
      const child = supplied.nodes[1]!;
      expect(verifyFiniteRe01Evidence(request.actual, x.id,
        {...supplied, nodes: supplied.nodes.map(node => node === child ? {...node, premises: []} : node)}))
        .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', contextId: child.context.contextId});
    }
  });

  it('rechecks a retained shared Q1 DAG when a required child exposes anonymous members twice', async () => {
    // cos-element-consistent requires the same named type at distinct same-QName
    // positions. Root mixed paths block all fresh members under Q1. U's B-child
    // exposes its anonymous members under both edges to the shared Q1 particle.
    const control = await simultaneousScopedControl(false, true);
    const {request, x, helpers, declarations, particles, pPlus, original, retained, evidence, u} = control;
    for (const record of [original, retained]) {
      for (const node of [x, ...helpers, ...declarations, ...particles])
        expect(checkComponentConstruction(record.context, node.id), node.id).toMatchObject({kind: 'checked'});
      expect(checkElementDeclarationsConsistent(record.context, [pPlus.id])).toMatchObject({kind: 'checked', value: true});
      for (const declaration of declarations) expect(members(record.context, 'Q1')).not.toContain(declaration.id);
    }
    const supplied = evidence(retained.context, retained.types);
    const child = supplied.nodes.find(node => node.parent === retained.context && node.target === u.id)!;
    expect(child).toBeDefined();
    expect(child.context.lookup(pPlus.id)).toEqual(retained.context.lookup(pPlus.id));
    expect(child.context.members).toEqual(retained.context.members);
    expect(members(child.context, 'Q1')).toContain(declarations[0]!.id);
    expect(members(child.context, 'Q1')).toContain(declarations[1]!.id);
    expect(checkElementDeclarationsConsistent(child.context, [pPlus.id]))
      .toMatchObject({kind: 'checked', value: false, rule: 'cos-element-consistent'});
    const content = deriveModelGroupContent(child.context, pPlus.id);
    if (content.kind !== 'checked') throw new Error(JSON.stringify(content));
    const view = prepareSemanticParticleView(child.context, content.view, 'declared');
    if (view.kind !== 'checked') throw new Error(JSON.stringify(view));
    expect(checkParticleAttribution(child.context, view.view)).toMatchObject({kind: 'checked', value: true});
    expect(checkComponentConstruction(child.context, pPlus.id))
      .toMatchObject({kind: 'candidate-rejected', rule: 'cos-element-consistent', component: pPlus.id});
    const verified = verifyFiniteRe01Evidence(request.actual, x.id, supplied);
    expect(verified).toMatchObject({kind: 'candidate-rejected', rule: 'cos-element-consistent', component: pPlus.id,
      contextId: child.context.contextId});
    // This refutes the unchanged-inventory construction, not arbitrary
    // reconstruction or the existing allocation-certified omission theorem.
    const allocated = control.reconstructed;
    expect(verifyFiniteRe01Evidence(request.actual, x.id, evidence(allocated.context, allocated.types)))
      .toMatchObject({kind: 'checked-candidate'});
  });

  it('retains the repeated-Q1 particle inventory when the expanded members have named types', async () => {
    // The same particle incidence and child expansion do not fail EDC when
    // each repeated declaration has a named type. UPA is unchanged in both.
    const control = await simultaneousScopedControl(false, true, true);
    const {request, x, retained, pPlus, evidence, u, declarations} = control;
    const supplied = evidence(retained.context, retained.types);
    const child = supplied.nodes.find(node => node.parent === retained.context && node.target === u.id)!;
    expect(members(child.context, 'Q1')).toContain(declarations[0]!.id);
    expect(checkElementDeclarationsConsistent(child.context, [pPlus.id])).toMatchObject({kind: 'checked', value: true});
    expect(verifyFiniteRe01Evidence(request.actual, x.id, supplied)).toMatchObject({kind: 'checked-candidate'});
  });

  it('reconstructs simultaneous scoped ownership with shared references and dependent identities', async () => {
    // Rule-derived expectation: a coherent injective rebinding preserves the
    // type paths, sharing and declaration names. Exact B re-establishes content
    // legality; every branch still owes both inherited extension roots.
    const control = await simultaneousScopedControl();
    const {request, a, b, x, s, u, v, d, c, pPlus, original, reconstructed} = control;
    const changed = [u, v, d].map(node => reconstructed.identities.get(node.id)!);
    expect(new Set(changed.map(node => node.id)).size).toBe(3);
    const forbidden = new Set(original.context.members);
    for (const node of changed) {
      expect(forbidden.has(node.id)).toBe(false);
      expect(node.identity.kind).toBe('scoped');
      expect(reconstructed.context.rawTypeProperties(node.id)?.targetNamespace).toBe(namespace);
    }
    expect(reconstructed.context.owner(changed[0]!.id)).toBe(s.id);
    expect(reconstructed.context.owner(changed[1]!.id)).toBe(s.id);
    expect(reconstructed.context.owner(changed[2]!.id)).toBe(changed[0]!.id);
    expect(reconstructed.context.owner(c.id)).toBe(s.id);
    expect(reconstructed.elements.map(node => node.type)).toEqual([local(changed[0]!.id), local(changed[0]!.id), local(changed[2]!.id)]);
    expect(reconstructed.types[3]!.derivation?.base).toEqual(local(changed[0]!.id));
    expect(reconstructed.elements.map(node => [node.id, node.name])).toEqual(original.elements.map(node => [node.id, node.name]));
    for (const head of ['H', 'Q1', 'Q2'])
      expect(members(reconstructed.context, head)).toEqual(members(original.context, head));
    for (const member of reconstructed.elements) {
      expect(members(reconstructed.context, 'H')).toContain(member.id);
      expect(members(reconstructed.context, 'Q1')).not.toContain(member.id);
      expect(members(reconstructed.context, 'Q2')).not.toContain(member.id);
    }
    // Canonical slots and raw overlays both matter. A raw override cannot
    // authenticate a stale canonical reference or a stale dependent owner.
    const removed = new Set([pPlus.id, u.id, v.id, d.id]);
    const context = reconstructed.context;
    for (const id of context.members) {
      expect(removed.has(id)).toBe(false);
      const found = context.lookup(id);
      if (found.kind !== 'found') throw new Error(id);
      expect(removed.has(context.owner(id) ?? '')).toBe(false);
      expect(containedNodes(found.node).some(target => removed.has(target))).toBe(false);
      for (const slot of [...referenceSlots(found.node), ...context.references(id)]) {
        if (slot.reference.kind === 'original-generated') throw new Error('No generated scalar role');
        const target = context.resolve(slot.reference);
        expect(['found', 'builtin']).toContain(target.kind);
        if (target.kind === 'found') expect(removed.has(target.node.id)).toBe(false);
      }
      const properties = context.rawTypeProperties(id);
      if (properties) {
        expect(properties.type).toBe(id);
        expect(properties.attributeUses).toEqual([]);
        expect(properties.wildcard).toBeUndefined();
        const origins = properties.provenance.kind === 'actual-mapped' ? [properties.provenance.original] : properties.provenance.originals;
        expect(origins.some(target => removed.has(target))).toBe(false);
      }
    }
    for (const id of request.actual.members) {
      expect(reconstructed.context.sourceNode(id)).toBe(request.actual.sourceNode(id));
      if (id !== x.id) expect(reconstructed.context.lookup(id)).toEqual(request.actual.lookup(id));
    }
    for (const record of [original, reconstructed]) {
      const supplied = control.evidence(record.context, record.types);
      const result = verifyFiniteRe01Evidence(request.actual, x.id, supplied);
      expect(result, JSON.stringify(result)).toMatchObject({kind: 'checked-candidate'});
      if (result.kind !== 'checked-candidate') throw new Error(result.kind);
      expect(result.proof).toHaveLength(5); // Root, two children, and each child's required sibling.
      for (const step of result.proof) {
        const ids = new Set(step.components.map(receipt => receipt.component));
        const context = supplied.nodes.find(node => node.context.contextId === step.contextId)!.context;
        expect(context.members).toEqual(record.context.members);
        for (const node of [...record.types, ...record.elements, a, b]) expect(ids.has(node.id), node.id).toBe(true);
        expect(ids.has(pPlus.id)).toBe(record === original);
        if (step.target !== x.id) expect(ids.has(x.id)).toBe(false);
        for (const receipt of step.components) {
          expect(receipt.contextId).toBe(step.contextId);
          for (const dependency of receipt.dependencies) expect(ids.has(dependency)).toBe(true);
        }
      }
      expect(result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
    }
    const supplied = control.evidence(reconstructed.context, reconstructed.types);
    const child = supplied.nodes[1]!;
    const incomplete = {...supplied, nodes: supplied.nodes.map(node => node === child ? {...node, premises: []} : node)};
    expect(verifyFiniteRe01Evidence(request.actual, x.id, incomplete))
      .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', contextId: child.context.contextId, component: changed[1]!.id});
  });

  it('rejects colliding allocations and incomplete simultaneous rebinding', async () => {
    const control = await simultaneousScopedControl();
    expect(control.build(true, 'collision').candidate).toMatchObject({kind: 'candidate-rejected', code: 'identity', component: control.c.id});
    for (const defect of ['dependent-owner', 'raw-reference', 'raw-key', 'raw-base'] as const) {
      const result = control.build(true, defect).candidate;
      expect(result, defect).toMatchObject({kind: 'candidate-rejected', code: 'missing', component: control.u.id});
    }
    // Correct raw overlays can mask stale canonical references at preparation.
    // The separate canonical inventory audit must require successful resolution.
    const stale = control.build(true, 'canonical-reference').candidate;
    expect(stale.kind).toBe('prepared');
    if (stale.kind !== 'prepared') throw new Error(JSON.stringify(stale));
    const found = stale.context.lookup(control.declarations[1]!.id);
    if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Expected shared member');
    expect(stale.context.resolve(found.node.type)).toMatchObject({kind: 'missing'});
    for (const slot of stale.context.references(found.node.id)) {
      if (slot.reference.kind === 'original-generated') throw new Error('No generated scalar role');
      expect(stale.context.resolve(slot.reference)).toMatchObject({kind: 'found'});
    }
    // A rejected supplied allocation proves neither universal allocation failure
    // nor nonexistence of a reconstruction. No retry bound or hash injectivity
    // premise is installed by these concrete successes and failures.
  });

  it.each([true, false])('checks scoped ownership after canonical and raw content replacement (particle owner: %s)', async particleOwner => {
    // Predicted independently of checker success: U.identity.owner=P+ is
    // unchanged by either content replacement, and omission must fail closure.
    const control = await particleOwnedHelperControl(particleOwner);
    const {request, a, b, x, s, u, m, pPlus, original, replaced} = control;
    expect(request.actual.lookup(pPlus.id).kind).toBe('missing');
    for (const record of [original, replaced]) {
      for (const context of [record.parent, record.child]) {
        expect(context.owner(u.id)).toBe(particleOwner ? pPlus.id : s.id);
        expect(context.owner(pPlus.id)).toBe(s.id);
        expect(context.owner(s.id)).toBeUndefined();
        for (const node of [s, u, m, pPlus])
          expect(checkComponentConstruction(context, node.id), node.id).toMatchObject({kind: 'checked'});
        expect(checkSubstitution(context, m.id, elementId('H'), {mode: 'affiliation'}))
          .toMatchObject({kind: 'checked', value: true});
      }
      const result = verifyFiniteRe01Evidence(request.actual, x.id, {root: 'root', nodes: [record.root, record.nested]});
      expect(result, JSON.stringify(result)).toMatchObject({kind: 'checked-candidate'});
      if (result.kind !== 'checked-candidate') throw new Error(result.kind);
      for (const step of result.proof) {
        const ids = new Set(step.components.map(receipt => receipt.component));
        for (const node of [s, u, m, pPlus, a, b]) expect(ids.has(node.id)).toBe(true);
        for (const receipt of step.components) {
          expect(receipt.contextId).toBe(step.contextId);
          for (const dependency of receipt.dependencies) expect(ids.has(dependency)).toBe(true);
        }
        if (step.target === u.id) expect(ids.has(x.id)).toBe(false);
      }
      expect(result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
    }
    for (const context of [replaced.parent, replaced.child]) {
      for (const helper of [s, u]) {
        const found = context.lookup(helper.id);
        if (found.kind !== 'found') throw new Error(helper.id);
        expect(containedNodes(found.node)).toEqual([a.content]);
        expect(context.rawTypeProperties(helper.id)?.content).toEqual({kind: 'element-only', particle: a.content});
      }
      // Complete canonical and effective typed/containment inventories contain
      // no retained-to-P+ edge. In the particle-owner case, only identity.owner
      // still selects P+.
      for (const id of context.members.filter(id => id !== pPlus.id)) {
        const found = context.lookup(id);
        if (found.kind !== 'found') throw new Error(id);
        expect(containedNodes(found.node)).not.toContain(pPlus.id);
        for (const slot of [...referenceSlots(found.node), ...context.references(id)]) {
          if (slot.reference.kind === 'original-generated') throw new Error('No generated scalar in template');
          const resolved = context.resolve(slot.reference);
          if (resolved.kind === 'found') expect(resolved.node.id).not.toBe(pPlus.id);
        }
      }
    }
    for (const head of ['H', 'Q1', 'Q2']) expect(members(replaced.parent, head)).toEqual(members(original.parent, head));
    expect(members(original.parent, 'Q1')).not.toContain(m.id);
    expect(members(original.parent, 'Q2')).not.toContain(m.id);
    if (particleOwner) {
      expect(control.alternative(true, true)).toMatchObject({kind: 'candidate-rejected', code: 'missing', component: pPlus.id});
    } else {
      // Scoped identity itself does not prevent omission. This exact contrast
      // changes only U's owner (and its derived ID/type reference), retaining S.
      const omitted = control.evidence(true, true);
      expect(omitted.parent.lookup(pPlus.id).kind).toBe('missing');
      expect(verifyFiniteRe01Evidence(request.actual, x.id, {root: 'root', nodes: [omitted.root, omitted.nested]}))
        .toMatchObject({kind: 'checked-candidate'});
    }
  });

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
    const {request, parent, child, a, b, x, u, m, root, nested} = await subject('live-content');
    if (!child || !nested) throw new Error('Expected helper context');
    // Raw extension adds a live disjoint wildcard after the optional A prefix.
    // The wrapper's optional B child cannot cover B's required first H.
    expect(checkComponentConstruction(parent, u.id)).toMatchObject({kind: 'checked'});
    expect(checkSubstitution(parent, m.id, elementId('H'), {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
    expect(members(parent, 'H')).toContain(m.id);
    expect(members(parent, 'Q1')).not.toContain(m.id);
    expect(members(parent, 'Q2')).toContain(m.id);
    // U clones B's absent canonical contribution. The raw overlay is the
    // effective content selector; it is not canonical containment in U.
    expect(parent.lookup(u.id)).toMatchObject({kind: 'found', node: {content: undefined}});
    expect(b.content).toBeUndefined();
    expect(parent.rawTypeProperties(b.id)?.content).toEqual({kind: 'element-only', particle: a.content});
    const content = deriveRawComplexContent(parent, u.id), base = deriveRawComplexContent(parent, b.id);
    if (content.kind !== 'checked' || base.kind !== 'checked') throw new Error('Expected raw views');
    const wrapper = scopedId(u.id, '/root', 'particle'), suffix = scopedId(u.id, '/suffix', 'particle');
    expect(content.view.content).toEqual({kind: 'element-only', particle: wrapper});
    expect(parent.lookup(wrapper)).toMatchObject({kind: 'found', node: {occurs: {min: '1', max: '1'},
      term: {kind: 'sequence', children: [a.content, suffix]}}});
    expect(parent.lookup(suffix)).toMatchObject({kind: 'found', node: {occurs: {min: '0', max: '1'},
      term: {kind: 'any', wildcard: {namespace: {value: 'urn:recovery:separate-suffix'}, processContents: 'skip'}}}});
    expect(checkRawParticleExtension(parent, content.view, base.view)).toMatchObject({kind: 'checked', value: true});
    expect(checkComponentConstruction(parent, x.id)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: x.id});
    expect(checkComponentConstruction(child, u.id)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: u.id});
    expect(child.rawTypeProperties(u.id)?.content).toEqual(content.view.content);
    const childContent = deriveRawComplexContent(child, u.id), childBase = deriveRawComplexContent(child, b.id);
    if (childContent.kind !== 'checked' || childBase.kind !== 'checked') throw new Error('Expected child views');
    const derived = prepareSemanticParticleView(child, childContent.view, 'restriction');
    const original = prepareSemanticParticleView(child, childBase.view, 'restriction');
    if (derived.kind !== 'checked' || original.kind !== 'checked') throw new Error('Expected restriction views');
    expect(derived.view.root).toMatchObject({kind: 'sequence', occurs: {min: '1', max: '1'}});
    expect(original.view.root).toMatchObject({kind: 'sequence', occurs: {min: '0', max: '1'}});
    expect(derived.view.root.children[0]).toMatchObject({kind: 'sequence', occurs: {min: '0', max: '1'}});
    expect(derived.view.root.children[0]!.children).toHaveLength(4);
    expect(original.view.root.children[0]).toMatchObject({kind: 'choice', occurs: {min: '4', max: '4'}});
    // Outer 1..1 fits 0..1. The first ordered MapAndSum instead compares
    // (0..1)*4 = 0..4 with required H[4..4], whose minimum cannot be met.
    expect(checkParticleRestriction(child, derived.view, original.view)).toMatchObject({kind: 'checked', value: false});
    expect(verifyFiniteRe01Evidence(request.actual, x.id, {root: root.id, nodes: [root, nested]}))
      .toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: x.id, contextId: parent.contextId});
  });

  it('repairs the separately identified mixed wildcard-suffix forest with complete contextual evidence', async () => {
    const {request, a, b, x, u, v, d, c, helpers, declarations, particles, replacement, original, repaired, child, delimiter, evidence} = await wildcardSuffixControl();
    // Original mixed member paths use both methods, unlike the old single
    // extension control. All local obligations pass; U's exact child fails.
    for (const node of [...helpers, ...declarations, ...particles, x])
      expect(checkComponentConstruction(original, node.id), node.id).toMatchObject({kind: 'checked'});
    for (const node of helpers) expect(original.rawTypeProperties(node.id)?.content).toEqual({kind: 'element-only',
      particle: [u.id, v.id, d.id].includes(node.id) ? particles[0]!.id : a.content});
    expect(checkComponentConstruction(child, u.id)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
    for (const head of ['H', 'Q1', 'Q2']) expect(members(repaired, head)).toEqual(members(original, head));
    expect(repaired.members).toEqual(original.members);
    for (const node of helpers) {
      expect(repaired.lookup(node.id)).toEqual(original.lookup(node.id));
      expect(repaired.rawTypeProperties(node.id)).toEqual({...original.rawTypeProperties(node.id), content: {kind: 'element-only', particle: a.content}});
    }
    for (const node of declarations) expect(repaired.lookup(node.id)).toEqual(original.lookup(node.id));
    expect(repaired.owner(u.id)).toBe(particles[0]!.id);
    expect(repaired.owner(d.id)).toBe(u.id);
    expect(declarations.slice(0, 2).map(node => node.type)).toEqual([local(u.id), local(u.id)]);
    for (const id of original.members) {
      expect(repaired.owner(id)).toBe(original.owner(id));
      expect(repaired.sourceNode(id)).toBe(original.sourceNode(id));
      if (request.actual.members.includes(id)) expect(repaired.lookup(id)).toEqual(original.lookup(id));
    }
    for (const [index, node] of particles.entries()) expect(replacement[index]).toEqual({...node,
      occurs: {min: '1', max: '1'}, term: {kind: 'element', declaration: local(delimiter.id)}});
    const supplied = evidence(repaired, helpers);
    const verified = verifyFiniteRe01Evidence(request.actual, x.id, supplied);
    expect(verified, JSON.stringify(verified)).toMatchObject({kind: 'checked-candidate',
      claims: {universalCoverage: false, completeNegativeAnswer: false, searchTermination: false}});
    if (verified.kind !== 'checked-candidate') throw new Error(verified.kind);
    expect(verified.proof).toHaveLength(5);
    for (const step of verified.proof) {
      const context = supplied.nodes.find(node => node.context.contextId === step.contextId)!.context;
      const checked = new Set(step.components.map(receipt => receipt.component));
      const proofNode = supplied.nodes.find(node => node.id === step.evidence)!;
      expect(step.correspondence).toMatchObject({kind: 'checked', parentContext: proofNode.parent.contextId,
        contextId: context.contextId, target: step.target});
      expect(context.members).toEqual(repaired.members);
      if (step.target !== x.id) for (const id of context.members) if (id !== step.target) {
        expect(context.lookup(id)).toEqual(proofNode.parent.lookup(id));
        expect(context.rawTypeProperties(id)).toEqual(proofNode.parent.rawTypeProperties(id));
      }
      for (const node of [...helpers, ...declarations, ...particles, a, b, delimiter]) expect(checked.has(node.id), node.id).toBe(true);
      if (step.target !== x.id) expect(checked.has(x.id)).toBe(false);
      for (const node of replacement) {
        expect(context.lookup(node.id)).toEqual(repaired.lookup(node.id));
        expect(checkComponentConstruction(context, node.id)).toMatchObject({kind: 'checked'});
        expect(checkElementDeclarationsConsistent(context, [node.id])).toMatchObject({kind: 'checked', value: true});
        const content = deriveModelGroupContent(context, node.id);
        if (content.kind !== 'checked') throw new Error(JSON.stringify(content));
        const view = prepareSemanticParticleView(context, content.view, 'declared');
        if (view.kind !== 'checked') throw new Error(JSON.stringify(view));
        expect(checkParticleAttribution(context, view.view)).toMatchObject({kind: 'checked', value: true});
      }
      for (const receipt of step.components) {
        expect(receipt.contextId).toBe(step.contextId);
        for (const dependency of receipt.dependencies) expect(checked.has(dependency)).toBe(true);
      }
    }
    const uChild = supplied.nodes.find(node => node.parent === repaired && node.target === u.id)!;
    expect(members(uChild.context, 'Q1')).toContain(declarations[0]!.id);
    expect(members(uChild.context, 'Q2')).not.toContain(declarations[0]!.id);
    expect(verified.proof.every(step => step.components.some(receipt => receipt.component === c.id))).toBe(true);
    expect(verifyFiniteRe01Evidence(request.actual, x.id, {...supplied,
      nodes: supplied.nodes.map(node => node === uChild ? {...node, premises: []} : node)}))
      .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: v.id, contextId: uChild.context.contextId});
    expect(forkSemanticCandidate(repaired, {key: 'suffix-inherited-payload', active: repaired.members,
      endpoint: helpers[1]!, additions: [particles[1]!]}))
      .toMatchObject({kind: 'candidate-rejected', code: 'identity', component: particles[1]!.id});
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
