/**
 * Executes independent wire oracles with filesystem access restricted to the installed consumer.
 * @since 1.1.6
 */
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {spawn, type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {SaxesParser} from 'saxes';
import Fastify, {type FastifyInstance} from 'fastify';

const root = process.cwd();
await assert.rejects(readFile(process.argv[2]!), {code: 'ERR_ACCESS_DENIED'});
const requestOracle = await readFile('request.xml', 'utf8');
const normal = await readFile('response.xml', 'utf8');
const fault = await readFile('fault.xml', 'utf8');
const expected = JSON.parse(await readFile('expectations.json', 'utf8')) as {
  request: {city: string; days: number}; response: {city: string; temperature: number[]; complete: boolean};
  fault: {name: string; soap11: {faultcode: string; faultstring: string}; detail: {code: string; message: string}};
};
const events = (xml: string) => {
  const names: string[] = [], texts: string[] = [];
  const parser = new SaxesParser({xmlns: true});
  parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`));
  parser.on('text', text => {if (text.trim()) texts.push(text);});
  parser.write(xml).close();
  return {names, texts};
};
let reply = normal, replyStatus = 200, hang = false;
let hangingClosed: Promise<void> | undefined;
const upstream: {xml: string; action: string | undefined; contentType: string | undefined;
  method: string | undefined; path: string | undefined}[] = [];
const soap = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    upstream.push({xml: Buffer.concat(chunks).toString(), action: req.headers.soapaction as string | undefined,
      contentType: req.headers['content-type'], method: req.method, path: req.url});
    if (hang) {
      hangingClosed = new Promise<void>(resolve => {res.socket!.once('close', () => resolve());});
      return;
    }
    res.writeHead(replyStatus, {'Content-Type': 'text/xml; charset=utf-8'}); res.end(reply);
  });
});
soap.listen(0, '127.0.0.1'); await once(soap, 'listening');
const address = soap.address(); assert.ok(address && typeof address !== 'string');
const endpoint = `http://127.0.0.1:${address.port}/owned-forecast`;
const source = path.join(root, 'client/source.wsdl');
const config = {localSource: source, fileRoots: [path.dirname(source)], endpoint, allowedEndpoints: [endpoint],
  host: '127.0.0.1', port: 0};
let child: ChildProcess | undefined;
let runtimeLog = '';
const stop = async () => {
  if (!child) return;
  const current = child; child = undefined;
  if (current.exitCode !== null) return;
  const closed = once(current, 'exit'); current.kill();
  await closed;
};
const start = async (overrides: Record<string, unknown> = {}): Promise<string> => {
  await stop();
  const configFile = path.join(root, 'runtime.json');
  await writeFile(configFile, JSON.stringify({...config, ...overrides}));
  const networkPermission = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net=127.0.0.1'] : [];
  child = spawn(process.execPath, ['--permission', ...networkPermission, '--allow-fs-read=' + root,
    path.join(root, 'dist/server.js')], {cwd: root, env: {...process.env, CHECKED_GATEWAY_CONFIG: configFile},
  stdio: ['ignore', 'pipe', 'pipe']});
  const current = child;
  return await new Promise<string>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Gateway readiness timeout: ' + output)), 30_000);
    const data = (chunk: Buffer) => {
      output += chunk.toString(); runtimeLog += chunk.toString();
      const match = /CHECKED_GATEWAY_LISTENING\s+(http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (match) {clearTimeout(timer); resolve(match[1]!);}
    };
    current.stdout!.on('data', data); current.stderr!.on('data', data);
    current.once('error', error => {clearTimeout(timer); reject(error);});
    current.once('exit', code => {clearTimeout(timer); reject(new Error(`Gateway exited ${code}: ${output}`));});
  });
};
const route = '/v1/forecast/GetForecast';
let calls = 0, refusals = 0;
try {
  let url = await start();
  const post = async (value: unknown) => {
    const response = await fetch(url + route, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(value)});
    calls++;
    return {status: response.status, value: await response.json() as unknown};
  };
  const mode = process.argv[3];
  if (mode === 'optional' || mode === 'scalar') {
    const input = mode === 'scalar' ? true : {days: [2, 3]};
    reply = mode === 'scalar' ? normal.replace(/<t:city>.*?<\/t:complete>/, '42') : normal;
    assert.deepEqual(await post(input), {status: 200, value: mode === 'scalar' ? 42 : expected.response});
    const names = ['{http://schemas.xmlsoap.org/soap/envelope/}Envelope',
      '{http://schemas.xmlsoap.org/soap/envelope/}Body', '{urn:checked:forecast}GetForecast'];
    assert.deepEqual(events(upstream[0]!.xml), mode === 'scalar'
      ? {names, texts: ['true']}
      : {names: [...names, '{urn:checked:forecast}days', '{urn:checked:forecast}days'], texts: ['2', '3']});
    assert.equal(upstream[0]!.action, '"urn:checked:GetForecast"');
    for (const invalid of mode === 'scalar' ? [1, 'true', {}, null] : [{days: []}, {days: [2, '3']}, {days: 2}]) {
      const before: number = upstream.length;
      assert.equal((await post(invalid)).status, 400); assert.equal(upstream.length, before); refusals++;
    }
    process.stdout.write(JSON.stringify({kind: 'checked-gateway-installed', originalCheckoutReadable: false,
      variant: mode, calls, refusals, upstreamRequests: upstream.length}) + '\n');
  } else {
  const health = await fetch(url + '/health'); assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {status: 'ok'});
  const openapi = await fetch(url + '/openapi.json'); assert.equal(openapi.status, 200);
  const spec = await openapi.json() as {openapi: string; paths: Record<string, unknown>};
  assert.equal(spec.openapi, '3.1.1'); assert.ok(Object.hasOwn(spec.paths, route));
  assert.deepEqual(await post(expected.request), {status: 200, value: expected.response});
  assert.equal(upstream.length, 1);
  assert.deepEqual(events(upstream[0]!.xml), events(requestOracle));
  assert.equal(upstream[0]!.action, '"urn:checked:GetForecast"');
  assert.equal(upstream[0]!.contentType, 'text/xml; charset=utf-8');
  assert.equal(upstream[0]!.method, 'POST'); assert.equal(upstream[0]!.path, '/owned-forecast');
  for (const value of [{city: 'Paris', days: '2'}, {city: 'Paris'}, {city: 'Paris', days: 2, extra: true},
    {city: 7, days: 2}, {city: 'Paris', days: 2147483648}, {city: 'Paris', days: 1.5},
    null, [], {city: 'Paris', days: false}]) {
    const before: number = upstream.length;
    assert.equal((await post(value)).status, 400);
    assert.equal(upstream.length, before, 'Invalid HTTP values must never reach SOAP'); refusals++;
  }
  for (const temperature of [[], [18], [-2147483648, 2147483647]]) {
    reply = normal.replace('<t:temperature>18</t:temperature><t:temperature>-2</t:temperature>',
      temperature.map(value => `<t:temperature>${value}</t:temperature>`).join(''));
    assert.deepEqual(await post(expected.request), {status: 200, value: {...expected.response, temperature}});
  }
  reply = fault; replyStatus = 500;
  const declared = await post(expected.request);
  assert.equal(declared.status, 502);
  assert.deepEqual((declared.value as {value: unknown}).value,
    {code: expected.fault.detail.code, message: expected.fault.detail.message}, JSON.stringify(declared));
  assert.equal((declared.value as {fault: {name: string}}).fault.name, expected.fault.name);
  const publicFault = (declared.value as {fault: {name: string; code: {namespace: string; local: string}; string: string}}).fault;
  assert.equal(`{${publicFault.code.namespace}}${publicFault.code.local}`, expected.fault.soap11.faultcode);
  assert.equal(publicFault.string, expected.fault.soap11.faultstring);
  assert.deepEqual(Object.keys(publicFault).sort(), ['code', 'name', 'string']);
  replyStatus = 200;
  for (const invalid of [normal.replace('>true<', '>yes<'), normal.replace('>18<', '>2147483648<'),
    normal.replace('>18<', '>1.5<'), normal.replace('<t:complete>true</t:complete>', ''),
    normal.replace('urn:checked:forecast', 'urn:wrong'),
    normal.replace('<t:city>Paris</t:city>', '<t:unknown>Paris</t:unknown>'),
    normal.replace('<t:temperature>-2</t:temperature>', '<t:temperature>-2</t:temperature><t:city>again</t:city>'),
    normal.slice(0, -20)]) {
    reply = invalid;
    const outcome = await post(expected.request);
    assert.ok(outcome.status >= 400, JSON.stringify(outcome)); refusals++;
  }
  reply = normal;
  const beforeCancel = upstream.length;
  hang = true;
  const abort = new AbortController();
  const pending = fetch(url + route, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(expected.request), signal: abort.signal});
  for (let attempt = 0; attempt < 500 && upstream.length === beforeCancel; attempt++) {
    await new Promise<void>(resolve => {setTimeout(resolve, 10);});
  }
  assert.equal(upstream.length, beforeCancel + 1, 'SOAP call must start before cancellation');
  abort.abort(); await assert.rejects(pending);
  assert.ok(hangingClosed);
  let cancellationTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([hangingClosed, new Promise<never>((_, reject) => {
      cancellationTimer = setTimeout(() => reject(new Error('HTTP cancellation did not close upstream SOAP')), 10_000);
    })]);
  } finally {clearTimeout(cancellationTimer);}
  hang = false;
  let before: number = upstream.length;
  url = await start({capabilities: ['authentication']});
  const unsupportedCapability = await post(expected.request);
  assert.equal(unsupportedCapability.status, 502);
  assert.deepEqual(unsupportedCapability.value, {kind: 'unsupported', rule: 'SOAP capability'});
  assert.equal(upstream.length, before); refusals++;
  await assert.rejects(start({authentication: true}), /Unsupported checked gateway configuration field/);
  assert.equal(upstream.length, before); refusals++;
  url = await start({limits: {maxBytes: 1}});
  const explicitLimit = await post(expected.request);
  assert.equal(explicitLimit.status, 502);
  assert.equal((explicitLimit.value as {kind: string}).kind, 'resource-limit');
  assert.equal(upstream.length, before); refusals++;
  url = await start({timeoutMs: 1000});
  hang = true;
  const explicitTimeout = await post(expected.request);
  assert.equal(explicitTimeout.status, 502);
  assert.equal((explicitTimeout.value as {kind: string}).kind, 'transport');
  assert.equal(upstream.length, before + 1, 'Explicit timeout must terminate the started SOAP request'); refusals++;
  hang = false;
  before = upstream.length;
  url = await start({allowedEndpoints: []});
  assert.ok((await post(expected.request)).status >= 400);
  assert.equal(upstream.length, before); refusals++;
  url = await start({fileRoots: [path.join(root, 'test')]});
  assert.ok((await post(expected.request)).status >= 400);
  assert.equal(upstream.length, before); refusals++;
  const originalSource = await readFile(source);
  await writeFile(source, Buffer.concat([originalSource, Buffer.from('\n<!-- changed actual source -->\n')]));
  url = await start();
  assert.ok((await post(expected.request)).status >= 400);
  assert.equal(upstream.length, before); refusals++;
  await writeFile(source, originalSource);
  const capsuleFile = path.join(root, 'client/contract.json');
  const originalCapsule = await readFile(capsuleFile);
  await writeFile(capsuleFile, '{}');
  url = await start();
  assert.ok((await post(expected.request)).status >= 400);
  assert.equal(upstream.length, before); refusals++;
  await writeFile(capsuleFile, originalCapsule);
  const openapiFile = path.join(root, 'openapi.json');
  const originalOpenapi = await readFile(openapiFile, 'utf8');
  await writeFile(openapiFile, JSON.stringify({...JSON.parse(originalOpenapi) as object, 'x-stale': true}));
  await assert.rejects(start(), /mixed checked OpenAPI/);
  assert.equal(upstream.length, before); refusals++;
  await writeFile(openapiFile, originalOpenapi);
  await stop();
  const serverModule = await import(pathToFileURL(path.join(root, 'dist/server.js')).href) as {
    buildServer(options: typeof config & {signal: AbortSignal}): Promise<FastifyInstance>;
  };
  const cancelledApp = await serverModule.buildServer({...config, signal: AbortSignal.abort()});
  try {
    const cancelled = await cancelledApp.inject({method: 'POST', url: route, payload: expected.request});
    assert.equal(cancelled.statusCode, 499);
    assert.equal(cancelled.json<{kind: string}>().kind, 'cancelled');
    assert.equal(upstream.length, before); refusals++;
  } finally {await cancelledApp.close();}
  // Fastify's host policy is a control; installing checked routes must not replace it.
  const host = Fastify();
  host.post('/host', {schema: {body: {type: 'object', additionalProperties: false,
    properties: {count: {type: 'integer'}, label: {type: 'string', default: 'host'}}, required: ['count']}}},
  async (request, reply) => reply.type('application/json').send(request.body));
  const plugin = await import(pathToFileURL(path.join(root, 'dist/gateway/plugin.js')).href) as {default: Parameters<typeof host.register>[0]};
  const selectionModule = await import(pathToFileURL(path.join(root, 'dist/client/client.js')).href) as {selection: string};
  const selection = JSON.parse(selectionModule.selection) as {service: {namespace: string; local: string}; port: string};
  await host.register(plugin.default, {clientOptions: {localSource: source, fileRoots: config.fileRoots,
    capsule: originalCapsule, soap: {service: selection.service, port: selection.port,
      endpoint, allowEndpoint: (candidate: URL) => candidate.href === endpoint}}});
  const control = await host.inject({method: 'POST', url: '/host', payload: {count: '3', extra: true}});
  assert.equal(control.statusCode, 200); assert.deepEqual(control.json(), {count: 3, label: 'host'});
  before = upstream.length;
  const rejected = await host.inject({method: 'POST', url: route, payload: {city: 'Paris', days: '2', extra: true}});
  assert.equal(rejected.statusCode, 400); assert.equal(upstream.length, before); refusals++;
  await host.close();
  await writeFile('server.log', runtimeLog);
  process.stdout.write(JSON.stringify({kind: 'checked-gateway-installed', originalCheckoutReadable: false,
    calls, refusals, upstreamRequests: upstream.length, selected: 'ForecastService/ForecastPort/ForecastBinding/GetForecast',
    scope: 'synthetic direct string/int32/Boolean flat SOAP 1.1 owned loopback only'}) + '\n');
  }
} finally {
  await stop(); soap.closeAllConnections();
  await new Promise<void>((resolve, reject) => soap.close(error => error ? reject(error) : resolve()));
}
