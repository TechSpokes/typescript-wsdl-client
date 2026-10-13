/** Validate complete scalar calibration provenance, deterministic costs and resource controls. */
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SCALAR_CAPACITY_LIMITS} from './scalar-capacity-measure.js';

interface Memory {rss: number; heapUsed: number; heapTotal: number; external: number; arrayBuffers: number}
interface Sample {
  iteration: number; workload: string; profile: string; expected: string; kind: string;
  usage: {nodes: number; work: number};
  query: {work: number; wallMs: number; memoryBefore: Memory; memoryAfter: Memory};
  totalWallMs: number; memoryBefore: Memory; memoryAfter: Memory; peakRssKiB: number; stickyExhaustion?: boolean;
}
interface Report {
  format: string; revision: string; sourceDigests: Record<string, string>;
  node: string; platform: string; architecture: string; cpu: string;
  profile: keyof typeof SCALAR_CAPACITY_LIMITS; limits: {maxNodes: number; maxWork: number}; collection: string;
  results: Sample[];
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const rounded = (value: number) => Math.round(value * 1000) / 1000;
const deterministic = (sample: Sample) => ({workload: sample.workload, expected: sample.expected, kind: sample.kind,
  usage: sample.usage, queryWork: sample.query.work, stickyExhaustion: sample.stickyExhaustion});

export function summarizeScalarCapacity(files: readonly string[], output: string): void {
  const texts = files.map(file => readFileSync(file, 'utf8')), reports = texts.map(text => JSON.parse(text) as Report);
  if (reports.length !== 4 || !equal(reports.map(report => report.profile).sort(), Object.keys(SCALAR_CAPACITY_LIMITS).sort()))
    throw new Error('Require exactly default, legacy, previous and diagnostic reports');
  const first = reports[0]!;
  for (const report of reports) {
    for (const key of ['format', 'revision', 'sourceDigests', 'node', 'platform', 'architecture', 'cpu', 'collection'] as const)
      if (!equal(report[key], first[key])) throw new Error(`Provenance differs: ${key}`);
    if (report.format !== 'scalar-capacity-v1' || !equal(report.limits, SCALAR_CAPACITY_LIMITS[report.profile]))
      throw new Error(`Incorrect format or limits: ${report.profile}`);
    if (!equal(report.results.map(sample => [sample.workload, sample.iteration]), first.results.map(sample => [sample.workload, sample.iteration])))
      throw new Error('Workload coverage/order differs');
    for (const sample of report.results) {
      if (sample.profile !== report.profile || !Number.isSafeInteger(sample.usage.work) || !Number.isSafeInteger(sample.usage.nodes)
        || sample.usage.work > report.limits.maxWork || sample.usage.nodes > report.limits.maxNodes
        || sample.usage.work < 0 || sample.usage.nodes < 0 || sample.query.work < 0 || sample.query.work > sample.usage.work)
        throw new Error(`Invalid accounting: ${sample.workload}`);
      if (sample.kind === 'resource-limit' && sample.stickyExhaustion !== true) throw new Error('Exhaustion was not sticky');
      if (sample.kind !== 'resource-limit' && sample.kind !== sample.expected) throw new Error('Incorrect semantic result');
    }
  }
  const workloads = [...new Set(first.results.map(sample => sample.workload))];
  const cases = workloads.map(workload => {
    const rows = reports.map(report => {
      const samples = report.results.filter(sample => sample.workload === workload), sample = samples[0]!;
      if (samples.length !== 3 || !equal(samples.map(item => item.iteration), [0, 1, 2])) throw new Error('Require three ordered samples');
      if (samples.some(item => !equal(deterministic(item), deterministic(sample)))) throw new Error(`Nondeterministic work: ${workload}`);
      return {profile: report.profile, sample, samples};
    });
    const normal = rows.find(row => row.profile === 'default')!.sample, diagnostic = rows.find(row => row.profile === 'diagnostic')!.sample;
    if (!equal(deterministic(normal), deterministic(diagnostic))) throw new Error(`Default/diagnostic differ: ${workload}`);
    if (normal.kind !== normal.expected) throw new Error(`Default failed to complete its expected decision/control: ${workload}`);
    for (const row of rows) {
      if (row.sample.expected !== normal.expected) throw new Error('Profile inputs differ');
      if (row.sample.kind !== 'resource-limit' && !equal(deterministic(row.sample), deterministic(normal)))
        throw new Error(`Completed profile result differs: ${workload}`);
    }
    return {workload, expected: normal.expected, profiles: Object.fromEntries(rows.map(({profile, sample, samples}) => [profile, {
      ...deterministic(sample), queryWallMs: samples.map(item => rounded(item.query.wallMs)),
      totalWallMs: samples.map(item => rounded(item.totalWallMs)), peakRssKiB: samples.map(item => item.peakRssKiB),
      observedHeapAfterBytes: samples.map(item => item.memoryAfter.heapUsed),
    }]))};
  });
  const completed = reports.find(report => report.profile === 'default')!.results.filter(sample => sample.kind !== 'resource-limit');
  const maximumWork = Math.max(...completed.map(sample => sample.usage.work)), normalLimits = SCALAR_CAPACITY_LIMITS.default;
  const evidence = {format: 'scalar-capacity-evidence-v1', revision: first.revision, sourceDigests: first.sourceDigests,
    summaryReducerSha256: hash(readFileSync(fileURLToPath(import.meta.url), 'utf8')),
    rawReports: reports.map((report, index) => ({profile: report.profile, limits: report.limits,
      path: path.relative(process.cwd(), files[index]!).split(path.sep).join('/'), sha256: hash(texts[index]!),
      reproduce: `node --import tsx test/research/re01/scalar-capacity-measure.ts --profile ${report.profile} > tmp/conformance/scalar-capacity/${report.profile}.json`})),
    environment: {node: first.node, platform: first.platform, architecture: first.architecture, cpu: first.cpu},
    collection: first.collection,
    scope: 'Complete local scalar decisions and resource controls. Baseline HEAD plus exact source digests identifies the uncommitted measured implementation; no universal RE01 or production-activation claim.',
    summary: {workloads: workloads.length, samplesPerProfile: first.results.length, maximumCompletedWork: maximumWork,
      remainingWorkAllowance: normalLimits.maxWork - maximumWork,
      headroomFraction: (normalLimits.maxWork - maximumWork) / maximumWork,
      maximumCompletedNodes: Math.max(...completed.map(sample => sample.usage.nodes)),
      maximumQueryWallMs: rounded(Math.max(...completed.map(sample => sample.query.wallMs))),
      maximumProcessPeakRssKiB: Math.max(...completed.map(sample => sample.peakRssKiB)),
      maximumObservedHeapAfterBytes: Math.max(...completed.map(sample => sample.memoryAfter.heapUsed))}, cases};
  mkdirSync(path.dirname(output), {recursive: true}); writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [normal, legacy, previous, diagnostic, output] = process.argv.slice(2);
  if (!normal || !legacy || !previous || !diagnostic || !output) throw new Error('Usage: scalar-capacity-summary.ts default.json legacy.json previous.json diagnostic.json output.json');
  summarizeScalarCapacity([normal, legacy, previous, diagnostic], output);
}
