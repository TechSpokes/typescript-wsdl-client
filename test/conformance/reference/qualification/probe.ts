/** Bounded candidate investigation. Historical comparisons do not qualify an engine. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { instanceCorpus } from './primary-corpus.js';
import { schemaText } from '../xml-input.js';
interface Disposable {
    dispose(): void;
}
interface Document extends Disposable {
}
interface Validator extends Disposable {
    validate(doc: Document): void;
}
interface Provider {
    match(name: string): boolean;
    open(name: string): number | undefined;
    read(fd: number, buffer: Uint8Array): number;
    close(fd: number): boolean;
}
interface Lib {
    XmlBufferInputProvider: new (input: Record<string, Uint8Array>) => Provider;
    xmlRegisterInputProvider(provider: Provider): boolean;
    xmlCleanupInputProvider(): void;
    XmlDocument: {
        fromString(xml: string, options?: {
            url: string;
        }): Document;
    };
    XsdValidator: {
        fromDoc(doc: Document): Validator;
    };
}
interface XercesResult {
    valid: boolean;
    parseErrors: unknown[];
    schemaErrors: unknown[];
}
interface Xerces {
    createProjectValidator(input: {
        entry: string;
        files: Record<string, string>;
    }): Promise<{
        validate(xml: string): Promise<XercesResult>;
        destroy(): void;
    }>;
}
interface Model {
    complexTypes: Map<string, unknown>;
    elements: Map<string, unknown>;
}
interface TypeScriptEngine {
    parseXsd(xml: string): Model;
    validateSchema(xml: string): Array<{
        severity: string;
        message: string;
    }>;
    compileSchema(model: Model): unknown;
    parseXml(xml: string): unknown;
    validate(doc: unknown, model: Model, options?: {
        psvi: boolean;
    }): {
        valid: boolean;
        issues: unknown[];
        psvi?: Map<unknown, unknown>;
    };
}
const candidateRoot = resolve(process.argv[2] ?? 'tmp/conformance/node-qualification');
const digest = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const read = (path: string) => readFileSync(path, 'utf8');
const modulePath = (pkg: string, file: string) => pathToFileURL(resolve(candidateRoot, 'node_modules', pkg, file)).href;
const lib = await import(modulePath('libxml2-wasm', 'lib/index.mjs')) as Lib;
const xerces = await import(modulePath('xerces-wasm', 'dist/index.js')) as Xerces;
const ts = await import(modulePath('xml-xsd-engine', 'dist/esm/index.js')) as TypeScriptEngine;
function primary(schema: string, instances: string[] = [], uri = "fixture:///case.xsd") {
    const doc = lib.XmlDocument.fromString(schema, { url: uri });
    let validator: Validator | undefined;
    try {
        try {
            validator = lib.XsdValidator.fromDoc(doc);
        }
        catch (error) {
            return { schema: 'rejected', diagnostic: String(error), instances: [] };
        }
        return { schema: 'accepted', instances: instances.map(xml => { const input = lib.XmlDocument.fromString(xml); try {
                validator!.validate(input);
                return { outcome: 'accepted' };
            }
            catch (error) {
                return { outcome: 'rejected', diagnostic: String(error) };
            }
            finally {
                input.dispose();
            } }) };
    }
    finally {
        validator?.dispose();
        doc.dispose();
    }
}
async function secondary(schema: string, instances: string[] = []) {
    const results: Record<string, unknown> = {};
    let validator: Awaited<ReturnType<Xerces['createProjectValidator']>> | undefined;
    try {
        validator = await xerces.createProjectValidator({ entry: 'case.xsd', files: { 'case.xsd': schema } });
        results.xerces = { schema: 'returned-validator', instances: await Promise.all(instances.map(xml => validator!.validate(xml))) };
    }
    catch (error) {
        results.xerces = { schema: 'construction-error', diagnostic: String(error) };
    }
    finally {
        validator?.destroy();
    }
    try {
        const model = ts.parseXsd(schema);
        const issues = ts.validateSchema(schema);
        ts.compileSchema(model);
        results.typescript = { schema: issues.some(i => i.severity === 'error') ? 'preflight-rejected' : 'returned-model', issues, instances: instances.map(xml => { const r = ts.validate(ts.parseXml(xml), model, { psvi: true }); return { valid: r.valid, issues: r.issues, psvi: r.psvi ? [...r.psvi.values()] : null }; }), inexactBounds: [...JSON.stringify(model, (_k, v: unknown) => v instanceof Map ? Object.fromEntries(v) : typeof v === 'number' && v > Number.MAX_SAFE_INTEGER ? { inexactNumber: BigInt(v).toString() } : v).matchAll(/"inexactNumber":"([^"]+)"/g)].map(m => m[1]) };
    }
    catch (error) {
        results.typescript = { schema: 'construction-error', diagnostic: String(error) };
    }
    return results;
}
const fixtureRoot = 'test/conformance/fixtures/';
const baseline = JSON.parse(read('test/conformance/semantic-baseline.json')) as {
    cases: Array<{
        id: string;
        fixture: string;
        schema: string;
        instances: Array<{
            fixture: string;
            expected: string;
            secondaryExpected?: string;
        }>;
    }>;
};
const pw = JSON.parse(read(fixtureRoot + 'xsd/s06-pw01/expectations.json')) as {
    cases: Array<{
        id: string;
        file: string;
        observed: Record<string, string>;
        payloads: Array<{
            xml: string;
            observed: Record<string, unknown>;
        }>;
    }>;
};
const registered = Object.fromEntries(readdirSync(fixtureRoot + 'xsd/s06-pw01').filter(p => p.endsWith('.xsd')).map(p => ['fixture:///xsd/s06-pw01/' + p, readFileSync(fixtureRoot + 'xsd/s06-pw01/' + p)]));
const provider = new lib.XmlBufferInputProvider(registered);
lib.xmlRegisterInputProvider({ ...provider, match: () => true, open: provider.open.bind(provider), read: provider.read.bind(provider), close: provider.close.bind(provider) });
const observations: unknown[] = [];
let baselineSchemas = 0, baselineInstances = 0, pwSchemas = 0, pwInstances = 0;
for (const c of baseline.cases) {
    const source = read(fixtureRoot + c.fixture);
    const schema = schemaText(source);
    const instances = c.instances.map(i => read(fixtureRoot + i.fixture));
    const observed = primary(schema, instances);
    observations.push({ id: c.id, source: c.fixture, sha256: digest(source), historical: c, primary: observed, secondary: await secondary(schema, instances) });
    if (observed.schema === c.schema)
        baselineSchemas++;
    baselineInstances += observed.instances.filter((i, j) => i.outcome === c.instances[j].expected).length;
}
for (const c of pw.cases) {
    const source = read(fixtureRoot + 'xsd/s06-pw01/' + c.file);
    const schema = schemaText(source);
    const result = primary(schema, c.payloads.map(p => p.xml), 'fixture:///xsd/s06-pw01/' + c.file);
    const historical = c.observed.libxml22146 ?? c.observed.libxml2;
    if (result.schema === historical || (historical === 'parse-range-limit' && result.schema === 'rejected'))
        pwSchemas++;
    pwInstances += result.instances.filter((i, j) => (i.outcome === 'accepted') === c.payloads[j].observed.libxml22146).length;
    observations.push({ id: c.id, source: c.file, sha256: digest(source), historical: c, primary: result, secondary: await secondary(schema, c.payloads.map(p => p.xml)) });
}
const controls = [
    { id: 'invalid-all', path: 'xsd/compositors/content-model-invalid-all.wsdl', instances: ['<root/>'] },
    { id: 'missing-reference', path: 'xsd/references/missing.xsd', instances: ['<root/>'] },
    { id: 'original-huge-graph', path: 'xsd/graph/shared-recursive.xsd', instances: [] },
    { id: 'original-huge-analysis', path: 'xsd/analysis/analysis.xsd', instances: [] },
    { id: 'augmentation-default-one-two', path: 'xsd/attributes/au01/extension-default-one-default-two.xsd', instances: ['<root xmlns="urn:s06:au01" xmlns:t="urn:s06:au01"/>'] },
    { id: 'augmentation-default-two-one', path: 'xsd/attributes/au01/extension-default-two-default-one.xsd', instances: ['<root xmlns="urn:s06:au01" xmlns:t="urn:s06:au01"/>'] },
];
for (const c of controls) {
    const source = read(fixtureRoot + c.path);
    const schema = schemaText(source);
    observations.push({ id: c.id, source: c.path, sha256: digest(source), primary: primary(schema, c.instances), secondary: await secondary(schema, c.instances) });
}
const relevant = ['xsd/graph', 'xsd/references', 'xsd/composition', 'xsd/analysis', 'xsd/attributes/au01', 'xsd/re01', 'xsd/research-dt01'];
const tracked = execFileSync('git', ['ls-files', 'test/conformance/fixtures'], { encoding: 'utf8' }).trim().split('\n').filter(p => /\.(?:xsd|wsdl)$/.test(p) && relevant.some(r => p.startsWith(fixtureRoot + r + '/')));
for (const path of tracked)
    registered['fixture:///' + path.slice(fixtureRoot.length)] = readFileSync(path);
lib.xmlCleanupInputProvider();
const allProvider = new lib.XmlBufferInputProvider(registered);
lib.xmlRegisterInputProvider({ match: () => true, open: allProvider.open.bind(allProvider), read: allProvider.read.bind(allProvider), close: allProvider.close.bind(allProvider) });
for (const path of tracked) {
    const source = read(path);
    try {
        observations.push({ id: 'primary-schema:' + path, source: path, sha256: digest(source), primary: primary(schemaText(source), [], 'fixture:///' + path.slice(fixtureRoot.length)) });
    }
    catch (error) {
        observations.push({ id: 'primary-schema:' + path, source: path, sha256: digest(source), inputError: String(error) });
    }
}
let additionalInstances = 0;
for (const row of instanceCorpus) {
    const source = read(fixtureRoot + row.schema);
    let schema = schemaText(source);
    if (row.adjustment === 'analysis-small')
        schema = schema.replaceAll('900719925474099312345678901234567890', '2');
    const observed = primary(schema, [row.xml], 'fixture:///' + row.schema);
    if ((observed.instances[0]?.outcome === 'accepted') === row.expected)
        additionalInstances++;
    observations.push({ id: 'primary-instance:' + row.schema + ':' + digest(row.xml).slice(0, 12), source: row.schema, sha256: digest(source), instanceSha256: digest(row.xml), adjustment: row.adjustment ?? null, historicalExpected: row.expected, primary: observed });
}
const packages = ['libxml2-wasm', 'xerces-wasm', 'xml-xsd-engine'].map(name => { const pkg = JSON.parse(read(resolve(candidateRoot, 'node_modules', name, 'package.json'))); const artifact = resolve(candidateRoot, 'node_modules', name, name === 'libxml2-wasm' ? 'lib/libxml2raw.mjs' : name === 'xerces-wasm' ? 'wasm/xerces_validator.wasm' : 'dist/esm/index.js'); return { name, version: pkg.version, license: pkg.license, dependencies: pkg.dependencies ?? {}, installHooks: Object.fromEntries(Object.entries(pkg.scripts ?? {}).filter(([k]) => ['preinstall', 'install', 'postinstall'].includes(k))), artifactSha256: digest(readFileSync(artifact)) }; });
const map = JSON.parse(read('test/conformance/reference/migration-map.json')) as {
    obligations: Array<{
        id: string;
        evidence: string;
        source: string;
        method: string;
    }>;
};
const report = { evidenceId: 'NT-T05-T06', sourceProgramSha256: digest(readFileSync(import.meta.filename)), testedRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), testedTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(), workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), platform: process.platform, node: process.version, packages, summary: { baselineSchemas, baselineInstances, pwSchemas, pwInstances, additionalInstances, additionalTotal: instanceCorpus.length }, secondaryGaps: map.obligations.filter(o => o.evidence === 'live-external-observation').map(o => ({ id: o.id, source: o.source, method: o.method, status: 'unresolved-full-independent-qualification', proposal: 'Keep legacy live until maintainer accepts a particular changed evidence contract; candidate controls do not establish this obligation.' })), observations };
mkdirSync('tmp/conformance/node-qualification', { recursive: true });
writeFileSync('tmp/conformance/node-qualification/report.json', JSON.stringify(report, null, 2) + '\n');
lib.xmlCleanupInputProvider();
console.log(JSON.stringify({ packages, summary: report.summary, controls: observations.slice(-6) }, null, 2));
