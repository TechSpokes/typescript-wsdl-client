import {describe, expect, it} from 'vitest';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {assessComponentSoapHeader} from '../../src/compiler/soapHeaders.js';
const soap = 'http://schemas.xmlsoap.org/soap/envelope/';
const assess = (body: string) => assessComponentSoapHeader(parseOrderedSyntax(Buffer.from(
  `<s:Header xmlns:s="${soap}" xmlns:t="urn:owned:trace">${body}</s:Header>`), 'urn:owned:soap-header').root, () => {});
describe('SOAP 1.1 component response headers', () => {
  it('ignores only qualified optional ultimate-receiver blocks without asserting their application semantics', () => {
    expect(assess('<t:Trace/><t:Other s:mustUnderstand="0"><t:Data s:mustUnderstand="1"/></t:Other>'))
      .toEqual({kind: 'ignored-optional-headers', headers: [{namespace: 'urn:owned:trace', local: 'Trace'}, {namespace: 'urn:owned:trace', local: 'Other'}]});
  });
  it.each([
    ['<t:Trace s:mustUnderstand="1"/>', 'unsupported'],
    ['<t:Trace s:mustUnderstand="true"/>', 'protocol'],
    ['<t:Trace s:actor="urn:other"/>', 'unsupported'],
    ['<Trace/>', 'protocol'],
    ['\u00a0<t:Trace/>', 'protocol'],
  ])('refuses the mandatory, invalid, actor-directed or unqualified boundary %s', (xml, kind) => {
    expect(assess(xml).kind).toBe(kind);
  });
});
