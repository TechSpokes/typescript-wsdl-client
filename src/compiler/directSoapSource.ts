import {directLimit} from './directExecutionPolicy.js';
/** Shared authenticated single-resource SOAP bootstrap policy; no transport. */
import {inspectDirectOperation} from './directOperation.js';
import type {DirectOperationContract} from './directOperation.js';
import {copyOriginalSchemaResource} from '../loader/schemaInput.js';
import {decodeMetadataXml, resolveLexicalQName, syntaxAttribute, WSDL_NAMESPACE, XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';
import type {SchemaInput} from '../loader/schemaInput.js';
import {WSDL} from 'soap/lib/wsdl/index.js';
import {normalizeWhitespace} from './datatypeValues.js';
const WSDL_SOAP = 'http://schemas.xmlsoap.org/wsdl/soap/';
const same = (a: ExpandedName, b: ExpandedName) => a.namespace === b.namespace && a.local === b.local;
export const DIRECT_SOAP_SOURCE_MAX_BYTES = 64 * 1024;
export class DirectSoapSourceError extends Error {
  constructor(message: string, readonly kind: 'unsupported' | 'resource-limit' = 'unsupported') {super(message);}
}
function validateSoapSelection(source: SchemaInput, contract: DirectOperationContract,
  config: {service: ExpandedName; port: string}, check: () => void): void {
  const elements = (node: SyntaxElement) => {check(); return node.children.filter((child): child is SyntaxElement => child.kind === 'element');};
  const definitions = source.root.root;
  if (definitions.name.namespace !== WSDL_NAMESPACE || definitions.name.local !== 'definitions') throw new DirectSoapSourceError('WSDL definitions required');
  const services = elements(definitions).filter(n => n.name.namespace === WSDL_NAMESPACE && n.name.local === 'service'
    && same({namespace: syntaxAttribute(definitions, 'targetNamespace') ?? '', local: syntaxAttribute(n, 'name') ?? ''}, config.service));
  if (services.length !== 1) throw new DirectSoapSourceError('SOAP service mismatch');
  const ports = elements(services[0]!).filter(n => n.name.namespace === WSDL_NAMESPACE && n.name.local === 'port' && syntaxAttribute(n, 'name') === config.port);
  if (ports.length !== 1) throw new DirectSoapSourceError('SOAP port mismatch');
  const binding = syntaxAttribute(ports[0]!, 'binding');
  if (!binding || !same(resolveLexicalQName(binding, ports[0]!), contract.selector.binding)) throw new DirectSoapSourceError('SOAP binding mismatch');
  const addresses = elements(ports[0]!).filter(n => n.name.namespace === WSDL_SOAP && n.name.local === 'address');
  if (addresses.length !== 1 || elements(ports[0]!).some(n => !(n.name.namespace === WSDL_SOAP && n.name.local === 'address')
    && !(n.name.namespace === WSDL_NAMESPACE && n.name.local === 'documentation'))) throw new DirectSoapSourceError('SOAP port extension');
}
export function prepareDirectSoapSource(contract: DirectOperationContract, config: {service: ExpandedName; port: string}, check: () => void) {
  const {source, context: {budget}} = inspectDirectOperation(contract);
  if (source.resources.some(r => r.byteLength > directLimit(budget, DIRECT_SOAP_SOURCE_MAX_BYTES))) {
    throw new DirectSoapSourceError('SOAP source byte limit', 'resource-limit');
  }
  const refuse = (rule: string): never => {throw new DirectSoapSourceError(rule);};

  if (/[^\x20-\x21\x23-\x7e]|\\/.test(contract.binding.action)) refuse('unsafe SOAPAction');
  if (source.resources.length !== 1 || source.edges.length || source.documents.length !== 1) throw new DirectSoapSourceError('single original WSDL resource required');
  const elements = (node: SyntaxElement): SyntaxElement[] => {
    check();
    return node.children.filter((child): child is SyntaxElement => child.kind === 'element');
  };
  // node-soap uses local-name dispatch and ordinary object maps internally.
  // Refuse fetch triggers even in foreign/otherwise ignored source syntax.
  const inspectSource = (node: SyntaxElement) => {
    check();
    if (['import', 'include', 'redefine'].includes(node.name.local)) refuse('dependency bootstrap imports');
    const grammar: Record<string, readonly string[]> = {
      [WSDL_NAMESPACE]: ['definitions', 'types', 'message', 'part', 'portType', 'operation', 'input', 'output', 'fault', 'binding', 'service', 'port', 'documentation'],
      [WSDL_SOAP]: ['binding', 'operation', 'body', 'fault', 'address'],
      ['http://schemas.xmlsoap.org/wsdl/soap12/']: ['binding', 'operation', 'body', 'fault', 'address'],
      [XSD_NAMESPACE]: ['schema', 'complexType', 'sequence', 'element'],
    };
    if (!Object.hasOwn(grammar, node.name.namespace) || !grammar[node.name.namespace]!.includes(node.name.local)) refuse('WSDL bootstrap extension');
    for (const a of node.attributes) {

      if (a.name.local === 'name' && (a.value in Object.prototype || a.value === 'prototype')) refuse('dependency reserved name');
    }
    for (const prefix in node.namespaces) {

      if (['__proto__', 'prototype', 'constructor'].includes(prefix) || /["<&\r\n\t]/.test(node.namespaces[prefix]!)) refuse('dependency namespace interpolation');
    }
    for (const child of elements(node)) inspectSource(child);
  };
  inspectSource(source.root.root);
  validateSoapSelection(source, contract, config, check);

  const original = copyOriginalSchemaResource(source, source.root.uri, () => {check(); });
  // This packet admits UTF-8 source bootstrap only; response encoding remains
  // owned by the existing strict XML byte decoder.

  let wsdlText: string;
  try {wsdlText = new TextDecoder('utf-8', {fatal: true}).decode(original);} catch {throw new DirectSoapSourceError('UTF-8 WSDL bootstrap required');}
  if (/^<\?xml\s[^?]*encoding\s*=\s*["'](?!utf-?8["'])/i.test(wsdlText)) throw new DirectSoapSourceError('UTF-8 WSDL bootstrap required');

  return {original, wsdlText};
}

/** Check each native operation before sharing its source metadata.
 * @param contract Authentic component operation.
 * @param config Exact service and port.
 * @param check Invocation cancellation/resource checks.
 * @returns No metadata or portable authority.
 * @throws For foreign handles, unsupported source profile, action or selection.
 */
export function validateComponentSoapSelection(contract: DirectOperationContract, config: {service: ExpandedName; port: string}, check: () => void): void {
  const {source} = inspectDirectOperation(contract);
  check();
  if (contract.basis !== 'native-component-premises-v1' || contract.correspondence !== 'dated-XSD-2004-components-v1')
    throw new DirectSoapSourceError('Component source profile required');
  if (/[^\x20-\x21\x23-\x7e]|\\/.test(contract.binding.action)) throw new DirectSoapSourceError('unsafe SOAPAction');
  validateSoapSelection(source, contract, config, check);
}

/** Build the existing SOAP dependency from the exact authorized snapshot, with no file/network import fallback.
 * @remarks Acyclic metadata resources are decoded independently under the native metadata policy. Original bytes and native semantics
 *   are unchanged. The dependency receives private aliases and a fresh prefilled cache; its import hook accepts only
 *   unambiguous native source edges to already prepared resources. This grants no endpoint or policy enforcement.
 * @returns A prepared node-soap WSDL for the exact original service/port/binding.
 * @throws DirectSoapSourceError For incompatible source/profile, unsafe dependency names, cycles or ambiguous imports.
 *   Caller cancellation/resource exceptions propagate unchanged.
 */
export async function prepareComponentSoapWsdl(contract: DirectOperationContract, config: {service: ExpandedName; port: string}, check: () => void): Promise<WSDL> {
  const {source, context: {budget}} = inspectDirectOperation(contract);
  validateComponentSoapSelection(contract, config, check);
  const refuse = (rule: string): never => {throw new DirectSoapSourceError(rule);};
  const nodes = new Map<string, SyntaxElement>(), dependencySyntax = new Set<string>();
  const key = (uri: string, path: string) => JSON.stringify([uri, path]);
  for (const edge of source.edges) {check(); dependencySyntax.add(key(edge.source.uri, edge.source.path));}
  for (const document of source.documents) {
    const pending = [document.root];
    while (pending.length) {
      check(); const node = pending.pop()!;
      budget.chargeWork(32 + node.children.length * 8 + node.attributes.length * 16);
      const identity = key(node.source.uri, node.source.path); nodes.set(identity, node);
      if (['import', 'include', 'redefine'].includes(node.name.local) && !dependencySyntax.has(identity)) refuse('unowned dependency syntax');
      for (const attribute of node.attributes) {
        check(); if (attribute.name.local === 'name' && (attribute.value in Object.prototype || attribute.value === 'prototype')) refuse('dependency reserved name');
      }
      for (const prefix in node.namespaces) {
        check(); if (['__proto__', 'prototype', 'constructor'].includes(prefix) || /["<&\r\n\t]/.test(node.namespaces[prefix]!)) refuse('dependency namespace interpolation');
      }
      for (const child of node.children) if (child.kind === 'element') pending.push(child);
    }
  }
  const resources = [...source.resources].sort((a, b) => a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0);
  const aliases = new Map<string, string>(), originals = new Map<string, string>();
  const dependencies = new Map<string, Set<string>>(), imports = new Map<string, string>();
  for (const [index, resource] of resources.entries()) {
    check(); const alias = 'https://wsdl-snapshot.invalid/resource/' + index;
    aliases.set(resource.uri, alias); originals.set(alias, resource.uri); dependencies.set(resource.uri, new Set());
  }
  const schemaUris = new Map(source.schemas.map(schema => [schema.key, schema.documentUri]));
  for (const edge of source.edges) {
    check(); if (!edge.to) continue;
    const target = schemaUris.get(edge.to) ?? edge.to, parent = edge.source.uri;
    if (!aliases.has(target) || !aliases.has(parent)) refuse('dependency outside retained snapshot');
    const node = nodes.get(key(edge.source.uri, edge.source.path));
    if (!node) refuse('dependency source unavailable');
    const location = syntaxAttribute(node!, edge.kind === 'wsdl-import' ? 'location' : 'schemaLocation');
    if (location === undefined) continue;
    const slot = key(parent, normalizeWhitespace(location, 'collapse')), previous = imports.get(slot);
    if (previous !== undefined && previous !== target) refuse('ambiguous dependency import context');
    imports.set(slot, target); dependencies.get(parent)!.add(target);
  }
  const cache = Object.create(null) as Record<string, WSDL>, prepared = new Set<string>();
  const remaining = new Map<string, number>(), dependents = new Map<string, string[]>(), ready: string[] = [];
  for (const [uri, required] of dependencies) {
    check(); remaining.set(uri, required.size); if (!required.size) ready.push(uri);
    for (const dependency of required) {
      check(); let users = dependents.get(dependency); if (!users) {users = []; dependents.set(dependency, users);} users.push(uri);
    }
  }
  for (let cursor = 0; cursor < ready.length; cursor++) {
      const uri = ready[cursor]!;
      check();
      const bytes = copyOriginalSchemaResource(source, uri, amount => {check(); budget.chargeWork(amount);});
      budget.chargeWork(4096 + bytes.byteLength * 64);
      const text = decodeMetadataXml(bytes);
      const options = {WSDL_CACHE: cache, wsdl_options: {overrideImportLocation: (_path: string, parentAlias: string, location: string): string => {
        check(); const parent = originals.get(parentAlias);
        const target = parent === undefined ? undefined : imports.get(key(parent, normalizeWhitespace(location, 'collapse')));
        const alias = target === undefined ? undefined : aliases.get(target);
        if (!target || !alias || !prepared.has(target) || !Object.hasOwn(cache, alias)) return refuse('unowned SOAP metadata import');
        return alias;
      }}};
      const alias = aliases.get(uri)!, wsdl = new WSDL(text, alias, options); cache[alias] = wsdl;
      await new Promise<void>((resolve, reject) => wsdl.onReady(error => error ? reject(error) : resolve()));
      check(); prepared.add(uri);
      for (const dependent of dependents.get(uri) ?? []) {
        check(); const count = remaining.get(dependent)! - 1; remaining.set(dependent, count);
        if (count === 0) ready.push(dependent);
      }
  }
  if (prepared.size !== resources.length) refuse('cyclic SOAP metadata dependencies');
  const root = aliases.get(source.root.uri);
  if (!root || !Object.hasOwn(cache, root)) return refuse('original root unavailable');
  return cache[root]!;
}
