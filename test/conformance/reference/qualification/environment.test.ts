import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifySpawn, inventoryInterpreters, isInterpreterName, probeExecutable } from './environment.js';

describe('interpreter execution qualification controls', () => {
    it('does not equate a failed interpreter exit with a blocked spawn', () => {
        const candidate = process.execPath;
        expect(probeExecutable(candidate, ['--definitely-not-a-real-node-option'])).toMatchObject({ outcome: 'started', status: 9 });
        expect(classifySpawn('candidate', { pid: 42, status: null, error: Object.assign(new Error(), { code: 'ETIMEDOUT' }) }))
            .toMatchObject({ outcome: 'started', errorCode: 'ETIMEDOUT' });
    });
    it('accepts only missing or permission-denied spawn failures', () => {
        for (const code of ['ENOENT', 'ENOTDIR'])
            expect(classifySpawn('candidate', { status: null, error: Object.assign(new Error(), { code }) }).outcome).toBe('unavailable');
        for (const code of ['EACCES', 'EPERM'])
            expect(classifySpawn('candidate', { status: null, error: Object.assign(new Error(), { code }) }).outcome).toBe('denied');
        for (const code of ['EINVAL', 'ENOEXEC', 'ETIMEDOUT'])
            expect(classifySpawn('candidate', { status: null, error: Object.assign(new Error(), { code }) }).outcome).toBe('unresolved');
    });
    it('inventories versions, launchers and shell wrappers without mistaking ordinary source text for binaries', () => {
        for (const name of ['python', 'python3.14t.exe', 'pythonw.exe', 'pip3.13', 'py.exe', 'pypy3', 'python.cmd', 'pip.ps1'])
            expect(isInterpreterName(name), name).toBe(true);
        for (const name of ['python.py', 'python.ts', 'python-usage.md', 'libpython3.13.so'])
            expect(isInterpreterName(name), name).toBe(false);
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/platform-inventory-');
        try {
            mkdirSync(join(root, 'nested'));
            writeFileSync(join(root, 'nested', 'python.exe'), 'non-executable fixture');
            writeFileSync(join(root, 'nested', 'python.ts'), 'historical prose');
            const inventory = inventoryInterpreters([{ path: root, recursive: true }]);
            expect(inventory.errors).toEqual([]);
            expect(inventory.paths).toEqual([resolve(root, 'nested', 'python.exe')]);
            expect(inventory.directoriesRead).toBe(2);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('follows Linux directory aliases once and retains interpreter aliases', () => {
        if (process.platform === 'win32') return; // Windows alias creation requires privileges; hosted ACL controls are separate.
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/platform-links-');
        try {
            mkdirSync(join(root, 'nested'));
            writeFileSync(join(root, 'nested', 'python3'), 'non-executable fixture');
            symlinkSync(join(resolve(root), 'nested'), join(root, 'directory-alias'));
            symlinkSync(join(resolve(root), 'nested', 'python3'), join(root, 'py'));
            const inventory = inventoryInterpreters([{ path: root, recursive: true }]);
            expect(inventory.errors).toEqual([]);
            expect(inventory.paths.some(path => path.endsWith('/py'))).toBe(true);
            expect(inventory.paths.some(path => path.endsWith('/python3'))).toBe(true);
            expect(inventory.directoriesRead).toBe(2);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
});
