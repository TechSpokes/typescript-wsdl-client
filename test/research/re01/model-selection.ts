/** Authorized research interface; this supplied-candidate seam is not a solver. */
import {createResolverBudget} from './resolver-budget.js';
import type {ResolverBudget, ResolverUsage} from './resolver-budget.js';
import {prepareDerivationContexts, prepareLiteralContexts} from './resolver-context.js';
import type {ActualInput, BoundaryEdge, Candidate, Diagnostic, Limits} from './resolver-types.js';

export type ResearchModel = 'derivation' | 'schema-preserving';
export const MODEL_SELECTION_CONTRACT = 'RE01-supplied-candidate-model-selection-v1';
export const REVISED_MODEL_ACCEPTED = false;
export const EXPERIMENT_TERMINAL_WORK = 2_048;
const PREFIXES = Object.freeze({
    derivation: `${MODEL_SELECTION_CONTRACT}/derivation/`,
    'schema-preserving': `${MODEL_SELECTION_CONTRACT}/schema-preserving/`,
});

export type SuppliedCandidateRequest = Readonly<{input: ActualInput; candidate: Candidate}>;
export type StructuralReceipt = Readonly<{
    model: ResearchModel;
    contractVersion: typeof MODEL_SELECTION_CONTRACT;
    scope: 'supplied-candidate-structural-preparation';
    actualContext: string; proposedContext: string;
    actualMembers: readonly string[]; proposedMembers: readonly string[];
    excludedIncoming: readonly BoundaryEdge[];
    actualQualification: 'structural-only';
    proposedQualification: 'structural-only';
    locality: 'dependency-transfer-unresolved';
    attributes: 'literal-component-properties';
}>;
export type ExperimentReport = Readonly<{
    model: ResearchModel;
    contractVersion: typeof MODEL_SELECTION_CONTRACT;
    selection: 'explicit';
    scope: 'supplied-candidate-structural-preparation';
    kind: 'unresolved' | 'input-error' | 'candidate-rejected' | 'resource-limit';
    semanticVerdict: 'unresolved';
    existentialVerdict: 'unresolved';
    actualSchemaVerdict: 'unresolved';
    usage: ResolverUsage;
    receipt?: StructuralReceipt;
    diagnostic?: Diagnostic;
    limit?: 'nodes' | 'work';
}>;

/** Own data only; this boundary never invokes caller accessors. */
function own(value: unknown, field: string, budget: ResolverBudget): unknown {
    budget.chargeWork(45 + field.length);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

/** Record/fields/key units are reserved before constructing a report object. */
function record(budget: ResolverBudget, fields: string): void {
    budget.chargeWork(1 + fields.length);
    let count = 1;
    for (let index = 0; index < fields.length; index++) {
        budget.chargeWork();
        if (fields.charCodeAt(index) === 44) count++;
    }
    budget.chargeWork(count);
}

export function runModelExperiment(request: unknown, model: ResearchModel,
    limits?: Limits, sharedBudget?: ResolverBudget): ExperimentReport {
    if (model !== 'derivation' && model !== 'schema-preserving')
        throw new TypeError('Explicit RE01 research model required');
    if (sharedBudget && limits !== undefined) throw new TypeError('One request budget required');
    const budget = sharedBudget ?? createResolverBudget(limits);
    // One bounded terminal envelope is escape machinery, just like the shared
    // resolver terminal result. Reserve its report/serialization allowance
    // before any input access; limits below the reservation do no graph work.
    const terminal = (): ExperimentReport => ({model, contractVersion: MODEL_SELECTION_CONTRACT,
        selection: 'explicit', scope: 'supplied-candidate-structural-preparation',
        kind: 'resource-limit', semanticVerdict: 'unresolved', existentialVerdict: 'unresolved',
        actualSchemaVerdict: 'unresolved', limit: budget.failure()!.limit, usage: budget.usage()});
    const result = budget.guard(() => {
        budget.chargeWork(EXPERIMENT_TERMINAL_WORK);
        const input = own(request, 'input', budget), candidate = own(request, 'candidate', budget);
        budget.chargeWork(4);
        if (!input || typeof input !== 'object' || !candidate || typeof candidate !== 'object') {
            record(budget, 'code,rule,context,related');
            const diagnostic: Diagnostic = {code: 'invalid-supplied-candidate-request',
                rule: 'research-input', context: PREFIXES[model], related: []};
            return report('input-error', diagnostic);
        }
        for (const key in request as object) {
            budget.chargeWork(3 + key.length);
            if (!Object.hasOwn(request as object, key) || (key !== 'input' && key !== 'candidate')) {
                record(budget, 'code,rule,context,related');
                return report('input-error', {code: 'unexpected-request-field', rule: 'research-input',
                    context: PREFIXES[model], related: []});
            }
        }
        // Selection is one dispatch. A failed or unresolved preparation never
        // retries the other model; model-dependent relation caches belong to
        // the issued, privately authenticated context and request identity.
        const prepared = model === 'derivation'
            ? prepareDerivationContexts(input as ActualInput, candidate as Candidate, undefined, budget, PREFIXES[model])
            : prepareLiteralContexts(input as ActualInput, candidate as Candidate, undefined, budget, PREFIXES[model]);
        budget.chargeWork();
        if (prepared.kind === 'resource-limit') return terminal();
        if (prepared.kind !== 'ok') return report(prepared.kind, prepared.diagnostic);
        record(budget, 'model,contractVersion,scope,actualContext,proposedContext,actualMembers,proposedMembers,excludedIncoming,actualQualification,proposedQualification,locality,attributes');
        const receipt = budget.freeze(budget.snapshot<StructuralReceipt>({
            model, contractVersion: MODEL_SELECTION_CONTRACT,
            scope: 'supplied-candidate-structural-preparation',
            actualContext: prepared.value.actual.key, proposedContext: prepared.value.proposed.key,
            actualMembers: prepared.value.actual.members, proposedMembers: prepared.value.proposed.members,
            excludedIncoming: prepared.value.proposed.excludedIncoming,
            actualQualification: 'structural-only', proposedQualification: 'structural-only',
            locality: 'dependency-transfer-unresolved', attributes: 'literal-component-properties',
        }));
        record(budget, 'code,rule,context,related');
        return report('unresolved', {code: 'missing-complete-semantic-authority', rule: 'RE01-complete-procedure',
            context: prepared.value.proposed.key, related: []}, receipt);
    });
    return result.kind === 'resource-limit' ? terminal() : result;

    function report(kind: 'unresolved' | 'input-error' | 'candidate-rejected', diagnostic: Diagnostic,
        receipt?: StructuralReceipt): ExperimentReport {
        const frozenDiagnostic = budget.freeze(budget.snapshot(diagnostic));
        record(budget, 'model,contractVersion,selection,scope,kind,semanticVerdict,existentialVerdict,actualSchemaVerdict,diagnostic,receipt,usage');
        budget.chargeWork(model.length + MODEL_SELECTION_CONTRACT.length + kind.length + 201); // Includes one freeze operation.
        return Object.freeze({model, contractVersion: MODEL_SELECTION_CONTRACT,
            selection: 'explicit', scope: 'supplied-candidate-structural-preparation', kind,
            semanticVerdict: 'unresolved', existentialVerdict: 'unresolved', actualSchemaVerdict: 'unresolved',
            diagnostic: frozenDiagnostic, receipt, usage: budget.usage()});
    }
}
