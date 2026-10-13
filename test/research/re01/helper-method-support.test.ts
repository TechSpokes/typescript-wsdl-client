import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {checkSubstitution, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:helper-methods';
const typeId = (name: string) => globalId('type', {namespace, local: name});
const elementId = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
type Shape = 'identity' | 'extension' | 'restriction' | 'extension-restriction' | 'restriction-extension' | 'live-content';

async function subject(shape: Shape, names: readonly [string, string, string] = ['U', 'V', 'M'], consumedRoot = false) {
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
    content: node.id === r.id ? {kind: 'empty'} : {kind: 'element-only', particle: node.id === x.id ? x.content! : particle},
    abstract: false, final: [], block: [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: [a.id, b.id, r.id, x.id].includes(node.id) ? [node.id] : []}});
  const endpoint = {...x, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(b.id), facets: []}};
  const parent = request.candidate({key: shape, active: [...request.actual.members, ...additions.map(node => node.id)], additions, endpoint,
    rawTypes: [raw(a), raw(b), raw(r), raw(endpoint), ...(shape === 'identity' ? [] : [raw(u, helperParticle)]), ...(compound ? [raw(v)] : [])],
    rawElements: [{element: m.id, final: [], block: []}]});
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
  return {request, parent: parent.context, child: child?.kind === 'prepared' ? child.context : undefined, x, b, u, v, m, target, root, nested};
}

function members(context: SemanticContext, head: string) {
  const result = effectiveSubstitutionMembers(context, elementId(head));
  if (result.kind !== 'checked') throw new Error(JSON.stringify(result));
  return result.value;
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
});
