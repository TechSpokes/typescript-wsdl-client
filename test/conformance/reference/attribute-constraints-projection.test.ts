/** Independent fixed/default instance observations, without native compiler imports. */
import {describe, expect, it} from 'vitest';
import {validateFixture} from './adapter.js';

describe('independent attribute default/fixed instances', () => {
  it('corroborates required presence, typed equality and explicit default alternatives', async () => {
    const valid = '<t:Request xmlns:t="urn:attribute-constraints" Required="7"><t:Name>synthetic</t:Name></t:Request>';
    expect(await validateFixture('xsd/projection/attribute-constraints.xsd', [valid,
      valid.replace('Required="7"', 'Required="007" Enabled="1" Instant="2026-10-31T19:00:00+01:00" Binary="A Q I =" Summary="true" Amount="2.5" t:Global="false"'),
      valid.replace(' Required="7"', ''), valid.replace('Required="7"', 'Required="8"'),
      valid.replace('Required="7"', 'Required="7" Enabled="false"'),
      valid.replace('Required="7"', 'Required="7" Instant="2026-10-31T18:01:00Z"'),
      valid.replace('Required="7"', 'Required="7" Binary="AwQ="'),
    ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [
      {outcome: 'accepted'}, {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'rejected'},
      {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'},
    ]});
  });
});
