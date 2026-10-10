import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { engine, localFixture, validateFixture } from './adapter.js';
import { attribute, children, expandedQName, parseXml, XSD } from './syntax.js';
import type { XmlNode } from './syntax.js';
import { View, probe, tablePredicate } from '../../research/re01/witness-probe.js';

const directory = 'xsd/re01/';
// Primary clauses below refer to the 2004 second edition:
// https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/
const namespace = 'urn:re01-particle';

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

function bounds(node: XmlNode): { minimum: bigint; maximum: bigint } {
    // These fixed contrasts contain finite decimal bounds; this is not an occurrence engine.
    return {
        minimum: BigInt(attribute(node, 'minOccurs') ?? '1'),
        maximum: BigInt(attribute(node, 'maxOccurs') ?? '1'),
    };
}

function declarations(group: XmlNode): readonly unknown[] {
    return children(group, 'element').map(node => ({
        name: attribute(node, 'name'),
        type: expandedQName(node, attribute(node, 'type')!),
        bounds: bounds(node),
    }));
}

describe('RE01 particle continuation: source clauses and live observations', () => {
    it('does not assume transitivity of the component particle restriction relation', () => {
        const schema = fixture('particle-map-and-sum-chain.xsd');
        const a = children(type(schema, 'A'), 'choice')[0];
        const b = children(branch(schema, 'B', 'restriction'), 'sequence')[0];
        const d = children(branch(schema, 'D', 'restriction'), 'sequence')[0];
        expect(expandedQName(branch(schema, 'B', 'restriction'), attribute(branch(schema, 'B', 'restriction'), 'base')!)).toEqual({ uri: namespace, local: 'A' });
        expect(expandedQName(branch(schema, 'D', 'restriction'), attribute(branch(schema, 'D', 'restriction'), 'base')!)).toEqual({ uri: namespace, local: 'B' });
        expect(bounds(a)).toEqual({ minimum: 2n, maximum: 2n });
        expect(bounds(b)).toEqual({ minimum: 1n, maximum: 1n });
        expect(bounds(d)).toEqual({ minimum: 1n, maximum: 1n });
        expect(declarations(a)).toEqual([
            { name: 'a', type: { uri: XSD, local: 'string' }, bounds: { minimum: 0n, maximum: 1n } },
            { name: 'b', type: { uri: XSD, local: 'string' }, bounds: { minimum: 0n, maximum: 1n } },
        ]);
        expect(declarations(b)).toEqual(declarations(a));
        expect(declarations(d)).toEqual(declarations(b).slice(0, 1));

        // rcase-MapAndSum.2 counts direct members, not effective total range.
        // With the identical optional string member pairs above, A -> B has range 2..2.
        const mappedCount = BigInt(children(b, 'element').length);
        expect(bounds(b).minimum * mappedCount).toBe(bounds(a).minimum);
        expect(bounds(b).maximum * mappedCount).toBe(bounds(a).maximum);

        // cos-particle-restrict.2.2 ignores D's singleton sequence (its bounds are 1..1).
        // rcase-RecurseAsIfGroup gives that remaining element a synthetic 1..1 sequence.
        // rcase-Recurse permits B's unmapped b to be skipped because it has minOccurs=0.
        expect(children(d, 'element')).toHaveLength(1);
        expect(bounds(children(b, 'element')[1]).minimum).toBe(0n);

        // The same wrapper is a choice for direct D -> A; range-ok.1 fails: 1 < 2.
        // This is a fixed component-rule contrast, not a general type invalidity decision.
        const asIfGroupMinimum = 1n;
        expect(asIfGroupMinimum >= bounds(b).minimum).toBe(true);
        expect(asIfGroupMinimum >= bounds(a).minimum).toBe(false);
    });

    it('preserves raw singleton-all placement despite restriction pointlessness', () => {
        const schema = fixture('particle-singleton-all-nested-extension.xsd');
        const all = children(type(schema, 'A'), 'all')[0];
        const extension = branch(schema, 'E', 'extension');
        const suffix = children(extension, 'sequence')[0];
        expect(bounds(all)).toEqual({ minimum: 0n, maximum: 1n });
        expect(declarations(all)).toEqual([
            { name: 'a', type: { uri: XSD, local: 'string' }, bounds: { minimum: 1n, maximum: 1n } },
        ]);
        expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({ uri: namespace, local: 'A' });
        expect(children(suffix, 'choice')).toHaveLength(1);
        expect(children(children(suffix, 'choice')[0], 'element')).toHaveLength(0);
        expect(bounds(children(suffix, 'choice')[0])).toEqual({ minimum: 1n, maximum: 1n });
        expect(attribute(children(suffix, 'any')[0], 'processContents')).toBe('skip');

        // cos-particle-restrict.2.2 calls singleton all pointless only for restriction.
        // cos-particle-extend.2 preserves A's raw first member recursively.
        // cos-all-limited.1 forbids that all inside the extension's new sequence.
        // Its raw formal minimum is zero; deleting the wrapper without carrying bounds
        // would produce the child's minimum one and is not a certified normalization.
        expect(bounds(all).minimum * bounds(children(all, 'element')[0]).minimum).toBe(0n);
        expect(bounds(children(all, 'element')[0]).minimum).toBe(1n);

        const raw = new View('A/all', 'all', {
            minimum: '0', schemaEmptiable: true,
            children: [new View('A/all/a', 'element', { typeReference: 'xs:string' })],
        });
        const final = new View('D/a', 'element', { typeReference: 'xs:int' });
        expect(probe({ ancestor: raw, final, normalizationCertified: true, nonvacuousExtensionAllowed: false }, tablePredicate([])))
            .toMatchObject({ kind: 'unresolved', candidate: null });
        // This conditional probe does not convert a source gate or failed family into invalidity.
        expect(probe({ ancestor: raw, final: raw, normalizationCertified: true, nonvacuousExtensionAllowed: false }, tablePredicate([[raw.source, raw.source, true]])))
            .toMatchObject({ kind: 'particle-witness', candidate: 'vacuous' });
    });

    it('keeps the original final exclusion even for a vacuous particle extension', () => {
        const schema = fixture('particle-final-extension-prohibited.xsd');
        const a = type(schema, 'A');
        const extension = branch(schema, 'E', 'extension');
        expect(attribute(a, 'final')).toBe('extension');
        expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({ uri: namespace, local: 'A' });
        expect(children(extension, 'sequence')).toHaveLength(0);
        // cos-ct-extends.1.1 checks the original base's final before particle vacuity.
        // Finality is not inherited (Complex_Type_Definition_details), so looking only
        // at a later restriction's final would erase this original ancestor obligation.
    });

    it('uses independent named scalar premises without turning a failed family into invalidity', () => {
        const cases: readonly (readonly [string, string, boolean])[] = [
            ['particle-direct-token-restriction.xsd', 'token', true],
            ['particle-direct-int-restriction.xsd', 'int', false],
        ];
        for (const [name, scalar, pairPremise] of cases) {
            const schema = fixture(name);
            const baseGroup = children(type(schema, 'A'), 'sequence')[0];
            const finalGroup = children(branch(schema, 'D', 'restriction'), 'sequence')[0];
            expect(bounds(baseGroup)).toEqual({ minimum: 1n, maximum: 1n });
            expect(bounds(finalGroup)).toEqual({ minimum: 1n, maximum: 1n });
            expect(declarations(baseGroup)).toEqual([
                { name: 'a', type: { uri: XSD, local: 'string' }, bounds: { minimum: 1n, maximum: 1n } },
            ]);
            expect(declarations(finalGroup)).toEqual([
                { name: 'a', type: { uri: XSD, local: scalar }, bounds: { minimum: 1n, maximum: 1n } },
            ]);
            // Both singleton sequences normalize to their elements, with unchanged 1..1 bounds.
            // rcase-NameAndTypeOK.3.2.5 invokes cos-st-derived-ok with {extension,list,union}.
            // The fixed built-in premises are independent of the probe:
            // datatypes.html#token follows normalizedString -> string; #int follows long
            // -> integer -> decimal and does not have string as a base.
            const base = new View('A/a', 'element', { typeReference: 'xs:string' });
            const final = new View('D/a', 'element', { typeReference: 'xs:' + scalar });
            const result = probe({ ancestor: base, final, normalizationCertified: true, nonvacuousExtensionAllowed: true },
                tablePredicate([[final.source, base.source, pairPremise]]));
            expect(result, name).toMatchObject(pairPremise
                ? { kind: 'particle-witness', candidate: 'vacuous' }
                : { kind: 'unresolved', candidate: null });
        }
    });

    it('distinguishes a simple original anchor and explicit inline scalar source incidence', () => {
        const original = fixture('particle-simple-content-original-chain.xsd');
        const originalBase = children(children(type(original, 'A'), 'simpleContent')[0], 'extension')[0];
        const originalFinal = children(children(type(original, 'D'), 'simpleContent')[0], 'extension')[0];
        expect(expandedQName(originalBase, attribute(originalBase, 'base')!)).toEqual({ uri: XSD, local: 'string' });
        expect(expandedQName(originalFinal, attribute(originalFinal, 'base')!)).toEqual({ uri: namespace, local: 'A' });
        expect(children(originalFinal, 'simpleType')).toHaveLength(0);
        // Built-in Simple Type Definition gives string -> anySimpleType -> anyType.
        // Hence cos-ct-extends.1.5 for D (complex base A) has a simple ancestor;
        // the first A extension from a simple base instead uses cos-ct-extends.2.

        const witness = fixture('particle-simple-content-inline-anchor-witness.xsd');
        const witnessExtension = children(children(type(witness, 'E'), 'simpleContent')[0], 'extension')[0];
        const witnessRestriction = children(children(type(witness, 'D'), 'simpleContent')[0], 'restriction')[0];
        expect(expandedQName(witnessExtension, attribute(witnessExtension, 'base')!)).toEqual({ uri: XSD, local: 'anySimpleType' });
        expect(expandedQName(witnessRestriction, attribute(witnessRestriction, 'base')!)).toEqual({ uri: namespace, local: 'E' });
        const inline = children(witnessRestriction, 'simpleType');
        expect(inline).toHaveLength(1);
        expect(attribute(inline[0], 'name')).toBeUndefined();
        const inlineRestriction = children(inline[0], 'restriction')[0];
        expect(expandedQName(inlineRestriction, attribute(inlineRestriction, 'base')!)).toEqual({ uri: XSD, local: 'string' });
        expect(inline[0].source).not.toBe(originalBase.source);
        // The explicit inline simpleType has no name and introduces another source node.
        // This asserts source incidence, not equality of the final mapped scalar.

        const noInline = fixture('particle-simple-content-no-inline-restriction.xsd');
        const noInlineExtension = children(children(type(noInline, 'E'), 'simpleContent')[0], 'extension')[0];
        const noInlineRestriction = children(children(type(noInline, 'D'), 'simpleContent')[0], 'restriction')[0];
        expect(expandedQName(noInlineExtension, attribute(noInlineExtension, 'base')!)).toEqual({ uri: XSD, local: 'string' });
        expect(children(noInlineRestriction, 'simpleType')).toHaveLength(0);
        // Content mapping std2cl starts from the base scalar in this empty-facet case.
        // st-restrict-facets does not itself require a fresh name, identity or base edge;
        // it therefore cannot prove that every restriction creates an anonymous scalar.
        // No complete whole-opaque-anyType assessment or source witness impossibility
        // is inferred from this local builtin-chain/source-incidence contrast.
    });

    it('records fresh libxml2 observations separately from the component-rule assertions', async () => {
        expect(engine).toMatchObject({ package: 'libxml2-wasm', version: '0.7.2', engine: 'libxml2', engineVersion: '2.15.1' });
        const cases: readonly (readonly [string, 'accepted' | 'rejected'])[] = [
            ['particle-map-and-sum-step.xsd', 'accepted'],
            ['particle-map-and-sum-chain.xsd', 'accepted'],
            ['particle-map-and-sum-direct.xsd', 'accepted'],
            ['particle-singleton-all-vacuous.xsd', 'accepted'],
            ['particle-singleton-all-nested-extension.xsd', 'rejected'],
            ['particle-singleton-all-restoration.xsd', 'accepted'],
            ['particle-direct-token-restriction.xsd', 'accepted'],
            ['particle-direct-int-restriction.xsd', 'accepted'],
            ['particle-final-extension-prohibited.xsd', 'rejected'],
            ['particle-simple-content-original-chain.xsd', 'accepted'],
            ['particle-simple-content-inline-anchor-witness.xsd', 'accepted'],
            ['particle-simple-content-no-inline-restriction.xsd', 'accepted'],
        ];
        for (const [name, outcome] of cases) {
            const observation = await validateFixture(directory + name);
            expect(observation, name).toMatchObject({ phase: 'schema', outcome });
            expect(observation.fixtureHashes[directory + name], name).toMatch(/^[a-f0-9]{64}$/);
            if (name === 'particle-singleton-all-nested-extension.xsd')
                expect(observation.diagnostic).toContain("'all' model group");
        }
        // Engine acceptance of the direct, int and restoration contrasts is an observation.
        // It does not prove particle transitivity or a full RE01 existential witness.
    }, 60000);
});
