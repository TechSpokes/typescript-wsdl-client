import {it} from 'vitest';
import {qualifyGeneratedInstalled, GENERATED_INSTALLED_WORKFLOW_TIMEOUT_MS, GENERATED_INSTALLED_CLEANUP_TIMEOUT_MS} from '../helpers/generatedDirectInstalled.js';
it('uses the documented package root from an isolated generated SOAP consumer', context => {
  const work = qualifyGeneratedInstalled('root', context.signal);
  context.onTestFinished(async () => {await work.catch(() => undefined);}, GENERATED_INSTALLED_CLEANUP_TIMEOUT_MS);
  return work;
}, GENERATED_INSTALLED_WORKFLOW_TIMEOUT_MS);
