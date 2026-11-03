import {it} from 'vitest';
import {qualifyGeneratedInstalled} from '../helpers/generatedDirectInstalled.js';

it('executes all eight former direct-generation variants through installed component clients', () => qualifyGeneratedInstalled('component'), 240_000);
