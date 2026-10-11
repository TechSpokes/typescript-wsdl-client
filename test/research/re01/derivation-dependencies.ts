/** Reference/affiliation census only; no semantic locality or transfer theorem. */
import {contextConstructionModel, withContext} from './resolver-context.js';
import type {ContextAccess} from './resolver-context.js';
import type {Context, Id, Result} from './resolver-types.js';

export type DependencyModel = 'derivation' | 'schema-preserving';
export const DEPENDENCY_CONTRACT = 'RE01-dependency-census-v1';
export type DependencyReceipt = Readonly<{
    model: DependencyModel; contract: typeof DEPENDENCY_CONTRACT;
    context: string; contextKind: Context['kind'];
    scope: 'declared-references-ownership-and-reverse-affiliations';
    roots: readonly Id[]; members: readonly Id[];
    qualification: 'structural-census-only';
}>;
// Separate cache identities isolate model-dependent receipts in each issued context.
const DERIVATION_CACHE = Object.freeze({});
const PRESERVATION_CACHE = Object.freeze({});

function reverseAffiliations(context: Context, access: ContextAccess): Map<Id, readonly Id[]> {
    const b = access.budget;
    b.chargeWork();
    const reverse = new Map<Id, Id[]>();
    for (const id of context.members) {
        b.chargeWork(12);
        const component = access.component(id)!;
        const f = component.facts;
        // Blocking and abstractness do not remove schema affiliation obligations.
        if (component.identity.kind !== 'global' || f.kind !== 'element' || !f.head) continue;
        if (f.head.kind === 'builtin') return access.fail('wrong-affiliation-head', 'dependency-census', id, 'head', component.source);
        b.chargeWork(2 + f.head.target.length);
        let members = reverse.get(f.head.target);
        if (!members) {
            b.chargeWork(2 + f.head.target.length);
            members = [];
            reverse.set(f.head.target, members);
        }
        b.chargeWork(1 + id.length);
        members.push(id);
    }
    return reverse;
}

/**
 * Census the represented graph, including implicit head-to-affiliate edges.
 * Whole actual-schema qualification and sufficiency of this dependency family
 * remain separate obligations. In particular, this is not a witness verdict.
 */
export function collectDerivationDependencies(context: Context, model: DependencyModel,
    roots: readonly Id[]): Result<DependencyReceipt> {
    return withContext(context, access => {
        const b = access.budget;
        b.chargeWork(4);
        if (model !== 'derivation' && model !== 'schema-preserving')
            return access.fail('unknown-model', 'dependency-census');
        if (contextConstructionModel(context, b) !== model)
            return access.fail('model-context-mismatch', 'dependency-census');
        if (!Array.isArray(roots)) return access.fail('invalid-roots', 'dependency-census');
        let supplied: readonly Id[];
        try { supplied = b.snapshot(roots); }
        catch (error: unknown) {
            if (!(error instanceof TypeError)) throw error;
            return access.fail('invalid-roots', 'dependency-census');
        }
        const reverse = access.cache(model === 'derivation' ? DERIVATION_CACHE : PRESERVATION_CACHE,
            () => reverseAffiliations(context, access));
        b.chargeWork(3);
        const pending: Id[] = [], seen = new Set<Id>(), rootSet = new Set<Id>();
        for (const id of supplied) {
            b.chargeWork(2);
            if (typeof id !== 'string' || id.length === 0) return access.fail('invalid-roots', 'dependency-census');
            b.chargeWork(2 + id.length);
            rootSet.add(id);
            pending.push(id);
        }
        while (pending.length > 0) {
            b.chargeWork(3);
            const id = pending.pop()!;
            b.chargeWork(id.length);
            if (seen.has(id)) continue;
            const component = access.component(id);
            if (!component) return access.fail('outside-context', 'dependency-census', id);
            b.chargeWork(2 + id.length);
            seen.add(id);
            for (const unassessed of component.unassessed) {
                b.chargeWork(4);
                return access.fail('unqualified-dependency-rule', unassessed.rule, id,
                    undefined, unassessed.source, 'unresolved');
            }
            const edges = access.edges(id)!;
            for (const edge of edges) {
                b.chargeWork(6);
                const target = edge.target ?? (edge.reference?.kind === 'builtin' ? undefined : edge.reference?.target);
                if (target !== undefined) {
                    b.chargeWork(1 + target.length);
                    pending.push(target);
                }
            }
            b.chargeWork(2 + id.length);
            const affiliates = reverse.get(id);
            if (affiliates) for (const affiliate of affiliates) {
                b.chargeWork(2 + affiliate.length);
                pending.push(affiliate);
            }
        }
        b.chargeWork(2 + seen.size + rootSet.size);
        const members = b.sorted(Array.from(seen), b.compareText);
        const canonicalRoots = b.sorted(Array.from(rootSet), b.compareText);
        b.chargeWork(220 + context.key.length + model.length);
        const receipt: DependencyReceipt = {model, contract: DEPENDENCY_CONTRACT,
            context: context.key, contextKind: context.kind,
            scope: 'declared-references-ownership-and-reverse-affiliations',
            roots: canonicalRoots, members, qualification: 'structural-census-only'};
        return b.freeze(b.snapshot(receipt));
    });
}
