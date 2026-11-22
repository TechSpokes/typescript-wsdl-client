import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {copyFile, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {MIMEType} from 'node:util';
import type {FastifyInstance} from 'fastify';
import {SaxesParser} from 'saxes';
import {runOwnedNode} from '../test/helpers/ownedNodeProcess.js';
import {lockedDependencies} from './lib/candidate-package.js';

interface Pin {
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly uri: string;
  readonly canonicalUri?: string;
}

const [archiveArgument, pinsArgument, evidenceArgument] = process.argv.slice(2);
const npm = process.env.npm_execpath;
assert.ok(npm && archiveArgument && pinsArgument && evidenceArgument,
  'Usage: npm run verify:onvif-media -- <tarball> <original-files-directory> <evidence-directory>');
const archive = path.resolve(archiveArgument);
const pinDirectory = path.resolve(pinsArgument);
const evidence = path.resolve(evidenceArgument);
const manifest = new URL('../test/fixtures/wsdl/real-services/onvif-media/provenance.json', import.meta.url);
const {resources: pins} = JSON.parse(await readFile(manifest, 'utf8')) as {resources: Pin[]};
assert.equal(pins.length, 11);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
await mkdir(evidence, {recursive: true});

const temporary = await realpath(tmpdir());
const work = await realpath(await mkdtemp(path.join(temporary, 'wsdl-onvif-media-')));
assert.equal(path.dirname(work), temporary);
const env: NodeJS.ProcessEnv = {...process.env, NODE_USE_SYSTEM_CA: '1', npm_config_cache: path.resolve('tmp/cache/npm')};
delete env.NODE_PATH;
const run = (args: string[], cwd = work) => runOwnedNode(args, {cwd, env, timeoutMs: 180_000, maxBuffer: 4 * 1024 * 1024});

const media = 'http://www.onvif.org/ver10/media/wsdl';
const schema = 'http://www.onvif.org/ver10/schema';
const soap = 'http://www.w3.org/2003/05/soap-envelope';
const vendor = 'urn:owned:media-extension';
const operation = 'GetSnapshotUri';
const action = `${media}/${operation}`;
const token = '00017 & camera';
const uri = 'https://example.invalid/frame?value=1&size=2';
const envelope = (body: string) => `<s:Envelope xmlns:s="${soap}" xmlns:m="${media}" xmlns:t="${schema}"
  xmlns:v="${vendor}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><s:Body>${body}</s:Body></s:Envelope>`;
const fields = `<t:Uri>${uri.replaceAll('&', '&amp;')}</t:Uri><t:InvalidAfterConnect>false</t:InvalidAfterConnect>
  <t:InvalidAfterReboot>false</t:InvalidAfterReboot><t:Timeout>PT0S</t:Timeout>`;
const known = '<m:GetGuaranteedNumberOfVideoEncoderInstancesResponse><m:TotalNumber>3</m:TotalNumber></m:GetGuaranteedNumberOfVideoEncoderInstancesResponse>';
const unknown = '<v:Uri v:mode="007"> 04 &amp; <v:Flag/> </v:Uri>';
const responseBody = (payload: string) => `<m:GetSnapshotUriResponse><m:MediaUri v:hint="008">${payload}</m:MediaUri></m:GetSnapshotUriResponse>`;
const calls: {method?: string; url?: string; xml: string; contentType?: string; soapAction?: string | string[]}[] = [];
let response = responseBody(fields + known + unknown), upstreamStatus = 200;
const upstream = createServer(async (request, reply) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  calls.push({method: request.method, url: request.url, xml: Buffer.concat(chunks).toString('utf8'),
    contentType: request.headers['content-type'], soapAction: request.headers.soapaction});
  reply.writeHead(upstreamStatus, {'content-type': 'application/soap+xml; charset=utf-8'}).end(envelope(response));
});

try {
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address === 'object');
  const endpoint = `http://127.0.0.1:${address.port}/media`;
  await writeFile(path.join(work, 'package.json'), '{"private":true,"type":"module"}\n');
  const dependencies = lockedDependencies(['fastify', 'ajv', 'soap', 'typescript', 'vitest', '@types/node']);
  const installed = await run([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline', archive, ...dependencies]);
  await writeFile(path.join(evidence, 'install.log'), installed.stdout + installed.stderr);

  const inputs = path.join(work, 'inputs');
  await mkdir(inputs);
  const sourceResources = await Promise.all(pins.map(async pin => {
    const file = path.join(inputs, pin.file);
    await copyFile(path.join(pinDirectory, pin.file), file);
    const bytes = await readFile(file);
    assert.equal(bytes.length, pin.bytes, pin.file);
    assert.equal(hash(bytes), pin.sha256, pin.file);
    return {file, uri: pin.uri, ...(pin.canonicalUri ? {canonicalUri: pin.canonicalUri} : {})};
  }));
  const source = path.join(inputs, 'owned.wsdl');
  await writeFile(source, `<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
    xmlns:s="http://schemas.xmlsoap.org/wsdl/soap12/" xmlns:m="${media}" targetNamespace="urn:owned:onvif-media">
    <wsdl:import namespace="${media}" location="https://www.onvif.org/ver10/media/wsdl/media.wsdl"/>
    <wsdl:service name="OwnedMedia"><wsdl:port name="OwnedPort" binding="m:MediaBinding">
      <s:address location="${endpoint}"/>
    </wsdl:port></wsdl:service>
  </wsdl:definitions>`);
  const project = path.join(work, 'project'), config = path.join(work, 'checked.json');
  const report = path.join(evidence, 'plan.json');
  const choices = {service: {namespace: 'urn:owned:onvif-media', local: 'OwnedMedia'}, port: 'OwnedPort',
    selectors: [{operation, portType: {namespace: media, local: 'Media'}, binding: {namespace: media, local: 'MediaBinding'}}],
    fileRoots: [inputs], sourceResources, sourceOrigins: [...new Set(sourceResources.map(resource => new URL(resource.uri).origin))]};
  const scoped = {...choices, qualificationScope: 'lax-wildcard-operation-v1'};
  const configure = (value: object) => writeFile(config, JSON.stringify(value));
  const denyMetadata = path.join(work, 'deny-metadata.mjs');
  await writeFile(denyMetadata, 'globalThis.fetch = async () => { console.error("unexpected metadata fetch"); throw new Error("unexpected metadata fetch"); };\n');
  const cli = path.join(work, 'node_modules/@techspokes/typescript-wsdl-client/dist/cli.js');
  const generation = ['--import', pathToFileURL(denyMetadata).href, cli, 'pipeline', '--model', 'checked-components-v1',
    '--wsdl-source', source, '--checked-config', config, '--client-dir', path.join(project, 'client'),
    '--openapi-file', path.join(project, 'openapi.json'), '--gateway-dir', path.join(project, 'gateway'),
    '--gateway-version-prefix', 'v1', '--gateway-service-name', 'onvif', '--init-app', '--app-dir', project,
    '--test-dir', path.join(project, 'test')];
  const refused = async (expected: RegExp) => {
    await assert.rejects(run(generation), (error: Error & {stderr?: string}) => {
      const detail = error.stderr ?? error.message;
      assert.doesNotMatch(detail, /unexpected metadata fetch/);
      assert.match(detail, expected);
      return true;
    });
    await assert.rejects(readFile(path.join(project, 'openapi.json')), {code: 'ENOENT'});
    assert.equal(calls.length, 0);
  };
  await configure(choices);
  await refused(/cos-nonambig/);
  await configure({...choices, qualificationScope: 'closed-operation-v1'});
  await refused(/operation-wildcard-dependency/);
  await configure({...scoped, sourceResources: sourceResources.filter(pin => !pin.file.endsWith('bf-2.xsd'))});
  await refused(/missing-dependency/);
  await configure(scoped);
  const generated = await run([...generation, '--checked-report', report]);
  assert.doesNotMatch(generated.stderr, /unexpected metadata fetch/);
  const plan = JSON.parse(await readFile(report, 'utf8')) as {ready: boolean; dimensions: {sourceLegality: string}; inventory: {operations: number}};
  assert.ok(plan.ready);
  assert.equal(plan.dimensions.sourceLegality, 'disproved');
  assert.equal(plan.inventory.operations, 79);
  const artifacts = () => Promise.all(['openapi.json', 'client/operations/0/contract.json', 'server.ts'].map(file => readFile(path.join(project, file))));
  const initial = await artifacts();
  const capsule = JSON.parse(initial[1]!.toString()) as {versions: {scope: string}; resources: {base64?: string}[]};
  assert.equal(capsule.versions.scope, 'component-soap12-lax-wildcard-operation-v1');
  assert.equal(capsule.resources.length, 12);
  assert.ok(capsule.resources.every(resource => resource.base64 === undefined));
  await run(generation);
  assert.deepEqual(await artifacts(), initial);

  const tests = await run([npm, 'test'], project);
  await writeFile(path.join(evidence, 'scaffold-test.log'), tests.stdout + tests.stderr);
  const build = await run([npm, 'run', 'build'], project);
  await writeFile(path.join(evidence, 'build.log'), build.stdout + build.stderr);
  const relocated = path.join(work, 'relocated');
  await rename(project, relocated);
  await rename(inputs, path.join(work, 'unavailable-inputs'));
  const {buildServer} = await import(pathToFileURL(path.join(relocated, 'dist/server.js')).href) as {
    buildServer(config: {allowedEndpoints: string[]}): Promise<FastifyInstance>;
  };
  const app = await buildServer({allowedEndpoints: [endpoint]});
  const route = '/v1/onvif/' + operation;
  const fetchBefore = globalThis.fetch;
  let metadataFetches = 0;
  globalThis.fetch = async () => {metadataFetches++; throw new Error('unexpected metadata fetch');};
  try {
    const post = (payload: object = {ProfileToken: token}) => app.inject({method: 'POST', url: route, payload});
    assert.equal((await post({})).statusCode, 400);
    assert.equal(calls.length, 0);
    const result = await post();
    assert.equal(result.statusCode, 200, result.body);
    const {MediaUri} = result.json();
    assert.deepEqual(MediaUri.$attributes, [{hint: {$namespace: vendor, $value: '008'}}]);
    assert.deepEqual(MediaUri.$content.slice(0, 5), [{Uri: uri}, {InvalidAfterConnect: false}, {InvalidAfterReboot: false}, {Timeout: 'PT0S'},
      {GetGuaranteedNumberOfVideoEncoderInstancesResponse: {$namespace: media, TotalNumber: 3}}]);
    const extension = MediaUri.$content[5].Uri;
    assert.equal(extension.$namespace, vendor);
    assert.deepEqual(extension.$attributes, [{mode: {$namespace: vendor, $value: '007'}}]);
    assert.deepEqual(extension.$content, [{$value: ' 04 & '}, {Flag: {$namespace: vendor, $content: []}}, {$value: ' '}]);
    for (const invalid of [
      fields.replace('<t:Timeout>PT0S</t:Timeout>', ''),
      fields + known.replace('>3<', '>invalid<'),
      fields + '<v:Uri xsi:type="m:Unknown"/>',
      fields + '<v:Uri><m:GetGuaranteedNumberOfVideoEncoderInstancesResponse/></v:Uri>',
    ]) {
      response = responseBody(invalid);
      const result = await post();
      assert.equal(result.statusCode, 502, result.body);
      assert.ok(!Object.hasOwn(result.json(), 'MediaUri'));
    }
    response = '<s:Fault><s:Code><s:Value>s:Receiver</s:Value></s:Code><s:Reason><s:Text xml:lang="en">Owned media fault</s:Text></s:Reason></s:Fault>';
    upstreamStatus = 500;
    const fault = await post();
    assert.equal(fault.statusCode, 502);
    assert.deepEqual(fault.json().fault.code, {namespace: soap, local: 'Receiver'});
    assert.equal(fault.json().fault.string, 'Owned media fault');
    assert.equal(calls.length, 6);
    for (const call of calls) {
      assert.equal(call.method, 'POST');
      assert.equal(call.url, '/media');
      const type = new MIMEType(call.contentType ?? '');
      assert.equal(type.essence, 'application/soap+xml');
      assert.equal(type.params.get('action'), action);
      assert.equal(call.soapAction, undefined);
      const names: string[] = [], lexical: string[] = [];
      const parser = new SaxesParser({xmlns: true});
      parser.on('opentag', node => names.push(`{${node.uri}}${node.local}`));
      parser.on('text', value => {if (value.trim()) lexical.push(value);});
      parser.write(call.xml).close();
      assert.deepEqual(names, [`{${soap}}Envelope`, `{${soap}}Body`, `{${media}}${operation}`, `{${media}}ProfileToken`]);
      assert.deepEqual(lexical, [token]);
    }
    const denied = await buildServer({allowedEndpoints: []});
    try {
      const result = await denied.inject({method: 'POST', url: route, payload: {ProfileToken: token}});
      assert.equal(result.statusCode, 502);
      assert.match(result.body, /endpoint authorization/);
    } finally {await denied.close();}
    const snapshots = JSON.parse(await readFile(path.join(relocated, 'client/source-resources.json'), 'utf8')) as {
      resources: {digest: string; file: string}[];
    };
    const missing = snapshots.resources.find(resource => resource.digest === pins.find(pin => pin.file === 'bf-2.xsd')!.sha256);
    assert.ok(missing);
    const snapshot = path.join(relocated, 'client', missing.file);
    const bytes = await readFile(snapshot);
    await rename(snapshot, snapshot + '.unavailable');
    assert.equal((await post()).statusCode, 500);
    await writeFile(snapshot, Buffer.concat([bytes, Buffer.from('\n<!-- changed snapshot -->')]));
    const stale = await post();
    assert.equal(stale.statusCode, 500);
    assert.match(stale.body, /local-source-changed|source-graph-changed/);
    assert.equal(calls.length, 6);
    assert.equal(metadataFetches, 0);
  } finally {
    globalThis.fetch = fetchBefore;
    await app.close();
  }
  const installedManifest = JSON.parse(await readFile(path.join(work, 'node_modules/@techspokes/typescript-wsdl-client/package.json'), 'utf8')) as {version: string};
  const receipt = {version: installedManifest.version, archiveSha256: hash(await readFile(archive)), operation,
    pins: pins.length, discovered: plan.inventory.operations, generated: 1, wholeSourceLegality: plan.dimensions.sourceLegality,
    deterministic: true, scaffoldTestsBeforeBuild: true, strictBuild: true, relocated: true, successStatus: 200,
    invalidInputStatus: 400, invalidUpstreamStatus: 502, faultStatus: 502, metadataFetches, soapDispatches: calls.length};
  await writeFile(path.join(evidence, 'wire.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  if (upstream.listening) {
    upstream.closeAllConnections();
    await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()));
  }
  await rm(work, {recursive: true, force: true, maxRetries: 5, retryDelay: 150});
}
