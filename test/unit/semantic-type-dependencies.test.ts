import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {prepareResolvedCompilationInput} from '../../src/compiler/semanticCatalog.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {collectSemanticTypeDependencies} from '../../src/compiler/semanticTypeDependencies.js';
import type {SemanticTypeDependency} from '../../src/compiler/semanticTypeReference.js';

const maxWork = 10_000_000;
async function setup() {
  const root = path.resolve('test/conformance/fixtures/xsd/graph');
  const input = await prepareResolvedCompilationInput({kind: 'source', source: path.join(root, 'shared-recursive.xsd')}, {
    loading: {policy: {fileRoots: [root]}},
  });
  if (input.kind !== 'semantic') throw new Error('Expected source graph');
  const budget = createSemanticBudget({maxWork});
  const prepared = prepareSemanticRequest(input.resolved, {budget});
  if (prepared.kind !== 'prepared') throw new Error('Expected semantic context');
  return {context: prepared.request.actual, budget};
}

describe('owned semantic type dependency accumulation', () => {
  it('owns each inserted value and rekeys a changed ordinary input instead of trusting its object identity', async () => {
    const {context, budget} = await setup();
    expect(budget.guard(() => {
      const collector = collectSemanticTypeDependencies(context);
      const input = {contextId: context.contextId, type: {kind: 'component' as const, id: 'first'}};
      collector.add([input]);
      const before = collector.snapshot();
      input.type.id = 'second';
      collector.add([input]);
      expect(before).toEqual([{contextId: context.contextId, type: {kind: 'component', id: 'first'}}]);
      expect(collector.snapshot()).toEqual([...before, {contextId: context.contextId, type: {kind: 'component', id: 'second'}}]);
      expect(Object.isFrozen(before)).toBe(true);
      expect(Object.isFrozen(before[0].type)).toBe(true);
    })).toBeUndefined();
  });

  it('replays all identities with their exact interpretation context while interning duplicate facts', async () => {
    const {context, budget} = await setup();
    expect(budget.guard(() => {
      const a = collectSemanticTypeDependencies(context), b = collectSemanticTypeDependencies(context);
      const facts: readonly SemanticTypeDependency[] = [
        {contextId: 'actual', type: {kind: 'component', id: 'same'}},
        {contextId: 'candidate', type: {kind: 'component', id: 'same'}},
        {contextId: 'candidate', type: {kind: 'original-generated', owner: 'same'}},
        {contextId: 'candidate', type: {kind: 'builtin', name: {namespace: 'ab', local: 'c'}}},
        {contextId: 'candidate', type: {kind: 'builtin', name: {namespace: 'a', local: 'bc'}}},
      ];
      a.add(facts); a.add(facts);
      const first = a.snapshot();
      b.add(first); b.add(facts);
      expect(first).toEqual(facts);
      expect(a.snapshot()).toBe(first);
      expect(b.snapshot()).toEqual(facts);
      expect(b.snapshot()[0]).toBe(first[0]);
    })).toBeUndefined();
  });

  it('rejects accessor-bearing fact and identity data without invoking any getter', async () => {
    const {context, budget} = await setup();
    let calls = 0;
    const samples = [
      {get contextId() {calls++; return context.contextId;}, type: {kind: 'component', id: 'id'}},
      {contextId: context.contextId, get type() {calls++; return {kind: 'component', id: 'id'};}},
      {contextId: context.contextId, type: {kind: 'component', get id() {calls++; return 'id';}}},
    ];
    for (const sample of samples) expect(() => budget.guard(() => {
      collectSemanticTypeDependencies(context).add([sample as SemanticTypeDependency]);
    })).toThrow(TypeError);
    expect(calls).toBe(0);
  });

  it('charges cached publication and replay under the same sticky request budget', async () => {
    const {context, budget} = await setup();
    const result = budget.guard(() => {
      const collector = collectSemanticTypeDependencies(context);
      collector.add([{contextId: context.contextId, type: {kind: 'component', id: 'id'}}]);
      return {collector, snapshot: collector.snapshot()};
    });
    if ('kind' in result) throw new Error('Expected live collector');
    const before = budget.usage().work;
    budget.guard(() => result.collector.snapshot());
    expect(budget.usage().work).toBeGreaterThan(before);
    budget.guard(() => budget.chargeWork(maxWork));
    expect(budget.guard(() => result.collector.snapshot())).toBe(budget.failure());
    expect(budget.guard(() => result.collector.add(result.snapshot))).toBe(budget.failure());
  });
});
