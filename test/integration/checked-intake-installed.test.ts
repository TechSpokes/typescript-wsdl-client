import {afterAll, beforeAll, it} from 'vitest';
import {rm} from 'node:fs/promises';
import {installIntakeTooling, type InstalledIntakeTooling} from '../helpers/installedIntakeTooling.js';
import {qualifyLocalIntakeInstalled} from '../helpers/localIntakeInstalled.js';
import {qualifyUrlIntakeInstalled} from '../helpers/urlIntakeInstalled.js';
import {qualifyCorrectedIntakeInstalled} from '../helpers/correctedIntakeInstalled.js';

let tooling: InstalledIntakeTooling;
beforeAll(async () => {tooling = await installIntakeTooling();}, 480_000);
afterAll(async () => {if (tooling) await rm(tooling.root, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});});

it('installs CLI/API local automatic generation and one-value recovery with independent gateways',
  context => qualifyLocalIntakeInstalled(tooling, context.signal), 1_200_000);
it('acquires URL graphs and executes relocated separate gateways with metadata offline',
  context => qualifyUrlIntakeInstalled(tooling, context.signal), 1_200_000);
it('installs completed-wrapper recipes and preserves corrected SOAP fields without runtime source or recipe access',
  context => qualifyCorrectedIntakeInstalled(tooling, context.signal), 1_200_000);
