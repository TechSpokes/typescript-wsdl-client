import {beforeAll, afterAll, describe, expect, it} from 'vitest';
import {mkdtemp, readFile, writeFile, mkdir, rm, symlink} from 'node:fs/promises';
import path from 'node:path';
import {selectDirectOperation} from '../../src/compiler/directOperation.js';
import type {DirectOperationSelector} from '../../src/compiler/directOperation.js';
import {createDirectSourceCapsule, readDirectSourceCapsule, reconstructDirectSourceCapsule, checkDirectSourceCompatibility, DIRECT_CAPSULE_LIMITS} from '../../src/compiler/directSourceCapsule.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {encodeDirectXml} from '../../src/compiler/directCodec.js';

const namespace = 'urn:checked:forecast';
const selector: DirectOperationSelector = {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'};
const selection = {service: {namespace, local: 'ForecastService'}, port: 'ForecastPort'};
let scratch: string, original: string;
beforeAll(async () => {
  await mkdir('tmp/conformance/direct-capsule', {recursive: true});
  scratch = await mkdtemp(path.resolve('tmp/conformance/direct-capsule/case-'));
  original = await readFile('test/conformance/fixtures/assessment/forecast.wsdl', 'utf8');
});
afterAll(async () => {await rm(scratch, {recursive: true, force: true});});
async function fresh(source = original, choose = selector, limits?: {maxWork?: number; maxNodes?: number}) {
  const directory = await mkdtemp(path.join(scratch, 'local-'));
  const file = path.join(directory, 'source.wsdl'); await writeFile(file, source);
  const result = await selectDirectOperation(file, choose, {loading: {policy: {fileRoots: [directory]}}, limits});
  if (result.kind !== 'selected') throw new Error(JSON.stringify(result));
  return {contract: result.contract, file, policy: {fileRoots: [directory]}};
}
async function capsule() {
  const local = await fresh(); const artifact = createDirectSourceCapsule(local.contract, selection);
  if (artifact.kind !== 'direct-capsule') throw new Error(JSON.stringify(artifact));
  const issued = await reconstructDirectSourceCapsule(artifact.bytes, local.file, {policy: local.policy});
  if (issued.kind !== 'reconstructed-direct') throw new Error(JSON.stringify(issued));
  return {...local, bytes: artifact.bytes, issued};
}
function read(bytes: Uint8Array, maxWork?: number) {return readDirectSourceCapsule(bytes, createSemanticBudget({maxWork}));}
function malformed(bytes: Uint8Array, mutate: (o: Record<string, unknown>) => void) {
  const data = JSON.parse(Buffer.from(bytes).toString()) as Record<string, unknown>; mutate(data); return Buffer.from(JSON.stringify(data));
}
describe('portable direct data and native compatibility', () => {
  it('writes deterministic source bytes with no path, context identity or serialized handle and reconstructs fresh mappings', async () => {
    const a = await capsule(), b = await capsule(); expect(a.bytes).toEqual(b.bytes);
    const parsed = JSON.parse(Buffer.from(a.bytes).toString()) as {source: {base64: string}};
    expect(Buffer.from(parsed.source.base64, 'base64').toString()).toBe(original);
    expect(Buffer.from(a.bytes).toString()).not.toContain(scratch);
    expect(Buffer.from(a.bytes).toString()).not.toContain('contextId');
    const r = await reconstructDirectSourceCapsule(a.bytes, b.file, {policy: b.policy});
    expect(r.kind).toBe('reconstructed-direct'); if (r.kind !== 'reconstructed-direct') return;
    expect(r.contract).not.toBe(a.contract); expect(r.contract.admitted).toBe(false);
    expect(r.mappings.map(m => m.direction)).toEqual([{kind: 'input'}, {kind: 'output'}, {kind: 'fault', name: 'ForecastError'}]);
    const encoded = encodeDirectXml(r.contract, r.mappings[0], {city: 'Oslo', days: 3});
    expect(encoded.kind).toBe('direct-encoded');
    expect(checkDirectSourceCompatibility(a.issued, r.contract, selection)).toMatchObject({kind: 'compatible-direct', sourceIdentity: 'exact-bytes'});
  });
  it('allows fresh authorized relocation and proven prefix/format aliases but retains distinct byte identity', async () => {
    const a = await capsule();
    const b = await fresh(original.replaceAll('xmlns:t=', 'xmlns:q=').replaceAll('t:', 'q:').replaceAll('xmlns:xs=', 'xmlns:x=').replaceAll('xs:', 'x:').replaceAll('><', '>\n<'));
    expect(checkDirectSourceCompatibility(a.issued, b.contract, selection)).toMatchObject({kind: 'compatible-direct', sourceIdentity: 'revised-bytes'});
  });
  it.each([
    ['action', (s: string) => s.replace('urn:checked:GetForecast', 'urn:changed')],
    ['service', (s: string) => s.replace('name="ForecastService"', 'name="Changed"')],
    ['port', (s: string) => s.replace('name="ForecastPort"', 'name="Changed"')],
    ['root', (s: string) => s.replaceAll('GetForecastResponse', 'ChangedResponse')],
    ['fault', (s: string) => s.replaceAll('ForecastError', 'ChangedError')],
    ['fault root', (s: string) => s.replaceAll('ForecastFault', 'ChangedFault')],
    ['member', (s: string) => s.replace('name="days"', 'name="duration"')],
    ['order', (s: string) => s.replace('<xs:element name="city" type="xs:string"/><xs:element name="days" type="xs:int"/>', '<xs:element name="days" type="xs:int"/><xs:element name="city" type="xs:string"/>')],
    ['count', (s: string) => s.replace('name="days" type="xs:int"', 'name="days" type="xs:int" minOccurs="0"')],
    ['scalar', (s: string) => s.replace('name="days" type="xs:int"', 'name="days" type="xs:string"')],
  ] as const)('rejects changed %s semantics before downstream use', async (label, change) => {
    const a = await capsule(), changed = change(original);
    expect(changed, label).not.toBe(original);
    const b = await fresh(changed);
    const actual = label === 'service' ? {...selection, service: {namespace, local: 'Changed'}} : label === 'port' ? {...selection, port: 'Changed'} : selection;
    expect(checkDirectSourceCompatibility(a.issued, b.contract, actual)).toMatchObject({kind: 'incompatible-artifact', repair: expect.stringContaining('Regenerate')});
  });
  it('rejects binding and operation identities even when corresponding source names and selectors move together', async () => {
    const a = await capsule();
    for (const [old, replacement] of [['ForecastBinding', 'OtherBinding'], ['GetForecast', 'ReadForecast']] as const) {
      const choose = old === 'ForecastBinding' ? {...selector, binding: {namespace, local: replacement}} : {...selector, operation: replacement};
      const b = await fresh(original.replaceAll(old, replacement), choose);
      expect(checkDirectSourceCompatibility(a.issued, b.contract, selection).kind).toBe('incompatible-artifact');
    }
  });
  it.each(['versions', 'source', 'compatibility', 'fingerprint'])('rejects missing and unknown %s fields', async field => {
    const a = await capsule();
    expect(read(malformed(a.bytes, o => {delete o[field];}))).toMatchObject({kind: 'incompatible-artifact'});
    expect(read(malformed(a.bytes, o => {o.extra = true;}))).toMatchObject({kind: 'incompatible-artifact'});
  });
  it('refuses duplicate escaped keys, legacy/mixed data, malformed JSON/UTF8, oversized data and unsupported versions/policies', async () => {
    const a = await capsule();
    for (const bytes of [Buffer.from('{"versions":{},"ver\\u0073ions":{}}'), Buffer.from('{'), Buffer.from([0xc0, 0xaf]), Buffer.from('{"catalogFormat":2}'),
      malformed(a.bytes, o => {o.catalogFormat = 2;}), ...['capsuleFormat', 'model', 'scope', 'mapping', 'scalarPolicy', 'runtimePolicy'].map(key => malformed(a.bytes, o => {(o.versions as Record<string, unknown>)[key] = 'future';}))]) {
      expect(read(bytes)).toMatchObject({kind: 'incompatible-artifact'});
    }
    expect(read(new Uint8Array(DIRECT_CAPSULE_LIMITS.maxBytes + 1))).toMatchObject({kind: 'resource-limit'});
    // Bounded data reading does not consume the semantic algorithm allowance.
    expect(read(a.bytes, 4096)).toHaveProperty('versions');
  });
  it('rejects tampered source/digest/compatibility and changed actual local bytes', async () => {
    const a = await capsule();
    expect(read(malformed(a.bytes, o => {(o.source as Record<string, unknown>).digest = '0'.repeat(64);}))).toMatchObject({kind: 'incompatible-artifact'});
    expect(read(malformed(a.bytes, o => {(o.compatibility as Record<string, unknown>).action = 'changed';}))).toMatchObject({kind: 'incompatible-artifact'});
    await writeFile(a.file, original + '\n');
    expect(await reconstructDirectSourceCapsule(a.bytes, a.file, {policy: a.policy})).toMatchObject({kind: 'incompatible-artifact', rule: 'local-source-changed'});
  });
  it('rejects unpermitted roots, symlinks to outside roots and network sources without fetches', async () => {
    const a = await capsule();
    expect(await reconstructDirectSourceCapsule(a.bytes, a.file, {policy: {}})).toMatchObject({kind: 'missing-authority'});
    const b = await fresh(); const link = path.join(path.dirname(b.file), 'link.wsdl');
    await symlink(a.file, link);
    expect(await reconstructDirectSourceCapsule(a.bytes, link, {policy: b.policy})).toMatchObject({kind: 'missing-authority'});
    expect(await reconstructDirectSourceCapsule(a.bytes, 'https://example.invalid/source.wsdl', {policy: {allowedOrigins: ['https://example.invalid']}})).toMatchObject({kind: 'missing-authority'});
  });
  it('shares inclusive sticky budget through reading, physical reading, qualification, mappings and comparison', async () => {
    const a = await capsule(); const first = await reconstructDirectSourceCapsule(a.bytes, a.file, {policy: a.policy});
    expect(first.kind).toBe('reconstructed-direct'); if (first.kind !== 'reconstructed-direct') return;
    expect(await reconstructDirectSourceCapsule(a.bytes, a.file, {policy: a.policy, limits: {maxWork: first.usage.work}})).toMatchObject({kind: 'reconstructed-direct'});
    expect(await reconstructDirectSourceCapsule(a.bytes, a.file, {policy: a.policy, limits: {maxWork: first.usage.work - 1}})).toMatchObject({kind: 'resource-limit'});
    const controller = new AbortController(); controller.abort();
    expect(await reconstructDirectSourceCapsule(a.bytes, a.file, {policy: a.policy, signal: controller.signal})).toMatchObject({kind: 'cancelled'});
  });
});
