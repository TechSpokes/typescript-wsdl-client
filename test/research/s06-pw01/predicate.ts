/** Historical model/accounting adapter over the shared source PW relation. */
import {evaluateGroupWildcard, ParticleWildcardInputError} from '../../../src/compiler/particleWildcardRelation.js';
import type {DecisionParticle, Interpretation, Callbacks, Failure, PredicateResult} from '../../../src/compiler/particleWildcardRelation.js';
export type {Occurs, Origin, NamespaceConstraint, WildcardOperand, DecisionParticle, Interpretation, Callbacks, Failure, PredicateResult} from '../../../src/compiler/particleWildcardRelation.js';
class PredicateFailure extends Error {
  constructor(readonly diagnostic: Failure) {super(diagnostic.message);}
}
export function groupWildcardPredicate(root: DecisionParticle, base: DecisionParticle,
  interpretation: Interpretation, inputNodes: number, callbacks: Callbacks,
  limits: {maxNodes?: number; maxSteps?: number} = {}, baseIsUrTypeWildcard = false): PredicateResult {
  const maxNodes = limits.maxNodes ?? 100_000, maxSteps = limits.maxSteps ?? 1_000_000;
  if (![maxNodes, maxSteps, inputNodes].every(x => Number.isSafeInteger(x) && x > 0)) throw new Error('PW01 requires positive safe-integer limits and node count');
  let steps = 0;
  let current = root.owner;
  const fail = (): never => {throw new PredicateFailure({category: 'resource-limit', message: 'PW01 predicate exhausted work', component: current.id, source: current.context.source});};
  const charge = (count = 1) => {for (let i = 0; i < count; i++) {if (steps === maxSteps) fail(); steps++;}};
  try {
    if (inputNodes > maxNodes) fail();
    const validRestriction = evaluateGroupWildcard(root, base, interpretation, callbacks, charge, baseIsUrTypeWildcard, owner => {current = owner;});
    return {kind: 'answer', validRestriction, steps};
  } catch (error: unknown) {
    if (error instanceof PredicateFailure) return {kind: 'failure', diagnostic: error.diagnostic, steps};
    if (error instanceof ParticleWildcardInputError) return {kind: 'failure', diagnostic: {
      category: 'invalid-schema', message: error.message, component: error.owner.id, source: error.owner.context.source,
    }, steps};
    throw error;
  }
}
