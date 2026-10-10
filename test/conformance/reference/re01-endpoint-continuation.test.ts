import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { engine, localFixture, validateFixture } from './adapter.js';
import { attribute, children, expandedQName, parseXml, XSD } from './syntax.js';
import type { XmlNode } from './syntax.js';
import { View, probe, tablePredicate } from '../../research/re01/witness-probe.js';

const directory = 'xsd/re01/';
const namespace = 'urn:re01:recursive-reflection';
const cases = [
    ['endpoint-all-original.xsd', 'b47cd197f897e027833209351b4407282f21198407ac0921a8c57549b22be84b'],
    ['endpoint-all-shadow.xsd', 'd052d6dc5dd933a7333566376c97dc96a08233eab6dfc9ded0044ffa690568ca'],
] as const;

function fixture(name: string): XmlNode {
    return parseXml(readFileSync(localFixture(directory + name), 'utf8'), directory + name);
}

function type(schema: XmlNode, name: string): XmlNode {
    const matches = children(schema, 'complexType').filter(node => attribute(node, 'name') === name);
    expect(matches).toHaveLength(1);
    return matches[0];
}

function branch(schema: XmlNode, name: string, method: string): XmlNode {
    const matches = children(children(type(schema, name), 'complexContent')[0], method);
    expect(matches).toHaveLength(1);
    return matches[0];
}

function qname(node: XmlNode, field: string) {
    return expandedQName(node, attribute(node, field)!);
}

function bounds(node: XmlNode) {
    // These original fixtures have finite bounds; no generic occurrence engine.
    return { minimum: BigInt(attribute(node, 'minOccurs') ?? '1'), maximum: BigInt(attribute(node, 'maxOccurs') ?? '1') };
}

describe('RE01 endpoint continuation: fixed source premises and live observations', () => {
    it('retains a meaningful two-member all and a valid existing intermediate identity', () => {
        for (const [name] of cases) {
            const schema = fixture(name), a = type(schema, 'A');
            const all = children(a, 'all')[0], members = children(all, 'element');
            expect(bounds(all)).toEqual({ minimum: 1n, maximum: 1n });
            expect(members.map(member => attribute(member, 'name'))).toEqual(['n', 'm']);
            expect(members.map(bounds)).toEqual([{ minimum: 0n, maximum: 1n }, { minimum: 0n, maximum: 1n }]);
            expect(members.map(member => qname(member, 'type'))).toEqual([
                { uri: namespace, local: 'T' }, { uri: XSD, local: 'int' },
            ]);

            // cos-particle-restrict.2.2 removes all only when empty or singleton.
            // Neither member is discarded by maxOccurs=0. The raw all stays intact.
            expect(members.length === 0 || members.length === 1).toBe(false);
            expect(members.every(member => bounds(member).maximum === 1n)).toBe(true);
            expect(members.reduce((total, member) => total + bounds(member).minimum, 0n)).toBe(0n);

            const t = branch(schema, 'T', 'extension'), b = branch(schema, 'B', 'restriction');
            expect(qname(t, 'base')).toEqual({ uri: namespace, local: 'A' });
            expect(t.children).toEqual([]); // Existing global T preserves A's original all.
            expect(qname(b, 'base')).toEqual({ uri: namespace, local: 'A' });
            expect(b.children).toEqual([]); // Empty restriction has the zero-minimum premise.
            expect(attribute(a, 'final')).toBeUndefined();
            expect(attribute(type(schema, 'T'), 'final')).toBeUndefined();
            expect(children(schema, 'element').map(node => attribute(node, 'name'))).toEqual(['root']);
            expect(attribute(children(schema, 'element')[0], 'substitutionGroup')).toBeUndefined();
            expect(children(schema, 'attribute')).toEqual([]);

            // cos-particle-extend.2's other shape would place this all below a new
            // sequence; cos-all-limited.1 permits it only as whole complex content.
            // The all cannot become a certified absent/pointless extension operand.
            const raw = new View('A/all', 'all', { schemaEmptiable: true, children: [
                new View('A/n', 'element', { minimum: '0', typeReference: 't:T' }),
                new View('A/m', 'element', { minimum: '0', typeReference: 'xs:int' }),
            ] });
            expect(raw.kind).toBe('all');
            expect(raw.children).toHaveLength(2);
        }
    });

    it('distinguishes the actually invoked original and checked-shadow type premises', () => {
        const original = fixture(cases[0][0]), shadow = fixture(cases[1][0]);
        const aAll = children(type(original, 'A'), 'all')[0];
        const originalD = branch(original, 'D', 'extension'), shadowD = branch(shadow, 'D', 'restriction');
        expect(qname(originalD, 'base')).toEqual({ uri: namespace, local: 'B' });
        expect(qname(shadowD, 'base')).toEqual({ uri: namespace, local: 'T' });
        const finalAll = children(originalD, 'all')[0], shadowAll = children(shadowD, 'all')[0];
        expect(bounds(finalAll)).toEqual(bounds(aAll));
        expect(children(finalAll, 'element').map(member => attribute(member, 'name'))).toEqual(['n', 'm']);
        expect(children(finalAll, 'element').map(bounds)).toEqual(children(aAll, 'element').map(bounds));
        expect(children(finalAll, 'element').map(member => qname(member, 'type'))).toEqual([
            { uri: namespace, local: 'D' }, { uri: XSD, local: 'int' },
        ]);
        expect(children(shadowAll, 'element').map(member => qname(member, 'type')))
            .toEqual(children(finalAll, 'element').map(member => qname(member, 'type')));
        for (const all of [aAll, finalAll, shadowAll]) {
            for (const member of children(all, 'element')) {
                // These are local declarations, so NameAndTypeOK's both-global
                // shortcut cannot bypass its type predicate. Other local premises
                // are false nillability, absent fixed/identity constraints and block.
                expect(attribute(member, 'ref')).toBeUndefined();
                for (const property of ['form', 'nillable', 'fixed', 'default', 'block'])
                    expect(attribute(member, property)).toBeUndefined();
                expect(member.children).toEqual([]);
            }
        }

        // rcase-NameAndTypeOK.3.2.5 invokes cos-ct-derived-ok with extension
        // excluded. This checks only these sourced clauses, not a general engine.
        const excluded = new Set(['extension', 'list', 'union']);
        const originalClauseOne = !excluded.has(originalD.local);
        const shadowClauseOne = !excluded.has(shadowD.local);
        expect(originalClauseOne).toBe(false); // Actual named D differs from T.
        expect(shadowClauseOne).toBe(true);
        expect(qname(shadowD, 'base')).toEqual(qname(children(aAll, 'element')[0], 'type'));

        // The obligatory n->n Recurse pair fails in the actual type world, but
        // succeeds for shadow D's immediate restriction base T. m->m is identical.
        // A fresh copy T' cannot substitute for T in that immediate-base equality;
        // the original expected type T is a fixed, named operand.
        const expectedType = qname(children(aAll, 'element')[0], 'type');
        expect({ uri: namespace, local: 'T-copy' }).not.toEqual(expectedType);
        const ancestor = new View('A/all', 'all', { schemaEmptiable: true, children: [
            new View('A/n', 'element', { minimum: '0', typeReference: 't:T' }),
            new View('A/m', 'element', { minimum: '0', typeReference: 'xs:int' }),
        ] });
        const final = new View('D/all', 'all', { schemaEmptiable: true, children: [
            new View('D/n', 'element', { minimum: '0', typeReference: 't:D' }),
            new View('D/m', 'element', { minimum: '0', typeReference: 'xs:int' }),
        ] });
        const prepared = { ancestor, final, normalizationCertified: true, nonvacuousExtensionAllowed: false };
        expect(probe(prepared, tablePredicate([[final.source, ancestor.source, false]])))
            .toMatchObject({ kind: 'unresolved', candidate: null });
        expect(probe(prepared, tablePredicate([[final.source, ancestor.source, true]])))
            .toMatchObject({ kind: 'particle-witness', candidate: 'vacuous' });
        // Supplied world-specific premises expose a finite-family obligation.
        // They certify neither a whole schema nor a complete negative procedure.
    });

    it('keeps accepted live observations separate from the pending endpoint convention', async () => {
        expect(engine).toMatchObject({ package: 'libxml2-wasm', version: '0.7.2', engineVersion: '2.15.1' });
        for (const [name, hash] of cases) {
            const result = await validateFixture(directory + name, ['<root xmlns="' + namespace + '"/>']);
            const observation = { kind: 'current-primary-observation' as const, result };
            expect(observation.result, name).toMatchObject({ phase: 'schema', outcome: 'accepted' });
            expect(observation.result.fixtureHashes[directory + name]).toBe(hash);
            expect(observation.result.instances?.map(row => row.outcome)).toEqual(['accepted']);
        }
        // Engine acceptance does not choose D1/D2 or E1/E2, prove reflection, or
        // turn the original-world conditional family failure into invalid-schema.
    });
});
