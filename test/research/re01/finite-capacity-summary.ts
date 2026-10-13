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
  fixture?: unknown; acceptance?: string; corpusTier?: string; claims?: unknown; retained?: unknown;
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
function deterministic(sample: Sample) {
  return {kind: sample.kind, final: sample.final, fixture: sample.fixture, claims: sample.claims,
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
    for (const key of ['format', 'revision', 'trackedDiffSha256', 'sourceDigests', 'node', 'platform', 'architecture', 'cpu', 'fixedOrigin'] as const) {
      if (!equal(report[key], first[key])) throw new Error(`Measurement provenance differs: ${key}`);
    }
  }
  const workloads = [...new Set(first.results.map(sample => sample.workload))];
  const cases = workloads.map(workload => {
    const profiles = reports.map(report => {
      const samples = report.results.filter(sample => sample.workload === workload), sample = samples[0]!;
      if (samples.length !== 3 || !equal(samples.map(item => item.iteration), [0, 1, 2])) throw new Error('Missing three ordered samples');
      if (samples.some(item => !equal(deterministic(item), deterministic(sample)))) throw new Error(`Nondeterministic work: ${workload}`);
      if (sample.kind === 'controls' && (!sample.oversized?.stickyFailure || !sample.oversized.unchangedUsage ||
          sample.oversized.invoked || !sample.sharedCycle?.preserved)) throw new Error('Adversarial control failed');
      return {profile: report.profile, limits: report.limits, ...deterministic(sample),
        acceptance: sample.acceptance ?? (sample.kind === 'checked-candidate' ? 'supplied-construction-and-finite-evidence' : undefined),
        corpusTier: sample.corpusTier, receiptSha256: samples.map(item => item.receiptSha256 ?? null),
        totalWallMs: samples.map(item => rounded(item.stages.reduce((total, stage) => total + stage.wallMs, 0))),
        stages: sample.stages.map((stage, index) => ({name: stage.name, work: stage.marginalWork, nodes: stage.marginalNodes,
          wallMs: samples.map(item => rounded(item.stages[index]!.wallMs)),
          processPeakRssKiB: samples.map(item => item.stages[index]!.processPeakRssKiB),
          rssBeforeBytes: samples.map(item => item.stages[index]!.rssBeforeBytes),
          rssAfterBytes: samples.map(item => item.stages[index]!.rssAfterBytes),
          heapBeforeBytes: samples.map(item => item.stages[index]!.heapBeforeBytes),
          heapAfterBytes: samples.map(item => item.stages[index]!.heapAfterBytes)}))};
    });
    const normal = profiles.find(profile => profile.profile === 'default')!;
    const diagnostic = profiles.find(profile => profile.profile === 'diagnostic')!;
    if (normal.kind !== 'controls') {
      if (!['prepared', 'checked-candidate'].includes(normal.kind)) throw new Error(`Default does not complete: ${workload}`);
      for (const key of ['kind', 'final', 'fixture', 'claims', 'retained', 'candidates', 'graphSha256', 'receiptSha256'] as const) {
        if (!equal(normal[key], diagnostic[key])) throw new Error(`Default/diagnostic result differs: ${workload} ${key}`);
      }
    }
    return {workload, profiles};
  });
  const report = {format: 'semantic-capacity-evidence-v1', revision: first.revision,
    trackedDiffSha256: first.trackedDiffSha256, sourceDigests: first.sourceDigests,
    rawReports: reports.map((item, index) => ({profile: item.profile, sha256: hash(texts[index]!)})),
    environment: {node: first.node, platform: first.platform, architecture: first.architecture, cpu: first.cpu},
    fixedOrigin: first.fixedOrigin, terminalReservationWork: TERMINAL_RESERVATION_WORK,
    collection: first.collection, largerRealTier: first.largerRealTier, cases};
  mkdirSync(path.dirname(output), {recursive: true});
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [legacy, normal, diagnostic, output] = process.argv.slice(2);
  if (!legacy || !normal || !diagnostic || !output) throw new Error('Usage: finite-capacity-summary.ts legacy.json default.json diagnostic.json output.json');
  summarizeCapacity([legacy, normal, diagnostic], output);
}
