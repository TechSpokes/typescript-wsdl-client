/** The accepted NT-CONT-01 evidence boundary; these kinds must never be conflated. */
import type { Result } from './adapter.js';
export type EvidenceKind = 'current-primary-observation' | 'selected-contract-assertion' | 'historical-external-observation' | 'unqualified-capability';
export interface SelectedContract {
    readonly kind: 'selected-contract-assertion';
    readonly contract: 'NT-CONT-01';
    readonly scope: string;
    readonly accepted: boolean;
}
export interface HistoricalObservation {
    readonly kind: 'historical-external-observation';
    readonly baseline: string;
    readonly engine: string;
    readonly sourceContractSha256: string;
    readonly value: unknown;
}
export interface UnqualifiedCapability {
    readonly kind: 'unqualified-capability';
    readonly scope: string;
    readonly reason: string;
}
export interface CurrentPrimary {
    readonly kind: 'current-primary-observation';
    readonly result: Result;
}
export const selected = (scope: string, accepted: boolean): SelectedContract => ({ kind: 'selected-contract-assertion', contract: 'NT-CONT-01', scope, accepted });
