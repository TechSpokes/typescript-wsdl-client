import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {selectDirectOperation, inspectDirectOperation} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract} from '../../src/compiler/directOperation.js';
import {createDirectValueMapping} from '../../src/compiler/directValues.js';
import type {DirectValueMapping} from '../../src/compiler/directValues.js';
import type {DirectDirection} from '../../src/compiler/directStructure.js';
import {decodeDirectXml, encodeDirectXml} from '../../src/compiler/directCodec.js';

const ns = 'urn:checked:forecast', fixture = path.resolve('test/conformance/fixtures/assessment/forecast.wsdl');
let original: string, scratch: string;
beforeAll(async () => {
  original = await readFile(fixture, 'utf8');
  await mkdir('tmp/conformance/direct-codec', {recursive: true});
  scratch = await mkdtemp(path.resolve('tmp/conformance/direct-codec/suite-'));
});
afterAll(async () => {await rm(scratch, {recursive: true, force: true});});
async function contract(text?: string, namespace = ns, maxWork?: number, maxNodes?: number): Promise<DirectOperationContract> {
  const directory = text === undefined ? path.dirname(fixture) : await mkdtemp(path.join(scratch, 'source-'));
  const source = text === undefined ? fixture : path.join(directory, 'source.wsdl');
  if (text !== undefined) await writeFile(source, text);
  const selected = await selectDirectOperation(source, {portType: {namespace, local: 'ForecastPortType'},
    binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'},
  {loading: {policy: {fileRoots: [directory]}}, limits: {maxWork, maxNodes}});
  if (selected.kind !== 'selected') throw new Error(`${selected.kind}:${selected.rule}`);
  return selected.contract;
}
function mapping(c: DirectOperationContract, direction: DirectDirection = {kind: 'input'}): DirectValueMapping {
  const m = createDirectValueMapping(c, direction);
  if (m.kind !== 'direct-mapping') throw new Error(m.kind); return m;
}
function input(city = 'Paris', days = '2') {return `<GetForecast xmlns="${ns}"><city>${city}</city><days>${days}</days></GetForecast>`;}
const bytes = (xml: string) => Buffer.from(xml, 'utf8');
function roundTrip(c: DirectOperationContract, m: DirectValueMapping, value: unknown) {
  const encoded = encodeDirectXml(c, m, value);
  expect(encoded.kind).toBe('direct-encoded');
  if (encoded.kind !== 'direct-encoded') throw new Error(JSON.stringify(encoded));
  const decoded = decodeDirectXml(c, m, encoded.bytes);
  expect(decoded.kind).toBe('direct-decoded');
  if (decoded.kind !== 'direct-decoded') throw new Error(JSON.stringify(decoded));
  expect(decoded.validated.value).toEqual(encoded.expanded.validated.value);
  expect(decoded.admitted).toBe(false);
  return {encoded, decoded};
}
describe('internal direct XML byte contract', () => {
  it('allows protocol selection only from the actual observed parse, capturing selector getters once', async () => {
    const c = await contract(), m = mapping(c);
    const legitimate = decodeDirectXml(c, m, bytes(input()));
    if (legitimate.kind !== 'direct-decoded') throw new Error(legitimate.kind);
    const synthetic = legitimate.payload;
    expect(() => decodeDirectXml(c, m, bytes(input()), {selectPayload: () => ({payload: synthetic, mapping: m})})).toThrow(TypeError);
    let reads = 0;
    const result = decodeDirectXml(c, m, bytes(input()), {selectPayload: root => ({get payload() {
      return ++reads === 1 ? root : synthetic;
    }, mapping: m})});
    expect(result.kind).toBe('direct-decoded'); expect(reads).toBe(1);
    if (result.kind === 'direct-decoded') expect(result.payload).not.toBe(synthetic);
  });
  it('executes actual Forecast fixture payload bytes against independent expectations in all directions', async () => {
    const c = await contract(), directory = path.join(path.dirname(fixture), 'forecast-messages');
    const expected = JSON.parse(await readFile(path.join(directory, 'expectations.json'), 'utf8')) as {
      request: unknown; response: unknown; fault: {detail: {code: string; message: string}};
    };
    for (const [file, root, direction, value] of [
      ['request', 'GetForecast', {kind: 'input'}, expected.request],
      ['response', 'GetForecastResponse', {kind: 'output'}, expected.response],
      ['fault', 'ForecastFault', {kind: 'fault', name: 'ForecastError'}, {code: expected.fault.detail.code, message: expected.fault.detail.message}],
    ] as const) {
      // Test-only extraction from the actual SOAP fixtures. No codec SOAP policy.
      const envelope = await readFile(path.join(directory, file + '.xml'), 'utf8');
      const raw = envelope.slice(envelope.indexOf(`<t:${root}>`), envelope.indexOf(`</t:${root}>`) + root.length + 5)
        .replace(`<t:${root}>`, `<t:${root} xmlns:t="${ns}">`);
      const m = mapping(c, direction), b = bytes(raw);
      const result = decodeDirectXml(c, m, b, {uri: `urn:test:fixture:${file}`});
      expect(result.kind).toBe('direct-decoded');
      if (result.kind !== 'direct-decoded') throw new Error(result.kind);
      expect(result.validated.value).toEqual(value);
      expect(result.payload.source.digest).toBe(createHash('sha256').update(b).digest('hex'));
      expect(result.validated.operands.every(o => o.payloadSource.uri === `urn:test:fixture:${file}` && o.payloadSource.start.line > 0)).toBe(true);
      const fresh = roundTrip(c, m, structuredClone(value));
      expect(fresh.decoded.validated.operands.map(o => [o.declaration.name, o.value])).toEqual(result.validated.operands.map(o => [o.declaration.name, o.value]));
      expect(fresh.encoded.expanded.payload.source).toMatchObject({digest: '', start: {line: 0}});
    }
  });
  it.each(['', ' \t\n\r\r\n', '<&>"\' ]]> &entity;', 'café 漢字 😀 𐀀', 'x'.repeat(1100) + '😀\r'])('preserves XML string content %j', async city => {
    const c = await contract(), m = mapping(c), {encoded, decoded} = roundTrip(c, m, {days: -0, city});
    expect(decoded.validated.value).toEqual({city, days: 0});
    expect(Object.is((decoded.validated.value as {days: number}).days, -0)).toBe(false);
    expect(Buffer.from(encoded.bytes).toString()).not.toContain('\r');
    expect(Object.getPrototypeOf(decoded.validated.value)).toBe(null);
  });
  it('retains observed lexical evidence and normalizes only approved scalar output', async () => {
    const c = await contract(), m = mapping(c, {kind: 'output'});
    const xml = `<a:GetForecastResponse xmlns:a="${ns}"><b:city xmlns:b="${ns}"><![CDATA[ A&B ]]></b:city><a:temperature> \t+0002\n</a:temperature><a:temperature>-0</a:temperature><a:complete>1</a:complete></a:GetForecastResponse>`;
    const d = decodeDirectXml(c, m, bytes(xml));
    expect(d.kind).toBe('direct-decoded'); if (d.kind !== 'direct-decoded') throw new Error(d.kind);
    expect(d.validated.operands.map(o => o.lexical)).toEqual([' A&B ', ' \t+0002\n', '-0', '1']);
    const {decoded} = roundTrip(c, m, d.validated.value);
    expect(decoded.validated.operands.map(o => o.lexical)).toEqual([' A&B ', '2', '0', 'true']);
    expect(decoded.validated.operands.map(o => [o.declaration, o.type, o.value])).toEqual(d.validated.operands.map(o => [o.declaration, o.type, o.value]));
  });
  it('handles renamed sources, alias prefixes, rebinding and unqualified local forms', async () => {
    const other = 'urn:renamed';
    const text = original.replaceAll(ns, other).replace('elementFormDefault="qualified"', 'elementFormDefault="unqualified"')
      .replaceAll('name="city"', 'name="place"').replace('name="days" type="xs:int"', 'name="duration" type="xs:int" form="qualified"');
    const c = await contract(text, other), m = mapping(c);
    const {encoded} = roundTrip(c, m, {duration: 3, place: 'Oslo'});
    expect(Buffer.from(encoded.bytes).toString()).toContain('<place>Oslo</place>');
    const xml = `<a:GetForecast xmlns:a="${other}" xmlns="urn:outer"><place xmlns="">Oslo</place><a:duration xmlns:a="${other}">3</a:duration></a:GetForecast>`;
    const d = decodeDirectXml(c, m, bytes(xml)); expect(d.kind).toBe('direct-decoded');
    expect(decodeDirectXml(c, m, bytes(xml.replace(`<a:duration xmlns:a="${other}">`, '<a:duration xmlns:a="urn:wrong">'))).kind).toBe('mismatch');
  });
  it('covers every admitted occurrence pair and absence versus empty strings', async () => {
    for (const [min, max] of [['0', '1'], ['1', '1'], ['0', 'unbounded'], ['1', 'unbounded']] as const) {
      const c = await contract(original.replace('name="days" type="xs:int"', `name="days" type="xs:int" minOccurs="${min}" maxOccurs="${max}"`)), m = mapping(c);
      for (const n of [0, 1, 3]) {
        if (max === '1' && n > 1) continue;
        const value = max === 'unbounded' ? {city: '', days: Array<number>(n).fill(2)} : n === 0 ? {city: ''} : {city: '', days: 2};
        if (min === '1' && n === 0) expect(encodeDirectXml(c, m, value).kind).toBe('value-invalid');
        else roundTrip(c, m, value);
      }
    }
    const c = await contract(original.replace('name="city" type="xs:string"', 'name="city" type="xs:string" minOccurs="0"')), m = mapping(c);
    expect(roundTrip(c, m, {days: 2}).decoded.validated.value).toEqual({days: 2});
    expect(roundTrip(c, m, {days: 2, city: ''}).decoded.validated.value).toEqual({city: '', days: 2});
  });
  it('encodes scalar and empty-sequence roots', async () => {
    for (const [type, value] of [['string', '😀\r&'], ['int', -2147483648], ['boolean', false]] as const) {
      const c = await contract(original.replace('name="GetForecast" type="t:ForecastRequest"', `name="GetForecast" type="xs:${type}"`));
      expect(roundTrip(c, mapping(c), value).decoded.validated.value).toBe(value);
    }
    const c = await contract(original.replace(/<xs:complexType name="ForecastRequest">.*?<\/xs:complexType>/, '<xs:complexType name="ForecastRequest"><xs:sequence/></xs:complexType>'));
    roundTrip(c, mapping(c), {});
  });
  it.each(['__proto__', 'constructor', 'length', 'toString'])('preserves reserved legal key %s without extra wire containers', async key => {
    const c = await contract(original.replaceAll('name="city"', `name="${key}"`));
    const value = {[key]: 'Paris', days: 2};
    const {encoded} = roundTrip(c, mapping(c), value);
    expect(Buffer.from(encoded.bytes).toString()).toContain(`:${key}`);
    expect(Object.isFrozen(value)).toBe(false);
  });
  it.each(['\0', '\u0001', '\u000b', '\ud800', '\udfff', '\ufffe', '\uffff'])('rejects invalid XML character %j before emitting bytes', async city => {
    const c = await contract(); const result = encodeDirectXml(c, mapping(c), {city, days: 2});
    expect(result.kind).toBe('scalar-invalid'); expect(result).not.toHaveProperty('bytes');
  });
  it.each([
    '', '<', '<GetForecast>', input().slice(0, -1), input() + '<x/>', input('&unknown;'),
    input('&#0;'), input('&#xD800;'), '<p:GetForecast/>',
    '<r xmlns:a="urn:x" xmlns:b="urn:x" a:x="1" b:x="2"/>',
    '<r xmlns:xml="urn:wrong"/>', '<r xmlns:xmlns="urn:x"/>', '<r xmlns:p=""/>',
  ])('refuses malformed/truncated XML %j', async xml => {
    const c = await contract(); const d = decodeDirectXml(c, mapping(c), bytes(xml));
    expect(d.kind).toBe('xml-invalid'); expect(d).not.toHaveProperty('validated');
  });
  it.each(['<!DOCTYPE r><r/>', '<!DOCTYPE r SYSTEM "https://unreachable.invalid/a.dtd"><r/>',
    '<!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>', '<?xml version="1.1"?><r/>',
    '<?xml version="1.0" encoding="ISO-8859-1"?><r/>'])('refuses unsupported XML syntax without resource I/O %j', async xml => {
    const c = await contract(); expect(decodeDirectXml(c, mapping(c), bytes(xml)).kind).toBe('unsupported');
  });
  it('strictly handles supported BOM/declarations and malformed encodings', async () => {
    const c = await contract(), m = mapping(c), raw = input('é😀');
    const le = Buffer.concat([Buffer.from([255, 254]), Buffer.from('<?xml version="1.0" encoding="UTF-16"?>' + raw, 'utf16le')]);
    for (const b of [bytes(raw), Buffer.concat([Buffer.from([239, 187, 191]), bytes(raw)]), le, Buffer.from(le).swap16()]) {
      const d = decodeDirectXml(c, m, b); expect(d.kind).toBe('direct-decoded');
    }
    for (const b of [Buffer.from([0xff]), Buffer.from([0xc0, 0xaf]), Buffer.from([0xed, 0xa0, 0x80]), le.subarray(0, le.length - 1), Buffer.from(raw, 'utf16le'),
      Buffer.concat([Buffer.from([255, 254]), Buffer.from('<?xml version="1.0" encoding="UTF-8"?>' + raw, 'utf16le')])]) {
      expect(['xml-invalid', 'unsupported']).toContain(decodeDirectXml(c, m, b).kind);
    }
  });
  it('keeps structural, lexical and unsupported-semantic failures separate', async () => {
    const c = await contract(), m = mapping(c);
    expect(decodeDirectXml(c, m, bytes(input('Paris', '2147483648'))).kind).toBe('scalar-invalid');
    for (const xml of [input().replace('<city>Paris</city><days>2</days>', '<days>2</days><city>Paris</city>'), input().replace(ns, 'urn:wrong'), input().replace('<city>Paris</city>', '')]) {
      expect(decodeDirectXml(c, m, bytes(xml)).kind).toBe('mismatch');
    }
    for (const attrs of [' x="1"', ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"', ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="x"']) {
      expect(decodeDirectXml(c, m, bytes(input().replace('<city>', `<city${attrs}>`))).kind).toBe('unsupported');
    }
  });
  it('refuses copied, foreign, wrong-version and wrong-direction metadata before reading it', async () => {
    const c = await contract(), m = mapping(c), other = await contract();
    let reads = 0;
    for (const fake of [{...m}, {...m, version: 'future'}, {...m, direction: {kind: 'output'}}, {get version() {reads++; return 'direct-values-v1';}}, JSON.parse(JSON.stringify(m))]) {
      expect(() => encodeDirectXml(c, fake, {})).toThrow(TypeError);
      expect(() => decodeDirectXml(c, fake, bytes(input()))).toThrow(TypeError);
    }
    expect(() => encodeDirectXml(other, m, {})).toThrow(TypeError);
    expect(decodeDirectXml(c, mapping(c, {kind: 'output'}), bytes(input())).kind).toBe('mismatch');
    expect(reads).toBe(0);
  });
  it('refuses invalid fresh data without invoking getters or freezing caller values', async () => {
    const c = await contract(), m = mapping(c); let reads = 0;
    for (const value of [{get city() {reads++; return 'Paris';}, days: 2}, {city: 'Paris', days: '2'}, {city: 'Paris', days: 2, extra: 0}, new String('Paris')]) {
      expect(encodeDirectXml(c, m, value).kind).toBe('value-invalid'); expect(Object.isFrozen(value)).toBe(false);
    }
    expect(reads).toBe(0);
    const b = bytes(input());
    Object.defineProperty(b, 'byteLength', {get() {reads++; throw new Error('read');}});
    Object.defineProperty(b, 'buffer', {get() {reads++; throw new Error('read');}});
    expect(decodeDirectXml(c, m, b).kind).toBe('direct-decoded'); expect(reads).toBe(0);
    expect(() => decodeDirectXml(c, m, new Uint8Array(new SharedArrayBuffer(8)))).toThrow(TypeError);
  });
  it('honors inclusive byte/depth/node/text limits independently of request exhaustion', async () => {
    const c = await contract(), m = mapping(c), b = bytes(input());
    for (const [key, n] of [['maxBytes', b.length], ['maxDepth', 2], ['maxNodes', 5], ['maxText', 6]] as const) {
      expect(decodeDirectXml(c, m, b, {limits: {[key]: n}}).kind).toBe('direct-decoded');
      const failed = decodeDirectXml(c, m, b, {limits: {[key]: n - 1}});
      expect(failed.kind).toBe('resource-limit'); expect(failed).not.toHaveProperty('validated');
    }
    const {encoded} = roundTrip(c, m, {city: 'Paris', days: 2});
    for (const [key, n] of [['maxBytes', encoded.bytes.length], ['maxDepth', 2], ['maxNodes', 5], ['maxText', 6]] as const) {
      expect(encodeDirectXml(c, m, {city: 'Paris', days: 2}, {limits: {[key]: n}}).kind).toBe('direct-encoded');
      expect(encodeDirectXml(c, m, {city: 'Paris', days: 2}, {limits: {[key]: n - 1}}).kind).toBe('resource-limit');
    }
    for (const bad of [0, -1, Infinity, 1.5]) expect(() => decodeDirectXml(c, m, b, {limits: {maxBytes: bad}})).toThrow(RangeError);
    const getter = {get maxBytes(): number {throw new Error('read');}};
    expect(() => decodeDirectXml(c, m, b, {limits: getter})).toThrow(TypeError);
  });
  it('checks cooperative cancellation, repeated spent work and sticky request exhaustion', async () => {
    const c = await contract(), m = mapping(c), signal = AbortSignal.abort();
    for (const r of [encodeDirectXml(c, m, {city: '', days: 2}, {signal}), decodeDirectXml(c, m, bytes(input()), {signal})]) {
      expect(r.kind).toBe('cancelled'); expect(r).not.toHaveProperty('bytes'); expect(r).not.toHaveProperty('validated');
    }
    const {budget} = inspectDirectOperation(c).context, start = budget.usage().work;
    roundTrip(c, m, {city: '', days: 2}); expect(budget.usage().work).toBeGreaterThan(start);
    budget.guard(() => budget.chargeWork(125_000_000 - budget.usage().work));
    expect(budget.exhausted()).toBe(false);
    expect(decodeDirectXml(c, m, bytes(input())).kind).toBe('resource-limit');
    expect(encodeDirectXml(c, m, {city: '', days: 2}).kind).toBe('resource-limit'); expect(budget.exhausted()).toBe(true);
  });
  it.each(['encode', 'decode'] as const)('stops %s on an actual mid-operation cancellation checkpoint', async which => {
    const c = await contract(), m = mapping(c), controller = new AbortController();
    const {budget} = inspectDirectOperation(c).context, charge = budget.chargeWork;
    let visits = 0;
    budget.chargeWork = (amount = 1) => {charge(amount); if (++visits === 40) controller.abort();};
    const result = which === 'encode' ? encodeDirectXml(c, m, {city: 'x'.repeat(4096), days: 2}, {signal: controller.signal})
      : decodeDirectXml(c, m, bytes(input('x'.repeat(4096))), {signal: controller.signal});
    expect(controller.signal.aborted).toBe(true); expect(result.kind).toBe('cancelled');
    expect(result).not.toHaveProperty('bytes'); expect(result).not.toHaveProperty('validated');
  });
  it.each(['encode', 'decode'] as const)('honors the exact original node budget during %s', async which => {
    const exercise = (c: DirectOperationContract, m: DirectValueMapping) => which === 'encode'
      ? encodeDirectXml(c, m, {city: 'Paris', days: 2}) : decodeDirectXml(c, m, bytes(input()));
    const probe = await contract(), m = mapping(probe), result = exercise(probe, m);
    const end = inspectDirectOperation(probe).context.budget.usage().nodes;
    for (const delta of [0, -1]) {
      const c = await contract(undefined, ns, undefined, end + delta), plan = mapping(c), actual = exercise(c, plan);
      expect(actual.kind).toBe(delta === 0 ? result.kind : 'resource-limit');
      if (delta < 0) {
        expect(actual).not.toHaveProperty('bytes'); expect(actual).not.toHaveProperty('validated');
        expect(decodeDirectXml(c, plan, bytes(input())).kind).toBe('resource-limit');
      }
    }
  });
  it.each(['encode', 'decode'] as const)('publishes %s only at the exact inclusive original work limit', async which => {
    const exercise = (c: DirectOperationContract, m: DirectValueMapping) => which === 'encode'
      ? encodeDirectXml(c, m, {city: 'Paris', days: 2}) : decodeDirectXml(c, m, bytes(input()));
    const probe = await contract(), m = mapping(probe), result = exercise(probe, m);
    const end = inspectDirectOperation(probe).context.budget.usage().work;
    expect(result.usage.work).toBe(end);
    expect(result.kind).toBe(which === 'encode' ? 'direct-encoded' : 'direct-decoded');
    for (const delta of [0, -1]) {
      const c = await contract(undefined, ns, end + delta), actual = exercise(c, mapping(c));
      expect(actual.kind).toBe(delta === 0 ? result.kind : 'resource-limit');
      if (delta < 0) {expect(actual).not.toHaveProperty('bytes'); expect(actual).not.toHaveProperty('validated');}
    }
  });
});
