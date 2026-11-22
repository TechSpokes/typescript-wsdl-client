import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {planCheckedComponents} from '../../src/index.js';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {decodeComponentXml, encodeComponentXml} from '../../src/compiler/directCodec.js';

const wsdl = path.resolve('test/conformance/fixtures/assessment/scoped-lax-wildcard.wsdl');
const namespace = 'urn:checked:scoped-lax';
const scope = {qualificationScope: 'lax-wildcard-operation-v1'} as const;
const selector = {operation: 'RoundTrip', portType: {namespace, local: 'ContentPortType'}, binding: {namespace, local: 'ContentBinding'}};
const content = (children: string, attributes = '') => Buffer.from(
  `<t:Content xmlns:t="${namespace}" xmlns:u="urn:unknown" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"${attributes}>${children}</t:Content>`);

async function operation() {
  const selected = await selectComponentOperation(wsdl, selector, {...scope, loading: {policy: {fileRoots: [path.dirname(wsdl)]}}});
  if (selected.kind !== 'selected') throw new Error(selected.rule);
  const {contract} = selected;
  const mapping = createComponentValueMapping(contract, {kind: 'input'});
  if (mapping.kind !== 'component-mapping') throw new Error(mapping.rule);
  return {contract, mapping, decode: (bytes: Uint8Array) => decodeComponentXml(contract, mapping, bytes)};
}

describe('scoped SOAP 1.2 lax wildcards', () => {
  it('keeps the whole-source verdict and existing closed-operation refusal', async () => {
    expect(await planCheckedComponents(wsdl)).toMatchObject({ready: false, dimensions: {sourceLegality: 'disproved'}});
    expect(await planCheckedComponents(wsdl, {qualificationScope: 'closed-operation-v1'})).toMatchObject({
      ready: false, blockers: [{reason: 'operation-correspondence:operation-wildcard-dependency'}],
    });
    expect(await planCheckedComponents(wsdl, scope)).toMatchObject({
      scope: scope.qualificationScope, ready: true, dimensions: {sourceLegality: 'disproved', mapping: 'established'},
    });
  });

  it('round trips typed declarations, namespace-qualified lexical data and a repeated prefix name', async () => {
    const {contract, mapping, decode} = await operation();
    const result = decode(content(
      '<t:Count>1</t:Count><t:Count>2</t:Count><t:ExtraCount>3</t:ExtraCount><u:Extra> 04 &amp; <u:Child/> </u:Extra>',
      ' t:verified="1" u:hint="007"'));
    if (result.kind !== 'component-decoded') throw new Error(result.rule);
    expect(result.validated.value).toMatchObject({
      $attributes: [{verified: {$namespace: namespace, $value: true}}, {hint: {$namespace: 'urn:unknown', $value: '007'}}],
      $content: [{Count: 1}, {Count: {$namespace: namespace, $value: 2}}, {ExtraCount: {$namespace: namespace, $value: 3}},
        {Extra: {$namespace: 'urn:unknown', $content: [{$value: ' 04 & '}, {Child: {$namespace: 'urn:unknown', $content: []}}, {$value: ' '}]}}],
    });
    const value: unknown = JSON.parse(JSON.stringify(result.validated.value));
    const encoded = encodeComponentXml(contract, mapping, value);
    if (encoded.kind !== 'component-encoded') throw new Error(encoded.rule);
    expect(decode(encoded.bytes)).toMatchObject({kind: 'component-decoded', validated: {value}});
  });

  it('refuses known invalid payloads and opaque subtrees with schema obligations', async () => {
    const {decode} = await operation();
    expect(decode(content('<t:Count>1</t:Count><t:ExtraCount>NaN</t:ExtraCount>'))).toMatchObject({kind: 'scalar-invalid'});
    expect(decode(content('<t:Count>1</t:Count>', ' t:verified="unknown"'))).toMatchObject({kind: 'scalar-invalid'});
    expect(decode(content('<t:Count>1</t:Count><t:Unqualified/>'))).toMatchObject({kind: 'mismatch', rule: 'ordered-particle-language'});
    for (const extension of ['<u:Extra xsi:type="t:Foreign"/>', '<u:Extra><t:ExtraCount>2</t:ExtraCount></u:Extra>',
      '<u:Extra t:verified="true"/>']) {
      expect(decode(content('<t:Count>1</t:Count>' + extension))).toMatchObject({kind: 'mismatch', rule: 'opaque-wildcard-declaration'});
    }
    expect(decode(content('<u:Extra/><t:Count>1</t:Count>'))).toMatchObject({kind: 'mismatch', rule: 'ordered-particle-language'});
  });

  it('assesses declared atomic string attributes on the wildcard element and preserves expanded names', async () => {
    const {contract, mapping, decode} = await operation();
    const prefix = '<t:Count>1</t:Count>';
    const result = decode(content(prefix + '<u:Count t:label="  abc  " u:label="x"><u:Nested u:label="y"/></u:Count>'));
    if (result.kind !== 'component-decoded') throw new Error(result.rule);
    expect(result.validated.value).toMatchObject({
      $content: [{Count: 1}, {Count: {$namespace: 'urn:unknown', $attributes: [
        {label: {$namespace: namespace, $value: '  abc  '}},
        {label: {$namespace: 'urn:unknown', $value: 'x'}},
      ], $content: [{Nested: {$namespace: 'urn:unknown', $attributes: [{label: {$namespace: 'urn:unknown', $value: 'y'}}]}}]}}],
    });
    const value = JSON.parse(JSON.stringify(result.validated.value));
    const encoded = encodeComponentXml(contract, mapping, value);
    if (encoded.kind !== 'component-encoded') throw new Error(encoded.rule);
    expect(decode(encoded.bytes)).toMatchObject({kind: 'component-decoded', validated: {value}});
    value.$content[1].Count.$attributes[0].label.$value = 'x';
    expect(encodeComponentXml(contract, mapping, value)).toMatchObject({kind: 'scalar-invalid', rule: 'cvc-minLength-valid'});
    expect(decode(content(prefix + '<u:Count t:label="x"/>'))).toMatchObject({kind: 'scalar-invalid', rule: 'cvc-minLength-valid'});
    for (const extension of ['<u:Count t:unionLabel="abc"/>', '<u:Count><u:Nested t:label="abc"/></u:Count>']) {
      expect(decode(content(prefix + extension))).toMatchObject({kind: 'mismatch', rule: 'opaque-wildcard-declaration'});
    }
    const extension = value.$content[1].Count;
    extension.$attributes = [];
    extension.$content[0].Nested.$attributes = [{label: {$namespace: namespace, $value: 'abc'}}];
    expect(encodeComponentXml(contract, mapping, value)).toMatchObject({kind: 'value-invalid', rule: 'opaque-wildcard-declaration'});
  });
});
