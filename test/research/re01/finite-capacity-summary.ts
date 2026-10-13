/** Reduce calibration samples while checking deterministic costs and profile equivalence. */
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TERMINAL_RESERVATION_WORK} from '../../../src/compiler/semanticBudget.js';

interface Usage {nodes: number; work: number}
interface Stage {
  name: string; marginalWork: number | null; marginalNodes: number | null; kind?: string;
  wallMs: number; processPeakRssKiB: number; rssBeforeBytes: number; rssAfterBytes: number;
  heapBeforeBytes: number; heapAfterBytes: number;
}
interface Sample {
  workload: string; iteration: number; kind: string; final?: Usage; stages: Stage[];
  fixture?: unknown; acceptance?: string; corpusTier?: string; basis?: string; claims?: unknown; retained?: unknown;
  candidates?: unknown; graphComponents?: number; graphSha256?: string; receiptSha256?: string;
  oversized?: {result: unknown; stickyFailure: boolean; unchangedUsage: boolean; invoked: boolean};
  sharedCycle?: {preserved: boolean; usage: Usage}; nodes?: unknown;
}
interface Report {
  format: string; revision: string; trackedDiffSha256: string; sourceDigests: Record<string, string>;
  node: string; platform: string; architecture: string; cpu: string; fixedOrigin: string;
  profile: string; limits: {maxNodes: number; maxWork: number}; collection: string; largerRealTier: unknown;
  results: Sample[];
}
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const rounded = (value: number): number => Math.round(value * 1000) / 1000;
// Keep short numerical cost/sample vectors readable without expanding each
// number onto a separate line. This is formatting only; JSON types are retained.
function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/\[\n\s+(?:-?\d+(?:\.\d+)?|null)(?:,\n\s+(?:-?\d+(?:\.\d+)?|null))*\n\s*\]/g,
    array => JSON.stringify(JSON.parse(array))) + '\n';
}
function input(sample: Sample) {
  return {fixture: sample.fixture, acceptance: sample.acceptance, corpusTier: sample.corpusTier, basis: sample.basis};
}
function deterministic(sample: Sample) {
  return {kind: sample.kind, final: sample.final, ...input(sample), claims: sample.claims,
    retained: sample.retained, candidates: sample.candidates, graphComponents: sample.graphComponents,
    graphSha256: sample.graphSha256, oversized: sample.oversized, sharedCycle: sample.sharedCycle, nodes: sample.nodes,
    stages: sample.stages.map(stage => ({name: stage.name, work: stage.marginalWork, nodes: stage.marginalNodes, kind: stage.kind}))};
}
export function summarizeCapacity(files: readonly string[], output: string): void {
  const texts = files.map(file => readFileSync(file, 'utf8'));
  const reports = texts.map(text => JSON.parse(text) as Report), first = reports[0]!;
  if (reports.length !== 3 || !equal(reports.map(report => report.profile).sort(), ['default', 'diagnostic', 'legacy'])) {
    throw new Error('Require exactly the legacy, default and diagnostic reports');
  }
  for (const report of reports) {
    for (const key of ['format', 'revision', 'trackedDiffSha256', 'sourceDigests', 'node', 'platform', 'architecture', 'cpu', 'fixedOrigin', 'collection', 'largerRealTier'] as const) {
      if (!equal(report[key], first[key])) throw new Error(`Measurement provenance differs: ${key}`);
    }
    if (!equal(report.results.map(sample => [sample.workload, sample.iteration]),
      first.results.map(sample => [sample.workload, sample.iteration]))) throw new Error('Workload coverage/order differs');
  }
  const workloads = [...new Set(first.results.map(sample => sample.workload))];
  const cases = workloads.map(workload => {
    const rows = reports.map(report => {
      const samples = report.results.filter(sample => sample.workload === workload), sample = samples[0]!;
      if (samples.length !== 3 || !equal(samples.map(item => item.iteration), [0, 1, 2])) throw new Error('Missing three ordered samples');
      if (samples.some(item => !equal(deterministic(item), deterministic(sample)))) throw new Error(`Nondeterministic work: ${workload}`);
      if (sample.kind === 'controls' && (!sample.oversized?.stickyFailure || !sample.oversized.unchangedUsage ||
          sample.oversized.invoked || !sample.sharedCycle?.preserved)) throw new Error('Adversarial control failed');
      return {profile: report.profile, sample, samples};
    });
    const normal = rows.find(row => row.profile === 'default')!.sample;
    for (const row of rows) if (!equal(input(row.sample), input(normal))) throw new Error(`Workload input differs: ${workload}`);
    if (normal.kind !== 'controls') {
      if (!['prepared', 'checked-candidate'].includes(normal.kind)) throw new Error(`Default does not complete: ${workload}`);
      for (const row of rows.filter(item => item.profile !== 'legacy' || item.sample.kind === normal.kind)) {
        for (const key of ['kind', 'final', 'fixture', 'claims', 'retained', 'candidates', 'graphSha256'] as const) {
          if (!equal(normal[key], row.sample[key])) throw new Error(`Completed result differs: ${workload} ${row.profile} ${key}`);
        }
        if (!equal(row.samples.map(sample => sample.receiptSha256),
          rows.find(item => item.profile === 'default')!.samples.map(sample => sample.receiptSha256))) {
          throw new Error(`Completed receipt differs: ${workload} ${row.profile}`);
        }
      }
    }
    return {workload, ...input(normal),
      acceptance: normal.acceptance ?? (normal.kind === 'checked-candidate' ? 'supplied-construction-and-finite-evidence' : undefined),
      claims: normal.claims, graphComponents: normal.graphComponents, graphSha256: normal.graphSha256,
      retained: normal.retained, completedCandidates: normal.candidates,
      receiptSha256: normal.receiptSha256 ? rows.find(row => row.profile === 'default')!.samples.map(sample => sample.receiptSha256) : undefined,
      controls: normal.kind === 'controls' ? {oversized: normal.oversized, sharedCycle: normal.sharedCycle, nodes: normal.nodes} : undefined,
      profiles: Object.fromEntries(rows.map(({profile, sample, samples}) => [profile, {
        kind: sample.kind, final: sample.final, resultSha256: hash(JSON.stringify(deterministic(sample))),
        stageCosts: Object.fromEntries(sample.stages.map(stage => [stage.name, [stage.marginalWork, stage.marginalNodes]])),
        totalWallMs: samples.map(item => rounded(item.stages.reduce((total, stage) => total + stage.wallMs, 0))),
        processPeakRssKiB: samples.map(item => Math.max(...item.stages.map(stage => stage.processPeakRssKiB))),
        maxObservedHeapAfterBytes: samples.map(item => Math.max(...item.stages.map(stage => stage.heapAfterBytes))),
      }]))};
  });
  const report = {format: 'semantic-capacity-evidence-v2', revision: first.revision,
    trackedDiffSha256: first.trackedDiffSha256, sourceDigests: first.sourceDigests,
    summaryReducerSha256: hash(readFileSync(fileURLToPath(import.meta.url), 'utf8')),
    rawReports: reports.map((item, index) => ({profile: item.profile, limits: item.limits,
      path: path.relative(process.cwd(), files[index]!).split(path.sep).join('/'), sha256: hash(texts[index]!),
      reproduce: `node --import tsx test/research/re01/finite-capacity-measure.ts --profile ${item.profile} > tmp/conformance/budget-calibration/${item.profile}.json`})),
    environment: {node: first.node, platform: first.platform, architecture: first.architecture, cpu: first.cpu},
    fixedOrigin: first.fixedOrigin, terminalReservationWork: TERMINAL_RESERVATION_WORK,
    collection: first.collection, summary: 'Original measurements retained; no remeasurement. Full stage wall and before/after RSS/heap telemetry remains in the hashed raw reports. Stage costs are [marginal work, marginal nodes]. Samples are ordered cold, warm, warm. Heap maxima preserve the original post-stage observation series; they are not allocation totals or guaranteed peaks.',
    largerRealTier: first.largerRealTier, cases};
  mkdirSync(path.dirname(output), {recursive: true});
  writeFileSync(output, compactJson(report));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [legacy, normal, diagnostic, output] = process.argv.slice(2);
  if (!legacy || !normal || !diagnostic || !output) throw new Error('Usage: finite-capacity-summary.ts legacy.json default.json diagnostic.json output.json');
  summarizeCapacity([legacy, normal, diagnostic], output);
}
