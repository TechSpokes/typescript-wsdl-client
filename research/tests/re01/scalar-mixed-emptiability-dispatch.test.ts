/** Aggregate mixed-base facts preserve scalar debts and the independent FULL frontier. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {checkOriginalGeneratedScalar} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveActualComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const namespace = 'urn:scalar:mixed-emptiability-dispatch', origin = 'https://mixed-emptiability.example', uri = origin + '/schema.xsd';
const id = (name: string) => globalId('type', {namespace, local: name}), eid = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
const generated = (name: string) => ({kind: 'original-generated' as const, owner: id(name)});
const maxWork = 125_000_000, mixedRule = 'simple-content-base-mixed-emptiable';
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);

async function setup(mode: 'empty' | 'nonempty' | 'nonmixed' = 'empty') {
  let source = await readFile(path.resolve('test/conformance/fixtures/xsd/recovery/scalar-mixed-emptiability-dispatch.xsd'), 'utf8');
  if (mode === 'nonempty') source = source.replace('ref="t:head" minOccurs="0"', 'ref="t:head" minOccurs="1"');
  if (mode === 'nonmixed') source = source.replaceAll('mixed="true"', 'mixed="false"');
  const bytes = Buffer.from(source), loaded = await loadSemanticSchemaInput(uri, {policy: {allowedOrigins: [origin]},
    offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])});
  const prepared = prepareSourceSchemaRequest(loaded, {budget: createSemanticBudget({maxWork})}); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, before = JSON.stringify(request.graph);
  const get = (name: string): ComplexTypeNode => {const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;};
  const a = get('A'), d = get('D'), common = {context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const scalar = (name: string, active = false, omit = false) => {
    const node: SimpleTypeNode = {...common, kind: 'simpleType', id: id(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
      variety: {kind: 'restriction', base: builtin(active ? 'QName' : 'anySimpleType'), facets: []}};
    const row: RawSimpleTypeProperties = {type: node.id, targetNamespace: namespace, final: [],
      base: active ? builtin('QName') : generated('Sigma'), variety: active ? {kind: 'atomic'} : {kind: 'union', members: [builtin('QName'), builtin('boolean')]},
      facetComponentSet: active ? [{annotation: 'absent', facets: [{name: 'enumeration', fixed: false, lexical: {value: 'true', context: a.context},
        operand: {context: 'active', type: local(id('Tau')), owner: a.id}}]}] : omit ? [] : [{baseComponent: 0}],
      provenance: {kind: 'hypothetical-abstract', originals: []}};
    return {node, row};
  };
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace, abstract: false, final: [], block: [], attributeUses: [],
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')}, content: {kind: 'empty'},
    provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('B')), facets: []}};
  const build = (key: string, active = false, helper = false, omit = false) => {
    const s = scalar('Selected', active, omit), x: ComplexTypeNode = {...common, kind: 'complexType', id: id('X'),
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'X'}}, abstract: false, mixed: false, attributes: [],
      derivation: {kind: 'extension', contentKind: 'complex', base: local(id('B')), facets: []}};
    const member: ElementNode = {...common, kind: 'element', id: eid('member'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'member'}},
      name: {namespace, local: 'member'}, type: local(x.id), substitutionGroup: local(eid('head')), abstract: false, nillable: false};
    const additions: GraphNode[] = [s.node, ...(helper ? [x, member] : [])];
    const built = request.candidate({key, active: [...actual.members, ...additions.map(at => at.id)], additions, endpoint,
      rawSimpleTypes: [s.row], rawElements: helper ? [{element: member.id, type: member.type, final: [], block: []}] : [],
      rawTypes: [...[a, get('B'), get('R'), endpoint].map(raw), ...(helper ? [raw(x)] : [])]}); assert.equal(built.kind, 'prepared');
    const node: FiniteRe01EvidenceNode = {id: key, parent: actual, context: built.context, target: d.id, intermediate: id('B'), ancestor: local(a.id), premises: []};
    return {context: built.context, node, s, x, raw};
  };
  const verify = (node: FiniteRe01EvidenceNode, others: readonly FiniteRe01EvidenceNode[] = []) =>
    verifyFiniteRe01Evidence(actual, d.id, {root: node.id, nodes: [node, ...others]});
  const finish = () => {assert.equal(JSON.stringify(request.graph), before); assert.ok(actual.budget.usage().work < maxWork);};
  return {request, actual, a, d, get, build, verify, finish};
}

it('discharges inherited and generated actual debts without importing current FULL(Z)', async () => {
  const s = await setup(), inherited = checkComponentConstruction(s.actual, id('Sigma')); assert.equal(inherited.kind, 'checked');
  assert.ok(inherited.obligations.some(at => at.rule === mixedRule && at.component === id('Z') && at.contextId === s.actual.contextId));
  const slot = checkOriginalGeneratedScalar(s.actual, generated('Sigma')); assert.equal(slot.kind, 'checked');
  assert.ok(slot.obligations.some(at => at.rule === mixedRule));
  const p = s.build('generated'), result = s.verify(p.node); assert.equal(result.kind, 'checked-candidate', json(result));
  assert.equal(result.proof.length, 1); assert.ok(result.actualScalarSlots.some(at => at.slot.owner === id('Sigma')));
  assert.equal(result.proof[0].components.some(at => at.component === id('Z')), false, 'A property fact must not schedule FULL(Z) in H');
  assert.ok(result.proof[0].components.some(at => at.component === p.s.node.id), 'The fresh scalar remains a real FULL root');
  const after = checkOriginalGeneratedScalar(s.actual, generated('Sigma')); assert.equal(after.kind, 'checked');
  assert.deepEqual(after.obligations, slot.obligations, 'Aggregate discharge must not erase scalar-owner debts');
  s.finish();
});

it('rejects a nonempty mixed base after a warm true fact for the same canonical Z', async () => {
  const good = await setup(), p = good.build('warm'); assert.equal(good.verify(p.node).kind, 'checked-candidate');
  assert.equal(good.verify(p.node).kind, 'checked-candidate');
  const bad = await setup('nonempty'), q = bad.build('nonempty');
  const mapped = deriveActualComplexContent(bad.actual, id('Z')); assert.equal(mapped.kind, 'checked');
  const view = prepareSemanticParticleView(bad.actual, mapped.view, 'restriction'); assert.equal(view.kind, 'checked'); assert.equal(view.view.root.summary.schemaEmptiable, false);
  const direct = checkComponentConstruction(bad.actual, id('Tau')); assert.equal(direct.kind, 'invalid-schema'); assert.equal(direct.rule, 'derivation-ok-restriction.5');
  const result = bad.verify(q.node); assert.equal(result.kind, 'invalid-schema', json(result)); assert.equal(result.rule, direct.rule); assert.equal(result.component, id('Tau'));
  good.finish(); bad.finish();
});

it('preserves wrong-variety SOURCE formation failure', async () => {
  const s = await setup('nonmixed'), p = s.build('nonmixed'), result = s.verify(p.node);
  assert.equal(result.kind, 'invalid-schema', json(result)); assert.equal(result.rule, 'simple-content-base'); s.finish();
});

it('keeps the Gamma-qualified debt distinct from H type support and a real child', async () => {
  const s = await setup(), p = s.build('current', true, true);
  const current = checkComponentConstruction(p.context, p.s.node.id); assert.equal(current.kind, 'checked', json(current));
  assert.ok(current.obligations.some(at => at.rule === mixedRule && at.component === id('Z') && at.contextId === s.actual.contextId));
  assert.equal(current.obligations.some(at => at.rule === mixedRule && at.contextId === p.context.contextId), false, 'SOURCE authority keeps its actual originating context');
  assert.ok(current.typeDependencies.some(at => at.contextId === p.context.contextId && at.type.kind === 'original-generated' && at.type.owner === id('Tau')));
  const missing = s.verify(p.node); assert.equal(missing.kind, 'unresolved', json(missing)); assert.equal(missing.rule, 'missing-nested-evidence'); assert.equal(missing.component, p.x.id);
  const endpoint = {...p.x, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(id('B')), facets: []}};
  const built = forkSemanticCandidate(p.context, {key: 'X-child', active: p.context.members, endpoint, rawTypes: [p.raw(endpoint)]}); assert.equal(built.kind, 'prepared');
  const child: FiniteRe01EvidenceNode = {id: 'X-child', parent: p.context, context: built.context, target: p.x.id, intermediate: id('B'), ancestor: local(id('A')), premises: []};
  const result = s.verify({...p.node, premises: [child.id]}, [child]); assert.equal(result.kind, 'checked-candidate', json(result)); assert.equal(result.proof.length, 2); s.finish();
});

it('does not discharge an unrelated RAW facet containment failure', async () => {
  const s = await setup(), p = s.build('omit-pattern', false, false, true), result = s.verify(p.node);
  assert.equal(result.kind, 'unresolved', json(result)); assert.equal(result.rule, 'raw-simple-facet-restriction-validity'); assert.equal(result.component, p.s.node.id); s.finish();
});

it.each([false, true])('keeps exhaustion sticky with warm facts=%s', async warm => {
  const s = await setup(), p = s.build('budget');
  if (warm) {assert.equal(s.verify(p.node).kind, 'checked-candidate'); assert.equal(s.verify(p.node).kind, 'checked-candidate');}
  const failure = s.request.budget.guard(() => s.request.budget.chargeWork(maxWork)); assert.equal(failure?.kind, 'resource-limit');
  assert.equal(s.verify(p.node), s.request.budget.failure()); assert.equal(s.verify(p.node), s.request.budget.failure());
});
