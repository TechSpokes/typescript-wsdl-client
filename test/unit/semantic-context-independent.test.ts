import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, GraphNode, Reference} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import type {ResolvedGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {createSemanticCatalog, readCatalog, serializeSemanticCatalog} from '../../src/compiler/semanticCatalog.js';
import {artifactGraph, semanticGraphFingerprint} from '../../src/compiler/catalogProvenance.js';
import {assertSemanticContext, forkSemanticCandidate, prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import type {SemanticContext, SemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';

// Expected behavior was published independently before subject implementation:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/267#issuecomment-6111675363
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:re01:independent-affiliation';
const named = (role: 'type' | 'element', local: string) => globalId(role, {namespace, local});
const endpointId = named('type', 'D');
const headId = named('element', 'H');
const memberId = named('element', 'M');
const diagnosticWork = 100_000_000;

async function load(file = 'xsd/re01/affiliation-actual.xsd'): Promise<ResolvedGraph> {
  const input = await loadSchemaInput(path.join(fixtures, file), {policy: {fileRoots: [fixtures]}});
  return resolveCanonicalGraph(buildCanonicalGraph(input));
}

function prepare(resolved: ResolvedGraph, maxWork = diagnosticWork): SemanticRequest {
  const result = prepareSemanticRequest(resolved, {budget: createSemanticBudget({maxWork})});
  if (result.kind !== 'prepared') throw new Error(`Expected structural preparation, got ${result.kind}`);
  return result.request;
}

function node(context: SemanticContext, id: string): GraphNode {
  const result = context.lookup(id);
  if (result.kind !== 'found') throw new Error(`Expected member ${id}, got ${result.kind}`);
  return result.node;
}

function endpoint(request: SemanticRequest): ComplexTypeNode {
  const result = node(request.actual, endpointId);
  if (result.kind !== 'complexType') throw new Error('Expected complex endpoint');
  return result;
}

describe('independently specified semantic context boundary', () => {
  it('forks a fresh endpoint while preserving parent properties, original evidence and request budget', async () => {
    const request = prepare(await load());
    const a = node(request.actual, named('type', 'A'));
    if (a.kind !== 'complexType') throw new Error('Expected empty actual A');
    const identity = {kind: 'global', role: 'type', name: {namespace, local: 'FreshE'}} as const;
    const e: ComplexTypeNode = {...a, id: named('type', 'FreshE'), identity};
    const raw = (id: string): RawComplexTypeProperties => ({type: id, derivation: {method: 'restriction',
      base: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}},
    abstract: false, final: [], block: [], content: {kind: 'empty'}, attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: [a.id]}});
    const parent = request.candidate({key: 'parent', active: [...request.actual.members, e.id], additions: [e], rawTypes: [raw(a.id), raw(e.id)]});
    if (parent.kind !== 'prepared') throw new Error('Expected full helper context');
    const usage = request.budget.usage().work;
    const child = forkSemanticCandidate(parent.context, {key: 'child', active: parent.context.members,
      endpoint: {...e, abstract: true}, rawTypes: [{...raw(e.id), abstract: true}]});
    if (child.kind !== 'prepared') throw new Error('Expected helper endpoint fork');
    expect(child.context.budget).toBe(request.budget);
    expect(request.budget.usage().work).toBeGreaterThan(usage);
    expect(child.context.membership).toBe('complete-actual-plus-additions');
    expect(child.context.members).toEqual(parent.context.members);
    expect(node(parent.context, e.id)).toMatchObject({abstract: false});
    expect(node(child.context, e.id)).toMatchObject({abstract: true});
    expect(child.context.rawTypeProperties(a.id)).toBe(parent.context.rawTypeProperties(a.id));
    expect(parent.context.rawTypeProperties(e.id)).toMatchObject({abstract: false});
    expect(child.context.rawTypeProperties(e.id)).toMatchObject({abstract: true});
    expect(child.context.sourceNode(e.id)).toBeUndefined();
    expect(child.context.sourceNode(endpointId)).toEqual(endpoint(request));
    expect(forkSemanticCandidate(parent.context, {key: 'unrelated-raw-rewrite', active: parent.context.members,
      endpoint: {...e, abstract: true}, rawTypes: [{...raw(a.id), abstract: true}]})).toMatchObject({kind: 'candidate-rejected', code: 'endpoint'});
    expect(() => forkSemanticCandidate({...parent.context}, {key: 'forged', active: parent.context.members})).toThrow(/Unauthenticated/);
    request.budget.guard(() => request.budget.chargeWork(diagnosticWork));
    expect(forkSemanticCandidate(child.context, {key: 'exhausted-child', active: child.context.members})).toBe(request.budget.failure());
  });

  it('does not promote a forked subset or free an inactive ancestor helper identity', async () => {
    const request = prepare(await load());
    const subset = request.candidate({key: 'subset-parent', active: request.actual.members.filter(id => id !== memberId)});
    if (subset.kind !== 'prepared') throw new Error('Expected structural subset');
    const child = forkSemanticCandidate(subset.context, {key: 'subset-child', active: subset.context.members});
    if (child.kind !== 'prepared') throw new Error('Expected lower structural fork');
    expect(child.context.membership).toBe('structural-subset');
    expect(child.context.sourceNode(memberId)).toMatchObject({id: memberId});
    const a = node(request.actual, named('type', 'A'));
    if (a.kind !== 'complexType') throw new Error('Expected empty actual A');
    const e: ComplexTypeNode = {...a, id: named('type', 'Dormant'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'Dormant'}}};
    const withHelper = request.candidate({key: 'helper-parent', active: [...request.actual.members, e.id], additions: [e]});
    if (withHelper.kind !== 'prepared') throw new Error('Expected helper context');
    const omitted = forkSemanticCandidate(withHelper.context, {key: 'helper-inactive', active: request.actual.members});
    if (omitted.kind !== 'prepared') throw new Error('Expected historical structural omission');
    expect(omitted.context.membership).toBe('structural-subset');
    expect(forkSemanticCandidate(omitted.context, {key: 'collision', active: [...request.actual.members, e.id], additions: [e]}))
      .toMatchObject({kind: 'candidate-rejected', code: 'identity', component: e.id});
  });

  it('keeps original evidence while candidate active affiliations and endpoint references differ', async () => {
    const request = prepare(await load());
    const original = endpoint(request);
    const first = request.candidate({key: 'same-key', active: request.actual.members, endpoint: {...original, mixed: true}});
    const second = request.candidate({key: 'same-key', active: request.actual.members.filter(id => id !== memberId), endpoint: {...original, mixed: false}});
    expect(first.kind).toBe('prepared');
    expect(second.kind).toBe('prepared');
    if (first.kind !== 'prepared' || second.kind !== 'prepared') throw new Error('Expected candidates');
    expect(first.context.acceptance).toBe('structural-only');
    expect(first.context.contextId).not.toBe(second.context.contextId);
    expect(request.actual.incomingAffiliates(headId)).toEqual([memberId]);
    expect(first.context.incomingAffiliates(headId)).toEqual([memberId]);
    expect(second.context.incomingAffiliates(headId)).toEqual([]);
    expect(second.context.lookup(memberId)).toEqual({kind: 'outside-context', id: memberId});
    expect(() => second.context.references(memberId)).toThrowError(expect.objectContaining({code: 'outside-context'}));
    expect(() => second.context.owner(memberId)).toThrowError(expect.objectContaining({code: 'outside-context'}));
    expect(() => second.context.incomingAffiliates(memberId)).toThrowError(expect.objectContaining({code: 'outside-context'}));
    expect(second.context.sourceNode(memberId)).toMatchObject({id: memberId, kind: 'element'});
    const actualMember = node(request.actual, memberId);
    if (actualMember.kind !== 'element') throw new Error('Expected original member');
    expect(request.actual.resolve(actualMember.type)).toMatchObject({kind: 'found', node: {id: endpointId, mixed: false}});
    expect(first.context.resolve(actualMember.type)).toMatchObject({kind: 'found', node: {id: endpointId, mixed: true}});
    expect(second.context.resolve(actualMember.type)).toMatchObject({kind: 'found', node: {id: endpointId, mixed: false}});
    expect(first.context.sourceNode(endpointId)).toEqual(original);
  });

  it('rejects a missing declared target and collisions with inactive originals', async () => {
    const request = prepare(await load());
    expect(request.candidate({key: 'broken-closure', active: request.actual.members.filter(id => id !== named('type', 'B'))})).toMatchObject({kind: 'candidate-rejected', code: 'outside-context'});
    const member = node(request.actual, memberId);
    expect(request.candidate({key: 'collision', active: request.actual.members, additions: [member]})).toMatchObject({kind: 'candidate-rejected', code: 'identity', component: memberId});
    expect(request.candidate({key: 'inactive-collision', active: request.actual.members.filter(id => id !== memberId), additions: [member]})).toMatchObject({kind: 'candidate-rejected', code: 'identity', component: memberId});
  });

  it('snapshots caller data and rejects copied context handles', async () => {
    const input = structuredClone(await load());
    const request = prepare(input);
    const active = [...request.actual.members];
    const replacement = {...endpoint(request), mixed: true};
    const prepared = request.candidate({key: 'snapshot', active, endpoint: replacement});
    if (prepared.kind !== 'prepared') throw new Error('Expected candidate');
    replacement.mixed = false;
    active.length = 0;
    const originalSource = input.graph.nodes.find(n => n.id === endpointId)!;
    (originalSource as {mixed: boolean}).mixed = true;
    expect(node(request.actual, endpointId)).toMatchObject({mixed: false});
    expect(node(prepared.context, endpointId)).toMatchObject({mixed: true});
    expect(prepared.context.members).toContain(endpointId);
    expect(() => assertSemanticContext({...prepared.context})).toThrow(/Unauthenticated/);
    expect(() => assertSemanticContext({...request.actual, contextId: prepared.context.contextId})).toThrow(/Unauthenticated/);
    expect(() => assertSemanticContext(prepared.context)).not.toThrow();
    expect(Object.isFrozen(prepared.context.members)).toBe(true);
    expect(Object.isFrozen(node(prepared.context, endpointId))).toBe(true);
  });

  it('rejects accessor-backed request and candidate fields without invoking caller code', async () => {
    const input = await load();
    let invoked = false;
    const untrusted = {...input, get graph() {invoked = true; return input.graph;}};
    expect(prepareSemanticRequest(untrusted, {budget: createSemanticBudget({maxWork: diagnosticWork})})).toMatchObject({kind: 'input-error', code: 'representation'});
    expect(invoked).toBe(false);
    const request = prepare(input);
    for (const field of ['key', 'active', 'additions', 'endpoint']) {
      const data = {key: 'accessor', active: request.actual.members};
      Object.defineProperty(data, field, {enumerable: true, get() {invoked = true; return field === 'active' ? [] : undefined;}});
      expect(request.candidate(data)).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
      expect(invoked).toBe(false);
    }
    const unknown = {kind: 'local', get target() {invoked = true; return endpointId;}} as Reference;
    expect(() => request.actual.resolve(unknown)).toThrowError(expect.objectContaining({code: 'reference'}));
    expect(invoked).toBe(false);
  });

  it('preserves legal recursion, distinct shared-group positions and original QName environments', async () => {
    const request = prepare(await load('xsd/graph/shared-recursive-small.xsd'));
    const candidate = request.candidate({key: 'recursive', active: request.actual.members});
    if (candidate.kind !== 'prepared') throw new Error('Expected legal recursive context');
    const groupUses = request.graph.nodes.filter(n => n.kind === 'particle' && n.term.kind === 'group');
    expect(groupUses).toHaveLength(2);
    expect(groupUses[0].id).not.toBe(groupUses[1].id);
    expect(groupUses.map(n => n.kind === 'particle' ? n.occurs : undefined)).toEqual([{min: '0', max: '2'}, {min: '3', max: '4'}]);
    const qname = request.graph.nodes.find(n => n.kind === 'simpleType' && n.identity.kind === 'global' && n.identity.name.local === 'Names');
    if (qname?.kind !== 'simpleType' || qname.variety.kind !== 'restriction') throw new Error('Expected QName restriction');
    expect(qname.variety.facets[0].lexical.context.namespaces.q).toBe('urn:rebound');
    const shared = request.graph.nodes.find(n => n.kind === 'attribute' && n.name.local === 'Shared');
    if (shared?.kind !== 'attribute') throw new Error('Expected global attribute');
    expect(shared.value?.lexical.context.namespaces.q).toBe('urn:qname');
    expect(candidate.context.sourceNode(qname.id)).toEqual(qname);
    expect(candidate.context.members).toHaveLength(request.actual.members.length);
  });

  it('preserves source/catalog identities and chameleon namespace distinctions', async () => {
    const source = await load('xsd/graph/chameleon.wsdl');
    const catalog = readCatalog(serializeSemanticCatalog(createSemanticCatalog(source.graph)), {mode: 'faithful'});
    if (catalog.kind !== 'semantic') throw new Error('Expected format-2 catalog');
    const sourceRequest = prepare(source);
    const catalogRequest = prepare(resolveCanonicalGraph(catalog.catalog.graph));
    expect(sourceRequest.actual.members).toEqual(catalogRequest.actual.members);
    expect(artifactGraph(sourceRequest.graph)).toEqual(catalogRequest.graph);
    expect(semanticGraphFingerprint(sourceRequest.graph)).toBe(semanticGraphFingerprint(catalogRequest.graph));
    const shared = sourceRequest.graph.nodes.filter(n => n.identity.kind === 'global' && n.identity.name.local === 'Node');
    expect(shared).toHaveLength(2);
    expect(new Set(shared.map(n => n.context.effectiveNamespace)).size).toBe(2);
    expect(new Set(shared.map(n => n.id)).size).toBe(2);
  });

  it('uses one inclusive cumulative budget and remains exhausted after an earlier candidate succeeds', async () => {
    const input = await load();
    const sequence = (maxWork: number) => {
      const request = prepare(input, maxWork);
      const first = request.candidate({key: 'one', active: request.actual.members});
      const afterFirst = {...request.budget.usage()};
      const second = request.candidate({key: 'two', active: request.actual.members.filter(id => id !== memberId)});
      return {request, first, second, afterFirst, usage: {...request.budget.usage()}};
    };
    const measured = sequence(diagnosticWork);
    expect(measured.first.kind).toBe('prepared');
    expect(measured.second.kind).toBe('prepared');
    expect(measured.usage.nodes).toBe(input.graph.nodes.length);
    expect(measured.usage.work).toBeGreaterThan(measured.afterFirst.work);
    const exact = sequence(measured.usage.work);
    expect(exact.second.kind).toBe('prepared');
    expect(exact.usage).toEqual(measured.usage);
    const short = sequence(measured.usage.work - 1);
    expect(short.first.kind).toBe('prepared');
    expect(short.second.kind).toBe('resource-limit');
    const terminal = short.request.budget.failure();
    expect(short.request.candidate({key: 'after-exhaustion', active: short.request.actual.members})).toBe(terminal);
    expect(short.request.budget.guard(() => short.request.actual.lookup(endpointId))).toBe(terminal);
    expect(short.request.budget.usage().work).toBeLessThanOrEqual(measured.usage.work - 1);
  });
});
