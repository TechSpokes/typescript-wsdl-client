import {describe, expect, it} from 'vitest';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';

const uri = 'urn:test:component-response';
const parse = (bytes: Uint8Array, charset?: string) => parseOrderedSyntax(bytes, uri,
  {xml10Only: true, componentResponseEncoding: {charset}}).root.children;
const xml = (declaration: string, text = 'café \u0080') => `${declaration}<value>${text}</value>`;

describe('explicit component SOAP response encoding agreement', () => {
  it.each([undefined, 'ISO-8859-1', 'iso-8859-1'])('decodes exact Latin1 code points with charset %s', charset => {
    expect(parse(Buffer.from(xml('<?xml version="1.0" encoding="ISO-8859-1"?>'), 'latin1'), charset))
      .toMatchObject([{kind: 'text', value: 'café \u0080'}]);
  });
  it('uses an HTTP assertion without a declaration and keeps the UTF-8 default', () => {
    expect(parse(Buffer.from(xml(''), 'latin1'), 'iso-8859-1')).toMatchObject([{value: 'café \u0080'}]);
    expect(parse(Buffer.from(xml('', '雪 🌧')))).toMatchObject([{value: '雪 🌧'}]);
    expect(() => parse(Buffer.from(xml(''), 'latin1'))).toThrow();
  });
  it.each(['windows-1252', 'utf-32', 'utf-16', 'utf-16le'])('refuses unsupported unmarked charset %s', charset => {
    expect(() => parse(Buffer.from(xml('')), charset)).toThrow();
  });
  it('requires declaration, header and BOM agreement', () => {
    const latin = Buffer.from(xml('<?xml version="1.0" encoding="iso-8859-1"?>'), 'latin1');
    expect(() => parse(latin, 'utf-8')).toThrow();
    expect(() => parse(Buffer.from(xml('<?xml version="1.0" encoding="utf-8"?>')), 'iso-8859-1')).toThrow();
    const marked = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), latin]);
    expect(() => parse(marked, 'iso-8859-1')).toThrow();
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml('<?xml version="1.0" encoding="utf-16"?>', '雪'), 'utf16le')]);
    expect(parse(utf16, 'utf-16')).toMatchObject([{value: '雪'}]);
    expect(() => parse(utf16, 'iso-8859-1')).toThrow();
    expect(() => parse(utf16, 'utf-16be')).toThrow();
    const bigEndian = Buffer.from(utf16); bigEndian.swap16();
    expect(parse(bigEndian, 'utf-16be')).toMatchObject([{value: '雪'}]);
    expect(() => parse(Buffer.from(xml('<?xml version="1.0" encoding="windows-1252"?>', 'ascii')))).toThrow();
    expect(() => parse(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf]), Buffer.from('<value/>')]))).toThrow();
  });
  it('keeps source/direct policy separate and retains XML legality and capacities', () => {
    const bytes = Buffer.from(xml('<?xml version="1.0" encoding="iso-8859-1"?>'), 'latin1');
    expect(() => parseOrderedSyntax(bytes, uri, {xml10Only: true})).toThrow();
    expect(() => parse(Buffer.from(xml('', '\u0001'), 'latin1'), 'iso-8859-1')).toThrow();
    expect(() => parseOrderedSyntax(bytes, uri, {componentResponseEncoding: {}, maxBytes: 1})).toThrow();
    expect(() => parse(Buffer.from([0xc3, 0x28]), 'utf-8')).toThrow();
  });
});
