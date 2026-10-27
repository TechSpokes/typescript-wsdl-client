/** Shared data ownership; the callback supplies cancellation or semantic accounting. */
import {types} from 'node:util';
export class DataOwnershipLimitError extends RangeError {}
export interface DataOwnershipLimits {readonly maxEntries: number; readonly maxText: number; readonly maxDepth: number}
export const DIRECT_METADATA_LIMITS = Object.freeze({maxEntries: 100_000, maxText: 1024 * 1024, maxDepth: 256});
export function createDataOwnership(chargeWork: (amount?: number) => void, limits?: DataOwnershipLimits) {
  function arrayIndex(index: number): string {
    // Array positions are bounded by JavaScript's array length, so this is a
    // constant-size numeric decision, followed by a precharged text conversion.
    const digits = index < 10 ? 1 : index < 100 ? 2 : index < 1_000 ? 3 :
      index < 10_000 ? 4 : index < 100_000 ? 5 : index < 1_000_000 ? 6 :
      index < 10_000_000 ? 7 : index < 100_000_000 ? 8 : index < 1_000_000_000 ? 9 : 10;
    chargeWork(1 + digits);
    return String(index);
  }

  function snapshot<T>(value: T, check?: () => void): T {
    // Explicit stacks preserve sharing without recursive call-stack expansion.
    chargeWork(3); // Identity map and source/target stacks.
    const copied = new Map<object, object>();
    const sources: object[] = [];
    const targets: object[] = [];
    const depths: number[] = [];
    let entries = 0, text = 0;
    const countText = (length: number) => {
      if (limits && length > limits.maxText - text) throw new DataOwnershipLimitError('metadata text limit');
      text += length;
    };

    function copy(current: unknown, depth = 0): unknown {
      check?.();
      if (limits && (++entries > limits.maxEntries || depth > limits.maxDepth)) throw new DataOwnershipLimitError('metadata entry/depth limit');
      chargeWork(); // Value access.
      if (typeof current === 'string') {
        countText(current.length);
        chargeWork(current.length); // Produced/inspected immutable text.
        return current;
      }
      if (current === null || typeof current !== 'object') return current;
      if (types.isProxy(current)) throw new TypeError('Metadata requires data records and arrays');
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
      depths.push(depth);
      return result;
    }

    const result = copy(value) as T;
    while (sources.length > 0) {
      chargeWork(2); // Both stack pops.
      const source = sources.pop()!;
      const target = targets.pop()!;
      const depth = depths.pop()!;
      chargeWork(); // Array classification for the traversal.
      if (Array.isArray(source)) {
        chargeWork(); // Length read.
        const length = source.length;
        if (limits && length > limits.maxEntries - entries) throw new DataOwnershipLimitError('metadata entry limit');
        for (let index = 0; index < length; index += 1) {
          // Introspection plus its descriptor (record/four fields/35 key units),
          // followed by the input value read and output entry.
          chargeWork(43);
          const descriptor = Object.getOwnPropertyDescriptor(source, arrayIndex(index));
          if (descriptor === undefined || !('value' in descriptor)) {
            throw new TypeError('RE01 arrays require present data entries');
          }
          (target as unknown[])[index] = copy(descriptor.value, depth + 1);
        }
      } else {
        for (const key in source) {
          chargeWork(); // Own-field introspection.
          if (!Object.hasOwn(source, key)) continue;
          countText(key.length);
          // The property descriptor is an allocated record with four fields
          // and 35 field-name units, as well as the inspected/copied field.
          chargeWork(83 + key.length);
          const descriptor = Object.getOwnPropertyDescriptor(source, key);
          if (descriptor === undefined || !('value' in descriptor)) {
            throw new TypeError('RE01 records require data fields');
          }
          Object.defineProperty(target, key, {
            value: copy(descriptor.value, depth + 1),
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

  return {snapshot, freeze};
}

/** Routine data copies do not pretend to reserve CPU or heap. Owners enforce their input caps. */
export const dataOwnership = Object.freeze(createDataOwnership(() => {}, DIRECT_METADATA_LIMITS));
