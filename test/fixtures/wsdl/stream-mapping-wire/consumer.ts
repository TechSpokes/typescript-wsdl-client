import assert from 'node:assert/strict';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {readFileSync} from 'node:fs';
import {createServer, type ServerResponse} from 'node:http';
import {DOMParser} from '@xmldom/xmldom';
import {checkedComponentRuntimeV3, checkedComponentStreamRuntimeV1} from '@techspokes/typescript-wsdl-client';
import {createClient, createStreamClient, Operation_0} from './client/client.js';
import {buildServer} from './server.js';

const [checkout, format, source, baseline] = process.argv.slice(2);
assert.ok(checkout && source && (format === 'ndjson' || format === 'json-array'));
assert.throws(() => readFileSync(checkout), {code: 'ERR_ACCESS_DENIED'});
assert.throws(() => readFileSync('node_modules/typescript/package.json'), {code: 'ENOENT'});
const namespace = 'urn:stream-mapping';
const soapNamespace = 'http://schemas.xmlsoap.org/soap/envelope/';
const prefix = `<soap:Envelope xmlns:soap="${soapNamespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soap:Body><ReadResponse xmlns="${namespace}">`;
const suffix = '</ReadResponse></soap:Body></soap:Envelope>';
const fragment = '<Record Enabled="1" Rank="7"><Count>42</Count><Total>12.50</Total><Large>9007199254740993</Large><Label Active="false">3.50</Label><BareLabel>4.50</BareLabel><Tag>é &amp; 茶</Tag><Nil xsi:nil="true"/><Children><Child Active="true"/></Children></Record>';
const expected: Operation_0.StreamItem = {Enabled: true, Rank: 7, Count: 42, Total: '12.5', Large: '9007199254740993',
  Label: {Active: false, $value: '3.5'}, BareLabel: {$value: '4.5'}, Tag: ['é & 茶'], Nil: {$nil: true},
  Children: {Child: [{Active: true}]}, RepeatedList: [], RepeatedInlineList: []};
const input: Operation_0.Request = {Enabled: true, Options: {Active: false}, RequestLabel: {Active: true, $value: '5.25'}};
const requestExpectations = [[soapNamespace, 'Envelope'], [soapNamespace, 'Body'], [namespace, 'Read'], [namespace, 'Options'], [namespace, 'RequestLabel']];
const observations: Array<{xml: string; action?: string; path?: string; contentType?: string; auth?: string}> = [];
let respond = (_response: ServerResponse) => {};
const upstream = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  observations.push({xml: Buffer.concat(chunks).toString(), action: request.headers.soapaction as string, path: request.url,
    contentType: request.headers['content-type'], auth: request.headers.authorization});
  response.setHeader('content-type', 'text/xml; charset=utf-8');
  respond(response);
});
let release = () => {};
let upstreamFinished = false;
function hold(tail: string) {
  upstreamFinished = false;
  const gate = new Promise<void>(resolve => {release = resolve;});
  respond = response => {
    response.write(prefix + fragment);
    void gate.then(() => {upstreamFinished = true; response.end(tail);});
  };
}
function listenUrl(address: ReturnType<typeof upstream.address>, path: string) {
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}${path}`;
}
upstream.listen(0, '127.0.0.1');
await once(upstream, 'listening');
const endpoint = listenUrl(upstream.address(), '/soap?owned=1');
const capsule = readFileSync(new URL('../client/operations/0/contract.json', import.meta.url));
const options: Operation_0.Options = {localSource: source, fileRoots: [process.cwd()], capsule, sourceResources: [], sourceOrigins: [],
  soap: {service: {namespace, local: 'StreamMapping'}, port: 'MappingPort', endpoint, allowEndpoint: url => url.href === endpoint}};
const client = createStreamClient(checkedComponentStreamRuntimeV1);
const app = await buildServer({endpoint, allowedEndpoints: [endpoint]});
try {
  hold(suffix);
  const stream = client.Read(input, options);
  const records = stream.records[Symbol.asyncIterator]();
  assert.deepEqual(JSON.parse(JSON.stringify((await records.next()).value)), expected);
  assert.equal(upstreamFinished, false);
  release();
  assert.equal((await records.next()).done, true);
  const complete = await stream.completion;
  assert.deepEqual(complete, {kind: 'complete', scope: 'full-response', records: 1});

  await app.listen({host: '127.0.0.1', port: 0});
  const send = (value: unknown) => fetch(listenUrl(app.server.address(), '/v1/mapping/Read'), {
    method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(value),
  });
  hold(suffix);
  const response = await send(input);
  assert.equal(response.status, 200);
  const media = format === 'ndjson' ? 'application/x-ndjson' : 'application/json';
  assert.ok(response.headers.get('content-type')?.startsWith(media));
  const reader = response.body!.getReader(), decoder = new TextDecoder();
  let wire = '', first: unknown;
  while (first === undefined) {
    const part = await reader.read();
    assert.equal(part.done, false);
    wire += decoder.decode(part.value, {stream: true});
    try {
      first = format === 'ndjson' ? wire.includes('\n') ? JSON.parse(wire.split('\n')[0]!) : undefined : JSON.parse(wire + ']')[0];
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  assert.deepEqual(first, expected);
  assert.equal(upstreamFinished, false);
  const firstBytes = wire;
  release();
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    wire += decoder.decode(part.value, {stream: true});
  }
  assert.equal(wire, format === 'ndjson' ? firstBytes : firstBytes + ']');

  respond = res => res.end(prefix + fragment + suffix);
  const buffered = await createClient(checkedComponentRuntimeV3).Read(input, options);
  assert.equal(buffered.kind, 'soap-response');
  assert.deepEqual(JSON.parse(JSON.stringify(buffered.value)), {Record: [expected]});
  let frozenKind: string | undefined;
  if (baseline === 'frozen') {
    const frozen = (await import(new URL('../../ndjson/dist/frozen-client/client.js', import.meta.url).href)) as {createClient: typeof createClient};
    const frozenCapsule = readFileSync(new URL('../../ndjson/frozen-client/operations/0/contract.json', import.meta.url));
    const result = await frozen.createClient(checkedComponentRuntimeV3).Read(input, {...options, capsule: frozenCapsule});
    assert.equal(result.kind, 'soap-response');
    assert.deepEqual(JSON.parse(JSON.stringify(result.value)), {Record: [expected]});
    frozenKind = result.kind;
  }
  const dispatchedBeforeControls = observations.length;
  const invalid = await send({Enabled: 'invalid'});
  assert.equal(invalid.status, 400);
  const otherFormat = format === 'ndjson' ? 'json-array' : 'ndjson';
  const otherCapsule = readFileSync(new URL(`../../${otherFormat}/client/operations/0/contract.json`, import.meta.url));
  const mixed = client.Read(input, {...options, capsule: otherCapsule});
  await assert.rejects(mixed.records[Symbol.asyncIterator]().next());
  assert.equal((await mixed.completion).kind, 'incompatible-artifact');
  const ordinary = (await import(new URL('../../ndjson/dist/buffered-client/client.js', import.meta.url).href)) as {createClient: typeof createClient};
  assert.equal((await ordinary.createClient(checkedComponentRuntimeV3).Read(input, options)).kind, 'incompatible-artifact');
  const ordinaryCapsule = readFileSync(new URL('../../ndjson/buffered-client/operations/0/contract.json', import.meta.url));
  const wrongScope = client.Read(input, {...options, capsule: ordinaryCapsule});
  await assert.rejects(wrongScope.records[Symbol.asyncIterator]().next());
  assert.equal((await wrongScope.completion).kind, 'incompatible-artifact');
  const abandoned = client.Read(input, options);
  abandoned.cancel();
  assert.equal((await abandoned.completion).kind, 'cancelled');
  assert.equal(observations.length, dispatchedBeforeControls);

  respond = res => res.end(prefix + suffix);
  const empty = await send(input);
  assert.equal(empty.status, 502);
  assert.equal((await empty.json() as {kind: string}).kind, 'mismatch');
  respond = res => res.end(prefix + fragment + '</Wrong>');
  const late = client.Read(input, options);
  const lateRecords = late.records[Symbol.asyncIterator]();
  assert.deepEqual(JSON.parse(JSON.stringify((await lateRecords.next()).value)), expected);
  await assert.rejects(lateRecords.next());
  const lateOutcome = await late.completion;
  assert.equal(lateOutcome.kind, 'xml-invalid');

  hold('</ReadResponse><soap:Fault/></soap:Body></soap:Envelope>');
  const lateHttp = await send(input);
  assert.equal(lateHttp.status, 200);
  const lateReader = lateHttp.body!.getReader();
  const retainedPrefix = await lateReader.read();
  assert.equal(retainedPrefix.done, false);
  assert.equal(upstreamFinished, false);
  release();
  await assert.rejects(async () => {
    for (;;) if ((await lateReader.read()).done) return;
  });

  const reset = new Promise<void>(resolve => {release = resolve;});
  respond = res => {
    const completeXml = prefix + fragment + suffix;
    res.setHeader('content-length', Buffer.byteLength(completeXml) + 1);
    res.write(completeXml);
    void reset.then(() => res.socket?.destroy());
  };
  const truncated = client.Read(input, options), incomplete = truncated.records[Symbol.asyncIterator]();
  assert.equal((await incomplete.next()).done, false);
  release();
  await assert.rejects(incomplete.next());
  const truncatedOutcome = await truncated.completion;
  assert.equal(truncatedOutcome.kind, 'transport');

  let opened = () => {}, closed = () => {};
  const inFlight = new Promise<void>(resolve => {opened = resolve;});
  const socketClosed = new Promise<void>(resolve => {closed = resolve;});
  respond = res => {res.once('close', closed); res.write(prefix); opened();};
  const pending = client.Read(input, options);
  const rejection = assert.rejects(pending.records[Symbol.asyncIterator]().next());
  await inFlight;
  pending.cancel();
  await rejection;
  await socketClosed;
  const cancelledOutcome = await pending.completion;
  assert.equal(cancelledOutcome.kind, 'cancelled');

  const chunk = fragment.replace('é &amp; 茶', 'x'.repeat(256 * 1024));
  const chunkBytes = Buffer.byteLength(chunk);
  const plannedRecords = 512;
  let offered = 0, peakQueuedBytes = 0;
  let finishProducer!: () => void;
  const producerFinished = new Promise<void>(resolve => {finishProducer = resolve;});
  let startProducer!: () => void;
  const producerGate = new Promise<void>(resolve => {startProducer = resolve;});
  respond = res => {
    const disconnected = new AbortController();
    res.once('close', () => disconnected.abort());
    res.write(prefix + fragment);
    void (async () => {
      try {
        await producerGate;
        while (offered < plannedRecords && !disconnected.signal.aborted) {
          offered++;
          const ready = res.write(chunk);
          peakQueuedBytes = Math.max(peakQueuedBytes, res.writableLength);
          if (!ready) await once(res, 'drain', {signal: disconnected.signal});
        }
        if (!disconnected.signal.aborted) res.end(suffix);
      } catch (error) {
        if (!disconnected.signal.aborted) res.destroy(error instanceof Error ? error : undefined);
      } finally {
        finishProducer();
      }
    })();
  };
  const stalled = client.Read(input, {...options, soap: {...options.soap, timeoutMs: 30_000,
    limits: {maxRecordBytes: 4 * 1024 * 1024, maxRetainedBytes: 8 * 1024 * 1024, maxDepth: 32}}});
  assert.equal((await stalled.records[Symbol.asyncIterator]().next()).done, false);
  startProducer();
  await delay(125);
  let offeredAtPause = 0;
  for (let sample = 0; sample < 8; sample++) {
    offeredAtPause = offered;
    await delay(125);
    if (offeredAtPause > 0 && offered === offeredAtPause) break;
  }
  assert.ok(offeredAtPause > 0 && offeredAtPause < plannedRecords);
  assert.equal(offered, offeredAtPause);
  assert.ok(peakQueuedBytes <= chunkBytes + 512);
  stalled.cancel();
  await producerFinished;
  assert.equal((await stalled.completion).kind, 'cancelled');
  const backpressure = {offeredAtPause, plannedRecords, chunkBytes, peakQueuedBytes, stableWhilePaused: true, producerReleased: true};

  for (const observation of observations) {
    const dom = new DOMParser().parseFromString(observation.xml, 'text/xml');
    const elements = Array.from({length: dom.getElementsByTagName('*').length}, (_, index) => dom.getElementsByTagName('*').item(index)!);
    assert.deepEqual(elements.map(element => [element.namespaceURI, element.localName]), requestExpectations);
    assert.equal(elements[2]!.getAttribute('Enabled'), 'true');
    assert.equal(elements[3]!.getAttribute('Active'), 'false');
    assert.equal(elements[4]!.getAttribute('Active'), 'true');
    assert.equal(elements[4]!.textContent, '5.25');
    assert.equal(observation.action, '"urn:stream-mapping:read"');
    assert.equal(observation.path, '/soap?owned=1');
    assert.equal(observation.contentType, 'text/xml; charset=utf-8');
    assert.equal(observation.auth, undefined);
  }
  console.log(JSON.stringify({format, originalCheckoutReadable: false, complete, lateOutcome, truncatedOutcome, cancelledOutcome, lateHttpAborted: true, backpressure,
    firstBeforeUpstreamRelease: true, firstBytes, wire, dispatches: observations.length, rejectedDispatches: 0,
    invalidHttp: invalid.status, emptyReadHttp: empty.status, frozenKind, requests: observations}));
} finally {
  release();
  app.server.closeAllConnections();
  await app.close();
  upstream.closeAllConnections();
  await new Promise<void>(resolve => upstream.close(() => resolve()));
}
