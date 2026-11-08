/**
 * Runs optional research and verifies the historical methods actually executed.
 * @since Unreleased
 */
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync} from 'node:fs';
import {verifySetup} from '../../scripts/semantic-reference.js';

interface Obligation {id: string; method: string; target: string}
const referenceOnly = process.argv.includes('--reference-only');
if (process.argv.slice(2).some(arg => arg !== '--reference-only')) throw new Error('Unknown research argument');
verifySetup();
const map = JSON.parse(readFileSync('research/reference/migration-map.json', 'utf8')) as {obligations: Obligation[]};
mkdirSync('tmp/conformance/research', {recursive: true});
const output = `tmp/conformance/research/${referenceOnly ? 'reference' : 'all'}-tests.json`;
const selection = referenceOnly ? ['research/reference', 'research/provenance.test.ts', ...new Set(map.obligations.map(row => row.target))] : [];
execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.research.config.ts',
  ...selection, '--reporter=default', '--reporter=json', '--outputFile=' + output], {stdio: 'inherit'});
const result = JSON.parse(readFileSync(output, 'utf8')) as {testResults: {
  name: string; assertionResults: {title: string; status: string}[];
}[]};
for (const row of map.obligations) {
  const file = result.testResults.find(file => file.name.replaceAll('\\', '/').endsWith('/' + row.target));
  const test = file?.assertionResults.find(test => test.title === row.id || test.title === row.method.replace(/^test_/, ''));
  if (test?.status !== 'passed') throw new Error('Research method did not execute successfully: ' + row.id);
}
console.log(`Research methods verified: ${map.obligations.length}. Results: ${output}`);
