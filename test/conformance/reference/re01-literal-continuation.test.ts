/** Independent component-projection controls; no external engine/full RE01 verdict. */
import {describe, expect, it} from 'vitest';
import {freshHelperCase} from '../../research/re01/fresh-helper-case.js';
import {prepareLiteralContexts, withContext} from '../../research/re01/resolver-context.js';
import {assessValidationObligations, checkCandidate} from '../../research/re01/resolver-validation.js';
import {synthesizeLiteralAu} from '../../research/re01/literal-au-synthesis.js';
import {literalMeasurements} from '../../research/re01/literal-measure.js';
import {Use} from '../../research/s06-au01/probe.js';

describe('RE01 literal continuation: independently specified projection boundary', () => {
    it('discovers the fresh string/token projection while retaining coherent original facts', () => {
        // Independent clauses: extension matches A's exact string identity;
        // token restricts string; fresh unconstrained E avoids original fixed 7.
        const {input, candidate, base, endpoint} = freshHelperCase('renamed-reference');
        const prepared = prepareLiteralContexts(input, candidate);
        expect(prepared.kind).toBe('ok');
        if (prepared.kind !== 'ok') throw new Error('Handwritten literal proposal must prepare');
        expect(synthesizeLiteralAu(base, endpoint)).toMatchObject({kind: 'literal-au-projection', admitted: true,
            plans: [{scalarType: 'string', constraint: 'absent'}]});
        const views = withContext(prepared.value.proposed, access => ({
            d: access.component('D')?.facts, a: access.component('A/g')?.identity,
            final: access.component('D/g')?.identity,
        }));
        expect(views).toMatchObject({kind: 'ok', value: {
            d: {method: 'restriction', base: {target: 'new/E'}},
            a: {kind: 'local', owner: 'A'}, final: {kind: 'local', owner: 'D'},
        }});
        expect(base[0]?.operand?.lexical).toBe('7');
        expect(endpoint[0]?.operand?.lexical).toBe('8');
    });

    it('does not promote the projection or D1 conditional owners to literal schema validity', () => {
        const {input, candidate} = freshHelperCase();
        const prepared = prepareLiteralContexts(input, candidate);
        expect(prepared.kind).toBe('ok');
        if (prepared.kind !== 'ok') throw new Error('Literal proposal must prepare');
        expect(assessValidationObligations(prepared.value.proposed, {}, prepared.value.actual))
            .toMatchObject({kind: 'unresolved', diagnostic: {code: 'literal-semantic-authorities', component: 'D'}});
        expect(checkCandidate(prepared.value, {actualRoot: 'D', proposedRoot: 'D',
            pairs: [['D', 'D'], ['D/g', 'D/g'], ['D/u', 'D/u']]}))
            .toMatchObject({kind: 'unresolved', diagnostic: {code: 'literal-semantic-authorities'}});
    });

    it('distinguishes unrelated scalar projection failure from whole-type nonexistence', () => {
        const name = ['urn:reference:scalar-contrast', 'g'] as const;
        const base = new Use('original-a', 'original-local-a', name, {scalarType: 'string'});
        const endpoint = new Use('original-d', 'original-local-d', name, {scalarType: 'integer'});
        expect(synthesizeLiteralAu([base], [endpoint])).toMatchObject({kind: 'literal-au-projection', admitted: false});
        // This scoped negative says nothing about arbitrary full constructions.
    });

    it('measures inclusive whole-request limits without publishing a partial plan on exhaustion', () => {
        const report = literalMeasurements();
        expect(report.success).toMatchObject({kind: 'prepared-literal-au-projection', admitted: true});
        expect(report.inclusive).toMatchObject({kind: 'prepared-literal-au-projection', admitted: true});
        expect(report.belowWork).toMatchObject({kind: 'resource-limit', limit: 'work'});
        expect(report.belowNodes).toMatchObject({kind: 'resource-limit', limit: 'nodes'});
        for (const failure of [report.belowWork, report.belowNodes]) {
            expect(failure).not.toHaveProperty('plans');
            expect(failure).not.toHaveProperty('admitted');
        }
        expect(report.success.usage.nodes).toBeLessThanOrEqual(report.defaultLimits.maxNodes);
        expect(report.success.usage.work).toBeLessThanOrEqual(report.defaultLimits.maxWork);
    });
});
