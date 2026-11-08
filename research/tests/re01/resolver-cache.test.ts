import { describe, expect, it } from 'vitest';
import { prepareContexts, withContext } from './resolver-context.js';
import { resolveReference } from './resolver-resolution.js';
import { checkSubstitution, checkTypeDerivation } from './resolver-relations.js';
import { checkTypeConstruction } from './resolver-validation.js';
import type { QualifiedOwner, TypeConstructionRequest, ValidationObligation } from './resolver-validation.js';
import type { ActualInput, Candidate, Component, Facts, Method, Ref, Source } from './resolver-types.js';

const source: Source = Object.freeze({
  uri: 'cache.xsd', digest: 'independent-cache-records', path: '/schema', baseUri: 'cache.xsd',
  start: Object.freeze({ line: 1, column: 0 }), end: Object.freeze({ line: 1, column: 1 }),
  namespaces: Object.freeze({ xs: 'http://www.w3.org/2001/XMLSchema' }),
  effectiveNamespace: 'urn:cache', interpretation: 'original', chameleon: false,
});
const none = Object.freeze([]);
const empty = Object.freeze({ kind: 'empty' as const });
const reference = (target: string): Ref => Object.freeze({
  kind: 'symbol', role: 'type', name: Object.freeze({ namespace: 'urn:cache', local: target }), target, source,
});
const anyType: Ref = Object.freeze({ kind: 'builtin', name: Object.freeze({
  namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType',
}) });
function type(id: string, base: Ref, method: 'extension' | 'restriction' = 'restriction'): Component {
  return Object.freeze({
    id, identity: Object.freeze({ kind: 'global', role: 'type', name: Object.freeze({ namespace: 'urn:cache', local: id }) }),
    facts: Object.freeze({ kind: 'type', variety: 'complex', base, method, final: none, block: none, abstract: false,
      content: empty, declaredContent: empty, attributeUses: none, items: none, facets: none }),
    source, owns: none, sourceUses: none, sourceGroups: none, unassessed: none,
    provenance: Object.freeze({ kind: 'actual', originals: none }),
  });
}
const A = type('A', anyType);
const T = type('T', reference('A'), 'extension');
const B = type('B', reference('A'));
const D = type('D', reference('B'), 'extension');
const C = type('C', reference('A'));
const actual: ActualInput = Object.freeze({ key: 'cache-actual', components: Object.freeze([A, T, B, D, C]) });
function candidate(key = 'candidate-one', retained: readonly string[] = Object.freeze(['A', 'T', 'B', 'D', 'C'])): Candidate {
  return Object.freeze({
    key, ancestor: reference('A'), intermediate: 'T', endpoint: 'D', retained, additions: none, attributes: none,
    endpointDefinition: Object.freeze({ ...D, facts: Object.freeze({ ...D.facts, base: reference('T'), method: 'restriction' }),
      provenance: Object.freeze({ kind: 'endpoint-replacement', originals: Object.freeze(['D']) }) }),
  });
}
function prepared(plan = candidate(), maxWork = 1_000_000) {
  const result = prepareContexts(actual, plan, { maxWork });
  if (result.kind !== 'ok') throw new Error(`independent cache fixture failed: ${result.kind}`);
  return result.value;
}
function element(id: string, typeId: string, head?: string, block: readonly (Method | 'substitution')[] = none): Component {
  return Object.freeze({
    id, identity: Object.freeze({ kind: 'global', role: 'element', name: Object.freeze({ namespace: 'urn:cache', local: id }) }),
    facts: Object.freeze({ kind: 'element', name: Object.freeze({ namespace: 'urn:cache', local: id }), type: reference(typeId),
      abstract: false, nillable: false, final: none, block, identityConstraints: none,
      ...(head === undefined ? {} : { head: Object.freeze({ kind: 'symbol' as const, role: 'element' as const,
        name: Object.freeze({ namespace: 'urn:cache', local: head }), target: head, source }) }),
    }),
    source, owns: none, sourceUses: none, sourceGroups: none, unassessed: none,
    provenance: Object.freeze({ kind: 'actual', originals: none }),
  });
}
function withElements(headBlock: readonly (Method | 'substitution')[] = none, extras: readonly Component[] = none) {
  const components = Object.freeze([...actual.components, element('H', 'B', undefined, headBlock), element('M', 'D', 'H'), ...extras]);
  const result = prepareContexts(Object.freeze({ key: actual.key, components }),
    candidate('same-public-key', Object.freeze(components.map(component => component.id))));
  if (result.kind !== 'ok') throw new Error(`independent element cache fixture failed: ${result.kind}`);
  return result.value;
}

describe('RE01 private request and context cache isolation', () => {
  it.each(['input-error', 'candidate-rejected', 'unresolved'] as const)(
    'starts a fresh valid request after a %s relation result', failureKind => {
      const failed = prepared(candidate('same-public-key'));
      const failure = failureKind === 'input-error'
        ? checkTypeDerivation(failed.actual, reference('absent'), reference('B'), none)
        : failureKind === 'candidate-rejected'
          ? checkTypeDerivation(failed.actual, reference('D'), reference('B'), ['extension'])
          : checkTypeDerivation(failed.actual,
            {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'boolean'}},
            {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}}, none);
      expect(failure.kind).toBe(failureKind);
      const fresh = prepared(candidate('same-public-key'));
      expect(checkTypeDerivation(fresh.actual, reference('D'), reference('B'), none).kind).toBe('ok');
    });

  it('recomputes fixed predicate owners when authority changes in the same request', () => {
    const contexts = prepared();
    const obligation: ValidationObligation = {adapter: 'type-construction', rule: 'ct-props-correct',
      component: 'D', slot: '', operands: ['D'], source, owner: 'type-construction'};
    let firstCalls = 0, secondCalls = 0;
    const owner = (authority: string, invoked: () => void): QualifiedOwner<TypeConstructionRequest> => ({
      authority, qualification: 'Literal cache isolation control; no full schema legality assertion.',
      check(request) {
        invoked();
        const budget = request.budget;
        budget.chargeWork(33);
        const receipt = budget.freeze(budget.snapshot({context: request.context.key,
          rule: request.obligation.rule, operands: request.operands, authority}));
        budget.chargeWork(38);
        return Object.freeze({kind: 'ok' as const, value: receipt, usage: budget.usage()});
      },
    });
    const first = checkTypeConstruction(contexts.proposed, obligation,
      owner('independent-first-owner', () => firstCalls++), contexts.actual);
    const second = checkTypeConstruction(contexts.proposed, obligation,
      owner('independent-second-owner', () => secondCalls++), contexts.actual);
    expect(first.kind).toBe('ok');
    expect(second.kind).toBe('ok');
    if (first.kind !== 'ok' || second.kind !== 'ok') return;
    expect(first.value.authority).toBe('independent-first-owner');
    expect(second.value.authority).toBe('independent-second-owner');
    expect(firstCalls).toBe(1);
    expect(secondCalls).toBe(1);
  });

  it('resolves a shared unchanged record through each declared context', () => {
    const contexts = prepared();
    const original = resolveReference(contexts.actual, 'D', 'base');
    const proposed = resolveReference(contexts.proposed, 'D', 'base');
    expect(original.kind).toBe('ok');
    expect(proposed.kind).toBe('ok');
    if (original.kind !== 'ok' || proposed.kind !== 'ok' || original.value.kind !== 'component' || proposed.value.kind !== 'component') return;
    expect(original.value.component).toBe(B);
    expect(proposed.value.component).toBe(T);
    expect(D.facts.kind === 'type' && D.facts.base).toEqual(reference('B'));
  });

  it('partitions cache factories by context and candidate request identity', () => {
    const one = prepared(candidate('same-candidate-name'));
    const two = prepared(candidate('same-candidate-name'));
    const token = Object.freeze({});
    let count = 0;
    const cached = (context: typeof one.actual) => withContext(context, access => access.cache(token, () => {
      access.budget.chargeWork(16); // Record/field/key and its shallow freezing.
      return Object.freeze({ serial: ++count });
    }));
    const actualOne = cached(one.actual);
    const actualAgain = cached(one.actual);
    const proposedOne = cached(one.proposed);
    const actualTwo = cached(two.actual);
    expect(count).toBe(3);
    if (actualOne.kind !== 'ok' || actualAgain.kind !== 'ok' || proposedOne.kind !== 'ok' || actualTwo.kind !== 'ok') return;
    expect(actualOne.value).toBe(actualAgain.value);
    expect(proposedOne.value).not.toBe(actualOne.value);
    expect(actualTwo.value).not.toBe(actualOne.value);
  });

  it('keys derivation answers by context and full canonical excluded-method set', () => {
    const contexts = prepared();
    expect(checkTypeDerivation(contexts.actual, reference('D'), reference('B'), []).kind).toBe('ok');
    expect(checkTypeDerivation(contexts.actual, reference('D'), reference('B'), ['restriction']).kind).toBe('ok');
    expect(checkTypeDerivation(contexts.actual, reference('D'), reference('B'), ['extension']).kind).toBe('candidate-rejected');
    expect(checkTypeDerivation(contexts.proposed, reference('D'), reference('T'), ['extension']).kind).toBe('ok');
    expect(checkTypeDerivation(contexts.actual, reference('D'), reference('T'), ['extension']).kind).toBe('candidate-rejected');
    const canonical = checkTypeDerivation(contexts.actual, reference('T'), reference('A'), ['restriction', 'list', 'restriction']);
    expect(canonical).toMatchObject({ kind: 'ok', value: { query: { excluded: ['list', 'restriction'] } } });
    expect(checkTypeDerivation(contexts.actual, reference('T'), reference('A'), ['list', 'restriction']).kind).toBe('ok');
  });

  it('separates affiliation, substitutability and explicit head-block options', () => {
    const contexts = withElements(Object.freeze(['substitution']));
    expect(checkSubstitution(contexts.actual, 'M', 'H', { mode: 'affiliation' }).kind).toBe('ok');
    expect(checkSubstitution(contexts.actual, 'M', 'H', { mode: 'substitutability', blocking: [] }).kind).toBe('ok');
    expect(checkSubstitution(contexts.actual, 'M', 'H', { mode: 'substitutability' }).kind).toBe('candidate-rejected');
    expect(checkSubstitution(contexts.actual, 'M', 'H', { mode: 'substitutability', blocking: ['restriction'] }).kind).toBe('ok');
    expect(checkSubstitution(contexts.actual, 'M', 'H', { mode: 'substitutability', blocking: ['extension'] }).kind).toBe('candidate-rejected');
    expect(checkSubstitution(contexts.proposed, 'M', 'H', { mode: 'affiliation' }).kind).toBe('candidate-rejected');
  });

  it('isolates changed head facts in new requests with identical public input and candidate keys', () => {
    const admitted = withElements(), blocked = withElements(Object.freeze(['extension']));
    expect(checkSubstitution(admitted.actual, 'M', 'H', { mode: 'substitutability' }).kind).toBe('ok');
    expect(checkSubstitution(blocked.actual, 'M', 'H', { mode: 'substitutability' }).kind).toBe('candidate-rejected');
    expect(checkSubstitution(admitted.actual, 'M', 'H', { mode: 'substitutability' }).kind).toBe('ok');
  });

  it('keeps accumulated complex methods in simple-union alternative cache keys', () => {
    const string: Ref = Object.freeze({ kind: 'builtin', name: Object.freeze({
      namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string',
    }) });
    const simple: Ref = Object.freeze({ kind: 'builtin', name: Object.freeze({
      namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anySimpleType',
    }) });
    const complexPrefix = type('X', string, 'extension');
    const originalUnion = type('U', simple);
    const union = Object.freeze({ ...originalUnion, facts: Object.freeze({ ...originalUnion.facts,
      variety: 'union', method: 'union', items: Object.freeze([string]),
    } as Extract<Facts, { kind: 'type' }>) });
    // Formation of these abstract supplied records is a separate authority;
    // the relation must still preserve the literal extension prefix's block.
    const contexts = withElements(none, Object.freeze([complexPrefix, union, element('HU', 'U'), element('MX', 'X', 'HU')]));
    expect(checkSubstitution(contexts.actual, 'MX', 'HU', { mode: 'substitutability', blocking: [] }).kind).toBe('ok');
    expect(checkSubstitution(contexts.actual, 'MX', 'HU', { mode: 'substitutability', blocking: ['extension'] }).kind).toBe('candidate-rejected');
    expect(checkSubstitution(contexts.actual, 'MX', 'HU', { mode: 'substitutability', blocking: [] }).kind).toBe('ok');
  });

  it('does not borrow membership from another request with the same candidate key', () => {
    const retained = prepared(candidate('same-key'));
    const excluded = prepared(candidate('same-key', Object.freeze(['A', 'T', 'B', 'D'])));
    expect(resolveReference(retained.proposed, 'C', 'base').kind).toBe('ok');
    expect(resolveReference(excluded.proposed, 'C', 'base')).toMatchObject({
      kind: 'input-error', diagnostic: { code: 'outside-context', component: 'C' },
    });
    expect(excluded.proposed.excludedIncoming).toContainEqual({ owner: 'C', slot: 'base', target: 'A' });
  });

  it('invalidates both contexts after cumulative exhaustion without further work', () => {
    const contexts = prepared();
    const first = withContext(contexts.proposed, access => {
      access.budget.chargeWork(Number.MAX_SAFE_INTEGER);
      return 'partial-success';
    });
    expect(first.kind).toBe('resource-limit');
    const usage = { ...first.usage };
    expect(resolveReference(contexts.actual, 'D', 'base')).toBe(first);
    expect(resolveReference(contexts.proposed, 'D', 'base')).toBe(first);
    expect(first.usage).toEqual(usage);
    const fresh = prepared();
    expect(resolveReference(fresh.proposed, 'D', 'base').kind).toBe('ok');
  });

  it('starts fresh after malformed input and ordinary candidate query rejection', () => {
    const malformed = prepareContexts(actual, candidate(), { maxNodes: 0 });
    expect(malformed.kind).toBe('input-error');
    const contexts = prepared();
    expect(resolveReference(contexts.proposed, 'D', 'unknown').kind).toBe('input-error');
    const fresh = prepared();
    expect(resolveReference(fresh.proposed, 'D', 'base').kind).toBe('ok');
    expect(fresh.proposed).not.toBe(contexts.proposed);
  });

  it('charges one fresh addition while the endpoint replacement keeps its original node identity', () => {
    const fresh = Object.freeze({ ...T, id: 'fresh-u',
      identity: Object.freeze({ kind: 'fresh' as const, path: 'intermediate', role: 'type' as const }),
      provenance: Object.freeze({ kind: 'constructed' as const, originals: Object.freeze(['T']) }),
    });
    const plan = candidate();
    const construction: Candidate = Object.freeze({ ...plan, intermediate: fresh.id, additions: Object.freeze([fresh]),
      endpointDefinition: Object.freeze({ ...plan.endpointDefinition,
        facts: Object.freeze({ ...plan.endpointDefinition.facts, base: Object.freeze({ kind: 'local' as const, target: fresh.id }) }),
      }),
    });
    const result = prepareContexts(actual, construction);
    expect(result.kind).toBe('ok');
    expect(result.usage.nodes).toBe(6);
    const retained = prepared(plan);
    expect(checkTypeDerivation(retained.proposed, reference('D'), reference('T'), ['extension']).kind).toBe('ok');
    if (result.kind === 'ok') expect(checkTypeDerivation(result.value.proposed, reference('D'), reference('T'), ['extension']).kind).toBe('candidate-rejected');
    const below = prepareContexts(actual, construction, { maxNodes: 5 });
    expect(below).toMatchObject({ kind: 'resource-limit', limit: 'nodes', usage: { nodes: 5 } });
    expect(below.usage.work).toBeGreaterThanOrEqual(79);
  });

  it('counts 100,000 actual identities once despite exclusions and shared references', () => {
    const components: Component[] = [A, T, B, D, C];
    for (let index = components.length; index < 100_000; index += 1) {
      components.push(type(`unused-${index}`, anyType));
    }
    const large: ActualInput = Object.freeze({ key: 'large-actual', components: Object.freeze(components) });
    const admitted = prepareContexts(large, candidate(), { maxWork: Number.MAX_SAFE_INTEGER });
    expect(admitted.kind).toBe('ok');
    expect(admitted.usage.nodes).toBe(100_000);
    if (admitted.kind === 'ok') {
      expect(admitted.value.actual.members).toHaveLength(100_000);
      expect(admitted.value.proposed.members).toHaveLength(5);
      const resolved = resolveReference(admitted.value.proposed, 'D', 'base');
      expect(resolved.kind).toBe('ok');
      expect(resolved.usage.nodes).toBe(100_000);
    }
    const extra = Object.freeze([...components, type('one-too-many', anyType)]);
    const rejected = prepareContexts({ key: 'large-actual', components: extra }, candidate(), {
      maxWork: Number.MAX_SAFE_INTEGER,
    });
    expect(rejected).toMatchObject({ kind: 'resource-limit', limit: 'nodes', usage: { nodes: 0 } });
    expect(rejected.usage.work).toBeGreaterThanOrEqual(79);
  }, 60_000);
});
