import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import type {SchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {checkSchemaDocumentSyntax, prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {prepareBoundSourceGraph, sourceSchemasForResolvedGraph} from '../../src/compiler/sourceSchemaBinding.js';

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

  it('issues a deeply immutable source binding only for the exact constructed resolved handle', async () => {
    const input = await loaded(schema('<xs:notation name="N" public="test"/>'));
    const budget = createSemanticBudget({maxWork: 100_000_000});
    const bound = prepareBoundSourceGraph(input, {budget});
    if (bound.kind !== 'prepared') throw new Error('Expected privately source-bound graph');
    const schemas = sourceSchemasForResolvedGraph(bound.resolved);
    expect(schemas).toHaveLength(1);
    expect(Object.isFrozen(bound.resolved)).toBe(true);
    for (const value of [schemas, schemas![0], schemas![0].syntax, schemas![0].syntax.attributes, schemas![0].syntax.children]) expect(Object.isFrozen(value)).toBe(true);
    expect(sourceSchemasForResolvedGraph({...bound.resolved})).toBeUndefined();
    let invoked = false;
    const forged = {...bound.resolved, get graph() {invoked = true; return bound.resolved.graph;}};
    expect(sourceSchemasForResolvedGraph(forged)).toBeUndefined();
    expect(invoked).toBe(false);
    expect(() => prepareBoundSourceGraph({...input}, {budget})).toThrow(/Unauthenticated/);
    budget.guard(() => budget.chargeWork(100_000_000));
    expect(prepareBoundSourceGraph(input, {budget})).toBe(budget.failure());
  });


  // Reviewed source-property oracle, before continuation code:
  // https://github.com/TechSpokes/typescript-wsdl-client/issues/271#issuecomment-6112779591
  async function notationCopies(change?: (files: Map<string, string>) => void) {
    const directory = path.resolve('test/conformance/fixtures/xsd/recovery/notation-coalescing');
    const files = new Map(['root.wsdl', 'left.xsd', 'right.xsd', 'common.xsd'].map(name => [name, readFileSync(path.join(directory, name), 'utf8')]));
    change?.(files);
    const base = origin + '/notation-coalescing/';
    const resources = new Map([...files].map(([name, source]) => {
      const bytes = Buffer.from(source);
      return [base + name, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}] as const;
    }));
    const input = await loadSchemaInput(base + 'root.wsdl', {policy: {allowedOrigins: [origin]}, offlineResources: resources});
    const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
    if (prepared.kind !== 'prepared') throw new Error('Expected original notation source context: ' + JSON.stringify(prepared));
    return checkSchemaDocumentSyntax(prepared.request.actual);
  }
  function editNotation(files: Map<string, string>, file: string, from: string, to: string): void {
    const prior = files.get(file)!;
    if (!prior.includes(from)) throw new Error('Missing independent source mutation anchor');
    files.set(file, prior.replace(from, to));
  }

  it('coalesces equal assessed notation properties across includes while separating chameleon effective namespaces', async () => {
    const result = await notationCopies();
    expect(result).toMatchObject({kind: 'checked', remaining: ['child-component-syntax', 'semantic-construction']});
    if (result.kind !== 'checked') throw new Error('Expected source syntax receipt');
    // Three inline roots, two distinct same-namespace includes, and one physical
    // chameleon source interpreted under each of two other namespaces.
    expect(result.sources).toHaveLength(7);
    expect(new Set(result.sources.map(source => source.key)).size).toBe(7);
  });

  it.each(['public', 'system', 'absent-public', 'absent-system', 'absent-versus-empty-system'] as const)
    ('rejects complete same-identity notation property conflict: %s', async variation => {
      const result = await notationCopies(files => {
        if (variation === 'public') editNotation(files, 'right.xsd', 'public="image test"', 'public="different"');
        if (variation === 'system') editNotation(files, 'right.xsd', 'system="viewer.exe"', 'system="different.exe"');
        if (variation === 'absent-public') editNotation(files, 'right.xsd', ' public="image test"', '');
        if (variation === 'absent-system') editNotation(files, 'right.xsd', ' system="viewer.exe"', '');
        if (variation === 'absent-versus-empty-system') {
          editNotation(files, 'left.xsd', 'system=" viewer.exe "', 'system=""');
          editNotation(files, 'right.xsd', ' system="viewer.exe"', '');
        }
      });
      expect(result).toMatchObject({kind: 'invalid-schema', rule: 'notation-component-properties'});
    });

  it.each(['both-absent', 'both-empty'] as const)('coalesces matching optional system-property states: %s', async variation => {
    const result = await notationCopies(files => {
      editNotation(files, 'left.xsd', ' system=" viewer.exe "', variation === 'both-absent' ? '' : ' system=" "');
      editNotation(files, 'right.xsd', ' system="viewer.exe"', variation === 'both-absent' ? '' : ' system=""');
    });
    expect(result).toMatchObject({kind: 'checked', remaining: ['child-component-syntax', 'semantic-construction']});
  });

  it('retains every source annotation and foreign-attribute obligation after equal notation identity', async () => {
    const result = await notationCopies(files => {
      editNotation(files, 'right.xsd', '<xs:notation name=', '<xs:notation xmlns:app="urn:app" xml:lang="" name=');
      editNotation(files, 'right.xsd', 'Second notation source.', 'Second notation source.<app:payload xml:unknown="value"><xs:element name="known"/></app:payload>');
    });
    expect(result).toMatchObject({kind: 'checked', remaining: ['child-component-syntax', 'semantic-construction',
      'foreign-attribute-assessment', 'annotation-payload-assessment']});
  });

  it('does not let equal notation properties waive a wrong xsi:type on either original source declaration', async () => {
    const result = await notationCopies(files => {
      editNotation(files, 'right.xsd', '<xs:notation name=', '<xs:notation xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string" name=');
    });
    expect(result).toMatchObject({kind: 'invalid-schema'});
  });

  it('rejects a malformed second source annotation or duplicate root key despite otherwise equal notation properties', async () => {
    const malformed = await notationCopies(files => {
      editNotation(files, 'right.xsd', '</xs:notation>', '<xs:annotation/></xs:notation>');
    });
    expect(malformed).toMatchObject({kind: 'invalid-schema', rule: 'schema-for-schemas'});
    const duplicate = await notationCopies(files => {
      editNotation(files, 'right.xsd', '</xs:schema>', '<xs:notation name="Picture" public="image test" system="viewer.exe"/></xs:schema>');
    });
    expect(duplicate).toMatchObject({kind: 'invalid-schema', rule: 'schema-notation-key'});
  });

  // W3C-owned historical XML imports disagree on whether xml:lang admits
  // empty string. XML's empty-language reset is not proof of S4S datatype
  // validity under an unselected imported schema version.
  it.each(['root', 'documentation', 'payload'] as const)
    ('retains exact XML import-version evidence for empty language at %s', async location => {
      const xml = location === 'root' ? schema('', 'xml:lang=""')
        : location === 'documentation' ? schema('<xs:annotation><xs:documentation xml:lang=""/></xs:annotation>')
        : schema('<xs:annotation><xs:documentation><app:payload xmlns:app="urn:app" xml:lang=""/></xs:documentation></xs:annotation>');
      const request = await source(xml), result = checkSchemaDocumentSyntax(request.actual);
      const category = location === 'payload' ? 'annotation-payload-assessment' : 'foreign-attribute-assessment';
      expect(result).toMatchObject({kind: 'checked', remaining: expect.arrayContaining([category]),
        wildcardObligations: [expect.objectContaining({category, rule: 'schema-for-schemas-xml-import-version',
          name: {namespace: 'http://www.w3.org/XML/1998/namespace', local: 'lang'}, source: expect.objectContaining({uri})})]});
    });

  it.each(['en-US', ''])('assesses a component-free root, empty defaults and xml:lang=%j', async language => {
    const request = await source(schema('', `finalDefault="" blockDefault="" xml:lang="${language}"`));
    expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'checked', scope: 'schema-document-source-syntax',
      remaining: language === '' ? expect.arrayContaining(['foreign-attribute-assessment'])
        : ['child-component-syntax', 'semantic-construction']});
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
      remaining: ['child-component-syntax', 'semantic-construction'], wildcardObligations: []});
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

  it('laxly permits unknown foreign qualified attributes and keeps ID uniqueness local to each schema root', async () => {
    const foreign = await source(schema('', 'xmlns:app="urn:app" app:setting="on"'));
    expect(checkSchemaDocumentSyntax(foreign.actual)).toMatchObject({kind: 'checked',
      remaining: ['child-component-syntax', 'semantic-construction'], wildcardObligations: []});
    const duplicate = await source(schema('<xs:annotation id="same"/>', 'id=" same "'));
    expect(checkSchemaDocumentSyntax(duplicate.actual)).toMatchObject({kind: 'invalid-schema'});
    const inline = await source('<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/XMLSchema"><wsdl:types><xs:schema id="same"/><xs:schema id="same"/></wsdl:types></wsdl:definitions>');
    expect(checkSchemaDocumentSyntax(inline.actual)).toMatchObject({kind: 'checked'});
  });


  it('uses the fixed schema-for-schemas environment rather than application declarations for source wildcard lookup', async () => {
    const request = await source(schema('<xs:attribute name="flag" type="xs:int"/>' +
      '<xs:annotation><xs:documentation><app:payload app:flag="not-an-integer"><xs:assert/><xs:extension/></app:payload></xs:documentation></xs:annotation>',
      'targetNamespace="urn:app" xmlns:app="urn:app" app:flag="also-not-an-integer"'));
    expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'checked',
      remaining: ['child-component-syntax', 'semantic-construction'], wildcardObligations: []});
  });

  it('checks known S4S payload below an unknown wrapper without interpreting or fetching xsi hints', async () => {
    const request = await source(schema('<xs:annotation><xs:documentation><app:payload xmlns:app="urn:app" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:app https://forbidden.example/never.xsd">' +
      '<xs:element name="known"/></app:payload></xs:documentation></xs:annotation>'));
    expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'checked',
      remaining: ['child-component-syntax', 'semantic-construction'], wildcardObligations: []});
  });

  it.each([
    ['xml:lang=""', true], ['xml:lang=" en-US "', true], ['xml:lang=" "', false],
    ['xml:space=" preserve "', true], ['xml:space="invalid"', false], ['xml:base="relative.xml"', true],
  ] as const)('assesses known XML wildcard attribute %s under an unknown annotation element', async (attribute, valid) => {
    const request = await source(schema('<xs:annotation><xs:documentation><app:payload xmlns:app="urn:app" ' + attribute + '/></xs:documentation></xs:annotation>'));
    const result = checkSchemaDocumentSyntax(request.actual);
    expect(result.kind).toBe(valid ? 'checked' : 'invalid-schema');
    if (valid && attribute === 'xml:lang=""') expect(result).toMatchObject({remaining: expect.arrayContaining(['annotation-payload-assessment']),
      wildcardObligations: [expect.objectContaining({rule: 'schema-for-schemas-xml-import-version'})]});
    else if (valid) expect(result).toMatchObject({remaining: ['child-component-syntax', 'semantic-construction'], wildcardObligations: []});
  });

  // S4S payload representation oracle precedes implementation: #271 6113002862.
  // These are source instance declarations, not facets of a datatype in Γ.
  it.each([
    ['<xs:pattern value="["/>', true], ['<xs:enumeration value=""/>', true],
    ['<xs:minInclusive value="not-a-number" fixed=" 1 "/>', true],
    ['<xs:length value="-0"/>', true], ['<xs:maxLength value="+0001"/>', true],
    ['<xs:fractionDigits value="-1"/>', false], ['<xs:totalDigits value="0"/>', false],
    ['<xs:totalDigits value="-0"/>', false], ['<xs:totalDigits value="+0001"/>', true],
    ['<xs:whiteSpace value=" collapse "/>', true], ['<xs:whiteSpace value="trim"/>', false],
    ['<xs:enumeration value="anything" fixed="false"/>', false], ['<xs:pattern value="x" fixed="0"/>', false],
    ['<xs:minInclusive/>', false], ['<xs:length value="1" unknown="x"/>', false],
    ['<xs:length value="1" fixed="TRUE"/>', false],
    ['<xs:length value="1"><xs:annotation><xs:documentation>One annotation.</xs:documentation></xs:annotation></xs:length>', true],
    ['<xs:length value="1"><xs:annotation/><xs:annotation/></xs:length>', false],
    ['<xs:length value="1">text</xs:length>', false],
  ] as const)('assesses known facet payload representation %s', async (payload, valid) => {
    const request = await source(schema('<xs:annotation><xs:documentation>' + payload + '</xs:documentation></xs:annotation>'));
    const result = checkSchemaDocumentSyntax(request.actual);
    expect(result.kind).toBe(valid ? 'checked' : 'invalid-schema');
    if (valid) expect(result).toMatchObject({remaining: ['child-component-syntax', 'semantic-construction'], wildcardObligations: []});
  });

  it('assesses nested annotation headers and joins only declared payload IDs to the source root scope', async () => {
    const nested = await source(schema('<xs:annotation><xs:documentation><xs:annotation id="payload">' +
      '<xs:documentation xml:lang="en" source="relative.txt">text</xs:documentation><xs:appinfo>app</xs:appinfo>' +
      '</xs:annotation><app:unknown xmlns:app="urn:app" id="source" app:id="payload"/>' +
      '</xs:documentation></xs:annotation>', 'id="source"'));
    expect(checkSchemaDocumentSyntax(nested.actual)).toMatchObject({kind: 'checked', wildcardObligations: []});
    const duplicate = await source(schema('<xs:annotation><xs:documentation><xs:length value="1" id=" source "/>' +
      '</xs:documentation></xs:annotation>', 'id="source"'));
    expect(checkSchemaDocumentSyntax(duplicate.actual)).toMatchObject({kind: 'invalid-schema'});
    for (const bad of ['<xs:annotation><app:unknown xmlns:app="urn:app"/></xs:annotation>',
      '<xs:documentation id="not-declared">text</xs:documentation>']) {
      const request = await source(schema('<xs:annotation><xs:documentation>' + bad + '</xs:documentation></xs:annotation>'));
      expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'invalid-schema'});
    }
  });

  it('checks exact named XSI type and known element clauses beside facet payloads', async () => {
    const request = await source(schema('<xs:annotation><xs:documentation xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<xs:length value="1" xsi:type="xs:numFacet"/><xs:element name="known"/>' +
      '</xs:documentation></xs:annotation>'));
    expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'checked',
      remaining: ['child-component-syntax', 'semantic-construction'], wildcardObligations: []});
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
