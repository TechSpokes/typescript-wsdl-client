import { describe, expect, it } from 'vitest';
import { groupIncidenceCase } from './incidence-case.js';
import { checkIncidence } from './incidence-probe.js';
import type { Component, ComponentClosure } from './incidence-probe.js';
import { Budget } from './witness-probe.js';

describe('RE01 supplied AU correspondence, without choosing witness equality', () => {
    it('preserves final AU sharing, exact predicates and named/global references under a final-root closure', () => {
        const { original, hypothetical, pairs } = groupIncidenceCase();
        expect(checkIncidence(original, hypothetical, pairs).kind).toBe('correspondence');
        expect(original.components.find(c => c.id === 'G/g')!.id).toBe('G/g');
        expect(hypothetical.components.find(c => c.id === 'E/g')!.id).toBe('E/g');
        expect(original.components.find(c => c.id === 'A/g')).toBe(hypothetical.components.find(c => c.id === 'A/g'));
    });

    it('distinguishes final-root equivalence from closure anchoring every original group member', () => {
        const { original, hypothetical, pairs } = groupIncidenceCase();
        expect(checkIncidence({ ...original, roots: ['D', 'G'] }, { ...hypothetical, roots: ['D', 'G'] },
            [...pairs, ['G', 'G']])).toMatchObject({ kind: 'mismatch', reason: 'closure cardinality' });
    });

    it('rejects deleting a retained fixed constraint or changing named declaration/type anchors', () => {
        const { original, hypothetical, pairs } = groupIncidenceCase();
        for (const mutation of [
            (c: Component): Component => c.id === 'E/g' ? { ...c, properties: [['required', 'false'], ['constraint', 'absent'], ['value', '']] } : c,
            (c: Component): Component => c.id === 'global/g' ? { ...c, anchor: 'other-global-g' } : c,
            (c: Component): Component => c.id === 'xs:int' ? { ...c, anchor: 'other-named-type' } : c,
        ]) expect(checkIncidence(original, { ...hypothetical, components: hypothetical.components.map(mutation) }, pairs).kind).toBe('mismatch');
    });

    it('rejects merging distinct use identities even when predicates happen to be equal', () => {
        const components: readonly Component[] = [
            { id: 'D', kind: 'complex-type', properties: [], edges: [['attribute-use', 'u1'], ['attribute-use', 'u2']] },
            { id: 'u1', kind: 'attribute-use', properties: [['required', 'false']], edges: [['declaration', 'g']] },
            { id: 'u2', kind: 'attribute-use', properties: [['required', 'false']], edges: [['declaration', 'g']] },
            { id: 'g', kind: 'attribute-declaration', properties: [], edges: [] },
        ];
        const closure: ComponentClosure = { components, roots: ['D'] };
        expect(checkIncidence(closure, closure, [['D', 'D'], ['u1', 'u1'], ['u2', 'u2'], ['g', 'g']]).kind).toBe('correspondence');
        expect(checkIncidence(closure, closure, [['D', 'D'], ['u1', 'u1'], ['u2', 'u1'], ['g', 'g']]))
            .toMatchObject({ kind: 'mismatch', reason: 'not a bijection over the selected closure' });
    });

    it('preserves edge incidence rather than merely counting properties and components', () => {
        const { original, hypothetical, pairs } = groupIncidenceCase();
        const components = hypothetical.components.map(c => c.id === 'D'
            ? { ...c, edges: [...c.edges, ['attribute-use', 'E/g'] as const] } : c);
        expect(checkIncidence(original, { ...hypothetical, components }, pairs))
            .toMatchObject({ kind: 'mismatch', reason: 'edge incidence' });
    });

    it('indexes shared local-scope cycles without expanding a tree', () => {
        const components: readonly Component[] = [
            { id: 'D', kind: 'complex-type', properties: [], edges: [['attribute-use', 'u']] },
            { id: 'u', kind: 'attribute-use', properties: [], edges: [['declaration', 'd']] },
            { id: 'd', kind: 'attribute-declaration', properties: [], edges: [['scope', 'D']] },
        ];
        const closure: ComponentClosure = { components, roots: ['D'] };
        expect(checkIncidence(closure, closure, [['D', 'D'], ['u', 'u'], ['d', 'd']]))
            .toMatchObject({ kind: 'correspondence', nodes: 6 });
    });

    it('rejects moving a local declaration to a different complex-type scope', () => {
        const components: readonly Component[] = [
            { id: 'D', kind: 'complex-type', properties: [], edges: [['attribute-use', 'u']] },
            { id: 'E', kind: 'complex-type', properties: [], edges: [] },
            { id: 'u', kind: 'attribute-use', properties: [], edges: [['declaration', 'd']] },
            { id: 'd', kind: 'attribute-declaration', properties: [], edges: [['scope', 'D']] },
        ];
        const original: ComponentClosure = { components, roots: ['D', 'E'] };
        const hypothetical = { ...original, components: components.map(c => c.id === 'd'
            ? { ...c, edges: [['scope', 'E'] as const] } : c) };
        expect(checkIncidence(original, hypothetical, [['D', 'D'], ['E', 'E'], ['u', 'u'], ['d', 'd']]))
            .toMatchObject({ kind: 'mismatch', reason: 'edge incidence' });
    });

    it('charges work and nodes before allocation, with no partial correspondence on exhaustion', () => {
        const { original, hypothetical, pairs } = groupIncidenceCase();
        const measured = checkIncidence(original, hypothetical, pairs);
        expect(checkIncidence(original, hypothetical, pairs, new Budget(measured.nodes, measured.work)).kind).toBe('correspondence');
        for (const budget of [new Budget(measured.nodes - 1), new Budget(100000, measured.work - 1)]) {
            expect(checkIncidence(original, hypothetical, pairs, budget).kind).toBe('resource-limit');
            expect(budget.nodes).toBeLessThanOrEqual(budget.maxNodes);
            expect(budget.work).toBeLessThanOrEqual(budget.maxWork);
        }
    });

    it('preserves exact long property strings and charges UTF-16 text', () => {
        const big = '900719925474099312345678901234567890';
        const closure: ComponentClosure = { components: [{ id: 'u', kind: 'attribute-use', properties: [['value', big]], edges: [] }], roots: ['u'] };
        expect(checkIncidence(closure, closure, [['u', 'u']]).kind).toBe('correspondence');
        const changed = { components: [{ ...closure.components[0], properties: [['value', '900719925474099312345678901234567891'] as const] }], roots: ['u'] };
        expect(checkIncidence(closure, changed, [['u', 'u']]).kind).toBe('mismatch');
        const unicode = { components: [{ ...closure.components[0], properties: [['value', big + '😀'] as const] }], roots: ['u'] };
        expect(checkIncidence(unicode, unicode, [['u', 'u']]).work).toBe(checkIncidence(closure, closure, [['u', 'u']]).work + 6);
    });

    it('classifies malformed certificates as input errors rather than semantic negatives', () => {
        const closure: ComponentClosure = { components: [{ id: 'u', kind: 'attribute-use', properties: [], edges: [] }], roots: ['u'] };
        expect(() => checkIncidence({ ...closure, components: [...closure.components, ...closure.components] }, closure, []))
            .toThrow('Duplicate component ID');
        expect(() => checkIncidence({ components: [{ ...closure.components[0], edges: [['declaration', 'missing']] }], roots: ['u'] }, closure, []))
            .toThrow('Missing component edge target');
    });
});
