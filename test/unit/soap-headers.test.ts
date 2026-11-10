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

describe('SOAP 1.2 component response header roles', () => {
  const namespace = 'http://www.w3.org/2003/05/soap-envelope';
  const assess12 = (body: string) => assessComponentSoapHeader(parseOrderedSyntax(Buffer.from(
    `<s:Header xmlns:s="${namespace}" xmlns:t="urn:owned:trace">${body}</s:Header>`), 'urn:owned:soap12-header').root, () => {}, '1.2');
  it.each(['0', 'false'])('ignores qualified optional ultimate-receiver blocks with mustUnderstand=%s', value => {
    expect(assess12(`<t:Trace s:mustUnderstand="${value}" s:relay="true"/>`).kind).toBe('ignored-optional-headers');
  });
  it.each(['1', 'true'])('refuses mandatory unknown blocks targeted at this receiver with mustUnderstand=%s', value => {
    expect(assess12(`<t:Trace s:mustUnderstand="${value}"/>`).kind).toBe('unsupported');
    expect(assess12(`<t:Trace s:mustUnderstand="${value}" s:role="${namespace}/role/next"/>`).kind).toBe('unsupported');
    expect(assess12(`<t:Trace s:mustUnderstand="${value}" s:role="${namespace}/role/ultimateReceiver"/>`).kind).toBe('unsupported');
  });
  it.each([namespace + '/role/none', 'urn:owned:other'])('does not assume the role %s', role => {
    expect(assess12(`<t:Trace s:mustUnderstand="true" s:role="${role}"/>`).kind).toBe('ignored-optional-headers');
  });
  it.each(['<t:Trace s:mustUnderstand="yes"/>', '<t:Trace s:relay="yes"/>', '<t:Trace s:role="relative"/>', '<Trace/>'])('refuses malformed SOAP 1.2 header %s', xml => {
    expect(assess12(xml).kind).toBe('protocol');
  });
});
