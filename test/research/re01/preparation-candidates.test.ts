/** Observable structural request reuse and inclusive-budget controls from #272's independent specification. */
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {prepareResolvedCompilationInput} from '../../../src/compiler/semanticCatalog.js';
import {prepareSemanticRequest} from '../../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import {canonicalJson} from '../../../src/compiler/catalogErrors.js';
import {candidateSequence, measureSourceOwnedPreparation} from './preparation-candidates.js';
import {COMMITTED_PREPARATION_CORPUS} from './preparation-corpus.js';

const source = path.resolve(COMMITTED_PREPARATION_CORPUS[2].source);
async function resolved() {
  const result = await prepareResolvedCompilationInput({kind: 'source', source}, {loading: {policy: {fileRoots: [path.resolve('.')]}}});
  if (result.kind !== 'semantic') throw new Error('Expected structural source result');
  return result.resolved;
}

describe('real-source candidate workload', () => {
  it('reports authentic source-owned preparation separately with real default exhaustion', async () => {
    const small = await measureSourceOwnedPreparation(COMMITTED_PREPARATION_CORPUS[2], path.resolve('.'), 'diagnostic');
    expect(small).toMatchObject({mode: 'source-owned-actual-preparation', acceptance: 'structural-only', classification: 'structurally-prepared'});
    expect(small.stages.map(stage => stage.stage)).toEqual(['source-owned-loading', 'source-owned-actual-preparation']);
    expect(small.stages[0].logicalWork).toBeNull();
    expect(small.stages[1].logicalWork).toBe(small.finalUsage.work);
    expect(small.finalUsage.work).toBeGreaterThan(79);
    const weather = await measureSourceOwnedPreparation(COMMITTED_PREPARATION_CORPUS[0], path.resolve('.'), 'default');
    expect(weather).toMatchObject({classification: 'resource-limit', acceptance: 'structural-only'});
    expect(weather.stages[1].classification).toBe('resource-limit');
  });

  it('changes actual membership and endpoint definitions while preserving source/sibling contexts', async () => {
    const input = await resolved(), original = canonicalJson(input.graph);
    const prepared = prepareSemanticRequest(input, {budget: createSemanticBudget({maxWork: 10_000_000})});
    if (prepared.kind !== 'prepared') throw new Error('Expected request');
    const deltas = candidateSequence(input.graph.nodes), results = deltas.map(delta => prepared.request.candidate(delta));
    const [first, second, sibling] = results;
    if (first.kind !== 'prepared' || second.kind !== 'prepared' || sibling.kind !== 'prepared') throw new Error('Expected candidate contexts');
    expect(second.context.members.length).toBeLessThan(first.context.members.length);
    const omitted = first.context.members.find(id => !second.context.members.includes(id))!;
    expect(second.context.lookup(omitted)).toMatchObject({kind: 'outside-context'});
    expect(second.context.sourceNode(omitted)?.id).toBe(omitted);
    const endpoint = deltas[1].endpoint!;
    expect(second.context.lookup(endpoint.id)).toMatchObject({kind: 'found', node: {mixed: endpoint.mixed}});
    expect(sibling.context.lookup(endpoint.id)).toMatchObject({kind: 'found', node: {mixed: !endpoint.mixed}});
    expect(prepared.request.actual.lookup(endpoint.id)).toMatchObject({kind: 'found', node: {mixed: !endpoint.mixed}});
    expect(new Set(results.filter(result => result.kind === 'prepared').map(result => result.context.contextId)).size).toBe(3);
    expect(canonicalJson(input.graph)).toBe(original);
    expect(canonicalJson(prepared.request.graph)).toBe(original);
  });

  it('accepts exact complete-sequence allowance, rejects one less and keeps exhaustion sticky', async () => {
    const input = await resolved(), deltas = candidateSequence(input.graph.nodes);
    const run = (maxWork: number) => {
      const budget = createSemanticBudget({maxWork});
      const prepared = prepareSemanticRequest(input, {budget});
      if (prepared.kind !== 'prepared') throw new Error('Limit must admit actual preparation');
      const outcomes = deltas.map(delta => prepared.request.candidate(delta));
      return {budget, request: prepared.request, outcomes, usage: {...budget.usage()}};
    };
    const measured = run(10_000_000), exact = run(measured.usage.work);
    expect(exact.outcomes.map(result => result.kind)).toEqual(['prepared', 'prepared', 'prepared']);
    expect(exact.usage).toEqual(measured.usage);
    const short = run(measured.usage.work - 1);
    expect(short.outcomes[0].kind).toBe('prepared');
    expect(short.outcomes[1].kind).toBe('prepared');
    expect(short.outcomes[2].kind).toBe('resource-limit');
    const frozenUsage = {...short.budget.usage()};
    expect(short.request.candidate(deltas[0])).toBe(short.outcomes[2]);
    expect(short.budget.usage()).toEqual(frozenUsage);
  });
});
