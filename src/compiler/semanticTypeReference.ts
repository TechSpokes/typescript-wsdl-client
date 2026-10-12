/** Internal semantic references. Canonical/public/persisted Reference is unchanged. */
import type {NodeId, Reference} from './canonicalGraph.js';
import type {ExpandedName} from '../loader/orderedSyntax.js';
import type {SemanticBudget} from './semanticBudget.js';

/** Plain selector data, not an issued component or validity receipt. */
export type OriginalGeneratedScalarReference = Readonly<{kind: 'original-generated'; owner: NodeId}>;
export type SemanticTypeReference = Reference | OriginalGeneratedScalarReference;
export type SemanticTypeIdentity = Readonly<{kind: 'component'; id: NodeId} | {kind: 'builtin'; name: ExpandedName}>
  | OriginalGeneratedScalarReference;
export type SemanticTypeDependency = Readonly<{contextId: string; type: SemanticTypeIdentity}>;

/** Checks only reference shape; authenticated context resolution owns membership. */
export function assertSemanticTypeReferenceShape(value: unknown, budget: SemanticBudget): asserts value is SemanticTypeReference {
  const field = (input: unknown, key: string): unknown => {
    budget.chargeWork(44 + key.length);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Expected semantic type reference data');
    const own = Object.getOwnPropertyDescriptor(input, key);
    if (own && !('value' in own)) throw new TypeError('Semantic type references cannot contain accessors');
    return own?.value;
  };
  const id = (input: unknown): void => {budget.chargeWork(); if (typeof input !== 'string' || !input) throw new TypeError('Expected semantic type identity');};
  const kind = field(value, 'kind');
  if (kind === 'original-generated') {id(field(value, 'owner')); return;}
  if (kind === 'local') {id(field(value, 'target')); return;}
  if (kind !== 'symbol' && kind !== 'builtin') throw new TypeError('Unknown semantic type reference kind');
  const name = field(value, 'name');
  if (typeof field(name, 'namespace') !== 'string') throw new TypeError('Expected semantic type namespace');
  id(field(name, 'local'));
  if (kind === 'symbol') {
    if (field(value, 'role') !== 'type') throw new TypeError('Expected a type symbol');
    const target = field(value, 'target'); if (target !== undefined) id(target);
  }
}
