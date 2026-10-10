import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { historicalSources } from './historical-source.js';
interface Source {
    path: string;
    sha256: string;
    lines: number;
}
interface Obligation {
    id: string;
    source: string;
    method: string;
    line: number;
    endLine: number;
    sourceContractSha256: string;
    owner: number;
    target: string;
    command: string;
    status: string;
    targetSha256: string;
    acceptedContract: string;
    caseFamilies: Array<{
        line: number;
        expression: string;
    }>;
}
const map = JSON.parse(readFileSync(new URL("./migration-map.json", import.meta.url), "utf8")) as {
    baseline: {
        revision: string;
    };
    sources: Source[];
    obligations: Obligation[];
    baselineCases: Array<{
        instances: unknown[];
        fast: boolean;
        status: string;
        acceptedContract: string;
    }>;
};
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
describe("frozen Python migration coverage", () => {
    it("maps every pinned method and family without executing Python", () => {
        const mapped = new Set<string>();
        const archive = historicalSources();
        for (const source of map.sources) {
            const text = archive.get(source.path)!;
            expect(digest(text), source.path).toBe(source.sha256);
            expect(text.trimEnd().split("\n").length).toBe(source.lines);
            const lines = text.split("\n");
            const discovered = [...text.matchAll(/^    def (test_\w+)/gm)].map(match => match[1]);
            const rows = map.obligations.filter(row => row.source === source.path);
            expect(rows.map(row => row.method), source.path).toEqual(discovered);
            for (const row of rows) {
                expect(mapped.has(row.id)).toBe(false);
                mapped.add(row.id);
                const block = lines.slice(row.line - 1, row.endLine).join("\n");
                expect(digest(block), row.id).toBe(row.sourceContractSha256);
                expect(row.caseFamilies).toEqual(block.split("\n").flatMap((line, i) => /\bfor .+ in |subTest\(/.test(line) ? [{ line: row.line + i, expression: line.trim() }] : []));
                expect(row.owner).toBeGreaterThanOrEqual(242);
                expect(row.owner).toBeLessThanOrEqual(250);
                expect(row.command).toContain(row.target);
            }
        }
        expect(mapped.size).toBe(53);
    });
    it("preserves full and required-subset manifest inputs", () => {
        expect(map.baselineCases).toHaveLength(14);
        expect(map.baselineCases.flatMap(row => row.instances)).toHaveLength(40);
        const fast = map.baselineCases.filter(row => row.fast);
        expect(fast).toHaveLength(6);
        expect(fast.flatMap(row => row.instances)).toHaveLength(15);
    });
    it('pins every accepted executable destination; the launcher verifies actual execution', () => {
        for (const row of map.obligations) {
            expect(row.status, row.id).toBe('verified');
            expect(row.acceptedContract, row.id).toBe('NT-CONT-01');
            expect(digest(readFileSync(row.target, 'utf8')), row.id).toBe(row.targetSha256);
        }
        for (const row of map.baselineCases) {
            expect(row.status).toBe('verified');
            expect(row.acceptedContract).toBe('NT-CONT-01');
        }
    });
});
