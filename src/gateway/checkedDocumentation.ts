/**
 * Relocates generator-owned shape resources into OpenAPI documentation components.
 * @since 1.4.1
 * @constraints This is not a general JSON Schema resource bundler.
 */
import {createHash} from 'node:crypto';
import type {DirectOperationSelector} from '../compiler/directOperation.js';

type Schema = Readonly<Record<string, unknown>>;
const maps = new Set(['properties', 'patternProperties', 'dependentSchemas']);
const singles = new Set(['additionalProperties', 'additionalItems', 'contains', 'not', 'if', 'then', 'else', 'propertyNames', 'unevaluatedProperties', 'unevaluatedItems']);
const arrays = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const escape = (value: string): string => encodeURIComponent(value.replace(/~/g, '~0').replace(/\//g, '~1'));

/** Lower one issued shape while its original reference scope is still available.
 * @param root Generator-owned shape, with at most one root resource and definition dictionary.
 * @param selector Outer operation selector, independent of companion projection contracts.
 * @param role Direction or declared-fault role owning the shape.
 * @param grouped Whether published configured definition names must be preserved.
 * @param components Destination dictionary shared by the operation document.
 * @param check Generation cancellation and semantic resource-accounting checkpoint.
 * @returns A new documentation schema; runtime schemas and literal annotations remain unchanged.
 * @throws TypeError For unexpected resources, references, missing descendants or component collisions.
 */
export function lowerCheckedDocumentation(root: Schema, selector: DirectOperationSelector, role: string, grouped: boolean,
  components: Record<string, Schema>, check: () => void): Schema {
  check();
  if (root.$id !== undefined && (typeof root.$id !== 'string' || !/^urn:checked-component:shape:[a-f0-9]{64}$/.test(root.$id))) {
    throw new TypeError('Unexpected checked documentation resource');
  }
  const definitions = (root.definitions ?? {}) as Record<string, Schema>;
  // @why #467 Original resource IDs encode selection, not contract equivalence or component ownership.
  const owner = createHash('sha256').update(JSON.stringify([selector.portType.namespace, selector.portType.local,
    selector.binding.namespace, selector.binding.local, selector.operation, role])).digest('hex');
  const names = new Map(Object.keys(definitions).sort().map(name => [name, grouped ? name : `Checked_${owner}_${name}`]));
  const reference = (value: unknown): string => {
    if (typeof value !== 'string' || !value.startsWith('#/definitions/')) throw new TypeError('Unexpected checked documentation reference');
    let pointer: string;
    try {pointer = decodeURIComponent(value.slice(1));} catch {throw new TypeError('Invalid checked documentation pointer');}
    const parts = pointer.slice(1).split('/').map(part => {
      if (/~(?![01])/.test(part)) throw new TypeError('Invalid checked documentation pointer');
      return part.replace(/~1/g, '/').replace(/~0/g, '~');
    });
    const name = names.get(parts[1]!);
    if (!name) throw new TypeError('Unresolved checked documentation definition');
    let target: unknown = root;
    for (const part of parts) {
      check();
      if (!target || typeof target !== 'object' || !Object.hasOwn(target, part)) throw new TypeError('Unresolved checked documentation descendant');
      target = (target as Record<string, unknown>)[part];
    }
    if (typeof target !== 'boolean' && (!target || typeof target !== 'object' || Array.isArray(target))) {
      throw new TypeError('Checked documentation reference must target a schema');
    }
    return '#/components/schemas/' + escape(name) + parts.slice(2).map(part => '/' + escape(part)).join('');
  };
  const visit = (value: unknown, isRoot = false): unknown => {
    check();
    if (typeof value === 'boolean') return value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Unexpected checked documentation schema');
    const record = value as Record<string, unknown>, result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
      check();
      if (key === '$id' && isRoot) continue;
      if (key === 'definitions' && isRoot) continue;
      if (['$id', '$anchor', '$dynamicAnchor', '$dynamicRef', '$recursiveRef', '$recursiveAnchor', '$defs', 'definitions'].includes(key)) {
        throw new TypeError('Unexpected checked documentation resource');
      }
      if (key === '$ref') result[key] = reference(item);
      else if (maps.has(key) || key === 'dependencies') {
        const dictionary: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
        for (const [name, child] of Object.entries(item as Record<string, unknown>)) {
          check();
          dictionary[name] = key === 'dependencies' && Array.isArray(child) ? child : visit(child);
        }
        result[key] = dictionary;
      } else if (arrays.has(key) || key === 'items' && Array.isArray(item)) result[key] = (item as unknown[]).map(child => visit(child));
      else if (singles.has(key) || key === 'items') result[key] = visit(item);
      // @constraints Unknown annotations are literal data, including keyword-shaped application examples.
      else result[key] = item;
    }
    return result;
  };
  const lowered = visit(root, true) as Schema;
  for (const [original, name] of names) {
    const resolved = visit(definitions[original]) as Schema;
    if (Object.hasOwn(components, name) && JSON.stringify(components[name]) !== JSON.stringify(resolved)) {
      throw new TypeError(`applicationGroups OpenAPI component collision ${name}`);
    }
    components[name] = resolved;
  }
  return lowered;
}
