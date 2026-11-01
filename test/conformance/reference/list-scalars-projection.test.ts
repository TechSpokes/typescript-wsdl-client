/** Independent list-instance controls; native mapping code is not imported. */
import {describe, expect, it} from 'vitest';
import {validateFixture} from './adapter.js';

describe('independent list scalar instances', () => {
  it('records list/item controls and the primary engine empty-NMTOKENS disagreement', async () => {
    const prefix = ' xmlns:t="urn:list-scalars"';
    expect(await validateFixture('xsd/projection/list-scalars.xsd', [
      '<t:Request' + prefix + '><t:Numbers>+01 2</t:Numbers><t:Flags>1 false</t:Flags><t:Codes>+001 +002</t:Codes><t:Words>alpha beta</t:Words></t:Request>',
      '<t:Bounded' + prefix + '/>', '<t:Bounded' + prefix + '>1 2 3 4</t:Bounded>',
      '<t:Patterned' + prefix + '>01 02</t:Patterned>', '<t:Patterned' + prefix + '>1 2</t:Patterned>',
      '<t:Tokens' + prefix + '>alpha beta</t:Tokens>',
      // Observed libxml2 acceptance disagrees with XSD 1.0 section 3.3.5's non-zero-length value space.
      // The native boundary remains rejected in direct-projection-lists.test.ts; this is not its validity oracle.
      '<t:Tokens' + prefix + '/>', '<t:Strings' + prefix + '/>',
    ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [
      {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'accepted'},
      {outcome: 'rejected'}, {outcome: 'accepted'}, {outcome: 'accepted'}, {outcome: 'accepted'},
    ]});
  });
});
