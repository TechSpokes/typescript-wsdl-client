import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import {createComponentSourceCapsule, reconstructComponentSourceCapsule, reconstructComponentSourceCapsuleForOperation} from '../../src/compiler/directSourceCapsule.js';
import {canonicalJson} from '../../src/compiler/catalogErrors.js';

const fixture = path.resolve('test/conformance/fixtures/assessment/rpc-strings.wsdl');
const selector = {portType: {namespace: 'urn:rpc:strings', local: 'StringsPortType'}, binding: {namespace: 'urn:rpc:strings', local: 'StringsBinding'}, operation: 'Echo'};
const selection = {service: {namespace: 'urn:rpc:strings', local: 'Strings'}, port: 'StringsPort'};
let scratch: string, original: string;
beforeAll(async () => {
  await mkdir('tmp/conformance/rpc-artifacts', {recursive: true});
  scratch = await mkdtemp(path.resolve('tmp/conformance/rpc-artifacts/suite-'));
  original = await readFile(fixture, 'utf8');
});
afterAll(async () => {await rm(scratch, {recursive: true, force: true});});
async function source(text = original) {
  const root = await mkdtemp(path.join(scratch, 'source-')), file = path.join(root, 'source.wsdl');
  await writeFile(file, text);
  const options = {loading: {policy: {fileRoots: [root]}}};
  return {root, file, options};
}
async function capsule() {
  const input = await source(), selected = await selectComponentOperation(input.file, selector, input.options);
  if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
  const artifact = await createComponentSourceCapsule(selected.contract, selection);
  if (artifact.kind !== 'component-capsule') throw new Error(JSON.stringify(artifact));
  return {input, contract: selected.contract, bytes: artifact.bytes};
}

describe('bounded RPC source and artifact authority', () => {
  it('deterministically reconstructs typed parts from relocated original bytes', async () => {
    const expected = await capsule(), relocated = await source();
    const repeat = await createComponentSourceCapsule(expected.contract, selection);
    if (repeat.kind !== 'component-capsule') throw new Error(JSON.stringify(repeat));
    expect(repeat.bytes).toEqual(expected.bytes);
    const value = JSON.parse(Buffer.from(expected.bytes).toString()) as {versions: {values: string}; compatibility: {input: {kind: string; parts: {name: string}[]}}};
    expect(value.compatibility.input.kind).toBe('rpc-typed-parts-v1');
    expect(value.compatibility.input.parts.map(p => p.name)).toEqual(['first', 'second']);
    expect(await reconstructComponentSourceCapsule(expected.bytes, relocated.file, relocated.options)).toMatchObject({kind: 'reconstructed-component'});
    await expect(reconstructComponentSourceCapsuleForOperation(expected.bytes, {...expected.contract}, selection)).rejects.toThrow(TypeError);
  });
  it('rejects stale/tampered typed parts and source bytes before execution', async () => {
    const expected = await capsule(), relocated = await source();
    const text = Buffer.from(expected.bytes).toString();
    for (const tampered of [text.replace('component-rpc-string-values-v1', 'component-values-v1'), text.replace('"bodyNamespace":"urn:rpc:body"', '"bodyNamespace":"urn:foreign"'), text.replace('"name":"first"', '"name":"foreign"')]) {
      expect(tampered).not.toBe(text);
      expect(await reconstructComponentSourceCapsule(Buffer.from(tampered), relocated.file, relocated.options)).toMatchObject({kind: 'incompatible-artifact'});
    }
    await writeFile(relocated.file, original + '\n');
    expect(await reconstructComponentSourceCapsule(expected.bytes, relocated.file, relocated.options)).toMatchObject({kind: 'incompatible-artifact', rule: 'local-source-changed'});
  });
  it('rejects a recomputed fingerprint when its source-owned parameter order is forged', async () => {
    const expected = await capsule();
    const parsed = JSON.parse(Buffer.from(expected.bytes).toString()) as {compatibility: {input: {parts: unknown[]}}; fingerprint?: string};
    parsed.compatibility.input.parts.reverse(); delete parsed.fingerprint;
    parsed.fingerprint = createHash('sha256').update(canonicalJson(parsed)).digest('hex');
    expect(await reconstructComponentSourceCapsule(Buffer.from(canonicalJson(parsed)), expected.input.file, expected.input.options)).toMatchObject({kind: 'incompatible-artifact', rule: 'source-contract-changed'});
  });
  it('rejects a string-only artifact relabeled as the typed interpretation', async () => {
    const expected = await capsule();
    const parsed = JSON.parse(Buffer.from(expected.bytes).toString());
    parsed.versions.scope = 'component-soap11-rpc-typed-latin1-v1';
    parsed.versions.mapping = 'component-rpc-typed-values-v1'; delete parsed.fingerprint;
    parsed.fingerprint = createHash('sha256').update(canonicalJson(parsed)).digest('hex');
    expect(await reconstructComponentSourceCapsule(Buffer.from(canonicalJson(parsed)), expected.input.file, expected.input.options))
      .toMatchObject({kind: 'incompatible-artifact', rule: 'rpc-type-version'});
  });
  it.each([
    ['rpc/literal', (text: string) => text.replaceAll('use="encoded"', 'use="literal"')],
    ['non-string return type', (text: string) => text.replace('name="result" type="xsd:string"', 'name="result" type="xsd:int"')],
    ['multiple return values', (text: string) => text.replace('name="result" type="xsd:string"/>', 'name="result" type="xsd:string"/><part name="extra" type="xsd:string"/>')],
    ['parameter order', (text: string) => text.replace('<operation name="Echo"><input', '<operation name="Echo" parameterOrder="first second"><input')],
    ['other encoding', (text: string) => text.replaceAll('encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"', 'encodingStyle="urn:other"')],
  ])('honestly refuses unsupported %s source structure', async (_label, alter) => {
    const input = await source(alter(original));
    expect(await selectComponentOperation(input.file, selector, input.options)).toMatchObject({kind: 'unsupported'});
  });
  it.each(['namespace="urn:foreign"', 'encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"'])('preserves document/literal body-attribute refusal for %s', async attribute => {
    const forecast = await readFile('test/conformance/fixtures/assessment/forecast.wsdl', 'utf8');
    const input = await source(forecast.replace('<soap:body use="literal"', `<soap:body ${attribute} use="literal"`));
    const namespace = 'urn:checked:forecast';
    expect(await selectComponentOperation(input.file, {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'}, input.options))
      .toMatchObject({kind: 'unsupported', rule: 'binding-attribute-shape'});
  });
});
