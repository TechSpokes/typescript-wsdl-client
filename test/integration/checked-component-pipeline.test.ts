import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile, symlink} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:https';
import {createServer as createHttpServer} from 'node:http';
import {Ajv} from 'ajv';
import {once, EventEmitter} from 'node:events';
import type {Socket} from 'node:net';
import {runGenerationPipeline} from '../../src/index.js';
import {parseCheckedComponentOptions} from '../../src/checkedPipeline.js';
import type {PipelineOptions} from '../../src/pipeline.js';
import {runOwnedNode} from '../helpers/ownedNodeProcess.js';

// @constraints Source integration resolves the actual public runtime; installed acceptance uses a separately packed consumer.
vi.mock('@techspokes/typescript-wsdl-client', () => import('../../src/index.js'));
const ns = 'urn:conformance:import-relative-types', soap = 'http://schemas.xmlsoap.org/soap/envelope/';
let directory: string, fixture: string, schema: string;
beforeAll(async () => {
  await mkdir('tmp/conformance/component-pipeline', {recursive: true});
  directory = await mkdtemp(path.resolve('tmp/conformance/component-pipeline/suite-'));
  [fixture, schema] = await Promise.all([readFile('test/conformance/fixtures/xsd/imports/import-relative-types.wsdl', 'utf8'),
    readFile('test/conformance/fixtures/xsd/imports/import-relative-types-types.xsd', 'utf8')]);
});
afterAll(async () => {await rm(directory, {recursive: true, force: true});});
afterEach(() => {vi.restoreAllMocks();});

async function setup() {
  const root = await mkdtemp(path.join(directory, 'case-')), sources = path.join(root, 'inputs'), project = path.join(root, 'project');
  await mkdir(sources);
  const file = path.join(sources, 'source.wsdl'), dependency = path.join(sources, 'import-relative-types-types.xsd');
  const text = fixture.replace('</wsdl:portType>', '<wsdl:operation name="Other"><wsdl:input message="tns:SubmitImportedInput"/><wsdl:output message="tns:SubmitImportedOutput"/></wsdl:operation></wsdl:portType>')
    .replace('</wsdl:binding>', '<wsdl:operation name="Other"><soap:operation soapAction="urn:Other"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation></wsdl:binding>');
  await writeFile(file, text); await writeFile(dependency, schema);
  const selector = {portType: {namespace: ns, local: 'ImportPortType'}, binding: {namespace: ns, local: 'ImportBinding'}, operation: 'SubmitImported'};
  const checkedComponents = {selectors: [selector, {...selector, operation: 'Other'}], service: {namespace: ns, local: 'ImportService'},
    port: 'ImportPort', fileRoots: [sources], sourceResources: [{uri: pathToFileURL(dependency).href, file: dependency}], sourceOrigins: [], basePath: '/api/v2/catalog'};
  const options: PipelineOptions = {model: 'checked-components-v1', checkedComponents, wsdl: file, clientOutDir: path.join(project, 'client'),
    gateway: {outDir: path.join(project, 'gateway'), serviceSlug: 'catalog', versionSlug: 'v2'}, openapi: {outFile: path.join(project, 'openapi.json')},
    app: {appDir: project}, test: {testDir: path.join(project, 'test')}};
  return {root, sources, project, options};
}

describe('public component service pipeline', () => {
  it('starts the bundled component trial and validates structured fault values without reference recursion', async () => {
    const {project, options} = await setup();
    await runGenerationPipeline({...options, checkedComponents: undefined, wsdl: path.resolve('docs/examples/checked-forecast.wsdl'),
      gateway: {...options.gateway!, serviceSlug: 'forecast', versionSlug: 'v1'}});
    const schemas = JSON.parse(await readFile(path.join(project, 'gateway/routes/0/schemas.json'), 'utf8')) as Record<string, object>;
    const validate = new Ajv({strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false}).compile(schemas.fault!);
    const expected = {fault: {name: 'ForecastError', code: {namespace: soap, local: 'Server'}, string: 'Owned fault'},
      value: {code: 'OWNED', message: 'Independent fault detail'}};
    expect(validate(expected)).toBe(true);
    expect(validate({...expected, value: {code: 7, message: 'Independent fault detail'}})).toBe(false);
    expect(validate({...expected, value: {code: 'OWNED'}})).toBe(false);
    expect(validate({...expected, value: {...expected.value, extra: 'undeclared'}})).toBe(false);
    const scope = path.join(project, 'node_modules/@techspokes'); await mkdir(scope, {recursive: true});
    await symlink(process.cwd(), path.join(scope, 'typescript-wsdl-client'), 'junction');
    const example = JSON.parse(await readFile(path.join(project, 'checked-gateway.example.json'), 'utf8')) as {
      localSource: string; fileRoots: string[]; sourceResources: {uri: string; file: string}[]; sourceOrigins: string[];
    };
    let calls = 0, malformed = false;
    const failures: string[] = [], sockets = new Set<Socket>();
    const upstream = createHttpServer(async (request, response) => {
      let body = ''; for await (const chunk of request) body += String(chunk); calls++;
      if (request.headers.soapaction !== '"urn:checked:GetForecast"' || !body.includes('Paris') || !body.includes('>2<')) failures.push('Owned Forecast request mismatch');
      response.writeHead(500, {'Content-Type': 'text/xml'});
      response.end(`<s:Envelope xmlns:s="${soap}"><s:Body><s:Fault><faultcode>s:Server</faultcode><faultstring>Owned fault</faultstring><detail>`
        + `<f:ForecastFault xmlns:f="urn:checked:forecast"><f:code>OWNED</f:code>${malformed ? '' : '<f:message>Independent fault detail</f:message>'}`
        + '</f:ForecastFault></detail></s:Fault></s:Body></s:Envelope>');
    });
    upstream.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('Owned port required');
    let app: import('fastify').FastifyInstance | undefined;
    try {
      const {buildServer} = await import(pathToFileURL(path.join(project, 'server.ts')).href) as {buildServer(config: object): Promise<import('fastify').FastifyInstance>};
      app = await buildServer({...example, localSource: path.resolve(project, example.localSource), fileRoots: example.fileRoots.map(root => path.resolve(project, root)),
        sourceResources: example.sourceResources.map(resource => ({...resource, uri: pathToFileURL(path.resolve(project, resource.uri)).href, file: path.resolve(project, resource.file)})),
        endpoint: `http://127.0.0.1:${address.port}/forecast`});
      expect((await app.inject({method: 'GET', url: '/health'})).json()).toEqual({status: 'ok'});
      expect((await app.inject({method: 'GET', url: '/openapi.json'})).statusCode).toBe(200);
      const post = (payload: unknown) => app!.inject({method: 'POST', url: '/v1/forecast/GetForecast', payload: payload as object});
      expect((await post({city: 'Paris', days: 'invalid'})).statusCode).toBe(400); expect(calls).toBe(0);
      const fault = await post({city: 'Paris', days: 2});
      expect(fault.statusCode).toBe(502); expect(fault.json()).toEqual(expected); expect(calls).toBe(1);
      malformed = true;
      const refused = await post({city: 'Paris', days: 2});
      expect(refused.statusCode).toBe(502); expect(refused.json()).not.toHaveProperty('value'); expect(calls).toBe(2);
      expect(failures).toEqual([]);
    } finally {await app?.close(); for (const socket of sockets) socket.destroy(); upstream.close(); await once(upstream, 'close');}
  }, 60_000);

  it('reports authorized dependency aliases before planning readiness or artifact writes', async () => {
    const {sources, project, options} = await setup();
    const actual = path.join(sources, 'schemas'); await mkdir(actual);
    await writeFile(path.join(actual, 'types.xsd'), schema);
    await symlink(actual, path.join(sources, 'alias'), 'junction');
    await writeFile(options.wsdl, fixture.replace('schemaLocation="import-relative-types-types.xsd"', 'schemaLocation="alias/types.xsd"'));
    const {planCheckedComponents, CheckedPlanningError} = await import('../../src/index.js');
    const report = await planCheckedComponents(options.wsdl);
    expect(report.ready).toBe(false); expect(report.blockers).toMatchObject([{category: 'unsupported-capability', reason: expect.stringContaining('retrieval aliases')}]);
    await expect(runGenerationPipeline({...options, checkedComponents: undefined})).rejects.toBeInstanceOf(CheckedPlanningError);
    await expect(readFile(path.join(project, 'client/client.ts'))).rejects.toMatchObject({code: 'ENOENT'});
  });
  it.each(['local', 'url'])('generates and runs a %s scoped record gateway without merging same-name source declarations', async sourceMode => {
    const {sources, project, options} = await setup(), namespace = 'urn:owned:wrapper';
    const name = (local: string) => ({namespace, local});
    const file = path.join(sources, 'wrapper.wsdl'), companion = path.join(sources, 'records.wsdl');
    for (const destination of [file, companion]) await writeFile(destination, await readFile(path.join('test/conformance/fixtures/xsd/standard-schema-element', path.basename(destination))));
    const selector = {portType: name('WrapperPortType'), binding: name('WrapperBinding'), operation: 'Fetch'};
    const configuration = {...options.checkedComponents!, selectors: [selector], service: name('WrapperService'), port: 'WrapperPort', sourceResources: [],
      standardLibraries: ['w3c-xsd10-schema-element-2004-v1'], recordProjections: [{selector, source: companion,
        recordSelector: {portType: name('RecordPortType'), binding: name('RecordBinding'), operation: 'Fetch'},
        spec: {version: 'component-record-scope-v1' as const, scope: 'records-with-declared-wrapper-scope' as const,
          payloadPath: [name('Envelope')], recordPath: [name('Records'), name('Record')], opaqueExclusions: [
            {path: [{namespace: 'http://www.w3.org/2001/XMLSchema', local: 'schema'}], reason: 'standard-schema-metadata' as const},
            {path: [name('Envelope')], reason: 'wrapper-declaration-universe' as const}]}}]};
    const remote = 'https://metadata.invalid/wrapper.wsdl';
    const {sourceResources: _snapshots, ...remoteConfiguration} = configuration;
    if (sourceMode === 'url') {
      const originalFetch = globalThis.fetch, bytes = await readFile(file, 'utf8');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => String(input) === remote ? new Response(bytes) : originalFetch(input, init));
    }
    const pipeline = {...options, wsdl: sourceMode === 'url' ? remote : file,
      checkedComponents: sourceMode === 'url' ? {...remoteConfiguration, sourceOrigins: [new URL(remote).origin]} : configuration};
    await runGenerationPipeline(pipeline);
    const document = JSON.parse(await readFile(path.join(project, 'openapi.json'), 'utf8')) as {paths: Record<string, {post: Record<string, unknown>}>};
    expect(document.paths['/api/v2/catalog/Fetch']!.post['x-response-projection']).toMatchObject({delivery: 'buffered', retainedValue: 'complete-companion-payload',
      spec: {scope: 'records-with-declared-wrapper-scope'}});
    const exampleFile = path.join(project, 'checked-gateway.example.json'), before = await readFile(exampleFile, 'utf8');
    await runGenerationPipeline(pipeline); expect(await readFile(exampleFile, 'utf8')).toBe(before);
    const scope = path.join(project, 'node_modules/@techspokes'); await mkdir(scope, {recursive: true});
    await symlink(process.cwd(), path.join(scope, 'typescript-wsdl-client'), 'junction');
    const check = path.join(project, 'tsconfig.check.json');
    await writeFile(check, JSON.stringify({extends: './tsconfig.json', compilerOptions: {noEmit: true, rootDir: process.cwd(),
      paths: {'@techspokes/typescript-wsdl-client': [path.resolve('src/index.ts')]}}}));
    await runOwnedNode([path.resolve('node_modules/typescript/bin/tsc'), '-p', check], {cwd: process.cwd(), timeoutMs: 60_000});
    const cert = await readFile('test/conformance/fixtures/soap/content-model/test-cert.pem', 'utf8');
    const key = await readFile('test/conformance/fixtures/soap/content-model/test-key.pem', 'utf8'), ca = path.join(project, 'test-ca.pem'); await writeFile(ca, cert);
    let calls = 0, invalid = false, mode = 'normal'; const failures: string[] = [], sockets = new Set<Socket>(), lifecycle = new EventEmitter();
    const upstream = createServer({cert, key}, async (request, response) => {
      let body = ''; for await (const chunk of request) body += String(chunk); calls++;
      if (request.headers.soapaction !== '"urn:owned:wrapper:fetch"' || !body.includes('owned &amp; probe')) failures.push('Independent request/action mismatch');
      if (mode === 'hang') {response.once('close', () => lifecycle.emit('cancelled')); lifecycle.emit('arrived'); return;}
      const payload = `<Envelope xmlns="urn:owned:wrapper" Stamp="synthetic"><Notice>preserved</Notice><Records><Record Code="0007"><Name>A &amp; B</Name><Active>${invalid ? 'invalid' : 'true'}</Active><Quantity>2</Quantity></Record></Records></Envelope>`;
      response.writeHead(mode.includes('fault') ? 500 : 200, {'Content-Type': 'text/xml; charset=utf-8'});
      response.end(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${mode.includes('fault')
        ? `<s:Fault><faultcode>s:Server</faultcode><faultstring>Synthetic fault</faultstring><detail><Problem xmlns="urn:owned:wrapper">${mode === 'fault' ? 'Synthetic detail' : '<Unexpected/>'}</Problem></detail></s:Fault>`
        : `<Envelope xmlns="urn:owned:wrapper"><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>${payload}</Envelope>`}</s:Body></s:Envelope>`);
    });
    upstream.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('Owned port required');
    const endpoint = `https://127.0.0.1:${address.port}/owned`;
    type Config = {localSource: string; fileRoots: string[]; sourceResources: {uri: string; file: string}[]; sourceOrigins: string[];
      recordSources: {selector: typeof selector; source: string}[]; standardLibraries: string[]};
    const example = JSON.parse(before) as Config;
    const config = {...example, localSource: path.resolve(project, example.localSource), fileRoots: example.fileRoots.map(root => path.resolve(project, root)),
      sourceResources: example.sourceResources.map(resource => ({uri: /^https?:/.test(resource.uri) ? resource.uri : pathToFileURL(path.resolve(project, resource.uri)).href, file: path.resolve(project, resource.file)})),
      recordSources: example.recordSources.map(record => ({...record, source: path.resolve(project, record.source)})), endpoint, allowedEndpoints: [endpoint], caFile: ca};
    expect(config.standardLibraries).toEqual(['w3c-xsd10-schema-element-2004-v1']);
    const {buildServer} = await import(pathToFileURL(path.join(project, 'server.ts')).href) as {buildServer(config: object): Promise<import('fastify').FastifyInstance>};
    let app: import('fastify').FastifyInstance | undefined;
    try {
      app = await buildServer(config); const base = await app.listen({host: '127.0.0.1', port: 0});
      const post = (signal?: AbortSignal) => fetch(base + '/api/v2/catalog/Fetch', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({Code: 'owned & probe'}), signal});
      const response = await post(); expect(response.status).toBe(200);
      expect(await response.json()).toEqual({Stamp: 'synthetic', Notice: 'preserved', Records: {Record: [{Code: '0007', Name: 'A & B', Active: true, Quantity: 2}]}});
      invalid = true; expect((await post()).status).toBe(502); expect(calls).toBe(2); expect(failures).toEqual([]);
      expect((await app.inject({method: 'POST', url: '/api/v2/catalog/Fetch', payload: {Code: 7}})).statusCode).toBe(400); expect(calls).toBe(2);
      mode = 'fault'; const fault = await post(); expect(fault.status).toBe(502);
      expect(await fault.json()).toMatchObject({fault: {name: 'Problem', string: 'Synthetic fault'}, value: 'Synthetic detail'});
      mode = 'invalid-fault'; const badFault = await post(); expect(badFault.status).toBe(502);
      expect(await badFault.json()).toMatchObject({kind: 'mismatch'});
      mode = 'hang'; const controller = new AbortController(), arrived = once(lifecycle, 'arrived'), cancelled = once(lifecycle, 'cancelled');
      const pending = post(controller.signal); const refused = expect(pending).rejects.toThrow();
      await arrived; controller.abort(); await refused; await cancelled; expect(calls).toBe(5);
      const copiedCompanion = config.recordSources[0]!.source, original = await readFile(copiedCompanion);
      await writeFile(copiedCompanion, Buffer.concat([original, Buffer.from('\n')]));
      try {expect((await post()).status).toBe(500); expect(calls).toBe(5);} finally {await writeFile(copiedCompanion, original);}
      await app.close(); app = undefined;
      for (const overridden of [{recordSources: []}, {standardLibraries: []}, {allowedEndpoints: []}]) {
        app = await buildServer({...config, ...overridden});
        expect((await app.inject({method: 'POST', url: '/api/v2/catalog/Fetch', payload: {Code: 'owned & probe'}})).statusCode).toBeGreaterThanOrEqual(500);
        expect(calls).toBe(5); await app.close(); app = undefined;
      }
    } finally {await app?.close(); for (const socket of sockets) socket.destroy(); upstream.close(); await once(upstream, 'close');}
  }, 120_000);

  it('refuses unknown/accessor configuration and duplicate operation selection without reading getters', async () => {
    const {options} = await setup(), config = parseCheckedComponentOptions(options.checkedComponents);
    expect(() => parseCheckedComponentOptions({...config, maxWork: 1})).toThrow(TypeError);
    expect(() => parseCheckedComponentOptions({...config, selectors: [config.selectors[0], config.selectors[0]]})).toThrow(TypeError);
    let reads = 0;
    const getter = {...config}; Object.defineProperty(getter, 'sourceResources', {get() {reads++; throw new Error('caller');}});
    expect(() => parseCheckedComponentOptions(getter)).toThrow(TypeError); expect(reads).toBe(0);
  });

  it('generates, typechecks and executes both prefixed operations, preserving scaffold ownership', async () => {
    const {project, options} = await setup();
    const result = await runGenerationPipeline(options);
    expect(result.checked).toMatchObject({model: 'checked-components-v1', operations: [
      {operation: 'SubmitImported', generated: true}, {operation: 'Other', generated: true},
    ]});
    const before = await readFile(path.join(project, 'client/client.ts'), 'utf8');
    const scaffold = path.join(project, 'server.ts'); await writeFile(scaffold, (await readFile(scaffold, 'utf8')) + '\n// consumer-owned marker\n');
    await runGenerationPipeline(options);
    expect(await readFile(path.join(project, 'client/client.ts'), 'utf8')).toBe(before);
    expect(await readFile(scaffold, 'utf8')).toContain('consumer-owned marker');
    await runGenerationPipeline({...options, app: {...options.app!, force: true}});
    expect(await readFile(scaffold, 'utf8')).not.toContain('consumer-owned marker');
    // @constraints Temporary source-development linkage is not independent installed-consumer evidence.
    const scope = path.join(project, 'node_modules/@techspokes'); await mkdir(scope, {recursive: true});
    await symlink(process.cwd(), path.join(scope, 'typescript-wsdl-client'), 'junction');
    const check = path.join(project, 'tsconfig.check.json');
    await writeFile(check, JSON.stringify({extends: './tsconfig.json', compilerOptions: {noEmit: true, rootDir: process.cwd(),
      paths: {'@techspokes/typescript-wsdl-client': [path.resolve('src/index.ts')]}}}));
    await runOwnedNode([path.resolve('node_modules/typescript/bin/tsc'), '-p', check], {cwd: process.cwd(), timeoutMs: 60_000});
    const cert = await readFile('test/conformance/fixtures/soap/content-model/test-cert.pem', 'utf8'), key = await readFile('test/conformance/fixtures/soap/content-model/test-key.pem', 'utf8');
    const ca = path.join(project, 'test-ca.pem'); await writeFile(ca, cert);
    const actions: string[] = [], sockets = new Set<Socket>();
    // Independent literals from the synthetic binding; neither expectations nor SOAP responses use a generator.
    const upstream = createServer({cert, key}, async (request, response) => {
      let body = ''; for await (const chunk of request) body += String(chunk);
      actions.push(String(request.headers.soapaction));
      if (!body.includes('synthetic-owned')) {response.writeHead(500); response.end('Independent request fixture mismatch'); return;}
      response.writeHead(200, {'Content-Type': 'text/xml; charset=utf-8'});
      response.end(`<s:Envelope xmlns:s="${soap}"><s:Body><r:SubmitImportedResponse xmlns:r="${ns}"><r:accepted>1</r:accepted></r:SubmitImportedResponse></s:Body></s:Envelope>`);
    });
    upstream.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('Owned port required');
    const endpoint = `https://127.0.0.1:${address.port}/owned`;
    type Config = {localSource: string; fileRoots: string[]; sourceResources: {uri: string; file: string}[]; sourceOrigins: string[]};
    const example = JSON.parse(await readFile(path.join(project, 'checked-gateway.example.json'), 'utf8')) as Config;
    const {buildServer} = await import(pathToFileURL(scaffold).href) as {buildServer(config: object): Promise<import('fastify').FastifyInstance>};
    let app: import('fastify').FastifyInstance | undefined;
    try {
      app = await buildServer({...example, localSource: path.resolve(project, example.localSource), fileRoots: example.fileRoots.map(root => path.resolve(project, root)),
        sourceResources: example.sourceResources.map(resource => ({uri: pathToFileURL(path.resolve(project, resource.uri)).href, file: path.resolve(project, resource.file)})),
        endpoint, allowedEndpoints: [endpoint], caFile: ca});
      const base = await app.listen({host: '127.0.0.1', port: 0});
      for (const operation of ['SubmitImported', 'Other']) {
        const response = await fetch(base + '/api/v2/catalog/' + operation, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({payload: {name: 'synthetic-owned'}})});
        expect(response.status).toBe(200); expect(await response.json()).toEqual({accepted: true});
      }
      expect(actions).toEqual(['"urn:SubmitImported"', '"urn:Other"']);
      expect((await app.inject({method: 'POST', url: '/api/v2/catalog/Other', payload: {payload: {name: 42}}})).statusCode).toBe(400);
      expect(actions).toHaveLength(2);
    } finally {await app?.close(); for (const socket of sockets) socket.destroy(); upstream.close(); await once(upstream, 'close');}
  }, 120_000);
});
