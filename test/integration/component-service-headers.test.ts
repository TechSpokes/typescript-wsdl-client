import {describe, expect, it, vi} from 'vitest';
import {mkdir, mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {once} from 'node:events';
import type {Socket} from 'node:net';
import Fastify from 'fastify';
import type {FastifyPluginAsync, FastifyInstance} from 'fastify';
import {runGenerationPipeline, checkedComponentRuntimeV2, checkedComponentRuntimeV3} from '../../src/index.js';
import {readGeneratedSourceConfiguration} from '../helpers/generatedSourceConfiguration.js';
import {runOwnedNode} from '../helpers/ownedNodeProcess.js';

vi.mock('@techspokes/typescript-wsdl-client', () => import('../../src/index.js'));
const namespace = 'urn:conformance:headers';
const inputId = JSON.stringify(['input', namespace, 'Input', 'session', null]);
const receiptId = JSON.stringify(['output', namespace, 'Output', 'receipt', null]);

describe.each(['11', '12'] as const)('service SOAP %s header capabilities', version => {
it('routes headers only to their selected operation', async context => {
  await mkdir('tmp/conformance/component-service-headers', {recursive: true});
  const root = await mkdtemp(path.resolve('tmp/conformance/component-service-headers/case-'));
  const source = path.join(root, 'source.wsdl'), project = path.join(root, 'project');
  const original = await readFile('test/conformance/fixtures/soap/headers/declared-literal.wsdl', 'utf8');
  const messages = '<w:message name="PlainInput"><w:part name="body" element="t:Request"/></w:message><w:message name="PlainOutput"><w:part name="body" element="t:Response"/></w:message>';
  const abstract = '<w:operation name="APlain"><w:input message="t:PlainInput"/><w:output message="t:PlainOutput"/></w:operation>';
  const concrete = (prefix: string) => `<w:operation name="APlain"><${prefix}:operation soapAction="urn:plain"/><w:input><${prefix}:body use="literal"/></w:input><w:output><${prefix}:body use="literal"/></w:output></w:operation>`;
  await writeFile(source, original.replace('<w:portType', messages + '<w:portType').replace('</w:portType>', abstract + '</w:portType>')
    .replace('</w:binding>', concrete('s') + '</w:binding>').replace(/<\/w:binding>\r?\n  <w:service/, concrete('s12') + '</w:binding>\n  <w:service'));
  const sockets = new Set<Socket>(), requests: {action: string; xml: string}[] = [];
  const soap = version === '11' ? 'http://schemas.xmlsoap.org/soap/envelope/' : 'http://www.w3.org/2003/05/soap-envelope';
  const upstream = createServer(async (request, response) => {
    let xml = ''; for await (const chunk of request) xml += String(chunk);
    const action = String(request.headers.soapaction ?? request.headers['content-type']);
    requests.push({action, xml});
    const selected = action.includes('urn:headers:');
    response.writeHead(200, {'content-type': version === '11' ? 'text/xml' : 'application/soap+xml'});
    response.end(`<s:Envelope xmlns:s="${soap}" xmlns:t="${namespace}">${selected ? '<s:Header><t:Receipt s:mustUnderstand="1"><t:count>7</t:count></t:Receipt></s:Header>' : ''}<s:Body><t:Response>owned result</t:Response></s:Body></s:Envelope>`);
  });
  upstream.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('Owned address required');
  const endpoint = `http://127.0.0.1:${address.port}/soap`, apps: FastifyInstance[] = [];
  try {
    const selector = (operation: string) => ({portType: {namespace, local: 'HeaderPortType'}, binding: {namespace, local: 'Soap' + version}, operation});
    await runGenerationPipeline({wsdl: source, model: 'checked-components-v1', checkedComponents: {
      selectors: [selector('APlain'), selector('Invoke')], service: {namespace, local: 'HeaderService'}, port: 'Port' + version,
      fileRoots: [root], sourceResources: [], sourceOrigins: [],
    }, clientOutDir: path.join(project, 'client'), openapi: {outFile: path.join(project, 'openapi.json')},
    gateway: {outDir: path.join(project, 'gateway'), versionSlug: 'v1', serviceSlug: 'headers'}});
    const record = await readGeneratedSourceConfiguration(project);
    const capsules = Object.fromEntries(await Promise.all(Object.entries(record.capsuleFiles!).map(async ([name, file]) => [name, new Uint8Array(await readFile(path.resolve(project, file)))])));
    let processed = 0;
    const soapOptions = {service: {namespace, local: 'HeaderService'}, port: 'Port' + version, endpoint,
      headerValues: {[inputId]: {token: 'owned & independent'}}, headerProcessors: {[receiptId]: (value: unknown) => {expect(value).toEqual({count: 7}); processed++; return true as const;}}};
    const options = {localSource: path.resolve(project, record.localSource), fileRoots: record.fileRoots.map(file => path.resolve(project, file)),
      sourceResources: record.sourceResources.map(resource => ({...resource, uri: /^[a-z]+:/i.test(resource.uri) ? resource.uri : pathToFileURL(path.resolve(project, resource.uri)).href,
        file: path.resolve(project, resource.file)})), sourceOrigins: record.sourceOrigins, soap: soapOptions};
    const module = await import(pathToFileURL(path.join(project, 'client/client.ts')).href) as {
      createClient(runtime: unknown): Record<'APlain' | 'Invoke', (input: unknown, options: object) => Promise<{kind: string; value?: unknown}>>;
    };
    const client = module.createClient(version === '11' ? checkedComponentRuntimeV3 : checkedComponentRuntimeV2);
    for (const operation of ['APlain', 'Invoke'] as const) expect(await client[operation]('owned input', {...options, capsule: capsules[operation]}))
      .toMatchObject({kind: 'soap-response', value: 'owned result'});
    expect(processed).toBe(1);
    let reads = 0;
    const accessor = Object.defineProperty({}, inputId, {get() {reads++; return {token: 'invalid'};}});
    const invalidMaps = [
      {headerValues: {unknown: {token: 'bad'}}}, {headerValues: new Proxy({}, {})}, {headerValues: accessor},
      {headerProcessors: {[receiptId]: 42}}, {headerProcessors: {unknown: () => true}},
      {headerProcessors: new Proxy({}, {})},
    ];
    for (const invalid of invalidMaps) expect(() => client.APlain('owned input', {...options, capsule: capsules.APlain, soap: {...soapOptions, ...invalid}})).toThrow();
    const unsafeValue = Object.defineProperty({}, 'token', {get() {reads++; return 'bad';}});
    await expect(client.Invoke('owned input', {...options, capsule: capsules.Invoke, soap: {...soapOptions, headerValues: {[inputId]: unsafeValue}}})).resolves.toMatchObject({kind: 'value-invalid', phase: 'input'});
    expect(reads).toBe(0); expect(requests).toHaveLength(2);
    const plugin = (await import(pathToFileURL(path.join(project, 'gateway/plugin.ts')).href)).default as FastifyPluginAsync<{clientOptions: object; capsules: typeof capsules}>;
    const app = Fastify(); apps.push(app); await app.register(plugin, {clientOptions: options, capsules});
    for (const operation of ['APlain', 'Invoke']) {
      const result = await app.inject({method: 'POST', url: '/v1/headers/' + operation, headers: {'content-type': 'application/json'}, payload: JSON.stringify('owned input')});
      expect(result.statusCode).toBe(200); expect(result.json()).toBe('owned result');
    }
    expect(processed).toBe(2); expect(requests).toHaveLength(4);
    expect(requests.map(request => request.xml.includes('Session'))).toEqual([false, true, false, true]);
    expect(requests.filter(request => request.action.includes('urn:headers:')).every(request => request.xml.includes('owned &amp; independent'))).toBe(true);
    const bad = Fastify(); apps.push(bad); bad.register(plugin, {clientOptions: {...options, soap: {...soapOptions, headerProcessors: {[receiptId]: 42}}}, capsules});
    await expect(bad.ready()).rejects.toThrow('processor'); expect(requests).toHaveLength(4);
    const config = path.join(project, 'tsconfig.json');
    await writeFile(path.join(project, 'client/service-options-check.ts'), `import type {Options} from './client.js';\nconst headers: NonNullable<Options['soap']['headerValues']> = {${JSON.stringify(inputId)}: {token: 'owned'}};\nconst token: string = headers[${JSON.stringify(inputId)}].token;\nvoid token;\n`);
    await writeFile(config, JSON.stringify({extends: path.resolve('tsconfig.json'), compilerOptions: {noEmit: true, rootDir: process.cwd(),
      paths: {'@techspokes/typescript-wsdl-client': [path.resolve('src/index.ts')]}}, include: ['client/**/*.ts', 'gateway/**/*.ts']}));
    await runOwnedNode([path.resolve('node_modules/typescript/bin/tsc'), '-p', config], {cwd: process.cwd(), timeoutMs: 60_000, signal: context.signal});
  } finally {
    for (const app of apps) await app.close();
    for (const socket of sockets) socket.destroy(); upstream.close(); await once(upstream, 'close');
    await rm(root, {recursive: true, force: true});
  }
}, 120_000);
});
