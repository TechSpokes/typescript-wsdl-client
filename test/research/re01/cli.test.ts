/** Independent expectations: RE01-independent-behavior-2026-10-11-v1 cliContract. */
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {runResearchCli} from './cli.js';
import {baselineRequest} from './resolver-fixtures.js';
import {MODEL_SELECTION_CONTRACT} from './model-selection.js';

const directory = resolve('tmp/conformance/re01-selector-cli');
mkdirSync(directory, {recursive: true});
const file = resolve(directory, 'candidate.json');
const broken = resolve(directory, 'broken.json');
writeFileSync(file, JSON.stringify(baselineRequest()));
writeFileSync(broken, '{invalid');
afterAll(() => rmSync(directory, {recursive: true, force: true}));
const args = (model = 'derivation'): string[] => ['--re01-model', model, '--candidate-file', file];
const report = (output: string): Record<string, unknown> => JSON.parse(output) as Record<string, unknown>;

describe('dedicated RE01 research CLI', () => {
    it('documents narrow scope and pending explicit selection', () => {
        const help = runResearchCli(['--help']);
        expect(help.exitCode).toBe(0);
        expect(help.output).toContain('--re01-model derivation|schema-preserving');
        expect(help.output).toContain('semantic procedure unresolved');
    });

    it.each([
        [[], 'model-selection-required'],
        [['--candidate-file', file], 'model-selection-required'],
        [args('unknown'), 'invalid-model'],
        [[...args(), '--unknown', 'yes'], 'unknown-option'],
        [[...args(), '--re01-model', 'derivation'], 'invalid-model'],
        [['--re01-model', 'derivation'], 'candidate-file-required'],
        [[...args(), '--max-work', '0'], 'invalid-limits'],
        [[...args(), '--max-nodes', '9007199254740992'], 'invalid-limits'],
    ])('rejects invalid explicit selection/options %j', (options, expected) => {
        const result = runResearchCli(options as string[]);
        expect(result.exitCode).toBe(1);
        expect(report(result.output)).toMatchObject({kind: 'input-error', diagnostic: {code: expected}});
    });

    it.each(['derivation', 'schema-preserving'])('returns model-tagged unresolved semantic status for %s', model => {
        const result = runResearchCli(args(model));
        expect(result.exitCode).toBe(2);
        expect(report(result.output)).toMatchObject({model, contractVersion: MODEL_SELECTION_CONTRACT,
            selection: 'explicit', kind: 'unresolved', scope: 'supplied-candidate-structural-preparation',
            semanticVerdict: 'unresolved', existentialVerdict: 'unresolved', actualSchemaVerdict: 'unresolved'});
        expect(result.output.endsWith('\n')).toBe(true);
    });

    it('reports malformed/missing files without leaking path or exception details', () => {
        const invalid = runResearchCli(['--re01-model', 'derivation', '--candidate-file', broken]);
        expect(invalid.exitCode).toBe(1);
        expect(report(invalid.output)).toMatchObject({model: 'derivation', kind: 'input-error', diagnostic: {code: 'invalid-json'}});
        const missing = runResearchCli(['--re01-model', 'schema-preserving', '--candidate-file', resolve(directory, 'missing.json')]);
        expect(missing.exitCode).toBe(1);
        expect(report(missing.output)).toMatchObject({model: 'schema-preserving', kind: 'input-error', diagnostic: {code: 'candidate-file-unreadable'}});
    });

    it('rejects a nonregular candidate path with an actionable input error', () => {
        const result = runResearchCli(['--re01-model', 'derivation', '--candidate-file', directory]);
        expect(result.exitCode).toBe(1);
        expect(report(result.output)).toMatchObject({kind: 'input-error',
            diagnostic: {code: 'regular-candidate-file-required'}});
    });

    it('includes read/parse/preparation/report/serialization work in exact inclusive boundaries', () => {
        const first = runResearchCli(args());
        const usage = report(first.output).usage as {nodes: number; work: number};
        expect(usage.nodes).toBe(4);
        const exact = runResearchCli([...args(), '--max-nodes', '4', '--max-work', String(usage.work)]);
        expect(exact.exitCode).toBe(2);
        expect(report(exact.output).usage).toEqual(usage);
        const exhausted = runResearchCli([...args(), '--max-work', String(usage.work - 1)]);
        expect(exhausted.exitCode).toBe(3);
        expect(report(exhausted.output)).toMatchObject({model: 'derivation', kind: 'resource-limit', limit: 'work'});
        expect(report(exhausted.output).receipt).toBeUndefined();
        const verySmall = runResearchCli([...args(), '--max-work', '79']);
        expect(report(verySmall.output)).toMatchObject({kind: 'resource-limit', usage: {nodes: 0, work: 79}});
        const nodes = runResearchCli([...args(), '--max-nodes', '3']);
        expect(nodes.exitCode).toBe(3);
        expect(report(nodes.output)).toMatchObject({kind: 'resource-limit', limit: 'nodes'});
    });
});
