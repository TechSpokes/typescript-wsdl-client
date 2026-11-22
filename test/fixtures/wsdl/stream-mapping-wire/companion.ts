import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {createServer, type ServerResponse} from 'node:http';
import {buildServer} from './server.js';

const checkout = process.argv[2]!;
assert.throws(() => readFileSync(checkout), {code: 'ERR_ACCESS_DENIED'});
const envelope = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns="urn:owned:wrapper"><s:Body><Envelope>';
const schema = '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="Owned" type="xs:string"/></xs:schema>';
const wrapper = envelope + schema + '<Envelope Stamp="owned"><Records>';
const record = '<Record Code="A"><Name>é</Name><Active>true</Active><Quantity>9</Quantity></Record>';
const suffix = '</Records></Envelope></Envelope></s:Body></s:Envelope>';
const receipts: {action: unknown; body: string}[] = [];
let respond = (reply: ServerResponse) => reply.end(wrapper + suffix);
const soap = createServer(async (request, reply) => {
  const fragments: Buffer[] = [];
  for await (const chunk of request) fragments.push(chunk as Buffer);
  receipts.push({action: request.headers.soapaction, body: Buffer.concat(fragments).toString()});
  reply.setHeader('content-type', 'text/xml');
  respond(reply);
});
soap.listen(0, '127.0.0.1');
await once(soap, 'listening');
const soapAddress = soap.address();
assert.ok(soapAddress && typeof soapAddress !== 'string');
const endpoint = `http://127.0.0.1:${soapAddress.port}/owned`;
const app = await buildServer({endpoint, allowedEndpoints: [endpoint]});
let release = () => {};
try {
  await app.listen({host: '127.0.0.1', port: 0});
  const httpAddress = app.server.address();
  assert.ok(httpAddress && typeof httpAddress !== 'string');
  const url = `http://127.0.0.1:${httpAddress.port}/v1/mapping/Fetch`;
  const send = () => fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{"Code":"A"}'});
  const gate = new Promise<void>(resolve => {release = resolve;});
  let finished = false;
  respond = reply => {
    reply.write(wrapper + record);
    void gate.then(() => {finished = true; reply.end(suffix);});
    return reply;
  };
  const response = await send();
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let item = '';
  while (!item.includes('\n')) {
    const next = await reader.read();
    assert.equal(next.done, false);
    item += decoder.decode(next.value, {stream: true});
  }
  assert.deepEqual(JSON.parse(item), {Code: 'A', Name: 'é', Active: true, Quantity: 9});
  assert.equal(finished, false);
  release();
  assert.equal((await reader.read()).done, true);
  respond = reply => reply.end(wrapper + suffix);
  const empty = await send();
  assert.equal(empty.status, 200);
  assert.equal(await empty.text(), '');
  respond = reply => reply.end(envelope + schema + '<Other><Records>' + record + '</Records></Other></Envelope></s:Body></s:Envelope>');
  const wrong = await send();
  assert.equal(wrong.status, 502);
  const failure = await wrong.json() as {kind: string; rule: string};
  assert.equal(failure.kind, 'mismatch');
  assert.ok(receipts.every(receipt => receipt.action === '"urn:owned:wrapper:fetch"'));
  console.log(JSON.stringify({format: 'ndjson', scope: 'records-with-declared-wrapper-scope', originalCheckoutReadable: false,
    firstBeforeUpstreamRelease: true, item, cleanEof: true, emptyHttp: empty.status, wrongWrapperHttp: wrong.status, failure, dispatches: receipts.length, requests: receipts}));
} finally {
  release();
  app.server.closeAllConnections();
  await app.close();
  soap.closeAllConnections();
  await new Promise<void>(resolve => soap.close(() => resolve()));
}
