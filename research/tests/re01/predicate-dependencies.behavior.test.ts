import {describe, expect, it} from 'vitest';
import {prepareDerivationContexts} from './resolver-context.js';
import {baselineRequest, builtin, fixtureName, literalComponent, symbol} from './resolver-fixtures.js';
import {captureDependencyObservations, validateDependencyObservationReceipt} from './predicate-dependencies.js';
import type {DependencyDescriptor} from './predicate-dependencies.js';
import type {Component, Prepared, Result} from './resolver-types.js';

// Independent expectations precede this subject implementation:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/266#issuecomment-6111703056
function checked<T>(result: Result<T>): T {
    if (result.kind !== 'ok') throw new Error(`Expected structural observation, got ${JSON.stringify(result)}`);
    return result.value;
}

function represented(extra: readonly Component[] = [], omit: readonly string[] = []): Prepared {
    const request = baselineRequest(extra);
    return checked(prepareDerivationContexts(request.input, {
        ...request.candidate, retained: request.candidate.retained.filter(id => !omit.includes(id)),
    }));
}

function affiliations(): readonly Component[] {
    const head = literalComponent('H', {kind: 'element', name: fixtureName('H'), type: builtin('string'),
        abstract: false, nillable: false, final: [], block: ['substitution'], identityConstraints: []});
    const member = literalComponent('M', {kind: 'element', name: fixtureName('M'), type: builtin('string'),
        abstract: true, nillable: false, final: [], block: [], head: symbol('H', 'element'), identityConstraints: []});
    return [head, member];
}

describe('independent predicate observation controls', () => {
    it('keeps blocked and abstract declared affiliates while excluding omitted hypothetical members', () => {
        const prepared = represented(affiliations(), ['M']);
        const receipt = checked(captureDependencyObservations(prepared, 'derivation', [
            {kind: 'reverse-affiliations', context: 'actual', head: 'H'},
            {kind: 'reverse-affiliations', context: 'proposed', head: 'H'},
            {kind: 'global-name', universe: 'reserved-originals', role: 'element', name: fixtureName('M')},
            {kind: 'global-name', universe: 'proposed', role: 'element', name: fixtureName('M')},
        ]));
        expect(receipt).toMatchObject({domainAcceptance: 'policy-accepted', domainContract: 'RE01-derivation-B-v1',
            qualification: 'declared-structural-observations-only'});
        expect(receipt.observations).toMatchObject([
            {value: {members: [{id: 'M', facts: {abstract: true}}], scope: 'direct-declared-affiliations', effectiveMembership: 'unresolved'}},
            {value: {members: [], effectiveMembership: 'unresolved'}},
            {value: {collection: [{id: 'M'}], semanticLookup: 'unresolved'}},
            {value: {collection: [], collectionCompleteness: 'selected-represented-universe', semanticLookup: 'unresolved'}},
        ]);
    });

    it('does not convert positive structural observations into a partial receipt when a later owner is absent', () => {
        const prepared = represented(affiliations());
        const result = captureDependencyObservations(prepared, 'derivation', [
            {kind: 'global-enumeration', universe: 'actual', role: 'element'},
            {kind: 'component-property', context: 'proposed', component: 'D', property: 'raw-declared-content'},
            {kind: 'normalized-view', context: 'proposed', component: 'D'},
        ]);
        expect(result).toMatchObject({kind: 'unresolved', diagnostic: {code: 'missing-normalized-view-authority'}});
        expect(result).not.toHaveProperty('value');
        const structural = checked(captureDependencyObservations(prepared, 'derivation', [
            {kind: 'component-property', context: 'proposed', component: 'D', property: 'raw-declared-content'},
            {kind: 'component-property', context: 'proposed', component: 'D', property: 'effective-content'},
        ]));
        expect(structural.observations[0]!.descriptor).not.toEqual(structural.observations[1]!.descriptor);
        expect(structural.qualification).toBe('declared-structural-observations-only');
    });

    it('binds negative collection observations to the exact request and candidate even for matching keys', () => {
        const omitted = represented(affiliations(), ['M']);
        const retained = represented(affiliations());
        const descriptors: readonly DependencyDescriptor[] = [
            {kind: 'global-name', universe: 'proposed', role: 'element', name: fixtureName('M')},
        ];
        const receipt = checked(captureDependencyObservations(omitted, 'derivation', descriptors));
        expect(receipt.observations).toMatchObject([{value: {collection: []}}]);
        expect(validateDependencyObservationReceipt(omitted, 'derivation', receipt).kind).toBe('ok');
        expect(validateDependencyObservationReceipt(retained, 'derivation', receipt)).toMatchObject({kind: 'input-error'});
        expect(validateDependencyObservationReceipt(omitted, 'derivation', {...receipt})).toMatchObject({kind: 'input-error'});
        expect(validateDependencyObservationReceipt(omitted, 'schema-preserving', receipt)).toMatchObject({kind: 'input-error'});
        const positive = checked(captureDependencyObservations(retained, 'derivation', descriptors));
        expect(positive.observations).toMatchObject([{value: {collection: [{id: 'M'}]}}]);
    });

    it('preserves lexical source bindings independently of component source and snapshots the requested property', () => {
        const source = baselineRequest().input.components[0]!.source;
        const attr = literalComponent('Q', {kind: 'attribute', name: fixtureName('Q'), type: builtin('QName'),
            value: {kind: 'fixed', operand: {type: builtin('QName'), lexical: 'p:value',
                source: {...source, namespaces: {p: 'urn:operand'}}}}});
        const prepared = represented([{...attr, source: {...source, namespaces: {p: 'urn:declaration'}}}]);
        const descriptor = {kind: 'component-property' as const, context: 'actual' as const, component: 'Q', property: 'typed-operands' as const};
        const receipt = checked(captureDependencyObservations(prepared, 'derivation', [descriptor]));
        descriptor.component = 'D';
        expect(receipt.observations).toMatchObject([{descriptor: {component: 'Q'}, value: {
            facts: {value: {operand: {lexical: 'p:value', source: {namespaces: {p: 'urn:operand'}}}}},
            source: {namespaces: {p: 'urn:declaration'}},
        }}]);
        expect(Object.isFrozen(receipt.observations[0]!.descriptor)).toBe(true);
    });
});
