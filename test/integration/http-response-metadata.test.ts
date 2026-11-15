import {describe, expect, it, vi} from 'vitest';
import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:https';
import {once} from 'node:events';
import {HttpClient} from 'soap/lib/http.js';
import type {Socket} from 'node:net';
import Fastify from 'fastify';
import type {FastifyPluginAsync} from 'fastify';
import {runGenerationPipeline, checkedComponentRuntimeV2, checkedComponentRuntimeV3} from '../../src/index.js';
import type {ComponentClientOptions, ComponentClientResult} from '../../src/client/directClientRuntime.js';
import {readGeneratedSourceConfiguration} from '../helpers/generatedSourceConfiguration.js';

vi.mock('@techspokes/typescript-wsdl-client', () => import('../../src/index.js'));
const selection = ['X-RateLimit-Limit', 'x-ratelimit-remaining', 'X-RateLimit-Window', 'X-RateLimit-Limit', 'x-missing'];
const rates = {'x-ratelimit-limit': ['500'], 'x-ratelimit-remaining': ['499'], 'x-ratelimit-window': ['60000']};
const ns = 'urn:conformance:soap12', ns11 = 'http://schemas.xmlsoap.org/soap/envelope/', ns12 = 'http://www.w3.org/2003/05/soap-envelope';

describe('checked HTTP response metadata over owned verified TLS', () => {
  it.each(['11', '12'] as const)('preserves SOAP %s admission, denials and per-route publication', async version => {
    await mkdir('tmp/conformance/http-response-metadata', {recursive: true});
    const root = await mkdtemp(path.resolve('tmp/conformance/http-response-metadata/case-'));
    const cert = await readFile('test/conformance/fixtures/soap/content-model/test-cert.pem', 'utf8');
    const key = await readFile('test/conformance/fixtures/soap/content-model/test-key.pem', 'utf8');
    const fixture = path.resolve('test/conformance/fixtures/soap/versions');
    const response = await readFile(path.join(fixture, 'response.xml'), 'utf8');
    const declared = await readFile(path.join(fixture, 'fault.xml'), 'utf8');
    const soap = version === '11' ? ns11 : ns12;
    let mode = 'normal', calls = 0, arrived: (() => void) | undefined;
    const sockets = new Set<Socket>();
    const upstream = createServer({cert, key}, async (request, reply) => {
      let input = ''; for await (const chunk of request) input += String(chunk);
      calls++;
      if (mode === 'hang') {arrived?.(); return;}
      const remaining = input.includes('second') ? '498' : '499';
      reply.writeHead(mode === '429' ? 429 : mode.includes('fault') ? 500 : mode === 'status' ? 503 : 200, {
        'content-type': mode === '429' ? 'text/plain' : version === '11' ? 'text/xml' : 'application/soap+xml',
        'X-RateLimit-Limit': '500', 'X-RateLimit-Remaining': remaining, 'X-RateLimit-Window': '60000',
        'set-cookie': 'COOKIE_SENTINEL', authorization: 'AUTH_SENTINEL', 'X-Repeated': ['first', 'second'],
      });
      if (mode === '429') {reply.end('UNVALIDATED_BODY_SENTINEL'); return;}
      const protocol = version === '11'
        ? `<s:Envelope xmlns:s="${ns11}"><s:Body><s:Fault><faultcode>s:Server</faultcode><faultstring>owned fault</faultstring></s:Fault></s:Body></s:Envelope>`
        : `<s:Envelope xmlns:s="${ns12}"><s:Body><s:Fault><s:Code><s:Value>s:Receiver</s:Value></s:Code><s:Reason><s:Text xml:lang="en">owned fault</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>`;
      const fault11 = `<s:Envelope xmlns:s="${ns11}"><s:Body><s:Fault><faultcode>s:Server</faultcode><faultstring>owned fault</faultstring><detail><t:Problem xmlns:t="${ns}"><t:code>MISSING</t:code><t:message>Missing input</t:message></t:Problem></detail></s:Fault></s:Body></s:Envelope>`;
      const bytes = mode === 'xml' ? '<invalid' : mode === 'protocol-fault' ? protocol : mode === 'declared-fault' ? version === '11' ? fault11 : declared : response;
      reply.end(bytes.replaceAll(ns12, soap));
    });
    upstream.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('Owned port required');
    const endpoint = `https://127.0.0.1:${address.port}/owned`;
    const apps: import('fastify').FastifyInstance[] = [];
    try {
      let firstSource = '';
      for (const publish of [false, true, 'status', 'aliases', 'partial', 'status-alias'] as const) {
        const statusOnly = publish === 'status' || publish === 'status-alias';
        const aliases = publish === 'aliases' || publish === 'partial';
        const statusName = aliases || publish === 'status-alias' ? 'x-provider-status' : 'x-wsdl-tsc-upstream-status';
        const destination = (name: string) => aliases && (publish === 'aliases' || name === 'x-ratelimit-limit')
          ? 'x-provider-' + name : 'x-wsdl-tsc-upstream-header-' + name;
        const project = path.join(root, String(publish));
        const config = {selectors: [{portType: {namespace: ns, local: 'PingType'}, binding: {namespace: ns, local: 'Soap' + version}, operation: 'Ping'}],
          service: {namespace: ns, local: 'PingService'}, port: 'Port' + version,
          ...(publish ? {httpResponseHeaders: statusOnly ? [] : selection} : {}),
          ...(aliases ? {httpResponseHeaderNames: Object.fromEntries((publish === 'aliases' ? ['x-missing', ...Object.keys(rates)] : ['x-ratelimit-limit']).map(name => [name.toUpperCase(), destination(name)]))} : {}),
          ...(statusName === 'x-provider-status' ? {httpResponseStatusHeaderName: 'X-Provider-Status'} : {})};
        const pipeline = {wsdl: path.join(fixture, 'document-literal.wsdl'), model: 'checked-components-v1' as const,
          checkedComponents: config, clientOutDir: path.join(project, 'client'), openapi: {outFile: path.join(project, 'openapi.json')},
          gateway: {outDir: path.join(project, 'gateway'), versionSlug: 'v1', serviceSlug: 'ping'}};
        await runGenerationPipeline(pipeline);
        const pluginPath = path.join(project, 'gateway/routes/0/plugin.ts');
        const generated = await readFile(pluginPath, 'utf8');
        await runGenerationPipeline(pipeline);
        expect(await readFile(pluginPath, 'utf8')).toBe(generated);
        if (!publish) firstSource = generated;
        else expect(generated).not.toBe(firstSource);
        const source = await readGeneratedSourceConfiguration(project);
        const options: ComponentClientOptions = {localSource: path.resolve(project, source.localSource),
          fileRoots: source.fileRoots.map(file => path.resolve(project, file)),
          sourceResources: source.sourceResources.map(resource => ({...resource,
            uri: /^[a-z]+:/i.test(resource.uri) ? resource.uri : pathToFileURL(path.resolve(project, resource.uri)).href,
            file: path.resolve(project, resource.file)})), sourceOrigins: source.sourceOrigins,
          capsule: new Uint8Array(await readFile(path.join(project, 'client/operations/0/contract.json'))),
          soap: {service: config.service, port: config.port, endpoint, ca: cert, httpResponseHeaders: selection}};
        const module = await import(pathToFileURL(path.join(project, 'client/operations/0/client.ts')).href) as {
          createClient(runtime: unknown): {Ping(input: unknown, options: ComponentClientOptions): Promise<ComponentClientResult>};
        };
        const client = module.createClient(version === '11' ? checkedComponentRuntimeV3 : checkedComponentRuntimeV2);
        const call = (soapOptions = options.soap, input: unknown = {value: 'first'}) => client.Ping(input, {...options, soap: soapOptions});
        mode = 'normal';
        const result = await call(); expect(result.kind).toBe('soap-response');
        expect(result.http).toEqual({status: 200, headers: rates});
        expect(Object.isFrozen(result.http?.headers['x-ratelimit-limit'])).toBe(true);
        expect(JSON.stringify(result)).not.toMatch(/SENTINEL/);
        const {httpResponseHeaders: _selection, ...plain} = options.soap;
        expect(await call(plain)).not.toHaveProperty('http');
        expect((await call({...plain, httpResponseHeaders: []})).http).toEqual({status: 200, headers: {}});
        expect((await call({...plain, httpResponseHeaders: ['X-Repeated']})).http).toEqual({status: 200, headers: {'x-repeated': ['first, second']}});
        const parallel = await Promise.all([call(), call(options.soap, {value: 'second'})]);
        expect(parallel.map(item => item.http?.headers['x-ratelimit-remaining'])).toEqual([['499'], ['498']]);
        expect(parallel[0]!.http).not.toBe(parallel[1]!.http);
        for (const bad of [['*'], ['bad name'], Array<string>(17).fill('x')]) {
          const before = calls;
          expect(await call({...options.soap, httpResponseHeaders: bad})).toMatchObject({kind: 'unsupported'});
          expect(calls).toBe(before);
        }
        const denied = calls;
        for (const result of [await call({...options.soap, allowEndpoint: () => false}), await call(options.soap, {value: 42}),
          await client.Ping({value: 'first'}, {...options, fileRoots: []}),
          await client.Ping({value: 'first'}, {...options, capsule: new Uint8Array([0])})]) expect(result).not.toHaveProperty('http');
        expect(calls).toBe(denied);
        const {ca: _ca, ...untrusted} = options.soap;
        expect(await call(untrusted)).toMatchObject({kind: 'transport'}); expect(calls).toBe(denied);
        const controller = new AbortController(); controller.abort();
        expect(await call({...options.soap, signal: controller.signal})).toMatchObject({kind: 'cancelled'}); expect(calls).toBe(denied);
        const plugin = await import(pathToFileURL(pluginPath).href) as {default: FastifyPluginAsync<{clientOptions: ComponentClientOptions}>};
        const app = Fastify(); apps.push(app);
        await app.register(plugin.default, {clientOptions: publish ? {...options, soap: {...options.soap, httpResponseHeaders: ['authorization']}} : options});
        await app.ready();
        const document = JSON.parse(await readFile(path.join(project, 'openapi.json'), 'utf8')) as {
          paths: Record<string, {post: {responses: Record<string, {headers?: Record<string, unknown>}>}}>;
        };
        for (const current of ['normal', '429', 'status', 'xml', 'declared-fault', 'protocol-fault']) {
          mode = current;
          const observed = await call();
          expect(observed.http).toEqual({status: current === '429' ? 429 : current.includes('fault') ? 500 : current === 'status' ? 503 : 200, headers: rates});
          if (current !== 'normal' && !current.includes('fault')) {
            expect(observed).not.toHaveProperty('value'); expect(observed).not.toHaveProperty('responseBytes');
          }
          if (current.includes('fault')) expect(observed.kind).toBe('soap-fault');
          if (current === '429') expect(observed).toMatchObject({kind: 'protocol', rule: 'SOAP response Content-Type'});
          const reply = await app.inject({method: 'POST', url: '/v1/ping/Ping', payload: {value: 'first'}});
          expect(reply.statusCode).toBe(current === 'normal' ? 200 : 502);
          expect(reply.headers[statusName]).toBe(publish ? String(observed.http!.status) : undefined);
          for (const [name, values] of Object.entries(rates)) expect(reply.headers[destination(name)]).toBe(publish && !statusOnly ? values[0] : undefined);
          expect(JSON.stringify(reply.headers) + reply.body).not.toMatch(/SENTINEL/);
          expect(reply.json()).not.toHaveProperty('http');
        }
        const documented = document.paths['/v1/ping/Ping']!.post.responses;
        for (const code of ['200', '502', '499', '500']) expect(documented[code]!.headers === undefined).toBe(!publish);
        if (publish) expect(Object.keys(documented['502']!.headers!).sort()).toEqual([
          statusName, ...(statusOnly ? [] : ['x-missing', ...Object.keys(rates)].map(destination))].sort());
        const afterCapture = new AbortController();
        const original = HttpClient.prototype.request;
        const intercept = vi.spyOn(HttpClient.prototype, 'request').mockImplementation(function (this: HttpClient, ...args) {
          const callback = args[2];
          args[2] = (error, response, body) => {
            callback(error, response, body);
            if (!error && response) afterCapture.abort();
          };
          return original.apply(this, args);
        });
        mode = 'normal';
        try {
          const cancelled = await call({...options.soap, signal: afterCapture.signal});
          expect(cancelled).toMatchObject({kind: 'cancelled', http: {status: 200, headers: rates}});
          expect(cancelled).not.toHaveProperty('value'); expect(cancelled).not.toHaveProperty('responseBytes');
        } finally {intercept.mockRestore();}
        mode = 'hang';
        const inflight = new AbortController();
        const reached = new Promise<void>(resolve => {arrived = resolve;});
        const pending = call({...options.soap, signal: inflight.signal});
        await reached; inflight.abort();
        expect(await pending).toMatchObject({kind: 'cancelled'}); expect(await pending).not.toHaveProperty('http');
        arrived = undefined;
        const timeout = await call({...options.soap, timeoutMs: 100});
        expect(timeout).toMatchObject({kind: 'transport', rule: 'SOAP deadline exceeded'}); expect(timeout).not.toHaveProperty('http');
        mode = 'normal'; expect((await call()).kind).toBe('soap-response');
      }
    } finally {
      for (const app of apps) await app.close();
      for (const socket of sockets) socket.destroy();
      upstream.close(); await once(upstream, 'close');
      await rm(root, {recursive: true, force: true});
    }
    expect(sockets.size).toBe(0);
  });
});
