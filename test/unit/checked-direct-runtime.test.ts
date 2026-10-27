import {describe, expect, it} from 'vitest';
import {checkedDirectRuntimeV1} from '../../src/index.js';

describe('package root checked direct binding', () => {
  it('refuses missing/foreign generated protocols before inspecting caller options', async () => {
    let reads = 0;
    const options = new Proxy({}, {get() {reads++; throw new Error('caller code');}, ownKeys() {reads++; throw new Error('caller code');}});
    for (const version of [undefined, 'old', 'checked-direct-runtime-v2']) {
      expect(await Reflect.apply(checkedDirectRuntimeV1.execute, checkedDirectRuntimeV1, ['', {}, options, version]))
        .toMatchObject({kind: 'incompatible-artifact', rule: 'generated-runtime-version', usage: {nodes: 0, work: 0}, repair: expect.stringContaining('Regenerate')});
    }
    expect(reads).toBe(0);
    expect(Object.isFrozen(checkedDirectRuntimeV1)).toBe(true);
  });

  it('refuses profiling and data accessors without executing caller code', async () => {
    const options = {localSource: '/never.wsdl', fileRoots: [], capsule: new Uint8Array(), soap: {}};
    let reads = 0;
    for (const supplied of [
      {...options, budget: {}},
      Object.defineProperty({...options}, 'budget', {get() {reads++; throw new Error('caller code');}}),
      Object.defineProperty({...options}, 'capsule', {get() {reads++; throw new Error('caller code');}}),
      new Proxy(options, {getPrototypeOf() {reads++; throw new Error('caller code');}}),
    ]) {
      expect(await Reflect.apply(checkedDirectRuntimeV1.execute, checkedDirectRuntimeV1,
        ['', {}, supplied, 'checked-direct-runtime-v1'])).toMatchObject({kind: 'unsupported', usage: {nodes: 0, work: 0}});
    }
    expect(reads).toBe(0);
  });
});
