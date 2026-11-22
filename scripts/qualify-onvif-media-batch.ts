import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {FastifyInstance} from 'fastify';
import type {CheckedComponentPlan, planCheckedComponents} from '../src/index.js';
import {runOwnedNode} from '../test/helpers/ownedNodeProcess.js';
import {lockedDependencies} from './lib/candidate-package.js';
import {checkRequest, encoderRoutes, envelope, existingRoutes, media, snapshotRoute} from './lib/onvif-media-wire.js';
import type {WireCall} from './lib/onvif-media-wire.js';
import {publishedSha256, selector, surveyMedia} from './lib/onvif-media-survey.js';
import type {WireResult} from './lib/onvif-media-survey.js';
import {roundTripMediaEncoders} from './lib/onvif-media-codec.js';

interface Pin {
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly uri: string;
  readonly canonicalUri?: string;
}

const [archiveArgument, pinsArgument, evidenceArgument, batch, baseline, gitTree] = process.argv.slice(2);
const npm = process.env.npm_execpath;
assert.ok(npm && archiveArgument && pinsArgument && evidenceArgument,
  'Usage: npm run verify:onvif-media -- <tarball> <original-files-directory> <evidence-directory> [--baseline-batch | --candidate-batch <baseline-evidence-directory> <git-tree>]');
assert.ok(batch === undefined || batch === '--baseline-batch' || batch === '--candidate-batch', 'Unknown batch mode');
assert.ok(batch !== '--candidate-batch' || (baseline && /^[a-f0-9]{40}$/.test(gitTree ?? '')), 'Candidate requires baseline evidence and Git tree');
const archive = path.resolve(archiveArgument);
const pinDirectory = path.resolve(pinsArgument);
const evidence = path.resolve(evidenceArgument);
const manifest = new URL('../test/fixtures/wsdl/real-services/onvif-media/provenance.json', import.meta.url);
const manifestBytes = await readFile(manifest);
const {resources: pins, onvifRevision} = JSON.parse(manifestBytes.toString()) as {resources: Pin[]; onvifRevision: string};
assert.equal(pins.length, 11);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const archiveSha256 = hash(await readFile(archive));
if (batch === '--baseline-batch') assert.equal(archiveSha256, publishedSha256);
await mkdir(evidence, {recursive: true});
const save = (file: string, data: unknown) => writeFile(path.join(evidence, file), JSON.stringify(data, null, 2) + '\n');

const temporary = await realpath(tmpdir());
const work = await realpath(await mkdtemp(path.join(temporary, 'wsdl-onvif-media-')));
assert.equal(path.dirname(work), temporary);
const env: NodeJS.ProcessEnv = {...process.env, NODE_USE_SYSTEM_CA: '1', npm_config_cache: path.resolve('tmp/cache/npm')};
delete env.NODE_PATH;
const run = (args: string[], cwd = work) => runOwnedNode(args, {cwd, env, timeoutMs: 180_000, maxBuffer: 4 * 1024 * 1024});

const routes = batch === '--candidate-batch' ? [...existingRoutes, ...encoderRoutes] : batch ? existingRoutes : [snapshotRoute];
const operations = routes.map(route => route.operation);
const service = {namespace: 'urn:owned:onvif-media', local: 'OwnedMedia'};
const port = 'OwnedPort';
const wrapper = (endpoint: string) => `<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
    xmlns:s="http://schemas.xmlsoap.org/wsdl/soap12/" xmlns:m="${media}" targetNamespace="${service.namespace}">
    <wsdl:import namespace="${media}" location="https://www.onvif.org/ver10/media/wsdl/media.wsdl"/>
    <wsdl:service name="${service.local}"><wsdl:port name="${port}" binding="m:MediaBinding">
      <s:address location="${endpoint}"/>
    </wsdl:port></wsdl:service>
  </wsdl:definitions>`;
const surveyWrapper = wrapper('http://127.0.0.1:1/media');
const identity = {archiveSha256, gitTree, onvifRevision, pins: pins.length, pinManifestSha256: hash(manifestBytes),
  surveyWrapperSha256: hash(Buffer.from(surveyWrapper)), node: process.version, npm: process.env.npm_config_user_agent?.split(' ')[0]};
const calls: WireCall[] = [];
const wireResults: WireResult[] = [];
let response = '', upstreamStatus = 200;
const upstream = createServer(async (request, reply) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const responseXml = envelope(response);
  calls.push({method: request.method, url: request.url, xml: Buffer.concat(chunks).toString('utf8'),
    contentType: request.headers['content-type'], soapAction: request.headers.soapaction, responseXml, responseStatus: upstreamStatus});
  reply.writeHead(upstreamStatus, {'content-type': 'application/soap+xml; charset=utf-8'}).end(responseXml);
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
  const entry = createRequire(path.join(work, 'package.json')).resolve('@techspokes/typescript-wsdl-client');
  assert.ok(entry.startsWith(path.join(work, 'node_modules') + path.sep));

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
  const wireWrapper = wrapper(endpoint);
  await writeFile(source, wireWrapper);
  const project = path.join(work, 'project'), config = path.join(work, 'checked.json');
  const report = path.join(evidence, 'plan.json');
  const choices = {service, port, selectors: operations.map(selector),
    fileRoots: [inputs], sourceResources, sourceOrigins: [...new Set(sourceResources.map(resource => new URL(resource.uri).origin))]};
  const scoped = {...choices, qualificationScope: 'lax-wildcard-operation-v1'};
  const configure = (value: object) => writeFile(config, JSON.stringify(value));
  const denyMetadata = path.join(work, 'deny-metadata.mts');
  await writeFile(denyMetadata, 'globalThis.fetch = async () => { console.error("unexpected metadata fetch"); throw new Error("unexpected metadata fetch"); };\n');
  const cli = path.join(path.dirname(entry), 'cli.js');
  const generation = ['--import', pathToFileURL(denyMetadata).href, cli, 'pipeline', '--model', 'checked-components-v1',
    '--wsdl-source', source, '--checked-config', config, '--client-dir', path.join(project, 'client'),
    '--openapi-file', path.join(project, 'openapi.json'), '--gateway-dir', path.join(project, 'gateway'),
    '--gateway-version-prefix', 'v1', '--gateway-service-name', 'onvif', '--init-app', '--app-dir', project,
    '--test-dir', path.join(project, 'test')];
  const refusals: {operation: string; mode: string; diagnostic: string}[] = [];
  const refused = async (operation: string, mode: string, options: object, expected: RegExp) => {
    await configure(options);
    await assert.rejects(run(generation), (error: Error & {stderr?: string}) => {
      const detail = error.stderr ?? error.message;
      assert.doesNotMatch(detail, /unexpected metadata fetch/);
      assert.match(detail, expected);
      refusals.push({operation, mode, diagnostic: detail});
      return true;
    });
    await assert.rejects(readFile(path.join(project, 'openapi.json')), {code: 'ENOENT'});
    assert.equal(calls.length, 0);
  };
  const snapshot = {...choices, selectors: [selector(snapshotRoute.operation)]};
  const unavailable = path.join(work, 'unavailable-inputs');
  let inputsMoved = false, stage = 'generation refusal controls';
  let wireFailure: unknown;
  try {
    await refused(snapshotRoute.operation, 'whole-source', snapshot, /cos-nonambig/);
    await refused(snapshotRoute.operation, 'closed-operation-v1', {...snapshot, qualificationScope: 'closed-operation-v1'}, /operation-wildcard-dependency/);
    await refused(snapshotRoute.operation, 'missing-pin', {...snapshot, qualificationScope: scoped.qualificationScope,
      sourceResources: sourceResources.filter(pin => !pin.file.endsWith('bf-2.xsd'))}, /missing-dependency/);
    if (batch) await refused('GetProfiles', scoped.qualificationScope, {...scoped, selectors: [selector('GetProfiles')]}, /cos-nonambig/);
    await save('generation-refusals.json', refusals);
    stage = 'combined generation';
    await configure(scoped);
    const generated = await run([...generation, '--checked-report', report]);
    assert.doesNotMatch(generated.stdout + generated.stderr, /unexpected metadata fetch/);
    const plan = JSON.parse(await readFile(report, 'utf8')) as CheckedComponentPlan;
    assert.ok(plan.ready);
    assert.equal(plan.dimensions.sourceLegality, 'disproved');
    assert.equal(plan.inventory.operations, 79);
    assert.deepEqual(plan.selection?.selectors.map(item => item.operation).sort(), [...operations].sort());
    const artifacts = async () => {
      const files = (await readdir(project, {recursive: true, withFileTypes: true})).filter(item => item.isFile());
      return (await Promise.all(files.map(async item => {
        const file = path.join(item.parentPath, item.name);
        return [path.relative(project, file).split(path.sep).join('/'), hash(await readFile(file))] as const;
      }))).sort(([first], [second]) => first.localeCompare(second, 'en'));
    };
    const initial = await artifacts();
    const capsules = initial.filter(([file]) => /^client\/operations\/[^/]+\/contract\.json$/.test(file));
    assert.equal(capsules.length, routes.length);
    const capsuleOperations = [];
    for (const [file] of capsules) {
      const capsule = JSON.parse(await readFile(path.join(project, file), 'utf8')) as {
        versions: {scope: string}; resources: {base64?: string}[]; compatibility: {selector: ReturnType<typeof selector>};
      };
      assert.equal(capsule.versions.scope, 'component-soap12-lax-wildcard-operation-v1');
      assert.equal(capsule.resources.length, 12);
      assert.ok(capsule.resources.every(resource => resource.base64 === undefined));
      assert.deepEqual(capsule.compatibility.selector, selector(capsule.compatibility.selector.operation));
      capsuleOperations.push(capsule.compatibility.selector.operation);
    }
    assert.deepEqual(capsuleOperations.sort(), [...operations].sort());
    const routePath = (operation: string) => '/v1/onvif/' + operation;
    const openapiFile = path.join(project, 'openapi.json');
    const openapi = JSON.parse(await readFile(openapiFile, 'utf8')) as {
      paths: Record<string, {post: {operationId: string; requestBody: JsonBody; responses: Record<string, JsonBody>}}>;
      components: {schemas: Record<string, {properties?: Record<string, object>; required?: string[]}>};
    };
    type JsonBody = {content: {'application/json': {schema: {allOf: [{$ref: string}]}}}};
    const root = (body: JsonBody) => {
      const name = body.content['application/json'].schema.allOf[0].$ref;
      assert.ok(name.startsWith('#/components/schemas/'));
      const schema = openapi.components.schemas[name.slice('#/components/schemas/'.length)];
      assert.ok(schema, name);
      return schema;
    };
    assert.deepEqual(Object.keys(openapi.paths).sort(), operations.map(routePath).sort());
    for (const route of routes) {
      const post = openapi.paths[routePath(route.operation)]!.post;
      assert.equal(post.operationId, route.operation);
      const request = root(post.requestBody), response = root(post.responses['200']!);
      assert.deepEqual(Object.keys(request.properties ?? {}).sort(), [...route.requestFields].sort());
      assert.deepEqual([...(request.required ?? [])].sort(), route.requestFields.filter(field => field !== '$namespaces').sort());
      assert.deepEqual(Object.keys(response.properties ?? {}).filter(field => field !== '$namespaces'), [route.responseField]);
      assert.deepEqual(response.required, [route.responseField]);
    }
    stage = 'deterministic regeneration';
    await rename(project, path.join(work, 'first-generation'));
    const regenerated = await run(generation);
    assert.doesNotMatch(regenerated.stdout + regenerated.stderr, /unexpected metadata fetch/);
    assert.deepEqual(await artifacts(), initial);
    await save('generated-assets.json', initial);
    await copyFile(openapiFile, path.join(evidence, 'openapi.json'));

    stage = 'scaffold tests';
    const tests = await run([npm, 'test'], project);
    await writeFile(path.join(evidence, 'scaffold-test.log'), tests.stdout + tests.stderr);
    stage = 'strict build';
    const build = await run([npm, 'run', 'build'], project);
    await writeFile(path.join(evidence, 'build.log'), build.stdout + build.stderr);
    const relocated = path.join(work, 'relocated');
    stage = 'relocation';
    await rename(project, relocated);
    await rename(inputs, unavailable);
    inputsMoved = true;
    await assert.rejects(readFile(source), {code: 'ENOENT'});
    const {buildServer} = await import(pathToFileURL(path.join(relocated, 'dist/server.js')).href) as {
      buildServer(config: {allowedEndpoints: string[]}): Promise<FastifyInstance>;
    };
    const app = await buildServer({allowedEndpoints: [endpoint]});
    const fetchBefore = globalThis.fetch;
    let metadataFetches = 0;
    globalThis.fetch = async () => {metadataFetches++; throw new Error('unexpected metadata fetch');};
    const exchanges: unknown[] = [];
    const failures: {operation: string; case: string; stage: string; diagnostic: string}[] = [];
    try {
      stage = 'installed HTTP/SOAP';
      const post = (operation: string, payload: object, server = app) => server.inject({method: 'POST', url: routePath(operation), payload});
      for (const route of routes) for (const test of route.cases) {
        const before = calls.length;
        response = test.response ?? '';
        upstreamStatus = test.upstreamStatus ?? 200;
        const payload = test.payload ?? route.input;
        const result = await post(route.operation, payload);
        const wire = calls.slice(before);
        const summary = {operation: route.operation, case: test.id, status: result.statusCode, dispatches: wire.length, passed: false};
        try {
          assert.equal(result.statusCode, test.status, result.body);
          assert.equal(wire.length, test.dispatches);
          for (const call of wire) checkRequest(route, call);
          test.verify?.(result.json());
          if (test.status === 502) assert.ok(!Object.hasOwn(result.json(), 'MediaUri'));
          summary.passed = true;
        } catch (error) {
          failures.push({operation: route.operation, stage, case: test.id, diagnostic: String(error)});
        }
        wireResults.push(summary);
        exchanges.push({...summary, payload, body: result.body, wire});
      }
      await save('exchanges.json', exchanges);
      if (failures.length) await save('wire-failures.json', failures);

      stage = 'installed refusal controls';
      const noDispatch = async (id: string, server: FastifyInstance, status: number, diagnostic: RegExp) => {
        const before = calls.length, result = await post(snapshotRoute.operation, snapshotRoute.input, server);
        const detail = {operation: snapshotRoute.operation, case: id, status: result.statusCode, dispatches: calls.length - before, body: result.body};
        exchanges.push(detail);
        await save('exchanges.json', exchanges);
        assert.equal(detail.dispatches, 0);
        assert.equal(detail.status, status, detail.body);
        assert.match(detail.body, diagnostic);
      };
      const denied = await buildServer({allowedEndpoints: []});
      try {
        await noDispatch('denied-endpoint', denied, 502, /endpoint authorization/);
      } finally {await denied.close();}
      const snapshots = JSON.parse(await readFile(path.join(relocated, 'client/source-resources.json'), 'utf8')) as {
        resources: {digest: string; file: string}[];
      };
      const missing = snapshots.resources.find(resource => resource.digest === pins.find(pin => pin.file === 'bf-2.xsd')!.sha256);
      assert.ok(missing);
      const snapshotPath = path.join(relocated, 'client', missing.file);
      const bytes = await readFile(snapshotPath);
      await rename(snapshotPath, snapshotPath + '.unavailable');
      await noDispatch('missing-required-snapshot', app, 500, /authorized-local-source-required/);
      await writeFile(snapshotPath, Buffer.concat([bytes, Buffer.from('\n<!-- changed snapshot -->')]));
      await noDispatch('stale-required-snapshot', app, 500, /local-source-changed|source-graph-changed/);
      assert.equal(metadataFetches, 0);
    } finally {
      globalThis.fetch = fetchBefore;
      await app.close();
    }
    const installedManifest = JSON.parse(await readFile(path.join(work, 'node_modules/@techspokes/typescript-wsdl-client/package.json'), 'utf8')) as {version: string};
    const receipt = {...identity, version: installedManifest.version, operations, endpoint, wireWrapperSha256: hash(Buffer.from(wireWrapper)),
      ...(batch ? {} : {operation: snapshotRoute.operation, successStatus: 200, invalidInputStatus: 400, invalidUpstreamStatus: 502, faultStatus: 502}),
      discovered: plan.inventory.operations, generated: routes.length, wholeSourceLegality: plan.dimensions.sourceLegality,
      deterministic: true, scaffoldTestsBeforeBuild: true, strictBuild: true, relocated: true, metadataFetches, soapDispatches: calls.length,
      results: wireResults, failures};
    await save('wire.json', receipt);
    stage = 'wire acceptance';
    assert.deepEqual(failures, []);
    console.log('Qualified', operations.join(', '), 'using', archiveSha256);
  } catch (error) {
    wireFailure = error;
    const detail = error as Error & {stdout?: string; stderr?: string};
    await save('stage-failure.json', {operations, stage, diagnostic: detail.stack ?? String(error), stdout: detail.stdout, stderr: detail.stderr});
    if (!batch) throw error;
    console.error(stage, detail.message);
  }
  if (batch) {
    if (inputsMoved) await rename(unavailable, inputs);
    const survey = path.join(inputs, 'survey.wsdl');
    await writeFile(survey, surveyWrapper);
    await writeFile(path.join(evidence, 'survey.wsdl'), surveyWrapper);
    const fetchBefore = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = async () => {fetches++; throw new Error('unexpected metadata fetch');};
    try {
      const planner = await import(pathToFileURL(entry).href) as {planCheckedComponents: typeof planCheckedComponents};
      let codecFailure: unknown;
      if (batch === '--candidate-batch') {
        try {
          await save('encoder-codec.json', await roundTripMediaEncoders(entry, survey, choices));
        } catch (error) {
          codecFailure = error;
          await save('encoder-codec-failure.json', {operation: 'GetVideoEncoderConfigurations', stage: 'authentic inverse codec', diagnostic: String(error)});
          console.error('Authentic inverse codec', error);
        }
      }
      await surveyMedia(planner.planCheckedComponents, survey, choices, () => fetches, identity, wireResults, evidence, baseline);
      if (codecFailure) throw codecFailure;
    } finally {globalThis.fetch = fetchBefore;}
  }
  if (wireFailure) throw wireFailure;
} finally {
  if (upstream.listening) {
    upstream.closeAllConnections();
    await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()));
  }
  await rm(work, {recursive: true, force: true, maxRetries: 5, retryDelay: 150});
}
