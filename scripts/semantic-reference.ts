/** Required offline Node reference lane. Every mapped method runs in both selections. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { engine, qualifyPrimary, validateFixture, type BaselineCase } from '../test/conformance/reference/adapter.js';
import { captureProvenance, finishProvenance, fixtureInputs, referenceSources } from '../test/conformance/reference/qualification/provenance.js';
export function verifySetup(version = process.versions.node): void {
    if (Number(version.split('.')[0]) < 24) throw new Error('Required Node >=24 reference runtime; found ' + version);
    const path = resolve('node_modules/libxml2-wasm/package.json');
    if (!existsSync(path)) throw new Error('Missing required Node XSD reference package. Run npm ci.');
    const installed = JSON.parse(readFileSync(path, 'utf8')) as {version: string};
    if (installed.version !== engine.version) throw new Error('Required libxml2-wasm ' + engine.version + '; found ' + installed.version + '. Run npm ci.');
}
export function discoverReferenceTests(root = 'test/conformance/reference'): string[] {
    const walk = (directory: string): string[] => readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
        const path = directory.replaceAll('\\', '/') + '/' + entry.name;
        return entry.isDirectory() ? walk(path) : entry.name.endsWith('.test.ts') ? [path] : [];
    });
    const tests = walk(root);
    if (!tests.length) throw new Error('Empty reference test discovery');
    const map = JSON.parse(readFileSync('test/conformance/reference/migration-map.json', 'utf8')) as {obligations: Array<{target: string}>};
    for (const row of map.obligations) {
        if (!existsSync(row.target)) throw new Error('Missing mapped reference test: ' + row.target);
        if (!tests.includes(row.target)) tests.push(row.target);
    }
    return [...new Set([...tests, 'test/conformance/s06-research.test.ts'])].sort();
}
export async function runReference(options: {full?: boolean; manifest?: string; execute?: (files: readonly string[]) => void} = {}) {
    verifySetup();
    const files = discoverReferenceTests();
    const manifestPath = options.manifest ?? 'test/conformance/semantic-baseline.json';
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {cases: BaselineCase[]};
    const provenance = captureProvenance([...referenceSources(), 'scripts/semantic-reference.ts', 'test/helpers/contentModelSoapReference.ts'],
        [...fixtureInputs(), manifestPath, 'test/conformance/reference/migration-map.json', 'test/conformance/reference/continuation-contract.json', 'test/conformance/reference/legacy-source-snapshot.json', 'test/conformance/s06-research-manifest.json'],
        ['package-lock.json', 'node_modules/libxml2-wasm/package.json', 'node_modules/libxml2-wasm/lib/index.mjs', 'node_modules/libxml2-wasm/lib/libxml2raw.mjs']);
    mkdirSync('tmp/conformance/reference', {recursive: true});
    const testReport = `tmp/conformance/reference/${options.full ? 'full' : 'required'}-tests.json`;
    (options.execute ?? (paths => execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...paths, '--reporter=default', '--reporter=json', '--outputFile=' + testReport], {stdio: 'inherit'})))(files);
    const execution = JSON.parse(readFileSync(testReport, 'utf8')) as {testResults: Array<{name: string; assertionResults: Array<{title: string; status: string}>}>};
    const map = JSON.parse(readFileSync('test/conformance/reference/migration-map.json', 'utf8')) as {obligations: Array<{id: string; method: string; target: string}>};
    const executedMethods = map.obligations.map(row => {
        const file = execution.testResults.find(test => test.name.replaceAll('\\', '/').endsWith('/' + row.target));
        const test = file?.assertionResults.find(test => test.title === row.id || test.title === row.method.replace(/^test_/, ''));
        if (!test || test.status !== 'passed') throw new Error('Mapped method did not execute successfully: ' + row.id);
        return {id: row.id, target: row.target, test: test.title, status: test.status};
    });
    const report = await qualifyPrimary(manifest, options.full);
    const output = { ...report, lane: options.full ? 'full' : 'required-subset', evidenceContract: 'NT-CONT-01', testFiles: files, executedMethods, provenance: finishProvenance(provenance) };
    writeFileSync(`tmp/conformance/reference/${options.full ? 'full' : 'required'}-report.json`, JSON.stringify(output, null, 2) + '\n');
    if (report.failures.length) throw new Error('Reference disagreement: ' + report.failures.join('; '));
    console.log(`Node reference ${output.lane} passed: ${files.length} test files, ${report.cases.length} schemas, ${report.cases.reduce((n, c) => n + c.instances.length, 0)} instances.`);
    return output;
}
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--setup') {
        verifySetup();
        const probe = await validateFixture('soap/content-model/probe.wsdl');
        if (probe.phase !== 'schema' || probe.outcome !== 'accepted') throw new Error('Node reference setup probe failed: ' + JSON.stringify(probe));
        console.log('Node reference ready: ' + engine.package + '@' + engine.version + '/libxml2 ' + engine.engineVersion);
        return;
    }
    const allowed = new Set(['--full', '--manifest']);
    for (let i = 0; i < args.length; i++) {
        if (!allowed.has(args[i])) throw new Error('Unknown reference argument: ' + args[i]);
        if (args[i] === '--manifest' && !args[++i]) throw new Error('Missing --manifest path');
    }
    const manifestIndex = args.indexOf('--manifest');
    await runReference({full: args.includes('--full'), manifest: manifestIndex < 0 ? undefined : args[manifestIndex + 1]});
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch(error => { console.error('Reference setup/input/check failure: ' + String(error)); process.exitCode = 1; });
}
