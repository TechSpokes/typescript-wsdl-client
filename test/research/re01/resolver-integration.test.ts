import {describe, expect, it} from 'vitest';
import {prepareContexts} from './resolver-context.js';
import {resolveReference} from './resolver-resolution.js';
import {compareEndpoint} from './resolver-comparison.js';
import {checkSubstitution, checkTypeDerivation} from './resolver-relations.js';
import {assessValidationObligations, checkCandidate} from './resolver-validation.js';
import type {PredicateReceipt, ValidationOwners} from './resolver-validation.js';
import {baselineRequest, fixtureName, literalComponent, symbol} from './resolver-fixtures.js';
import {records, symbol as r2Symbol} from './resolver-resolution-records.js';
import type {ActualInput, Candidate, Correspondence, Prepared, Result} from './resolver-types.js';

const certificate: Correspondence = {actualRoot: 'D', proposedRoot: 'D', pairs: [['D', 'D']]};
function prepared(input: ActualInput, candidate: Candidate): Prepared {
    const result = prepareContexts(input, candidate, {maxWork: 10_000_000});
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
    return result.value;
}
function ok<T>(result: Result<T>): T {
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
    return result.value;
}

// These test-only owners attest the exact captured obligations conditionally.
// They implement no XSD predicate and cannot establish a full-type witness.
function conditionalOwners(captured: string[]): ValidationOwners {
    const owner = {
        authority: 'literal-test-owner:conditional-only',
        qualification: 'handwritten request-capture fixture; no XSD legality authority',
        check(request: Pick<Parameters<NonNullable<ValidationOwners['typeConstruction']>['check']>[0],
            'context' | 'budget' | 'obligation' | 'operands'>): Result<PredicateReceipt> {
            request.budget.chargeWork(1 + request.obligation.rule.length);
            captured.push(request.obligation.rule);
            const value = request.budget.freeze(request.budget.snapshot({
                context: request.context.key, rule: request.obligation.rule,
                operands: request.operands, authority: 'literal-test-owner:conditional-only',
            }));
            // Shallow envelope borrows the live usage view and frozen receipt.
            request.budget.chargeWork(38);
            return Object.freeze({kind: 'ok', value, usage: request.budget.usage()});
        },
    };
    // Common request fields alone are inspected; adapter-specific operands are
    // retained by the resolver and independently covered in R4 capture tests.
    return {typeConstruction: owner, attributes: owner, particleRestriction: owner,
        attribution: owner, declarations: owner, scalarOperands: owner};
}

describe('R6 combined resolver guarantees remain separately scoped', () => {
    it('propagates context through an unchanged group/declaration without granting candidate legality', () => {
        const {input, candidate} = records();
        const contexts = prepared(input, candidate);
        const declaration = ok(resolveReference(contexts.proposed, 'G/p', 'reference'));
        expect(declaration.kind).toBe('component');
        if (declaration.kind !== 'component') throw new Error('Expected literal declaration');
        const actualD = ok(resolveReference(contexts.actual, declaration.component.id, 'type'));
        const proposedD = ok(resolveReference(contexts.proposed, declaration.component.id, 'type'));
        expect(actualD).toMatchObject({kind: 'component', component: {facts: {method: 'extension', base: {target: 'B'}}}});
        expect(proposedD).toMatchObject({kind: 'component', component: {facts: {method: 'restriction', base: {target: 'T'}}}});
        expect(checkTypeDerivation(contexts.actual, r2Symbol('D'), r2Symbol('T'), ['extension']).kind).toBe('candidate-rejected');
        expect(checkTypeDerivation(contexts.proposed, r2Symbol('D'), r2Symbol('T'), ['extension']).kind).toBe('ok');
        expect(ok(compareEndpoint(contexts, certificate)).scope).toBe('endpoint-properties-and-incidence');
        const ledger = ok(assessValidationObligations(contexts.proposed));
        expect(ledger.members).toEqual(contexts.proposed.members);
        expect(ledger.assessments.some(entry => entry.result.kind === 'unresolved')).toBe(true);
        expect(checkCandidate(contexts, certificate).kind).toBe('unresolved');
    });

    it('combines correspondence and every named conditional owner while excluding the theorem', () => {
        const {input, candidate} = baselineRequest();
        const contexts = prepared(input, candidate);
        const capture: string[] = [];
        const receipt = ok(checkCandidate(contexts, certificate, conditionalOwners(capture)));
        expect(receipt.scope).toBe('listed-component-schema-under-qualified-predicates');
        expect(receipt.members).toEqual(['A', 'B', 'D', 'T']);
        expect(receipt.exclusions).toEqual(['source-reconstruction', 'global-witness-completeness', 'production-assessment-acceptance']);
        expect(receipt.authorities).toContain('literal-test-owner:conditional-only');
        expect(capture.length).toBeGreaterThan(0);
        for (const entry of receipt.obligations) {
            expect(entry.context).toBe(contexts.proposed.key);
            expect(entry.authority.length).toBeGreaterThan(0);
        }
        expect(Object.isFrozen(receipt)).toBe(true);
    });

    it('rejects retained affiliation despite correspondence; omitted affiliates remain observable boundary evidence', () => {
        const h = literalComponent('H', {kind: 'element', name: fixtureName('H'), type: symbol('B'),
            nillable: false, abstract: false, final: [], block: [], identityConstraints: []});
        const m = literalComponent('M', {kind: 'element', name: fixtureName('M'), type: symbol('D'),
            nillable: false, abstract: false, final: [], block: [], identityConstraints: [], head: symbol('H', 'element')});
        const {input, candidate} = baselineRequest([h, m]);
        const retained = prepared(input, candidate);
        expect(checkSubstitution(retained.actual, 'M', 'H', {mode: 'affiliation'}).kind).toBe('ok');
        expect(ok(compareEndpoint(retained, certificate)).scope).toBe('endpoint-properties-and-incidence');
        expect(checkCandidate(retained, certificate, conditionalOwners([]))).toMatchObject({
            kind: 'candidate-rejected', diagnostic: {rule: 'e-props-correct.4', component: 'M'},
        });
        const omitted = prepared(input, {...candidate, retained: candidate.retained.filter(id => id !== 'M')});
        const receipt = ok(checkCandidate(omitted, certificate, conditionalOwners([])));
        expect(receipt.members).not.toContain('M');
        expect(receipt.excludedIncoming).toEqual([{owner: 'M', slot: 'head', target: 'H'}, {owner: 'M', slot: 'type', target: 'D'}]);
        expect(receipt.scope).toBe('listed-component-schema-under-qualified-predicates');
    });

    it('terminates a shared request without converting exhaustion into a semantic rejection', () => {
        const {input, candidate} = baselineRequest();
        const exhausted = prepareContexts(input, candidate, {maxWork: 79});
        expect(exhausted.kind).toBe('resource-limit');
        expect(exhausted).not.toHaveProperty('value');
        const next = prepared(input, candidate);
        expect(ok(compareEndpoint(next, certificate)).scope).toBe('endpoint-properties-and-incidence');
        expect(checkCandidate(next, certificate).kind).toBe('unresolved');
    });
});
