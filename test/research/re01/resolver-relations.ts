/**
 * Private RE01 relation adapters, against the supplied component facts only.
 * No scalar/facet evaluator or complete type/component legality is supplied.
 *
 * Normative edition: REC-xmlschema-1-20041028, cos-ct-derived-ok,
 * cos-st-derived-ok, e-props-correct.4, cos-equiv-derived-ok-rec and
 * cos-equiv-class. The separate simple rule always tests restriction in
 * clause 2.1; list/union formation final checks are separate component rules.
 * Complex TypeDerivationOK does not itself test the immediate base's final.
 * cos-equiv-class uses HEAD's disallowed substitutions (the accepted editorial
 * text in the dated primary), rather than an empty blocking constraint.
 */
import {builtinTarget, withContext, XSD_NAMESPACE} from './resolver-context.js';
import type {ContextAccess} from './resolver-context.js';
import type {ResolverBudget} from './resolver-budget.js';
import type {Component, Context, Facts, Id, Method, Ref, Result, Target} from './resolver-types.js';

const EDITION = 'https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/';
export const RELATION_AUTHORITY = Object.freeze({
    id: 'RE01-dated-relation-rules-v1',
    edition: EDITION,
    scope: 'relations-on-supplied-component-facts',
    builtinTable: 'RE01-seven-builtins-v1',
    qualification: 'No scalar values, facets, source normalization or complete schema legality.',
});

/**
 * Fixed research premises, not a general builtin implementation. The ordinary
 * primitive/simple bases are from REC-xmlschema-2-20041028 sections 3.2.1,
 * 3.2.3, 3.3.13, 3.3.16 and 3.3.17. In particular int -> long -> integer,
 * rather than a shortcut int -> integer. All listed final/block sets are empty.
 * Any admitted builtin omitted here has no relationship premises in this leaf;
 * exact identity is still qualified without inspecting its unknown ancestry.
 */
export const RESEARCH_BUILTIN_RELATIONS: readonly Readonly<{
    local: string; variety: 'complex' | 'atomic' | 'simple-ur'; base?: string;
    method: Method; final: readonly Method[]; block: readonly Method[];
}>[] = Object.freeze([
    Object.freeze({local: 'anyType', variety: 'complex', method: 'restriction', final: Object.freeze([]), block: Object.freeze([])}),
    Object.freeze({local: 'anySimpleType', variety: 'simple-ur', base: 'anyType', method: 'restriction', final: Object.freeze([]), block: Object.freeze([])}),
    Object.freeze({local: 'string', variety: 'atomic', base: 'anySimpleType', method: 'restriction', final: Object.freeze([]), block: Object.freeze([])}),
    Object.freeze({local: 'decimal', variety: 'atomic', base: 'anySimpleType', method: 'restriction', final: Object.freeze([]), block: Object.freeze([])}),
    Object.freeze({local: 'integer', variety: 'atomic', base: 'decimal', method: 'restriction', final: Object.freeze([]), block: Object.freeze([])}),
    Object.freeze({local: 'long', variety: 'atomic', base: 'integer', method: 'restriction', final: Object.freeze([]), block: Object.freeze([])}),
    Object.freeze({local: 'int', variety: 'atomic', base: 'long', method: 'restriction', final: Object.freeze([]), block: Object.freeze([])}),
]);

// Fixed handles contain no request data and consume no component node slots.
const builtinRefs = new Map(RESEARCH_BUILTIN_RELATIONS.map(row => [row.local,
    Object.freeze({kind: 'builtin' as const, name: Object.freeze({namespace: XSD_NAMESPACE, local: row.local})})]));
const MODULE = Object.freeze({});
const METHODS: readonly Method[] = Object.freeze(['extension', 'restriction', 'list', 'union']);
const EMPTY_METHODS: readonly Method[] = Object.freeze([]);
const RESTRICTION_METHODS: readonly Method[] = Object.freeze(['restriction']);
const MASK_TEXT: readonly string[] = Object.freeze(['0', '1', '2', '3', '4', '5', '6', '7',
    '8', '9', '10', '11', '12', '13', '14', '15']);
type Outcome = 'pass' | 'fail' | 'unknown';
type Info = Extract<Facts, {kind: 'type'}> | (typeof RESEARCH_BUILTIN_RELATIONS)[number];
type Resolved = Readonly<{target: Target; key: string; reference: Ref}>;
type CacheEntry = {state: 'active'} | {state: 'complete'; outcome: Outcome};
type RelationCache = Map<string, CacheEntry>;
export type RelationReceipt = Readonly<{
    predicate: 'checkTypeDerivation' | 'checkImmediateTypeFinal' | 'checkSubstitution';
    scope: 'type-derivation-relation' | 'immediate-base-final' | 'affiliation-type-property' | 'substitutability';
    context: string; rule: string;
    operands: readonly Id[]; authority: string;
    query: Readonly<{derived: string; base: string; excluded: readonly string[]}>;
    authorityDetails: typeof RELATION_AUTHORITY;
}>;
export type SubstitutionOptions = Readonly<{
    mode: 'affiliation' | 'substitutability';
    /** Explicit complete set; defaults to head.block for substitutability only. */
    blocking?: readonly (Method | 'substitution')[];
}>;
export type SubstitutionMembersReceipt = Readonly<{
    predicate: 'effectiveSubstitutionMembers'; scope: 'retained-substitution-universe';
    context: string; rule: 'cos-equiv-class'; head: Id; members: readonly Id[];
    blocking: readonly string[]; excludedIncoming: Context['excludedIncoming'];
    operands: readonly Id[]; authority: string; authorityDetails: typeof RELATION_AUTHORITY;
}>;

/** Charge a data record before its allocation, including its field names. */
function recordWork(budget: ResolverBudget, fields: string): void {
    // Fixed schema strings are code constants, rather than freshly allocated
    // arrays of field names. Count before constructing the actual data record.
    let count = 1;
    for (let index = 0; index < fields.length; index++) {
        budget.chargeWork();
        if (fields.charCodeAt(index) === 44) count++;
    }
    budget.chargeWork(1 + count + fields.length - (count - 1));
}
/** Length prefixes avoid ambiguous keys even when canonical IDs contain punctuation. */
function key(budget: ResolverBudget, fields: readonly string[]): string {
    let result = '';
    for (const field of fields) {
        budget.chargeWork(2 + field.length); // Entry, length and input text inspection.
        budget.chargeWork(10); // Decimal length text has at most ten UTF-16 units.
        const prefix = String(field.length);
        budget.chargeWork(result.length + prefix.length + 1 + field.length);
        result += `${prefix}:${field}`;
    }
    return result;
}
/** Read only consumed own data fields; never invoke a caller accessor. */
function ownData(access: ContextAccess, value: unknown, field: string,
    code: 'invalid-reference' | 'invalid-substitution-mode' | 'invalid-excluded-methods', optional = false): unknown {
    // Introspection, its descriptor (record/four fields/35 name units),
    // field-name inspection and the returned data-value read.
    access.budget.chargeWork(45 + field.length);
    if (!value || typeof value !== 'object') return access.fail(code, 'relation-caller-data');
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined && optional) return undefined;
    if (!descriptor || !('value' in descriptor)) return access.fail(code, 'relation-caller-data');
    return descriptor.value;
}
function canonical(access: ContextAccess, supplied: readonly string[], substitution = false): readonly string[] {
    const budget = access.budget;
    budget.chargeWork(2);
    if (!Array.isArray(supplied)) return access.fail('invalid-excluded-methods', 'relation-options');
    const result: string[] = [];
    let mask = 0;
    const length = ownData(access, supplied, 'length', 'invalid-excluded-methods') as number;
    for (let position = 0; position < length; position++) {
        budget.chargeWork(11); // Decimal array index text, before String allocation.
        const field = String(position);
        const value = ownData(access, supplied, field, 'invalid-excluded-methods');
        if (typeof value !== 'string') return access.fail('invalid-excluded-methods', 'relation-options');
        let found = -1;
        for (let index = 0; index < METHODS.length; index++) {
            budget.chargeWork();
            if (budget.compareText(value, METHODS[index]!) === 0) { found = index; break; }
        }
        if (found < 0 && substitution && budget.compareText(value, 'substitution') === 0) found = 4;
        if (found < 0)
            access.fail('invalid-excluded-methods', 'relation-options');
        budget.chargeWork();
        mask |= 1 << found;
    }
    for (let index = 0; index < 5; index++) {
        budget.chargeWork();
        if ((mask & (1 << index)) !== 0) {
            budget.chargeWork(); result.push(index === 4 ? 'substitution' : METHODS[index]!);
        }
    }
    return budget.sorted(result, (left, right) => budget.compareText(left, right));
}
function contains(budget: ResolverBudget, values: readonly string[], wanted: string): boolean {
    for (const value of values) {
        budget.chargeWork();
        if (budget.compareText(value, wanted) === 0) return true;
    }
    return false;
}
function resolve(access: ContextAccess, reference: Ref, expected: 'type' | 'element'): Resolved {
    const budget = access.budget;
    budget.chargeWork(40); // Maximum reference/selected fact/identity field reads in this clause.
    if (!reference || typeof reference !== 'object') return access.fail('invalid-reference', 'relation-operand');
    let target: Target;
    let identity: string;
    const kind = ownData(access, reference, 'kind', 'invalid-reference');
    if (kind === 'builtin') {
        const name = ownData(access, reference, 'name', 'invalid-reference');
        const namespace = ownData(access, name, 'namespace', 'invalid-reference');
        const local = ownData(access, name, 'local', 'invalid-reference');
        if (typeof namespace !== 'string' || typeof local !== 'string')
            return access.fail('invalid-reference', 'relation-operand');
        if (expected !== 'type') access.fail('wrong-target-kind', 'relation-operand');
        const admitted = builtinTarget(reference, budget);
        if (!admitted) access.fail('unknown-builtin', 'relation-operand');
        target = admitted;
        budget.chargeWork(4);
        identity = key(budget, ['builtin', namespace, local]);
    } else {
        const targetId = ownData(access, reference, 'target', 'invalid-reference');
        if ((kind !== 'symbol' && kind !== 'local') || typeof targetId !== 'string')
            return access.fail('invalid-reference', 'relation-operand');
        const component = access.component(targetId);
        if (!component) access.fail('outside-context', 'relation-operand', targetId);
        budget.chargeWork();
        if (budget.compareText(component.facts.kind, expected) !== 0)
            access.fail('wrong-target-kind', 'relation-operand', component.id, undefined, component.source);
        if (kind === 'symbol') {
            const name = ownData(access, reference, 'name', 'invalid-reference');
            const namespace = ownData(access, name, 'namespace', 'invalid-reference');
            const local = ownData(access, name, 'local', 'invalid-reference');
            const role = ownData(access, reference, 'role', 'invalid-reference');
            if (typeof namespace !== 'string' || typeof local !== 'string' || typeof role !== 'string')
                return access.fail('invalid-reference', 'relation-operand');
            if (component.identity.kind !== 'global'
                || budget.compareText(role, expected) !== 0
                || budget.compareText(component.identity.role, role) !== 0
                || budget.compareText(component.identity.name.namespace, namespace) !== 0
                || budget.compareText(component.identity.name.local, local) !== 0)
                // Query diagnostics borrow the prepared operand's original
                // source; arbitrary caller source annotations are not consumed.
                access.fail('wrong-symbol-target', 'relation-operand', component.id, undefined, component.source);
        } else if (component.identity.kind === 'global') {
            return access.fail('local-reference-global-target', 'relation-operand', component.id);
        }
        recordWork(budget, "kind,component");
        target = {kind: 'component', component};
        budget.chargeWork(3);
        identity = key(budget, ['component', component.id]);
    }
    recordWork(budget, "target,key,reference");
    return {target, key: identity, reference};
}
function same(budget: ResolverBudget, left: Resolved, right: Resolved): boolean {
    budget.chargeWork(2);
    return budget.compareText(left.key, right.key) === 0;
}
function isBuiltin(budget: ResolverBudget, resolved: Resolved, local: string): boolean {
    budget.chargeWork(5);
    return resolved.target.kind === 'builtin' && budget.compareText(resolved.target.name.local, local) === 0;
}
function info(access: ContextAccess, resolved: Resolved): Info | undefined {
    access.budget.chargeWork(6);
    if (resolved.target.kind === 'component') {
        const facts = resolved.target.component.facts;
        return facts.kind === 'type' ? facts : undefined;
    }
    for (const row of RESEARCH_BUILTIN_RELATIONS) {
        access.budget.chargeWork(5);
        if (access.budget.compareText(row.local, resolved.target.name.local) === 0) return row;
    }
    return undefined;
}
function base(access: ContextAccess, current: Info): Resolved | undefined {
    access.budget.chargeWork(6);
    if (current.base === undefined) return undefined;
    if (typeof current.base !== 'string') return resolve(access, current.base, 'type');
    access.budget.chargeWork(1 + current.base.length);
    return resolve(access, builtinRefs.get(current.base)!, 'type');
}
function relationCache(access: ContextAccess): RelationCache {
    return access.cache(MODULE, () => { access.budget.chargeWork(); return new Map<string, CacheEntry>(); });
}
function cacheKey(access: ContextAccess, operation: string, d: Resolved, b: Resolved,
    excluded: readonly string[]): string {
    access.budget.chargeWork(9 + excluded.length); // Parts plus authority and operand key field reads.
    return key(access.budget, [operation, RELATION_AUTHORITY.id, d.key, b.key, ...excluded]);
}
function finish(cache: RelationCache, budget: ResolverBudget, cacheKeyValue: string, outcome: Outcome): void {
    recordWork(budget, "state,outcome");
    budget.chargeWork('complete'.length + outcome.length);
    budget.chargeWork(1 + cacheKeyValue.length);
    cache.set(cacheKeyValue, {state: 'complete', outcome});
}

/** Dated complex and simple clauses have separate programs and OR alternatives. */
function typeDerivation(access: ContextAccess, derived: Resolved, expected: Resolved,
    excluded: readonly string[]): Outcome {
    const budget = access.budget, cache = relationCache(access);
    type Frame = {d: Resolved; b: Resolved; key: string; stage: number;
        dInfo?: Info; bInfo?: Info; index: number; unknown: boolean};
    budget.chargeWork(); const stack: Frame[] = [];
    let returned: Outcome = 'unknown';
    const readReturned = (): Outcome => { budget.chargeWork(); return returned; };
    const push = (d: Resolved, b: Resolved): void => {
        const k = cacheKey(access, 'type', d, b, excluded);
        budget.chargeWork(1 + k.length);
        const prior = cache.get(k);
        if (prior) { budget.chargeWork(2); returned = prior.state === 'complete' ? prior.outcome : 'unknown'; return; }
        recordWork(budget, "state"); budget.chargeWork(1 + k.length + 'active'.length);
        cache.set(k, {state: 'active'});
        recordWork(budget, "d,b,key,stage,dInfo,bInfo,index,unknown");
        budget.chargeWork(); stack.push({d, b, key: k, stage: 0,
            dInfo: undefined, bInfo: undefined, index: 0, unknown: false});
    };
    const complete = (frame: Frame, outcome: Outcome): void => {
        finish(cache, budget, frame.key, outcome);
        budget.chargeWork(); stack.pop(); returned = outcome;
    };
    push(derived, expected);
    while (stack.length > 0) {
        // Reserve this bounded dispatch's frame/fact field reads before any
        // branch. Helper-owned reference/text reads are charged separately.
        budget.chargeWork(48);
        const frame = stack[stack.length - 1]!;
        if (frame.stage === 0) {
            // Both rules permit identity before exclusions, final or ancestry.
            if (same(budget, frame.d, frame.b)) { complete(frame, 'pass'); continue; }
            budget.chargeWork(); frame.dInfo = info(access, frame.d);
            if (!frame.dInfo) { complete(frame, 'unknown'); continue; }
            if (isBuiltin(budget, frame.d, 'anyType')) { complete(frame, 'fail'); continue; }
            const direct = base(access, frame.dInfo);
            if (!direct) { complete(frame, 'unknown'); continue; }
            if (frame.dInfo.variety === 'complex') {
                // cos-ct-derived-ok.1 and .2.2; no base-final shortcut here.
                if (contains(budget, excluded, frame.dInfo.method)) { complete(frame, 'fail'); continue; }
                if (same(budget, direct, frame.b)) { complete(frame, 'pass'); continue; }
                if (isBuiltin(budget, direct, 'anyType')) { complete(frame, 'fail'); continue; }
                budget.chargeWork(); frame.stage = 1; push(direct, frame.b); continue;
            }
            // cos-st-derived-ok.2.1 excludes restriction, including list/union.
            const directInfo = info(access, direct);
            if (contains(budget, excluded, 'restriction')) { complete(frame, 'fail'); continue; }
            if (!directInfo) { complete(frame, 'unknown'); continue; }
            if (contains(budget, directInfo.final, 'restriction')) { complete(frame, 'fail'); continue; }
            if (same(budget, direct, frame.b)) { complete(frame, 'pass'); continue; }
            // The dated accepted text stops at anyType, not anySimpleType.
            if (!isBuiltin(budget, direct, 'anyType')) {
                if (directInfo.variety === 'complex') {
                    // This recursive simple premise lacks qualification. It
                    // does not suppress independent qualified OR alternatives.
                    budget.chargeWork(); frame.unknown = true;
                } else {
                    budget.chargeWork(); frame.stage = 2; push(direct, frame.b); continue;
                }
            }
            budget.chargeWork(); frame.stage = 3;
        }
        if (frame.stage === 1) { complete(frame, returned); continue; }
        if (frame.stage === 2) {
            if (readReturned() === 'pass') { complete(frame, 'pass'); continue; }
            if (readReturned() === 'unknown') { budget.chargeWork(); frame.unknown = true; }
            budget.chargeWork(); frame.stage = 3;
        }
        if (frame.stage === 3) {
            // cos-st-derived-ok.2.2.3 is independent of base-chain success.
            if ((frame.dInfo!.variety === 'list' || frame.dInfo!.variety === 'union')
                && isBuiltin(budget, frame.b, 'anySimpleType')) { complete(frame, 'pass'); continue; }
            budget.chargeWork(); frame.stage = 4;
        }
        if (frame.stage === 5) {
            if (readReturned() === 'pass') { complete(frame, 'pass'); continue; }
            if (readReturned() === 'unknown') { budget.chargeWork(); frame.unknown = true; }
            budget.chargeWork(); frame.stage = 4;
        }
        if (frame.stage === 4) {
            // cos-st-derived-ok.2.2.4: try B's original ordered union members.
            budget.chargeWork(); frame.bInfo = info(access, frame.b);
            const bInfo = frame.bInfo;
            if (!bInfo) { complete(frame, 'unknown'); continue; }
            budget.chargeWork(2);
            if (bInfo.variety !== 'union' || !('items' in bInfo) || frame.index >= bInfo.items.length) {
                complete(frame, frame.unknown ? 'unknown' : 'fail'); continue;
            }
            budget.chargeWork(3); const member = bInfo.items[frame.index++]!;
            budget.chargeWork(); frame.stage = 5; push(frame.d, resolve(access, member, 'type'));
        }
    }
    return returned;
}

function mask(budget: ResolverBudget, methods: readonly string[]): number {
    let result = 0;
    for (let index = 0; index < METHODS.length; index++) {
        budget.chargeWork();
        if (contains(budget, methods, METHODS[index]!)) { budget.chargeWork(); result |= 1 << index; }
    }
    return result;
}
function methodMask(budget: ResolverBudget, method: string): number {
    for (let index = 0; index < METHODS.length; index++) {
        budget.chargeWork();
        if (budget.compareText(method, METHODS[index]!) === 0) return 1 << index;
    }
    return 0;
}
/** Substitutability collects methods and ALL intermediate/base type blocks. */
function substitutionTypes(access: ContextAccess, derived: Resolved, expected: Resolved,
    blocking: readonly string[]): Outcome {
    const budget = access.budget, cache = relationCache(access);
    type Frame = {d: Resolved; b: Resolved; current: Resolved; key: string;
        methods: number; blocks: number; stage: number; index: number; unknown: boolean;
        simple?: Resolved; prefixMethods: number; prefixBlocks: number};
    budget.chargeWork(); const stack: Frame[] = [];
    const initialBlocks = mask(budget, blocking);
    let returned: Outcome = 'unknown';
    const readReturned = (): Outcome => { budget.chargeWork(); return returned; };
    const push = (d: Resolved, b: Resolved, methods = 0, blocks = initialBlocks): void => {
        const pairKey = cacheKey(access, 'substitution-types', d, b, blocking);
        budget.chargeWork(6); // Key parts container/entries plus two mask-table reads.
        const k = key(budget, [pairKey, MASK_TEXT[methods]!, MASK_TEXT[blocks]!]);
        budget.chargeWork(1 + k.length); const prior = cache.get(k);
        if (prior) { budget.chargeWork(2); returned = prior.state === 'complete' ? prior.outcome : 'unknown'; return; }
        // Clause .2.3 needs a qualified derivation. An arbitrary complex type
        // cannot use the separate simple rule's union-member alternative.
        // Qualify EACH alternative; qualifying only the original union could
        // let a different, unqualified identity branch bypass method blocks.
        const qualification = typeDerivation(access, d, b, EMPTY_METHODS);
        if (qualification !== 'pass') {
            finish(cache, budget, k, qualification); returned = qualification; return;
        }
        recordWork(budget, "state"); budget.chargeWork(1 + k.length + 'active'.length); cache.set(k, {state: 'active'});
        recordWork(budget, "d,b,current,key,methods,blocks,stage,index,unknown,simple,prefixMethods,prefixBlocks");
        budget.chargeWork(); stack.push({d, b, current: d, key: k, methods,
            blocks, stage: 0, index: 0, unknown: false, simple: undefined,
            prefixMethods: methods, prefixBlocks: blocks});
    };
    const complete = (frame: Frame, outcome: Outcome): void => {
        finish(cache, budget, frame.key, outcome); budget.chargeWork(); stack.pop(); returned = outcome;
    };
    push(derived, expected);
    while (stack.length > 0) {
        budget.chargeWork(56); // Bounded frame/fact field reads for one clause dispatch.
        const frame = stack[stack.length - 1]!;
        if (frame.stage === 0) {
            if (same(budget, frame.current, frame.b)) {
                complete(frame, (frame.methods & frame.blocks) === 0 ? 'pass' : 'fail'); continue;
            }
            if (!isBuiltin(budget, frame.current, 'anyType')) {
                const currentInfo = info(access, frame.current);
                if (!currentInfo) { budget.chargeWork(2); frame.unknown = true; frame.stage = 1; continue; }
                if (currentInfo.variety !== 'complex' && !frame.simple) {
                    // Complex .2.3 delegates the remaining derivation to this
                    // simple definition. Keep the complex prefix when its
                    // separate simple rule chooses a base-union member.
                    budget.chargeWork(3);
                    frame.simple = frame.current; frame.prefixMethods = frame.methods; frame.prefixBlocks = frame.blocks;
                }
                budget.chargeWork();
                frame.methods |= currentInfo.variety === 'complex' ? methodMask(budget, currentInfo.method) : mask(budget, RESTRICTION_METHODS);
                const direct = base(access, currentInfo);
                if (!direct) { budget.chargeWork(2); frame.unknown = true; frame.stage = 1; continue; }
                const directInfo = info(access, direct);
                if (!directInfo) { budget.chargeWork(2); frame.unknown = true; frame.stage = 1; continue; }
                if (directInfo.variety === 'complex') { budget.chargeWork(); frame.blocks |= mask(budget, directInfo.block); }
                budget.chargeWork(); frame.current = direct;
                continue;
            }
            budget.chargeWork(); frame.stage = 1;
        }
        if (frame.stage === 2) {
            if (readReturned() === 'pass') { complete(frame, 'pass'); continue; }
            if (readReturned() === 'unknown') { budget.chargeWork(); frame.unknown = true; }
            budget.chargeWork(); frame.stage = 1;
        }
        if (frame.stage === 1) {
            const bInfo = info(access, frame.b);
            if (!bInfo) { complete(frame, 'unknown'); continue; }
            budget.chargeWork(2);
            if (bInfo.variety !== 'union' || !('items' in bInfo) || !frame.simple || frame.index >= bInfo.items.length) {
                complete(frame, frame.unknown ? 'unknown' : 'fail'); continue;
            }
            budget.chargeWork(3); const member = bInfo.items[frame.index++]!;
            budget.chargeWork(); frame.stage = 2;
            push(frame.simple, resolve(access, member, 'type'), frame.prefixMethods, frame.prefixBlocks);
        }
    }
    return returned;
}

function requirePass(access: ContextAccess, outcome: Outcome, rule: string, component?: Id): void {
    if (outcome === 'pass') return;
    access.budget.chargeWork();
    const source = component === undefined ? undefined : access.component(component)?.source;
    if (outcome === 'unknown') access.fail('missing-relation-authority', rule, component,
        undefined, source, 'unresolved');
    if (outcome === 'fail') access.fail('relation-failed', rule, component,
        undefined, source, 'candidate-rejected');
}
function receipt(access: ContextAccess, context: Context, predicate: RelationReceipt['predicate'],
    scope: RelationReceipt['scope'], rule: string, d: Resolved, b: Resolved,
    excluded: readonly string[], member?: Id, head?: Id): RelationReceipt {
    access.budget.chargeWork(16); // Query/target/context fields before forming output operands.
    recordWork(access.budget, "derived,base,excluded");
    const query = {derived: d.key, base: b.key, excluded};
    access.budget.chargeWork(3 + (member === undefined ? 0 : 2));
    const operands: Id[] = member === undefined
        ? [d.target.kind === 'component' ? d.target.component.id : d.key,
            b.target.kind === 'component' ? b.target.component.id : b.key]
        : [member, head!, d.target.kind === 'component' ? d.target.component.id : d.key,
            b.target.kind === 'component' ? b.target.component.id : b.key];
    recordWork(access.budget, "predicate,scope,context,rule,operands,authority,query,authorityDetails");
    const result = {predicate, scope, context: context.key, rule, operands,
        authority: RELATION_AUTHORITY.id, query, authorityDetails: RELATION_AUTHORITY};
    return access.budget.freeze(access.budget.snapshot(result));
}

export function checkTypeDerivation(context: Context, derived: Ref, expected: Ref,
    excludedMethods: readonly Method[]): Result<RelationReceipt> {
    return withContext(context, access => {
        access.budget.chargeWork(8); // Caller-context and selected target fields in this adapter.
        const excluded = canonical(access, excludedMethods);
        const d = resolve(access, derived, 'type'), b = resolve(access, expected, 'type');
        const dInfo = info(access, d);
        const rule = dInfo?.variety === 'complex' ? 'cos-ct-derived-ok' : 'cos-st-derived-ok';
        requirePass(access, typeDerivation(access, d, b, excluded), rule,
            d.target.kind === 'component' ? d.target.component.id : undefined);
        return receipt(access, context, 'checkTypeDerivation', 'type-derivation-relation', rule, d, b, excluded);
    });
}

/** Separately scoped construction premise; not silently folded into complex TypeDerivationOK. */
export function checkImmediateTypeFinal(context: Context, derived: Ref): Result<RelationReceipt> {
    return withContext(context, access => {
        access.budget.chargeWork(40); // Final clause's bounded selected fact/target fields.
        const d = resolve(access, derived, 'type'), dInfo = info(access, d);
        if (!dInfo) return access.fail('missing-relation-authority', 'immediate-base-final', undefined,
            undefined, undefined, 'unresolved');
        // Constructor final premises belong to their item/member definitions,
        // not to base.final. The deleted st-props-correct wording is not a rule.
        if (dInfo.variety !== 'complex' && dInfo.method !== 'restriction')
            return access.fail('simple-constructor-final-requires-component-owner', 'cos-st-restricts',
                d.target.kind === 'component' ? d.target.component.id : undefined,
                undefined, undefined, 'unresolved');
        const b = base(access, dInfo);
        if (!b) {
            if (!isBuiltin(access.budget, d, 'anyType')) access.fail('missing-relation-authority', 'immediate-base-final',
                undefined, undefined, undefined, 'unresolved');
            access.budget.chargeWork();
            return receipt(access, context, 'checkImmediateTypeFinal', 'immediate-base-final', 'builtin-ur-type-sentinel', d, d, EMPTY_METHODS);
        }
        const bInfo = info(access, b);
        if (!bInfo) return access.fail('missing-relation-authority', 'immediate-base-final', undefined,
            undefined, undefined, 'unresolved');
        if (contains(access.budget, bInfo.final, dInfo.method)) access.fail('base-final-method', 'immediate-base-final',
            d.target.kind === 'component' ? d.target.component.id : undefined, 'base',
            d.target.kind === 'component' ? d.target.component.source : undefined, 'candidate-rejected');
        // Rule selection reads at most three facts; the one-entry array needs
        // its container, entry and method read reserved before its allocation.
        access.budget.chargeWork(6);
        return receipt(access, context, 'checkImmediateTypeFinal', 'immediate-base-final',
            dInfo.variety === 'complex'
                ? dInfo.method === 'extension'
                    ? bInfo.variety === 'complex' ? 'cos-ct-extends.1.1' : 'cos-ct-extends.2.2'
                    : 'derivation-ok-restriction.1/base-final-conjunct'
                : 'cos-st-restricts/base-final-restriction', d, b, [dInfo.method]);
    });
}

function elementComponent(access: ContextAccess, id: Id): Component & {facts: Extract<Facts, {kind: 'element'}>} {
    const component = access.component(id);
    if (!component) access.fail('outside-context', 'substitution-operand', id);
    access.budget.chargeWork(2);
    if (component.facts.kind !== 'element') access.fail('wrong-target-kind', 'substitution-operand', id);
    return component as Component & {facts: Extract<Facts, {kind: 'element'}>};
}
function affiliationChain(access: ContextAccess, member: Component, head: Component): boolean {
    const budget = access.budget;
    budget.chargeWork(); const visited = new Set<string>();
    let current = member;
    while (true) {
        budget.chargeWork(20); // Original ID, facts/head and selected target fields.
        if (budget.compareText(current.id, head.id) === 0) return true;
        budget.chargeWork(1 + current.id.length);
        if (visited.has(current.id)) access.fail('recursive-relation-dependency', 'cos-equiv-derived-ok-rec', current.id,
            undefined, undefined, 'unresolved');
        budget.chargeWork(1 + current.id.length); visited.add(current.id);
        budget.chargeWork(2);
        if (current.facts.kind !== 'element' || !current.facts.head) return false;
        const next = resolve(access, current.facts.head, 'element');
        if (next.target.kind !== 'component') return false;
        current = next.target.component;
    }
}
function substitution(access: ContextAccess, member: Component & {facts: Extract<Facts, {kind: 'element'}>},
    head: Component & {facts: Extract<Facts, {kind: 'element'}>}, blocking: readonly string[]): Outcome {
    access.budget.chargeWork(6); // Both declaration IDs and type-reference fields.
    if (access.budget.compareText(member.id, head.id) === 0) return 'pass';
    if (contains(access.budget, blocking, 'substitution')) return 'fail';
    if (!affiliationChain(access, member, head)) return 'fail';
    return substitutionTypes(access, resolve(access, member.facts.type, 'type'), resolve(access, head.facts.type, 'type'), blocking);
}

export function checkSubstitution(context: Context, memberId: Id, headId: Id,
    options: SubstitutionOptions): Result<RelationReceipt> {
    return withContext(context, access => {
        access.budget.chargeWork(40); // Options plus bounded member/head/final/block fields.
        const mode = ownData(access, options, 'mode', 'invalid-substitution-mode');
        const suppliedBlocking = ownData(access, options, 'blocking', 'invalid-substitution-mode', true);
        const member = elementComponent(access, memberId), head = elementComponent(access, headId);
        const d = resolve(access, member.facts.type, 'type'), b = resolve(access, head.facts.type, 'type');
        if (mode === 'affiliation') {
            if (!member.facts.head) return access.fail('missing-affiliation', 'e-props-correct.4', member.id,
                'head', member.source, 'candidate-rejected');
            const declared = resolve(access, member.facts.head, 'element');
            if (declared.target.kind !== 'component' || access.budget.compareText(declared.target.component.id, head.id) !== 0)
                access.fail('wrong-affiliation-head', 'e-props-correct.4', member.id, 'head', member.source, 'candidate-rejected');
            const excluded = canonical(access, head.facts.final);
            requirePass(access, typeDerivation(access, d, b, excluded), 'e-props-correct.4', member.id);
            return receipt(access, context, 'checkSubstitution', 'affiliation-type-property', 'e-props-correct.4', d, b, excluded, member.id, head.id);
        }
        if (mode !== 'substitutability') access.fail('invalid-substitution-mode', 'relation-options');
        const blocking = canonical(access,
            (suppliedBlocking === undefined ? head.facts.block : suppliedBlocking) as readonly string[], true);
        requirePass(access, substitution(access, member, head, blocking), 'cos-equiv-derived-ok-rec', member.id);
        return receipt(access, context, 'checkSubstitution', 'substitutability', 'cos-equiv-derived-ok-rec', d, b, blocking, member.id, head.id);
    });
}

/** Only retained globals enter P; excluded incoming affiliates remain boundary evidence. */
export function effectiveSubstitutionMembers(context: Context, headId: Id): Result<SubstitutionMembersReceipt> {
    return withContext(context, access => {
        access.budget.chargeWork(10); // Head identity and original blocking fields.
        const head = elementComponent(access, headId);
        if (head.identity.kind !== 'global') access.fail('non-global-substitution-head', 'cos-equiv-class', head.id);
        const blocking = canonical(access, head.facts.block, true);
        access.budget.chargeWork(); const members: Id[] = [];
        for (const id of context.members) {
            access.budget.chargeWork(); const component = access.component(id)!;
            access.budget.chargeWork(8); // Kind, global scope and abstract fields.
            if (component.facts.kind !== 'element' || component.identity.kind !== 'global' || component.facts.abstract) continue;
            if (!affiliationChain(access, component, head)) continue;
            const outcome = substitution(access, component as Component & {facts: Extract<Facts, {kind: 'element'}>}, head, blocking);
            if (outcome === 'unknown') requirePass(access, outcome, 'cos-equiv-class', component.id);
            if (outcome === 'pass') { access.budget.chargeWork(); members.push(id); }
        }
        access.budget.chargeWork(2 + members.length);
        const operands = [headId, ...members];
        recordWork(access.budget, "predicate,scope,context,rule,head,members,blocking,excludedIncoming,operands,authority,authorityDetails");
        const result: SubstitutionMembersReceipt = {predicate: 'effectiveSubstitutionMembers', scope: 'retained-substitution-universe',
            context: context.key, rule: 'cos-equiv-class', head: headId, members, blocking,
            excludedIncoming: context.excludedIncoming, operands, authority: RELATION_AUTHORITY.id, authorityDetails: RELATION_AUTHORITY};
        return access.budget.freeze(access.budget.snapshot(result));
    });
}
