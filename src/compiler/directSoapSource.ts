/** Shared authenticated single-resource SOAP bootstrap policy; no transport. */
import {inspectDirectOperation} from './directOperation.js';
import type {DirectOperationContract} from './directOperation.js';
import {copyOriginalSchemaResource} from '../loader/schemaInput.js';
import {resolveLexicalQName, syntaxAttribute, WSDL_NAMESPACE, XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';
const WSDL_SOAP = 'http://schemas.xmlsoap.org/wsdl/soap/';
const same = (a: ExpandedName, b: ExpandedName) => a.namespace === b.namespace && a.local === b.local;
export class DirectSoapSourceError extends Error {}
export function prepareDirectSoapSource(contract: DirectOperationContract, config: {service: ExpandedName; port: string}, check: () => void) {
  const {context: {budget}, source} = inspectDirectOperation(contract);
  const refuse = (rule: string): never => {throw new DirectSoapSourceError(rule);};
  budget.chargeWork(128 + contract.binding.action.length * 8);
  if (/[^\x20-\x21\x23-\x7e]|\\/.test(contract.binding.action)) refuse('unsafe SOAPAction');
  if (source.resources.length !== 1 || source.edges.length || source.documents.length !== 1) throw new DirectSoapSourceError('single original WSDL resource required');
  const elements = (node: SyntaxElement): SyntaxElement[] => {
    check(); budget.chargeWork(128 + node.children.length * 16 + node.attributes.length * 16);
    return node.children.filter((child): child is SyntaxElement => child.kind === 'element');
  };
  // node-soap uses local-name dispatch and ordinary object maps internally.
  // Refuse fetch triggers even in foreign/otherwise ignored source syntax.
  let bootstrapNodes = 0;
  const inspectSource = (node: SyntaxElement) => {
    check(); budget.chargeWork(256 + node.lexicalName.length * 8);
    bootstrapNodes += 16 + node.attributes.length * 4 + node.children.length * 4;
    if (['import', 'include', 'redefine'].includes(node.name.local)) refuse('dependency bootstrap imports');
    const grammar: Record<string, readonly string[]> = {
      [WSDL_NAMESPACE]: ['definitions', 'types', 'message', 'part', 'portType', 'operation', 'input', 'output', 'fault', 'binding', 'service', 'port', 'documentation'],
      [WSDL_SOAP]: ['binding', 'operation', 'body', 'fault', 'address'],
      ['http://schemas.xmlsoap.org/wsdl/soap12/']: ['binding', 'operation', 'body', 'fault', 'address'],
      [XSD_NAMESPACE]: ['schema', 'complexType', 'sequence', 'element'],
    };
    if (!Object.hasOwn(grammar, node.name.namespace) || !grammar[node.name.namespace]!.includes(node.name.local)) refuse('WSDL bootstrap extension');
    for (const a of node.attributes) {
      budget.chargeWork(64 + a.value.length * 8);
      if (a.name.local === 'name' && (a.value in Object.prototype || a.value === 'prototype')) refuse('dependency reserved name');
    }
    for (const prefix in node.namespaces) {
      budget.chargeWork(64 + (prefix.length + node.namespaces[prefix]!.length) * 8);
      if (['__proto__', 'prototype', 'constructor'].includes(prefix) || /["<&\r\n\t]/.test(node.namespaces[prefix]!)) refuse('dependency namespace interpolation');
    }
    for (const child of elements(node)) inspectSource(child);
  };
  inspectSource(source.root.root);
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

  const original = copyOriginalSchemaResource(source, source.root.uri, amount => {check(); budget.chargeWork(amount);});
  // This packet admits UTF-8 source bootstrap only; response encoding remains
  // owned by the existing strict XML byte decoder.
  budget.chargeWork(4096 + original.byteLength * 32);
  let wsdlText: string;
  try {wsdlText = new TextDecoder('utf-8', {fatal: true}).decode(original);} catch {throw new DirectSoapSourceError('UTF-8 WSDL bootstrap required');}
  if (/^<\?xml\s[^?]*encoding\s*=\s*["'](?!utf-?8["'])/i.test(wsdlText)) throw new DirectSoapSourceError('UTF-8 WSDL bootstrap required');

  return {original, wsdlText, bootstrapNodes};
}
