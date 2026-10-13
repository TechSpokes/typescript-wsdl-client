import {describe, expect, it} from 'vitest';
import {DEFAULT_MAX_WORK} from '../../../src/compiler/semanticBudget.js';
import {measureAdversarialCapacity, measureContextCapacity, measureFiniteCapacity} from './finite-capacity-measure.js';

describe('calibrated semantic request capacity', () => {
  it.each(['generic', 'source-owned'] as const)('completes the entire Weather candidate sequence through %s at current defaults', async route => {
    const result = await measureContextCapacity('weather', route, 'default');
    expect(result).toMatchObject({kind: 'prepared', acceptance: 'structural-only', graphComponents: 140,
      final: {nodes: 142}});
    expect(result.candidates.map(candidate => candidate.kind)).toEqual(['prepared', 'prepared', 'prepared']);
    expect(result.final.work).toBeGreaterThan(1_000_000);
    expect(result.final.work).toBeLessThan(DEFAULT_MAX_WORK);
  });

  it('keeps generic Weather exhaustion observable with the explicit former 1m allowance', async () => {
    const result = await measureContextCapacity('weather', 'generic', 'legacy');
    expect(result).toMatchObject({kind: 'resource-limit', acceptance: 'structural-only', candidates: []});
    expect(result.final.work).toBeLessThanOrEqual(1_000_000);
  });

  it('completes 256 shared-recursive synthetic types and three views with practical headroom', async () => {
    const result = await measureContextCapacity('synthetic-256', 'generic', 'default');
    expect(result).toMatchObject({kind: 'prepared', acceptance: 'structural-only', corpusTier: 'synthetic',
      graphComponents: 1287, final: {nodes: 1289}});
    expect(result.candidates.map(candidate => candidate.kind)).toEqual(['prepared', 'prepared', 'prepared']);
    expect(result.final.work * 1.5).toBeLessThanOrEqual(DEFAULT_MAX_WORK);
  });

  it('admits the measured complete sequence exactly, rejects one unit less and preserves sticky failure', async () => {
    const measured = await measureContextCapacity('synthetic-4', 'generic', 'diagnostic');
    expect(measured.kind).toBe('prepared');
    const exact = await measureContextCapacity('synthetic-4', 'generic', 'diagnostic', {maxWork: measured.final.work});
    expect(exact.kind).toBe('prepared');
    expect(exact.final).toEqual(measured.final);
    const short = await measureContextCapacity('synthetic-4', 'generic', 'diagnostic', {maxWork: measured.final.work - 1});
    expect(short).toMatchObject({kind: 'resource-limit', stickyFailure: true, unchangedUsage: true});
    expect(short.candidates.map(candidate => candidate.kind)).toEqual(['prepared', 'prepared', 'resource-limit']);
    expect(short.final.work).toBeLessThanOrEqual(measured.final.work - 1);
  });

  it.each(['particle-au-wildcard', 'nested-helper', 'typed-attribute'] as const)
    ('preserves accepted complete %s finite evidence with the explicit former 1m allowance', async workload => {
      const result = await measureFiniteCapacity(workload, 'legacy');
      expect(result).toMatchObject({kind: 'checked-candidate', claims: {actualObligations: 'checked',
        suppliedCandidate: 'checked', universalCoverage: false, completeNegativeAnswer: false, searchTermination: false}});
      expect(result.final.work).toBeLessThanOrEqual(1_000_000);
    });

  it.each(['legacy', 'default'] as const)('bounds adversarial input before variable work at %s limits', profile => {
    const result = measureAdversarialCapacity(profile);
    expect(result.oversized).toMatchObject({result: {kind: 'resource-limit', limit: 'work'},
      stickyFailure: true, unchangedUsage: true, invoked: false});
    expect(result.sharedCycle.preserved).toBe(true);
    expect(result.nodes).toMatchObject({kind: 'resource-limit', limit: 'nodes', usage: {nodes: 100_000}});
  });
});
