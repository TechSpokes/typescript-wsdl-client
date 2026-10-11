import {describe, expect, it} from 'vitest';
import {Operand, Use} from '../s06-au01/probe.js';
import {synthesizeLiteralAu} from './literal-au-synthesis.js';
import {createResolverBudget} from './resolver-budget.js';

// Independent expectations: an exact A scalar/name supplies cos-ct-extends.1.2;
// optional unconstrained fresh uses remove required/fixed final-restriction
// hurdles; token is a restriction of string, integer is unrelated to string;
// universal skip wildcard admits endpoint-only names. This is a fresh-E AU
// projection, not full type construction, original source mapping or RE01.
function use(identity: string, declaration: string, scalarType: string,
    name: readonly [string, string], lexical?: string, required = false): Use {
    return new Use(identity, declaration, name, {scalarType, required,
        kind: lexical === undefined ? 'none' : 'fixed',
        ...(lexical === undefined ? {} : {operand: new Operand(scalarType, lexical)}),
    });
}
const g = ['urn:independent:synthesis', 'g'] as const;

describe('#234 independently specified literal fresh-AU synthesis', () => {
    it.each([
        ['A/u', 'D/u', '7', '8', 'urn:independent:synthesis', 'g'],
        ['old/renamed', 'final/renamed', 'source-fixed', 'endpoint-fixed', 'urn:renamed', 'restored'],
    ] as const)('finds the fresh unconstrained string projection for %s and %s',
        (ancestorId, endpointId, ancestorFixed, endpointFixed, namespace, local) => {
            const name = [namespace, local] as const;
            const base = use(ancestorId, 'original-ancestor-declaration', 'string', name, ancestorFixed);
            const endpoint = use(endpointId, 'original-final-declaration', 'token', name, endpointFixed);
            const before = [base.operand?.lexical, endpoint.operand?.lexical];
            const result = synthesizeLiteralAu([base], [endpoint]);
            expect(result).toMatchObject({kind: 'literal-au-projection', admitted: true, wildcard: 'any-skip', plans: [{
                name, originalDeclaration: 'original-ancestor-declaration', scalarType: 'string',
                required: false, constraint: 'absent',
            }]});
            expect([base.operand?.lexical, endpoint.operand?.lexical]).toEqual(before);
            // Choosing A's fixed original use fails fixed comparison, while
            // choosing D's token original use fails exact extension identity.
            // Neither original use has the specified fresh plan's properties.
            expect([base.scalarType, base.kind, endpoint.scalarType, endpoint.kind])
                .toEqual(['string', 'fixed', 'token', 'fixed']);
        });

    it.each([
        ['string', 'token', true],
        ['string', 'string', true],
        ['string', 'integer', false],
        ['integer', 'string', false],
        ['QName', 'integer', false],
    ] as const)('compares ancestor %s with endpoint %s scalar relationship', (baseType, endpointType, admitted) => {
        const result = synthesizeLiteralAu([use('A/u', 'A/g', baseType, g)],
            [use('D/u', 'D/g', endpointType, g)]);
        expect(result).toMatchObject({kind: 'literal-au-projection', admitted});
        // These are separately declared builtin ancestry facts, not expected
        // values obtained by invoking the subject's scalar restriction helper.
    });

    it('allows endpoint omission of a fresh optional name and preserves original required fixed value', () => {
        const original = use('A/required', 'A/g', 'string', g, '7', true);
        expect(synthesizeLiteralAu([original], [])).toMatchObject({kind: 'literal-au-projection', admitted: true,
            plans: [{name: g, scalarType: 'string', required: false, constraint: 'absent'}]});
        expect([original.required, original.kind, original.operand?.lexical]).toEqual([true, 'fixed', '7']);
    });

    it('admits final-only names through the declared any-skip wildcard', () => {
        const endpoint = use('D/new', 'D/new-declaration', 'integer', ['urn:final-only', 'new'], '8');
        expect(synthesizeLiteralAu([], [endpoint])).toEqual({kind: 'literal-au-projection', admitted: true,
            plans: [], wildcard: 'any-skip'});
    });

    it('uses one fresh declaration/use pair for a shared original QName/declaration class', () => {
        const first = use('A/use-one', 'original-shared-declaration', 'string', g, '7');
        const second = use('A/use-two', 'original-shared-declaration', 'string', g, '8');
        const result = synthesizeLiteralAu([first, second], [use('D/u', 'D/g', 'token', g, '9')]);
        expect(result).toMatchObject({kind: 'literal-au-projection', admitted: true, plans: [{
            name: g, originalDeclaration: 'original-shared-declaration', scalarType: 'string',
            required: false, constraint: 'absent',
        }]});
        if (result.kind !== 'literal-au-projection') throw new Error('Qualified shared original class must produce a plan');
        expect(result.plans).toHaveLength(1);
        expect([first.operand?.lexical, second.operand?.lexical]).toEqual(['7', '8']);
    });

    it('rejects distinct original declarations for the same QName before weakening constraints', () => {
        const result = synthesizeLiteralAu([
            use('A/one', 'different-declaration-one', 'string', g, '7'),
            use('A/two', 'different-declaration-two', 'string', g, '8'),
        ], []);
        expect(result).toEqual({kind: 'invalid-original', rule: 'ct-props-correct'});
    });

    it('qualifies malformed original operands even when the endpoint omits their name', () => {
        expect(synthesizeLiteralAu([use('A/bad', 'A/g', 'integer', g, 'not-an-integer')], []))
            .toEqual({kind: 'invalid-original', rule: 'integer-operand'});
        const absentOperand = new Use('A/missing', 'A/g', g, {kind: 'fixed', scalarType: 'integer'});
        expect(synthesizeLiteralAu([absentOperand], []))
            .toEqual({kind: 'invalid-original', rule: 'missing-original-operand'});
    });

    it('qualifies final operands even when the ancestor has no names', () => {
        expect(synthesizeLiteralAu([], [use('D/bad', 'D/g', 'integer', g, 'invalid')]))
            .toEqual({kind: 'invalid-original', rule: 'integer-operand'});
    });

    it('reports unavailable named-scalar qualification as unresolved', () => {
        expect(synthesizeLiteralAu([use('A/custom', 'A/g', 'user-defined-facet-type', g)], []))
            .toEqual({kind: 'unresolved', rule: 'literal-au-named-scalar-domain'});
        expect(synthesizeLiteralAu([], [use('D/custom', 'D/g', 'user-defined-facet-type', g)]))
            .toEqual({kind: 'unresolved', rule: 'literal-au-named-scalar-domain'});
    });

    it('preserves original operand scalar contexts instead of changing them to the declaration label', () => {
        const inconsistentContext = new Use('A/context', 'A/g', g, {scalarType: 'string', kind: 'fixed',
            operand: new Operand('token', ' 7 ')});
        expect(synthesizeLiteralAu([inconsistentContext], []))
            .toEqual({kind: 'unresolved', rule: 'literal-au-original-scalar-context'});
        expect([inconsistentContext.scalarType, inconsistentContext.operand?.type, inconsistentContext.operand?.lexical])
            .toEqual(['string', 'token', ' 7 ']);
    });

    it('challenges 64 independently specified scalar, requiredness and fixed-value variants under one budget', () => {
        const scalars = ['string', 'token', 'integer', 'QName'] as const;
        // Rows are ancestor types, columns are endpoint types. The entries are
        // independently declared builtin ancestry, not subject helper results.
        const expected = {
            string: {string: true, token: true, integer: false, QName: false},
            token: {string: false, token: true, integer: false, QName: false},
            integer: {string: false, token: false, integer: true, QName: false},
            QName: {string: false, token: false, integer: false, QName: true},
        } as const;
        const shared = createResolverBudget({maxNodes: 128});
        let cases = 0;
        for (const ancestorType of scalars) for (const endpointType of scalars)
            for (const required of [false, true]) for (const constraint of ['none', 'fixed'] as const) {
                const name = ['urn:bounded:' + constraint + ':' + required,
                    'field_' + ancestorType + '_' + endpointType] as const;
                const ancestorFixed = constraint === 'none' ? undefined : ancestorType === 'integer' ? '7' : 'sourceFixed';
                const endpointFixed = constraint === 'none' ? undefined : endpointType === 'integer' ? '8' : 'endpointFixed';
                const ancestor = use('bounded/A', 'bounded/A-declaration', ancestorType, name, ancestorFixed, required);
                const endpoint = use('bounded/D', 'bounded/D-declaration', endpointType, name, endpointFixed, !required);
                const result = synthesizeLiteralAu([ancestor], [endpoint], shared);
                expect(result, JSON.stringify({ancestorType, endpointType, required, constraint})).toMatchObject({
                    kind: 'literal-au-projection', admitted: expected[ancestorType][endpointType], wildcard: 'any-skip',
                    plans: [{name, scalarType: ancestorType, required: false, constraint: 'absent'}],
                });
                expect([ancestor.operand?.lexical, endpoint.operand?.lexical]).toEqual([ancestorFixed, endpointFixed]);
                cases++;
            }
        expect(cases).toBe(64);
        expect(shared.exhausted()).toBe(false);
        // Finite challenge coverage establishes only this qualified projection;
        // an admitted=false row is no whole-type or unrestricted RE01 negative.
    });

    it('honors inclusive shared work/node limits and sticky exhaustion', () => {
        const base = [use('A/g', 'A/g-declaration', 'string', g, '7'),
            use('A/h', 'A/h-declaration', 'integer', ['urn:other', 'h'], '10')];
        const endpoint = [use('D/g', 'D/g-declaration', 'token', g, '8')];
        const measured = createResolverBudget();
        expect(synthesizeLiteralAu(base, endpoint, measured)).toMatchObject({kind: 'literal-au-projection', admitted: true});
        const {work, nodes} = measured.usage();
        expect(nodes).toBe(4); // Two promised semantic declaration/use pairs.
        expect(synthesizeLiteralAu(base, endpoint, createResolverBudget({maxWork: work, maxNodes: nodes})))
            .toMatchObject({kind: 'literal-au-projection', admitted: true});
        const limitedWork = createResolverBudget({maxWork: work - 1});
        expect(synthesizeLiteralAu(base, endpoint, limitedWork).kind).toBe('resource-limit');
        expect(synthesizeLiteralAu([], [], limitedWork).kind).toBe('resource-limit');
        const limitedNodes = createResolverBudget({maxNodes: nodes - 1});
        expect(synthesizeLiteralAu(base, endpoint, limitedNodes).kind).toBe('resource-limit');
        expect(synthesizeLiteralAu([], [], limitedNodes).kind).toBe('resource-limit');
    });
});
