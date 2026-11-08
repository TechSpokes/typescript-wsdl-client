/** Expectations supplied independently by the behavioral author before implementation. */
import {describe, expect, it} from 'vitest';
import {prepareDerivationContexts, prepareLiteralContexts, withContext} from './resolver-context.js';
import {createResolverBudget} from './resolver-budget.js';
import {checkSubstitution, checkTypeDerivation, effectiveSubstitutionMembers} from './resolver-relations.js';
import {helperAffiliationCase, rawAllHelperCase} from './helper-affiliation-case.js';
import {builtin, local, symbol} from './resolver-fixtures.js';
import type {Facts, Limits, Prepared, Result} from './resolver-types.js';

function value<T>(result: Result<T>): T {
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
    return result.value;
}
function prepared(options: Parameters<typeof helperAffiliationCase>[0] = {}): Prepared {
    const request = helperAffiliationCase(options);
    return value(prepareDerivationContexts(request.input, request.candidate));
}

describe('fresh affiliate helper projection, separate from whole-schema acceptance', () => {
    it('retains an intermediate type when final-type substitution introduces a blocked restriction', () => {
        const e = prepared({headBlockRestriction: true});
        const d = prepared({headBlockRestriction: true, helperType: 'endpoint'});
        expect(checkSubstitution(e.proposed, 'c', 'H', {mode: 'affiliation'}).kind).toBe('ok');
        expect(checkSubstitution(d.proposed, 'c', 'H', {mode: 'affiliation'}).kind).toBe('ok');
        expect(checkSubstitution(e.proposed, 'c', 'H', {mode: 'substitutability'}).kind).toBe('ok');
        expect(checkSubstitution(d.proposed, 'c', 'H', {mode: 'substitutability'}).kind).toBe('candidate-rejected');
        expect(value(effectiveSubstitutionMembers(e.proposed, 'H')).members).toEqual(['H', 'c']);
        expect(value(effectiveSubstitutionMembers(d.proposed, 'H')).members).toEqual(['H']);
        // The type conjunct of NameAndTypeOK passes for final local c:D -> c:E.
        expect(checkTypeDerivation(e.proposed, symbol('D'), local('new/E'), ['extension', 'list', 'union']).kind).toBe('ok');
    });

    it('uses an abstract bridge for immediate final without confusing it with ultimate block', () => {
        const direct = prepared({headFinalRestriction: true, helperType: 'endpoint'});
        const bridged = prepared({headFinalRestriction: true, helperType: 'endpoint', abstractBridge: true});
        expect(checkSubstitution(direct.proposed, 'c', 'H', {mode: 'affiliation'}).kind).toBe('candidate-rejected');
        expect(checkSubstitution(bridged.proposed, 'F', 'H', {mode: 'affiliation'}).kind).toBe('ok');
        expect(checkSubstitution(bridged.proposed, 'c', 'F', {mode: 'affiliation'}).kind).toBe('ok');
        expect(checkSubstitution(bridged.proposed, 'c', 'H', {mode: 'substitutability'}).kind).toBe('ok');
        expect(value(effectiveSubstitutionMembers(bridged.proposed, 'H')).members).toEqual(['H', 'c']);
        const blocked = prepared({headFinalRestriction: true, headBlockRestriction: true,
            helperType: 'endpoint', abstractBridge: true});
        expect(checkSubstitution(blocked.proposed, 'c', 'F', {mode: 'affiliation'}).kind).toBe('ok');
        expect(checkSubstitution(blocked.proposed, 'c', 'H', {mode: 'substitutability'}).kind).toBe('candidate-rejected');
    });

    it('preserves actual identities and anchors one coherent proposed endpoint without model fallback', () => {
        const request = helperAffiliationCase({headBlockRestriction: true});
        const before = JSON.stringify(request);
        const context = value(prepareDerivationContexts(request.input, request.candidate));
        expect(value(withContext(context.actual, access => access.component('c')))).toBeUndefined();
        expect(value(withContext(context.actual, access => access.component('D')))?.facts)
            .toMatchObject({base: {target: 'B'}, method: 'extension'});
        expect(value(withContext(context.proposed, access => access.component('D')))?.facts)
            .toMatchObject({base: {target: 'new/E'}, method: 'restriction'});
        expect(value(withContext(context.proposed, access => access.component('c')))?.identity.kind).toBe('global');
        expect(JSON.stringify(request)).toBe(before);
        expect(prepareLiteralContexts(request.input, request.candidate))
            .toMatchObject({kind: 'input-error', diagnostic: {code: 'addition-identity'}});
    });

    it('executes the raw-all helper expansion while leaving the full particle/scalar authority explicit', () => {
        const originalRequest = rawAllHelperCase(false), helperRequest = rawAllHelperCase(true);
        const original = value(prepareDerivationContexts(originalRequest.input, originalRequest.candidate));
        const helper = value(prepareDerivationContexts(helperRequest.input, helperRequest.candidate));
        expect(value(effectiveSubstitutionMembers(original.proposed, 'H')).members).toEqual(['H']);
        expect(value(effectiveSubstitutionMembers(helper.proposed, 'H')).members).toEqual(['H', 'c']);
        expect(checkSubstitution(helper.proposed, 'c', 'H', {mode: 'affiliation'}).kind).toBe('ok');
        const components = value(withContext(helper.proposed, access => {
            const ids = ['A/all', 'A/h', 'A/z', 'D/all', 'D/c', 'D/z', 'D/c-declaration', 'c', 'new/E'];
            return Object.fromEntries(ids.map(id => [id, access.component(id)!]));
        }));
        expect(components['A/all']!.facts).toMatchObject({term: 'all', occurs: {min: '1', max: '1'}, children: ['A/h', 'A/z']});
        expect(components['D/all']!.facts).toMatchObject({term: 'all', occurs: {min: '1', max: '1'}, children: ['D/c', 'D/z']});
        expect(components['A/h']!.facts).toMatchObject({reference: {target: 'H'}, occurs: {min: '0', max: '1'}});
        expect(components['D/c']!.facts).toMatchObject({occurs: {min: '1', max: '1'}});
        expect(components['new/E']!.facts).toMatchObject({content: {roots: ['A/all']}});
        const final = components['D/c-declaration']!.facts as Extract<Facts, {kind: 'element'}>;
        const affiliate = components['c']!.facts as Extract<Facts, {kind: 'element'}>;
        expect(final.name).toEqual(affiliate.name);
        expect(final.type).toEqual(builtin('token'));
        expect(affiliate.type).toEqual(builtin('string'));
        // Existing seven-builtin authority intentionally lacks token ancestry.
        // The independent primary trace supplies token -> normalizedString ->
        // string; no complete particle or schema verdict follows from this test.
        expect(checkTypeDerivation(helper.proposed, final.type, affiliate.type, ['extension', 'list', 'union']).kind)
            .toBe('unresolved');
    });

    it('charges preparation and all relation projections to one sticky request budget', () => {
        function run(limits?: Limits): {last: Result<unknown>; usage: {nodes: number; work: number}} {
            const request = helperAffiliationCase({headBlockRestriction: true});
            const budget = createResolverBudget(limits);
            let last: Result<unknown> = prepareDerivationContexts(request.input, request.candidate, undefined, budget);
            if (last.kind === 'ok') {
                const contexts = last.value as Prepared;
                last = checkTypeDerivation(contexts.proposed, symbol('D'), local('new/E'), ['extension', 'list', 'union']);
                if (last.kind === 'ok') last = checkSubstitution(contexts.proposed, 'c', 'H', {mode: 'affiliation'});
                if (last.kind === 'ok') last = checkSubstitution(contexts.proposed, 'c', 'H', {mode: 'substitutability'});
                if (last.kind === 'ok') last = effectiveSubstitutionMembers(contexts.proposed, 'H');
                if (last.kind === 'resource-limit') expect(withContext(contexts.proposed, () => 'partial')).toBe(last);
            }
            return {last, usage: {...last.usage}};
        }
        const complete = run();
        expect(complete.last.kind).toBe('ok');
        expect(run({maxNodes: complete.usage.nodes, maxWork: complete.usage.work}).last.kind).toBe('ok');
        expect(run({maxNodes: complete.usage.nodes, maxWork: complete.usage.work - 1}).last.kind).toBe('resource-limit');
        expect(run({maxNodes: complete.usage.nodes - 1}).last.kind).toBe('resource-limit');
    });
});
