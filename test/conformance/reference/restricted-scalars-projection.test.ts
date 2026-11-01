/** Independent source-instance controls; these observations do not authorize a native runtime. */
import {describe, expect, it} from 'vitest';
import {validateFixture} from './adapter.js';

describe('independent declared scalar restrictions', () => {
  it('corroborates inherited pattern layers, whitespace, numeric facets and enums', async () => {
    const valid = '<t:Request xmlns:t="urn:restricted-scalars"><t:Code> AB12 </t:Code><t:Money>12.50</t:Money><t:Count>2</t:Count></t:Request>';
    expect(await validateFixture('xsd/projection/restricted-scalars.xsd', [valid,
      valid.replace('AB12', 'AC12'), valid.replace('AB12', 'ABxx'), valid.replace('12.50', '12.345'),
      valid.replace('12.50', '-1'), valid.replace('12.50', '1000'), valid.replace('>2<', '>4<'),
      valid.replace('xmlns:t="urn:restricted-scalars"', 'xmlns:t="urn:restricted-scalars" Target="Unknown"'),
    ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [
      {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'},
      {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'},
    ]});
  });
});
