/** Finite relational projections for #260. No full component-schema decision. */
import {createResolverBudget} from './resolver-budget.js';
import type {ResolverBudget, ResourceLimitFailure} from './resolver-budget.js';

export type Intermediate = 'original' | 'fresh';
export type Projection = 'blocking' | 'identity' | 'combined';
export interface Assignment {
    readonly intermediate: Intermediate;
    /** bit 0: extension; bit 1: restriction. Original T is immutable and empty-blocked. */
    readonly block: number;
    readonly affiliate: boolean;
    readonly choice: boolean;
}
export interface Requirements {
    readonly projection: Projection;
    readonly requireAffiliate: boolean;
    readonly requireChoice: boolean;
}
export interface Verdict {
    readonly closed: boolean;
    readonly ancestry: boolean;
    readonly affiliation: boolean;
    readonly overlap: boolean;
    readonly admitted: boolean;
}

/**
 * Explicit bounded encoding, derived from the displayed D->E->A path.
 * In blocking, H:A; in identity/combined, H:T and NameAndTypeOK expects T.
 * Each fresh E extends A, so it cannot descend from original T. In combined,
 * only original T can satisfy ancestry, and its immutable empty block admits M.
 * No other component/source/particle constraint is encoded.
 */
export function constraints(requirements: Requirements, assignment: Assignment, budget: ResolverBudget): Verdict {
    budget.chargeWork(16); // Reads, Boolean clauses and the fixed verdict record.
    const original = assignment.intermediate === 'original';
    const anchored = requirements.projection !== 'blocking';
    const ancestry = !anchored || original;
    const affiliation = !assignment.affiliate || ancestry;
    const methods = anchored ? 2 : 3;
    const overlap = assignment.affiliate && ancestry && (assignment.block & methods) === 0;
    const closed = !assignment.choice || assignment.affiliate;
    const admitted = closed && ancestry && affiliation &&
        (!requirements.requireAffiliate || assignment.affiliate) &&
        (!requirements.requireChoice || assignment.choice) &&
        (requirements.projection === 'identity' || !assignment.choice || !overlap);
    return {closed, ancestry, affiliation, overlap, admitted};
}

/** Fixed finite domain: original T and four fresh E block sets, times membership. */
export function* assignments(budget: ResolverBudget): Generator<Assignment> {
    for (let variant = 0; variant < 5; variant++) {
        for (let membership = 0; membership < 4; membership++) {
            budget.chargeWork(7); // Transition and construction before yield/allocation.
            budget.reserveNodes(1);
            yield {intermediate: variant === 0 ? 'original' : 'fresh',
                block: variant === 0 ? 0 : variant - 1,
                affiliate: (membership & 1) !== 0, choice: (membership & 2) !== 0};
        }
    }
}

export type ExperimentResult = Readonly<
    {kind: 'bounded-projection'; tried: number; outsideContext: number; admitted: readonly Assignment[]; work: number} |
    ResourceLimitFailure
>;

/**
 * Enumerates the whole declared domain, retaining only bounded projection results.
 * Caller supplies one shared budget for all runs; limits are execution limits,
 * never a witness-size bound. No accumulated result escapes an exhausted run.
 */
export function enumerate(requirements: Requirements, budget = createResolverBudget()): ExperimentResult {
    return budget.guard(() => {
        budget.chargeWork(2);
        const admitted: Assignment[] = [];
        let tried = 0;
        let outsideContext = 0;
        for (const assignment of assignments(budget)) {
            const verdict = constraints(requirements, assignment, budget);
            budget.chargeWork(2);
            tried++;
            if (!verdict.closed) outsideContext++;
            if (verdict.admitted) {
                budget.chargeWork(1);
                admitted.push(assignment);
            }
        }
        const copied = budget.freeze(budget.snapshot(admitted));
        budget.chargeWork(6);
        return {kind: 'bounded-projection' as const, tried, outsideContext, admitted: copied, work: budget.usage().work};
    });
}

export type BatchResult = Readonly<{kind: 'bounded-comparison'; rows: readonly Exclude<ExperimentResult, ResourceLimitFailure>[]; work: number}> | ResourceLimitFailure;

/** One report/request: preparation, all projections and copying share accounting. */
export function enumerateBatch(requirements: readonly Requirements[], budget = createResolverBudget()): BatchResult {
    return budget.guard(() => {
        budget.chargeWork(1 + requirements.length);
        const rows: Exclude<ExperimentResult, ResourceLimitFailure>[] = [];
        for (const requirement of requirements) {
            budget.chargeWork(1);
            const result = enumerate(requirement, budget);
            if (result.kind === 'resource-limit') return result;
            budget.chargeWork(1);
            rows.push(result);
        }
        const copied = budget.freeze(budget.snapshot(rows));
        budget.chargeWork(4);
        return {kind: 'bounded-comparison' as const, rows: copied, work: budget.usage().work};
    });
}

/** A deliberately incomplete fresh/empty-block family, challenged by enumeration. */
export function oldFamily(assignment: Assignment): boolean {
    return assignment.intermediate === 'fresh' && assignment.block === 0;
}

/** Exact criterion for the encoded fixed-M/fixed-choice projection only. */
export function directCriterion(requirements: Requirements): boolean {
    return requirements.projection !== 'combined' || !requirements.requireChoice;
}
