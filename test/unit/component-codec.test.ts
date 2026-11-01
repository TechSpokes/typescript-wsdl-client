import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {selectComponentOperation, selectDirectOperation} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract, DirectOperationSelector} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping, createDirectValueMapping} from '../../src/compiler/directValues.js';
import type {ComponentValueMapping} from '../../src/compiler/directValues.js';
import {encodeComponentXml, decodeComponentXml, encodeDirectXml} from '../../src/compiler/directCodec.js';
import type {SyntaxElement} from '../../src/loader/orderedSyntax.js';

const ns = 'urn:fixture:lexical-response';
const file = path.resolve('test/conformance/fixtures/xsd/simple-content/lexical-response.wsdl');
const selector = {portType: {namespace: ns, local: 'LexicalPort'}, binding: {namespace: ns, local: 'LexicalBinding'}, operation: 'Echo'};
let original: string, directory: string;
beforeAll(async () => {
  original = await readFile(file, 'utf8');
  await mkdir('tmp/conformance/component-codec', {recursive: true});
  directory = await mkdtemp(path.resolve('tmp/conformance/component-codec/suite-'));
});
afterAll(async () => {await rm(directory, {recursive: true, force: true});});
async function contract(text?: string, chosen: DirectOperationSelector = selector): Promise<DirectOperationContract> {
  const root = text === undefined ? path.dirname(file) : await mkdtemp(path.join(directory, 'case-'));
  const source = text === undefined ? file : path.join(root, 'source.wsdl');
  if (text !== undefined) await writeFile(source, text);
  const result = await selectComponentOperation(source, chosen, {loading: {policy: {fileRoots: [root]}}});
  if (result.kind !== 'selected') throw new Error(result.kind + ':' + result.rule);
  return result.contract;
}
function mapping(owner: DirectOperationContract, direction: Parameters<typeof createComponentValueMapping>[1] = {kind: 'output'}): ComponentValueMapping {
  const result = createComponentValueMapping(owner, direction);
  if (result.kind !== 'component-mapping') throw new Error(result.kind + ':' + result.rule);
  return result;
}
const value = {Enabled: true, Label: {Code: 'A&B" C', $value: 'synthetic <label>&\r'}};
const expected = `<n0:Reply xmlns:n0="${ns}" Enabled="true"><n0:Label xmlns:n0="${ns}" Code="A&amp;B&quot; C">synthetic &lt;label&gt;&amp;&#13;</n0:Label></n0:Reply>`;
// These bytes and JSON values are independently specified from the committed synthetic WSDL.
const observed = `<r:Reply xmlns:r="${ns}" Enabled="1"><r:Label Code="A&amp;B&quot; C">synthetic &lt;label&gt;&amp;&#13;</r:Label></r:Reply>`;

describe('component operation codec through shared XML/parser and native value owners', () => {
  it('preserves attributes, simple content, namespaces and typed values across literal XML and JSON serialization', async () => {
    const owner = await contract(), map = mapping(owner);
    const encoded = encodeComponentXml(owner, map, value);
    if (encoded.kind !== 'component-encoded') throw new Error(encoded.kind + ':' + encoded.rule);
    expect(Buffer.from(encoded.bytes).toString('utf8')).toBe(expected);
    const decoded = decodeComponentXml(owner, map, Buffer.from(observed));
    if (decoded.kind !== 'component-decoded') throw new Error(decoded.kind + ':' + decoded.rule);
    expect(decoded.validated.value).toEqual(value);
    expect(decoded.admitted).toBe(false);
    const serialized: unknown = JSON.parse(JSON.stringify(decoded.validated.value));
    const rebuilt = encodeComponentXml(owner, map, serialized);
    if (rebuilt.kind !== 'component-encoded') throw new Error(rebuilt.kind);
    expect(Buffer.from(rebuilt.bytes).toString('utf8')).toBe(expected);
  });

  it('declares a foreign qualified attribute prefix at its actual use and keeps unqualified attributes distinct', async () => {
    const root = await mkdtemp(path.join(directory, 'foreign-'));
    await writeFile(path.join(root, 'attributes.xsd'), '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:component-codec:attributes"><xs:attribute name="Code" type="xs:string"/></xs:schema>');
    const text = original.replace('<wsdl:definitions ', '<wsdl:definitions xmlns:a="urn:component-codec:attributes" ')
      .replace('<xs:complexType name="LabelType">', '<xs:import namespace="urn:component-codec:attributes" schemaLocation="attributes.xsd"/><xs:complexType name="LabelType">')
      .replace('<xs:attribute name="Code" type="xs:string"/>', '<xs:attribute ref="a:Code"/>');
    const source = path.join(root, 'source.wsdl'); await writeFile(source, text);
    const selected = await selectComponentOperation(source, selector, {loading: {policy: {fileRoots: [root]}}});
    if (selected.kind !== 'selected') throw new Error(selected.kind + ':' + selected.rule);
    const owner = selected.contract, map = mapping(owner), encoded = encodeComponentXml(owner, map, value);
    if (encoded.kind !== 'component-encoded') throw new Error(encoded.kind);
    expect(Buffer.from(encoded.bytes).toString()).toBe(expected.replace(' Code=', ' xmlns:n1="urn:component-codec:attributes" n1:Code='));
    const qualified = observed.replace(' Code=', ' xmlns:q="urn:component-codec:attributes" q:Code=');
    const decoded = decodeComponentXml(owner, map, Buffer.from(qualified));
    expect(decoded).toMatchObject({kind: 'component-decoded', validated: {value}});
    expect(decodeComponentXml(owner, map, Buffer.from(observed))).toMatchObject({kind: 'mismatch'});
  });

  it('rejects invalid application/upstream values without coercion, field removal or default rescue', async () => {
    const owner = await contract(), map = mapping(owner);
    for (const invalid of [{...value, Enabled: 'true'}, {Label: value.Label}, {...value, extra: 1}, {...value, Label: {$value: 23}}]) {
      const before = JSON.stringify(invalid);
      expect(encodeComponentXml(owner, map, invalid)).toMatchObject({kind: 'value-invalid'});
      expect(JSON.stringify(invalid)).toBe(before);
    }
    expect(decodeComponentXml(owner, map, Buffer.from(observed.replace('Enabled="1"', 'Enabled="TRUE"')))).toMatchObject({kind: 'scalar-invalid'});
    expect(decodeComponentXml(owner, map, Buffer.from(observed.replace(' Enabled="1"', '')))).toMatchObject({kind: 'mismatch'});
    expect(decodeComponentXml(owner, map, Buffer.from(observed.replace('Enabled="1"', 'Enabled="1" extra="x"')))).toMatchObject({kind: 'mismatch'});
    expect(decodeComponentXml(owner, map, Buffer.from('<!DOCTYPE x [<!ENTITY e "x">]>' + observed))).toMatchObject({kind: 'unsupported'});
  });

  it('applies explicit byte, syntax-node, depth and character-data limits without conflating attribute capacity', async () => {
    const owner = await contract(), map = mapping(owner), size = Buffer.byteLength(expected);
    expect(encodeComponentXml(owner, map, value, {limits: {maxBytes: size, maxNodes: 3, maxDepth: 2}})).toMatchObject({kind: 'component-encoded'});
    expect(encodeComponentXml(owner, map, value, {limits: {maxBytes: size - 1}})).toMatchObject({kind: 'resource-limit'});
    expect(encodeComponentXml(owner, map, value, {limits: {maxNodes: 2}})).toMatchObject({kind: 'resource-limit'});
    expect(encodeComponentXml(owner, map, value, {limits: {maxDepth: 1}})).toMatchObject({kind: 'resource-limit'});
    expect(decodeComponentXml(owner, map, Buffer.from(observed), {limits: {maxNodes: 3, maxDepth: 2}})).toMatchObject({kind: 'component-decoded'});
    const input = mapping(owner, {kind: 'input'}), attributes = {Token: 'synthetic-attribute-value'};
    const encoded = encodeComponentXml(owner, input, attributes, {limits: {maxNodes: 1, maxText: 1}});
    if (encoded.kind !== 'component-encoded') throw new Error(encoded.kind);
    expect(decodeComponentXml(owner, input, encoded.bytes, {limits: {maxNodes: 1, maxText: 1}}))
      .toMatchObject({kind: 'component-decoded', validated: {value: attributes}});
  });

  it('validates declared fault content and binds protocol-selected syntax to the actual parse', async () => {
    const namespace = 'urn:checked:forecast', text = await readFile('test/conformance/fixtures/assessment/forecast.wsdl', 'utf8');
    const owner = await contract(text, {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'});
    const fault = mapping(owner, {kind: 'fault', name: 'ForecastError'});
    const bytes = Buffer.from(`<container><f:ForecastFault xmlns:f="${namespace}"><f:code>SYNTHETIC</f:code><f:message>owned failure</f:message></f:ForecastFault></container>`);
    const payload = (root: SyntaxElement) => root.children.find((child): child is SyntaxElement => child.kind === 'element')!;
    const decoded = decodeComponentXml(owner, fault, bytes, {selectPayload: root => ({payload: payload(root), mapping: fault})});
    expect(decoded).toMatchObject({kind: 'component-decoded', validated: {value: {code: 'SYNTHETIC', message: 'owned failure'}}});
    expect(() => decodeComponentXml(owner, fault, bytes, {selectPayload: root => ({payload: {...payload(root)}, mapping: fault})})).toThrow(TypeError);
    expect(decodeComponentXml(owner, fault, Buffer.from(bytes.toString().replace('<f:message>owned failure</f:message>', '')),
      {selectPayload: root => ({payload: payload(root), mapping: fault})})).toMatchObject({kind: 'mismatch'});
  });

  it('rejects copied/foreign authority and keeps the existing preview codec closed', async () => {
    const owner = await contract(), map = mapping(owner), other = await contract();
    expect(() => encodeComponentXml(owner, {...map}, value)).toThrow(TypeError);
    expect(() => encodeComponentXml(other, map, value)).toThrow(TypeError);
    expect(() => encodeDirectXml(owner, map, value)).toThrow(TypeError);
    const forecast = path.resolve('test/conformance/fixtures/assessment/forecast.wsdl'), namespace = 'urn:checked:forecast';
    const selected = await selectDirectOperation(forecast, {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'},
      {loading: {policy: {fileRoots: [path.dirname(forecast)]}}});
    if (selected.kind !== 'selected') throw new Error(selected.kind);
    const direct = createDirectValueMapping(selected.contract, {kind: 'input'});
    if (direct.kind !== 'direct-mapping') throw new Error(direct.kind);
    expect(() => encodeComponentXml(selected.contract, direct, {city: 'Synthetic', days: 2})).toThrow(TypeError);
    const controller = new AbortController(); controller.abort();
    expect(encodeComponentXml(owner, map, value, {signal: controller.signal})).toMatchObject({kind: 'cancelled'});
  });
});
