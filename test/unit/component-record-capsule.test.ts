import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mkdir, mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract} from '../../src/compiler/directOperation.js';
import {acquireStandardSchemaLibrary, SCHEMA_ELEMENT_LIBRARY} from '../../src/compiler/standardSchemaComponents.js';
import {createComponentRecordProjection} from '../../src/compiler/componentRecordProjection.js';
import type {ComponentRecordProjection} from '../../src/compiler/componentRecordProjection.js';
import {createComponentSourceCapsule, reconstructComponentSourceCapsule, reconstructComponentSourceCapsuleForOperation} from '../../src/compiler/directSourceCapsule.js';
import {generateComponentClient} from '../../src/client/generateDirectClient.js';

const fixtures = path.resolve('test/conformance/fixtures/xsd/standard-schema-element');
const parent = path.resolve('tmp/conformance/record-capsule'), ns = 'urn:owned:wrapper';
const name = (local: string) => ({namespace: ns, local});
const selector = {portType: name('WrapperPortType'), binding: name('WrapperBinding'), operation: 'Fetch'};
const selection = {service: name('WrapperService'), port: 'WrapperPort'};
let directory = '', original: string, records: string, outer: DirectOperationContract, projection: ComponentRecordProjection, bytes: Uint8Array;
async function pair() {
  const root = await mkdtemp(path.join(directory, 'pair-')), file = path.join(root, 'wrapper.wsdl'), companion = path.join(root, 'records.wsdl');
  await writeFile(file, original); await writeFile(companion, records);
  return {root, file, companion, loading: {policy: {fileRoots: [root]}}};
}
beforeAll(async () => {
  await mkdir(parent, {recursive: true}); directory = await mkdtemp(path.join(parent, 'suite-'));
  original = await readFile(path.join(fixtures, 'wrapper.wsdl'), 'utf8'); records = await readFile(path.join(fixtures, 'records.wsdl'), 'utf8');
  const source = await pair();
  const selected = await selectComponentOperation(source.file, selector, {loading: source.loading,
    standardLibraries: [acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY)]});
  const record = await selectComponentOperation(source.companion, {portType: name('RecordPortType'), binding: name('RecordBinding'), operation: 'Fetch'}, {loading: source.loading});
  if (selected.kind !== 'selected' || record.kind !== 'selected') throw new Error('Native fixture selection failed');
  outer = selected.contract;
  const scoped = createComponentRecordProjection(outer, record.contract, {version: 'component-record-scope-v1', scope: 'records-with-declared-wrapper-scope',
    payloadPath: [name('Envelope')], recordPath: [name('Records'), name('Record')],
    opaqueExclusions: [{path: [{namespace: 'http://www.w3.org/2001/XMLSchema', local: 'schema'}], reason: 'standard-schema-metadata'},
      {path: [name('Envelope')], reason: 'wrapper-declaration-universe'}]});
  if (scoped.kind !== 'component-record-projection') throw new Error(scoped.rule); projection = scoped;
  const artifact = await createComponentSourceCapsule(outer, selection, undefined, projection);
  if (artifact.kind !== 'component-capsule') throw new Error(artifact.kind + ':' + artifact.rule); bytes = artifact.bytes;
});
afterAll(async () => {
  if (directory) {
    if (!directory.startsWith(parent + path.sep)) throw new Error('Owned cleanup escaped the test directory');
    await rm(directory, {recursive: true, force: true});
  }
});
describe('scoped component artifact authority and compatibility', () => {
  it('writes a distinct deterministic artifact and generates the companion output type from native authority', async () => {
    const repeated = await createComponentSourceCapsule(outer, selection, undefined, projection);
    if (repeated.kind !== 'component-capsule') throw new Error(repeated.rule); expect(repeated.bytes).toEqual(bytes);
    const data = JSON.parse(Buffer.from(bytes).toString('utf8')) as {versions: {scope: string}; libraries: string[]; projection: {source: {selector: unknown}}};
    expect(data.versions.scope).toBe('component-soap11-utf8-graph-v2'); expect(data.libraries).toEqual([SCHEMA_ELEMENT_LIBRARY]);
    expect(data.projection.source.selector).toMatchObject({binding: name('RecordBinding'), operation: 'Fetch'});
    const reconstructed = await reconstructComponentSourceCapsuleForOperation(bytes, outer, selection, undefined, projection);
    if (reconstructed.kind !== 'reconstructed-component') throw new Error(reconstructed.rule);
    const generated = await generateComponentClient(reconstructed);
    expect(generated.kind).toBe('generated-component-client');
    if (generated.kind === 'generated-component-client') {
      expect(generated.source).toContain('"Records"'); expect(generated.source).toContain('"Quantity"');
      expect(generated.source).not.toContain('readonly "schema"');
    }
  });
  it('requires independent companion and standard permissions before native reconstruction', async () => {
    const source = await pair(), base = {loading: source.loading};
    expect(await reconstructComponentSourceCapsule(bytes, source.file, base)).toMatchObject({kind: 'missing-authority', rule: 'explicit-companion-source-required'});
    expect(await reconstructComponentSourceCapsule(bytes, source.file, {...base, recordSources: [{selector, source: source.companion}]}))
      .toMatchObject({kind: 'missing-authority', rule: 'explicit-standard-component-permission'});
    const fresh = await reconstructComponentSourceCapsule(bytes, source.file, {...base, standardLibraries: [SCHEMA_ELEMENT_LIBRARY],
      recordSources: [{selector, source: source.companion}]});
    expect(fresh.kind).toBe('reconstructed-component');
    if (fresh.kind === 'reconstructed-component') {
      expect(fresh.responseProjection?.kind).toBe('component-record-projection');
      expect(fresh.mappings.map(mapping => mapping.direction.kind)).toEqual(['input', 'output', 'fault']);
    }
  });
  it('refuses changed companion bytes, missing physical sources and mixed native projections', async () => {
    const source = await pair(), options = {loading: source.loading, standardLibraries: [SCHEMA_ELEMENT_LIBRARY], recordSources: [{selector, source: source.companion}]};
    await writeFile(source.companion, records + '\n');
    expect(await reconstructComponentSourceCapsule(bytes, source.file, options)).toMatchObject({kind: 'incompatible-artifact', rule: 'local-source-changed'});
    await rm(source.companion);
    expect(await reconstructComponentSourceCapsule(bytes, source.file, options)).toMatchObject({kind: 'missing-authority'});
    expect((await reconstructComponentSourceCapsuleForOperation(bytes, outer, selection)).kind).not.toBe('reconstructed-component');
    await expect(reconstructComponentSourceCapsuleForOperation(bytes, outer, selection, undefined, {...projection})).rejects.toThrow('Native matching');
  });
});
