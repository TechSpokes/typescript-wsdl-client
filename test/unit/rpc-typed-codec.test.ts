import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping, inspectComponentValueMapping} from '../../src/compiler/directValues.js';
import {encodeComponentXml, decodeComponentXml} from '../../src/compiler/directCodec.js';
import {noaaCases, noaaInput, noaaNamespace} from '../helpers/noaaRpcOracle.js';
import {createComponentSourceCapsule, reconstructComponentSourceCapsule} from '../../src/compiler/directSourceCapsule.js';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../src/compiler/catalogErrors.js';

const source = path.resolve('test/fixtures/wsdl/real-services/noaa-ndfd/ndfd-xml.wsdl');
async function prepare(operation: string) {
  const selected = await selectComponentOperation(source, {operation, portType: {namespace: noaaNamespace, local: 'ndfdXMLPortType'},
    binding: {namespace: noaaNamespace, local: 'ndfdXMLBinding'}}, {loading: {policy: {fileRoots: [path.dirname(source)]}}});
  if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
  const mapping = createComponentValueMapping(selected.contract, {kind: 'input'});
  if (mapping.kind !== 'component-mapping') throw new Error(JSON.stringify(mapping));
  return {contract: selected.contract, mapping};
}
describe('native typed RPC composition', () => {
  it.each(noaaCases)('round trips all source input duties for $operation', async testCase => {
    const {contract, mapping} = await prepare(testCase.operation), input = noaaInput(testCase);
    const encoded = encodeComponentXml(contract, mapping, input);
    expect(encoded.kind).toBe('component-encoded');
    if (encoded.kind !== 'component-encoded') throw new Error(JSON.stringify(encoded));
    const decoded = decodeComponentXml(contract, mapping, encoded.bytes);
    expect(decoded.kind).toBe('component-decoded');
    if (decoded.kind === 'component-decoded') expect(decoded.validated.value).toEqual(input);
    const again = encodeComponentXml(contract, mapping, Object.fromEntries(Object.entries(input).reverse()));
    if (again.kind !== 'component-encoded') throw new Error(JSON.stringify(again));
    expect(again.bytes).toEqual(encoded.bytes);
  });
  it.each([
    ['LatLonListCityNames', 'displayLevel', '5'], ['LatLonListCityNames', 'displayLevel', '1.5'],
    ['CornerPoints', 'sector', 'unknown'], ['NDFDgenByDay', 'latitude', '1e2'],
    ['NDFDgenByDay', 'startDate', '2026-02-30'], ['NDFDgenByDay', 'numDays', '1.1'],
    ['NDFDgenByDay', 'Unit', 'unknown'], ['NDFDgenByDay', 'format', 'unknown'],
    ['NDFDgen', 'product', 'unknown'], ['NDFDgen', 'startTime', '2026-11-09'],
    ['GmlTimeSeries', 'featureType', 'unknown'], ['GmlTimeSeries', 'compType', 'unknown'],
    ['NDFDgen', 'weatherParameters', {}], ['NDFDgen', 'weatherParameters', null],
  ])('refuses invalid source-restricted input %s %s', async (operation, name, value) => {
    const {contract, mapping} = await prepare(operation as string);
    const input = noaaInput(noaaCases.find(testCase => testCase.operation === operation)!);
    expect(encodeComponentXml(contract, mapping, {...input, [name as string]: value})).toMatchObject({kind: 'value-invalid'});
  });
});

const typedSource = path.resolve('test/conformance/fixtures/assessment/rpc-typed.wsdl');
const typedOptions = {loading: {policy: {fileRoots: [path.dirname(typedSource)]}}};
const typedSelection = {service: {namespace: 'urn:rpc:typed', local: 'Typed'}, port: 'TypedPort'};
const input = {amount: '12345678901234567890.123456789', count: '9007199254740993123456789', day: '2026-11-09-05:30',
  instant: '2026-11-09T01:23:45.6789-05:30', color: 'blue', flags: {fixed: true, selected: false}};
async function synthetic() {
  const selected = await selectComponentOperation(typedSource, {operation: 'Echo',
    portType: {namespace: 'urn:rpc:typed', local: 'TypedPortType'}, binding: {namespace: 'urn:rpc:typed', local: 'TypedBinding'}}, typedOptions);
  if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
  const mapping = createComponentValueMapping(selected.contract, {kind: 'input'});
  if (mapping.kind !== 'component-mapping') throw new Error(JSON.stringify(mapping));
  const encoded = encodeComponentXml(selected.contract, mapping, input);
  if (encoded.kind !== 'component-encoded') throw new Error(JSON.stringify(encoded));
  return {contract: selected.contract, mapping, xml: Buffer.from(encoded.bytes).toString()};
}
describe('independent synthetic typed RPC wire controls', () => {
  it('freezes source plans and enforces fixed Boolean values before writing', async () => {
    const {contract, mapping} = await synthetic();
    const plans = inspectComponentValueMapping(mapping, contract).rpcParts!;
    expect(Object.isFrozen(plans)).toBe(true);
    expect(() => (plans as unknown[]).pop()).toThrow(TypeError);
    expect(encodeComponentXml(contract, mapping, {...input, flags: {fixed: false, selected: false}}))
      .toMatchObject({kind: 'value-invalid', rule: 'fixed-element-value'});
  });
  it('accepts semantically unordered all children without losing false', async () => {
    const {contract, mapping, xml} = await synthetic();
    const reordered = xml.replace(/(<fixed[^>]*>true<\/fixed>)(<selected[^>]*>false<\/selected>)/, '$2$1');
    expect(reordered).not.toBe(xml);
    const decoded = decodeComponentXml(contract, mapping, Buffer.from(reordered));
    if (decoded.kind !== 'component-decoded') throw new Error(JSON.stringify(decoded));
    expect(decoded.validated.value).toEqual(input);
  });
  it.each([
    ['missing field', (xml: string) => xml.replace(/<selected[^>]*>false<\/selected>/, '')],
    ['duplicate field', (xml: string) => xml.replace(/(<selected[^>]*>false<\/selected>)/, '$1$1')],
    ['extra field', (xml: string) => xml.replace('</flags>', '<extra>false</extra></flags>')],
    ['Boolean lexical', (xml: string) => xml.replace('>false</selected>', '>FALSE</selected>')],
    ['fixed value', (xml: string) => xml.replace('>true</fixed>', '>false</fixed>')],
    ['record dynamic type', (xml: string) => xml.replace(':Flags"', ':Color"')],
    ['foreign dynamic namespace', (xml: string) => xml.replaceAll('urn:rpc:typed', 'urn:foreign')],
    ['enum lexical', (xml: string) => xml.replace('>blue</color>', '>green</color>')],
    ['enum base type', (xml: string) => xml.replace(/[A-Za-z0-9_]+:Color"/, 'xsd:string"')],
    ['wrong part order', (xml: string) => xml.replace(/(<amount[^>]*>[^<]*<\/amount>)(<count[^>]*>[^<]*<\/count>)/, '$2$1')],
    ['external graph', (xml: string) => xml.replace('<flags ', '<flags href="https://external.invalid/value" ')],
  ])('refuses final outgoing %s before any dispatch', async (_name, mutate) => {
    const {contract, mapping, xml} = await synthetic(), changed = mutate(xml);
    expect(changed).not.toBe(xml);
    expect(decodeComponentXml(contract, mapping, Buffer.from(changed)).kind).not.toBe('component-decoded');
  });
  it('reconstructs typed source and rejects re-fingerprinted type/order tampering', async () => {
    const {contract} = await synthetic();
    const capsule = await createComponentSourceCapsule(contract, typedSelection);
    if (capsule.kind !== 'component-capsule') throw new Error(JSON.stringify(capsule));
    expect(await reconstructComponentSourceCapsule(capsule.bytes, typedSource, typedOptions)).toMatchObject({kind: 'reconstructed-component'});
    for (const alter of [(parts: {type: {namespace: string; local: string}}[]) => parts.reverse(),
      (parts: {type: {namespace: string; local: string}}[]) => {parts[0]!.type.local = 'string';}]) {
      const parsed = JSON.parse(Buffer.from(capsule.bytes).toString());
      alter(parsed.compatibility.input.parts); delete parsed.fingerprint;
      parsed.fingerprint = createHash('sha256').update(canonicalJson(parsed)).digest('hex');
      expect(await reconstructComponentSourceCapsule(Buffer.from(canonicalJson(parsed)), typedSource, typedOptions))
        .toMatchObject({kind: 'incompatible-artifact', rule: 'source-contract-changed'});
    }
  });
});
