import {describe, expect, it} from 'vitest';
import {escapeReceiverAnyUri, receiverUriLexical} from '../../src/util/receiverUriReference.js';
import {resolveReceiverRole} from '../../src/compiler/soapReceiverUri.js';
import {parseOrderedSyntax, syntaxElements} from '../../src/loader/orderedSyntax.js';

const check = () => {};
const parse = (xml: string) => parseOrderedSyntax(Buffer.from(xml), 'urn:owned:diagnostic', {componentResponseEncoding: {}}).root;

describe('SOAP anyURI and XML Base reference integration', () => {
  it.each([
    ['urn:othér', 'urn:oth%C3%A9r'], ['urn:other space', 'urn:other%20space'],
    ['urn:other\u00a0', 'urn:other%C2%A0'], ['urn:emoji:\u{1F327}', 'urn:emoji:%F0%9F%8C%A7'],
    ['http://EXAMPLE.org:80/a/%6eext', 'http://EXAMPLE.org:80/a/%6eext'],
    ['http://é.example/rose <wine>', 'http://%C3%A9.example/rose%20%3Cwine%3E'],
  ])('escapes %j only where URI syntax requires it', (value, expected) => {
    expect(escapeReceiverAnyUri(value, check)).toBe(expected);
    expect(resolveReceiverRole(value, [], check)).toBe(expected);
  });
  it('retains XML whitespace collapse for roles and significant XML Base characters', () => {
    expect(resolveReceiverRole(' \t urn:other  space\r\n', [], check)).toBe('urn:other%20space');
    const root = parse('<v xml:base="http://EXAMPLE.org:80/rose wine/"/>');
    expect(resolveReceiverRole('next', [root], check)).toBe('http://EXAMPLE.org:80/rose%20wine/next');
    const padded = parse('<v xml:base="http://EXAMPLE.org:80/path/ "/>');
    expect(resolveReceiverRole('', [padded], check)).toBe('http://EXAMPLE.org:80/path/%20');
  });
  it('resolves nested Unicode and relative overrides without WHATWG canonicalization', () => {
    const root = parse('<a xml:base="http://EXAMPLE.org:80/wine/"><b xml:base="rosé/"><c xml:base="../café "/></b></a>');
    const middle = syntaxElements(root)[0]!, leaf = syntaxElements(middle)[0]!;
    expect(resolveReceiverRole('', [root, middle, leaf], check)).toBe('http://EXAMPLE.org:80/wine/caf%C3%A9%20');
    expect(resolveReceiverRole('other', [root, middle], check)).toBe('http://EXAMPLE.org:80/wine/ros%C3%A9/other');
  });
  it('keeps unresolved bases without inventing authority and permits later absolute recovery', () => {
    const root = parse('<a xml:base="relative/"><b xml:base="http://www.w3.org/2003/05/soap-envelope/role/"/></a>');
    expect(resolveReceiverRole('next', [root], check)).toMatchObject({kind: 'unsupported', rule: 'response-base-unavailable'});
    expect(resolveReceiverRole('next', [root, syntaxElements(root)[0]!], check))
      .toBe('http://www.w3.org/2003/05/soap-envelope/role/next');
    expect(() => parseOrderedSyntax(Buffer.from('<a xml:base="relative/"/>'), 'urn:owned:diagnostic')).toThrow('Invalid xml:base URI');
  });
  it('supports generic URI authorities the URL intrinsic cannot represent', () => {
    const root = parse('<a xml:base="http://[V1.Example]:80/"/>');
    expect(resolveReceiverRole('next', [root], check)).toBe('http://[V1.Example]:80/next');
  });
  it.each(['urn:bad%xx', 'http://[', 'urn:other[', 'http://example.org:bad/', 'http://[fe80::1%25eth0]/'])('preserves malformed-reference refusal for %j', value => {
    expect(escapeReceiverAnyUri(value, check)).toMatchObject({kind: 'protocol'});
    expect(resolveReceiverRole(value, [], check)).toMatchObject({kind: 'protocol'});
  });
  it('does not widen HTTP/actor URI syntax or bypass cancellation while escaping', () => {
    expect(receiverUriLexical('urn:other space')).toMatchObject({kind: 'unsupported', rule: 'URI-lexical-profile'});
    const cancelled = new Error('owned cancellation');
    let visits = 0;
    expect(() => escapeReceiverAnyUri('é'.repeat(1000), () => {if (++visits === 10) throw cancelled;})).toThrow(cancelled);
    expect(visits).toBe(10);
    expect(escapeReceiverAnyUri('urn:\ud800', check)).toMatchObject({kind: 'protocol', rule: 'SOAP URI character'});
  });
});
