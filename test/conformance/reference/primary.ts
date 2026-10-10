import { Worker } from 'node:worker_threads';
import type { Request, Observation } from './primary-worker.ts';
export async function isolated(request: Request, timeoutMs = 5000): Promise<Observation> {
    return new Promise(resolveResult => {
        const worker = new Worker(new URL('./primary-worker.ts', import.meta.url), { workerData: request, execArgv: ['--experimental-strip-types'], resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 } });
        let settled = false;
        const finish = (result: Observation) => { if (settled)
            return; settled = true; clearTimeout(timer); void worker.terminate(); resolveResult(result); };
        const timer = setTimeout(() => finish({ phase: 'schema', outcome: 'resource-limit', diagnostic: 'worker elapsed limit' }), timeoutMs);
        worker.once('message', (result: Observation) => finish(result));
        worker.once('error', error => finish({ phase: 'setup', outcome: (error as NodeJS.ErrnoException).code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'resource-limit' : 'rejected', diagnostic: String(error) }));
        worker.once('exit', code => { if (!settled)
            finish({ phase: 'setup', outcome: 'rejected', diagnostic: 'worker exited ' + code }); });
    });
}
