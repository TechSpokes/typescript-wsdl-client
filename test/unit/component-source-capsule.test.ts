import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {selectComponentOperation, selectComponentOperations, inspectDirectOperation} from '../../src/compiler/directOperation.js';
import {createComponentSourceCapsule, reconstructComponentSourceCapsule, inspectReconstructedComponentSource,
  readDirectSourceCapsule, reconstructComponentSourceCapsuleForOperation} from '../../src/compiler/directSourceCapsule.js';
import {createApplicationBudget} from '../../src/compiler/semanticBudget.js';

const ns = 'urn:conformance:import-relative-types';
const selector = {portType: {namespace: ns, local: 'ImportPortType'}, binding: {namespace: ns, local: 'ImportBinding'}, operation: 'SubmitImported'};
const selection = {service: {namespace: ns, local: 'ImportService'}, port: 'ImportPort'};
let directory: string, original: string, schema: string;
beforeAll(async () => {
  await mkdir('tmp/conformance/component-capsule', {recursive: true});
  directory = await mkdtemp(path.resolve('tmp/conformance/component-capsule/suite-'));
  [original, schema] = await Promise.all([
    readFile('test/conformance/fixtures/xsd/imports/import-relative-types.wsdl', 'utf8'),
    readFile('test/conformance/fixtures/xsd/imports/import-relative-types-types.xsd', 'utf8'),
  ]);
});
afterAll(async () => {await rm(directory, {recursive: true, force: true});});
async function source() {
  const root = await mkdtemp(path.join(directory, 'consumer-')), file = path.join(root, 'source.wsdl');
  await writeFile(file, original); await writeFile(path.join(root, 'import-relative-types-types.xsd'), schema);
  return {file, root, options: {loading: {policy: {fileRoots: [root]}}}};
}
async function capsule() {
  const input = await source(), selected = await selectComponentOperation(input.file, selector, input.options);
  if (selected.kind !== 'selected') throw new Error(selected.kind);
  const result = await createComponentSourceCapsule(selected.contract, selection);
  if (result.kind !== 'component-capsule') throw new Error(result.kind + ':' + result.rule);
  return {input, selected, bytes: result.bytes};
}

describe('component original-resource artifacts through native reconstruction', () => {
  it('selects a complete requested batch with one native source authority and refuses mixed operation artifacts', async () => {
    const input = await source();
    const text = original.replace('</wsdl:portType>', '<wsdl:operation name="Other"><wsdl:input message="tns:SubmitImportedInput"/><wsdl:output message="tns:SubmitImportedOutput"/></wsdl:operation></wsdl:portType>')
      .replace('</wsdl:binding>', '<wsdl:operation name="Other"><soap:operation soapAction="urn:Other"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation></wsdl:binding>');
    await writeFile(input.file, text);
    const results = await selectComponentOperations(input.file, [selector, {...selector, operation: 'Missing'}, {...selector, operation: 'Other'}], input.options);
    expect(results.map(result => result.kind)).toEqual(['selected', 'selection-refused', 'selected']);
    const selected = results.filter(result => result.kind === 'selected');
    expect(selected).toHaveLength(2);
    const first = selected[0]!.contract, second = selected[1]!.contract;
    expect(inspectDirectOperation(first).source).toBe(inspectDirectOperation(second).source);
    expect(inspectDirectOperation(first).context).toBe(inspectDirectOperation(second).context);
    expect(inspectDirectOperation(first).evidence).toBe(inspectDirectOperation(second).evidence);
    expect(first.binding.action).toBe('urn:SubmitImported'); expect(second.binding.action).toBe('urn:Other');
    const artifact = await createComponentSourceCapsule(first, selection);
    if (artifact.kind !== 'component-capsule') throw new Error(artifact.kind);
    expect(await reconstructComponentSourceCapsuleForOperation(artifact.bytes, first, selection)).toMatchObject({kind: 'reconstructed-component'});
    expect(await reconstructComponentSourceCapsuleForOperation(artifact.bytes, second, selection)).toMatchObject({kind: 'incompatible-artifact', rule: 'source-contract-changed'});
    await expect(reconstructComponentSourceCapsuleForOperation(artifact.bytes, {...first}, selection)).rejects.toThrow(TypeError);
  });

  it('reconstructs relocated original files and imported anonymous nested roots, without embedded-source authority', async () => {
    const expected = await capsule(), relocated = await source();
    const repeated = await createComponentSourceCapsule(expected.selected.contract, selection);
    expect(repeated).toMatchObject({kind: 'component-capsule'});
    if (repeated.kind !== 'component-capsule') throw new Error(repeated.kind);
    expect(repeated.bytes).toEqual(expected.bytes);
    await rm(expected.input.root, {recursive: true});
    const result = await reconstructComponentSourceCapsule(expected.bytes, relocated.file, relocated.options);
    expect(result.kind).toBe('reconstructed-component');
    if (result.kind !== 'reconstructed-component') throw new Error(result.kind + ':' + result.rule);
    expect(inspectReconstructedComponentSource(result)).toBe(result);
    expect(result.contract.basis).toBe('native-component-premises-v1');
    expect(result.mappings.map(mapping => mapping.direction.kind)).toEqual(['input', 'output']);
    expect(() => inspectReconstructedComponentSource({...result})).toThrow(TypeError);
    expect(readDirectSourceCapsule(expected.bytes, createApplicationBudget())).toMatchObject({kind: 'incompatible-artifact'});
  });

  it('refuses physical source/dependency changes and missing imports despite intact embedded bytes', async () => {
    const expected = await capsule();
    for (const change of ['root', 'dependency', 'missing'] as const) {
      const actual = await source(), dependency = path.join(actual.root, 'import-relative-types-types.xsd');
      if (change === 'root') await writeFile(actual.file, original + '\n');
      if (change === 'dependency') await writeFile(dependency, schema + '\n');
      if (change === 'missing') await rm(dependency);
      const result = await reconstructComponentSourceCapsule(expected.bytes, actual.file, actual.options);
      expect(result).toMatchObject(change === 'missing' ? {kind: 'missing-authority'} : {kind: 'incompatible-artifact', rule: 'local-source-changed'});
    }
  });

  it('does not let a supplied old root snapshot mask a changed physical WSDL', async () => {
    const expected = await capsule(), actual = await source(), bytes = Buffer.from(original);
    const offlineResources = new Map([[pathToFileURL(actual.file).href, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]]);
    await writeFile(actual.file, original + '\n');
    expect(await reconstructComponentSourceCapsule(expected.bytes, actual.file, {
      loading: {...actual.options.loading, offlineResources},
    })).toMatchObject({kind: 'incompatible-artifact', rule: 'local-source-changed'});
  });

  it('refuses corrupt, stale, foreign-byte, unauthorized and cancelled requests', async () => {
    const expected = await capsule(), actual = await source();
    const text = Buffer.from(expected.bytes).toString();
    for (const altered of [text.replace('component-values-v1', 'direct-values-v1'), text.replace(/"digest":"[a-f0-9]+"/, '"digest":"bad"')]) {
      expect(await reconstructComponentSourceCapsule(Buffer.from(altered), actual.file, actual.options)).toMatchObject({kind: 'incompatible-artifact'});
    }
    expect(await reconstructComponentSourceCapsule(new Uint8Array(new SharedArrayBuffer(8)), actual.file, actual.options)).toMatchObject({kind: 'incompatible-artifact'});
    expect(await reconstructComponentSourceCapsule(expected.bytes, actual.file, {loading: {policy: {fileRoots: [expected.input.root]}}})).toMatchObject({kind: 'missing-authority'});
    const controller = new AbortController(); controller.abort();
    expect(await reconstructComponentSourceCapsule(expected.bytes, actual.file, {...actual.options, signal: controller.signal})).toMatchObject({kind: 'cancelled'});
    expect(await reconstructComponentSourceCapsule(expected.bytes, actual.file, {...actual.options, limits: {maxWork: 1}})).toMatchObject({kind: 'resource-limit'});
  });
});
