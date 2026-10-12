/** Explicit internal declared type; the canonical source record remains evidence. */
import type {NodeId} from './canonicalGraph.js';
import type {SemanticBudget} from './semanticBudget.js';
import {assertSemanticTypeReferenceShape} from './semanticTypeReference.js';
import type {SemanticTypeReference} from './semanticTypeReference.js';

export type RawAttributeProperties = Readonly<{attribute: NodeId; type: SemanticTypeReference}>;
export function validateRawAttributeShape(value: unknown, budget: SemanticBudget): value is RawAttributeProperties {
  budget.chargeWork(110);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const attribute = Object.getOwnPropertyDescriptor(value, 'attribute'), type = Object.getOwnPropertyDescriptor(value, 'type');
  if (!attribute || !('value' in attribute) || typeof attribute.value !== 'string' || !type || !('value' in type)) return false;
  assertSemanticTypeReferenceShape(type.value, budget);
  return true;
}
