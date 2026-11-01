/** Independent lexical-sensitive round-trip controls, distinct from native payload authority. */
import {describe, expect, it} from 'vitest';
import {validateFixture} from './adapter.js';

describe('independent admitted lexical witnesses', () => {
  it('corroborates that canonical value rewrites can violate datatype patterns', async () => {
    const valid = '<t:Request xmlns:t="urn:lexical-witnesses"><t:Decimal>+01.00</t:Decimal><t:Int>+007</t:Int><t:Bool>1</t:Bool><t:Hex>abcd</t:Hex><t:Binary>A Q I =</t:Binary></t:Request>';
    expect(await validateFixture('xsd/projection/lexical-witnesses.xsd', [valid,
      valid.replace('+01.00', '1'), valid.replace('+007', '7'), valid.replace('<t:Bool>1', '<t:Bool>true'),
      valid.replace('abcd', 'ABCD'), valid.replace('A Q I =', 'AQI='),
    ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [
      {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'},
    ]});
  });
});
