/** Application-selected resource policy; numeric maxima below are representation ceilings, not quotas. */
import {createDataOwnership, dataOwnership} from './dataOwnership.js';
import {isApplicationUnmetered} from './semanticBudget.js';
import type {SemanticBudget} from './semanticBudget.js';
import {DEFAULT_LOADING_LIMITS} from '../loader/schemaResources.js';
import type {LoadingLimits} from '../loader/schemaResources.js';
const unrestrictedData = createDataOwnership(() => {});
export const DIRECT_REPRESENTATION_MAX = Number.MAX_SAFE_INTEGER;
export function directDataOwnership(budget: SemanticBudget) {
  return isApplicationUnmetered(budget) ? unrestrictedData : dataOwnership;
}
export function directLimit(budget: SemanticBudget, boundedProfile: number): number {
  return isApplicationUnmetered(budget) ? DIRECT_REPRESENTATION_MAX : boundedProfile;
}
export function directLoadingLimits(budget: SemanticBudget, overrides?: Partial<LoadingLimits>): Partial<LoadingLimits> {
  if (!isApplicationUnmetered(budget)) return overrides ?? {};
  return {...Object.fromEntries(Object.keys(DEFAULT_LOADING_LIMITS).map(key =>
    [key, key === 'resourceMs' || key === 'totalIoMs' ? 0 : DIRECT_REPRESENTATION_MAX])), ...overrides};
}
