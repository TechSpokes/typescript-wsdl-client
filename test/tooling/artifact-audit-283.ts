/** Temporary, read-only audit of the four original merged-main qualification archives. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const revision = 'ffa4f3ea6d23fe628e70051c6bef5e6eb566ae62';
const tree = 'c887431207d104f4c9f514d524dcb6d193a43c36';
const runId = 38292960945;
const lanes = [
    { id: 11766728415, name: 'linux-node-24-reference', platform: 'linux', major: '24', bytes: 143391,
        digest: 'fcfb89a350199ad1a5726716d08e265de08e669d719f40dfc5f9f042a3d0da0e' },
    { id: 11766558779, name: 'linux-node-26-reference', platform: 'linux', major: '26', bytes: 140506,
        digest: '57c40dc59c59f9a8396472a63f83420643739a0858efa2a61031ee9e8dfa690f' },
    { id: 11766294858, name: 'windows-node-24-reference', platform: 'win32', major: '24', bytes: 222721,
        digest: '740918a4b1ca735c4cfb4cec6f612681de7a305cda6ad4dd6d1c204179740191' },
    { id: 11766874412, name: 'windows-node-26-reference', platform: 'win32', major: '26', bytes: 222730,
        digest: '68fdad0de5f9fb4458bf06705efea1898c086a42fbcdaa585361a6468524a4fa' },
] as const;
type Json = Record<string, unknown>;
const record = (value: unknown): Json => {
    assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
    return value as Json;
};
const readJson = (path: string): Json => record(JSON.parse(readFileSync(path, 'utf8')) as unknown);
const parseJson = (bytes: Buffer): Json => record(JSON.parse(bytes.toString('utf8')) as unknown);
const hash = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const corpus = resolve(process.argv[2] ?? '');
const source = resolve(process.argv[3] ?? '');
const auditCheckout = resolve(process.argv[4] ?? '');
assert.equal(git(source, 'rev-parse', 'HEAD'), revision);
assert.equal(git(source, 'rev-parse', 'HEAD^{tree}'), tree);
assert.equal(git(source, 'status', '--porcelain'), '');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: source }).toString('utf8').split('\0').filter(Boolean);
assert.equal(tracked.length, 940);
const sourceHashes = Object.fromEntries(tracked.map(path => [path, hash(join(source, path))]));
const run = readJson(join(corpus, 'run.json'));
assert.equal(run.id, runId);
assert.equal(run.head_sha, revision);
assert.equal(run.conclusion, 'success');
assert.equal(run.event, 'push');
assert.equal(run.path, '.github/workflows/node-reference.yml');
const artifactList = readJson(join(corpus, 'artifacts.json')).artifacts;
assert.ok(Array.isArray(artifactList));
const summaries: Json[] = [];
for (const lane of lanes) {
    const metadata = record(artifactList.find(value => record(value).id === lane.id));
    assert.equal(metadata.name, lane.name);
    assert.equal(metadata.expired, false);
    assert.equal(metadata.size_in_bytes, lane.bytes);
    assert.equal(metadata.digest, 'sha256:' + lane.digest);
    const association = record(metadata.workflow_run);
    assert.equal(association.id, runId);
    assert.equal(association.head_sha, revision);
    const archive = join(corpus, lane.id + '.zip');
    assert.equal(statSync(archive).size, lane.bytes);
    assert.equal(hash(archive), lane.digest);
    const members = execFileSync('unzip', ['-Z', '-1', archive], { encoding: 'utf8' }).split('\n').filter(Boolean);
    assert.ok(members.length > 1);
    assert.equal(new Set(members).size, members.length, 'Duplicate ZIP paths');
    for (const path of members) {
        const components = (path.endsWith('/') ? path.slice(0, -1) : path).split('/');
        assert.ok(!path.startsWith('/') && !path.includes('\\') && !/^[A-Za-z]:/.test(path) && !/[*?\[\]]/.test(path)
            && !/[\x00-\x1f\x7f]/.test(path) && components.every(component => component !== '' && component !== '.' && component !== '..'),
        'Unsafe ZIP path: ' + path);
    }
    execFileSync('unzip', ['-tqq', archive]);
    const files = new Map(members.filter(path => !path.endsWith('/')).map(path =>
        [path, execFileSync('unzip', ['-p', archive, path], { maxBuffer: 32 * 1024 * 1024 })] as const));
    const one = (suffix: string): { path: string; bytes: Buffer } => {
        const matches = [...files].filter(([path]) => path === suffix || path.endsWith('/' + suffix));
        assert.equal(matches.length, 1, 'Expected one archived ' + suffix);
        return { path: matches[0]![0], bytes: matches[0]![1] };
    };
    const requiredTests = lane.platform === 'linux' ? one('reference/required-tests.json') : undefined;
    const requiredReport = lane.platform === 'linux' ? one('reference/required-report.json') : undefined;
    if (lane.platform === 'win32') {
        assert.ok(![...files.keys()].some(path => path.endsWith('reference/required-tests.json')
            || path.endsWith('reference/required-report.json')));
    }
    if (requiredTests && requiredReport) {
        const discovery = parseJson(requiredTests.bytes);
        assert.equal(discovery.success, true);
        assert.equal(discovery.numTotalTests, 158);
        assert.equal(discovery.numPassedTests, 158);
        assert.equal(discovery.numPendingTests, 0);
        assert.equal(discovery.numFailedTests, 0);
        assert.ok(Array.isArray(discovery.testResults));
        assert.equal(discovery.testResults.length, 27);
        const reference = parseJson(requiredReport.bytes);
        assert.equal(reference.testedRevision, revision);
        assert.equal(reference.testedTree, tree);
        assert.equal(reference.workingTreeDirty, false);
        assert.ok(Array.isArray(reference.testFiles));
        assert.equal(reference.testFiles.length, 27);
        assert.ok(Array.isArray(reference.executedMethods));
        assert.equal(reference.executedMethods.length, 53);
        assert.deepEqual(reference.failures, []);
        assert.ok(Array.isArray(reference.cases));
        assert.equal(reference.cases.length, 6);
    }
    const fullTests = one('reference/full-tests.json');
    const fullDiscovery = parseJson(fullTests.bytes);
    assert.equal(fullDiscovery.success, true);
    assert.equal(fullDiscovery.numTotalTests, 158);
    assert.equal(fullDiscovery.numPassedTests, lane.platform === 'linux' ? 158 : 155);
    assert.equal(fullDiscovery.numPendingTests, lane.platform === 'linux' ? 0 : 3);
    assert.equal(fullDiscovery.numFailedTests, 0);
    assert.ok(Array.isArray(fullDiscovery.testResults));
    assert.equal(fullDiscovery.testResults.length, 27);
    const fullReport = one('reference/full-report.json');
    const full = parseJson(fullReport.bytes);
    assert.equal(full.testedRevision, revision);
    assert.equal(full.testedTree, tree);
    assert.equal(full.workingTreeDirty, false);
    assert.ok(Array.isArray(full.testFiles));
    assert.equal(full.testFiles.length, 27);
    assert.ok(Array.isArray(full.executedMethods));
    assert.equal(full.executedMethods.length, 53);
    assert.deepEqual(full.failures, []);
    assert.ok(Array.isArray(full.cases));
    assert.equal(full.cases.length, 14);
    assert.equal(full.cases.reduce((count, value) => count + (record(value).instances as unknown[]).length, 0), 40);
    const fullProvenance = record(full.provenance);
    assert.equal(fullProvenance.testedRevision, revision);
    assert.equal(fullProvenance.testedTree, tree);
    assert.equal(fullProvenance.workingTreeDirty, false);
    const provenanceSources = record(fullProvenance.sourceHashes);
    const provenanceInputs = record(fullProvenance.inputHashes);
    const provenanceArtifacts = record(fullProvenance.artifactHashes);
    assert.equal(Object.keys(provenanceSources).length, 116);
    assert.equal(Object.keys(provenanceInputs).length, 337);
    assert.equal(Object.keys(provenanceArtifacts).length, 4);
    for (const entries of [provenanceSources, provenanceInputs])
        for (const [path, digest] of Object.entries(entries))
            assert.equal(digest, sourceHashes[path], 'Provenance source/input mismatch: ' + path);
    for (const [path, digest] of Object.entries(provenanceArtifacts)) {
        assert.ok(path === 'package-lock.json' || path.startsWith('node_modules/libxml2-wasm/'));
        const installedPath = path === 'package-lock.json' ? join(source, path) : join(auditCheckout, path);
        assert.equal(digest, hash(installedPath), 'Installed artifact mismatch: ' + path);
    }
    if (requiredReport) {
        const requiredProvenance = record(parseJson(requiredReport.bytes).provenance);
        for (const key of ['sourceHashes', 'inputHashes', 'artifactHashes'] as const)
            assert.deepEqual(requiredProvenance[key], fullProvenance[key]);
    }
    const research = one('s06-pw01/measurements.json');
    const researchRows = JSON.parse(research.bytes.toString('utf8')) as unknown;
    assert.ok(Array.isArray(researchRows));
    assert.ok(researchRows.length >= 7);
    const reports = [...files.keys()].filter(path => basename(path) === 'platform-results.json');
    assert.equal(reports.length, 1, 'Expected exactly one platform report');
    const report = parseJson(files.get(reports[0]!)!);
    assert.equal(report.formatVersion, 1);
    assert.equal(report.testedRevision, revision);
    assert.equal(report.testedTree, tree);
    assert.equal(report.workingTreeDirty, false);
    assert.equal(report.platform, lane.platform);
    assert.ok(typeof report.node === 'string' && report.node.startsWith('v' + lane.major + '.'));
    assert.equal(report.npm, '11.9.0');
    assert.equal(report.status, 'passed');
    assert.equal(report.failure, undefined);
    assert.equal(record(report.cleanup).status, 'passed');
    const archivedHashes = record(report.sourceHashes);
    assert.deepEqual(Object.keys(archivedHashes).sort(), tracked.slice().sort());
    for (const path of tracked) assert.equal(archivedHashes[path], sourceHashes[path], 'Source mismatch: ' + path);
    assert.equal(report.packageLockSha256, sourceHashes['package-lock.json']);
    const commands = report.commands;
    assert.ok(Array.isArray(commands));
    assert.equal(commands.length, 14);
    const commandTexts = commands.map(value => {
        const entry = record(value);
        assert.equal(entry.status, 'passed');
        assert.equal(typeof entry.command, 'string');
        return entry.command as string;
    });
    const expected = ['environment.ts enforce', 'npm install --global npm@11.9.0', 'npm ci',
        'npm run check:toolchain', 'npm run typecheck:tooling', 'npm run typecheck:research',
        'npm run typecheck:reference', 'npm run typecheck:integration',
        ...(lane.platform === 'linux' ? ['npm run ' + (lane.major === '24' ? 'ci' : 'ci:github:node26')] : []),
        'npm run test:reference:full', 'npm run test:research:ports', 'npm run research:re01:measure',
        'vitest.mjs run test/research/s06-pw01 test/research/dt01',
        ...(lane.platform === 'win32' ? ['npm run test:feasibility'] : []), 'environment.ts verify'];
    assert.equal(expected.length, 14);
    for (let index = 0; index < expected.length; index++)
        assert.ok(commandTexts[index]!.includes(expected[index]!), 'Missing or out-of-order command: ' + expected[index]);
    const enforcement = record(report.enforcement);
    assert.equal(enforcement.testedRevision, revision);
    assert.equal(enforcement.testedTree, tree);
    assert.equal(enforcement.workingTreeDirty, false);
    assert.equal(enforcement.platform, lane.platform);
    assert.equal(enforcement.phase, 'verified');
    assert.equal(enforcement.qualified, true);
    assert.deepEqual(enforcement.removalErrors ?? [], []);
    assert.deepEqual(enforcement.targetPreparationErrors ?? [], []);
    const enforcementFiles = [...files.keys()].filter(path => basename(path) === 'platform-enforcement.json');
    assert.equal(enforcementFiles.length, 1);
    const cleaned = parseJson(files.get(enforcementFiles[0]!)!);
    assert.equal(cleaned.phase, 'cleaned');
    assert.equal(cleaned.qualified, true);
    assert.deepEqual(cleaned.cleanupErrors, []);
    assert.equal(cleaned.testedRevision, revision);
    assert.equal(cleaned.testedTree, tree);
    const fileManifest = [...files].map(([path, bytes]) => [path, createHash('sha256').update(bytes).digest('hex')] as const)
        .sort(([a], [b]) => a.localeCompare(b));
    const manifestHash = createHash('sha256').update(JSON.stringify(fileManifest)).digest('hex');
    const summary = { lane: lane.name, id: lane.id, zipBytes: lane.bytes, zipSha256: lane.digest,
        members: members.length, files: files.size, fileManifestSha256: manifestHash,
        testedRevision: report.testedRevision, testedTree: report.testedTree, sourceHashes: tracked.length,
        commands: commandTexts.length, platform: report.platform, node: report.node, npm: report.npm,
        status: report.status, cleanup: cleaned.phase, reference: {
            discoveredFiles: fullDiscovery.testResults.length, passed: fullDiscovery.numPassedTests,
            skipped: fullDiscovery.numPendingTests, methods: full.executedMethods.length,
            requiredTestsSha256: requiredTests ? createHash('sha256').update(requiredTests.bytes).digest('hex') : null,
            requiredReportSha256: requiredReport ? createHash('sha256').update(requiredReport.bytes).digest('hex') : null,
            fullTestsSha256: createHash('sha256').update(fullTests.bytes).digest('hex'),
            fullReportSha256: createHash('sha256').update(fullReport.bytes).digest('hex'),
            fullCases: full.cases.length, fullInstances: 40,
            researchSha256: createHash('sha256').update(research.bytes).digest('hex'),
            provenanceSources: Object.keys(provenanceSources).length,
            provenanceInputs: Object.keys(provenanceInputs).length,
            installedArtifacts: Object.keys(provenanceArtifacts).length } };
    summaries.push(summary);
    console.log(JSON.stringify(summary));
}
assert.equal(summaries.length, 4);
console.log(JSON.stringify({ audit: 'passed', runId, revision, tree, lanes: summaries.length }));
