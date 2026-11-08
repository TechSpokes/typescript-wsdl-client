/** Bounded AU01 research; selected C1 and source replacement scope, no production activation. */
export type FailureCategory = 'invalid-schema' | 'invalid-value' | 'unsupported-capability' | 'resource-limit';
export class ProbeFailure extends Error {
    constructor(readonly category: FailureCategory, readonly rule: string) { super(category + ': ' + rule); }
}
export class Budget {
    work = 0;
    constructor(readonly maxNodes = 100000, readonly maxWork = 1000000) {
        if (![maxNodes, maxWork].every(n => Number.isSafeInteger(n) && n > 0))
            throw new RangeError('positive safe-integer limits required');
    }
    charge(count = 1): void {
        if (!Number.isSafeInteger(count) || count < 0 || count > this.maxWork - this.work)
            throw new ProbeFailure('resource-limit', 'semantic-work');
        this.work += count;
    }
    nodes(count: number): void { if (count > this.maxNodes)
        throw new ProbeFailure('resource-limit', 'semantic-nodes'); }
}
export type Name = readonly [
    string,
    string
];
export class Operand {
    constructor(readonly type: string, readonly lexical: string, readonly namespaces: readonly Name[] = [], readonly members: readonly string[] = [], readonly source = 'independent-case') { }
}
export interface UseOptions {
    readonly required?: boolean;
    readonly kind?: 'none' | 'default' | 'fixed';
    readonly operand?: Operand;
    readonly source?: string;
    readonly idDerived?: boolean;
    readonly constraintOrigin?: 'use' | 'declaration';
    readonly scalarType?: string;
}
export class Use {
    readonly required: boolean;
    readonly kind: 'none' | 'default' | 'fixed';
    readonly operand?: Operand;
    readonly source: string;
    readonly idDerived: boolean;
    readonly constraintOrigin: 'use' | 'declaration';
    readonly scalarType: string;
    constructor(readonly identity: string, readonly declaration: string, readonly name: Name, options: UseOptions = {}) {
        this.required = options.required ?? false;
        this.kind = options.kind ?? 'none';
        this.operand = options.operand;
        this.source = options.source ?? 'independent-case';
        this.idDerived = options.idDerived ?? false;
        this.constraintOrigin = options.constraintOrigin ?? 'use';
        this.scalarType = options.scalarType ?? 'integer';
    }
}
export type Value = string | readonly Value[];
// Text work is UTF-16 code units. This is conservative for non-BMP characters; ASCII counts are preserved.
export function value(operand: Operand, budget: Budget): Value {
    const raw = operand.lexical;
    budget.charge(raw.length + operand.namespaces.length + operand.members.length + 1);
    for (const [prefix, namespace] of operand.namespaces)
        budget.charge(prefix.length + namespace.length);
    for (const member of operand.members)
        budget.charge(member.length);
    budget.charge(2 * raw.length);
    const collapsed = raw.replace(/[ \t\r\n]+/g, ' ').replace(/^ +| +$/g, '');
    if (operand.type === 'integer') {
        if (!/^[+-]?[0-9]+$/.test(collapsed))
            throw new ProbeFailure('invalid-schema', 'integer-operand');
        budget.charge(2 * collapsed.length);
        const digits = collapsed.replace(/^[+-]/, '').replace(/^0+/, '') || '0';
        return ['decimal', (collapsed.startsWith('-') && digits !== '0' ? '-' : '') + digits];
    }
    if (operand.type === 'string')
        return ['string', raw];
    if (operand.type === 'token')
        return ['string', collapsed];
    if (operand.type === 'QName') {
        if (!/^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?$/.test(collapsed))
            throw new ProbeFailure('unsupported-capability', 'probe-QName-domain');
        budget.charge(collapsed.length + operand.namespaces.length);
        const parts = collapsed.split(':'), prefix = parts.length === 2 ? parts[0] : '', local = parts.length === 2 ? parts[1] : parts[0];
        const binding = operand.namespaces.find(([key]) => key === prefix)?.[1];
        if (binding === undefined && prefix)
            throw new ProbeFailure('invalid-schema', 'unbound-operand-prefix');
        return ['QName', [binding ?? '', local]];
    }
    if (operand.type === 'list') {
        if (operand.members.length !== 1 || ['list', 'union'].includes(operand.members[0]))
            throw new ProbeFailure('unsupported-capability', 'probe-list-domain');
        budget.charge(collapsed.length);
        const tokens = collapsed ? collapsed.split(' ') : [];
        budget.charge(2 * tokens.length);
        const items: Value[] = [];
        for (const token of tokens) {
            budget.charge();
            items.push(value(new Operand(operand.members[0], token, operand.namespaces, [], operand.source), budget));
        }
        return ['list', items];
    }
    if (operand.type === 'union') {
        for (const member of operand.members) {
            budget.charge();
            if (['list', 'union'].includes(member))
                throw new ProbeFailure('unsupported-capability', 'probe-union-domain');
            try {
                return value(new Operand(member, raw, operand.namespaces, [], operand.source), budget);
            }
            catch (error) {
                if (!(error instanceof ProbeFailure) || error.category !== 'invalid-schema')
                    throw error;
            }
        }
        throw new ProbeFailure('invalid-schema', 'no-union-member');
    }
    throw new ProbeFailure('unsupported-capability', 'probe-scalar-domain');
}
function chargeValue(parsed: Value, budget: Budget): void {
    budget.charge();
    budget.charge(parsed.length);
    if (typeof parsed !== 'string')
        for (const member of parsed)
            chargeValue(member, budget);
}
function equalValue(a: Value, b: Value): boolean {
    if (typeof a === 'string' || typeof b === 'string')
        return a === b;
    return a.length === b.length && a.every((member, i) => equalValue(member, b[i]));
}
export function sameValue(a: Operand, b: Operand, budget: Budget): boolean {
    const x = value(a, budget), y = value(b, budget);
    chargeValue(x, budget);
    chargeValue(y, budget);
    return equalValue(x, y);
}
const sameName = (a: Name, b: Name) => a[0] === b[0] && a[1] === b[1];
const nameKey = (name: Name) => JSON.stringify(name); // Structural QName identity, never object equality.
export function unionUses(uses: readonly Use[], container: 'complexType' | 'attributeGroup', budget: Budget): readonly Use[] {
    if (container !== 'complexType' && container !== 'attributeGroup')
        throw new RangeError('container kind');
    budget.nodes(uses.length);
    budget.charge(uses.length + 3);
    const identities = new Map<string, Use>(), names = new Map<string, Use>(), idMembers = new Set<string>();
    for (const use of uses) {
        budget.charge(1 + use.identity.length + use.declaration.length + use.name[0].length + use.name[1].length);
        const priorIdentity = identities.get(use.identity);
        if (priorIdentity) {
            budget.charge();
            if (priorIdentity !== use)
                throw new ProbeFailure('invalid-schema', 'inconsistent-AU-identity');
            continue;
        }
        const key = nameKey(use.name), prior = names.get(key);
        if (prior && (container === 'attributeGroup' || prior.declaration !== use.declaration))
            throw new ProbeFailure('invalid-schema', container === 'attributeGroup' ? 'ag-props-correct' : 'ct-props-correct');
        if (use.idDerived) {
            budget.charge();
            idMembers.add(container === 'attributeGroup' ? use.identity : use.declaration);
            if (idMembers.size > 1)
                throw new ProbeFailure('invalid-schema', 'multiple-ID-members');
        }
        budget.charge(2);
        identities.set(use.identity, use);
        names.set(key, use);
    }
    budget.charge(identities.size);
    return [...identities.values()];
}
export interface Summary {
    readonly status: 'conditional-C';
    readonly required: boolean;
    readonly present: Value;
    readonly absent: Value;
    readonly proposedC1Absent: 'invalid-value' | 'accepted';
    readonly originals: readonly Use[];
}
export function conditionalConstraints(uses: readonly Use[], budget: Budget): Summary {
    const originals = unionUses(uses, 'complexType', budget);
    budget.charge(2);
    let required = false;
    const fixed: Value[] = [], candidates: Value[] = [];
    for (const use of originals) {
        budget.charge(1 + use.name[0].length + use.name[1].length + use.declaration.length);
        if (!sameName(use.name, originals[0].name) || use.declaration !== originals[0].declaration)
            throw new RangeError('candidate requires one QName/declaration class');
        required ||= use.required;
        if (!['none', 'default', 'fixed'].includes(use.kind))
            throw new RangeError('source-mapped effective constraint kind');
        if (use.kind === 'default' && use.required && use.constraintOrigin === 'use')
            throw new ProbeFailure('invalid-schema', 'src-attribute');
        if (use.kind !== 'none') {
            if (!use.operand)
                throw new RangeError('constraint operand required');
            const parsed = value(use.operand, budget);
            budget.charge();
            if (!use.required)
                candidates.push(parsed);
            if (use.kind === 'fixed') {
                budget.charge();
                fixed.push(parsed);
            }
        }
    }
    for (const parsed of candidates)
        chargeValue(parsed, budget);
    for (const parsed of fixed)
        chargeValue(parsed, budget);
    const conflict = candidates.some(v => !equalValue(v, candidates[0])), impossiblePresent = fixed.some(v => !equalValue(v, fixed[0]));
    budget.charge(6);
    return { status: 'conditional-C', required, present: impossiblePresent ? 'none' : fixed[0] ?? 'type-space', absent: required ? 'reject-required' : conflict ? 'augmentation-conflict' : candidates[0] ?? 'absent', proposedC1Absent: required || conflict ? 'invalid-value' : 'accepted', originals };
}
export function conditionalC1Augmentation(uses: readonly Use[], budget: Budget) {
    const summary = conditionalConstraints(uses, budget);
    if (summary.proposedC1Absent === 'invalid-value')
        throw new ProbeFailure('invalid-value', 'conditional-C1-absent');
    if (summary.absent === 'absent')
        return null;
    for (const original of summary.originals) {
        budget.charge();
        if (!original.required && original.kind !== 'none') {
            budget.charge(7);
            return { status: 'conditional-C1' as const, name: original.name, declaration: original.declaration, scalarType: original.scalarType, value: summary.absent, admittedWitness: original.operand!, contributingUses: summary.originals };
        }
    }
    throw new Error('augmentation requires an original optional operand');
}
function scalarDerives(derived: string, base: string, budget: Budget): boolean {
    budget.charge(1 + derived.length + base.length);
    if (derived === base)
        return true;
    budget.charge(6);
    const parents: Record<string, string> = { token: 'normalizedString', normalizedString: 'string', string: 'anySimpleType', integer: 'decimal', decimal: 'anySimpleType', QName: 'anySimpleType' };
    if (!(derived in parents) && derived !== 'anySimpleType')
        throw new ProbeFailure('unsupported-capability', 'probe-type-derivation-domain');
    let current = derived;
    while (current in parents) {
        budget.charge(1 + current.length + base.length);
        current = parents[current];
        if (current === base)
            return true;
    }
    return false;
}
export interface RestrictionOptions {
    readonly directProhibitions?: readonly Name[];
    readonly wildcardNamespaces?: readonly string[];
}
function restrictionAttributes(baseUses: readonly Use[], localUses: readonly Use[], budget: Budget, options: RestrictionOptions, includeInherited: boolean) {
    const { directProhibitions = [], wildcardNamespaces = [] } = options;
    budget.nodes(baseUses.length + localUses.length + directProhibitions.length);
    const bases = unionUses(baseUses, 'complexType', budget), locals = unionUses(localUses, 'complexType', budget);
    budget.charge(2);
    const byName = new Map<string, Use[]>(), replaced = new Set<string>();
    for (const original of bases) {
        budget.charge(1 + original.name[0].length + original.name[1].length);
        const key = nameKey(original.name);
        if (!byName.has(key)) {
            budget.charge(2);
            byName.set(key, []);
        }
        budget.charge();
        byName.get(key)!.push(original);
    }
    for (const original of locals) {
        budget.charge(1 + original.name[0].length + original.name[1].length);
        replaced.add(nameKey(original.name));
    }
    for (const name of directProhibitions) {
        budget.charge(1 + name[0].length + name[1].length);
        replaced.add(nameKey(name));
    }
    budget.charge(1 + locals.length);
    const effectiveList = [...locals];
    for (const original of bases) {
        budget.charge(1 + original.name[0].length + original.name[1].length);
        if (!replaced.has(nameKey(original.name))) {
            budget.charge();
            effectiveList.push(original);
        }
    }
    budget.charge(effectiveList.length);
    const effective = unionUses([...effectiveList], 'complexType', budget);
    for (const originals of [bases, locals])
        for (const original of originals) {
            budget.charge();
            if (original.kind === 'default' && original.required && original.constraintOrigin === 'use')
                throw new ProbeFailure('invalid-schema', 'src-attribute');
            if (original.kind !== 'none') {
                if (!original.operand)
                    throw new RangeError('constraint operand required');
                value(original.operand, budget);
            }
        }
    let pairCount = 0;
    for (const derived of includeInherited ? effective : locals) {
        budget.charge(1 + derived.name[0].length + derived.name[1].length);
        const matches = byName.get(nameKey(derived.name)) ?? [];
        if (!matches.length) {
            let allowed = false;
            for (const namespace of wildcardNamespaces) {
                budget.charge(1 + namespace.length + derived.name[0].length);
                if (namespace === '*' || namespace === derived.name[0])
                    allowed = true;
            }
            if (!allowed)
                throw new ProbeFailure('invalid-schema', 'restricted-new-attribute-wildcard');
        }
        for (const original of matches) {
            budget.charge();
            pairCount++;
            if (original.required && !derived.required)
                throw new ProbeFailure('invalid-schema', 'all-matches-requiredness');
            if (!scalarDerives(derived.scalarType, original.scalarType, budget))
                throw new ProbeFailure('invalid-schema', 'all-matches-original-type');
            if (original.kind === 'fixed' && (derived.kind !== 'fixed' || !sameValue(original.operand!, derived.operand!, budget)))
                throw new ProbeFailure('invalid-schema', 'all-matches-original-fixed');
        }
    }
    for (const original of bases) {
        budget.charge();
        if (original.required) {
            let found = false;
            for (const derived of effective) {
                budget.charge(1 + original.name[0].length + original.name[1].length + derived.name[0].length + derived.name[1].length);
                if (sameName(derived.name, original.name) && derived.required)
                    found = true;
            }
            if (!found)
                throw new ProbeFailure('invalid-schema', 'required-base-name-missing');
        }
    }
    budget.charge(4);
    return { status: includeInherited ? 'conditional-final-all-pairs' as const : 'conditional-replacement-all-matches' as const, effective, originalBases: bases, pairCount };
}
export const replacementRestrictionAttributes = (bases: readonly Use[], locals: readonly Use[], budget: Budget, options: RestrictionOptions = {}) => restrictionAttributes(bases, locals, budget, options, false);
export const literalRestrictionAttributes = (bases: readonly Use[], locals: readonly Use[], budget: Budget, options: RestrictionOptions = {}) => restrictionAttributes(bases, locals, budget, options, true);
