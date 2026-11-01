/** Independent original instance controls; native projection code is not imported. */
import {describe, expect, it} from 'vitest';
import {validateFixture} from './adapter.js';

describe('independent strict wildcard instances', () => {
  it('checks default strict processing, imported declaration identity, namespaces, bounds and payload validity', async () => {
    const request = (body: string) => '<t:Request xmlns:t="urn:strict-wildcards" xmlns:f="urn:foreign-wildcards">' + body + '</t:Request>';
    expect(await validateFixture('xsd/projection/strict-wildcards.xsd', [
      request(''),
      request('<t:Payload id="synthetic"><t:Flag>1</t:Flag><t:Count>2</t:Count></t:Payload><f:Payload><f:Label>foreign record</f:Label></f:Payload>'),
      request('<t:Unknown>sample</t:Unknown>'), request('<t:Flag>true</t:Flag>'),
      request('<t:Payload id="synthetic"><t:Flag>yes</t:Flag><t:Count>2</t:Count></t:Payload>'),
      request('<t:Payload><t:Flag>true</t:Flag><t:Count>2</t:Count></t:Payload>'),
      '<t:Bounded xmlns:t="urn:strict-wildcards"/>',
      '<t:Bounded xmlns:t="urn:strict-wildcards" xmlns:f="urn:foreign-wildcards"><f:Payload><f:Label>foreign record</f:Label></f:Payload></t:Bounded>',
      '<t:Overlap xmlns:t="urn:strict-wildcards"><t:Header>synthetic</t:Header></t:Overlap>',
      '<t:Reused xmlns:t="urn:strict-wildcards"><t:Text version="1">first</t:Text><t:Text version="2">second</t:Text></t:Reused>',
    ], {resources: ['xsd/projection/strict-wildcards-import.xsd']})).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [
      {outcome: 'accepted'}, {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'},
      {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'accepted'}, {outcome: 'accepted'},
    ]});
  });
});
