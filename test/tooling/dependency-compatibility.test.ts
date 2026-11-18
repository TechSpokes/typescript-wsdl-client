import {verificationPath} from '../helpers/verificationPath.js';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('security dependency override compatibility', () => {
    let root: string;

    beforeEach(async () => {
        const parent = resolve(verificationPath('tmp/conformance/dependency-compatibility'));
        await mkdir(parent, { recursive: true });
        root = await mkdtemp(join(parent, 'run-'));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it('preserves ESLint brace-pattern discovery, ignored files and TypeScript rules', async () => {
        await mkdir(join(root, 'src'));
        for (const name of ['one.ts', 'two.mts', 'ignored.skip.ts']) {
            await writeFile(join(root, 'src', name), 'export const value: any = 1;');
        }
        const eslint = new ESLint({
            cwd: root,
            overrideConfigFile: true,
            overrideConfig: [
                { ignores: ['**/*.skip.ts'] },
                {
                    files: ['src/**/*.{ts,mts}'],
                    languageOptions: { parser: tseslint.parser },
                    plugins: { '@typescript-eslint': tseslint.plugin },
                    rules: { '@typescript-eslint/no-explicit-any': 'error' },
                },
            ],
        });
        const results = await eslint.lintFiles(['src/**/*.{ts,mts}']);
        expect(results.map(result => basename(result.filePath)).sort()).toEqual(['one.ts', 'two.mts']);
        for (const result of results) {
            expect(result.fatalErrorCount).toBe(0);
            expect(result.messages.map(message => message.ruleId)).toEqual(['@typescript-eslint/no-explicit-any']);
        }
    });

    it('preserves the TypeScript project service default-project glob and typed linting', async () => {
        await mkdir(join(root, 'src'));
        await writeFile(join(root, 'src', 'included.ts'), 'export {};');
        await writeFile(join(root, 'tsconfig.json'), JSON.stringify({
            compilerOptions: { strict: true, target: 'ES2022' },
            include: ['src/**/*.ts'],
        }));
        const eslint = new ESLint({
            cwd: root,
            overrideConfigFile: true,
            overrideConfig: [{
                files: ['*.ts'],
                languageOptions: {
                    parser: tseslint.parser,
                    parserOptions: {
                        tsconfigRootDir: root,
                        projectService: { allowDefaultProject: ['*.ts'], defaultProject: 'tsconfig.json' },
                    },
                },
                plugins: { '@typescript-eslint': tseslint.plugin },
                rules: { '@typescript-eslint/no-floating-promises': 'error' },
            }],
        });
        const [result] = await eslint.lintText('Promise.resolve(1);', { filePath: join(root, 'outside.ts') });
        expect(result?.fatalErrorCount).toBe(0);
        expect(result?.messages.map(message => message.ruleId)).toEqual(['@typescript-eslint/no-floating-promises']);
    });

});
