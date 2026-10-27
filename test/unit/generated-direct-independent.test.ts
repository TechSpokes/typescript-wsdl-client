/** Independent boundary controls; expectations do not consume emitted declarations. */
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {selectDirectOperation, inspectDirectOperation} from '../../src/compiler/directOperation.js';
import {createDirectSourceCapsule, reconstructDirectSourceCapsule} from '../../src/compiler/directSourceCapsule.js';
import type {ReconstructedDirectSource} from '../../src/compiler/directSourceCapsule.js';
import {generateDirectClient, writeDirectClient} from '../../src/client/generateDirectClient.js';
import {directClientRuntime} from '../../src/client/directClientRuntime.js';
import type {DirectClientOptions} from '../../src/client/directClientRuntime.js';

const namespace = 'urn:checked:forecast';
const selector = {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'};
const selection = {service: {namespace, local: 'ForecastService'}, port: 'ForecastPort'};
let scratch: string, source: string, serial = 0;
beforeAll(async () => {
  await mkdir('tmp/conformance/p37-independent', {recursive: true});
  scratch = await mkdtemp(path.resolve('tmp/conformance/p37-independent/suite-'));
  source = await readFile('test/conformance/fixtures/assessment/forecast.wsdl', 'utf8');
});
afterAll(async () => {await rm(scratch, {recursive: true, force: true});});
async function selected(text = source) {
  const file = path.join(scratch, `source-${serial++}.wsdl`);
  await writeFile(file, text);
  const result = await selectDirectOperation(file, selector, {loading: {policy: {fileRoots: [scratch]}}});
  if (result.kind !== 'selected') throw new Error(result.rule);
  return {file, contract: result.contract};
}
async function reconstructed() {
  const {file, contract} = await selected();
  const capsule = createDirectSourceCapsule(contract, selection);
  if (capsule.kind !== 'direct-capsule') throw new Error(capsule.rule);
  const native = await reconstructDirectSourceCapsule(capsule.bytes, file, {policy: {fileRoots: [scratch]}});
  if (native.kind !== 'reconstructed-direct') throw new Error(native.rule);
  return {file, native, capsule: capsule.bytes};
}
function options(capsule = Buffer.from('{}')): DirectClientOptions {
  return {localSource: '/never-read.wsdl', fileRoots: [], capsule,
    soap: {...selection, endpoint: 'http://127.0.0.1:1/no-dispatch', allowEndpoint: () => false}};
}

describe('independent generated direct client boundaries', () => {
  it('refuses SOAP accessor and proxy options without invoking caller code', async () => {
    let calls = 0;
    const baseline = options();
    for (const key of ['signal', 'service', 'port']) {
      const soap = {...baseline.soap};
      Object.defineProperty(soap, key, {enumerable: true, get() {calls++; throw new Error('caller accessor');}});
      const result = await directClientRuntime.execute(Buffer.from('{}').toString('base64'), {}, {...baseline, soap});
      expect(result.kind).toBe('unsupported');
    }
    const soap = new Proxy(baseline.soap, {get() {calls++; throw new Error('caller proxy');}, ownKeys() {calls++; throw new Error('caller enumeration');}});
    expect((await directClientRuntime.execute('e30=', {}, {...baseline, soap})).kind).toBe('unsupported');
    expect(calls).toBe(0);
  });

  it('refuses outer option getters and proxies before reading budget or capsule', async () => {
    let calls = 0;
    const baseline = options();
    for (const key of ['budget', 'capsule', 'soap', 'localSource', 'fileRoots']) {
      const supplied = {...baseline};
      Object.defineProperty(supplied, key, {get() {calls++; throw new Error('outer getter');}});
      expect((await directClientRuntime.execute('e30=', {}, supplied)).kind).toBe('unsupported');
    }
    const supplied = new Proxy(baseline, {getPrototypeOf() {calls++; throw new Error('outer proxy');}});
    expect((await directClientRuntime.execute('e30=', {}, supplied)).kind).toBe('unsupported');
    expect(calls).toBe(0);
  });

  it('does not revisit mutable caller SOAP metadata after asynchronous reconstruction', async () => {
    const {file, capsule} = await reconstructed();
    let calls = 0;
    const soap = options().soap;
    const pending = directClientRuntime.execute(Buffer.from(capsule).toString('base64'), {city: 'Oslo', days: 1},
      {localSource: file, fileRoots: [scratch], capsule, soap});
    Object.defineProperty(soap, 'service', {get() {calls++; throw new Error('metadata changed during reconstruction');}});
    const result = await pending;
    expect(result.kind).toBe('unsupported');
    expect(calls).toBe(0);
  });

  it('does not revisit mutable caller budget limits after asynchronous reconstruction', async () => {
    const {file, capsule} = await reconstructed();
    let calls = 0;
    const budget = {maxNodes: 100_000};
    const pending = directClientRuntime.execute(Buffer.from(capsule).toString('base64'), {city: 'Oslo', days: 1},
      {...options(Buffer.from(capsule)), localSource: file, fileRoots: [scratch], budget});
    Object.defineProperty(budget, 'maxNodes', {get() {calls++; throw new Error('limits changed during reconstruction');}});
    const result = await pending;
    expect(result.kind).toBe('unsupported');
    expect(calls).toBe(0);
  });

  it('requires identity-issued reconstructed authority before emitting any source', async () => {
    const {native} = await reconstructed();
    expect(() => generateDirectClient({} as ReconstructedDirectSource)).toThrow(TypeError);
    expect(() => generateDirectClient(JSON.parse(JSON.stringify(native)) as ReconstructedDirectSource)).toThrow(TypeError);
    let calls = 0;
    const copied = {...native};
    Object.defineProperty(copied, 'mappings', {get() {calls++; throw new Error('unqualified mappings');}});
    expect(() => generateDirectClient(copied)).toThrow(TypeError);
    expect(calls).toBe(0);
    expect(generateDirectClient(native).kind).toBe('generated-direct-client');
  });

  it('keeps exhausted generation sticky and returns no usable partial artifact', async () => {
    const {native} = await reconstructed();
    const {budget} = inspectDirectOperation(native.contract).context;
    expect(() => budget.chargeWork(Number.MAX_SAFE_INTEGER)).toThrow();
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = generateDirectClient(native);
      expect(result.kind).toBe('resource-limit');
      expect(result).not.toHaveProperty('source');
      expect(result).not.toHaveProperty('capsule');
    }
    expect(generateDirectClient((await reconstructed()).native).kind).toBe('generated-direct-client');
  });

  it('authenticates writes and refuses exhausted issuers before creating a partial file', async () => {
    const {native} = await reconstructed();
    const generated = generateDirectClient(native);
    if (generated.kind !== 'generated-direct-client') throw new Error(generated.rule);
    const destination = path.join(scratch, 'independent-output.ts');
    const copied = {...generated};
    let calls = 0;
    Object.defineProperty(copied, 'source', {get() {calls++; throw new Error('forged source');}});
    expect(() => writeDirectClient(destination, copied)).toThrow(TypeError);
    expect(calls).toBe(0);
    await expect(readFile(destination)).rejects.toMatchObject({code: 'ENOENT'});
    writeDirectClient(destination, generated);
    expect(await readFile(destination, 'utf8')).toBe(generated.source);
    const {budget} = inspectDirectOperation(native.contract).context;
    expect(() => budget.chargeWork(Number.MAX_SAFE_INTEGER)).toThrow();
    const refused = path.join(scratch, 'exhausted-output.ts');
    expect(() => writeDirectClient(refused, generated)).toThrow();
    await expect(readFile(refused)).rejects.toMatchObject({code: 'ENOENT'});
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'prototype'])('preserves inherited dependency refusal for source member %s', async reserved => {
    const {contract} = await selected(source.replace('name="days"', `name="${reserved}"`));
    const result = createDirectSourceCapsule(contract, selection);
    expect(result.kind).toBe('unsupported');
    expect(result).not.toHaveProperty('bytes');
    expect(result).not.toHaveProperty('source');
  });

  it('refuses absent local authority and capsule mixing without relying on an endpoint callback', async () => {
    const {capsule} = await reconstructed();
    let endpointCalls = 0;
    const supplied = options(Buffer.from(capsule));
    const soap = {...supplied.soap, allowEndpoint: () => {endpointCalls++; return true;}};
    expect((await directClientRuntime.execute(Buffer.from(capsule).toString('base64'), {}, {...supplied, soap})).kind).toBe('missing-authority');
    expect((await directClientRuntime.execute('e30=', {}, {...supplied, soap})).kind).toBe('incompatible-artifact');
    expect(endpointCalls).toBe(0);
  });
});
