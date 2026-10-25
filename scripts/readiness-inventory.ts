/** P2 inventory: source API consumer, not a second semantic checker. */
import {readFileSync, writeFileSync, mkdirSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {assessSchemaSource, serializeAssessmentReport, parseAssessmentReport} from '../src/compiler/checkedAssessment.js';
import {DEFAULT_MAX_NODES, DEFAULT_MAX_WORK} from '../src/compiler/semanticBudget.js';

interface Input {
  id: string; tier: 'synthetic' | 'reference' | 'real' | 'reduced'; source: string;
  origin: string; permission: string; rationale: string;
  files: readonly {path: string; sha256: string; bytes: number}[];
}
interface Manifest {format: 'readiness-corpus-v1'; reusedCorpusRevision: string; assessmentRevision: string; inputs: Input[]; unavailable: {tier: string; reason: string}[]}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'test/conformance/readiness-corpus.json'), 'utf8')) as Manifest;
const {values} = parseArgs({options: {profile: {type: 'string', default: 'default'}, child: {type: 'string'}, output: {type: 'string'}}, strict: true});
if (!['default', 'diagnostic'].includes(values.profile!)) throw new Error('Profile must be default or diagnostic');
const profile = values.profile!;
const limits = {maxNodes: DEFAULT_MAX_NODES, maxWork: profile === 'diagnostic' ? 1_000_000_000 : DEFAULT_MAX_WORK};
const run = async (input: Input) => {
  const paths = input.files.map(file => file.path);
  if (!paths.includes(input.source) || new Set(paths).size !== paths.length) throw new Error('Manifest must uniquely include its source and complete closure');
  for (const file of input.files) {
    const bytes = readFileSync(path.join(root, file.path));
    if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Pinned corpus mismatch: ${file.path}`);
  }
  const started = performance.now();
  const report = await assessSchemaSource(path.join(root, input.source), {loading: {policy: {fileRoots: [root]}}, limits});
  const wallMs = performance.now() - started;
  const json = serializeAssessmentReport(report);
  parseAssessmentReport(json);
  // Verify the complete loader closure, not merely the manifest's root file.
  const loaded = report.resources.map(r => ({id: r.id, digest: r.digest, bytes: r.bytes})).sort((a, b) => a.id.localeCompare(b.id));
  const pinned = input.files.map(file => ({id: createHash('sha256').update(pathToFileURL(realpathSync(path.join(root, file.path))).href).digest('hex'), digest: file.sha256, bytes: file.bytes})).sort((a, b) => a.id.localeCompare(b.id));
  const closureVerified = report.execution === 'completed' && JSON.stringify(loaded) === JSON.stringify(pinned);
  if (report.execution === 'completed' && !closureVerified) throw new Error(`Loaded closure differs: ${input.id}`);
  return {input: input.id, tier: input.tier, profile, closureVerified, options: {loadingPolicy: {fileRoots: ['<repository-root>'], allowedOrigins: []}, limits},
    wallMs, wallTimeScope: 'assessment API only; excludes manifest hashing and report reparse', peakRssKiB: process.resourceUsage().maxRSS, memoryMethod: 'isolated child process high-water RSS (Node runtime, imports and one assessment)',
    reportBytes: Buffer.byteLength(json), report: JSON.parse(json) as unknown,
    reproduce: `npm run assess:inventory -- --profile ${profile}`,};
};
if (values.child !== undefined) {
  const input = manifest.inputs[Number(values.child)];
  if (!input) throw new Error('Unknown corpus input');
  process.stdout.write(JSON.stringify(await run(input)));
} else {
  const rows = manifest.inputs.map((_input, index) => JSON.parse(execFileSync(process.execPath,
    ['--import', 'tsx', fileURLToPath(import.meta.url), '--child', String(index), '--profile', profile], {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024})) as Awaited<ReturnType<typeof run>>);
  const reports = rows.map(row => parseAssessmentReport(JSON.stringify(row.report)));
  const counts = {
    inputs: reports.length, schemaEstablished: reports.filter(r => r.schema === 'established').length,
    schemaDisproved: reports.filter(r => r.schema === 'disproved').length, schemaInconclusive: reports.filter(r => r.schema === 'inconclusive').length,
    schemaEligible: reports.filter(r => r.schemaEligible).length, generationAdmitted: reports.filter(r => r.admitted).length,
    completed: reports.filter(r => r.execution === 'completed').length, resourceLimit: reports.filter(r => r.execution === 'resource-limit').length,
    failed: reports.filter(r => r.execution === 'failed').length, cancelled: reports.filter(r => r.execution === 'cancelled').length,
    operations: reports.reduce((sum, r) => sum + r.operations.length, 0),
    operationInventoriesUnassessed: reports.filter(r => r.operationInventory === 'unassessed').length,
    unavailableTiers: manifest.unavailable.length,
  };
  const output = values.output ?? `tmp/conformance/readiness/${profile}.json`;
  mkdirSync(path.dirname(path.resolve(root, output)), {recursive: true});
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
  const result = {format: 'readiness-inventory-v1', profile, revision, reusedCorpusRevision: manifest.reusedCorpusRevision, assessmentRevision: manifest.assessmentRevision, node: process.version,
    lockDigest: createHash('sha256').update(readFileSync(path.join(root, 'package-lock.json'))).digest('hex'),
    runnerDigest: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    limits, counts, unavailable: manifest.unavailable, inputs: manifest.inputs, rows};
  writeFileSync(path.resolve(root, output), JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify({output, profile, counts}, null, 2) + '\n');
}
