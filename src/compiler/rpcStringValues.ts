/** Bounded SOAP 1.1 RPC string serialization, without a second schema engine.
 * @since 1.1.9
 * @see https://www.w3.org/TR/2000/NOTE-SOAP-20000508/ Sections 5 and 7.
 */
import {isXmlNCName, resolveLexicalQName, syntaxAttribute, syntaxElements, XSD_NAMESPACE, XML_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SyntaxElement, SyntaxAttribute} from '../loader/orderedSyntax.js';
import type {RpcMessageRoot} from './directOperation.js';
import {isXmlCharacters} from './directStructurePlan.js';
import type {SemanticBudget} from './semanticBudget.js';
import {directDataOwnership} from './directExecutionPolicy.js';

const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const ENC = 'http://schemas.xmlsoap.org/soap/encoding/';
const XSI = 'http://www.w3.org/2001/XMLSchema-instance';
type Fail = (kind: 'value-invalid' | 'unsupported' | 'mismatch', rule: string, node?: SyntaxElement) => never;
type Control = {budget: SemanticBudget; check(): void; fail: Fail};

/** Build canonical inline string parameters in source declaration order.
 * @param root Source-owned typed parameters.
 * @param value Data-only application object.
 * @param control Shared invocation ownership and work budget.
 * @returns A generated RPC wrapper and preserved string values.
 * @throws Through the supplied failure callback for invalid application values.
 */
export function expandRpcStrings(root: RpcMessageRoot, value: unknown, control: Control): {payload: SyntaxElement; value: Readonly<Record<string, string>>} {
  const {budget, check, fail} = control;
  let owned: unknown;
  try {owned = directDataOwnership(budget).snapshot(value, check);} catch (error) {
    if (error instanceof TypeError) return fail('value-invalid', 'rpc-data-object-required');
    throw error;
  }
  if (!owned || typeof owned !== 'object' || Array.isArray(owned)) return fail('value-invalid', 'rpc-data-object-required');
  const object = owned as Record<string, unknown>;
  const keys = Object.keys(object), names = new Set(root.parts.map(part => {check(); return part.name;}));
  budget.chargeWork(64 + keys.length * 32 + names.size * 32);
  if (keys.length !== root.parts.length || keys.some(key => {check(); return !names.has(key);}))
    return fail('value-invalid', 'rpc-required-string-parts');
  const namespaces = {xml: XML_NAMESPACE, '': '', rpc: root.bodyNamespace, xsi: XSI, xsd: XSD_NAMESPACE, enc: ENC, soap: SOAP};
  const attribute = (namespace: string, local: string, value: string): SyntaxAttribute => ({name: {namespace, local}, lexicalName: local, value});
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  const children = root.parts.map(part => {
    check(); const text = object[part.name];
    if (typeof text !== 'string') return fail('value-invalid', 'rpc-required-string-parts');
    budget.chargeWork(64 + text.length * 8);
    if (!isXmlCharacters(text)) return fail('value-invalid', 'rpc-string-xml-characters');
    result[part.name] = text;
    return {kind: 'element' as const, name: {namespace: '', local: part.name}, lexicalName: part.name, namespaces, baseUri: root.source.uri,
      attributes: [attribute(XSI, 'type', 'xsd:string')], children: [{kind: 'text' as const, value: text, source: root.source}], source: root.source};
  });
  return {payload: {kind: 'element', name: root.wrapper, lexicalName: 'rpc:' + root.wrapper.local, namespaces,
    baseUri: root.source.uri, attributes: [attribute(SOAP, 'encodingStyle', ENC)], children, source: root.source}, value: result};
}

/** Decode only the selected inline/local-reference string profile within one retained Body.
 * @param root Source-owned typed parameters and body namespace.
 * @param payload Observed RPC wrapper or observed SOAP Body.
 * @param output Whether SOAP response local names are insignificant.
 * @param control Shared native invocation budget and explicit failure callback.
 * @returns Values keyed by the original WSDL part names.
 * @throws Through the failure callback for malformed, ambiguous or unsupported encoded values.
 */
export function readRpcStrings(root: RpcMessageRoot, payload: SyntaxElement, output: boolean, control: Control): Readonly<Record<string, string>> {
  const {budget, check, fail} = control;
  const elements = (node: SyntaxElement) => {
    check(); budget.chargeWork(32 + node.children.length * 8 + node.attributes.length * 16);
    if (node.children.some(c => c.kind === 'text' && /[^\t\r\n ]/.test(c.value))) return fail('mismatch', 'rpc-unexpected-text', node);
    return syntaxElements(node);
  };
  const encoding = (node: SyntaxElement) => {
    const declared = syntaxAttribute(node, 'encodingStyle', SOAP);
    if (declared !== undefined && declared.trim() !== ENC) return fail('unsupported', 'rpc-encoding-style', node);
  };
  const rootMarker = (node: SyntaxElement): string | undefined => {
    const marker = syntaxAttribute(node, 'root', ENC);
    if (marker !== undefined && marker !== '0' && marker !== '1') return fail('mismatch', 'rpc-root-marker', node);
    return marker;
  };
  const attrs = (node: SyntaxElement, wrapper = false) => {
    encoding(node); rootMarker(node);
    for (const attr of node.attributes) {
      check();
      if (attr.name.namespace === SOAP && attr.name.local === 'encodingStyle' || attr.name.namespace === ENC && attr.name.local === 'root'
        || attr.name.namespace === '' && attr.name.local === 'id' || !wrapper && (attr.name.namespace === '' && attr.name.local === 'href'
        || attr.name.namespace === XSI && attr.name.local === 'type')) continue;
      return fail('unsupported', 'rpc-encoded-attribute', node);
    }
  };
  const body = payload.name.namespace === SOAP && payload.name.local === 'Body' ? payload : undefined;
  if (body) {
    encoding(body);
    if (body.attributes.some(a => a.name.namespace !== SOAP || a.name.local !== 'encodingStyle')) return fail('unsupported', 'rpc-body-attribute', body);
  }
  const top = body ? elements(body) : [payload];
  const ids = new Map<string, SyntaxElement>();
  const pending = [...top];
  while (pending.length) {
    check(); const node = pending.pop()!;
    budget.chargeWork(32 + node.children.length * 8);
    const id = syntaxAttribute(node, 'id');
    if (id !== undefined) {
      if (!isXmlNCName(id) || ids.has(id)) return fail('mismatch', 'rpc-duplicate-or-invalid-id', node);
      ids.set(id, node);
    }
    pending.push(...syntaxElements(node));
  }
  const wrappers = top.filter(node => {
    check(); return node.name.namespace === root.bodyNamespace && rootMarker(node) !== '0'
      && syntaxAttribute(node, 'href') === undefined && syntaxAttribute(node, 'type', XSI) === undefined
      && (!output ? node.name.local === root.wrapper.local : true);
  });
  if (wrappers.length !== 1) return fail('mismatch', 'rpc-unambiguous-response-root', payload);
  const wrapper = wrappers[0]!;
  attrs(wrapper, true);
  const parameters = elements(wrapper);
  if (parameters.length !== root.parts.length) return fail('mismatch', 'rpc-result-accessor-count', wrapper);
  const visited = new Set<SyntaxElement>([wrapper]);
  const stringValue = (initial: SyntaxElement): string => {
    const chain = new Set<SyntaxElement>();
    let node = initial, inheritedType = true;
    // @constraints Flat local-reference chains must not consume the JavaScript call stack.
    for (;;) {
      check(); budget.chargeWork(32 + node.children.length * 8); attrs(node);
      if (chain.has(node)) return fail('unsupported', 'rpc-cyclic-reference', node);
      chain.add(node); visited.add(node);
      const explicit = syntaxAttribute(node, 'type', XSI);
      const implicit = node.name.namespace === ENC && node.name.local === 'string';
      if (node.name.namespace === ENC && !implicit) return fail('unsupported', 'rpc-string-type', node);
      if (explicit !== undefined) {
        let type;
        try {type = resolveLexicalQName(explicit, node);} catch {return fail('unsupported', 'rpc-string-type', node);}
        if (type.local !== 'string' || type.namespace !== XSD_NAMESPACE && type.namespace !== ENC) return fail('unsupported', 'rpc-string-type', node);
      } else if (!inheritedType && !implicit) return fail('unsupported', 'rpc-string-type-required', node);
      const href = syntaxAttribute(node, 'href');
      if (href !== undefined) {
        if (syntaxElements(node).length || node.children.some(c => c.kind === 'text' && /[^\t\r\n ]/.test(c.value))) return fail('mismatch', 'rpc-reference-content', node);
        if (!href.startsWith('#') || !isXmlNCName(href.slice(1))) return fail('unsupported', 'rpc-local-reference-required', node);
        const target = ids.get(href.slice(1));
        if (!target) return fail('mismatch', 'rpc-dangling-reference', node);
        node = target; inheritedType = false; continue;
      }
      if (syntaxElements(node).length) return fail('unsupported', 'rpc-string-compound-value', node);
      const value = node.children.map(c => c.kind === 'text' ? c.value : '').join('');
      budget.chargeWork(32 + value.length * 8);
      return value;
    }
  };
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  root.parts.forEach((part, index) => {
    check(); const accessor = parameters[index]!;
    if (accessor.name.namespace !== '' || !output && accessor.name.local !== part.name) return fail('mismatch', 'rpc-parameter-name-order', accessor);
    if (rootMarker(accessor) !== undefined) return fail('unsupported', 'rpc-accessor-root-marker', accessor);
    result[part.name] = stringValue(accessor);
  });
  for (const independent of top) {
    check();
    if (independent === wrapper) continue;
    if (!visited.has(independent) || rootMarker(independent) === '1') return fail('mismatch', 'rpc-unexpected-body-content', independent);
  }
  return result;
}
