import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { localFixture, validateFixture } from './adapter.js';
import { attribute, children, expandedQName, parseXml, XSD } from './syntax.js';
import type { XmlNode } from './syntax.js';
import { Budget, Operand, Use, replacementRestrictionAttributes, unionUses } from '../../research/s06-au01/probe.js';
import { checkIncidence } from '../../research/re01/incidence-probe.js';
import { groupIncidenceCase } from '../../research/re01/incidence-case.js';

const ns = 'urn:re01:group';
const fixture = (name: string) => 'xsd/re01/au-group-' + name + '.xsd';
const source = (name: string) => parseXml(readFileSync(localFixture(fixture(name)), 'utf8'), fixture(name));
function named(document: XmlNode, kind: string, name: string): XmlNode {
    const matches = children(document, kind).filter(node => attribute(node, 'name') === name);
    expect(matches).toHaveLength(1);
    return matches[0];
}
function edge(document: XmlNode, name: string, kind: string): XmlNode {
    const edges = children(children(named(document, 'complexType', name), 'complexContent')[0], kind);
    expect(edges).toHaveLength(1);
    return edges[0];
}
const ref = (node: XmlNode) => expandedQName(node, attribute(node, 'ref')!);

describe('RE01 source-incidence decision contrast; no full witness verdict', () => {
    it('pins whole-group imports and distinguishes inherited, copied and replacement source contributions', () => {
        const original = source('original'), hypothetical = source('witness');
        for (const document of [original, hypothetical]) {
            expect(attribute(document, 'targetNamespace')).toBe(ns);
            const globals = children(document, 'attribute');
            expect(globals.map(node => attribute(node, 'name'))).toEqual(['g', 'h']);
            for (const node of globals) expect(expandedQName(node, attribute(node, 'type')!)).toEqual({ uri: XSD, local: 'int' });
            const group = children(named(document, 'attributeGroup', 'G'), 'attribute');
            expect(group.map(ref)).toEqual([{ uri: ns, local: 'g' }, { uri: ns, local: 'h' }]);
            expect(group.map(node => attribute(node, 'fixed'))).toEqual(['2', undefined]);
            const base = children(named(document, 'complexType', 'A'), 'attribute');
            expect(base).toHaveLength(2);
            expect(ref(base[0])).toEqual({ uri: ns, local: 'g' });
            expect(attribute(base[0], 'fixed')).toBe('1');
            expect(attribute(base[1], 'name')).toBe('h');
            expect(attribute(base[1], 'form')).toBe('qualified');
            expect(expandedQName(base[1], attribute(base[1], 'type')!)).toEqual({ uri: XSD, local: 'int' });
        }
        const removed = children(edge(original, 'B', 'restriction'), 'attribute');
        expect(removed).toHaveLength(1);
        expect(removed.map(node => [attribute(node, 'name'), attribute(node, 'form'), attribute(node, 'use')]))
            .toEqual([['h', 'qualified', 'prohibited']]);
        const originalContribution = children(edge(original, 'D', 'extension'), 'attributeGroup');
        expect(originalContribution).toHaveLength(1);
        expect(ref(originalContribution[0])).toEqual({ uri: ns, local: 'G' });
        const copied = children(edge(hypothetical, 'E', 'extension'), 'attribute');
        expect(copied).toHaveLength(1);
        expect(ref(copied[0])).toEqual({ uri: ns, local: 'g' });
        expect(attribute(copied[0], 'fixed')).toBe('2');
        const final = edge(hypothetical, 'D', 'restriction');
        expect(children(final, 'attribute')).toEqual([]);
        expect(children(final, 'attributeGroup').map(ref)).toEqual([{ uri: ns, local: 'H' }]);
        expect(children(named(hypothetical, 'attributeGroup', 'H'), 'attribute').map(ref)).toEqual([{ uri: ns, local: 'h' }]);
        expect(copied[0].source).not.toBe(originalContribution[0].source);
    });

    it('uses the accepted C1 and source-replacement predicates without deciding RE witness equality', () => {
        // Independently specified named xs:int premises; no production semantic helpers.
        const use = (id: string, declaration: string, name: string, fixed?: string) => new Use(id, declaration, [ns, name], {
            kind: fixed === undefined ? 'none' : 'fixed', operand: fixed === undefined ? undefined : new Operand('integer', fixed), scalarType: 'integer',
        });
        const aG = use('A/g', 'global/g', 'g', '1'), aH = use('A/h', 'local-A/h', 'h');
        const gG = use('G/g', 'global/g', 'g', '2'), gH = use('G/h', 'global/h', 'h');
        const eG = use('E/g', 'global/g', 'g', '2'), hH = use('H/h', 'global/h', 'h');
        const originalB = replacementRestrictionAttributes([aG, aH], [], new Budget(), { directProhibitions: [[ns, 'h']] });
        expect(originalB.effective).toEqual([aG]);
        expect(unionUses([...originalB.effective, gG, gH], 'complexType', new Budget())).toEqual([aG, gG, gH]);
        expect(() => unionUses([aG, aH, gG, gH], 'complexType', new Budget())).toThrow('invalid-schema');
        const intermediate = unionUses([aG, aH, eG], 'complexType', new Budget());
        const hypotheticalD = replacementRestrictionAttributes(intermediate, [hH], new Budget());
        expect(hypotheticalD.pairCount).toBe(1);
        expect(hypotheticalD.effective).toEqual([hH, aG, eG]);
        expect(hypotheticalD.effective[1]).toBe(aG);
        expect(hypotheticalD.effective[2]).toBe(eG);
        expect(() => replacementRestrictionAttributes(intermediate, [gG, gH], new Budget())).toThrow('all-matches-original-fixed');
        const { original, hypothetical, pairs } = groupIncidenceCase();
        expect(checkIncidence(original, hypothetical, pairs).kind).toBe('correspondence');
        expect(checkIncidence({ ...original, roots: ['D', 'G'] }, { ...hypothetical, roots: ['D', 'G'] }, [...pairs, ['G', 'G']]).kind)
            .toBe('mismatch');
    });

    it('records fresh primary rejection separately from selected contracts and hypothetical correspondence', async () => {
        for (const name of ['original', 'witness']) {
            const result = await validateFixture(fixture(name));
            expect(result).toMatchObject({ phase: 'schema', outcome: 'rejected' });
            expect(result.diagnostic).toContain('Duplicate attribute use');
        }
        // Rejection by this engine supplies neither C1 authority nor a comparison-closure decision.
    });
});
