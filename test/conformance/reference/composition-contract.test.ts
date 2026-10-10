import { describe, expect, it } from 'vitest';
import { validateFixture } from './adapter.js';
import { selected } from './evidence.js';
import { attribute, children, descendants, parseXml, XSD } from './syntax.js';
import { declaration, fixtureSchema, historical, selectedComposition, unqualified } from './structural-selected.js';

type Payload = readonly [string, boolean];
const path = (name: string) => 'xsd/composition/' + name;
const publicPayloads: readonly Payload[] = [
    ['<PayloadRestricted xmlns="urn:composition:public"><a>x</a></PayloadRestricted>', true],
    ['<PayloadRestricted xmlns="urn:composition:public"><b>1</b></PayloadRestricted>', false],
    ['<PayloadRestricted xmlns="urn:composition:public" gone="x"/>', false],
    ['<PayloadEmpty xmlns="urn:composition:public"/>', true],
    ['<PayloadEmpty xmlns="urn:composition:public"><a>x</a></PayloadEmpty>', false],
    ['<PayloadExtended xmlns="urn:composition:public"><a>x</a><b>1</b><extra>x</extra></PayloadExtended>', true],
    ['<PayloadRecursive xmlns="urn:composition:public"><next><next/></next></PayloadRecursive>', true],
];
const derivationPayloads: readonly Payload[] = [
    ['<extended xmlns="urn:composition" id="7"><a>A</a><b>2</b><extra>E</extra></extended>', true],
    ['<extended xmlns="urn:composition" id="7"><extra>E</extra><a>A</a></extended>', false],
    ['<restricted xmlns="urn:composition" id="7"><a>A</a></restricted>', true],
    ['<restricted xmlns="urn:composition" id="7"><b>2</b></restricted>', false],
    ['<restricted xmlns="urn:composition" id="7" gone="x"/>', false],
    ['<empty xmlns="urn:composition" id="7"/>', true],
    ['<empty xmlns="urn:composition" id="7"><a>A</a></empty>', false],
    ['<scalar xmlns="urn:composition">1.25</scalar>', true],
    ['<scalar xmlns="urn:composition">11</scalar>', false],
    ['<opaque xmlns="urn:composition" arbitrary="x">text<any xmlns="urn:unknown"/></opaque>', true],
];
function derivation(schema: ReturnType<typeof fixtureSchema>, name: string, kind: string) {
    const type = declaration(schema, 'complexType', name);
    const content = [...children(type, 'complexContent'), ...children(type, 'simpleContent')];
    expect(content).toHaveLength(1);
    const matches = children(content[0], kind);
    expect(matches).toHaveLength(1);
    return matches[0];
}
function sequenceShape(node: ReturnType<typeof fixtureSchema>) {
    const sequence = children(node, 'sequence');
    expect(sequence).toHaveLength(1);
    return children(sequence[0], 'element').map(child => [attribute(child, 'name'), attribute(child, 'type'), attribute(child, 'minOccurs')]);
}
async function qualifyPayloads(fixture: string, rows: readonly Payload[]) {
    const primary = await validateFixture(fixture, rows.map(([xml]) => xml));
    expect(primary).toMatchObject({ phase: 'schema', outcome: 'accepted', undisposed: {} });
    expect(primary.instances).toHaveLength(rows.length);
    rows.forEach(([xml, expected], i) => {
        expect(primary.instances![i].outcome, xml).toBe(expected ? 'accepted' : 'rejected');
        expect(selected('composition-finite-order-attribute-scalar-controls', selectedComposition(xml)), xml)
            .toMatchObject({ kind: 'selected-contract-assertion', accepted: expected });
    });
}

describe('NT-CONT-01 composition structural contracts', () => {
    it('NT-composition_contract-public_characterization_schema_and_payloads', async () => {
        const schema = fixtureSchema(path('derivation-boundaries.wsdl'));
        expect(sequenceShape(declaration(schema, 'complexType', 'Base'))).toEqual([['a', 'xs:string', '0'], ['b', 'xs:int', '0']]);
        const restriction = derivation(schema, 'Restricted', 'restriction');
        expect(attribute(restriction, 'base')).toBe('t:Base');
        expect(sequenceShape(restriction)).toEqual([['a', 'xs:string', '0']]);
        expect(children(restriction, 'attribute').map(node => [attribute(node, 'name'), attribute(node, 'use')])).toEqual([['gone', 'prohibited']]);
        const empty = derivation(schema, 'Empty', 'restriction');
        expect(children(empty, 'sequence')).toHaveLength(0);
        expect(attribute(empty, 'base')).toBe('t:Base');
        const extension = derivation(schema, 'Extended', 'extension');
        expect(attribute(extension, 'base')).toBe('t:Base');
        expect(sequenceShape(extension)).toEqual([['extra', 'xs:string', undefined]]);
        expect(sequenceShape(declaration(schema, 'complexType', 'Recursive'))).toEqual([['next', 't:Recursive', '0']]);
        await qualifyPayloads(path('derivation-boundaries.wsdl'), publicPayloads);
        expect(historical('test_public_characterization_schema_and_payloads', publicPayloads).kind).toBe('historical-external-observation');
        expect(unqualified('public derivations', 'No second complete derivation/recursive XSD engine').kind).toBe('unqualified-capability');
    });

    it('NT-composition_contract-schema_and_restriction_payloads', async () => {
        const schema = fixtureSchema(path('derivations.xsd'));
        const base = declaration(schema, 'complexType', 'Base');
        expect(sequenceShape(base)).toEqual([['a', 'xs:string', '0'], ['b', 'xs:int', '0']]);
        expect(children(base, 'attribute').map(node => [attribute(node, 'name'), attribute(node, 'type'), attribute(node, 'use')]))
            .toEqual([['id', 'xs:int', 'required'], ['tag', 'xs:token', undefined], ['gone', 'xs:string', undefined]]);
        const restricted = derivation(schema, 'Restricted', 'restriction');
        expect(attribute(restricted, 'base')).toBe('t:Base');
        expect(sequenceShape(restricted)).toEqual([['a', 'xs:string', '0']]);
        expect(children(restricted, 'attribute').map(node => [attribute(node, 'name'), attribute(node, 'use')])).toEqual([['gone', 'prohibited']]);
        expect(children(derivation(schema, 'Empty', 'restriction'), 'sequence')).toHaveLength(0);
        expect(sequenceShape(derivation(schema, 'Extended', 'extension'))).toEqual([['extra', 'xs:string', undefined]]);
        const exact = declaration(schema, 'simpleType', 'Exact');
        expect(attribute(descendants(exact, 'restriction')[0], 'base')).toBe('xs:decimal');
        expect(attribute(descendants(exact, 'minInclusive')[0], 'value')).toBe('0');
        expect(attribute(descendants(exact, 'fractionDigits')[0], 'value')).toBe('2');
        const scalar = derivation(schema, 'ScalarRestricted', 'restriction');
        expect(attribute(scalar, 'base')).toBe('t:Scalar');
        expect(attribute(children(scalar, 'maxInclusive')[0], 'value')).toBe('10');
        expect(attribute(derivation(schema, 'OpaqueExtension', 'extension'), 'base')).toBe('xs:anyType');
        await qualifyPayloads(path('derivations.xsd'), derivationPayloads);
        expect(historical('test_schema_and_restriction_payloads', derivationPayloads).kind).toBe('historical-external-observation');
        expect(unqualified('derivation facets', 'Full independent legality beyond these finite controls').kind).toBe('unqualified-capability');
        expect(selectedComposition('<restricted xmlns="urn:composition"><a>x</a></restricted>')).toBe(false);
        expect(selectedComposition('<extended xmlns="urn:composition" id="7"><extra>x</extra><b>2</b></extended>')).toBe(false);
    });

    it('NT-composition_contract-invalid_attribute_and_wildcard_restrictions', async () => {
        const files = ['required-prohibition', 'new-attribute', 'wildcard-widening', 'wildcard-weakening'] as const;
        for (const name of files) {
            const schema = fixtureSchema(path(name + '.xsd'));
            const base = declaration(schema, 'complexType', 'Base');
            const restriction = derivation(schema, 'Derived', 'restriction');
            expect(attribute(restriction, 'base')).toBe('t:Base');
            let satisfiesDeclaredConstraint: boolean;
            if (name === 'required-prohibition') {
                const original = children(base, 'attribute')[0], derived = children(restriction, 'attribute')[0];
                expect([attribute(original, 'name'), attribute(derived, 'name')]).toEqual(['id', 'id']);
                expect([attribute(original, 'use'), attribute(derived, 'use')]).toEqual(['required', 'prohibited']);
                satisfiesDeclaredConstraint = attribute(original, 'use') !== 'required' || attribute(derived, 'use') !== 'prohibited';
            } else if (name === 'new-attribute') {
                expect(children(base, 'attribute')).toHaveLength(0);
                expect(children(base, 'anyAttribute')).toHaveLength(0);
                expect(attribute(children(restriction, 'attribute')[0], 'name')).toBe('new');
                satisfiesDeclaredConstraint = children(restriction, 'attribute').every(node =>
                    children(base, 'attribute').some(original => attribute(original, 'name') === attribute(node, 'name')));
            } else {
                const original = children(base, 'anyAttribute')[0], derived = children(restriction, 'anyAttribute')[0];
                expect(attribute(original, 'namespace')).toBe('urn:external');
                if (name === 'wildcard-widening') {
                    expect(attribute(derived, 'namespace')).toBe('##any');
                    satisfiesDeclaredConstraint = attribute(derived, 'namespace')!.split(/\s+/)
                        .every(ns => attribute(original, 'namespace')!.split(/\s+/).includes(ns));
                } else {
                    expect(attribute(derived, 'namespace')).toBe('urn:external');
                    expect([attribute(original, 'processContents'), attribute(derived, 'processContents')]).toEqual(['strict', 'lax']);
                    const rank: Record<string, number> = { skip: 0, lax: 1, strict: 2 };
                    satisfiesDeclaredConstraint = rank[attribute(derived, 'processContents')!] >= rank[attribute(original, 'processContents')!];
                }
            }
            expect(selected('finite-restriction-constraint/' + name, satisfiesDeclaredConstraint).accepted).toBe(false);
            const primary = await validateFixture(path(name + '.xsd'));
            expect(primary, name).toMatchObject({ phase: 'schema', outcome: 'rejected' });
            expect(primary.instances).toBeUndefined();
            expect(primary.diagnostic).toBeTruthy();
        }
        expect(historical('test_invalid_attribute_and_wildcard_restrictions', files.map(name => ({ name, xmlschema: 'schema-rejected', libxml2: 'schema-rejected' }))).kind)
            .toBe('historical-external-observation');
        expect(unqualified('restriction legality', 'The finite predicates do not assess general restriction validity').kind).toBe('unqualified-capability');
    });

    it('NT-composition_contract-effective_mixed_base_and_group_prohibition', async () => {
        const schema = fixtureSchema(path('reviewed-boundaries.xsd'));
        expect(attribute(derivation(schema, 'OpaqueBase', 'extension'), 'base')).toBe('xs:anyType');
        const textRestriction = derivation(schema, 'Text', 'restriction');
        expect(attribute(textRestriction, 'base')).toBe('t:OpaqueBase');
        expect(children(textRestriction, 'simpleType')).toHaveLength(1);
        expect(attribute(descendants(children(textRestriction, 'simpleType')[0], 'restriction')[0], 'base')).toBe('xs:string');
        const inherited = derivation(schema, 'Inherited', 'restriction');
        expect(attribute(inherited, 'base')).toBe('t:OptionalBase');
        expect(children(inherited, 'attribute')).toHaveLength(0);
        expect(attribute(children(inherited, 'attributeGroup')[0], 'ref')).toBe('t:IgnoredProhibition');
        expect(children(declaration(schema, 'attributeGroup', 'IgnoredProhibition'), 'attribute').map(node => [attribute(node, 'name'), attribute(node, 'use')]))
            .toEqual([['a', 'prohibited']]);
        expect(children(declaration(schema, 'complexType', 'OptionalBase'), 'attribute').map(node => [attribute(node, 'name'), attribute(node, 'use')]))
            .toEqual([['a', undefined]]);
        const rows: readonly Payload[] = [
            ['<text xmlns="urn:composition">value</text>', true],
            ['<text xmlns="urn:composition"><child/></text>', false],
            ['<inherited xmlns="urn:composition" a="x"/>', true],
        ];
        await qualifyPayloads(path('reviewed-boundaries.xsd'), rows);
        expect(historical('test_effective_mixed_base_and_group_prohibition', rows).kind).toBe('historical-external-observation');
        expect(unqualified('mixed/group assessment', 'Complete second-engine mixed-content and group assessment').kind).toBe('unqualified-capability');
    });

    it('NT-composition_contract-recorded_constraint_disagreements', async () => {
        const fixed = fixtureSchema(path('fixed-restriction.xsd'));
        const original = children(declaration(fixed, 'complexType', 'Base'), 'attribute')[0];
        const derived = children(derivation(fixed, 'Derived', 'restriction'), 'attribute')[0];
        expect([attribute(original, 'type'), attribute(derived, 'type')]).toEqual(['xs:int', 'xs:int']);
        expect([attribute(original, 'fixed'), attribute(derived, 'fixed')]).toEqual(['1', '+01']);
        expect(selected('integer-fixed-value-equivalence', BigInt(attribute(original, 'fixed')!) === BigInt(attribute(derived, 'fixed')!)).accepted).toBe(true);
        expect(await validateFixture(path('fixed-restriction.xsd'))).toMatchObject({ phase: 'schema', outcome: 'accepted' });
        const xml = '<root xmlns="urn:composition" xmlns:e="urn:external" e:unknown="x"/>';
        for (const name of ['group-local-wildcard', 'nested-group-wildcard']) {
            const schema = fixtureSchema(path(name + '.xsd'));
            const wildcards = descendants(schema, 'anyAttribute');
            expect(wildcards).toHaveLength(2);
            expect(wildcards.map(node => attribute(node, 'processContents')).sort()).toEqual(['lax', 'strict']);
            const scopes = wildcards.map(node => attribute(node, 'namespace')!.split(/\s+/));
            const intersection = scopes[0].filter(ns => scopes[1].includes(ns));
            expect(intersection).toEqual(['urn:external']);
            const payload = parseXml(xml, name + '-instance');
            const unknown = payload.attributes.find(a => a.uri === 'urn:external')!;
            expect(unknown.local).toBe('unknown');
            // Strict effective processing requires the absent external declaration.
            const declared = children(schema, 'attribute').some(node => attribute(schema, 'targetNamespace') === unknown.uri && attribute(node, 'name') === unknown.local);
            const accepts = intersection.includes(unknown.uri) && (!wildcards.some(node => attribute(node, 'processContents') === 'strict') || declared);
            expect(selected('wildcard-intersection-and-strict-processing/' + name, accepts).accepted).toBe(false);
            const primary = await validateFixture(path(name + '.xsd'), [xml]);
            expect(primary).toMatchObject({ phase: 'schema', outcome: 'accepted', instances: [{ outcome: 'rejected' }] });
            expect(schema.uri).toBe(XSD);
        }
        const past = historical('test_recorded_constraint_disagreements', {
            fixedRestriction: { xmlschema: 'schema-rejected', libxml2: 'schema-accepted' },
            wildcardPayloads: [
                { fixture: 'group-local-wildcard.xsd', xmlschema: true, libxml2: false },
                { fixture: 'nested-group-wildcard.xsd', xmlschema: true, libxml2: false },
            ],
        });
        expect(past.kind).toBe('historical-external-observation');
        expect(unqualified('recorded xmlschema disagreements', 'No fresh xmlschema fixed/wildcard observation').kind).toBe('unqualified-capability');
    });
});
