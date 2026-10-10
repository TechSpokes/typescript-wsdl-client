/** Conditional finite witness research. No schema assessor or completeness claim. */
export class Exhausted extends Error {
}
export class Budget {
    nodes = 0;
    work = 0;
    constructor(readonly maxNodes = 100000, readonly maxWork = 1000000) {
        if (![maxNodes, maxWork].every(n => Number.isSafeInteger(n) && n > 0))
            throw new RangeError('limits must be positive safe integers');
    }
    charge(units = 1): void {
        if (!Number.isSafeInteger(units) || units < 0 || units > this.maxWork - this.work)
            throw new Exhausted('work');
        this.work += units;
    }
}
export interface ViewOptions {
    minimum?: string;
    maximum?: string;
    children?: readonly View[];
    schemaEmptiable?: boolean;
    typeReference?: string;
}
export class View {
    readonly minimum: string;
    readonly maximum: string;
    readonly children: readonly View[];
    readonly schemaEmptiable: boolean;
    readonly typeReference?: string;
    constructor(readonly source: string, readonly kind: string, options: ViewOptions = {}) {
        this.minimum = options.minimum ?? '1';
        this.maximum = options.maximum ?? '1';
        this.children = options.children ?? [];
        this.schemaEmptiable = options.schemaEmptiable ?? false;
        this.typeReference = options.typeReference;
    }
}
export interface Prepared {
    readonly ancestor: View | null;
    readonly final: View;
    readonly nonvacuousExtensionAllowed?: boolean;
    readonly normalizationCertified?: boolean;
}
export type Restriction = (derived: View, base: View, budget: Budget) => boolean | null;
export interface Result {
    readonly kind: 'particle-witness' | 'unresolved' | 'resource-limit';
    readonly candidate: 'vacuous' | 'pointless-prefix-universal' | 'dead-separator-universal' | null;
    readonly mapping: readonly (readonly [
        number,
        number
    ])[];
    readonly suffixWildcards: number;
    readonly nodes: number;
    readonly work: number;
    readonly reason: string;
}
// Work uses UTF-16 code units; ASCII legacy measurements are unchanged.
function indexViews(ancestor: View | null, final: View, budget: Budget): void {
    budget.charge(2);
    const stack: Array<View | null> = [ancestor, final];
    const seen = new Set<View>();
    while (stack.length) {
        budget.charge();
        const node = stack.pop();
        if (!node || seen.has(node))
            continue;
        if (budget.nodes === budget.maxNodes)
            throw new Exhausted('nodes');
        budget.charge();
        budget.nodes++;
        seen.add(node);
        budget.charge(node.source.length + node.minimum.length + node.maximum.length);
        if (node.typeReference)
            budget.charge(node.typeReference.length);
        budget.charge(node.children.length);
        for (const child of node.children)
            stack.push(child);
    }
}
interface State {
    i: number;
    j: number;
}
interface Predecessor {
    prior: State;
    edge: readonly [
        number,
        number
    ] | null;
}
export function probe(prepared: Prepared, restriction: Restriction, budget = new Budget()): Result {
    const result = (kind: Result['kind'], candidate: Result['candidate'] = null, mapping: readonly (readonly [
        number,
        number
    ])[] = [], count = 0, reason = ''): Result => {
        budget.charge(mapping.length + 1);
        return { kind, candidate, mapping: [...mapping], suffixWildcards: count, nodes: budget.nodes, work: budget.work, reason };
    };
    try {
        indexViews(prepared.ancestor, prepared.final, budget);
        if (prepared.normalizationCertified === false)
            return result('unresolved', null, [], 0, 'uncertified component normalization');
        const base = prepared.ancestor, final = prepared.final;
        if (base === null) {
            if (prepared.nonvacuousExtensionAllowed === false)
                return result('unresolved', null, [], 0, 'content/source extension predicate');
            budget.charge();
            return result('particle-witness', 'pointless-prefix-universal', [], 1, 'owning wildcard predicate at 0..unbounded');
        }
        const direct = restriction(final, base, budget);
        if (direct === true)
            return result('particle-witness', 'vacuous', [], 0, 'checked original pair');
        if (prepared.nonvacuousExtensionAllowed === false)
            return result('unresolved', null, [], 0, 'no candidate; full-type negative not proved');
        let restricted: readonly View[];
        if (final.kind === 'element') {
            budget.charge();
            restricted = [final];
        }
        else if (final.kind === 'sequence' && final.minimum === '1' && final.maximum === '1')
            restricted = final.children;
        else
            return result('unresolved', null, [], 0, 'no candidate; full-type negative not proved');
        let prefix: readonly View[];
        if (base.kind === 'sequence' && base.minimum === '1' && base.maximum === '1')
            prefix = base.children;
        else {
            budget.charge();
            prefix = [base];
        }
        budget.charge(2);
        const pending: State[] = [{ i: 0, j: 0 }];
        // Integer coordinates give structural state identity without serializing original Views.
        const predecessor = new Map<number, Map<number, Predecessor | null>>([[0, new Map([[0, null]])]]);
        const has = (state: State) => predecessor.get(state.i)?.has(state.j) ?? false;
        const get = (state: State) => predecessor.get(state.i)?.get(state.j);
        let unresolved = direct === null, matched: State | null = null;
        while (pending.length) {
            budget.charge();
            const state = pending.pop()!;
            const { i, j } = state;
            if (j === prefix.length) {
                matched = state;
                break;
            }
            const successors: Array<{
                state: State;
                edge: readonly [
                    number,
                    number
                ] | null;
            }> = [];
            if (prefix[j].schemaEmptiable) {
                budget.charge();
                successors.push({ state: { i, j: j + 1 }, edge: null });
            }
            if (i < restricted.length) {
                const relation = restriction(restricted[i], prefix[j], budget);
                unresolved ||= relation === null;
                if (relation === true) {
                    budget.charge();
                    successors.push({ state: { i: i + 1, j: j + 1 }, edge: [i, j] });
                }
            }
            for (const successor of successors) {
                budget.charge();
                if (!has(successor.state)) {
                    budget.charge(2);
                    let row = predecessor.get(successor.state.i);
                    if (!row) {
                        row = new Map();
                        predecessor.set(successor.state.i, row);
                    }
                    row.set(successor.state.j, { prior: state, edge: successor.edge });
                    pending.push(successor.state);
                }
            }
        }
        if (matched === null)
            return result('unresolved', null, [], 0, unresolved ? 'unresolved original predicate' : 'finite family failed; no full-type invalidity proof');
        const count = restricted.length - matched.i;
        budget.charge(prefix.length + 1 + count);
        const mapping: Array<readonly [
            number,
            number
        ]> = [];
        let state = matched, prior = get(state);
        while (prior) {
            budget.charge();
            if (prior.edge !== null) {
                budget.charge();
                mapping.push(prior.edge);
            }
            state = prior.prior;
            prior = get(state);
        }
        budget.charge(mapping.length);
        mapping.reverse();
        return result('particle-witness', 'dead-separator-universal', mapping, count, 'conditional on certified source/content and AU predicates');
    }
    catch (error) {
        if (!(error instanceof Exhausted))
            throw error;
        return { kind: 'resource-limit', candidate: null, mapping: [], suffixWildcards: 0, nodes: budget.nodes, work: budget.work, reason: error.message };
    }
}
export function tablePredicate(answers: readonly (readonly [
    string,
    string,
    boolean | null
])[]): Restriction {
    const table = new Map<string, Map<string, boolean | null>>();
    for (const [derived, base, answer] of answers) {
        let row = table.get(derived);
        if (!row) {
            row = new Map();
            table.set(derived, row);
        }
        row.set(base, answer);
    }
    return (derived, base, budget) => { budget.charge(); return table.get(derived.source)?.get(base.source) ?? (table.get(derived.source)?.has(base.source) ? null : false); };
}
