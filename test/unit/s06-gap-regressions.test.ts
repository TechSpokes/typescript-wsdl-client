import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';

const forecast = readFileSync('test/conformance/fixtures/assessment/forecast.wsdl', 'utf8')
  .replaceAll('http://schemas.xmlsoap.org/wsdl/soap/', 'http://schemas.xmlsoap.org/wsdl/soap12/');
const namespace = 'urn:checked:forecast';
const action = 'soapAction="urn:checked:GetForecast"';
async function select(attributes: string) {
  const uri = 'https://s06-regression.example/forecast.wsdl';
  const bytes = Buffer.from(forecast.replace(action, attributes));
  return selectComponentOperation(uri, {portType: {namespace, local: 'ForecastPortType'},
    binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'}, {
    loading: {policy: {allowedOrigins: ['https://s06-regression.example']},
      offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])},
  });
}

describe('focused regressions recovered from the S06 assessment gap review', () => {
  it('preserves the SOAP 1.2 control and numeric false optional action', async () => {
    for (const [attributes, required, expectedAction] of [[action, true, 'urn:checked:GetForecast'],
      ['soapActionRequired="0"', false, '']] as const) {
      const result = await select(attributes);
      expect(result.kind).toBe('selected');
      if (result.kind !== 'selected') throw new Error(result.rule);
      expect(result.contract.binding).toMatchObject({version: '1.2', actionRequired: required, action: expectedAction});
      expect(result.contract.admitted).toBe(false);
    }
  });

  it.each([
    ['malformed requiredness', action + ' soapActionRequired="invalid"', 'soap-action-required-boolean'],
    ['relative action', 'soapAction="relative"', 'soap-action-absolute-uri'],
    ['empty action', 'soapAction=""', 'soap-action-absolute-uri'],
  ])('refuses %s before issuing an operation contract', async (_name, attributes, rule) => {
    const result = await select(attributes);
    expect(result).toMatchObject({kind: 'unsupported', rule});
    expect('contract' in result).toBe(false);
  });

  it('bounds shared group expansion with a small positive control and sticky failure', async () => {
    const fixtures = path.resolve('test/conformance/fixtures/xsd/s06-regressions');
    for (const [file, expected] of [['shared-group-control.xsd', 'prepared'], ['shared-group-dag.xsd', 'resource-limit']] as const) {
      const input = await loadSemanticSchemaInput(path.join(fixtures, file), {policy: {fileRoots: [fixtures]}});
      const before = JSON.stringify(input);
      const budget = createSemanticBudget({maxWork: 1_000_000});
      const result = prepareSourceSchemaRequest(input, {budget, accountPreparation: true});
      expect(result.kind).toBe(expected);
      expect(JSON.stringify(input)).toBe(before);
      if (expected === 'resource-limit') {
        expect(result).toBe(budget.failure());
        expect(prepareSourceSchemaRequest(input, {budget, accountPreparation: true})).toBe(result);
        expect('request' in result).toBe(false);
      }
    }
  });
});
