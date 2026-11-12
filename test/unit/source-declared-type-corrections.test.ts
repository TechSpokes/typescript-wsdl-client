import {afterAll, describe, expect, it} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSemanticSchemaInput, copyOriginalSchemaResource} from '../../src/loader/schemaInput.js';
import type {SchemaInput} from '../../src/loader/schemaInput.js';
import {inspectSourceCorrectionInventory, prepareCorrectedSourceInputs, recoverOriginalSourceCorrectionTarget} from '../../src/compiler/sourceCorrections.js';
import type {PreparedCorrectedSourceInputs, SourceCorrectionInventory, SourceCorrectionInventoryNode} from '../../src/compiler/sourceCorrections.js';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {decodeComponentXml} from '../../src/compiler/directCodec.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {XSD_NAMESPACE} from '../../src/loader/orderedSyntax.js';

const fixture = path.resolve('test/conformance/fixtures/xsd/types/type-declared-corrections.wsdl');
const namespace = 'urn:owned:type-corrections';
const name = (local: string, ns = XSD_NAMESPACE) => ({namespace: ns, local});
const temporary: string[] = [];
afterAll(async () => {for (const directory of temporary) await rm(directory, {recursive: true, force: true});});
async function directory() {
  await mkdir('tmp/conformance/declared-types', {recursive: true});
  const result = await mkdtemp(path.resolve('tmp/conformance/declared-types/case-'));
  temporary.push(result); return result;
}
async function source(text?: string, filename = 'types.xsd') {
  if (text === undefined) return loadSemanticSchemaInput(fixture, {policy: {fileRoots: [path.dirname(fixture)]}});
  const root = await directory(), file = path.join(root, filename);
  await writeFile(file, text);
  return loadSemanticSchemaInput(file, {policy: {fileRoots: [root]}});
}
function target(inventory: SourceCorrectionInventory, local: string, kind: SourceCorrectionInventoryNode['kind'] = 'element', uri?: string) {
  const found = inventory.nodes.find(node => node.kind === kind && (!uri || node.uri === uri)
    && node.attributes.some(attribute => attribute.namespace === '' && attribute.name === 'name' && attribute.value === local));
  if (!found) throw new Error(`Missing original ${kind} ${local}`);
  return found;
}
const selector = (node: SourceCorrectionInventoryNode) => ({id: node.id, uri: node.uri, digest: node.digest});
function correction(node: SourceCorrectionInventoryNode, type = name('string'), expectedType = node.declaredType) {
  if (!expectedType) throw new Error('Expected an authored declared type');
  return {kind: 'set-declared-type', target: selector(node), expectedType, type};
}
const recipe = (inventory: SourceCorrectionInventory, corrections: unknown[]) => ({version: 1,
  resources: inventory.resources.map(({uri, digest}) => ({uri, digest})), corrections});
async function effective(input: SchemaInput, prepared: PreparedCorrectedSourceInputs) {
  return loadSemanticSchemaInput(input.root.uri, {policy: {fileRoots: [path.dirname(fileURLToPath(input.root.uri))]},
    offlineResources: prepared.resources});
}
async function decoder(input: SchemaInput, prepared?: PreparedCorrectedSourceInputs, operation = 'Fetch') {
  const result = await selectComponentOperation(input.root.uri, {portType: name('ContentPortType', namespace), binding: name('ContentBinding', namespace), operation}, {
    loading: {policy: {fileRoots: [path.dirname(fixture), ...temporary]}, ...(prepared ? {offlineResources: prepared.resources} : {})}});
  if (result.kind !== 'selected') throw new Error(JSON.stringify(result));
  const mapping = createComponentValueMapping(result.contract, {kind: 'output'});
  if (mapping.kind !== 'component-mapping') throw new Error(JSON.stringify(mapping));
  return (xml: string) => decodeComponentXml(result.contract, mapping, Buffer.from(xml));
}
const embedText = '<iframe src="https://example.test/embed"/>';
const embedXml = '&lt;iframe src=&quot;https://example.test/embed&quot;/&gt;';
const payload = (embed = embedXml, stamp = '2026-01-02 03:04:05Z', extra = '') =>
  `<t:FetchResponse xmlns:t="${namespace}" Stamp="${stamp}"><t:Embed>${embed}</t:Embed>${extra}</t:FetchResponse>`;

describe('pinned authored declared-type corrections', () => {
  it('changes element and attribute builtin references without changing originals or unrelated constraints', async () => {
    const input = await source(), inventory = inspectSourceCorrectionInventory([input]);
    const element = target(inventory, 'Embed'), attribute = target(inventory, 'Stamp', 'attribute');
    expect(element.declaredType).toEqual(name('anyURI')); expect(attribute.declaredType).toEqual(name('dateTime'));
    const original = copyOriginalSchemaResource(input, input.root.uri, () => {}), response = Buffer.from(payload());
    const originalDecode = await decoder(input);
    expect(originalDecode(payload(embedXml, '2026-01-02T03:04:05Z')).kind).toBe('scalar-invalid');
    expect(originalDecode(payload('https://example.test/valid', '2026-01-02 03:04:05Z')).kind).toBe('scalar-invalid');
    expect(originalDecode(payload('https://example.test/valid', '2026-01-02T03:04:05Z')).kind).toBe('component-decoded');
    const prepared = prepareCorrectedSourceInputs([input], recipe(inventory, [correction(element), correction(attribute)]));
    expect(copyOriginalSchemaResource(input, input.root.uri, () => {})).toEqual(original);
    expect(prepared.provenance.corrections.map(item => item.kind)).toEqual(['set-declared-type', 'set-declared-type']);
    expect(prepared.provenance.resources).toMatchObject([{originalDigest: input.root.digest, changed: true}]);
    const decode = await decoder(input, prepared);
    const result = decode(response.toString());
    expect(result.kind).toBe('component-decoded');
    if (result.kind === 'component-decoded') expect(result.validated.value).toEqual({Embed: embedText, Stamp: '2026-01-02 03:04:05Z'});
    expect(response).toEqual(Buffer.from(payload()));
    expect(decode(payload('raw text', 'nonsense')).kind).toBe('component-decoded');
    expect(decode(payload('raw text', 'nonsense', '<t:Unknown/>')).kind).toBe('mismatch');
    expect(decode(payload('raw text', 'nonsense', '<t:Embed>duplicate</t:Embed>')).kind).toBe('mismatch');
    expect(decode(`<t:FetchResponse xmlns:t="${namespace}" Stamp="nonsense"/>`).kind).toBe('mismatch');
  });

  it('uses existing constrained types for both declaration kinds while retaining their actual guarantees', async () => {
    const input = await source(), inventory = inspectSourceCorrectionInventory([input]);
    const prepared = prepareCorrectedSourceInputs([input], recipe(inventory, [
      correction(target(inventory, 'Embed'), name('TimestampLayout', namespace)),
      correction(target(inventory, 'Stamp', 'attribute'), name('TimestampLayout', namespace)),
    ]));
    const decode = await decoder(input, prepared);
    expect(decode(payload('2026-99-99 77:88:99Z', '2026-99-99 77:88:99Z')).kind).toBe('component-decoded');
    expect(decode(payload('nonsense')).kind).toBe('scalar-invalid');
    expect(decode(payload('2026-01-02 03:04:05Z', 'nonsense')).kind).toBe('scalar-invalid');
    const next = await effective(input, prepared), graph = buildCanonicalGraph(next);
    expect(() => resolveCanonicalGraph(graph)).not.toThrow();
    const declaration = graph.nodes.find(node => node.kind === 'attribute' && node.name.local === 'Stamp');
    if (!declaration) throw new Error('Expected attribute after effective reload');
    expect(recoverOriginalSourceCorrectionTarget(prepared, declaration.context.source, namespace, 'attribute')).toEqual({kind: 'available',
      target: selector(target(inventory, 'Stamp', 'attribute')), declaredType: name('dateTime')});
  });

  it('changes all shared declaration uses while isolating colliding independent source universes', async () => {
    const text = (await readFile(fixture, 'utf8'))
      .replace('<xs:element name="FetchResponse"', '<xs:element name="OtherResponse" type="t:Content"/><xs:element name="FetchResponse"')
      .replace('<wsdl:portType name="ContentPortType">', '<wsdl:message name="OtherOutput"><wsdl:part name="parameters" element="t:OtherResponse"/></wsdl:message><wsdl:portType name="ContentPortType"><wsdl:operation name="FetchOther"><wsdl:input message="t:Input"/><wsdl:output message="t:OtherOutput"/></wsdl:operation>')
      .replace('<soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>', '<soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/><wsdl:operation name="FetchOther"><soap:operation soapAction="urn:owned:type-corrections:other"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation>');
    const first = await source(text, 'first.wsdl'), second = await source(text, 'second.wsdl');
    const inventory = inspectSourceCorrectionInventory([first, second]);
    const prepared = prepareCorrectedSourceInputs([first, second], recipe(inventory, [
      correction(target(inventory, 'Embed', 'element', first.root.uri)), correction(target(inventory, 'Stamp', 'attribute', first.root.uri)),
    ]));
    expect(prepared.resources.get(second.root.uri)?.digest).toBe(second.root.digest);
    expect((await decoder(first, prepared))(payload()).kind).toBe('component-decoded');
    const otherPayload = payload().replaceAll('FetchResponse', 'OtherResponse');
    expect((await decoder(first, prepared, 'FetchOther'))(otherPayload).kind).toBe('component-decoded');
    expect((await decoder(second, prepared))(payload()).kind).toBe('scalar-invalid');
    expect((await decoder(second, prepared, 'FetchOther'))(otherPayload).kind).toBe('scalar-invalid');
    const graph = buildCanonicalGraph(await effective(first, prepared));
    const roots = graph.nodes.filter(node => node.kind === 'element' && ['OtherResponse', 'FetchResponse'].includes(node.name.local));
    expect(roots).toHaveLength(2);
    expect(roots.every(node => node.kind === 'element' && node.type.kind === 'symbol' && node.type.name.local === 'Content')).toBe(true);
  });

  it('refuses stale pins, wrong expected types, malformed operands and duplicate authored edits', async () => {
    const input = await source(), inventory = inspectSourceCorrectionInventory([input]), element = target(inventory, 'Embed');
    const edit = correction(element);
    expect(() => prepareCorrectedSourceInputs([input], recipe(inventory, [{...edit, target: {...edit.target, digest: '0'.repeat(64)}}]))).toThrow(/pinned canonical inventory/);
    expect(() => prepareCorrectedSourceInputs([input], recipe(inventory, [{...edit, expectedType: name('string')}]))).toThrow(/expectedType/);
    expect(() => prepareCorrectedSourceInputs([input], recipe(inventory, [{...edit, type: name('Missing', namespace)}]))).toThrow(/existing named type/);
    expect(() => prepareCorrectedSourceInputs([input], recipe(inventory, [{...edit, type: name('not:a:name')}]))).toThrow(/NCName/);
    expect(() => prepareCorrectedSourceInputs([input], recipe(inventory, [{...edit, extra: true}]))).toThrow(/unknown fields/);
    expect(() => prepareCorrectedSourceInputs([input], recipe(inventory, [edit, edit]))).toThrow(/Conflicting correction/);
    const aborted = new AbortController(); aborted.abort();
    expect(() => prepareCorrectedSourceInputs([input], recipe(inventory, [edit]), aborted.signal)).toThrow(/cancelled/);
  });

  it('refuses inline, implicit, ref and illegal attribute complex-type forms', async () => {
    const input = await source(`<xs:schema xmlns:xs="${XSD_NAMESPACE}" xmlns:t="urn:forms" targetNamespace="urn:forms"><xs:complexType name="Complex"><xs:sequence/></xs:complexType><xs:element name="Global" type="xs:string"/><xs:element name="Inline"><xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType></xs:element><xs:element name="Implicit"/><xs:complexType name="Payload"><xs:sequence><xs:element ref="t:Global"/></xs:sequence><xs:attribute name="Attr" type="xs:string"/></xs:complexType></xs:schema>`);
    const inventory = inspectSourceCorrectionInventory([input]);
    for (const local of ['Inline', 'Implicit']) {
      const selected = target(inventory, local);
      expect(selected.declaredType).toBeUndefined();
      expect(() => prepareCorrectedSourceInputs([input], recipe(inventory, [correction(selected, name('string'), name('string'))]))).toThrow(/authored element or attribute/);
    }
    const ref = inventory.nodes.find(node => node.kind === 'particle' && node.attributes.some(attribute => attribute.name === 'ref'))!;
    expect(() => prepareCorrectedSourceInputs([input], recipe(inventory, [correction(ref, name('string'), name('string'))]))).toThrow(/ref forms refuse/);
    const attribute = target(inventory, 'Attr', 'attribute');
    for (const type of [name('anyType'), name('Complex', 'urn:forms')]) {
      expect(() => prepareCorrectedSourceInputs([input], recipe(inventory, [correction(attribute, type)]))).toThrow(/must be simple/);
    }
  });

  it('requires the declaring schema import and a type in its own closure', async () => {
    const root = await directory();
    const other = path.join(root, 'other.xsd'), main = path.join(root, 'main.xsd');
    await writeFile(other, `<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="urn:other"><xs:simpleType name="Existing"><xs:restriction base="xs:string"/></xs:simpleType></xs:schema>`);
    const mainText = `<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="urn:main"><xs:import namespace="urn:other" schemaLocation="other.xsd"/><xs:element name="Value" type="xs:string"/></xs:schema>`;
    await writeFile(main, mainText);
    const input = await loadSemanticSchemaInput(main, {policy: {fileRoots: [root]}}), inventory = inspectSourceCorrectionInventory([input]);
    const prepared = prepareCorrectedSourceInputs([input], recipe(inventory, [correction(target(inventory, 'Value'), name('Existing', 'urn:other'))]));
    const next = await effective(input, prepared);
    expect(() => resolveCanonicalGraph(buildCanonicalGraph(next))).not.toThrow();
    expect(Buffer.from(prepared.resources.get(input.root.uri)!.bytes).toString()).toContain('xmlns:correction="urn:other"');
    const independent = await source(mainText.replace('<xs:import namespace="urn:other" schemaLocation="other.xsd"/>', ''));
    const foreign = await loadSemanticSchemaInput(other, {policy: {fileRoots: [root]}});
    const union = inspectSourceCorrectionInventory([independent, foreign]);
    expect(() => prepareCorrectedSourceInputs([independent, foreign], recipe(union, [correction(target(union, 'Value'), name('Existing', 'urn:other'))]))).toThrow(/target source universe/);

    const noImport = await source(`<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="${XSD_NAMESPACE}"><wsdl:types><xs:schema targetNamespace="urn:main"><xs:element name="Value" type="xs:string"/></xs:schema><xs:schema targetNamespace="urn:other"><xs:simpleType name="Existing"><xs:restriction base="xs:string"/></xs:simpleType></xs:schema></wsdl:types></wsdl:definitions>`, 'unimported.wsdl');
    const noImportInventory = inspectSourceCorrectionInventory([noImport]);
    expect(() => prepareCorrectedSourceInputs([noImport], recipe(noImportInventory, [correction(target(noImportInventory, 'Value'), name('Existing', 'urn:other'))]))).toThrow(/not imported/);
  });

  it('refuses interpretation-specific edits of shared chameleon declarations', async () => {
    const file = path.resolve('test/conformance/fixtures/xsd/graph/chameleon.wsdl');
    const input = await loadSemanticSchemaInput(file, {policy: {fileRoots: [path.dirname(file)]}}), inventory = inspectSourceCorrectionInventory([input]);
    const ambiguous = inventory.nodes.find(node => node.ambiguousContext && node.kind === 'element' && node.declaredType);
    if (!ambiguous) throw new Error('Expected an ambiguous shared declaration');
    expect(() => prepareCorrectedSourceInputs([input], recipe(inventory, [correction(ambiguous)]))).toThrow(/multiple target namespaces/);
  });

  it('refuses a no-namespace replacement beneath a nonempty default namespace', async () => {
    const root = await directory(), localFile = path.join(root, 'local.xsd'), mainFile = path.join(root, 'main.xsd');
    await writeFile(localFile, `<xs:schema xmlns:xs="${XSD_NAMESPACE}"><xs:simpleType name="Local"><xs:restriction base="xs:string"/></xs:simpleType></xs:schema>`);
    await writeFile(mainFile, `<xs:schema xmlns:xs="${XSD_NAMESPACE}" xmlns="urn:default" targetNamespace="urn:main"><xs:import schemaLocation="local.xsd"/><xs:element name="Value" type="xs:string"/></xs:schema>`);
    const input = await loadSemanticSchemaInput(mainFile, {policy: {fileRoots: [root]}}), inventory = inspectSourceCorrectionInventory([input]);
    expect(() => prepareCorrectedSourceInputs([input], recipe(inventory, [correction(target(inventory, 'Value'), name('Local', ''))]))).toThrow(/no-namespace QName/);
  });

  it('recovers original targets after combined occurrence and namespace edits at one start tag', async () => {
    const input = await source(`<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="urn:shared"><xs:simpleType name="Named"><xs:restriction base="xs:string"/></xs:simpleType><xs:complexType name="Payload"><xs:sequence><xs:element name="First" type="xs:anyURI"/><xs:element name="Second" type="xs:string"/></xs:sequence></xs:complexType></xs:schema>`);
    const inventory = inspectSourceCorrectionInventory([input]);
    const declaration = target(inventory, 'First'), particle = target(inventory, 'First', 'particle'), second = target(inventory, 'Second');
    const prepared = prepareCorrectedSourceInputs([input], recipe(inventory, [
      {kind: 'set-occurs', target: selector(particle), min: '0', max: '2'}, correction(declaration, name('Named', 'urn:shared')),
    ]));
    const graph = buildCanonicalGraph(await effective(input, prepared));
    for (const original of [declaration, second]) {
      const node = graph.nodes.find(candidate => candidate.kind === 'element' && candidate.name.local === original.name?.local);
      if (!node) throw new Error('Expected effective original declaration');
      expect(recoverOriginalSourceCorrectionTarget(prepared, node.context.source, 'urn:shared', 'element')).toEqual({kind: 'available', target: selector(original), declaredType: original.declaredType});
    }
  });
});
