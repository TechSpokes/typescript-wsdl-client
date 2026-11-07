import {describe, expect, it, vi} from 'vitest';
import path from 'node:path';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {encodeComponentXml, decodeComponentXml} from '../../src/compiler/directCodec.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';

const file = path.resolve('test/conformance/fixtures/assessment/keyed.wsdl'), namespace = 'urn:checked:forecast';
async function source() {
  const selected = await selectComponentOperation(file, {portType: {namespace, local: 'ForecastPortType'},
    binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'}, {loading: {policy: {fileRoots: [path.dirname(file)]}}});
  if (selected.kind !== 'selected') throw new Error(selected.kind + ':' + selected.rule);
  const contract = selected.contract, mapping = createComponentValueMapping(contract, {kind: 'input'});
  if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind + ':' + mapping.rule);
  return {contract, mapping};
}

const bindings = {'': 'urn:values', t: namespace, e: 'urn:extra', a: 'urn:attributes', p: 'urn:first', xsi: 'http://www.w3.org/2001/XMLSchema-instance'};
const value = {$namespaces: bindings, count: 2, p: {$content: []}, open: {$namespaces: {p: 'urn:intermediate'}, $content: [{count: 3},
  {extra: {$namespace: 'urn:extra', $attributes: [{id: 'plain'}, {id: {$namespace: 'urn:attributes', $value: 'qualified'}}], $content: [
    {$value: 'p:Thing'}, {inner: {$namespace: 'urn:extra', $namespaces: {p: 'urn:rebound'}, $content: [{$value: 'p:Other'}]}},
    {inner: {$namespace: 'urn:extra', $content: [{$value: 'p:Sibling'}]}},
    {plain: {$namespace: '', $namespaces: {'': ''}, $content: [{$value: 'unbound:Literal'}]}},
    JSON.parse('{"__proto__":{"$namespace":"urn:extra","$content":[]}}') as Record<string, unknown>,
    {constructor: {$namespace: 'urn:extra', $content: []}},
    {p: {$namespace: namespace, $attributes: [{id: 'raw'}], $content: [{$value: 'same familiar name'}]}},
    {xmlns: {$namespace: 'urn:extra', $attributes: [{xmlns: {$namespace: 'urn:attributes', $value: 'ordinary'}}], $content: []}},
  ]}}]}};
const wire = `<t:GetForecast xmlns:t="${namespace}" xmlns="urn:values" xmlns:e="urn:extra" xmlns:a="urn:attributes" xmlns:p="urn:first" xmlns:xsi="${bindings.xsi}">`
  + '<t:count>2</t:count><t:p/><t:open xmlns:p="urn:intermediate"><t:count>3</t:count><e:extra id="plain" a:id="qualified">p:Thing'
  + '<e:inner xmlns:p="urn:rebound">p:Other</e:inner><e:inner>p:Sibling</e:inner><plain xmlns="">unbound:Literal</plain>'
  + '<e:__proto__/><e:constructor/><t:p id="raw">same familiar name</t:p><e:xmlns a:xmlns="ordinary"/></e:extra></t:open></t:GetForecast>';

describe('keyed production XML conformance', () => {
  it('preserves source-permitted payload schema hints lexically without acquiring schemas', async () => {
    const {contract, mapping} = await source();
    const input = {...value, open: {...value.open, $attributes: [{schemaLocation: {$namespace: bindings.xsi,
      $value: 'urn:extra https://payload.invalid/never.xsd'}}]}};
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Payload acquisition forbidden'));
    try {
      const encoded = encodeComponentXml(contract, mapping, input);
      if (encoded.kind !== 'component-encoded') throw new Error(encoded.kind + ':' + encoded.rule);
      expect(decodeComponentXml(contract, mapping, encoded.bytes)).toMatchObject({kind: 'component-decoded', validated: {value: input}});
      expect(fetch).not.toHaveBeenCalled();
    } finally {fetch.mockRestore();}
  });
  it('preserves protected scopes, default identity separation, intermediate deltas, sibling isolation and safe XML names', async () => {
    const {contract, mapping} = await source();
    const decoded = decodeComponentXml(contract, mapping, Buffer.from(wire));
    expect(decoded).toMatchObject({kind: 'component-decoded', validated: {value}});
    const hand: unknown = JSON.parse(JSON.stringify(value)), before = JSON.stringify(hand);
    const encoded = encodeComponentXml(contract, mapping, hand);
    if (encoded.kind !== 'component-encoded') throw new Error(encoded.kind + ':' + encoded.rule);
    const actual = parseOrderedSyntax(encoded.bytes, 'urn:independent-keyed-wire').root;
    const expected = parseOrderedSyntax(Buffer.from(wire), 'urn:hand-keyed-wire').root;
    const facts = (node: typeof actual): unknown => ({name: node.name, namespaces: node.namespaces,
      attributes: [...node.attributes].map(attribute => ({name: attribute.name, value: attribute.value})).sort((a, b) => JSON.stringify(a.name).localeCompare(JSON.stringify(b.name))),
      content: node.children.filter(child => child.kind !== 'text' || child.value !== '').map(child => child.kind === 'text' ? child.value : facts(child))});
    // @why Generated prefixes on assessed scalar leaves are outside lexical preservation; compare their values separately.
    const open = actual.children.find(child => child.kind === 'element' && child.name.local === 'open');
    const expectedOpen = expected.children.find(child => child.kind === 'element' && child.name.local === 'open');
    if (!open || open.kind !== 'element' || !expectedOpen || expectedOpen.kind !== 'element') throw new Error('Missing open wrapper');
    expect(facts(open.children[1] as typeof actual)).toEqual(facts(expectedOpen.children[1] as typeof actual));
    expect(decodeComponentXml(contract, mapping, encoded.bytes)).toMatchObject({kind: 'component-decoded', validated: {value}});
    expect(JSON.stringify(hand)).toBe(before); expect(Object.isFrozen(hand)).toBe(false);
  });

  it('refuses impossible default/attribute scopes and invalid retained namespace bindings without dispatch', async () => {
    const {contract, mapping} = await source();
    for (const scope of [{...bindings, '': 'urn:values'}, {...bindings, a: 'urn:different'}]) {
      const unqualified = scope.a === 'urn:attributes';
      const input = {$namespaces: scope, count: 2, p: {$content: []}, skip: {$content: [{extra: {$namespace: 'urn:extra',
        ...(unqualified ? {} : {$attributes: [{id: {$namespace: 'urn:attributes', $value: 'needs-prefix'}}]}),
        $content: unqualified ? [{plain: {$namespace: '', $content: []}}] : []}}]}};
      expect(encodeComponentXml(contract, mapping, input)).toMatchObject({kind: 'value-invalid', rule: unqualified ? 'no-namespace-element-default-conflict' : 'attribute-namespace-prefix-required'});
    }
    for (const $namespaces of [{bad: ''}, {xmlns: 'urn:bad'}, {xml: 'urn:wrong'}, {a: 'http://www.w3.org/2000/xmlns/'}]) {
      expect(encodeComponentXml(contract, mapping, {...value, $namespaces})).toMatchObject({kind: 'value-invalid', rule: 'namespace-binding'});
    }
    expect(encodeComponentXml(contract, mapping, {...value, open: {$content: [{count: 3}], $attributes: [{id: {
      $namespace: 'http://www.w3.org/2000/xmlns/', $value: 'bad'}}]}})).toMatchObject({kind: 'value-invalid'});
  });
});
