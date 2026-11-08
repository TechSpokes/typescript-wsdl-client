/** Native checks for explicit nominal deltas, without a search or action-lifting claim. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, GraphNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {hypotheticalScopedId, semanticIdentityTuple} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {declarationMethods, effectiveSubstitutionMembers, checkSubstitution} from '../../../src/compiler/schemaTypeRelations.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexContent, RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import {prepareCanonicalNominalBank} from './canonical-nominal-bank.js';
import type {CanonicalBankInput, NominalBankRole, PreparedNominalBank} from './canonical-nominal-bank.js';

const fixtures = path.resolve('test/conformance/fixtures');
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
const ref = (role: string) => ({role});
const anchor = {anchor: true} as const;
const role = (name: string, method: 'extension' | 'restriction', base: NominalBankRole['base'],
  block: NominalBankRole['block'] = [], named = true): NominalBankRole => ({role: name, method, base, block, named});
const get = (context: SemanticContext, id: string): GraphNode => {
  const found = context.lookup(id); assert.equal(found.kind, 'found'); return found.node;
};

async function source(file: string, namespace: string) {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery', file), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, graphBefore = JSON.stringify(request.graph);
  const tid = (name: string) => globalId('type', {namespace, local: name});
  const eid = (name: string) => globalId('element', {namespace, local: name});
  const type = (name: string): ComplexTypeNode => {const node = get(actual, tid(name)); assert.equal(node.kind, 'complexType'); return node;};
  const rows = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const mapped = deriveActualComplexContent(actual, node.id); assert.equal(mapped.kind, 'checked');
    let content: RawComplexContent = mapped.view.content;
    if ('particle' in content) {const whole = deriveOriginalComplexParticle(actual, node.id); assert.equal(whole.kind, 'checked'); content = whole.content;}
    const attributes = assessSourceAttributeUses(actual, node.id); assert.equal(attributes.kind, 'checked');
    const row: RawComplexTypeProperties = {type: node.id, targetNamespace: namespace,
      derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
      abstract: node.abstract, final: declarationMethods(actual, node, 'final') as RawComplexTypeProperties['final'],
      block: declarationMethods(actual, node, 'block') as RawComplexTypeProperties['block'], content,
      attributeUses: attributes.value.uses.map(use => use.id), ...(attributes.value.wildcard ? {wildcard: attributes.value.wildcard} : {}),
      provenance: {kind: 'hypothetical-abstract', originals: [node.id]}};
    return [row];
  });
  const row = (name: string) => {const found = rows.find(value => value.type === tid(name)); assert.ok(found); return found;};
  const port = (name: string, typeRole: string, head: string) => ({name: {namespace, local: name}, type: ref(typeRole), head: eid(head)});
  return {request, actual, graphBefore, namespace, tid, eid, type, rows, row, port};
}
type Source = Awaited<ReturnType<typeof source>>;

function install(s: Source, bank: PreparedNominalBank, extra?: Readonly<{node: ComplexTypeNode; row: RawComplexTypeProperties}>) {
  const d = s.type('D'), a = s.type('A'), middle = extra?.node.id ?? s.tid('B');
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(middle), facets: []}};
  const additions = [...bank.delta.additions!, ...(extra ? [extra.node] : [])];
  const built = s.request.candidate({key: 'bank-opening', ...bank.delta, endpoint,
    additions, active: [...s.actual.members, ...additions.map(node => node.id)],
    rawTypes: [...s.rows.filter(row => row.type !== d.id), ...bank.delta.rawTypes!, ...(extra ? [extra.row] : []),
      {...s.row('D'), derivation: {method: 'restriction', base: local(middle)}}]});
  assert.equal(built.kind, 'prepared', JSON.stringify(built));
  const recipe = bank.children.get('f'); assert.ok(recipe);
  const child = forkSemanticCandidate(built.context, {key: 'bank-f-child', ...recipe.delta,
    active: [...built.context.members, ...recipe.delta.additions!.map(node => node.id)]});
  assert.equal(child.kind, 'prepared', JSON.stringify(child));
  const root: FiniteRe01EvidenceNode = {id: 'D', parent: s.actual, context: built.context, target: d.id,
    intermediate: middle, ancestor: local(a.id), premises: ['f']};
  const proof = verifyFiniteRe01Evidence(s.actual, d.id, {root: 'D', nodes: [root,
    {id: 'f', parent: built.context, context: child.context, target: recipe.target,
      intermediate: recipe.intermediate, ancestor: recipe.ancestor, premises: []}]});
  const missing = verifyFiniteRe01Evidence(s.actual, d.id, {root: 'D', nodes: [{...root, premises: []}]});
  return {opening: built.context, child: child.context, recipe, proof, missing};
}
function complete(s: Source, bank: PreparedNominalBank, installed: ReturnType<typeof install>) {
  expect(installed.proof, JSON.stringify(installed.proof, (_key, value: unknown) => typeof value === 'bigint' ? String(value) : value))
    .toMatchObject({kind: 'checked-candidate'});
  assert.equal(installed.proof.kind, 'checked-candidate'); expect(installed.proof.proof).toHaveLength(2);
  expect(installed.missing).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence'});
  for (const context of [installed.opening, installed.child]) {
    for (const node of bank.delta.additions!) expect(checkComponentConstruction(context, node.id).kind).toBe('checked');
  }
  expect(JSON.stringify(s.request.graph)).toBe(s.graphBefore);
}
function members(context: SemanticContext, head: string) {
  const result = effectiveSubstitutionMembers(context, head); assert.equal(result.kind, 'checked'); return result.value;
}

let proper: Source, aur: Source;
beforeAll(async () => {
  proper = await source('fresh-target-flattening.xsd', 'urn:re01:fresh-target-flattening');
  aur = await source('free-ur-common-mixed-payload.xsd', 'urn:re01:free-ur-common-mixed-payload');
});

describe('canonical ordinary nominal bank producer', () => {
  it('preserves shared starts and branching, and discharges a real proper-B child through an abstract final shield', () => {
    const bank = prepareCanonicalNominalBank({parent: proper.actual, carrier: proper.tid('D'), mode: 'proper-b', anchor: proper.tid('B'),
      roles: [role('f', 'extension', anchor, ['extension']), role('r', 'restriction', ref('f'), [], false), role('s', 'restriction', ref('f'))],
      globals: [proper.port('m1', 'f', 'H'), proper.port('m2', 'f', 'H'), proper.port('mr', 'r', 'H')]});
    assert.equal(bank.kind, 'prepared-nominal-bank', JSON.stringify(bank));
    const installed = install(proper, bank); complete(proper, bank, installed);
    expect(installed.recipe.intermediate).toBe(proper.tid('B')); expect(installed.recipe.delta.additions).toEqual([]);
    expect([...bank.children.keys()]).toEqual(['f']);
    for (const name of ['r', 's']) expect(installed.opening.rawTypeProperties(bank.roles.get(name)!)?.derivation.base).toEqual(local(bank.roles.get('f')!));
    const first = get(installed.opening, bank.globals[0]!), second = get(installed.opening, bank.globals[1]!);
    assert.equal(first.kind, 'element'); assert.equal(second.kind, 'element');
    expect(first.type).toEqual(second.type); expect(first.type).toEqual(local(bank.roles.get('f')!));
    expect(members(installed.opening, proper.eid('H'))).toEqual(expect.arrayContaining(bank.globals.slice(0, 2)));
    expect(members(installed.child, proper.eid('H'))).not.toContain(first.id);
    expect(members(installed.opening, proper.eid('H'))).not.toContain(bank.globals[2]);
    assert.equal(first.substitutionGroup?.kind, 'local');
    const bridge = get(installed.opening, first.substitutionGroup.target); assert.equal(bridge.kind, 'element');
    expect(checkSubstitution(installed.child, first.id, bridge.id, {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
    expect(checkSubstitution(installed.child, bridge.id, proper.eid('H'), {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
    expect(bridge.abstract).toBe(true); expect(bridge.type).toEqual(local(proper.tid('B')));
    expect(installed.child.rawElementProperties(bridge.id)?.final).toEqual([]);
    const r = get(installed.opening, bank.roles.get('r')!); expect(r.identity.kind).toBe('scoped');
    expect(bank.requiredExternal).toEqual(expect.arrayContaining([proper.tid('D'), proper.tid('B'), proper.tid('A'), proper.eid('H')]));
  });

  it('emits a named inactive AUR middle and distinguishes the excluded starting block from an entered block', () => {
    const bank = prepareCanonicalNominalBank({parent: aur.actual, carrier: aur.tid('D'), mode: 'aur-free', anchor: aur.tid('A'),
      roles: [role('s', 'restriction', anchor), role('f', 'extension', ref('s'), ['extension']),
        role('r', 'restriction', ref('f'), [], false), role('p', 'extension', anchor, ['extension'])],
      globals: [aur.port('mf1', 'f', 'h'), aur.port('mf2', 'f', 'h'), aur.port('mr', 'r', 'h'), aur.port('mp', 'p', 'h')]});
    assert.equal(bank.kind, 'prepared-nominal-bank', JSON.stringify(bank));
    const installed = install(aur, bank); complete(aur, bank, installed);
    expect([...bank.children.keys()]).toEqual(['f']);
    expect(members(installed.opening, aur.eid('h'))).toEqual(expect.arrayContaining([bank.globals[0], bank.globals[1], bank.globals[3]]));
    expect(members(installed.opening, aur.eid('h'))).not.toContain(bank.globals[2]);
    for (const id of bank.globals.slice(0, 3)) expect(members(installed.child, aur.eid('h'))).not.toContain(id);
    expect(members(installed.child, aur.eid('h'))).toContain(bank.globals[3]);
    const q = get(installed.child, installed.recipe.intermediate); assert.equal(q.kind, 'complexType');
    expect(q.identity.kind).toBe('global');
    expect(installed.child.rawTypeProperties(q.id)).toMatchObject({derivation: {method: 'extension', base: local(aur.tid('A'))}, block: ['extension'], final: []});
    expect(checkComponentConstruction(installed.child, q.id)).toMatchObject({kind: 'checked', obligations: [], re01: {primitive: true}});
    expect(installed.child.rawTypeProperties(bank.roles.get('f')!)?.content).toEqual(installed.child.rawTypeProperties(q.id)?.content);
  });

  it('retains authentic SOURCE WHOLE and effective AU/AW through a complete particle-bearing forest', async () => {
    const s = await source('finite-particle-independent.xsd', 'urn:recovery:finite-particle');
    const bank = prepareCanonicalNominalBank({parent: s.actual, carrier: s.tid('D'), mode: 'proper-b', anchor: s.tid('B'),
      roles: [role('f', 'extension', anchor)], globals: []}); assert.equal(bank.kind, 'prepared-nominal-bank');
    const d = s.type('D'), id = hypotheticalScopedId(s.tid('A'), '/root-middle', 'type');
    const k: ComplexTypeNode = {...d, id, identity: {kind: 'scoped', owner: s.tid('A'), path: '/root-middle', role: 'type'},
      derivation: {kind: 'extension', contentKind: 'complex', base: local(s.tid('A')), facets: []}};
    const kRow: RawComplexTypeProperties = {...s.row('D'), type: id, derivation: {method: 'extension', base: local(s.tid('A'))},
      provenance: {kind: 'hypothetical-abstract', originals: []}};
    const installed = install(s, bank, {node: k, row: kRow}); complete(s, bank, installed);
    const actualWhole = deriveOriginalComplexParticle(s.actual, s.tid('B')); assert.equal(actualWhole.kind, 'checked');
    for (const context of [installed.opening, installed.child]) {
      const row: RawComplexTypeProperties = context.rawTypeProperties(bank.roles.get('f')!)!;
      assert.ok('particle' in row.content); expect(row.content.original).toBe(actualWhole.content.original);
      expect(row.content.particle).toBe(actualWhole.content.particle);
      expect(row.attributeUses).toEqual(s.row('B').attributeUses); expect(row.wildcard).toEqual(s.row('B').wildcard);
      expect(row.attributeUses).toHaveLength(1); expect(row.wildcard?.processContents).toBe('lax');
      const content = deriveRawComplexContent(context, bank.roles.get('f')!); assert.equal(content.kind, 'checked');
      for (const synthetic of content.view.synthetic) expect(context.members).not.toContain(synthetic);
    }
    expect(bank.delta.additions).toHaveLength(1);
  });

  it('reserves provided GLOBAL names, inactive stored identities and all child identities coherently', () => {
    const reservedName = {namespace: proper.namespace, local: 're01Bank0'};
    const scoped = hypotheticalScopedId(proper.tid('D'), '/$hypothetical/0', 'type');
    const reserved: ComplexTypeNode = {...proper.type('A'), id: scoped,
      identity: {kind: 'scoped', owner: proper.tid('D'), path: '/$hypothetical/0', role: 'type'}};
    const visible = proper.request.candidate({key: 'reserve-type', active: [...proper.actual.members, reserved.id], additions: [reserved]});
    assert.equal(visible.kind, 'prepared');
    const hidden = forkSemanticCandidate(visible.context, {key: 'hide-reserved', active: proper.actual.members}); assert.equal(hidden.kind, 'prepared');
    const input: CanonicalBankInput = {parent: hidden.context, carrier: proper.tid('D'), mode: 'proper-b', anchor: proper.tid('B'),
      roles: [role('f', 'extension', anchor, [], false)], globals: [{name: reservedName, type: ref('f'), head: proper.eid('H')}],
      reserved: [{id: globalId('type', reservedName), identity: {kind: 'global', role: 'type', name: reservedName}}]};
    const bank = prepareCanonicalNominalBank(input); assert.equal(bank.kind, 'prepared-nominal-bank');
    expect(bank.roles.get('f')).not.toBe(scoped);
    expect(bank.globals).toEqual([globalId('element', reservedName)]);
    expect(new Set(bank.delta.additions!.map(node => semanticIdentityTuple(node.identity))).size).toBe(bank.delta.additions!.length);
    const next = prepareCanonicalNominalBank({...input, reserved: [...input.reserved!, ...bank.delta.additions!]});
    expect(next).toMatchObject({kind: 'outside-frame', rule: 'fresh-qname-occupied'});
  });

  it('returns actionable outside-frame results for unsupported anchors, cyclic roles and occupied QNames', () => {
    const input: CanonicalBankInput = {parent: proper.actual, carrier: proper.tid('D'), mode: 'proper-b', anchor: proper.tid('B'), roles: [], globals: []};
    expect(prepareCanonicalNominalBank({...input, mode: 'aur-free'})).toMatchObject({kind: 'outside-frame', rule: 'designated-height-one-anchor-required'});
    expect(prepareCanonicalNominalBank({...input, anchor: proper.tid('A')})).toMatchObject({kind: 'outside-frame', rule: 'proper-primitive-anchor-required'});
    expect(prepareCanonicalNominalBank({...input, carrier: 'missing'})).toMatchObject({kind: 'outside-frame', rule: 'component-unavailable'});
    expect(prepareCanonicalNominalBank({...input, roles: [role('f', 'extension', ref('f'))]})).toMatchObject({kind: 'outside-frame', rule: 'cyclic-role-base'});
    expect(prepareCanonicalNominalBank({...input, roles: [role('f', 'extension', ref('absent'))]})).toMatchObject({kind: 'outside-frame', rule: 'unknown-type-role'});
    expect(prepareCanonicalNominalBank({...input, globals: [{name: {namespace: proper.namespace, local: 'H'}, type: anchor, head: proper.eid('H')}]}))
      .toMatchObject({kind: 'outside-frame', rule: 'fresh-qname-occupied'});
  });

  it('rejects an available SOURCE anchor whose current component row rewrites its authentic content', async () => {
    const s = await source('finite-particle-independent.xsd', 'urn:recovery:finite-particle');
    const changed = s.request.candidate({key: 'anchor-content-rewrite', active: s.actual.members,
      rawTypes: [{...s.row('B'), content: {kind: 'empty'}}]}); assert.equal(changed.kind, 'prepared');
    expect(prepareCanonicalNominalBank({parent: changed.context, carrier: s.tid('D'), mode: 'proper-b', anchor: s.tid('B'), roles: [], globals: []}))
      .toMatchObject({kind: 'outside-frame', rule: 'source-anchor-property-rewrite'});
    const changedA = s.request.candidate({key: 'designated-anchor-rewrite', active: s.actual.members,
      rawTypes: [{...s.row('A'), final: ['extension']}]}); assert.equal(changedA.kind, 'prepared');
    expect(prepareCanonicalNominalBank({parent: changedA.context, carrier: s.tid('D'), mode: 'proper-b', anchor: s.tid('B'), roles: [], globals: []}))
      .toMatchObject({kind: 'outside-frame', rule: 'designated-anchor-property-rewrite'});
  });

  it('returns the native resource limit without manufacturing an outside-frame result', async () => {
    const s = await source('fresh-target-flattening.xsd', 'urn:re01:fresh-target-flattening');
    const failure = s.actual.budget.guard(() => s.actual.budget.chargeWork(Number.MAX_SAFE_INTEGER));
    expect(failure).toMatchObject({kind: 'resource-limit'});
    expect(prepareCanonicalNominalBank({parent: s.actual, carrier: s.tid('D'), mode: 'proper-b', anchor: s.tid('B'), roles: [], globals: []})).toBe(failure);
  });
});
