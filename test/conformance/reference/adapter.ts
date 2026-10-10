/** Internal test-only primary reference adapter. Required lanes remain legacy until Gate S. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SaxesParser } from 'saxes';
import { schemaText } from './xml-input.js';
import { isolated } from './primary.js';
import type { Observation, Request } from './primary-worker.ts';
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = resolve(repository, 'test/conformance/fixtures');
export const engine = { package: 'libxml2-wasm', version: '0.7.2', engine: 'libxml2', engineVersion: '2.15.1', sourceRevision: '6e4dc82a323b6d27f2b3aca6dbec868949be83b7', engineSource: 'f52e859efe97cf3f0b78d731976402748878529a' } as const;
export function localFixture(name: string, root = fixtures): string {
    const candidate = resolve(root, name), path = relative(root, candidate);
    if (!path || path.startsWith('..') || path.startsWith('/') || path.includes(':'))
        throw new Error('Missing or nonlocal reference fixture: ' + name);
    let actual: string;
    try {
        actual = realpathSync(candidate);
    }
    catch {
        throw new Error('Missing or nonlocal reference fixture: ' + name);
    }
    const realRoot = realpathSync(root), realRelative = relative(realRoot, actual);
    if (realRelative.startsWith('..') || realRelative.startsWith('/') || realRelative.includes(':'))
        throw new Error('Missing or nonlocal reference fixture: ' + name);
    return actual;
}
export interface Options {
    readonly resources?: readonly string[];
    readonly maxBytes?: number;
    readonly timeoutMs?: number;
    readonly expectedVersion?: string;
}
export interface Result extends Omit<Observation, 'outcome'> {
    outcome: Observation['outcome'] | 'unsupported-capability';
    fixtureHashes: Readonly<Record<string, string>>;
}
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export async function validateFixture(name: string, instances: readonly string[] = [], options: Options = {}): Promise<Result> {
    const limit = options.maxBytes ?? 2000000;
    if (!Number.isSafeInteger(limit) || limit <= 0)
        throw new RangeError('positive safe-integer input byte limit required');
    const timeout = options.timeoutMs ?? 5000;
    if (!Number.isSafeInteger(timeout) || timeout <= 0)
        throw new RangeError('positive safe-integer elapsed limit required');
    const fixtureHashes: Record<string, string> = {};
    if (options.expectedVersion !== undefined && options.expectedVersion !== engine.version)
        return { phase: 'setup', outcome: 'rejected', diagnostic: 'Required libxml2-wasm ' + engine.version, fixtureHashes };
    let schema: string, resources: Record<string, string>;
    try {
        const pkg = JSON.parse(readFileSync(resolve(repository, 'node_modules/libxml2-wasm/package.json'), 'utf8')) as {
            version: string;
        };
        if (pkg.version !== engine.version)
            return { phase: 'setup', outcome: 'rejected', diagnostic: 'Required libxml2-wasm ' + engine.version + '; found ' + pkg.version, fixtureHashes };
    }
    catch (error) {
        return { phase: 'setup', outcome: 'rejected', diagnostic: String(error), fixtureHashes };
    }
    try {
        const read = (name: string) => { const bytes = readFileSync(localFixture(name)); fixtureHashes[name] = digest(bytes); return bytes.toString('utf8'); };
        let bytes = instances.reduce((n, s) => n + Buffer.byteLength(s), 0);
        const paths = [name, ...options.resources ?? []];
        for (const path of paths) {
            const size = statSync(localFixture(path)).size;
            bytes += size;
            if (bytes > limit || size > 1000000)
                return { phase: 'input', outcome: 'resource-limit', diagnostic: 'input byte limit before fixture allocation', fixtureHashes };
        }
        schema = read(name);
        const standalone = schemaText(schema);
        const parser = new SaxesParser({ xmlns: true });
        let composition = false, largeBound = false;
        parser.on('opentag', tag => {
            if (tag.uri === 'http://www.w3.org/2001/XMLSchema' && ['import', 'include', 'redefine'].includes(tag.local))
                composition = true;
            for (const attr of Object.values(tag.attributes))
                if (['minOccurs', 'maxOccurs'].includes(attr.local) && /^[0-9]+$/.test(attr.value) && BigInt(attr.value) > 2147483647n)
                    largeBound = true;
        });
        parser.write(standalone).close();
        if (composition && options.resources === undefined)
            throw new Error('Schema dependencies are outside this bounded adapter');
        if (largeBound)
            return { phase: 'schema', outcome: 'unsupported-capability', diagnostic: 'libxml2 finite occurrence representation; original huge input is unqualified, never adjusted implicitly.', fixtureHashes };
        resources = Object.fromEntries((options.resources ?? []).map(path => ['fixture:///' + path, read(path)]));
    }
    catch (error) {
        return { phase: 'input', outcome: 'rejected', diagnostic: String(error), fixtureHashes };
    }
    const request: Request = { candidateRoot: repository, schema, uri: 'fixture:///' + name, instances, resources, maxBytes: limit };
    return { ...await isolated(request, options.timeoutMs), fixtureHashes };
}
export interface BaselineCase {
    id: string;
    fixture: string;
    schema: 'accepted' | 'rejected';
    fast: boolean;
    schemaDiagnostic?: string;
    instances: Array<{
        fixture: string;
        expected: 'accepted' | 'rejected';
        secondaryExpected?: string;
    }>;
}
export async function qualifyPrimary(manifest: {
    cases: readonly BaselineCase[];
}, full = false) {
    const cases = manifest.cases.filter(c => full || c.fast);
    if (!cases.length)
        throw new Error('Reference lane must contain cases');
    const failures: string[] = [], results = [];
    for (const c of cases) {
        let xml: string[];
        try {
            xml = c.instances.map(i => readFileSync(localFixture(i.fixture), 'utf8'));
        }
        catch (error) {
            results.push({ id: c.id, schema: { phase: 'input', outcome: 'rejected', diagnostic: String(error) }, instances: [] });
            failures.push(c.id + ': input failure');
            continue;
        }
        const result = await validateFixture(c.fixture, xml);
        const schema = { phase: result.phase, outcome: result.outcome, diagnostic: result.diagnostic };
        const instances = (result.instances ?? []).map((r, i) => ({ ...r, fixture: c.instances[i].fixture, sha256: digest(xml[i]), secondary: c.instances[i].secondaryExpected === undefined ? 'not-requested' : 'pending-Gate-S' }));
        if (result.phase !== 'schema' || result.outcome !== c.schema)
            failures.push(`${c.id}: expected schema ${c.schema}, got ${result.phase}/${result.outcome}`);
        if (c.schemaDiagnostic && !result.diagnostic?.includes(c.schemaDiagnostic))
            failures.push(c.id + ': missing schema diagnostic');
        if (c.instances.length && instances.length !== c.instances.length)
            failures.push(c.id + ': missing instance results');
        instances.forEach((r, i) => { if (r.outcome !== c.instances[i].expected)
            failures.push(c.id + ': instance disagreement ' + r.fixture); });
        results.push({ id: c.id, schema, instances, fixtureHashes: result.fixtureHashes });
    }
    return { lane: full ? 'full-primary-staging' : 'required-subset-primary-staging', evidence: 'current-primary-only; no secondary acceptance claim', validator: engine, testedRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(), testedTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repository, encoding: 'utf8' }).trim(), workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: repository, encoding: 'utf8' }).trim(), platform: process.platform, node: process.version, cases: results, failures };
}
