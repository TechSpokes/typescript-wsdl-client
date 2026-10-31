import {it} from 'vitest';
import {qualifyCheckedGatewayInstalled} from '../helpers/checkedGatewayInstalled.js';

it('installs, generates and starts a checked gateway with independent real-wire expectations',
  qualifyCheckedGatewayInstalled, 300_000);
