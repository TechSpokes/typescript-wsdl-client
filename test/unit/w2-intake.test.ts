import {afterEach, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {planCheckedComponents, runGenerationPipeline} from '../../src/index.js';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {SchemaResourceLoader} from '../../src/loader/schemaResources.js';
import type {OfflineSchemaResource} from '../../src/loader/schemaResources.js';

const origin = 'https://metadata.invalid', second = 'https://schemas.invalid';
const fixture = fs.readFileSync('test/conformance/fixtures/xsd/imports/import-relative-types.wsdl', 'utf8');
const schema = fs.readFileSync('test/conformance/fixtures/xsd/imports/import-relative-types-types.xsd', 'utf8');
const temporary: string[] = [];
afterEach(() => {vi.unstubAllGlobals(); for (const dir of temporary.splice(0)) fs.rmSync(dir, {recursive: true, force: true});});
function transport(entries: Record<string, string | {location: string} | number>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (uri: string) => {
    calls.push(uri); const entry = entries[uri];
    if (entry === undefined) throw new Error('Unexpected metadata I/O');
    return typeof entry === 'string' ? new Response(entry) : typeof entry === 'number' ? new Response('', {status: entry})
      : new Response('', {status: 302, headers: {Location: entry.location}});
  })); return calls;
}
it('preserves final bases, shared and query-distinct resources and remote redirect aliases', async () => {
  const calls = transport({[origin + '/start']: {location: '/dir/root.wsdl'},
    [origin + '/dir/root.wsdl']: fixture.replace('import-relative-types-types.xsd', 'types?xsd=0'),
    [origin + '/dir/types?xsd=0']: {location: '/model/types?xsd=0'},
    [origin + '/model/types?xsd=0']: schema.replace('<xs:complexType', '<xs:include schemaLocation="leaf?xsd=1"/><xs:include schemaLocation="leaf?xsd=2"/><xs:include schemaLocation="leaf?xsd=1"/><xs:complexType'),
    [origin + '/model/leaf?xsd=1']: '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:conformance:import-relative-types:types"/>',
    [origin + '/model/leaf?xsd=2']: '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:conformance:import-relative-types:types"/>'});
  const parent = path.resolve('tmp/conformance/w2-unit'); fs.mkdirSync(parent, {recursive: true});
  const app = fs.mkdtempSync(path.join(parent, 'case-')); temporary.push(app);
  const options = {model: 'checked-components-v1' as const, wsdl: origin + '/start', clientOutDir: path.join(app, 'client'), openapi: {outFile: path.join(app, 'openapi.json')},
    gateway: {outDir: path.join(app, 'gateway'), serviceSlug: 'import', versionSlug: 'v1'}, app: {appDir: app}};
  expect((await runGenerationPipeline(options)).planning?.ready).toBe(true);
  expect(calls).toHaveLength(6); expect(new Set(calls).size).toBe(6);
  const bookkeeping = JSON.parse(fs.readFileSync(path.join(app, 'client/source-resources.json'), 'utf8')) as {
    version: string; runtime: {sourceUri: string; sourceResources: {uri: string; file: string; canonicalUri?: string}[]};
  };
  expect(bookkeeping.version).toBe('checked-source-resources-v2');
  expect(bookkeeping.runtime.sourceUri).toBe(origin + '/dir/root.wsdl');
  expect(bookkeeping.runtime.sourceResources).toContainEqual(expect.objectContaining({uri: origin + '/start', canonicalUri: bookkeeping.runtime.sourceUri}));
  expect(bookkeeping.runtime.sourceResources).toContainEqual(expect.objectContaining({uri: origin + '/dir/types?xsd=0', canonicalUri: origin + '/model/types?xsd=0'}));
  const leaves = [1, 2].map(query => bookkeeping.runtime.sourceResources.find(resource => resource.uri === origin + '/model/leaf?xsd=' + query));
  for (const leaf of leaves) expect(leaf).toEqual(expect.objectContaining({file: expect.any(String)}));
  expect(new Set(leaves.map(leaf => leaf!.file)).size).toBe(2);
  const example = JSON.parse(fs.readFileSync(path.join(app, 'checked-gateway.example.json'), 'utf8')) as Record<string, unknown>;
  expect(Object.keys(example).sort()).toEqual(['host', 'port']);
  const before = fs.readFileSync(path.join(app, 'client/client.ts'));
  await runGenerationPipeline(options); expect(calls).toHaveLength(12);
  expect(fs.readFileSync(path.join(app, 'client/client.ts'))).toEqual(before);
});
it('denies cross-origin redirects, remote-to-file references and explicit offline permissions before forbidden I/O', async () => {
  for (const destination of [second + '/types', 'file:///C:/forbidden.xsd']) {
    const calls = transport({[origin + '/root']: fixture.replace('import-relative-types-types.xsd', destination)});
    const report = await planCheckedComponents(origin + '/root'); expect(report.ready).toBe(false);
    expect(calls).toEqual([origin + '/root']);
  }
  const calls = transport({[origin + '/root']: {location: second + '/root'}});
  expect((await planCheckedComponents(origin + '/root')).blockers[0]?.category).toBe('permission'); expect(calls).toEqual([origin + '/root']);
  calls.length = 0;
  expect((await planCheckedComponents(origin + '/root', {sourceOrigins: []})).ready).toBe(false); expect(calls).toEqual([]);
});
it('retains cycle identity and reports the refusing native stage before generation', async () => {
  transport({[origin + '/root']: fixture.replace('import-relative-types-types.xsd', 'types'),
    [origin + '/types']: schema.replace('<xs:complexType', '<xs:include schemaLocation="types"/><xs:complexType')});
  const loaded = await loadSemanticSchemaInput(origin + '/root', {policy: {allowedOrigins: [origin]}});
  expect(loaded.resources).toHaveLength(2); expect(loaded.edges.some(edge => edge.cycle)).toBe(true);
  const report = await planCheckedComponents(origin + '/root'); expect(report.ready).toBe(false);
  expect(report.blockers).toMatchObject([{stage: 'native-preparation', reason: expect.any(String)}]);
});
it.each([401, 403, 404])('keeps HTTP %s retrieval failure distinct from invalid schema', async status => {
  transport({[origin + '/root']: status}); const report = await planCheckedComponents(origin + '/root');
  expect(report.blockers[0]?.category).toBe('missing-dependency'); expect(report.dimensions.sourceLegality).toBe('unassessed');
});
it('refuses remote xml:base=file before reading an otherwise authorized local dependency', async () => {
  const parent = path.resolve('tmp/conformance/w2-unit'); fs.mkdirSync(parent, {recursive: true});
  const directory = fs.mkdtempSync(path.join(parent, 'base-')); temporary.push(directory);
  const file = path.join(directory, 'types.xsd'); fs.writeFileSync(file, schema);
  const calls = transport({[origin + '/root']: fixture.replace('<xs:import ', `<xs:import xml:base="${pathToFileURL(directory + path.sep).href}" `)
    .replace('import-relative-types-types.xsd', 'types.xsd')});
  await expect(loadSemanticSchemaInput(origin + '/root', {policy: {allowedOrigins: [origin], fileRoots: [directory]}}))
    .rejects.toThrow('Remote metadata cannot select local resources');
  expect(calls).toEqual([origin + '/root']);
});
it.each([true, false])('rejects conflicting offline alias bytes independently of canonical-first order %s', async canonicalFirst => {
  const resource = (text: string) => {const bytes = Buffer.from(text); return {bytes, digest: createHash('sha256').update(bytes).digest('hex')};};
  const alias = origin + '/alias', canonical = origin + '/canonical';
  const expected = resource('<canonical/>');
  const loader = await SchemaResourceLoader.create({allowedOrigins: [origin]}, undefined,
    new Map<string, OfflineSchemaResource>([[alias, {...resource('<alias/>'), canonicalUri: canonical}], [canonical, expected]]));
  if (canonicalFirst) expect((await loader.fetchResource(canonical)).digest).toBe(expected.digest);
  await expect(loader.fetchResource(alias)).rejects.toThrow('Conflicting offline alias bytes');
  expect((await loader.fetchResource(canonical)).digest).toBe(expected.digest);
});
it('bounds a later offline alias before hashing against an already pinned canonical resource', async () => {
  const bytes = Buffer.from('<xs/>'), digest = createHash('sha256').update(bytes).digest('hex');
  const canonical = origin + '/canonical', first = origin + '/first', large = origin + '/large';
  const loader = await SchemaResourceLoader.create({allowedOrigins: [origin]}, {resourceBytes: 16},
    new Map<string, OfflineSchemaResource>([[first, {bytes, digest, canonicalUri: canonical}],
      [large, {bytes: Buffer.alloc(17), digest, canonicalUri: canonical}]]));
  await loader.fetchResource(first);
  await expect(loader.fetchResource(large)).rejects.toMatchObject({category: 'resource-limit'});
});
