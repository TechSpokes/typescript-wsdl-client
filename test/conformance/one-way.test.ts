import {describe, expect, it, vi} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {createServer as createHttpsServer} from 'node:https';
import {HttpClient} from 'soap/lib/http.js';
import {once} from 'node:events';
import type {Socket} from 'node:net';
import Fastify from 'fastify';
import type {FastifyPluginAsync} from 'fastify';
import {SaxesParser} from 'saxes';
import {selectComponentOperation, selectDirectOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {runGenerationPipeline, checkedComponentRuntimeV1, checkedComponentRuntimeV2, checkedComponentRuntimeV3,
  checkedComponentRuntimeV4, checkedComponentRuntimeV5, checkedComponentRuntimeV6, checkedComponentRuntimeV7} from '../../src/index.js';
import type {ComponentClientOptions, ComponentOneWayClientResult} from '../../src/client/directClientRuntime.js';
import {readGeneratedSourceConfiguration} from '../helpers/generatedSourceConfiguration.js';

vi.mock('@techspokes/typescript-wsdl-client', () => import('../../src/index.js'));
const ns = 'urn:owned:one-way';
const fixture = path.resolve('test/conformance/fixtures/soap/versions/one-way.wsdl');
const selector = (version: '11' | '12', operation = 'Notify') => ({portType: {namespace: ns, local: 'Notices'}, binding: {namespace: ns, local: 'Soap' + version}, operation});
const service = {namespace: ns, local: 'NoticeService'};

describe('one-way native exchange and generated routes', () => {
  it.each([['11', false], ['12', false], ['11', true], ['12', true]] as const)('completes SOAP %s exchanges (TLS=%s) without manufacturing application output', async (version, tls) => {
    await mkdir('tmp/conformance/one-way', {recursive: true});
    const root = await mkdtemp(path.resolve('tmp/conformance/one-way/case-'));
    const soap = version === '11' ? 'http://schemas.xmlsoap.org/soap/envelope/' : 'http://www.w3.org/2003/05/soap-envelope';
    let status = 202, body = '', media: string | undefined, encoding: string | undefined, calls = 0;
    let hang = false, incomplete = false, arrived: (() => void) | undefined;
    const requests: {action: unknown; media: unknown; names: string[]; xml: string}[] = [];
    const sockets = new Set<Socket>();
    const handler: import('node:http').RequestListener = async (request, reply) => {
      let xml = ''; for await (const chunk of request) xml += String(chunk);
      calls++;
      const names: string[] = [], parser = new SaxesParser({xmlns: true});
      parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`)); parser.write(xml).close();
      requests.push({action: request.headers.soapaction, media: request.headers['content-type'], names, xml});
      if (hang) {arrived?.(); return;}
      if (incomplete) {reply.writeHead(202, {'content-length': '100'}); reply.write('partial'); setImmediate(() => reply.destroy()); return;}
      reply.writeHead(status, {...(media ? {'content-type': media} : {}), ...(encoding ? {'content-encoding': encoding} : {}),
        'x-rate': ['first', 'second'], ['__proto__']: 'owned-prototype', 'set-cookie': 'PRIVATE_SENTINEL'});
      reply.end(body);
    };
    const cert = await readFile('test/conformance/fixtures/soap/content-model/test-cert.pem', 'utf8');
    const key = await readFile('test/conformance/fixtures/soap/content-model/test-key.pem', 'utf8');
    const upstream = tls ? createHttpsServer({cert, key}, handler) : createServer(handler);
    upstream.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('Owned port required');
    const endpoint = `${tls ? 'https' : 'http'}://127.0.0.1:${address.port}/owned`;
    const app = Fastify();
    try {
      const config = {selectors: [selector(version), selector(version, 'Query')], service, port: 'Port' + version,
        httpResponseHeaders: ['X-Rate', '__proto__'], httpResponseHeaderNames: {'X-Rate': 'RateLimit', ['__proto__']: 'X-Prototype'}, httpResponseStatusHeaderName: 'X-Provider-Status'};
      const project = path.join(root, 'project');
      const pipeline = {wsdl: fixture, model: 'checked-components-v1' as const, checkedComponents: config,
        clientOutDir: path.join(project, 'client'), openapi: {outFile: path.join(project, 'openapi.json')},
        gateway: {outDir: path.join(project, 'gateway'), versionSlug: 'v1', serviceSlug: 'notices'}};
      await runGenerationPipeline(pipeline);
      const pluginFile = path.join(project, 'gateway/routes/0/plugin.ts');
      const generated = await readFile(pluginFile, 'utf8');
      await runGenerationPipeline(pipeline); expect(await readFile(pluginFile, 'utf8')).toBe(generated);
      const source = await readGeneratedSourceConfiguration(project);
      const options: ComponentClientOptions = {localSource: path.resolve(project, source.localSource),
        fileRoots: source.fileRoots.map(file => path.resolve(project, file)), sourceOrigins: source.sourceOrigins,
        sourceResources: source.sourceResources.map(resource => ({...resource,
          uri: /^[a-z]+:/i.test(resource.uri) ? resource.uri : pathToFileURL(path.resolve(project, resource.uri)).href,
          file: path.resolve(project, resource.file)})),
        capsule: new Uint8Array(await readFile(path.join(project, 'client/operations/0/contract.json'))),
        soap: {service, port: config.port, endpoint, ...(tls ? {ca: cert} : {}), httpResponseHeaders: ['X-Rate']}};
      const generatedClient = await import(pathToFileURL(path.join(project, 'client/operations/0/client.ts')).href) as {
        createClient(runtime: unknown): {Notify(input: unknown, options: ComponentClientOptions): Promise<ComponentOneWayClientResult>};
      };
      const binding = version === '11' ? checkedComponentRuntimeV6 : checkedComponentRuntimeV7;
      const client = generatedClient.createClient(binding);
      const call = (input: unknown = {value: 'owned & independent'}, soapOptions = options.soap) => client.Notify(input, {...options, soap: soapOptions});
      const plugin = await import(pathToFileURL(pluginFile).href) as {default: FastifyPluginAsync<{clientOptions: ComponentClientOptions}>};
      await app.register(plugin.default, {clientOptions: {...options, soap: {...options.soap, httpResponseHeaders: ['set-cookie']}}});
      const doc = JSON.parse(await readFile(path.join(project, 'openapi.json'), 'utf8')) as {paths: Record<string, {post: {responses: Record<string, {headers?: unknown; content?: unknown}>}}>};
      expect(doc.paths['/v1/notices/Notify']!.post.responses['202']).toEqual({description: 'Complete transport acknowledgement; no application output or business-success assertion',
        headers: {'x-provider-status': {description: 'Actual upstream HTTP status when a complete response was observed', schema: {type: 'string', pattern: '^[0-9]{3}$'}},
          ratelimit: {description: 'Selected upstream values joined with comma and space after transport coalescing', schema: {type: 'string'}},
          'x-prototype': {description: 'Selected upstream values joined with comma and space after transport coalescing', schema: {type: 'string'}}}});
      for (const code of [200, 202, 204]) {
        status = code; body = ''; media = undefined;
        const result = await call();
        expect(result, JSON.stringify(result)).toMatchObject({kind: 'soap-acknowledgement', admitted: false, status: code, responseBytes: new Uint8Array(0),
          http: {status: code, headers: {'x-rate': ['first, second']}}});
        for (const property of ['value', 'decoded', 'fault', 'branch']) expect(result).not.toHaveProperty(property);
        const reply = await app.inject({method: 'POST', url: '/v1/notices/Notify', payload: {value: 'owned'}});
        expect(reply.statusCode).toBe(202); expect(reply.body).toBe('');
        expect(reply.headers['content-type']).toBeUndefined(); expect(reply.headers.location).toBeUndefined();
        expect(reply.headers['x-provider-status']).toBe(String(code)); expect(reply.headers.ratelimit).toBe('first, second');
        // @constraints The HTTP dependency may omit prototype-like source identities; absent observations are never invented.
        expect(reply.headers['x-prototype']).toBeUndefined();
        expect(JSON.stringify(reply.headers)).not.toContain('PRIVATE_SENTINEL');
      }
      expect(requests[0]!.names).toEqual([`{${soap}}Envelope`, `{${soap}}Body`, `{${ns}}Notice`, `{${ns}}value`]);
      expect(requests[0]!.xml).toContain('owned &amp; independent');
      expect(requests[0]!.action).toBe(version === '11' ? '"urn:notify:11"' : undefined);
      expect(requests[0]!.media).toBe(version === '11' ? 'text/xml; charset=utf-8' : 'application/soap+xml; charset=utf-8; action="urn:notify:12"');
      for (const code of [200, 202]) {
        status = code; body = ''; media = 'application/octet-stream';
        expect(await call()).toMatchObject({kind: 'soap-acknowledgement', status: code});
        body = ' '; expect(await call()).toMatchObject({kind: 'protocol', rule: 'one-way-response-body'});
      }
      body = '\ufeff'; expect(await call()).toMatchObject({kind: 'protocol', rule: 'one-way-response-body'});
      body = `<s:Envelope xmlns:s="${soap}"><s:Body/></s:Envelope>`; expect(await call()).toMatchObject({kind: 'protocol', rule: 'one-way-response-body'});
      body = ''; for (const code of [201, 206, 400, 500, 503]) {status = code; expect(await call()).toMatchObject({kind: 'transport', rule: 'SOAP HTTP status'});}
      status = 202; encoding = 'gzip'; expect(await call()).toMatchObject({kind: 'unsupported', rule: 'HTTP compression'}); encoding = undefined;
      status = 500; media = version === '11' ? 'text/xml' : 'application/soap+xml';
      body = version === '11' ? `<s:Envelope xmlns:s="${soap}"><s:Body><s:Fault><faultcode>s:Server</faultcode><faultstring>owned</faultstring></s:Fault></s:Body></s:Envelope>`
        : `<s:Envelope xmlns:s="${soap}"><s:Body><s:Fault><s:Code><s:Value>s:Receiver</s:Value></s:Code><s:Reason><s:Text xml:lang="en">owned</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>`;
      expect(await call()).toMatchObject({kind: 'soap-fault', fault: {version: version === '11' ? '1.1' : '1.2'}});
      const receiver = await readFile(path.resolve(`test/conformance/fixtures/soap/versions/receiver-fault${version}.xml`), 'utf8');
      const previous = body;
      body = receiver;
      expect(await call()).toMatchObject({kind: 'soap-fault', responseBytes: new Uint8Array(Buffer.from(receiver))});
      const receiverReply = await app.inject({method: 'POST', url: '/v1/notices/Notify', payload: {value: 'owned'}});
      expect(receiverReply.statusCode).toBe(502);
      body = receiver.replace(version === '11' ? 's:actor="urn:other"' : 's:role="urn:other"', '');
      expect(await call()).toMatchObject({kind: 'unsupported', rule: 'incoming mandatory SOAP header'});
      const refusedReply = await app.inject({method: 'POST', url: '/v1/notices/Notify', payload: {value: 'owned'}});
      expect(refusedReply.statusCode).toBe(502); expect(refusedReply.body).not.toBe(receiverReply.body);
      body = receiver; status = 200;
      expect(await call()).toMatchObject({kind: 'protocol', rule: 'one-way-response-body'});
      status = 500; body = previous;
      if (version === '12') {
        status = 400; body = body.replace('s:Receiver', 's:Sender'); expect(await call()).toMatchObject({kind: 'soap-fault'});
        body = body.replace('s:Sender', 's:Receiver'); expect(await call()).toMatchObject({kind: 'protocol', rule: 'HTTP 400 requires SOAP Sender Fault'});
      }
      status = 500;
      const faultBody = body;
      for (const bad of ['<invalid', `<s:Envelope xmlns:s="${soap}"><s:Body><t:Reply xmlns:t="${ns}"><t:value>unexpected</t:value></t:Reply></s:Body></s:Envelope>`,
        faultBody.replace('<s:Body>', `<s:Header><t:Required xmlns:t="urn:owned:header" s:mustUnderstand="1"/></s:Header><s:Body>`)]) {
        body = bad; const refused = await call(); expect(refused.kind).not.toBe('soap-fault'); expect(refused).not.toHaveProperty('responseBytes');
      }
      body = faultBody; media = 'text/plain'; expect(await call()).toMatchObject({kind: 'protocol', rule: 'SOAP response Content-Type'});
      status = 202; body = ''; media = undefined;
      const concurrent = await Promise.all([call({value: 'first'}), call({value: 'second'})]);
      expect(concurrent.map(result => result.kind)).toEqual(['soap-acknowledgement', 'soap-acknowledgement']);
      expect(concurrent[0]!.http).not.toBe(concurrent[1]!.http);
      const capturedAbort = new AbortController(), originalRequest = HttpClient.prototype.request;
      const intercept = vi.spyOn(HttpClient.prototype, 'request').mockImplementation(function (this: HttpClient, ...args) {
        const callback = args[2]; args[2] = (error, response, bytes) => {callback(error, response, bytes); if (!error && response) capturedAbort.abort();};
        return originalRequest.apply(this, args);
      });
      try {expect(await call(undefined, {...options.soap, signal: capturedAbort.signal})).toMatchObject({kind: 'cancelled', http: {status: 202}});}
      finally {intercept.mockRestore();}
      hang = true;
      const reached = new Promise<void>(resolve => {arrived = resolve;});
      const inFlight = new AbortController(), pending = call(undefined, {...options.soap, signal: inFlight.signal});
      await reached; inFlight.abort(); expect(await pending).toMatchObject({kind: 'cancelled'}); expect(await pending).not.toHaveProperty('http');
      arrived = undefined;
      expect(await call(undefined, {...options.soap, timeoutMs: 100})).toMatchObject({kind: 'transport', rule: 'SOAP deadline exceeded'});
      hang = false; incomplete = true;
      const truncated = await call(); expect(truncated.kind).toBe('transport'); expect(truncated).not.toHaveProperty('http'); incomplete = false;
      body = 'x'.repeat(5000);
      const oversized = await call(undefined, {...options.soap, limits: {maxBytes: 4096}});
      expect(oversized).toMatchObject({kind: 'resource-limit', rule: 'HTTP response byte limit'}); expect(oversized).not.toHaveProperty('http'); body = '';
      const before = calls;
      if (tls) {
        const {ca: _ca, ...untrusted} = options.soap;
        expect(await call(undefined, untrusted)).toMatchObject({kind: 'transport'});
      }
      expect(await call({value: 42})).toMatchObject({kind: 'value-invalid', phase: 'input'});
      expect(await call(undefined, {...options.soap, allowEndpoint: () => false})).toMatchObject({kind: 'unsupported'});
      const abort = new AbortController(); abort.abort(); expect(await call(undefined, {...options.soap, signal: abort.signal})).toMatchObject({kind: 'cancelled'});
      for (const old of [checkedComponentRuntimeV1, checkedComponentRuntimeV2, checkedComponentRuntimeV3, checkedComponentRuntimeV4, checkedComponentRuntimeV5]) {
        expect(await generatedClient.createClient(old).Notify({value: 'owned'}, options)).toMatchObject({kind: 'incompatible-artifact'});
        expect(await old.execute(Buffer.from(options.capsule).toString('base64'), {value: 'owned'}, options, old.version as never)).toMatchObject({kind: 'incompatible-artifact'});
      }
      expect(calls).toBe(before);
    } finally {
      await app.close(); for (const socket of sockets) socket.destroy(); upstream.close(); await once(upstream, 'close');
      await rm(root, {recursive: true, force: true});
    }
  });
  it('uses pattern-specific input names and refuses contradictory message patterns', async () => {
    await mkdir('tmp/conformance/one-way', {recursive: true});
    const root = await mkdtemp(path.resolve('tmp/conformance/one-way/source-'));
    try {
      const original = await readFile(fixture, 'utf8');
      for (const version of ['11', '12'] as const) {
        const prefix = version === '11' ? 'soap' : 'soap12';
        const boundInput = `<wsdl:input name="Notify"><${prefix}:body use="literal"/></wsdl:input>`;
        for (const [text, accepted] of [[original, true], [original.replaceAll('<wsdl:input name="Notify">', '<wsdl:input>'), true],
          [original.replace('<wsdl:input message="t:NoticeMessage"/>', '<wsdl:input name="ExplicitNotice" message="t:NoticeMessage"/>').replaceAll('<wsdl:input name="Notify">', '<wsdl:input name="ExplicitNotice">'), true],
          [original.replaceAll('<wsdl:input name="Notify">', '<wsdl:input name="NotifyRequest">'), false],
          [original.replace('<wsdl:input message="t:NoticeMessage"/>', '<wsdl:output message="t:ReplyMessage"/>'), false],
          [original.replace(boundInput, boundInput + `<wsdl:output><${prefix}:body use="literal"/></wsdl:output>`), false],
          [original.replace(boundInput, boundInput + `<wsdl:fault name="Bad"><${prefix}:fault use="literal" name="Bad"/></wsdl:fault>`), false],
          [original.replaceAll('style="document"', 'style="rpc"'), false],
          [original.replace('<wsdl:message name="NoticeMessage">', '<wsdl:message name="NoticeMessage"><wsdl:part name="extra" element="t:Notice"/>'), false],
          [original.replace('<wsdl:operation name="Notify"><wsdl:input', '<wsdl:operation name="Notify"><wsdl:fault name="Bad" message="t:ReplyMessage"/><wsdl:input'), false],
          [original.replace('<wsdl:operation name="Notify"><wsdl:input', '<wsdl:operation name="Notify"><wsdl:output message="t:ReplyMessage"/><wsdl:input'), false]] as const) {
          const file = path.join(root, 'source.wsdl'); await writeFile(file, text);
          const options = {loading: {policy: {fileRoots: [root]}}};
          const result = await selectComponentOperation(file, selector(version), options);
          expect(result.kind === 'selected').toBe(accepted);
          if (result.kind === 'selected') {
            expect(result.contract.pattern).toBe('one-way'); expect(result.contract).not.toHaveProperty('output');
            expect(createComponentValueMapping(result.contract, {kind: 'output'})).toMatchObject({kind: 'unsupported', rule: 'application-output-required'});
          }
          expect((await selectDirectOperation(file, selector(version), options)).kind).not.toBe('selected');
        }
      }
    } finally {await rm(root, {recursive: true, force: true});}
  });
});
