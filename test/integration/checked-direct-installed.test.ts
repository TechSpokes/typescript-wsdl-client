import {it} from 'vitest';
import {qualifyGeneratedInstalled} from '../helpers/generatedDirectInstalled.js';
it('uses the documented package root from an isolated generated SOAP consumer', () => qualifyGeneratedInstalled('root'), 180_000);
