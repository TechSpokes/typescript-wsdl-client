import {describe, expect, it} from 'vitest';
import {expectedRanges} from '../../scripts/lib/dependency-freshness.ts';

describe('release dependency freshness', () => {
  it('keeps npm version selection and insertion order with at most four active lookups', async () => {
    const names = ['first', 'typescript', 'newer', 'scoped', '@scope/one', 'last'];
    let active = 0;
    let peak = 0;
    const specs: string[] = [];
    const completions: string[] = [];
    let finishFirst!: () => void;
    const firstMayFinish = new Promise<void>(resolve => {finishFirst = resolve;});
    const ranges = await expectedRanges(names, new Map([['newer', '^9.0.0']]), async spec => {
      specs.push(spec);
      peak = Math.max(peak, ++active);
      if (spec === 'scoped') finishFirst();
      if (spec === 'first' || spec === 'typescript@6' || spec === 'newer') await firstMayFinish;
      active--;
      completions.push(spec);
      return spec === 'typescript@6' ? '["6.0.0", "6.0.3"]' : '"1.2.3"';
    });
    expect(peak).toBe(4);
    expect(completions[0]).not.toBe('first');
    expect(specs).toEqual(['first', 'typescript@6', 'newer', 'scoped', '@scope/one', 'last']);
    expect([...ranges]).toEqual([
      ['first', '^1.2.3'], ['typescript', '^6.0.3'], ['newer', '^9.0.0'],
      ['scoped', '^1.2.3'], ['@scope/one', '^1.2.3'], ['last', '^1.2.3'],
    ]);
  });

  it.each(['null', '[]', '"not-a-version"', '"1.2.3-rc..5"', '"1.2.3-01"', '{bad json'])('rejects malformed npm output %s', async raw => {
    await expect(expectedRanges(['some-package'], new Map(), async () => raw))
      .rejects.toThrow('Dependency lookup failed for some-package:');
  });

  it('reports the first failed input and waits for active lookups before rejecting', async () => {
    const calls: string[] = [];
    let finishFirst!: () => void;
    const laterFinished = new Promise<void>(resolve => {finishFirst = resolve;});
    await expect(expectedRanges(['first', 'second', 'third', 'fourth', 'fifth'], new Map(), async spec => {
      calls.push(spec);
      if (spec === 'first') {
        await laterFinished;
        throw new Error('registry request failed');
      }
      if (spec === 'second') return 'null';
      if (spec === 'fourth') finishFirst();
      return '"1.2.3"';
    })).rejects.toThrow('Dependency lookup failed for first: registry request failed');
    expect(calls).toEqual(['first', 'second', 'third', 'fourth']);
  });
});
