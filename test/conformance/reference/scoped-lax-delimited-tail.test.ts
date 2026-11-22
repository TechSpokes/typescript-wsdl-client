import {describe, expect, it} from 'vitest';
import {validateFixture} from './adapter.js';

describe('independent XSD 1.0 assessment of the lax tail boundary', () => {
  it('accepts the inherited sequence when a required element separates optional fields from the tail', async () => {
    const instance = (body: string) => '<t:Content xmlns:t="urn:checked:scoped-lax" xmlns:v="urn:vendor" token="one">' + body + '</t:Content>';
    const name = '<t:Name>one</t:Name>', delimiter = '<t:SessionTimeout>PT060S</t:SessionTimeout>';
    const tail = '<v:RateControl> 007 </v:RateControl><t:ExtraCount>7</t:ExtraCount>';
    expect(await validateFixture('assessment/scoped-lax-delimited-tail.xsd', [
      instance(name + delimiter + tail),
      instance(name + '<t:H264>Main</t:H264>' + delimiter + tail),
      instance(name + '<t:BaseOption>5</t:BaseOption><t:RateControl>6</t:RateControl><t:H264>Main</t:H264>' + delimiter + tail),
      instance(name + tail + delimiter),
      instance(name + tail),
      instance(name + '<t:H264>Main</t:H264><t:RateControl>6</t:RateControl>' + delimiter),
      instance(name + delimiter + tail.replace('>7<', '>invalid<')),
    ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [
      {outcome: 'accepted'}, {outcome: 'accepted'}, {outcome: 'accepted'},
      {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'}, {outcome: 'rejected'},
    ]});
  });

  it('rejects an optional overlapping leaf adjacent to the wildcard', async () => {
    expect(await validateFixture('assessment/scoped-lax-wildcard.xsd')).toMatchObject({
      phase: 'schema', outcome: 'rejected', diagnostic: expect.stringMatching(/not determinist/i),
    });
  });
});
