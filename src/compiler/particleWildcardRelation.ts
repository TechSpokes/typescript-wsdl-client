/** Shared local PW R-240 relation; normalized-view qualifications remain explicit. */
import {occurrenceAlgebra} from './occurrenceAnalysis.js';
import {namespaceAllows, namespaceSubset, processContentsRestricts} from './wildcardAlgebra.js';
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {ResourceLimitFailure} from './semanticBudget.js';

export type Occurs = Readonly<{min: string; max: string}>;
export type Origin = Readonly<{id: string; context: {source: Readonly<{path: string}>}}>;
export type NamespaceConstraint = Readonly<{kind: "set" | "not"; namespaces: readonly string[]}>;
export type WildcardOperand = Readonly<{
  constraint: NamespaceConstraint;
  processContents: "skip" | "lax" | "strict";
  /** Original lexical/effective namespace context survives decoded constraints. */
  lexical: Readonly<{value: string; effectiveNamespace: string}>;
}>;
export type DecisionParticle = Readonly<{
  owner: Origin;
  kind: "sequence" | "choice" | "all" | "element" | "any";
  occurs: Occurs;
  /** Supplied by #178; this experiment never calculates an effective range. */
  total: Occurs;
  members: readonly DecisionParticle[];
  namespace?: string;
  wildcard?: WildcardOperand;
}>;
export type Interpretation = "literal2004" | "proposed2232";
export type Callbacks = Readonly<{
  arithmetic: (charge: (count?: number) => void) => {validate(range: Occurs): void; compare(a: string, b: string): number};
  namespaces: (derived: DecisionParticle, base: DecisionParticle, charge: (count?: number) => void) => boolean;
}>;
export type Failure = Readonly<{category: "invalid-schema" | "resource-limit"; message: string; component: string; source: Origin["context"]["source"]}>;
export type PredicateResult = Readonly<
  {kind: "answer"; validRestriction: boolean; steps: number} |
  {kind: "failure"; diagnostic: Failure; steps: number}
>;

export class ParticleWildcardInputError extends Error {
  constructor(message: string, readonly owner: Origin) {super(message);}
}

/** Shared control flow. Callbacks exist only for pinned historical research comparisons. */
export function evaluateGroupWildcard(root: DecisionParticle, base: DecisionParticle,
  interpretation: Interpretation, callbacks: Callbacks, charge: (count?: number) => void,
  baseIsUrTypeWildcard = false, currentOwner?: (owner: Origin) => void): boolean {
  let current = base.owner;
  currentOwner?.(current);
  const algebra = callbacks.arithmetic(charge);
  const within = (actual: Occurs, min: string) => algebra.compare(actual.min, min) >= 0 && algebra.compare(actual.max, base.occurs.max) <= 0;
  try {
    if (base.kind !== 'any' || !base.wildcard) throw new ParticleWildcardInputError('PW01 requires an original wildcard particle', current);
    algebra.validate(base.occurs);
    charge(2);
    const memo = new Map<DecisionParticle, Map<string, boolean>>();
    const active = new Set<DecisionParticle>();
    type Frame = {particle: DecisionParticle; min: string; index: number; entered: boolean; valid: boolean};
    charge(2);
    const stack: Frame[] = [{particle: root, min: base.occurs.min, index: 0, entered: false, valid: true}];
    active.add(root);
    while (stack.length) {
      const frame = stack[stack.length - 1], p = frame.particle;
      current = p.owner; currentOwner?.(current); charge();
      if (!frame.entered) {
        frame.entered = true;
        algebra.validate(p.occurs); algebra.validate(p.total);
        frame.valid = within(p.kind === 'element' || p.kind === 'any' ? p.occurs : p.total, frame.min);
        if (p.kind === 'any' && !p.wildcard) throw new ParticleWildcardInputError('Missing wildcard operand', current);
        if (p.kind === 'element' || p.kind === 'any') frame.valid &&= callbacks.namespaces(p, base, charge);
        if (p.kind === 'any') frame.valid &&= baseIsUrTypeWildcard || processContentsRestricts(p.wildcard!.processContents, base.wildcard!.processContents, charge);
      }
      if (frame.valid && p.kind !== 'element' && p.kind !== 'any' && frame.index < p.members.length) {
        const child = p.members[frame.index], min = interpretation === 'proposed2232' ? '0' : frame.min;
        charge();
        const known = memo.get(child)?.get(min);
        if (known !== undefined) {frame.valid &&= known; frame.index++;}
        else {
          charge();
          if (active.has(child)) throw new ParticleWildcardInputError('Forbidden normalized particle cycle', child.owner);
          charge(2); active.add(child); stack.push({particle: child, min, index: 0, entered: false, valid: true});
        }
        continue;
      }
      charge();
      let values = memo.get(p);
      if (!values) {charge(); values = new Map(); memo.set(p, values);}
      charge(2); values.set(frame.min, frame.valid); active.delete(p); stack.pop();
      if (!stack.length) return frame.valid;
    }
    throw new Error('Missing PW01 predicate result');
  } catch (error: unknown) {
    if (error instanceof Error && 'category' in error && error.category === 'invalid-schema') throw new ParticleWildcardInputError(error.message, current);
    throw error;
  }
}

const concreteCallbacks: Callbacks = Object.freeze({
  arithmetic: (charge: (count?: number) => void) => occurrenceAlgebra(charge),
  namespaces: (derived: DecisionParticle, base: DecisionParticle, charge: (count?: number) => void) => {
    const constraint = base.wildcard!.constraint;
    return derived.kind === 'element' ? namespaceAllows(constraint, derived.namespace ?? '', charge)
      : namespaceSubset(derived.wildcard!.constraint, constraint, charge);
  },
});

/** Internal concrete adapter for an authenticated semantic-view owner. */
export function evaluatePreparedGroupWildcard(root: DecisionParticle, base: DecisionParticle, charge: (count?: number) => void, urTypeWildcard = false): boolean {
  return evaluateGroupWildcard(root, base, 'proposed2232', concreteCallbacks, charge, urTypeWildcard);
}

export const PW_RELATION_REQUIREMENTS = Object.freeze([
  'restriction-normalized-view', 'view-total-ranges-from-178',
  'source-local-particle-legality', 'upa-edc', 'enclosing-derivation',
] as const);
export type QualifiedWildcardResult = Readonly<{
  kind: 'conditional-relation'; contextId: string; ruleVersion: 'PW-R-240-v1';
  validRestriction: boolean; requirements: typeof PW_RELATION_REQUIREMENTS;
}> | Readonly<{kind: 'input-error'; component: string; message: string}> | ResourceLimitFailure;

/**
 * Fixed semantic owners and one caller budget. This function checks the named
 * relation over supplied normalized operands, not their normalization or schema.
 * The actual ur-type identity exception requires a future authenticated operand
 * adapter and is deliberately not inferred from ##any or lax spelling here.
 */
export function restrictParticleToWildcard(context: SemanticContext, root: DecisionParticle, base: DecisionParticle): QualifiedWildcardResult {
  assertSemanticContext(context);
  const budget = context.budget;
  return budget.guard(() => {
    const input = budget.freeze(budget.snapshot({root, base}));
    budget.chargeWork(3);
    const seen = new Set<DecisionParticle>(), stack = [input.root, input.base];
    while (stack.length) {
      budget.chargeWork(2); const particle = stack.pop()!;
      if (seen.has(particle)) continue;
      budget.chargeWork(); seen.add(particle);
      const result = context.lookup(particle.owner.id);
      if (result.kind !== 'found' || result.node.kind !== 'particle') {
        budget.chargeWork(5); return Object.freeze({kind: 'input-error', component: particle.owner.id, message: 'Normalized operand requires an active original particle owner'});
      }
      for (const child of particle.members) {budget.chargeWork(); stack.push(child);}
    }
    try {
      const validRestriction = evaluateGroupWildcard(input.root, input.base, 'proposed2232', concreteCallbacks, budget.chargeWork);
      budget.chargeWork(8);
      return Object.freeze({kind: 'conditional-relation', contextId: context.contextId, ruleVersion: 'PW-R-240-v1', validRestriction, requirements: PW_RELATION_REQUIREMENTS});
    } catch (error: unknown) {
      if (!(error instanceof ParticleWildcardInputError)) throw error;
      budget.chargeWork(5 + error.message.length);
      return Object.freeze({kind: 'input-error', component: error.owner.id, message: error.message});
    }
  });
}
