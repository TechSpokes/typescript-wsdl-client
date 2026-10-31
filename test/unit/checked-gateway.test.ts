import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import Fastify, {type FastifyPluginAsync} from 'fastify';
import {selectDirectOperation} from '../../src/compiler/directOperation.js';
import {createDirectSourceCapsule, reconstructDirectSourceCapsule} from '../../src/compiler/directSourceCapsule.js';
import type {ReconstructedDirectSource} from '../../src/compiler/directSourceCapsule.js';
import {generateDirectClient, writeDirectClient} from '../../src/client/generateDirectClient.js';
import {generateCheckedGateway} from '../../src/gateway/generateCheckedGateway.js';

// @constraints Deliberately dishonest runtime checks the HTTP response defense independently of SOAP validation.
const runtime = vi.hoisted(() => ({version: 'checked-direct-runtime-v1', execute: vi.fn()}));
vi.mock('@techspokes/typescript-wsdl-client', () => ({checkedDirectRuntimeV1: runtime}));

const namespace = 'urn:checked:forecast';
const selection = {service: {namespace, local: 'ForecastService'}, port: 'ForecastPort'};
let scratch: string, expected: ReconstructedDirectSource;
let plugin: FastifyPluginAsync<{clientOptions: unknown}>;
beforeAll(async () => {
  await mkdir('tmp/test-generation', {recursive: true});
  scratch = await mkdtemp(path.resolve('tmp/test-generation/checked-gateway-'));
  const file = path.resolve('test/conformance/fixtures/assessment/forecast.wsdl');
  const selected = await selectDirectOperation(file, {
    portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast',
  }, {limits: {}, loading: {policy: {fileRoots: [path.dirname(file)]}}});
  if (selected.kind !== 'selected') throw new Error(selected.rule);
  const capsule = createDirectSourceCapsule(selected.contract, selection);
  if (capsule.kind !== 'direct-capsule') throw new Error(capsule.rule);
  const native = await reconstructDirectSourceCapsule(capsule.bytes, file, {limits: {}, policy: {fileRoots: [path.dirname(file)]}});
  if (native.kind !== 'reconstructed-direct') throw new Error(native.rule);
  expected = native;
  const client = generateDirectClient(expected);
  if (client.kind !== 'generated-direct-client') throw new Error(client.rule);
  await mkdir(path.join(scratch, 'client'));
  writeDirectClient(path.join(scratch, 'client/client.ts'), client);
  await generateCheckedGateway(expected, {clientDir: path.join(scratch, 'client'), gatewayDir: path.join(scratch, 'gateway'),
    openapiFile: path.join(scratch, 'openapi.json'), routePath: '/v1/forecast/GetForecast'});
  plugin = (await import(pathToFileURL(path.join(scratch, 'gateway/plugin.ts')).href)).default;
});
afterAll(async () => {await rm(scratch, {recursive: true, force: true});});

async function app() {
  runtime.execute.mockReset();
  runtime.execute.mockResolvedValue({kind: 'soap-response', value: {city: '  A\r\nB  ', temperature: [-3, 0], complete: false},
    admitted: false, status: 200, responseBytes: new Uint8Array(), usage: {nodes: 0, work: 0}});
  const server = Fastify();
  // @constraints A host serializer strategy cannot replace checked response validation or remove members.
  server.setSerializerCompiler(() => () => '{"hostSerializer":"would lose values"}');
  server.post('/host', {schema: {body: {type: 'object', properties: {n: {type: 'integer'}, mode: {type: 'string', default: 'host'}}, additionalProperties: false}}},
    request => request.body);
  await server.register(plugin, {clientOptions: {localSource: 'not-used-by-the-dishonest-test-runtime', fileRoots: [], capsule: new Uint8Array(),
    soap: {...selection, endpoint: 'http://127.0.0.1:1/no-request', allowEndpoint: () => false}}});
  await server.ready();
  return server;
}

describe('native checked gateway lowering', () => {
  it('emits deterministic OAS3.1.1 and separate draft07 exact scalar schemas', async () => {
    const before = await readFile(path.join(scratch, 'gateway/plugin.ts'), 'utf8');
    await generateCheckedGateway(expected, {clientDir: path.join(scratch, 'client'), gatewayDir: path.join(scratch, 'gateway'),
      openapiFile: path.join(scratch, 'openapi.json'), routePath: '/v1/forecast/GetForecast'});
    expect(await readFile(path.join(scratch, 'gateway/plugin.ts'), 'utf8')).toBe(before);
    const doc = JSON.parse(await readFile(path.join(scratch, 'openapi.json'), 'utf8'));
    expect(doc.openapi).toBe('3.1.1');
    expect(doc['x-checked-model'].selection).toEqual({selector: expected.contract.selector, ...selection});
    const schemas = JSON.parse(await readFile(path.join(scratch, 'gateway/schemas.json'), 'utf8'));
    expect(schemas.request.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(schemas.request.properties.days).toEqual({type: 'integer', minimum: -2147483648, maximum: 2147483647});
    expect(schemas.response.required).toEqual(['city', 'temperature', 'complete']);
    expect(schemas.response.properties.temperature).toEqual({type: 'array', items: {type: 'integer', minimum: -2147483648, maximum: 2147483647}, minItems: 0});
  });

  it('refuses serialized or copied native authority', async () => {
    const opts = {clientDir: scratch, gatewayDir: scratch, openapiFile: path.join(scratch, 'never.json'), routePath: '/forecast'};
    await expect(generateCheckedGateway({...expected}, opts)).rejects.toThrow(TypeError);
    await expect(generateCheckedGateway(JSON.parse(JSON.stringify(expected)) as ReconstructedDirectSource, opts)).rejects.toThrow(TypeError);
  });

  it('retains native reserved-name refusals and accepts percent-encoded route segments', async () => {
    const file = path.join(scratch, 'prototype.wsdl');
    await writeFile(file, (await readFile('test/conformance/fixtures/assessment/forecast.wsdl', 'utf8')).replaceAll('name="city"', 'name="__proto__"'));
    const selected = await selectDirectOperation(file, expected.contract.selector, {limits: {}, loading: {policy: {fileRoots: [scratch]}}});
    if (selected.kind !== 'selected') throw new Error(selected.rule);
    const capsule = createDirectSourceCapsule(selected.contract, selection);
    expect(capsule).toMatchObject({kind: 'unsupported', rule: 'dependency reserved name'});
    const result = await generateCheckedGateway(expected, {clientDir: path.join(scratch, 'client'), gatewayDir: path.join(scratch, 'prototype/gateway'),
      openapiFile: path.join(scratch, 'prototype/openapi.json'), routePath: '/v1/forecast/%CE%A9'});
    expect(result.doc).toHaveProperty(['paths', '/v1/forecast/%CE%A9']);
    expect(await readFile(path.join(scratch, 'prototype/gateway/plugin.ts'), 'utf8')).toContain('export const schemas = JSON.parse(');
  });

  it('rejects invalid input without coercion, defaults, field removal or runtime calls', async () => {
    const server = await app();
    try {
      for (const value of [{city: 'A', days: '1'}, {city: 'A'}, {city: 'A', days: 1, extra: true}, {city: 'A', days: 2147483648},
        {city: 'A', days: 1.5}, {city: '\u0000', days: 1}, {city: '\ud800', days: 1}, {city: true, days: 1}]) {
        const original = JSON.stringify(value);
        expect((await server.inject({method: 'POST', url: '/v1/forecast/GetForecast', payload: value})).statusCode).toBe(400);
        expect(JSON.stringify(value)).toBe(original);
      }
      expect(runtime.execute).not.toHaveBeenCalled();
      const host = await server.inject({method: 'POST', url: '/host', payload: {n: '2', extra: 'remove'}});
      expect(host.json()).toEqual({n: 2, mode: 'host'});
    } finally {await server.close();}
  });

  it('preserves validated response bytes and independently rejects dishonest runtime success', async () => {
    const server = await app();
    try {
      const request = {city: 'Oslo', days: 2};
      const good = await server.inject({method: 'POST', url: '/v1/forecast/GetForecast', payload: request});
      expect(good.statusCode).toBe(200);
      expect(good.body).toBe(JSON.stringify({city: '  A\r\nB  ', temperature: [-3, 0], complete: false}));
      expect(runtime.execute.mock.calls[0][1]).toEqual(request);
      for (const value of [{city: 'A', temperature: [3], complete: 'false'}, {city: 'A', temperature: [3], complete: false, hidden: 1},
        {city: 'A', complete: true}, {city: 'A', temperature: [2147483648], complete: true}]) {
        runtime.execute.mockResolvedValueOnce({kind: 'soap-response', value, admitted: false, status: 200});
        const bad = await server.inject({method: 'POST', url: '/v1/forecast/GetForecast', payload: request});
        expect(bad.statusCode).toBe(502);
        expect(bad.json()).toEqual({kind: 'value-invalid', rule: 'http-response-shape'});
      }
    } finally {await server.close();}
  });

  it('validates declared fault shape before preserving its values', async () => {
    const server = await app();
    try {
      const fault = {name: 'ForecastError', code: {namespace: 'http://schemas.xmlsoap.org/soap/envelope/', local: 'Server'}, string: 'Unavailable'};
      runtime.execute.mockResolvedValueOnce({kind: 'soap-fault', fault: {...fault, codeNode: {internal: 'must not cross HTTP boundary'}},
        value: {code: 'NO_DATA', message: 'Try later'}, admitted: false, status: 500});
      const result = await server.inject({method: 'POST', url: '/v1/forecast/GetForecast', payload: {city: 'A', days: 1}});
      expect(result.statusCode).toBe(502);
      expect(result.json()).toEqual({fault, value: {code: 'NO_DATA', message: 'Try later'}});
      runtime.execute.mockResolvedValueOnce({kind: 'soap-fault', fault: {...fault, name: 'Undeclared'}, value: {code: 'NO_DATA', message: 'Try later'}});
      expect((await server.inject({method: 'POST', url: '/v1/forecast/GetForecast', payload: {city: 'A', days: 1}})).json())
        .toEqual({kind: 'value-invalid', rule: 'http-fault-shape'});
    } finally {await server.close();}
  });
});
