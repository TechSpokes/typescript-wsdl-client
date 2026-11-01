import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import Fastify from 'fastify';
import type {FastifyPluginAsync} from 'fastify';
import {createServer, type RequestListener} from 'node:http';
import {createServer as createSecureServer} from 'node:https';
import {once} from 'node:events';
import type {Socket} from 'node:net';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {SaxesParser} from 'saxes';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {exchangeComponentSoap} from '../../src/compiler/directSoap.js';
import type {ComponentSoapOptions} from '../../src/compiler/directSoap.js';
import {createComponentSourceCapsule, reconstructComponentSourceCapsule} from '../../src/compiler/directSourceCapsule.js';
import {checkedComponentRuntimeV1} from '../../src/index.js';
import {generateComponentClient, writeDirectClient} from '../../src/client/generateDirectClient.js';
import {generateComponentGateway} from '../../src/gateway/generateCheckedGateway.js';
import {runOwnedNode} from '../helpers/ownedNodeProcess.js';

// @constraints Source integration substitutes only package resolution, using the actual native runtime, not successful-response mocks.
vi.mock('@techspokes/typescript-wsdl-client', () => import('../../src/index.js'));

const ns = 'urn:conformance:import-relative-types', soap = 'http://schemas.xmlsoap.org/soap/envelope/';
const p = 'http://schemas.xmlsoap.org/ws/2004/09/policy', s = 'http://schemas.xmlsoap.org/ws/2005/07/securitypolicy';
// Synthetic policy and response are specified independently from the implementation.
const policy = `<p:Policy xmlns:p="${p}" xmlns:s="${s}"><s:TransportBinding><p:Policy><s:TransportToken><p:Policy><s:HttpsToken RequireClientCertificate="false"/></p:Policy></s:TransportToken><s:AlgorithmSuite><p:Policy><s:Basic256/></p:Policy></s:AlgorithmSuite><s:Layout><p:Policy><s:Strict/></p:Policy></s:Layout></p:Policy></s:TransportBinding></p:Policy>`;
const reply = `<soap:Envelope xmlns:soap="${soap}"><soap:Body><r:SubmitImportedResponse xmlns:r="${ns}"><r:accepted>1</r:accepted></r:SubmitImportedResponse></soap:Body></soap:Envelope>`;
const input = {payload: {name: 'synthetic & owned'}};
let directory: string, original: string, schema: string, cert: string, key: string;
beforeAll(async () => {
  await mkdir('tmp/conformance/component-soap', {recursive: true});
  directory = await mkdtemp(path.resolve('tmp/conformance/component-soap/suite-'));
  [original, schema, cert, key] = await Promise.all([
    readFile('test/conformance/fixtures/xsd/imports/import-relative-types.wsdl', 'utf8'),
    readFile('test/conformance/fixtures/xsd/imports/import-relative-types-types.xsd', 'utf8'),
    readFile('test/conformance/fixtures/soap/content-model/test-cert.pem', 'utf8'),
    readFile('test/conformance/fixtures/soap/content-model/test-key.pem', 'utf8'),
  ]);
});
afterAll(async () => {await rm(directory, {recursive: true, force: true});});
async function selected(assertion?: string): Promise<DirectOperationContract> {
  const root = await mkdtemp(path.join(directory, 'source-')), file = path.join(root, 'source.wsdl');
  await writeFile(file, original.replace('<soap:binding style=', (assertion ?? '') + '<soap:binding style='));
  await writeFile(path.join(root, 'import-relative-types-types.xsd'), schema);
  const result = await selectComponentOperation(file, {portType: {namespace: ns, local: 'ImportPortType'},
    binding: {namespace: ns, local: 'ImportBinding'}, operation: 'SubmitImported'}, {loading: {policy: {fileRoots: [root]}}});
  if (result.kind !== 'selected') throw new Error(result.kind + ':' + result.rule);
  await rm(root, {recursive: true});
  return result.contract;
}
function mapping(contract: DirectOperationContract) {
  const result = createComponentValueMapping(contract, {kind: 'input'});
  if (result.kind !== 'component-mapping') throw new Error(result.kind);
  return result;
}
async function owned<T>(secure: boolean, bytes: string | undefined, work: (state: {
  options: ComponentSoapOptions; requests: {xml: string; action?: string}[]; received: Promise<void>; sockets: Set<Socket>;
  setResponse: (xml: string) => void;
}) => Promise<T>): Promise<T> {
  const requests: {xml: string; action?: string}[] = [], sockets = new Set<Socket>();
  let received!: () => void;
  const receivedPromise = new Promise<void>(resolve => {received = resolve;});
  const listener: RequestListener = (request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({xml: Buffer.concat(chunks).toString(), action: request.headers.soapaction === undefined ? undefined : String(request.headers.soapaction)}); received();
      if (bytes !== undefined) {response.writeHead(200, {'Content-Type': 'text/xml; charset=utf-8'}); response.end(bytes);}
    });
  };
  const server = secure ? createSecureServer({cert, key}, listener) : createServer(listener);
  server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned address required');
  const endpoint = `${secure ? 'https' : 'http'}://127.0.0.1:${address.port}/owned`;
  try {
    return await work({options: {service: {namespace: ns, local: 'ImportService'}, port: 'ImportPort', endpoint,
      allowEndpoint: url => url.href === endpoint, ...(secure ? {ca: cert} : {})}, requests, received: receivedPromise, sockets,
      setResponse: xml => {bytes = xml;}});
  } finally {for (const socket of sockets) socket.destroy(); server.close(); await once(server, 'close');}
}

describe('component SOAP exchange through the existing dependency and native checks', () => {
  it('uses the package-root checked runtime with physical imported sources and refuses artifact/source drift', async () => {
    const root = await mkdtemp(path.join(directory, 'runtime-')), file = path.join(root, 'source.wsdl');
    const dependency = path.join(root, 'import-relative-types-types.xsd');
    await writeFile(file, original.replace('<soap:binding style=', policy + '<soap:binding style='));
    await writeFile(dependency, schema);
    const selected = await selectComponentOperation(file, {portType: {namespace: ns, local: 'ImportPortType'},
      binding: {namespace: ns, local: 'ImportBinding'}, operation: 'SubmitImported'}, {loading: {policy: {fileRoots: [root]}}});
    if (selected.kind !== 'selected') throw new Error(selected.kind);
    const artifact = await createComponentSourceCapsule(selected.contract, {service: {namespace: ns, local: 'ImportService'}, port: 'ImportPort'});
    if (artifact.kind !== 'component-capsule') throw new Error(artifact.kind);
    const literal = Buffer.from(artifact.bytes).toString('base64');
    await owned(true, reply, async server => {
      const options = {localSource: file, fileRoots: [root], capsule: artifact.bytes, sourceResources: [{uri: pathToFileURL(dependency).href, file: dependency}],
        sourceOrigins: [], soap: server.options};
      const execute = (value: unknown, config = options) => checkedComponentRuntimeV1.execute(literal, value, config, checkedComponentRuntimeV1.version);
      expect(await execute(input)).toMatchObject({kind: 'soap-response', value: {accepted: true}});
      expect(server.requests).toHaveLength(1);
      const fresh = await reconstructComponentSourceCapsule(artifact.bytes, file, {loading: {policy: {fileRoots: [root]}}});
      if (fresh.kind !== 'reconstructed-component') throw new Error(fresh.kind);
      const generated = await generateComponentClient(fresh);
      if (generated.kind !== 'generated-component-client') throw new Error(generated.kind);
      const clientDir = path.join(root, 'client'), gatewayDir = path.join(root, 'gateway');
      await mkdir(clientDir); writeDirectClient(path.join(clientDir, 'client.ts'), generated);
      await generateComponentGateway(fresh, {clientDir, gatewayDir, openapiFile: path.join(root, 'openapi.json'), routePath: '/v1/import/submit'});
      const config = path.join(root, 'tsconfig.json');
      await writeFile(config, JSON.stringify({extends: path.resolve('tsconfig.json'), compilerOptions: {noEmit: true,
        rootDir: process.cwd(), paths: {'@techspokes/typescript-wsdl-client': [path.resolve('src/index.ts')]}}, include: ['client/*.ts', 'gateway/*.ts']}));
      await runOwnedNode([path.resolve('node_modules/typescript/bin/tsc'), '-p', config], {cwd: process.cwd(), timeoutMs: 60_000});
      const plugin = (await import(pathToFileURL(path.join(gatewayDir, 'plugin.ts')).href)).default as FastifyPluginAsync<{clientOptions: typeof options}>;
      const gateway = Fastify();
      gateway.post('/host', {schema: {body: {type: 'object', properties: {n: {type: 'integer'}, mode: {type: 'string', default: 'host'}}, additionalProperties: false}}}, request => request.body);
      try {
        await gateway.register(plugin, {clientOptions: options});
        const url = await gateway.listen({host: '127.0.0.1', port: 0});
        const post = (route: string, value: unknown) => fetch(url + route, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)});
        const response = await post('/v1/import/submit', input);
        expect(response.status).toBe(200); expect(await response.json()).toEqual({accepted: true});
        server.setResponse(reply.replace('>1<', '>TRUE<'));
        expect((await post('/v1/import/submit', input)).status).toBe(502);
        server.setResponse(reply);
        expect((await post('/v1/import/submit', {payload: {name: 23}})).status).toBe(400);
        expect((await post('/v1/import/submit', [input])).status).toBe(400);
        expect(await (await post('/host', {n: '7', extra: true})).json()).toEqual({n: 7, mode: 'host'});
      } finally {await gateway.close();}
      expect(server.requests).toHaveLength(3);
      expect(await execute(input, {...options, capsule: Buffer.from('different artifact')})).toMatchObject({kind: 'incompatible-artifact', rule: 'generated-capsule-mismatch'});
      expect(await execute({payload: {name: 23}})).toMatchObject({kind: 'value-invalid', phase: 'input'});
      expect(await execute(input, {...options, sourceResources: []})).toMatchObject({kind: 'missing-authority'});
      expect(await checkedComponentRuntimeV1.execute(literal, input, {...options, budget: {maxWork: 1}} as typeof options, checkedComponentRuntimeV1.version))
        .toMatchObject({kind: 'unsupported', rule: 'data-only checked component options required'});
      await writeFile(dependency, schema + '\n');
      expect(await execute(input)).toMatchObject({kind: 'incompatible-artifact', rule: 'local-source-changed'});
      expect(server.requests).toHaveLength(3);
    });
  });

  it.each([false, true])('executes imported nested values with literal wire expectations (HTTPS=%s)', async secure => {
    const contract = await selected(secure ? policy : undefined), map = mapping(contract);
    await owned(secure, reply, async server => {
      const result = await exchangeComponentSoap(contract, map, input, server.options);
      expect(result).toMatchObject({kind: 'soap-response', status: 200, decoded: {kind: 'component-decoded', validated: {value: {accepted: true}}}});
      expect(server.requests).toHaveLength(1); expect(server.requests[0]!.action).toBe('"urn:SubmitImported"');
      const names: string[] = [], values: string[] = [];
      const parser = new SaxesParser({xmlns: true});
      parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`)); parser.on('text', text => values.push(text));
      parser.write(server.requests[0]!.xml).close();
      expect(names).toEqual([`{${soap}}Envelope`, `{${soap}}Body`, `{${ns}}SubmitImported`, `{${ns}}payload`, `{${ns}:types}name`]);
      expect(values).toEqual(['synthetic & owned']);
      expect(JSON.parse(JSON.stringify(input))).toEqual(input);
    });
  });

  it('rejects invalid input, endpoint denial and insecure policy downgrade before any upstream request', async () => {
    const contract = await selected(policy), map = mapping(contract);
    await owned(true, reply, async server => {
      const invalid = {payload: {name: 42, extra: true}}, before = JSON.stringify(invalid);
      expect(await exchangeComponentSoap(contract, map, invalid, server.options)).toMatchObject({kind: 'value-invalid'});
      expect(JSON.stringify(invalid)).toBe(before);
      expect(await exchangeComponentSoap(contract, map, input, {...server.options, allowEndpoint: () => false})).toMatchObject({kind: 'unsupported', rule: 'endpoint authorization'});
      expect(await exchangeComponentSoap(contract, map, input, {...server.options, ca: undefined,
        endpoint: server.options.endpoint.replace('https:', 'http:')})).toMatchObject({kind: 'unsupported', rule: 'policy requires HTTPS'});
      expect(server.requests).toHaveLength(0);
    });
  });

  it('keeps certificate verification enabled and rejects invalid upstream booleans', async () => {
    const contract = await selected(policy), map = mapping(contract);
    await owned(true, reply.replace('>1<', '>TRUE<'), async server => {
      expect(await exchangeComponentSoap(contract, map, input, {...server.options, ca: undefined})).toMatchObject({kind: 'transport'});
      expect(server.requests).toHaveLength(0);
      expect(await exchangeComponentSoap(contract, map, input, server.options)).toMatchObject({kind: 'scalar-invalid', phase: 'response'});
      expect(server.requests).toHaveLength(1);
    });
  });

  it('validates declared fault detail through the component codec and rejects malformed detail', async () => {
    const root = path.resolve('test/conformance/fixtures/assessment');
    const selected = await selectComponentOperation(path.join(root, 'forecast.wsdl'), {
      portType: {namespace: 'urn:checked:forecast', local: 'ForecastPortType'},
      binding: {namespace: 'urn:checked:forecast', local: 'ForecastBinding'}, operation: 'GetForecast',
    }, {loading: {policy: {fileRoots: [root]}}});
    if (selected.kind !== 'selected') throw new Error(selected.kind);
    const contract = selected.contract, map = mapping(contract);
    const bytes = await readFile(path.join(root, 'forecast-messages/fault.xml'), 'utf8');
    for (const malformed of [false, true]) await owned(false, malformed ? bytes.replace('<t:code>NOT_FOUND</t:code>', '') : bytes, async server => {
      const result = await exchangeComponentSoap(contract, map, {city: 'Paris', days: 2}, {...server.options,
        service: {namespace: 'urn:checked:forecast', local: 'ForecastService'}, port: 'ForecastPort'});
      if (malformed) expect(result.kind).toBe('mismatch');
      else {
        expect(result).toMatchObject({kind: 'soap-fault', fault: {name: 'ForecastError'},
          decoded: {kind: 'component-decoded', validated: {value: {code: 'NOT_FOUND', message: 'Unknown city'}}}});
        if (result.kind !== 'soap-fault') throw new Error(result.kind);
        expect(JSON.parse(JSON.stringify(result.decoded.validated.value))).toEqual({code: 'NOT_FOUND', message: 'Unknown city'});
      }
    });
  });

  it.each([policy.replace('RequireClientCertificate="false"', 'RequireClientCertificate="true"'),
    policy.replace('<s:Layout>', '<s:IncludeTimestamp/><s:Layout>')])('refuses unimplemented security requirements before I/O', async assertion => {
    const contract = await selected(assertion), map = mapping(contract);
    await owned(true, reply, async server => {
      expect(await exchangeComponentSoap(contract, map, input, server.options)).toMatchObject({kind: 'unsupported', rule: 'message security or client certificate capability required'});
      expect(server.requests).toHaveLength(0);
    });
  });

  it('cancels a live HTTPS request and closes its owned connection', async () => {
    const contract = await selected(policy), map = mapping(contract);
    await owned(true, undefined, async server => {
      const controller = new AbortController();
      const pending = exchangeComponentSoap(contract, map, input, {...server.options, signal: controller.signal});
      await server.received; controller.abort();
      expect(await pending).toMatchObject({kind: 'cancelled'});
      await expect.poll(() => server.sockets.size).toBe(0);
    });
  });
});
