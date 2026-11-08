import {describe, expect, it} from 'vitest';
import {Budget, Operand, ProbeFailure, replacementRestrictionAttributes, unionUses, Use} from '../s06-au01/probe.js';
import {literalAttributeExtension} from './literal-attribute-extension.js';
import {createResolverBudget} from './resolver-budget.js';

function fixed(identity: string, lexical: string, required = false, namespace = 'urn:fixed', scalarType = 'integer'): Use {
    return new Use(identity, 'global-attribute', [namespace, 'g'],
        {required, kind: 'fixed', scalarType, operand: new Operand(scalarType, lexical)});
}

describe('#260 literal abstract attribute extension', () => {
    it.each(['original_', 'renamed_'])('admits a different original fixed use without source inheritance under %s', prefix => {
        // Independent clause premises: cos-ct-extends.1.2 names only QName
        // and scalar identity. E has original D's use, so D restricting E has
        // the identical fixed operand. A's original 7 is still qualified.
        const ancestor = fixed(prefix + 'A', '7');
        const endpoint = fixed(prefix + 'D', '8');
        expect(literalAttributeExtension([ancestor], [endpoint])).toMatchObject({admitted: true});
        expect(replacementRestrictionAttributes([endpoint], [endpoint], new Budget()).effective).toContain(endpoint);
        // XML-style union is a different proposal: its retained 7 imposes a
        // fixed-value comparison on the final restriction and rejects 8.
        const sourceIntermediate = unionUses([ancestor, endpoint], 'complexType', new Budget());
        expect(() => replacementRestrictionAttributes(sourceIntermediate, [endpoint], new Budget()))
            .toThrowError(new ProbeFailure('invalid-schema', 'all-matches-original-fixed'));
        expect(ancestor.operand?.lexical).toBe('7');
    });

    it.each([
        [true, false, 'urn:fixed', 'integer', true],
        [false, true, 'urn:fixed', 'integer', true],
        [false, false, 'urn:other', 'integer', false],
        [false, false, 'urn:fixed', 'string', false],
    ] as const)('matches QName/type rather than requiredness: %s -> %s, %s, %s',
        (baseRequired, derivedRequired, namespace, scalarType, admitted) => {
            expect(literalAttributeExtension([fixed('a', '7', baseRequired)],
                [fixed('d', '8', derivedRequired, namespace, scalarType)])).toMatchObject({admitted});
        });

    it('requires a match for every base name and distinguishes an empty base', () => {
        const a = fixed('a', '7');
        const b = new Use('b', 'second-declaration', ['urn:fixed', 'h']);
        expect(literalAttributeExtension([a, b], [a])).toMatchObject({admitted: false});
        expect(literalAttributeExtension([], [a])).toMatchObject({admitted: true});
    });

    it('qualifies an original invalid operand even when its use would be replaced', () => {
        expect(() => literalAttributeExtension([fixed('a', 'invalid')], [fixed('d', '8')]))
            .toThrowError(new ProbeFailure('invalid-schema', 'integer-operand'));
    });

    it('shares inclusive execution limits and never turns exhaustion into rejection', () => {
        const a = fixed('a', '7');
        const d = fixed('d', '8');
        const measured = createResolverBudget();
        expect(literalAttributeExtension([a], [d], measured)).toMatchObject({admitted: true});
        const work = measured.usage().work;
        expect(literalAttributeExtension([a], [d], createResolverBudget({maxWork: work})))
            .toMatchObject({admitted: true});
        const shared = createResolverBudget({maxWork: work - 1});
        expect(literalAttributeExtension([a], [d], shared).kind).toBe('resource-limit');
        expect(literalAttributeExtension([], [], shared).kind).toBe('resource-limit');
    });
});
