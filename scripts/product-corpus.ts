/**
 * Connects the existing readiness inputs to executable product evidence.
 * @since Unreleased
 */
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';

interface ProductEvidence {
  mode: 'legacy' | 'checked';
  outcome: 'supported' | 'partial' | 'refused';
  stages: string[];
  tests: string[];
  commands: string[];
}
interface CorpusInput {
  id: string; tier: string; source: string; permission: string;
  product?: ProductEvidence[];
}
const corpus = JSON.parse(readFileSync('test/conformance/readiness-corpus.json', 'utf8')) as {inputs: CorpusInput[]};
const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as {scripts: Record<string, string>}).scripts;
const rows = corpus.inputs.flatMap(input => (input.product ?? []).map(evidence => ({input, evidence})));
if (!rows.length) throw new Error('Product corpus evidence is empty');
for (const {input, evidence} of rows) {
  if (!input.permission || !existsSync(input.source) || !evidence.stages.length || !evidence.tests.length)
    throw new Error('Incomplete product corpus row: ' + input.id);
  for (const test of evidence.tests)
    if (!test.startsWith('test/') || test.startsWith('test/research/') || !test.endsWith('.test.ts') || !existsSync(test))
      throw new Error('Missing or non-product corpus test: ' + test);
  for (const command of evidence.commands)
    if (!scripts[command] || /research/.test(command) || /research\//.test(scripts[command]!))
      throw new Error('Missing or non-product corpus command: ' + command);
}

const repository = 'https://github.com/TechSpokes/typescript-wsdl-client/blob/main/';
const table = rows.map(({input, evidence}) => {
  const links = evidence.tests.map(file => `[${file.split('/').at(-1)}](${repository}${file})`).join(', ');
  const commands = evidence.commands.map(command => `\`npm run ${command}\``).join(', ');
  return `| [${input.id}](${repository}${input.source}) | ${input.tier} | ${evidence.mode} | ${evidence.outcome} | ${evidence.stages.join(', ')} | ${[links, commands].filter(Boolean).join('; ')} |`;
});
const markdown = '# Product Corpus Evidence\n\nRepresentative inputs and their maintained product checks. See the root [README](../README.md) and [Supported Patterns](supported-patterns.md) for the separate legacy and checked support boundaries.\n\n'
  + '## Evidence index\n\nThis table is generated from `test/conformance/readiness-corpus.json`; its source identity and permission records are checked by the readiness inventory tests. A row indexes executable evidence, not a percentage of WSDL/XSD support or a claim of live provider acceptance.\n\n'
  + '| Input | Provenance tier | Mode | Expected result | Evidence stages | Executable evidence |\n|---|---|---|---|---|---|\n'
  + table.join('\n') + '\n\n## Run the corpus\n\n```bash\nnpm run test:corpus\n```\n\n'
  + 'The command selects the existing tests once and delegates installed-package checks to their existing script. Refused rows prove their named failure and dispatch boundary; they do not count as successfully generated services.\n\n'
  + 'Installed variant evidence uses independently checked source-derived variants where named; it does not assert an unchanged production-provider contract. Private service evidence remains separate and is not required by this public corpus command.\n\n'
  + '## Maintain the index\n\nAdd rights-cleared inputs and independent expected exchanges to the existing conformance framework. Preserve supported behavior, invalid-input checks, compatibility and security requirements alongside corpus growth.\n\n```bash\nnpm run docs:corpus\nnpm run docs:corpus:check\n```\n';
const args = process.argv.slice(2);
if (args.length > 1 || args.some(arg => !['--check', '--test'].includes(arg))) throw new Error('Expected --check or --test');
if (args.includes('--test')) {
  const tests = [...new Set(['test/tooling/readiness-inventory.test.ts', ...rows.flatMap(row => row.evidence.tests)])].sort();
  execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...tests], {stdio: 'inherit'});
  for (const command of [...new Set(rows.flatMap(row => row.evidence.commands))].sort()) {
    if (!process.env.npm_execpath) throw new Error('Run the corpus through npm run test:corpus');
    execFileSync(process.execPath, [process.env.npm_execpath, 'run', command], {stdio: 'inherit'});
  }
} else if (args.includes('--check')) {
  if (readFileSync('docs/corpus.md', 'utf8').replaceAll('\r\n', '\n') !== markdown) throw new Error('Product corpus index is stale; run npm run docs:corpus');
  console.log('Product corpus index is up to date.');
} else {
  writeFileSync('docs/corpus.md', markdown);
  console.log('Updated docs/corpus.md');
}
