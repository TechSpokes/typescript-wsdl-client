import {describe, expect, it} from 'vitest';
import {dataOwnership, createDataOwnership, DataOwnershipLimitError} from '../../src/compiler/dataOwnership.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {DIRECT_VALUE_LIMITS} from '../../src/compiler/directValues.js';
import {DIRECT_XML_LIMITS} from '../../src/compiler/directCodec.js';

describe('data ownership without synthetic resource prices', () => {
  it('bounds metadata entries, text and depth at inclusive actual limits', () => {
    const copier = createDataOwnership(() => {}, {maxEntries: 3, maxText: 4, maxDepth: 1});
    expect(copier.snapshot({x: 'abc'})).toEqual({x: 'abc'});
    for (const input of [{x: 'abcd'}, [1, 2, 3], {x: {y: 1}}]) {
      expect(() => copier.snapshot(input)).toThrow(DataOwnershipLimitError);
    }
    let visits = 0;
    expect(() => copier.snapshot([1, 2], () => {if (++visits === 2) throw new Error('cancelled');})).toThrow('cancelled');
    expect(visits).toBe(2);
  });
  it('copies sharing and prototype-sensitive keys without mutating the caller', () => {
    const shared = {value: 'original'};
    const input = JSON.parse('{"__proto__":"own"}') as Record<string, unknown>;
    input.first = shared; input.second = shared;
    const copied = dataOwnership.snapshot(input);
    expect(Object.getOwnPropertyDescriptor(copied, '__proto__')?.value).toBe('own');
    expect(copied.first).not.toBe(shared); expect(copied.first).toBe(copied.second);
    dataOwnership.freeze(copied);
    shared.value = 'changed';
    expect(copied.first).toEqual({value: 'original'});
    expect(Object.isFrozen(shared)).toBe(false);
  });
  it('refuses getters and sparse arrays without executing caller code', () => {
    let calls = 0;
    expect(() => dataOwnership.snapshot({get value() {calls++; return 1;}})).toThrow(TypeError);
    expect(() => dataOwnership.snapshot(new Array(1))).toThrow(TypeError);
    expect(calls).toBe(0);
  });
  it('retains accounting in the semantic engine and sticky exhaustion', () => {
    const budget = createSemanticBudget({maxWork: 1000});
    const before = budget.usage().work;
    dataOwnership.snapshot({value: 'bounded procedural data'});
    expect(budget.usage().work).toBe(before);
    budget.snapshot({value: 'semantic operand'});
    expect(budget.usage().work).toBeGreaterThan(before);
    expect(budget.guard(() => budget.chargeWork(1000))).toMatchObject({kind: 'resource-limit'});
    expect(() => budget.chargeWork(0)).toThrow();
  });
  it('uses explicit text/item ceilings aligned with the direct XML profile', () => {
    expect(DIRECT_VALUE_LIMITS.maxText).toBe(DIRECT_XML_LIMITS.maxText);
    expect(DIRECT_VALUE_LIMITS.maxItems).toBeLessThanOrEqual(DIRECT_XML_LIMITS.maxNodes);
  });
});
