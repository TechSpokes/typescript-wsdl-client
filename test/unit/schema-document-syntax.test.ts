import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import type {SchemaInput} from '../../src/loader/schemaInput.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import type {SemanticRequest} from '../../src/compiler/semanticContext.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {checkSchemaDocumentSyntax, prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';

const xml = readFileSync('test/conformance/fixtures/xsd/syntax/schema-document-controls.xsd', 'utf8');
const uri = 'https://document.test/schema.xsd';
const limits = {maxWork: 10_000_000};
async function input(source = xml): Promise<SchemaInput> {
  const bytes = Buffer.from(source);
  return loadSchemaInput(uri, {policy: {allowedOrigins: ['https://document.test']},
    offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])});
}
function prepare(source: SchemaInput, maxWork = limits.maxWork): SemanticRequest {
  const result = prepareSourceSchemaRequest(source, {budget: createSemanticBudget({maxWork})});
  if (result.kind !== 'prepared') throw new Error(JSON.stringify(result));
  return result.request;
}
const schema = (content = '', attributes = '') => `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" ${attributes}>${content}</xs:schema>`;

describe('authenticated schema document syntax', () => {
  it('checks useful ordered source roots, preserves annotation payload and returns exact source interpretation', async () => {
    const source = await input(), request = prepare(source);
    const result = checkSchemaDocumentSyntax(request.actual);
    expect(result).toMatchObject({kind: 'checked', contextId: request.actual.contextId,
      authority: 'XSD10-schema-document-syntax-v1', scope: 'schema-document-source-syntax',
      remaining: ['child-component-syntax', 'semantic-construction', 'annotation-payload-assessment'],
      sources: [{key: source.schemas[0].key, digest: source.root.digest, source: source.root.root.source}]});
  });

  it('requires loader issuance and an exact source-bound actual context', async () => {
    const source = await input(), request = prepare(source);
    expect(() => prepareSourceSchemaRequest({...source})).toThrow('Unauthenticated loaded schema input');
    let touched = false;
    const forged = Object.defineProperty({}, 'schemas', {get: () => {touched = true; return [];}}) as SchemaInput;
    expect(() => prepareSourceSchemaRequest(forged)).toThrow('Unauthenticated loaded schema input');
    expect(touched).toBe(false);
    expect(() => checkSchemaDocumentSyntax({...request.actual})).toThrow('Unauthenticated semantic context');
    const graphOnly = prepareSemanticRequest(resolveCanonicalGraph(request.graph), {budget: createSemanticBudget(limits)});
    if (graphOnly.kind !== 'prepared') throw new Error(JSON.stringify(graphOnly));
    expect(checkSchemaDocumentSyntax(graphOnly.request.actual)).toEqual({kind: 'unresolved', rule: 'missing-source-syntax'});
    const candidate = request.candidate({key: 'originals', active: request.actual.members});
    if (candidate.kind !== 'prepared') throw new Error(JSON.stringify(candidate));
    expect(checkSchemaDocumentSyntax(candidate.context)).toEqual({kind: 'unresolved', rule: 'actual-source-only'});
  });

  it.each([
    ['empty namespace', '', 'targetNamespace=""'],
    ['unknown root attribute', '', 'unknown="value"'],
    ['XSD root attribute', '', 'xs:version="value"'],
    ['empty form default', '', 'elementFormDefault=""'],
    ['unknown derivation', '', 'blockDefault="list"'],
    ['mixed all derivation', '', 'finalDefault="#all restriction"'],
    ['bad language', '', 'xml:lang="en_US"'],
    ['late import', '<xs:notation name="n" public=""/><xs:import namespace="urn:other"/>', ''],
    ['root child', '<xs:sequence/>', ''],
    ['notation missing identifier', '<xs:notation name="n"/>', ''],
    ['notation invalid name', '<xs:notation name="has space" public=""/>', ''],
    ['notation invalid public', '<xs:notation name="n" public="&quot;"/>', ''],
    ['duplicate notation names', '<xs:notation name="n" public="first"/><xs:notation name=" n " system="second"/>', ''],
    ['notation duplicate annotations', '<xs:notation name="n" system=""><xs:annotation/><xs:annotation/></xs:notation>', ''],
    ['annotation bad child', '<xs:annotation><xs:element/></xs:annotation>', ''],
    ['annotation significant text', '<xs:annotation>&#160;</xs:annotation>', ''],
    ['documentation bad attribute', '<xs:annotation><xs:documentation id="a"/></xs:annotation>', ''],
    ['duplicate IDs', '<xs:annotation id="same"/><xs:notation name="n" system="" id=" same "/>', ''],
  ])('rejects %s including empty-schema controls', async (_name, content, attributes) => {
    const request = prepare(await input(schema(content, attributes)));
    expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'invalid-schema', source: {uri}});
  });

  it.each([
    ['', ''],
    ['<xs:annotation><xs:documentation xml:lang=""/></xs:annotation>', 'xml:lang=""'],
    ['<xs:import/>', 'targetNamespace="urn:local"'],
    ['<xs:notation name=" n " public=" a&#9;b "/>', ''],
    ['<xs:notation name="n" system=""/>', ''],
    ['<xs:annotation/><xs:notation name="n" public=""/><xs:annotation/>', ''],
  ])('accepts required presence/absence and lexical distinctions', async (content, attributes) => {
    expect(checkSchemaDocumentSyntax(prepare(await input(schema(content, attributes))).actual).kind).toBe('checked');
  });

  it('keeps independent inline schema ID scopes and foreign attribute assessment explicit', async () => {
    const content = '<xs:annotation id="same"/><xs:notation name="n" public="same"/>';
    const body = schema(content, 'targetNamespace="urn:a"') + schema(content, 'targetNamespace="urn:b"');
    const wsdl = `<w:definitions xmlns:w="http://schemas.xmlsoap.org/wsdl/"><w:types>${body}</w:types></w:definitions>`;
    expect(checkSchemaDocumentSyntax(prepare(await input(wsdl)).actual)).toMatchObject({kind: 'checked', sources: [{}, {}]});
    const sameNamespace = prepare(await input(wsdl.replace('urn:b', 'urn:a')));
    expect(checkSchemaDocumentSyntax(sameNamespace.actual)).toMatchObject({kind: 'checked',
      remaining: ['child-component-syntax', 'semantic-construction', 'notation-component-identity']});
    const foreign = prepare(await input(schema('', 'xmlns:f="urn:foreign" f:custom="value"')));
    expect(checkSchemaDocumentSyntax(foreign.actual)).toMatchObject({kind: 'checked', remaining: ['child-component-syntax', 'semantic-construction', 'foreign-attribute-assessment']});
    const componentForeign = prepare(await input(schema('<xs:complexType name="T"><xs:attribute name="a" f:flag="bad"/></xs:complexType>', 'xmlns:f="urn:foreign"')));
    expect(checkSchemaDocumentSyntax(componentForeign.actual)).toMatchObject({kind: 'checked', remaining: ['child-component-syntax', 'semantic-construction', 'foreign-attribute-assessment']});
  });

  it('classifies unsupported features separately and preserves inherited source stage failures', async () => {
    const excluded = prepare(await input(schema('<xs:redefine/>')));
    expect(checkSchemaDocumentSyntax(excluded.actual)).toMatchObject({kind: 'unsupported-capability', rule: 'xsd:redefine'});
    const significant = prepareSourceSchemaRequest(await input(schema('&#160;')), {budget: createSemanticBudget(limits)});
    expect(significant).toMatchObject({kind: 'source-preparation-failed', stage: 'canonical-build', category: 'invalid-schema'});
    for (const document of [schema('<xs:import/>'), schema('<xs:import namespace="urn:same"/>', 'targetNamespace="urn:same"')]) {
      expect(prepareSourceSchemaRequest(await input(document), {budget: createSemanticBudget(limits)})).toMatchObject({
        kind: 'source-preparation-failed', stage: 'reference-resolution', category: 'invalid-schema'});
    }
  });

  it('rejects significant component and wrapper text at the authenticated source boundary', async () => {
    for (const body of ['<xs:complexType name="T">junk</xs:complexType>', '<xs:simpleType name="T"><xs:restriction base="xs:string">junk</xs:restriction></xs:simpleType>']) {
      const result = prepareSourceSchemaRequest(await input(schema(body)), {budget: createSemanticBudget(limits)});
      expect(result).toMatchObject({kind: 'source-preparation-failed', stage: 'canonical-build', category: 'invalid-schema'});
    }
  });

  it('retains chameleon interpretation keys without multiplying a physical notation declaration', async () => {
    const commonUri = 'https://document.test/common.xsd';
    const wsdl = '<w:definitions xmlns:w="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/XMLSchema"><w:types>' +
      '<xs:schema targetNamespace="urn:a"><xs:include schemaLocation="common.xsd"/><xs:include schemaLocation="common.xsd"/></xs:schema>' +
      '<xs:schema targetNamespace="urn:b"><xs:include schemaLocation="common.xsd"/></xs:schema></w:types></w:definitions>';
    const common = schema('<xs:notation name="N" public="" id="notation"/>', 'id="root"');
    const resources = new Map([[uri, wsdl], [commonUri, common]].map(([location, source]) => {
      const bytes = Buffer.from(source); return [location, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}] as const;
    }));
    const loaded = await loadSchemaInput(uri, {policy: {allowedOrigins: ['https://document.test']}, offlineResources: resources});
    const result = checkSchemaDocumentSyntax(prepare(loaded).actual);
    expect(result).toMatchObject({kind: 'checked', sources: [{}, {}, {}, {}], remaining: ['child-component-syntax', 'semantic-construction']});
  });

  it('keeps source namespace normalization distinct from the legacy interpreted symbol universe', async () => {
    const original = await input(schema('<xs:notation name="N" public=""/>', 'targetNamespace=" urn:a "'));
    expect(original.schemas[0].targetNamespace).toBe(' urn:a ');
    const request = prepare(original);
    expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'checked',
      remaining: ['child-component-syntax', 'semantic-construction', 'namespace-interpretation']});
    expect(original.schemas[0].targetNamespace).toBe(' urn:a ');
  });

  it('uses the same cumulative inclusive budget, including source snapshot and repeated checks', async () => {
    const source = await input(schema('<xs:notation name="n" public=""/>'));
    const measured = prepare(source);
    expect(checkSchemaDocumentSyntax(measured.actual).kind).toBe('checked');
    const exact = measured.budget.usage().work;
    const boundary = prepare(source, exact);
    expect(checkSchemaDocumentSyntax(boundary.actual).kind).toBe('checked');
    expect(boundary.budget.usage().work).toBe(exact);
    expect(checkSchemaDocumentSyntax(boundary.actual).kind).toBe('resource-limit');
    const short = prepare(source, exact - 1);
    const failure = checkSchemaDocumentSyntax(short.actual);
    expect(failure.kind).toBe('resource-limit');
    expect(checkSchemaDocumentSyntax(short.actual)).toBe(failure);
    expect(prepareSourceSchemaRequest(source, {budget: createSemanticBudget({maxWork: 79})}).kind).toBe('resource-limit');
  });
});
