/**
 * Finite all-member checking ledger. Supplied owner passes are conditional
 * component-schema evidence, never a proof of RE01 or production assessment.
 * No scalar, occurrence or complete XSD component engine is supplied here.
 */
import {samePreparedRequest, withContext} from './resolver-context.js';
import type {ContextAccess} from './resolver-context.js';
import type {ResolverBudget} from './resolver-budget.js';
import {compareEndpoint} from './resolver-comparison.js';
import {checkImmediateTypeFinal, checkSubstitution, checkTypeDerivation, effectiveSubstitutionMembers} from './resolver-relations.js';
import type {
    AttributeAction, Component, Content, Context, Correspondence, CorrespondenceReceipt,
    Id, Name, Operand, Prepared, Ref, Result, Source, SourceGroupUse, SourceUse, Value, Wildcard,
} from './resolver-types.js';

export type PredicateReceipt = Readonly<{
    context: string; rule: string; operands: readonly Id[]; authority: string;
}>;
type Adapter = 'type-construction' | 'attributes' | 'particle-restriction'
    | 'attribution' | 'declarations' | 'scalar-operands';
type LocalRule = 'immediate-final' | 'affiliation' | 'substitution-universe'
    | 'retain' | 'replace-set' | 'prohibit' | 'requiredness' | 'original-type' | 'fixed-kind' | 'extension-uses';
export type AttributeMatch = Readonly<{
    role: 'retain' | 'replace' | 'prohibit' | 'extension'; name?: Name;
    originals: readonly Component[]; replacements: readonly Component[];
    action?: AttributeAction; sourceUse?: SourceUse;
}>;
export type ScalarInput = Readonly<{
    operands: readonly Operand[]; values: readonly Value[];
    /** Original declared types, without a new scalar ancestry evaluator. */
    types: readonly Ref[];
}>;
export type AttributionPosition = Readonly<{
    owner: Id; projection: 'effective' | 'declared';
    /** Numeric source slots distinguish repeated uses of the same group. */
    path: readonly string[]; particle: Component; declaration?: Component;
    implicitMembers: readonly Id[];
}>;
export type ValidationObligation = Readonly<{
    adapter: Adapter | 'local'; rule: string; component: Id; slot: string;
    operands: readonly Id[]; source: Source; owner: string;
    local?: LocalRule; match?: AttributeMatch; scalar?: ScalarInput;
    sourceUse?: SourceUse; sourceGroup?: SourceGroupUse; wildcard?: Wildcard;
    sourceComponent?: Component;
    head?: Id; unsupported?: Readonly<{rule: string; owner: string; source: Source}>;
}>;
interface CommonRequest {
    readonly context: Context;
    readonly budget: ResolverBudget;
    readonly obligation: ValidationObligation;
    readonly component: Component;
    readonly source: Source;
    readonly operands: readonly Id[];
    /** Borrowed actual operands are evidence only; semantic queries use context. */
    readonly actualContext?: Context;
    readonly originalComponent?: Component;
}
export interface TypeConstructionRequest extends CommonRequest {
    readonly base: Component | Ref;
    readonly declaredContent?: Content;
    readonly content?: Content;
    readonly construction: 'intermediate-extension' | 'endpoint-restriction' | 'member';
}
export interface AttributesRequest extends CommonRequest {
    readonly originalUses: readonly Component[];
    readonly originalSourceUses: readonly SourceUse[];
    readonly originalSourceGroups: readonly SourceGroupUse[];
    readonly sourceGroupTarget?: Component;
    readonly match?: AttributeMatch;
}
export interface ParticleRestrictionRequest extends CommonRequest {
    readonly base?: Component | Ref;
    readonly declaredContent?: Content;
    readonly content?: Content;
    /** Raw operands are separate; restriction normalization belongs to this owner. */
    readonly declaredRoots: readonly Component[];
    readonly effectiveRoots: readonly Component[];
}
export interface AttributionRequest extends CommonRequest {
    readonly positions: readonly AttributionPosition[];
    readonly declaredContent?: Content;
    readonly content?: Content;
}
export interface DeclarationsRequest extends CommonRequest {
    readonly positions: readonly AttributionPosition[];
    readonly declaration?: Component;
}
export interface ScalarOperandsRequest extends CommonRequest {
    readonly original: ScalarInput;
}
/** Qualification names a reviewed predicate owner's artifact/scope, not a boolean policy switch. */
export interface QualifiedOwner<T> {
    readonly authority: string;
    readonly qualification: string;
    check(request: T): Result<PredicateReceipt>;
}
/** Six fixed semantic owners. There is no configurable rule dispatcher. */
export interface ValidationOwners {
    readonly typeConstruction?: QualifiedOwner<TypeConstructionRequest>;
    readonly attributes?: QualifiedOwner<AttributesRequest>;
    readonly particleRestriction?: QualifiedOwner<ParticleRestrictionRequest>;
    readonly attribution?: QualifiedOwner<AttributionRequest>;
    readonly declarations?: QualifiedOwner<DeclarationsRequest>;
    readonly scalarOperands?: QualifiedOwner<ScalarOperandsRequest>;
}
export type ObligationAssessment = Readonly<{
    obligation: ValidationObligation;
    result: Readonly<{kind: 'ok'; value: PredicateReceipt} | {
        kind: 'input-error' | 'candidate-rejected' | 'unresolved';
        diagnostic: Exclude<Result<never>, {kind: 'ok'} | {kind: 'resource-limit'}>['diagnostic'];
    }>;
}>;
export type ValidationLedger = Readonly<{
    context: string; members: readonly Id[]; excludedIncoming: Context['excludedIncoming'];
    assessments: readonly ObligationAssessment[];
}>;
export type CheckedCandidateReceipt = Readonly<{
    kind: 'checked-candidate'; context: string;
    scope: 'listed-component-schema-under-qualified-predicates';
    exclusions: readonly string[]; members: readonly Id[];
    excludedIncoming: Context['excludedIncoming']; correspondence: CorrespondenceReceipt;
    obligations: readonly PredicateReceipt[]; authorities: readonly string[];
}>;
const EMPTY_IDS: readonly Id[] = Object.freeze([]);
const EMPTY_COMPONENTS: readonly Component[] = Object.freeze([]);
const EMPTY_OPERANDS: readonly Operand[] = Object.freeze([]);
const EMPTY_VALUES: readonly Value[] = Object.freeze([]);
const EMPTY_METHODS = Object.freeze([]);
const EMPTY_POSITIONS: readonly AttributionPosition[] = Object.freeze([]);
const CONTENT_FIELDS = Object.freeze(['content', 'declaredContent'] as const);
const CONTENT_PROJECTIONS = Object.freeze(['effective', 'declared'] as const);
const NO_OWNERS: ValidationOwners = Object.freeze({});
const ROLE_AUTHORITY = 'AU01-C1-universal-source-replacement-and-RE01-identity-roles-v1';
const EXCLUSIONS = Object.freeze(['source-reconstruction', 'global-witness-completeness', 'production-assessment-acceptance']);

function recordWork(budget: ResolverBudget, fields: string): void {
    let count = 1;
    for (let i = 0; i < fields.length; i++) {budget.chargeWork(); if (fields.charCodeAt(i) === 44) count++;}
    budget.chargeWork(1 + count + fields.length - count + 1);
}
/**
 * Before inspecting a fixed tagged view, reserve its branch's bounded maximum
 * borrowed field reads. This is distinct from recordWork's owned allocation
 * cost. Dynamic entries and nested predicate work are charged separately.
 * Unused short-circuit field capacity stays charged in the request ledger.
 */
function readFields(budget: ResolverBudget, maximum: number): void {budget.chargeWork(maximum);}
function array<T>(budget: ResolverBudget, first: T, second?: T): T[] {
    budget.chargeWork(second === undefined ? 2 : 3);
    return second === undefined ? [first] : [first, second];
}
function prepend<T>(budget: ResolverBudget, first: T, values: readonly T[]): T[] {
    budget.chargeWork(2 + values.length); return [first, ...values];
}
function indexedSlot(budget: ResolverBudget, prefix: string, index: number): string {
    // Input prefix, bounded decimal conversion, and produced prefix/index text.
    budget.chargeWork(2 * prefix.length + 22); return `${prefix}/${index}`;
}
/** Fixed source slots preserve numeric occurrence order (2 before 10). */
function compareSlots(budget: ResolverBudget, left: string, right: string): number {
    budget.chargeWork(2);
    let a = 0, z = 0;
    const digit = (value: number): boolean => value >= 48 && value <= 57;
    while (a < left.length && z < right.length) {
        budget.chargeWork(2); const lc = left.charCodeAt(a), rc = right.charCodeAt(z);
        if (digit(lc) && digit(rc)) {
            let ae = a, ze = z;
            while (ae < left.length) {budget.chargeWork(); if (!digit(left.charCodeAt(ae))) break; ae++;}
            while (ze < right.length) {budget.chargeWork(); if (!digit(right.charCodeAt(ze))) break; ze++;}
            if (ae - a !== ze - z) return (ae - a) - (ze - z);
            while (a < ae) {budget.chargeWork(2); const order = left.charCodeAt(a++) - right.charCodeAt(z++); if (order) return order;}
        } else {
            if (lc !== rc) return lc - rc;
            a++; z++;
        }
    }
    budget.chargeWork(2); return (left.length - a) - (right.length - z);
}
function component(access: ContextAccess, id: Id): Component {
    const result = access.component(id);
    if (!result) return access.fail('outside-context', 'validation-member', id);
    return result;
}
function refId(access: ContextAccess, ref: Ref): Id {
    readFields(access.budget, 8);
    if (ref.kind !== 'builtin') return ref.target;
    access.budget.chargeWork(2 * (ref.name.namespace.length + ref.name.local.length) + 10);
    return `builtin:${ref.name.namespace}:${ref.name.local}`;
}
function target(access: ContextAccess, ref: Ref): Component | Ref {
    readFields(access.budget, 2); return ref.kind === 'builtin' ? ref : component(access, ref.target);
}
function refFor(access: ContextAccess, value: Component): Ref {
    const b = access.budget;
    readFields(b, 7);
    if (value.identity.kind === 'global') {
        recordWork(b, 'kind,role,target,name,source'); b.chargeWork(1);
        return {kind: 'symbol', role: 'type', target: value.id, name: value.identity.name, source: value.source};
    }
    recordWork(b, 'kind,target'); return {kind: 'local', target: value.id};
}
function equalIds(access: ContextAccess, a: readonly Id[], b: readonly Id[]): boolean {
    access.budget.chargeWork(2);
    const length = a.length, otherLength = b.length;
    if (length !== otherLength) return false;
    for (let i = 0; i < length; i++) {access.budget.chargeWork(2); if (access.budget.compareText(a[i]!, b[i]!) !== 0) return false;}
    return true;
}
function sameName(access: ContextAccess, a: Name, b: Name): boolean {
    readFields(access.budget, 4);
    return access.budget.compareText(a.namespace, b.namespace) === 0 && access.budget.compareText(a.local, b.local) === 0;
}
function uses(access: ContextAccess, value: Component | Ref): readonly Component[] {
    readFields(access.budget, 6);
    if (!('facts' in value)) return EMPTY_COMPONENTS;
    const f = value.facts;
    if (f.kind !== 'type' && f.kind !== 'attributeGroup') return EMPTY_COMPONENTS;
    access.budget.chargeWork(); const output: Component[] = [];
    const ids = f.kind === 'type' ? f.attributeUses : f.uses;
    for (const id of ids) {access.budget.chargeWork(); const use = component(access, id); access.budget.chargeWork(); output.push(use);}
    const sorted = access.budget.sorted(output, (a, z) => {readFields(access.budget, 2); return access.budget.compareText(a.id, z.id);});
    access.budget.chargeWork(); const unique: Component[] = [];
    let previous: Id | undefined;
    for (const use of sorted) {
        // Entry/ID inspection, previous-state read and transition.
        readFields(access.budget, 5);
        if (previous === undefined || access.budget.compareText(previous, use.id) !== 0) {access.budget.chargeWork(); unique.push(use);}
        previous = use.id;
    }
    return unique;
}
function declaration(access: ContextAccess, use: Component): Component {
    readFields(access.budget, 9);
    if (use.facts.kind !== 'attributeUse' || use.facts.declaration.kind === 'builtin') return access.fail('wrong-use-kind', 'AU01-original-use', use.id);
    return component(access, use.facts.declaration.target);
}
function useName(access: ContextAccess, use: Component): Name {
    const d = declaration(access, use); readFields(access.budget, 5);
    if (d.facts.kind !== 'attribute') return access.fail('wrong-declaration-kind', 'AU01-original-use', use.id);
    return d.facts.name;
}
function effectiveValue(access: ContextAccess, use: Component): Value | undefined {
    readFields(access.budget, 6);
    if (use.facts.kind !== 'attributeUse') return undefined;
    if (use.facts.value) return use.facts.value;
    const d = declaration(access, use); readFields(access.budget, 4);
    return d.facts.kind === 'attribute' ? d.facts.value : undefined;
}
function matching(access: ContextAccess, values: readonly Component[], name: Name): readonly Component[] {
    access.budget.chargeWork(); const output: Component[] = [];
    for (const use of values) {access.budget.chargeWork(); if (sameName(access, useName(access, use), name)) {access.budget.chargeWork(); output.push(use);}}
    return output;
}
function ids(access: ContextAccess, values: readonly Component[]): readonly Id[] {
    access.budget.chargeWork(); const output: Id[] = [];
    for (const value of values) {access.budget.chargeWork(3); output.push(value.id);}
    return output;
}
function ownReceipt(access: ContextAccess, context: Context, obligation: ValidationObligation, authority: string): PredicateReceipt {
    readFields(access.budget, 4);
    recordWork(access.budget, 'context,rule,operands,authority');
    const value = {context: context.key, rule: obligation.rule, operands: obligation.operands, authority};
    return access.budget.freeze(access.budget.snapshot(value));
}
function propagate<T>(access: ContextAccess, result: Result<T>): T {
    readFields(access.budget, 17);
    if (result.kind === 'ok') return result.value;
    if (result.kind === 'resource-limit') {
        // Exhausted same-request calls throw its already reserved terminal signal.
        access.budget.chargeWork();
        return access.fail('foreign-resource-result', 'predicate-request-qualification', undefined, undefined, undefined, 'unresolved');
    }
    return access.fail(result.diagnostic.code, result.diagnostic.rule, result.diagnostic.component,
        result.diagnostic.slot, result.diagnostic.source, result.kind);
}
function qualified<T>(access: ContextAccess, context: Context, obligation: ValidationObligation,
    owner: QualifiedOwner<T> | undefined, request: T): PredicateReceipt {
    const b = access.budget;
    readFields(b, 15);
    if (!owner || typeof owner.authority !== 'string' || owner.authority.length === 0
        || typeof owner.qualification !== 'string' || owner.qualification.length === 0 || typeof owner.check !== 'function')
        return access.fail('missing-qualified-authority', obligation.rule, obligation.component,
            obligation.slot, obligation.source, 'unresolved');
    b.chargeWork(owner.authority.length + owner.qualification.length + 1);
    const result = owner.check(request);
    // Capture return-time counters before inspecting a copied Usage record.
    const returnedNodes = b.usage().nodes, returnedWork = b.usage().work;
    readFields(b, 32);
    const malformed = (): never => access.fail('malformed-predicate-receipt', obligation.rule,
        obligation.component, obligation.slot, obligation.source, 'unresolved');
    const field = (value: unknown, name: string): unknown => {
        b.chargeWork(44 + name.length);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return malformed();
        const descriptor = Object.getOwnPropertyDescriptor(value, name);
        if (!descriptor || !('value' in descriptor)) return malformed();
        return descriptor.value;
    };
    const kind = field(result, 'kind'), usage = field(result, 'usage');
    if (usage !== b.usage()) {
        const nodes = field(usage, 'nodes'), work = field(usage, 'work');
        if (nodes !== returnedNodes || work !== returnedWork) return access.fail('foreign-predicate-request', obligation.rule,
            obligation.component, obligation.slot, obligation.source, 'unresolved');
    }
    if (kind !== 'ok' && kind !== 'input-error' && kind !== 'candidate-rejected' && kind !== 'unresolved' && kind !== 'resource-limit') return malformed();
    if (kind === 'ok') {
        const receipt = field(result, 'value');
        const receiptContext = field(receipt, 'context'), rule = field(receipt, 'rule'), authority = field(receipt, 'authority'), operands = field(receipt, 'operands');
        if (typeof receiptContext !== 'string' || typeof rule !== 'string' || typeof authority !== 'string' || !Array.isArray(operands)) return malformed();
        b.chargeWork(44); const length = Object.getOwnPropertyDescriptor(operands, 'length');
        if (!length || !('value' in length) || !Number.isSafeInteger(length.value) || length.value < 0) return malformed();
        for (let i = 0; i < length.value; i++) {
            b.chargeWork(55); const index = String(i), descriptor = Object.getOwnPropertyDescriptor(operands, index);
            if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string') return malformed();
        }
    } else if (kind !== 'resource-limit') {
        const diagnostic = field(result, 'diagnostic');
        const diagnosticContext = field(diagnostic, 'context'), code = field(diagnostic, 'code'), rule = field(diagnostic, 'rule');
        if (typeof diagnosticContext !== 'string' || typeof code !== 'string' || typeof rule !== 'string') return malformed();
        if (b.compareText(diagnosticContext, context.key) !== 0) return access.fail('wrong-predicate-context', obligation.rule,
            obligation.component, obligation.slot, obligation.source, 'unresolved');
        // Owner-supplied optional fields are not trusted or accessed. Rebuild
        // the failure from the authenticated obligation's original operands.
        return access.fail(code, rule, obligation.component, obligation.slot, obligation.source,
            kind as 'input-error' | 'candidate-rejected' | 'unresolved');
    }
    if (result.kind !== 'ok') {
        return propagate(access, result);
    }
    const receipt = result.value;
    if (b.compareText(receipt.context, context.key) !== 0 || b.compareText(receipt.rule, obligation.rule) !== 0
        || b.compareText(receipt.authority, owner.authority) !== 0 || !equalIds(access, receipt.operands, obligation.operands))
        return access.fail('unqualified-predicate-receipt', obligation.rule, obligation.component, obligation.slot, obligation.source, 'unresolved');
    return ownReceipt(access, context, obligation, receipt.authority);
}
function common(access: ContextAccess, context: Context, obligation: ValidationObligation, actualContext?: Context): CommonRequest {
    readFields(access.budget, 24);
    let originalComponent: Component | undefined;
    if (actualContext) {
        recordWork(access.budget, 'actual,proposed');
        if (!samePreparedRequest({actual: actualContext, proposed: context}, access.budget)) return access.fail('invalid-original-context-pair', obligation.rule,
            obligation.component, obligation.slot, obligation.source);
        originalComponent = propagate(access, withContext(actualContext, original => original.component(obligation.component)));
    }
    recordWork(access.budget, 'context,budget,obligation,component,source,operands,actualContext,originalComponent');
    return {context, budget: access.budget, obligation, component: component(access, obligation.component),
        source: obligation.source, operands: obligation.operands, actualContext, originalComponent};
}
function roots(access: ContextAccess, content: Content | undefined): readonly Component[] {
    readFields(access.budget, 4);
    if (!content || (content.kind !== 'element-only' && content.kind !== 'mixed')) return EMPTY_COMPONENTS;
    access.budget.chargeWork(); const result: Component[] = [];
    for (const id of content.roots) {readFields(access.budget, 2); const value = component(access, id); access.budget.chargeWork(); result.push(value);}
    return result;
}

export function checkTypeConstruction(context: Context, obligation: ValidationObligation,
    owner?: QualifiedOwner<TypeConstructionRequest>, actualContext?: Context): Result<PredicateReceipt> {
    return withContext(context, access => {
        readFields(access.budget, 40);
        const c = common(access, context, obligation, actualContext), f = c.component.facts;
        if (f.kind !== 'type') return access.fail('wrong-adapter-operand', obligation.rule, c.component.id);
        if (c.component.id === access.candidate.endpoint && !c.originalComponent) return access.fail('missing-original-construction-premise', obligation.rule,
            c.component.id, obligation.slot, obligation.source, 'unresolved');
        recordWork(access.budget, 'context,budget,obligation,component,source,operands,actualContext,originalComponent,base,declaredContent,content,construction');
        const request: TypeConstructionRequest = {...c, base: target(access, f.base), declaredContent: f.declaredContent, content: f.content,
            construction: c.component.id === access.candidate.intermediate ? 'intermediate-extension'
                : c.component.id === access.candidate.endpoint ? 'endpoint-restriction' : 'member'};
        return qualified(access, context, obligation, owner, request);
    });
}
export function checkAttributes(context: Context, obligation: ValidationObligation,
    owner?: QualifiedOwner<AttributesRequest>, actualContext?: Context): Result<PredicateReceipt> {
    return withContext(context, access => {
        readFields(access.budget, 32);
        const c = common(access, context, obligation, actualContext);
        recordWork(access.budget, 'context,budget,obligation,component,source,operands,actualContext,originalComponent,originalUses,originalSourceUses,originalSourceGroups,sourceGroupTarget,match');
        const request: AttributesRequest = {...c, originalUses: uses(access, c.component),
            originalSourceUses: (obligation.sourceComponent ?? c.component).sourceUses,
            originalSourceGroups: (obligation.sourceComponent ?? c.component).sourceGroups,
            sourceGroupTarget: obligation.sourceGroup?.reference.kind !== 'builtin' && obligation.sourceGroup
                ? component(access, obligation.sourceGroup.reference.target) : undefined,
            match: obligation.match};
        return qualified(access, context, obligation, owner, request);
    });
}
export function checkParticleRestriction(context: Context, obligation: ValidationObligation,
    owner?: QualifiedOwner<ParticleRestrictionRequest>, actualContext?: Context): Result<PredicateReceipt> {
    return withContext(context, access => {
        readFields(access.budget, 40);
        const c = common(access, context, obligation, actualContext), f = c.component.facts;
        recordWork(access.budget, 'context,budget,obligation,component,source,operands,actualContext,originalComponent,base,declaredContent,content,declaredRoots,effectiveRoots');
        const request: ParticleRestrictionRequest = {...c,
            base: f.kind === 'type' ? target(access, f.base) : undefined,
            declaredContent: f.kind === 'type' ? f.declaredContent : undefined,
            content: f.kind === 'type' ? f.content : undefined,
            declaredRoots: f.kind === 'type' ? roots(access, f.declaredContent) : EMPTY_COMPONENTS,
            effectiveRoots: f.kind === 'type' ? roots(access, f.content)
                : f.kind === 'group' ? array(access.budget, component(access, f.root)) : EMPTY_COMPONENTS};
        return qualified(access, context, obligation, owner, request);
    });
}

/** Expand particle/group use positions only; stop at element type references. */
function positions(access: ContextAccess, context: Context, value: Component): readonly AttributionPosition[] {
    const b = access.budget;
    readFields(b, 8); const f = value.facts;
    b.chargeWork(2); const output: AttributionPosition[] = [];
    type Frame = {id: Id; projection: 'effective' | 'declared'; path: readonly string[]};
    const pending: Frame[] = [];
    const push = (id: Id, projection: Frame['projection'], path: readonly string[]): void => {
        recordWork(b, 'id,projection,path'); b.chargeWork(); pending.push({id, projection, path});
    };
    if (f.kind === 'type') {
        for (const projection of CONTENT_PROJECTIONS) {
            readFields(b, 5); const content = projection === 'effective' ? f.content : f.declaredContent;
            if (content.kind !== 'element-only' && content.kind !== 'mixed') continue;
            for (let i = content.roots.length - 1; i >= 0; i--) {
                readFields(b, 4);
                const slot = indexedSlot(b, 'roots', i);
                push(content.roots[i]!, projection, array(b, slot));
            }
        }
    } else if (f.kind === 'group') push(f.root, 'effective', array(b, 'root'));
    else return EMPTY_POSITIONS;
    while (pending.length) {
        // Up to 50 fixed frame/particle/reference/declaration reads per position.
        readFields(b, 50); b.chargeWork(2); const frame = pending.pop()!, particle = component(access, frame.id);
        const facts = particle.facts;
        if (facts.kind === 'group') {
            b.chargeWork(2 + 2 * frame.path.length); push(facts.root, frame.projection, [...frame.path, 'root']); continue;
        }
        if (facts.kind !== 'particle') return access.fail('wrong-attribution-node', 'cos-nonambig', particle.id);
        let declaration: Component | undefined, implicitMembers = EMPTY_IDS;
        if (facts.reference && facts.reference.kind !== 'builtin') {
            declaration = component(access, facts.reference.target);
            if (facts.term === 'element' && declaration.identity.kind === 'global') {
                const members = propagate(access, effectiveSubstitutionMembers(context, declaration.id));
                implicitMembers = members.members;
            }
            if (facts.term === 'group') {
                b.chargeWork(2 + 2 * frame.path.length); push(declaration.id, frame.projection, [...frame.path, 'reference']);
            }
        }
        recordWork(b, 'owner,projection,path,particle,declaration,implicitMembers'); b.chargeWork();
        output.push({owner: value.id, projection: frame.projection, path: frame.path, particle, declaration, implicitMembers});
        for (let i = facts.children.length - 1; i >= 0; i--) {
            readFields(b, 16);
            const slot = indexedSlot(b, 'children', i);
            b.chargeWork(2 + 2 * frame.path.length); push(facts.children[i]!, frame.projection, [...frame.path, slot]);
        }
    }
    return output;
}
export function checkAttribution(context: Context, obligation: ValidationObligation,
    owner?: QualifiedOwner<AttributionRequest>, actualContext?: Context): Result<PredicateReceipt> {
    return withContext(context, access => {
        readFields(access.budget, 25);
        const c = common(access, context, obligation, actualContext), f = c.component.facts;
        recordWork(access.budget, 'context,budget,obligation,component,source,operands,actualContext,originalComponent,positions,declaredContent,content');
        const request: AttributionRequest = {...c, positions: positions(access, context, c.component),
            declaredContent: f.kind === 'type' ? f.declaredContent : undefined, content: f.kind === 'type' ? f.content : undefined};
        return qualified(access, context, obligation, owner, request);
    });
}
export function checkDeclarations(context: Context, obligation: ValidationObligation,
    owner?: QualifiedOwner<DeclarationsRequest>, actualContext?: Context): Result<PredicateReceipt> {
    return withContext(context, access => {
        readFields(access.budget, 30);
        const c = common(access, context, obligation, actualContext);
        recordWork(access.budget, 'context,budget,obligation,component,source,operands,actualContext,originalComponent,positions,declaration');
        const request: DeclarationsRequest = {...c, positions: positions(access, context, c.component),
            declaration: obligation.sourceUse?.kind === 'reference-prohibition' && obligation.sourceUse.declaration.kind !== 'builtin'
                ? component(access, obligation.sourceUse.declaration.target) : undefined};
        return qualified(access, context, obligation, owner, request);
    });
}
export function checkScalarOperands(context: Context, obligation: ValidationObligation,
    owner?: QualifiedOwner<ScalarOperandsRequest>, actualContext?: Context): Result<PredicateReceipt> {
    return withContext(context, access => {
        readFields(access.budget, 20);
        const c = common(access, context, obligation, actualContext);
        if (!obligation.scalar) return access.fail('missing-scalar-operands', obligation.rule, c.component.id);
        recordWork(access.budget, 'context,budget,obligation,component,source,operands,actualContext,originalComponent,original');
        const request: ScalarOperandsRequest = {...c, original: obligation.scalar};
        return qualified(access, context, obligation, owner, request);
    });
}

/** The inventory is complete for supplied Facts; unassessed is the preparation owner's assertion. */
function inventory(access: ContextAccess, context: Context, actualContext?: Context): readonly ValidationObligation[] {
    const b = access.budget;
    readFields(b, 8);
    b.chargeWork(); const output: ValidationObligation[] = [];
    let originalEndpoint: Component | undefined;
    if (actualContext) {
        recordWork(b, 'actual,proposed');
        if (!samePreparedRequest({actual: actualContext, proposed: context}, b)) return access.fail('invalid-original-context-pair', 'validation-inventory');
        originalEndpoint = propagate(access, withContext(actualContext, original => original.component(access.candidate.endpoint)));
    }
    const add = (c: Component, adapter: ValidationObligation['adapter'], rule: string, slot = '',
        operands: readonly Id[] = EMPTY_IDS, detail?: Partial<ValidationObligation>): void => {
        readFields(b, 4);
        recordWork(b, 'adapter,rule,component,slot,operands,source,owner');
        if (detail) {b.chargeWork(3); for (const field in detail) b.chargeWork(2 + field.length);}
        b.chargeWork(2 + operands.length); const withOwner = [c.id, ...operands];
        b.chargeWork(); output.push({adapter, rule, component: c.id, slot, operands: withOwner,
            source: c.source, owner: adapter === 'local' ? 'R3/AU01/RE01' : adapter, ...detail});
    };
    const detail = <T extends object>(fields: string, value: () => T): T => {recordWork(b, fields); return value();};
    const scalar = (c: Component, rule: string, slot: string, original: ScalarInput, source = c.source,
        operandIds: readonly Id[] = EMPTY_IDS): void => {
        add(c, 'scalar-operands', rule, slot, operandIds, detail('scalar,source', () => ({scalar: original, source})));
    };
    const valueOperand = (c: Component, value: Value | undefined, slot: string): void => {
        readFields(b, 20); if (!value) return;
        const original = detail('operands,values,types', () => ({operands: array(b, value.operand), values: array(b, value), types: array(b, value.operand.type)}));
        scalar(c, 'scalar-value-constraint', slot, original, value.operand.source, array(b, refId(access, value.operand.type)));
    };
    const matchDetails = (match: AttributeMatch, local: LocalRule): Partial<ValidationObligation> => detail('match,local', () => ({match, local}));
    const pair = (c: Component, match: AttributeMatch, slot: string): void => {
        readFields(b, 2);
        for (const replacement of match.replacements) for (const original of match.originals) {
            // Pair entries plus at most 48 fixed AU/declaration/value/match reads.
            readFields(b, 48); b.chargeWork(2);
            const operands = array(b, original.id, replacement.id);
            const single = detail('role,name,originals,replacements,action,sourceUse', () => ({...match,
                originals: array(b, original), replacements: array(b, replacement)}));
            add(c, 'local', 'AU01:all-matches-requiredness', slot, operands, matchDetails(single, 'requiredness'));
            const oldDeclaration = declaration(access, original), newDeclaration = declaration(access, replacement);
            if (oldDeclaration.facts.kind !== 'attribute' || newDeclaration.facts.kind !== 'attribute') return access.fail('wrong-declaration-kind', 'AU01-original-type', c.id);
            add(c, 'local', 'AU01:all-matches-original-type', slot, operands, matchDetails(single, 'original-type'));
            const oldValue = effectiveValue(access, original);
            if (oldValue?.kind === 'fixed') {
                add(c, 'local', 'AU01:all-matches-fixed-kind', slot, operands, matchDetails(single, 'fixed-kind'));
                const newValue = effectiveValue(access, replacement);
                if (newValue?.kind === 'fixed') scalar(c, 'AU01:all-matches-original-fixed', slot,
                    detail('operands,values,types', () => ({operands: array(b, oldValue.operand, newValue.operand),
                        values: array(b, oldValue, newValue), types: array(b, oldValue.operand.type, newValue.operand.type)})),
                    oldValue.operand.source, operands);
            }
        }
    };
    for (const id of context.members) {
        // Tagged component branch: at most 64 fixed borrowed field reads;
        // source/facet/item/action entries below have their own reserves.
        readFields(b, 64); b.chargeWork(); const c = component(access, id), f = c.facts;
        if (f.kind === 'type') {
            add(c, 'type-construction', f.variety === 'complex' ? 'ct-props-correct' : 'st-props-correct');
            add(c, 'type-construction', f.variety === 'complex' ? (f.method === 'extension' ? 'cos-ct-extends' : 'cos-ct-restricts') : 'simple-type-derivation-construction',
                'base', array(b, refId(access, f.base)));
            if (f.method === 'list' || f.method === 'union') {
                readFields(b, 2); const items = f.items, itemCount = items.length;
                for (let i = 0; i < itemCount; i++) {readFields(b, 3); add(c, 'type-construction', 'simple-constructor-final', indexedSlot(b, 'items', i), array(b, refId(access, items[i]!)));}
            }
            else add(c, 'local', 'immediate-base-final', 'base', array(b, refId(access, f.base)), detail('local', () => ({local: 'immediate-final' as const})));
            if (f.variety === 'complex') {
                add(c, 'attributes', 'AU01:complete-set-constraints', 'attributeUses', ids(access, uses(access, c)));
                add(c, 'attribution', 'cos-nonambig'); add(c, 'declarations', 'cos-element-consistent');
                if (f.method === 'restriction') {
                    add(c, 'particle-restriction', 'restriction-normalization', 'declaredContent');
                    add(c, 'particle-restriction', 'particle-restriction', 'content', array(b, refId(access, f.base)));
                } else {
                    const match = detail('role,originals,replacements', () => ({role: 'extension' as const, originals: uses(access, target(access, f.base)), replacements: uses(access, c)}));
                    add(c, 'local', 'AU01:extension-preserves-original-identities', 'attributeUses', ids(access, match.originals), matchDetails(match, 'extension-uses'));
                }
            } else scalar(c, 'scalar-type-derivation-and-facets', 'base',
                detail('operands,values,types', () => ({operands: EMPTY_OPERANDS, values: EMPTY_VALUES, types: prepend(b, f.base, f.items)})));
            for (const field of CONTENT_FIELDS) {
                readFields(b, 8); const content = f[field];
                if (content.kind === 'simple') scalar(c, 'scalar-simple-content', field,
                    detail('operands,values,types', () => ({operands: EMPTY_OPERANDS, values: EMPTY_VALUES, types: array(b, content.type)})),
                    c.source, array(b, refId(access, content.type)));
            }
            readFields(b, 2); const facets = f.facets, facetCount = facets.length;
            for (let i = 0; i < facetCount; i++) {
                readFields(b, 18); const facet = facets[i]!, slot = indexedSlot(b, 'facets', i);
                scalar(c, 'scalar-facet-operand', slot,
                    detail('operands,values,types', () => ({operands: array(b, facet.operand), values: EMPTY_VALUES, types: array(b, facet.operand.type)})),
                    facet.operand.source, array(b, facet.id, refId(access, facet.operand.type)));
            }
            if (f.wildcard) add(c, 'attributes', 'attribute-wildcard-constraints', 'wildcard', EMPTY_IDS, detail('wildcard,source', () => ({wildcard: f.wildcard, source: f.wildcard!.source})));
            if (f.declaredWildcard) add(c, 'attributes', 'declared-attribute-wildcard-constraints', 'declaredWildcard', EMPTY_IDS,
                detail('wildcard,source', () => ({wildcard: f.declaredWildcard, source: f.declaredWildcard!.source})));
        } else if (f.kind === 'element') {
            add(c, 'declarations', 'e-props-correct', 'type', array(b, refId(access, f.type)));
            if (c.identity.kind === 'global') {
                add(c, 'local', 'cos-equiv-class', '', EMPTY_IDS, detail('local,head', () => ({local: 'substitution-universe' as const, head: c.id})));
                if (f.head && f.head.kind !== 'builtin') add(c, 'local', 'e-props-correct.4', 'head', array(b, f.head.target),
                    detail('local,head', () => ({local: 'affiliation' as const, head: f.head!.kind === 'builtin' ? undefined : f.head!.target})));
            }
            valueOperand(c, f.value, 'value');
            readFields(b, 2); const constraintCount = f.identityConstraints.length;
            for (let i = 0; i < constraintCount; i++) {readFields(b, 2); add(c, 'declarations', 'identity-constraint', indexedSlot(b, 'identityConstraints', i));}
        } else if (f.kind === 'attribute') {
            add(c, 'declarations', 'a-props-correct', 'type', array(b, refId(access, f.type))); valueOperand(c, f.value, 'value');
        } else if (f.kind === 'attributeUse') {
            add(c, 'attributes', 'AU01:use-constraints', 'declaration', array(b, refId(access, f.declaration))); valueOperand(c, f.value, 'value');
        } else if (f.kind === 'particle') {
            add(c, 'particle-restriction', 'particle-component-constraints');
            if (f.wildcard) add(c, 'particle-restriction', 'particle-wildcard-constraints', 'wildcard', EMPTY_IDS,
                detail('wildcard,source', () => ({wildcard: f.wildcard, source: f.wildcard!.source})));
        } else if (f.kind === 'group') {
            add(c, 'particle-restriction', 'group-component-constraints', 'root', array(b, f.root));
            add(c, 'attribution', 'cos-nonambig'); add(c, 'declarations', 'cos-element-consistent');
        } else {
            add(c, 'attributes', 'AU01:attribute-group-constraints', 'uses', ids(access, uses(access, c)));
            if (f.wildcard) add(c, 'attributes', 'attribute-group-wildcard-constraints', 'wildcard', EMPTY_IDS,
                detail('wildcard,source', () => ({wildcard: f.wildcard, source: f.wildcard!.source})));
        }
        b.chargeWork(originalEndpoint && c.id === access.candidate.endpoint ? 3 : 2);
        const sourceComponents = originalEndpoint && c.id === access.candidate.endpoint ? [c, originalEndpoint] : [c];
        for (const sourceComponent of sourceComponents) {
        readFields(b, 8);
        const sourcePrefix = sourceComponent === c ? 'sourceUses' : 'original/sourceUses';
        const sourceUses = sourceComponent.sourceUses, sourceUseCount = sourceUses.length;
        for (let i = 0; i < sourceUseCount; i++) {
            readFields(b, 40); const sourceUse = sourceUses[i]!, slot = indexedSlot(b, sourcePrefix, i);
            const sourceDetail = detail('sourceUse,source,sourceComponent', () => ({sourceUse, source: sourceUse.source, sourceComponent}));
            if (sourceUse.kind === 'admitted') {
                add(c, 'attributes', 'AU01:original-source-admission', slot, array(b, sourceUse.use), sourceDetail);
                valueOperand(c, sourceUse.ownValue, slot);
                if (f.kind === 'type' && f.method === 'restriction' && c.id !== access.candidate.endpoint) {
                    const replacement = component(access, sourceUse.use), name = useName(access, replacement);
                    const originals = matching(access, uses(access, target(access, f.base)), name);
                    const match = detail('role,name,originals,replacements,sourceUse', () => ({role: 'replace' as const, name, originals,
                        replacements: array(b, replacement), sourceUse}));
                    pair(c, match, slot);
                    if (originals.length === 0) add(c, 'attributes', 'AU01:new-name-wildcard-admission', slot,
                        array(b, replacement.id), detail('match,sourceUse,source', () => ({match, ...sourceDetail})));
                }
            } else {
                const representationChecks = sourceUse.representationChecks, representationCount = representationChecks.length;
                for (let j = 0; j < representationCount; j++) {
                    readFields(b, 2);
                    b.chargeWork(2 * (slot.length + '/representationChecks'.length));
                    add(c, 'attributes', representationChecks[j]!, indexedSlot(b, `${slot}/representationChecks`, j), EMPTY_IDS, sourceDetail);
                }
                // Always retain source legality even when the supplied representation list is empty.
                add(c, 'attributes', 'src-attribute-prohibition', slot, EMPTY_IDS, sourceDetail);
                if (sourceUse.kind === 'reference-prohibition') add(c, 'declarations', 'prohibited-reference-declaration-legality', slot,
                    array(b, refId(access, sourceUse.declaration)), sourceDetail);
                if (sourceUse.role === 'direct-prohibition' && f.kind === 'type' && f.method === 'restriction' && c.id !== access.candidate.endpoint) {
                    let name: Name;
                    if (sourceUse.kind === 'local-prohibition') name = sourceUse.name;
                    else {
                        if (sourceUse.declaration.kind === 'builtin') return access.fail('wrong-prohibition-target', 'src-attribute', c.id);
                        const d = component(access, sourceUse.declaration.target);
                        if (d.facts.kind !== 'attribute') return access.fail('wrong-prohibition-target', 'src-attribute', c.id);
                        name = d.facts.name;
                    }
                    const match = detail('role,name,originals,replacements,sourceUse', () => ({role: 'prohibit' as const, name,
                        originals: matching(access, uses(access, target(access, f.base)), name),
                        replacements: matching(access, uses(access, c), name), sourceUse}));
                    add(c, 'local', 'AU01:prohibit-no-required-original', slot, ids(access, match.originals), matchDetails(match, 'prohibit'));
                }
            }
        }
        const groupPrefix = sourceComponent === c ? 'sourceGroups' : 'original/sourceGroups';
        const sourceGroups = sourceComponent.sourceGroups, sourceGroupCount = sourceGroups.length;
        for (let i = 0; i < sourceGroupCount; i++) {
            readFields(b, 12); const sourceGroup = sourceGroups[i]!;
            add(c, 'attributes', 'src-attribute_group', indexedSlot(b, groupPrefix, i), array(b, refId(access, sourceGroup.reference)),
                detail('sourceGroup,source,sourceComponent', () => ({sourceGroup, source: sourceGroup.source, sourceComponent})));
        }
        const unsupportedPrefix = sourceComponent === c ? 'unassessed' : 'original/unassessed';
        const unassessed = sourceComponent.unassessed, unsupportedCount = unassessed.length;
        for (let i = 0; i < unsupportedCount; i++) {
            readFields(b, 16); const unsupported = unassessed[i]!;
            const adapter: Adapter = f.kind === 'type' ? 'type-construction'
                : f.kind === 'particle' || f.kind === 'group' ? 'particle-restriction'
                    : f.kind === 'element' || f.kind === 'attribute' ? 'declarations' : 'attributes';
            add(c, adapter, unsupported.rule, indexedSlot(b, unsupportedPrefix, i), EMPTY_IDS,
                detail('unsupported,owner,source,sourceComponent', () => ({unsupported, owner: unsupported.owner, source: unsupported.source, sourceComponent})));
        }
        }
    }
    readFields(b, 8);
    const endpoint = component(access, access.candidate.endpoint), intermediate = component(access, access.candidate.intermediate);
    const baseUses = uses(access, intermediate), endUses = uses(access, endpoint);
    const actions = b.sorted(access.candidate.attributes, (a, z) => {readFields(b, 8); return b.compareText(a.name.namespace, z.name.namespace) || b.compareText(a.name.local, z.name.local);});
    for (let i = 0; i < actions.length; i++) {
        readFields(b, 32); const action = actions[i]!, slot = indexedSlot(b, 'attributes', i);
        const originals = matching(access, baseUses, action.name), replacements = matching(access, endUses, action.name);
        const match = detail('role,name,originals,replacements,action', () => ({role: action.role, name: action.name, originals, replacements, action}));
        if (action.role === 'retain') add(endpoint, 'local', 'AU01:retain-original-identities', slot,
            ids(access, originals), matchDetails(match, 'retain'));
        else if (action.role === 'prohibit') add(endpoint, 'local', 'AU01:prohibit-no-required-original', slot,
            ids(access, originals), matchDetails(match, 'prohibit'));
        else {
            add(endpoint, 'local', 'AU01:replace-listed-endpoint-set', slot, ids(access, replacements), matchDetails(match, 'replace-set'));
            pair(endpoint, match, slot);
            if (originals.length === 0) add(endpoint, 'attributes', 'AU01:new-name-wildcard-admission', slot,
                ids(access, replacements), detail('match', () => ({match})));
        }
    }
    return b.sorted(output, (a, z) => {readFields(b, 8); return b.compareText(a.component, z.component) || b.compareText(a.rule, z.rule)
        || compareOperands(access, a.operands, z.operands) || compareSlots(b, a.slot, z.slot);});
}
function compareOperands(access: ContextAccess, a: readonly Id[], b: readonly Id[]): number {
    const budget = access.budget;
    readFields(budget, 2); const length = a.length, otherLength = b.length;
    for (let i = 0; i < length && i < otherLength; i++) {budget.chargeWork(2); const order = budget.compareText(a[i]!, b[i]!); if (order) return order;}
    budget.chargeWork(2); return length - otherLength;
}
export function enumerateValidationObligations(context: Context, actualContext?: Context): Result<readonly ValidationObligation[]> {
    return withContext(context, access => {
        readFields(access.budget, 1);
        if (context.kind !== 'proposed') return access.fail('requires-proposed-context', 'validation-inventory');
        return access.budget.freeze(access.budget.snapshot(inventory(access, context, actualContext)));
    });
}
function localCheck(context: Context, obligation: ValidationObligation): Result<PredicateReceipt> {
    return withContext(context, access => {
        const b = access.budget;
        // Local relation/AU-role branch has at most 64 fixed operand reads.
        readFields(b, 64); const c = component(access, obligation.component), match = obligation.match;
        if (obligation.local === 'immediate-final') propagate(access, checkImmediateTypeFinal(context, refFor(access, c)));
        else if (obligation.local === 'affiliation') {
            recordWork(b, 'mode'); propagate(access, checkSubstitution(context, c.id, obligation.head!, {mode: 'affiliation'}));
        } else if (obligation.local === 'substitution-universe') propagate(access, effectiveSubstitutionMembers(context, c.id));
        else {
            if (!match) return access.fail('missing-attribute-role-operands', obligation.rule, c.id);
            const originals = ids(access, match.originals), replacements = ids(access, match.replacements);
            let pass = true;
            switch (obligation.local) {
                case 'retain': pass = equalIds(access, originals, replacements); break;
                case 'replace-set': {
                    if (match.action?.role !== 'replace') {pass = false; break;}
                    const listed = b.sorted(match.action.uses, (a, z) => b.compareText(a, z));
                    pass = replacements.length > 0 && equalIds(access, listed, replacements); break;
                }
                case 'prohibit':
                    pass = replacements.length === 0;
                    for (const use of match.originals) {readFields(b, 6); if (use.facts.kind === 'attributeUse' && use.facts.required) pass = false;}
                    break;
                case 'requiredness': {
                    const old = match.originals[0]!.facts, fresh = match.replacements[0]!.facts;
                    b.chargeWork(4); pass = old.kind === 'attributeUse' && fresh.kind === 'attributeUse' && (!old.required || fresh.required); break;
                }
                case 'original-type': {
                    const old = declaration(access, match.originals[0]!), fresh = declaration(access, match.replacements[0]!);
                    if (old.facts.kind !== 'attribute' || fresh.facts.kind !== 'attribute') return access.fail('wrong-declaration-kind', obligation.rule, c.id);
                    // Dated structures.xml 4137-4140: TypeDerivationOK(Simple), given the empty set.
                    propagate(access, checkTypeDerivation(context, fresh.facts.type, old.facts.type, EMPTY_METHODS));
                    break;
                }
                case 'fixed-kind': pass = effectiveValue(access, match.replacements[0]!)?.kind === 'fixed'; break;
                case 'extension-uses':
                    for (const old of originals) {
                        b.chargeWork(2);
                        let found = false;
                        for (const fresh of replacements) {b.chargeWork(2); if (b.compareText(old, fresh) === 0) found = true;}
                        if (!found) pass = false;
                    }
                    break;
                default: return access.fail('unknown-local-obligation', obligation.rule, c.id);
            }
            if (!pass) return access.fail('attribute-role-failed', obligation.rule, c.id, obligation.slot, obligation.source, 'candidate-rejected');
        }
        return ownReceipt(access, context, obligation,
            obligation.local === 'immediate-final' || obligation.local === 'affiliation' || obligation.local === 'substitution-universe' || obligation.local === 'original-type'
                ? 'RE01-dated-relation-rules-v1' : ROLE_AUTHORITY);
    });
}
function assess(context: Context, obligation: ValidationObligation, owners: ValidationOwners, actualContext?: Context): Result<PredicateReceipt> {
    return withContext(context, access => {
        readFields(access.budget, 2);
        switch (obligation.adapter) {
            case 'type-construction': return propagate(access, checkTypeConstruction(context, obligation, owners.typeConstruction, actualContext));
            case 'attributes': return propagate(access, checkAttributes(context, obligation, owners.attributes, actualContext));
            case 'particle-restriction': return propagate(access, checkParticleRestriction(context, obligation, owners.particleRestriction, actualContext));
            case 'attribution': return propagate(access, checkAttribution(context, obligation, owners.attribution, actualContext));
            case 'declarations': return propagate(access, checkDeclarations(context, obligation, owners.declarations, actualContext));
            case 'scalar-operands': return propagate(access, checkScalarOperands(context, obligation, owners.scalarOperands, actualContext));
            case 'local': return propagate(access, localCheck(context, obligation));
        }
    });
}
export function assessValidationObligations(context: Context, owners: ValidationOwners = NO_OWNERS, actualContext?: Context): Result<ValidationLedger> {
    return withContext(context, access => {
        readFields(access.budget, 6);
        if (context.kind !== 'proposed') return access.fail('requires-proposed-context', 'validation-inventory');
        const obligations = inventory(access, context, actualContext), b = access.budget;
        b.chargeWork(); const assessments: ObligationAssessment[] = [];
        for (const obligation of obligations) {
            readFields(b, 10);
            const result = assess(context, obligation, owners, actualContext);
            if (result.kind === 'resource-limit') {b.chargeWork(); return access.fail('foreign-resource-result', obligation.rule, obligation.component, undefined, undefined, 'unresolved');}
            recordWork(b, result.kind === 'ok' ? 'kind,value' : 'kind,diagnostic');
            const assessment = result.kind === 'ok' ? {kind: 'ok' as const, value: result.value} : {kind: result.kind, diagnostic: result.diagnostic};
            recordWork(b, 'obligation,result'); b.chargeWork(); assessments.push({obligation, result: assessment});
        }
        recordWork(b, 'context,members,excludedIncoming,assessments');
        return b.freeze(b.snapshot({context: context.key, members: context.members, excludedIncoming: context.excludedIncoming, assessments}));
    });
}
export function checkCandidate(prepared: Prepared, certificate: Correspondence,
    owners: ValidationOwners = NO_OWNERS): Result<CheckedCandidateReceipt> {
    // As in compareEndpoint, fixed factory-entry authentication can run without
    // a usable request; all operations after the issued handle are charged.
    const actualDescriptor = prepared && typeof prepared === 'object' ? Object.getOwnPropertyDescriptor(prepared, 'actual') : undefined;
    const actualHandle = actualDescriptor && 'value' in actualDescriptor ? actualDescriptor.value as Context : undefined;
    const outer = withContext(actualHandle!, initial => {
    readFields(initial.budget, 6);
    if (!samePreparedRequest(prepared, initial.budget)) return initial.fail('invalid-prepared-contexts', 'factory-context');
    const comparison = compareEndpoint(prepared, certificate);
    readFields(initial.budget, 3);
    if (comparison.kind !== 'ok') return comparison;
    const assessed = assessValidationObligations(prepared.proposed, owners, prepared.actual);
    readFields(initial.budget, 3);
    if (assessed.kind !== 'ok') return assessed;
    return withContext(prepared.proposed, access => {
        const b = access.budget;
        readFields(b, 16);
        b.chargeWork(2); const receipts: PredicateReceipt[] = [], authorities: string[] = [];
        let rejected: Exclude<ObligationAssessment['result'], {kind: 'ok'}> | undefined;
        let unresolved: typeof rejected;
        for (const item of assessed.value.assessments) {
            readFields(b, 10); b.chargeWork(2); const result = item.result;
            if (result.kind === 'ok') {
                b.chargeWork(); receipts.push(result.value);
                let included = false;
                for (const authority of authorities) {readFields(b, 3); if (b.compareText(authority, result.value.authority) === 0) included = true;}
                if (!included) {b.chargeWork(); authorities.push(result.value.authority);}
            } else if (result.kind === 'candidate-rejected' || result.kind === 'input-error') rejected ??= result;
            else unresolved ??= result;
        }
        const failure = rejected ?? unresolved;
        readFields(b, 16);
        if (failure) return access.fail(failure.diagnostic.code, failure.diagnostic.rule, failure.diagnostic.component,
            failure.diagnostic.slot, failure.diagnostic.source, failure.kind);
        recordWork(b, 'kind,context,scope,exclusions,members,excludedIncoming,correspondence,obligations,authorities');
        const receipt: CheckedCandidateReceipt = {kind: 'checked-candidate', context: prepared.proposed.key,
            scope: 'listed-component-schema-under-qualified-predicates', exclusions: EXCLUSIONS,
            members: prepared.proposed.members, excludedIncoming: prepared.proposed.excludedIncoming,
            correspondence: comparison.value, obligations: receipts,
            authorities: b.sorted(authorities, (a, z) => b.compareText(a, z))};
        return b.freeze(b.snapshot(receipt));
    });
    });
    return outer.kind === 'ok' ? outer.value : outer;
}
