/** Explicit-object nil contract examples for the next #421 slice.
 * @since Issue #420 nil decision
 * @constraints Representation/schema evidence only; no native nil admission or generated HTTP/SOAP execution.
 */
import {Ajv} from 'ajv';
import {describe, expect, it} from 'vitest';
import {parseOrderedSyntax} from '../../../src/loader/orderedSyntax.js';
import {forward, inverse, XSI} from './mapping.js';

const element = {namespace: 'urn:msg', local: 'x'};
type Nil = {$nil: true; id?: string};
const schema = {type: 'object', required: ['$nil'], additionalProperties: false,
  properties: {$nil: {const: true}, id: {type: 'string'}}};
const ajv = new Ajv({strict: true, coerceTypes: false, removeAdditional: false, useDefaults: false});
const validate = ajv.compile<Nil>(schema);
const validateRequiredId = ajv.compile<Nil>({...schema, required: ['$nil', 'id']});

// @constraints The id:string fixture reuses the historical syntax inverse; source-selected typed attributes remain native duties.
function reconstruct(input: unknown, local = 'x') {
  if (!validate(input)) throw new TypeError('Invalid explicit nil object');
  return inverse({...element, local}, input);
}
function project(input: string): Nil {
  const node = parseOrderedSyntax(Buffer.from(input), 'urn:research:nil-contract').root;
  const historical = forward(node);
  const value = historical === null ? {$nil: true} : historical;
  if (!validate(value)) throw new TypeError('Expected assessed fixture nil');
  return value;
}

describe('selected explicit-object nil representation', () => {
  it.each([
    ['{"$nil":true}', [], '<x xmlns="urn:msg" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/>'],
    ['{"$nil":true,"id":"7"}', [{name: {namespace: '', local: 'id'}, value: '7'}],
      '<x xmlns="urn:msg" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="1" id="7"/>'],
  ] as const)('reconstructs fresh JSON and projects to one explicit form: %s', (text, attributes, xml) => {
    const hand: unknown = JSON.parse(text), before = JSON.stringify(hand);
    const reconstructed = reconstruct(hand);
    expect(reconstructed.name).toEqual({namespace: 'urn:msg', local: 'x'});
    expect(reconstructed.children).toEqual([]);
    expect(reconstructed.attributes.filter(a => a.name.namespace !== XSI).map(a => ({name: a.name, value: a.value}))).toEqual(attributes);
    expect(reconstructed.attributes.find(a => a.name.namespace === XSI && a.name.local === 'nil')?.value).toBe('true');
    expect(project(xml)).toEqual(hand);
    expect(JSON.stringify(hand)).toBe(before);
  });

  it('keeps absent, empty, nil items and nil wrapper observations distinct', () => {
    const absent: {x?: unknown} = JSON.parse('{}');
    expect(Object.hasOwn(absent, 'x')).toBe(false);
    expect(inverse(element, {$value: ''}).attributes.some(a => a.name.namespace === XSI && a.name.local === 'nil')).toBe(false);
    const items: unknown[] = JSON.parse('[{"$nil":true},{"$value":""},{"$nil":true,"id":"7"}]');
    expect(items.map(value => validate(value))).toEqual([true, false, true]);
    expect(reconstruct(items[0]).name.local).toBe('x');
    const wrapper = reconstruct(JSON.parse('{"$nil":true}'), 'items');
    expect(wrapper.name.local).toBe('items');
    expect(wrapper.children).toEqual([]);
    expect(() => reconstruct(items)).toThrow(TypeError);
  });

  it('keeps required attribute presence in the source-selected schema without inventing defaults', () => {
    const hand: unknown = JSON.parse('{"$nil":true}');
    expect(validateRequiredId(hand)).toBe(false);
    expect(hand).toEqual({$nil: true});
    expect(validateRequiredId({$nil: true, id: ''})).toBe(true);
  });

  it.each([null, {$nil: false}, {$nil: 'true'}, {}, {$nil: true, id: 7},
    {$nil: true, $value: ''}, {$nil: true, $content: []}, {$nil: true, child: ''},
    {$nil: true, $unknown: true}, {$nil: true, $type: {}}, {$nil: true, $namespaces: {}}])(
    'rejects null, content and undeclared metadata without mutation %#', input => {
      const before = JSON.stringify(input);
      expect(() => reconstruct(input)).toThrow(TypeError);
      expect(JSON.stringify(input)).toBe(before);
    });
});
