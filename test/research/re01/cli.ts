/** Dedicated research entrypoint. Public CLI and persisted formats are unchanged. */
import {closeSync, constants, fstatSync, openSync, readSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createResolverBudget} from './resolver-budget.js';
import type {ResolverBudget} from './resolver-budget.js';
import {MODEL_SELECTION_CONTRACT, runModelExperiment} from './model-selection.js';
import type {ExperimentReport, ResearchModel} from './model-selection.js';

export const RESEARCH_CLI_HELP = `RE01 supplied-candidate structural experiment (semantic procedure unresolved)
Usage: tsx test/research/re01/cli.ts --re01-model derivation|schema-preserving --candidate-file FILE
       [--max-nodes N] [--max-work N]
Selection is explicit until independent acceptance of the revised model.
FILE is JSON {"input": ActualInput, "candidate": Candidate}.
Exit: 0 help; 1 input/candidate error; 2 unresolved; 3 resource-limit.
`;
const CLI_TERMINAL_WORK = 2_048;
// Supported Node Stats metadata has fourteen own numeric fields and 74 name
// units (89 record/field/name units); reserve 256 for its fixed native record,
// numeric copies and kind inspection before either stat boundary allocates it.
const NATIVE_STATS_WORK = 256;
const CLI_FIELDS = 'model,contractVersion,selection,scope,kind,semanticVerdict,existentialVerdict,actualSchemaVerdict,diagnostic,limit,receipt,usage';
type Options = {model: ResearchModel; file: string; maxNodes?: number; maxWork?: number};
type OptionError = {code: string};
export type CliResult = Readonly<{exitCode: number; output: string}>;
class ResearchInputError extends TypeError {
    constructor(readonly code: string) { super(code); }
}

/**
 * Bounded request-start metadata: at most four flag/value pairs, constant-size
 * flag names and model names, and at most 16 decimal units per limit. The path
 * is borrowed and inspected under the selected request budget before file I/O.
 * Equal-sign, duplicate and unknown options are intentionally not accepted.
 */
function options(argv: readonly string[]): Options | OptionError {
    if (argv.length > 8 || argv.length % 2 !== 0) return {code: 'invalid-options'};
    let model: ResearchModel | undefined, file: string | undefined;
    let maxNodes: number | undefined, maxWork: number | undefined;
    for (let index = 0; index < argv.length; index += 2) {
        const flag = argv[index], value = argv[index + 1];
        if (typeof flag !== 'string' || typeof value !== 'string') return {code: 'invalid-options'};
        if (flag === '--re01-model') {
            if (model !== undefined || (value !== 'derivation' && value !== 'schema-preserving')) return {code: 'invalid-model'};
            model = value;
        } else if (flag === '--candidate-file') {
            if (file !== undefined || value.length === 0) return {code: 'invalid-candidate-file'};
            file = value;
        } else if (flag === '--max-nodes' || flag === '--max-work') {
            if (value.length > 16 || !/^[1-9][0-9]*$/.test(value)) return {code: 'invalid-limits'};
            const limit = Number(value);
            if (!Number.isSafeInteger(limit)) return {code: 'invalid-limits'};
            if (flag === '--max-nodes') {
                if (maxNodes !== undefined) return {code: 'duplicate-option'};
                maxNodes = limit;
            } else {
                if (maxWork !== undefined) return {code: 'duplicate-option'};
                maxWork = limit;
            }
        } else return {code: 'unknown-option'};
    }
    if (model === undefined) return {code: 'model-selection-required'};
    if (file === undefined) return {code: 'candidate-file-required'};
    return {model, file, maxNodes, maxWork};
}

/** A regular file is bounded from its open descriptor before read/allocation. */
function readRequest(file: string, budget: ResolverBudget): unknown {
    budget.chargeWork(4 + NATIVE_STATS_WORK + file.length);
    if (!statSync(file).isFile()) throw new ResearchInputError('regular-candidate-file-required');
    budget.chargeWork(4 + file.length);
    // A race to a FIFO cannot block the opening request. O_NONBLOCK is zero
    // where absent; regular files are unaffected on supported Node platforms.
    const descriptor = openSync(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    try {
        budget.chargeWork(NATIVE_STATS_WORK); // Fixed native metadata before allocation.
        const metadata = fstatSync(descriptor);
        if (!metadata.isFile() || !Number.isSafeInteger(metadata.size)) throw new ResearchInputError('regular-candidate-file-required');
        const size = metadata.size;
        budget.chargeWork(2);
        // Buffer allocation, reading, UTF-8 decoding and native JSON parsing
        // have a documented conservative per-byte reservation. Every JSON
        // token, field, container and decoded UTF-16 unit consumes at least one
        // source byte. No parse or allocation occurs before all reservations.
        for (let pass = 0; pass < 12; pass++) budget.chargeWork(size);
        budget.chargeWork(8); // Buffers, cursor and final one-byte change check.
        const bytes = Buffer.alloc(size), extra = Buffer.alloc(1);
        let offset = 0;
        while (offset < size) {
            budget.chargeWork(4);
            const count = readSync(descriptor, bytes, offset, size - offset, offset);
            if (count === 0) throw new ResearchInputError('candidate-file-changed');
            offset += count;
        }
        if (readSync(descriptor, extra, 0, 1, size) !== 0) throw new ResearchInputError('candidate-file-changed');
        const source = bytes.toString('utf8');
        return JSON.parse(source) as unknown;
    } finally {
        // Constant descriptor cleanup is terminal machinery after exhaustion.
        closeSync(descriptor);
    }
}

/**
 * Charge JSON output traversal and a worst-case escaping/copy reservation
 * before native serialization. Usage has two reserved 24-unit numeric fields,
 * so the final counters can include all output work without reserializing.
 */
function serialize(report: ExperimentReport, budget: ResolverBudget): string {
    // Before the spread and nested allocation: two records, all twelve
    // possible root fields and their name units (eleven separating commas are
    // code punctuation), nested nodes/work fields and nine name units, plus
    // twelve borrowed root reads. Absent optional fields remain reserved.
    budget.chargeWork(2 + 12 + CLI_FIELDS.length - 11 + 2 + 9 + 12);
    const serializable = {...report, usage: {nodes: 0, work: 0}};
    budget.chargeWork(); const stack: unknown[] = [serializable];
    let outputBound = 1; // Newline.
    const addBound = (amount: number): void => {
        if (amount > Number.MAX_SAFE_INTEGER - outputBound) {
            // Positive reservation work was already consumed, so a maximum
            // safe charge necessarily makes the shared budget terminal.
            budget.chargeWork(Number.MAX_SAFE_INTEGER);
        }
        outputBound += amount;
    };
    while (stack.length) {
        budget.chargeWork(); const value = stack.pop();
        if (typeof value === 'string') {
            budget.chargeWork(value.length);
            addBound(2 + 6 * value.length);
        } else if (value === null) addBound(4);
        else if (typeof value === 'number') addBound(24);
        else if (typeof value === 'boolean') addBound(5);
        else if (value && typeof value === 'object') {
            budget.chargeWork(2); addBound(2);
            for (const key in value) {
                budget.chargeWork(44 + key.length);
                const entry = Object.getOwnPropertyDescriptor(value, key);
                if (!entry || !('value' in entry)) throw new TypeError('report-data-fields-required');
                if (entry.value === undefined) continue;
                addBound(4 + 6 * key.length); // Escaped key, colon/comma.
                budget.chargeWork(); stack.push(entry.value);
            }
        } else if (value !== undefined) throw new TypeError('report-json-data-required');
    }
    budget.chargeWork(outputBound); // JSON output allocation.
    budget.chargeWork(outputBound); // Stdout copy, without numeric multiplication overflow.
    serializable.usage.nodes = budget.usage().nodes;
    serializable.usage.work = budget.usage().work;
    return `${JSON.stringify(serializable)}\n`;
}

function terminal(model: ResearchModel, budget: ResolverBudget): CliResult {
    // Fixed terminal serialization is covered by the CLI reservation. It must
    // neither return partial receipts nor inspect any remaining input graph.
    const failure = budget.failure()!;
    return {exitCode: 3, output: `${JSON.stringify({model, contractVersion: MODEL_SELECTION_CONTRACT,
        selection: 'explicit', scope: 'supplied-candidate-structural-preparation', kind: 'resource-limit',
        semanticVerdict: 'unresolved', existentialVerdict: 'unresolved', actualSchemaVerdict: 'unresolved',
        limit: failure.limit, usage: {nodes: failure.usage.nodes, work: failure.usage.work}})}\n`};
}

export function runResearchCli(argv: readonly string[]): CliResult {
    if (argv.length === 1 && argv[0] === '--help') return {exitCode: 0, output: RESEARCH_CLI_HELP};
    const selected = options(argv);
    if ('code' in selected) return {exitCode: 1, output: `${JSON.stringify({kind: 'input-error',
        contractVersion: MODEL_SELECTION_CONTRACT, scope: 'supplied-candidate-structural-preparation',
        diagnostic: {code: selected.code}})}\n`};
    const budget = createResolverBudget({maxNodes: selected.maxNodes, maxWork: selected.maxWork});
    const result = budget.guard(() => {
        budget.chargeWork(CLI_TERMINAL_WORK);
        budget.chargeWork(8); // Bounded parsed option bookkeeping.
        let request: unknown;
        try { request = readRequest(selected.file, budget); }
        catch (error: unknown) {
            // Resource abort is private; guard must receive it untouched.
            if (budget.exhausted()) throw error;
            budget.chargeWork(250); // Fixed diagnostic/envelope allocation.
            const report: ExperimentReport = {model: selected.model, contractVersion: MODEL_SELECTION_CONTRACT,
                selection: 'explicit', scope: 'supplied-candidate-structural-preparation', kind: 'input-error',
                semanticVerdict: 'unresolved', existentialVerdict: 'unresolved', actualSchemaVerdict: 'unresolved',
                diagnostic: {code: error instanceof ResearchInputError ? error.code
                    : error instanceof SyntaxError ? 'invalid-json' : 'candidate-file-unreadable',
                    rule: 'research-input', context: '', related: []}, usage: budget.usage()};
            budget.chargeWork(16); // CliResult: record, two fields and thirteen key units.
            return {exitCode: 1, output: serialize(report, budget)};
        }
        const report = runModelExperiment(request, selected.model, undefined, budget);
        if (report.kind === 'resource-limit') return terminal(selected.model, budget);
        budget.chargeWork(16); // CliResult, before serialization captures final usage.
        const output = serialize(report, budget);
        return {exitCode: report.kind === 'unresolved' ? 2 : 1, output};
    });
    return 'kind' in result ? terminal(selected.model, budget) : result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const result = runResearchCli(process.argv.slice(2));
    process.stdout.write(result.output);
    process.exitCode = result.exitCode;
}
