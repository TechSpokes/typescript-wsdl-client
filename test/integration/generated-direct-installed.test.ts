import {it} from 'vitest';
import {qualifyGeneratedInstalled} from '../helpers/generatedDirectInstalled.js';
it('compiles and executes actual generated installed clients with checkout access denied', () => qualifyGeneratedInstalled('private'), 180_000);
