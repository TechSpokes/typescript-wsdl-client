import {it} from 'vitest';
import {qualifyGeneratedInstalled, GENERATED_INSTALLED_WORKFLOW_TIMEOUT_MS, GENERATED_INSTALLED_CLEANUP_TIMEOUT_MS} from '../helpers/generatedDirectInstalled.js';

it('executes all eight former direct-generation variants through installed component clients', context => {
  const work = qualifyGeneratedInstalled('component', context.signal);
  context.onTestFinished(async () => {await work.catch(() => undefined);}, GENERATED_INSTALLED_CLEANUP_TIMEOUT_MS);
  return work;
}, GENERATED_INSTALLED_WORKFLOW_TIMEOUT_MS);
