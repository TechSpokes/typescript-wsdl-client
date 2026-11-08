import { describe, expect, it } from 'vitest';
import { Budget, Operand, Use, ProbeFailure, conditionalConstraints, conditionalC1Augmentation, sameValue, unionUses, replacementRestrictionAttributes, literalRestrictionAttributes } from './probe.js';
import type { Value, FailureCategory, UseOptions } from './probe.js';
import { restrictionFixture } from './fixture-input.js';
const STATES = ['none', 'default-one', 'default-two', 'fixed-one', 'fixed-two'] as const;
const ROWS: Record<string, readonly (readonly [
    string,
    string
])[]> = {
    none: [['any', 'absent'], ['any', '1'], ['any', '2'], ['1', '1'], ['2', '2']],
    'default-one': [['any', '1'], ['any', '1'], ['any', 'conflict'], ['1', '1'], ['2', 'conflict']],
    'default-two': [['any', '2'], ['any', 'conflict'], ['any', '2'], ['1', 'conflict'], ['2', '2']],
    'fixed-one': [['1', '1'], ['1', '1'], ['1', 'conflict'], ['1', '1'], ['none', 'conflict']],
    'fixed-two': [['2', '2'], ['2', 'conflict'], ['2', '2'], ['none', 'conflict'], ['2', '2']],
};
const use = (identity: string, state: typeof STATES[number], required = false) => new Use(identity, 'global-a', ['urn:s06:au01', 'a'], { required, kind: state.split('-')[0] as UseOptions['kind'], operand: state === 'none' ? undefined : new Operand('integer', state.endsWith('one') ? '1' : '2') });
const fail = (category: FailureCategory, fn: () => unknown) => { try {
    fn();
    throw new Error('Expected failure ' + category);
}
catch (error) {
    expect(error).toBeInstanceOf(ProbeFailure);
    expect((error as ProbeFailure).category).toBe(category);
} };
const label = (v: Value, phase: 'present' | 'absent') => typeof v !== 'string' ? v[1] : v === 'type-space' ? 'any' : v === 'augmentation-conflict' ? 'conflict' : v;
describe('AU01 pure legacy contract', () => {
    it('all_25_optional_combinations_both_orderings', () => {
        for (const a of STATES)
            for (const [index, b] of STATES.entries()) {
                const result = conditionalConstraints([use('base', a), use('local', b)], new Budget());
                expect(result.status).toBe('conditional-C');
                expect([label(result.present, 'present'), label(result.absent, 'absent')]).toEqual(ROWS[a][index]);
                expect(result.proposedC1Absent).toBe(ROWS[a][index][1] === 'conflict' ? 'invalid-value' : 'accepted');
                expect(result.required).toBe(false);
                expect(result.originals).toHaveLength(2);
            }
    });
    it('required_optional_and_fixed_conflicts_do_not_prove_schema_invalid', () => {
        for (const [a, b] of [[true, false], [false, true], [true, true]])
            expect(conditionalConstraints([use('base', 'fixed-one', a), use('local', 'fixed-two', b)], new Budget())).toMatchObject({ required: true, absent: 'reject-required', present: 'none', status: 'conditional-C' });
        for (const [a, b] of [['fixed-one', 'none'], ['none', 'fixed-one']] as const)
            for (const [x, y] of [[true, false], [false, true]])
                expect(conditionalConstraints([use('base', a, x), use('local', b, y)], new Budget())).toMatchObject({ present: ['decimal', '1'], absent: 'reject-required' });
    });
    it('identity_rules_separate_declaration_and_use_identity', () => {
        const a = use('first', 'none'), b = use('second', 'none');
        expect(unionUses([a, a], 'attributeGroup', new Budget())).toEqual([a]);
        expect(unionUses([a, b], 'complexType', new Budget())).toEqual([a, b]);
        fail('invalid-schema', () => unionUses([a, b], 'attributeGroup', new Budget()));
        fail('invalid-schema', () => unionUses([a, new Use('third', 'other-local', a.name)], 'complexType', new Budget()));
        fail('invalid-schema', () => unionUses([new Use('first-ID', 'ID-a', ['', 'a'], { idDerived: true }), new Use('second-ID', 'ID-b', ['', 'b'], { idDerived: true })], 'complexType', new Budget()));
        fail('invalid-schema', () => conditionalConstraints([use('required-default', 'default-one', true)], new Budget()));
        const inherited = new Use('required-global-default', 'global-a', a.name, { required: true, kind: 'default', operand: new Operand('integer', '1'), constraintOrigin: 'declaration' });
        expect(conditionalConstraints([inherited], new Budget()).absent).toBe('reject-required');
        expect(() => conditionalConstraints([a, new Use('other', 'other', ['', 'other'])], new Budget())).toThrow('one QName/declaration');
        fail('invalid-schema', () => unionUses([a, use('first', 'none')], 'complexType', new Budget()));
    });
    it('original_context_value_equivalence_independent_expectations', () => {
        const cases: readonly (readonly [
            Operand,
            Operand,
            boolean
        ])[] = [
            [new Operand('integer', '+0001'), new Operand('integer', '1'), true],
            [new Operand('integer', '-0'), new Operand('integer', '0'), true],
            [new Operand('integer', '9007199254740993'), new Operand('integer', '9007199254740992'), false],
            [new Operand('string', ' a '), new Operand('string', 'a'), false],
            [new Operand('token', ' a \t b '), new Operand('token', 'a b'), true],
            [new Operand('QName', 'p:item', [['p', 'urn:one']]), new Operand('QName', 'q:item', [['q', 'urn:one']]), true],
            [new Operand('QName', 'p:item', [['p', 'urn:one']]), new Operand('QName', 'p:item', [['p', 'urn:two']]), false],
            [new Operand('QName', 'item', [['', 'urn:one']]), new Operand('QName', 'q:item', [['q', 'urn:one']]), true],
            [new Operand('list', '+01 2', [], ['integer']), new Operand('list', '1 02', [], ['integer']), true],
            [new Operand('list', '1 2', [], ['integer']), new Operand('list', '2 1', [], ['integer']), false],
            [new Operand('union', '+01', [], ['integer', 'string']), new Operand('integer', '1'), true],
            [new Operand('union', '+01', [], ['string', 'integer']), new Operand('integer', '1'), false],
            [new Operand('union', 'item', [], ['integer', 'string']), new Operand('string', 'item'), true],
            [new Operand('union', ' a ', [], ['integer', 'string']), new Operand('string', ' a '), true],
            [new Operand('union', ' a ', [], ['string', 'integer']), new Operand('string', 'a'), false],
        ];
        for (const [a, b, expected] of cases)
            expect(sameValue(a, b, new Budget())).toBe(expected);
        fail('invalid-schema', () => sameValue(new Operand('QName', 'p:item'), new Operand('string', 'item'), new Budget()));
        fail('unsupported-capability', () => sameValue(new Operand('date', '-0001-01-01'), new Operand('date', '-0001-01-01'), new Budget()));
    });
    it('budget_nodes_work_copying_and_large_exact_operands', () => {
        const a = use('x', 'fixed-one');
        expect(unionUses(Array(100000).fill(a), 'complexType', new Budget(100000, 5000000))).toHaveLength(1);
        fail('resource-limit', () => unionUses(Array(100001).fill(a), 'complexType', new Budget()));
        const measured = new Budget();
        conditionalConstraints([a], measured);
        const at = new Budget(100000, measured.work);
        conditionalConstraints([a], at);
        expect(at.work).toBe(measured.work);
        const below = new Budget(100000, measured.work - 1);
        fail('resource-limit', () => conditionalConstraints([a], below));
        expect(below.work).toBeLessThanOrEqual(measured.work - 1);
        const million = new Budget();
        million.charge(1000000);
        fail('resource-limit', () => million.charge());
        const edge = '9'.repeat(83331), atDefault = new Budget();
        atDefault.charge(2);
        expect(sameValue(new Operand('integer', edge), new Operand('integer', edge), atDefault)).toBe(true);
        expect(atDefault.work).toBe(1000000);
        const larger = '9'.repeat(83332), beyondDefault = new Budget();
        beyondDefault.charge(2);
        fail('resource-limit', () => sameValue(new Operand('integer', larger), new Operand('integer', larger), beyondDefault));
        expect(beyondDefault.work).toBeLessThanOrEqual(1000000);
        const large = '9'.repeat(10000);
        expect(sameValue(new Operand('integer', '+0' + large), new Operand('integer', large), new Budget())).toBe(true);
        fail('resource-limit', () => sameValue(new Operand('integer', large), new Operand('integer', large), new Budget(100000, 10)));
        const namespace = 'urn:' + 'x'.repeat(10000);
        expect(sameValue(new Operand('QName', 'p:a', [['p', namespace]]), new Operand('QName', 'q:a', [['q', namespace]]), new Budget())).toBe(true);
        fail('resource-limit', () => sameValue(new Operand('QName', 'p:a', [['p', namespace]]), new Operand('QName', 'q:a', [['q', namespace]]), new Budget(100000, 100)));
    });
    it('restriction_source_replacement_all_matches_independent_matrix', () => {
        const cases: Record<string, readonly [
            boolean,
            boolean
        ]> = {
            'required-first-optional-replacement': [false, false], 'required-second-optional-replacement': [false, false],
            'required-first-required-replacement': [true, true], 'required-second-required-replacement': [true, true],
            'fixed-conflict-first-one-replacement': [false, false], 'fixed-conflict-second-one-replacement': [false, false],
            'fixed-equivalent-first-one-replacement': [true, true], 'fixed-equivalent-second-one-replacement': [true, true],
            'fixed-conflict-omitted': [true, false], 'required-mixed-omitted': [true, false],
            'fixed-conflict-prohibited': [true, true], 'required-mixed-prohibited': [false, false],
            'fixed-conflict-group-prohibited': [true, false], 'default-conflict-default-replacement': [true, true],
            'fixed-none-one-replacement': [true, true], 'fixed-none-unfixed-replacement': [false, false],
            'type-token': [true, true], 'type-unrelated': [false, false], 'qname-equivalent': [true, true], 'qname-distinct': [false, false],
        };
        for (const [name, expected] of Object.entries(cases)) {
            const { bases, locals, prohibited } = restrictionFixture('test/conformance/fixtures/xsd/attributes/au01/restriction-matches-' + name + '.xsd');
            for (const [i, fn] of [replacementRestrictionAttributes, literalRestrictionAttributes].entries()) {
                const options = { directProhibitions: prohibited };
                if (expected[i]) {
                    const result = fn(bases, locals, new Budget(), options);
                    expect(result.originalBases).toEqual(bases);
                    if (name.endsWith('omitted') || name.endsWith('group-prohibited')) {
                        expect(result.effective).toEqual(bases);
                        result.effective.forEach((actual, i) => expect(actual).toBe(bases[i]));
                    }
                }
                else
                    fail('invalid-schema', () => fn(bases, locals, new Budget(), options));
            }
        }
    });
    it('restriction_wildcard_does_not_bypass_matching_originals_or_source_role', () => {
        const first = use('first', 'fixed-one'), extra = use('extra', 'fixed-two');
        fail('invalid-schema', () => replacementRestrictionAttributes([first], [extra], new Budget(), { wildcardNamespaces: ['*'] }));
        expect(replacementRestrictionAttributes([first, extra], [], new Budget())).toMatchObject({ effective: [first, extra], pairCount: 0 });
        fail('invalid-schema', () => replacementRestrictionAttributes([first, extra], [first, extra], new Budget()));
        const n = new Use('new', 'new-global', ['urn:new', 'b']);
        fail('invalid-schema', () => replacementRestrictionAttributes([first], [n], new Budget()));
        expect(replacementRestrictionAttributes([first], [n], new Budget(), { wildcardNamespaces: ['urn:new'] }).effective).toEqual([n, first]);
    });
    it('restriction_finite_pair_search_preallocation_and_work_limits', () => {
        const bases = [use('one', 'fixed-one'), use('two', 'fixed-one', true)], local = [use('local', 'fixed-one', true)], measured = new Budget(3);
        expect(replacementRestrictionAttributes(bases, local, measured).pairCount).toBe(2);
        replacementRestrictionAttributes(bases, local, new Budget(3, measured.work));
        const exhausted = new Budget(100000, measured.work - 1);
        fail('resource-limit', () => replacementRestrictionAttributes(bases, local, exhausted));
        expect(exhausted.work).toBeLessThanOrEqual(measured.work - 1);
        const nodes = new Budget(2);
        fail('resource-limit', () => replacementRestrictionAttributes(bases, local, nodes));
        expect(nodes.work).toBe(0);
        const manyBases = Array.from({ length: 4000 }, (_, i) => use('base-' + i, 'none'));
        expect(replacementRestrictionAttributes(manyBases, [use('local', 'none')], new Budget()).pairCount).toBe(4000);
        const manyLocals = Array.from({ length: 4000 }, (_, i) => use('local-' + i, 'none')), finite = new Budget();
        fail('resource-limit', () => replacementRestrictionAttributes(manyBases, manyLocals, finite));
        expect(finite.work).toBeLessThanOrEqual(1000000);
    });
    it('c1_one_typed_augmentation_preserves_every_original_and_admitted_witness', () => {
        const first = new Operand('QName', 'p:item', [['p', 'urn:one']], [], 'base-default'), second = new Operand('QName', 'q:item', [['q', 'urn:one']], [], 'local-fixed');
        const a = new Use('none', 'global-q', ['urn:attrs', 'a'], { scalarType: 'QName' }), b = new Use('default', 'global-q', a.name, { kind: 'default', operand: first, scalarType: 'QName' }), c = new Use('fixed', 'global-q', a.name, { kind: 'fixed', operand: second, scalarType: 'QName' });
        const result = conditionalC1Augmentation([a, b, c], new Budget())!;
        expect(result).toMatchObject({ name: ['urn:attrs', 'a'], declaration: 'global-q', scalarType: 'QName', value: ['QName', ['urn:one', 'item']], admittedWitness: { lexical: 'p:item', namespaces: [['p', 'urn:one']] } });
        expect(result.admittedWitness).toBe(first);
        result.contributingUses.forEach((actual, i) => expect(actual).toBe([a, b, c][i]));
        const integer = new Use('integer', 'global-integer', ['', 'a'], { kind: 'fixed', operand: new Operand('integer', '+01', [], [], 'admitted-original') });
        expect(conditionalC1Augmentation([integer], new Budget())!.admittedWitness.lexical).toBe('+01');
        fail('invalid-value', () => conditionalC1Augmentation([use('one', 'default-one'), use('two', 'default-two')], new Budget()));
    });
    it('uses UTF-16 text units and structural QName keys with negative limit controls', () => {
        const ascii = new Budget(), nonBmp = new Budget();
        sameValue(new Operand('string', 'x'), new Operand('string', 'x'), ascii);
        sameValue(new Operand('string', '😀'), new Operand('string', '😀'), nonBmp);
        expect(nonBmp.work).toBe(ascii.work + 8);
        fail('resource-limit', () => sameValue(new Operand('string', '😀'), new Operand('string', '😀'), new Budget(100000, nonBmp.work - 1)));
        for (const limit of [0, -1, true, 2 ** 53, 1.5, NaN, Infinity])
            expect(() => new Budget(100000, limit as number)).toThrow('positive safe-integer');
        expect(unionUses([new Use('a', 'a', ['a,b', 'c']), new Use('b', 'b', ['a', 'b,c'])], 'complexType', new Budget())).toHaveLength(2);
    });
});
