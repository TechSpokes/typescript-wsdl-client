import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { localFixture, validateFixture } from './adapter.js';
import type { HistoricalObservation } from './evidence.js';
import { selected } from './evidence.js';
import { historicalSources } from './historical-source.js';
import { attribute, children, expandedQName, parseXml, XSD } from './syntax.js';
import type { XmlNode } from './syntax.js';

const directory = 'xsd/re01/';
const source = historicalSources().get('test/conformance/reference/s06_re01_contract_test.py')!;
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const contracts: Readonly<Record<string, readonly [number, number, string]>> = {
    all_eleven_fixed_schema_observations_ran: [22, 41, 'd19009424b095ddb9ee6f51d317c2016f3dcec96ea00d5b32a3fbdfbce5d590d'],
    au_witness_changes_hypothetical_source_incidence_not_real_identity: [42, 74, '7c776bfb065388f30a07499c5a7fc888f6073aa75e3197b434a445578587b2e9'],
    pointless_prefix_repeated_final_accepts_exact_seventeen_pairs: [75, 84, 'd778db68082d93511f1680c591a3b37e69b944fd0c5cf706d5f7cd0602a22571'],
    dead_intermediate_instance_is_separate_from_schema_mapping: [85, 98, '798b8ef2deb35f5fde5ebd38cc6d9c8a91f0ce55a90bd3c703fa0098b743cae2'],
};
interface SchemaCase { fixture: string; sha256: string; xmlschema: 'accepted' | 'rejected'; libxml2: 'accepted' | 'rejected'; primary: string }
const rows = (JSON.parse(readFileSync(localFixture(directory + 'expectations.json'), 'utf8')) as { cases: SchemaCase[] }).cases;
function historical(method: keyof typeof contracts, value: unknown): HistoricalObservation {
    const [start, end, hash] = contracts[method];
    expect(digest(source.split('\n').slice(start - 1, end).join('\n')), method).toBe(hash);
    return { kind: 'historical-external-observation', baseline: 'f4e39e819f2d9aa264cfdd14d16154c6443c9bac', engine: 'xmlschema 4.2.0; lxml 6.1.0/libxml2 2.14.6', sourceContractSha256: hash, value };
}
function pinned(name: string): string {
    const row = rows.find(row => row.fixture === name)!;
    expect(row, name).toBeDefined();
    const text = readFileSync(localFixture(directory + name), 'utf8');
    expect(digest(text), name).toBe(row.sha256);
    return text;
}
function type(document: XmlNode, name: string): XmlNode {
    const found = children(document, 'complexType').filter(node => attribute(node, 'name') === name);
    expect(found).toHaveLength(1);
    return found[0];
}
function derivation(document: XmlNode, name: string, kind: string): XmlNode {
    const found = children(children(type(document, name), 'complexContent')[0], kind);
    expect(found).toHaveLength(1);
    return found[0];
}
const plainAttributes = (node: XmlNode) => Object.fromEntries(node.attributes.filter(a => !a.uri).map(a => [a.local, a.value]));
describe('RE01 NT-CONT-01 scoped and primary evidence', () => {
    it('all_eleven_fixed_schema_observations_ran', async () => {
        historical('all_eleven_fixed_schema_observations_ran', rows.map(row => ({ fixture: row.fixture, xmlschema: row.xmlschema, libxml2: row.libxml2 })));
        expect(rows).toHaveLength(11);
        for (const row of rows) {
            pinned(row.fixture);
            const result = await validateFixture(directory + row.fixture);
            expect(result, row.fixture).toMatchObject({ phase: 'schema', outcome: row.libxml2 });
            expect(result.fixtureHashes[directory + row.fixture]).toBe(row.sha256);
        }
        // The fixture decision is still a mapping recommendation, never a completeness verdict.
        expect(rows.find(row => row.fixture === 'au-source-original.xsd')!.primary).toBe('unresolved-RE-witness-equivalence');
        expect(rows.find(row => row.fixture === 'au-source-witness.xsd')!.primary).toBe('unresolved-RE-witness-equivalence');
    }, 60000);
    it('au_witness_changes_hypothetical_source_incidence_not_real_identity', () => {
        historical('au_witness_changes_hypothetical_source_incidence_not_real_identity', 'syntax identities only; not a fresh schema or RE equivalence verdict');
        const original = parseXml(pinned('au-source-original.xsd'), directory + 'au-source-original.xsd');
        const witness = parseXml(pinned('au-source-witness.xsd'), directory + 'au-source-witness.xsd');
        for (const document of [original, witness]) {
            const globals = children(document, 'attribute');
            expect(globals).toHaveLength(1);
            expect(plainAttributes(globals[0])).toEqual({ name: 'g', type: 'xs:int' });
            expect(expandedQName(globals[0], attribute(globals[0], 'type')!)).toEqual({ uri: XSD, local: 'int' });
            const base = children(type(document, 'A'), 'attribute');
            expect(base).toHaveLength(1);
            expect(plainAttributes(base[0])).toEqual({ ref: 't:g', fixed: '1' });
            expect(expandedQName(base[0], attribute(base[0], 'ref')!)).toEqual({ uri: attribute(document, 'targetNamespace'), local: 'g' });
        }
        const originalBranch = derivation(original, 'D', 'extension'), intermediateBranch = derivation(witness, 'E', 'extension'), finalBranch = derivation(witness, 'D', 'restriction');
        const originalLocal = children(originalBranch, 'attribute'), intermediateLocal = children(intermediateBranch, 'attribute');
        expect(originalLocal).toHaveLength(1); expect(intermediateLocal).toHaveLength(1);
        expect(plainAttributes(originalLocal[0])).toEqual({ ref: 't:g', fixed: '2' });
        expect(plainAttributes(intermediateLocal[0])).toEqual({ ref: 't:g', fixed: '2' });
        expect(children(finalBranch, 'attribute')).toEqual([]);
        expect(originalBranch.local).not.toBe(finalBranch.local);
        expect(originalLocal[0]).not.toBe(intermediateLocal[0]);
        expect(originalLocal[0].source).not.toBe(intermediateLocal[0].source);
        expect(originalLocal[0].path).not.toBe(intermediateLocal[0].path);
        expect(selected('RE01 actual source incidence, not hypothetical AU equivalence', true).kind).toBe('selected-contract-assertion');
    });
    it('pointless_prefix_repeated_final_accepts_exact_seventeen_pairs', async () => {
        historical('pointless_prefix_repeated_final_accepts_exact_seventeen_pairs', [[16, false], [17, true], [18, false]]);
        const fixture = directory + 'pointless-prefix-repeated-final.xsd', schema = parseXml(pinned('pointless-prefix-repeated-final.xsd'), fixture);
        const sequence = children(derivation(schema, 'B', 'restriction'), 'sequence')[0];
        expect(attribute(sequence, 'minOccurs')).toBe('17'); expect(attribute(sequence, 'maxOccurs')).toBe('17');
        const lower = BigInt(attribute(sequence, 'minOccurs')!), upper = BigInt(attribute(sequence, 'maxOccurs')!);
        const memberNames = children(sequence, 'element').map(n => attribute(n, 'name'));
        expect(memberNames).toEqual(['a', 'b']);
        const accepts = (xml: string) => {
            const payload = parseXml(xml, fixture + ':selected-payload');
            if (payload.local !== 'root' || payload.uri !== 'urn:re01' || payload.children.length % memberNames.length !== 0) return false;
            const repeats = BigInt(payload.children.length / memberNames.length);
            return repeats >= lower && repeats <= upper && payload.children.every((node, index) => node.uri === 'urn:re01' && node.local === memberNames[index % 2] && !node.children.length);
        };
        const cases: readonly (readonly [number, boolean])[] = [[16, false], [17, true], [18, false]];
        const xml = cases.map(([repeats]) => "<root xmlns='urn:re01'>" + '<a>x</a><b>x</b>'.repeat(repeats) + '</root>');
        cases.forEach(([, expected], i) => expect(selected('RE01 exact ordered seventeen pairs', accepts(xml[i])).accepted).toBe(expected));
        expect(accepts("<root xmlns='urn:re01'>" + '<b>x</b><a>x</a>'.repeat(17) + '</root>')).toBe(false);
        expect(accepts("<root xmlns='urn:other'>" + '<a>x</a><b>x</b>'.repeat(17) + '</root>')).toBe(false);
        const result = await validateFixture(fixture, xml);
        expect(result).toMatchObject({ phase: 'schema', outcome: 'accepted' });
        expect(result.instances?.map(row => row.outcome)).toEqual(['rejected', 'accepted', 'rejected']);
    });
    it('dead_intermediate_instance_is_separate_from_schema_mapping', async () => {
        historical('dead_intermediate_instance_is_separate_from_schema_mapping', ['rejected', 'rejected']);
        const fixture = directory + 're-dead-wildcard-intermediate.xsd', schema = parseXml(pinned('re-dead-wildcard-intermediate.xsd'), fixture);
        const extension = derivation(schema, 'E', 'extension'), sequence = children(extension, 'sequence')[0];
        expect(sequence.children.map(node => node.local)).toEqual(['choice', 'any']);
        expect(children(sequence, 'choice')[0].children).toEqual([]);
        expect(attribute(children(sequence, 'any')[0], 'minOccurs')).toBe('0');
        expect(attribute(children(sequence, 'any')[0], 'maxOccurs')).toBe('unbounded');
        const xml = ["<root xmlns='urn:review'/>", "<root xmlns='urn:review'><a xmlns=''>x</a></root>"];
        const result = await validateFixture(fixture, xml);
        expect(result).toMatchObject({ phase: 'schema', outcome: 'accepted' });
        expect(result.instances?.map(row => row.outcome)).toEqual(['rejected', 'rejected']);
        expect(rows.find(row => row.fixture === 're-dead-wildcard-intermediate.xsd')!.primary).toBe('valid');
        expect(selected('RE01 required empty choice admits neither literal payload; separate from mapping legality', false).accepted).toBe(false);
    });
});
