/** Whole-request literal preparation + fresh-AU planning measurement. */
import {pathToFileURL} from 'node:url';
import {freshHelperCase} from './fresh-helper-case.js';
import {prepareLiteralContexts} from './resolver-context.js';
import {synthesizeLiteralAu} from './literal-au-synthesis.js';
import {createResolverBudget} from './resolver-budget.js';
import type {ResolverLimits} from './resolver-budget.js';

// Independently supplied fixture construction precedes the request. All subject
// indexing, snapshots, projection planning and output publication are budgeted.
const fixture = freshHelperCase();

export function runLiteralRequest(limits?: ResolverLimits) {
    const budget = createResolverBudget(limits);
    return budget.guard(() => {
        budget.chargeWork(4);
        const prepared = prepareLiteralContexts(fixture.input, fixture.candidate, undefined, budget);
        if (prepared.kind !== 'ok') return prepared;
        const projection = synthesizeLiteralAu(fixture.base, fixture.endpoint, budget);
        if (projection.kind !== 'literal-au-projection') return projection;
        budget.chargeWork(170); // Fixed result envelope, fields and scope text before allocation.
        return Object.freeze({kind: 'prepared-literal-au-projection' as const,
            scope: 'structural-proposal-and-named-scalar-AU-projection-only' as const,
            admitted: projection.admitted, plans: projection.plans, usage: budget.usage()});
    });
}

export function literalMeasurements() {
    const success = runLiteralRequest();
    if (success.kind !== 'prepared-literal-au-projection') throw new Error('Literal measurement did not reach its declared projection');
    const {nodes, work} = success.usage;
    return {scope: success.scope, defaultLimits: {maxNodes: 100_000, maxWork: 1_000_000},
        success, inclusive: runLiteralRequest({maxNodes: nodes, maxWork: work}),
        belowWork: runLiteralRequest({maxWork: work - 1}), belowNodes: runLiteralRequest({maxNodes: nodes - 1})};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    process.stdout.write(JSON.stringify(literalMeasurements(), null, 2) + '\n');
