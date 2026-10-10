/** Resolve one declared reference in its caller's issued context; no predicate success. */
import {builtinTarget, withContext} from './resolver-context.js';
import type {Context, Id, Result, Target} from './resolver-types.js';

export function resolveReference(context: Context, owner: Id, slot: string): Result<Target> {
    return withContext(context, access => {
        // Reserve the fixed owner/edge/reference/target field reads before selecting clauses.
        access.budget.chargeWork(40);
        const component = access.component(owner);
        if (!component) return access.fail('outside-context', 'reference-owner', owner, slot);
        const edge = access.reference(owner, slot);
        if (!edge?.reference) return access.fail('unknown-reference-slot', 'reference-slot', owner, slot, component.source);
        const reference = edge.reference;
        access.budget.chargeWork();
        if (reference.kind === 'builtin') {
            const builtin = builtinTarget(reference, access.budget);
            if (!builtin)
                return access.fail('unknown-builtin', 'reference-target', owner, slot, component.source);
            return builtin;
        }
        const target = access.component(reference.target);
        if (!target) return access.fail('outside-context', 'reference-target', owner, slot, component.source);
        access.budget.chargeWork(2);
        if (edge.expected && access.budget.compareText(target.facts.kind, edge.expected) !== 0)
            return access.fail('wrong-target-kind', 'reference-target', owner, slot, component.source);
        if (reference.kind === 'symbol') {
            access.budget.chargeWork(4);
            if (target.identity.kind !== 'global' ||
                access.budget.compareText(target.identity.role, reference.role) !== 0 ||
                access.budget.compareText(target.identity.name.namespace, reference.name.namespace) !== 0 ||
                access.budget.compareText(target.identity.name.local, reference.name.local) !== 0)
                return access.fail('wrong-symbol-target', 'reference-target', owner, slot, reference.source);
        }
        // The selected component is borrowed. Freezing it here would traverse input again.
        access.budget.chargeWork(3 + 'kind'.length + 'component'.length + 'component'.length);
        // Shallow freeze visits the wrapper record, both fields and their field names.
        access.budget.chargeWork(16);
        return Object.freeze({kind: 'component' as const, component: target});
    });
}
