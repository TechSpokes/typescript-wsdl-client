/** Shared request-local semantic accounting; historical resolver names remain compatible. */
import {createDataOwnership} from './dataOwnership.js';
export interface ResolverLimits {
  readonly maxNodes?: number;
  readonly maxWork?: number;
}

export interface ResolverUsage {
  readonly nodes: number;
  readonly work: number;
}

export interface ResourceLimitFailure {
  readonly kind: 'resource-limit';
  readonly limit: 'nodes' | 'work';
  readonly usage: ResolverUsage;
}

export interface ResolverBudget {
  chargeWork(amount?: number): void;
  reserveNodes(amount: number): void;
  usage(): ResolverUsage;
  exhausted(): boolean;
  failure(): ResourceLimitFailure | undefined;
  guard<T>(operation: () => T): T | ResourceLimitFailure;
  compareText(left: string, right: string): number;
  sorted<T>(values: readonly T[], compare: (left: T, right: T) => number): T[];
  snapshot<T>(value: T): T;
  freeze<T>(value: T): Readonly<T>;
}

export const DEFAULT_MAX_NODES = 100_000;
// Scalar containment calibration includes a 79-million-work complete URI /
// IEEE-list query. The 125-million default allows substantial workload
// variation; earlier 25-million and one-million regression profiles remain.
// See the resolver implementation's scalar capacity evidence. These remain
// revisable engineering limits, not semantic or mathematical proof bounds.
export const DEFAULT_MAX_WORK = 125_000_000;

/**
 * The terminal result is reserved once, including its borrowed counter view.
 * Construction: 2 records + 5 fields + 23 field-name units + 14 kind units +
 * 5 limit units = 49. Freezing: 2 records + 5 fields + 23 field-name units = 30.
 * Fixed budget bookkeeping and the private abort signal do not contain input
 * data and are the constant escape machinery, rather than graph work.
 */
export const TERMINAL_RESERVATION_WORK = 79;

export class ResolverInvalidLimitsError extends RangeError {
  constructor() {
    super('RE01 limits must be positive safe integers');
    this.name = 'ResolverInvalidLimitsError';
  }
}

function validLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

const NO_LIMITS: ResolverLimits = Object.freeze({});

/** Fixed limit metadata belongs to the bounded request-start machinery. */
function limit(limits: ResolverLimits, key: 'maxNodes' | 'maxWork', fallback: number): number {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) throw new ResolverInvalidLimitsError();
  const descriptor = Object.getOwnPropertyDescriptor(limits, key);
  if (descriptor === undefined) return fallback;
  if (!('value' in descriptor)) throw new ResolverInvalidLimitsError();
  const value: unknown = descriptor.value;
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !validLimit(value)) throw new ResolverInvalidLimitsError();
  return value;
}

export function createResolverBudget(limits: ResolverLimits = NO_LIMITS): ResolverBudget {
  const maxNodes = limit(limits, 'maxNodes', DEFAULT_MAX_NODES);
  const maxWork = limit(limits, 'maxWork', DEFAULT_MAX_WORK);
  if (!validLimit(maxNodes) || !validLimit(maxWork)) throw new ResolverInvalidLimitsError();

  let nodes = 0;
  let work = 0;
  let failed: 'nodes' | 'work' | undefined;
  // These fixed-size objects are the request's reserved terminal machinery.
  const usage: ResolverUsage = Object.freeze({ get nodes() { return nodes; }, get work() { return work; } });
  const failure: ResourceLimitFailure = Object.freeze({
    kind: 'resource-limit',
    get limit() { return failed ?? 'work'; },
    usage,
  });
  const abort = Object.freeze({});

  function charge(amount: number, limit: 'nodes' | 'work'): void {
    if (failed !== undefined) throw abort;
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new RangeError('RE01 charges must be nonnegative safe integers');
    }
    const used = limit === 'nodes' ? nodes : work;
    const maximum = limit === 'nodes' ? maxNodes : maxWork;
    // Subtraction is checked before adding: no overflow and inclusive limits.
    if (amount > maximum - used) {
      failed = limit;
      throw abort;
    }
    if (limit === 'nodes') nodes += amount;
    else work += amount;
  }

  function chargeWork(amount = 1): void { charge(amount, 'work'); }

  function compareText(left: string, right: string): number {
    chargeWork(2); // Constant-time length reads.
    const leftLength = left.length;
    const rightLength = right.length;
    const length = Math.min(leftLength, rightLength);
    for (let index = 0; index < length; index += 1) {
      chargeWork(2); // Both inspected UTF-16 units, before inspection.
      const a = left.charCodeAt(index);
      const b = right.charCodeAt(index);
      if (a !== b) return a < b ? -1 : 1;
    }
    return leftLength < rightLength ? -1 : leftLength > rightLength ? 1 : 0;
  }

  function sorted<T>(values: readonly T[], compare: (left: T, right: T) => number): T[] {
    chargeWork(); // Input length read.
    const length = values.length;
    chargeWork(2); // The two containers, before allocation.
    let source: T[] = [];
    let target: T[] = [];
    for (let index = 0; index < length; index += 1) {
      chargeWork(2); // Input read and copied output entry.
      source[index] = values[index]!;
    }
    // A specified merge order avoids engine/version-dependent comparator counts.
    for (let width = 1; width < length; width *= 2) {
      for (let start = 0; start < length; start += width * 2) {
        const middle = Math.min(start + width, length);
        const end = Math.min(middle + width, length);
        let left = start;
        let right = middle;
        for (let output = start; output < end; output += 1) {
          let takeLeft = right >= end;
          if (left < middle && right < end) {
            chargeWork(3); // Two reads and one comparator visit.
            takeLeft = compare(source[left]!, source[right]!) <= 0;
          }
          if (left >= middle) takeLeft = false;
          chargeWork(2); // Chosen input read and output write.
          target[output] = takeLeft ? source[left++]! : source[right++]!;
        }
      }
      const previous = source;
      source = target;
      target = previous;
    }
    return source;
  }

  const {snapshot, freeze} = createDataOwnership(chargeWork);

  // Budgets smaller than the reservation fail without performing graph work;
  // their one constant terminal envelope remains the reserved escape path.
  if (maxWork < TERMINAL_RESERVATION_WORK) failed = 'work';
  else work = TERMINAL_RESERVATION_WORK;

  return {
    chargeWork,
    reserveNodes: (amount) => charge(amount, 'nodes'),
    usage: () => usage,
    exhausted: () => failed !== undefined,
    failure: () => failed === undefined ? undefined : failure,
    guard<T>(operation: () => T): T | ResourceLimitFailure {
      if (failed !== undefined) return failure;
      try { return operation(); }
      catch (error: unknown) {
        if (error === abort) return failure;
        throw error;
      }
    },
    compareText,
    sorted,
    snapshot,
    freeze,
  };
}

/** Shared production owner; historical research names remain source-compatible. */
export type SemanticBudget = ResolverBudget;
export type SemanticBudgetLimits = ResolverLimits;
export const createSemanticBudget = createResolverBudget;

/** Observe sticky failure without charging routine procedural work. */
export function checkSemanticBudget(budget: SemanticBudget): void {budget.chargeWork(0);}

const unmetered = new WeakSet<object>();
/** Application execution has no work quota unless the caller explicitly supplies one. */
export function createApplicationBudget(limits?: SemanticBudgetLimits): SemanticBudget {
  if (limits !== undefined) return createSemanticBudget(limits);
  const ownership = createDataOwnership(() => {});
  const budget: SemanticBudget = {
    chargeWork() {}, reserveNodes() {}, usage: () => ({nodes: 0, work: 0}),
    exhausted: () => false, failure: () => undefined, guard: operation => operation(),
    compareText: (a, b) => a < b ? -1 : a > b ? 1 : 0,
    sorted: (values, compare) => Array.from(values).sort(compare), ...ownership,
  };
  unmetered.add(budget);
  return budget;
}
/** Internal identity marker, never source/transport authorization. */
export function isApplicationUnmetered(budget: SemanticBudget): boolean {return unmetered.has(budget);}
