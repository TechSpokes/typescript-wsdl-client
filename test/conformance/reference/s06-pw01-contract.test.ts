import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { groupWildcardPredicate, type Occurs } from '../../research/s06-pw01/predicate.js';
import { engine, localFixture, validateFixture } from './adapter.js';
import { selected, type CurrentPrimary, type HistoricalObservation, type UnqualifiedCapability } from './evidence.js';
import { historicalSources } from './historical-source.js';
import { captureProvenance, finishProvenance, type RunProvenance } from './qualification/provenance.js';
import { pwCallbacks, pwInput, pwPayload } from './scoped-pw.js';

interface Payload { xml: string; primary: boolean; observed: Record<'xmlschema420' | 'libxml22146', boolean | 'unavailable-schema'> }
interface Case {
    id: string; file: string; literal2004: boolean; proposed2232: boolean; effectiveTotalRange: Occurs;
    observed: Record<'xmlschema420' | 'libxml22146', 'accepted' | 'rejected' | 'parse-range-limit'>;
    payloads: Payload[];
}
const prefix = 'xsd/s06-pw01/';
const cases = (JSON.parse(readFileSync(localFixture(prefix + 'expectations.json'), 'utf8')) as { cases: Case[] }).cases;
const baseline = 'f4e39e819f2d9aa264cfdd14d16154c6443c9bac';
const schemaId = 'NT-s06_pw01_contract-fixed_schema_observations';
const payloadId = 'NT-s06_pw01_contract-fixed_payload_observations_separate_from_schema_validity';
const schemaContract = 'b94eb6c2e297d5a16ba4922ecc3c237c0b9d28a3c53e48a4033be3f8d4e354fa';
const payloadContract = 'f14ffa047dabd6641601d75edccf6a0273e8541640dffc7bd1e37fc752ee0591';
const digest = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const historical = (name: string, value: unknown, sourceContractSha256: string): HistoricalObservation => ({
    kind: 'historical-external-observation', baseline, engine: name, sourceContractSha256, value,
});
const unqualified: UnqualifiedCapability = {
    kind: 'unqualified-capability', scope: 'PW01 second general-purpose XSD engine and original huge-bound schema validity',
    reason: 'NT-CONT-01 accepts the scoped prototype and historical xmlschema observations; no fresh second engine is qualified.',
};
const schemaEvidence: unknown[] = [], payloadEvidence: unknown[] = [];
let execution: RunProvenance;

describe('PW01 accepted continuation contract', () => {
    beforeAll(() => {
        const archived = historicalSources().get('test/conformance/reference/s06_pw01_contract_test.py')!;
        expect(archived).toContain('self.assertEqual(count, 76)');
        expect(archived).toContain('self.assertEqual(count, 16)');
        expect(cases).toHaveLength(38);
        expect(cases.flatMap(row => row.payloads)).toHaveLength(8);
        expect(digest(readFileSync(localFixture(prefix + 'expectations.json')))).toBe('e718191a8ebd11e386db40370f85f297247d767a18c68be4dca5ccd3e97b74be');
        const pinned = JSON.parse(readFileSync(new URL('./qualification/observations.json', import.meta.url), 'utf8')) as {
            observations: Array<{ id: string; source: string; sha256: string }>;
        };
        for (const row of cases) {
            const old = pinned.observations.find(observation => observation.id === row.id && observation.source === row.file);
            expect(old, row.id + ' original byte provenance').toBeDefined();
            expect(digest(readFileSync(localFixture(prefix + row.file))), row.id).toBe(old!.sha256);
            expect(Object.keys(row.observed)).toEqual(['xmlschema420', 'libxml22146']);
        }
        execution = captureProvenance([
            'test/conformance/reference/s06-pw01-contract.test.ts', 'test/conformance/reference/scoped-pw.ts',
            'test/research/s06-pw01/predicate.ts', 'test/conformance/reference/syntax.ts',
            'test/conformance/reference/adapter.ts', 'test/conformance/reference/primary.ts',
            'test/conformance/reference/primary-worker.ts', 'test/conformance/reference/xml-input.ts',
            'test/conformance/reference/evidence.ts', 'test/conformance/reference/historical-source.ts',
            'test/conformance/reference/qualification/provenance.ts',
        ], [
            ...cases.map(row => 'test/conformance/fixtures/' + prefix + row.file),
            'test/conformance/fixtures/' + prefix + 'expectations.json',
            'test/conformance/fixtures/' + prefix + 'imported-base.xsd',
            'test/conformance/fixtures/' + prefix + 'chameleon-base.xsd',
            'test/conformance/reference/legacy-source-snapshot.json', 'test/conformance/reference/migration-map.json',
            'test/conformance/reference/qualification/observations.json',
        ], ['package-lock.json', 'node_modules/libxml2-wasm/package.json',
            'node_modules/libxml2-wasm/lib/index.mjs', 'node_modules/libxml2-wasm/lib/libxml2raw.mjs']);
    });

    it(schemaId, async () => {
        for (const row of cases) {
            const input = pwInput(row.file), original = JSON.stringify(input.documents);
            expect(input.originalRange, row.id + ' independent exact source total').toEqual(row.effectiveTotalRange);
            const current = await validateFixture(prefix + row.file, [], { resources: input.resources });
            const primary: CurrentPrimary = { kind: 'current-primary-observation', result: current };
            expect(current.phase, row.id).toBe('schema');
            expect(current.outcome, row.id).toBe(row.id === 'huge-exact-repetition' ? 'unsupported-capability' : 'accepted');
            expect(current.fixtureHashes[prefix + row.file]).toBe(digest(readFileSync(localFixture(prefix + row.file))));
            if (row.id === 'huge-exact-repetition') {
                expect(current.instances).toBeUndefined();
                expect(current.diagnostic).toContain('original huge input is unqualified');
            } else expect(current.undisposed).toEqual({});
            const contracts = [];
            for (const interpretation of ['literal2004', 'proposed2232'] as const) {
                const result = input.absentContent ? { kind: 'answer' as const, validRestriction: true, steps: 0 } :
                    groupWildcardPredicate(input.root, input.base, interpretation, input.inputNodes, pwCallbacks);
                expect(result, row.id + ' ' + interpretation).toMatchObject({ kind: 'answer', validRestriction: row[interpretation] });
                contracts.push({ interpretation, ...selected('PW01 finite source arithmetic/namespace restriction; ' + interpretation,
                    result.kind === 'answer' && result.validRestriction), result });
            }
            const old = Object.entries(row.observed).map(([name, answer]) => historical(name, answer, schemaContract));
            expect(old).toHaveLength(2);
            expect(JSON.stringify(input.documents), row.id + ' source identity retained').toBe(original);
            schemaEvidence.push({ id: row.id, methodId: schemaId, primary, selectedContracts: contracts, historical: old, unqualified });
        }
        expect(schemaEvidence).toHaveLength(38);
    });

    it(payloadId, async () => {
        for (const row of cases.filter(row => row.payloads.length)) {
            const input = pwInput(row.file);
            const current = await validateFixture(prefix + row.file, row.payloads.map(payload => payload.xml), { resources: input.resources });
            expect(current, row.id + ' original schema must construct before instance assertions').toMatchObject({ phase: 'schema', outcome: 'accepted' });
            expect(current.instances).toHaveLength(row.payloads.length);
            expect(current.undisposed).toEqual({});
            for (const [index, payload] of row.payloads.entries()) {
                expect(typeof payload.observed.libxml22146).toBe('boolean');
                expect(current.instances![index].outcome, row.id + ':' + index).toBe(payload.observed.libxml22146 ? 'accepted' : 'rejected');
                const accepted = pwPayload(row.file, payload.xml, input);
                expect(accepted, row.id + ':' + index + ' selected finite content').toBe(payload.primary);
                const old = Object.entries(payload.observed).map(([name, answer]) => historical(name, answer, payloadContract));
                if (payload.observed.xmlschema420 === 'unavailable-schema') {
                    expect(row.observed.xmlschema420).toBe('rejected');
                    expect(old[0].value).toBe('unavailable-schema');
                    expect(current.outcome).toBe('accepted');
                }
                payloadEvidence.push({ id: row.id + ':' + index, methodId: payloadId, xml: payload.xml,
                    instanceSha256: digest(payload.xml), primary: { kind: 'current-primary-observation', validator: engine,
                        schema: { phase: current.phase, outcome: current.outcome }, instance: current.instances![index], fixtureHashes: current.fixtureHashes },
                    selectedContract: selected('PW01 five declared finite content grammars; no schema-legality inference', accepted),
                    historical: old, unqualified });
            }
        }
        expect(payloadEvidence).toHaveLength(8);
        // A count interval alone cannot admit the odd three-child pair payload.
        expect(payloadEvidence).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'count-gap:1',
            selectedContract: expect.objectContaining({ accepted: false }) })]));
    });

    it('keeps exact huge total, original group uses, namespace context and resource failures', () => {
        const huge = pwInput('huge-exact-repetition.xsd');
        expect(huge.originalRange).toEqual({ min: '1801439850948198624691357802469135780', max: '1801439850948198624691357802469135780' });
        const complete = groupWildcardPredicate(huge.root, huge.base, 'proposed2232', huge.inputNodes, pwCallbacks);
        if (complete.kind !== 'answer') throw new Error('Expected finite exact PW01 result');
        expect(complete.validRestriction).toBe(true);
        expect(groupWildcardPredicate(huge.root, huge.base, 'proposed2232', huge.inputNodes, pwCallbacks,
            { maxSteps: complete.steps, maxNodes: huge.inputNodes })).toMatchObject({ kind: 'answer', validRestriction: true });
        for (const limits of [{ maxSteps: complete.steps - 1 }, { maxNodes: huge.inputNodes - 1 }]) {
            const failed = groupWildcardPredicate(huge.root, huge.base, 'proposed2232', huge.inputNodes, pwCallbacks, limits);
            expect(failed).toMatchObject({ kind: 'failure', diagnostic: { category: 'resource-limit' } });
            expect('validRestriction' in failed).toBe(false);
        }
        const shared = pwInput('shared-group-uses.xsd');
        expect(shared.root.members).toHaveLength(4);
        expect(shared.root.members[0].owner).toBe(shared.root.members[2].owner);
        expect(shared.root.members[1].owner).toBe(shared.root.members[3].owner);
        const imported = pwInput('imported-other-valid.xsd');
        expect(imported.base.wildcard?.lexical).toEqual({ value: '##other', effectiveNamespace: 'urn:pw01:base' });
        const chameleon = pwInput('chameleon-other-failure.xsd');
        expect(chameleon.base.wildcard?.lexical).toEqual({ value: '##other', effectiveNamespace: 'urn:pw01' });
        expect(chameleon.base.owner.context.source.path).toBe(prefix + 'chameleon-base.xsd');
    });

    afterAll(() => {
        if (!execution) return;
        mkdirSync('tmp/conformance/reference', { recursive: true });
        writeFileSync('tmp/conformance/reference/s06-pw01-observations.json', JSON.stringify({
            contract: 'NT-CONT-01', provenance: finishProvenance(execution), validator: engine,
            schemas: schemaEvidence, payloads: payloadEvidence, unqualified,
        }, null, 2) + '\n');
    });
});
