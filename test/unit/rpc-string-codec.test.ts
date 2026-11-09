import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {selectComponentOperation, selectDirectOperation, isRpcMessageRoot} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import type {ComponentValueMapping} from '../../src/compiler/directValues.js';
import {decodeComponentXml, encodeComponentXml} from '../../src/compiler/directCodec.js';

const fixture = path.resolve('test/conformance/fixtures/assessment/rpc-strings.wsdl');
const selector = {portType: {namespace: 'urn:rpc:strings', local: 'StringsPortType'}, binding: {namespace: 'urn:rpc:strings', local: 'StringsBinding'}, operation: 'Echo'};
const loading = {policy: {fileRoots: [path.dirname(fixture)]}};
async function contract(): Promise<DirectOperationContract> {
  const selected = await selectComponentOperation(fixture, selector, {loading});
  if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
  return selected.contract;
}
function mapping(c: DirectOperationContract, kind: 'input' | 'output' = 'output'): ComponentValueMapping {
  const m = createComponentValueMapping(c, {kind});
  if (m.kind !== 'component-mapping') throw new Error(JSON.stringify(m));
  return m;
}
const ns = 'xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:e="http://schemas.xmlsoap.org/soap/encoding/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:x="http://www.w3.org/2001/XMLSchema" xmlns:r="urn:rpc:body"';
const body = (content: string) => Buffer.from(`<s:Body ${ns}>${content}</s:Body>`);
function decode(c: DirectOperationContract, m: ComponentValueMapping, content: string) {
  return decodeComponentXml(c, m, body(content));
}

describe('bounded component RPC encoded strings', () => {
  it('issues typed parts without document element roots and preserves the direct refusal', async () => {
    const c = await contract();
    expect(isRpcMessageRoot(c.input)).toBe(true);
    if (!isRpcMessageRoot(c.input)) throw new Error('RPC input required');
    expect(c.input.parts.map(p => p.name)).toEqual(['first', 'second']);
    expect('element' in c.input).toBe(false);
    expect((await selectDirectOperation(fixture, selector, {loading})).kind).toBe('unsupported');
  });
  it('writes source order, safely escapes strings and round trips significant characters', async () => {
    const c = await contract(), m = mapping(c, 'input');
    const value = {second: '', first: ' \t<xml a="é">雪 & 🌧</xml>\r\n '};
    const encoded = encodeComponentXml(c, m, value);
    expect(encoded.kind).toBe('component-encoded');
    if (encoded.kind !== 'component-encoded') throw new Error(JSON.stringify(encoded));
    const xml = Buffer.from(encoded.bytes).toString('utf8');
    expect(xml.indexOf('<first')).toBeLessThan(xml.indexOf('<second'));
    expect(xml).toContain('xsi:type="xsd:string"');
    expect(xml).toContain('&lt;xml');
    const result = decodeComponentXml(c, m, encoded.bytes);
    expect(result.kind).toBe('component-decoded');
    if (result.kind === 'component-decoded') expect(result.validated.value).toEqual(value);
    const repeated = encodeComponentXml(c, m, {first: value.first, second: ''});
    if (repeated.kind !== 'component-encoded') throw new Error(JSON.stringify(repeated));
    expect(repeated.bytes).toEqual(encoded.bytes);
  });
  it.each([{}, {first: 'a'}, {first: 'a', second: null}, {first: 'a', second: 1}, {first: 'a', second: '', extra: ''}])('rejects invalid application input before encoding: %j', async value => {
    const c = await contract();
    expect(encodeComponentXml(c, mapping(c, 'input'), value)).toMatchObject({kind: 'value-invalid'});
  });
  it.each([
    ['<r:EchoResponse><result>owned value</result></r:EchoResponse>', 'owned value'],
    ['<r:DifferentStruct><differentReturn/></r:DifferentStruct>', ''],
    ['<r:DifferentStruct><return i:type="x:string"> &lt;dwml&gt;é 雪&lt;/dwml&gt; </return></r:DifferentStruct>', ' <dwml>é 雪</dwml> '],
    ['<e:string id="v" e:root="0">before</e:string><r:Response e:root="1"><result href="#v"/></r:Response>', 'before'],
    ['<r:Response><result href="#v"/></r:Response><value id="v" i:type="x:string">after</value>', 'after'],
    ['<r:Response><result href="#v" i:type="e:string"/></r:Response><e:string id="v"/>', ''],
  ])('reads inline/local string values and insignificant response local names', async (xml, expected) => {
    const c = await contract(), result = decode(c, mapping(c), xml);
    expect(result.kind).toBe('component-decoded');
    if (result.kind !== 'component-decoded') throw new Error(JSON.stringify(result));
    expect(result.validated.value).toEqual({result: expected});
  });
  it.each([
    ['<r:Response><result href="https://external.invalid/value"/></r:Response>', 'rpc-local-reference-required'],
    ['<r:Response><result href="#missing"/></r:Response>', 'rpc-dangling-reference'],
    ['<r:Response><result href="#v"/></r:Response><e:string id="v">a</e:string><e:string id="v">b</e:string>', 'rpc-duplicate-or-invalid-id'],
    ['<r:Response><result href="#v"/></r:Response><e:string id="v" href="#v"/>', 'rpc-cyclic-reference'],
    ['<r:Response><result href="#v"/></r:Response><value id="v">untyped</value>', 'rpc-string-type-required'],
    ['<r:Response><result i:type="x:int">4</result></r:Response>', 'rpc-string-type'],
    ['<r:Response><result href="#v"/></r:Response><e:int id="v" i:type="x:string">4</e:int>', 'rpc-string-type'],
    ['<r:Response><result i:type="unknown:string">a</result></r:Response>', 'rpc-string-type'],
    ['<r:Response><result i:nil="true"/></r:Response>', 'rpc-encoded-attribute'],
    ['<r:Response><result><nested/></result></r:Response>', 'rpc-string-compound-value'],
    ['<r:Response><result>a</result><extra>b</extra></r:Response>', 'rpc-result-accessor-count'],
    ['<r:Response><result>a</result></r:Response><r:Other><result>b</result></r:Other>', 'rpc-unambiguous-response-root'],
    ['<r:Response><result>a</result></r:Response><e:string id="unused">b</e:string>', 'rpc-unexpected-body-content'],
    ['<r:Response><result>a</result></r:Response><s:Fault/>', 'rpc-unexpected-body-content'],
    ['<r:Response s:encodingStyle="urn:other"><result>a</result></r:Response>', 'rpc-encoding-style'],
    ['<r:Response><result href="#v"/></r:Response><e:string id="v" e:root="1">b</e:string>', 'rpc-unexpected-body-content'],
  ])('refuses malformed or unsupported wire values: %s', async (xml, rule) => {
    const c = await contract(), result = decode(c, mapping(c), xml);
    expect(result).toMatchObject({rule});
    expect(result.kind).not.toBe('component-decoded');
  });
  it('authenticates mappings and retains caller cancellation and XML limits', async () => {
    const c = await contract(), m = mapping(c);
    expect(() => decodeComponentXml(c, {...m}, body('<r:Response><result>a</result></r:Response>'))).toThrow(TypeError);
    expect(decodeComponentXml(c, m, body('<r:Response><result>a</result></r:Response>'), {limits: {maxBytes: 10}})).toMatchObject({kind: 'resource-limit'});
    const controller = new AbortController(); controller.abort();
    expect(decodeComponentXml(c, m, body('<r:Response><result>a</result></r:Response>'), {signal: controller.signal})).toMatchObject({kind: 'cancelled'});
  });
  it('walks flat reference chains without recursive stack growth', async () => {
    const c = await contract(), m = mapping(c);
    const links = Array.from({length: 1500}, (_, index) => `<e:string id="v${index}" href="#v${index + 1}"/>`).join('');
    const result = decode(c, m, `<r:Response><result href="#v0"/></r:Response>${links}<e:string id="v1500">retained</e:string>`);
    expect(result.kind).toBe('component-decoded');
    if (result.kind === 'component-decoded') expect(result.validated.value).toEqual({result: 'retained'});
  });
});
