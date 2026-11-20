import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile, rename, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {SaxesParser} from 'saxes';
import {checkedComponentRuntimeV3} from '@techspokes/typescript-wsdl-client';
import {createClient, type Operation_0} from './.client/client.js';
import {buildServer} from './server.js';

await assert.rejects(readFile(process.argv[2]!), {code: 'ERR_ACCESS_DENIED'});
const owner = new URL('../.client/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('source-resources.json', owner), 'utf8')) as {
  version: string;
  runtime: {localSource: string; fileRoots: string[]; capsuleFiles: Record<string, string>;
    sourceResources: {uri: string; file: string}[]; sourceOrigins: string[]};
};
assert.equal(manifest.version, 'checked-source-resources-v2');
const runtime = manifest.runtime;
const localFile = (file: string) => fileURLToPath(new URL(file, owner));
assert.equal(runtime.sourceResources.length, 1);
const capsule = await readFile(localFile(runtime.capsuleFiles.GetForecast!));
const foreignCapsule = await readFile('other-contract.json');
assert.notDeepEqual(foreignCapsule, capsule);

const xmlEvents = (xml: string) => {
  const names: string[] = [], values: string[] = [];
  const parser = new SaxesParser({xmlns: true});
  parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`));
  parser.on('text', text => {if (text.trim()) values.push(text);});
  parser.write(xml).close();
  return {names, values};
};
const expectedRequest = xmlEvents(await readFile('request.xml', 'utf8'));
const validResponse = await readFile('response.xml', 'utf8');
const declaredFault = await readFile('fault.xml', 'utf8');
let response = validResponse;
let status = 200;
const requests: {method?: string; url?: string; action?: string | string[]; body: string}[] = [];
const server = createServer(async (request, reply) => {
  const capture = {method: request.method, url: request.url, action: request.headers.soapaction, body: ''};
  requests.push(capture);
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  capture.body = Buffer.concat(chunks).toString('utf8');
  reply.writeHead(status, {'Content-Type': 'text/xml; charset=utf-8'}).end(response);
});

server.listen(0, '127.0.0.1');
try {
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  const endpoint = `http://127.0.0.1:${address.port}/forecast`;
  const options: Operation_0.Options = {
    localSource: localFile(runtime.localSource),
    fileRoots: runtime.fileRoots.map(localFile),
    sourceResources: runtime.sourceResources.map(({file, uri}) => ({file: localFile(file), uri: new URL(uri, owner).href})),
    sourceOrigins: runtime.sourceOrigins,
    capsule,
    soap: {service: {namespace: 'urn:checked:forecast', local: 'ForecastService'}, port: 'ForecastPort', endpoint,
      allowEndpoint: url => url.href === endpoint, timeoutMs: 5000},
  };
  const client = createClient(checkedComponentRuntimeV3);
  const input: Operation_0.Request = {city: 'Paris', days: 2};
  let refusals = 0;
  const refused = async (pending: Promise<Operation_0.Result>, kind: Operation_0.Failure['kind'], rule?: string) => {
    const outcome = await pending;
    assert.equal(outcome.kind, kind, JSON.stringify(outcome));
    if (rule) assert.equal((outcome as Operation_0.Failure).rule, rule);
    assert.equal(requests.length, 0);
    refusals++;
  };
  await refused(client.GetForecast({...input, days: 0}, options), 'scalar-invalid');
  await refused(client.GetForecast(input, {...options, capsule: foreignCapsule}), 'incompatible-artifact', 'generated-capsule-mismatch');
  for (const snapshot of [options.localSource, options.sourceResources[0]!.file]) {
    const bytes = await readFile(snapshot);
    const unavailable = snapshot + '.unavailable';
    await rename(snapshot, unavailable);
    try {await refused(client.GetForecast(input, options), 'missing-authority');}
    finally {await rename(unavailable, snapshot);}
    await writeFile(snapshot, Buffer.concat([bytes, Buffer.from('\n<!-- same grammar, altered source bytes -->\n')]));
    try {await refused(client.GetForecast(input, options), 'incompatible-artifact', 'local-source-changed');}
    finally {await writeFile(snapshot, bytes);}
  }

  const success = await client.GetForecast(input, options);
  assert.equal(success.kind, 'soap-response');
  assert.deepEqual({...success.value}, {city: 'Paris', temperature: [18, -2], complete: true});
  assert.equal(success.status, 200);
  response = declaredFault;
  status = 500;
  const fault = await client.GetForecast(input, options);
  assert.equal(fault.kind, 'soap-fault');
  assert.equal(fault.status, 500);
  assert.equal(fault.fault.name, 'ForecastError');
  assert.deepEqual(fault.fault.code, {namespace: 'http://schemas.xmlsoap.org/soap/envelope/', local: 'Server'});
  assert.equal(fault.fault.string, 'Unknown city');
  assert.deepEqual({...fault.value}, {code: 'NOT_FOUND', message: 'Unknown city'});
  assert.equal(requests.length, 2);

  const app = await buildServer({endpoint, allowedEndpoints: [endpoint], timeoutMs: 5000});
  const capsuleFile = localFile(runtime.capsuleFiles.GetForecast!);
  const snapshot = options.sourceResources[0]!.file;
  const snapshotBytes = await readFile(snapshot);
  let gatewayRefusals = 0;
  try {
    const address = await app.listen({host: '127.0.0.1', port: 0});
    const post = async (value: unknown) => {
      const reply = await fetch(address + '/v1/forecast/GetForecast', {method: 'POST',
        headers: {'content-type': 'application/json'}, body: JSON.stringify(value)});
      return {status: reply.status, value: await reply.json() as Record<string, unknown>};
    };
    assert.deepEqual(await (await fetch(address + '/health')).json(), {status: 'ok'});
    const openapi = await (await fetch(address + '/openapi.json')).json();
    assert.deepEqual(openapi, JSON.parse(await readFile('openapi.json', 'utf8')));
    assert.equal((await post({...input, days: 0})).status, 400);
    assert.equal(requests.length, 2);
    gatewayRefusals++;

    await rename(snapshot, snapshot + '.unavailable');
    try {await assert.rejects(buildServer({endpoint}), {code: 'ENOENT'});}
    finally {await rename(snapshot + '.unavailable', snapshot);}
    assert.equal(requests.length, 2);
    gatewayRefusals++;
    await writeFile(snapshot, Buffer.concat([snapshotBytes, Buffer.from('\n<!-- altered import -->')]));
    try {await assert.rejects(buildServer({endpoint}), /stale or mixed generated source records/);}
    finally {await writeFile(snapshot, snapshotBytes);}
    assert.equal(requests.length, 2);
    gatewayRefusals++;

    await writeFile(capsuleFile, foreignCapsule);
    let mismatched: Awaited<ReturnType<typeof buildServer>> | undefined;
    try {
      mismatched = await buildServer({endpoint});
      const reply = await mismatched.inject({method: 'POST', url: '/v1/forecast/GetForecast', payload: input});
      assert.equal(reply.statusCode, 500);
      assert.match(reply.body, /generated-capsule-mismatch/);
    } finally {
      await mismatched?.close();
      await writeFile(capsuleFile, capsule);
    }
    assert.equal(requests.length, 2);
    gatewayRefusals++;

    status = 200;
    response = validResponse;
    assert.deepEqual(await post(input), {status: 200, value: {city: 'Paris', temperature: [18, -2], complete: true}});
    status = 500;
    response = declaredFault;
    assert.deepEqual(await post(input), {status: 502, value: {
      fault: {name: 'ForecastError', code: {namespace: 'http://schemas.xmlsoap.org/soap/envelope/', local: 'Server'}, string: 'Unknown city'},
      value: {code: 'NOT_FOUND', message: 'Unknown city'},
    }});
    status = 200;
    response = validResponse.replace('>18<', '>invalid-temperature<');
    const invalidResponse = await post(input);
    assert.equal(invalidResponse.status, 502);
    assert.equal(Object.hasOwn(invalidResponse.value, 'value'), false);
  } finally {await app.close();}

  assert.equal(requests.length, 5);
  for (const request of requests) {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/forecast');
    assert.equal(request.action, '"urn:checked:GetForecast"');
    assert.deepEqual(xmlEvents(request.body), expectedRequest);
  }
  console.log(JSON.stringify({exchanges: requests.length, clientRefusals: refusals, gatewayRefusals, originalCheckoutReadable: false}));
} finally {
  if (server.listening) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
