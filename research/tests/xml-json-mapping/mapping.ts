/** Research-only conversions for #420's refused XML forms.
 * @since Issue #420
 * @constraints No schema validation, receipts, serializer or production exports.
 * @see ../../../docs/roadmap/v1.0-xml-json-mapping.md
 */
import {isProxy} from 'node:util/types';
import {isXmlNCName, resolveLexicalQName, XML_NAMESPACE} from '../../../src/loader/orderedSyntax.js';
import type {ExpandedName, SyntaxAttribute, SyntaxElement, SyntaxNode, SyntaxSource} from '../../../src/loader/orderedSyntax.js';

export const XSI = 'http://www.w3.org/2001/XMLSchema-instance';
type Entry = {name: ExpandedName; value: Candidate};
type Attribute = {name: ExpandedName; value: string};
export type Candidate = null | string | ExpandedName | {
  id?: string; $nil?: true; $type?: ExpandedName; $value?: string | ExpandedName;
  $attributes?: Attribute[]; $namespaces?: Record<string, string>; $content?: (string | Entry)[];
};

// @why These fixture-specific source facts are not a new compiled plan or public mode.
const knownId = (name: ExpandedName) => name.namespace === 'urn:msg' && ['p', 'x'].includes(name.local);
const qnameText = (name: ExpandedName) => name.namespace === 'urn:typed' && name.local === 'q';
const simpleContent = (name: ExpandedName) => name.namespace === 'urn:msg' && name.local === 'x';
const orderedContent = (name: ExpandedName, parent?: ExpandedName) => (name.namespace === 'urn:vendor' && name.local === 'fixedAttributes') || name.namespace === 'urn:msg'
  && (['r', 'p', 'items'].includes(name.local) || (name.local === 'b' && parent?.namespace === 'urn:msg' && parent.local === 'r'));
const key = (name: ExpandedName) => JSON.stringify([name.namespace, name.local]);
const same = (a: ExpandedName, b: ExpandedName) => key(a) === key(b);
const source: SyntaxSource = {uri: 'urn:research:fresh-json', digest: '', path: '/0',
  start: {offset: 0, line: 1, column: 1}, end: {offset: 0, line: 1, column: 1}};
const fail = (message: string): never => {throw new TypeError(message);};

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || isProxy(input) || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail('plain JSON object required');
  for (const property of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, property)!;
    if (typeof property !== 'string' || !descriptor.enumerable || !('value' in descriptor)) fail('own JSON data required');
  }
  return input as Record<string, unknown>;
}
function fields(input: unknown, allowed: readonly string[]): Record<string, unknown> {
  const value = object(input);
  if (Object.keys(value).some(property => !allowed.includes(property))) fail('unknown field');
  return value;
}
function text(input: unknown): string {
  return typeof input === 'string' ? input : fail('string required');
}
function name(input: unknown): ExpandedName {
  const value = fields(input, ['namespace', 'local']);
  const namespace = text(value.namespace), local = text(value.local);
  if (!isXmlNCName(local)) fail('NCName required');
  return {namespace, local};
}
function array(input: unknown): unknown[] {
  if (!Array.isArray(input) || isProxy(input)) return fail('JSON array required');
  if (Reflect.ownKeys(input).length !== input.length + 1) fail('dense JSON array required');
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !('value' in descriptor)) fail('array data required');
  }
  return input;
}
function namespaces(input: unknown): Record<string, string> {
  const value = object(input), result: Record<string, string> = Object.create(null);
  for (const [prefix, uri] of Object.entries(value)) {
    const binding = text(uri);
    if ((prefix !== '' && !isXmlNCName(prefix)) || prefix === 'xmlns'
      || (prefix === 'xml' && binding !== XML_NAMESPACE)
      || (prefix !== 'xml' && binding === XML_NAMESPACE)
      || binding === 'http://www.w3.org/2000/xmlns/' || (prefix !== '' && !binding)) fail('invalid namespace binding');
    Object.defineProperty(result, prefix, {value: binding, enumerable: true});
  }
  return result;
}
function attribute(attributeName: ExpandedName, value: string): SyntaxAttribute {
  return {name: attributeName, lexicalName: attributeName.local, value};
}
function syntax(elementName: ExpandedName, attributes: SyntaxAttribute[], children: SyntaxNode[], scope: Record<string, string>): SyntaxElement {
  return {kind: 'element', name: elementName, lexicalName: elementName.local, attributes, children,
    namespaces: { ...scope, xml: XML_NAMESPACE }, baseUri: source.uri, source};
}
function xmlText(value: string): SyntaxNode {return {kind: 'text', value, source};}
function bind(value: ExpandedName, scope: Record<string, string>): string {
  if (!value.namespace) {
    if (scope['']) fail('QName without namespace conflicts with retained default namespace');
    return value.local;
  }
  if (value.namespace === XML_NAMESPACE) return 'xml:' + value.local;
  const existing = Object.keys(scope).sort().find(prefix => scope[prefix] === value.namespace);
  if (existing !== undefined) return existing ? existing + ':' + value.local : value.local;
  let index = 1;
  while (Object.hasOwn(scope, 'q' + index)) index++;
  const prefix = 'q' + index;
  scope[prefix] = value.namespace;
  return prefix + ':' + value.local;
}

/** Convert observed syntax using only the fixture's declared facts.
 * @param node Parsed syntax, not proof of native acceptance.
 * @param open Retain complete per-element scope for genuinely untyped subtrees.
 * @param assessed Source assessment permits interpreting nil/type and fixture declarations.
 * @returns JSON candidate with significant text and dynamic identity.
 * @throws TypeError For conflicting forms or nil lexicals outside this probe.
 */
export function forward(node: SyntaxElement, open = false, assessed = !open): Candidate {
  if (!assessed && !open) fail('unassessed values require retained context');
  return forwardValue(node, open, assessed);
}
function forwardValue(node: SyntaxElement, open: boolean, assessed: boolean, parent?: ExpandedName): Candidate {
  const result: Exclude<Candidate, null | string | ExpandedName> = {};
  if (open) result.$namespaces = Object.fromEntries(Object.entries(node.namespaces).filter(([prefix]) => prefix !== 'xml'));
  const attrs: Attribute[] = [];
  let nil = false;
  for (const item of node.attributes) {
    if (assessed && same(item.name, {namespace: XSI, local: 'nil'})) {
      const lexical = item.value.trim();
      if (!['true', '1', 'false', '0'].includes(lexical)) fail('native duty: invalid xsi:nil lexical');
      nil = lexical === 'true' || lexical === '1';
    } else if (assessed && same(item.name, {namespace: XSI, local: 'type'})) result.$type = resolveLexicalQName(item.value, node);
    else if (assessed && knownId(node.name) && same(item.name, {namespace: '', local: 'id'})) result.id = item.value;
    else attrs.push({name: {...item.name}, value: item.value});
  }
  if (attrs.length) result.$attributes = attrs.sort((a, b) => key(a.name) < key(b.name) ? -1 : key(a.name) > key(b.name) ? 1 : 0);
  if (nil) {
    if (node.children.length) fail('native duty: nil forbids content');
    return Object.keys(result).length ? {...result, $nil: true} : null;
  }
  if (assessed && qnameText(node.name)) {
    if (node.children.some(child => child.kind !== 'text')) fail('native duty: QName scalar content');
    const value = resolveLexicalQName(node.children.map(child => child.kind === 'text' ? child.value : '').join(''), node);
    return Object.keys(result).length ? {...result, $value: value} : value;
  }
  if (assessed && !orderedContent(node.name, parent)) {
    if (node.children.some(child => child.kind !== 'text')) fail('fixture scalar forbids child elements');
    const value = node.children.map(child => child.kind === 'text' ? child.value : '').join('');
    return simpleContent(node.name) || Object.keys(result).length ? {...result, $value: value} : value;
  }
  result.$content = [];
  for (const child of node.children) {
    if (child.kind === 'element') result.$content.push({name: {...child.name}, value: forwardValue(child, open, assessed, node.name)});
    else if (child.value) {
      const last = result.$content.at(-1);
      if (typeof last === 'string') result.$content[result.$content.length - 1] = last + child.value;
      else result.$content.push(child.value);
    }
  }
  return result;
}

/** Reconstruct syntax from fresh JSON, without cached XML or native receipts.
 * @param elementName Source-derived root or enclosing entry name.
 * @param input Fresh JSON in the selected research shape.
 * @param open Requires complete namespace context on every untyped element.
 * @param assessed Source assessment permits semantic metadata instead of raw xsi attributes.
 * @returns Fresh syntax; native declaration/scalar validation remains downstream.
 * @throws TypeError For malformed, conflicting or unknown representation fields.
 */
export function inverse(elementName: ExpandedName, input: unknown, open = false, assessed = !open): SyntaxElement {
  if (!assessed && !open) fail('unassessed values require retained context');
  return inverseValue(elementName, input, open, assessed);
}
function inverseValue(elementName: ExpandedName, input: unknown, open: boolean, assessed: boolean, parent?: ExpandedName): SyntaxElement {
  const rootName = name(elementName);
  if (input === null && !open && assessed) return syntax(rootName, [attribute({namespace: XSI, local: 'nil'}, 'true')], [], {});
  if (typeof input === 'string' && !open && assessed && !qnameText(rootName) && !simpleContent(rootName)
    && !orderedContent(rootName, parent)) return syntax(rootName, [], input ? [xmlText(input)] : [], {});
  if (assessed && qnameText(rootName) && !open && input && typeof input === 'object' && Object.hasOwn(input, 'namespace')) {
    const scope = {}, lexical = bind(name(input), scope);
    return syntax(rootName, [], [xmlText(lexical)], scope);
  }
  const value = fields(input, ['$content', '$attributes', '$namespaces', ...(assessed ? ['$nil', '$type', '$value'] : []),
    ...(assessed && knownId(rootName) ? ['id'] : [])]);
  const has = (field: string) => Object.hasOwn(value, field);
  if (has('$namespaces') !== open) fail('context must match source-selected open scope');
  const scope = open ? namespaces(value.$namespaces) : {};
  const attributes: SyntaxAttribute[] = [], children: SyntaxNode[] = [];
  if (has('id')) attributes.push(attribute({namespace: '', local: 'id'}, text(value.id)));
  if (has('$attributes')) for (const inputAttribute of array(value.$attributes)) {
    const item = fields(inputAttribute, ['name', 'value']), attributeName = name(item.name);
    if ((assessed && attributeName.namespace === XSI && ['nil', 'type'].includes(attributeName.local))
      || attributeName.namespace === 'http://www.w3.org/2000/xmlns/'
      || (!attributeName.namespace && attributeName.local === 'xmlns')
      || (assessed && knownId(rootName) && same(attributeName, {namespace: '', local: 'id'}))
      || attributes.some(existing => same(existing.name, attributeName))) fail('conflicting attribute identity');
    attributes.push(attribute(attributeName, text(item.value)));
  }
  if (has('$type')) attributes.push(attribute({namespace: XSI, local: 'type'}, bind(name(value.$type), scope)));
  if (has('$nil')) {
    if (value.$nil !== true || has('$content') || has('$value')) fail('nil conflicts with content');
    attributes.push(attribute({namespace: XSI, local: 'nil'}, 'true'));
  } else if (assessed && qnameText(rootName)) {
    if (!has('$value') || has('$content')) fail('QName requires only $value');
    children.push(xmlText(bind(name(value.$value), scope)));
  } else if (assessed && !orderedContent(rootName, parent)) {
    if (!has('$value') || has('$content')) fail('fixture simple content requires $value');
    const content = text(value.$value);
    if (content) children.push(xmlText(content));
  } else {
    if (has('$value') || !has('$content')) fail('ordered content required');
    for (const item of array(value.$content)) {
      if (typeof item === 'string') {if (item) children.push(xmlText(item));}
      else {
        const entry = fields(item, ['name', 'value']);
        if (!Object.hasOwn(entry, 'value')) fail('entry value required');
        children.push(inverseValue(name(entry.name), entry.value, open, assessed, rootName));
      }
    }
  }
  return syntax(rootName, attributes, children, scope);
}
