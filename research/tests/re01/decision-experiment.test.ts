import {describe, expect, it} from 'vitest';
import {createResolverBudget} from './resolver-budget.js';
import {constraints, directCriterion, enumerate, enumerateBatch, oldFamily} from './decision-experiment.js';
import type {Assignment, Requirements} from './decision-experiment.js';
import {prepareContexts} from './resolver-context.js';
import {checkSubstitution, checkTypeDerivation, effectiveSubstitutionMembers} from './resolver-relations.js';
import {checkCandidate} from './resolver-validation.js';
import {builtin, fixtureName, freezeLiteral, literalComponent, local, symbol, typeFacts} from './resolver-fixtures.js';
import type {Component, Prepared} from './resolver-types.js';
import {Budget as AuBudget, Operand, ProbeFailure, replacementRestrictionAttributes, unionUses, Use} from '../s06-au01/probe.js';

/** Independently prepared actual A<-T<-B<-D, with B blocking extension. */
function context(prefix: string, headAtAncestor: boolean, assignment: Assignment): Prepared {
    const id = (name: string) => prefix + name;
    const ref = (name: string) => symbol(id(name));
    const type = (name: string, base: string, method: 'extension' | 'restriction', block: readonly ('extension' | 'restriction')[] = []) =>
        literalComponent(id(name), {...typeFacts(ref(base), method), block});
    const a = literalComponent(id('A'), typeFacts());
    const t = type('T', 'A', 'extension');
    const b = type('B', 'T', 'restriction', ['extension']);
    const d = type('D', 'B', 'extension');
    const element = (name: string, typeName: string, head?: string): Component => literalComponent(id(name),
        {kind: 'element', name: fixtureName(id(name)), type: ref(typeName),
            nillable: false, abstract: false, final: [], block: [], identityConstraints: [],
            ...(head ? {head: symbol(id(head), 'element')} : {})});
    const h = element('H', headAtAncestor ? 'A' : 'T');
    const m = element('M', 'D', 'H');
    const input = freezeLiteral({key: id('actual'), components: [a, t, b, d, h, m]});
    const block: ('extension' | 'restriction')[] = [];
    if (assignment.block & 1) block.push('extension');
    if (assignment.block & 2) block.push('restriction');
    const fresh: Component = {...type('E', 'A', 'extension', block),
        identity: {kind: 'fresh', role: 'type', path: id('E')},
        provenance: {kind: 'constructed', originals: [id('A')]}};
    const intermediate = assignment.intermediate === 'original' ? 'T' : 'E';
    const endpointDefinition: Component = {...d, facts: typeFacts(intermediate === 'E' ? local(id('E')) : ref('T')),
        provenance: {kind: 'endpoint-replacement', originals: [id('D')]}};
    const result = prepareContexts(input, {key: id('candidate'), ancestor: ref('A'),
        intermediate: id(intermediate), endpoint: id('D'),
        retained: input.components.filter(component => assignment.affiliate || component.id !== id('M')).map(component => component.id),
        additions: intermediate === 'E' ? [fresh] : [], endpointDefinition, attributes: []}, {maxWork: 10_000_000});
    if (result.kind !== 'ok') throw new Error(`Preparation failed: ${JSON.stringify(result)}`);
    return result.value;
}

describe('#260 finite construction projections', () => {
    it.each(['left_', 'renamed_'])('blocks substitution without prohibiting affiliation under %s', prefix => {
        // Independently sourced cos-equiv-derived-ok-rec.2.3: D->E->A uses
        // restriction AND extension, so any nonempty E.block suppresses M.
        const expected = [true, false, false, false];
        for (let mask = 0; mask < 4; mask++) {
            const assignment: Assignment = {intermediate: 'fresh', block: mask, affiliate: true, choice: true};
            const prepared = context(prefix, true, assignment);
            expect(checkSubstitution(prepared.actual, prefix + 'M', prefix + 'H', {mode: 'affiliation'}).kind).toBe('ok');
            expect(checkSubstitution(prepared.actual, prefix + 'M', prefix + 'H', {mode: 'substitutability'}).kind).toBe('candidate-rejected');
            expect(checkSubstitution(prepared.proposed, prefix + 'M', prefix + 'H', {mode: 'affiliation'}).kind).toBe('ok');
            expect(checkSubstitution(prepared.proposed, prefix + 'M', prefix + 'H', {mode: 'substitutability'}).kind)
                .toBe(expected[mask] ? 'ok' : 'candidate-rejected');
            const members = effectiveSubstitutionMembers(prepared.proposed, prefix + 'H');
            expect(members.kind).toBe('ok');
            if (members.kind === 'ok') expect(members.value.members.includes(prefix + 'M')).toBe(expected[mask]);
            expect(constraints({projection: 'blocking', requireAffiliate: true, requireChoice: true}, assignment, createResolverBudget()).admitted)
                .toBe(!expected[mask]);
        }
    });

    it.each(['first_', 'other_'])('preserves anchored type identity and exposes joint impossibility under %s', prefix => {
        // NameAndTypeOK excludes extension/list/union. D restricting original
        // T reaches T immediately; a copy E extending A cannot reach T.
        // Original B's block suppressed M; bypassing B through T enables it.
        for (const intermediate of ['original', 'fresh'] as const) {
            const assignment: Assignment = {intermediate, block: 0, affiliate: true, choice: true};
            const prepared = context(prefix, false, assignment);
            const expected = intermediate === 'original';
            expect(checkSubstitution(prepared.actual, prefix + 'M', prefix + 'H', {mode: 'affiliation'}).kind).toBe('ok');
            expect(checkSubstitution(prepared.actual, prefix + 'M', prefix + 'H', {mode: 'substitutability'}).kind).toBe('candidate-rejected');
            expect(checkTypeDerivation(prepared.proposed, symbol(prefix + 'D'), symbol(prefix + 'T'), ['extension', 'list', 'union']).kind)
                .toBe(expected ? 'ok' : 'candidate-rejected');
            expect(checkSubstitution(prepared.proposed, prefix + 'M', prefix + 'H', {mode: 'affiliation'}).kind)
                .toBe(expected ? 'ok' : 'candidate-rejected');
            const verdict = constraints({projection: 'combined', requireAffiliate: true, requireChoice: true}, assignment, createResolverBudget());
            expect(verdict.ancestry).toBe(expected);
            expect(verdict.overlap).toBe(expected);
            expect(verdict.admitted).toBe(false);
        }
    });

    it('compares finite family, constraints and direct criteria in the identical declared domain', () => {
        for (const projection of ['blocking', 'identity', 'combined'] as const) {
            for (const requireAffiliate of [false, true]) for (const requireChoice of [false, true]) {
                const requirements = {projection, requireAffiliate, requireChoice};
                const result = enumerate(requirements);
                expect(result.kind).toBe('bounded-projection');
                if (result.kind !== 'bounded-projection') throw new Error('Unexpected limit');
                // Independent closed-form answers: a blocked fresh E is always
                // available for H:A; keeping C also requires M by closure.
                // An ancestry-only projection has no UPA obligation.
                const expected = projection !== 'combined' || !requireChoice;
                expect(result.admitted.length > 0).toBe(expected);
                expect(directCriterion(requirements)).toBe(expected);
                if (projection !== 'blocking') expect(result.admitted.some(oldFamily)).toBe(false);
                if (projection === 'blocking' && requireAffiliate && requireChoice) expect(result.admitted.some(oldFamily)).toBe(false);
            }
        }
    });

    it('retaining an affiliate enables a dispatch that outgoing-only pruning loses', () => {
        // Universe cardinality is a necessary dispatch input. The independent
        // anyType/string source case is exercised by the existing ambient
        // reference controls; these records certify only the universe change.
        for (const affiliate of [false, true]) {
            const prepared = context('dispatch_', true, {intermediate: 'original', block: 0, affiliate, choice: false});
            const members = effectiveSubstitutionMembers(prepared.proposed, 'dispatch_H');
            expect(members.kind).toBe('ok');
            if (members.kind === 'ok') expect(members.value.members.length > 1).toBe(affiliate);
        }
    });

    it('rechecks original simple-content ancestry after selecting anySimpleType', () => {
        const simple = {kind: 'simple' as const, type: builtin('string')};
        const a = literalComponent('SimpleA', {...typeFacts(builtin('string'), 'extension'), content: simple, declaredContent: simple});
        const d = literalComponent('SimpleD', {...typeFacts(symbol('SimpleA'), 'extension'), content: simple, declaredContent: simple});
        const h = literalComponent('SimpleH', {kind: 'element', name: fixtureName('SimpleH'), type: builtin('string'),
            nillable: false, abstract: false, final: [], block: [], identityConstraints: []});
        const m = literalComponent('SimpleM', {...h.facts, kind: 'element', name: fixtureName('SimpleM'), type: symbol('SimpleD'), head: symbol('SimpleH', 'element')} as Extract<Component['facts'], {kind: 'element'}>);
        const input = freezeLiteral({key: 'simple-actual', components: [a, d, h, m]});
        const intermediateSimple = {kind: 'simple' as const, type: builtin('anySimpleType')};
        const e: Component = {...literalComponent('SimpleE', {...typeFacts(builtin('anySimpleType'), 'extension'), content: intermediateSimple, declaredContent: intermediateSimple}),
            identity: {kind: 'fresh', role: 'type', path: 'simple-E'}, provenance: {kind: 'constructed', originals: ['SimpleA']}};
        const prepared = prepareContexts(input, {key: 'simple-proposed', ancestor: builtin('anySimpleType'), intermediate: 'SimpleE', endpoint: 'SimpleD',
            retained: ['SimpleA', 'SimpleD', 'SimpleH', 'SimpleM'], additions: [e], attributes: [],
            endpointDefinition: {...d, facts: {...d.facts, kind: 'type', base: local('SimpleE'), method: 'restriction'} as Extract<Component['facts'], {kind: 'type'}>,
                provenance: {kind: 'endpoint-replacement', originals: ['SimpleD']}}});
        expect(prepared.kind).toBe('ok');
        if (prepared.kind !== 'ok') throw new Error('Simple preparation failed');
        // Independently derived literal paths: actual D->A->string reaches
        // string; proposed D->E->anySimpleType does not. No scalar/facet or
        // simple-content formation authority is supplied by these queries.
        expect(checkSubstitution(prepared.value.actual, 'SimpleM', 'SimpleH', {mode: 'affiliation'}).kind).toBe('ok');
        expect(checkSubstitution(prepared.value.proposed, 'SimpleM', 'SimpleH', {mode: 'affiliation'}).kind).toBe('candidate-rejected');
    });

    it.each([
        ['integer', '+0007', '7', [], [], true],
        ['integer', '7', '8', [], [], false],
        ['QName', 'p:x', 'q:x', [['p', 'urn:shared']], [['q', 'urn:shared']], true],
        ['QName', 'p:x', 'p:x', [['p', 'urn:first']], [['p', 'urn:second']], false],
    ] as const)('preserves original %s fixed operands for %s versus %s', (kind, left, right, leftNamespaces, rightNamespaces, equivalent) => {
        const name = ['urn:comparison', 'constraint'] as const;
        const original = new Use('original-use', 'shared-declaration', name, {kind: 'fixed', scalarType: kind,
            operand: new Operand(kind, left, leftNamespaces)});
        const restored = new Use('restored-use', 'shared-declaration', name, {kind: 'fixed', scalarType: kind,
            operand: new Operand(kind, right, rightNamespaces)});
        // D1 retains the original AU through extension; source replacement
        // checks original typed values universally. Literal property matching
        // has the same declaration/type, but is not the D1 union theorem.
        expect(unionUses([original, restored], 'complexType', new AuBudget())).toContain(original);
        if (equivalent) expect(replacementRestrictionAttributes([original], [restored], new AuBudget()).effective).toContain(restored);
        else expect(() => replacementRestrictionAttributes([original], [restored], new AuBudget())).toThrowError(new ProbeFailure('invalid-schema', 'all-matches-original-fixed'));
        expect(replacementRestrictionAttributes([restored], [], new AuBudget()).effective).toContain(restored);
    });

    it('reports an invalid original fixed operand rather than a distinct valid value', () => {
        const name = ['urn:comparison', 'constraint'] as const;
        const original = new Use('original-use', 'shared-declaration', name, {kind: 'fixed', operand: new Operand('integer', 'invalid')});
        const restored = new Use('restored-use', 'shared-declaration', name, {kind: 'fixed', operand: new Operand('integer', '7')});
        expect(() => replacementRestrictionAttributes([original], [restored], new AuBudget())).toThrowError(new ProbeFailure('invalid-schema', 'integer-operand'));
    });

    it('keeps missing semantic qualification unresolved even when relational projections pass', () => {
        const prepared = context('qualification_', true, {intermediate: 'fresh', block: 3, affiliate: true, choice: true});
        const result = checkCandidate(prepared, {actualRoot: 'qualification_D', proposedRoot: 'qualification_D', pairs: [['qualification_D', 'qualification_D']]});
        expect(result.kind).toBe('unresolved');
        if (result.kind === 'unresolved') {
            expect(result.diagnostic.code).toBe('missing-qualified-authority');
            expect(result.diagnostic.source).toBeDefined();
        }
    });

    it('shares limits across finite runs and exposes no accumulated result after exhaustion', () => {
        const requirements: Requirements = {projection: 'blocking', requireAffiliate: true, requireChoice: true};
        const measured = enumerate(requirements);
        if (measured.kind !== 'bounded-projection') throw new Error('Measurement failed');
        // This is an observed full-run boundary, not a frozen helper cost oracle.
        expect(enumerate(requirements, createResolverBudget({maxWork: measured.work})).kind).toBe('bounded-projection');
        expect(enumerate(requirements, createResolverBudget({maxWork: measured.work - 1})).kind).toBe('resource-limit');
        const shared = createResolverBudget({maxWork: measured.work});
        expect(enumerate(requirements, shared).kind).toBe('bounded-projection');
        const exhausted = enumerate(requirements, shared);
        expect(exhausted.kind).toBe('resource-limit');
        expect(shared.usage().work).toBeLessThanOrEqual(measured.work);
        expect(enumerate(requirements, shared).kind).toBe('resource-limit');
    });

    it('latches exhaustion with positive remainder and publishes no partial comparison batch', () => {
        const requirements: Requirements = {projection: 'blocking', requireAffiliate: false, requireChoice: false};
        const measured = enumerate(requirements);
        if (measured.kind !== 'bounded-projection') throw new Error('Measurement failed');
        const short = createResolverBudget({maxWork: measured.work - 1});
        expect(enumerate(requirements, short).kind).toBe('resource-limit');
        expect(short.usage().work).toBeLessThan(measured.work - 1);
        const stopped = short.usage().work;
        expect(enumerate(requirements, short).kind).toBe('resource-limit');
        expect(short.usage().work).toBe(stopped);
        const batch = enumerateBatch([requirements, requirements]);
        if (batch.kind !== 'bounded-comparison') throw new Error('Batch measurement failed');
        const limited = enumerateBatch([requirements, requirements], createResolverBudget({maxWork: batch.work - 1}));
        expect(limited.kind).toBe('resource-limit');
        expect('rows' in limited).toBe(false);
        expect(enumerate(requirements, createResolverBudget({maxNodes: 20})).kind).toBe('bounded-projection');
        expect(enumerate(requirements, createResolverBudget({maxNodes: 19})).kind).toBe('resource-limit');
    });
});
