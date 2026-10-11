/** Expectations fixed independently in RE01-independent-behavior-2026-10-11-v1. */
import {describe, expect, it} from 'vitest';
import {createResolverBudget} from './resolver-budget.js';
import {contextConstructionModel, isLiteralContext, prepareDerivationContexts, prepareLiteralContexts, withContext} from './resolver-context.js';
import {baselineRequest, fixtureName, literalComponent, symbol, typeFacts} from './resolver-fixtures.js';
import {MODEL_SELECTION_CONTRACT, REVISED_MODEL_ACCEPTED, runModelExperiment} from './model-selection.js';
import type {Component} from './resolver-types.js';

function affiliationRequest() {
    const h = literalComponent('H', {kind: 'element', name: fixtureName('H'), type: symbol('B'),
        nillable: false, abstract: false, final: [], block: [], identityConstraints: []});
    const m = literalComponent('M', {kind: 'element', name: fixtureName('M'), type: symbol('D'), head: symbol('H', 'element'),
        nillable: false, abstract: false, final: [], block: [], identityConstraints: []});
    const request = baselineRequest([h, m]);
    return {...request, candidate: {...request.candidate, retained: request.candidate.retained.filter(id => id !== 'M')}};
}

describe('RE01 explicit research model supplied-candidate experiment', () => {
    it('requires explicit selection while reviewed full-model acceptance is pending', () => {
        expect(REVISED_MODEL_ACCEPTED).toBe(false);
        expect(() => runModelExperiment(baselineRequest(), 'unknown' as 'derivation')).toThrow('Explicit RE01 research model required');
    });

    it('reports structural preparation as unresolved with model/version context isolation', () => {
        const request = baselineRequest();
        const before = JSON.stringify(request);
        const derivation = runModelExperiment(request, 'derivation');
        const preserving = runModelExperiment(request, 'schema-preserving');
        for (const report of [derivation, preserving]) {
            expect(report).toMatchObject({kind: 'unresolved', selection: 'explicit', contractVersion: MODEL_SELECTION_CONTRACT,
                semanticVerdict: 'unresolved', existentialVerdict: 'unresolved', actualSchemaVerdict: 'unresolved',
                diagnostic: {code: 'missing-complete-semantic-authority'}, receipt: {actualQualification: 'structural-only',
                    proposedQualification: 'structural-only', locality: 'dependency-transfer-unresolved', attributes: 'literal-component-properties'}});
            expect(report.receipt?.actualContext).toContain(`${MODEL_SELECTION_CONTRACT}/${report.model}/`);
            expect(report.receipt?.proposedContext).toContain(`${MODEL_SELECTION_CONTRACT}/${report.model}/`);
        }
        expect(derivation.receipt?.proposedContext).not.toBe(preserving.receipt?.proposedContext);
        expect(JSON.stringify(request)).toBe(before);
    });

    it('keeps whole actual Γ and explicit incoming affiliation boundary when the proposal omits M', () => {
        const request = affiliationRequest();
        const report = runModelExperiment(request, 'derivation');
        expect(report).toMatchObject({kind: 'unresolved', model: 'derivation', receipt: {
            actualMembers: ['A', 'B', 'D', 'H', 'M', 'T'], proposedMembers: ['A', 'B', 'D', 'H', 'T'],
            excludedIncoming: expect.arrayContaining([{owner: 'M', slot: 'head', target: 'H'}]),
            locality: 'dependency-transfer-unresolved'}});
        const preserving = runModelExperiment(request, 'schema-preserving');
        expect(preserving).toMatchObject({model: 'schema-preserving', kind: 'input-error',
            diagnostic: {code: 'literal-original-omitted'}, semanticVerdict: 'unresolved',
            existentialVerdict: 'unresolved', actualSchemaVerdict: 'unresolved'});
        expect(preserving.receipt).toBeUndefined();
    });

    it('authenticates models and keeps derivation contexts on the literal AU seam', () => {
        const request = affiliationRequest();
        const derivation = prepareDerivationContexts(request.input, request.candidate);
        expect(derivation.kind).toBe('ok');
        if (derivation.kind !== 'ok') return;
        expect(contextConstructionModel(derivation.value.actual)).toBe('derivation');
        expect(contextConstructionModel(derivation.value.proposed)).toBe('derivation');
        expect(contextConstructionModel({...derivation.value.proposed})).toBeUndefined();
        expect(isLiteralContext(derivation.value.proposed)).toBe(true);
        const actual = withContext(derivation.value.actual, access => access.component('M'));
        expect(actual).toMatchObject({kind: 'ok', value: {id: 'M', facts: {type: {target: 'D'}, head: {target: 'H'}}}});
        const baseline = baselineRequest();
        const preserving = prepareLiteralContexts(baseline.input, baseline.candidate);
        expect(preserving.kind).toBe('ok');
        if (preserving.kind === 'ok') expect(contextConstructionModel(preserving.value.proposed)).toBe('schema-preserving');
    });

    it('anchors endpoint raw, source, identity and non-derivation facts in both models', () => {
        const request = baselineRequest();
        const changes: readonly Partial<Component>[] = [{source: {...request.candidate.endpointDefinition.source, digest: 'changed'}},
            {facts: {...typeFacts(symbol('T')), abstract: true}},
            {sourceUses: [{kind: 'local-prohibition', owner: 'D', origin: '/added', name: fixtureName('q'),
                role: 'direct-prohibition', source: request.candidate.endpointDefinition.source, representationChecks: []}]}];
        for (const model of ['derivation', 'schema-preserving'] as const) for (const change of changes) {
            const report = runModelExperiment({...request, candidate: {...request.candidate,
                endpointDefinition: {...request.candidate.endpointDefinition, ...change}}}, model);
            expect(report).toMatchObject({model, kind: 'input-error', diagnostic: {code: 'literal-endpoint-preservation'}});
            expect(report.receipt).toBeUndefined();
        }
    });

    it('honors inclusive component/work bounds and sticky shared exhaustion with no partial receipt', () => {
        const request = baselineRequest();
        const first = runModelExperiment(request, 'derivation');
        expect(first.kind).toBe('unresolved');
        const exact = runModelExperiment(request, 'derivation', {maxNodes: 4, maxWork: first.usage.work});
        expect(exact).toMatchObject({kind: 'unresolved', usage: {nodes: 4, work: first.usage.work}});
        const below = runModelExperiment(request, 'derivation', {maxWork: first.usage.work - 1});
        expect(below.kind).toBe('resource-limit');
        expect(below.receipt).toBeUndefined();
        expect(runModelExperiment(request, 'schema-preserving', {maxNodes: 3})).toMatchObject({kind: 'resource-limit', model: 'schema-preserving'});
        const budget = createResolverBudget({maxNodes: 4});
        expect(runModelExperiment(request, 'derivation', undefined, budget).kind).toBe('unresolved');
        const exhausted = runModelExperiment(request, 'schema-preserving', undefined, budget);
        expect(exhausted.kind).toBe('resource-limit');
        const work = exhausted.usage.work;
        const repeated = runModelExperiment(request, 'derivation', undefined, budget);
        expect(repeated).toMatchObject({kind: 'resource-limit', usage: {nodes: 4, work}});
        expect(repeated.receipt).toBeUndefined();
    });
});
