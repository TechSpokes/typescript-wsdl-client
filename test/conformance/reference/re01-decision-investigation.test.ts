import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, expandedQName, parseXml, XSD} from './syntax.js';

const files = ['combined-identity-original.xsd', 'combined-identity-reused.xsd', 'combined-identity-copy.xsd'] as const;
const namespace = 'urn:re01:combined';

describe('#260 original identity and ambient ambiguity combined', () => {
    it('grounds the negative projection in original raw all and ancestry operands', () => {
        for (const file of files) {
            const schema = parseXml(readFileSync(localFixture('xsd/re01/' + file), 'utf8'), file);
            const type = (name: string) => children(schema, 'complexType').find(node => attribute(node, 'name') === name)!;
            const branch = (name: string) => children(type(name), 'complexContent')[0]!.children[0]!;
            const original = children(type('A'), 'all')[0]!;
            const final = children(branch('D'), 'all')[0]!;
            // Two distinct non-disabled members keep raw all meaningful. No
            // nonvacuous sequence embedding is legal under cos-all-limited.
            expect(original.children.length).toBe(2);
            expect(final.children.length).toBe(2);
            for (const group of [original, final]) {
                expect(attribute(group, 'minOccurs') ?? '1').toBe('1');
                expect(attribute(group, 'maxOccurs') ?? '1').toBe('1');
                expect(group.children.map(node => attribute(node, 'minOccurs'))).toEqual(['0', '0']);
                expect(group.children.map(node => attribute(node, 'maxOccurs') ?? '1')).toEqual(['1', '1']);
            }
            expect(original.children.map(node => attribute(node, 'name'))).toEqual(final.children.map(node => attribute(node, 'name')));
            expect(expandedQName(original.children[0]!, attribute(original.children[0]!, 'type')!)).toEqual({uri: namespace, local: 'T'});
            expect(expandedQName(final.children[0]!, attribute(final.children[0]!, 'type')!)).toEqual({uri: namespace, local: 'D'});
            expect(expandedQName(original.children[1]!, attribute(original.children[1]!, 'type')!)).toEqual({uri: XSD, local: 'int'});
            expect([branch('T').local, attribute(branch('T'), 'base'), attribute(type('T'), 'block')]).toEqual(['extension', 't:A', undefined]);
            expect([branch('B').local, attribute(branch('B'), 'base'), attribute(type('B'), 'block')]).toEqual(['restriction', 't:T', 'extension']);
            const h = children(schema, 'element').find(node => attribute(node, 'name') === 'h')!;
            const member = children(schema, 'element').find(node => attribute(node, 'name') === 'affiliate')!;
            expect([attribute(h, 'type'), attribute(h, 'block'), attribute(member, 'type'), attribute(member, 'substitutionGroup')]).toEqual(['t:T', undefined, 't:D', 't:h']);
            expect(children(type('C'), 'choice')[0]!.children.map(node => attribute(node, 'ref'))).toEqual(['t:h', 't:affiliate']);
        }
        // cos-ct-derived-ok + local NameAndTypeOK force E=T; a fresh E whose
        // immediate base is A cannot reach T. With E=T, M substitutes for H
        // and two retained C positions overlap. Original B's extension block
        // no longer lies on that path. This exhausts intermediates under these
        // fixed identities/membership, independently of finite enumeration.
    });

    it('records current primary schema observations separately from that proof', async () => {
        const expected = ['accepted', 'rejected', 'rejected'] as const;
        for (let index = 0; index < files.length; index++) {
            const result = await validateFixture('xsd/re01/' + files[index]);
            expect(result).toMatchObject({phase: 'schema', outcome: expected[index]});
        }
        // Primary acceptance of the original does not decide its RE01 clause.
        // These observations also do not prove all abstract components fail.
    });
});
