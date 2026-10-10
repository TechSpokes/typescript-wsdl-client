/** Shared, request-local charging for the RE01 research resolver; no semantic policy. */
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
export const DEFAULT_MAX_WORK = 1_000_000;

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

  function arrayIndex(index: number): string {
    // Array positions are bounded by JavaScript's array length, so this is a
    // constant-size numeric decision, followed by a precharged text conversion.
    const digits = index < 10 ? 1 : index < 100 ? 2 : index < 1_000 ? 3 :
      index < 10_000 ? 4 : index < 100_000 ? 5 : index < 1_000_000 ? 6 :
      index < 10_000_000 ? 7 : index < 100_000_000 ? 8 : index < 1_000_000_000 ? 9 : 10;
    chargeWork(1 + digits);
    return String(index);
  }

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

  function snapshot<T>(value: T): T {
    // Explicit stacks preserve sharing without recursive call-stack expansion.
    chargeWork(3); // Identity map and source/target stacks.
    const copied = new Map<object, object>();
    const sources: object[] = [];
    const targets: object[] = [];

    function copy(current: unknown): unknown {
      chargeWork(); // Value access.
      if (typeof current === 'string') {
        chargeWork(current.length); // Produced/inspected immutable text.
        return current;
      }
      if (current === null || typeof current !== 'object') return current;
      chargeWork(); // Identity-map read.
      const prior = copied.get(current);
      if (prior !== undefined) return prior;
      chargeWork(); // Array classification.
      const array = Array.isArray(current);
      if (!array) chargeWork(); // Prototype introspection.
      const prototype: unknown = array ? undefined : Object.getPrototypeOf(current);
      if (!array && prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('RE01 snapshots require data records and arrays');
      }
      chargeWork(4); // Container, map insertion and two stack pushes.
      const result: object = array ? [] : {};
      copied.set(current, result);
      sources.push(current);
      targets.push(result);
      return result;
    }

    const result = copy(value) as T;
    while (sources.length > 0) {
      chargeWork(2); // Both stack pops.
      const source = sources.pop()!;
      const target = targets.pop()!;
      chargeWork(); // Array classification for the traversal.
      if (Array.isArray(source)) {
        chargeWork(); // Length read.
        const length = source.length;
        for (let index = 0; index < length; index += 1) {
          // Introspection plus its descriptor (record/four fields/35 key units),
          // followed by the input value read and output entry.
          chargeWork(43);
          const descriptor = Object.getOwnPropertyDescriptor(source, arrayIndex(index));
          if (descriptor === undefined || !('value' in descriptor)) {
            throw new TypeError('RE01 arrays require present data entries');
          }
          (target as unknown[])[index] = copy(descriptor.value);
        }
      } else {
        for (const key in source) {
          chargeWork(); // Own-field introspection.
          if (!Object.hasOwn(source, key)) continue;
          // The property descriptor is an allocated record with four fields
          // and 35 field-name units, as well as the inspected/copied field.
          chargeWork(83 + key.length);
          const descriptor = Object.getOwnPropertyDescriptor(source, key);
          if (descriptor === undefined || !('value' in descriptor)) {
            throw new TypeError('RE01 records require data fields');
          }
          Object.defineProperty(target, key, {
            value: copy(descriptor.value),
            enumerable: true, configurable: true, writable: true,
          });
        }
      }
    }
    return result;
  }

  function freeze<T>(value: T): Readonly<T> {
    chargeWork(2); // Visited set and traversal stack.
    const seen = new Set<object>();
    const stack: unknown[] = [];
    chargeWork();
    stack.push(value);
    while (stack.length > 0) {
      chargeWork(); // Pop.
      const current = stack.pop();
      if (current === null || typeof current !== 'object') continue;
      chargeWork(); // Set read.
      if (seen.has(current)) continue;
      chargeWork(2); // Visit-state insertion and freeze traversal.
      seen.add(current);
      chargeWork(); // Array classification.
      if (Array.isArray(current)) {
        chargeWork(); // Length read.
        const length = current.length;
        for (let index = 0; index < length; index += 1) {
          chargeWork(43); // Descriptor inspection/allocation, value read and push.
          const descriptor = Object.getOwnPropertyDescriptor(current, arrayIndex(index));
          if (descriptor === undefined || !('value' in descriptor)) {
            throw new TypeError('RE01 arrays require present data entries');
          }
          stack.push(descriptor.value);
        }
      } else {
        for (const key in current) {
          chargeWork(); // Own-field introspection.
          if (!Object.hasOwn(current, key)) continue;
          chargeWork(43 + key.length); // Descriptor, field access, name inspection and push.
          const descriptor = Object.getOwnPropertyDescriptor(current, key);
          if (descriptor === undefined || !('value' in descriptor)) {
            throw new TypeError('RE01 records require data fields');
          }
          stack.push(descriptor.value);
        }
      }
      Object.freeze(current);
    }
    return value;
  }

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
