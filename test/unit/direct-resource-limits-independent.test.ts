/** Independent controls for actual containment rather than synthetic work prices. */
import {describe, expect, it} from 'vitest';
import {directClientRuntime} from '../../src/client/directClientRuntime.js';
import type {DirectClientOptions} from '../../src/client/directClientRuntime.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {DIRECT_METADATA_LIMITS} from '../../src/compiler/dataOwnership.js';

function configured() {
  let endpointCalls = 0;
  const bytes = Buffer.from('{}');
  const options: DirectClientOptions = {budget: {}, localSource: '/never-read.wsdl', fileRoots: [], capsule: bytes,
    soap: {service: {namespace: 'urn:independent', local: 'Service'}, port: 'Port', endpoint: 'http://127.0.0.1:1/never',
      allowEndpoint: () => {endpointCalls++; return false;}}};
  return {options, execute: () => directClientRuntime.execute(bytes.toString('base64'), {}, options), endpointCalls: () => endpointCalls};
}
function nested(depth: number): object {
  let value: object = {};
  for (let i = 0; i < depth; i++) value = {child: value};
  return value;
}

describe('independent routine metadata containment', () => {
  it('enforces aggregate entry and text boundaries before source or endpoint work', async () => {
    for (const [fileRoots, expected] of [
      [new Array<string>(DIRECT_METADATA_LIMITS.maxEntries - 1).fill(''), 'incompatible-artifact'],
      [new Array<string>(DIRECT_METADATA_LIMITS.maxEntries).fill(''), 'resource-limit'],
      [['x'.repeat(DIRECT_METADATA_LIMITS.maxText)], 'incompatible-artifact'],
      [['x'.repeat(DIRECT_METADATA_LIMITS.maxText + 1)], 'resource-limit'],
    ] as const) {
      const call = configured();
      const options = {...call.options, fileRoots};
      const result = await directClientRuntime.execute('e30=', {}, options);
      expect(result.kind).toBe(expected);
      expect(result.usage.work).toBe(79);
      expect(result).not.toHaveProperty('responseBytes');
      expect(call.endpointCalls()).toBe(0);
    }
  });

  it('bounds deeply nested metadata before traversing an invalid capsule', async () => {
    const call = configured();
    const limits = {maxBytes: 1, ignored: nested(DIRECT_METADATA_LIMITS.maxDepth + 1)};
    const result = await directClientRuntime.execute('e30=', {}, {...call.options, soap: {...call.options.soap, limits}});
    expect(result).toMatchObject({kind: 'resource-limit', rule: 'metadata entry/depth limit', usage: {work: 79}});
    expect(call.endpointCalls()).toBe(0);
  });

  it('observes pre-aborted cancellation before copying oversized metadata', async () => {
    const call = configured();
    const result = await directClientRuntime.execute('e30=', {}, {...call.options,
      fileRoots: new Array<string>(DIRECT_METADATA_LIMITS.maxEntries + 1).fill(''),
      soap: {...call.options.soap, signal: AbortSignal.abort()}});
    expect(result.kind).toBe('cancelled');
    expect(call.endpointCalls()).toBe(0);
  });

  it('rejects nested metadata proxies and getters without calling their code', async () => {
    const call = configured();
    let calls = 0;
    const proxy = new Proxy({}, {getPrototypeOf() {calls++; throw new Error('proxy trap');}, ownKeys() {calls++; throw new Error('proxy keys');}});
    const accessor = {get child() {calls++; throw new Error('getter');}};
    for (const ignored of [proxy, accessor]) {
      const limits = {maxBytes: 1, ignored};
      await expect(directClientRuntime.execute('e30=', {}, {...call.options, soap: {...call.options.soap, limits}})).rejects.toBeInstanceOf(TypeError);
    }
    expect(calls).toBe(0);
    expect(call.endpointCalls()).toBe(0);
  });

  it('preserves the independently counted legacy semantic snapshot cost', () => {
    const budget = createSemanticBudget();
    const before = budget.usage().work;
    expect(budget.snapshot({x: 'abc'})).toEqual({x: 'abc'});
    // Original snapshot: 11 root setup + 4 traversal + 84 descriptor/key + 4 string.
    expect(budget.usage().work - before).toBe(103);
  });
});
