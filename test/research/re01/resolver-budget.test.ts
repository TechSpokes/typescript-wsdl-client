import { describe, expect, it } from 'vitest';
import {
  createResolverBudget,
  DEFAULT_MAX_NODES,
  DEFAULT_MAX_WORK,
  ResolverInvalidLimitsError,
  TERMINAL_RESERVATION_WORK,
} from './resolver-budget.js';

/**
 * Independently written primitive ledgers, before observing implementation
 * counters. The complete request ledger is in resolver-work-ledger.test.ts.
 *
 * Text A😀/A😁: two lengths, three pairs of UTF-16 units = 8.
 * Sort [b,a]: length + two containers + four initial read/write operations,
 *   three comparator operations + two lengths + two text units, four final
 *   read/write operations = 18.
 * Snapshot {x:ab}: three containers; root value/map/array/prototype/container/
 *   insert/two pushes (8); two pops; traversal array classification (1);
 *   own-field introspection (1); field
 *   read/write/key (3), input descriptor introspection/record/four fields/
 *   35 key units (41), output descriptor record/four fields/35 key units (40);
 *   string value/two units (3) = 102.
 * Freeze {x:ab}: two containers + initial push; record pop/set read/insertion/
 *   freeze (4); array classification (1), own-field introspection (1), field
 *   read/push/key (3), descriptor introspection/record/four fields/35 key units
 *   (41); scalar pop (1) = 54.
 */
describe('RE01 budget foundation', () => {
  it('pins positive safe-integer inclusive defaults and terminal reservation', () => {
    expect(DEFAULT_MAX_NODES).toBe(100_000);
    expect(DEFAULT_MAX_WORK).toBe(1_000_000);
    expect(TERMINAL_RESERVATION_WORK).toBe(79);
    expect(createResolverBudget().usage()).toEqual({ nodes: 0, work: 79 });
    for (const invalid of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createResolverBudget({ maxNodes: invalid })).toThrow(ResolverInvalidLimitsError);
      expect(() => createResolverBudget({ maxWork: invalid })).toThrow(ResolverInvalidLimitsError);
    }
  });

  it('uses checked subtraction at exact safe-integer limits', () => {
    const budget = createResolverBudget({ maxNodes: Number.MAX_SAFE_INTEGER, maxWork: Number.MAX_SAFE_INTEGER });
    const usage = budget.usage();
    expect(budget.guard(() => {
      budget.reserveNodes(Number.MAX_SAFE_INTEGER);
      budget.chargeWork(Number.MAX_SAFE_INTEGER - 79);
      return 'complete';
    })).toBe('complete');
    expect(usage).toEqual({ nodes: Number.MAX_SAFE_INTEGER, work: Number.MAX_SAFE_INTEGER });
    const failure = budget.guard(() => budget.chargeWork());
    expect(failure).toEqual({ kind: 'resource-limit', limit: 'work', usage });
    expect(budget.usage()).toBe(usage);
    expect(Number.isSafeInteger(usage.work)).toBe(true);
  });

  it('rejects accessor limit overrides without invoking them', () => {
    let invoked = false;
    const limits = {get maxWork() {invoked = true; return 100_000;}};
    expect(() => createResolverBudget(limits)).toThrow(ResolverInvalidLimitsError);
    expect(invoked).toBe(false);
  });

  it('does no operation or counter work after exhaustion and uses one envelope', () => {
    const budget = createResolverBudget({ maxNodes: 1 });
    const first = budget.guard(() => budget.reserveNodes(2));
    const before = { ...budget.usage() };
    let invoked = false;
    expect(budget.guard(() => { invoked = true; return 'partial'; })).toBe(first);
    expect(budget.failure()).toBe(first);
    expect(invoked).toBe(false);
    expect(budget.usage()).toEqual(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(budget.usage())).toBe(true);
  });

  it('makes the bounded terminal envelope available below its reservation', () => {
    const budget = createResolverBudget({ maxWork: 1 });
    expect(budget.guard(() => 'never')).toEqual({
      kind: 'resource-limit', limit: 'work', usage: { nodes: 0, work: 0 },
    });
  });

  it.each([
    ['UTF-16 comparison', 8, (budget: ReturnType<typeof createResolverBudget>) => budget.compareText('A😀', 'A😁'), -1],
    ['deterministic sorting', 18, (budget: ReturnType<typeof createResolverBudget>) => budget.sorted(['b', 'a'], budget.compareText), ['a', 'b']],
    ['record snapshot', 102, (budget: ReturnType<typeof createResolverBudget>) => budget.snapshot({ x: 'ab' }), { x: 'ab' }],
    ['record freezing', 54, (budget: ReturnType<typeof createResolverBudget>) => budget.freeze({ x: 'ab' }), { x: 'ab' }],
  ] as const)('matches the handwritten %s primitive ledger exactly and one below', (_name, work, operation, result) => {
    const exact = createResolverBudget({ maxWork: 79 + work });
    expect(exact.guard(() => operation(exact))).toEqual(result);
    expect(exact.usage().work).toBe(79 + work);
    const below = createResolverBudget({ maxWork: 78 + work });
    expect(below.guard(() => operation(below))).toMatchObject({ kind: 'resource-limit', limit: 'work' });
    expect(below.usage().work).toBeLessThanOrEqual(78 + work);
  });

  it('preserves sharing and cycle identity while snapshotting and freezing without recursive expansion', () => {
    const shared = { text: 'immutable' };
    const input: { left: typeof shared; right: typeof shared; self?: unknown } = { left: shared, right: shared };
    input.self = input;
    const budget = createResolverBudget();
    const copied = budget.guard(() => budget.freeze(budget.snapshot(input)));
    if ('kind' in copied) throw new Error('unexpected resource exhaustion');
    expect(copied).not.toBe(input);
    expect(copied.left).toBe(copied.right);
    expect(copied.self).toBe(copied);
    expect(copied.left).not.toBe(shared);
    expect(Object.isFrozen(copied.left)).toBe(true);
    expect(Object.isFrozen(shared)).toBe(false);
  });

  it('rejects accessors before executing any caller code', () => {
    let invoked = false;
    const record = { get value() { invoked = true; return 'unbounded'; } };
    const budget = createResolverBudget();
    expect(() => budget.snapshot(record)).toThrow('data fields');
    expect(() => budget.freeze(record)).toThrow('data fields');
    const entries: string[] = [];
    Object.defineProperty(entries, 0, { get() { invoked = true; return 'unbounded'; }, enumerable: true });
    expect(() => budget.snapshot(entries)).toThrow('data entries');
    expect(() => budget.freeze(entries)).toThrow('data entries');
    expect(invoked).toBe(false);
  });
});
