/** Selected B environment boundary; no schema qualification or candidate proof. */
import {RE01_DERIVATION_DOMAIN} from '../../../src/compiler/re01TypeProperties.js';
import {contextConstructionModel, samePreparedRequest, withContext} from './resolver-context.js';
import type {Context, Prepared, Result} from './resolver-types.js';

export {RE01_DERIVATION_DOMAIN};
export type DerivationEnvironmentReceipt = Readonly<{
    contract: typeof RE01_DERIVATION_DOMAIN;
    qualification: 'complete-represented-environment-only';
    actualContext: string; proposedContext: string;
    lookupUniverse: 'all-originals-plus-finite-fresh-with-endpoint-replacement';
    originalObligations: 'actual-context';
    hypotheticalRoots: readonly string[];
    pending: readonly ['actual-schema-qualification', 'effective-endpoint-correspondence',
        'complete-hypothetical-predicate-obligation-closure'];
}>;
const issued = new WeakMap<DerivationEnvironmentReceipt, Readonly<{actual: Context; proposed: Context}>>();

export function qualifyDerivationEnvironment(prepared: Prepared): Result<DerivationEnvironmentReceipt> {
    if (!samePreparedRequest(prepared)) return {kind: 'input-error', diagnostic: {
        code: 'invalid-prepared-contexts', rule: RE01_DERIVATION_DOMAIN, context: '', related: []}, usage: {nodes: 0, work: 0}};
    const outer = withContext(prepared.actual, actual => {
        const b = actual.budget;
        if (contextConstructionModel(prepared.actual, b) !== 'derivation' ||
            contextConstructionModel(prepared.proposed, b) !== 'derivation')
            return actual.fail('model-context-mismatch', RE01_DERIVATION_DOMAIN);
        return withContext(prepared.proposed, proposed => {
            // Original names remain both available and reserved. This check does
            // not promote an original component's actual validity into H.
            for (const id of prepared.actual.members) {
                b.chargeWork();
                if (!proposed.has(id)) return proposed.fail('incomplete-domain-membership',
                    RE01_DERIVATION_DOMAIN, id, undefined, undefined, 'unresolved');
            }
            b.chargeWork(4);
            const roots = new Set<string>([proposed.candidate.intermediate, proposed.candidate.endpoint]);
            for (const helper of proposed.candidate.additions) {
                b.chargeWork(2 + helper.id.length); roots.add(helper.id);
                if (!proposed.has(helper.id)) return proposed.fail('incomplete-domain-membership',
                    RE01_DERIVATION_DOMAIN, helper.id, undefined, undefined, 'unresolved');
            }
            b.chargeWork(1 + roots.size);
            const hypotheticalRoots = b.sorted(Array.from(roots), (a, c) => b.compareText(a, c));
            b.chargeWork(450 + prepared.actual.key.length + prepared.proposed.key.length);
            const receipt = b.freeze(b.snapshot<DerivationEnvironmentReceipt>({
                contract: RE01_DERIVATION_DOMAIN, qualification: 'complete-represented-environment-only',
                actualContext: prepared.actual.key, proposedContext: prepared.proposed.key,
                lookupUniverse: 'all-originals-plus-finite-fresh-with-endpoint-replacement',
                originalObligations: 'actual-context', hypotheticalRoots,
                pending: ['actual-schema-qualification', 'effective-endpoint-correspondence',
                    'complete-hypothetical-predicate-obligation-closure'],
            }));
            b.chargeWork(4); issued.set(receipt, {actual: prepared.actual, proposed: prepared.proposed});
            return receipt;
        });
    });
    return outer.kind === 'ok' ? outer.value : outer;
}

/** Object identity and exact contexts are mandatory; copied labels carry no authority. */
export function validateDerivationEnvironmentReceipt(prepared: Prepared,
    receipt: DerivationEnvironmentReceipt): Result<DerivationEnvironmentReceipt> {
    if (!samePreparedRequest(prepared)) return {kind: 'input-error', diagnostic: {
        code: 'invalid-prepared-contexts', rule: RE01_DERIVATION_DOMAIN, context: '', related: []}, usage: {nodes: 0, work: 0}};
    return withContext(prepared.actual, access => {
        access.budget.chargeWork(5);
        const binding = issued.get(receipt);
        if (!binding || binding.actual !== prepared.actual || binding.proposed !== prepared.proposed)
            return access.fail('invalid-domain-environment-receipt', RE01_DERIVATION_DOMAIN);
        return receipt;
    });
}
