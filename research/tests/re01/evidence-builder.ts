/** Research families use the shared native construction search; they cannot issue admission. */
export * from '../../../src/compiler/finiteRe01Construction.js';
import {buildRe01EvidenceWithProducers} from '../../../src/compiler/finiteRe01Construction.js';
import type {FiniteConstructionProducer} from '../../../src/compiler/finiteRe01Construction.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import type {NodeId} from '../../../src/compiler/canonicalGraph.js';
import type {FiniteRe01Hypothesis} from '../../../src/compiler/finiteRe01Verification.js';
import {prepareAnchoredListAssignments, preparePrivateAnchoredListAssignments} from './anchored-list-assignment.js';
const producers: readonly FiniteConstructionProducer[] = [prepareAnchoredListAssignments, preparePrivateAnchoredListAssignments].map(prepare =>
  (actual, parent, target) => {
    const result = prepare(actual, parent, target);
    return result.kind === 'prepared-anchored-list-assignments'
      ? {kind: 'prepared-additional-assignments' as const, assignments: result.assignments, outcomes: result.outcomes} : result;
  });
export function buildRe01Evidence(actual: SemanticContext, target: NodeId) {
  return buildRe01EvidenceWithProducers(actual, target, 'input-only', producers);
}
export function completeSeededRe01Evidence(actual: SemanticContext, target: NodeId, hypothesis: FiniteRe01Hypothesis) {
  return buildRe01EvidenceWithProducers(actual, target, 'seeded-completion', producers, hypothesis);
}
