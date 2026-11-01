import { mkdirSync, mkdtempSync, lstatSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { handOffQualificationOutput, qualificationOutputOwner } from './output-ownership.ts';

describe('qualification evidence ownership boundary', () => {
    it('accepts complete POSIX identities and refuses malformed or partial handoffs', () => {
        expect(qualificationOutputOwner(undefined, undefined)).toBeUndefined();
        expect(qualificationOutputOwner('1001', '1002')).toEqual({uid: 1001, gid: 1002});
        expect(qualificationOutputOwner('0', '0')).toEqual({uid: 0, gid: 0});
        for (const [uid, gid] of [['1001', undefined], [undefined, '1001'], ['-1', '0'], ['1.5', '0'],
            ['NaN', '0'], ['4294967295', '0'], ['9007199254740992', '0'], ['0', '1e3'], ['', '0']]) {
            expect(() => qualificationOutputOwner(uid, gid)).toThrow(TypeError);
        }
    });

    it('hands off private copied files and link inodes without traversing targets or widening modes', () => {
        mkdirSync('tmp/conformance', {recursive: true});
        const root = resolve(mkdtempSync('tmp/conformance/output-ownership-'));
        try {
            const output = join(root, 'results'), nested = join(output, 'private'), outside = join(root, 'outside');
            mkdirSync(nested, {recursive: true, mode: 0o700}); mkdirSync(outside);
            const file = join(nested, 'result.json'), link = join(output, 'external');
            writeFileSync(file, '{"status":"passed"}', {mode: 0o600});
            writeFileSync(join(outside, 'untouched.txt'), 'outside');
            symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
            const modes = [output, nested, file, outside].map(entry => lstatSync(entry).mode);
            const changed: Array<{file: string; uid: number; gid: number}> = [];
            handOffQualificationOutput(output, qualificationOutputOwner('1001', '1002')!,
                (entry, uid, gid) => changed.push({file: entry, uid, gid}));
            expect(changed.map(entry => entry.file).sort()).toEqual([output, nested, file, link].sort());
            expect(changed.every(entry => entry.uid === 1001 && entry.gid === 1002)).toBe(true);
            expect([output, nested, file, outside].map(entry => lstatSync(entry).mode)).toEqual(modes);
            expect(lstatSync(link).isSymbolicLink()).toBe(true);
            expect(() => handOffQualificationOutput(output, {uid: 1001, gid: 1002}, () => {throw new Error('ownership failed');})).toThrow('ownership failed');
        } finally {rmSync(root, {recursive: true, force: true});}
    });
});
