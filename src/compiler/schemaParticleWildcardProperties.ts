/** Fresh abstract particle properties, distinct from canonical XML wildcard spelling and native origin. */
import type {LexicalValue, NodeId, ParticleNode} from './canonicalGraph.js';
import type {SemanticBudget} from './semanticBudget.js';
import type {SemanticContext} from './semanticContext.js';
import {canonicalNamespaceConstraint, wildcardNamespaces} from './wildcardAlgebra.js';
import type {NamespaceConstraint, WildcardProcess} from './wildcardAlgebra.js';

export type RawParticleWildcardProperties = Readonly<{
  particle: NodeId; namespace: NamespaceConstraint; processContents: WildcardProcess;
}>;
export type SelectedParticleWildcard = Readonly<{
  namespace: NamespaceConstraint; processContents: WildcardProcess;
  /** Source spelling is diagnostic data, never the selected abstract namespace property. */
  lexical: LexicalValue;
}>;

export function prepareRawParticleWildcardProperties(input: unknown, budget: SemanticBudget): RawParticleWildcardProperties {
  const value = budget.snapshot(input);
  const object = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item);
  const fields = (item: Record<string, unknown>, names: readonly string[]): boolean => {
    budget.chargeWork(3); let count = 0;
    for (const key in item) {budget.chargeWork(1 + key.length); if (!names.includes(key)) return false; count++;}
    return count === names.length;
  };
  budget.chargeWork(12);
  if (!object(value) || !fields(value, ['particle', 'namespace', 'processContents']) || typeof value.particle !== 'string'
    || !object(value.namespace) || !fields(value.namespace, ['kind', 'namespaces'])
    || value.namespace.kind !== 'set' && value.namespace.kind !== 'not' || !Array.isArray(value.namespace.namespaces)
    || !['strict', 'lax', 'skip'].includes(value.processContents as string)) throw new TypeError('Invalid particle wildcard properties');
  budget.chargeWork(value.particle.length + value.namespace.namespaces.length + 3);
  for (const namespace of value.namespace.namespaces) {
    budget.chargeWork(); if (typeof namespace !== 'string') throw new TypeError('Invalid namespace property');
    budget.chargeWork(namespace.length);
  }
  const namespace = canonicalNamespaceConstraint(value.namespace as NamespaceConstraint, budget.chargeWork);
  budget.chargeWork(5);
  return budget.freeze({particle: value.particle, namespace, processContents: value.processContents as WildcardProcess});
}

/** All semantic particle owners select the same tuple; source-private inputs stay lexical. */
export function readParticleWildcard(context: SemanticContext, particle: ParticleNode): SelectedParticleWildcard {
  if (particle.term.kind !== 'any') throw new TypeError('An ANY particle is required');
  const budget = context.budget, found = context.lookup(particle.id);
  const raw = found.kind === 'found' && found.node === particle ? context.rawParticleWildcardProperties(particle.id) : undefined;
  const namespace = raw?.namespace ?? wildcardNamespaces(particle.term.wildcard, budget.chargeWork);
  budget.chargeWork(5);
  return Object.freeze({namespace, processContents: raw?.processContents ?? particle.term.wildcard.processContents,
    lexical: particle.term.wildcard.namespace});
}
