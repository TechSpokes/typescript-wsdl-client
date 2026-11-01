/** Independent instance controls; no native component or mapping implementation is imported. */
import {describe, expect, it} from 'vitest';
import {validateFixture} from './adapter.js';

describe('independent known-attribute and empty-content instances', () => {
  it('corroborates typed attribute identities and cvc-complex-type.2.1 empty content', async () => {
    const prefix = ' xmlns:t="urn:known-attributes"';
    expect(await validateFixture('xsd/projection/known-attributes.xsd', [
      '<t:AttributesOnly' + prefix + ' id="synthetic"/>',
      '<t:AttributesOnly' + prefix + ' id="synthetic"> </t:AttributesOnly>',
      '<t:EmptySequence' + prefix + '/>',
      '<t:EmptySequence' + prefix + '> \t\n</t:EmptySequence>',
      '<t:Request' + prefix + ' id="synthetic"><t:Item count="7" t:enabled="1"><t:Text>first</t:Text></t:Item></t:Request>',
      '<t:Request' + prefix + ' id="synthetic"><t:Item count="7" enabled="1"><t:Text>first</t:Text></t:Item></t:Request>',
      '<t:Request' + prefix + ' id="synthetic"><t:Item count="2147483648"><t:Text>first</t:Text></t:Item></t:Request>',
    ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [
      {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'accepted'}, {outcome: 'rejected'},
      {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'rejected'},
    ]});
  });
});
