/** One explicit finite component universe. No schema assessment or witness search. */
import { createResolverBudget, ResolverInvalidLimitsError } from './resolver-budget.js';
import type { ResolverBudget } from './resolver-budget.js';
import type {
    ActualInput, Candidate, Component, Context, Diagnostic, Facts, Id, Kind, Limits,
    Name, Prepared, Ref, Result, Source, Target,
} from './resolver-types.js';

const FIELDS_KIND: readonly string[] = Object.freeze(['kind']);
const FIELDS_NAME: readonly string[] = Object.freeze(['namespace', 'local']);
const FIELDS_SOURCE: readonly string[] = Object.freeze(['uri', 'digest', 'path', 'baseUri', 'start', 'end', 'namespaces', 'effectiveNamespace', 'interpretation', 'chameleon']);
const FIELDS_POSITION: readonly string[] = Object.freeze(['line', 'column']);
const FIELDS_BUILTIN_REF: readonly string[] = Object.freeze(['kind', 'name']);
const FIELDS_LOCAL_REF: readonly string[] = Object.freeze(['kind', 'target']);
const FIELDS_SYMBOL_REF: readonly string[] = Object.freeze(['kind', 'role', 'name', 'target', 'source']);
const SYMBOL_ROLES: readonly string[] = Object.freeze(['type', 'element', 'attribute', 'group', 'attributeGroup']);
const SIMPLE_CYCLES = Object.freeze(['type-expansion', 'simple-expansion'] as const);
const CONTENT_SELECTORS = Object.freeze(['content', 'declaredContent'] as const);
const SUBSTITUTION_CYCLES = Object.freeze(['substitution'] as const);
const ATTRIBUTE_GROUP_CYCLES = Object.freeze(['attribute-group-expansion'] as const);
const GROUP_CYCLES = Object.freeze(['group-expansion'] as const);
const CONTAINMENT_GROUP_CYCLES = Object.freeze(['containment', 'group-expansion'] as const);
const CONTAINMENT_CYCLES = Object.freeze(['containment'] as const);
const OWNERSHIP_CYCLES = Object.freeze(['ownership'] as const);
const FIELDS_COMPONENT: readonly string[] = Object.freeze(['id', 'identity', 'facts', 'owns', 'source', 'sourceUses', 'sourceGroups', 'unassessed', 'provenance']);
const FIELDS_GLOBAL_IDENTITY: readonly string[] = Object.freeze(['kind', 'role', 'name']);
const FIELDS_LOCAL_IDENTITY: readonly string[] = Object.freeze(['kind', 'owner', 'path', 'role']);
const FIELDS_FRESH_IDENTITY: readonly string[] = Object.freeze(['kind', 'path', 'role']);
const OPTIONAL_OWNER: readonly string[] = Object.freeze(['owner']);
const FIELDS_PROVENANCE: readonly string[] = Object.freeze(['kind', 'originals']);
const PROVENANCE_KINDS: readonly string[] = Object.freeze(['actual', 'constructed', 'endpoint-replacement']);
const ALL_METHODS: readonly string[] = Object.freeze(['extension', 'restriction', 'list', 'union']);
const NAMESPACE_KINDS: readonly string[] = Object.freeze(['set', 'not']);
const WILDCARD_PROCESS_MODES: readonly string[] = Object.freeze(['strict', 'lax', 'skip']);
const FIELDS_WILDCARD: readonly string[] = Object.freeze(['namespaces', 'process', 'source']);
const FIELDS_NAMESPACE_CONSTRAINT: readonly string[] = Object.freeze(['kind', 'values']);
const VALUE_KINDS: readonly string[] = Object.freeze(['fixed', 'default']);
const FIELDS_VALUE: readonly string[] = Object.freeze(['kind', 'operand']);
const FIELDS_OPERAND: readonly string[] = Object.freeze(['type', 'lexical', 'source']);
const FIELDS_TYPE: readonly string[] = Object.freeze(['kind', 'variety', 'base', 'method', 'final', 'block', 'abstract', 'content', 'declaredContent', 'attributeUses', 'items', 'facets']);
const OPTIONAL_TYPE_WILDCARDS: readonly string[] = Object.freeze(['wildcard', 'declaredWildcard']);
const TYPE_VARIETIES: readonly string[] = Object.freeze(['complex', 'atomic', 'list', 'union']);
const COMPLEX_METHODS: readonly string[] = Object.freeze(['extension', 'restriction']);
const CONTENT_KINDS: readonly string[] = Object.freeze(['empty', 'simple', 'element-only', 'mixed', 'opaque-builtin']);
const FIELDS_TYPED_CONTENT: readonly string[] = Object.freeze(['kind', 'type']);
const FIELDS_PARTICLE_CONTENT: readonly string[] = Object.freeze(['kind', 'roots']);
const FIELDS_FACET: readonly string[] = Object.freeze(['id', 'name', 'fixed', 'operand']);
const FIELDS_ELEMENT: readonly string[] = Object.freeze(['kind', 'name', 'type', 'nillable', 'abstract', 'final', 'block', 'identityConstraints']);
const OPTIONAL_ELEMENT_PROPERTIES: readonly string[] = Object.freeze(['value', 'head']);
const FIELDS_ATTRIBUTE: readonly string[] = Object.freeze(['kind', 'name', 'type']);
const OPTIONAL_VALUE: readonly string[] = Object.freeze(['value']);
const FIELDS_ATTRIBUTE_USE: readonly string[] = Object.freeze(['kind', 'declaration', 'required']);
const FIELDS_PARTICLE: readonly string[] = Object.freeze(['kind', 'occurs', 'term', 'children']);
const OPTIONAL_PARTICLE_PROPERTIES: readonly string[] = Object.freeze(['reference', 'wildcard']);
const FIELDS_OCCURS: readonly string[] = Object.freeze(['min', 'max']);
const PARTICLE_TERMS: readonly string[] = Object.freeze(['element', 'group', 'any', 'sequence', 'choice', 'all']);
const COMPOSITOR_TERMS: readonly string[] = Object.freeze(['sequence', 'choice', 'all']);
const FIELDS_GROUP: readonly string[] = Object.freeze(['kind', 'root']);
const FIELDS_ATTRIBUTE_GROUP: readonly string[] = Object.freeze(['kind', 'uses']);
const OPTIONAL_WILDCARD: readonly string[] = Object.freeze(['wildcard']);
const FIELDS_ADMITTED_USE: readonly string[] = Object.freeze(['kind', 'owner', 'origin', 'use', 'role', 'source']);
const OPTIONAL_OWN_VALUE: readonly string[] = Object.freeze(['ownValue']);
const SOURCE_ADMISSION_ROLES: readonly string[] = Object.freeze(['local', 'group']);
const PROHIBITION_ROLES: readonly string[] = Object.freeze(['direct-prohibition', 'group-prohibition']);
const FIELDS_SOURCE_GROUP: readonly string[] = Object.freeze(['owner', 'origin', 'reference', 'source']);
const FIELDS_UNASSESSED: readonly string[] = Object.freeze(['rule', 'owner', 'source']);
const ATTRIBUTE_ACTION_ROLES: readonly string[] = Object.freeze(['retain', 'replace', 'prohibit']);
const FIELDS_REPLACE_ACTION: readonly string[] = Object.freeze(['name', 'role', 'uses']);
const FIELDS_OTHER_ACTION: readonly string[] = Object.freeze(['name', 'role']);
const NONOWNING_KINDS: readonly string[] = Object.freeze(['particle', 'attributeUse']);
const FORBIDDEN_CYCLE_CLASSES = Object.freeze(['ownership', 'containment', 'group-expansion', 'attribute-group-expansion', 'simple-expansion', 'complex-derivation', 'type-expansion', 'substitution'] as const);
const FIELDS_ACTUAL_INPUT: readonly string[] = Object.freeze(['key', 'components']);
const FIELDS_CANDIDATE: readonly string[] = Object.freeze(['key', 'ancestor', 'intermediate', 'endpoint', 'retained', 'additions', 'endpointDefinition', 'attributes']);
const ALL_BLOCK_METHODS: readonly string[] = Object.freeze(['extension', 'restriction', 'list', 'union', 'substitution'] as const);
const NO_FIELDS: readonly string[] = Object.freeze([]);
const COMPLEX_BASE_CYCLES: readonly CycleClass[] = Object.freeze(['type-expansion', 'complex-derivation']);
const SIMPLE_BASE_CYCLES: readonly CycleClass[] = Object.freeze(['type-expansion', 'simple-expansion']);
const NO_CYCLES: readonly CycleClass[] = Object.freeze([]);
const NO_SOURCES: readonly Source[] = Object.freeze([]);
const LOCAL_PROHIBITION_FIELDS: readonly string[] = Object.freeze(['kind', 'owner', 'origin', 'name', 'role', 'source', 'representationChecks']);
const REFERENCE_PROHIBITION_FIELDS: readonly string[] = Object.freeze(['kind', 'owner', 'origin', 'declaration', 'role', 'source', 'representationChecks']);
const CONTEXT_FIELDS: readonly string[] = Object.freeze(['key', 'kind', 'members', 'excludedIncoming']);
const ACCESS_FIELDS: readonly string[] = Object.freeze(['budget', 'candidate', 'requestIdentity', 'component', 'edges', 'reference', 'has', 'cache', 'fail']);
const STATE_FIELDS: readonly string[] = Object.freeze(['budget', 'candidate', 'actual', 'proposed', 'actualEdges', 'proposedEdges', 'identity']);
const PREPARED_FIELDS: readonly string[] = Object.freeze(['actual', 'proposed']);
const RESULT_FIELDS: readonly string[] = Object.freeze(['kind', 'value', 'usage']);
const ERROR_RESULT_FIELDS: readonly string[] = Object.freeze(['kind', 'diagnostic', 'usage']);
const DIAGNOSTIC_FIELDS: readonly string[] = Object.freeze(['code', 'rule', 'context', 'candidate', 'component', 'slot', 'source', 'related']);
const DIAGNOSIS_STATE_FIELDS: readonly string[] = Object.freeze(['budget', 'candidate', 'actual']);
export const XSD_NAMESPACE = 'http://www.w3.org/2001/XMLSchema';
const BUILTINS = new Set([
    'anyType', 'anySimpleType', 'string', 'boolean', 'decimal', 'float', 'double',
    'duration', 'dateTime', 'time', 'date', 'gYearMonth', 'gYear', 'gMonthDay', 'gDay',
    'gMonth', 'hexBinary', 'base64Binary', 'anyURI', 'QName', 'NOTATION',
    'normalizedString', 'token', 'language', 'Name', 'NCName', 'ID', 'IDREF', 'IDREFS',
    'ENTITY', 'ENTITIES', 'NMTOKEN', 'NMTOKENS', 'integer', 'nonPositiveInteger',
    'negativeInteger', 'long', 'int', 'short', 'byte', 'nonNegativeInteger',
    'unsignedLong', 'unsignedInt', 'unsignedShort', 'unsignedByte', 'positiveInteger',
]);
export type CycleClass = 'ownership' | 'containment' | 'group-expansion'
    | 'attribute-group-expansion' | 'simple-expansion' | 'complex-derivation' | 'type-expansion' | 'substitution';
export type ComponentEdge = Readonly<{
    slot: string; target?: Id; reference?: Ref; expected?: Kind;
    cycles: readonly CycleClass[]; global?: boolean; containment?: boolean;
}>;
type Index = Map<Id, Component>;
type EdgeIndex = Map<Id, readonly ComponentEdge[]>;
type State = {
    budget: ResolverBudget; candidate: Candidate; actual: Index; proposed: Index;
    actualEdges: EdgeIndex; proposedEdges: EdgeIndex; identity: object;
    actualCache?: Map<object, unknown>; proposedCache?: Map<object, unknown>;
};
const handles = new WeakMap<Context, State>();
const builtinTargets = new Map(Array.from(BUILTINS, local => [local,
    Object.freeze({kind: 'builtin' as const, name: Object.freeze({namespace: XSD_NAMESPACE, local})})]));

/** Narrow private leaf API. Components always come from the selected caller universe. */
export interface ContextAccess {
    readonly budget: ResolverBudget;
    readonly candidate: Candidate;
    readonly requestIdentity: object;
    component(id: Id): Component | undefined;
    edges(id: Id): readonly ComponentEdge[] | undefined;
    reference(owner: Id, slot: string): ComponentEdge | undefined;
    has(id: Id): boolean;
    cache<T>(module: object, create: () => T): T;
    fail(code: string, rule: string, component?: Id, slot?: string, source?: Source,
        kind?: 'input-error' | 'candidate-rejected' | 'unresolved'): never;
}

class Invalid extends Error {
    constructor(readonly code: string, readonly rule: string, readonly component?: Id,
        readonly slot?: string, readonly source?: Source,
        readonly kind: 'input-error' | 'candidate-rejected' | 'unresolved' = 'input-error',
        readonly related: readonly Source[] = NO_SOURCES) {
        super(code);
    }
}
function invalid(code: string, rule = 'component-view', component?: Id, slot?: string,
    source?: Source, kind?: Invalid['kind']): never {
    throw new Invalid(code, rule, component, slot, source, kind);
}
function assert(condition: unknown, code: string, component?: Component, slot?: string): asserts condition {
    if (!condition) invalid(code, 'component-view', component?.id, slot, component?.source);
}
function text(value: unknown): value is string { return typeof value === 'string'; }
function record(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function name(budget: ResolverBudget, value: unknown): value is Name {
    budget.chargeWork();
    if (!record(value)) return false;
    fields(budget, value, FIELDS_NAME);
    budget.chargeWork(3);
    return text(value.namespace) && text(value.local) && value.local.length > 0;
}
function fields(budget: ResolverBudget, value: object, required: readonly string[], optional: readonly string[] = NO_FIELDS, component?: Component): void {
    for (const key of required) {
        budget.chargeWork(44 + key.length);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        assert(descriptor && 'value' in descriptor && descriptor.enumerable, 'missing-or-accessor-field', component, key);
    }
    for (const key of optional) {
        budget.chargeWork(2 + key.length);
        if (!Object.hasOwn(value, key)) continue;
        budget.chargeWork(43 + key.length);
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        assert('value' in descriptor && descriptor.enumerable, 'missing-or-accessor-field', component, key);
    }
    for (const key in value) {
        budget.chargeWork(2 + key.length);
        assert(Object.hasOwn(value, key), 'inherited-field', component, key);
        const contains = (keys: readonly string[]): boolean => {
            for (const allowed of keys) {
                budget.chargeWork();
                if (budget.compareText(allowed, key) === 0) return true;
            }
            return false;
        };
        assert(contains(required) || contains(optional), 'unexpected-field', component, key);
    }
}
function data(value: unknown, key: string, budget?: ResolverBudget): unknown {
    budget?.chargeWork();
    if (!record(value)) return undefined;
    budget?.chargeWork(43 + key.length);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
/** Read diagnostic metadata entries without invoking malformed array accessors. */
function arrayData(value: readonly unknown[], key: string, budget: ResolverBudget): unknown {
    budget.chargeWork(44 + key.length);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
function requiredData(value: unknown, keys: readonly string[], budget: ResolverBudget): void {
    assert(record(value), 'invalid-record');
    for (const key of keys) {
        budget.chargeWork(44 + key.length);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        assert(descriptor && 'value' in descriptor && descriptor.enumerable, 'missing-or-accessor-field');
    }
    fields(budget, value, keys);
}
function requiredField(value: object, key: string, budget: ResolverBudget): void {
    budget.chargeWork(44 + key.length);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert(descriptor && 'value' in descriptor && descriptor.enumerable, 'missing-or-accessor-field');
}
function chargeRecord(budget: ResolverBudget, keys: readonly string[], textUnits = 0): void {
    budget.chargeWork(1 + keys.length + textUnits);
    for (const key of keys) budget.chargeWork(1 + key.length);
}
function contains(budget: ResolverBudget, values: readonly string[], wanted: string): boolean {
    for (const value of values) { budget.chargeWork(); if (budget.compareText(value, wanted) === 0) return true; }
    return false;
}
function everyText(budget: ResolverBudget, values: readonly unknown[]): boolean {
    budget.chargeWork();
    for (const value of values) { budget.chargeWork(2); if (!text(value)) return false; }
    return true;
}
function sameName(left: Name, right: Name, budget: ResolverBudget): boolean {
    budget.chargeWork(4);
    return budget.compareText(left.namespace, right.namespace) === 0
        && budget.compareText(left.local, right.local) === 0;
}
export function admittedBuiltin(reference: Ref, budget: ResolverBudget): boolean {
    budget.chargeWork(4);
    if (reference.kind !== 'builtin' || budget.compareText(reference.name.namespace, XSD_NAMESPACE) !== 0) return false;
    budget.chargeWork(2 + reference.name.local.length);
    return BUILTINS.has(reference.name.local);
}
export function builtinTarget(reference: Ref, budget: ResolverBudget): Target | undefined {
    if (!admittedBuiltin(reference, budget)) return undefined;
    budget.chargeWork(2 + (reference as Extract<Ref, {kind: 'builtin'}>).name.local.length);
    return builtinTargets.get((reference as Extract<Ref, {kind: 'builtin'}>).name.local);
}

/** Charge all original nested records/text without copying or freezing borrowed actuals. */
function inspect(value: unknown, budget: ResolverBudget, immutable = false): void {
    budget.chargeWork(17); // Three containers, two-field frame/name text and push.
    const active = new Set<object>(), done = new Set<object>();
    const stack: {value: unknown; leave: boolean}[] = [{value, leave: false}];
    while (stack.length) {
        budget.chargeWork(3); const frame = stack.pop()!, current = frame.value;
        if (text(current)) { budget.chargeWork(current.length); continue; }
        if (current === null || typeof current !== 'object') {
            assert(current === undefined || typeof current === 'boolean' || typeof current === 'number', 'invalid-field'); continue;
        }
        if (frame.leave) { budget.chargeWork(2); active.delete(current); done.add(current); continue; }
        budget.chargeWork(5); // Record visit, two set reads, array/prototype inspection.
        assert(!active.has(current), 'cyclic-record');
        if (done.has(current)) continue;
        // Immutability is the prepared-graph authority's precondition; never freeze borrowed inputs.
        void immutable;
        const array = Array.isArray(current);
        const prototype: unknown = Object.getPrototypeOf(current);
        assert(prototype === Object.prototype || prototype === null || array, 'invalid-record-prototype');
        budget.chargeWork(15); active.add(current); stack.push({value: current, leave: true});
        if (array) {
            budget.chargeWork(); const length = (current as unknown[]).length;
            for (let index = 0; index < length; index++) {
                const digits = index < 10 ? 1 : index < 100 ? 2 : index < 1_000 ? 3 : index < 10_000 ? 4 :
                    index < 100_000 ? 5 : index < 1_000_000 ? 6 : index < 10_000_000 ? 7 :
                    index < 100_000_000 ? 8 : index < 1_000_000_000 ? 9 : 10;
                budget.chargeWork(1 + digits); const key = String(index);
                budget.chargeWork(44 + key.length);
                const descriptor = Object.getOwnPropertyDescriptor(current, key);
                assert(descriptor && 'value' in descriptor && descriptor.enumerable, 'sparse-or-accessor-array');
                budget.chargeWork(14); stack.push({value: descriptor.value, leave: false});
            }
            for (const key in current) {
                budget.chargeWork(2 + 3 * key.length);
                assert(Object.hasOwn(current, key) && /^(0|[1-9][0-9]*)$/.test(key)
                    && Number(key) < length, 'extra-array-field');
            }
        } else {
            // No unknown-length own-key array is materialized. Consumed fixed
            // schema fields are checked separately by fields() before reads.
            for (const key in current) {
                budget.chargeWork(45 + key.length);
                assert(Object.hasOwn(current, key), 'inherited-field');
                const descriptor = Object.getOwnPropertyDescriptor(current, key)!;
                assert('value' in descriptor && descriptor.enumerable, 'accessor-field');
                budget.chargeWork(14); stack.push({value: descriptor.value, leave: false});
            }
        }
    }
}
function validateSource(budget: ResolverBudget, source: Source, component?: Component): void {
    assert(record(source), 'invalid-source', component);
    fields(budget, source, FIELDS_SOURCE, NO_FIELDS, component);
    assert(text(source.uri) && text(source.digest) && text(source.path) && text(source.baseUri)
        && text(source.effectiveNamespace) && text(source.interpretation)
        && typeof source.chameleon === 'boolean' && record(source.namespaces), 'invalid-source', component);
    const position = (position: Source['start']): void => {
        assert(record(position), 'invalid-source-position', component);
        fields(budget, position, FIELDS_POSITION, NO_FIELDS, component);
        budget.chargeWork(6);
        assert(record(position) && Number.isSafeInteger(position.line) && position.line >= 0
            && Number.isSafeInteger(position.column) && position.column >= 0, 'invalid-source-position', component);
    };
    budget.chargeWork(2); position(source.start); position(source.end);
    for (const prefix in source.namespaces) { budget.chargeWork(2 + prefix.length); assert(text(source.namespaces[prefix]), 'invalid-namespace', component); }
}
function validateRef(budget: ResolverBudget, ref: Ref, component: Component, slot: string): void {
    assert(record(ref), 'invalid-reference', component, slot);
    requiredField(ref, 'kind', budget);
    if (ref.kind === 'builtin') { fields(budget, ref, FIELDS_BUILTIN_REF, NO_FIELDS, component); assert(name(budget, ref.name), 'invalid-builtin', component, slot); }
    else if (ref.kind === 'local') { fields(budget, ref, FIELDS_LOCAL_REF, NO_FIELDS, component); assert(text(ref.target) && ref.target.length > 0, 'invalid-target', component, slot); }
    else if (ref.kind === 'symbol') {
        fields(budget, ref, FIELDS_SYMBOL_REF, NO_FIELDS, component);
        assert(contains(budget, SYMBOL_ROLES, ref.role)
            && name(budget, ref.name) && text(ref.target) && ref.target.length > 0, 'unresolved-symbol', component, slot);
        validateSource(budget, ref.source, component);
    } else invalid('invalid-reference', 'component-view', component.id, slot, component.source);
}
/** Fixed semantic slot order; source-only operands remain explicit. */
function componentEdges(component: Component, budget: ResolverBudget): readonly ComponentEdge[] {
    budget.chargeWork(3);
    const edges: ComponentEdge[] = [];
    const f = component.facts, kind = f.kind;
    const slot = (prefix: string, index: number, suffix = ''): string => {
        const digits = index < 10 ? 1 : index < 100 ? 2 : index < 1_000 ? 3 :
            index < 10_000 ? 4 : index < 100_000 ? 5 : index < 1_000_000 ? 6 :
            index < 10_000_000 ? 7 : index < 100_000_000 ? 8 : index < 1_000_000_000 ? 9 : 10;
        budget.chargeWork(4 + prefix.length + suffix.length + 2 * digits);
        return prefix + String(index) + suffix;
    };
    const edge = (slot: string, expected: Kind | undefined, reference?: Ref, target?: Id,
        cycles: readonly CycleClass[] = NO_CYCLES, global = false, containment = false): void => {
        if (reference) validateRef(budget, reference, component, slot);
        if (target !== undefined) { budget.chargeWork(1 + target.length); assert(text(target) && target.length > 0, 'invalid-target', component, slot); }
        budget.chargeWork(59 + slot.length + (expected?.length ?? 0));
        edges.push({ slot, expected, reference, target, cycles, global, containment });
    };
    const each = <T>(values: readonly T[], visit: (value: T, index: number) => void): void => {
        budget.chargeWork(); const length = values.length;
        for (let index = 0; index < length; index++) { budget.chargeWork(); visit(values[index]!, index); }
    };
    const sortedIds = (values: readonly Id[]): readonly Id[] => {
        const ordered = budget.sorted(values, budget.compareText);
        budget.chargeWork(); const unique: Id[] = [];
        each(ordered, value => {
            budget.chargeWork();
            if (unique.length === 0 || budget.compareText(unique[unique.length - 1]!, value) !== 0) {
                budget.chargeWork(); unique.push(value);
            }
        });
        return unique;
    };
    if (f.kind === 'type') {
        budget.chargeWork(3);
        edge('base', 'type', f.base, undefined, f.variety === 'complex' ? COMPLEX_BASE_CYCLES : SIMPLE_BASE_CYCLES);
        each(f.items, (ref, i) => edge(slot('items/', i), 'type', ref, undefined, SIMPLE_CYCLES));
        for (const field of CONTENT_SELECTORS) {
            budget.chargeWork(2); const content = f[field];
            if (content.kind === 'simple' || content.kind === 'opaque-builtin') {
                budget.chargeWork();
                edge(field === 'content' ? 'content/type' : 'declaredContent/type', 'type', content.type);
            }
        }
    }
    if (f.kind === 'element' || f.kind === 'attribute') { budget.chargeWork(); edge('type', 'type', f.type); }
    if (f.kind === 'element') { budget.chargeWork(); if (f.head) edge('head', 'element', f.head, undefined, SUBSTITUTION_CYCLES, true); }
    if (f.kind === 'attributeUse') { budget.chargeWork(); edge('declaration', 'attribute', f.declaration); }
    if (f.kind === 'element' || f.kind === 'attribute' || f.kind === 'attributeUse') {
        budget.chargeWork();
        if (f.value) { budget.chargeWork(2); edge('value/operand/type', 'type', f.value.operand.type); }
    }
    if (f.kind === 'type') {
        budget.chargeWork();
        each(f.facets, (facet, i) => { budget.chargeWork(2); edge(slot('facets/', i, '/operand/type'), 'type', facet.operand.type); });
    }
    budget.chargeWork();
    each(component.sourceUses, (use, i) => {
        budget.chargeWork(); if (use.kind === 'reference-prohibition') { budget.chargeWork(); edge(slot('sourceUses/', i, '/declaration'), 'attribute', use.declaration); }
    });
    each(component.sourceUses, (use, i) => {
        budget.chargeWork(2);
        if (use.kind === 'admitted' && use.ownValue) { budget.chargeWork(2); edge(slot('sourceUses/', i, '/ownValue/operand/type'), 'type', use.ownValue.operand.type); }
    });
    budget.chargeWork();
    each(component.sourceGroups, (use, i) => {
        budget.chargeWork();
        edge(slot('sourceGroups/', i, '/reference'), 'attributeGroup', use.reference,
            undefined, kind === 'attributeGroup' ? ATTRIBUTE_GROUP_CYCLES : NO_CYCLES);
    });
    if (f.kind === 'particle') {
        budget.chargeWork(2);
        if (f.reference) edge('reference', f.term === 'element' ? 'element' : 'group', f.reference,
            undefined, f.term === 'group' ? GROUP_CYCLES : NO_CYCLES);
    }
    // Nonreference slots follow all reference families; numeric indexes retain source order.
    if (f.kind === 'type') {
        for (const field of CONTENT_SELECTORS) {
            budget.chargeWork(2); const content = f[field];
            if (content.kind === 'element-only' || content.kind === 'mixed') {
                budget.chargeWork();
                each(content.roots, (id, i) => edge(slot(field === 'content' ? 'content/roots/' : 'declaredContent/roots/', i), 'particle', undefined, id));
            }
        }
        budget.chargeWork();
        each(sortedIds(f.attributeUses), (id, i) => edge(slot('attributeUses/', i), 'attributeUse', undefined, id));
    }
    if (f.kind === 'particle') { budget.chargeWork(); each(f.children, (id, i) => edge(slot('children/', i), 'particle', undefined, id, CONTAINMENT_GROUP_CYCLES)); }
    if (f.kind === 'group') { budget.chargeWork(); edge('root', 'particle', undefined, f.root, CONTAINMENT_GROUP_CYCLES); }
    if (f.kind === 'attributeGroup') { budget.chargeWork(); each(sortedIds(f.uses), (id, i) => edge(slot('uses/', i), 'attributeUse', undefined, id)); }
    each(component.sourceUses, (use, i) => {
        budget.chargeWork(); if (use.kind === 'admitted') { budget.chargeWork(); edge(slot('sourceUses/', i, '/use'), 'attributeUse', undefined, use.use); }
    });
    budget.chargeWork();
    each(component.owns, (id, i) => edge(slot('owns/', i), undefined, undefined, id, CONTAINMENT_CYCLES, false, true));
    budget.chargeWork(2); const identity = component.identity;
    if (identity.kind === 'local' || identity.kind === 'fresh') {
        budget.chargeWork(); if (identity.owner !== undefined) edge('identity/owner', undefined, undefined, identity.owner, OWNERSHIP_CYCLES);
    }
    each(component.sourceUses, (use, i) => { budget.chargeWork(); edge(slot('sourceUses/', i, '/owner'), undefined, undefined, use.owner); });
    each(component.sourceGroups, (use, i) => { budget.chargeWork(); edge(slot('sourceGroups/', i, '/owner'), undefined, undefined, use.owner); });
    // Only owned wrappers are frozen: references and cycle constants are borrowed.
    for (const value of edges) { budget.chargeWork(59); Object.freeze(value); }
    budget.chargeWork(1 + edges.length); return Object.freeze(edges);
}

function validateView(component: Component, actual: boolean, budget: ResolverBudget): void {
    assert(record(component), 'invalid-component');
    fields(budget, component, FIELDS_COMPONENT);
    budget.chargeWork(4);
    assert(text(component.id) && component.id.length > 0, 'invalid-id');
    assert(record(component.identity) && record(component.facts), 'invalid-component', component);
    requiredField(component.identity, 'kind', budget);
    requiredField(component.identity, 'role', budget);
    requiredField(component.facts, 'kind', budget);
    assert(record(component.provenance), 'invalid-component', component);
    fields(budget, component.provenance, FIELDS_PROVENANCE, NO_FIELDS, component);
    assert(component.identity.role === component.facts.kind, 'identity-role', component);
    assert(Array.isArray(component.owns) && Array.isArray(component.sourceUses)
        && Array.isArray(component.sourceGroups) && Array.isArray(component.unassessed)
        && record(component.provenance) && Array.isArray(component.provenance.originals), 'invalid-component', component);
    validateSource(budget, component.source, component);
    const identity = component.identity;
    if (identity.kind === 'global') {
        fields(budget, identity, FIELDS_GLOBAL_IDENTITY, NO_FIELDS, component);
        assert(name(budget, identity.name), 'invalid-name', component);
        budget.chargeWork(2 + identity.name.local.length);
        assert(!(identity.role === 'type' && budget.compareText(identity.name.namespace, XSD_NAMESPACE) === 0
            && BUILTINS.has(identity.name.local)), 'builtin-collision', component);
    } else if (identity.kind === 'local' || identity.kind === 'fresh') {
        fields(budget, identity, identity.kind === 'local' ? FIELDS_LOCAL_IDENTITY : FIELDS_FRESH_IDENTITY, OPTIONAL_OWNER, component);
        assert(text(identity.path) && identity.path.length > 0, 'invalid-local-path', component);
        if (identity.kind === 'local' || identity.owner !== undefined)
            assert(text(identity.owner) && identity.owner.length > 0, 'invalid-owner', component);
    } else invalid('invalid-identity', 'component-view', component.id);
    assert(contains(budget, PROVENANCE_KINDS, component.provenance.kind), 'invalid-provenance', component);
    if (actual) assert(component.provenance.kind === 'actual' && identity.kind !== 'fresh', 'actual-identity', component);
    const methods = (values: readonly string[], permitted: readonly string[]): void => {
        assert(Array.isArray(values), 'invalid-methods', component);
        budget.chargeWork(); const seen = new Set<string>();
        for (const method of values) { budget.chargeWork(2); assert(contains(budget, permitted, method) && !seen.has(method), 'invalid-methods', component); seen.add(method); }
    };
    const allMethods = ALL_METHODS;
    const wildcard = (value: unknown): void => {
        if (value === undefined) return;
        assert(record(value), 'invalid-wildcard', component);
        fields(budget, value, FIELDS_WILDCARD, NO_FIELDS, component);
        assert(record(value.namespaces), 'invalid-wildcard', component);
        fields(budget, value.namespaces, FIELDS_NAMESPACE_CONSTRAINT, NO_FIELDS, component);
        assert(record(value) && record(value.namespaces) && contains(budget, NAMESPACE_KINDS, value.namespaces.kind as string)
            && Array.isArray(value.namespaces.values) && everyText(budget, value.namespaces.values)
            && contains(budget, WILDCARD_PROCESS_MODES, value.process as string), 'invalid-wildcard', component);
        validateSource(budget, value.source as Source, component);
    };
    const value = (v: unknown): void => {
        if (v === undefined) return;
        assert(record(v), 'invalid-value', component);
        fields(budget, v, FIELDS_VALUE, NO_FIELDS, component);
        assert(record(v.operand), 'invalid-value', component);
        fields(budget, v.operand, FIELDS_OPERAND, NO_FIELDS, component);
        assert(record(v) && contains(budget, VALUE_KINDS, v.kind as string) && record(v.operand)
            && text(v.operand.lexical), 'invalid-value', component);
        validateSource(budget, v.operand.source as Source, component);
    };
    const f = component.facts;
    switch (f.kind) {
        case 'type': {
            fields(budget, f, FIELDS_TYPE, OPTIONAL_TYPE_WILDCARDS, component);
            assert(contains(budget, TYPE_VARIETIES, f.variety)
                && contains(budget, allMethods, f.method) && typeof f.abstract === 'boolean'
                && Array.isArray(f.items) && Array.isArray(f.facets) && Array.isArray(f.attributeUses), 'invalid-type', component);
            methods(f.final, allMethods); methods(f.block, COMPLEX_METHODS);
            budget.chargeWork(5);
            for (const content of [f.content, f.declaredContent]) {
                assert(record(content), 'invalid-content', component);
                requiredField(content, 'kind', budget);
                assert(contains(budget, CONTENT_KINDS, content.kind), 'invalid-content', component);
                fields(budget, content, content.kind === 'empty' ? FIELDS_KIND
                    : content.kind === 'simple' || content.kind === 'opaque-builtin' ? FIELDS_TYPED_CONTENT : FIELDS_PARTICLE_CONTENT, NO_FIELDS, component);
                if (content.kind === 'element-only' || content.kind === 'mixed') assert(Array.isArray(content.roots), 'invalid-content', component);
                if (content.kind === 'empty') assert(!('roots' in content) && !('type' in content), 'invalid-content-fields', component);
            }
            assert(f.variety === 'list' ? f.items.length === 1 : f.variety === 'union' ? f.items.length > 0 : f.items.length === 0, 'invalid-items', component);
            if (f.variety !== 'complex') assert(f.content.kind === 'empty' && f.declaredContent.kind === 'empty'
                && f.attributeUses.length === 0 && !f.wildcard && !f.declaredWildcard, 'simple-complex-properties', component);
            wildcard(f.wildcard); wildcard(f.declaredWildcard);
            for (const facet of f.facets) {
                assert(record(facet), 'invalid-facet', component);
                fields(budget, facet, FIELDS_FACET, NO_FIELDS, component);
                assert(record(facet.operand), 'invalid-facet', component);
                fields(budget, facet.operand, FIELDS_OPERAND, NO_FIELDS, component);
                assert(record(facet) && text(facet.id) && facet.id.length > 0 && text(facet.name) && typeof facet.fixed === 'boolean'
                    && record(facet.operand) && text(facet.operand.lexical), 'invalid-facet', component);
                validateSource(budget, facet.operand.source as Source, component);
            }
            break;
        }
        case 'element':
            fields(budget, f, FIELDS_ELEMENT, OPTIONAL_ELEMENT_PROPERTIES, component);
            assert(name(budget, f.name) && typeof f.abstract === 'boolean' && typeof f.nillable === 'boolean'
                && Array.isArray(f.identityConstraints) && everyText(budget, f.identityConstraints), 'invalid-element', component);
            methods(f.final, allMethods); methods(f.block, ALL_BLOCK_METHODS); value(f.value); break;
        case 'attribute': fields(budget, f, FIELDS_ATTRIBUTE, OPTIONAL_VALUE, component); assert(name(budget, f.name), 'invalid-attribute', component); value(f.value); break;
        case 'attributeUse': fields(budget, f, FIELDS_ATTRIBUTE_USE, OPTIONAL_VALUE, component); assert(typeof f.required === 'boolean', 'invalid-attribute-use', component); value(f.value); break;
        case 'particle': {
            fields(budget, f, FIELDS_PARTICLE, OPTIONAL_PARTICLE_PROPERTIES, component);
            assert(record(f.occurs), 'invalid-occurs', component);
            fields(budget, f.occurs, FIELDS_OCCURS, NO_FIELDS, component);
            if (text(f.occurs.min)) budget.chargeWork(f.occurs.min.length);
            if (text(f.occurs.max)) budget.chargeWork(2 * f.occurs.max.length);
            assert(record(f.occurs) && text(f.occurs.min) && text(f.occurs.max)
                && /^(0|[1-9][0-9]*)$/.test(f.occurs.min)
                && (f.occurs.max === 'unbounded' || /^(0|[1-9][0-9]*)$/.test(f.occurs.max)), 'invalid-occurs', component);
            if (f.occurs.max !== 'unbounded') assert(f.occurs.min.length < f.occurs.max.length
                || f.occurs.min.length === f.occurs.max.length && budget.compareText(f.occurs.min, f.occurs.max) <= 0, 'invalid-occurs-order', component);
            assert(contains(budget, PARTICLE_TERMS, f.term) && Array.isArray(f.children), 'invalid-particle', component);
            const compositor = contains(budget, COMPOSITOR_TERMS, f.term);
            assert((f.term === 'element' || f.term === 'group') === !!f.reference
                && (f.term === 'any') === !!f.wildcard && (compositor || f.children.length === 0), 'invalid-particle-fields', component);
            wildcard(f.wildcard); break;
        }
        case 'group': fields(budget, f, FIELDS_GROUP, NO_FIELDS, component); assert(text(f.root), 'invalid-group', component); break;
        case 'attributeGroup': fields(budget, f, FIELDS_ATTRIBUTE_GROUP, OPTIONAL_WILDCARD, component); assert(Array.isArray(f.uses), 'invalid-attribute-group', component); wildcard(f.wildcard); break;
        default: invalid('invalid-kind', 'component-view', component.id);
    }
    if ((f.kind === 'element' || f.kind === 'attribute') && identity.kind === 'global')
        assert(sameName(identity.name, f.name, budget), 'identity-qname', component);
    for (const use of component.sourceUses) {
        budget.chargeWork();
        assert(record(use), 'invalid-source-use', component);
        requiredField(use, 'kind', budget);
        if (use.kind === 'admitted') {
            fields(budget, use, FIELDS_ADMITTED_USE, OPTIONAL_OWN_VALUE, component);
            assert(text(use.use) && contains(budget, SOURCE_ADMISSION_ROLES, use.role as string), 'invalid-source-use', component); value(use.ownValue);
        } else if (use.kind === 'local-prohibition' || use.kind === 'reference-prohibition') {
            fields(budget, use, use.kind === 'local-prohibition' ? LOCAL_PROHIBITION_FIELDS : REFERENCE_PROHIBITION_FIELDS, NO_FIELDS, component);
            assert(contains(budget, PROHIBITION_ROLES, use.role as string)
                && Array.isArray(use.representationChecks) && everyText(budget, use.representationChecks), 'invalid-prohibition', component);
            if (use.kind === 'local-prohibition') assert(name(budget, use.name) && !('declaration' in use) && !('type' in use)
                && !('use' in use) && !('ownValue' in use), 'local-prohibition-operands', component);
            else assert(!('type' in use) && !('use' in use) && !('ownValue' in use), 'reference-prohibition-operands', component);
        } else invalid('invalid-source-use', 'component-view', component.id);
        budget.chargeWork(3);
        assert(text(use.owner) && text(use.origin), 'invalid-source-use', component);
        validateSource(budget, use.source as Source, component);
    }
    for (const use of component.sourceGroups) {
        budget.chargeWork(); assert(record(use), 'invalid-source-group', component);
        fields(budget, use, FIELDS_SOURCE_GROUP, NO_FIELDS, component);
        budget.chargeWork(3); assert(text(use.owner) && text(use.origin), 'invalid-source-group', component);
        validateSource(budget, use.source as Source, component);
    }
    for (const obligation of component.unassessed) {
        budget.chargeWork(); assert(record(obligation), 'invalid-unassessed', component);
        fields(budget, obligation, FIELDS_UNASSESSED, NO_FIELDS, component);
        budget.chargeWork(3); assert(text(obligation.rule) && text(obligation.owner), 'invalid-unassessed', component);
        validateSource(budget, obligation.source as Source, component);
    }
}

function indexed(components: readonly Component[], budget: ResolverBudget, actual: boolean): [Index, EdgeIndex] {
    budget.chargeWork(2);
    const index: Index = new Map(), edges: EdgeIndex = new Map();
    for (let i = 0; i < components.length; i++) {
        const digits = i < 10 ? 1 : i < 100 ? 2 : i < 1_000 ? 3 : i < 10_000 ? 4
            : i < 100_000 ? 5 : i < 1_000_000 ? 6 : i < 10_000_000 ? 7
                : i < 100_000_000 ? 8 : i < 1_000_000_000 ? 9 : 10;
        budget.chargeWork(1 + digits); const key = String(i);
        budget.chargeWork(44 + key.length);
        const entry = Object.getOwnPropertyDescriptor(components, key);
        assert(entry && 'value' in entry, 'sparse-or-accessor-array');
        budget.chargeWork();
        const component = entry.value as Component;
        budget.chargeWork(46);
        assert(record(component), 'invalid-component');
        const descriptor = Object.getOwnPropertyDescriptor(component, 'id');
        assert(descriptor && 'value' in descriptor && descriptor.enumerable && text(descriptor.value) && descriptor.value.length > 0, 'invalid-id');
    }
    const sorted = budget.sorted(components, (a, b) => { budget.chargeWork(2); return budget.compareText(a.id, b.id); });
    for (const component of sorted) {
        inspect(component, budget, actual);
        validateView(component, actual, budget);
        budget.chargeWork(2 + component.id.length);
        assert(!index.has(component.id), 'duplicate-id', component);
        budget.chargeWork(2 + component.id.length);
        index.set(component.id, component);
        budget.chargeWork(2 + component.id.length);
        edges.set(component.id, componentEdges(component, budget));
    }
    budget.chargeWork(3);
    return [index, edges];
}
function validateIdentities(index: Index, budget: ResolverBudget): void {
    type Trie = {children: Map<string, Trie>; id?: Id};
    budget.chargeWork(11); const root: Trie = {children: new Map()};
    budget.chargeWork();
    for (const component of index.values()) {
        budget.chargeWork();
        const identity = component.identity;
        budget.chargeWork(9);
        const parts = identity.kind === 'global'
            ? ['global', identity.role, identity.name.namespace, identity.name.local]
            : [identity.kind, identity.role, identity.owner ?? '', identity.path];
        let node = root;
        for (const part of parts) {
            budget.chargeWork(2 + part.length); let next = node.children.get(part);
            if (!next) { budget.chargeWork(13 + part.length); next = {children: new Map()}; node.children.set(part, next); }
            node = next;
        }
        budget.chargeWork(); assert(node.id === undefined, 'duplicate-identity', component);
        budget.chargeWork(); node.id = component.id;
    }
}
function validateProvenance(index: Index, actual: Index, budget: ResolverBudget): void {
    budget.chargeWork();
    for (const component of index.values()) {
        budget.chargeWork(3);
        for (const id of component.provenance.originals) {
            budget.chargeWork(2 + (typeof id === 'string' ? id.length : 0));
            assert(text(id) && actual.has(id), 'unknown-original-operand', component);
        }
    }
}
function validateOriginalSources(endpoint: Component, originalEdges: EdgeIndex, proposed: Index, budget: ResolverBudget): void {
    const prefix = (slot: string, wanted: string): boolean => {
        for (let i = 0; i < wanted.length; i++) {
            budget.chargeWork(2);
            if (slot.charCodeAt(i) !== wanted.charCodeAt(i)) return false;
        }
        return true;
    };
    budget.chargeWork(1 + endpoint.id.length);
    for (const edge of originalEdges.get(endpoint.id)!) {
        budget.chargeWork();
        if (!prefix(edge.slot, 'sourceUses/') && !prefix(edge.slot, 'sourceGroups/')) continue;
        budget.chargeWork(2);
        const reference = edge.reference;
        if (reference?.kind === 'builtin') continue;
        budget.chargeWork(); const target = reference ? reference.target : edge.target!;
        budget.chargeWork(1 + target.length);
        if (!proposed.has(target)) invalid('outside-context', 'original-source-closure', endpoint.id, edge.slot,
            reference?.kind === 'symbol' ? reference.source : endpoint.source);
    }
}
function validateOwnership(index: Index, budget: ResolverBudget): void {
    // Valid declaration scopes and acyclic owns make incoming coverage equivalent to
    // reachability from the declared containing declaration, without repeated walks.
    budget.chargeWork(); const owned = new Set<Id>();
    budget.chargeWork();
    for (const component of index.values()) {
        budget.chargeWork(2);
        for (const child of component.owns) {
            budget.chargeWork(2 + child.length); owned.add(child);
        }
    }
    budget.chargeWork();
    for (const component of index.values()) {
        budget.chargeWork(); const identity = component.identity;
        if (identity.kind === 'local' || identity.kind === 'fresh' && identity.owner !== undefined) {
            budget.chargeWork(1 + component.id.length);
            assert(owned.has(component.id), 'owner-missing-containment', component);
        }
    }
}
function validateActions(candidate: Candidate, index: Index, budget: ResolverBudget): void {
    budget.chargeWork(); const names: Name[] = [];
    budget.chargeWork(5);
    for (const id of [candidate.intermediate, candidate.endpoint]) {
        budget.chargeWork(1 + id.length); const type = index.get(id)!;
        budget.chargeWork(2);
        if (type.facts.kind !== 'type') continue;
        budget.chargeWork(2);
        for (const use of type.facts.attributeUses) {
            budget.chargeWork(1 + use.length); const au = index.get(use)!;
            budget.chargeWork(5);
            assert(au.facts.kind === 'attributeUse', 'action-au-kind', type);
            assert(au.facts.declaration.kind !== 'builtin', 'action-declaration-kind', au);
            budget.chargeWork(4 + au.facts.declaration.target.length); const declaration = index.get(au.facts.declaration.target)!;
            budget.chargeWork(2);
            assert(declaration.facts.kind === 'attribute', 'action-declaration-kind', au);
            budget.chargeWork(3); names.push(declaration.facts.name);
        }
    }
    const compareName = (a: Name, b: Name): number => { budget.chargeWork(4); return budget.compareText(a.namespace, b.namespace) || budget.compareText(a.local, b.local); };
    const sortedNames = budget.sorted(names, compareName);
    budget.chargeWork(); const unique: Name[] = [];
    for (const current of sortedNames) {
        budget.chargeWork();
        if (!unique.length || !sameName(unique[unique.length - 1], current, budget)) { budget.chargeWork(); unique.push(current); }
    }
    for (const action of candidate.attributes) {
        budget.chargeWork(); assert(record(action), 'invalid-attribute-action');
        requiredField(action, 'role', budget);
        fields(budget, action, action.role === 'replace' ? FIELDS_REPLACE_ACTION : FIELDS_OTHER_ACTION);
        budget.chargeWork(2);
        assert(name(budget, action.name) && contains(budget, ATTRIBUTE_ACTION_ROLES, action.role), 'invalid-attribute-action');
        if (action.role === 'replace') {
            assert(Array.isArray(action.uses), 'invalid-attribute-action-uses');
            budget.chargeWork(); const seen = new Set<Id>();
            for (const use of action.uses) {
                budget.chargeWork(1 + (text(use) ? use.length : 0)); assert(text(use) && !seen.has(use), 'duplicate-action-use');
                budget.chargeWork(1 + use.length);
                const target = index.get(use);
                budget.chargeWork(2);
                assert(target?.facts.kind === 'attributeUse', 'outside-context'); seen.add(use);
            }
        }
    }
    const actions = budget.sorted(candidate.attributes, (a, b) => { budget.chargeWork(2); return compareName(a.name, b.name); });
    assert(actions.length === unique.length, 'missing-or-extra-attribute-action');
    for (let i = 0; i < actions.length; i++) {
        budget.chargeWork();
        assert(i === 0 || !sameName(actions[i - 1].name, actions[i].name, budget), 'duplicate-attribute-action');
        assert(sameName(actions[i].name, unique[i], budget), 'missing-or-extra-attribute-action');
    }
}
function validateEdges(index: Index, edgeIndex: EdgeIndex, budget: ResolverBudget, outside: Index | undefined): void {
    budget.chargeWork();
    for (const component of index.values()) {
        budget.chargeWork(); const id = component.id;
        budget.chargeWork(1 + id.length);
        for (const edge of edgeIndex.get(id)!) {
            budget.chargeWork(3 + edge.slot.length);
            const ref = edge.reference;
            if (ref?.kind === 'builtin') {
                assert(edge.expected === 'type' && admittedBuiltin(ref, budget), 'unknown-builtin', component, edge.slot);
                continue;
            }
            const targetId = ref ? ref.target : edge.target!;
            budget.chargeWork(1 + targetId.length);
            const target = index.get(targetId);
            if (!target) {
                budget.chargeWork(1 + targetId.length);
                invalid(outside?.has(targetId) ? 'outside-context' : 'missing-target', 'reference-closure', id, edge.slot,
                    ref?.kind === 'symbol' ? ref.source : component.source);
            }
            budget.chargeWork(12);
            assert(!edge.expected || target.facts.kind === edge.expected, 'wrong-target-kind', component, edge.slot);
            if (ref?.kind === 'symbol') assert(target.identity.kind === 'global'
                && target.identity.role === ref.role && edge.expected === ref.role
                && sameName(target.identity.name, ref.name, budget), 'wrong-symbol-role-or-qname', component, edge.slot);
            const owner = (component.facts.kind === 'particle' || component.facts.kind === 'attributeUse')
                && (component.identity.kind === 'local' || component.identity.kind === 'fresh')
                ? component.identity.owner : id;
            if (ref?.kind === 'local') assert(target.identity.kind === 'local' || target.identity.kind === 'fresh',
                'local-reference-global-target', component, edge.slot);
            if (edge.global) assert(target.identity.kind === 'global', 'head-not-global', component, edge.slot);
            if (edge.containment) assert((target.identity.kind === 'local' || target.identity.kind === 'fresh')
                && typeof target.identity.owner === 'string' && typeof owner === 'string'
                && budget.compareText(target.identity.owner, owner) === 0, 'wrong-owner', component, edge.slot);
            if (budget.compareText(edge.slot, 'identity/owner') === 0) {
                assert(!contains(budget, NONOWNING_KINDS, target.facts.kind), 'invalid-containing-declaration', component, edge.slot);
            }
            if (budget.compareText(edge.slot, 'root') === 0) assert(target.facts.kind === 'particle'
                && contains(budget, COMPOSITOR_TERMS, target.facts.term), 'group-root-not-compositor', component, edge.slot);
        }
        for (const use of component.sourceUses) {
            budget.chargeWork(2 + use.owner.length); const originalOwner = index.get(use.owner)!;
            budget.chargeWork(3);
            assert(originalOwner.facts.kind === 'type' || originalOwner.facts.kind === 'attributeGroup', 'invalid-source-owner', component);
            if (use.kind === 'admitted') {
                budget.chargeWork(2 + use.use.length); const au = index.get(use.use)!;
                budget.chargeWork(9);
                assert((au.identity.kind === 'local' || au.identity.kind === 'fresh') && typeof au.identity.owner === 'string'
                    && budget.compareText(au.identity.owner, use.owner) === 0,
                    'source-use-owner', component);
                assert(use.role === 'group' ? originalOwner.facts.kind === 'attributeGroup' : originalOwner.facts.kind === 'type', 'source-use-role', component);
            }
        }
        for (const use of component.sourceGroups) {
            budget.chargeWork(2 + use.owner.length); const originalOwner = index.get(use.owner)!;
            budget.chargeWork(4);
            assert(originalOwner.facts.kind === 'type' || originalOwner.facts.kind === 'attributeGroup', 'invalid-source-group-owner', component);
        }
    }
}
const CYCLE_CLASSES: readonly CycleClass[] = FORBIDDEN_CYCLE_CLASSES;
function checkCycles(index: Index, edgeIndex: EdgeIndex, budget: ResolverBudget, proposed: boolean, originals: Index = index): void {
    for (const cycleClass of CYCLE_CLASSES) {
        budget.chargeWork(3); const state = new Map<Id, 'active' | 'done'>();
        for (const root of index.keys()) {
            budget.chargeWork(2 + root.length); if (state.has(root)) continue;
            budget.chargeWork(15 + root.length); const stack: {id: Id; position: number}[] = [{id: root, position: 0}];
            budget.chargeWork(7 + root.length); state.set(root, 'active');
            while (stack.length) {
                budget.chargeWork();
                const frame = stack[stack.length - 1]!;
                budget.chargeWork(5 + frame.id.length); const edges = edgeIndex.get(frame.id)!;
                if (frame.position === edges.length) { budget.chargeWork(6 + frame.id.length); state.set(frame.id, 'done'); stack.pop(); continue; }
                budget.chargeWork(3); const edge = edges[frame.position++];
                budget.chargeWork(3);
                if (!contains(budget, edge.cycles, cycleClass) || edge.reference?.kind === 'builtin') continue;
                budget.chargeWork(3); const target = edge.reference ? edge.reference.target : edge.target!;
                budget.chargeWork(1 + target.length); const targetState = state.get(target);
                if (targetState === 'active') {
                    budget.chargeWork(); const related: Source[] = [];
                    let inCycle = false;
                    for (const entry of stack) {
                        budget.chargeWork(2); if (budget.compareText(entry.id, target) === 0) inCycle = true;
                        if (inCycle) {
                            budget.chargeWork(5 + entry.id.length); const participant = index.get(entry.id)!;
                            related.push(participant.source);
                            for (const id of participant.provenance.originals) {
                                budget.chargeWork(3 + id.length); const original = originals.get(id)!;
                                budget.chargeWork(); related.push(original.source);
                            }
                        }
                    }
                    budget.chargeWork(2 + frame.id.length);
                    throw new Invalid('forbidden-cycle', cycleClass, frame.id, edge.slot,
                        index.get(frame.id)!.source, proposed ? 'candidate-rejected' : 'input-error', related);
                }
                if (targetState === 'done') continue;
                budget.chargeWork(21 + 2 * target.length); state.set(target, 'active'); stack.push({id: target, position: 0});
            }
        }
    }
}
function sameRef(a: Ref, b: Ref, budget: ResolverBudget): boolean {
    budget.chargeWork(2);
    if (a.kind === 'builtin' || b.kind === 'builtin') return a.kind === 'builtin' && b.kind === 'builtin' && sameName(a.name, b.name, budget);
    return budget.compareText(a.target, b.target) === 0;
}
function selectAncestor(endpoint: Component, actual: Index, budget: ResolverBudget): Ref {
    let current = endpoint;
    while (true) {
        budget.chargeWork(5);
        assert(current.facts.kind === 'type', 'ancestor-nontype', current);
        const base = current.facts.base;
        if (base.kind === 'builtin') {
            budget.chargeWork(2);
            if (budget.compareText(base.name.local, 'anyType') === 0) {
                budget.chargeWork(2);
                if (current.identity.kind === 'global') {
                    chargeRecord(budget, FIELDS_SYMBOL_REF, 'symbol'.length + 'type'.length + current.id.length);
                    budget.chargeWork(4);
                    return {kind: 'symbol', role: 'type', name: current.identity.name, target: current.id, source: current.source};
                }
                chargeRecord(budget, FIELDS_LOCAL_REF, 'local'.length + current.id.length);
                budget.chargeWork(); return {kind: 'local', target: current.id};
            }
            chargeRecord(budget, FIELDS_BUILTIN_REF, 'builtin'.length);
            chargeRecord(budget, FIELDS_NAME, XSD_NAMESPACE.length + 'anySimpleType'.length);
            return {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: 'anySimpleType'}};
        }
        budget.chargeWork(2 + base.target.length); current = actual.get(base.target)!;
    }
}
function boundary(actual: Index, edges: EdgeIndex, proposed: Index, budget: ResolverBudget) {
    budget.chargeWork(); const result: {owner: Id; slot: string; target: Id}[] = [];
    const add = (owner: Id, slot: string, target: Id): void => {
        budget.chargeWork(23 + owner.length + slot.length + target.length);
        result.push({owner, slot, target});
    };
    // Persistent retained-head lists: one chain visit per element, then one per emitted edge.
    type Heads = {head: Id; next?: Heads};
    budget.chargeWork(2); const summaries = new Map<Id, Heads | undefined>();
    for (const component of actual.values()) {
        budget.chargeWork(4);
        const id = component.id;
        if (component.facts.kind !== 'element') continue;
        budget.chargeWork(1 + id.length); if (summaries.has(id)) continue;
        budget.chargeWork(); const path: Component[] = [];
        let current: Component | undefined = component, summary: Heads | undefined;
        while (current) {
            budget.chargeWork(2 + current.id.length);
            if (summaries.has(current.id)) { budget.chargeWork(1 + current.id.length); summary = summaries.get(current.id); break; }
            budget.chargeWork(4); path.push(current);
            const head: Ref | undefined = current.facts.kind === 'element' ? current.facts.head : undefined;
            if (head && head.kind !== 'builtin') {
                budget.chargeWork(3 + head.target.length); current = actual.get(head.target);
            } else current = undefined;
        }
        while (path.length) {
            budget.chargeWork(3); const member = path.pop()!;
            budget.chargeWork(1 + member.id.length);
            if (proposed.has(member.id)) { budget.chargeWork(13 + member.id.length); summary = {head: member.id, next: summary}; }
            budget.chargeWork(1 + member.id.length); summaries.set(member.id, summary);
        }
    }
    budget.chargeWork();
    for (const component of actual.values()) {
        budget.chargeWork(3 + component.id.length); const id = component.id;
        if (proposed.has(id)) continue;
        budget.chargeWork(1 + id.length);
        for (const edge of edges.get(id)!) {
            budget.chargeWork(4 + edge.slot.length);
            if (edge.reference?.kind === 'builtin' || budget.compareText(edge.slot, 'head') === 0) continue;
            budget.chargeWork(3); const target = edge.reference ? edge.reference.target : edge.target!;
            budget.chargeWork(1 + target.length); if (proposed.has(target)) add(id, edge.slot, target);
        }
        budget.chargeWork(3);
        if (component.facts.kind === 'element' && component.facts.head) {
            budget.chargeWork(1 + id.length); let summary = summaries.get(id);
            while (summary) {
                budget.chargeWork(2); add(id, 'head', summary.head); summary = summary.next;
            }
        }
    }
    return budget.freeze(budget.sorted(result, (a, b) => budget.compareText(a.owner, b.owner)
        || budget.compareText(a.slot, b.slot) || budget.compareText(a.target, b.target)));
}

function diagnosis(error: Invalid, state: Pick<State, 'budget' | 'candidate' | 'actual'>, context: string): Diagnostic {
    const budget = state.budget;
    budget.chargeWork(); const related: Source[] = [];
    budget.chargeWork(1 + (error.component?.length ?? 0));
    const owner = error.component ? state.actual.get(error.component) : undefined;
    if (owner) { budget.chargeWork(2); related.push(owner.source); }
    for (const source of error.related) { budget.chargeWork(2); related.push(source); }
    let component: object | undefined;
    const endpoint = data(state.candidate, 'endpoint', budget), definition = data(state.candidate, 'endpointDefinition', budget);
    const additions = data(state.candidate, 'additions', budget);
    if (error.component === endpoint && record(definition)) component = definition;
    else if (Array.isArray(additions)) {
        budget.chargeWork(); const length = additions.length;
        for (let index = 0; index < length; index++) {
            budget.chargeWork(11); const key = String(index);
            const addition = arrayData(additions, key, budget);
            const id = data(addition, 'id', budget);
            if (text(id) && error.component !== undefined && budget.compareText(id, error.component) === 0) {
                if (record(addition)) component = addition;
                break;
            }
        }
    }
    const provenance = data(component, 'provenance', budget), originals = data(provenance, 'originals', budget);
    if (Array.isArray(originals)) {
        budget.chargeWork(); const length = originals.length;
        for (let index = 0; index < length; index++) {
            budget.chargeWork(11); const key = String(index);
            const id = arrayData(originals, key, budget);
            if (!text(id)) continue;
            budget.chargeWork(1 + id.length); const original = state.actual.get(id);
            if (original) { budget.chargeWork(2); related.push(original.source); }
        }
    }
    const key = data(state.candidate, 'key', budget);
    const candidate = text(key) ? key : undefined;
    chargeRecord(budget, DIAGNOSTIC_FIELDS, error.code.length + error.rule.length + context.length +
        (candidate?.length ?? 0) + (error.component?.length ?? 0) + (error.slot?.length ?? 0));
    const diagnostic = {code: error.code, rule: error.rule, context, candidate,
        component: error.component, slot: error.slot, source: error.source, related};
    return budget.freeze(budget.snapshot(diagnostic));
}

export function prepareContexts(input: ActualInput, candidate: Candidate, limits?: Limits): Result<Prepared> {
    let budget: ResolverBudget;
    try { budget = createResolverBudget(limits); }
    catch (error) {
        if (!(error instanceof ResolverInvalidLimitsError)) throw error;
        return {kind: 'input-error', diagnostic: {code: 'invalid-limits', rule: 'resource-limits', context: '', related: []}, usage: {nodes: 0, work: 0}};
    }
    return budget.guard(() => {
        budget.chargeWork();
        let actual: Index = new Map();
        let snapshot = candidate;
        try {
            requiredData(input, FIELDS_ACTUAL_INPUT, budget);
            requiredData(candidate, FIELDS_CANDIDATE, budget);
            budget.chargeWork(12);
            assert(record(input) && text(input.key) && input.key.length > 0 && Array.isArray(input.components), 'invalid-input');
            assert(record(candidate) && text(candidate.key) && candidate.key.length > 0 && Array.isArray(candidate.additions)
                && Array.isArray(candidate.retained) && Array.isArray(candidate.attributes), 'invalid-plan');
            budget.reserveNodes(input.components.length);
            budget.reserveNodes(candidate.additions.length);
            budget.chargeWork(input.key.length);
            const actualPair = indexed(input.components, budget, true);
            actual = actualPair[0]; const actualEdges = actualPair[1];
            validateIdentities(actual, budget);
            validateProvenance(actual, actual, budget);
            validateEdges(actual, actualEdges, budget, undefined);
            checkCycles(actual, actualEdges, budget, false);
            validateOwnership(actual, budget);
            inspect(candidate, budget);
            snapshot = budget.freeze(budget.snapshot(candidate));
            validateView(snapshot.endpointDefinition, false, budget);
            budget.chargeWork(6);
            assert(snapshot.endpointDefinition.id === snapshot.endpoint && snapshot.endpointDefinition.provenance.kind === 'endpoint-replacement', 'invalid-endpoint-override');
            budget.chargeWork(2 + snapshot.endpoint.length); const originalEndpoint = actual.get(snapshot.endpoint);
            budget.chargeWork(10);
            assert(originalEndpoint?.facts.kind === 'type' && originalEndpoint.facts.variety === 'complex'
                && snapshot.endpointDefinition.facts.kind === 'type' && snapshot.endpointDefinition.facts.variety === 'complex', 'endpoint-not-complex');
            budget.chargeWork(12);
            const originalIdentity = originalEndpoint.identity, replacementIdentity = snapshot.endpointDefinition.identity;
            assert(originalIdentity.kind === replacementIdentity.kind && originalIdentity.role === replacementIdentity.role
                && (originalIdentity.kind === 'global' && replacementIdentity.kind === 'global'
                    ? sameName(originalIdentity.name, replacementIdentity.name, budget)
                    : originalIdentity.kind === 'local' && replacementIdentity.kind === 'local'
                        && budget.compareText(originalIdentity.owner, replacementIdentity.owner) === 0
                        && budget.compareText(originalIdentity.path, replacementIdentity.path) === 0), 'endpoint-identity');
            const [additions, additionEdges] = indexed(snapshot.additions, budget, false);
            budget.chargeWork();
            for (const addition of additions.values()) {
                budget.chargeWork(7 + addition.id.length); assert(!actual.has(addition.id)
                    && budget.compareText(addition.id, snapshot.endpoint) !== 0, 'nonendpoint-override', addition);
                assert(addition.identity.kind === 'fresh' && addition.provenance.kind === 'constructed', 'addition-identity', addition);
            }
            budget.chargeWork(2); const proposed: Index = new Map(), proposedEdges: EdgeIndex = new Map();
            for (const id of snapshot.retained) { budget.chargeWork(2); assert(text(id) && id.length > 0, 'invalid-member'); }
            const retained = budget.sorted(snapshot.retained, (a, b) => budget.compareText(a, b));
            for (const id of retained) {
                budget.chargeWork(3 + 2 * id.length); assert(text(id) && !proposed.has(id), 'duplicate-member');
                const component = actual.get(id); assert(component, 'unknown-member');
                const endpoint = budget.compareText(id, snapshot.endpoint) === 0;
                budget.chargeWork(4 + 3 * id.length);
                proposed.set(id, endpoint ? snapshot.endpointDefinition : component);
                proposedEdges.set(id, endpoint ? componentEdges(snapshot.endpointDefinition, budget) : actualEdges.get(id)!);
            }
            budget.chargeWork();
            for (const component of additions.values()) { budget.chargeWork(5 + 3 * component.id.length); const id = component.id; proposed.set(id, component); proposedEdges.set(id, additionEdges.get(id)!); }
            budget.chargeWork(2 + snapshot.endpoint.length); assert(proposed.has(snapshot.endpoint), 'missing-endpoint');
            const selected = selectAncestor(originalEndpoint, actual, budget);
            validateRef(budget, snapshot.ancestor, originalEndpoint, 'ancestor');
            if (snapshot.ancestor.kind === 'builtin') assert(admittedBuiltin(snapshot.ancestor, budget), 'unknown-builtin');
            else {
                budget.chargeWork(); const ancestorTarget = actual.get(snapshot.ancestor.target);
                assert(ancestorTarget?.facts.kind === 'type', 'wrong-ancestor-target');
                if (snapshot.ancestor.kind === 'symbol') assert(snapshot.ancestor.role === 'type'
                    && ancestorTarget.identity.kind === 'global'
                    && sameName(snapshot.ancestor.name, ancestorTarget.identity.name, budget), 'wrong-ancestor-symbol');
                else assert(ancestorTarget.identity.kind === 'local', 'wrong-ancestor-local');
            }
            assert(sameRef(selected, snapshot.ancestor, budget), 'wrong-ancestor', originalEndpoint, 'ancestor');
            if (selected.kind !== 'builtin') { budget.chargeWork(); assert(proposed.has(selected.target), 'outside-context', originalEndpoint, 'ancestor'); }
            let chain = originalEndpoint;
            while (chain.facts.kind === 'type' && chain.facts.base.kind !== 'builtin') {
                budget.chargeWork(2); const id = chain.facts.base.target; assert(proposed.has(id), 'outside-context', chain, 'base'); chain = actual.get(id)!;
            }
            budget.chargeWork(); const intermediate = proposed.get(snapshot.intermediate);
            assert(intermediate?.facts.kind === 'type' && intermediate.facts.method === 'extension'
                && sameRef(intermediate.facts.base, selected, budget), 'invalid-intermediate');
            const endpointFacts = snapshot.endpointDefinition.facts;
            assert(endpointFacts.kind === 'type' && endpointFacts.method === 'restriction'
                && endpointFacts.base.kind !== 'builtin' && endpointFacts.base.target === snapshot.intermediate, 'invalid-endpoint-edge');
            budget.chargeWork(2 + 2 * proposed.size);
            const orderedProposed = budget.sorted(Array.from(proposed.values()), (a, b) => budget.compareText(a.id, b.id));
            budget.chargeWork(); const orderedIndex: Index = new Map();
            for (const component of orderedProposed) { budget.chargeWork(3 + component.id.length); orderedIndex.set(component.id, component); }
            validateIdentities(orderedIndex, budget);
            validateProvenance(orderedIndex, actual, budget);
            validateEdges(orderedIndex, proposedEdges, budget, actual);
            validateOriginalSources(originalEndpoint, actualEdges, orderedIndex, budget);
            validateActions(snapshot, orderedIndex, budget);
            checkCycles(orderedIndex, proposedEdges, budget, true, actual);
            validateOwnership(orderedIndex, budget);
            budget.chargeWork(2 + 2 * actual.size);
            const actualMembers = budget.freeze(Array.from(actual.keys()));
            budget.chargeWork(1 + 3 * orderedProposed.length);
            const proposedMembers = budget.freeze(orderedProposed.map(c => c.id));
            const excludedIncoming = boundary(actual, actualEdges, proposed, budget);
            budget.chargeWork(4 + input.key.length + 8 + snapshot.key.length);
            const actualKey = `${input.key}/actual/${snapshot.key}`;
            budget.chargeWork(4 + input.key.length + 10 + snapshot.key.length);
            const proposedKey = `${input.key}/proposed/${snapshot.key}`;
            chargeRecord(budget, CONTEXT_FIELDS, actualKey.length + 'actual'.length);
            budget.chargeWork(); const emptyBoundary = Object.freeze([]);
            chargeRecord(budget, CONTEXT_FIELDS);
            const actualContext = Object.freeze({key: actualKey, kind: 'actual' as const, members: actualMembers, excludedIncoming: emptyBoundary}) as unknown as Context;
            chargeRecord(budget, CONTEXT_FIELDS, proposedKey.length + 'proposed'.length);
            chargeRecord(budget, CONTEXT_FIELDS);
            const proposedContext = Object.freeze({key: proposedKey, kind: 'proposed' as const, members: proposedMembers, excludedIncoming}) as unknown as Context;
            chargeRecord(budget, STATE_FIELDS); budget.chargeWork();
            const state: State = {budget, candidate: snapshot, actual, proposed, actualEdges, proposedEdges, identity: {}};
            budget.chargeWork(2);
            handles.set(actualContext, state); handles.set(proposedContext, state);
            chargeRecord(budget, PREPARED_FIELDS); chargeRecord(budget, PREPARED_FIELDS);
            const value = Object.freeze({actual: actualContext, proposed: proposedContext});
            chargeRecord(budget, RESULT_FIELDS, 'ok'.length); chargeRecord(budget, RESULT_FIELDS);
            return Object.freeze({kind: 'ok' as const, value, usage: budget.usage()});
        } catch (error) {
            if (!(error instanceof Invalid)) throw error;
            chargeRecord(budget, DIAGNOSIS_STATE_FIELDS);
            const key = data(input, 'key', budget);
            const diagnostic = diagnosis(error, {budget, candidate: snapshot, actual}, text(key) ? key : '');
            chargeRecord(budget, ERROR_RESULT_FIELDS, error.kind.length); chargeRecord(budget, ERROR_RESULT_FIELDS);
            return Object.freeze({kind: error.kind, diagnostic, usage: budget.usage()});
        }
    });
}

export function withContext<T>(context: Context, operation: (access: ContextAccess) => T): Result<T> {
    const state = handles.get(context);
    if (!state) return {kind: 'input-error', diagnostic: {code: 'invalid-context', rule: 'factory-context', context: '', related: []}, usage: {nodes: 0, work: 0}};
    const result = state.budget.guard(() => {
        try {
            const index = context.kind === 'actual' ? state.actual : state.proposed;
            const edges = context.kind === 'actual' ? state.actualEdges : state.proposedEdges;
            state.budget.chargeWork(6);
            chargeRecord(state.budget, ACCESS_FIELDS);
            const access: ContextAccess = {
                budget: state.budget, candidate: state.candidate, requestIdentity: state.identity,
                component(id) { state.budget.chargeWork(1 + id.length); return index.get(id); },
                edges(id) { state.budget.chargeWork(1 + id.length); return edges.get(id); },
                has(id) { state.budget.chargeWork(1 + id.length); return index.has(id); },
                cache<T>(module: object, create: () => T): T {
                    const field = context.kind === 'actual' ? 'actualCache' : 'proposedCache';
                    state.budget.chargeWork(2);
                    let cache = state[field];
                    if (!cache) { state.budget.chargeWork(2); cache = new Map(); state[field] = cache; }
                    state.budget.chargeWork();
                    if (cache.has(module)) { state.budget.chargeWork(); return cache.get(module) as T; }
                    const value = create();
                    state.budget.chargeWork(); cache.set(module, value); return value;
                },
                reference(owner, slot) {
                    state.budget.chargeWork(1 + owner.length + slot.length);
                    const selected = edges.get(owner);
                    if (!selected) return undefined;
                    for (const edge of selected) {
                        state.budget.chargeWork(3);
                        if (state.budget.compareText(edge.slot, slot) === 0 && edge.reference) return edge;
                    }
                    return undefined;
                },
                fail(code, rule, component, slot, source, kind) { invalid(code, rule, component, slot, source, kind); },
            };
            const value = operation(access);
            chargeRecord(state.budget, RESULT_FIELDS, 'ok'.length); chargeRecord(state.budget, RESULT_FIELDS);
            return Object.freeze({kind: 'ok' as const, value, usage: state.budget.usage()});
        } catch (error) {
            if (!(error instanceof Invalid)) throw error;
            const diagnostic = diagnosis(error, state, context.key);
            state.budget.chargeWork(2); state.actualCache = undefined; state.proposedCache = undefined;
            chargeRecord(state.budget, ERROR_RESULT_FIELDS, error.kind.length); chargeRecord(state.budget, ERROR_RESULT_FIELDS);
            return Object.freeze({kind: error.kind, diagnostic, usage: state.budget.usage()});
        }
    });
    if (result.kind === 'resource-limit') { state.actualCache = undefined; state.proposedCache = undefined; }
    return result;
}

/** Both issued handles must belong to the same request, with their declared roles. */
export function samePreparedRequest(prepared: Prepared, budget?: ResolverBudget): boolean {
    const actual = data(prepared, 'actual', budget), proposed = data(prepared, 'proposed', budget);
    if (!record(actual) || !record(proposed)) return false;
    budget?.chargeWork(6);
    const actualState = handles.get(actual as Context), proposedState = handles.get(proposed as Context);
    return !!actualState && actualState === proposedState && actual.kind === 'actual' && proposed.kind === 'proposed';
}
