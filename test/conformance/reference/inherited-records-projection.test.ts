/** Independent original-instance observations; native projection code is not imported. */
import {describe, expect, it} from 'vitest';
import {validateFixture} from './adapter.js';

describe('independent inherited record instances', () => {
  it('corroborates extension order, inherited attributes, restriction removal and empty content', async () => {
    const prefix = ' xmlns:t="urn:inherited-records"';
    expect(await validateFixture('xsd/projection/inherited-records.xsd', [
      '<t:Request' + prefix + ' id="synthetic" note="kept"><t:BaseValue>7</t:BaseValue><t:Label>base</t:Label><t:Flag>1</t:Flag><t:Item count="2"><t:Text>first</t:Text></t:Item></t:Request>',
      '<t:Request' + prefix + ' id="synthetic"><t:Label>base</t:Label><t:BaseValue>7</t:BaseValue><t:Flag>1</t:Flag></t:Request>',
      '<t:Request' + prefix + '><t:BaseValue>7</t:BaseValue><t:Flag>1</t:Flag></t:Request>',
      '<t:Restricted' + prefix + ' id="synthetic"><t:BaseValue>7</t:BaseValue><t:Flag>true</t:Flag><t:Item count="2"><t:Text>first</t:Text></t:Item></t:Restricted>',
      '<t:Restricted' + prefix + ' id="synthetic" note="removed"><t:BaseValue>7</t:BaseValue><t:Flag>true</t:Flag></t:Restricted>',
      '<t:InheritedOnly' + prefix + ' id="synthetic"><t:BaseValue>7</t:BaseValue><t:Flag>false</t:Flag></t:InheritedOnly>',
      '<t:EmptyLeaf' + prefix + '/>',
      '<t:EmptyLeaf' + prefix + '> </t:EmptyLeaf>',
    ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [
      {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'accepted'},
      {outcome: 'rejected'}, {outcome: 'accepted'}, {outcome: 'accepted'}, {outcome: 'rejected'},
    ]});
  });
});
