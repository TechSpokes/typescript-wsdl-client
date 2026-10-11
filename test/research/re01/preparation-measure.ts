/** Reproduce: node --import tsx test/research/re01/preparation-measure.ts --output tmp/conformance/preparation/report.json */
import {execFileSync} from 'node:child_process';
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {COMMITTED_PREPARATION_CORPUS, LARGER_REAL_TIER, PREPARATION_BASELINE, digest, materializeSynthetic} from './preparation-corpus.js';
import {measurePreparation} from './preparation-probe.js';
import type {LimitProfile, PreparationMeasurement} from './preparation-probe.js';

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '../../..');
const arg = (name: string): string | undefined => {const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1];};
async function sourceSnapshot(): Promise<Record<string, string>> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(path.resolve(root, directory), {withFileTypes: true})) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await visit(relative);
      else if (entry.name.endsWith('.ts')) files.push(relative);
    }
  };
  await visit('src');
  files.push('package-lock.json', 'test/research/re01/preparation-corpus.ts', 'test/research/re01/preparation-probe.ts', 'test/research/re01/preparation-measure.ts');
  if (process.argv.includes('--contexts')) files.push('test/research/re01/preparation-candidates.ts');
  files.sort();
  return Object.fromEntries(await Promise.all(files.map(async source => [source, digest(await readFile(path.resolve(root, source)))])));
}
async function main() {
  const corpus = [...COMMITTED_PREPARATION_CORPUS];
  for (const size of [4, 16, 64, 128]) corpus.push(await materializeSynthetic(root, size));
  const worker = arg('--worker');
  if (worker) {
    const selected = corpus.find(item => item.id === worker); if (!selected) throw new Error('Unknown corpus');
    const profile = arg('--profile') as LimitProfile;
    if (!['default', 'diagnostic'].includes(profile)) throw new Error('Unknown profile');
    const samples: {measurement: PreparationMeasurement; contexts?: unknown}[] = [];
    const contexts = process.argv.includes('--contexts') ? await import('./preparation-candidates.js') : undefined;
    for (let iteration = 0; iteration < 3; iteration++) samples.push({measurement: await measurePreparation(selected, root, profile), ...(contexts ? {contexts: await contexts.measureCandidatePreparation(selected, root, profile)} : {})});
    process.stdout.write(JSON.stringify({corpus: worker, profile, iterations: samples.map((sample, iteration) => ({phase: iteration === 0 ? 'cold-process-first-call' : 'warm-process-repeat', iteration, ...sample}))}));
    return;
  }
  const output = arg('--output'); if (!output) throw new Error('--output is required');
  const sourceDigests = await sourceSnapshot();
  const selected = arg('--corpus');
  const measurements: unknown[] = [];
  for (const item of corpus.filter(item => !selected || item.id === selected)) for (const profile of ['default', 'diagnostic']) {
    process.stderr.write(`Measuring ${item.id} ${profile}\n`);
    measurements.push(JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', script, '--worker', item.id, '--profile', profile, ...(process.argv.includes('--contexts') ? ['--contexts'] : [])], {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024})));
  }
  if (JSON.stringify(sourceDigests) !== JSON.stringify(await sourceSnapshot())) throw new Error('Source changed during measurement; rerun on a stable source snapshot');
  const report = {format: 'preparation-measurement-v1', baseline: PREPARATION_BASELINE,
    revision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
    worktreeStatus: execFileSync('git', ['status', '--short', '--untracked-files=normal'], {cwd: root, encoding: 'utf8'}),
    trackedDiffSha256: digest(execFileSync('git', ['diff', 'HEAD', '--', 'src'], {cwd: root})), sourceDigests,
    environment: {node: process.version, platform: process.platform, architecture: process.arch, release: os.release(), cpu: os.cpus()[0]?.model},
    collection: {timing: 'performance.now wall milliseconds; cold first call and two warm calls in one fresh child per corpus/profile; module startup excluded; OS file cache uncontrolled',
      memory: 'process.resourceUsage().maxRSS in KiB is lifetime process high-water RSS, observed after each stage; it includes TS loader and previous stages and is neither additive nor per-stage allocation',
      garbageCollection: 'No forced GC; process.memoryUsage before/after is observational. Unique object/field census is a deterministic retained-allocation proxy, not V8 allocated bytes.',
      workload: 'Structural preparation only. Detailed stage profile and real source/catalog entry calls are separate workloads and must not be summed together.',
      candidateComparison: 'Optional --contexts: same new context adapter reused versus deliberately rebuilt actual-control, each with one cumulative budget. Separate source-owned preparation captures the authentic finite-checker source route without validation. Baseline main has neither API, so neither is a before/after semantic comparison.'},
    largerRealTier: LARGER_REAL_TIER, measurements};
  await mkdir(path.dirname(path.resolve(root, output)), {recursive: true});
  await writeFile(path.resolve(root, output), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`${output}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === script) await main();
