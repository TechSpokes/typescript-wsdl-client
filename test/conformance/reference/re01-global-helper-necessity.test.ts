import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, expandedQName, parseXml, XSD} from './syntax.js';
import type {XmlNode} from './syntax.js';

// Fixed raw sources and clause expectations authored independently of all
// particle/type/procedure subject helpers. Live-engine results stay separate.
const directory = 'xsd/re01/';
const namespace = 'urn:re01:raw-all-helper';
const files = ['raw-all-helper-actual.xsd','raw-all-helper-present.xsd','raw-all-helper-absent.xsd'] as const;
const fixture = (file: string) => parseXml(readFileSync(localFixture(directory+file),'utf8'),file);
const expectations = JSON.parse(readFileSync(localFixture(directory+'raw-all-helper-expectations.json'),'utf8')) as {
    primary: Record<string,string>; observedLiveConstruction: Record<string,string>;
};
function named(schema: XmlNode, kind: string, name: string): XmlNode {
    const matches = children(schema,kind).filter(node=>attribute(node,'name')===name);
    expect(matches).toHaveLength(1); return matches[0]!;
}
function branch(schema: XmlNode, name: string): XmlNode {
    const content = children(named(schema,'complexType',name),'complexContent');
    expect(content).toHaveLength(1); expect(content[0]!.children).toHaveLength(1);
    return content[0]!.children[0]!;
}
const base = (node: XmlNode) => expandedQName(node,attribute(node,'base')!);
const range = (node: XmlNode) => [attribute(node,'minOccurs')??'1',attribute(node,'maxOccurs')??'1'];

describe('RE01 independent raw-all fresh-global-helper necessity contrast',()=> {
    it('keeps the actual source and its immutable final all operands separate from the proposed base edge',()=> {
        const actual = fixture(files[0]), proposed = fixture(files[1]);
        expect(branch(actual,'B').local).toBe('restriction');
        expect(base(branch(actual,'B'))).toEqual({uri:namespace,local:'A'});
        expect(branch(actual,'B').children).toEqual([]);
        expect(branch(actual,'D').local).toBe('extension');
        expect(base(branch(actual,'D'))).toEqual({uri:namespace,local:'B'});
        expect(branch(proposed,'D').local).toBe('restriction');
        expect(base(branch(proposed,'D'))).toEqual({uri:namespace,local:'E'});
        expect(children(branch(actual,'D'),'all')[0]!.xml).toBe(children(branch(proposed,'D'),'all')[0]!.xml);
        expect(children(actual,'element').map(node=>attribute(node,'name'))).toEqual(['H']);
        // The actual input does not acquire c or E through this comparison.
        // Full RE01 legality remains a separate model/procedure judgment.
    });

    it('retains two-member raw all placement and vacuous E extension in both candidates',()=> {
        for (const file of files) {
            const schema = fixture(file), a = children(named(schema,'complexType','A'),'all')[0]!;
            expect(range(a)).toEqual(['1','1']);
            expect(a.children).toHaveLength(2);
            expect(expandedQName(a.children[0]!,attribute(a.children[0]!,'ref')!)).toEqual({uri:namespace,local:'H'});
            expect(attribute(a.children[1]!,'name')).toBe('z');
            expect(a.children.map(range)).toEqual([['0','1'],['0','1']]);
            const d = children(branch(schema,'D'),'all')[0]!;
            expect(range(d)).toEqual(['1','1']);
            expect(d.children.map(node=>attribute(node,'name'))).toEqual(['c','z']);
            expect(d.children.map(range)).toEqual([['1','1'],['0','1']]);
            expect(d.children.map(node=>expandedQName(node,attribute(node,'type')!))).toEqual([
                {uri:XSD,local:'token'},{uri:XSD,local:'string'},
            ]);
            expect(children(branch(schema,'D'),'sequence')).toEqual([]);
            if (file !== files[0]) {
                const e = branch(schema,'E');
                expect(e.local).toBe('extension'); expect(base(e)).toEqual({uri:namespace,local:'A'});
                expect(e.children).toEqual([]); // Inherit A's all without nesting/copying.
            }
        }
    });

    it('pins helper-dependent expansion and the exact component mapping without a particle oracle',()=> {
        const present = fixture(files[1]), absent = fixture(files[2]);
        const h = named(present,'element','H'), c = named(present,'element','c');
        for (const node of [h,c]) {
            expect(expandedQName(node,attribute(node,'type')!)).toEqual({uri:XSD,local:'string'});
            for (const field of ['abstract','block','final','fixed','nillable']) expect(attribute(node,field)).toBeUndefined();
        }
        expect(expandedQName(c,attribute(c,'substitutionGroup')!)).toEqual({uri:namespace,local:'H'});
        expect(children(absent,'element').map(node=>attribute(node,'name'))).toEqual(['H']);
        // e-props-correct.4 and Substitution Group OK admit c:string under
        // H:string by type identity. cos-particle-restrict.2.1 expands optional
        // H to choice(H[1],c[1])[0..1]. Both raw all groups have two members,
        // so All:All Recurse uses the written order c->H expansion, z->z.
        // Element:Choice RecurseAsIfGroup synthesizes choice(c)[1..1], and
        // Choice:Choice RecurseLax maps it to c:string. token->normalizedString
        // ->string is restriction-only; root and member ranges narrow legally.
        const restricted = children(branch(present,'D'),'all')[0]!.children;
        const original = children(named(present,'complexType','A'),'all')[0]!.children;
        expect(attribute(restricted[0]!,'name')).toBe(attribute(c,'name'));
        expect(attribute(restricted[1]!,'name')).toBe(attribute(original[1]!,'name'));
        expect(BigInt(range(restricted[0]!)[0]!) >= BigInt(range(original[0]!)[0]!)).toBe(true);
        expect(BigInt(range(restricted[0]!)[1]!) <= BigInt(range(original[0]!)[1]!)).toBe(true);
        // Without c there is no expansion: local QName c differs from H and
        // from z, so no NameAndTypeOK target completes the all-member mapping.
        const baseNamesWithoutHelper = ['H','z'];
        expect(baseNamesWithoutHelper.includes('c')).toBe(false);
        expect(expectations.primary[files[1]]).toBe('valid-particle-mapping-with-fresh-global-affiliate');
        expect(expectations.primary[files[2]]).toBe('invalid-particle-mapping-local-c-vs-global-H');
        // Adding c changes a predicate reading original global H. A projection
        // fixing H's original effective substitution universe loses this case.
    });

    it.each(files)('records separately qualified live construction: %s',async file=> {
        const observation = await validateFixture(directory+file);
        expect(observation).toMatchObject({phase:'schema',outcome:expectations.observedLiveConstruction[file],undisposed:{}});
        if (file === files[2]) {
            expect(expectations.primary[file]).toBe('invalid-particle-mapping-local-c-vs-global-H');
            // Both candidates are accepted by libxml2. This explicit
            // disagreement does not qualify it as a particle-restriction oracle.
            expect(observation.outcome).toBe('accepted');
        }
    });
});
