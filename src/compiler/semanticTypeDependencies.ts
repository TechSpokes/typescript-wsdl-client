/** Charged accumulation of already-owned type dependency facts; no validity authority. */
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import {semanticTypeKey} from './schemaTypeIdentity.js';
import type {SemanticTypeDependency} from './semanticTypeReference.js';

type OwnedFacts = {
  facts: Map<string, SemanticTypeDependency>;
  /** Only this module's deeply owned results are registered, never input objects. */
  keys: WeakMap<SemanticTypeDependency, string>;
};
const ownedByContext = new WeakMap<SemanticContext, OwnedFacts>();

/** Call inside the request guard; inputs are borrowed internal receipt data. */
export function collectSemanticTypeDependencies(context: SemanticContext): Readonly<{
  add(required: readonly SemanticTypeDependency[]): void;
  snapshot(): readonly SemanticTypeDependency[];
}> {
  assertSemanticContext(context);
  const budget = context.budget;
  budget.chargeWork(7);
  let owned = ownedByContext.get(context);
  if (!owned) {
    budget.chargeWork(7);
    owned = {facts: new Map(), keys: new WeakMap()};
    ownedByContext.set(context, owned);
  }
  const facts = new Map<string, SemanticTypeDependency>();
  let published: readonly SemanticTypeDependency[] | undefined;
  return Object.freeze({
    add(required: readonly SemanticTypeDependency[]): void {
      budget.chargeWork();
      for (const dependency of required) {
        budget.chargeWork(4);
        if (!dependency || typeof dependency !== 'object') throw new TypeError('Expected a semantic type dependency');
        let key = owned.keys.get(dependency);
        if (key === undefined) {
          // No accessor execution and no lasting trust in a borrowed input's
          // identity. Its current primitive values are checked on every visit.
          budget.chargeWork(48);
          const origin = Object.getOwnPropertyDescriptor(dependency, 'contextId');
          const type = Object.getOwnPropertyDescriptor(dependency, 'type');
          if (!origin || !('value' in origin) || typeof origin.value !== 'string' || !type || !('value' in type))
            throw new TypeError('Expected own-data semantic type dependency fields');
          const identity = semanticTypeKey(context, type.value);
          budget.chargeWork(40 + origin.value.length * 2 + identity.length);
          key = `${origin.value.length}:${origin.value}:${identity}`;
        }
        budget.chargeWork(2);
        let fact = owned.facts.get(key);
        if (!fact) {
          fact = budget.freeze(budget.snapshot(dependency));
          budget.chargeWork(4);
          owned.facts.set(key, fact);
          owned.keys.set(fact, key);
        }
        if (!facts.has(key)) {
          budget.chargeWork(3);
          facts.set(key, fact);
          published = undefined;
        }
      }
    },
    snapshot(): readonly SemanticTypeDependency[] {
      budget.chargeWork(2);
      if (published) return published;
      // Every member is a private owned immutable result. Only this array is
      // newly copied/frozen; traversing those member graphs again adds no safety.
      budget.chargeWork(3 + facts.size * 3);
      published = Object.freeze([...facts.values()]);
      return published;
    },
  });
}
