/** Independent handwritten instance controls; native projection code is not imported. */
import {describe, expect, it} from 'vitest';
import {validateFixture} from './adapter.js';

describe('independent ordered particle instances', () => {
  it('checks named pair correlation, choices, repetitions and all order', async () => {
    const request = (body: string) => '<t:Request xmlns:t="urn:ordered-particles" id="synthetic"><t:Header>synthetic</t:Header>' + body + '</t:Request>';
    expect(await validateFixture('xsd/projection/ordered-particles.xsd', [
      request('<t:Label>first</t:Label><t:Count>2</t:Count><t:Item><t:Flag>1</t:Flag></t:Item>'),
      request(''), request('<t:Label>first</t:Label>'), request('<t:Count>2</t:Count><t:Label>first</t:Label>'),
      request(Array.from({length: 4}, () => '<t:Item><t:Flag>true</t:Flag></t:Item>').join('')),
      '<t:All xmlns:t="urn:ordered-particles"><t:B>false</t:B><t:A>2</t:A></t:All>',
      '<t:All xmlns:t="urn:ordered-particles"><t:A>2</t:A><t:A>3</t:A></t:All>',
      '<t:Nullable xmlns:t="urn:ordered-particles"/>',
      '<t:Overlap xmlns:t="urn:ordered-particles"><t:B>1</t:B><t:A>2</t:A></t:Overlap>',
    ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [
      {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'},
      {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'accepted'}, {outcome: 'accepted'},
    ]});
  });
});
