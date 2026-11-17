import {describe, expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {decodeMetadataXml, parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';

const uri = 'urn:test:component-response';
const parse = (bytes: Uint8Array, charset?: string) => parseOrderedSyntax(bytes, uri,
  {xml10Only: true, componentResponseEncoding: {charset}}).root.children;
const xml = (declaration: string, text = 'café \u0080') => `${declaration}<value>${text}</value>`;

describe('explicit component SOAP response encoding agreement', () => {
  it.each(['US-ASCII', 'ascii', 'aScIi'])('uses strict seven-bit %s and XML character references', charset => {
    const bytes = Buffer.from(xml('<?xml version="1.0" encoding="US-ASCII"?>', '&#xE9; &#x1F327;'));
    expect(parse(bytes, charset)).toMatchObject([{value: '\u00e9 \u{1f327}'}]);
    expect(parse(bytes)).toMatchObject([{value: '\u00e9 \u{1f327}'}]);
    expect(decodeMetadataXml(bytes)).toContain('&#xE9; &#x1F327;');
    expect(() => parseOrderedSyntax(bytes, uri, {xml10Only: true})).toThrow();
    for (const byte of [0x80, 0xe9, 0xff]) {
      expect(() => parse(Buffer.concat([Buffer.from('<value>'), Buffer.from([byte]), Buffer.from('</value>')]), charset)).toThrow();
    }
    expect(() => parse(Buffer.from(xml('', 'é')), charset)).toThrow();
  });
  it.each(['utf-16le', 'utf-16be'] as const)('requires explicit assertions for BOM-less %s', charset => {
    const encode = (text: string) => {const bytes = Buffer.from(text, 'utf16le'); return charset === 'utf-16be' ? bytes.swap16() : bytes;};
    const declared = encode(xml(`<?xml version="1.0" encoding="${charset.toUpperCase()}"?>`, '雪 🌧'));
    expect(parse(declared)).toMatchObject([{value: '\u96ea \u{1f327}'}]);
    expect(parse(declared, charset)).toMatchObject([{value: '\u96ea \u{1f327}'}]);
    expect(parse(encode(xml('', '雪 🌧')), charset)).toMatchObject([{value: '\u96ea \u{1f327}'}]);
    expect(() => parse(encode(xml('', '雪')))).toThrow();
    expect(() => parse(encode(xml('<?xml version="1.0"?>', '雪')))).toThrow();
    expect(() => parse(declared, 'utf-16')).toThrow();
    expect(() => parse(encode(xml('<?xml version="1.0" encoding="UTF-16"?>')), charset)).toThrow();
    expect(() => parse(declared, charset === 'utf-16le' ? 'utf-16be' : 'utf-16le')).toThrow();
    expect(() => parse(declared.subarray(0, declared.length - 1), charset)).toThrow();
    for (const value of ['\ud800', '\udc00', '\u0001', '&#0;']) expect(() => parse(encode(xml('', value)), charset)).toThrow();
    expect(() => parse(encode('<value>truncated'), charset)).toThrow();
    const bom = charset === 'utf-16le' ? [0xff, 0xfe] : [0xfe, 0xff];
    for (const header of [undefined, 'utf-16', charset]) {
      expect(parse(Buffer.concat([Buffer.from(bom), declared]), header)).toMatchObject([{value: '雪 🌧'}]);
    }
    expect(decodeMetadataXml(declared)).toContain('雪 🌧');
    expect(() => parseOrderedSyntax(declared, uri, {xml10Only: true})).toThrow();
  });
  it('checks independent UTF-16 code units and original byte digests', () => {
    const le = Buffer.from([0x3c,0,0x76,0,0x3e,0,0xe9,0,0x3c,0,0x2f,0,0x76,0,0x3e,0]);
    const be = Buffer.from([0,0x3c,0,0x76,0,0x3e,0,0xe9,0,0x3c,0,0x2f,0,0x76,0,0x3e]);
    expect(parse(le, 'utf-16le')).toMatchObject([{value: '\u00e9'}]);
    expect(parse(be, 'utf-16be')).toMatchObject([{value: '\u00e9'}]);
    for (const [bytes, charset] of [[le, 'utf-16le'], [be, 'utf-16be']] as const) {
      const original = Buffer.from(bytes);
      const document = parseOrderedSyntax(bytes, uri, {componentResponseEncoding: {charset}});
      expect(document.digest).toBe(createHash('sha256').update(original).digest('hex'));
      expect(bytes).toEqual(original);
    }
  });
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
