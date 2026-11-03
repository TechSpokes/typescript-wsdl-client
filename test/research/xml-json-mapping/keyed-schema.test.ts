/** HTTP structure sketches for the selected research grammar, not generated production schemas. */
import {Ajv} from 'ajv';
import {expect, it} from 'vitest';

const named = (value: object) => ({type: 'object', minProperties: 1, maxProperties: 1,
  patternProperties: {'^[^$].*$': value}, additionalProperties: false});
const text = {type: 'object', required: ['$value'], additionalProperties: false, properties: {$value: {type: 'string'}}};
const attribute = named({oneOf: [{type: 'string'}, {type: 'object', required: ['$namespace', '$value'],
  additionalProperties: false, properties: {$namespace: {type: 'string', minLength: 1}, $value: {type: 'string'}}}]});
const properties = {
  $namespace: {type: 'string'}, $namespaces: {type: 'object', additionalProperties: {type: 'string'}},
  $attributes: {type: 'array', items: attribute},
  $content: {type: 'array', items: {oneOf: [text, {$ref: '#/$defs/Entry'}]}},
};
const openSchema = {$defs: {
  Entry: named({$ref: '#/$defs/Value'}),
  Value: {type: 'object', required: ['$namespace', '$content'], additionalProperties: false, properties},
}, type: 'object', required: ['$namespaces', '$content'], additionalProperties: false,
properties: {$namespaces: properties.$namespaces, $attributes: properties.$attributes, $content: properties.$content}};
const ajv = new Ajv({strict: true, coerceTypes: false, removeAdditional: false, useDefaults: false});
const validate = ajv.compile(openSchema);

it('describes recursive open entry/attribute fields without stripping or coercing independent inputs', () => {
  const hand: unknown = JSON.parse('{"$namespaces":{"":"urn:open","p":"urn:one"},"$attributes":[{"reference":"p:Thing"},{"id":{"$namespace":"urn:attrs","$value":"7"}}],"$content":[{"child":{"$namespace":"urn:open","$namespaces":{"p":"urn:two"},"$content":[{"$value":"p:Other"}]}}]}');
  const before = JSON.stringify(hand);
  expect(validate(hand)).toBe(true);
  expect(JSON.stringify(hand)).toBe(before);
  for (const value of [
    {$namespaces: {}, $content: ['bare']},
    {$namespaces: {}, $content: [{$value: 'x', child: {}}]},
    {$namespaces: {}, $content: [{child: {$content: []}}]},
    {$namespaces: {}, $content: [], $attributes: [{id: {$namespace: '', $value: '7'}}]},
    {$namespaces: {}, $content: [], $nil: true},
  ]) {
    const saved = JSON.stringify(value);
    expect(validate(value)).toBe(false);
    expect(JSON.stringify(value)).toBe(saved);
  }
  // @constraints Binding consistency and wildcard/source legality remain native duties, not schema success claims.
  expect(validate({$namespaces: {'': 'urn:other'}, $content: [{x: {$namespace: '', $content: []}}]})).toBe(true);
});

it('describes the assessed mixed/nil alternatives and flat type identity separately', () => {
  const type = {type: 'object', required: ['$name', '$namespace'], additionalProperties: false,
    properties: {$name: {type: 'string'}, $namespace: {type: 'string'}}};
  const nil = {type: 'object', required: ['$nil'], additionalProperties: false,
    properties: {$nil: {const: true}, id: {type: 'string'}, $type: type}};
  const validateNil = ajv.compile(nil);
  expect(validateNil({$nil: true, id: '7', $type: {$name: 'Special', $namespace: 'urn:types'}})).toBe(true);
  expect(validateNil(null)).toBe(false);
  expect(validateNil({$nil: true, $content: []})).toBe(false);
  expect(validateNil({$nil: true, $type: {namespace: 'urn:types', local: 'Special'}})).toBe(false);
  const mixed = ajv.compile({type: 'object', required: ['$content'], additionalProperties: false, properties: {
    id: {type: 'string'}, $content: {type: 'array', items: {oneOf: [text,
      {type: 'object', required: ['b'], additionalProperties: false, properties: {b: {type: 'string'}}},
    ]}},
  }});
  expect(mixed({id: '7', $content: [{$value: 'Hello '}, {b: 'world'}, {$value: '!'}]})).toBe(true);
  expect(mixed({$content: [{$value: 'x', b: 'world'}]})).toBe(false);
});
