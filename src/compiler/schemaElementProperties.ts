/** Abstract declaration flags; GraphNode carries the other canonical declaration properties. */
import type {NodeId} from './canonicalGraph.js';
import type {SemanticBudget} from './semanticBudget.js';
import {assertSemanticTypeReferenceShape} from './semanticTypeReference.js';
import type {SemanticTypeReference} from './semanticTypeReference.js';
export type RawElementProperties = Readonly<{
  element: NodeId;
  /** Explicit semantic type overrides the canonical source contribution. */
  type?: SemanticTypeReference;
  final: readonly ('restriction' | 'extension')[];
  block: readonly ('restriction' | 'extension' | 'substitution')[];
}>;
export function validateRawElementShape(value: unknown, budget: SemanticBudget): value is RawElementProperties {
  budget.chargeWork(8);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.element !== 'string' || !Array.isArray(row.final) || !Array.isArray(row.block)) return false;
  if (row.type !== undefined) assertSemanticTypeReferenceShape(row.type, budget);
  budget.chargeWork(row.element.length + row.final.length * 4 + row.block.length * 4);
  return row.final.every(x => x === 'restriction' || x === 'extension') && row.block.every(x => x === 'restriction' || x === 'extension' || x === 'substitution');
}
