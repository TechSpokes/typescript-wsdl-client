import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {once} from 'node:events';
import type {Socket} from 'node:net';
import Fastify from 'fastify';
import type {FastifyPluginAsync} from 'fastify';
import {SaxesParser} from 'saxes';
import {selectComponentOperation, selectDirectOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {exchangeComponentSoap} from '../../src/compiler/directSoap.js';
import {createComponentSourceCapsule, reconstructComponentSourceCapsule, reconstructComponentSourceCapsuleForOperation} from '../../src/compiler/directSourceCapsule.js';
import {generateComponentClient, writeDirectClient} from '../../src/client/generateDirectClient.js';
import {generateComponentGateway} from '../../src/gateway/generateCheckedGateway.js';
import {checkedComponentRuntimeV1, checkedComponentRuntimeV2, checkedComponentRuntimeV3} from '../../src/index.js';
import {acceptComponentRuntime} from '../conformance/fixtures/compatibility/v1.2.0/component-runtime-contract.js';
import {runOwnedNode} from '../helpers/ownedNodeProcess.js';
import {composeCheckedDocumentation, validateCheckedDocumentation} from '../helpers/checkedDocumentation.js';

// @constraints Only package resolution is substituted; all source, runtime, HTTP and XML owners are production code.
vi.mock('@techspokes/typescript-wsdl-client', () => import('../../src/index.js'));

const ns = 'urn:conformance:soap12', soap12 = 'http://www.w3.org/2003/05/soap-envelope';
const soap11 = 'http://schemas.xmlsoap.org/soap/envelope/';
const fixture = path.resolve('test/conformance/fixtures/soap/versions');
const input = {value: 'owned & independent'};
const selector = (version: '11' | '12') => ({portType: {namespace: ns, local: 'PingType'}, binding: {namespace: ns, local: 'Soap' + version}, operation: 'Ping'});
const selection = (version: '11' | '12') => ({service: {namespace: ns, local: 'PingService'}, port: 'Port' + version});
let directory: string, original: string, response: string, fault: string;
beforeAll(async () => {
  await mkdir('tmp/conformance/soap12', {recursive: true});
  directory = await mkdtemp(path.resolve('tmp/conformance/soap12/suite-'));
  [original, response, fault] = await Promise.all(['document-literal.wsdl', 'response.xml', 'fault.xml'].map(file => readFile(path.join(fixture, file), 'utf8')));
});
afterAll(async () => {await rm(directory, {recursive: true, force: true});});

async function source(version: '11' | '12' = '12', text = original) {
  const root = await mkdtemp(path.join(directory, 'source-')), file = path.join(root, 'source.wsdl');
  await writeFile(file, text);
  const options = {loading: {policy: {fileRoots: [root]}}};
  const result = await selectComponentOperation(file, selector(version), options);
  if (result.kind !== 'selected') throw new Error(result.kind + ':' + result.rule);
  const mapping = createComponentValueMapping(result.contract, {kind: 'input'});
  if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind);
  return {root, file, options, contract: result.contract, mapping};
}

async function owned<T>(work: (server: {
  endpoint: string; requests: {path: string; xml: string; action?: string; contentType?: string}[];
  reply: (xml: string, status?: number, contentType?: string) => void;
}) => Promise<T>) {
  const sockets = new Set<Socket>();
  const requests: {path: string; xml: string; action?: string; contentType?: string}[] = [];
  let bytes = response, status = 200, contentType = 'application/soap+xml; charset=utf-8';
  const server = createServer(async (request, reply) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({path: request.url!, xml: Buffer.concat(chunks).toString('utf8'), action: request.headers.soapaction as string | undefined, contentType: request.headers['content-type']});
    const is11 = request.url === '/soap11';
    reply.writeHead(status, {'content-type': is11 ? 'text/xml; charset=utf-8' : contentType});
    reply.end(is11 ? bytes.replaceAll(soap12, soap11) : bytes);
  });
  server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned port required');
  try {return await work({endpoint: `http://127.0.0.1:${address.port}`, requests, reply(xml, code = 200, media = 'application/soap+xml; charset=utf-8') {bytes = xml; status = code; contentType = media;}});}
  finally {for (const socket of sockets) socket.destroy(); server.close(); await once(server, 'close');}
}

describe('SOAP 1.2 component binding and wire execution', () => {
  it('keeps the frozen pre-change SOAP 1.1 generated runtime interface assignable', () => {
    expect(acceptComponentRuntime(checkedComponentRuntimeV1)).toBe(checkedComponentRuntimeV1);
  });
  it('retains independent selected versions/actions through concurrent mixed-port calls and original WSDL addresses', async () => {
    await owned(async server => {
      const text = original.replaceAll('http://127.0.0.1:1', server.endpoint);
      const [v12, v11] = await Promise.all([source('12', text), source('11', text)]);
      expect(v12.contract.binding).toMatchObject({version: '1.2', action: 'urn:ping:12', actionRequired: true});
      expect(v11.contract.binding).toMatchObject({version: '1.1', action: 'urn:ping:11'});
      const results = await Promise.all([exchangeComponentSoap(v12.contract, v12.mapping, input, selection('12')),
        exchangeComponentSoap(v11.contract, v11.mapping, input, selection('11'))]);
      expect(results.map(result => result.kind)).toEqual(['soap-response', 'soap-response']);
      expect(server.requests).toHaveLength(2);
      const r12 = server.requests.find(request => request.path === '/soap12')!;
      const r11 = server.requests.find(request => request.path === '/soap11')!;
      expect(r12.action).toBeUndefined(); expect(r12.contentType).toBe('application/soap+xml; charset=utf-8; action="urn:ping:12"');
      expect(r11.action).toBe('"urn:ping:11"'); expect(r11.contentType).toBe('text/xml; charset=utf-8');
      for (const [request, namespace] of [[r12, soap12], [r11, soap11]] as const) {
        const names: string[] = [], parser = new SaxesParser({xmlns: true});
        parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`)); parser.write(request.xml).close();
        expect(names).toEqual([`{${namespace}}Envelope`, `{${namespace}}Body`, `{${ns}}Ping`, `{${ns}}value`]);
        expect(request.xml).toContain('owned &amp; independent');
      }
    });
  });

  it('does not synthesize an action when SOAP 1.2 explicitly makes it optional', async () => {
    const selected = await source('12', original.replace('soapAction="urn:ping:12"', 'soapActionRequired="false"'));
    await owned(async server => {
      const result = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection('12'), endpoint: server.endpoint + '/soap12'});
      expect(result.kind).toBe('soap-response');
      expect(server.requests[0]!.contentType).toBe('application/soap+xml; charset=utf-8');
      expect(server.requests[0]!.action).toBeUndefined();
    });
  });

  it('refuses missing required actions and keeps the shipped direct selector SOAP 1.1-only', async () => {
    const selected = await source();
    await writeFile(selected.file, original.replace('soapAction="urn:ping:12"', ''));
    expect(await selectComponentOperation(selected.file, selector('12'), selected.options)).toMatchObject({kind: 'unsupported', rule: 'soap-action-required'});
    const directSource = await readFile(path.resolve('test/conformance/fixtures/assessment/forecast.wsdl'), 'utf8');
    await writeFile(selected.file, directSource.replaceAll('http://schemas.xmlsoap.org/wsdl/soap/', 'http://schemas.xmlsoap.org/wsdl/soap12/'));
    expect(await selectDirectOperation(selected.file, {portType: {namespace: 'urn:checked:forecast', local: 'ForecastPortType'},
      binding: {namespace: 'urn:checked:forecast', local: 'ForecastBinding'}, operation: 'GetForecast'}, selected.options)).toMatchObject({kind: 'unsupported'});
  });

  it('roundtrips versioned capsules and refuses mixed binding artifacts before dispatch', async () => {
    const v12 = await source(), v11 = await source('11');
    const capsule = await createComponentSourceCapsule(v12.contract, selection('12'));
    if (capsule.kind !== 'component-capsule') throw new Error(capsule.kind);
    expect(JSON.parse(Buffer.from(capsule.bytes).toString()).compatibility.binding).toEqual({version: '1.2', actionRequired: true});
    expect(await reconstructComponentSourceCapsule(capsule.bytes, v12.file, v12.options)).toMatchObject({kind: 'reconstructed-component'});
    expect(await reconstructComponentSourceCapsuleForOperation(capsule.bytes, v11.contract, selection('11'))).toMatchObject({kind: 'incompatible-artifact'});
    await owned(async server => {
      const options = {localSource: v12.file, fileRoots: [v12.root], sourceResources: [], sourceOrigins: [], capsule: capsule.bytes,
        soap: {...selection('11'), endpoint: server.endpoint + '/soap12'}};
      expect(await checkedComponentRuntimeV2.execute(Buffer.from(capsule.bytes).toString('base64'), input, options, checkedComponentRuntimeV2.version)).toMatchObject({kind: 'incompatible-artifact'});
      expect(await checkedComponentRuntimeV1.execute(Buffer.from(capsule.bytes).toString('base64'), input,
        {...options, soap: {...options.soap, ...selection('12')}}, checkedComponentRuntimeV1.version)).toMatchObject({kind: 'incompatible-artifact'});
      expect(await checkedComponentRuntimeV3.execute(Buffer.from(capsule.bytes).toString('base64'), input,
        {...options, soap: {...options.soap, ...selection('12')}}, checkedComponentRuntimeV3.version)).toMatchObject({kind: 'incompatible-artifact'});
      expect(server.requests).toHaveLength(0);
    });
    const changed = JSON.parse(Buffer.from(capsule.bytes).toString()) as {versions: {scope: string}};
    changed.versions.scope = 'component-soap11-utf8-graph-v1';
    expect(await reconstructComponentSourceCapsule(Buffer.from(JSON.stringify(changed)), v12.file, v12.options)).toMatchObject({kind: 'incompatible-artifact'});
  });

  it('returns SOAP 1.1 protocol faults with original bytes and preserves older runtime refusals', async () => {
    const v11 = await source('11'), capsule = await createComponentSourceCapsule(v11.contract, selection('11'));
    if (capsule.kind !== 'component-capsule') throw new Error(capsule.kind);
    const literal = Buffer.from(capsule.bytes).toString('base64');
    const code = '<faultcode>s:Client</faultcode>', reason = '<faultstring>Not implemented</faultstring>';
    const envelope = (children: string) => `<s:Envelope xmlns:s="${soap11}" xmlns:t="${ns}"><s:Body><s:Fault>${children}</s:Fault></s:Body></s:Envelope>`;
    await owned(async server => {
      const soap = {...selection('11'), endpoint: server.endpoint + '/soap11'};
      const options = {localSource: v11.file, fileRoots: [v11.root], sourceResources: [], sourceOrigins: [], capsule: capsule.bytes, soap};
      for (const [suffix, legacyRule] of [
        ['', 'SOAP Fault children'],
        ['<detail/>', 'one declared SOAP Fault detail required'],
        ['<detail><t:Unknown/></detail>', 'unknown or ambiguous SOAP Fault detail'],
        ['<faultactor>urn:upstream</faultactor><detail><t:Unknown/><t:Other/></detail>', 'one declared SOAP Fault detail required'],
      ] as const) {
        const bytes = envelope(code + reason + suffix);
        server.reply(bytes, 500);
        const expected = {kind: 'soap-fault', admitted: false, status: 500, responseBytes: new Uint8Array(Buffer.from(bytes)),
          fault: {version: '1.1', code: {namespace: soap11, local: 'Client'}, string: 'Not implemented',
            ...(suffix.startsWith('<faultactor>') ? {actor: 'urn:upstream'} : {})}};
        const native = await exchangeComponentSoap(v11.contract, v11.mapping, input, soap);
        expect(native).toMatchObject(expected);
        expect(native).not.toHaveProperty('decoded');
        const generated = await checkedComponentRuntimeV3.execute(literal, input, options, checkedComponentRuntimeV3.version);
        expect(generated).toMatchObject(expected);
        expect(generated).not.toHaveProperty('value');
        expect(generated).not.toHaveProperty('fault.name');
        expect(await checkedComponentRuntimeV1.execute(literal, input, options, checkedComponentRuntimeV1.version)).toMatchObject({kind: 'protocol', rule: legacyRule});
        expect(await checkedComponentRuntimeV2.execute(literal, input, options, checkedComponentRuntimeV2.version)).toMatchObject({kind: 'protocol', rule: legacyRule});
      }
      const declared = '<t:Problem><t:code>MISSING</t:code><t:message>Missing input</t:message></t:Problem>';
      server.reply(envelope(code + reason + '<detail>' + declared + '</detail>'), 500);
      expect(await checkedComponentRuntimeV3.execute(literal, input, options, checkedComponentRuntimeV3.version)).toMatchObject({
        kind: 'soap-fault', fault: {name: 'Problem'}, value: {code: 'MISSING', message: 'Missing input'}});
      for (const [children, kind] of [
        [code + reason + '<detail><t:Problem/></detail>', 'mismatch'],
        [code + reason + '<detail><t:Other/>' + declared + '</detail>', 'protocol'],
        [code + reason + '<detail>' + declared + declared + '</detail>', 'protocol'],
        [code + reason + '<detail>unmapped scalar</detail>', 'protocol'],
        [code + reason + '<detail/><detail/>', 'protocol'],
        [reason + code, 'protocol'], [code + code + reason, 'protocol'], [code.replace('s:Client', 'unbound:Client') + reason, 'protocol'],
      ] as const) {
        server.reply(envelope(children), 500);
        const refused = await exchangeComponentSoap(v11.contract, v11.mapping, input, soap);
        expect(refused).toMatchObject({kind});
        expect(refused).not.toHaveProperty('decoded');
      }
    });
  });

  it('decodes declared detail, nested QName subcodes and ordered multilingual reasons on HTTP 400', async () => {
    const selected = await source();
    await owned(async server => {
      server.reply(fault, 400);
      const result = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection('12'), endpoint: server.endpoint + '/soap12'});
      expect(result).toMatchObject({kind: 'soap-fault', status: 400, fault: {name: 'Problem', version: '1.2', code: {namespace: soap12, local: 'Sender'},
        subcodes: [{namespace: 'urn:owned:problem', local: 'Invalid'}, {namespace: 'urn:owned:precise', local: 'Missing'}],
        reasons: [{lang: 'en', text: 'Invalid request'}, {lang: 'fr', text: 'Requete invalide'}], string: 'Invalid request', node: 'urn:owned:node'},
        decoded: {validated: {value: {code: 'MISSING', message: 'Missing input'}}}});
    });
  });

  it('accepts an unqualified application subcode while retaining QName identity', async () => {
    const selected = await source();
    await owned(async server => {
      server.reply(fault.replace('<e:Value>p:Invalid</e:Value>', '<e:Value xmlns="">LocalProblem</e:Value>'), 400);
      const result = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection('12'), endpoint: server.endpoint + '/soap12'});
      expect(result).toMatchObject({kind: 'soap-fault', fault: {code: {namespace: soap12, local: 'Sender'},
        subcodes: [{namespace: '', local: 'LocalProblem'}, {namespace: 'urn:owned:precise', local: 'Missing'}]}});
    });
  });

  it('exposes a valid fault without application detail without inventing a typed value', async () => {
    const selected = await source(), bytes = fault.replace(/<e:Detail>[\s\S]*?<\/e:Detail>/, '');
    await owned(async server => {
      server.reply(bytes, 500);
      const result = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection('12'), endpoint: server.endpoint + '/soap12'});
      expect(result).toMatchObject({kind: 'soap-fault', status: 500, fault: {version: '1.2', string: 'Invalid request'}});
      expect(result).not.toHaveProperty('decoded'); expect(result).not.toHaveProperty('fault.name');
      expect(result).toHaveProperty('responseBytes', new Uint8Array(Buffer.from(bytes)));
    });
  });

  it.each(['envelope', 'media', 'detail', 'reason-language', 'duplicate-body', 'code-nbsp', 'subcode-nbsp', 'code-no-namespace'] as const)('refuses malformed or incompatible %s without publishing a value', async change => {
    const selected = await source();
    await owned(async server => {
      const bytes = change === 'envelope' ? response.replaceAll(soap12, soap11)
        : change === 'detail' ? fault.replace('<t:message>Missing input</t:message>', '')
        : change === 'reason-language' ? fault.replace(' xml:lang="en"', '')
        : change === 'code-nbsp' ? fault.replace('<e:Value>e:Sender</e:Value>', '<e:Value>\u00a0e:Sender\u00a0</e:Value>')
        : change === 'subcode-nbsp' ? fault.replace('<e:Value>p:Invalid</e:Value>', '<e:Value>\u00a0p:Invalid\u00a0</e:Value>')
        : change === 'code-no-namespace' ? fault.replace('<e:Value>e:Sender</e:Value>', '<e:Value xmlns="">Sender</e:Value>')
        : change === 'duplicate-body' ? response.replace('</e:Envelope>', '<e:Body/></e:Envelope>') : response;
      server.reply(bytes, 200, change === 'media' ? 'text/xml' : 'application/soap+xml');
      const result = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection('12'), endpoint: server.endpoint + '/soap12'});
      expect(result.kind).not.toBe('soap-response'); expect(result.kind).not.toBe('soap-fault');
      expect(result).not.toHaveProperty('decoded');
    });
  });

  it('runs the generated client and gateway with the same response/fault schemas', async context => {
    const selected = await source();
    const capsule = await createComponentSourceCapsule(selected.contract, selection('12'));
    if (capsule.kind !== 'component-capsule') throw new Error(capsule.kind);
    const fresh = await reconstructComponentSourceCapsule(capsule.bytes, selected.file, selected.options);
    if (fresh.kind !== 'reconstructed-component') throw new Error(fresh.kind);
    const generated = await generateComponentClient(fresh);
    if (generated.kind !== 'generated-component-client') throw new Error(generated.kind);
    const clientDir = path.join(selected.root, 'client'), gatewayDir = path.join(selected.root, 'gateway');
    await mkdir(clientDir); writeDirectClient(path.join(clientDir, 'client.ts'), generated);
    await generateComponentGateway(fresh, {clientDir, gatewayDir, openapiFile: path.join(selected.root, 'openapi.json'), routePath: '/v1/ping'});
    const composed=composeCheckedDocumentation(JSON.parse(await readFile(path.join(selected.root,'openapi.json'),'utf8')));
    const validateFault=validateCheckedDocumentation(composed,'/v1/ping','fault');
    const faultMetadata={name:'Problem',version:'1.2',code:{namespace:soap12,local:'Sender'},string:'Invalid request',
      subcodes:[],reasons:[{lang:'en',text:'Invalid request'}]};
    expect(validateFault({fault:faultMetadata,value:{code:'MISSING',message:'Missing input'}})).toBe(true);
    expect(validateFault({fault:faultMetadata,value:{code:7,message:'Missing input'}})).toBe(false);
    expect(validateFault({fault:{...faultMetadata,reasons:[]},value:{code:'MISSING',message:'Missing input'}})).toBe(false);
    const config = path.join(selected.root, 'tsconfig.json');
    await writeFile(config, JSON.stringify({extends: path.resolve('tsconfig.json'), compilerOptions: {noEmit: true, rootDir: process.cwd(),
      paths: {'@techspokes/typescript-wsdl-client': [path.resolve('src/index.ts')]}}, include: ['client/*.ts', 'gateway/*.ts']}));
    await runOwnedNode([path.resolve('node_modules/typescript/bin/tsc'), '-p', config], {cwd: process.cwd(), timeoutMs: 60_000, signal: context.signal});
    const client = await import(pathToFileURL(path.join(clientDir, 'client.ts')).href) as {createClient: (runtime: typeof checkedComponentRuntimeV2) => {Ping: (input: unknown, options: object) => Promise<unknown>}};
    await owned(async server => {
      const options = {localSource: selected.file, fileRoots: [selected.root], sourceResources: [], sourceOrigins: [], capsule: capsule.bytes,
        soap: {...selection('12'), endpoint: server.endpoint + '/soap12'}};
      expect(await client.createClient(checkedComponentRuntimeV2).Ping(input, options)).toMatchObject({kind: 'soap-response', value: input});
      const plugin = (await import(pathToFileURL(path.join(gatewayDir, 'plugin.ts')).href)).default as FastifyPluginAsync<{clientOptions: typeof options}>;
      const app = Fastify(); await app.register(plugin, {clientOptions: options});
      try {
        expect((await app.inject({method: 'POST', url: '/v1/ping', payload: input})).json()).toEqual(input);
        server.reply(fault, 400);
        const declared = await app.inject({method: 'POST', url: '/v1/ping', payload: input});
        expect(declared.statusCode).toBe(502); expect(declared.json()).toMatchObject({fault: {name: 'Problem', version: '1.2'}, value: {code: 'MISSING', message: 'Missing input'}});
        server.reply(fault.replace(/<e:Detail>[\s\S]*?<\/e:Detail>/, ''), 500);
        const generic = await app.inject({method: 'POST', url: '/v1/ping', payload: input});
        expect(generic.statusCode).toBe(502); expect(generic.json()).toMatchObject({fault: {version: '1.2', reasons: [{lang: 'en', text: 'Invalid request'}, {lang: 'fr', text: 'Requete invalide'}]}});
        expect(generic.json()).not.toHaveProperty('value');
      } finally {await app.close();}
    });
  }, 120_000);

  it('runs a generated SOAP 1.1 gateway with no declared faults against an owned protocol fault', async context => {
    const text = original.replace(/<w:fault[^>]*\/>/g, '').replace(/<w:fault\b[\s\S]*?<\/w:fault>/g, '');
    const selected = await source('11', text);
    expect(selected.contract.faults).toHaveLength(0);
    const capsule = await createComponentSourceCapsule(selected.contract, selection('11'));
    if (capsule.kind !== 'component-capsule') throw new Error(capsule.kind);
    const fresh = await reconstructComponentSourceCapsule(capsule.bytes, selected.file, selected.options);
    if (fresh.kind !== 'reconstructed-component') throw new Error(fresh.kind);
    const generated = await generateComponentClient(fresh);
    if (generated.kind !== 'generated-component-client') throw new Error(generated.kind);
    const clientDir = path.join(selected.root, 'client'), gatewayDir = path.join(selected.root, 'gateway');
    await mkdir(clientDir); writeDirectClient(path.join(clientDir, 'client.ts'), generated);
    await generateComponentGateway(fresh, {clientDir, gatewayDir, openapiFile: path.join(selected.root, 'openapi.json'), routePath: '/v1/ping'});
    const config = path.join(selected.root, 'tsconfig.json');
    await writeFile(config, JSON.stringify({extends: path.resolve('tsconfig.json'), compilerOptions: {noEmit: true, rootDir: process.cwd(),
      paths: {'@techspokes/typescript-wsdl-client': [path.resolve('src/index.ts')]}}, include: ['client/*.ts', 'gateway/*.ts']}));
    await runOwnedNode([path.resolve('node_modules/typescript/bin/tsc'), '-p', config], {cwd: process.cwd(), timeoutMs: 60_000, signal: context.signal});
    await owned(async server => {
      server.reply(`<s:Envelope xmlns:s="${soap11}"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>Owned protocol failure</faultstring></s:Fault></s:Body></s:Envelope>`, 500);
      const options = {localSource: selected.file, fileRoots: [selected.root], sourceResources: [], sourceOrigins: [], capsule: capsule.bytes,
        soap: {...selection('11'), endpoint: server.endpoint + '/soap11'}};
      const plugin = (await import(pathToFileURL(path.join(gatewayDir, 'plugin.ts')).href)).default as FastifyPluginAsync<{clientOptions: typeof options}>;
      const app = Fastify(); await app.register(plugin, {clientOptions: options});
      try {
        const result = await app.inject({method: 'POST', url: '/v1/ping', payload: input});
        expect(result.statusCode).toBe(502);
        expect(result.json()).toEqual({fault: {version: '1.1', code: {namespace: soap11, local: 'Client'}, string: 'Owned protocol failure'}});
        expect(server.requests).toHaveLength(1);
      } finally {await app.close();}
    });
  }, 120_000);
});
