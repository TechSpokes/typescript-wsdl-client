/** Independent XML and serialized HTTP evidence from relocated installed generated gateways.
 * @since 1.5.0
 */
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Socket} from 'node:net';
import type {FastifyInstance} from 'fastify';

const root = process.cwd();
await assert.rejects(readFile(process.argv[2]!), {code: 'ERR_ACCESS_DENIED'});
for (const file of ['inputs', 'string.json', 'layout.json']) await assert.rejects(stat(path.join(root, file)), {code: 'ENOENT'});
const modules = await Promise.all(['original', 'string', 'layout'].map(async mode => {
  const host = await import(pathToFileURL(path.join(root, mode, 'dist/server.js')).href) as {buildServer(options: object): Promise<FastifyInstance>};
  return {mode, host};
}));
const namespace = 'urn:owned:type-corrections';
let stamp = '2026-01-02T03:04:05Z', embed = '&lt;iframe src="https://example.test/payload-secret"/&gt;', extra = '';
let malformed = false;
const observed: {action: string; xml: string}[] = [], sockets = new Set<Socket>();
const upstream = createServer(async (request, response) => {
  let xml = ''; for await (const chunk of request) xml += String(chunk);
  observed.push({action: String(request.headers.soapaction), xml});
  response.writeHead(200, {'Content-Type': 'text/xml'});
  if (malformed) {response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><unknown-secret>'); return;}
  response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>'
    + `<FetchResponse xmlns="${namespace}" Stamp="${stamp}"><Embed>${embed}</Embed>${extra}</FetchResponse></s:Body></s:Envelope>`);
});
upstream.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
const apps: FastifyInstance[] = [];
try {
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const address = upstream.address(); assert.ok(address && typeof address !== 'string');
  const endpoint = `http://127.0.0.1:${address.port}/owned-content/endpoint-secret`;
  for (const {host} of modules) apps.push(await host.buildServer({endpoint, allowedEndpoints: [endpoint]}));
  const post = (index: number) => apps[index]!.inject({method: 'POST', url: '/v1/content/Fetch', payload: {Code: 'owned-request'}});
  const safeFailure = (body: string, withDiagnostic = true) => {
    assert.doesNotMatch(body, /payload-secret|iframe|nonsense-secret|unknown-secret|endpoint-secret|caller-secret|file:\/\/|inputs[\\/]|Error:|stack/);
    if (withDiagnostic) assert.match(body, /diagnostic/);
  };
  const uriFailure = await post(0); assert.equal(uriFailure.statusCode, 502, uriFailure.body); safeFailure(uriFailure.body);
  embed = 'https://example.test/valid'; stamp = '2026-01-02 03:04:05Z';
  const timeFailure = await post(0); assert.equal(timeFailure.statusCode, 502, timeFailure.body); safeFailure(timeFailure.body);
  embed = '&lt;iframe src="https://example.test/payload-secret"/&gt;';
  for (const index of [1, 2]) {
    const good = await post(index); assert.equal(good.statusCode, 200, good.body);
    assert.deepEqual(good.json(), {Stamp: stamp, Embed: '<iframe src="https://example.test/payload-secret"/>'});
  }
  stamp = 'nonsense-secret';
  const weakened = await post(1); assert.equal(weakened.statusCode, 200, weakened.body);
  assert.equal(weakened.json().Stamp, 'nonsense-secret');
  const layout = await post(2); assert.equal(layout.statusCode, 502, layout.body); safeFailure(layout.body);
  stamp = '2026-01-02 03:04:05Z'; extra = '<unknown-secret>caller-secret</unknown-secret>';
  const unknown = await post(1); assert.equal(unknown.statusCode, 502, unknown.body); safeFailure(unknown.body);
  malformed = true;
  const broken = await post(1); assert.equal(broken.statusCode, 502, broken.body); safeFailure(broken.body, false);
  for (const request of observed) {
    assert.equal(request.action, '"urn:owned:type-corrections:fetch"');
    assert.match(request.xml, /owned-request/); assert.doesNotMatch(request.xml, /Embed|Stamp|payload-secret/);
  }
  process.stdout.write(JSON.stringify({kind: 'scoped-maintenance-installed', originalRejected: true, correctedAccepted: true,
    unknownRejected: true, layoutRejectedNonsense: true, offline: true, soapCalls: observed.length}) + '\n');
} finally {
  for (const app of apps) await app.close();
  for (const socket of sockets) socket.destroy();
  if (upstream.listening) {const closed = once(upstream, 'close'); upstream.close(); await closed;}
}
