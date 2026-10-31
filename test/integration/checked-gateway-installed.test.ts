import {it} from 'vitest';
import {qualifyCheckedGatewayInstalled, CHECKED_GATEWAY_WORKFLOW_TIMEOUT_MS, CHECKED_GATEWAY_CLEANUP_TIMEOUT_MS} from '../helpers/checkedGatewayInstalled.js';

it('installs, generates and starts a checked gateway with independent real-wire expectations',
  context => {
    const work = qualifyCheckedGatewayInstalled(context.signal);
    context.onTestFinished(async () => {await work.catch(() => undefined);}, CHECKED_GATEWAY_CLEANUP_TIMEOUT_MS);
    return work;
  }, CHECKED_GATEWAY_WORKFLOW_TIMEOUT_MS);
