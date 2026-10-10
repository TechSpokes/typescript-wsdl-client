import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Budget, compareDuration, parseCalendar, parseDuration, parseReduced, ProbeFailure,
    sameCalendar, sameDuration, showInstant, type Calendar, type CalendarFamily } from '../../research/dt01/exact-calendar.js';
import { engine, localFixture, validateFixture } from './adapter.js';
import { selected, type HistoricalObservation, type UnqualifiedCapability } from './evidence.js';
import { historicalSources } from './historical-source.js';
import { captureProvenance, finishProvenance, type RunProvenance } from './qualification/provenance.js';
import { attribute, children, expandedQName, parseXml, XSD } from './syntax.js';

type Family = CalendarFamily | 'duration';
type Lexical = readonly [family: Family, value: string, historicalAccepted: boolean];
type Equality = readonly [name: string, value: string, candidateA: boolean, historicalXmlschema: boolean, historicalLibxml2: boolean];
type Copied = readonly [file: string, historicalAccepted: boolean, sha256: string];
const copied: readonly Copied[] = [
    ['bce-date-0004.xsd', true, 'b83e97d1397c31e201cf59f1b130b9d29fe82c6ba46f8714473e1016c6aee89a'],
    ['bce-date-0001.xsd', false, 'ad760e2275c3bd8c463c1b4315d9cb3d10b458d8e426b12a59594a19ef98ab0d'],
    ['bce-dateTime-0004.xsd', true, 'ca3483fa31ab72a58c19e86ab82b88559526cbcf7a7a0cf7fdd9b7eaa3da1eb4'],
    ['bce-dateTime-0001.xsd', false, 'aba2ca3526ee2f75679be6b73c5947dbe19f95dc528ff06011f37bd6b5c3e225'],
    ['duration-cross-year-zero.xsd', true, 'a6d62e72b51b686aa756cd93c6e586c812b2f5cb6bbbe81da9f8208f19e225b6'],
];
// Independently retained literals. Fresh primary observations and the selected
// second-60 law have separately named results below.
const lexical: readonly Lexical[] = [
    ['date', '-0400-02-29Z', true], ['date', '-0100-02-29Z', false],
    ['date', '-0004-02-29Z', true], ['date', '-0001-02-29Z', false],
    ['date', '0001-02-29Z', false], ['date', '0000-01-01Z', false],
    ['dateTime', '-0004-02-29T00:00:00Z', true],
    ['dateTime', '-0001-02-29T00:00:00Z', false],
    ['dateTime', '-0001-12-31T24:00:00Z', true],
    ['dateTime', '0001-01-01T00:00:00+14:00', true],
    ['dateTime', '0001-01-01T00:00:00+14:01', false],
    ['dateTime', '2001-03-01T00:00:00.00000000000000000001Z', true],
    ['time', '24:00:00Z', true], ['time', '24:00:01Z', false],
    ['time', '23:59:60Z', false],
    ['gYear', '-0001Z', true], ['gYear', '0000Z', false],
    ['gYearMonth', '-0004-02Z', true], ['gYearMonth', '-0001-13Z', false],
    ['gMonthDay', '--02-29Z', true], ['gMonthDay', '--02-30Z', false],
    ['gMonth', '--02Z', true], ['gMonth', '--02--Z', false],
    ['gDay', '---31Z', true], ['gDay', '---32Z', false],
    ['duration', 'P1M1DT0.00000000000000000001S', true],
    ['duration', '-P1700Y', true], ['duration', 'P1M-1D', false],
];
const equality: readonly Equality[] = [
    ['boundary', '-0001-12-31T24:00:00Z', true, false, false],
    ['zoneBoundary', '0001-01-01T00:00:00+14:00', true, false, false],
    ['dateInterval', '0001-01-01+14:00', true, false, false],
    ['durationYear', 'P12M', true, true, false],
    ['durationDay', 'PT24H', true, true, false],
    ['durationMonth', 'P30D', false, false, false],
    ['timeMidnight', '24:00:00Z', true, true, false],
];
const prefix = 'xsd/research-dt01/';
const pinnedDraft = '460f5b8379c68ffef79917284e445b5ab046429e';
const baseline = 'f4e39e819f2d9aa264cfdd14d16154c6443c9bac';
const copiedId = 'NT-dt01_calendar_contract-historical_schema_observations_with_copy_provenance';
const lexicalId = 'NT-dt01_calendar_contract-related_calendar_lexical_instance_observations';
const equalityId = 'NT-dt01_calendar_contract-equality_observations_are_distinct_from_candidate_authority';
const sourceContracts = {
    copied: '4558f55d9eb0194f7a1f2f4a992ac96616cf602e9f5e8693b5258ce1821703c4',
    lexical: '79ae5409ab439fbc34d54dc7cd79fae129a78c2099f595adab21be70ed28db78',
    equality: '3894c2a64d82a1c44687f072858b89a4beee6e39f667de5d6e34a8a3943a7f3d',
} as const;
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const old = (name: string, value: boolean, sourceContractSha256: string): HistoricalObservation => ({
    kind: 'historical-external-observation', baseline, engine: name, sourceContractSha256, value,
});
const unqualified: UnqualifiedCapability = {
    kind: 'unqualified-capability', scope: 'DT01 full independent XSD datatype/PSVI and second-engine construction/equality',
    reason: 'NT-CONT-01 selects the exact-calendar research domain; recorded xmlschema answers are historical, not a live engine.',
};
const schemaEvidence: unknown[] = [], lexicalEvidence: unknown[] = [], equalityEvidence: unknown[] = [];
let execution: RunProvenance;

function calendar(family: CalendarFamily, value: string, budget: Budget): Calendar {
    return family === 'date' || family === 'dateTime' ? parseCalendar(family, value, budget) : parseReduced(family, value, budget);
}
function accepts(family: Family, value: string): { accepted: boolean; used: number; retainedLexical?: string; diagnostic?: string } {
    const budget = new Budget();
    try {
        const result = family === 'duration' ? parseDuration(value, budget) : calendar(family, value, budget);
        return { accepted: true, used: budget.used, retainedLexical: result.lexical };
    } catch (error) {
        if (!(error instanceof ProbeFailure) || error.kind !== 'invalid-schema') throw error;
        return { accepted: false, used: budget.used, diagnostic: error.message };
    }
}

describe('DT01 accepted continuation contract', () => {
    beforeAll(() => {
        const archived = historicalSources().get('test/conformance/reference/dt01_calendar_contract_test.py')!;
        expect(archived).toContain('PINNED = "' + pinnedDraft + '"');
        const oldCopies = [...archived.matchAll(/"([^"]+\.xsd)": \((True|False), "([a-f0-9]{64})"\)/g)]
            .map(row => [row[1], row[2] === 'True', row[3]]);
        const oldLexical = [...archived.matchAll(/\("(\w+)", "([^"]+)", (True|False)\)/g)]
            .map(row => [row[1], row[2], row[3] === 'True']);
        const oldEquality = [...archived.matchAll(/\("(\w+)", "([^"]+)", (True|False), (True|False), (True|False)\)/g)]
            .map(row => [row[1], row[2], row[3] === 'True', row[4] === 'True', row[5] === 'True']);
        expect(oldCopies).toEqual(copied);
        expect(oldLexical).toEqual(lexical);
        expect(oldEquality).toEqual(equality);
        expect(copied).toHaveLength(5);
        expect(lexical).toHaveLength(28);
        expect(equality).toHaveLength(7);
        execution = captureProvenance([
            'test/conformance/reference/dt01-calendar-contract.test.ts', 'test/research/dt01/exact-calendar.ts',
            'test/conformance/reference/syntax.ts', 'test/conformance/reference/adapter.ts',
            'test/conformance/reference/primary.ts', 'test/conformance/reference/primary-worker.ts',
            'test/conformance/reference/xml-input.ts', 'test/conformance/reference/evidence.ts',
            'test/conformance/reference/historical-source.ts', 'test/conformance/reference/qualification/provenance.ts',
        ], [...copied.map(row => 'test/conformance/fixtures/' + prefix + row[0]),
            'test/conformance/fixtures/' + prefix + 'calendar-scalars.xsd',
            'test/conformance/fixtures/' + prefix + 'calendar-equivalence.xsd',
            'test/conformance/reference/legacy-source-snapshot.json', 'test/conformance/reference/migration-map.json',
        ], ['package-lock.json', 'node_modules/libxml2-wasm/package.json',
            'node_modules/libxml2-wasm/lib/index.mjs', 'node_modules/libxml2-wasm/lib/libxml2raw.mjs']);
    });

    it(copiedId, async () => {
        for (const [file, observed, sha256] of copied) {
            const bytes = readFileSync(localFixture(prefix + file));
            expect(digest(bytes), file).toBe(sha256);
            const current = await validateFixture(prefix + file);
            expect(current, file).toMatchObject({ phase: 'schema', outcome: observed ? 'accepted' : 'rejected' });
            expect(current.fixtureHashes[prefix + file]).toBe(sha256);
            expect(current.undisposed).toEqual({});
            const schema = parseXml(bytes.toString('utf8'), prefix + file);
            let contract;
            if (file === 'duration-cross-year-zero.xsd') {
                const restriction = children(children(schema, 'simpleType')[0], 'restriction')[0];
                expect(expandedQName(restriction, attribute(restriction, 'base')!)).toEqual({ uri: XSD, local: 'duration' });
                const min = attribute(children(restriction, 'minInclusive')[0], 'value')!;
                const max = attribute(children(restriction, 'maxInclusive')[0], 'value')!;
                expect([min, max]).toEqual(['-P1700Y', '-P1600Y']);
                const budget = new Budget();
                const result = compareDuration(parseDuration(min, budget), parseDuration(max, budget), budget);
                expect(result).toBe('less');
                contract = { ...selected('DT01 option A four-anchor duration ordering across the BCE/CE boundary', true), result, used: budget.used };
            } else {
                const declaration = children(schema, 'element')[0];
                const family = expandedQName(declaration, attribute(declaration, 'type')!);
                expect(family.uri).toBe(XSD);
                expect(['date', 'dateTime']).toContain(family.local);
                const value = attribute(declaration, 'default')!;
                const result = accepts(family.local as 'date' | 'dateTime', value);
                expect(result.accepted, file + ' selected signed-year literal').toBe(observed);
                contract = { ...selected('DT01 option A original signed-year default; no year zero', result.accepted), lexical: value, result };
            }
            schemaEvidence.push({ id: file, methodId: copiedId, pinnedDraft, sha256,
                primary: { kind: 'current-primary-observation', result: current }, selectedContract: contract,
                historical: ['xmlschema4.2.0', 'libxml2-2.14.6'].map(name => old(name, observed, sourceContracts.copied)), unqualified });
        }
        expect(schemaEvidence).toHaveLength(5);
    });

    it(lexicalId, async () => {
        const file = prefix + 'calendar-scalars.xsd';
        const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
        const payloads = lexical.map(([family, value]) => `<${family}>${value}</${family}>`);
        const current = await validateFixture(file, payloads);
        expect(current).toMatchObject({ phase: 'schema', outcome: 'accepted' });
        expect(current.instances).toHaveLength(28);
        expect(current.undisposed).toEqual({});
        for (const [index, [family, value, observed]] of lexical.entries()) {
            const declaration = children(schema, 'element').find(node => attribute(node, 'name') === family)!;
            expect(expandedQName(declaration, attribute(declaration, 'type')!)).toEqual({ uri: XSD, local: family });
            expect(current.instances![index].outcome, family + ':' + value + ' fresh primary').toBe(observed ? 'accepted' : 'rejected');
            const result = accepts(family, value);
            const selectedExpected = family === 'time' && value === '23:59:60Z' ? true : observed;
            expect(result.accepted, family + ':' + value + ' selected exact domain').toBe(selectedExpected);
            if (result.accepted) expect(result.retainedLexical).toBe(value);
            lexicalEvidence.push({ id: family + ':' + value, methodId: lexicalId, family, lexical: value,
                instanceSha256: digest(payloads[index]), primary: { kind: 'current-primary-observation', validator: engine,
                    schema: { phase: current.phase, outcome: current.outcome }, instance: current.instances![index], fixtureHashes: current.fixtureHashes },
                selectedContract: { ...selected('DT01 option A declared eight calendar families and duration', result.accepted), result },
                historical: ['xmlschema4.2.0', 'libxml2-2.14.6'].map(name => old(name, observed, sourceContracts.lexical)), unqualified });
        }
        expect(lexicalEvidence).toHaveLength(28);
        const budget = new Budget();
        const leapSecond = parseReduced('time', '23:59:60Z', budget), midnight = parseReduced('time', '00:00:00Z', budget);
        expect(sameCalendar(leapSecond, midnight, budget)).toBe(true);
        expect(leapSecond.lexical).toBe('23:59:60Z');
    });

    it(equalityId, async () => {
        const file = prefix + 'calendar-equivalence.xsd';
        const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
        const payloads = equality.map(([name, value]) => `<${name}>${value}</${name}>`);
        const current = await validateFixture(file, payloads);
        expect(current).toMatchObject({ phase: 'schema', outcome: 'accepted' });
        expect(current.instances).toHaveLength(7);
        expect(current.undisposed).toEqual({});
        for (const [index, [name, value, candidateA, first, second]] of equality.entries()) {
            expect(current.instances![index].outcome, name + ' fresh primary').toBe('rejected');
            const declaration = children(schema, 'element').find(node => attribute(node, 'name') === name)!;
            const datatype = expandedQName(declaration, attribute(declaration, 'type')!);
            expect(datatype.uri).toBe(XSD);
            expect(['date', 'dateTime', 'time', 'duration']).toContain(datatype.local);
            const fixed = attribute(declaration, 'fixed')!;
            const budget = new Budget();
            const accepted = datatype.local === 'duration' ? sameDuration(parseDuration(value, budget), parseDuration(fixed, budget), budget) :
                sameCalendar(calendar(datatype.local as CalendarFamily, value, budget), calendar(datatype.local as CalendarFamily, fixed, budget), budget);
            expect(accepted, name + ' selected equality').toBe(candidateA);
            equalityEvidence.push({ id: name, methodId: equalityId, lexical: value, fixedLexical: fixed,
                instanceSha256: digest(payloads[index]), candidateA,
                primary: { kind: 'current-primary-observation', validator: engine,
                    schema: { phase: current.phase, outcome: current.outcome }, instance: current.instances![index], fixtureHashes: current.fixtureHashes },
                selectedContract: { ...selected('DT01 option A same datatype/value timeline and exact duration pair', accepted), used: budget.used },
                historical: [old('xmlschema4.2.0', first, sourceContracts.equality), old('libxml2-2.14.6', second, sourceContracts.equality)], unqualified });
        }
        expect(equalityEvidence).toHaveLength(7);
    });

    it('preserves independent literal overflow, aliases, huge years and resource-limit identity', () => {
        const budget = new Budget();
        const bceBoundary = parseCalendar('dateTime', '-0001-12-31T24:00:00Z', budget);
        expect(showInstant(bceBoundary.seconds, budget)).toBe('0001-01-01T00:00:00Z');
        const second60 = parseCalendar('dateTime', '2000-01-01T23:59:60Z', budget);
        expect(showInstant(second60.seconds, budget)).toBe('2000-01-02T00:00:00Z');
        expect(sameCalendar(parseReduced('time', '00:00:00+01:00', budget), parseReduced('time', '23:00:00Z', budget), budget)).toBe(true);
        const exact = '9999999999999999999999999999999999999999-01-01T00:00:00.00000000000000000001Z';
        expect(showInstant(parseCalendar('dateTime', exact, budget).seconds, budget)).toBe(exact);
        const source = '9'.repeat(5000) + '-01-01Z';
        const limited = new Budget();
        try { parseCalendar('date', source, limited); throw new Error('Expected DT01 resource exhaustion'); }
        catch (error) { expect(error).toMatchObject({ kind: 'resource-limit' }); }
        expect(limited.used).toBeLessThanOrEqual(limited.maxWork);
        // Resource exhaustion is thrown and cannot become a false lexical result.
        expect(() => accepts('date', source)).toThrow(expect.objectContaining({ kind: 'resource-limit' }));
    });

    afterAll(() => {
        if (!execution) return;
        mkdirSync('tmp/conformance/reference', { recursive: true });
        writeFileSync('tmp/conformance/reference/dt01-calendar-observations.json', JSON.stringify({
            contract: 'NT-CONT-01', provenance: finishProvenance(execution), validator: engine, pinnedDraft,
            copiedSchemas: schemaEvidence, lexical: lexicalEvidence, equality: equalityEvidence, unqualified,
        }, null, 2) + '\n');
    });
});
