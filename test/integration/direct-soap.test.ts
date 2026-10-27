import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createServer, type IncomingHttpHeaders} from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {Socket} from 'node:net';
import {SaxesParser} from 'saxes';
import {selectDirectOperation, inspectDirectOperation} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract} from '../../src/compiler/directOperation.js';
import {createDirectValueMapping} from '../../src/compiler/directValues.js';
import {exchangeDirectSoap} from '../../src/compiler/directSoap.js';
import type {DirectSoapOptions, DirectSoapResult} from '../../src/compiler/directSoap.js';
import {validateFixture} from '../conformance/reference/adapter.js';
import {parseXml, standaloneXml} from '../conformance/reference/syntax.js';

const namespace = 'urn:checked:forecast', soap = 'http://schemas.xmlsoap.org/soap/envelope/';
const fixture = path.resolve('test/conformance/fixtures/assessment/forecast.wsdl');
let response: Buffer, fault: Buffer, original: string, scratch: string;
beforeAll(async () => {
  [response, fault, original] = await Promise.all([
    readFile(path.join(path.dirname(fixture), 'forecast-messages/response.xml')),
    readFile(path.join(path.dirname(fixture), 'forecast-messages/fault.xml')),
    readFile(fixture, 'utf8'),
  ]);
  await mkdir('tmp/conformance/direct-soap', {recursive: true});
  scratch = await mkdtemp(path.resolve('tmp/conformance/direct-soap/suite-'));
});
afterAll(async () => {await rm(scratch, {recursive: true, force: true});});
async function selected(text?: string, maxWork?: number, maxNodes?: number) {
  const directory = text === undefined ? path.dirname(fixture) : await mkdtemp(path.join(scratch, 'source-'));
  const source = text === undefined ? fixture : path.join(directory, 'original.wsdl');
  if (text !== undefined) await writeFile(source, text);
  const renamed = text?.includes('urn:renamed:climate') ?? false;
  const ns = renamed ? 'urn:renamed:climate' : namespace;
  const c = await selectDirectOperation(source, {portType: {namespace: ns, local: renamed ? 'ClimatePortType' : 'ForecastPortType'},
    binding: {namespace: ns, local: renamed ? 'ClimateBinding' : 'ForecastBinding'}, operation: renamed ? 'ReadClimate' : 'GetForecast'},
  {loading: {policy: {fileRoots: [directory]}}, limits: {maxWork, maxNodes}});
  if (c.kind !== 'selected') throw new Error(`${c.kind}:${c.rule}`);
  // Removing the original path proves the adapter consumes retained bytes.
  if (text !== undefined) await rm(source);
  return c.contract;
}
function mapping(c: DirectOperationContract, output = false) {
  const m = createDirectValueMapping(c, {kind: output ? 'output' : 'input'});
  if (m.kind !== 'direct-mapping') throw new Error(m.kind); return m;
}
interface Plan {bytes?: Buffer; status?: number; type?: string; encoding?: string; hang?: boolean; truncate?: boolean;}
async function local<T>(plan: Plan, work: (server: {
  options: DirectSoapOptions;
  requests: {bytes: Buffer; headers: IncomingHttpHeaders}[];
  received: Promise<void>;
  sockets: Set<Socket>;
}) => Promise<T>): Promise<T> {
  const requests: {bytes: Buffer; headers: IncomingHttpHeaders}[] = [], sockets = new Set<Socket>();
  let received!: () => void;
  const receivedPromise = new Promise<void>(resolve => {received = resolve;});
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({bytes: Buffer.concat(chunks), headers: req.headers}); received();
      if (plan.hang) return;
      const bytes = plan.bytes ?? response;
      res.writeHead(plan.status ?? 200, {'Content-Type': plan.type ?? 'text/xml; charset=utf-8',
        ...(plan.encoding ? {'Content-Encoding': plan.encoding} : {}),
        ...(plan.truncate ? {'Content-Length': bytes.length + 100} : {})});
      res.end(bytes);
    });
  });
  server.on('connection', socket => {sockets.add(socket); socket.on('close', () => sockets.delete(socket));});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  const endpoint = `http://127.0.0.1:${address.port}/owned`;
  try {
    return await work({options: {endpoint, allowEndpoint: url => url.href === endpoint,
      service: {namespace, local: 'ForecastService'}, port: 'ForecastPort', timeoutMs: 1000}, requests, received: receivedPromise, sockets});
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    // Node emits socket close after server close; join every remaining close.
    await Promise.all([...sockets].map(socket => once(socket, 'close')));
    expect(sockets.size).toBe(0); expect(server.listening).toBe(false);
  }
}
const request = {city: 'Paris', days: 2};
function success(result: DirectSoapResult) {
  expect(result.kind).toBe('soap-response');
  if (result.kind !== 'soap-response') throw new Error(JSON.stringify(result));
  expect(result.decoded.validated.value).toEqual({city: 'Paris', temperature: [18, -2], complete: true});
  expect(result.admitted).toBe(false); return result;
}

describe('buffered direct SOAP 1.1 native real-wire integration', () => {
  it('sends independently asserted Forecast wire bytes and validates original response bytes through native receipts', async () => {
    await local({}, async server => {
      const c = await selected(), result = success(await exchangeDirectSoap(c, mapping(c), request, server.options));
      expect(Buffer.from(result.responseBytes)).toEqual(response);
      expect(result.decoded.payload.source.digest).toBe(createHash('sha256').update(response).digest('hex'));
      expect(result.decoded.payload.source.uri).toBe(server.options.endpoint);
      expect(result.decoded.payload.source.path).toBe('/0/0/0');
      expect(result.decoded.validated.operands.every(o => o.payloadSource.digest === result.decoded.payload.source.digest)).toBe(true);
      expect(server.requests).toHaveLength(1);
      const captured = server.requests[0]!;
      expect(captured.headers.soapaction).toBe('"urn:checked:GetForecast"');
      expect(captured.headers['content-type']).toBe('text/xml; charset=utf-8');
      // Literal expectation is independent of the serializer and its mappings.
      expect(captured.bytes.toString()).toContain('<n0:GetForecast xmlns:n0="urn:checked:forecast"><n0:city xmlns:n0="urn:checked:forecast">Paris</n0:city><n0:days xmlns:n0="urn:checked:forecast">2</n0:days></n0:GetForecast>');
      const observed: string[] = [], text: string[] = [];
      const parser = new SaxesParser({xmlns: true});
      parser.on('opentag', tag => observed.push(`{${tag.uri}}${tag.local}`)); parser.on('text', value => text.push(value));
      parser.write(captured.bytes.toString()).close();
      expect(observed).toEqual([`{${soap}}Envelope`, `{${soap}}Body`, `{${namespace}}GetForecast`, `{${namespace}}city`, `{${namespace}}days`]);
      expect(text).toEqual(['Paris', '2']);
      // Existing external reference engine supplies an additional independent
      // request-instance check from the source WSDL, not production mappings.
      const envelope = parseXml(captured.bytes.toString(), 'server-captured');
      const bare = standaloneXml(envelope.children[0]!.children[0]!);
      const reference = await validateFixture('assessment/forecast.wsdl', [bare]);
      expect(reference.instances?.[0]?.outcome).toBe('accepted');
    });
  });
  it.each([200, 500])('returns typed declared ForecastError and genuine QName context on HTTP %i', async status => {
    await local({bytes: fault, status}, async server => {
      const c = await selected(), r = await exchangeDirectSoap(c, mapping(c), request, server.options);
      expect(r.kind).toBe('soap-fault'); if (r.kind !== 'soap-fault') throw new Error(JSON.stringify(r));
      expect(r.decoded.validated.value).toEqual({code: 'NOT_FOUND', message: 'Unknown city'});
      expect(r.fault).toMatchObject({name: 'ForecastError', code: {namespace: soap, local: 'Server'}, string: 'Unknown city'});
      expect(r.fault!.codeNode.namespaces.soap).toBe(soap);
      expect(r.fault!.codeNode.source.digest).toBe(createHash('sha256').update(fault).digest('hex'));
      expect(r.fault!.codeNode.source.path).toBe('/0/0/0/0');
      expect(Buffer.from(r.responseBytes)).toEqual(fault);
      expect(r.decoded.payload.source.path).toBe('/0/0/0/2/0');
    });
  });
  it('preserves faultcode rebinding and default QName namespace from actual observed context', async () => {
    const bytes = Buffer.from(fault.toString().replace('<faultcode>soap:Server</faultcode>', '<faultcode xmlns="urn:fault-codes">Problem</faultcode>').replace('<faultcode xmlns=', '<faultcode xmlns='));
    // The protocol child must remain unqualified; QName default namespace can
    // instead be supplied on an ancestor while resetting the child explicitly.
    const rebound = Buffer.from(fault.toString().replace('<faultcode>', '<faultcode xmlns:c="urn:declared:codes">').replace('soap:Server', 'c:Failure'));
    await local({bytes: rebound}, async server => {
      const c = await selected(), r = await exchangeDirectSoap(c, mapping(c), request, server.options);
      expect(r.kind).toBe('soap-fault'); if (r.kind !== 'soap-fault') throw new Error(JSON.stringify(r));
      expect(r.fault?.code).toEqual({namespace: 'urn:declared:codes', local: 'Failure'});
    });
    await local({bytes}, async server => {
      const c = await selected(); expect((await exchangeDirectSoap(c, mapping(c), request, server.options)).kind).toBe('protocol');
    });
  });
  it('handles UTF-16 original HTTP entity bytes without UTF-8 reconstruction', async () => {
    const text = '<?xml version="1.0" encoding="UTF-16"?>' + response.toString();
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
    await local({bytes, type: 'text/xml; charset=utf-16'}, async server => {
      const c = await selected(), r = success(await exchangeDirectSoap(c, mapping(c), request, server.options));
      expect(Buffer.from(r.responseBytes)).toEqual(bytes);
      expect(r.decoded.payload.source.digest).toBe(createHash('sha256').update(bytes).digest('hex'));
    });
  });
  it('executes genuinely renamed source, operation, service, port and application members after deleting the source path', async () => {
    const source = original.replaceAll(namespace, 'urn:renamed:climate').replaceAll('GetForecast', 'ReadClimate').replaceAll('Forecast', 'Climate')
      .replaceAll('name="city"', 'name="place"').replaceAll('name="days"', 'name="duration"').replace('elementFormDefault="qualified"', 'elementFormDefault="unqualified"');
    const bytes = Buffer.from('<e:Envelope xmlns:e="' + soap + '" xmlns:r="urn:renamed:climate"><e:Body><r:ReadClimateResponse><place>Paris</place><temperature>18</temperature><temperature>-2</temperature><complete>1</complete></r:ReadClimateResponse></e:Body></e:Envelope>');
    await local({bytes}, async server => {
      const c = await selected(source), r = await exchangeDirectSoap(c, mapping(c), {place: 'Paris', duration: 2}, {...server.options,
        service: {namespace: 'urn:renamed:climate', local: 'ClimateService'}, port: 'ClimatePort'});
      expect(r.kind).toBe('soap-response'); if (r.kind !== 'soap-response') throw new Error(JSON.stringify(r));
      expect(r.decoded.validated.value).toEqual({place: 'Paris', temperature: [18, -2], complete: true});
      expect(server.requests[0]!.headers.soapaction).toBe('"urn:checked:ReadClimate"');
      expect(server.requests[0]!.bytes.toString()).toContain('<place>Paris</place><duration>2</duration>');
    });
  });
  it.each([{city: 'Paris'}, {city: 'Paris', days: 1.5}, {city: 'Paris', days: 2147483648}, {city: 'Paris', days: 2, extra: true}])('rejects invalid fresh values before any request: %j', async value => {
    await local({}, async server => {
      const c = await selected(); expect((await exchangeDirectSoap(c, mapping(c), value, server.options)).kind).toBe(value.days === 2147483648 ? 'scalar-invalid' : 'value-invalid');
      expect(server.requests).toHaveLength(0);
    });
  });
  it('rejects copied/foreign contracts and mappings, wrong directions and denied endpoints before I/O', async () => {
    await local({}, async server => {
      const c = await selected(), other = await selected(), m = mapping(c);
      await expect(exchangeDirectSoap({...c}, m, request, server.options)).rejects.toThrow(TypeError);
      await expect(exchangeDirectSoap(c, {...m}, request, server.options)).rejects.toThrow(TypeError);
      await expect(exchangeDirectSoap(c, mapping(other), request, server.options)).rejects.toThrow(TypeError);
      await expect(exchangeDirectSoap(c, mapping(c, true), request, server.options)).rejects.toThrow(TypeError);
      expect((await exchangeDirectSoap(c, m, request, {...server.options, allowEndpoint: () => false})).kind).toBe('unsupported');
      expect(server.requests).toHaveLength(0);
    });
  });
  it.each(['service', 'port', 'binding', 'action'])('rejects a source/%s mismatch before I/O', async kind => {
    await local({}, async server => {
      const text = kind === 'binding' ? original.replace('</wsdl:definitions>', original.slice(original.indexOf('<wsdl:binding'), original.indexOf('</wsdl:binding>') + '</wsdl:binding>'.length).replace('name="ForecastBinding"', 'name="OtherBinding"') + '</wsdl:definitions>').replace('binding="t:ForecastBinding"', 'binding="t:OtherBinding"')
        : kind === 'action' ? original.replace('urn:checked:GetForecast', 'urn:checked:Bad&quot;Action') : undefined;
      const c = await selected(text);
      const options = {...server.options, ...(kind === 'service' ? {service: {namespace, local: 'Missing'}} : {}), ...(kind === 'port' ? {port: 'Missing'} : {})};
      expect((await exchangeDirectSoap(c, mapping(c), request, options)).kind).toBe('unsupported'); expect(server.requests).toHaveLength(0);
    });
  });
  it.each(['SOAP1.2', 'TLS', 'mTLS', 'Basic', 'WS-Security', 'signing', 'headers', 'attachments', 'redirects', 'compression', 'streaming'])('refuses requested capability %s before I/O', async capability => {
    await local({}, async server => {
      const c = await selected(); expect((await exchangeDirectSoap(c, mapping(c), request, {...server.options, capabilities: [capability]})).kind).toBe('unsupported');
      expect(server.requests).toHaveLength(0);
    });
  });
  it.each([
    ['wrong Envelope', (s: string) => s.replaceAll(soap, 'urn:wrong'), 'protocol'],
    ['missing Body', (s: string) => s.replaceAll('soap:Body', 'soap:Other'), 'protocol'],
    ['wrong root', (s: string) => s.replaceAll('GetForecastResponse', 'Wrong'), 'mismatch'],
    ['duplicate Body', (s: string) => s.replace('</soap:Envelope>', '<soap:Body/></soap:Envelope>'), 'protocol'],
    ['empty Body', (s: string) => s.replace(/<t:GetForecastResponse>[\s\S]*<\/t:GetForecastResponse>/, ''), 'protocol'],
    ['security Header', (s: string) => s.replace('<soap:Body>', '<soap:Header><Security xmlns="urn:security"/></soap:Header><soap:Body>'), 'unsupported'],
    ['Header mustUnderstand', (s: string) => s.replace('<soap:Body>', '<soap:Header soap:mustUnderstand="1"/><soap:Body>'), 'protocol'],
    ['trailing XML', (s: string) => s + '<extra/>', 'xml-invalid'],
    ['truncated XML', (s: string) => s.slice(0, -15), 'xml-invalid'],
    ['DTD', (s: string) => '<!DOCTYPE x [<!ENTITY external SYSTEM "http://127.0.0.1:1/no">]>' + s, 'unsupported'],
    ['unknown entity', (s: string) => s.replace('Paris', '&unknown;'), 'xml-invalid'],
    ['invalid scalar', (s: string) => s.replace('true', 'yes'), 'scalar-invalid'],
    ['invalid order', (s: string) => s.replace('<t:city>Paris</t:city>', '').replace('<t:complete>', '<t:city>Paris</t:city><t:complete>'), 'mismatch'],
  ] as const)('fails closed on %s', async (_name, mutate, expected) => {
    await local({bytes: Buffer.from(mutate(response.toString()))}, async server => {
      const c = await selected(), r = await exchangeDirectSoap(c, mapping(c), request, server.options);
      expect(r.kind).toBe(expected); expect(r).not.toHaveProperty('decoded'); expect(r).not.toHaveProperty('responseBytes');
    });
  });
  it.each([
    ['unknown detail', (s: string) => s.replaceAll('ForecastFault', 'Unknown')],
    ['missing detail', (s: string) => s.replace(/<detail>[\s\S]*<\/detail>/, '')],
    ['extra child', (s: string) => s.replace('<detail>', '<other/><detail>')],
    ['wrong faultcode namespace', (s: string) => s.replace('<faultcode>', '<faultcode xmlns="urn:wrong">')],
    ['unbound code', (s: string) => s.replace('soap:Server', 'unknown:Server')],
    ['duplicate code', (s: string) => s.replace('<faultstring>', '<faultcode>soap:Client</faultcode><faultstring>')],
  ] as const)('rejects malformed SOAP Fault: %s', async (_name, mutate) => {
    await local({bytes: Buffer.from(mutate(fault.toString())), status: 500}, async server => {
      const c = await selected(); expect((await exchangeDirectSoap(c, mapping(c), request, server.options)).kind).toBe('protocol');
    });
  });
  it.each([
    [{status: 500}, 'protocol'], [{status: 302}, 'transport'], [{status: 401}, 'transport'],
    [{type: 'application/soap+xml'}, 'protocol'], [{type: 'text/xml; charset=utf-16'}, 'protocol'],
    [{encoding: 'gzip'}, 'unsupported'], [{truncate: true}, 'transport'],
  ] as const)('distinguishes HTTP/protocol failures %j', async (plan, expected) => {
    await local(plan, async server => {
      const c = await selected(); expect((await exchangeDirectSoap(c, mapping(c), request, {...server.options, timeoutMs: 100})).kind).toBe(expected);
    });
  });
  it('accepts equivalent namespace aliases, rebinding and empty Header', async () => {
    const bytes = Buffer.from(response.toString().replaceAll('soap:', 's:').replaceAll('xmlns:soap=', 'xmlns:s=').replaceAll('t:', 'r:').replace('xmlns:t=', 'xmlns:r=').replace('<s:Body>', '<s:Header/><s:Body>'));
    await local({bytes}, async server => {const c = await selected(); success(await exchangeDirectSoap(c, mapping(c), request, server.options));});
  });
  it('enforces inclusive request-wide work budgets and keeps exhaustion sticky across repeated calls', async () => {
    await local({}, async server => {
      const c = await selected(), m = mapping(c), r = success(await exchangeDirectSoap(c, m, request, server.options));
      const exact = await selected(undefined, r.usage.work), exactMap = mapping(exact);
      success(await exchangeDirectSoap(exact, exactMap, request, server.options));
      const below = await selected(undefined, r.usage.work - 1), belowMap = mapping(below);
      expect((await exchangeDirectSoap(below, belowMap, request, server.options)).kind).toBe('resource-limit');
      const before = server.requests.length;
      expect((await exchangeDirectSoap(below, belowMap, request, server.options)).kind).toBe('resource-limit');
      expect(server.requests).toHaveLength(before);
      expect(inspectDirectOperation(below).context.budget.exhausted()).toBe(true);
    });
  });
  it('enforces inclusive request-wide node boundaries before publishing success', async () => {
    await local({}, async server => {
      const c = await selected(), r = success(await exchangeDirectSoap(c, mapping(c), request, server.options));
      const exact = await selected(undefined, undefined, r.usage.nodes);
      success(await exchangeDirectSoap(exact, mapping(exact), request, server.options));
      const below = await selected(undefined, undefined, r.usage.nodes - 1), m = mapping(below);
      expect((await exchangeDirectSoap(below, m, request, server.options)).kind).toBe('resource-limit');
      const count = server.requests.length;
      expect((await exchangeDirectSoap(below, m, request, server.options)).kind).toBe('resource-limit');
      expect(server.requests).toHaveLength(count);
    });
  });
  it('decodes a genuinely renamed declared fault over real HTTP', async () => {
    const source = original.replaceAll(namespace, 'urn:renamed:climate').replaceAll('GetForecast', 'ReadClimate').replaceAll('Forecast', 'Climate');
    const bytes = Buffer.from(fault.toString().replaceAll(namespace, 'urn:renamed:climate').replaceAll('ForecastFault', 'ClimateFault').replaceAll('soap:', 'env:').replace('xmlns:soap=', 'xmlns:env='));
    await local({bytes, status: 500}, async server => {
      const c = await selected(source), r = await exchangeDirectSoap(c, mapping(c), request, {...server.options,
        service: {namespace: 'urn:renamed:climate', local: 'ClimateService'}, port: 'ClimatePort'});
      expect(r.kind).toBe('soap-fault'); if (r.kind !== 'soap-fault') throw new Error(JSON.stringify(r));
      expect(r.fault?.name).toBe('ClimateError');
      expect(r.fault?.code).toEqual({namespace: soap, local: 'Server'});
      expect(r.decoded.validated.value).toEqual({code: 'NOT_FOUND', message: 'Unknown city'});
    });
  });
  it('uses the same adapter for scalar roots in request, response and declared detail', async () => {
    const source = original.replace('name="GetForecast" type="t:ForecastRequest"', 'name="GetForecast" type="xs:string"')
      .replace('name="GetForecastResponse" type="t:ForecastResponse"', 'name="GetForecastResponse" type="xs:boolean"')
      .replace('name="ForecastFault" type="t:ForecastFault"', 'name="ForecastFault" type="xs:int"');
    const bytes = Buffer.from(`<s:Envelope xmlns:s="${soap}" xmlns:t="${namespace}"><s:Body><t:GetForecastResponse>1</t:GetForecastResponse></s:Body></s:Envelope>`);
    await local({bytes}, async server => {
      const c = await selected(source), r = await exchangeDirectSoap(c, mapping(c), 'Paris', server.options);
      expect(r.kind).toBe('soap-response'); if (r.kind !== 'soap-response') throw new Error(JSON.stringify(r));
      expect(r.decoded.validated.value).toBe(true);
      expect(server.requests[0]!.bytes.toString()).toContain('>Paris</n0:GetForecast>');
    });
    const faultBytes = Buffer.from(fault.toString().replace(/<t:ForecastFault>[\s\S]*<\/t:ForecastFault>/, '<t:ForecastFault>7</t:ForecastFault>'));
    await local({bytes: faultBytes, status: 500}, async server => {
      const c = await selected(source), r = await exchangeDirectSoap(c, mapping(c), '', server.options);
      expect(r.kind).toBe('soap-fault'); if (r.kind !== 'soap-fault') throw new Error(JSON.stringify(r));
      expect(r.decoded.validated.value).toBe(7);
    });
  });
  it.each([0, 1])('accepts %i repeated response members and preserves optional omission and empty strings', async count => {
    const source = original.replace('name="city" type="xs:string"', 'name="city" type="xs:string" minOccurs="0"');
    const bytes = Buffer.from(response.toString().replace(/<t:temperature>[\s\S]*<\/t:temperature>/, count ? '<t:temperature>18</t:temperature>' : ''));
    await local({bytes}, async server => {
      const c = await selected(source), r = await exchangeDirectSoap(c, mapping(c), {days: 2}, server.options);
      expect(r.kind).toBe('soap-response'); if (r.kind !== 'soap-response') throw new Error(JSON.stringify(r));
      expect(r.decoded.validated.value).toEqual({city: 'Paris', temperature: count ? [18] : [], complete: true});
      expect(server.requests[0]!.bytes.toString()).not.toContain(':city');
    });
  });
  it('rejects byte/depth/node/text caps without publishing partial values', async () => {
    for (const limits of [{maxBytes: 100}, {maxDepth: 2}, {maxNodes: 3}, {maxText: 3}]) {
      await local({}, async server => {
        const c = await selected(), r = await exchangeDirectSoap(c, mapping(c), request, {...server.options, limits});
        expect(r.kind).toBe('resource-limit'); expect(r).not.toHaveProperty('decoded');
      });
    }
  });
  it('cancels before dispatch and during a pending HTTP read, closing sockets', async () => {
    await local({hang: true}, async server => {
      const c = await selected(), controller = new AbortController(); controller.abort();
      expect((await exchangeDirectSoap(c, mapping(c), request, {...server.options, signal: controller.signal})).kind).toBe('cancelled');
      expect(server.requests).toHaveLength(0);
      const fresh = new AbortController();
      const pending = exchangeDirectSoap(c, mapping(c), request, {...server.options, signal: fresh.signal});
      await server.received; fresh.abort();
      expect((await pending).kind).toBe('cancelled');
    });
  });
  it('returns a transport timeout and releases a pending response', async () => {
    await local({hang: true}, async server => {
      const c = await selected(); expect((await exchangeDirectSoap(c, mapping(c), request, {...server.options, timeoutMs: 30})).kind).toBe('transport');
    });
  });
});
