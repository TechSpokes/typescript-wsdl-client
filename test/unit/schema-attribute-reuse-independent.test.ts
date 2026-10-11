import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {assessAttributeUse, assessRawAttributeUses, assessSourceAttributeUses} from '../../src/compiler/schemaAttributeUses.js';
import type {AttributeResult} from '../../src/compiler/schemaAttributeUses.js';
import {forkSemanticCandidate} from '../../src/compiler/semanticContext.js';
import type {SemanticContext, SemanticRequest} from '../../src/compiler/semanticContext.js';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {globalId, scopedId} from '../../src/compiler/canonicalGraph.js';
import type {AttributeNode, AttributeUseNode, ComplexTypeNode, GraphNode, Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties} from '../../src/compiler/schemaSimpleTypeProperties.js';
import {assertComponentConstruction, checkComponentConstruction} from '../../src/compiler/schemaConstructionAssessment.js';

// Independent preimplementation oracle and allocation:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/267#issuecomment-6113541100
// https://github.com/TechSpokes/typescript-wsdl-client/issues/267#issuecomment-6113783494
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:au-reuse';
const maximum = 100_000_000;
const named = (local: string, role: 'type' | 'attribute' | 'attributeGroup' = 'type') => globalId(role, {namespace, local});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
async function setup(): Promise<SemanticRequest> {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/au-reuse-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: maximum})});
  if (prepared.kind !== 'prepared') throw new Error(`Expected authentic source request: ${JSON.stringify(prepared)}`);
  return prepared.request;
}
function node<K extends GraphNode['kind']>(context: SemanticContext, id: string, kind: K): Extract<GraphNode, {kind: K}> {
  const found = context.lookup(id);
  if (found.kind !== 'found' || found.node.kind !== kind) throw new Error(`Expected ${kind}: ${id}`);
  return found.node as Extract<GraphNode, {kind: K}>;
}
function uses(context: SemanticContext, local: string, role: 'type' | 'attributeGroup' = 'type'): readonly string[] {
  const owner = role === 'type' ? node(context, named(local), 'complexType') : node(context, named(local, role), 'attributeGroup');
  return owner.attributes.filter(id => {const found = context.lookup(id); return found.kind === 'found' && found.node.kind === 'attributeUse';});
}
function checked(result: AttributeResult, context: SemanticContext): Extract<AttributeResult, {kind: 'checked'}> {
  if (result.kind !== 'checked') throw new Error(`Expected complete local AU mapping: ${JSON.stringify(result)}`);
  expect(result).toMatchObject({kind: 'checked', contextId: context.contextId});
  for (const declaration of result.value.declarations) expect(declaration).toMatchObject({
    authority: 'XSD10-declaration-properties-v1', contextId: context.contextId,
    obligations: ['declared-type-component-validity'],
  });
  return result;
}
function raw(context: SemanticContext, local: string, selected?: readonly string[]): RawComplexTypeProperties {
  const owner = node(context, named(local), 'complexType');
  return {type: owner.id, derivation: {method: owner.derivation?.kind ?? 'restriction', base: owner.derivation?.base ?? builtin('anyType')},
    abstract: false, final: [], block: [], content: {kind: 'empty'}, attributeUses: selected ?? owner.attributes,
    provenance: {kind: 'hypothetical-abstract', originals: [owner.id]}};
}
function changedScalar(context: SemanticContext): RawSimpleTypeProperties {
  const original = node(context, named('Bounded'), 'simpleType');
  return {type: original.id, base: builtin('string'), final: [], variety: {kind: 'atomic'},
    facetLayers: [{facets: [{name: 'maxLength', lexical: {value: '0', context: original.context}, fixed: false}]}],
    provenance: {kind: 'hypothetical-abstract', originals: [original.id]}};
}
function candidate(request: SemanticRequest, delta: Parameters<SemanticRequest['candidate']>[0]): SemanticContext {
  const prepared = request.candidate(delta);
  if (prepared.kind !== 'prepared') throw new Error(`Expected literal candidate: ${JSON.stringify(prepared)}`);
  return prepared.context;
}
function withComponentDebt(request: SemanticRequest, reverse: boolean) {
  const owner = named('DebtHelper'), declaration = named('DebtAttribute', 'attribute');
  const simple = scopedId(declaration, '/anonymous-type', 'simpleType');
  const seed = node(request.actual, named('Bounded'), 'simpleType');
  const type: SimpleTypeNode = {...seed, id: simple,
    identity: {kind: 'scoped', owner: declaration, path: '/anonymous-type', role: 'simpleType'},
    variety: {kind: 'restriction', base: builtin('string'), facets: []}};
  const attribute: AttributeNode = {...node(request.actual, named('Number', 'attribute'), 'attribute'), id: declaration,
    identity: {kind: 'global', role: 'attribute', name: {namespace, local: 'DebtAttribute'}},
    name: {namespace, local: 'DebtAttribute'}, type: {kind: 'local', target: simple}};
  const template = node(request.actual, uses(request.actual, 'DebtPair')[0], 'attributeUse');
  const additions: AttributeUseNode[] = [0, 1].map(i => ({...template,
    id: scopedId(owner, `/attribute/${i}`, 'attributeUse'),
    identity: {kind: 'scoped', owner, path: `/attribute/${i}`, role: 'attributeUse'},
    declaration: {kind: 'local', target: declaration}}));
  const ids = additions.map(use => use.id); if (reverse) ids.reverse();
  const helper: ComplexTypeNode = {...node(request.actual, named('DebtPair'), 'complexType'), id: owner,
    identity: {kind: 'global', role: 'type', name: {namespace, local: 'DebtHelper'}}, attributes: []};
  const properties: RawComplexTypeProperties = {...raw(request.actual, 'DebtPair', ids), type: owner,
    provenance: {kind: 'hypothetical-abstract', originals: []}};
  const context = candidate(request, {key: 'component-debt', active: [...request.actual.members, owner, declaration, simple, ...ids],
    additions: [helper, attribute, type, ...additions], rawTypes: [properties], rawSimpleTypes: [{type: simple,
      base: builtin('string'), final: [], variety: {kind: 'atomic'}, facetLayers: [],
      provenance: {kind: 'hypothetical-abstract', originals: []}}]});
  return {context, owner, declaration, simple, ids};
}

describe('independent exact-context attribute fact reuse', () => {
  it('authenticates before reading a forged context role accessor', () => {
    let reads = 0;
    const forged = {get kind() {reads++; return 'actual';}} as SemanticContext;
    expect(() => assessAttributeUse(forged, 'untrusted')).toThrow(/Unauthenticated/);
    expect(reads).toBe(0);
  });

  it.each(['Pair', 'PairReverse'])('replays complete shared-declaration facts after the second %s use was formed on a declaration hit', async owner => {
    const request = await setup(), context = request.actual, ids = uses(context, owner);
    const aggregate = checked(assessSourceAttributeUses(context, named(owner)), context);
    expect(aggregate.value.uses.map(use => use.id)).toEqual(ids);
    expect(aggregate.value.declarations.map(receipt => receipt.component)).toEqual([named('Shared', 'attribute')]);
    expect(aggregate.obligations).toEqual(['aggregate-type-validity', 'source-representation-syntax']);
    const useId = ids[1], original = node(context, useId, 'attributeUse');
    const result = checked(assessAttributeUse(context, useId), context);
    expect(result.authority).toBe('AU01-C1-source-v1');
    expect(result.obligations).toEqual(['owning-type-or-group-validity', 'source-representation-syntax']);
    expect(result.value.owner).toBe(useId);
    expect(result.value.schemaOperands).toEqual(result.value.uses);
    expect(result.value.uses).toHaveLength(1);
    expect(result.value.declarations).toHaveLength(1);
    expect(result.value.declarations[0]).toMatchObject({component: named('Shared', 'attribute'),
      constraint: {owner: named('Shared', 'attribute'), lexical: {value: 'v:Value'}, operand: {family: 'QName', canonical: '["urn:recovery:au-value","Value"]'}}});
    expect(result.value.uses[0]).toMatchObject({id: useId, required: false, declaration: {id: named('Shared', 'attribute')},
      own: {origin: 'use', value: {owner: useId, lexical: original.value?.lexical}},
      declared: {origin: 'declaration', value: {owner: named('Shared', 'attribute')}}});
    expect(result.value.uses[0].effective?.value.lexical).toEqual(original.value?.lexical);
    expect(result.scalarObligations).toEqual([]);
    expect(checked(assessAttributeUse(context, useId), context)).toEqual(result);
  });

  it('preserves full cold/warm evidence, including lexical environment and requested owner', async () => {
    const request = await setup(), context = request.actual, owner = named('Pair');
    const before = request.budget.usage().work;
    const cold = checked(assessSourceAttributeUses(context, owner), context);
    const coldWork = request.budget.usage().work - before;
    const start = request.budget.usage().work;
    const warm = checked(assessSourceAttributeUses(context, owner), context);
    const warmWork = request.budget.usage().work - start;
    expect(warm).toEqual(cold);
    expect(warmWork).toBeGreaterThan(0);
    expect(warmWork).toBeLessThan(coldWork);
    expect(warm.value.uses.map(use => use.own?.value.lexical.value)).toEqual(['a:Value', 'b:Value']);
    expect(warm.value.uses[0].own?.value.lexical.context.namespaces.a).toBe('urn:recovery:au-value');
    expect(warm.value.uses[1].own?.value.lexical.context.namespaces.b).toBe('urn:recovery:au-value');
    expect(Object.isFrozen(warm.value.declarations[0])).toBe(true);
    expect(() => (warm.value.uses as unknown as unknown[]).push({})).toThrow();
    expect(checked(assessSourceAttributeUses(context, owner), context)).toEqual(cold);
  });

  it('deduplicates declaration receipts in each current operation\'s first-encounter order', async () => {
    const request = await setup(), context = request.actual;
    // Warming Number first must not dictate later source-order publication.
    checked(assessAttributeUse(context, uses(context, 'MixedOrder')[1]), context);
    const forward = checked(assessSourceAttributeUses(context, named('MixedOrder')), context);
    const reverse = checked(assessSourceAttributeUses(context, named('ReverseMixedOrder')), context);
    expect(forward.value.declarations.map(receipt => receipt.component)).toEqual([named('Shared', 'attribute'), named('Number', 'attribute')]);
    expect(reverse.value.declarations.map(receipt => receipt.component)).toEqual([named('Number', 'attribute'), named('Shared', 'attribute')]);
    expect(checked(assessSourceAttributeUses(context, named('MixedOrder')), context)).toEqual(forward);
    expect(checked(assessSourceAttributeUses(context, named('ReverseMixedOrder')), context)).toEqual(reverse);
  });

  it.each(['standalone-first', 'container-first'])('separates enclosing owner prerequisites with %s reuse', async order => {
    const request = await setup(), context = request.actual, useId = uses(context, 'SharedGroup', 'attributeGroup')[0];
    if (order === 'standalone-first') checked(assessAttributeUse(context, useId), context);
    else checked(assessSourceAttributeUses(context, named('OwnerOne')), context);
    const standalone = checked(assessAttributeUse(context, useId), context);
    const group = checked(assessSourceAttributeUses(context, named('SharedGroup', 'attributeGroup')), context);
    const one = checked(assessSourceAttributeUses(context, named('OwnerOne')), context);
    const two = checked(assessSourceAttributeUses(context, named('OwnerTwo')), context);
    expect([standalone.value.owner, group.value.owner, one.value.owner, two.value.owner])
      .toEqual([useId, named('SharedGroup', 'attributeGroup'), named('OwnerOne'), named('OwnerTwo')]);
    expect(standalone.obligations).toEqual(['owning-type-or-group-validity', 'source-representation-syntax']);
    expect(group.obligations).toEqual(['aggregate-type-validity', 'source-representation-syntax']);
    expect(one.obligations).toEqual(two.obligations);
    for (const plan of [standalone, group, one, two]) {
      expect(plan.value.uses.map(use => use.id)).toEqual([useId]);
      expect(plan.value.declarations.map(receipt => receipt.component)).toEqual([named('Shared', 'attribute')]);
      expect(plan.value.uses[0].declared?.value.owner).toBe(named('Shared', 'attribute'));
    }
  });

  it.each([false, true])('replays full transitive raw scalar prerequisites in %s AU order', reverse => {
    return setup().then(request => {
      const {context, owner, declaration, simple, ids} = withComponentDebt(request, reverse);
      const aggregate = checked(assessRawAttributeUses(context, owner), context);
      const standalone = checked(assessAttributeUse(context, ids[1]), context);
      const debt = {rule: 'raw-simple-target-namespace', component: simple};
      expect(aggregate.scalarObligations).toEqual(expect.arrayContaining([expect.objectContaining(debt)]));
      expect(standalone.scalarObligations).toEqual(expect.arrayContaining([expect.objectContaining(debt)]));
      for (const obligation of standalone.scalarObligations) expect(obligation.contextId ?? standalone.contextId).toBe(context.contextId);
      expect(standalone.value.declarations).toHaveLength(1);
      expect(standalone.value.declarations[0]).toMatchObject({component: declaration,
        scalarObligations: expect.arrayContaining([expect.objectContaining(debt)])});
      expect(standalone.value.uses[0].declared?.value.owner).toBe(declaration);
      expect(standalone.authority).toBe('AU01-C1-raw-v1');
      expect(standalone.obligations).toEqual(['owning-type-or-group-validity']);
      expect(checked(assessRawAttributeUses(context, owner), context)).toEqual(aggregate);
      expect(checked(assessAttributeUse(context, ids[1]), context)).toEqual(standalone);
      const construction = checkComponentConstruction(context, ids[1]);
      expect(construction).toMatchObject({kind: 'checked', contextId: context.contextId,
        obligations: expect.arrayContaining([{...debt, contextId: context.contextId}])});
      if (construction.kind !== 'checked') throw new Error('Expected local construction with retained component debt');
      expect(() => assertComponentConstruction(context, construction)).not.toThrow();
    });
  });

  it('caches successful local absence without inventing a declaration or scalar operand', async () => {
    const request = await setup(), context = request.actual, useId = uses(context, 'AbsentLocal')[0];
    const start = request.budget.usage().work;
    const cold = checked(assessAttributeUse(context, useId), context);
    const coldWork = request.budget.usage().work - start;
    checked(assessSourceAttributeUses(context, named('AbsentLocal')), context);
    const warmStart = request.budget.usage().work;
    const warm = checked(assessAttributeUse(context, useId), context);
    const warmWork = request.budget.usage().work - warmStart;
    expect(warmWork).toBeGreaterThan(0);
    expect(warmWork).toBeLessThan(coldWork);
    expect(warm).toEqual(cold);
    expect(warm.value).toMatchObject({uses: [], schemaOperands: [], declarations: [], attributes: []});
    expect(warm.scalarObligations).toEqual([]);
    const literal = candidate(request, {key: 'absent-is-not-raw-presence', active: context.members});
    expect(assessAttributeUse(literal, useId)).toMatchObject({kind: 'candidate-rejected', rule: 'au-props-correct'});
    expect(assessSourceAttributeUses(literal, named('AbsentLocal'))).toMatchObject({kind: 'unresolved', rule: 'source-construction-role'});
    expect(checked(assessAttributeUse(context, useId), context)).toEqual(cold);
  });

  it('replays global declaration prerequisites through successful prohibited-reference absence', async () => {
    const request = await setup(), context = request.actual, ids = uses(context, 'AbsentGlobals');
    const aggregate = checked(assessSourceAttributeUses(context, named('AbsentGlobals')), context);
    expect(aggregate.value.uses).toEqual([]);
    expect(aggregate.value.declarations).toHaveLength(1);
    for (const id of ids) {
      const result = checked(assessAttributeUse(context, id), context);
      expect(result.value).toMatchObject({uses: [], schemaOperands: [], declarations: [{component: named('Shared', 'attribute')}]});
      expect(result.value.declarations[0].constraint?.owner).toBe(named('Shared', 'attribute'));
      expect(checked(assessAttributeUse(context, id), context)).toEqual(result);
    }
    const broken = uses(context, 'AbsentBroken')[0];
    for (let i = 0; i < 2; i++) expect(assessAttributeUse(context, broken)).toMatchObject({kind: 'invalid-schema', component: named('Broken', 'attribute')});
  });

  it.each([['DistinctGroup', 'ag-props-correct.2'], ['TwoIds', 'ag-props-correct.3']] as const)
    ('still rejects %s after every individual AU and a prior failed container were warmed', async (owner, rule) => {
      const request = await setup(), context = request.actual, ids = uses(context, owner, 'attributeGroup');
      for (const id of ids) checked(assessAttributeUse(context, id), context);
      const result = assessSourceAttributeUses(context, named(owner, 'attributeGroup'));
      expect(result).toMatchObject({kind: 'invalid-schema', component: named(owner, 'attributeGroup'), rule});
      for (const id of ids) checked(assessAttributeUse(context, id), context);
      expect(assessSourceAttributeUses(context, named(owner, 'attributeGroup'))).toEqual(result);
    });

  it('preserves an optional default-conflict plan after all local facts are warm', async () => {
    const request = await setup(), context = request.actual;
    for (const id of uses(context, 'DefaultConflict')) checked(assessAttributeUse(context, id), context);
    const result = checked(assessSourceAttributeUses(context, named('DefaultConflict')), context);
    expect(result.value.uses.map(use => use.effective?.value.operand.canonical)).toEqual(['1', '2']);
    expect(result.value.attributes).toMatchObject([{required: false, fixed: [], absent: {kind: 'conflict'}}]);
    expect(checked(assessSourceAttributeUses(context, named('DefaultConflict')), context)).toEqual(result);
  });

  it.each(['WeakWildcard', 'WideWildcard'])('does not bypass %s restrictions after local hits', async owner => {
    const request = await setup(), context = request.actual;
    for (const local of ['WildcardBase', owner]) for (const id of uses(context, local)) checked(assessAttributeUse(context, id), context);
    const result = assessSourceAttributeUses(context, named(owner));
    expect(result).toMatchObject({kind: 'invalid-schema'});
    expect(assessSourceAttributeUses(context, named(owner))).toEqual(result);
    const base = {...raw(context, 'WildcardBase', uses(context, 'WildcardBase')),
      wildcard: {namespace: {kind: 'set' as const, namespaces: ['urn:external']}, processContents: 'strict' as const, sources: []}};
    const derived = {...raw(context, owner, uses(context, owner)), wildcard: {
      namespace: owner === 'WideWildcard' ? {kind: 'not' as const, namespaces: []} : {kind: 'set' as const, namespaces: ['urn:external']},
      processContents: owner === 'WeakWildcard' ? 'lax' as const : 'strict' as const, sources: []}};
    const literal = candidate(request, {key: owner, active: context.members, rawTypes: [base, derived]});
    for (const local of ['WildcardBase', owner]) for (const id of uses(literal, local)) checked(assessAttributeUse(literal, id), literal);
    expect(assessRawAttributeUses(literal, named(owner))).toMatchObject({kind: 'candidate-rejected'});
  });

  it('retains removed source operands and required coverage after warming the source and raw roles', async () => {
    const request = await setup(), context = request.actual;
    for (const owner of ['OptionalBase', 'Removed', 'RequiredBase']) for (const id of uses(context, owner)) checked(assessAttributeUse(context, id), context);
    const removed = checked(assessSourceAttributeUses(context, named('Removed')), context);
    expect(removed.value.uses).toEqual([]);
    expect(removed.value.schemaOperands).toHaveLength(1);
    expect(removed.value.schemaOperands[0].declared?.value.operand.canonical).toBe('1');
    const literal = candidate(request, {key: 'required-omission', active: context.members,
      rawTypes: [raw(context, 'RequiredBase'), raw(context, 'RemovedRequired')]});
    for (const id of uses(literal, 'RequiredBase')) checked(assessAttributeUse(literal, id), literal);
    expect(assessRawAttributeUses(literal, named('RemovedRequired'))).toMatchObject({kind: 'candidate-rejected'});
    expect(checked(assessSourceAttributeUses(context, named('Removed')), context)).toEqual(removed);
  });

  it('keeps actual and same-key siblings independently bound and rejects a missing original dependency', async () => {
    const request = await setup(), useId = uses(request.actual, 'DebtPair')[0];
    const actual = checked(assessAttributeUse(request.actual, useId), request.actual);
    const parent = candidate(request, {key: 'same-key', active: request.actual.members});
    const parentResult = checked(assessAttributeUse(parent, useId), parent);
    const bad = candidate(request, {key: 'same-key', active: request.actual.members, rawSimpleTypes: [changedScalar(request.actual)]});
    expect(assessAttributeUse(bad, useId)).toMatchObject({kind: 'candidate-rejected'});
    const fork = forkSemanticCandidate(parent, {key: 'same-key', active: parent.members.filter(id => id !== named('Bounded'))});
    expect(fork).toMatchObject({kind: 'candidate-rejected', code: 'outside-context', component: named('Bounded')});
    expect(checked(assessAttributeUse(parent, useId), parent)).toEqual(parentResult);
    expect(checked(assessAttributeUse(request.actual, useId), request.actual)).toEqual(actual);
    expect(parentResult.contextId).not.toBe(actual.contextId);
    expect(() => assessAttributeUse({...parent}, useId)).toThrow(/Unauthenticated/);
  });

  it('checks a child endpoint using its own literal uses without mutating the warmed parent', async () => {
    const request = await setup(), ids = uses(request.actual, 'Pair');
    const parent = candidate(request, {key: 'parent-owner', active: request.actual.members,
      rawTypes: [raw(request.actual, 'Pair', [ids[0]])]});
    for (const id of ids) checked(assessAttributeUse(parent, id), parent);
    const before = checked(assessRawAttributeUses(parent, named('Pair')), parent);
    const child = forkSemanticCandidate(parent, {key: 'child-owner', active: parent.members,
      endpoint: {...node(parent, named('Pair'), 'complexType'), attributes: []}, rawTypes: [raw(parent, 'Pair', [ids[1]])]});
    if (child.kind !== 'prepared') throw new Error(`Expected child endpoint: ${JSON.stringify(child)}`);
    const result = checked(assessRawAttributeUses(child.context, named('Pair')), child.context);
    expect(result.value.uses.map(use => use.id)).toEqual([ids[1]]);
    expect(before.value.uses.map(use => use.id)).toEqual([ids[0]]);
    expect(checked(assessRawAttributeUses(parent, named('Pair')), parent)).toEqual(before);
    expect(result.contextId).not.toBe(before.contextId);
  });

  it('does not transfer a warmed original notation lookup to an active subset', async () => {
    const request = await setup(), useId = uses(request.actual, 'NotationOwner')[0];
    const actual = checked(assessAttributeUse(request.actual, useId), request.actual);
    const parent = candidate(request, {key: 'original-present', active: request.actual.members});
    const warmed = checked(assessAttributeUse(parent, useId), parent);
    const subset = forkSemanticCandidate(parent, {key: 'original-omitted', active: parent.members, notations: {active: []}});
    if (subset.kind !== 'prepared') throw new Error('Expected structural notation subset');
    expect(assessAttributeUse(subset.context, useId)).toMatchObject({kind: 'unresolved', rule: 'notation-context-membership'});
    expect(checked(assessAttributeUse(parent, useId), parent)).toEqual(warmed);
    expect(checked(assessAttributeUse(request.actual, useId), request.actual)).toEqual(actual);
  });

  it('owns candidate arrays independently of caller mutation and refuses copied handles', async () => {
    const request = await setup(), ids = [...uses(request.actual, 'Pair')], selected = [ids[0]];
    const context = candidate(request, {key: 'caller-snapshot', active: request.actual.members, rawTypes: [raw(request.actual, 'Pair', selected)]});
    selected.push(ids[1]);
    const before = checked(assessRawAttributeUses(context, named('Pair')), context);
    expect(before.value.uses.map(use => use.id)).toEqual([ids[0]]);
    expect(() => assessRawAttributeUses({...context}, named('Pair'))).toThrow(/Unauthenticated/);
    expect(checked(assessRawAttributeUses(context, named('Pair')), context)).toEqual(before);
  });

  it.each([0, 1])('charges a warmed exact hit with an inclusive allowance (%s unit short)', async short => {
    const request = await setup(), context = request.actual, useId = uses(context, 'Pair')[0];
    const cold = checked(assessAttributeUse(context, useId), context);
    const before = request.budget.usage().work;
    expect(checked(assessAttributeUse(context, useId), context)).toEqual(cold);
    const hitWork = request.budget.usage().work - before;
    expect(hitWork).toBeGreaterThan(0);
    request.budget.chargeWork(maximum - request.budget.usage().work - hitWork + short);
    const result = assessAttributeUse(context, useId);
    if (short === 0) {expect(result).toEqual(cold); expect(request.budget.usage().work).toBe(maximum);}
    else expect(result).toMatchObject({kind: 'resource-limit'});
    expect(assessAttributeUse(context, useId)).toBe(request.budget.failure());
    expect(assessSourceAttributeUses(context, named('Pair'))).toBe(request.budget.failure());
    expect(assessRawAttributeUses(context, named('Pair'))).toBe(request.budget.failure());
  });

  it('publishes no checked partial result when the first mapping exhausts', async () => {
    const request = await setup(), context = request.actual, useId = uses(context, 'Pair')[0];
    request.budget.chargeWork(maximum - request.budget.usage().work - 100);
    const first = assessAttributeUse(context, useId);
    expect(first).toMatchObject({kind: 'resource-limit'});
    expect(first).toBe(request.budget.failure());
    expect(assessAttributeUse(context, useId)).toBe(first);
    expect(assessSourceAttributeUses(context, named('Pair'))).toBe(first);
  });
});
