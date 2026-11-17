import {directLimit} from './directExecutionPolicy.js';
/** Shared authenticated single-resource SOAP bootstrap policy; no transport. */
import {inspectDirectOperation} from './directOperation.js';
import type {DirectOperationContract} from './directOperation.js';
import {copyOriginalSchemaResource} from '../loader/schemaInput.js';
import {resolveLexicalQName, syntaxAttribute, WSDL_NAMESPACE, XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';
import type {SchemaInput} from '../loader/schemaInput.js';
import {WSDL} from 'soap/lib/wsdl/index.js';
const WSDL_SOAP = 'http://schemas.xmlsoap.org/wsdl/soap/';
const same = (a: ExpandedName, b: ExpandedName) => a.namespace === b.namespace && a.local === b.local;
export const DIRECT_SOAP_SOURCE_MAX_BYTES = 64 * 1024;
export class DirectSoapSourceError extends Error {
  constructor(message: string, readonly kind: 'unsupported' | 'resource-limit' = 'unsupported') {super(message);}
}
function validateSoapSelection(source: SchemaInput, contract: DirectOperationContract,
  config: {service: ExpandedName; port: string}, check: () => void, component = false): void {
  const addressNamespace = contract.binding.version === '1.2' ? 'http://schemas.xmlsoap.org/wsdl/soap12/' : WSDL_SOAP;
  const elements = (node: SyntaxElement) => {check(); return node.children.filter((child): child is SyntaxElement => child.kind === 'element');};
  const definitions = source.root.root;
  if (definitions.name.namespace !== WSDL_NAMESPACE || definitions.name.local !== 'definitions') throw new DirectSoapSourceError('WSDL definitions required');
  const candidates = component ? source.documents.map(document => document.root).filter(root => root.name.namespace === WSDL_NAMESPACE && root.name.local === 'definitions') : [definitions];
  const services = candidates.flatMap(definition => elements(definition).filter(n => n.name.namespace === WSDL_NAMESPACE && n.name.local === 'service'
    && same({namespace: syntaxAttribute(definition, 'targetNamespace') ?? '', local: syntaxAttribute(n, 'name') ?? ''}, config.service)));
  if (services.length !== 1) throw new DirectSoapSourceError('SOAP service mismatch');
  const ports = elements(services[0]!).filter(n => n.name.namespace === WSDL_NAMESPACE && n.name.local === 'port' && syntaxAttribute(n, 'name') === config.port);
  if (ports.length !== 1) throw new DirectSoapSourceError('SOAP port mismatch');
  const binding = syntaxAttribute(ports[0]!, 'binding');
  if (!binding || !same(resolveLexicalQName(binding, ports[0]!), contract.selector.binding)) throw new DirectSoapSourceError('SOAP binding mismatch');
  const addresses = elements(ports[0]!).filter(n => n.name.namespace === addressNamespace && n.name.local === 'address');
  if (addresses.length !== 1 || elements(ports[0]!).some(n => !(n.name.namespace === addressNamespace && n.name.local === 'address')
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
  validateSoapSelection(source, contract, config, check, true);
}

/** Private dependency keys are never original XML declaration names or application data. */
export const COMPONENT_SOAP_DISPATCH = Object.freeze({service: 'CheckedService', port: 'CheckedPort', operation: 'Invoke'});

/** Prepare a source-authenticated transport descriptor for the existing SOAP dependency.
 * @why Native owners already qualify the original graph and encode/decode its body; reparsing it through ordinary
 *   dependency maps introduces unrelated name/cycle hazards and a second semantic interpretation.
 * @returns Invocation-local dependency metadata with safe private dispatch aliases.
 * @throws DirectSoapSourceError For invalid native source/service/port/binding selection.
 * @constraints Original snapshots, action, policy and native XML remain authoritative; the descriptor grants no I/O.
 */
export async function prepareComponentSoapWsdl(contract: DirectOperationContract, config: {service: ExpandedName; port: string}, check: () => void): Promise<WSDL> {
  const {context: {budget}} = inspectDirectOperation(contract);
  validateComponentSoapSelection(contract, config, check);
  const soap = contract.binding.version === '1.2' ? 'http://schemas.xmlsoap.org/wsdl/soap12/' : WSDL_SOAP;
  const rpc = contract.binding.style === 'rpc';
  const action = contract.binding.action.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const part = rpc ? 'type="x:string"' : 'element="t:Payload"';
  const use = rpc ? 'use="encoded" namespace="urn:checked:transport" encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"' : 'use="literal"';
  const text = `<w:definitions xmlns:w="${WSDL_NAMESPACE}" xmlns:s="${soap}" xmlns:x="${XSD_NAMESPACE}" xmlns:t="urn:checked:transport" targetNamespace="urn:checked:transport">`
    + '<w:types><x:schema targetNamespace="urn:checked:transport"><x:element name="Payload" type="x:string"/></x:schema></w:types>'
    + `<w:message name="Input"><w:part name="body" ${part}/></w:message><w:message name="Output"><w:part name="body" ${part}/></w:message>`
    + '<w:portType name="Transport"><w:operation name="Invoke"><w:input message="t:Input"/><w:output message="t:Output"/></w:operation></w:portType>'
    + `<w:binding name="Binding" type="t:Transport"><s:binding style="${rpc ? 'rpc' : 'document'}" transport="http://schemas.xmlsoap.org/soap/http"/><w:operation name="Invoke"><s:operation soapAction="${action}"/>`
    + `<w:input><s:body ${use}/></w:input><w:output><s:body ${use}/></w:output></w:operation></w:binding>`
    + '<w:service name="CheckedService"><w:port name="CheckedPort" binding="t:Binding"><s:address location="http://127.0.0.1:1/transport"/></w:port></w:service></w:definitions>';
  budget.chargeWork(4096 + text.length * 64); check();
  const options = {WSDL_CACHE: Object.create(null) as Record<string, WSDL>, wsdl_options: {}};
  const wsdl = new WSDL(text, 'urn:typescript-wsdl-client:private-transport', options);
  await new Promise<void>((resolve, reject) => wsdl.onReady(error => error ? reject(error) : resolve()));
  check(); return wsdl;
}
