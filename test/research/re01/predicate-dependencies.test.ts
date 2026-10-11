/** Implementation controls use the prior independent #266 observation specification. */
import {describe, expect, it} from 'vitest';
import {captureDependencyObservations, validateDependencyObservationReceipt} from './predicate-dependencies.js';
import type {DependencyDescriptor} from './predicate-dependencies.js';
import {prepareDerivationContexts, prepareLiteralContexts} from './resolver-context.js';
import {baselineRequest, builtin, fixtureName, literalComponent, symbol} from './resolver-fixtures.js';
import {helperAffiliationCase, rawAllHelperCase} from './helper-affiliation-case.js';
import type {Component, Facts, Limits, Result} from './resolver-types.js';

function value<T>(result: Result<T>): T {
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
    return result.value;
}
function omitted() {
    const x = literalComponent('X', {kind: 'element', name: fixtureName('X'), type: builtin('string'),
        nillable: false, abstract: false, final: [], block: [], identityConstraints: []});
    const request = baselineRequest([x]);
    return {...request, candidate: {...request.candidate, retained: request.candidate.retained.filter(id => id !== 'X')}};
}
function contexts(request = baselineRequest(), limits?: Limits) {
    return value(prepareDerivationContexts(request.input, request.candidate, limits));
}
const nameQueries: readonly DependencyDescriptor[] = ['actual', 'proposed', 'reserved-originals'].map(universe => ({
    kind: 'global-name', universe: universe as 'actual' | 'proposed' | 'reserved-originals', role: 'element', name: fixtureName('X'),
}));

describe('predicate dependency observations under the unaccepted domain boundary', () => {
    it('distinguishes complete represented collections from semantic absence of omitted originals', () => {
        const prepared = contexts(omitted());
        const receipt = value(captureDependencyObservations(prepared, 'derivation', nameQueries));
        expect(receipt).toMatchObject({domainAcceptance: 'unaccepted', qualification: 'declared-structural-observations-only',
            observations: [
                {value: {collection: [{id: 'X'}], collectionCompleteness: 'selected-represented-universe', semanticLookup: 'unresolved'}},
                {value: {collection: [], semanticLookup: 'unresolved'}},
                {value: {collection: [{id: 'X'}], semanticLookup: 'unresolved'}},
            ]});
        const enumeration = value(captureDependencyObservations(prepared, 'derivation', [
            {kind: 'global-enumeration', universe: 'actual', role: 'element'},
            {kind: 'global-enumeration', universe: 'proposed', role: 'element'},
        ]));
        expect(enumeration.observations).toMatchObject([{value: {collection: [{id: 'X'}]}}, {value: {collection: []}}]);
        expect(captureDependencyObservations(prepared, 'derivation', [
            {kind: 'component-property', context: 'proposed', component: 'X', property: 'facts'},
        ])).toMatchObject({kind: 'input-error', diagnostic: {code: 'outside-context'}});
    });

    it('separates legal symbol spaces and still reserves omitted original symbols against fresh collisions', () => {
        const request = omitted();
        const element = request.input.components.find(c => c.id === 'X')!;
        const type = {...literalComponent('type-X', (request.input.components[0]!.facts as Extract<Facts, {kind: 'type'}>)),
            identity: {kind: 'global' as const, role: 'type' as const, name: fixtureName('X')}};
        const prepared = contexts({...request, input: {...request.input, components: [...request.input.components, type]}});
        expect(value(captureDependencyObservations(prepared, 'derivation', [
            {kind: 'global-name', universe: 'actual', role: 'type', name: fixtureName('X')},
            nameQueries[0]!,
        ])).observations).toMatchObject([{value: {collection: [{id: 'type-X'}]}}, {value: {collection: [{id: 'X'}]}}]);
        const collision: Component = {...element, id: 'fresh-X', provenance: {kind: 'constructed', originals: []}};
        expect(prepareDerivationContexts(request.input, {...request.candidate, additions: [collision]}).kind).toBe('input-error');
    });

    it('includes declared affiliates independently of effective substitution blocking and actual membership', () => {
        const request = helperAffiliationCase({headBlockRestriction: true, helperType: 'endpoint'});
        const prepared = contexts(request);
        const receipt = value(captureDependencyObservations(prepared, 'derivation', [
            {kind: 'reverse-affiliations', context: 'actual', head: 'H'},
            {kind: 'reverse-affiliations', context: 'proposed', head: 'H'},
        ]));
        expect(receipt.observations).toMatchObject([{value: {members: []}},
            {value: {members: [{id: 'c', facts: {type: {target: 'D'}}}], scope: 'direct-declared-affiliations', effectiveMembership: 'unresolved'}}]);
    });

    it('records raw and effective content independently without manufacturing normalized authority', () => {
        const prepared = contexts(rawAllHelperCase(true));
        const receipt = value(captureDependencyObservations(prepared, 'derivation', [
            {kind: 'component-property', context: 'proposed', component: 'D', property: 'raw-declared-content'},
            {kind: 'component-property', context: 'proposed', component: 'D', property: 'effective-content'},
        ]));
        expect(receipt.observations[0]!.descriptor).not.toEqual(receipt.observations[1]!.descriptor);
        expect(receipt.observations.map(o => o.value)).toEqual([
            {kind: 'element-only', roots: ['D/all']}, {kind: 'element-only', roots: ['D/all']},
        ]);
        expect(captureDependencyObservations(prepared, 'derivation', [
            {kind: 'normalized-view', context: 'proposed', component: 'D'},
        ])).toMatchObject({kind: 'unresolved', diagnostic: {code: 'missing-normalized-view-authority'}});
    });

    it('retains exact typed lexical, type and namespace contexts plus original owners', () => {
        const request = baselineRequest();
        const source = request.input.components[0]!.source;
        const attributes = ['left', 'right'].map(namespace => literalComponent(namespace, {
            kind: 'attribute', name: fixtureName(namespace), type: builtin('QName'), value: {kind: 'fixed',
                operand: {type: builtin('QName'), lexical: 'p:n', source: {...source, namespaces: {p: namespace}}}},
        }));
        const prepared = contexts(baselineRequest(attributes));
        const observations = value(captureDependencyObservations(prepared, 'derivation', attributes.map(c => ({
            kind: 'component-property', context: 'actual', component: c.id, property: 'typed-operands',
        })))).observations;
        expect(observations[0]!.value).toMatchObject({facts: {value: {operand: {lexical: 'p:n', type: builtin('QName'), source: {namespaces: {p: 'left'}}}}}});
        expect(observations[1]!.value).toMatchObject({facts: {value: {operand: {lexical: 'p:n', source: {namespaces: {p: 'right'}}}}}});
        expect(observations[0]!.value).not.toEqual(observations[1]!.value);
    });

    it('authenticates request and model identities despite equal printable keys and copies', () => {
        const request = baselineRequest(), first = contexts(request), second = contexts(request);
        const receipt = value(captureDependencyObservations(first, 'derivation', []));
        expect(validateDependencyObservationReceipt(first, 'derivation', receipt).kind).toBe('ok');
        expect(validateDependencyObservationReceipt(first, 'derivation', {...receipt}).kind).toBe('input-error');
        expect(validateDependencyObservationReceipt(second, 'derivation', receipt).kind).toBe('input-error');
        expect(validateDependencyObservationReceipt(first, 'schema-preserving', receipt).kind).toBe('input-error');
        expect(captureDependencyObservations({...first, proposed: {...first.proposed}}, 'derivation', []).kind).toBe('input-error');
        const preserving = value(prepareLiteralContexts(request.input, request.candidate));
        expect(value(captureDependencyObservations(preserving, 'schema-preserving', [])).model).toBe('schema-preserving');
        expect(validateDependencyObservationReceipt(preserving, 'schema-preserving', receipt).kind).toBe('input-error');
    });

    it('snapshots mutable descriptors and rejects malformed accessor data without invoking it', () => {
        const prepared = contexts(omitted());
        const query = {kind: 'global-name' as const, universe: 'actual' as const, role: 'element' as const, name: fixtureName('X')};
        const receipt = value(captureDependencyObservations(prepared, 'derivation', [query]));
        query.name = fixtureName('changed');
        expect(receipt.observations[0]!.descriptor).toMatchObject({name: fixtureName('X')});
        expect(Object.isFrozen(receipt.observations[0]!.descriptor)).toBe(true);
        let called = false;
        const accessor = Object.defineProperty({}, 'kind', {enumerable: true, get() { called = true; return 'global-enumeration'; }});
        expect(captureDependencyObservations(prepared, 'derivation', [accessor as DependencyDescriptor]).kind).toBe('input-error');
        expect(called).toBe(false);
        expect(captureDependencyObservations(prepared, 'derivation', [{...query, ignored: true} as DependencyDescriptor]).kind).toBe('input-error');
    });

    it('shares inclusive cumulative limits and returns no receipt after sticky exhaustion', () => {
        const request = omitted();
        const first = captureDependencyObservations(contexts(request), 'derivation', nameQueries);
        expect(first.kind).toBe('ok');
        const exact = contexts(request, {maxWork: first.usage.work, maxNodes: first.usage.nodes});
        expect(captureDependencyObservations(exact, 'derivation', nameQueries).kind).toBe('ok');
        const short = contexts(request, {maxWork: first.usage.work - 1});
        expect(captureDependencyObservations(short, 'derivation', nameQueries).kind).toBe('resource-limit');
        const again = captureDependencyObservations(short, 'derivation', []);
        expect(again.kind).toBe('resource-limit');
        expect(again).not.toHaveProperty('value');
    });

    it('observes coherent endpoint ancestry and finite shared references without expanding content', () => {
        const request = baselineRequest();
        const prepared = contexts(request);
        const receipt = value(captureDependencyObservations(prepared, 'derivation', [
            {kind: 'component-property', context: 'actual', component: 'D', property: 'facts'},
            {kind: 'component-property', context: 'proposed', component: 'D', property: 'facts'},
        ]));
        expect(receipt.observations).toMatchObject([{value: {base: symbol('B'), method: 'extension'}},
            {value: {base: symbol('T'), method: 'restriction'}}]);
    });
});
