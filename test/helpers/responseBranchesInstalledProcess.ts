/** Independent XML and HTTP expectations for relocated branch-enabled installed consumers.
 * @since 1.6.0
 */
import assert from 'node:assert/strict';
import {readFile, stat, writeFile, rename} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Socket} from 'node:net';
import type {FastifyInstance} from 'fastify';

const root = process.cwd();
await assert.rejects(readFile(process.argv[2]!), {code: 'ERR_ACCESS_DENIED'});
await assert.rejects(stat(path.join(root, 'inputs')), {code: 'ENOENT'});
const require = createRequire(path.join(root, 'soap11/package.json'));
const {SaxesParser} = require('saxes') as typeof import('saxes');
const Ajv2020 = (require('ajv/dist/2020.js') as {default: new (options: object) => {
  addSchema(schema: unknown, key: string): unknown; compile(schema: object): (value: unknown) => boolean;
}}).default;
const success = '<o:OuterResponse xmlns:o="urn:test:outer" xmlns:p="urn:test:payload"><p:Response><p:Records><p:Record Code="A"><p:Quantity>2</p:Quantity></p:Record></p:Records></p:Response></o:OuterResponse>';
const applicationError = '<o:OuterResponse xmlns:o="urn:test:outer" xmlns:p="urn:test:payload"><Wrapper Marker="owned"><Response><p:ApplicationError Retryable="false"><p:Code>42</p:Code><p:Message>synthetic error</p:Message></p:ApplicationError></Response></Wrapper></o:OuterResponse>';
const expectedSuccess = {Records: {Record: [{Code: 'A', Quantity: 2}]}};
const expectedError = {kind: 'application-error', branch: 'application-error', value: {Wrapper: {Marker: 'owned',
  Response: {ApplicationError: {Retryable: false, Code: 42, Message: 'synthetic error'}}}}};
const ns11 = 'http://schemas.xmlsoap.org/soap/envelope/', ns12 = 'http://www.w3.org/2003/05/soap-envelope';
let body = success, status = 200, protocol = ns11, hold = false;
let arrived: (() => void) | undefined, released: (() => void) | undefined;
const observed: {xml: string; action?: string; contentType?: string; method?: string; url?: string}[] = [];
const sockets = new Set<Socket>(), apps = new Set<FastifyInstance>();
const upstream = createServer(async (request, response) => {
  let xml = ''; for await (const chunk of request) xml += String(chunk);
  observed.push({xml, action: request.headers.soapaction as string | undefined, contentType: request.headers['content-type'],
    method: request.method, url: request.url});
  response.writeHead(status, {'Content-Type': protocol === ns11 ? 'text/xml; charset=utf-8' : 'application/soap+xml; charset=utf-8'});
  if (hold) {
    response.once('close', () => released?.());
    response.write(`<s:Envelope xmlns:s="${protocol}"><s:Body>`); arrived?.(); return;
  }
  response.end(`<s:Envelope xmlns:s="${protocol}"><s:Body>${body}</s:Body></s:Envelope>`);
});
upstream.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
const bounded = async <T>(promise: Promise<T>, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {return await Promise.race([promise, new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error(message)), 10_000);})]);}
  finally {clearTimeout(timer);}
};
const soapCallsBefore = () => observed.length;
try {
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const address = upstream.address(); assert.ok(address && typeof address !== 'string');
  const endpoint = `http://127.0.0.1:${address.port}/owned-branches`;
  for (const mode of ['soap11', 'soap12', 'mixed']) {
    protocol = mode === 'soap12' ? ns12 : ns11; status = 200; body = success;
    const project = path.join(root, mode);
    const document: unknown = JSON.parse(await readFile(path.join(project, 'openapi.json'), 'utf8'));
    const ajv = new Ajv2020({strict: false}); ajv.addSchema(document, 'urn:installed:response-branches');
    const schema = (code: string) => ajv.compile({$ref: 'urn:installed:response-branches#/paths/~1v1~1branches~1Fetch/post/responses/'
      + code + '/content/application~1json/schema'});
    const acceptsSuccess = schema('200'), acceptsUpstream = schema('502');
    assert.equal(acceptsSuccess(expectedSuccess), true); assert.equal(acceptsSuccess(expectedError), false);
    assert.equal(acceptsUpstream(expectedError), true); assert.equal(acceptsUpstream(expectedSuccess), false);
    assert.equal(acceptsUpstream({...expectedError, branch: 'unknown'}), false);
    assert.equal(acceptsUpstream({...expectedError, value: {Wrapper: {Marker: 'owned', Response: {ApplicationError: {
      Retryable: false, Code: '42', Message: 'synthetic error',
    }}}}}), false);
    const host = await import(pathToFileURL(path.join(project, 'dist/server.js')).href) as {buildServer(options: object): Promise<FastifyInstance>};
    const config = {endpoint, allowedEndpoints: [endpoint]};
    const app = await host.buildServer(config); apps.add(app);
    // @constraints A string request is JSON encoded explicitly so Fastify observes the declared scalar body.
    const send = (server = app) => server.inject({method: 'POST', url: '/v1/branches/Fetch', payload: JSON.stringify('owned-request'), headers: {'content-type': 'application/json'}});
    const firstCall = observed.length;
    const good = await send(); assert.equal(good.statusCode, 200, good.body); assert.deepEqual(good.json(), expectedSuccess);
    if (mode === 'mixed') {
      body = '<o:OrdinaryResponse xmlns:o="urn:test:outer">ordinary success</o:OrdinaryResponse>';
      const ordinary = await app.inject({method: 'POST', url: '/v1/branches/Ordinary', payload: JSON.stringify('owned-request'),
        headers: {'content-type': 'application/json'}});
      assert.equal(ordinary.statusCode, 200, ordinary.body); assert.deepEqual(ordinary.json(), 'ordinary success');
    }
    body = applicationError;
    const error = await send(); assert.equal(error.statusCode, 502, error.body); assert.deepEqual(error.json(), expectedError);
    body = mode !== 'soap12'
      ? '<s:Fault><faultcode>s:Server</faultcode><faultstring>synthetic fault</faultstring></s:Fault>'
      : '<s:Fault><s:Code><s:Value>s:Receiver</s:Value></s:Code><s:Reason><s:Text xml:lang="en">synthetic fault</s:Text></s:Reason></s:Fault>';
    status = 500;
    const fault = await send(); assert.equal(fault.statusCode, 502, fault.body);
    assert.equal(fault.json().kind, 'soap-fault'); assert.equal(fault.json().fault.string, 'synthetic fault');
    assert.equal(fault.json().fault.version, mode !== 'soap12' ? '1.1' : '1.2');
    assert.equal(acceptsUpstream(fault.json()), true); assert.equal(acceptsSuccess(fault.json()), false);
    status = 200;
    for (const invalid of [applicationError.replace('>42<', '>invalid-secret<'), applicationError.replace('Retryable="false"', 'Retryable="invalid-secret"'),
      applicationError.replace(' Marker="owned"', ''), applicationError.replace('<Wrapper ', '<Wrapper xmlns="urn:test:outer" '),
      applicationError.replaceAll('p:ApplicationError', 'o:ApplicationError'), applicationError.replace('</Response>', '<p:Unknown/></Response>'),
      '<o:OuterResponse xmlns:o="urn:test:outer"><Unknown/></o:OuterResponse>',
      success.replace('</o:OuterResponse>', applicationError.slice(applicationError.indexOf('<Wrapper'), applicationError.indexOf('</o:OuterResponse>')) + '</o:OuterResponse>'),
      success.replace('>2<', '>invalid-secret<')]) {
      body = invalid; const before = observed.length;
      const refusal = await send(); assert.equal(refusal.statusCode, 502, refusal.body);
      assert.ok(!['application-error', 'soap-fault', 'soap-response'].includes(refusal.json().kind), refusal.body);
      assert.doesNotMatch(refusal.body, /invalid-secret/); assert.equal(observed.length, before + 1, 'Selected errors must not retry SOAP or fall back');
    }
    body = applicationError; status = 500;
    const protocolFailure = await send(); assert.equal(protocolFailure.statusCode, 502); assert.equal(protocolFailure.json().kind, 'protocol');
    status = 200;
    for (const request of observed.slice(firstCall)) {
      assert.equal(request.method, 'POST'); assert.equal(request.url, '/owned-branches');
      if (mode !== 'soap12') {
        assert.ok(request.action === '"urn:test:fetch"' || mode === 'mixed' && request.action === '"urn:test:ordinary"');
        assert.equal(request.contentType, 'text/xml; charset=utf-8');
      }
      else {assert.equal(request.action, undefined); assert.match(request.contentType!, /^application\/soap\+xml;.*action="urn:test:fetch"/);}
      const names: string[] = [], texts: string[] = [];
      const parser = new SaxesParser({xmlns: true});
      parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`));
      parser.on('text', value => {if (value.trim()) texts.push(value);}); parser.write(request.xml).close();
      assert.deepEqual(names, [`{${protocol}}Envelope`, `{${protocol}}Body`, '{urn:test:outer}Request']);
      assert.deepEqual(texts, ['owned-request']);
    }
    const limited = await host.buildServer({...config, limits: {maxBytes: 4096}}); apps.add(limited);
    body = applicationError.replace('synthetic error', 'x'.repeat(8192));
    const beforeCapacity = observed.length;
    const capacity = await send(limited); assert.equal(capacity.statusCode, 502, capacity.body); assert.equal(capacity.json().kind, 'resource-limit');
    assert.equal(observed.length, beforeCapacity + 1, 'Response capacity must be exercised after SOAP dispatch');
    await limited.close(); apps.delete(limited);
    const preaborted = new AbortController(); preaborted.abort();
    const stopped = await host.buildServer({...config, signal: preaborted.signal}); apps.add(stopped);
    const beforeAbort = observed.length, immediateCancellation = await send(stopped);
    assert.equal(immediateCancellation.statusCode, 499, immediateCancellation.body);
    assert.equal(immediateCancellation.json().kind, 'cancelled'); assert.equal(observed.length, beforeAbort);
    await stopped.close(); apps.delete(stopped);
    const controller = new AbortController();
    const cancelled = await host.buildServer({...config, signal: controller.signal}); apps.add(cancelled);
    hold = true;
    const reached = new Promise<void>(resolve => {arrived = resolve;});
    const closed = new Promise<void>(resolve => {released = resolve;});
    const pending = send(cancelled);
    await bounded(reached, 'Owned SOAP response did not start before cancellation');
    controller.abort();
    const aborted = await pending; assert.equal(aborted.statusCode, 499, aborted.body); assert.equal(aborted.json().kind, 'cancelled');
    await bounded(closed, 'Cancelled SOAP response socket was not released');
    hold = false; arrived = undefined; released = undefined;
    await cancelled.close(); apps.delete(cancelled);
    body = success;
    const restored = await send(); assert.equal(restored.statusCode, 200, restored.body); assert.deepEqual(restored.json(), expectedSuccess);
    await app.close(); apps.delete(app);
    const recordFile = path.join(project, 'client/source-resources.json');
    const record = JSON.parse(await readFile(recordFile, 'utf8')) as {resources: {file: string; originalUri: string}[]};
    for (const basename of ['error.wsdl', 'payload.xsd']) {
      const resource = record.resources.find(item => item.originalUri.endsWith('/' + basename)); assert.ok(resource);
      const file = path.resolve(path.dirname(recordFile), resource.file), bytes = await readFile(file), before = soapCallsBefore();
      await writeFile(file, Buffer.concat([bytes, Buffer.from('\n')]));
      try {await assert.rejects(host.buildServer(config), /stale|digest|source|snapshot/i); assert.equal(observed.length, before);}
      finally {await writeFile(file, bytes);}
      await rename(file, file + '.missing');
      try {await assert.rejects(host.buildServer(config)); assert.equal(observed.length, before);}
      finally {await rename(file + '.missing', file);}
    }
    const capsuleFile = path.join(project, 'client/operations/0/contract.json'), capsule = await readFile(capsuleFile);
    const publicEntry = createRequire(path.join(project, 'package.json')).resolve('@techspokes/typescript-wsdl-client');
    const runtime = await import(pathToFileURL(publicEntry).href) as Record<string, {
      version: string; execute(expected: string, input: unknown, options: object, version: string): Promise<{kind: string}>;
    }>;
    const current = runtime[mode !== 'soap12' ? 'checkedComponentRuntimeV4' : 'checkedComponentRuntimeV5']!;
    const previous = runtime[mode !== 'soap12' ? 'checkedComponentRuntimeV3' : 'checkedComponentRuntimeV2']!;
    const crossed = runtime[mode !== 'soap12' ? 'checkedComponentRuntimeV5' : 'checkedComponentRuntimeV4']!;
    const saved = JSON.parse(await readFile(recordFile, 'utf8')) as {runtime: {
      localSource: string; fileRoots: string[]; sourceUri?: string; sourceOrigins: string[];
      sourceResources: {uri: string; file: string; canonicalUri?: string}[];
      recordSources: {selector: object; source: string}[]; branchSources: {selector: object; branch: string; source: string}[];
    }};
    const owner = path.dirname(recordFile), physical = (file: string) => path.resolve(owner, file);
    const logical = (uri: string) => /^[A-Za-z][A-Za-z0-9+.-]*:/.test(uri) ? uri : pathToFileURL(physical(uri)).href;
    const runtimeOptions = {...saved.runtime, localSource: physical(saved.runtime.localSource), fileRoots: [owner], capsule,
      sourceResources: saved.runtime.sourceResources.map(resource => ({uri: logical(resource.uri), file: physical(resource.file),
        ...(resource.canonicalUri === undefined ? {} : {canonicalUri: logical(resource.canonicalUri)})})),
      recordSources: saved.runtime.recordSources.map(item => ({...item, source: physical(item.source)})),
      branchSources: saved.runtime.branchSources.map(item => ({...item, source: physical(item.source)})),
      soap: {service: {namespace: 'urn:test:outer', local: 'Service'}, port: 'Port', endpoint, allowEndpoint: (url: URL) => url.href === endpoint}};
    delete (runtimeOptions as Record<string, unknown>).capsuleFiles;
    const beforeVersion = observed.length;
    const wrongVersion = await current.execute(capsule.toString('base64'), 'owned-request', runtimeOptions, previous.version);
    assert.equal(wrongVersion.kind, 'incompatible-artifact');
    const wrongProtocol = await crossed.execute(capsule.toString('base64'), 'owned-request', runtimeOptions, crossed.version);
    assert.equal(wrongProtocol.kind, 'incompatible-artifact'); assert.equal(observed.length, beforeVersion);
    const {branchSources: _branches, ...oldOptions} = runtimeOptions;
    const oldRuntime = await previous.execute(capsule.toString('base64'), 'owned-request', oldOptions, previous.version);
    assert.equal(oldRuntime.kind, 'incompatible-artifact'); assert.equal(observed.length, beforeVersion);
    const deniedBranch = await current.execute(capsule.toString('base64'), 'owned-request', {...runtimeOptions, branchSources: []}, current.version);
    assert.equal(deniedBranch.kind, 'missing-authority'); assert.equal(observed.length, beforeVersion);
    if (mode === 'mixed') {
      const generated = await import(pathToFileURL(path.join(project, 'dist/client/client.js')).href) as {
        createClient(runtime: object): Record<string, (input: string, options: object) => Promise<{kind: string; value?: unknown; branch?: string}>>;
      };
      const client = generated.createClient({Fetch: current, Ordinary: previous});
      const ordinaryCapsule = await readFile(path.join(project, 'client/operations/1/contract.json'));
      body = '<o:OrdinaryResponse xmlns:o="urn:test:outer">ordinary direct success</o:OrdinaryResponse>';
      const ordinary = await client.Ordinary!('owned-request', {...runtimeOptions, capsule: ordinaryCapsule});
      assert.equal(ordinary.kind, 'soap-response'); assert.equal(ordinary.value, 'ordinary direct success');
      assert.equal(observed.length, beforeVersion + 1); assert.equal(observed.at(-1)!.action, '"urn:test:ordinary"');
      body = applicationError;
      const branched = await client.Fetch!('owned-request', runtimeOptions);
      assert.equal(branched.kind, 'application-error'); assert.equal(branched.branch, 'application-error');
      assert.equal(Object.getPrototypeOf(branched.value as object), null);
      assert.deepEqual(JSON.parse(JSON.stringify(branched.value)), expectedError.value); assert.equal(observed.length, beforeVersion + 2);
      assert.equal(observed.at(-1)!.action, '"urn:test:fetch"');
    }
    await writeFile(capsuleFile, '{}');
    try {
      const stale = await host.buildServer(config); apps.add(stale); const before = observed.length;
      const mismatch = await send(stale); assert.equal(mismatch.statusCode, 500, mismatch.body);
      assert.equal(mismatch.json().kind, 'incompatible-artifact'); assert.equal(observed.length, before);
      await stale.close(); apps.delete(stale);
    } finally {await writeFile(capsuleFile, capsule);}
  }
  process.stdout.write(JSON.stringify({kind: 'response-branches-installed', offline: true, soapVersions: 2,
    applicationError: true, selectedFailureClosed: true, staleRejectedBeforeIo: true, cancellationCleanup: true, capacityRejected: true,
    runtimeMismatchRejected: true, emptyBranchAuthorityRejected: true, openApiValidated: true, mixedService: true, soapCalls: observed.length}) + '\n');
} finally {
  for (const socket of sockets) socket.destroy();
  for (const app of apps) await app.close();
  if (upstream.listening) {const closed = once(upstream, 'close'); upstream.close(); await closed;}
}
