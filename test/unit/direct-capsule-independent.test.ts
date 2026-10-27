/** Nonauthor expectations use literal schema/wire meanings, not capsule internals. */
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mkdtemp, readFile, writeFile, mkdir, rm, symlink} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {selectDirectOperation, inspectDirectOperation} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract} from '../../src/compiler/directOperation.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {createDirectSourceCapsule, readDirectSourceCapsule, reconstructDirectSourceCapsule, checkDirectSourceCompatibility} from '../../src/compiler/directSourceCapsule.js';
import {encodeDirectXml} from '../../src/compiler/directCodec.js';
import {inspectDirectValueMapping} from '../../src/compiler/directValues.js';

const ns = 'urn:checked:forecast';
const selector = {portType: {namespace: ns, local: 'ForecastPortType'}, binding: {namespace: ns, local: 'ForecastBinding'}, operation: 'GetForecast'};
const selection = {service: {namespace: ns, local: 'ForecastService'}, port: 'ForecastPort'};
let scratch: string, original: string, baseline: Uint8Array;
let expected: Extract<Awaited<ReturnType<typeof reconstructDirectSourceCapsule>>, {kind: 'reconstructed-direct'}>;
let serial = 0;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function source(text = original) {
  const dir = path.join(scratch, `case-${serial++}`); await mkdir(dir);
  const file = path.join(dir, 'source.wsdl'); await writeFile(file, text);
  return {dir, file};
}
async function contract(text = original, operationSelector = selector) {
  const {dir, file} = await source(text);
  const selected = await selectDirectOperation(file, operationSelector, {loading: {policy: {fileRoots: [dir]}}});
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error(selected.rule);
  return selected.contract;
}
function capsule(c: DirectOperationContract) {
  const result = createDirectSourceCapsule(c, selection);
  expect(result.kind).toBe('direct-capsule');
  if (result.kind !== 'direct-capsule') throw new Error(result.rule);
  return result.bytes;
}
function parsed(bytes = baseline): Record<string, any> {return JSON.parse(Buffer.from(bytes).toString()) as Record<string, any>;}
function edit(change: (value: Record<string, any>) => void) {
  const value = parsed(); change(value); return Buffer.from(JSON.stringify(value));
}
const read = (bytes: Uint8Array) => readDirectSourceCapsule(bytes, createSemanticBudget());
beforeAll(async () => {
  await mkdir('tmp/conformance/p36-independent', {recursive: true});
  scratch = await mkdtemp(path.resolve('tmp/conformance/p36-independent/suite-'));
  original = await readFile('test/conformance/fixtures/assessment/forecast.wsdl', 'utf8');
  baseline = capsule(await contract());
  const copied = await source();
  const reconstructed = await reconstructDirectSourceCapsule(baseline, copied.file, {policy: {fileRoots: [copied.dir]}});
  if (reconstructed.kind !== 'reconstructed-direct') throw new Error(reconstructed.rule);
  expected = reconstructed;
});
afterAll(async () => {await rm(scratch, {recursive: true, force: true});});

describe('independently asserted portable direct capsule boundary', () => {
  it('records exact source bytes and literal source-derived ordered meanings with no original path', () => {
    const data = parsed();
    expect(Buffer.from(data.source.base64, 'base64')).toEqual(Buffer.from(original));
    expect(data.source.digest).toBe('51ae02c9950c15530193231d9f1bfbd5605d00934581cc73336132fa489834ea');
    expect(data.compatibility.input.element).toEqual({namespace: ns, local: 'GetForecast'});
    expect(data.compatibility.output.slots.map((s: any) => [s.element.local, s.builtin.local, s.min, s.max])).toEqual([
      ['city', 'string', '1', '1'], ['temperature', 'int', '0', 'unbounded'], ['complete', 'boolean', '1', '1'],
    ]);
    expect(data.compatibility.faults.map((f: any) => [f.name, f.root.element.local, f.root.slots.map((s: any) => s.element.local)])).toEqual([['ForecastError', 'ForecastFault', ['code', 'message']]]);
    expect(Buffer.from(baseline).toString()).not.toContain(scratch);
    expect(Buffer.from(baseline).toString()).not.toContain('contextId');
  });
  it('reconstructs new native identity and deterministically reproduces bytes after relocation', async () => {
    const {dir, file} = await source();
    const result = await reconstructDirectSourceCapsule(baseline, file, {policy: {fileRoots: [dir]}});
    expect(result.kind).toBe('reconstructed-direct');
    if (result.kind !== 'reconstructed-direct') throw new Error(result.rule);
    expect(inspectDirectOperation(result.contract).evidence.eligible).toBe(true);
    const input = result.mappings.find(m => m.direction.kind === 'input')!;
    expect(inspectDirectValueMapping(input, result.contract)).toBe(input);
    const first = encodeDirectXml(result.contract, input, {city: 'Rome', days: 3});
    const second = encodeDirectXml(result.contract, input, {city: 'Rome', days: 3});
    expect(first.kind).toBe('direct-encoded'); expect(second.kind).toBe('direct-encoded');
    if (first.kind === 'direct-encoded' && second.kind === 'direct-encoded') expect(first.bytes).toEqual(second.bytes);
    expect(capsule(result.contract)).toEqual(baseline);
    expect(() => inspectDirectOperation(JSON.parse(JSON.stringify(result.contract)) as DirectOperationContract)).toThrow(TypeError);
  });
  it('accepts only proven harmless prefix and source-formatting changes as revised bytes', async () => {
    const equivalent = original.replaceAll('xmlns:xs=', 'xmlns:x=').replaceAll('xs:', 'x:').replaceAll('xmlns:t=', 'xmlns:q=').replaceAll('t:', 'q:').replaceAll('><', '>\n<');
    expect(checkDirectSourceCompatibility(expected, await contract(equivalent), selection)).toMatchObject({kind: 'compatible-direct', sourceIdentity: 'revised-bytes', admitted: false});
  });
  it.each([
    ['SOAPAction', (s: string) => s.replace('urn:checked:GetForecast', 'urn:changed:action')],
    ['root', (s: string) => s.replaceAll('GetForecastResponse', 'ChangedResponse')],
    ['fault', (s: string) => s.replaceAll('ForecastError', 'ChangedFault')],
    ['fault detail', (s: string) => s.replaceAll('ForecastFault', 'ChangedDetail')],
    ['member name', (s: string) => s.replaceAll('name="temperature"', 'name="degrees"')],
    ['scalar datatype', (s: string) => s.replace('name="days" type="xs:int"', 'name="days" type="xs:string"')],
    ['occurrence minimum', (s: string) => s.replace('name="temperature" type="xs:int" minOccurs="0"', 'name="temperature" type="xs:int" minOccurs="1"')],
    ['occurrence maximum', (s: string) => s.replace('maxOccurs="unbounded"', 'maxOccurs="1"')],
    ['member order', (s: string) => s.replace('<xs:element name="city" type="xs:string"/><xs:element name="days" type="xs:int"/>', '<xs:element name="days" type="xs:int"/><xs:element name="city" type="xs:string"/>')],
  ] as const)('refuses a fresh source with changed %s', async (_label, mutate) => {
    expect(checkDirectSourceCompatibility(expected, await contract(mutate(original)), selection)).toMatchObject({kind: 'incompatible-artifact'});
  });
  it('compares actual service, port, binding and operation identities rather than first-match defaults', async () => {
    const changedService = await contract(original.replace('name="ForecastService"', 'name="OtherService"'));
    expect(checkDirectSourceCompatibility(expected, changedService, {...selection, service: {namespace: ns, local: 'OtherService'}})).toMatchObject({kind: 'incompatible-artifact'});
    const changedPort = await contract(original.replace('name="ForecastPort"', 'name="OtherPort"'));
    expect(checkDirectSourceCompatibility(expected, changedPort, {...selection, port: 'OtherPort'})).toMatchObject({kind: 'incompatible-artifact'});
    const changedBinding = await contract(original.replaceAll('ForecastBinding', 'OtherBinding'), {...selector, binding: {namespace: ns, local: 'OtherBinding'}});
    expect(checkDirectSourceCompatibility(expected, changedBinding, selection)).toMatchObject({kind: 'incompatible-artifact'});
    const changedOperation = await contract(original.replaceAll('GetForecast', 'OtherOperation'), {...selector, operation: 'OtherOperation'});
    expect(checkDirectSourceCompatibility(expected, changedOperation, selection)).toMatchObject({kind: 'incompatible-artifact'});
  });
  it('does not qualify a capsule whose action is refused by the existing SOAP adapter', async () => {
    const unsafeText = original.replace('urn:checked:GetForecast', 'urn:unsafe:Bad&quot;Action');
    const unsafe = await contract(unsafeText);
    expect(createDirectSourceCapsule(unsafe, selection)).toMatchObject({kind: 'unsupported'});
    const {dir, file} = await source(unsafeText);
    const bytes = Buffer.from(unsafeText);
    const artifact = edit(v => {v.source.base64 = bytes.toString('base64'); v.source.digest = hash(bytes);});
    expect(await reconstructDirectSourceCapsule(artifact, file, {policy: {fileRoots: [dir]}})).toMatchObject({kind: 'unsupported'});
  });
  it.each([
    ['unknown outer field', (v: Record<string, any>) => {v.extra = true;}],
    ['missing field', (v: Record<string, any>) => {delete v.source;}],
    ['unknown nested field', (v: Record<string, any>) => {v.compatibility.input.extra = true;}],
    ['future format', (v: Record<string, any>) => {v.versions.capsuleFormat = 2;}],
    ['scalar policy', (v: Record<string, any>) => {v.versions.scalarPolicy = 'coerce-everything';}],
    ['model', (v: Record<string, any>) => {v.versions.model = 'legacy';}],
    ['forged digest', (v: Record<string, any>) => {v.source.digest = '0'.repeat(64);}],
    ['noncanonical base64', (v: Record<string, any>) => {v.source.base64 += '\n';}],
    ['changed descriptor', (v: Record<string, any>) => {v.compatibility.action = 'changed';}],
  ] as const)('refuses %s before use', (_label, mutate) => {
    expect(read(edit(mutate))).toMatchObject({kind: 'incompatible-artifact'});
  });
  it.each([
    ['duplicate', () => Buffer.from(Buffer.from(baseline).toString().replace('"capsuleFormat":1', '"capsuleFormat":1,"capsuleFormat":1'))],
    ['escaped duplicate', () => Buffer.from(Buffer.from(baseline).toString().replace('"capsuleFormat":1', '"capsuleFormat":1,"capsule\\u0046ormat":1'))],
    ['malformed JSON', () => Buffer.from('{')],
    ['malformed UTF-8', () => Buffer.from([0xc0, 0xaf])],
    ['legacy artifact', () => Buffer.from('{"types":[],"operations":[],"options":{}}')],
    ['mixed artifact', () => edit(v => {v.catalogFormat = 2;})],
  ] as const)('refuses %s artifacts', (_label, make) => {expect(read(make())).toMatchObject({kind: 'incompatible-artifact'});});
  it('does not authorize missing, modified, denied, symlink-escaping or network resources', async () => {
    const {dir, file} = await source();
    expect(await reconstructDirectSourceCapsule(baseline, path.join(dir, 'missing.wsdl'), {policy: {fileRoots: [dir]}})).toMatchObject({kind: 'missing-authority'});
    expect(await reconstructDirectSourceCapsule(baseline, file, {policy: {}})).toMatchObject({kind: 'missing-authority'});
    await writeFile(file, original.replace('urn:checked:GetForecast', 'urn:changed'));
    expect(await reconstructDirectSourceCapsule(baseline, file, {policy: {fileRoots: [dir]}})).toMatchObject({kind: 'incompatible-artifact', rule: 'local-source-changed'});
    expect(await reconstructDirectSourceCapsule(baseline, 'https://example.invalid/wsdl', {policy: {allowedOrigins: ['https://example.invalid']}})).toMatchObject({kind: 'missing-authority'});
    const other = await source();
    if (process.platform !== 'win32') {
      const link = path.join(dir, 'escape.wsdl'); await symlink(other.file, link);
      expect(await reconstructDirectSourceCapsule(baseline, link, {policy: {fileRoots: [dir]}})).toMatchObject({kind: 'missing-authority'});
    }
  });
  it('keeps budget exhaustion sticky and distinguishes cancellation and byte limits', async () => {
    const budget = createSemanticBudget({maxWork: 100});
    expect(readDirectSourceCapsule(baseline, budget)).toMatchObject({kind: 'resource-limit'});
    expect(readDirectSourceCapsule(baseline, budget)).toMatchObject({kind: 'resource-limit'});
    expect(budget.exhausted()).toBe(true);
    expect(read(Buffer.alloc(256 * 1024 + 1))).toMatchObject({kind: 'resource-limit'});
    const controller = new AbortController(); controller.abort();
    const {dir, file} = await source();
    expect(await reconstructDirectSourceCapsule(baseline, file, {policy: {fileRoots: [dir]}, signal: controller.signal})).toMatchObject({kind: 'cancelled'});
  });
  it('uses native byte extent rather than a user getter before decoding or reserving', () => {
    const bytes = new Uint8Array(baseline);
    let touched = false;
    Object.defineProperty(bytes, 'byteLength', {get() {touched = true; throw new Error('Do not read this getter');}});
    const result = read(bytes);
    expect(result).not.toHaveProperty('kind');
    expect(touched).toBe(false);
  });
  it('refuses shared source storage and typed-array proxies', () => {
    const shared = new Uint8Array(new SharedArrayBuffer(baseline.byteLength));
    shared.set(baseline);
    expect(read(shared)).toMatchObject({kind: 'incompatible-artifact'});
    let prototypeReads = 0;
    const proxy = new Proxy(new Uint8Array(baseline), {getPrototypeOf() {
      prototypeReads++; throw new Error('Do not invoke caller proxy traps');
    }});
    expect(read(proxy)).toMatchObject({kind: 'incompatible-artifact'});
    expect(prototypeReads).toBe(0);
  });
  it('charges preliminary syntax nodes inclusively under a fresh request budget', async () => {
    const {dir, file} = await source();
    const full = await reconstructDirectSourceCapsule(baseline, file, {policy: {fileRoots: [dir]}});
    if (full.kind !== 'reconstructed-direct') throw new Error(full.rule);
    const exact = await reconstructDirectSourceCapsule(baseline, file, {policy: {fileRoots: [dir]}, limits: {maxNodes: full.usage.nodes}});
    expect(exact.kind).toBe('reconstructed-direct');
    const below = await reconstructDirectSourceCapsule(baseline, file, {policy: {fileRoots: [dir]}, limits: {maxNodes: full.usage.nodes - 1}});
    expect(below.kind).toBe('resource-limit');
  });
  it('refuses import graphs before any network attempt despite a real local root and matching digest', async () => {
    const graph = original.replace('<wsdl:types>', '<wsdl:import namespace="urn:remote" location="https://example.invalid/dependency.wsdl"/><wsdl:types>');
    const bytes = Buffer.from(graph);
    const artifact = edit(v => {v.source.base64 = bytes.toString('base64'); v.source.digest = hash(bytes);});
    const {dir, file} = await source(graph);
    let fetches = 0;
    const previous = globalThis.fetch;
    globalThis.fetch = async () => {fetches++; throw new Error('network forbidden');};
    try {
      expect(await reconstructDirectSourceCapsule(artifact, file, {policy: {fileRoots: [dir], allowedOrigins: ['https://example.invalid']}})).toMatchObject({kind: 'unsupported', rule: 'single-source-required'});
      expect(fetches).toBe(0);
    } finally {globalThis.fetch = previous;}
  });
  it('does not mistake a recomputed source hash for a validated source/contract relationship', async () => {
    const forged = edit(v => {
      const bytes = Buffer.from(original.replace('name="days" type="xs:int"', 'name="days" type="xs:string"'));
      v.source.base64 = bytes.toString('base64'); v.source.digest = hash(bytes);
    });
    // Reconstruction catches stale claimed contract even with a real new file
    // and honest source digest; the original descriptor may not rescue it.
    const changed = await source(original.replace('name="days" type="xs:int"', 'name="days" type="xs:string"'));
    expect(await reconstructDirectSourceCapsule(forged, changed.file, {policy: {fileRoots: [changed.dir]}})).toMatchObject({kind: 'incompatible-artifact'});
    // Only issued reconstructions may be used as expected contracts.
    const fresh = await contract();
    expect(() => checkDirectSourceCompatibility(forged, fresh, selection)).toThrow(TypeError);
    expect(() => checkDirectSourceCompatibility(baseline, fresh, selection)).toThrow(TypeError);
    expect(() => checkDirectSourceCompatibility(JSON.parse(JSON.stringify(expected)), fresh, selection)).toThrow(TypeError);
  });
});
