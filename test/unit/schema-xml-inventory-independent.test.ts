import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {checkSchemaDocumentSyntax, prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaSourceValues} from '../../src/compiler/schemaSourceValues.js';

// Confirmed October 2004 imported XML declaration; independent pre-code
// oracle follows #271 6114565183. These are S4S instance obligations only.
const origin = 'https://independent-xml-inventory.example';
const namespaceAttrs = 'xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:app="urn:xml-inventory:payload"';
const reference = (value: string) => `<app:reference xsi:type="xs:IDREF">${value}</app:reference>`;
async function document(xml: string, extension = 'xsd') {
  const uri = origin + '/root.' + extension, bytes = Buffer.from(xml), digest = createHash('sha256').update(bytes).digest('hex');
  const input = await loadSemanticSchemaInput(uri, {policy: {allowedOrigins: [origin]}, offlineResources: new Map([[uri, {bytes, digest}]])});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected authentic source representation');
  return {request: prepared.request, result: checkSchemaDocumentSyntax(prepared.request.actual), input};
}
const source = (payload: string, rootAttributes = '', documentationAttributes = '') => document(
  `<xs:schema ${namespaceAttrs} ${rootAttributes}><xs:annotation><xs:documentation ${documentationAttributes}>${payload}</xs:documentation></xs:annotation></xs:schema>`);

describe('independent October 2004 imported XML ID declaration', () => {
  it.each(['documentation', 'payload'] as const)('binds assessed IDREF from permitted xml:id on %s', async location => {
    const result = location === 'documentation' ? (await source(reference('X'), '', 'xml:id="X"')).result
        : (await source(reference('X') + '<app:value xml:id="X"/>')).result;
    expect(result).toMatchObject({kind: 'checked', wildcardObligations: []});
  });

  it('uses XML-whitespace collapsed NCName identity for both ID and IDREF', async () => {
    expect((await source('<app:value xml:id=" &#x9;X&#xA; "/>' + reference(' \tX\n '))).result)
      .toMatchObject({kind: 'checked', wildcardObligations: []});
  });

  it.each(['', 'a:b', '1first', 'two words'])('rejects invalid imported ID lexical value %s', async value => {
    expect((await source(`<app:value xml:id="${value}"/>`)).result).toMatchObject({kind: 'invalid-schema'});
  });

  it.each([
    '<app:value xml:id="X"/><app:value xml:id=" X "/>',
    '<app:value xml:id="X"/><xs:annotation id=" X "/>',
  ])('rejects same-root duplicate assessed IDs: %s', async payload => {
    expect((await source(payload)).result).toMatchObject({kind: 'invalid-schema', rule: 'schema-id'});
  });

  it('shares imported and S4S ID scope across the source root and inert payload', async () => {
    expect((await source('<app:value xml:id="X"/>', 'id="X"')).result).toMatchObject({kind: 'invalid-schema', rule: 'schema-id'});
  });

  it('does not grant ID typing to an arbitrary application attribute named id', async () => {
    expect((await source(reference('Y') + '<app:value app:id="Y" xml:id="X"/>')).result)
      .toMatchObject({kind: 'invalid-schema', rule: 'cvc-id'});
  });

  it('still rejects the extra XML attribute on an element assessed with a simple xsi:type', async () => {
    expect((await source('<app:value xsi:type="xs:string" xml:id="X">value</app:value>')).result)
      .toMatchObject({kind: 'invalid-schema'});
  });

  it('keeps ID uniqueness scoped to each separate inline schema validation root', async () => {
    const inline = `<xs:schema ${namespaceAttrs}><xs:annotation><xs:documentation xml:id="X">${reference('X')}</xs:documentation></xs:annotation></xs:schema>`;
    const {result, input} = await document(`<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"><wsdl:types>${inline}${inline}</wsdl:types></wsdl:definitions>`, 'wsdl');
    expect(input.schemas).toHaveLength(2);
    expect(result).toMatchObject({kind: 'checked', wildcardObligations: []});
  });

  it('preserves request exhaustion after a successful imported-ID assessment', async () => {
    const {request, result} = await source(reference('X') + '<app:value xml:id="X"/>');
    expect(result).toMatchObject({kind: 'checked', wildcardObligations: []});
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(checkSchemaDocumentSyntax(request.actual)).toBe(request.budget.failure());
  });

  it.each(['', 'id="Y"'])('rejects a wildcard ID on a schema type with an ID use even when the declared use is absent: %s', async attribute => {
    expect((await source('', `xml:id="X" ${attribute}`)).result).toMatchObject({kind: 'invalid-schema'});
  });

  it('applies the ID-use prohibition to known payload declarations but not an untyped attribute name', async () => {
    expect((await source('<xs:annotation xml:id="X"/>')).result).toMatchObject({kind: 'invalid-schema'});
    expect((await source('<app:value id="untyped" xml:id="X"/>' + reference('X'))).result)
      .toMatchObject({kind: 'checked', wildcardObligations: []});
  });

  it('uses the selected complex xsi:type attribute-use inventory for wild ID eligibility', async () => {
    expect((await source('<app:value xsi:type="xs:annotated" xml:id="X"/>')).result)
      .toMatchObject({kind: 'invalid-schema'});
    expect((await source('<app:value xsi:type="xs:openAttrs" xml:id="X"/>' + reference('X'))).result)
      .toMatchObject({kind: 'checked', wildcardObligations: []});
  });
});

describe('independent complete fixed October 2004 XML component inventory', () => {
  it.each(['lang', 'space', 'base', 'id', 'specialAttrs', 'Unknown'])('has no XML named type %s', local => {
    const values = createSchemaSourceValues(createSemanticBudget());
    expect(values.lookup({namespace: 'http://www.w3.org/XML/1998/namespace', local})).toEqual({kind: 'missing'});
  });

  it.each([
    '<app:value xml:unknown="not typed" xml:Father="reserved prose"/>',
    '<app:value xsi:type="xml:Unknown"><xs:element name="valid"/></app:value>',
    '<xml:Unknown><xs:element name="valid"/></xml:Unknown>',
  ])('uses exact lax absence without residual inventory debt: %s', async payload => {
    expect((await source(payload)).result).toMatchObject({kind: 'checked', wildcardObligations: []});
  });

  it.each([
    '<app:value xsi:type="xml:Unknown"><xs:element/></app:value>',
    '<xml:Unknown><xs:element/></xml:Unknown>',
    '<xs:length xsi:type="xml:Unknown" value="1"/>',
  ])('enforces existing descendant/declared-override clauses after XML absence: %s', async payload => {
    expect((await source(payload)).result).toMatchObject({kind: 'invalid-schema'});
  });

  it.each(['<app:value xml:unknown="X"/>', '<app:value xsi:type="xml:Unknown">X</app:value>', '<xml:Unknown id="X"/>'])
    ('does not invent an ID or incomplete inventory from an absent component: %s', async unknown => {
      expect((await source(reference('X') + unknown)).result).toMatchObject({kind: 'invalid-schema', rule: 'cvc-id'});
    });

  it('checks fixed descendant keys through an XML item whose type is genuinely absent', async () => {
    const key = '<xs:key name="K"><xs:selector xpath="."/><xs:field xpath="@id"/></xs:key>';
    expect((await source(`<app:value xsi:type="xml:Unknown">${key}</app:value>${key}`)).result)
      .toMatchObject({kind: 'invalid-schema', rule: 'schema-key'});
  });

  it('keeps the other three imported attributes on their exact fixed datatypes', async () => {
    expect((await source('<app:value xml:lang=" en-US " xml:space=" preserve " xml:base="relative/path"/>')).result)
      .toMatchObject({kind: 'checked', wildcardObligations: []});
    for (const attribute of ['xml:lang=""', 'xml:space="invalid"']) {
      expect((await source(`<app:value ${attribute}/>`)).result).toMatchObject({kind: 'invalid-schema'});
    }
  });
});
