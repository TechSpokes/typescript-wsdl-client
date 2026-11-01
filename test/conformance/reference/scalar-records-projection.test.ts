/** Independent datatype instance observations; no native compiler or value mapper imports. */
import {describe, expect, it} from 'vitest';
import {validateFixture} from './adapter.js';

describe('independent projection scalar families', () => {
  it('corroborates exact values, XML temporal/binary lexicals and invalid boundaries', async () => {
    const valid = '<t:Request xmlns:t="urn:scalar-records" Version="01.2500" TimeStamp="2026-10-31T18:00:00Z" Offset="P2DT3H" Counter="9007199254740993" Binary="A Q I =" Hex="0aff" Ratio="INF" Language="en-US"><t:Day>2026-10-31</t:Day><t:Code>synthetic</t:Code><t:Link>relative/path</t:Link></t:Request>';
    expect(await validateFixture('xsd/projection/scalar-records.xsd', [valid,
      valid.replace('Version="01.2500"', 'Version="1e2"'),
      valid.replace('2026-10-31T18:00:00Z', '2026-02-30T18:00:00Z'),
      valid.replace('Counter="9007199254740993"', 'Counter="9223372036854775808"'),
      valid.replace('Binary="A Q I ="', 'Binary="AR=="'),
      valid.replace('Ratio="INF"', 'Ratio="Infinity"'),
      valid.replace('Offset="P2DT3H"', 'Offset="P"'),
    ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [
      {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'},
      {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'},
    ]});
  });
});
