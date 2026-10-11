/** Reproducible finite projection report; never a general reconstruction answer. */
import {enumerateBatch, oldFamily, directCriterion} from './decision-experiment.js';
import type {Requirements} from './decision-experiment.js';

const queries: Requirements[] = [];
for (const projection of ['blocking', 'identity', 'combined'] as const) {
    for (const requireAffiliate of [false, true]) for (const requireChoice of [false, true]) {
        queries.push({projection, requireAffiliate, requireChoice});
    }
}
const result = enumerateBatch(queries);
if (result.kind !== 'bounded-comparison') throw new Error('Default comparison limit exceeded; no report emitted');
const rows = result.rows.map((row, index) => ({requirements: queries[index], tried: row.tried, outsideContext: row.outsideContext,
    admitted: row.admitted.length, oldFamily: row.admitted.filter(oldFamily).length,
    directCriterion: directCriterion(queries[index]!), cumulativeWork: row.work}));
process.stdout.write(JSON.stringify({domain: '20 assignments per projection; finite relations only', totalWork: result.work, rows}, null, 2) + '\n');
