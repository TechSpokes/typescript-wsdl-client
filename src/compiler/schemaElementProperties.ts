/** Abstract declaration flags; GraphNode carries the other canonical declaration properties. */
import type {NodeId} from './canonicalGraph.js';
import type {SemanticBudget} from './semanticBudget.js';
import {assertSemanticTypeReferenceShape} from './semanticTypeReference.js';
import type {SemanticTypeReference} from './semanticTypeReference.js';
import type {OriginalIdentityConstraintId} from './schemaIdentityConstraints.js';
export type RawElementProperties = Readonly<{
  element: NodeId;
  /** Explicit semantic type overrides the canonical source contribution. */
  type?: SemanticTypeReference;
  /** Original IC identities only, admitted at this ELEMENT's genuine first birth. */
  identityConstraints?: readonly OriginalIdentityConstraintId[];
  final: readonly ('restriction' | 'extension')[];
  block: readonly ('restriction' | 'extension' | 'substitution')[];
}>;
export function validateRawElementShape(value: unknown, budget: SemanticBudget): value is RawElementProperties {
  budget.chargeWork(8);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.element !== 'string' || !Array.isArray(row.final) || !Array.isArray(row.block)) return false;
  if (row.type !== undefined) assertSemanticTypeReferenceShape(row.type, budget);
  if (row.identityConstraints !== undefined) {
    if (!Array.isArray(row.identityConstraints)) return false;
    budget.chargeWork(4 + row.identityConstraints.length * 2);
    for (const identity of row.identityConstraints) {
      if (typeof identity !== 'string') return false;
      budget.chargeWork(identity.length);
    }
  }
  budget.chargeWork(row.element.length + row.final.length * 4 + row.block.length * 4);
  return row.final.every(x => x === 'restriction' || x === 'extension') && row.block.every(x => x === 'restriction' || x === 'extension' || x === 'substitution');
}
