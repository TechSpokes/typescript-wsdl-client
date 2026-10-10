import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, symlinkSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { localFixture, validateFixture, qualifyPrimary } from './adapter.js';
import type { BaselineCase } from './adapter.js';
import { isolated } from './primary.js';
const manifest = JSON.parse(readFileSync('test/conformance/semantic-baseline.json', 'utf8')) as {
    cases: BaselineCase[];
};
describe('primary reference adapter staging', () => {
    it('missing_fixture_is_input_failure', async () => {
        expect(() => localFixture('does-not-exist.xml')).toThrow('Missing or nonlocal');
        expect(await validateFixture('does-not-exist.xml')).toMatchObject({ phase: 'input', outcome: 'rejected' });
        expect(() => localFixture('../../../../package.json')).toThrow('nonlocal');
    });
    it('wrong_tool_version_is_setup_failure', async () => {
        expect(await validateFixture(manifest.cases[0].fixture, [], { expectedVersion: '0.0.0' })).toMatchObject({ phase: 'setup', outcome: 'rejected', diagnostic: 'Required libxml2-wasm 0.7.2' });
    });
    it('schema_rejection_never_becomes_instance_rejection', async () => {
        const result = await validateFixture('xsd/compositors/content-model-invalid-all.wsdl', ['<root/>']);
        expect(result).toMatchObject({ phase: 'schema', outcome: 'rejected' });
        expect(result.diagnostic).toContain('content is not valid');
        expect(result.instances).toBeUndefined();
    });
    it('disagreement_fails_qualification', async () => {
        const c = structuredClone(manifest.cases[0]);
        c.instances[0].expected = 'rejected';
        const report = await qualifyPrimary({ cases: [c] }, true);
        expect(report.cases[0].schema.outcome).toBe('accepted');
        expect(report.failures).toHaveLength(1);
        await expect(qualifyPrimary({ cases: [] })).rejects.toThrow('must contain cases');
    });
    it('network_schema_and_doctype_are_input_failures', async () => {
        const base = { candidateRoot: resolve('.'), uri: 'fixture:///main.xsd', resources: {}, instances: [] };
        const network = await isolated({ ...base, schema: '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:include schemaLocation="https://example.test/a.xsd"/></xs:schema>' });
        expect(network).toMatchObject({ phase: 'input', outcome: 'rejected' });
        expect(network.diagnostic).toContain('Unknown resource');
        const dtd = await isolated({ ...base, schema: '<!DOCTYPE root SYSTEM "https://example.test/dtd"><root/>' });
        expect(dtd.phase).toBe('input');
        expect(dtd.diagnostic).toContain('DOCTYPE');
    });
    it('preserves namespaces after greater-than characters in quoted schema attributes', async () => {
        const result = await isolated({ candidateRoot: resolve('.'), uri: 'fixture:///main.xsd', resources: {}, instances: ['<root>&gt;</root>'], schema: '<xs:schema note:value="a>b" xmlns:note="urn:note" xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="root" type="xs:string" fixed=">"/></xs:schema>' });
        expect(result).toMatchObject({ phase: 'schema', outcome: 'accepted', instances: [{ outcome: 'accepted' }], undisposed: {} });
    });
    it('keeps original huge bounds unqualified and releases repeated validations', async () => {
        expect(await validateFixture('xsd/graph/shared-recursive.xsd')).toMatchObject({ phase: 'schema', outcome: 'unsupported-capability' });
        for (let i = 0; i < 3; i++) {
            const result = await validateFixture(manifest.cases[0].fixture);
            expect(result.outcome).toBe('accepted');
            expect(result.undisposed).toEqual({});
        }
    });
    it('charges input at/beyond byte limits and returns no partial result after elapsed limits', async () => {
        const source = readFileSync(localFixture(manifest.cases[0].fixture), 'utf8'), bytes = Buffer.byteLength(source);
        expect((await validateFixture(manifest.cases[0].fixture, [], { maxBytes: bytes })).outcome).toBe('accepted');
        expect(await validateFixture(manifest.cases[0].fixture, [], { maxBytes: bytes - 1 })).toMatchObject({ outcome: 'resource-limit' });
        const timeout = await validateFixture(manifest.cases[0].fixture, [], { timeoutMs: 1 });
        expect(timeout.outcome).toBe('resource-limit');
        expect(timeout.instances).toBeUndefined();
    });
    it('rejects symlink escapes from local inputs', () => {
        const directory = mkdtempSync('tmp/conformance/adapter-');
        try {
            writeFileSync(resolve(directory, 'control.xml'), '<root/>');
            symlinkSync(resolve('package.json'), resolve(directory, 'escape.xml'));
            expect(() => localFixture('escape.xml', resolve(directory))).toThrow('nonlocal');
            expect(localFixture('control.xml', resolve(directory))).toBe(resolve(directory, 'control.xml'));
        }
        finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
