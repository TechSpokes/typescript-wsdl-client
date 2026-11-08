/** Literal fresh-intermediate AU projection; never a whole-type witness verdict. */
import {Budget, ProbeFailure, Use, replacementRestrictionAttributes, unionUses, value} from '../s06-au01/probe.js';
import {createResolverBudget} from './resolver-budget.js';
import type {ResolverBudget, ResourceLimitFailure} from './resolver-budget.js';

class SharedScalarBudget extends Budget {
    constructor(private readonly shared: ResolverBudget) { super(); }
    override charge(count = 1): void { this.shared.chargeWork(count); }
    // Original identities are admitted by preparation. Temporary scalar-owner
    // projections do not introduce components; new decl/use pairs are reserved below.
    override nodes(count: number): void { this.shared.chargeWork(1 + count); }
}

export interface LiteralAttributePlan {
    readonly name: readonly [string, string];
    /** Original declaration/scalar context must be retained, never reparented. */
    readonly originalDeclaration: string;
    readonly scalarType: string;
    readonly required: false;
    readonly constraint: 'absent';
}

export type LiteralAuSynthesis = Readonly<{
    kind: 'literal-au-projection';
    admitted: boolean;
    plans: readonly LiteralAttributePlan[];
    wildcard: 'any-skip';
}> | Readonly<{
    kind: 'unresolved' | 'invalid-original';
    rule: string;
}> | ResourceLimitFailure;

const SCALARS: readonly string[] = Object.freeze(['string', 'token', 'integer', 'QName']);

/**
 * Preconditions: the actual graph's declaration/use correctness, component
 * identities and scalar contexts are qualified, excluding RE01; A is a legal
 * AU set (C1), D is a legal AU set, and fresh local declarations of A's QName
 * and exact scalar identity are permitted. Original inputs are borrowed.
 * Executable scalar domain: named xs:string/token/integer/QName as qualified
 * by the accepted AU probe; QName lexical qualification is its declared subset.
 * All originals are qualified before discarded fixed/required properties can
 * be weakened. No anonymous scalar, calendar or user-defined facet claim.
 * The plan is complete only for the fresh-E attribute projection: content,
 * original intermediates, source mapping and retained validity are separate.
 */
export function synthesizeLiteralAu(base: readonly Use[], endpoint: readonly Use[],
    budget = createResolverBudget()): LiteralAuSynthesis {
    return budget.guard(() => {
        // Reserve one bounded probe failure record/message before qualification
        // or an imported owner may construct it. Only one owner diagnostic is
        // retained; a terminal budget abort uses its already reserved machinery.
        // This allowance covers the fixed known category/rule strings and fields;
        // result publication below has its own separate pre-allocation charge.
        budget.chargeWork(1_028);
        const scalar = new SharedScalarBudget(budget);
        try {
            for (const uses of [base, endpoint]) for (const use of uses) {
                budget.chargeWork(6);
                let known = false;
                for (const name of SCALARS) {
                    if (budget.compareText(name, use.scalarType) === 0) known = true;
                }
                if (!known) throw new ProbeFailure('unsupported-capability', 'literal-au-named-scalar-domain');
                if (use.kind !== 'none') {
                    if (!use.operand) throw new ProbeFailure('invalid-schema', 'missing-original-operand');
                    if (budget.compareText(use.operand.type, use.scalarType) !== 0)
                        throw new ProbeFailure('unsupported-capability', 'literal-au-original-scalar-context');
                    value(use.operand, scalar);
                }
            }
            const originals = unionUses(base, 'complexType', scalar);
            // Qualify every endpoint AU and uniqueness even when A has no uses.
            unionUses(endpoint, 'complexType', scalar);
            budget.chargeWork(2);
            const plans: LiteralAttributePlan[] = [];
            const intermediate: Use[] = [];
            for (const original of originals) {
                budget.chargeWork(1);
                let present = false;
                for (const plan of plans) {
                    if (budget.compareText(plan.name[0], original.name[0]) === 0 &&
                        budget.compareText(plan.name[1], original.name[1]) === 0) present = true;
                }
                if (present) continue;
                // Semantic additions: one fresh local declaration and one AU.
                // Text and record/class allocation are charged before construction.
                budget.reserveNodes(2);
                budget.chargeWork(1_000 + 4 * (original.name[0].length + original.name[1].length +
                    original.declaration.length + original.scalarType.length));
                const name = [original.name[0], original.name[1]] as const;
                plans.push({name, originalDeclaration: original.declaration,
                    scalarType: original.scalarType, required: false, constraint: 'absent'});
                // These IDs label private AU projections only, not graph components.
                // Uniqueness is local to this array; the actual adapter creates fresh IDs.
                budget.chargeWork(24);
                const key = String(intermediate.length);
                intermediate.push(new Use(key, key, name, {scalarType: original.scalarType}));
            }
            let admitted = true;
            try {
                // E's universal skip wildcard admits D-only QNames; all shared
                // QNames must restrict every E scalar. No fixed/required E hurdle.
                replacementRestrictionAttributes(intermediate, endpoint, scalar,
                    {wildcardNamespaces: ['*']});
            } catch (error) {
                if (!(error instanceof ProbeFailure) || error.rule !== 'all-matches-original-type') throw error;
                admitted = false;
            }
            const copied = budget.freeze(budget.snapshot(plans));
            budget.chargeWork(110);
            return Object.freeze({kind: 'literal-au-projection' as const, admitted,
                plans: copied, wildcard: 'any-skip' as const});
        } catch (error) {
            if (!(error instanceof ProbeFailure)) throw error;
            budget.chargeWork(50 + error.rule.length);
            return Object.freeze({kind: error.category === 'unsupported-capability'
                ? 'unresolved' as const : 'invalid-original' as const, rule: error.rule});
        }
    });
}
