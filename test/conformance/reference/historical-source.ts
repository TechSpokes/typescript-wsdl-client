/** Historical source text is data, never imported or executed as Python. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
interface Source { path: string; sha256: string; text: string }
interface Snapshot { formatVersion: number; baseline: { revision: string; tree: string }; sources: Source[] }
export function historicalSources(): ReadonlyMap<string, string> {
    const snapshot = JSON.parse(readFileSync(new URL('./legacy-source-snapshot.json', import.meta.url), 'utf8')) as Snapshot;
    const map = JSON.parse(readFileSync(new URL('./migration-map.json', import.meta.url), 'utf8')) as {
        baseline: Snapshot['baseline']; sources: Array<Omit<Source, 'text'>>;
    };
    if (snapshot.formatVersion !== 1 || snapshot.baseline.revision !== map.baseline.revision || snapshot.baseline.tree !== map.baseline.tree)
        throw new Error('Historical source baseline mismatch');
    const texts = new Map<string, string>();
    for (const source of snapshot.sources) {
        const pinned = map.sources.find(row => row.path === source.path);
        if (!pinned || texts.has(source.path) || source.sha256 !== pinned.sha256 ||
            createHash('sha256').update(source.text).digest('hex') !== pinned.sha256)
            throw new Error('Historical source hash/path mismatch: ' + source.path);
        texts.set(source.path, source.text);
    }
    if (texts.size !== map.sources.length) throw new Error('Incomplete historical source snapshot');
    return texts;
}
