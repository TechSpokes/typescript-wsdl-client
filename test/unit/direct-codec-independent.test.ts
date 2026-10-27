import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {selectDirectOperation} from '../../src/compiler/directOperation.js';
import {createDirectValueMapping} from '../../src/compiler/directValues.js';
import {decodeDirectXml, encodeDirectXml} from '../../src/compiler/directCodec.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';

const namespace = 'urn:checked:forecast';
const directory = path.resolve('test/conformance/fixtures/assessment');
async function setup() {
  const operation = await selectDirectOperation(path.join(directory, 'forecast.wsdl'), {
    portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast',
  }, {limits: {}, loading: {policy: {fileRoots: [directory]}}});
  if (operation.kind !== 'selected') throw new Error(operation.kind);
  const mapping = createDirectValueMapping(operation.contract, {kind: 'input'});
  if (mapping.kind !== 'direct-mapping') throw new Error(mapping.kind);
  return {contract: operation.contract, mapping};
}
const request = (city: string) => `<f:GetForecast xmlns:f="${namespace}"><f:city>${city}</f:city><f:days>+002</f:days></f:GetForecast>`;

describe('independent direct codec boundary review', () => {
  it('decodes with its default opaque source URI and separates observed from generated evidence', async () => {
    const {contract, mapping} = await setup();
    const bytes = Buffer.from(request('Paris'));
    const decoded = decodeDirectXml(contract, mapping, bytes);
    expect(decoded.kind).toBe('direct-decoded');
    if (decoded.kind !== 'direct-decoded') throw new Error(decoded.kind);
    expect(decoded.validated.value).toEqual({city: 'Paris', days: 2});
    expect(decoded.payload.baseUri).toBe('urn:typescript-wsdl-client:observed-direct-xml');
    expect(decoded.payload.source.digest).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(decoded.validated.operands[1]!.lexical).toBe('+002');
    const encoded = encodeDirectXml(contract, mapping, decoded.validated.value);
    expect(encoded.kind).toBe('direct-encoded');
    if (encoded.kind !== 'direct-encoded') throw new Error(encoded.kind);
    expect(encoded.expanded.payload.source).toMatchObject({digest: '', start: {offset: 0, line: 0, column: 0}});
    expect(Buffer.from(encoded.bytes).toString()).toContain('>2</');
  });

  it.each(['utf8', 'utf16le'] as const)('rejects a doubled %s BOM rather than silently repairing it', async encoding => {
    const {contract, mapping} = await setup();
    const single = Buffer.from('\ufeff' + request('Paris'), encoding);
    expect(decodeDirectXml(contract, mapping, single).kind).toBe('direct-decoded');
    const duplicate = Buffer.from('\ufeff\ufeff' + request('Paris'), encoding);
    const failed = decodeDirectXml(contract, mapping, duplicate);
    expect(failed.kind).toBe('xml-invalid');
    expect(failed).not.toHaveProperty('payload');
    expect(failed).not.toHaveProperty('validated');
  });

  it.each([1018, 1019, 1020, 1021, 1022, 1023, 1024, 2046])('retains lexical provenance across SAX chunks at offset %i', padding => {
    const xml = '<r>' + 'x'.repeat(padding) + '😀\r\n&amp;<![CDATA[<tail>]]><!-- ignored -->last</r>';
    const root = parseOrderedSyntax(Buffer.from(xml), 'urn:independent:chunk', {xml10Only: true}).root;
    expect(root.source.start.offset).toBe(0);
    expect(root.source.end.offset).toBe(xml.length);
    expect(root.children.map(n => n.kind === 'text' ? n.value : '').join('')).toBe('x'.repeat(padding) + '😀\n&<tail>last');
    const cdata = root.children.find(n => n.kind === 'text' && n.value === '<tail>');
    expect(cdata).toBeDefined();
    if (!cdata) throw new Error('Missing CDATA');
    expect(xml.slice(cdata.source.start.offset, cdata.source.end.offset)).toBe('<tail>');
    const last = root.children.at(-1)!;
    expect(xml.slice(last.source.start.offset, last.source.end.offset)).toBe('last');
  });

  it('uses native byte slots without consulting caller getters or iteration', async () => {
    const {contract, mapping} = await setup();
    const bytes = new Uint8Array(Buffer.from(request('Paris')));
    let calls = 0;
    for (const key of ['byteLength', 'length', 'buffer', Symbol.iterator]) {
      Object.defineProperty(bytes, key, {get() {calls++; throw new Error('caller getter');}});
    }
    expect(decodeDirectXml(contract, mapping, bytes).kind).toBe('direct-decoded');
    expect(calls).toBe(0);
  });

  it('does not resolve an external entity and can decode again after a per-call cap', async () => {
    const {contract, mapping} = await setup();
    const hostile = Buffer.from('<!DOCTYPE f:GetForecast [<!ENTITY read SYSTEM "file:///etc/passwd">]>' + request('&read;'));
    const denied = decodeDirectXml(contract, mapping, hostile);
    expect(denied.kind).toBe('unsupported');
    expect(denied).not.toHaveProperty('payload');
    expect(denied).not.toHaveProperty('validated');
    const bytes = Buffer.from(request('Paris'));
    expect(decodeDirectXml(contract, mapping, bytes, {limits: {maxBytes: bytes.length - 1}}).kind).toBe('resource-limit');
    expect(decodeDirectXml(contract, mapping, bytes, {limits: {maxBytes: bytes.length}}).kind).toBe('direct-decoded');
  });

  it('precharges inherited xml:base growth before constructing amplified URL strings', () => {
    const xml = '<x xml:base="https://example.invalid/' + 'p'.repeat(100_000) + '/">'
      + '<x xml:base="a/">'.repeat(255) + '</x>'.repeat(256);
    const bytes = Buffer.from(xml);
    const budget = createSemanticBudget({maxWork: 12_000_000});
    let visits = 0;
    const result = budget.guard(() => parseOrderedSyntax(bytes, 'urn:independent:base', {
      xml10Only: true,
      chargeWork: amount => budget.chargeWork(amount),
      reserveNode: () => {budget.reserveNodes(1); visits++;},
    }));
    expect(result).toMatchObject({kind: 'resource-limit'});
    expect(budget.exhausted()).toBe(true);
    expect(visits).toBeLessThan(5);
    expect(budget.guard(() => parseOrderedSyntax(Buffer.from('<x/>'), 'urn:independent:base')))
      .toMatchObject({kind: 'resource-limit'});
  });
});
