import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import Fastify, {type FastifyPluginAsync} from 'fastify';
import {selectComponentOperationInRequest} from '../../src/compiler/directOperation.js';
import {createApplicationBudget} from '../../src/compiler/semanticBudget.js';
import {createComponentRecordProjection} from '../../src/compiler/componentRecordProjection.js';
import {createComponentResponseBranches} from '../../src/compiler/componentResponseBranches.js';
import {createComponentSourceCapsule, reconstructComponentSourceCapsuleForOperation} from '../../src/compiler/directSourceCapsule.js';
import {generateComponentClient, writeDirectClient} from '../../src/client/generateDirectClient.js';
import {generateComponentGateway} from '../../src/gateway/generateCheckedGateway.js';
import {generateCheckedApp} from '../../src/app/generateCheckedApp.js';
import {runGenerationPipeline} from '../../src/pipeline.js';

// @constraints A dishonest runtime isolates HTTP schema validation and serialization from native SOAP checks.
const runtime = vi.hoisted(() => ({version: 'checked-component-soap11-branches-runtime-v1', execute: vi.fn()}));
const retainedRuntime = vi.hoisted(() => ({version: 'checked-component-soap11-runtime-v1', execute: vi.fn()}));
vi.mock('@techspokes/typescript-wsdl-client', () => ({checkedComponentRuntimeV4: runtime, checkedComponentRuntimeV3: retainedRuntime}));
const namespace = 'urn:test:outer';
const name = (local: string) => ({namespace, local});
const selector = {portType: name('PortType'), binding: name('Binding'), operation: 'Fetch'};
const selection = {service: name('Service'), port: 'Port'};
const expectedValue = {Wrapper: {Marker: 'owned', Response: {ApplicationError: {Retryable: false, Code: 17, Message: 'Unavailable'}}}};
let directory = '', plugin: FastifyPluginAsync<{clientOptions: unknown}>, clientSource = '';
const mixedDirectories: string[] = [];
let document: {paths: Record<string, {post: {responses: Record<string, {content: Record<string, {schema: {oneOf: Record<string, unknown>[]}}>}>}}>};

beforeAll(async () => {
  const fixtures = path.resolve('test/conformance/fixtures/soap/response-branches');
  const budget = createApplicationBudget();
  const load = async (file: string, namespace: string) => {
    const selected = await selectComponentOperationInRequest(path.join(fixtures, file), {
      portType: {namespace, local: 'PortType'}, binding: {namespace, local: 'Binding'}, operation: 'Fetch'},
    {loading: {policy: {fileRoots: [fixtures]}}}, budget);
    if (selected.kind !== 'selected') throw new Error(selected.rule);
    return selected.contract;
  };
  const outer = await load('outer.wsdl', namespace), companion = await load('companion.wsdl', 'urn:test:companion');
  const error = await load('error.wsdl', namespace);
  const projection = createComponentRecordProjection(outer, companion, {scope: 'records-with-declared-wrapper-scope'});
  if (projection.kind !== 'component-record-projection') throw new Error(projection.rule);
  const branches = createComponentResponseBranches(outer, projection, [{id: 'upstream', contract: error,
    path: [{namespace: '', local: 'Wrapper'}, {namespace: '', local: 'Response'}, {namespace: 'urn:test:payload', local: 'ApplicationError'}]}]);
  if (branches.kind !== 'component-response-branches') throw new Error(branches.rule);
  const capsule = await createComponentSourceCapsule(outer, selection, undefined, projection, branches);
  if (capsule.kind !== 'component-capsule') throw new Error(capsule.rule);
  const reconstructed = await reconstructComponentSourceCapsuleForOperation(capsule.bytes, outer, selection, undefined, projection, branches);
  if (reconstructed.kind !== 'reconstructed-component') throw new Error(reconstructed.rule);
  const generated = await generateComponentClient(reconstructed);
  if (generated.kind !== 'generated-component-client') throw new Error(generated.rule);
  clientSource = generated.source;
  await mkdir('tmp/test-generation', {recursive: true});
  directory = await mkdtemp(path.resolve('tmp/test-generation/checked-response-branches-'));
  await mkdir(path.join(directory, 'client'));
  writeDirectClient(path.join(directory, 'client/client.ts'), generated);
  const result = await generateComponentGateway(reconstructed, {clientDir: path.join(directory, 'client'), gatewayDir: path.join(directory, 'gateway'),
    openapiFile: path.join(directory, 'openapi.json'), routePath: '/fetch'});
  document = result.doc as typeof document;
  plugin = (await import(pathToFileURL(path.join(directory, 'gateway/plugin.ts')).href)).default;
});
afterAll(async () => {
  for (const root of [directory, ...mixedDirectories]) if (root) await rm(root, {recursive: true, force: true});
});

describe('generated independently sourced application-error contract', () => {
  it('keeps complete branch value types separate and documents disjoint HTTP outcomes', async () => {
    expect(clientSource).toContain('checkedComponentRuntimeV4');
    expect(clientSource).toContain('readonly branch: "upstream"; readonly value: ApplicationError_0');
    expect(clientSource).toContain('readonly "Wrapper"');
    expect(clientSource).toContain('readonly "Retryable": boolean');
    const alternatives = document.paths['/fetch']!.post.responses['502']!.content['application/json']!.schema.oneOf;
    expect(alternatives[1]).toMatchObject({required: ['kind', 'branch', 'value'], properties: {kind: {const: 'application-error'}, branch: {const: 'upstream'}}});
    expect(alternatives[2]).toMatchObject({properties: {kind: {enum: expect.not.arrayContaining(['application-error', 'soap-fault', 'soap-response'])}}});
    const schemas = JSON.parse(await readFile(path.join(directory, 'gateway/schemas.json'), 'utf8'));
    expect(schemas.fault.oneOf[0]).toMatchObject({required: ['kind', 'fault'], properties: {kind: {const: 'soap-fault'}}});
  });

  it('preserves application-error discriminators and wrappers at HTTP 502 and rejects dishonest values', async () => {
    runtime.execute.mockReset();
    const server = Fastify();
    server.setSerializerCompiler(() => () => '{"host":"discarded"}');
    await server.register(plugin, {clientOptions: {localSource: 'unused', fileRoots: [], capsule: new Uint8Array(), sourceResources: [], sourceOrigins: [], soap: selection}});
    try {
      const request = {method: 'POST' as const, url: '/fetch', payload: '"request"', headers: {'content-type': 'application/json'}};
      runtime.execute.mockResolvedValueOnce({kind: 'application-error', branch: 'upstream', value: expectedValue});
      const response = await server.inject(request);
      expect(response.statusCode).toBe(502);
      expect(response.body).toBe(JSON.stringify({kind: 'application-error', branch: 'upstream', value: expectedValue}));
      for (const result of [
        {branch: 'unknown', value: expectedValue},
        {branch: 'upstream', value: {Wrapper: {Response: expectedValue.Wrapper.Response}}},
        {branch: 'upstream', value: {Wrapper: {...expectedValue.Wrapper, Response: {ApplicationError: {Retryable: false, Code: '17', Message: 'Unavailable'}}}}},
      ]) {
        runtime.execute.mockResolvedValueOnce({kind: 'application-error', ...result});
        const refused = await server.inject(request);
        expect(refused.statusCode).toBe(502);
        expect(refused.json()).toEqual({kind: 'value-invalid', rule: 'http-application-error-shape'});
      }
      runtime.execute.mockResolvedValueOnce({kind: 'soap-fault', fault: {version: '1.1', code: {namespace: 'http://schemas.xmlsoap.org/soap/envelope/', local: 'Server'}, string: 'Failed'}});
      expect((await server.inject(request)).json()).toEqual({kind: 'soap-fault', fault: {version: '1.1', code: {namespace: 'http://schemas.xmlsoap.org/soap/envelope/', local: 'Server'}, string: 'Failed'}});
    } finally {await server.close();}
  });

  it('preserves an explicit empty branch-source restriction in the generated host', async () => {
    await generateCheckedApp({appDir: directory, clientDir: path.join(directory, 'client'), gatewayDir: path.join(directory, 'gateway'),
      openapiFile: path.join(directory, 'openapi.json'), component: {source: 'unused', capsules: {}, sourceResources: [], sourceOrigins: [],
        branchSources: [{selector, branch: 'upstream', source: 'error.wsdl'}]}});
    const {buildServer} = await import(pathToFileURL(path.join(directory, 'server.ts')).href);
    const server = await buildServer({localSource: 'unused', fileRoots: [directory], sourceResources: [], sourceOrigins: [], branchSources: []});
    runtime.execute.mockReset();
    runtime.execute.mockResolvedValueOnce({kind: 'application-error', branch: 'upstream', value: expectedValue});
    try {
      const result = await server.inject({method: 'POST', url: '/fetch', payload: '"request"', headers: {'content-type': 'application/json'}});
      expect(result.statusCode).toBe(502);
      expect(runtime.execute.mock.calls[0]![2].branchSources).toEqual([]);
      await expect(buildServer({branchSources: []})).rejects.toThrow('incomplete advanced source configuration');
    } finally {await server.close();}
  });

  it('routes mixed service options to each owning runtime without widening retained runtime controls', async () => {
    const fixtures = path.resolve('test/conformance/fixtures/soap/response-branches');
    // @constraints Keep this project outside the consumer host's package scope so the test runtime mock resolves consistently.
    const project = await mkdtemp(path.resolve('tmp/test-generation/checked-mixed-response-branches-'));
    mixedDirectories.push(project);
    const resources = await Promise.all(['error.wsdl', 'payload.xsd'].map(async file => ({uri: pathToFileURL(path.join(fixtures, file)).href,
      digest: createHash('sha256').update(await readFile(path.join(fixtures, file))).digest('hex')})));
    await runGenerationPipeline({model: 'checked-components-v1', wsdl: path.join(fixtures, 'outer-mixed.wsdl'), checkedComponents: {
      selectors: [selector, {...selector, operation: 'Ordinary'}], ...selection, fileRoots: [fixtures], sourceOrigins: [],
      sourceResources: [{uri: pathToFileURL(path.join(fixtures, 'payload.xsd')).href, file: path.join(fixtures, 'payload.xsd')}],
      recordProjections: [{selector, source: path.join(fixtures, 'companion.wsdl'),
        recordSelector: {portType: {namespace: 'urn:test:companion', local: 'PortType'}, binding: {namespace: 'urn:test:companion', local: 'Binding'}, operation: 'Fetch'},
        scope: 'records-with-declared-wrapper-scope'}],
      responseBranches: [{version: 'component-response-branches-v1', selector, branches: [{id: 'upstream', source: path.join(fixtures, 'error.wsdl'), selector,
        path: [{namespace: '', local: 'Wrapper'}, {namespace: '', local: 'Response'}, {namespace: 'urn:test:payload', local: 'ApplicationError'}], resources}]}],
    }, clientOutDir: path.join(project, 'client'), openapi: {outFile: path.join(project, 'openapi.json')},
    gateway: {outDir: path.join(project, 'gateway'), versionSlug: 'v1', serviceSlug: 'mixed'}});
    const branchSources = [{selector, branch: 'upstream', source: 'owned-error.wsdl'}];
    const options = {localSource: 'unused', fileRoots: [], sourceResources: [], sourceOrigins: [], branchSources, soap: selection};
    retainedRuntime.execute.mockReset();
    retainedRuntime.execute.mockImplementation(async (_capsule, _input, options) => Object.hasOwn(options, 'branchSources') || Object.hasOwn(options, 'unknown')
      ? {kind: 'unsupported', rule: 'unknown-runtime-option', usage: {nodes: 0, work: 0}}
      : {kind: 'soap-response', value: 'ordinary-ok'});
    runtime.execute.mockReset();
    runtime.execute.mockResolvedValue({kind: 'application-error', branch: 'upstream', value: expectedValue});
    const mixedPlugin = (await import(pathToFileURL(path.join(project, 'gateway/plugin.ts')).href)).default;
    const server = Fastify();
    await server.register(mixedPlugin, {clientOptions: options, capsules: {Fetch: new Uint8Array(), Ordinary: new Uint8Array()}});
    try {
      const request = {method: 'POST' as const, payload: '"request"', headers: {'content-type': 'application/json'}};
      const ordinary = await server.inject({...request, url: '/v1/mixed/Ordinary'});
      expect(ordinary.statusCode).toBe(200);
      expect(ordinary.json()).toBe('ordinary-ok');
      const error = await server.inject({...request, url: '/v1/mixed/Fetch'});
      expect(error.statusCode).toBe(502);
      expect(error.json()).toEqual({kind: 'application-error', branch: 'upstream', value: expectedValue});
      expect(retainedRuntime.execute.mock.calls[0]![2]).not.toHaveProperty('branchSources');
      expect(runtime.execute.mock.calls[0]![2].branchSources).toEqual(branchSources);
    } finally {await server.close();}
    const {createClient} = await import(pathToFileURL(path.join(project, 'client/client.ts')).href);
    const client = createClient({Fetch: runtime, Ordinary: retainedRuntime});
    expect(await client.Ordinary('request', {...options, capsule: new Uint8Array()})).toMatchObject({kind: 'soap-response', value: 'ordinary-ok'});
    expect(await client.Ordinary('request', {...options, capsule: new Uint8Array(), unknown: true})).toMatchObject({kind: 'unsupported', rule: 'unknown-runtime-option'});
    let reads = 0;
    const accessor = {...options, capsule: new Uint8Array()};
    Object.defineProperty(accessor, 'branchSources', {enumerable: true, get() {reads++; return branchSources;}});
    expect(await client.Ordinary('request', accessor)).toMatchObject({kind: 'unsupported', rule: 'unknown-runtime-option'});
    expect(reads).toBe(0);
  });
});
