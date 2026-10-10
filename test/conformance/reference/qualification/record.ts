/** Assemble a reviewable candidate report; never activate required reference commands. */
import { readFileSync, writeFileSync } from 'node:fs';
import { engine } from '../adapter.js';
import { historicalSources } from '../historical-source.js';
import { verifyProvenance } from './provenance.js';
import type { RunProvenance } from './provenance.js';

interface Obligation {
    id: string;
    source: string;
    method: string;
    line: number;
    endLine: number;
    sourceUrl: string;
    capabilities: string[];
}
interface Map {
    baseline: { revision: string };
    obligations: Obligation[];
    baselineCases: Array<{ id: string; instances: Array<{ secondary?: unknown }> }>;
    soap: Record<string, unknown>;
}
interface Observation {
    id: string;
    source?: string;
    historical?: unknown;
    historicalRef?: string;
}
interface Report {
    provenance?: RunProvenance;
    observations: Observation[];
    [key: string]: unknown;
}
const read = (path: string) => readFileSync(path, 'utf8');
const map = JSON.parse(read('test/conformance/reference/migration-map.json')) as Map;
const report = JSON.parse(read('tmp/conformance/node-qualification/report.json')) as Report;
verifyProvenance(report.provenance);
const archive = historicalSources();
report.secondaryGaps = map.obligations.filter(obligation => {
    const source = archive.get(obligation.source)!;
    return /xmlschema\./.test(source.split('\n').slice(obligation.line - 1, obligation.endLine).join('\n'));
}).map(obligation => ({
    id: obligation.id, source: obligation.source, method: obligation.method,
    sourceUrl: obligation.sourceUrl, capabilities: obligation.capabilities,
    status: 'unresolved-fresh-independent-external',
    proposal: 'Accepted NT-CONT-01 retains this complete family as historical xmlschema evidence, qualified libxml2 observations and scoped contracts. Full fresh second-engine qualification remains unavailable; maintainer acceptance is recorded in #239 comment 6098237195.',
}));
report.secondaryBaselineGaps = map.baselineCases.filter(c => c.instances.some(i => i.secondary)).map(c => ({
    id: c.id, instances: c.instances.filter(i => i.secondary), status: 'unresolved-fresh-independent-external',
}));
report.secondarySoapGap = { ...map.soap, status: 'unresolved-fresh-independent-external' };
for (const observation of report.observations) {
    if (observation.historical) {
        observation.historicalRef = observation.source?.startsWith('xsd/')
            ? 'Pinned semantic-baseline case ' + observation.id : 'Pinned PW01 expectations case ' + observation.id;
        delete observation.historical;
    }
}
const boundaries = JSON.parse(read('tmp/conformance/node-qualification/primary-boundaries.json')) as { provenance?: RunProvenance };
verifyProvenance(boundaries.provenance);
report.primaryBoundaries = boundaries;
report.engineProvenance = {
    primary: engine,
    secondarySourceInspection: {
        repository: 'harshanacz/xerces-wasm-validator',
        revision: '82fb266d4b745220d8863d59772870ab4f23a2bd',
        path: 'native/xerces_bridge.cpp',
        sourceUrl: 'https://github.com/harshanacz/xerces-wasm-validator/blob/82fb266d4b745220d8863d59772870ab4f23a2bd/native/xerces_bridge.cpp#L328',
        observation: 'Schema full checking is disabled and loadGrammar diagnostics are not enforced before returning construction success.',
        limit: 'Artifact hashes identify delivered packages; inspecting upstream source does not establish a reproducible binary build.',
    },
};
report.sourceHashes = report.provenance.sourceHashes;
// Installation evidence must be supplied from an actual run, never inferred from package metadata.
if (process.argv[2]) report.installation = JSON.parse(read(process.argv[2])) as unknown;
else report.installation = { status: 'not-recorded-by-this-invocation' };
writeFileSync('tmp/conformance/node-qualification/recorded-report.json', JSON.stringify(report, null, 2) + '\n');
console.log('Recorded candidate findings, exact source hashes and unresolved evidence gaps.');
