/** Independent local-intake wire oracle, executed outside the checkout.
 * @since Unreleased
 */
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {spawn, type ChildProcess} from 'node:child_process';
import {createServer} from 'node:https';
import {once} from 'node:events';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Socket} from 'node:net';
import {SaxesParser} from 'saxes';

const root = process.cwd();
await assert.rejects(readFile(process.argv[2]!), {code: 'ERR_ACCESS_DENIED'});
const cert = await readFile('test-cert.pem'), key = await readFile('test-key.pem');
let calls = 0;
const requests: {action: string | undefined; names: string[]; texts: string[]}[] = [], sockets = new Set<Socket>();
const upstream = createServer({cert, key}, async (request, response) => {
  let xml = ''; for await (const chunk of request) xml += String(chunk); calls++;
  const names: string[] = [], texts: string[] = [];
  const parser = new SaxesParser({xmlns: true});
  parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`));
  parser.on('text', text => {if (text.trim()) texts.push(text);});
  parser.write(xml).close();
  requests.push({action: request.headers.soapaction as string | undefined, names, texts});
  response.writeHead(200, {'Content-Type': 'text/xml; charset=utf-8'});
  response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><r:SubmitImportedResponse xmlns:r="urn:conformance:import-relative-types"><r:accepted>1</r:accepted></r:SubmitImportedResponse></s:Body></s:Envelope>');
});
upstream.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
let child: ChildProcess | undefined;
try {
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const address = upstream.address(); assert.ok(address && typeof address !== 'string');
  const endpoint = `https://127.0.0.1:${address.port}/owned-import`;
  const example = JSON.parse(await readFile('checked-gateway.example.json', 'utf8')) as Record<string, unknown>;
  await writeFile('runtime.json', JSON.stringify({...example, endpoint, allowedEndpoints: [endpoint], caFile: './test-cert.pem', host: '127.0.0.1', port: 0}));
  const network = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net'] : [];
  child = spawn(process.execPath, ['--permission', ...network, '--allow-fs-read=' + root,
    '--import', pathToFileURL(path.join(root, 'parent-guard.ts')).href, path.join(root, 'dist/server.js')],
  {cwd: root, env: {...process.env, CHECKED_GATEWAY_CONFIG: path.join(root, 'runtime.json')}, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  const current = child;
  const url = await new Promise<string>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Owned gateway readiness watchdog')), 30_000);
    const data = (chunk: Buffer) => {
      output += String(chunk); const match = /CHECKED_GATEWAY_LISTENING\s+(http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (match) {clearTimeout(timer); resolve(match[1]!);}
    };
    current.stdout!.on('data', data); current.stderr!.on('data', data);
    current.once('error', error => {clearTimeout(timer); reject(error);});
    current.once('exit', code => {clearTimeout(timer); reject(new Error(`Owned gateway exited ${code}: ${output}`));});
  });
  const post = (value: unknown) => fetch(url + '/v1/import/SubmitImported', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)});
  assert.equal((await fetch(url + '/health')).status, 200);
  const response = await post({payload: {name: 'owned & independent'}});
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), {accepted: true});
  assert.deepEqual(requests, [{action: '"urn:SubmitImported"', names: [
    '{http://schemas.xmlsoap.org/soap/envelope/}Envelope', '{http://schemas.xmlsoap.org/soap/envelope/}Body',
    '{urn:conformance:import-relative-types}SubmitImported', '{urn:conformance:import-relative-types}payload',
    '{urn:conformance:import-relative-types:types}name'], texts: ['owned & independent']}]);
  assert.equal((await post({payload: {name: 7}})).status, 400); assert.equal(calls, 1);
  process.stdout.write(JSON.stringify({kind: 'wsdl-first-installed-wire', checkoutReadable: false, operations: 1, exchanges: calls,
    invalidHttpRejected: true, verifiedTls: true, selection: example.service, port: example.servicePort}) + '\n');
} finally {
  if (child && child.exitCode === null) {const stopped = once(child, 'exit'); child.kill(); await stopped;}
  for (const socket of sockets) socket.destroy();
  if (upstream.listening) {const closed = once(upstream, 'close'); upstream.close(); await closed;}
}
