import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract} from '../../src/compiler/directOperation.js';
import {acquireStandardSchemaLibrary, SCHEMA_ELEMENT_LIBRARY} from '../../src/compiler/standardSchemaComponents.js';
import {createComponentRecordProjection, decodeComponentRecordXml, inspectComponentRecordProjection, inspectComponentRecordValue, validateComponentRecordApplication} from '../../src/compiler/componentRecordProjection.js';
import type {ComponentRecordProjection, ComponentRecordProjectionSpec} from '../../src/compiler/componentRecordProjection.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {observeComponentXml, assessObservedComponentPayload} from '../../src/compiler/directCodec.js';

const directory = path.resolve('test/conformance/fixtures/xsd/standard-schema-element');
const ns = 'urn:owned:wrapper', xsd = 'http://www.w3.org/2001/XMLSchema';
const name = (local: string) => ({namespace: ns, local});
const recordScopeSpec: ComponentRecordProjectionSpec = {version: 'component-record-scope-v1', scope: 'records-with-declared-wrapper-scope',
  payloadPath: [name('Envelope')], recordPath: [name('Records'), name('Record')],
  opaqueExclusions: [{path: [{namespace: xsd, local: 'schema'}], reason: 'standard-schema-metadata'},
    {path: [name('Envelope')], reason: 'wrapper-declaration-universe'}]};
const recordXml = '<Envelope xmlns="urn:owned:wrapper"><Records><Record Code="0007"><Name>A &amp; B</Name><Active>true</Active><Quantity>2</Quantity></Record><Record Code="0008"><Name>C</Name><Active>false</Active><Quantity>0</Quantity></Record></Records></Envelope>';
const xml = (payload = recordXml, metadata = `<xs:schema xmlns:xs="${xsd}"/>`) => Buffer.from(`<Envelope xmlns="${ns}">${metadata}${payload}</Envelope>`);
let outer: DirectOperationContract, companion: DirectOperationContract, projection: ComponentRecordProjection;
beforeAll(async () => {
  const selected = await selectComponentOperation(path.join(directory, 'wrapper.wsdl'), {
    portType: name('WrapperPortType'), binding: name('WrapperBinding'), operation: 'Fetch'}, {
    loading: {policy: {fileRoots: [directory]}}, standardLibraries: [acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY)]});
  const records = await selectComponentOperation(path.join(directory, 'records.wsdl'), {
    portType: name('RecordPortType'), binding: name('RecordBinding'), operation: 'Fetch'}, {loading: {policy: {fileRoots: [directory]}}});
  if (selected.kind !== 'selected' || records.kind !== 'selected') throw new Error(JSON.stringify({selected, records}));
  outer = selected.contract; companion = records.contract;
  const mapped = createComponentRecordProjection(outer, companion, recordScopeSpec);
  if (mapped.kind !== 'component-record-projection') throw new Error(JSON.stringify(mapped));
  projection = mapped;
});

describe('explicit native companion record scope', () => {
  it('preserves typed records across a same-QName boundary using separate native contexts', () => {
    expect(outer.output.element.name).toEqual(companion.output.element.name);
    expect(outer.contextId).not.toBe(companion.contextId);
    const decoded = decodeComponentRecordXml(outer, projection, xml());
    expect(decoded.kind).toBe('component-record-decoded');
    if (decoded.kind !== 'component-record-decoded') throw new Error(decoded.kind);
    expect(decoded.validated.recordCount).toBe(2);
    expect(JSON.parse(JSON.stringify(decoded.validated.value))).toEqual({Records: {Record: [
      {Code: '0007', Name: 'A & B', Active: true, Quantity: 2}, {Code: '0008', Name: 'C', Active: false, Quantity: 0},
    ]}});
    expect(inspectComponentRecordValue(decoded.validated, projection)).toBe(decoded.validated);
    expect(() => inspectComponentRecordValue({...decoded.validated}, projection)).toThrow('Native matching');
    expect(() => inspectComponentRecordProjection({...projection}, outer)).toThrow('Native matching');
    expect(() => inspectComponentRecordProjection(projection, companion)).toThrow('Native matching');
  });

  it('refuses missing, reordered, extra and invalid standard metadata and invalid companion values', () => {
    for (const bytes of [xml(recordXml, ''), Buffer.from(`<Envelope xmlns="${ns}">${recordXml}<xs:schema xmlns:xs="${xsd}"/></Envelope>`),
      xml(recordXml + recordXml), xml(recordXml, `<xs:schema xmlns:xs="${xsd}"><xs:element/></xs:schema>`),
      xml(recordXml.replace('<Active>true</Active>', '<Active>not-a-boolean</Active>')),
      xml(recordXml.replace(' Code="0007"', '')), Buffer.from(xml().toString('utf8').replace('><xs:schema', '>\u00a0<xs:schema'))]) {
      expect(decodeComponentRecordXml(outer, projection, bytes).kind).not.toBe('component-record-decoded');
    }
  });

  it('retains companion metadata and non-record fields rather than reducing the response to a successful array', () => {
    const payload = recordXml.replace('<Envelope xmlns="urn:owned:wrapper">', '<Envelope xmlns="urn:owned:wrapper" Stamp="synthetic-stamp">')
      .replace('<Records>', '<Notice>Synthetic warning</Notice><Records>');
    const decoded = decodeComponentRecordXml(outer, projection, xml(payload));
    if (decoded.kind !== 'component-record-decoded') throw new Error(decoded.kind);
    expect(decoded.validated.recordCount).toBe(2);
    expect(decoded.validated.value).toMatchObject({Stamp: 'synthetic-stamp', Notice: 'Synthetic warning', Records: {Record: [{Code: '0007'}, {Code: '0008'}]}});
  });

  it('revalidates JSON values through the original companion owner without coercing or stripping fields', () => {
    const decoded = decodeComponentRecordXml(outer, projection, xml());
    if (decoded.kind !== 'component-record-decoded') throw new Error(decoded.kind);
    const value = JSON.parse(JSON.stringify(decoded.validated.value)) as {Records: {Record: {Quantity: unknown}[]}};
    expect(validateComponentRecordApplication(projection, value).kind).toBe('projection-expanded');
    value.Records.Record[0]!.Quantity = '2';
    expect(validateComponentRecordApplication(projection, value).kind).not.toBe('projection-expanded');
    expect(value.Records.Record[0]!.Quantity).toBe('2');
    expect(validateComponentRecordApplication(projection, {...value, unknown: true}).kind).not.toBe('projection-expanded');
  });

  it('requires explicit native record paths and exclusions without accepting configuration rescue fields', () => {
    const wrong = [
      {...recordScopeSpec, recordPath: [name('GuessedFromOperation')]},
      {...recordScopeSpec, opaqueExclusions: []},
      {...recordScopeSpec, payloadPath: [name('Other')]},
      {...recordScopeSpec, coerce: true},
    ];
    for (const spec of wrong) expect(createComponentRecordProjection(outer, companion, spec).kind).not.toBe('component-record-projection');
  });

  it('keeps cancellation, caller XML capacity and genuine parse ownership authoritative', () => {
    const controller = new AbortController(); controller.abort();
    expect(decodeComponentRecordXml(outer, projection, xml(), {signal: controller.signal}).kind).toBe('cancelled');
    expect(decodeComponentRecordXml(outer, projection, xml(), {limits: {maxBytes: 8}})).toMatchObject({kind: 'resource-limit', rule: 'XML byte limit'});
    const mapping = createComponentValueMapping(companion, {kind: 'output'});
    if (mapping.kind !== 'component-mapping') throw new Error('Expected companion mapping');
    const observed = observeComponentXml(companion, mapping, Buffer.from(recordXml));
    if (observed.kind !== 'observed-component-xml') throw new Error('Expected observed XML');
    expect(() => assessObservedComponentPayload(companion, mapping, {...observed}, observed.root)).toThrow('Native component XML');
    expect(() => assessObservedComponentPayload(companion, mapping, observed, {...observed.root})).toThrow('belong');
    expect(assessObservedComponentPayload(companion, mapping, observed, observed.root).kind).toBe('component-decoded');
  });
});
