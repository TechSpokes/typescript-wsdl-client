import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import type {SchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {checkSchemaDocumentSyntax, prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';

// Independent primary/pinned-source expectations before subject implementation:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/271#issuecomment-6111931221
const origin = 'https://recovery-source.example';
const uri = `${origin}/root.xsd`;
const schema = (body = '', attributes = '') => `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" ${attributes}>${body}</xs:schema>`;
async function loaded(xml: string): Promise<SchemaInput> {
  const bytes = Buffer.from(xml);
  return loadSchemaInput(uri, {policy: {allowedOrigins: [origin]}, offlineResources: new Map([[uri,
    {bytes, digest: createHash('sha256').update(bytes).digest('hex')} ]])});
}
async function source(xml: string) {
  const input = await loaded(xml);
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error(`Expected structural source request: ${JSON.stringify(prepared)}`);
  return prepared.request;
}

describe('independent schema-document source boundaries', () => {
  it.each(['en-US', ''])('assesses a component-free root, empty defaults and xml:lang=%j', async language => {
    const request = await source(schema('', `finalDefault="" blockDefault="" xml:lang="${language}"`));
    expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'checked', scope: 'schema-document-source-syntax',
      remaining: ['child-component-syntax', 'semantic-construction']});
  });

  it.each([
    'targetNamespace=""', 'elementFormDefault=""', 'attributeFormDefault=""', 'blockDefault="list"',
    'finalDefault="substitution"', 'unknown="value"', 'xs:version="1.0"',
  ])('rejects root representation %s even with no canonical component', async attributes => {
    const request = await source(schema('', attributes));
    expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'invalid-schema'});
  });

  it('allows repeated/interleaved root annotations but rejects directives after the first declaration', async () => {
    const a = '<xs:annotation/>';
    const good = await source(schema(`${a}<xs:import namespace="urn:other"/>${a}<xs:element name="e"/>${a}${a}`));
    expect(checkSchemaDocumentSyntax(good.actual)).toMatchObject({kind: 'checked'});
    const bad = await source(schema('<xs:element name="e"/><xs:import namespace="urn:other"/>'));
    expect(checkSchemaDocumentSyntax(bad.actual)).toMatchObject({kind: 'invalid-schema'});
  });

  it('preserves mixed annotation payload while rejecting text in element-only schema syntax', async () => {
    const payload = await source(schema('<xs:annotation><xs:documentation xml:lang="en">Text<foreign xmlns="urn:app"><xs:assert/></foreign></xs:documentation><xs:appinfo>payload</xs:appinfo></xs:annotation>'));
    expect(checkSchemaDocumentSyntax(payload.actual)).toMatchObject({kind: 'checked',
      remaining: expect.arrayContaining(['annotation-payload-assessment'])});
    const rootText = prepareSourceSchemaRequest(await loaded(schema('\u00a0')));
    expect(rootText).toMatchObject({kind: 'source-preparation-failed', stage: 'canonical-build', category: 'invalid-schema'});
    for (const body of ['<xs:annotation>text</xs:annotation>', '<xs:annotation><xs:element name="wrong"/></xs:annotation>']) {
      const request = await source(schema(body));
      expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'invalid-schema'});
    }
  });

  it.each(['public=""', 'public="image/test"', 'system=""', 'system="viewer.exe"'])('accepts notation identifier presence %s', async identifiers => {
    const request = await source(schema(`<xs:notation name="Picture" ${identifiers}/>`));
    expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'checked'});
  });

  it.each([
    '<xs:notation name="Picture"/>', '<xs:notation name="bad:name" public="test"/>',
    '<xs:notation name="Picture" public="test"><xs:annotation/><xs:annotation/></xs:notation>',
    '<xs:notation name="Picture" public="test">text</xs:notation>',
  ])('rejects independently invalid notation representation %s', async body => {
    const request = await source(schema(body));
    expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'invalid-schema'});
  });

  it('keeps foreign qualified attributes explicitly unassessed and ID uniqueness local to each schema root', async () => {
    const foreign = await source(schema('', 'xmlns:app="urn:app" app:setting="on"'));
    expect(checkSchemaDocumentSyntax(foreign.actual)).toMatchObject({kind: 'checked',
      remaining: expect.arrayContaining(['foreign-attribute-assessment'])});
    const duplicate = await source(schema('<xs:annotation id="same"/>', 'id=" same "'));
    expect(checkSchemaDocumentSyntax(duplicate.actual)).toMatchObject({kind: 'invalid-schema'});
    const inline = await source('<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/XMLSchema"><wsdl:types><xs:schema id="same"/><xs:schema id="same"/></wsdl:types></wsdl:definitions>');
    expect(checkSchemaDocumentSyntax(inline.actual)).toMatchObject({kind: 'checked'});
  });

  it('requires privately paired original syntax and refuses copied input/context authority', async () => {
    const input = await loaded(schema());
    expect(() => prepareSourceSchemaRequest({...input})).toThrow(/Unauthenticated|issued/i);
    let called = false;
    const counterfeit = {...input, get schemas() {called = true; return input.schemas;}};
    expect(() => prepareSourceSchemaRequest(counterfeit)).toThrow(/Unauthenticated|issued/i);
    expect(called).toBe(false);
    const graphOnly = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input)));
    if (graphOnly.kind !== 'prepared') throw new Error('Expected graph-only structural request');
    expect(checkSchemaDocumentSyntax(graphOnly.request.actual)).toEqual({kind: 'unresolved', rule: 'missing-source-syntax'});
    const request = await source(schema());
    const candidate = request.candidate({key: 'same-records-hypothetical', active: request.actual.members});
    if (candidate.kind !== 'prepared') throw new Error('Expected candidate');
    expect(checkSchemaDocumentSyntax(candidate.context)).toEqual({kind: 'unresolved', rule: 'actual-source-only'});
    expect(() => checkSchemaDocumentSyntax({...request.actual})).toThrow(/Unauthenticated/);
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(checkSchemaDocumentSyntax(request.actual)).toBe(request.budget.failure());
  });
});
