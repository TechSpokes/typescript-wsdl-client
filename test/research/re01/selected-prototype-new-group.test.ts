/** Independent GROUP scope/TYPE/frontier expectations for the selected prototype issuer. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, GroupNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteProofStep, FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexContent, RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import {prepareSelectedPrototypes} from './selected-prototype-issuer.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:scoped-cover-hidden-full';
const local = (target: string): Reference => ({kind: 'local', target});
const tid = (name: string) => globalId('type', {namespace, local: name});

async function subject() {
  const loaded = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scoped-template-full-support.xsd'), {policy: {fileRoots: [fixtures]}});
  const source = prepareSourceSchemaRequest(loaded); assert.equal(source.kind, 'prepared');
  const {request} = source, actual = request.actual, before = JSON.stringify(request.graph);
  const get = (context: SemanticContext, id: string): GraphNode => {const found = context.lookup(id); assert.equal(found.kind, 'found'); return found.node;};
  const x = get(actual, tid('X')); assert.equal(x.kind, 'complexType');
  const carrier = get(actual, globalId('element', {namespace, local: 'qCarrier'})); assert.equal(carrier.kind, 'element');
  const resolved = actual.resolve(carrier.type); assert.equal(resolved.kind, 'found'); assert.equal(resolved.node.kind, 'complexType');
  const q = resolved.node, whole = deriveOriginalComplexParticle(actual, q.id); assert.equal(whole.kind, 'checked');
  const common = {context: x.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const complex = (slot: string, method: 'extension' | 'restriction', base: Reference): ComplexTypeNode => ({...common, kind: 'complexType',
    id: hypotheticalScopedId(x.id, slot, 'type'), identity: {kind: 'scoped', owner: x.id, path: slot, role: 'type'},
    mixed: false, abstract: false, attributes: [], derivation: {kind: method, contentKind: 'complex', base, facets: []}});
  const particle = (owner: string, slot: string, term: ParticleNode['term'], min = '1', max = '1'): ParticleNode => ({...common, kind: 'particle',
    id: hypotheticalScopedId(owner, slot, 'particle'), identity: {kind: 'scoped', owner, path: slot, role: 'particle'}, occurs: {min, max}, term});
  const row = (node: ComplexTypeNode, content?: RawComplexContent): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation!.kind, base: node.derivation!.base}, abstract: false, final: [], block: [], attributeUses: [],
    content: content ?? (node.content ? {kind: 'element-only', particle: node.content} : {kind: 'empty'}),
    provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
  const j0 = complex('/group-shadow/J', 'extension', local(x.id)), u0 = complex('/group-shadow/U', 'extension', local(j0.id));
  const groupName = {namespace, local: 'NewSectionGroup'}, gid = globalId('group', groupName);
  const declaration: ElementNode = {...common, kind: 'element', id: hypotheticalScopedId(gid, '/x', 'element'),
    identity: {kind: 'scoped', owner: gid, path: '/x', role: 'element'}, name: {namespace: '', local: 'x'},
    type: local(u0.id), abstract: false, nillable: false};
  const leaf = particle(gid, '/x-use', {kind: 'element', declaration: local(declaration.id)});
  const any = particle(gid, '/any', {kind: 'any', wildcard: {namespace: {value: namespace, context: x.context}, processContents: 'skip'}});
  const groupBody = particle(gid, '/content', {kind: 'choice', children: [any.id, leaf.id]});
  const group: GroupNode = {...common, kind: 'group', id: gid, identity: {kind: 'global', role: 'group', name: groupName}, content: groupBody.id};
  const use = particle(x.id, '/group-shadow/body', {kind: 'group', reference: local(gid)}, '0', 'unbounded');
  const j = {...j0, content: use.id}, u = {...u0, content: use.id};
  const originals = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const mapped = deriveActualComplexContent(actual, node.id); assert.equal(mapped.kind, 'checked');
    if (!('particle' in mapped.view.content)) return [row(node, mapped.view.content)];
    const original = deriveOriginalComplexParticle(actual, node.id); assert.equal(original.kind, 'checked'); return [row(node, original.content)];
  });
  const endpoint: ComplexTypeNode = {...q, derivation: {kind: 'restriction', contentKind: 'complex', base: local(j.id), facets: []}};
  const additions: GraphNode[] = [j, u, group, declaration, leaf, any, groupBody, use];
  const donorDelta = {key: 'group-donor', endpoint, active: [...actual.members, ...additions.map(node => node.id)], additions,
    rawTypes: [...originals.filter(value => value.type !== q.id), row(endpoint, whole.content), row(j), row(u)],
    rawElements: [{element: declaration.id, type: declaration.type, final: [], block: []}]};
  const made = request.candidate(donorDelta); assert.equal(made.kind, 'prepared'); const donor = made.context;
  const section = new Map([[j.id, j.id], [u.id, u.id]]);
  const input = {parent: actual, donor, carrier: x.id, section};
  const issued = prepareSelectedPrototypes(input); assert.equal(issued.kind, 'prepared-prototypes', JSON.stringify(issued));
  const mappedJ = issued.typeMap.get(j.id)!, mappedU = issued.typeMap.get(u.id)!;
  const mappedEndpoint: ComplexTypeNode = {...q, derivation: {kind: 'restriction', contentKind: 'complex', base: local(mappedJ), facets: []}};
  const install = {key: 'group-reissued', ...issued.delta, endpoint: mappedEndpoint,
    active: [...actual.members, ...issued.delta.additions!.map(node => node.id)],
    rawTypes: [...originals.filter(value => value.type !== q.id), row(mappedEndpoint, whole.content), ...issued.delta.rawTypes!]};
  const installed = request.candidate(install); assert.equal(installed.kind, 'prepared'); const parent = installed.context;
  const mappedBody = issued.particleMap.get(use.id)!;
  const k = {...complex('/group-shadow/K', 'extension', local(x.id)), content: mappedBody};
  const currentU = get(parent, mappedU); assert.equal(currentU.kind, 'complexType');
  const retired: ComplexTypeNode = {...currentU, derivation: {kind: 'restriction', contentKind: 'complex', base: local(k.id), facets: []}};
  const child = forkSemanticCandidate(parent, {key: 'group-U-child', endpoint: retired,
    active: [...parent.members, k.id], additions: [k], rawTypes: [row(retired), row(k)]}); assert.equal(child.kind, 'prepared');
  const root: FiniteRe01EvidenceNode = {id: 'q', parent: actual, context: parent, target: q.id, intermediate: mappedJ, ancestor: local(x.id), premises: ['U']};
  const nodes: FiniteRe01EvidenceNode[] = [root, {id: 'U', parent, context: child.context, target: mappedU,
    intermediate: k.id, ancestor: local(x.id), premises: []}];
  return {request, actual, before, get, x, q, common, complex, particle, row, group, groupBody, declaration, use, donorDelta, donor,
    section, input, issued, mappedJ, mappedU, parent, child: child.context, install, nodes, root};
}

let s: Awaited<ReturnType<typeof subject>>;
beforeAll(async () => {s = await subject();});

describe('donor-new model GROUP reissue', () => {
  it('implements the previous concrete outside-frame case with one shared fresh GROUP and mapped TYPE', () => {
    const groups = s.issued.delta.additions!.filter(node => node.kind === 'group'); expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe(s.group.id); expect(groups[0]!.identity).toEqual(s.group.identity);
    expect(groups[0]!.content).toBe(s.issued.particleMap.get(s.groupBody.id));
    expect(groups[0]!.content).not.toBe(s.group.content);
    const copied = s.get(s.parent, s.issued.declarationMap.get(s.declaration.id)!); assert.equal(copied.kind, 'element');
    expect(copied.identity).toMatchObject({kind: 'scoped', owner: s.group.id});
    expect(copied.type).toEqual(local(s.mappedU)); expect(copied.type).not.toEqual(s.declaration.type);
    expect(s.parent.rawTypeProperties(s.mappedJ)?.content).toEqual(s.parent.rawTypeProperties(s.mappedU)?.content);
    expect(JSON.stringify(s.request.graph)).toBe(s.before);
  });

  it('checks every co-born GROUP/backing/TYPE root again in its real required child', () => {
    const forest = verifyFiniteRe01Evidence(s.actual, s.q.id, {root: 'q', nodes: s.nodes});
    assert.equal(forest.kind, 'checked-candidate', JSON.stringify(forest)); expect(forest.proof).toHaveLength(2);
    for (const context of [s.parent, s.child]) {
      const step: FiniteProofStep | undefined = forest.proof.find(value => value.contextId === context.contextId); assert.ok(step);
      for (const node of s.issued.delta.additions!) {
        expect(checkComponentConstruction(context, node.id)).toMatchObject({kind: 'checked', contextId: context.contextId});
        expect(step.components.some(value => value.component === node.id)).toBe(true);
      }
    }
    expect(verifyFiniteRe01Evidence(s.actual, s.q.id, {root: 'q', nodes: [{...s.root, premises: []}]}))
      .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.mappedU});
    expect(s.request.candidate({...s.install, key: 'missing-group',
      additions: s.install.additions!.filter(node => node.id !== s.group.id), active: s.install.active.filter(id => id !== s.group.id)}))
      .toMatchObject({kind: 'candidate-rejected', code: 'missing', component: s.group.id});
  });

  it('retains the actual GROUP scope barrier rather than reowning the copied LOCAL under its TYPE carrier', () => {
    const copied = s.get(s.parent, s.issued.declarationMap.get(s.declaration.id)!); assert.equal(copied.kind, 'element');
    const slot = '/scope-negative';
    const wrongScope: ElementNode = {...copied, id: hypotheticalScopedId(s.mappedJ, slot, 'element'),
      identity: {kind: 'scoped', owner: s.mappedJ, path: slot, role: 'element'}};
    const bad = s.request.candidate({...s.install, key: 'wrong-scope-control', additions: [...s.install.additions!, wrongScope],
      active: [...s.install.active, wrongScope.id], rawElements: [...s.install.rawElements!, {element: wrongScope.id, type: wrongScope.type, final: [], block: []}]});
    assert.equal(bad.kind, 'prepared');
    expect(compareComponentProperties(bad.context, s.get(bad.context, copied.id), s.get(bad.context, wrongScope.id)))
      .toMatchObject({kind: 'checked', value: false});
  });

  it('rejects a reserved GROUP identity and a nonunit model-group root before issuing them', () => {
    expect(prepareSelectedPrototypes({...s.input, reserved: [{id: s.group.id, identity: s.group.identity}]}))
      .toMatchObject({kind: 'outside-frame', rule: 'new-group-identity-reserved', component: s.group.id});
    const badRoot = {...s.groupBody, occurs: {min: '0', max: '1'}};
    const donor = s.request.candidate({...s.donorDelta, key: 'nonunit-group-donor',
      additions: s.donorDelta.additions.map(node => node.id === badRoot.id ? badRoot : node)}); assert.equal(donor.kind, 'prepared');
    expect(checkComponentConstruction(donor.context, s.group.id)).toMatchObject({kind: 'candidate-rejected', rule: 'src-group'});
    expect(prepareSelectedPrototypes({...s.input, donor: donor.context}))
      .toMatchObject({kind: 'outside-frame', rule: 'new-group-unit-compositor-required', component: s.group.id});
  });

  it('does not reissue a stored inactive GROUP as a genuinely new definition', () => {
    const empty = s.particle(s.group.id, '/stored-empty', {kind: 'sequence', children: []});
    const group: GroupNode = {...s.group, content: empty.id};
    const stored = s.request.candidate({key: 'stored-group', active: [...s.actual.members, group.id, empty.id], additions: [group, empty]});
    assert.equal(stored.kind, 'prepared');
    const hidden = forkSemanticCandidate(stored.context, {key: 'hidden-group', active: s.actual.members}); assert.equal(hidden.kind, 'prepared');
    expect(hidden.context.lookup(group.id).kind).toBe('outside-context');
    expect(prepareSelectedPrototypes({...s.input, parent: hidden.context}))
      .toMatchObject({kind: 'outside-frame', rule: 'new-group-first-birth-required', component: group.id});
  });

  it('keeps an existing SOURCE GROUP exact instead of copying or retargeting its declaration program', async () => {
    const loaded = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/source-group-self-empty.xsd'), {policy: {fileRoots: [fixtures]}});
    const made = prepareSourceSchemaRequest(loaded); assert.equal(made.kind, 'prepared');
    const actual = made.request.actual, namespace = 'urn:re01:group-self';
    const base = actual.lookup(globalId('type', {namespace, local: 'A'})); assert.equal(base.kind, 'found'); assert.equal(base.node.kind, 'complexType');
    const group = actual.lookup(globalId('group', {namespace, local: 'G'})); assert.equal(group.kind, 'found'); assert.equal(group.node.kind, 'group');
    const v: ComplexTypeNode = {...base.node, id: hypotheticalScopedId(base.node.id, '/fixed-group-copy', 'type'),
      identity: {kind: 'scoped', owner: base.node.id, path: '/fixed-group-copy', role: 'type'},
      derivation: {kind: 'extension', contentKind: 'complex', base: local(base.node.id), facets: []}};
    const use: ParticleNode = {...s.use, context: base.node.context, id: hypotheticalScopedId(v.id, '/use', 'particle'),
      identity: {kind: 'scoped', owner: v.id, path: '/use', role: 'particle'}, term: {kind: 'group', reference: local(group.node.id)}};
    const node = {...v, content: use.id};
    const donor = made.request.candidate({key: 'fixed-source-group', active: [...actual.members, node.id, use.id], additions: [node, use],
      rawTypes: [{...s.row(node), targetNamespace: namespace}]}); assert.equal(donor.kind, 'prepared');
    const issued = prepareSelectedPrototypes({parent: actual, donor: donor.context, carrier: base.node.id, section: new Map([[node.id, node.id]])});
    assert.equal(issued.kind, 'prepared-prototypes');
    expect(issued.delta.additions!.some(value => value.kind === 'group')).toBe(false);
    expect(issued.declarationMap.size).toBe(0); expect(issued.requiredExternal).toContain(group.node.id);
  });
});
