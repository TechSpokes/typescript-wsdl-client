/** Reduce raw local measurements to reviewed, reproducible evidence; never infer validation or speed guarantees. */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalJson} from '../../../src/compiler/catalogErrors.js';
import type {PreparationMeasurement, StageRecord} from './preparation-probe.js';
import type {measureCandidatePreparation} from './preparation-candidates.js';

interface Sample {readonly measurement: PreparationMeasurement; readonly contexts?: Awaited<ReturnType<typeof measureCandidatePreparation>>}
interface Case {readonly corpus: string; readonly profile: string; readonly iterations: readonly Sample[]}
interface Report {
  readonly revision: string; readonly baseline: string; readonly sourceDigests: Readonly<Record<string, string>>;
  readonly environment: {readonly node: string}; readonly collection: unknown; readonly largerRealTier: unknown;
  readonly measurements: readonly Case[];
}
const rounding = (value: number): number => Math.round(value * 1000) / 1000;
function timing(samples: readonly StageRecord[]) {
  const first = samples[0];
  if (samples.some(sample => sample.classification !== first.classification || sample.logicalWork !== first.logicalWork)) throw new Error('Stage classification/work differs between repetitions');
  return {classification: first.classification, ...(first.detail ? {detail: first.detail} : {}),
    coldMs: rounding(first.wallMs), warmMs: samples.slice(1).map(sample => rounding(sample.wallMs)),
    processPeakRssKiB: samples.map(sample => sample.processPeakRssKiB), logicalWork: first.logicalWork};
}
function allStages(measurement: PreparationMeasurement): readonly StageRecord[] {return [...measurement.stages, ...measurement.resolvedPipeline, ...measurement.resolvedEntries];}
function contextSummary(samples: readonly Sample[]) {
  const contexts = samples.map(sample => sample.contexts), first = contexts[0];
  if (!first) return first;
  const {stages: sourceStages, ...sourceData} = first.sourceOwned;
  const sourceRepeats = contexts.map(context => context?.sourceOwned);
  if (sourceRepeats.some(repeat => !repeat)) throw new Error('Missing source-owned preparation workload');
  for (const repeat of sourceRepeats) {
    const {stages: _stages, ...data} = repeat!;
    if (canonicalJson(data) !== canonicalJson(sourceData)) throw new Error('Source-owned preparation work is nondeterministic across repetitions');
  }
  const sourceOwned = {...sourceData, stages: sourceStages.map((stage, index) => ({stage: stage.stage,
    ...timing(sourceRepeats.map(repeat => repeat!.stages[index]))}))};
  if (!('reuse' in first)) return {...first, sourceOwned};
  return {classification: first.classification, sourceOwned, workloads: (['reuse', 'rebuildControl'] as const).map(mode => {
    const workload = first[mode];
    const repeats = contexts.map(context => context && 'reuse' in context ? context[mode] : undefined);
    if (!workload || repeats.some(repeat => !repeat)) throw new Error('Missing repeated context workload');
    for (const repeat of repeats) if (canonicalJson(repeat!.finalUsage) !== canonicalJson(workload.finalUsage) || canonicalJson(repeat!.candidates) !== canonicalJson(workload.candidates)) throw new Error('Context work is nondeterministic across repetitions');
    return {mode: workload.mode, contract: workload.contract, acceptance: workload.acceptance, limits: workload.limits,
      classification: workload.classification, finalUsage: workload.finalUsage, candidates: workload.candidates,
      accountingScope: workload.accountingScope,
      stages: workload.stages.map((stage, index) => ({stage: stage.stage, ...timing(repeats.map(repeat => repeat!.stages[index]))})),
    };
  })};
}
function paired(before: Case, after: Case) {
  const a = before.iterations[0].measurement, b = after.iterations[0].measurement;
  // Exact boundary equality is required before reporting a measured optimization.
  for (const key of ['corpus', 'options', 'input', 'catalogBytes', 'catalogSha256', 'semanticFingerprint'] as const) {
    if (canonicalJson(a[key]) !== canonicalJson(b[key])) throw new Error(`${before.corpus}: changed comparison input/output ${key}`);
  }
  return {id: before.corpus, profile: before.profile, input: a.input,
    boundary: {catalogBytes: a.catalogBytes, catalogSha256: a.catalogSha256, semanticFingerprint: a.semanticFingerprint},
    beforeGraph: a.portableGraph, afterGraph: b.portableGraph,
    beforeClassification: a.stagedClassification, afterClassification: b.stagedClassification,
    stages: allStages(a).map(stage => {
      const beforeSamples = before.iterations.map(sample => allStages(sample.measurement).find(row => row.stage === stage.stage)!);
      const afterSamples = after.iterations.map(sample => allStages(sample.measurement).find(row => row.stage === stage.stage)!);
      if (afterSamples.some(sample => !sample)) throw new Error('Missing comparable stage');
      return {stage: stage.stage, before: timing(beforeSamples), after: timing(afterSamples)};
    }),
    contexts: contextSummary(after.iterations),
  };
}
export async function summarizePreparation(beforeFile: string, afterFile: string, output: string): Promise<void> {
  const before = JSON.parse(await readFile(beforeFile, 'utf8')) as Report, after = JSON.parse(await readFile(afterFile, 'utf8')) as Report;
  if (before.environment.node !== after.environment.node) throw new Error('Node versions differ');
  const cases = before.measurements.map(item => {
    const candidate = after.measurements.find(other => other.corpus === item.corpus && other.profile === item.profile);
    if (!candidate) throw new Error('Missing after case');
    return paired(item, candidate);
  });
  if (cases.length !== after.measurements.length) throw new Error('Corpus/profile series differ');
  const summary = {format: 'preparation-evidence-v1', baselineRevision: before.baseline, candidateParentRevision: after.revision,
    sourceRevisions: {baseline: before.sourceDigests, candidate: after.sourceDigests}, environment: after.environment,
    collection: after.collection, largerRealTier: after.largerRealTier,
    qualifications: [
      'Source snapshot hashes identify the exact measured code, including uncommitted modules; delivery commit is pinned separately in the issue handoff.',
      'Portable artifact bytes, fingerprints and input closure are identical before/after. Source paths differ when the baseline is measured from its archived source tree.',
      'Only retained object sharing is attributed to catalogProvenance memoization. Main-to-candidate composition also consumes the concrete charged wildcard owner; changed wildcard work is not a provenance speedup.',
      'Context workloads compare the same new API reused versus deliberately rebuilt actual stores. Baseline main has no equivalent real-graph request adapter.',
      'The separately named source-owned request workload uses the authentic finite-checker source preparation route without running schema validity. Baseline main has no matching API. Its source snapshot/context work is shared; loader, canonical build and resolution retain explicitly separate limits.',
      'Default and diagnostic limits are distinct rows. Default exhaustion is a resource result, not invalid XSD or a universal negative.',
      'Process peak RSS is a lifetime high-water observation; no exclusive stage-memory or portable throughput guarantee follows.',
      'Logical source-stage counters retain their historical independent budgets. Each new actual-plus-candidate workload has one cumulative request budget.',
    ], cases};
  await mkdir(path.dirname(output), {recursive: true});
  await writeFile(output, JSON.stringify(summary, null, 2) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , before, after, output] = process.argv;
  if (!before || !after || !output) throw new Error('Usage: preparation-summary.ts before.json after.json output.json');
  await summarizePreparation(before, after, output);
}
