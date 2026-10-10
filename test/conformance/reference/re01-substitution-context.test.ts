import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, expandedQName, parseXml} from './syntax.js';
import type {XmlNode} from './syntax.js';

const directory = 'xsd/re01/';
const namespace = 'urn:re01:retained-substitution';
const cases = ['substitution-actual.xsd', 'substitution-retained.xsd', 'substitution-omitted.xsd'] as const;
const fixture = (name: string) => parseXml(readFileSync(localFixture(directory + name), 'utf8'), directory + name);
const named = (schema: XmlNode, kind: string, name: string) => {
    const matches = children(schema, kind).filter(node => attribute(node, 'name') === name);
    expect(matches).toHaveLength(1);
    return matches[0];
};
const typeName = (node: XmlNode) => expandedQName(node, attribute(node, 'type')!);

describe('RE01 retained substitution context: independent clause premises', () => {
    it('establishes affiliation success and failure from the written ancestry', () => {
        const actual = fixture(cases[0]), proposed = fixture(cases[1]);
        for (const schema of [actual, proposed]) {
            const head = named(schema, 'element', 'H'), member = named(schema, 'element', 'M');
            expect(typeName(head)).toEqual({uri: namespace, local: 'B'});
            expect(typeName(member)).toEqual({uri: namespace, local: 'D'});
            expect(expandedQName(member, attribute(member, 'substitutionGroup')!)).toEqual({uri: namespace, local: 'H'});
            expect(attribute(head, 'final')).toBeUndefined();
            expect(attribute(head, 'block')).toBeUndefined();
        }
        const branch = (schema: XmlNode, name: string) => children(named(schema, 'complexType', name), 'complexContent')[0].children[0];
        expect(branch(actual, 'D').local).toBe('extension');
        expect(expandedQName(branch(actual, 'D'), attribute(branch(actual, 'D'), 'base')!)).toEqual({uri: namespace, local: 'B'});
        expect(branch(proposed, 'D').local).toBe('restriction');
        expect(expandedQName(branch(proposed, 'D'), attribute(branch(proposed, 'D'), 'base')!)).toEqual({uri: namespace, local: 'T'});
        for (const schema of [actual, proposed]) {
            for (const name of ['T', 'B']) {
                const edge = branch(schema, name);
                expect(expandedQName(edge, attribute(edge, 'base')!)).toEqual({uri: namespace, local: 'A'});
            }
            expect(children(named(schema, 'complexType', 'A'), 'complexContent')).toEqual([]);
        }
        // e-props-correct.4 invokes cos-ct-derived-ok with H.final = empty.
        // Actual D has immediate base B: clause 2.2 passes. Proposed ancestry
        // is D -> T -> A -> anyType; no identity equals B, so clause 2 fails.
        // These literal, source-checked expectations do not call a resolver.
        const ancestryExpectation = {actual: ['D', 'B', 'A', 'anyType'], proposed: ['D', 'T', 'A', 'anyType']};
        expect(ancestryExpectation.actual.includes('B')).toBe(true);
        expect(ancestryExpectation.proposed.includes('B')).toBe(false);
        expect(children(fixture(cases[2]), 'element').map(node => attribute(node, 'name'))).toEqual(['H']);
        // Omitting M removes this affiliation obligation from that component
        // schema; it does not prove that all RE01 witnesses may omit M.
    });

    it('records separate live primary construction controls', async () => {
        for (const [name, outcome] of [[cases[0], 'accepted'], [cases[1], 'rejected'], [cases[2], 'accepted']] as const) {
            const observation = await validateFixture(directory + name);
            expect(observation, name).toMatchObject({phase: 'schema', outcome});
        }
    });
});
