import path from 'node:path';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {selectComponentOperationInRequest, inspectDirectOperation} from '../../src/compiler/directOperation.js';
import {createApplicationBudget} from '../../src/compiler/semanticBudget.js';
import {canonicalJson} from '../../src/compiler/catalogErrors.js';
import {createComponentRecordProjection, inspectComponentRecordProjection} from '../../src/compiler/componentRecordProjection.js';
import {createComponentResponseBranches, inspectComponentResponseBranches} from '../../src/compiler/componentResponseBranches.js';
import {componentSourceCapsuleBytes, createComponentSourceCapsule, inspectReconstructedComponentSource,
  reconstructComponentSourceCapsule, reconstructComponentSourceCapsuleForOperation} from '../../src/compiler/directSourceCapsule.js';
import type {ComponentSourceReconstructionOptions} from '../../src/compiler/directSourceCapsule.js';

const fixture = path.resolve('test/conformance/fixtures/soap/response-branches');
const name = (namespace: string, local: string) => ({namespace, local});
const selector = (namespace = 'urn:test:outer') => ({portType: name(namespace, 'PortType'), binding: name(namespace, 'Binding'), operation: 'Fetch'});
const selection = {service: name('urn:test:outer', 'Service'), port: 'Port'};
const errorPath = [name('', 'Wrapper'), name('', 'Response'), name('urn:test:payload', 'ApplicationError')];
const branchId = 'application-error';
const files = ['outer.wsdl', 'companion.wsdl', 'error.wsdl', 'payload.xsd'] as const;
const originals = new Map<string, Buffer>();
let scratch: string;

async function source() {
  const root = await mkdtemp(path.join(scratch, 'source-'));
  for (const [file, bytes] of originals) await writeFile(path.join(root, file), bytes);
  const errorDirectory = path.join(root, 'error-source');
  await mkdir(errorDirectory);
  await writeFile(path.join(errorDirectory, 'error.wsdl'), originals.get('error.wsdl')!);
  await writeFile(path.join(errorDirectory, 'payload.xsd'), originals.get('payload.xsd')!);
  await writeFile(path.join(root, 'other.wsdl'), originals.get('error.wsdl')!.toString('utf8').replace('name="Wrapper"', 'name="OtherWrapper"'));
  return {root, outer: path.join(root, 'outer.wsdl'), companion: path.join(root, 'companion.wsdl'),
    error: path.join(errorDirectory, 'error.wsdl'), other: path.join(root, 'other.wsdl')};
}
type Physical = Awaited<ReturnType<typeof source>>;
function permissions(actual: Physical): ComponentSourceReconstructionOptions {
  return {loading: {policy: {fileRoots: [actual.root]}},
    recordSources: [{selector: selector(), source: actual.companion}],
    branchSources: [{selector: selector(), branch: branchId, source: actual.error}]};
}
async function native(actual: Physical) {
  const budget = createApplicationBudget();
  const load = async (file: string, namespace?: string) => {
    const selected = await selectComponentOperationInRequest(file, selector(namespace), {loading: {policy: {fileRoots: [actual.root]}}}, budget);
    if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
    return selected.contract;
  };
  const outer = await load(actual.outer), companion = await load(actual.companion, 'urn:test:companion'), error = await load(actual.error), other = await load(actual.other);
  const projection = createComponentRecordProjection(outer, companion, {scope: 'records-with-declared-wrapper-scope'});
  if (projection.kind !== 'component-record-projection') throw new Error(JSON.stringify(projection));
  const entries = [{id: branchId, path: errorPath, contract: error}];
  const branches = createComponentResponseBranches(outer, projection, entries);
  if (branches.kind !== 'component-response-branches') throw new Error(JSON.stringify(branches));
  return {outer, companion, error, other, projection, branches, entries};
}
let author: Awaited<ReturnType<typeof native>>, originalSource: Physical, bytes: Uint8Array, legacy: Uint8Array;
beforeAll(async () => {
  await mkdir('tmp/conformance/response-branches-capsule', {recursive: true});
  scratch = await mkdtemp(path.resolve('tmp/conformance/response-branches-capsule/suite-'));
  for (const file of files) originals.set(file, await readFile(path.join(fixture, file)));
  originalSource = await source(); author = await native(originalSource);
  const current = await createComponentSourceCapsule(author.outer, selection, undefined, author.projection, author.branches);
  const old = await createComponentSourceCapsule(author.outer, selection, undefined, author.projection);
  if (current.kind !== 'component-capsule' || old.kind !== 'component-capsule') throw new Error(JSON.stringify({current, old}));
  bytes = current.bytes; legacy = old.bytes;
});
afterAll(async () => {await rm(scratch, {recursive: true, force: true});});

interface Resource {key: string; base64: string; digest: string}
interface Data {
  versions: Record<string, string | number>; resources: Resource[]; fingerprint: string;
  projection: {source: {resources: Resource[]}};
  responseBranches: {spec: {version: string; policy: string; branches: {id: string; path: {namespace: string; local: string}[]}[]};
    sources: {id: string; source: {resources: Resource[]; selector: ReturnType<typeof selector>}}[]};
}
function changed(mutate: (data: Data) => void, rehash = false): Uint8Array {
  const data = JSON.parse(Buffer.from(bytes).toString('utf8')) as Data;
  mutate(data);
  if (rehash) {
    const {fingerprint: _fingerprint, ...content} = data;
    data.fingerprint = createHash('sha256').update(canonicalJson(content)).digest('hex');
  }
  return Buffer.from(JSON.stringify(data));
}

describe('independent response-branch source capsules', () => {
  it('stores every original byte with portable retrieval keys and stable independent source identities', async () => {
    const data = JSON.parse(Buffer.from(bytes).toString('utf8')) as Data;
    expect(data.versions.scope).toBe('component-soap11-response-branches-v1');
    expect(data.responseBranches.spec).toEqual({version: 'component-response-branches-v1', policy: 'application-error-http502-v1',
      branches: [{id: branchId, path: errorPath}]});
    const expected = (root: string) => [{key: 'file:payload.xsd', bytes: originals.get('payload.xsd')!}, {key: 'root', bytes: originals.get(root)!}];
    for (const [resources, sourceBytes] of [
      [data.resources, [{key: 'root', bytes: originals.get('outer.wsdl')!}]],
      [data.projection.source.resources, expected('companion.wsdl')],
      [data.responseBranches.sources[0]!.source.resources, expected('error.wsdl')],
    ] as const) {
      expect(resources.map(resource => resource.key)).toEqual(sourceBytes.map(resource => resource.key));
      for (const [index, resource] of resources.entries()) {
        expect(Buffer.from(resource.base64, 'base64')).toEqual(sourceBytes[index]!.bytes);
        expect(resource.digest).toBe(createHash('sha256').update(sourceBytes[index]!.bytes).digest('hex'));
      }
    }
    expect(Buffer.from(bytes).toString('utf8')).not.toContain(originalSource.root);
    const repeat = await createComponentSourceCapsule(author.outer, selection, undefined, author.projection, author.branches);
    expect(repeat.kind).toBe('component-capsule'); if (repeat.kind === 'component-capsule') expect(repeat.bytes).toEqual(bytes);
  });

  it('reconstructs a relocated offline closure through one budget while retaining independent universes', async () => {
    const relocated = await source();
    await rm(originalSource.root, {recursive: true});
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network acquisition forbidden by test'));
    try {
      const result = await reconstructComponentSourceCapsule(bytes, relocated.outer, permissions(relocated));
      expect(result.kind, JSON.stringify(result)).toBe('reconstructed-component');
      if (result.kind !== 'reconstructed-component' || !result.responseBranches || !result.responseProjection) throw new Error(JSON.stringify(result));
      expect(inspectReconstructedComponentSource(result)).toBe(result);
      expect(componentSourceCapsuleBytes(result)).toEqual(bytes);
      expect(result.contract).not.toBe(author.outer);
      const branch = inspectComponentResponseBranches(result.responseBranches, result.contract);
      const companion = inspectComponentRecordProjection(result.responseProjection, result.contract).companion;
      const context = inspectDirectOperation(result.contract).context;
      expect(inspectDirectOperation(companion).context.budget).toBe(context.budget);
      expect(inspectDirectOperation(branch.errors[0]!.contract).context.budget).toBe(context.budget);
      expect(new Set([result.contract.contextId, companion.contextId, branch.errors[0]!.contract.contextId]).size).toBe(3);
      expect(fetch).not.toHaveBeenCalled();
      expect(() => inspectReconstructedComponentSource({...result})).toThrow(TypeError);
    } finally {fetch.mockRestore();}
  });

  it('requires exact physical branch permissions and never obtains them from embedded source data', async () => {
    const actual = await source(), options = permissions(actual), supplied = options.branchSources![0]!;
    for (const branchSources of [undefined, [], [{...supplied, selector: {...selector(), operation: 'Other'}}]]) {
      expect(await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, branchSources}))
        .toMatchObject({kind: 'missing-authority', rule: 'explicit-application-error-source-required'});
    }
    expect(await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, branchSources: [supplied, supplied]}))
      .toMatchObject({kind: 'unsupported', rule: 'duplicate-branch-source-permission'});
    expect(await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, branchSources: [supplied, {...supplied, branch: 'unknown'}]}))
      .toMatchObject({kind: 'unsupported', rule: 'unknown-branch-source-permission'});
    expect(await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, branchSources: [{...supplied, source: actual.companion}]}))
      .toMatchObject({kind: 'incompatible-artifact', rule: 'local-source-changed'});
    expect(await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, recordSources: []})).toMatchObject({kind: 'missing-authority'});
    expect(await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, loading: {policy: {fileRoots: []}}})).toMatchObject({kind: 'missing-authority'});
  });

  it('refuses changed physical roots, branch roots and imported bytes even with intact embedded resources', async () => {
    for (const change of ['outer', 'error', 'companion', 'import', 'missing-import'] as const) {
      const actual = await source();
      const target = change === 'import' || change === 'missing-import' ? path.join(path.dirname(actual.error), 'payload.xsd') : actual[change];
      if (change === 'missing-import') await rm(target);
      else await writeFile(target, Buffer.concat([await readFile(target), Buffer.from('\n')]));
      const result = await reconstructComponentSourceCapsule(bytes, actual.outer, permissions(actual));
      expect(result, change).toMatchObject(change === 'missing-import' ? {kind: 'missing-authority'}
        : {kind: 'incompatible-artifact', rule: change === 'import' ? 'source-response-branches-changed' : 'local-source-changed'});
    }
  });

  it('rejects stale path, identity, policy, version, source order and digest metadata', async () => {
    const actual = await source(), options = permissions(actual);
    const mutations: ((data: Data) => void)[] = [
      data => {data.responseBranches.spec.branches[0]!.path[0]!.namespace = 'urn:spoof';},
      data => {data.responseBranches.spec.branches[0]!.id = 'renamed';},
      data => {data.responseBranches.spec.policy = 'business-code-http200';},
      data => {data.versions.scope = 'component-soap11-response-branches-v999';},
      data => {data.responseBranches.sources[0]!.id = 'wrong-order';},
      data => {data.responseBranches.sources[0]!.source.resources[0]!.digest = '0'.repeat(64);},
    ];
    for (const mutate of mutations) expect(await reconstructComponentSourceCapsule(changed(mutate), actual.outer, options)).toMatchObject({kind: 'incompatible-artifact'});
    for (const mutate of mutations) expect(await reconstructComponentSourceCapsule(changed(mutate, true), actual.outer, options)).toMatchObject({kind: 'incompatible-artifact'});
  });

  it('binds the complete ordered native branch configuration during generator reconstruction', async () => {
    const entries = [...author.entries, {id: 'other-error', path: [name('', 'OtherWrapper'), ...errorPath.slice(1)], contract: author.other}];
    const forward = createComponentResponseBranches(author.outer, author.projection, entries);
    const reverse = createComponentResponseBranches(author.outer, author.projection, [...entries].reverse());
    const renamed = createComponentResponseBranches(author.outer, author.projection, [{...author.entries[0]!, id: 'renamed-error'}]);
    const shortened = createComponentResponseBranches(author.outer, author.projection, [{...author.entries[0]!, path: errorPath.slice(0, 1)}]);
    if (forward.kind !== 'component-response-branches' || reverse.kind !== 'component-response-branches'
      || renamed.kind !== 'component-response-branches' || shortened.kind !== 'component-response-branches') throw new Error('Expected independently qualified alternatives');
    const artifact = await createComponentSourceCapsule(author.outer, selection, undefined, author.projection, forward);
    if (artifact.kind !== 'component-capsule') throw new Error(JSON.stringify(artifact));
    expect(await reconstructComponentSourceCapsuleForOperation(artifact.bytes, author.outer, selection, undefined, author.projection, forward))
      .toMatchObject({kind: 'reconstructed-component'});
    expect(await reconstructComponentSourceCapsuleForOperation(artifact.bytes, author.outer, selection, undefined, author.projection, reverse))
      .toMatchObject({kind: 'incompatible-artifact', rule: 'source-response-branches-changed'});
    for (const changedOwner of [renamed, shortened]) expect(await reconstructComponentSourceCapsuleForOperation(bytes, author.outer, selection, undefined, author.projection, changedOwner))
      .toMatchObject({kind: 'incompatible-artifact', rule: 'source-response-branches-changed'});
    expect(await reconstructComponentSourceCapsuleForOperation(bytes, author.outer, selection, undefined, author.projection))
      .toMatchObject({kind: 'incompatible-artifact', rule: 'source-response-branches-changed'});
  });

  it('retains legacy capsule bytes and refuses mismatched old/new runtime modes explicitly', async () => {
    const actual = await source(), options = permissions(actual);
    const old = await reconstructComponentSourceCapsule(legacy, actual.outer, {...options, responseBranchMode: false});
    expect(old.kind).toBe('reconstructed-component');
    if (old.kind === 'reconstructed-component') {expect(old.responseBranches).toBeUndefined(); expect(componentSourceCapsuleBytes(old)).toEqual(legacy);}
    expect(await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, responseBranchMode: false}))
      .toMatchObject({kind: 'incompatible-artifact', rule: 'response-branch-runtime-version'});
    expect(await reconstructComponentSourceCapsule(legacy, actual.outer, {...options, responseBranchMode: true}))
      .toMatchObject({kind: 'incompatible-artifact', rule: 'response-branch-runtime-version'});
    expect(await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, responseBranchMode: true})).toMatchObject({kind: 'reconstructed-component'});
    const repeated = await createComponentSourceCapsule(author.outer, selection, undefined, author.projection);
    if (repeated.kind !== 'component-capsule') throw new Error(JSON.stringify(repeated));
    expect(repeated.bytes).toEqual(legacy);
  });

  it('preserves cancellation and inclusive shared budget failure through complete reconstruction', async () => {
    const actual = await source(), options = permissions(actual);
    const controller = new AbortController(); controller.abort();
    expect(await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, signal: controller.signal})).toMatchObject({kind: 'cancelled'});
    expect(await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, limits: {maxWork: 1}})).toMatchObject({kind: 'resource-limit'});
    expect(await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, limits: {maxNodes: 1}})).toMatchObject({kind: 'resource-limit'});
    const result = await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, limits: {}});
    if (result.kind !== 'reconstructed-component') throw new Error(JSON.stringify(result));
    expect(await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, limits: {maxWork: result.usage.work}})).toMatchObject({kind: 'reconstructed-component'});
    expect(await reconstructComponentSourceCapsule(bytes, actual.outer, {...options, limits: {maxWork: result.usage.work - 1}})).toMatchObject({kind: 'resource-limit'});
  });
});
