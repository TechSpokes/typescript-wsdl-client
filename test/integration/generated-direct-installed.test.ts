import {it} from 'vitest';
import {qualifyGeneratedInstalled, GENERATED_INSTALLED_WORKFLOW_TIMEOUT_MS, GENERATED_INSTALLED_CLEANUP_TIMEOUT_MS} from '../helpers/generatedDirectInstalled.js';
it('compiles and executes actual generated installed clients with checkout access denied', context => {
  const work = qualifyGeneratedInstalled('private', context.signal);
  context.onTestFinished(async () => {await work.catch(() => undefined);}, GENERATED_INSTALLED_CLEANUP_TIMEOUT_MS);
  return work;
}, GENERATED_INSTALLED_WORKFLOW_TIMEOUT_MS);
