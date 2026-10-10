/**
 * Check a supplied correspondence over an explicitly selected AU component closure.
 * This does not choose witness equality, construct schema source, or assess XSD validity.
 * Property strings are certified exact values for the named-scalar fixture domain.
 */
import { Budget, Exhausted } from './witness-probe.js';

export interface Component {
    readonly id: string;
    readonly kind: 'complex-type' | 'attribute-use' | 'attribute-declaration' | 'simple-type' | 'attribute-group';
    readonly anchor?: string;
    readonly properties: readonly (readonly [string, string])[];
    readonly edges: readonly (readonly [string, string])[];
}

export interface ComponentClosure {
    readonly components: readonly Component[];
    /** Roots define comparison scope; the caller must make additional anchors explicit. */
    readonly roots: readonly string[];
}

export interface IncidenceResult {
    readonly kind: 'correspondence' | 'mismatch' | 'resource-limit';
    readonly reason: string;
    readonly nodes: number;
    readonly work: number;
}

function index(closure: ComponentClosure, budget: Budget): Map<string, Component> {
    budget.charge();
    const indexed = new Map<string, Component>();
    for (const component of closure.components) {
        budget.charge(1 + component.id.length + component.kind.length + (component.anchor?.length ?? 0));
        if (indexed.has(component.id)) throw new Error('Duplicate component ID');
        if (budget.nodes === budget.maxNodes) throw new Exhausted('nodes');
        budget.charge();
        budget.nodes++;
        indexed.set(component.id, component);
        budget.charge();
        const properties = new Set<string>();
        for (const [key, value] of component.properties) {
            budget.charge(1 + key.length + value.length);
            if (properties.has(key)) throw new Error('Duplicate component property');
            properties.add(key);
        }
        for (const [property, target] of component.edges) budget.charge(1 + property.length + target.length);
    }
    for (const component of closure.components) {
        budget.charge();
        for (const [, target] of component.edges) {
            budget.charge();
            if (!indexed.has(target)) throw new Error('Missing component edge target');
        }
    }
    budget.charge(closure.roots.length + 2);
    const stack = [...closure.roots], reachable = new Map<string, Component>();
    while (stack.length) {
        budget.charge();
        const id = stack.pop()!;
        const component = indexed.get(id);
        if (!component) throw new Error('Missing comparison root');
        if (reachable.has(id)) continue;
        budget.charge();
        reachable.set(id, component);
        budget.charge(component.edges.length);
        for (const [, target] of component.edges) stack.push(target);
    }
    return reachable;
}

/** Linear certificate verification; cycles and sharing remain references, never expanded. */
export function checkIncidence(
    original: ComponentClosure,
    hypothetical: ComponentClosure,
    pairs: readonly (readonly [string, string])[],
    budget = new Budget(),
): IncidenceResult {
    const result = (kind: IncidenceResult['kind'], reason: string): IncidenceResult => {
        budget.charge();
        return { kind, reason, nodes: budget.nodes, work: budget.work };
    };
    try {
        const left = index(original, budget), right = index(hypothetical, budget);
        if (left.size !== right.size || pairs.length !== left.size) return result('mismatch', 'closure cardinality');
        budget.charge(2);
        const mapping = new Map<string, string>(), targets = new Set<string>();
        for (const [from, to] of pairs) {
            budget.charge(2 + from.length + to.length);
            if (!left.has(from) || !right.has(to) || mapping.has(from) || targets.has(to))
                return result('mismatch', 'not a bijection over the selected closure');
            mapping.set(from, to);
            targets.add(to);
        }
        if (original.roots.length !== hypothetical.roots.length) return result('mismatch', 'comparison roots');
        for (let i = 0; i < original.roots.length; i++) {
            budget.charge();
            if (mapping.get(original.roots[i]) !== hypothetical.roots[i]) return result('mismatch', 'comparison roots');
        }
        for (const [id, component] of left) {
            budget.charge();
            const other = right.get(mapping.get(id)!)!;
            if (component.kind !== other.kind || component.anchor !== other.anchor)
                return result('mismatch', 'kind or anchored identity');
            if (component.properties.length !== other.properties.length) return result('mismatch', 'properties');
            budget.charge(other.properties.length);
            const properties = new Map(other.properties);
            for (const [key, value] of component.properties) {
                budget.charge(1 + key.length + value.length);
                if (properties.get(key) !== value) return result('mismatch', 'properties');
            }
            // Edge multisets preserve shared targets and distinguish duplicate incidences.
            budget.charge();
            const edges = new Map<string, Map<string, number>>();
            for (const [property, target] of other.edges) {
                budget.charge(2 + property.length + target.length);
                let row = edges.get(property);
                if (!row) { row = new Map(); edges.set(property, row); }
                row.set(target, (row.get(target) ?? 0) + 1);
            }
            if (component.edges.length !== other.edges.length) return result('mismatch', 'edge incidence');
            for (const [property, target] of component.edges) {
                budget.charge(1 + property.length + target.length);
                const row = edges.get(property), mapped = mapping.get(target)!;
                const count = row?.get(mapped) ?? 0;
                if (!count) return result('mismatch', 'edge incidence');
                row!.set(mapped, count - 1);
            }
        }
        return result('correspondence', 'supplied bijection preserves the selected closure only');
    } catch (error) {
        if (!(error instanceof Exhausted)) throw error;
        return { kind: 'resource-limit', reason: error.message, nodes: budget.nodes, work: budget.work };
    }
}
