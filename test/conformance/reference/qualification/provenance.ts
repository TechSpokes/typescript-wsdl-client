/** Execution identity for the existing qualification producers and recorders. */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { release } from 'node:os';

export interface RunProvenance {
    readonly formatVersion: 1;
    readonly runId: string;
    readonly startedAt: string;
    readonly finishedAt?: string;
    readonly testedRevision: string;
    readonly testedTree: string;
    readonly workingTreeDirty: boolean;
    readonly node: string;
    readonly platform: string;
    readonly arch: string;
    readonly osRelease: string;
    readonly sourceHashes: Readonly<Record<string, string>>;
    readonly inputHashes: Readonly<Record<string, string>>;
    readonly artifactHashes: Readonly<Record<string, string>>;
}
export const hashFile = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const key = (path: string) => relative(resolve('.'), resolve(path)).replaceAll('\\', '/');
const hashes = (paths: readonly string[]): Readonly<Record<string, string>> =>
    Object.fromEntries([...new Set(paths.map(key))].sort().map(path => [path, hashFile(path)]));
export function referenceSources(includeProduct = false): string[] {
    return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z',
        'test/conformance/reference', 'test/research', ...(includeProduct ? ['src'] : [])],
    { encoding: 'utf8' }).split('\0').filter(path => path.endsWith('.ts'));
}
export function fixtureInputs(): string[] {
    return execFileSync('git', ['ls-files', '-z', 'test/conformance/fixtures'], { encoding: 'utf8' })
        .split('\0').filter(path => /\.(?:xml|xsd|wsdl|json)$/.test(path));
}
export function captureProvenance(sources: readonly string[], inputs: readonly string[], artifacts: readonly string[]): RunProvenance {
    if (!sources.length || !inputs.length || !artifacts.length) throw new Error('Incomplete qualification execution inventory');
    return { formatVersion: 1, runId: randomUUID(), startedAt: new Date().toISOString(),
        testedRevision: git('rev-parse', 'HEAD'), testedTree: git('rev-parse', 'HEAD^{tree}'),
        workingTreeDirty: git('status', '--porcelain').length > 0,
        node: process.version, platform: process.platform, arch: process.arch, osRelease: release(),
        sourceHashes: hashes(sources), inputHashes: hashes(inputs), artifactHashes: hashes(artifacts) };
}
export function verifyProvenance(run: RunProvenance | undefined): asserts run is RunProvenance {
    if (!run || run.formatVersion !== 1 || !run.runId || !run.startedAt)
        throw new Error('Raw result lacks execution-time provenance; rerun the producer');
    if (run.node !== process.version || run.platform !== process.platform || run.arch !== process.arch)
        throw new Error('Qualification run/recorder environment mismatch');
    for (const [kind, entries] of Object.entries({ source: run.sourceHashes, input: run.inputHashes, artifact: run.artifactHashes })) {
        if (!entries || !Object.keys(entries).length) throw new Error('Missing ' + kind + ' execution hashes');
        for (const [path, digest] of Object.entries(entries))
            if (!/^[a-f0-9]{64}$/.test(digest) || hashFile(path) !== digest)
                throw new Error('Stale ' + kind + ' execution hash: ' + path);
    }
}
export function finishProvenance(run: RunProvenance): RunProvenance {
    verifyProvenance(run);
    return { ...run, finishedAt: new Date().toISOString() };
}
export function addInputProvenance(run: RunProvenance, inputs: readonly string[]): RunProvenance {
    verifyProvenance(run);
    return { ...run, inputHashes: { ...run.inputHashes, ...hashes(inputs) } };
}
