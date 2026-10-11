/** Independent policy-B controls fixed before the represented-environment owner.
 * https://github.com/TechSpokes/typescript-wsdl-client/issues/266#issuecomment-6111843828
 */
import {describe, expect, it} from 'vitest';
import {prepareDerivationContexts, prepareLiteralContexts} from './resolver-context.js';
import {baselineRequest, literalComponent, typeFacts} from './resolver-fixtures.js';
import {qualifyDerivationEnvironment, validateDerivationEnvironmentReceipt, RE01_DERIVATION_DOMAIN} from './derivation-domain.js';
import type {Prepared} from './resolver-types.js';

function prepared(): Prepared {
    const request = baselineRequest();
    const result = prepareDerivationContexts(request.input, request.candidate);
    if (result.kind !== 'ok') throw new Error(`Expected independent structural baseline: ${result.kind}`);
    return result.value;
}

describe('independent full-original B environment controls', () => {
    it('qualifies complete represented membership with explicit unproved semantic obligations', () => {
        const pair = prepared();
        const receipt = qualifyDerivationEnvironment(pair);
        expect(receipt).toMatchObject({kind: 'ok', value: {
            contract: RE01_DERIVATION_DOMAIN, qualification: 'complete-represented-environment-only',
            actualContext: pair.actual.key, proposedContext: pair.proposed.key,
            lookupUniverse: 'all-originals-plus-finite-fresh-with-endpoint-replacement',
            originalObligations: 'actual-context', hypotheticalRoots: ['D', 'T'],
            pending: ['actual-schema-qualification', 'effective-endpoint-correspondence', 'complete-hypothetical-predicate-obligation-closure'],
        }});
        if (receipt.kind !== 'ok') throw new Error('Expected local environment receipt');
        expect(validateDerivationEnvironmentReceipt(pair, receipt.value)).toMatchObject({kind: 'ok', value: receipt.value});
    });

    it('rejects omitted unrelated original membership without pretending structural preparation failed', () => {
        const request = baselineRequest([literalComponent('Unused', typeFacts())]);
        const result = prepareDerivationContexts(request.input, {...request.candidate,
            retained: request.candidate.retained.filter(id => id !== 'Unused')});
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') throw new Error('Expected lower structural subset');
        expect(qualifyDerivationEnvironment(result.value)).toMatchObject({kind: 'unresolved',
            diagnostic: {code: 'incomplete-domain-membership'}});
    });

    it('binds authority to exact issued contexts and refuses copied receipts or a different model', () => {
        const pair = prepared();
        const receipt = qualifyDerivationEnvironment(pair);
        if (receipt.kind !== 'ok') throw new Error('Expected local environment receipt');
        expect(validateDerivationEnvironmentReceipt(pair, {...receipt.value})).toMatchObject({kind: 'input-error',
            diagnostic: {code: 'invalid-domain-environment-receipt'}});
        expect(validateDerivationEnvironmentReceipt(prepared(), receipt.value)).toMatchObject({kind: 'input-error',
            diagnostic: {code: 'invalid-domain-environment-receipt'}});
        const request = baselineRequest();
        const preserving = prepareLiteralContexts(request.input, request.candidate);
        if (preserving.kind !== 'ok') throw new Error('Expected historical other-model structural preparation');
        expect(qualifyDerivationEnvironment(preserving.value)).toMatchObject({kind: 'input-error',
            diagnostic: {code: 'model-context-mismatch'}});
    });
});
