import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {selectComponentOperation, selectDirectOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {encodeComponentXml, decodeComponentXml} from '../../src/compiler/directCodec.js';
import {lowerComponentShape} from '../../src/generation/componentShape.js';
import {Ajv} from 'ajv';

const file = path.resolve('test/conformance/fixtures/assessment/nil.wsdl');
const namespace = 'urn:checked:forecast', xsi = 'http://www.w3.org/2001/XMLSchema-instance';
const selector = {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'};
async function source() {
  const selected = await selectComponentOperation(file, selector, {loading: {policy: {fileRoots: [path.dirname(file)]}}});
  if (selected.kind !== 'selected') throw new Error(selected.kind + ':' + selected.rule);
  const contract = selected.contract, mapping = createComponentValueMapping(contract, {kind: 'input'});
  if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind + ':' + mapping.rule);
  return {contract, mapping};
}
const xml = (content: string, attributes = 'id="7"') => Buffer.from(`<t:GetForecast xmlns:t="${namespace}" xmlns:xsi="${xsi}" ${attributes}>${content}</t:GetForecast>`);

describe('explicit component nil with native declaration and attribute duties', () => {
  it('encodes fresh nil JSON to independently expected XML without a hidden source tree', async () => {
    const {contract, mapping} = await source();
    const value = {$nil: true, id: '7', note: ''}, before = JSON.stringify(value);
    const result = encodeComponentXml(contract, mapping, value);
    if (result.kind !== 'component-encoded') throw new Error(result.kind + ':' + result.rule);
    expect(Buffer.from(result.bytes).toString()).toBe(`<n0:GetForecast xmlns:n0="${namespace}" xmlns:n1="${xsi}" n1:nil="true" id="7" note=""></n0:GetForecast>`);
    expect(JSON.stringify(value)).toBe(before); expect(Object.isFrozen(value)).toBe(false);
  });

  it.each(['true', '1', ' true '])('assesses XML nil=%s and preserves attributes through serialized JSON', async lexical => {
    const {contract, mapping} = await source();
    const result = decodeComponentXml(contract, mapping, xml('', `xsi:nil="${lexical}" id="7" note=""`));
    if (result.kind !== 'component-decoded') throw new Error(result.kind + ':' + result.rule);
    expect(JSON.parse(JSON.stringify(result.validated.value))).toEqual({$nil: true, id: '7', note: ''});
  });

  it('distinguishes absence, empty scalar, nil item, nil wrapper and attributed nil simple content', async () => {
    const {contract, mapping} = await source();
    const wire = xml('<t:city/><t:days>2</t:days><t:label xsi:nil="true" code="7"/><t:batch><t:item/><t:item xsi:nil="1"/><t:item>last</t:item></t:batch><t:defaulted xsi:nil="true"/>');
    const result = decodeComponentXml(contract, mapping, wire);
    if (result.kind !== 'component-decoded') throw new Error(result.kind + ':' + result.rule);
    expect(result.validated.value).toEqual({id: '7', city: '', days: 2, label: {$nil: true, code: 7, note: 'seed', enabled: true},
      batch: {item: ['', {$nil: true}, 'last']}, defaulted: {$nil: true}});
    for (const value of [{id: '7', days: 2}, {id: '7', city: {$nil: true}, days: 2, batch: {$nil: true}}, result.validated.value]) {
      const encoded = encodeComponentXml(contract, mapping, value);
      if (encoded.kind !== 'component-encoded') throw new Error(encoded.kind + ':' + encoded.rule);
      const decoded = decodeComponentXml(contract, mapping, encoded.bytes);
      expect(decoded).toMatchObject({kind: 'component-decoded', validated: {value}});
    }
  });

  it.each(['false', '0'])('retains ordinary empty/default/fixed assessment for xsi:nil=%s', async lexical => {
    const {contract, mapping} = await source();
    const result = decodeComponentXml(contract, mapping, xml(`<t:city xsi:nil="${lexical}"/><t:days>2</t:days><t:defaulted/><t:fixed/>`));
    expect(result).toMatchObject({kind: 'component-decoded', validated: {value: {id: '7', city: '', days: 2, defaulted: 7, fixed: 9}}});
  });

  it.each([
    null, {$nil: false, id: '7'}, {$nil: 'true', id: '7'}, {$nil: true}, {$nil: true, id: 7},
    {$nil: true, id: '7', days: 2}, {$nil: true, id: '7', $content: []}, {$nil: true, id: '7', $value: ''},
    {$nil: true, id: '7', $namespaces: {}}, {$nil: true, id: '7', $type: {}}, {$nil: true, id: '7', unknown: ''},
    {id: '7', days: {$nil: true}}, {id: '7', days: 2, city: null}, {id: '7', days: 2, batch: [{$nil: true}]},
    {id: '7', days: 2, batch: {item: [null]}}, {id: '7', days: 2, batch: {$nil: true, item: []}},
    {id: '7', days: 2, label: {$nil: true}}, {id: '7', days: 2, label: {$nil: true, code: '7'}},
    {id: '7', days: 2, label: {$nil: true, code: 7, enabled: false}}, {id: '7', days: 2, fixed: {$nil: true}},
    {id: '7', days: 2, fixed: 8},
  ])('rejects invalid application value %# without mutation', async value => {
    const {contract, mapping} = await source(), before = JSON.stringify(value);
    const result = encodeComponentXml(contract, mapping, value);
    expect(result.kind).not.toBe('component-encoded'); expect(JSON.stringify(value)).toBe(before);
  });

  it.each([
    xml('', 'xsi:nil="true"'), xml(' ', 'xsi:nil="true" id="7"'), xml('<t:days>2</t:days>', 'xsi:nil="1" id="7"'),
    xml('', 'xsi:nil="yes" id="7"'), xml('', 'xsi:nil="true" id="7" alien="x"'),
    xml('<t:days xsi:nil="true"/>'), xml('<t:days>2</t:days><t:label xsi:nil="true"/>'),
    xml('<t:days>2</t:days><t:label xsi:nil="true" code="bad"/>'),
    xml('<t:days>2</t:days><t:label xsi:nil="true" code="7" enabled="false"/>'),
    xml('<t:days>2</t:days><t:fixed xsi:nil="true"/>'),
  ])('rejects invalid XML %# through native matching and scalar assessment', async wire => {
    const {contract, mapping} = await source();
    expect(decodeComponentXml(contract, mapping, wire).kind).not.toBe('component-decoded');
  });

  it('emits closed HTTP nil alternatives and static TypeScript at each element position', async () => {
    const {contract, mapping} = await source();
    const shape = lowerComponentShape(contract, mapping, 'NilInput', () => {});
    const validate = new Ajv({strict: false, unicodeRegExp: true}).compile(shape.schema);
    for (const value of [{$nil: true, id: '7', note: ''}, {id: '7', days: 2, city: {$nil: true}, batch: {item: [{$nil: true}]}}]) expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    for (const value of [null, {$nil: true}, {$nil: true, id: '7', days: 2}, {id: '7', days: 2, batch: {$nil: true, item: []}}]) expect(validate(value)).toBe(false);
    expect(shape.type).toContain('readonly "$nil": true');
    expect(shape.declarations.join('\n')).toContain('readonly "item"');
    const direct = await selectDirectOperation(file, selector, {loading: {policy: {fileRoots: [path.dirname(file)]}}});
    expect(direct.kind).not.toBe('selected');
  });
});
