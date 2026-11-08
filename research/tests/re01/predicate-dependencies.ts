/** Declared property observations only: neither dependency sufficiency nor transfer. */
import {contextConstructionModel, samePreparedRequest, withContext} from './resolver-context.js';
import type {ContextAccess} from './resolver-context.js';
import type {Component, Context, Kind, Name, Prepared, Result} from './resolver-types.js';
import type {DependencyModel} from './derivation-dependencies.js';
import {RE01_DERIVATION_DOMAIN} from './derivation-domain.js';

export const DOMAIN_BOUNDARY_CONTRACT = RE01_DERIVATION_DOMAIN;
export const OBSERVATION_CONTRACT = 'RE01-predicate-observations-v2';
type ContextKind = Context['kind'];
type Universe = ContextKind | 'reserved-originals';
type Property = 'facts' | 'identity' | 'owns' | 'source' | 'sourceUses' | 'sourceGroups'
    | 'provenance' | 'unassessed' | 'raw-declared-content' | 'effective-content' | 'typed-operands';
export type DependencyDescriptor = Readonly<
    {kind: 'component-property'; context: ContextKind; component: string; property: Property} |
    {kind: 'global-name'; universe: Universe; role: Kind; name: Name} |
    {kind: 'global-enumeration'; universe: Universe; role: Kind} |
    {kind: 'reverse-affiliations'; context: ContextKind; head: string} |
    {kind: 'normalized-view'; context: ContextKind; component: string}
>;
export type DependencyObservationReceipt = Readonly<{
    contract: typeof OBSERVATION_CONTRACT;
    domainContract: typeof DOMAIN_BOUNDARY_CONTRACT | 'schema-preserving-experimental-v1';
    domainAcceptance: 'policy-accepted' | 'experimental'; model: DependencyModel;
    actualContext: string; proposedContext: string;
    qualification: 'declared-structural-observations-only';
    observations: readonly Readonly<{descriptor: DependencyDescriptor; value: unknown}>[];
}>;
const issued = new WeakMap<DependencyObservationReceipt, Readonly<{
    actual: Context; proposed: Context; model: DependencyModel;
}>>();
const PROPERTIES: readonly string[] = Object.freeze(['facts', 'identity', 'owns', 'source', 'sourceUses',
    'sourceGroups', 'provenance', 'unassessed', 'raw-declared-content', 'effective-content', 'typed-operands']);
const ROLES: readonly string[] = Object.freeze(['type', 'element', 'attribute', 'particle', 'attributeUse', 'group', 'attributeGroup']);

function selected(prepared: Prepared, model: DependencyModel,
    operation: (actual: ContextAccess, proposed: ContextAccess) => DependencyObservationReceipt): Result<DependencyObservationReceipt> {
    if (!samePreparedRequest(prepared)) return {kind: 'input-error',
        diagnostic: {code: 'invalid-prepared-contexts', rule: OBSERVATION_CONTRACT, context: '', related: []},
        usage: {nodes: 0, work: 0}};
    const outer = withContext(prepared.actual, actual => {
        const b = actual.budget;
        b.chargeWork(5);
        if ((model !== 'derivation' && model !== 'schema-preserving') ||
            contextConstructionModel(prepared.actual, b) !== model ||
            contextConstructionModel(prepared.proposed, b) !== model)
            return actual.fail('model-context-mismatch', OBSERVATION_CONTRACT);
        return withContext(prepared.proposed, proposed => operation(actual, proposed));
    });
    return outer.kind === 'ok' ? outer.value : outer;
}

function descriptor(value: unknown, access: ContextAccess): DependencyDescriptor {
    const b = access.budget;
    b.chargeWork(10);
    const fail = (): never => access.fail('invalid-dependency-descriptor', OBSERVATION_CONTRACT);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
    const v = value as Record<string, unknown>;
    const context = v['context'] === 'actual' || v['context'] === 'proposed';
    const component = typeof v['component'] === 'string' && v['component'].length > 0;
    let fields: readonly string[];
    switch (v['kind']) {
        case 'component-property':
            if (!context || !component || typeof v['property'] !== 'string') return fail();
            b.chargeWork(PROPERTIES.length);
            if (!PROPERTIES.includes(v['property'])) return fail();
            b.chargeWork(5); fields = ['kind', 'context', 'component', 'property']; break;
        case 'normalized-view':
            if (!context || !component) return fail();
            b.chargeWork(4); fields = ['kind', 'context', 'component']; break;
        case 'reverse-affiliations':
            if (!context || typeof v['head'] !== 'string' || !v['head']) return fail();
            b.chargeWork(4); fields = ['kind', 'context', 'head']; break;
        case 'global-name': case 'global-enumeration': {
            if (v['universe'] !== 'actual' && v['universe'] !== 'proposed' && v['universe'] !== 'reserved-originals') return fail();
            b.chargeWork(ROLES.length);
            if (typeof v['role'] !== 'string' || !ROLES.includes(v['role'])) return fail();
            if (v['kind'] === 'global-name') {
                const name = v['name'];
                if (!name || typeof name !== 'object' || Array.isArray(name)) return fail();
                const n = name as Record<string, unknown>;
                if (typeof n['namespace'] !== 'string' || typeof n['local'] !== 'string' || !n['local']) return fail();
                for (const key in n) { b.chargeWork(3 + key.length); if (key !== 'namespace' && key !== 'local') return fail(); }
                b.chargeWork(5); fields = ['kind', 'universe', 'role', 'name'];
            } else { b.chargeWork(4); fields = ['kind', 'universe', 'role']; }
            break;
        }
        default: return fail();
    }
    for (const key in v) {
        b.chargeWork(3 + key.length + fields.length);
        if (!fields.includes(key)) return fail();
    }
    return value as DependencyDescriptor;
}

/** Complete enumeration of the selected represented universe, not semantic lookup closure. */
function observe(prepared: Prepared, actual: ContextAccess, proposed: ContextAccess,
    d: DependencyDescriptor): unknown {
    const b = actual.budget;
    b.chargeWork(5);
    if (d.kind === 'global-name' || d.kind === 'global-enumeration') {
        const context = d.universe === 'proposed' ? prepared.proposed : prepared.actual;
        const access = d.universe === 'proposed' ? proposed : actual;
        b.chargeWork();
        const matches: Readonly<{id: string; identity: Component['identity']}>[] = [];
        for (const id of context.members) {
            b.chargeWork(5);
            const c = access.component(id)!;
            if (c.identity.kind !== 'global' || c.identity.role !== d.role) continue;
            if (d.kind === 'global-name' && (b.compareText(c.identity.name.namespace, d.name.namespace) !== 0 ||
                b.compareText(c.identity.name.local, d.name.local) !== 0)) continue;
            b.chargeWork(4);
            matches.push({id, identity: c.identity});
        }
        b.chargeWork(12);
        return {collection: matches, collectionCompleteness: 'selected-represented-universe',
            semanticLookup: 'unresolved'};
    }
    const access = d.context === 'actual' ? actual : proposed;
    const context = d.context === 'actual' ? prepared.actual : prepared.proposed;
    const id = d.kind === 'reverse-affiliations' ? d.head : d.component;
    const c = access.component(id);
    if (!c) return access.fail('outside-context', OBSERVATION_CONTRACT, id);
    if (d.kind === 'normalized-view') return access.fail('missing-normalized-view-authority',
        OBSERVATION_CONTRACT, id, undefined, c.source, 'unresolved');
    if (d.kind === 'reverse-affiliations') {
        if (c.facts.kind !== 'element' || c.identity.kind !== 'global')
            return access.fail('wrong-affiliation-head', OBSERVATION_CONTRACT, id);
        b.chargeWork();
        const members: Readonly<{id: string; facts: Component['facts']; identity: Component['identity']}>[] = [];
        for (const member of context.members) {
            b.chargeWork(7);
            const affiliate = access.component(member)!;
            const f = affiliate.facts;
            if (affiliate.identity.kind !== 'global' || f.kind !== 'element' || !f.head ||
                f.head.kind === 'builtin' || b.compareText(f.head.target, id) !== 0) continue;
            b.chargeWork(5); members.push({id: member, facts: f, identity: affiliate.identity});
        }
        b.chargeWork(8);
        return {members, scope: 'direct-declared-affiliations', effectiveMembership: 'unresolved'};
    }
    switch (d.property) {
        case 'raw-declared-content': case 'effective-content':
            if (c.facts.kind !== 'type') return access.fail('wrong-content-owner', OBSERVATION_CONTRACT, id);
            return d.property === 'raw-declared-content' ? c.facts.declaredContent : c.facts.content;
        case 'typed-operands':
            // Full facts retain lexical/type/facet values and every source namespace.
            b.chargeWork(5); return {facts: c.facts, source: c.source, sourceUses: c.sourceUses};
        default: return c[d.property];
    }
}

export function captureDependencyObservations(prepared: Prepared, model: DependencyModel,
    descriptors: readonly DependencyDescriptor[]): Result<DependencyObservationReceipt> {
    return selected(prepared, model, (actual, proposed) => {
        const b = actual.budget;
        b.chargeWork(2);
        if (!Array.isArray(descriptors)) return actual.fail('invalid-dependency-descriptors', OBSERVATION_CONTRACT);
        let supplied: readonly DependencyDescriptor[];
        try { supplied = b.snapshot(descriptors); }
        catch (error: unknown) {
            if (!(error instanceof TypeError)) throw error;
            return actual.fail('invalid-dependency-descriptors', OBSERVATION_CONTRACT);
        }
        b.chargeWork();
        const observations: {descriptor: DependencyDescriptor; value: unknown}[] = [];
        for (const value of supplied) {
            const d = descriptor(value, actual);
            const observed = observe(prepared, actual, proposed, d);
            b.chargeWork(4); observations.push({descriptor: d, value: observed});
        }
        b.chargeWork(500 + model.length + prepared.actual.key.length + prepared.proposed.key.length);
        const receipt = b.freeze(b.snapshot<DependencyObservationReceipt>({contract: OBSERVATION_CONTRACT,
            domainContract: model === 'derivation' ? DOMAIN_BOUNDARY_CONTRACT : 'schema-preserving-experimental-v1',
            domainAcceptance: model === 'derivation' ? 'policy-accepted' : 'experimental', model,
            actualContext: prepared.actual.key, proposedContext: prepared.proposed.key,
            qualification: 'declared-structural-observations-only', observations}));
        b.chargeWork(7);
        issued.set(receipt, {actual: prepared.actual, proposed: prepared.proposed, model});
        return receipt;
    });
}

/** Authentication only; does not assert the descriptor set is semantically sufficient. */
export function validateDependencyObservationReceipt(prepared: Prepared, model: DependencyModel,
    receipt: DependencyObservationReceipt): Result<DependencyObservationReceipt> {
    return selected(prepared, model, actual => {
        actual.budget.chargeWork(6);
        const binding = issued.get(receipt);
        if (!binding || binding.actual !== prepared.actual || binding.proposed !== prepared.proposed || binding.model !== model)
            return actual.fail('invalid-dependency-observation-receipt', OBSERVATION_CONTRACT);
        return receipt;
    });
}
