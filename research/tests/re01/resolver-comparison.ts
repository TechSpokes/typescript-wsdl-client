/** Check only the supplied anchored endpoint property/incidence certificate. */
import {samePreparedRequest, withContext} from './resolver-context.js';
import type {ContextAccess} from './resolver-context.js';
import type {ResolverBudget} from './resolver-budget.js';
import type {
    Component, Content, Correspondence, CorrespondenceReceipt, Id, Identity,
    Name, Operand, Pair, Prepared, Ref, Result, Source, Value, Wildcard,
} from './resolver-types.js';

interface ProjectionEntry {readonly component: Component; expanded: boolean}
type Projection = Map<Id, ProjectionEntry>;

/** Read certificate operands through data descriptors, never caller accessors. */
function certificateData(value: unknown, access: ContextAccess): Correspondence {
    const budget = access.budget;
    function reject(): never {return access.fail('malformed-certificate', 'endpoint-correspondence');}
    function field(record: object, key: string): unknown {
        // Descriptor object/fields are reserved before introspection/allocation.
        budget.chargeWork(43 + key.length);
        const descriptor = Object.getOwnPropertyDescriptor(record, key);
        if (!descriptor || !('value' in descriptor)) return reject();
        return descriptor.value;
    }
    budget.chargeWork(3);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return reject();
    budget.chargeWork();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return reject();
    const actualRoot = field(value, 'actualRoot'), proposedRoot = field(value, 'proposedRoot'), pairs = field(value, 'pairs');
    if (typeof actualRoot !== 'string' || typeof proposedRoot !== 'string' || !Array.isArray(pairs)) return reject();
    const length = field(pairs, 'length');
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) return reject();
    for (let i = 0; i < length; i++) {
        // Array indexes are at most ten UTF-16 decimal units; reserve before formatting.
        budget.chargeWork(11);
        const index = String(i);
        const pair = field(pairs, index);
        if (!Array.isArray(pair) || field(pair, 'length') !== 2) return reject();
        if (typeof field(pair, '0') !== 'string' || typeof field(pair, '1') !== 'string') return reject();
    }
    // Only the checked data fields/array indices are read by the checker below.
    return value as Correspondence;
}

/** Fixed effective-property visitor. Source/declared contributions are R4 inputs. */
function project(access: ContextAccess, root: Id): Projection {
    const budget = access.budget;
    budget.chargeWork(2);
    const projection: Projection = new Map();
    const pending: Component[] = [];
    function reach(id: Id, expanded: boolean): void {
        budget.chargeWork(1 + id.length);
        const previous = projection.get(id);
        if (previous) {
            budget.chargeWork();
            if (expanded && !previous.expanded) {
                budget.chargeWork(3);
                previous.expanded = true;
                pending.push(previous.component);
            }
            return;
        }
        const component = access.component(id);
        if (!component) access.fail('outside-context', 'endpoint-projection', id);
        budget.chargeWork(4 + id.length + 'component'.length + 'expanded'.length);
        projection.set(id, {component, expanded});
        if (expanded) {budget.chargeWork(); pending.push(component);}
    }
    function reference(ref: Ref): void {
        budget.chargeWork();
        if (ref.kind === 'builtin') return;
        budget.chargeWork(4); // Target operand and selected component kind/fields.
        const target = access.component(ref.target);
        if (!target) access.fail('outside-context', 'endpoint-projection', ref.target);
        budget.chargeWork();
        reach(ref.target, target.facts.kind !== 'type');
    }
    function ids(values: readonly Id[]): void {
        budget.chargeWork();
        for (let i = 0; i < values.length; i++) {budget.chargeWork(); reach(values[i]!, true);}
    }
    function content(value: Content): void {
        budget.chargeWork();
        if (value.kind === 'simple' || value.kind === 'opaque-builtin') reference(value.type);
        else if (value.kind !== 'empty') ids(value.roots);
    }
    function value(value: Value | undefined): void {
        budget.chargeWork();
        if (value) {budget.chargeWork(2); reference(value.operand.type);}
    }
    reach(root, true);
    while (pending.length) {
        budget.chargeWork(12); // Pop and fixed identity/facts dispatch fields.
        const component = pending.pop()!;
        const identity = component.identity;
        if (identity.kind === 'local' || (identity.kind === 'fresh' && identity.owner !== undefined)) {
            budget.chargeWork(); reach(identity.owner!, false);
        }
        const facts = component.facts;
        switch (facts.kind) {
            case 'type':
                budget.chargeWork(4); content(facts.content); ids(facts.attributeUses);
                budget.chargeWork();
                for (let i = 0; i < facts.items.length; i++) {budget.chargeWork(); reference(facts.items[i]!);}
                budget.chargeWork();
                for (let i = 0; i < facts.facets.length; i++) {
                    budget.chargeWork(3); reference(facts.facets[i]!.operand.type);
                }
                break;
            case 'element':
                budget.chargeWork(3); reference(facts.type); value(facts.value);
                if (facts.head) reference(facts.head);
                break;
            case 'attribute': budget.chargeWork(2); reference(facts.type); value(facts.value); break;
            case 'attributeUse': budget.chargeWork(2); reference(facts.declaration); value(facts.value); break;
            case 'particle':
                budget.chargeWork(2); ids(facts.children); if (facts.reference) reference(facts.reference); break;
            case 'group': budget.chargeWork(); reach(facts.root, true); break;
            case 'attributeGroup': budget.chargeWork(); ids(facts.uses); break;
        }
    }
    return projection;
}

/** Each helper inspects borrowed properties under the same cumulative budget. */
function propertiesEqual(left: Component, right: Component, projection: Projection, budget: ResolverBudget): boolean {
    function text(a: string, b: string): boolean {return budget.compareText(a, b) === 0;}
    function scalar(a: boolean | number, b: boolean | number): boolean {budget.chargeWork(2); return a === b;}
    function list<T>(a: readonly T[], b: readonly T[], equal: (a: T, b: T) => boolean): boolean {
        budget.chargeWork(2);
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {budget.chargeWork(2); if (!equal(a[i]!, b[i]!)) return false;}
        return true;
    }
    function set(a: readonly string[], b: readonly string[]): boolean {
        return list(budget.sorted(a, (x, y) => budget.compareText(x, y)),
            budget.sorted(b, (x, y) => budget.compareText(x, y)), text);
    }
    function canonicalUses(values: readonly Id[]): Id[] {
        const ordered = budget.sorted(values, (a, b) => budget.compareText(a, b));
        budget.chargeWork(2); const unique: Id[] = [];
        for (let i = 0; i < ordered.length; i++) {
            budget.chargeWork(3); const id = ordered[i]!;
            if (unique.length && budget.compareText(unique[unique.length - 1]!, id) === 0) continue;
            budget.chargeWork(1 + id.length); unique.push(id);
        }
        return unique;
    }
    function useSet(a: readonly Id[], b: readonly Id[]): boolean {
        return list(canonicalUses(a), canonicalUses(b), text);
    }
    function name(a: Name, b: Name): boolean {
        budget.chargeWork(4); return text(a.namespace, b.namespace) && text(a.local, b.local);
    }
    function source(a: Source, b: Source): boolean {
        budget.chargeWork(24);
        if (!text(a.uri, b.uri) || !text(a.digest, b.digest) || !text(a.path, b.path) || !text(a.baseUri, b.baseUri) ||
            !scalar(a.start.line, b.start.line) || !scalar(a.start.column, b.start.column) ||
            !scalar(a.end.line, b.end.line) || !scalar(a.end.column, b.end.column) ||
            !text(a.effectiveNamespace, b.effectiveNamespace) || !text(a.interpretation, b.interpretation) ||
            !scalar(a.chameleon, b.chameleon)) return false;
        budget.chargeWork(2);
        const aKeys: string[] = [], bKeys: string[] = [];
        for (const key in a.namespaces) {
            budget.chargeWork(3 + key.length); if (Object.hasOwn(a.namespaces, key)) aKeys.push(key);
        }
        for (const key in b.namespaces) {
            budget.chargeWork(3 + key.length); if (Object.hasOwn(b.namespaces, key)) bKeys.push(key);
        }
        const keys = budget.sorted(aKeys, (x, y) => budget.compareText(x, y));
        if (!list(keys, budget.sorted(bKeys, (x, y) => budget.compareText(x, y)), text)) return false;
        for (let i = 0; i < keys.length; i++) {
            budget.chargeWork(); const key = keys[i]!;
            budget.chargeWork(4 + 2 * key.length);
            if (!text(a.namespaces[key]!, b.namespaces[key]!)) return false;
        }
        return true;
    }
    function ref(a: Ref, b: Ref): boolean {
        budget.chargeWork(2);
        if (!text(a.kind, b.kind)) return false;
        if (a.kind === 'builtin' && b.kind === 'builtin') {budget.chargeWork(2); return name(a.name, b.name);}
        if (a.kind === 'local' && b.kind === 'local') {budget.chargeWork(2); return text(a.target, b.target);}
        if (a.kind === 'symbol' && b.kind === 'symbol') {
            budget.chargeWork(8);
            return text(a.role, b.role) && name(a.name, b.name) && text(a.target, b.target) && source(a.source, b.source);
        }
        return false;
    }
    function operand(a: Operand, b: Operand): boolean {
        budget.chargeWork(6); return ref(a.type, b.type) && text(a.lexical, b.lexical) && source(a.source, b.source);
    }
    function value(a: Value | undefined, b: Value | undefined): boolean {
        budget.chargeWork(2);
        if (!a || !b) return a === b;
        budget.chargeWork(4); return text(a.kind, b.kind) && operand(a.operand, b.operand);
    }
    function wildcard(a: Wildcard | undefined, b: Wildcard | undefined): boolean {
        budget.chargeWork(2);
        if (!a || !b) return a === b;
        budget.chargeWork(12);
        return text(a.namespaces.kind, b.namespaces.kind) && set(a.namespaces.values, b.namespaces.values) &&
            text(a.process, b.process) && source(a.source, b.source);
    }
    function content(a: Content, b: Content): boolean {
        budget.chargeWork(2); if (!text(a.kind, b.kind)) return false;
        if (a.kind === 'empty' && b.kind === 'empty') return true;
        if ((a.kind === 'simple' || a.kind === 'opaque-builtin') &&
            (b.kind === 'simple' || b.kind === 'opaque-builtin')) {budget.chargeWork(2); return ref(a.type, b.type);}
        if ((a.kind === 'element-only' || a.kind === 'mixed') &&
            (b.kind === 'element-only' || b.kind === 'mixed')) {budget.chargeWork(2); return list(a.roots, b.roots, text);}
        return false;
    }
    function identity(a: Identity, b: Identity): boolean {
        budget.chargeWork(4); if (!text(a.kind, b.kind) || !text(a.role, b.role)) return false;
        if (a.kind === 'global' && b.kind === 'global') {budget.chargeWork(2); return name(a.name, b.name);}
        if (a.kind === 'local' && b.kind === 'local') {
            budget.chargeWork(4); return text(a.owner, b.owner) && text(a.path, b.path);
        }
        // Every reached identity is actual. A fresh identity cannot certify an anchor.
        return false;
    }
    function owns(values: readonly Id[]): Id[] {
        budget.chargeWork(2); const result: Id[] = [];
        for (let i = 0; i < values.length; i++) {
            budget.chargeWork(2); const id = values[i]!; budget.chargeWork(id.length);
            if (projection.has(id)) {budget.chargeWork(); result.push(id);}
        }
        return result;
    }
    budget.chargeWork(8);
    if (!identity(left.identity, right.identity) || !source(left.source, right.source) ||
        !list(owns(left.owns), owns(right.owns), text)) return false;
    const a = left.facts, b = right.facts;
    budget.chargeWork(2); if (!text(a.kind, b.kind)) return false;
    if (a.kind === 'type' && b.kind === 'type') {
        budget.chargeWork(18);
        return text(a.variety, b.variety) && set(a.final, b.final) && set(a.block, b.block) &&
            scalar(a.abstract, b.abstract) && content(a.content, b.content) && useSet(a.attributeUses, b.attributeUses) &&
            wildcard(a.wildcard, b.wildcard) && list(a.items, b.items, ref) &&
            list(a.facets, b.facets, (x, y) => {
                budget.chargeWork(8);
                return text(x.id, y.id) && text(x.name, y.name) && scalar(x.fixed, y.fixed) && operand(x.operand, y.operand);
            });
    }
    if (a.kind === 'element' && b.kind === 'element') {
        budget.chargeWork(18);
        return name(a.name, b.name) && ref(a.type, b.type) && scalar(a.nillable, b.nillable) && scalar(a.abstract, b.abstract) &&
            set(a.final, b.final) && set(a.block, b.block) && value(a.value, b.value) &&
            ((!a.head || !b.head) ? a.head === b.head : ref(a.head, b.head)) &&
            list(a.identityConstraints, b.identityConstraints, text);
    }
    if (a.kind === 'attribute' && b.kind === 'attribute') {
        budget.chargeWork(6); return name(a.name, b.name) && ref(a.type, b.type) && value(a.value, b.value);
    }
    if (a.kind === 'attributeUse' && b.kind === 'attributeUse') {
        budget.chargeWork(6); return ref(a.declaration, b.declaration) && scalar(a.required, b.required) && value(a.value, b.value);
    }
    if (a.kind === 'particle' && b.kind === 'particle') {
        budget.chargeWork(10);
        return text(a.occurs.min, b.occurs.min) && text(a.occurs.max, b.occurs.max) && text(a.term, b.term) &&
            ((!a.reference || !b.reference) ? a.reference === b.reference : ref(a.reference, b.reference)) &&
            list(a.children, b.children, text) && wildcard(a.wildcard, b.wildcard);
    }
    if (a.kind === 'group' && b.kind === 'group') {budget.chargeWork(2); return text(a.root, b.root);}
    if (a.kind === 'attributeGroup' && b.kind === 'attributeGroup') {
        budget.chargeWork(4); return useSet(a.uses, b.uses) && wildcard(a.wildcard, b.wildcard);
    }
    return false;
}

export function compareEndpoint(prepared: Prepared, supplied: Correspondence): Result<CorrespondenceReceipt> {
    // Authentication is the fixed entry machinery; malformed pairs have no usable request.
    const descriptor = prepared && typeof prepared === 'object'
        ? Object.getOwnPropertyDescriptor(prepared, 'actual') : undefined;
    const actualHandle = descriptor && 'value' in descriptor ? descriptor.value as Prepared['actual'] : undefined;
    const outer = withContext(actualHandle!, actual => {
        const budget = actual.budget;
        budget.chargeWork(8);
        if (!samePreparedRequest(prepared, budget))
            actual.fail('invalid-prepared-contexts', 'factory-context');
        const certificate = certificateData(supplied, actual);
        budget.chargeWork(5);
        const root = actual.candidate.endpoint;
        if (budget.compareText(certificate.actualRoot, root) !== 0 || budget.compareText(certificate.proposedRoot, root) !== 0)
            actual.fail('wrong-endpoint-root', 'endpoint-correspondence', root, undefined, undefined, 'candidate-rejected');
        return withContext(prepared.proposed, proposed => {
            function reject(code: string, component: Id = root): never {
                return proposed.fail(code, 'endpoint-correspondence', component, undefined, undefined, 'candidate-rejected');
            }
            const left = project(actual, root), right = project(proposed, root);
            budget.chargeWork(3);
            if (left.size !== right.size || certificate.pairs.length !== left.size) reject('projection-cardinality');
            budget.chargeWork(2); const from = new Set<Id>(), to = new Set<Id>();
            budget.chargeWork();
            for (let i = 0; i < certificate.pairs.length; i++) {
                budget.chargeWork(3); const pair = certificate.pairs[i]!; const a = pair[0], b = pair[1];
                budget.chargeWork(4 + 2 * a.length + 2 * b.length);
                if (!left.has(a) || !right.has(b) || from.has(a) || to.has(b)) reject('certificate-bijection');
                if (budget.compareText(a, b) !== 0) reject('anchored-identity', a);
                budget.chargeWork(2 + a.length + b.length); from.add(a); to.add(b);
            }
            budget.chargeWork(2 + 2 * left.size); const ids = Array.from(left.keys());
            const ordered = budget.sorted(ids, (a, b) => budget.compareText(a, b));
            for (let i = 0; i < ordered.length; i++) {
                budget.chargeWork(3); const id = ordered[i]!; budget.chargeWork(2 * id.length);
                const a = left.get(id)!, b = right.get(id)!;
                budget.chargeWork(2);
                if (a.expanded !== b.expanded) reject('projection-expansion', id);
                if (a.expanded && !propertiesEqual(a.component, b.component, left, budget)) reject('endpoint-properties', id);
            }
            // Canonical receipt order is independent of the supplied pair order.
            budget.chargeWork(); const pairs: Pair[] = [];
            for (let i = 0; i < ordered.length; i++) {
                budget.chargeWork(); const id = ordered[i]!;
                budget.chargeWork(4 + 2 * id.length); pairs.push([id, id]);
            }
            budget.chargeWork(5 + 'scope'.length + 'actualContext'.length + 'proposedContext'.length + 'pairs'.length +
                'endpoint-properties-and-incidence'.length + prepared.actual.key.length + prepared.proposed.key.length);
            const receipt: CorrespondenceReceipt = {scope: 'endpoint-properties-and-incidence',
                actualContext: prepared.actual.key, proposedContext: prepared.proposed.key, pairs};
            return budget.freeze(receipt);
        });
    });
    return outer.kind === 'ok' ? outer.value : outer;
}
