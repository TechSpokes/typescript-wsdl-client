/** Independent production-only installed one-way and request-response wire checks.
 * @since 1.6.3
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {SaxesParser} from 'saxes';
import type {Socket} from 'node:net';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

await assert.rejects(readFile(process.argv[2]!), {code: 'ERR_ACCESS_DENIED'});
await assert.rejects(import('typescript'), {code: 'ERR_MODULE_NOT_FOUND'});
const version = process.argv[3];
assert.ok(version === '11' || version === '12');
const namespace = 'urn:owned:one-way', soap = version === '11' ? 'http://schemas.xmlsoap.org/soap/envelope/' : 'http://www.w3.org/2003/05/soap-envelope';
let status = 202, body: string | Buffer = '', calls = 0;
const sockets = new Set<Socket>();
const upstream = createServer(async (request, reply) => {
  let xml = ''; for await (const chunk of request) xml += String(chunk);
  const names: string[] = [], parser = new SaxesParser({xmlns: true});
  parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`)); parser.write(xml).close();
  assert.deepEqual(names, [`{${soap}}Envelope`, `{${soap}}Body`, `{${namespace}}Notice`, `{${namespace}}value`]);
  assert.match(xml, /owned &amp; installed/);
  const query = String(request.headers.soapaction ?? request.headers['content-type']).includes('query');
  const action = query ? 'query' : 'notify';
  assert.equal(request.headers.soapaction, version === '11' ? `"urn:${action}:11"` : undefined);
  assert.equal(request.headers['content-type'], version === '11' ? 'text/xml; charset=utf-8' : `application/soap+xml; charset=utf-8; action="urn:${action}:12"`);
  calls++;
  reply.writeHead(query ? 200 : status, {'x-rate': ['first', 'second'], 'set-cookie': 'PRIVATE_SENTINEL',
    ...(query || body ? {'content-type': version === '11' ? 'text/xml' : 'application/soap+xml'} : {})});
  reply.end(query ? `<s:Envelope xmlns:s="${soap}"><s:Body><t:Reply xmlns:t="${namespace}"><t:value>query response</t:value></t:Reply></s:Body></s:Envelope>` : body);
});
upstream.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
const address = upstream.address(); assert.ok(address && typeof address !== 'string');
const endpoint = `http://127.0.0.1:${address.port}/owned`;
const {buildServer} = await import(pathToFileURL(path.resolve('dist/server.js')).href);
const app = await buildServer({endpoint, allowedEndpoints: [endpoint]});
try {
  for (const code of [200, 202, 204]) {
    status = code;
    const reply = await app.inject({method: 'POST', url: '/v1/notices/Notify', payload: {value: 'owned & installed'}});
    assert.equal(reply.statusCode, 202); assert.equal(reply.body, '');
    assert.equal(reply.headers['content-type'], undefined); assert.equal(reply.headers.location, undefined);
    assert.equal(reply.headers['x-provider-status'], String(code)); assert.equal(reply.headers.ratelimit, 'first, second');
    assert.doesNotMatch(JSON.stringify(reply.headers), /PRIVATE_SENTINEL/);
  }
  status = 202; body = ' ';
  const refused = await app.inject({method: 'POST', url: '/v1/notices/Notify', payload: {value: 'owned & installed'}});
  assert.equal(refused.statusCode, 502); assert.equal(refused.json().rule, 'one-way-response-body');
  for (const encoding of ['ascii', 'utf-16le', 'utf-16be']) {
    const bytes = Buffer.from(`<?xml version="1.0" encoding="${encoding}"?><value>nonempty</value>`, encoding === 'ascii' ? 'ascii' : 'utf16le');
    body = encoding === 'utf-16be' ? bytes.swap16() : bytes;
    const encoded = await app.inject({method: 'POST', url: '/v1/notices/Notify', payload: {value: 'owned & installed'}});
    assert.equal(encoded.statusCode, 502); assert.equal(encoded.json().rule, 'one-way-response-body');
    assert.equal(encoded.json().value, undefined);
  }
  status = 500; body = version === '11'
    ? `<s:Envelope xmlns:s="${soap}"><s:Body><s:Fault><faultcode>s:Server</faultcode><faultstring>owned fault</faultstring></s:Fault></s:Body></s:Envelope>`
    : `<s:Envelope xmlns:s="${soap}"><s:Body><s:Fault><s:Code><s:Value>s:Receiver</s:Value></s:Code><s:Reason><s:Text xml:lang="en">owned fault</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>`;
  const fault = await app.inject({method: 'POST', url: '/v1/notices/Notify', payload: {value: 'owned & installed'}});
  assert.equal(fault.statusCode, 502); assert.equal(fault.json().fault.version, version === '11' ? '1.1' : '1.2');
  assert.equal(fault.headers['x-provider-status'], '500'); assert.equal(fault.json().value, undefined);
  body = body.replace('<s:Envelope ', '<s:Envelope xmlns:x="urn:extension" x:envelope="opaque" ')
    .replace('<s:Body>', `<s:Header x:header="opaque"><x:Trace s:${version === '11' ? 'actor' : 'role'}="urn:other" s:mustUnderstand="1"/></s:Header><s:Body x:body="opaque">`);
  const extendedFault = await app.inject({method: 'POST', url: '/v1/notices/Notify', payload: {value: 'owned & installed'}});
  assert.equal(extendedFault.statusCode, 502); assert.deepEqual(extendedFault.json(), fault.json());
  assert.equal(extendedFault.headers['x-provider-status'], '500'); assert.equal(extendedFault.json().value, undefined);
  body = body.replace(`s:${version === '11' ? 'actor' : 'role'}="urn:other"`, '');
  const mandatory = await app.inject({method: 'POST', url: '/v1/notices/Notify', payload: {value: 'owned & installed'}});
  assert.equal(mandatory.statusCode, 502); assert.equal(mandatory.json().kind, 'unsupported'); assert.equal(mandatory.json().rule, 'incoming mandatory SOAP header');
  const before = calls;
  assert.equal((await app.inject({method: 'POST', url: '/v1/notices/Notify', payload: {value: 42}})).statusCode, 400);
  assert.equal(calls, before);
  const ordinary = await app.inject({method: 'POST', url: '/v1/notices/Query', payload: {value: 'owned & installed'}});
  assert.equal(ordinary.statusCode, 200); assert.deepEqual(ordinary.json(), {value: 'query response'});
  assert.equal(ordinary.headers['x-provider-status'], '200'); assert.equal(ordinary.headers.ratelimit, 'first, second');
  process.stdout.write(JSON.stringify({kind: 'one-way-installed', version, calls, originalCheckoutReadable: false, productionOnly: true}) + '\n');
} finally {
  await app.close(); for (const socket of sockets) socket.destroy(); upstream.close(); await once(upstream, 'close');
}
