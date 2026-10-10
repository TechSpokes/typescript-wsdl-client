import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { qualifyPrimary, validateFixture, type BaselineCase } from './adapter.js';
import { selected, type HistoricalObservation } from './evidence.js';
import { attribute, descendants, parseXml } from './syntax.js';
import { declaration, fixtureSchema, fixtureText, zeroElementAccepted } from './structural-selected.js';

const manifest = JSON.parse(readFileSync(new URL('../semantic-baseline.json', import.meta.url), 'utf8')) as { cases: BaselineCase[] };
describe('NT-CONT-01 baseline qualification', () => {
    it('retains every required-subset primary literal: 6 schemas and 15 instances', async () => {
        const report = await qualifyPrimary(manifest, false);
        expect(report.failures).toEqual([]);
        expect(report.cases).toHaveLength(6);
        expect(report.cases.flatMap(row => row.instances)).toHaveLength(15);
    });
    it('retains every full primary literal: 14 schemas and 40 instances', async () => {
        const report = await qualifyPrimary(manifest, true);
        expect(report.failures).toEqual([]);
        expect(report.cases).toHaveLength(14);
        expect(report.cases.flatMap(row => row.instances)).toHaveLength(40);
    });
    it('NT-baseline-zero-element-unbounded preserves current, selected and historical answers', async () => {
        const schema = 'xsd/compositors/content-model-boundaries.wsdl';
        const root = declaration(fixtureSchema(schema), 'element', 'ZeroElement');
        const row = descendants(root, 'element').find(node => attribute(node, 'name') === 'row')!;
        expect([attribute(row, 'minOccurs'), attribute(row, 'maxOccurs')]).toEqual(['0', '0']);
        expect(attribute(descendants(root, 'sequence')[0], 'maxOccurs')).toBe('unbounded');
        const inputs = ['zero-element-unbounded-1.xml', 'zero-element-unbounded-2.xml']
            .map(name => fixtureText('xsd/compositors/instances/' + name));
        const primary = await validateFixture(schema, inputs);
        expect(primary).toMatchObject({ phase: 'schema', outcome: 'accepted', instances: [{ outcome: 'accepted' }, { outcome: 'accepted' }] });
        const scoped = (xml: string) => zeroElementAccepted(fixtureSchema(schema), parseXml(xml, 'zero-element-instance'));
        expect(inputs.map(xml => selected('row-source-maxOccurs=0', scoped(xml)).accepted)).toEqual([true, false]);
        const historical: HistoricalObservation = {
            kind: 'historical-external-observation', baseline: 'f4e39e819f2d9aa264cfdd14d16154c6443c9bac',
            engine: 'xmlschema 4.2.0',
            sourceContractSha256: 'e6614d23888130f7a086e5219023b36daebda3015db6e28c5105ca486bc34ab7', value: 'rejected',
        };
        const original = manifest.cases.find(row => row.id === 'zero-element-unbounded')!;
        expect(original.instances[1].secondaryExpected).toBe(historical.value);
        expect(historical.kind).toBe('historical-external-observation');
    });
});
