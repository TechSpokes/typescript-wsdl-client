/** Independent simple-content instance controls; native mapping code is not imported. */
import {describe, expect, it} from 'vitest';
import {validateFixture} from './adapter.js';

describe('independent simple-content records', () => {
  it('corroborates text facets, inherited attributes, fixed values and child rejection', async () => {
    const prefix = ' xmlns:t="urn:simple-content-records"';
    expect(await validateFixture('xsd/projection/simple-content-records.xsd', [
      '<t:Request' + prefix + '><t:Item id="a" priority="2"> AB<![CDATA[12 ]]></t:Item><t:Amount>0012.50</t:Amount></t:Request>',
      '<t:Text' + prefix + ' id="a" lang="fr">CD34</t:Text>',
      '<t:Text' + prefix + '>invalid</t:Text>',
      '<t:Text' + prefix + '><t:Inner>AB12</t:Inner></t:Text>',
      '<t:Number' + prefix + ' Currency="EUR">12.5</t:Number>',
      '<t:Number' + prefix + '>12.5</t:Number>',
    ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [
      {outcome: 'accepted'}, {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'accepted'},
    ]});
  });
});
