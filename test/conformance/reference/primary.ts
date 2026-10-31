import { Worker } from 'node:worker_threads';
import type { Request, Observation } from './primary-worker.ts';
export const PRIMARY_TIMEOUT_MS = 5000;
/**
 * Own a bounded reference worker through termination.
 * @param request Existing fixture/input policy and test-only engine request.
 * @param timeoutMs Per-worker safety deadline, unchanged by batch watchdogs.
 * @param signal Operational cancellation; never converted into schema rejection.
 * @returns The observation only after the worker has exited.
 * @throws For cancellation or worker startup/termination failure.
 * @sideEffects Creates and terminates one isolated worker with the existing heap caps.
 */
export async function isolated(request: Request, timeoutMs = PRIMARY_TIMEOUT_MS, signal?: AbortSignal): Promise<Observation> {
    signal?.throwIfAborted();
    return new Promise((resolveResult, rejectResult) => {
        const worker = new Worker(new URL('./primary-worker.ts', import.meta.url), { workerData: request, execArgv: ['--experimental-strip-types'], resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 } });
        let settled = false;
        const finish = (result?: Observation, error?: unknown) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            void worker.terminate().then(() => {
                if (error !== undefined) rejectResult(error);
                else if (signal?.aborted) rejectResult(signal.reason);
                else resolveResult(result!);
            }, rejectResult);
        };
        const abort = () => finish(undefined, signal!.reason);
        const timer = setTimeout(() => finish({ phase: 'schema', outcome: 'resource-limit', diagnostic: 'worker elapsed limit' }), timeoutMs);
        worker.once('message', (result: Observation) => finish(result));
        worker.once('error', error => finish({ phase: 'setup', outcome: (error as NodeJS.ErrnoException).code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'resource-limit' : 'rejected', diagnostic: String(error) }));
        worker.once('exit', code => { if (!settled)
            finish({ phase: 'setup', outcome: 'rejected', diagnostic: 'worker exited ' + code }); });
        signal?.addEventListener('abort', abort, {once: true});
        if (signal?.aborted) abort();
    });
}
