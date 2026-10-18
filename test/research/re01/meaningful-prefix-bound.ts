/** Structural capacities only; no candidate generation or complete RE01 decision. */
import type {NodeId} from '../../../src/compiler/canonicalGraph.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {assertSemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveActualComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import type {SemanticParticle} from '../../../src/compiler/particleSemanticView.js';
import {occurrenceAlgebra} from '../../../src/compiler/occurrenceAnalysis.js';

/**
 * W counts unfolded declared terminal/empty-group incidences, not normalized
 * virtual-choice members. Each repeated edge contributes its child's W again.
 * The proof applies only to direct element/sequence frontiers; see RE01 record.
 */
export function measureMeaningfulPrefixBounds(actual: SemanticContext, ancestor: NodeId, endpoint: NodeId) {
  assertSemanticContext(actual);
  const budget = actual.budget, charge = () => budget.chargeWork();
  return budget.guard(() => {
    budget.chargeWork(8);
    if (actual.kind !== 'actual') throw new TypeError('The structural bound requires immutable actual input');
    const algebra = occurrenceAlgebra(charge);
    const capacity = (root: SemanticParticle): string => {
      budget.chargeWork(3);
      const memo = new Map<SemanticParticle, string>();
      const stack = [{particle: root, done: false}];
      while (stack.length) {
        budget.chargeWork(4);
        const {particle, done} = stack.pop()!;
        if (memo.has(particle)) continue;
        if (!done) {
          budget.chargeWork(2 + particle.children.length * 2);
          stack.push({particle, done: true});
          for (const child of particle.children) stack.push({particle: child, done: false});
          continue;
        }
        let weight = '0';
        for (const child of particle.children) {
          budget.chargeWork(2);
          weight = algebra.add(weight, memo.get(child)!);
        }
        budget.chargeWork(2);
        memo.set(particle, weight === '0' ? '1' : weight);
      }
      return memo.get(root)!;
    };
    const values: string[] = [];
    for (const type of [ancestor, endpoint]) {
      const content = deriveActualComplexContent(actual, type);
      if (content.kind !== 'checked') return content;
      if (content.view.content.kind !== 'element-only') {
        budget.chargeWork(8);
        return {kind: 'outside-slice' as const, type, message: 'This capacity requires element-only actual content'};
      }
      const declared = prepareSemanticParticleView(actual, content.view, 'declared');
      if (declared.kind !== 'checked') return declared;
      budget.chargeWork(2);
      values.push(capacity(declared.view.root));
    }
    const [maxPrefixMembers, maxFinalMembers] = values;
    const maxMappingStates = algebra.multiply(algebra.add(maxPrefixMembers, '1'), algebra.add(maxFinalMembers, '1'));
    const maxNewParticleRecords = algebra.add(maxFinalMembers, '2');
    budget.chargeWork(12 + maxPrefixMembers.length + maxFinalMembers.length + maxMappingStates.length + maxNewParticleRecords.length);
    return Object.freeze({kind: 'structural-bound' as const, actualContextId: actual.contextId,
      ancestor, endpoint, maxPrefixMembers, maxFinalMembers, maxMappingStates, maxNewParticleRecords});
  });
}
