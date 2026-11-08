import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {historicalSources} from '../../test/conformance/reference/historical-source.js';

interface Obligation {
  id: string; source: string; method: string; target: string; targetSha256: string;
  line: number; endLine: number; sourceContractSha256: string;
  owner: number; status: string; acceptedContract: string; command: string;
  caseFamilies: {line: number; expression: string}[];
}
interface MigrationMap {obligations: Obligation[]}
const product = JSON.parse(readFileSync('test/conformance/reference/migration-map.json', 'utf8')) as MigrationMap;
const research = JSON.parse(readFileSync('research/reference/migration-map.json', 'utf8')) as MigrationMap;
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

it('retains every historical method exactly once across product and research', () => {
  const rows = [...product.obligations, ...research.obligations];
  expect(product.obligations).toHaveLength(16);
  expect(research.obligations).toHaveLength(37);
  expect(new Set(rows.map(row => row.id)).size).toBe(53);
  for (const [file, text] of historicalSources()) {
    const methods = [...text.matchAll(/^    def (test_\w+)/gm)].map(match => match[1]);
    expect(rows.filter(row => row.source === file).map(row => row.method).sort(), file).toEqual(methods.sort());
  }
  for (const row of research.obligations) {
    const source = historicalSources().get(row.source)!;
    const block = source.split('\n').slice(row.line - 1, row.endLine).join('\n');
    expect(digest(block), row.id).toBe(row.sourceContractSha256);
    expect(row.caseFamilies).toEqual(block.split('\n').flatMap((line, i) => /\bfor .+ in |subTest\(/.test(line) ? [{line: row.line + i, expression: line.trim()}] : []));
    expect(digest(readFileSync(row.target, 'utf8')), row.id).toBe(row.targetSha256);
    expect(row.status).toBe('verified');
    expect(row.acceptedContract).toBe('NT-CONT-01');
    expect(row.command).toContain(row.target);
    expect(row.owner).toBeGreaterThanOrEqual(242);
    expect(row.owner).toBeLessThanOrEqual(250);
  }
});
