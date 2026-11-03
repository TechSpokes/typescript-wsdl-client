import {expect, it} from 'vitest';
import path from 'node:path';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {lowerComponentShape} from '../../src/generation/componentShape.js';

it('generates explicit nil alternatives at the source-selected item and wrapper positions', async () => {
  const file = path.resolve('test/conformance/fixtures/assessment/nil.wsdl'), namespace = 'urn:checked:forecast';
  const selected = await selectComponentOperation(file, {portType: {namespace, local: 'ForecastPortType'},
    binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'}, {loading: {policy: {fileRoots: [path.dirname(file)]}}});
  if (selected.kind !== 'selected') throw new Error(selected.kind + ':' + selected.rule);
  const mapping = createComponentValueMapping(selected.contract, {kind: 'input'});
  if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind + ':' + mapping.rule);
  expect(lowerComponentShape(selected.contract, mapping, 'NilInput', () => {})).toMatchSnapshot();
});
