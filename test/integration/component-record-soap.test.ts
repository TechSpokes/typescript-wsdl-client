import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import {createServer} from 'node:https';
import type {Server} from 'node:https';
import {readFile} from 'node:fs/promises';
import {once, EventEmitter} from 'node:events';
import path from 'node:path';
import {SaxesParser} from 'saxes';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract} from '../../src/compiler/directOperation.js';
import {acquireStandardSchemaLibrary, SCHEMA_ELEMENT_LIBRARY} from '../../src/compiler/standardSchemaComponents.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import type {ComponentValueMapping} from '../../src/compiler/directValues.js';
import {createComponentRecordProjection} from '../../src/compiler/componentRecordProjection.js';
import type {ComponentRecordProjection} from '../../src/compiler/componentRecordProjection.js';
import {exchangeComponentSoap} from '../../src/compiler/directSoap.js';

const ns = 'urn:owned:wrapper', soap = 'http://schemas.xmlsoap.org/soap/envelope/', xsd = 'http://www.w3.org/2001/XMLSchema';
const name = (local: string) => ({namespace: ns, local});
const directory = path.resolve('test/conformance/fixtures/xsd/standard-schema-element');
// Synthetic owned fixture and independent JSON oracle; neither is produced by a generator.
const records = '<Envelope xmlns="urn:owned:wrapper"><Records><Record Code="0007"><Name>A &amp; B</Name><Active>true</Active><Quantity>2</Quantity></Record><Record Code="0008"><Name>C</Name><Active>false</Active><Quantity>0</Quantity></Record></Records></Envelope>';
const payload = `<Envelope xmlns="${ns}"><xs:schema xmlns:xs="${xsd}"/>${records}</Envelope>`;
const reply = (body: string) => `<s:Envelope xmlns:s="${soap}"><s:Body>${body}</s:Body></s:Envelope>`;
const fault = (detail: string) => reply(`<s:Fault><faultcode>s:Server</faultcode><faultstring>Owned synthetic fault</faultstring><detail>${detail}</detail></s:Fault>`);
const app = Fastify();
const lifecycle = new EventEmitter();
let upstream: Server | undefined, endpoint: string, gateway: string, cert: string;
let contract: DirectOperationContract, input: ComponentValueMapping, projection: ComponentRecordProjection;
let mode = 'normal', calls = 0, trusted = true;
const wireFailures: string[] = [];
beforeAll(async () => {
  const selected = await selectComponentOperation(path.join(directory, 'wrapper.wsdl'), {
    portType: name('WrapperPortType'), binding: name('WrapperBinding'), operation: 'Fetch'}, {
    loading: {policy: {fileRoots: [directory]}}, standardLibraries: [acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY)]});
  const companion = await selectComponentOperation(path.join(directory, 'records.wsdl'), {
    portType: name('RecordPortType'), binding: name('RecordBinding'), operation: 'Fetch'}, {loading: {policy: {fileRoots: [directory]}}});
  if (selected.kind !== 'selected' || companion.kind !== 'selected') throw new Error('Native fixture selection failed');
  contract = selected.contract;
  const mapped = createComponentValueMapping(contract, {kind: 'input'});
  const scoped = createComponentRecordProjection(contract, companion.contract, {version: 'component-record-scope-v1',
    scope: 'records-with-declared-wrapper-scope', payloadPath: [name('Envelope')], recordPath: [name('Records'), name('Record')],
    opaqueExclusions: [{path: [{namespace: xsd, local: 'schema'}], reason: 'standard-schema-metadata'},
      {path: [name('Envelope')], reason: 'wrapper-declaration-universe'}]});
  if (mapped.kind !== 'component-mapping' || scoped.kind !== 'component-record-projection') throw new Error('Native fixture mapping failed');
  input = mapped; projection = scoped;
  cert = await readFile('test/conformance/fixtures/soap/content-model/test-cert.pem', 'utf8');
  const key = await readFile('test/conformance/fixtures/soap/content-model/test-key.pem', 'utf8');
  upstream = createServer({key, cert}, (request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(Buffer.from(chunk as Uint8Array)));
    request.on('end', () => {
      calls++;
      try {
        expect(request.method).toBe('POST'); expect(request.url).toBe('/owned-wrapper');
        expect(request.headers.soapaction).toBe('"urn:owned:wrapper:fetch"');
        const nodes: string[][] = []; let value = '', inCode = false;
        const parser = new SaxesParser({xmlns: true});
        parser.on('opentag', tag => {nodes.push([tag.uri, tag.local]); inCode = tag.uri === ns && tag.local === 'Code';});
        parser.on('text', text => {if (inCode) value += text;}); parser.on('closetag', () => {inCode = false;});
        parser.write(Buffer.concat(chunks).toString('utf8')).close();
        expect(nodes).toEqual([[soap, 'Envelope'], [soap, 'Body'], [ns, 'Request'], [ns, 'Code']]);
        expect(value).toBe('owned & probe');
      } catch (error) {wireFailures.push(String(error)); response.writeHead(500, {'content-type': 'text/xml'}); response.end('wire oracle failure'); return;}
      if (mode === 'hang') {
        response.on('close', () => lifecycle.emit('closed')); lifecycle.emit('arrived'); return;
      }
      let body = mode === 'missing-schema' ? reply(`<Envelope xmlns="${ns}">${records}</Envelope>`)
        : mode === 'invalid-record' ? reply(payload.replace('<Active>true</Active>', '<Active>invalid</Active>'))
          : mode === 'fault' ? fault(`<Problem xmlns="${ns}">Synthetic declared detail</Problem>`)
            : mode === 'invalid-fault' ? fault(`<Problem xmlns="${ns}"><Unexpected/></Problem>`) : reply(payload);
      if (mode === 'optional-header') body = body.replace('<s:Body>', '<s:Header><t:Trace xmlns:t="urn:owned:trace" s:mustUnderstand="0">Synthetic trace</t:Trace></s:Header><s:Body>');
      if (mode === 'mandatory-header') body = body.replace('<s:Body>', '<s:Header><t:Trace xmlns:t="urn:owned:trace" s:mustUnderstand="1"/></s:Header><s:Body>');
      response.writeHead(mode.includes('fault') ? 500 : 200, {'content-type': 'text/xml; charset=utf-8'}); response.end(body);
    });
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('Missing owned HTTPS port');
  endpoint = `https://127.0.0.1:${address.port}/owned-wrapper`;
  app.post('/wrapper/fetch', async (request, response) => {
    const result = await exchangeComponentSoap(contract, input, request.body, {service: name('WrapperService'), port: 'WrapperPort',
      endpoint, ca: trusted ? cert : undefined, allowEndpoint: url => url.href === endpoint}, projection);
    if ('decoded' in result) return result.kind === 'soap-response' ? response.send(result.decoded.validated.value)
      : response.code(502).send({fault: true, value: result.decoded.validated.value});
    return response.code(result.phase === 'input' ? 400 : 502).send({kind: result.kind, rule: result.rule});
  });
  gateway = await app.listen({host: '127.0.0.1', port: 0});
});
afterAll(async () => {
  await app.close();
  if (upstream) {upstream.closeAllConnections(); await new Promise<void>((resolve, reject) => upstream!.close(error => error ? reject(error) : resolve()));}
});
async function post(value: unknown) {
  const response = await fetch(gateway + '/wrapper/fetch', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(value)});
  return {status: response.status, body: await response.json() as unknown};
}
describe('actual HTTP to owned HTTPS SOAP with explicit companion record scope', () => {
  it('preserves records and typed values through the actual adapter and service/binding selection', async () => {
    mode = 'normal'; const before = calls;
    const result = await post({Code: 'owned & probe'});
    expect(result).toEqual({status: 200, body: {Records: {Record: [
      {Code: '0007', Name: 'A & B', Active: true, Quantity: 2}, {Code: '0008', Name: 'C', Active: false, Quantity: 0},
    ]}}});
    expect(calls - before).toBe(1); expect(wireFailures).toEqual([]);
  });
  it('rejects invalid HTTP values before owned SOAP without coercion, defaults or field removal', async () => {
    const before = calls;
    for (const value of [[], {}, {Code: 17}, {Code: 'owned & probe', unknown: true}]) expect((await post(value)).status).toBe(400);
    expect(calls).toBe(before);
  });
  it('refuses missing required metadata and invalid upstream typed records', async () => {
    const before = calls;
    for (const value of ['missing-schema', 'invalid-record']) {mode = value; expect((await post({Code: 'owned & probe'})).status).toBe(502);}
    expect(calls - before).toBe(2); expect(wireFailures).toEqual([]);
  });
  it('validates actual declared faults in the outer contract rather than treating them as companion output', async () => {
    const before = calls; mode = 'fault';
    expect(await post({Code: 'owned & probe'})).toEqual({status: 502, body: {fault: true, value: 'Synthetic declared detail'}});
    mode = 'invalid-fault'; const invalid = await post({Code: 'owned & probe'});
    expect(invalid.status).toBe(502); expect(invalid.body).not.toHaveProperty('fault', true);
    expect(calls - before).toBe(2); expect(wireFailures).toEqual([]);
  });
  it('retains server certificate verification for the scoped exchange', async () => {
    const before = calls; mode = 'normal'; trusted = false;
    try {expect((await post({Code: 'owned & probe'})).status).toBe(502);} finally {trusted = true;}
    expect(calls).toBe(before);
  });
  it('ignores an optional response header while refusing an unknown mandatory header', async () => {
    const before = calls; mode = 'optional-header';
    expect((await post({Code: 'owned & probe'})).status).toBe(200);
    mode = 'mandatory-header'; const result = await post({Code: 'owned & probe'});
    expect(result).toEqual({status: 502, body: {kind: 'unsupported', rule: 'incoming mandatory SOAP header'}});
    expect(calls - before).toBe(2); expect(wireFailures).toEqual([]);
  });
  it('cancels owned upstream work and closes its response connection', async () => {
    mode = 'hang'; const controller = new AbortController();
    const arrived = once(lifecycle, 'arrived', {signal: AbortSignal.timeout(5000)});
    const closed = once(lifecycle, 'closed', {signal: AbortSignal.timeout(5000)});
    const pending = exchangeComponentSoap(contract, input, {Code: 'owned & probe'}, {service: name('WrapperService'), port: 'WrapperPort',
      endpoint, ca: cert, signal: controller.signal, allowEndpoint: url => url.href === endpoint}, projection);
    await arrived; controller.abort(); expect((await pending).kind).toBe('cancelled'); await closed;
    expect(wireFailures).toEqual([]); mode = 'normal';
  });
});
