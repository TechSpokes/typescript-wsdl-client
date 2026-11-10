/** Test-only private-dist consumer. Copied outside the checkout before execution. */
import assert from 'node:assert/strict';
import {readFile, realpath, mkdir, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import type * as Operation from '../../src/compiler/directOperation.js';
import type * as Values from '../../src/compiler/directValues.js';
import type * as Codec from '../../src/compiler/directCodec.js';
import type * as Capsules from '../../src/compiler/directSourceCapsule.js';
import type * as PublicApi from '../../src/index.js';
import type {CompiledCatalog} from '../../src/compiler/schemaCompiler.js';

const root = await realpath(process.cwd());
const installed = await realpath(path.join(root, 'node_modules/@techspokes/typescript-wsdl-client'));
assert.equal(installed, path.join(root, 'node_modules/@techspokes/typescript-wsdl-client'));
const privateModule = (name: string) => pathToFileURL(path.join(installed, 'dist/compiler', name + '.js')).href;
const op: typeof Operation = await import(privateModule('directOperation'));
const values: typeof Values = await import(privateModule('directValues'));
const codec: typeof Codec = await import(privateModule('directCodec'));
const capsules: typeof Capsules = await import(privateModule('directSourceCapsule'));
const historical = process.argv[2]!;
await assert.rejects(readFile(historical), {code: 'ERR_ACCESS_DENIED'});
if (process.argv[3] === 'composition-runtime') {
  const {default: Fastify} = await import('fastify');
  const generated = await import(pathToFileURL(path.join(root, 'compiled/composition/entry/plugin.js')).href);
  const observed: Record<string, Array<{action: string | undefined; endpoint: string | undefined; xml: string}>> = {main: [], content: []};
  const mainServer = createServer(async (request, response) => {
    let xml = '';
    for await (const chunk of request) xml += String(chunk);
    observed.main.push({action: request.headers.soapaction as string | undefined, endpoint: request.url, xml});
    response.setHeader('content-type', 'text/xml');
    response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ReadResponse xmlns="urn:composition:main"><Entry Scope="main-reply"><Value>installed-main</Value></Entry></ReadResponse></s:Body></s:Envelope>');
  });
  const contentServer = createServer(async (request, response) => {
    let xml = '';
    for await (const chunk of request) xml += String(chunk);
    observed.content.push({action: request.headers.soapaction as string | undefined, endpoint: request.url, xml});
    response.setHeader('content-type', 'text/xml');
    response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ReadResponse xmlns="urn:composition:content"><Entry Revision="7"><Count>42</Count></Entry></ReadResponse></s:Body></s:Envelope>');
  });
  const app = Fastify();
  try {
    mainServer.listen(0, '127.0.0.1'); contentServer.listen(0, '127.0.0.1');
    await Promise.all([once(mainServer, 'listening'), once(contentServer, 'listening')]);
    const clients = generated.createClients({main: {source: path.join(root, 'authorized/composition-main.wsdl')},
      content: {source: path.join(root, 'authorized/composition-content.wsdl')}});
    for (const [key, server] of [['main', mainServer], ['content', contentServer]] as const) {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Owned installed endpoint required');
      (await clients[key].soapClient()).setEndpoint(`http://127.0.0.1:${address.port}/${key}-owned`);
    }
    await app.register(generated.default, {clients});
    const discovery = await app.inject({method: 'GET', url: '/openapi.json'});
    assert.equal(discovery.statusCode, 200, discovery.body);
    const spec = discovery.json();
    assert.equal(spec.paths['/main/read'].post.operationId, 'main.Read');
    assert.equal(spec.paths['/content/read'].post.operationId, 'content.Read');
    const main = await app.inject({method: 'POST', url: '/main/read', payload: {Entry: {Scope: 'main-request', Lookup: 'installed'}}});
    const content = await app.inject({method: 'POST', url: '/content/read', payload: {Entry: {Revision: 3, Index: 2}}});
    assert.equal(main.statusCode, 200, main.body); assert.equal(content.statusCode, 200, content.body);
    assert.deepEqual(main.json(), {status: 'SUCCESS', message: null, data: {Entry: {Scope: 'main-reply', Value: 'installed-main'}}, error: null});
    assert.deepEqual(content.json(), {status: 'SUCCESS', message: null, data: {Entry: {Revision: 7, Count: 42}}, error: null});
    assert.deepEqual(observed.main.map(({action, endpoint}) => ({action, endpoint})), [{action: '"urn:composition:main:Read"', endpoint: '/main-owned'}]);
    assert.deepEqual(observed.content.map(({action, endpoint}) => ({action, endpoint})), [{action: '"urn:composition:content:Read"', endpoint: '/content-owned'}]);
    assert.match(observed.main[0].xml, /Scope="main-request"/); assert.match(observed.main[0].xml, /<[^>]*Lookup>installed</);
    assert.match(observed.content[0].xml, /Revision="3"/); assert.match(observed.content[0].xml, /<[^>]*Index>2</);
    assert.doesNotMatch(observed.main[0].xml, /Revision/); assert.doesNotMatch(observed.content[0].xml, /Scope/);
    const invalid = await app.inject({method: 'POST', url: '/main/read', payload: {Entry: {Revision: 3, Index: 2}}});
    assert.equal(invalid.statusCode, 400); assert.equal(observed.main.length, 1); assert.equal(observed.content.length, 1);
  } finally {
    await app.close();
    for (const server of [mainServer, contentServer]) server.closeAllConnections();
    await Promise.all([mainServer, contentServer].map(server => new Promise<void>(done => server.close(() => done()))));
  }
  console.log(JSON.stringify({kind: 'native-composition-installed', services: 2, soapDispatches: 2, checkoutDenied: true}));
  process.exit(0);
}
let fetches = 0;
globalThis.fetch = async () => {fetches++; throw new Error('Network forbidden');};
const namespace = 'urn:checked:forecast';
const selector = {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'};
const source = path.join(root, 'authorized/source.wsdl');
const loading = {policy: {fileRoots: [path.dirname(source)]}};
const fresh = await op.selectDirectOperation(source, selector, {loading});
assert.equal(fresh.kind, 'selected');
const contract = fresh.contract;
const evidence = op.inspectDirectOperation(contract).evidence;
assert.equal(evidence.kind, 'qualified-source');
if (evidence.kind !== 'qualified-source') throw new Error('Direct capsule source qualification required');
assert.equal(evidence.eligible, true);
assert.ok(!op.isRpcMessageRoot(contract.input), 'Existing direct artifacts retain their document element roots');
assert.equal(contract.input.element.name.local, 'GetForecast');
assert.equal(contract.binding.action, 'urn:checked:GetForecast');
const mapping = values.createDirectValueMapping(contract, {kind: 'input'});
assert.equal(mapping.kind, 'direct-mapping');
const encoded = codec.encodeDirectXml(contract, mapping, {city: 'Paris', days: 2});
assert.equal(encoded.kind, 'direct-encoded');
assert.deepEqual(mapping.slots.map(s => [s.element.name.local, s.builtin.local]), [['city', 'string'], ['days', 'int']]);
const saved: unknown = JSON.parse(await readFile(path.join(root, 'saved.json'), 'utf8'));
assert.throws(() => op.inspectDirectOperation(saved as Operation.DirectOperationContract), TypeError);
assert.throws(() => op.inspectDirectOperation(JSON.parse(JSON.stringify(contract)) as Operation.DirectOperationContract), TypeError);
assert.throws(() => values.inspectDirectValueMapping(JSON.parse(JSON.stringify(mapping)), contract), TypeError);
assert.throws(() => op.inspectDirectOperation({kind: 'assessment-report', eligible: true} as unknown as Operation.DirectOperationContract), TypeError);
const bytes = await readFile(source);
const digest = createHash('sha256').update(bytes).digest('hex');
const offlineResources = new Map([[pathToFileURL(source).href, {bytes, digest: '0'.repeat(64)}]]);
assert.equal((await op.selectDirectOperation(source, selector, {loading: {...loading, offlineResources}})).kind, 'loading-refused');
assert.equal((await op.selectDirectOperation(source, selector, {loading: {policy: {}, offlineResources: new Map([[pathToFileURL(source).href, {bytes, digest}]])}})).kind, 'loading-refused');
assert.equal((await op.selectDirectOperation(historical, selector, {loading: {...loading, offlineResources: new Map([[pathToFileURL(historical).href, {bytes, digest}]])}})).kind, 'loading-refused');
assert.equal((await op.selectDirectOperation('https://example.invalid/source.wsdl', selector, {loading})).kind, 'loading-refused');
assert.equal(fetches, 0);
const capsuleBytes = await readFile(path.join(root, 'capsule.json'));
const first = await capsules.reconstructDirectSourceCapsule(capsuleBytes, source, {policy: loading.policy});
assert.equal(first.kind, 'reconstructed-direct');
assert.equal(first.contract.admitted, false);
assert.notEqual(first.contract, contract);
await mkdir(path.join(root, 'relocated'));
const relocated = path.join(root, 'relocated/copied.wsdl');
await copyFile(source, relocated);
const next = await capsules.reconstructDirectSourceCapsule(capsuleBytes, relocated, {policy: {fileRoots: [path.dirname(relocated)]}});
assert.equal(next.kind, 'reconstructed-direct');
assert.notEqual(first.contract, next.contract);
assert.equal(capsules.checkDirectSourceCompatibility(first, next.contract, next.selection).kind, 'compatible-direct');
assert.throws(() => capsules.checkDirectSourceCompatibility(JSON.parse(JSON.stringify(first)), next.contract, next.selection), TypeError);
assert.equal(codec.encodeDirectXml(next.contract, next.mappings[0], {city: 'Paris', days: 2}).kind, 'direct-encoded');
assert.equal((await capsules.reconstructDirectSourceCapsule(capsuleBytes, historical, {policy: loading.policy})).kind, 'missing-authority');
assert.equal(fetches, 0);
const publicPackage = '@techspokes/typescript-wsdl-client';
const api: typeof PublicApi = await import(publicPackage);
const log = console.log;
let scoped: CompiledCatalog;
try {
  console.log = () => undefined;
  const generated = await api.runGenerationPipeline({wsdl: path.join(root, 'authorized/scoped.wsdl'),
    catalogOut: path.join(root, 'scoped/client/catalog.json'), clientOutDir: path.join(root, 'scoped/client'),
    openapi: {outFile: path.join(root, 'scoped/openapi.json'), flattenArrayWrappers: false},
    gateway: {outDir: path.join(root, 'scoped/gateway'), serviceSlug: 'scoped-wire', versionSlug: 'v1'},
  });
  scoped = generated.compiled as CompiledCatalog;
  assert.equal(typeof api.runMultiServicePipeline, 'function');
  const composition = await api.runMultiServicePipeline({
    services: ['main', 'content'].map(key => ({key, generation: {
      wsdl: path.join(root, `authorized/composition-${key}.wsdl`),
      catalogOut: path.join(root, 'composition/sources', key, 'model/catalog.json'),
      clientOutDir: path.join(root, 'composition/sources', key, 'model'), compiler: {imports: 'js' as const},
      openapi: {outFile: path.join(root, 'composition/sources', key, 'native.json'), basePath: `/${key}`},
      gateway: {outDir: path.join(root, 'composition/adapters', key), serviceSlug: key, versionSlug: 'v1'},
    }})),
    openapi: {outFile: path.join(root, 'composition/published/openapi.json')},
    gateway: {outDir: path.join(root, 'composition/entry'), imports: 'js'},
  });
  assert.deepEqual(Object.keys(composition.openapiDoc.paths), ['/content/read', '/main/read']);
  await api.runGenerationPipeline({wsdl: path.join(root, 'authorized/stream-mapping.wsdl'),
    catalogOut: path.join(root, 'streamed/catalog.json'), clientOutDir: path.join(root, 'streamed'), compiler: {imports: 'js'},
    streamConfig: api.parseStreamConfig({operations: {Read: {recordType: 'Record', recordPath: ['ReadResponse', 'Record'], format: 'ndjson'}}}),
  });
} finally {console.log = log;}
const declaration = (owner: string) => scoped.types.find(type => type.name === owner)!.elems[0].tsType;
const requestEntry = declaration('ReadRequest'), responseEntry = declaration('ReadResponse');
assert.notEqual(requestEntry, responseEntry);
assert.deepEqual(scoped.types.find(type => type.name === requestEntry)!.elems.map(element => element.name), ['LeftOnly']);
assert.deepEqual(scoped.types.find(type => type.name === responseEntry)!.elems.map(element => element.name), ['RightOnly']);
assert.deepEqual(scoped.meta.attrSpec[requestEntry], ['Code']);
assert.deepEqual(scoped.meta.attrSpec[responseEntry], ['Code']);
assert.equal(fetches, 0);
console.log(JSON.stringify({kind: 'fresh-installed-authority', admitted: contract.admitted, digest, slots: mapping.slots.length, fetches,
  legacyScopedDeclarations: 2, nativeCompositionServices: 2, generatedStreamingClient: true}));
