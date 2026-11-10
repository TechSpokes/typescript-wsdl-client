/** Independent completed-wrapper wire evidence, run using separately installed generated apps.
 * @since Unreleased
 */
import assert from 'node:assert/strict';
import {readFile, stat, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Socket} from 'node:net';
import type {FastifyInstance} from 'fastify';

const root = process.cwd();
await assert.rejects(readFile(process.argv[2]!), {code: 'ERR_ACCESS_DENIED'});
await assert.rejects(stat(path.join(root, 'recipe.json')), {code: 'ENOENT'});
await assert.rejects(stat(path.join(root, 'inputs')), {code: 'ENOENT'});
const original = await import(pathToFileURL(path.join(root, 'original/dist/server.js')).href) as {buildServer(options: object): Promise<FastifyInstance>};
const completed = await import(pathToFileURL(path.join(root, 'completed/dist/server.js')).href) as {buildServer(options: object): Promise<FastifyInstance>};
let calls = 0, includeMetadata = false;
const observed: {action: string; xml: string}[] = [], sockets = new Set<Socket>();
const upstream = createServer(async (request, response) => {
  let xml = ''; for await (const chunk of request) xml += String(chunk); calls++;
  observed.push({action: String(request.headers.soapaction), xml});
  response.writeHead(200, {'Content-Type': 'text/xml'});
  // @constraints Response literals are independent of generated schemas and the correction engine.
  response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Envelope xmlns="urn:owned:wrapper">'
    + (includeMetadata ? '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>' : '')
    + '<Envelope Stamp="owned"><Records><Record Code="0007"><Name>Installed &amp; corrected</Name><Active>true</Active><Quantity>2</Quantity><CorrectionCode>preserved</CorrectionCode></Record>'
    + '<Record Code="0008"><Name>Second record</Name><Active>false</Active><Quantity>0</Quantity><CorrectionCode>preserved-second</CorrectionCode></Record></Records></Envelope>'
    + '</Envelope></s:Body></s:Envelope>');
});
upstream.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
let originalApp: FastifyInstance | undefined, completedApp: FastifyInstance | undefined;
try {
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const address = upstream.address(); assert.ok(address && typeof address !== 'string');
  const endpoint = `http://127.0.0.1:${address.port}/owned-wrapper`;
  const config = {endpoint, allowedEndpoints: [endpoint]};
  originalApp = await original.buildServer(config); completedApp = await completed.buildServer(config);
  const post = (app: FastifyInstance, payload: unknown = {Code: 'owned request'}) => app.inject({method: 'POST', url: '/v1/wrapper/Fetch', payload: payload as object});
  const originalAbsent = await post(originalApp);
  assert.equal(originalAbsent.statusCode, 502, originalAbsent.body);
  assert.equal(calls, 1);
  const completedAbsent = await post(completedApp);
  assert.equal(completedAbsent.statusCode, 200, completedAbsent.body);
  const expected = {Stamp: 'owned', Records: {Record: [
    {Code: '0007', Name: 'Installed & corrected', Active: true, Quantity: 2, CorrectionCode: 'preserved'},
    {Code: '0008', Name: 'Second record', Active: false, Quantity: 0, CorrectionCode: 'preserved-second'},
  ]}};
  assert.deepEqual(completedAbsent.json(), expected); assert.equal(calls, 2);
  includeMetadata = true;
  const completedPresent = await post(completedApp);
  assert.equal(completedPresent.statusCode, 200, completedPresent.body); assert.deepEqual(completedPresent.json(), expected);
  const originalPresent = await post(originalApp);
  assert.equal(originalPresent.statusCode, 502, originalPresent.body); assert.equal(calls, 4);
  assert.equal((await post(completedApp, {Code: 7})).statusCode, 400); assert.equal(calls, 4);
  assert.deepEqual(observed.map(entry => entry.action), Array(4).fill('"urn:owned:wrapper:fetch"'));
  for (const request of observed) {assert.match(request.xml, /owned request/); assert.doesNotMatch(request.xml, /CorrectionCode/);}
  await completedApp.close(); completedApp = undefined;
  const recordFile = path.join(root, 'completed/client/source-resources.json');
  const records = JSON.parse(await readFile(recordFile, 'utf8')) as {resources: {file: string}[]; runtime: Record<string, unknown>};
  assert.ok(!Object.hasOwn(records.runtime, 'sourceCorrectionsFile'));
  const file = path.resolve(path.dirname(recordFile), records.resources[0]!.file), bytes = await readFile(file);
  await writeFile(file, Buffer.concat([bytes, Buffer.from('\n')]));
  await assert.rejects(completed.buildServer(config), /stale|digest|source|snapshot/i); assert.equal(calls, 4);
  process.stdout.write(JSON.stringify({kind: 'completed-wrapper-installed', checkoutReadable: false, recipePresent: false,
    originalSourcePresent: false, successfulCorrectedCalls: 2, originalRejections: 2, soapCalls: calls, tamperRejectedBeforeIo: true}) + '\n');
} finally {
  await originalApp?.close(); await completedApp?.close();
  for (const socket of sockets) socket.destroy();
  if (upstream.listening) {const closed = once(upstream, 'close'); upstream.close(); await closed;}
}
