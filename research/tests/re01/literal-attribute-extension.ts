/** Clause 1.2 projection, not a complete extension or schema-validity checker. */
import {Budget, ProbeFailure, value} from '../s06-au01/probe.js';
import type {Use} from '../s06-au01/probe.js';
import {createResolverBudget} from './resolver-budget.js';
import type {ResolverBudget, ResourceLimitFailure} from './resolver-budget.js';

class ScalarBudget extends Budget {
    constructor(private readonly shared: ResolverBudget) { super(); }
    override charge(count = 1): void { this.shared.chargeWork(count); }
}

export type AttributeExtensionProjection = Readonly<{
    kind: 'attribute-extension-projection';
    admitted: boolean;
}> | ResourceLimitFailure;

/**
 * Domain: already identified attribute declarations and named builtin scalar
 * definitions covered by the AU probe. Every supplied original operand is
 * qualified before matching. Declaration/use correctness, other extension
 * clauses, endpoint restriction and whole-context validity remain separate.
 * The specific 'that is' predicate matches name, namespace and scalar identity;
 * it does not add use identity, requiredness or fixed-value equality.
 */
export function literalAttributeExtension(base: readonly Use[], derived: readonly Use[],
    budget = createResolverBudget()): AttributeExtensionProjection {
    return budget.guard(() => {
        budget.chargeWork(3);
        const scalarBudget = new ScalarBudget(budget);
        for (const uses of [base, derived]) for (const use of uses) {
            budget.chargeWork(1);
            if (use.kind !== 'none') {
                if (!use.operand) throw new ProbeFailure('invalid-schema', 'missing-original-operand');
                value(use.operand, scalarBudget);
            }
        }
        let admitted = true;
        for (const original of base) {
            let found = false;
            for (const candidate of derived) {
                budget.chargeWork(4 + original.name[0].length + original.name[1].length +
                    candidate.name[0].length + candidate.name[1].length +
                    original.scalarType.length + candidate.scalarType.length);
                if (original.name[0] === candidate.name[0] && original.name[1] === candidate.name[1] &&
                    original.scalarType === candidate.scalarType) found = true;
            }
            budget.chargeWork(1);
            if (!found) admitted = false;
        }
        budget.chargeWork(2);
        return {kind: 'attribute-extension-projection' as const, admitted};
    });
}
