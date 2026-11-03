/** Source-specific keyed representation experiment for #420.
 * @since Issue #420 final mapping
 * @constraints Research only: existing fixture facts and syntax inverse, no native admission or production emission.
 */
import type {ExpandedName, SyntaxElement} from '../../../src/loader/orderedSyntax.js';
import {isXmlNCName, XML_NAMESPACE} from '../../../src/loader/orderedSyntax.js';
import {isProxy} from 'node:util/types';
import {forward, inverse} from './mapping.js';

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Object required');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) throw new TypeError('JSON data properties required');
  }
  return value as JsonObject;
};
const string = (value: unknown): string => {if (typeof value !== 'string') throw new TypeError('String required'); return value;};
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value) || isProxy(value) || Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError('Dense JSON array required');
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor)) throw new TypeError('Array data required');
    result.push(descriptor.value);
  }
  return result;
};
const own = (target: JsonObject, key: string, value: unknown) => Object.defineProperty(target, key, {value, enumerable: true});
const one = (value: unknown): [string, unknown] => {
  const row = object(value), keys = Object.keys(row);
  if (keys.length !== 1 || !isXmlNCName(keys[0]!)) throw new TypeError('Exactly one XML name key required');
  return [keys[0]!, row[keys[0]!]];
};
const delta = (scope: JsonObject, inherited: JsonObject): JsonObject => Object.fromEntries(Object.entries(scope)
  .filter(([prefix, uri]) => prefix !== 'xml' && uri !== (inherited[prefix] ?? (prefix === '' ? '' : undefined))));
// @constraints Source facts for keyed-attributes.xsd, not a global QName-based projection engine.
const fixedAttributes = (name: ExpandedName) => name.namespace === 'urn:vendor' && name.local === 'fixedAttributes';

function keyed(candidate: unknown, name: ExpandedName, inherited: JsonObject, unassessed: boolean, boundary = false): unknown {
  if (candidate === null) return {$nil: true};
  if (typeof candidate !== 'object') return candidate;
  const input = object(candidate), result: JsonObject = {};
  // @constraints Existing scalar QName objects are scalar encodings, not element holders.
  if (Object.hasOwn(input, 'namespace')) return candidate;
  const scope = Object.hasOwn(input, '$namespaces') ? object(input.$namespaces) : inherited;
  for (const [key, value] of Object.entries(input)) {
    if (key === '$namespaces') {
      const changes = delta(scope, inherited);
      if (Object.keys(changes).length || unassessed && boundary) own(result, key, changes);
    } else if (key === '$type') {
      const identity = object(value); own(result, key, {$name: identity.local, $namespace: identity.namespace});
    } else if (key === '$attributes') {
      own(result, key, list(value).map(entry => {
        const attribute = object(entry), identity = object(attribute.name), item: JsonObject = {};
        if (!unassessed && fixedAttributes(name)) {
          if (identity.local !== 'code' || identity.namespace !== 'urn:vendor') throw new TypeError('Undeclared fixture attribute');
          own(item, 'code', attribute.value); return item;
        }
        own(item, string(identity.local), identity.namespace === '' ? attribute.value : {$namespace: identity.namespace, $value: attribute.value});
        return item;
      }));
    } else if (key === '$content') {
      if (!unassessed && fixedAttributes(name)) {
        const children = list(value);
        if (children.length !== 1) throw new TypeError('Fixed fixture child required');
        const child = object(children[0]), identity = object(child.name);
        if (identity.local !== 'code' || identity.namespace !== 'urn:vendor') throw new TypeError('Fixed fixture child identity');
        own(result, 'code', string(child.value)); continue;
      }
      own(result, key, list(value).map(entry => {
        if (typeof entry === 'string') return {$value: entry};
        const child = object(entry), identity = object(child.name);
        const childName = {namespace: string(identity.namespace), local: string(identity.local)};
        const converted = keyed(child.value, childName, scope, unassessed);
        let body = converted;
        if (unassessed || childName.namespace !== name.namespace) {
          const holder = converted !== null && typeof converted === 'object' && !Array.isArray(converted)
            && !Object.hasOwn(converted, 'namespace') ? object(converted) : {$value: converted};
          body = {$namespace: childName.namespace, ...holder};
        }
        const item: JsonObject = {}; own(item, childName.local, body); return item;
      }));
    } else own(result, key, value);
  }
  return result;
}

function candidate(value: unknown, name: ExpandedName, inherited: JsonObject, unassessed: boolean, root: boolean): unknown {
  if (value === null) throw new TypeError('Null is not nil');
  if (typeof value !== 'object') return value;
  const input = object(value), result: JsonObject = {};
  if (Object.hasOwn(input, 'namespace')) return value;
  if (Object.hasOwn(input, '$namespace') && string(input.$namespace) !== name.namespace) throw new TypeError('Conflicting namespace');
  const changes = Object.hasOwn(input, '$namespaces') ? object(input.$namespaces) : {};
  const scope = {...inherited, ...changes};
  if (unassessed) {
    if (root && !Object.hasOwn(input, '$namespaces')) throw new TypeError('Boundary namespace snapshot required');
    own(result, '$namespaces', scope);
  } else if (Object.hasOwn(input, '$namespaces')) throw new TypeError('Unexpected fixture context');
  for (const [key, item] of Object.entries(input)) {
    if (key === '$namespace' || key === '$namespaces') continue;
    if (key === '$type') {
      const type = object(item);
      if (Object.keys(type).length !== 2 || !Object.hasOwn(type, '$name') || !Object.hasOwn(type, '$namespace')) throw new TypeError('Type identity required');
      own(result, key, {namespace: string(type.$namespace), local: string(type.$name)});
    } else if (key === '$attributes') {
      own(result, key, list(item).map(entry => {
        const [local, raw] = one(entry);
        if (!unassessed && fixedAttributes(name)) {
          if (local !== 'code' || typeof raw !== 'string') throw new TypeError('Fixed attribute identity is source-derived');
          return {name: {namespace: 'urn:vendor', local}, value: raw};
        }
        if (typeof raw === 'string') return {name: {namespace: '', local}, value: raw};
        const holder = object(raw);
        if (Object.keys(holder).length !== 2 || !Object.hasOwn(holder, '$namespace') || !Object.hasOwn(holder, '$value')) throw new TypeError('Attribute holder required');
        const namespace = string(holder.$namespace);
        if (!namespace) throw new TypeError('Unqualified attributes use their value directly');
        return {name: {namespace, local}, value: string(holder.$value)};
      }));
    } else if (key === 'code' && !unassessed && fixedAttributes(name)) {
      own(result, '$content', [{name: {namespace: 'urn:vendor', local: 'code'}, value: string(item)}]);
    } else if (key === '$content') {
      if (!unassessed && fixedAttributes(name)) throw new TypeError('Fixed fixture uses its compact child slot');
      own(result, key, list(item).map(entry => {
        const row = object(entry);
        if (Object.hasOwn(row, '$value')) {
          if (Object.keys(row).length !== 1) throw new TypeError('Text entry has siblings');
          return string(row.$value);
        }
        const [local, body] = one(row);
        const holder = body !== null && typeof body === 'object' && !Array.isArray(body) ? object(body) : undefined;
        if (unassessed && !holder?.$namespace && holder?.$namespace !== '') throw new TypeError('Open identity required');
        const childName = {namespace: holder && Object.hasOwn(holder, '$namespace') ? string(holder.$namespace) : name.namespace, local};
        let converted = candidate(body, childName, scope, unassessed, false);
        // @constraints This fixture's foreign-namespace scalar is otherwise a plain string in the historical inverse.
        if (!unassessed && holder && Object.hasOwn(holder, '$namespace') && Object.keys(object(converted)).length === 1
          && Object.hasOwn(object(converted), '$value') && !['x', 'q'].includes(local)) converted = object(converted).$value;
        return {name: childName, value: converted};
      }));
    } else own(result, key, item);
  }
  return result;
}

function realizable(node: SyntaxElement): void {
  const scope: Record<string, string> = {...node.namespaces, xml: XML_NAMESPACE};
  if (!node.name.namespace && scope['']) throw new TypeError('No-namespace element conflicts with retained default');
  if (node.name.namespace && !Object.values(scope).includes(node.name.namespace)) throw new TypeError('Element namespace absent from retained scope');
  for (const attribute of node.attributes) if (attribute.name.namespace && !Object.entries(scope)
    .some(([prefix, uri]) => prefix && uri === attribute.name.namespace)) throw new TypeError('Attribute requires nonempty namespace prefix');
  for (const child of node.children) if (child.kind === 'element') realizable(child);
}

/** Project the existing research fixture's syntax using keyed entries.
 * @param node Ordered XML syntax; not a native acceptance receipt.
 * @param unassessed Use the existing research fixture's unassessed scope facts.
 * @returns Keyed JSON research value.
 */
export function projectKeyed(node: SyntaxElement, unassessed = false): unknown {
  return keyed(forward(node, unassessed), node.name, {}, unassessed, true);
}
/** Reconstruct fresh syntax through the existing research inverse.
 * @param name Source-selected root identity.
 * @param input Fresh JSON in the selected keyed grammar.
 * @param unassessed Existing fixture's assessment outcome, not a caller-facing policy.
 * @returns Reconstructed ordered syntax, without native admission.
 * @throws TypeError For malformed representation or unrealizable retained scope.
 */
export function reconstructKeyed(name: ExpandedName, input: unknown, unassessed = false): SyntaxElement {
  const value = inverse(name, candidate(input, name, {}, unassessed, true), unassessed);
  if (unassessed) realizable(value);
  return value;
}
