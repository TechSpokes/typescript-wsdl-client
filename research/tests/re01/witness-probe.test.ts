import { describe, expect, it } from 'vitest';
import { Budget, View, probe, tablePredicate } from './witness-probe.js';
import type { Prepared, Restriction } from './witness-probe.js';
const outcome = (ancestor: View | null, final: View, answers: readonly (readonly [
    string,
    string,
    boolean | null
])[] = [], options: Partial<Prepared> = {}) => probe({ ancestor, final, ...options }, tablePredicate(answers));
describe('RE01 pure legacy contract', () => {
    it('string_and_token_vacuous_witnesses', () => {
        const base = new View('A/a', 'element', { minimum: '0', schemaEmptiable: true, typeReference: 'xs:string' });
        for (const kind of ['string', 'token']) {
            const final = new View('D/' + kind, 'element', { typeReference: 'xs:' + kind });
            expect(outcome(base, final, [[final.source, base.source, true]])).toMatchObject({ kind: 'particle-witness', candidate: 'vacuous' });
        }
    });
    it('integer_particle_uses_dead_separator_and_wildcard', () => {
        const base = new View('A/a', 'element', { minimum: '0', schemaEmptiable: true, typeReference: 'xs:string' });
        expect(outcome(base, new View('D/a', 'element', { typeReference: 'xs:int' }))).toMatchObject({ kind: 'particle-witness', candidate: 'dead-separator-universal', suffixWildcards: 1, mapping: [] });
    });
    it('required_prefix_and_multiple_unrelated_suffixes', () => {
        const a = new View('A/a', 'element', { typeReference: 'xs:string' }), b = new View('A/b', 'element', { minimum: '0', schemaEmptiable: true });
        const x = new View('D/a', 'element', { typeReference: 'xs:token' }), y = new View('D/x', 'choice', { minimum: '9', maximum: '999' }), z = new View('D/y', 'element', { typeReference: 'RecursiveType' });
        expect(outcome(new View('A', 'sequence', { children: [a, b] }), new View('D', 'sequence', { children: [x, y, z] }), [['D/a', 'A/a', true]])).toMatchObject({ kind: 'particle-witness', mapping: [[0, 0]], suffixWildcards: 2 });
    });
    it('empty_choice_is_not_erased_as_empty_language', () => {
        expect(outcome(new View('A/required-empty-choice', 'choice', { schemaEmptiable: true }), new View('D/a', 'element', { typeReference: 'xs:int' }))).toMatchObject({ candidate: 'dead-separator-universal', nodes: 2 });
    });
    it('pointless_prefix_can_absorb_repeated_nonsequence_root', () => {
        expect(outcome(null, new View('D/repeated-choice', 'choice', { minimum: '17', maximum: '999999999999999999999' }))).toMatchObject({ candidate: 'pointless-prefix-universal', suffixWildcards: 1 });
    });
    it('failed_candidates_never_become_invalid_schema', () => {
        expect(outcome(new View('A/required', 'element', { typeReference: 'xs:string' }), new View('D/unrelated', 'element', { typeReference: 'xs:int' }))).toMatchObject({ kind: 'unresolved', candidate: null });
    });
    it('unresolved_predicate_is_not_false', () => {
        expect(outcome(new View('A/required', 'element'), new View('D/required', 'element'), [['D/required', 'A/required', null]])).toMatchObject({ kind: 'unresolved', reason: 'unresolved original predicate' });
        // A structural pair key cannot conflate source strings containing separators.
        const predicate = tablePredicate([['a/b', 'c', true], ['a', 'b/c', false]]);
        expect(predicate(new View('a/b', 'element'), new View('c', 'element'), new Budget())).toBe(true);
        expect(predicate(new View('a', 'element'), new View('b/c', 'element'), new Budget())).toBe(false);
    });
    it('all_and_final_or_content_gates_are_external', () => {
        expect(outcome(new View('A/all', 'all', { children: [new View('A/a', 'element')] }), new View('D', 'element'), [], { nonvacuousExtensionAllowed: false })).toMatchObject({ kind: 'unresolved', nodes: 3 });
    });
    it('huge_repetition_preserves_original_operand', () => {
        const huge = '9'.repeat(200), final = new View('D/a', 'element', { maximum: huge });
        const result = outcome(new View('A/a', 'element', { minimum: '0', schemaEmptiable: true }), final);
        expect(result.kind).toBe('particle-witness');
        expect(final.maximum).toBe(huge);
        expect(result.work).toBeLessThan(400);
    });
    it('shared_dag_and_recursive_type_reference_do_not_expand', () => {
        const leaf = new View('element', 'element', { typeReference: 'RecursiveType/self' });
        let root = leaf;
        for (let depth = 0; depth < 20; depth++)
            root = new View('g' + depth, 'sequence', { children: [root, root] });
        const result = outcome(null, root);
        expect(result.kind).toBe('particle-witness');
        expect(result.nodes).toBe(21);
        expect(result.work).toBeLessThan(400);
        expect(leaf.typeReference).toBe('RecursiveType/self');
        expect(root.children[0]).toBe(root.children[1]);
        expect(outcome(null, new View('same', 'sequence', { children: [new View('x', 'element'), new View('x', 'element')] })).nodes).toBe(3);
    });
    it('exact_work_boundary_and_no_partial_mapping', () => {
        const prepared = { ancestor: new View('A', 'element', { minimum: '0', schemaEmptiable: true }), final: new View('D', 'element') }, predicate = tablePredicate([]);
        const measured = probe(prepared, predicate), at = probe(prepared, predicate, new Budget(100000, measured.work)), beyond = probe(prepared, predicate, new Budget(100000, measured.work - 1));
        expect(at.kind).toBe('particle-witness');
        expect(beyond).toMatchObject({ kind: 'resource-limit', mapping: [], candidate: null });
        expect(beyond.work).toBeLessThanOrEqual(measured.work - 1);
    });
    it('default_node_boundary_before_index_allocation', () => {
        const leaves = Array.from({ length: 99999 }, () => new View('n', 'element'));
        expect(outcome(null, new View('root', 'sequence', { children: leaves }))).toMatchObject({ kind: 'particle-witness', nodes: 100000 });
        expect(outcome(null, new View('root', 'sequence', { children: [...leaves, new View('n', 'element')] }))).toMatchObject({ kind: 'resource-limit', nodes: 100000, reason: 'nodes', mapping: [], candidate: null });
    });
    it('adversarial_prefix_exhausts_default_work_without_answer', () => {
        const prefix = [...Array.from({ length: 800 }, (_, i) => new View('b' + i, 'element', { minimum: '0', schemaEmptiable: true })), new View('mandatory', 'element')];
        const children = Array.from({ length: 800 }, (_, i) => new View('d' + i, 'element'));
        const relation: Restriction = (r, b, budget) => { budget.charge(); return r.kind === b.kind && b.kind === 'element' && b.source !== 'mandatory'; };
        const result = probe({ ancestor: new View('A', 'sequence', { children: prefix }), final: new View('D', 'sequence', { children }) }, relation);
        expect(result).toMatchObject({ kind: 'resource-limit', work: 1000000, mapping: [], candidate: null });
    });
    it('bad_limits_and_uncertified_normalization', () => {
        for (const limit of [0, -1, true, 2 ** 53, 1.5, NaN, Infinity])
            expect(() => new Budget(100000, limit as number)).toThrow('positive safe integers');
        expect(outcome(null, new View('D', 'element'), [], { normalizationCertified: false }).kind).toBe('unresolved');
        const budget = new Budget();
        expect(() => budget.charge(-1)).toThrow('work');
        expect(budget.work).toBe(0);
    });
    it('charges non-BMP source text in UTF-16 code units before exposing results', () => {
        const ascii = outcome(null, new View('x', 'element')), nonBmp = outcome(null, new View('😀', 'element'));
        expect(nonBmp.work).toBe(ascii.work + 1);
        expect(probe({ ancestor: null, final: new View('😀', 'element') }, tablePredicate([]), new Budget(100000, nonBmp.work - 1))).toMatchObject({ kind: 'resource-limit', candidate: null, mapping: [] });
    });
});
