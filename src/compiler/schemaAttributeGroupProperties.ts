/** Literal effective attribute-group properties, separate from XML contributions. */
import type {NodeId} from './canonicalGraph.js';
import type {SemanticBudget} from './semanticBudget.js';
import type {NamespaceConstraint, WildcardProcess} from './wildcardAlgebra.js';

export type RawAttributeGroupProperties = Readonly<{
  group: NodeId;
  /** Complete component set; repeating the same identity adds no member. */
  attributeUses: readonly NodeId[];
  wildcard?: Readonly<{namespace: NamespaceConstraint; processContents: WildcardProcess; sources: readonly NodeId[]}>;
}>;

/** Data shape only; effective mapping and semantic validity require their owners. */
export function validateRawAttributeGroupShape(value: unknown, budget: SemanticBudget): asserts value is RawAttributeGroupProperties {
  const fail = (): never => {throw new TypeError('Invalid raw attribute group properties');};
  const object = (input: unknown, fields: readonly string[]): Record<string, unknown> => {
    budget.chargeWork(3);
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail();
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return fail();
    for (const key of fields) {
      budget.chargeWork(46 + key.length);
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (descriptor && !('value' in descriptor)) return fail();
    }
    for (const key in input) {
      budget.chargeWork(46 + key.length + fields.length);
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !('value' in descriptor) || !fields.includes(key)) return fail();
    }
    return input as Record<string, unknown>;
  };
  const id = (input: unknown): void => {budget.chargeWork(); if (typeof input !== 'string' || !input) fail();};
  const list = (input: unknown, check: (item: unknown) => void): void => {
    budget.chargeWork();
    if (!Array.isArray(input)) return fail();
    for (let index = 0; index < input.length; index++) {
      budget.chargeWork(60);
      const descriptor = Object.getOwnPropertyDescriptor(input, index);
      if (!descriptor || !('value' in descriptor)) return fail();
      check(descriptor.value);
    }
  };
  const raw = object(value, ['group', 'attributeUses', 'wildcard']);
  id(raw['group']); list(raw['attributeUses'], id);
  if (raw['wildcard'] !== undefined) {
    const wildcard = object(raw['wildcard'], ['namespace', 'processContents', 'sources']);
    if (wildcard['processContents'] !== 'strict' && wildcard['processContents'] !== 'lax' && wildcard['processContents'] !== 'skip') return fail();
    const namespace = object(wildcard['namespace'], ['kind', 'namespaces']);
    if (namespace['kind'] !== 'set' && namespace['kind'] !== 'not') return fail();
    list(namespace['namespaces'], item => {budget.chargeWork(); if (typeof item !== 'string') fail();});
    list(wildcard['sources'], id);
  }
}
