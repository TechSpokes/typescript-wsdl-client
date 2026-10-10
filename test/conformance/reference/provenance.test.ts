import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { captureProvenance, finishProvenance, verifyProvenance } from './qualification/provenance.js';
describe('execution-time qualification provenance', () => {
    it('refuses legacy raw output and environment mismatches', () => {
        expect(() => verifyProvenance(undefined)).toThrow('execution-time provenance');
        const run = captureProvenance(['test/conformance/reference/adapter.ts'], ['test/conformance/semantic-baseline.json'], ['node_modules/libxml2-wasm/package.json']);
        expect(() => verifyProvenance({ ...run, node: 'v0.0.0' })).toThrow('environment mismatch');
        expect(finishProvenance(run).testedRevision).toBe(run.testedRevision);
    });
    for (const kind of ['source', 'input', 'artifact'] as const) {
        it('rejects stale ' + kind + ' bytes instead of recording current hashes', () => {
            const root = mkdtempSync('tmp/conformance/provenance-');
            try {
                const paths = ['source', 'input', 'artifact'].map(name => resolve(root, name));
                for (const path of paths) writeFileSync(path, 'before');
                const run = captureProvenance([paths[0]], [paths[1]], [paths[2]]);
                writeFileSync(paths[['source', 'input', 'artifact'].indexOf(kind)], 'after');
                expect(() => verifyProvenance(run)).toThrow('Stale ' + kind + ' execution hash');
            } finally { rmSync(root, { recursive: true, force: true }); }
        });
    }
});
