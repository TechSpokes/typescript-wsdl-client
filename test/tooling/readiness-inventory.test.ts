/** Independent corpus identity and direct grammar eligibility expectations. */
import {readFileSync, mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {describe, it, expect} from 'vitest';
import {parseAssessmentReport} from '../../src/compiler/checkedAssessment.js';

describe('readiness inventory', () => {
  it('pins complete permitted closures and labels unavailable production evidence', () => {
    const corpus = JSON.parse(readFileSync('test/conformance/readiness-corpus.json', 'utf8')) as {inputs: {id: string; source: string; tier: string; permission: string; files: {path: string; bytes: number; sha256: string}[]}[]; unavailable: {tier: string}[]};
    expect(corpus.inputs).toHaveLength(7);
    expect(corpus.inputs.filter(input => input.tier === 'real')).toHaveLength(0);
    expect(corpus.unavailable.some(tier => tier.tier === 'real')).toBe(true);
    for (const input of corpus.inputs) {
      expect(input.permission).toContain('MIT');
      expect(input.files.some(file => file.path === input.source)).toBe(true);
      for (const file of input.files) {
        const bytes = readFileSync(file.path);
        expect(bytes.length).toBe(file.bytes);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
      }
    }
  });
  it('executes one production assessment per input and keeps schema eligibility separate from runtime', () => {
    const parent = path.resolve('tmp/conformance/readiness'); mkdirSync(parent, {recursive: true});
    const directory = mkdtempSync(path.join(parent, 'test-'));
    const output = path.join(directory, 'inventory.json');
    try {
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/readiness-inventory.ts', '--profile', 'default', '--output', output], {cwd: process.cwd(), encoding: 'utf8'});
      const evidence = JSON.parse(readFileSync(output, 'utf8')) as {counts: {inputs: number; generationAdmitted: number}; rows: {input: string; closureVerified: boolean; report: unknown}[]};
      expect(evidence.counts.inputs).toBe(7);
      expect(evidence.counts.generationAdmitted).toBe(0);
      const selected = evidence.rows.find(row => row.input === 'checked-forecast');
      expect(selected?.closureVerified).toBe(true);
      const report = parseAssessmentReport(JSON.stringify(selected?.report));
      // The fixture is an ordinary distinct-name sequence of string/int/boolean fields.
      expect(report.schemaEligible).toBe(true);
      expect(report.operations.map(operation => operation.name)).toEqual(['GetForecast']);
      expect(report.operations[0]?.admitted).toBe(false);
      expect(report.operations[0]?.capabilities.some(capability => capability.status === 'not-assessed')).toBe(true);
    } finally {rmSync(directory, {recursive: true, force: true});}
  }, 60_000);
});
