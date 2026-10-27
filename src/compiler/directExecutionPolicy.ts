/** Application-selected resource policy; numeric maxima below are representation ceilings, not quotas. */
import {createDataOwnership, dataOwnership} from './dataOwnership.js';
import {isApplicationUnmetered} from './semanticBudget.js';
import type {SemanticBudget} from './semanticBudget.js';
const unrestrictedData = createDataOwnership(() => {});
export const DIRECT_REPRESENTATION_MAX = Number.MAX_SAFE_INTEGER;
export function directDataOwnership(budget: SemanticBudget) {
  return isApplicationUnmetered(budget) ? unrestrictedData : dataOwnership;
}
export function directLimit(budget: SemanticBudget, boundedProfile: number): number {
  return isApplicationUnmetered(budget) ? DIRECT_REPRESENTATION_MAX : boundedProfile;
}
