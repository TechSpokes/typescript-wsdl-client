import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Budget, Operand, ProbeFailure, conditionalConstraints, conditionalC1Augmentation, sameValue, replacementRestrictionAttributes, literalRestrictionAttributes } from '../../research/s06-au01/probe.js';
import type { Value } from '../../research/s06-au01/probe.js';
import { restrictionFixture } from '../../research/s06-au01/fixture-input.js';
import { engine, localFixture, validateFixture } from './adapter.js';
import type { HistoricalObservation } from './evidence.js';
import { selected } from './evidence.js';
import { historicalSources } from './historical-source.js';
import { AuFixture, AU_NAMESPACE, typedFixedOperand } from './scoped-au.js';
import { attribute, children, parseXml } from './syntax.js';

const directory = 'xsd/attributes/au01/';
const sourcePath = 'test/conformance/reference/s06_au01_contract_test.py';
const source = historicalSources().get(sourcePath)!;
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const sourceContracts: Readonly<Record<string, readonly [number, number, string]>> = {
    '25_schema_observations_keep_reference_separate': [223, 235, 'fb2861086ef8e807acc28447be23109303f777ff06f49e2228f9f448184a2ece'],
    identity_prohibition_and_global_constraint_observations: [236, 284, 'c4134a9f2358c65a3448fab3f6475ac28614d536c25e7c1b4d834958bf286f06'],
    xmlschema_order_dependent_default_observations: [285, 294, '3d8e798444cb256f3f138a13dac31cb5776cf728a28e47d02ba69524a9f0b756'],
    restriction_20_reference_observations_are_separate_from_selected_predicate: [351, 383, 'ab66b16251340e720497e50366863f4ce3b8b66be32a658edbc594bf98ebd83a'],
    typed_fixed_payload_contrasts: [431, 450, 'c16a0c342628371b0d1df9f3fa2d02fcdd5959b012c70d48fdc6d83ca935773d'],
};
function sourceBlock(method: keyof typeof sourceContracts): string {
    const [start, end, hash] = sourceContracts[method];
    const block = source.split('\n').slice(start - 1, end).join('\n');
    expect(digest(block), method).toBe(hash);
    return block;
}
function historical(method: keyof typeof sourceContracts, value: unknown): HistoricalObservation {
    sourceBlock(method);
    const hash = sourceContracts[method][2];
    return { kind: 'historical-external-observation', baseline: 'f4e39e819f2d9aa264cfdd14d16154c6443c9bac', engine: 'xmlschema 4.2.0; lxml 6.1.0/libxml2 2.14.6', sourceContractSha256: hash, value };
}
function pinnedFixture(name: string): string {
    const manifest = JSON.parse(readFileSync(new URL('../s06-research-manifest.json', import.meta.url), 'utf8')) as {
        contracts: Array<{ artifacts: Array<{ path: string; role: string; sha256: string }> }>;
    };
    const file = directory + name + '.xsd';
    const row = manifest.contracts.flatMap(c => c.artifacts).find(a => a.path === 'test/conformance/fixtures/' + file);
    expect(row, file).toBeDefined();
    expect(digest(readFileSync(localFixture(file), 'utf8')), file).toBe(row!.sha256);
    return file;
}
function failure(fn: () => unknown, category = 'invalid-schema'): void {
    try { fn(); throw new Error('Expected AU01 failure'); }
    catch (error) { expect(error).toBeInstanceOf(ProbeFailure); expect((error as ProbeFailure).category).toBe(category); }
}
const label = (value: Value) => typeof value !== 'string' ? value[1] : value === 'type-space' ? 'any' : value === 'augmentation-conflict' ? 'conflict' : value;
const states = ['none', 'default-one', 'default-two', 'fixed-one', 'fixed-two'] as const;
const historicalOptional: Readonly<Record<typeof states[number], readonly boolean[]>> = {
    none: [true, true, true, true, true], 'default-one': [true, true, true, true, true],
    'default-two': [true, true, true, true, true], 'fixed-one': [false, false, false, true, false],
    'fixed-two': [false, false, false, false, true],
};
const conditionalRows: Readonly<Record<typeof states[number], readonly (readonly [string, string])[]>> = {
    none: [['any', 'absent'], ['any', '1'], ['any', '2'], ['1', '1'], ['2', '2']],
    'default-one': [['any', '1'], ['any', '1'], ['any', 'conflict'], ['1', '1'], ['2', 'conflict']],
    'default-two': [['any', '2'], ['any', 'conflict'], ['any', '2'], ['1', 'conflict'], ['2', '2']],
    'fixed-one': [['1', '1'], ['1', '1'], ['1', 'conflict'], ['1', '1'], ['none', 'conflict']],
    'fixed-two': [['2', '2'], ['2', 'conflict'], ['2', '2'], ['none', 'conflict'], ['2', '2']],
};
// Literal historical schema outcomes. Selected source/component legality is a separate column.
const identityCases: Readonly<Record<string, readonly [boolean, boolean, boolean]>> = {
    'direct-distinct-local': [false, false, false], 'direct-same-global': [false, false, true],
    'group-reused-au': [false, false, true], 'group-direct-distinct-au': [false, false, false],
    'group-nested-distinct-au': [false, false, false], 'required-default': [false, false, false],
    'restriction-omitted-required': [true, true, true], 'restriction-prohibited-required': [false, false, false],
    'extension-prohibited-required': [false, true, true], 'group-prohibited-required': [true, true, true],
    'global-fixed-equivalent': [false, true, true], 'global-fixed-conflicting': [false, true, false],
    'global-fixed-default': [true, false, false], 'global-default-required': [true, true, true],
    'extension-required-fixed-optional-none': [false, false, true], 'extension-optional-none-required-fixed': [true, false, true],
    'extension-required-none-optional-none': [false, false, true], 'extension-optional-none-required-none': [true, false, true],
    'extension-required-fixed-optional-fixed': [false, false, true], 'extension-optional-fixed-required-fixed': [false, false, true],
};
const restrictionCases: Readonly<Record<string, readonly [boolean, boolean, boolean, boolean]>> = {
    'required-first-optional-replacement': [false, false, false, false], 'required-second-optional-replacement': [false, false, false, false],
    'required-first-required-replacement': [false, false, true, true], 'required-second-required-replacement': [true, false, true, true],
    'fixed-conflict-first-one-replacement': [false, false, false, false], 'fixed-conflict-second-one-replacement': [false, false, false, false],
    'fixed-equivalent-first-one-replacement': [false, false, true, true], 'fixed-equivalent-second-one-replacement': [false, false, true, true],
    'fixed-conflict-omitted': [false, false, true, false], 'required-mixed-omitted': [false, false, true, false],
    'fixed-conflict-prohibited': [false, false, true, true], 'required-mixed-prohibited': [false, false, false, false],
    'fixed-conflict-group-prohibited': [false, false, true, false], 'default-conflict-default-replacement': [true, false, true, true],
    'fixed-none-one-replacement': [false, false, true, true], 'fixed-none-unfixed-replacement': [false, false, false, false],
    'type-token': [true, true, true, true], 'type-unrelated': [false, false, false, false],
    'qname-equivalent': [false, true, true, true], 'qname-distinct': [true, true, false, false],
};
describe('AU01 NT-CONT-01 scoped and primary evidence', () => {
    it('25_schema_observations_keep_reference_separate', async () => {
        const old = historical('25_schema_observations_keep_reference_separate', historicalOptional);
        expect(old.kind).toBe('historical-external-observation');
        const frozenRows = source.slice(source.indexOf('XMLSCHEMA_ROWS ='), source.indexOf('# Conditional-C')).replace(/[ \t\r\n]/g, '');
        for (const [state, observations] of Object.entries(historicalOptional))
            expect(frozenRows).toContain('"' + state + '":(' + observations.map(v => v ? 'True' : 'False').join(',') + ')');
        for (const a of states) for (const [column, b] of states.entries()) {
            const fixture = pinnedFixture('extension-' + a + '-' + b), mapped = new AuFixture(fixture), uses = mapped.uses('Derived');
            expect(uses).toHaveLength(2);
            expect(uses[0]).not.toBe(uses[1]);
            const summary = conditionalConstraints(uses, new Budget());
            expect([label(summary.present), label(summary.absent)], fixture).toEqual(conditionalRows[a][column]);
            expect(summary.originals[0]).toBe(uses[0]); expect(summary.originals[1]).toBe(uses[1]);
            const reversed = conditionalConstraints([...uses].reverse(), new Budget());
            expect([label(reversed.present), label(reversed.absent)]).toEqual(conditionalRows[a][column]);
            if (conditionalRows[a][column][1] === 'conflict') failure(() => conditionalC1Augmentation(uses, new Budget()), 'invalid-value');
            else expect(selected('AU01 C1 absent augmentation', summary.proposedC1Absent === 'accepted').accepted).toBe(true);
            const primary = await validateFixture(fixture);
            expect(primary, fixture).toMatchObject({ phase: 'schema', outcome: 'rejected' });
            expect(engine.engineVersion).toBe('2.15.1');
        }
    }, 60000);
    it('identity_prohibition_and_global_constraint_observations', async () => {
        historical('identity_prohibition_and_global_constraint_observations', identityCases);
        const oldBlock = sourceBlock('identity_prohibition_and_global_constraint_observations');
        expect(Object.keys(identityCases)).toHaveLength(20);
        for (const [name, [xmlschema, libxml2, admitted]] of Object.entries(identityCases)) {
            expect(oldBlock).toContain('"' + name + '": (' + (xmlschema ? 'True' : 'False') + ', ' + (libxml2 ? 'True' : 'False') + ')');
            const fixture = pinnedFixture(name), mapped = new AuFixture(fixture);
            if (!admitted) failure(() => mapped.uses());
            else {
                const uses = mapped.uses();
                if (name === 'group-reused-au') { expect(uses).toHaveLength(1); expect(mapped.uses()[0]).toBe(uses[0]); }
                if (name === 'direct-same-global') { expect(uses).toHaveLength(2); expect(uses[0]).not.toBe(uses[1]); expect(uses[0].declaration).toBe(uses[1].declaration); }
                if (name === 'global-default-required') expect(uses[0]).toMatchObject({ required: true, kind: 'default', constraintOrigin: 'declaration' });
                if (name === 'global-fixed-equivalent') {
                    expect(uses[0].operand!.lexical).toBe('+01');
                    expect(conditionalC1Augmentation(uses, new Budget())!.admittedWitness).toBe(uses[0].operand);
                }
                if (name.startsWith('extension-') && name.includes('-required-') && !name.includes('prohibited')) {
                    const summary = conditionalConstraints(uses, new Budget());
                    expect(summary.required).toBe(true);
                    expect(summary.absent).toBe('reject-required');
                    expect(summary.present).toEqual(name.includes('fixed') ? ['decimal', '1'] : 'type-space');
                    for (const value of ['1', '2', '3']) {
                        const admitted = uses.every(original => original.kind !== 'fixed' || sameValue(original.operand!, new Operand('integer', value), new Budget()));
                        expect(selected('AU01 inherited requiredness and every fixed operand', admitted).accepted).toBe(!name.includes('fixed') || value === '1');
                    }
                    failure(() => conditionalC1Augmentation(uses, new Budget()), 'invalid-value');
                    summary.originals.forEach((original, i) => expect(original).toBe(uses[i]));
                }
            }
            const primary = await validateFixture(fixture);
            expect(primary, fixture).toMatchObject({ phase: 'schema', outcome: libxml2 ? 'accepted' : 'rejected' });
        }
        for (const name of ['restriction-omitted-required', 'extension-prohibited-required', 'group-prohibited-required', 'global-default-required']) {
            const fixture = pinnedFixture(name), uses = new AuFixture(fixture).uses(), prefix = name === 'global-default-required' ? 'xmlns:t="urn:s06:au01" t:' : '';
            expect(uses).toHaveLength(1);
            expect(conditionalConstraints(uses, new Budget())).toMatchObject({ required: true, absent: 'reject-required' });
            const present = '<root xmlns="urn:s06:au01" ' + prefix + 'a="' + (name === 'global-default-required' ? '2' : 'x') + '"/>';
            const primary = await validateFixture(fixture, [present, '<root xmlns="urn:s06:au01"/>']);
            expect(primary).toMatchObject({ phase: 'schema', outcome: 'accepted' });
            expect(primary.instances?.map(i => i.outcome), name).toEqual(['accepted', 'rejected']);
            expect(uses[0].source).toContain(fixture);
        }
    }, 60000);
    it('xmlschema_order_dependent_default_observations', async () => {
        const old = historical('xmlschema_order_dependent_default_observations', [
            { base: 'default-one', local: 'default-two', augmentedValue: 2 },
            { base: 'default-two', local: 'default-one', augmentedValue: 1 },
        ]);
        expect(old.value).toEqual([{ base: 'default-one', local: 'default-two', augmentedValue: 2 }, { base: 'default-two', local: 'default-one', augmentedValue: 1 }]);
        for (const [a, b] of [['default-one', 'default-two'], ['default-two', 'default-one']]) {
            const fixture = pinnedFixture('extension-' + a + '-' + b), uses = new AuFixture(fixture).uses('Derived');
            failure(() => conditionalC1Augmentation(uses, new Budget()), 'invalid-value');
            expect(conditionalConstraints(uses, new Budget()).present).toBe('type-space');
            for (const integer of [1, 2, 3]) {
                const payload = parseXml('<root xmlns="urn:s06:au01" xmlns:t="urn:s06:au01" t:a="' + integer + '"/>', fixture + ':present-' + integer);
                const actual = payload.attributes.find(attribute => attribute.uri === AU_NAMESPACE && attribute.local === 'a')!;
                expect(actual.value).toBe(String(integer));
                expect(selected('AU01 conflicting defaults present integer', /^\+?[0-9]+$/.test(actual.value)).accepted).toBe(true);
            }
            const primary = await validateFixture(fixture, ['<root xmlns="urn:s06:au01" xmlns:t="urn:s06:au01"/>', ...[1, 2, 3].map(n => '<root xmlns="urn:s06:au01" xmlns:t="urn:s06:au01" t:a="' + n + '"/>')]);
            expect(primary).toMatchObject({ phase: 'schema', outcome: 'rejected' });
            expect(primary.instances).toBeUndefined();
        }
        // Ordinary controls use the original unambiguous sources; no synthetic default winner is invented.
        for (const state of ['default-one', 'fixed-one'] as const) {
            const fixture = pinnedFixture('extension-none-' + state), uses = new AuFixture(fixture).uses('Derived');
            const augmentation = conditionalC1Augmentation(uses, new Budget())!;
            expect(augmentation).toMatchObject({ name: [AU_NAMESPACE, 'a'], scalarType: 'integer', value: ['decimal', '1'] });
            expect(augmentation.admittedWitness).toBe(uses[1].operand);
            expect(augmentation.admittedWitness.lexical).toBe('1');
            expect(augmentation.admittedWitness.namespaces).toContainEqual(['t', AU_NAMESPACE]);
            expect(augmentation.admittedWitness.source).toBe(uses[1].source);
            augmentation.contributingUses.forEach((actual, i) => expect(actual).toBe(uses[i]));
            for (const actual of ['1', '2', '3']) expect(selected('AU01 ordinary present ' + state, state === 'default-one' || sameValue(uses[1].operand!, new Operand('integer', actual), new Budget())).accepted).toBe(state === 'default-one' || actual === '1');
        }
    });
    it('restriction_20_reference_observations_are_separate_from_selected_predicate', async () => {
        historical('restriction_20_reference_observations_are_separate_from_selected_predicate', restrictionCases);
        const oldBlock = sourceBlock('restriction_20_reference_observations_are_separate_from_selected_predicate');
        expect(Object.keys(restrictionCases)).toHaveLength(20);
        for (const [name, [xmlschema, libxml2, replacement, finalAu]] of Object.entries(restrictionCases)) {
            expect(oldBlock).toContain('"' + name + '": (' + (xmlschema ? 'True' : 'False') + ', ' + (libxml2 ? 'True' : 'False') + ')');
            const fixture = pinnedFixture('restriction-matches-' + name), original = restrictionFixture(localFixture(fixture));
            for (const [fn, accepted] of [[replacementRestrictionAttributes, replacement], [literalRestrictionAttributes, finalAu]] as const) {
                if (!accepted) failure(() => fn(original.bases, original.locals, new Budget(), { directProhibitions: original.prohibited }));
                else {
                    const result = fn(original.bases, original.locals, new Budget(), { directProhibitions: original.prohibited });
                    result.originalBases.forEach((actual, i) => expect(actual).toBe(original.bases[i]));
                    if (name.endsWith('omitted') || name.endsWith('group-prohibited')) result.effective.forEach((actual, i) => expect(actual).toBe(original.bases[i]));
                    expect(selected(fn === replacementRestrictionAttributes ? 'AU01 selected SOURCE replacements' : 'AU01 unselected FINAL-AU comparison', true).accepted).toBe(true);
                }
            }
            const primary = await validateFixture(fixture);
            expect(primary, fixture).toMatchObject({ phase: 'schema', outcome: libxml2 ? 'accepted' : 'rejected' });
        }
    }, 60000);
    it('typed_fixed_payload_contrasts', async () => {
        const method = 'typed_fixed_payload_contrasts', cases: readonly (readonly [string, string, boolean])[] = [
            ['integer', '1', true], ['integer', '2', false], ['string', ' a ', true], ['string', 'a', false],
            ['token', 'a b', true], ['token', 'a c', false], ['qname', 'q:item', true], ['qname', 'r:item', false],
            ['list', '1 02', true], ['list', '2 1', false], ['union', '1', true], ['union', 'word', false],
            ['pattern', '01', true], ['pattern', '1', false],
        ];
        historical(method, cases.map(([name, lexical, accepted]) => ({ name, lexical, xmlschema: name === 'qname' ? false : accepted, libxml2: accepted })));
        const fixture = pinnedFixture('typed-fixed-values'), schema = parseXml(readFileSync(localFixture(fixture), 'utf8'), fixture);
        const xml = cases.map(([name, lexical]) => '<' + name + ' xmlns="urn:s06:au01" xmlns:q="urn:one" xmlns:r="urn:two" a="' + lexical + '"/>');
        for (const [i, [name, lexical, expected]] of cases.entries()) {
            expect(source).toContain('("' + name + '", "' + lexical + '", ' + (expected ? 'True' : 'False') + ')');
            const element = children(schema, 'element').find(node => attribute(node, 'name') === name)!;
            const declaration = children(children(element, 'complexType')[0], 'attribute')[0], payload = parseXml(xml[i], fixture + ':payload-' + i);
            const original = typedFixedOperand(schema, declaration, attribute(declaration, 'fixed')!, declaration);
            let accepted: boolean;
            try { accepted = sameValue(original, typedFixedOperand(schema, declaration, attribute(payload, 'a')!, payload), new Budget()); }
            catch (error) { expect(error).toBeInstanceOf(ProbeFailure); expect((error as ProbeFailure).category).toBe('invalid-value'); accepted = false; }
            expect(selected('AU01 declared typed fixed ' + name, accepted).accepted, name + ':' + lexical).toBe(expected);
        }
        const primary = await validateFixture(fixture, xml);
        expect(primary).toMatchObject({ phase: 'schema', outcome: 'accepted' });
        expect(primary.instances?.map(i => i.outcome)).toEqual(cases.map(c => c[2] ? 'accepted' : 'rejected'));
        // Changing either ordered union membership or the declared pattern leaves the selected domain.
        const changedUnion = parseXml(schema.xml.replace('memberTypes="xs:integer xs:string"', 'memberTypes="xs:string xs:integer"'), 'changed-union');
        const changedPattern = parseXml(schema.xml.replace('value="0[0-9]+"', 'value="[0-9]{2}"'), 'changed-pattern');
        for (const [changed, name] of [[changedUnion, 'union'], [changedPattern, 'pattern']] as const) {
            const declaration = children(children(children(changed, 'element').find(n => attribute(n, 'name') === name)!, 'complexType')[0], 'attribute')[0];
            failure(() => typedFixedOperand(changed, declaration, '01', declaration), 'unsupported-capability');
        }
    });
});
