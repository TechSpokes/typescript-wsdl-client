import {describe, expect, it} from 'vitest';
import {Ajv} from 'ajv';
import {lowerCheckedDocumentation} from '../../src/gateway/checkedDocumentation.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';

const selector = {portType: {namespace: 'urn:test', local: 'Port'}, binding: {namespace: 'urn:test', local: 'Binding'}, operation: 'Read'};
type Schema = Record<string, unknown>;
const rootId = 'urn:checked-component:shape:' + 'a'.repeat(64);
const noop = () => {};
const lower = (root: Schema, role = 'Request', grouped = false, components: Record<string, Schema> = {}) => {
  const schema = lowerCheckedDocumentation(root, selector, role, grouped, components, noop);
  return {schema, components};
};

describe('checked documentation shape scope', () => {
  it('preserves recursive structural acceptance, literal keywords and escaped descendant pointers without mutation', () => {
    const literal = {$id: 'example', $ref: '#/definitions/absent', definitions: {business: true}};
    const root = {$id: rootId, allOf: [{$ref: '#/definitions/Record'}], definitions: {
      Record: {type: 'object', required: ['$id', '$ref', 'definitions', 'a/b~c'], additionalProperties: false,
        properties: {$id: {type: 'string'}, $ref: {type: 'boolean'}, definitions: {type: 'integer'},
          'a/b~c': {type: 'string'}, copy: {$ref: '#/definitions/Record/properties/a~1b~0c'}, next: {$ref: '#/definitions/Record'}},
        default: literal, examples: [literal], 'x-literal': literal}}};
    const before = JSON.stringify(root), result = lower(root), name = Object.keys(result.components)[0]!;
    expect(result.components[name]).toMatchObject({default: literal, examples: [literal], 'x-literal': literal,
      properties: {copy: {$ref: '#/components/schemas/' + name + '/properties/a~1b~0c'}}});
    const settings = {strict: false, coerceTypes: false, useDefaults: false, removeAdditional: false};
    const runtime = new Ajv(settings).compile(root);
    const documented = new Ajv(settings).compile({...result.schema, components: {schemas: result.components}});
    const valid = {$id: 'data', $ref: false, definitions: 2, 'a/b~c': 'text', copy: 'duplicate'};
    const values = [valid, {...valid, next: valid}, {...valid, copy: false}, {...valid, definitions: '2'}, {...valid, extra: 1}];
    expect(values.map(value => runtime(value))).toEqual([true, true, false, false, false]);
    expect(values.map(value => documented(value))).toEqual([true, true, false, false, false]);
    expect(JSON.stringify(root)).toBe(before);
    expect(lower(root)).toEqual(result);
  });

  it('separates repeated definition names across roles, faults and full operation selectors', () => {
    const shape = {$id: rootId, $ref: '#/definitions/Record', definitions: {Record: {type: 'string'}}};
    const components = {};
    const refs = ['Request', 'Response', 'Fault_0', 'Fault_1'].map(role => lower(shape, role, false, components).schema.$ref);
    for (const selected of [{...selector, operation: 'Write'}, {...selector, binding: {...selector.binding, namespace: 'urn:other'}},
      {...selector, portType: {...selector.portType, local: 'Other'}}]) {
      refs.push(lowerCheckedDocumentation(shape, selected, 'Request', false, components, noop).$ref);
    }
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('preserves configured names and rejects conflicting destination components', () => {
    const shape = {definitions: {ConfiguredRecord: {type: 'string'}}, $ref: '#/definitions/ConfiguredRecord'};
    expect(lower(shape, 'Request', true)).toEqual({schema: {$ref: '#/components/schemas/ConfiguredRecord'}, components: {ConfiguredRecord: {type: 'string'}}});
    expect(() => lower(shape, 'Request', true, {ConfiguredRecord: {type: 'boolean'}})).toThrow(/collision/);
    expect(lower(shape, 'Request', true, {ConfiguredRecord: {type: 'string'}}).components).toEqual({ConfiguredRecord: {type: 'string'}});
  });

  it.each(['#/definitions/Missing', '#/definitions/Record/properties/missing', '#/definitions/Record/type',
    '#/definitions/Record/properties/bad~2escape', '#anchor', 'https://example.com/schema', '#/components/schemas/Record'])('rejects unexpected or unresolved reference %s', ref => {
    expect(() => lower({$ref: ref, definitions: {Record: {type: 'object'}}})).toThrow(TypeError);
  });

  it.each(['$id', '$anchor', '$dynamicRef', '$defs', 'definitions'])('rejects unexpected nested resource keyword %s', keyword => {
    expect(() => lower({properties: {business: {[keyword]: 'unexpected'}}})).toThrow(/resource/);
  });

  it('propagates cancellation and charges the shared generation budget during traversal', () => {
    const shape = {definitions: {Record: {type: 'object', properties: {value: {type: 'string'}}}}, $ref: '#/definitions/Record'};
    let checks = 0;
    const cancelled = new Error('cancelled');
    expect(() => lowerCheckedDocumentation(shape, selector, 'Request', false, {}, () => {
      if (++checks === 5) throw cancelled;
    })).toThrow(cancelled);
    expect(checks).toBe(5);
    const budget = createSemanticBudget({maxWork: 85});
    expect(budget.guard(() => lowerCheckedDocumentation(shape, selector, 'Request', false, {}, () => budget.chargeWork())))
      .toMatchObject({kind: 'resource-limit', limit: 'work'});
  });
});
