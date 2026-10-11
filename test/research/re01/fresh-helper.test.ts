import {describe, expect, it} from 'vitest';
import {Budget, Operand as AuOperand, ProbeFailure, replacementRestrictionAttributes, Use} from '../s06-au01/probe.js';
import {literalAttributeExtension} from './literal-attribute-extension.js';
import {freshHelperCase} from './fresh-helper-case.js';
import {prepareLiteralContexts, withContext} from './resolver-context.js';
import type {ContextAccess} from './resolver-context.js';
import type {ResolverBudget} from './resolver-budget.js';
import type {Context, Limits} from './resolver-types.js';

// Independently specified 2004 clauses: cos-ct-extends.1.2 compares declaration
// QName and exact scalar identity; derivation-ok-restriction.2.1.2 allows token
// restricting string; .2.1.3 compares every base fixed operand. These tests are
// pair/proposal evidence, not a complete component-validity or RE01 theorem.
type IntermediateUse = 'fresh' | 'ancestor' | 'endpoint';
function request(intermediateUse: IntermediateUse = 'fresh', freshRequired = false, endpointRequired = false) {
    return freshHelperCase('g', {intermediateUse, freshRequired, endpointRequired});
}

class SharedAuBudget extends Budget {
    constructor(private readonly shared: ResolverBudget) {super();}
    override charge(count = 1): void {this.shared.chargeWork(count);}
    override nodes(count: number): void {this.shared.reserveNodes(count);}
}

/** Test-only record projection. Expected verdicts never come from this adapter. */
function uses(access: ContextAccess, id: string): readonly Use[] {
    const component = access.component(id);
    if (component?.facts.kind !== 'type') throw new Error('Independent case requires a type');
    const projected: Use[] = [];
    access.budget.chargeWork(1);
    for (const useId of component.facts.attributeUses) {
        const use = access.component(useId);
        if (use?.facts.kind !== 'attributeUse' || use.facts.declaration.kind === 'builtin')
            throw new Error('Independent case requires identified uses');
        const declaration = access.component(use.facts.declaration.target);
        if (declaration?.facts.kind !== 'attribute' || declaration.facts.type.kind !== 'builtin'
            || !['string', 'token'].includes(declaration.facts.type.name.local))
            throw new Error('Independent case has only qualified string/token operands');
        const facts = use.facts;
        const constraint = facts.value ?? declaration.facts.value;
        let originalScalar: string | undefined;
        if (constraint) {
            if (constraint.operand.type.kind !== 'builtin'
                || !['string', 'token'].includes(constraint.operand.type.name.local))
                throw new Error('Independent fixed operand keeps its original builtin type');
            originalScalar = constraint.operand.type.name.local;
        }
        const scalar = declaration.facts.type.name.local;
        access.budget.chargeWork(20 + useId.length + declaration.id.length + declaration.facts.name.namespace.length
            + declaration.facts.name.local.length + scalar.length + (constraint?.operand.lexical.length ?? 0));
        const operand = constraint ? new AuOperand(originalScalar!, constraint.operand.lexical,
            Object.entries(constraint.operand.source.namespaces), [], constraint.operand.source.path) : undefined;
        projected.push(new Use(use.id, declaration.id, [declaration.facts.name.namespace, declaration.facts.name.local], {
            required: facts.required, scalarType: scalar, kind: constraint?.kind ?? 'none', operand,
            source: use.source.path, constraintOrigin: facts.value ? 'use' : 'declaration',
        }));
    }
    return projected;
}
function checkPair(context: Context) {
    return withContext(context, access => {
        const ancestor = uses(access, 'A'), intermediate = uses(access, 'new/E'), endpoint = uses(access, 'D');
        const extension = literalAttributeExtension(ancestor, intermediate, access.budget);
        if (extension.kind === 'resource-limit') return extension;
        let restriction: 'admitted' | string = 'admitted';
        let effective: readonly string[] = [];
        try {
            const result = replacementRestrictionAttributes(intermediate, endpoint, new SharedAuBudget(access.budget));
            access.budget.chargeWork(1 + result.effective.length);
            effective = result.effective.map(use => use.identity);
        } catch (error) {
            if (!(error instanceof ProbeFailure)) throw error;
            restriction = error.rule;
        }
        return {kind: 'independent-pair-observation' as const, extension: extension.admitted, restriction, effective};
    });
}
function run(limits?: Limits) {
    const {input, candidate} = request();
    const prepared = prepareLiteralContexts(input, candidate, limits);
    if (prepared.kind !== 'ok') return {prepared, result: prepared};
    return {prepared, result: checkPair(prepared.value.proposed)};
}

describe('#234 independent fresh attribute helper counterexample', () => {
    it('admits fresh unconstrained string where neither original-use choice supplies the pair', () => {
        const {prepared, result} = run();
        expect(prepared.kind).toBe('ok');
        expect(result).toMatchObject({kind: 'ok', value: {kind: 'independent-pair-observation',
            extension: true, restriction: 'admitted', effective: ['D/u']}});
        // E's fresh string declaration satisfies the exact extension type; token
        // restricts string and E has no fixed 7 that could reject final fixed 8.
    });

    it.each([
        ['ancestor', true, 'all-matches-original-fixed'],
        ['endpoint', false, 'admitted'],
    ] as const)('keeps independently specified original %s obstruction', (choice, extension, restriction) => {
        const {input, candidate} = request(choice);
        const prepared = prepareLiteralContexts(input, candidate);
        expect(prepared.kind).toBe('ok');
        if (prepared.kind !== 'ok') throw new Error('Original-use proposal must be structurally prepared');
        expect(checkPair(prepared.value.proposed)).toMatchObject({kind: 'ok', value: {extension, restriction}});
        // Ancestor string fixed 7 passes extension but rejects token fixed 8;
        // endpoint token passes identity restriction but fails string extension.
    });

    it.each([
        [true, false, 'all-matches-requiredness'],
        [true, true, 'admitted'],
        [false, true, 'admitted'],
    ] as const)('checks requiredness separately: E=%s, D=%s', (freshRequired, endpointRequired, restriction) => {
        const {input, candidate} = request('fresh', freshRequired, endpointRequired);
        const prepared = prepareLiteralContexts(input, candidate);
        expect(prepared.kind).toBe('ok');
        if (prepared.kind !== 'ok') throw new Error('Requiredness variants must be prepared');
        expect(checkPair(prepared.value.proposed)).toMatchObject({kind: 'ok', value: {extension: true, restriction}});
    });

    it('keeps both original typed fixed operands and original local declaration owners', () => {
        const {input, candidate} = request();
        const before = JSON.stringify(input);
        const prepared = prepareLiteralContexts(input, candidate);
        expect(prepared.kind).toBe('ok');
        if (prepared.kind !== 'ok') throw new Error('Independent fresh proposal must prepare');
        const operands = withContext(prepared.value.actual, access => {
            const a = uses(access, 'A')[0]!, d = uses(access, 'D')[0]!;
            return {a: [a.identity, a.declaration, a.scalarType, a.operand?.type, a.operand?.lexical, a.operand?.source],
                d: [d.identity, d.declaration, d.scalarType, d.operand?.type, d.operand?.lexical, d.operand?.source]};
        });
        expect(operands).toMatchObject({kind: 'ok', value: {
            a: ['A/u', 'A/g', 'string', 'string', '7', '/A/fixed'],
            d: ['D/u', 'D/g', 'token', 'token', '8', '/D/fixed'],
        }});
        expect(checkPair(prepared.value.proposed)).toMatchObject({kind: 'ok', value: {extension: true, restriction: 'admitted'}});
        expect(JSON.stringify(input)).toBe(before);
        expect(input.components.find(component => component.id === 'A/g')?.identity)
            .toMatchObject({kind: 'local', owner: 'A'});
        expect(input.components.find(component => component.id === 'D/g')?.identity)
            .toMatchObject({kind: 'local', owner: 'D'});
    });

    it('shares preparation and both projections under inclusive sticky request limits', () => {
        const measured = run();
        expect(measured.result.kind).toBe('ok');
        const {work, nodes} = measured.result.usage;
        expect(run({maxWork: work, maxNodes: nodes}).result).toMatchObject({kind: 'ok', value: {
            extension: true, restriction: 'admitted', effective: ['D/u'],
        }});
        const limited = run({maxWork: work - 1});
        expect(limited.prepared.kind).toBe('ok');
        expect(limited.result.kind).toBe('resource-limit');
        if (limited.prepared.kind !== 'ok') throw new Error('Limit must exhaust after successful preparation');
        let entered = false;
        expect(withContext(limited.prepared.value.actual, () => {entered = true; return 'partial';}).kind)
            .toBe('resource-limit');
        expect(entered).toBe(false);
        expect(run({maxNodes: nodes - 1}).result.kind).toBe('resource-limit');
    });
});
