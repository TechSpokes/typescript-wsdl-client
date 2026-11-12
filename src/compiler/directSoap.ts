import {isApplicationUnmetered} from './semanticBudget.js';
import type {CheckedPayloadDiagnostic} from './payloadDiagnostics.js';
import {directDataOwnership, directLimit} from './directExecutionPolicy.js';
/** Shared retained-operation SOAP exchange; profile-specific authority stays explicit. */
import {checkSemanticBudget} from './semanticBudget.js';
import {DataOwnershipLimitError} from './dataOwnership.js';
import {Agent} from 'node:http';
import {Agent as HttpsAgent} from 'node:https';
import {types, MIMEType} from 'node:util';
import {WSDL} from 'soap/lib/wsdl/index.js';
import {Client} from 'soap/lib/client.js';
import {HttpClient} from 'soap/lib/http.js';
import {inspectDirectOperation} from './directOperation.js';
import type {DirectOperationContract} from './directOperation.js';
import {createDirectValueMapping, inspectDirectValueMapping, createComponentDirectionalMapping, inspectComponentValueMapping} from './directValues.js';
import type {DirectValueMapping, ComponentValueMapping} from './directValues.js';
import {decodeDirectXml, encodeDirectXml, decodeComponentXml, encodeComponentXml, DIRECT_XML_LIMITS} from './directCodec.js';
import type {DirectCodecFailure, DirectDecodedXml, ComponentDecodedXml, DirectXmlLimits} from './directCodec.js';
import {prepareDirectSoapSource, prepareComponentSoapWsdl, DirectSoapSourceError} from './directSoapSource.js';
import {isXmlNCName, resolveLexicalQName, SchemaLoadingError, syntaxElements, syntaxAttribute, WSDL_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import type {ResolverUsage} from './semanticBudget.js';
import {decodeComponentRecordXml, inspectComponentRecordProjection} from './componentRecordProjection.js';
import type {ComponentRecordProjection, ComponentRecordDecodedXml} from './componentRecordProjection.js';
import {assessComponentSoapHeader} from './soapHeaders.js';

const SOAP11 = 'http://schemas.xmlsoap.org/soap/envelope/';
export interface DirectSoapOptions {
  readonly service: ExpandedName;
  readonly port: string;
  readonly endpoint: string;
  /** Explicit authorization; WSDL addresses never grant permission. */
  readonly allowEndpoint: (endpoint: URL) => boolean;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly limits?: DirectXmlLimits;
  /** Every requested extension is refused by this first adapter. */
  readonly capabilities?: readonly string[];
}
export interface DirectSoapFailure {
  readonly kind: DirectCodecFailure['kind'] | 'transport' | 'protocol';
  readonly rule: string;
  readonly usage: ResolverUsage;
  readonly phase?: 'input' | 'response';
  readonly source?: SyntaxSource;
  readonly schemaPath?: string;
  readonly payloadPath?: string;
  readonly diagnostic?: CheckedPayloadDiagnostic;
}
/** Version-specific protocol metadata; application detail remains owned by native mappings.
 * @since 1.3.0
 */
export interface Soap12FaultMetadata {
  readonly version: '1.2';
  readonly code: ExpandedName;
  readonly subcodes: readonly ExpandedName[];
  readonly reasons: readonly Readonly<{lang: string; text: string}>[];
  readonly string: string;
  readonly node?: string;
  readonly role?: string;
}
/** SOAP 1.1 protocol fields retained when the selected operation supplies no matching detail.
 * @since 1.4.0
 */
export interface Soap11FaultMetadata {
  readonly version: '1.1';
  readonly code: ExpandedName;
  readonly string: string;
  readonly actor?: string;
}
type ProtocolFaultMetadata = Soap11FaultMetadata | Soap12FaultMetadata;
export type DeclaredSoapFault = Readonly<{name: string; code: ExpandedName; codeNode: SyntaxElement; string: string; actor?: string}> & Partial<Soap12FaultMetadata>;
/** A valid protocol fault without an application detail mapped by the selected operation.
 * @since 1.3.0
 * @constraints Unassessed detail remains only in responseBytes; no native value receipt is issued.
 */
export interface ComponentProtocolFault<F extends ProtocolFaultMetadata = ProtocolFaultMetadata> {
  readonly kind: 'soap-fault'; readonly admitted: false;
  readonly fault: F;
  readonly responseBytes: Uint8Array; readonly status: number; readonly usage: ResolverUsage;
  readonly ignoredHeaders?: readonly ExpandedName[];
}
type DecodedSoapResult<D> = DirectSoapFailure | Readonly<{
  kind: 'soap-response' | 'soap-fault'; admitted: false;
  decoded: D;
  /** Actual bounded HTTP entity bytes, before any decoding; caller-owned data. */
  responseBytes: Uint8Array;
  status: number;
  fault?: DeclaredSoapFault;
  /** Unprocessed header blocks; their application semantics were not assessed. */
  ignoredHeaders?: readonly ExpandedName[];
  usage: ResolverUsage;
}>;
type SoapResult<D> = DecodedSoapResult<D> | ComponentProtocolFault;
export type DirectSoapResult = DecodedSoapResult<DirectDecodedXml>;
export type ComponentSoapResult = SoapResult<ComponentDecodedXml>;
export type ComponentRecordSoapResult = SoapResult<ComponentDecodedXml | ComponentRecordDecodedXml>;
export interface ComponentSoapOptions extends Omit<DirectSoapOptions, 'endpoint' | 'allowEndpoint'> {
  readonly endpoint?: string;
  /** Optional restriction; omission permits only the configured or selected address. */
  readonly allowEndpoint?: (endpoint: URL) => boolean;
  /** Additional caller-owned PEM trust anchor; certificate and hostname verification remain enabled. */
  readonly ca?: string;
}
class Stop extends Error {
  constructor(readonly kind: DirectSoapFailure['kind'], readonly rule: string) {super(rule);}
}
const same = (a: ExpandedName, b: ExpandedName) => a.namespace === b.namespace && a.local === b.local;

/** Shared entry guard: consumers must call before reading any SOAP option. */
export function directSoapOptionsShape(options: unknown, check: () => void, additional: readonly string[] = []): string | undefined {

  if (!options || typeof options !== 'object' || types.isProxy(options)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(options) as object | null)) return 'data-only SOAP options required';
  const allowed = new Set(['service', 'port', 'endpoint', 'allowEndpoint', 'signal', 'timeoutMs', 'limits', 'capabilities', ...additional]);
  for (const key of Reflect.ownKeys(options)) {
    check();
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (typeof key !== 'string' || !allowed.has(key) || !descriptor || !('value' in descriptor)) return 'SOAP option or capability';
  }
  return undefined;
}

/** Authentication and fresh-value validation precede dependency bootstrap and all HTTP I/O. */
export async function exchangeDirectSoap(contract: DirectOperationContract, inputMapping: unknown, application: unknown,
  options: DirectSoapOptions): Promise<DirectSoapResult> {
  const input = inspectDirectValueMapping(inputMapping, contract);
  const result = await exchangeSoap<DirectValueMapping, DirectDecodedXml>(contract, input, application, options, {
    component: false, encode: encodeDirectXml, decode: decodeDirectXml, create: createDirectValueMapping,
    prepare: async (selection, check) => {
      const {source} = inspectDirectOperation(contract);
      const {wsdlText} = prepareDirectSoapSource(contract, selection, check);
      const wsdl = new WSDL(wsdlText, source.root.uri, {wsdl_options: {overrideImportLocation: () => {throw new Stop('unsupported', 'dependency import forbidden');}}});
      await new Promise<void>((resolve, reject) => wsdl.onReady(error => error ? reject(error) : resolve()));
      return wsdl;
    },
  });
  if (result.kind === 'soap-fault' && !('decoded' in result)) throw new TypeError('Component fault on direct profile');
  return result;
}

/** Execute one authenticated component mapping through the existing SOAP client and native XML checks.
 * @remarks HTTPS transport with verified server identity is supported. Client certificates, timestamps and
 *   timestamp layouts refuse before I/O. Algorithm suites constrain WS-Security cryptographic operations;
 *   this fragment has no supporting tokens, signature or encryption operations and emits no security header.
 *   Optional caller restrictions narrow the selected/configured endpoint. No gateway or source admission is granted here.
 * @returns A validated response/fault or explicit failure, with owned work and connections closed.
 * @throws TypeError For foreign native handles. Invalid explicit timer/XML capacities throw RangeError.
 */
export function exchangeComponentSoap(contract: DirectOperationContract, inputMapping: unknown, application: unknown,
  options: ComponentSoapOptions): Promise<ComponentSoapResult>;
export function exchangeComponentSoap(contract: DirectOperationContract, inputMapping: unknown, application: unknown,
  options: ComponentSoapOptions, responseProjection: ComponentRecordProjection | undefined, soap11ProtocolFaults?: boolean): Promise<ComponentRecordSoapResult>;
export async function exchangeComponentSoap(contract: DirectOperationContract, inputMapping: unknown, application: unknown,
  options: ComponentSoapOptions, responseProjection?: ComponentRecordProjection, soap11ProtocolFaults = true): Promise<ComponentRecordSoapResult> {
  const {mapping: input} = inspectComponentValueMapping(inputMapping, contract);
  if (responseProjection !== undefined) {
    inspectComponentRecordProjection(responseProjection, contract);
    return exchangeSoap<ComponentValueMapping | ComponentRecordProjection, ComponentDecodedXml | ComponentRecordDecodedXml>(contract, input, application, options, {
      component: true, soap11ProtocolFaults,
      encode(owner, mapping, value, controls) {
        if (mapping.kind !== 'component-mapping') throw new TypeError('SOAP input requires the native input mapping');
        return encodeComponentXml(owner, mapping, value, controls);
      },
      decode(owner, mapping, bytes, controls) {
        if (mapping.kind === 'component-record-projection') return decodeComponentRecordXml(owner, mapping, bytes, controls);
        return decodeComponentXml(owner, mapping, bytes, {...controls, selectPayload(root) {
          const selected = controls.selectPayload(root);
          if (selected.mapping.kind !== 'component-mapping') throw new TypeError('Normal component decoding requires its exact mapping');
          return {payload: selected.payload, mapping: selected.mapping};
        }});
      },
      create(owner, direction, controls) {
        return direction.kind === 'output' ? responseProjection : createComponentDirectionalMapping(owner, input, direction, controls);
      },
      prepare: (selection, check) => prepareComponentSoapWsdl(contract, selection, check),
    });
  }
  return exchangeSoap<ComponentValueMapping, ComponentDecodedXml>(contract, input, application, options, {
    component: true, soap11ProtocolFaults, encode: encodeComponentXml, decode: decodeComponentXml,
    create: (owner,direction,controls)=>createComponentDirectionalMapping(owner,input,direction,controls),
    prepare: (selection, check) => prepareComponentSoapWsdl(contract, selection, check),
  });
}

interface ExchangeProfile<M extends DirectValueMapping | ComponentValueMapping | ComponentRecordProjection,
  D extends DirectDecodedXml | ComponentDecodedXml | ComponentRecordDecodedXml> {
  component: boolean;
  soap11ProtocolFaults?: boolean;
  encode(contract: DirectOperationContract, mapping: M, value: unknown, options: {signal?: AbortSignal; limits: DirectXmlLimits}):
    {bytes: Uint8Array} | DirectCodecFailure;
  decode(contract: DirectOperationContract, mapping: M, bytes: Uint8Array, options: {signal?: AbortSignal; limits: DirectXmlLimits;
    componentResponseEncoding?: {charset?: string};
    uri: string; selectPayload: (root: SyntaxElement) => {payload: SyntaxElement; mapping: M}}): D | DirectCodecFailure;
  create(contract: DirectOperationContract, direction: M['direction'], options: {signal?: AbortSignal}): M | DirectCodecFailure;
  prepare(selection: {service: ExpandedName; port: string}, check: () => void): Promise<WSDL>;
}
async function exchangeSoap<M extends DirectValueMapping | ComponentValueMapping | ComponentRecordProjection,
  D extends DirectDecodedXml | ComponentDecodedXml | ComponentRecordDecodedXml>(
  contract: DirectOperationContract, input: M, application: unknown, options: ComponentSoapOptions,
  profile: ExchangeProfile<M, D>): Promise<SoapResult<D>> {
  const soap12 = profile.component && contract.binding.version === '1.2';
  const {context} = inspectDirectOperation(contract);
  if (input.direction.kind !== 'input') throw new TypeError('SOAP request requires the exact input mapping');
  const {budget} = context;
  const fail = (kind: DirectSoapFailure['kind'], rule: string, phase?: 'input' | 'response'): DirectSoapFailure => Object.freeze({kind, rule,
    ...(profile.component && phase ? {phase} : {}), usage: Object.freeze({...budget.usage()})});
  let signal: AbortSignal | undefined;
  const check = () => {checkSemanticBudget(budget); if (signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');};
  const stop = (kind: DirectSoapFailure['kind'], rule: string): never => {throw new Stop(kind, rule);};
  let agent: Agent | undefined;
  let controller: AbortController | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const abort = () => controller?.abort();
  try {
    check();
    // Options are a closed capability surface. Never silently discard security,
    // headers, endpoint agents, redirects, streaming or other caller extensions.
    const optionRule = directSoapOptionsShape(options, check, profile.component ? ['ca'] : []);
    if (optionRule) return fail('unsupported', optionRule);
    signal = options.signal;
    if (signal !== undefined && !(signal instanceof AbortSignal)) return fail('unsupported', 'native AbortSignal required');
    const allowEndpoint = options.allowEndpoint;
    check();
    let selectedEndpoint = options.endpoint;
    if (profile.component && selectedEndpoint === undefined) {
      const {source} = inspectDirectOperation(contract);
      const services = source.documents.flatMap(d => syntaxElements(d.root, WSDL_NAMESPACE, 'service').filter(n =>
        syntaxAttribute(d.root, 'targetNamespace') === options.service?.namespace && syntaxAttribute(n, 'name') === options.service?.local));
      const ports = services.flatMap(n => syntaxElements(n, WSDL_NAMESPACE, 'port').filter(p => syntaxAttribute(p, 'name') === options.port));
      const addresses = ports.flatMap(p => syntaxElements(p, soap12 ? 'http://schemas.xmlsoap.org/wsdl/soap12/' : 'http://schemas.xmlsoap.org/wsdl/soap/', 'address'));
      if (services.length !== 1 || ports.length !== 1 || addresses.length !== 1 || !syntaxAttribute(addresses[0]!, 'location')) {
        return fail('unsupported', 'Select one SOAP service/port address or supply an endpoint override');
      }
      selectedEndpoint = syntaxAttribute(addresses[0]!, 'location');
    }
    const config = directDataOwnership(budget).freeze(directDataOwnership(budget).snapshot({service: options.service, port: options.port, endpoint: selectedEndpoint,
      timeoutMs: options.timeoutMs ?? (profile.component || isApplicationUnmetered(budget) ? 0 : 15_000), limits: options.limits ?? {},
      ca: options.ca, capabilities: options.capabilities ?? []}));
    if (!Array.isArray(config.capabilities) || config.capabilities.length) return fail('unsupported', 'SOAP capability');
    if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 0 || config.timeoutMs > 2_147_483_647) throw new RangeError('SOAP timeout must be a positive timer integer');
    const limits = {maxBytes: directLimit(budget, DIRECT_XML_LIMITS.maxBytes), maxDepth: directLimit(budget, DIRECT_XML_LIMITS.maxDepth),
      maxNodes: directLimit(budget, DIRECT_XML_LIMITS.maxNodes), maxText: directLimit(budget, DIRECT_XML_LIMITS.maxText), ...config.limits};
    for (const [key, value] of Object.entries(limits)) {
      if (!['maxBytes', 'maxDepth', 'maxNodes', 'maxText'].includes(key) || !Number.isSafeInteger(value) || value < 1) throw new RangeError('Invalid SOAP XML limit');
    }
    if (typeof config.endpoint !== 'string' || typeof config.port !== 'string' || !isXmlNCName(config.port)
      || !config.service || typeof config.service.namespace !== 'string' || !isXmlNCName(config.service.local)) return fail('unsupported', 'explicit SOAP selection');
    let endpoint: URL;
    try {endpoint = new URL(config.endpoint);} catch {return fail('unsupported', 'explicit HTTP(S) endpoint required');}
    if (profile.component) {
      if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash || endpoint.search) return fail('unsupported', 'explicit HTTP(S) endpoint required');
      if (config.ca !== undefined && (typeof config.ca !== 'string' || endpoint.protocol !== 'https:')) return fail('unsupported', 'HTTPS PEM trust anchor required');
      const policy = contract.policy;
      if (!policy) return fail('unsupported', 'component policy authority required');
      if (policy.kind === 'https-transport') {
        if (endpoint.protocol !== 'https:') return fail('unsupported', 'policy requires HTTPS');
        if (policy.requireClientCertificate || policy.includeTimestamp || !['Strict', 'Lax'].includes(policy.layout)) return fail('unsupported', 'message security or client certificate capability required');
      }
    } else if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port || endpoint.port === '1'
      || endpoint.username || endpoint.password || endpoint.hash || endpoint.search) return fail('unsupported', 'owned loopback HTTP endpoint required');
    if (!(profile.component && allowEndpoint === undefined)
      && (typeof allowEndpoint !== 'function' || allowEndpoint(new URL(endpoint.href)) !== true)) return fail('unsupported', 'endpoint authorization');
    const action = contract.binding.action;
    const rpc = contract.binding.style === 'rpc';

    if (/[^\x20-\x21\x23-\x7e]|\\/.test(action)) return fail('unsupported', 'unsafe SOAPAction');
    const encoded = profile.encode(contract, input, application, {signal, limits});
    if (!('bytes' in encoded)) return fail(encoded.kind, encoded.rule, 'input');
    const output = profile.create(contract, {kind: 'output'}, {signal});
    if (!('direction' in output)) return fail(output.kind, output.rule);
    const faults = new Map<string, M>();
    for (const fault of contract.faults) {
     check(); const mapping = profile.create(contract, {kind: 'fault', name: fault.name}, {signal});
      if (!('direction' in mapping)) return fail(mapping.kind, mapping.rule);
      faults.set(fault.name, mapping);
    }
    const {bodyRoot} = soapProtocolSelection(contract, profile.component, check, stop);
    const wsdl = await profile.prepare(config, check);
    check();
    // @why node-soap's RPC writer would wrap `_xml` as a parameter. This private
    //   instance retains its selected method/transport while native bytes own RPC construction.
    const rpcArguments = Object.freeze({});
    if (rpc) wsdl.objectToRpcXML = (name, args) => {
      check();
      if (name !== contract.selector.operation || args !== rpcArguments) stop('protocol', 'dependency RPC selection mismatch');
      return Buffer.from(encoded.bytes).toString('utf8');
    };
    // HTTP and codec byte limits bound buffering and output copies directly.
    agent = endpoint.protocol === 'https:' ? new HttpsAgent({keepAlive: false, maxSockets: 1, rejectUnauthorized: true,
      ...(config.ca === undefined ? {} : {ca: config.ca})}) : new Agent({keepAlive: false, maxSockets: 1});
    controller = new AbortController();
    signal?.addEventListener('abort', abort, {once: true});
    let timedOut = false;
    if (config.timeoutMs > 0) deadline = setTimeout(() => {timedOut = true; controller!.abort();}, config.timeoutMs);
    const complete = new Error('direct raw response captured');
    let response: {bytes: Buffer; status: number; contentType: string; encoding: string} | undefined;
    let hookFailure: unknown;
    class BufferedHttp extends HttpClient {
      override request(url: string, data: string, callback: (error: unknown) => void, headers: Record<string, string>, _options: Record<string, unknown>) {
        try {
         check();
          if (url !== endpoint.href || (soap12 ? headers.SOAPAction !== undefined || headers['Content-Type'] !== requestContentType
            : headers.SOAPAction !== `"${action}"` || headers['Content-Type'] !== 'text/xml; charset=utf-8')) stop('protocol', 'dependency dispatch mismatch');

          if (Buffer.byteLength(data) > limits.maxBytes) stop('resource-limit', 'SOAP request byte limit');
          const outgoing = profile.decode(contract, input, Buffer.from(data), {signal, limits,
            uri: 'urn:typescript-wsdl-client:outgoing-soap', selectPayload: root => ({payload: bodyRoot(root), mapping: input})});
          if (!('validated' in outgoing)) stop(outgoing.kind, outgoing.rule);
         check();
        } catch (error) {
          hookFailure = error; callback(complete);
          // The dependency ignores this return value; no HTTP request is made.
          const rejected = Promise.reject(complete);
          void rejected.catch(() => {});
          return rejected;
        }
        return super.request(url, data, (error: unknown, res: {status: number; headers: Record<string, unknown>} | undefined, bytes: unknown) => {
          // Never throw through HttpClient's detached then-handler.
          try {
           check();
            if (error) hookFailure = error;
            else if (!res || !Buffer.isBuffer(bytes)) stop('transport', 'raw response bytes unavailable');
            else response = {bytes, status: res.status, contentType: String(res.headers['content-type'] ?? ''), encoding: String(res.headers['content-encoding'] ?? '')};
          } catch (failure) {hookFailure = failure;}
          // No response object/data on this sentinel: node-soap cannot enter
          // xmlToObject, including its special err.response parsing path.
          callback(complete);
        }, headers, {responseType: 'arraybuffer', decompress: false, maxRedirects: 0, maxContentLength: limits.maxBytes,
          maxBodyLength: limits.maxBytes, proxy: false, httpAgent: agent, httpsAgent: agent, signal: controller!.signal, timeout: config.timeoutMs});
      }
    }
    const requestContentType = soap12 ? 'application/soap+xml; charset=utf-8' + (action ? `; action="${action}"` : '') : 'text/xml; charset=utf-8';
    const client = new Client(wsdl, endpoint.href, {httpClient: new BufferedHttp(), ...(soap12 ? {forceSoap12Headers: true} : {})});
    // Every lookup is own and explicit; the dependency's first-port shortcut is
    // never consulted. Source checks above bind these names to the native handle.
    const own = (object: object, key: string): unknown => Object.getOwnPropertyDescriptor(object, key)?.value;
    const service = own(client, config.service.local);
    const port = service && typeof service === 'object' ? own(service, config.port) : undefined;
    const method = port && typeof port === 'object' ? own(port, contract.selector.operation) : undefined;
    if (typeof method !== 'function') return fail('unsupported', 'dependency selected method unavailable');
    check();
    await new Promise<void>((resolve, reject) => method(rpc ? rpcArguments : {_xml: Buffer.from(encoded.bytes).toString('utf8')}, (error: unknown) => error === complete ? resolve() : reject(error), {}, soap12 ? {'Content-Type': requestContentType} : {SOAPAction: `"${action}"`}));
    check();
    if (timedOut) return fail('transport', 'SOAP deadline exceeded');
    if (hookFailure) throw hookFailure;
    if (!response) return fail('transport', 'incomplete HTTP response');
    const observed: {bytes: Buffer; status: number; contentType: string; encoding: string} = response;
    const assessed = assessSoapResponse(contract, output, faults, observed.bytes, profile, {signal, limits, uri: endpoint.href,
      responseMetadata: {status: observed.status, contentType: observed.contentType, contentEncoding: observed.encoding}});
    if (!('admitted' in assessed)) return assessed;
    if (assessed.decoded === undefined) {
      if (!profile.component || !assessed.fault || 'name' in assessed.fault) throw new TypeError('Missing decoded SOAP response');
      return Object.freeze({kind: 'soap-fault' as const, admitted: false as const, fault: assessed.fault,
        responseBytes: new Uint8Array(observed.bytes), status: observed.status, usage: assessed.usage,
        ...(assessed.ignoredHeaders ? {ignoredHeaders: assessed.ignoredHeaders} : {})});
    }
    if (assessed.fault && !('name' in assessed.fault)) throw new TypeError('Decoded fault requires its declared application mapping');
    return Object.freeze({kind: assessed.kind, admitted: false as const, decoded: assessed.decoded,
      responseBytes: new Uint8Array(observed.bytes), status: observed.status, usage: assessed.usage,
      ...(assessed.fault && 'name' in assessed.fault ? {fault: assessed.fault} : {}),
      ...(assessed.ignoredHeaders ? {ignoredHeaders: assessed.ignoredHeaders} : {})});
  } catch (error) {
    if (budget.exhausted()) return fail('resource-limit', 'request-budget');
    if (error instanceof DataOwnershipLimitError) return fail('resource-limit', error.message);
    if (signal?.aborted) return fail('cancelled', 'cooperative-cancellation');
    if (error instanceof DirectSoapSourceError) return fail(error.kind, error.message);
    if (error instanceof Stop) return fail(error.kind, error.rule);
    if (error instanceof SchemaLoadingError) return fail(error.category === 'resource-limit' ? 'resource-limit' : error.category === 'invalid-schema' ? 'protocol' : 'unsupported', 'SOAP protocol XML');
    if (error instanceof Error && 'code' in error) {
      if (error.code === 'ERR_BAD_RESPONSE' && error.message.startsWith('maxContentLength size of ')) return fail('resource-limit', 'HTTP response byte limit');
      return fail('transport', error.code === 'ERR_CANCELED' ? 'SOAP deadline exceeded' : 'HTTP exchange failed');
    }
    throw error;
  } finally {
    if (deadline) clearTimeout(deadline);
    signal?.removeEventListener('abort', abort);
    controller?.abort(); agent?.destroy();
  }
}


/** Actual HTTP entity metadata; omission leaves HTTP status and media duties unassessed.
 * @since Unreleased
 */
export interface ObservedSoapResponseMetadata {
  readonly status: number;
  readonly contentType: string;
  readonly contentEncoding?: string;
}
export type ComponentSoapResponseAssessment = DirectSoapFailure | Readonly<{
  kind: 'soap-response' | 'soap-fault'; admitted: false;
  decoded?: ComponentDecodedXml | ComponentRecordDecodedXml;
  fault?: DeclaredSoapFault | ProtocolFaultMetadata;
  ignoredHeaders?: readonly ExpandedName[];
  usage: ResolverUsage;
}>;
type ResponseAssessment<D> = DirectSoapFailure | Readonly<{
  kind: 'soap-response' | 'soap-fault'; admitted: false; decoded?: D;
  fault?: DeclaredSoapFault | ProtocolFaultMetadata; ignoredHeaders?: readonly ExpandedName[]; usage: ResolverUsage;
}>;
type ResponseControls = Readonly<{signal?: AbortSignal; limits: DirectXmlLimits; uri?: string; responseMetadata?: ObservedSoapResponseMetadata}>;

/** Assess caller-observed response bytes through the same protocol and native decoder used by real exchanges.
 * @param contract Authenticated selected component operation.
 * @param inputMapping Exact operation input mapping, used only to derive response/fault mappings.
 * @param bytes Actual observed SOAP entity bytes; no request or transport is constructed.
 * @param options XML controls, optional actual HTTP metadata and exact response projection.
 * @returns Native response/fault assessment or semantic failure; HTTP remains unassessed when metadata is absent.
 * @throws TypeError For foreign native handles; RangeError for invalid explicit XML limits.
 * @constraints This response-only helper performs no transport, endpoint authorization or request-value assessment.
 */
export function inspectComponentSoapResponse(contract: DirectOperationContract, inputMapping: unknown, bytes: Uint8Array,
  options: Readonly<{signal?: AbortSignal; limits?: DirectXmlLimits; uri?: string; responseMetadata?: ObservedSoapResponseMetadata;
    responseProjection?: ComponentRecordProjection}> = {}): ComponentSoapResponseAssessment {
  const {mapping: input} = inspectComponentValueMapping(inputMapping, contract);
  const {context} = inspectDirectOperation(contract);
  const failure = (kind: DirectSoapFailure['kind'], rule: string): DirectSoapFailure => Object.freeze({kind, rule, phase: 'response', usage: context.budget.usage()});
  if (options.signal?.aborted) return failure('cancelled', 'cooperative-cancellation');
  const limits = {...DIRECT_XML_LIMITS, ...options.limits};
  for (const [key, value] of Object.entries(limits)) {
    if (!['maxBytes', 'maxDepth', 'maxNodes', 'maxText'].includes(key) || !Number.isSafeInteger(value) || value < 1) throw new RangeError('Invalid SOAP XML limit');
  }
  if (options.responseProjection) inspectComponentRecordProjection(options.responseProjection, contract);
  const output = options.responseProjection ?? createComponentDirectionalMapping(contract, input, {kind: 'output'}, {signal: options.signal});
  if (!('direction' in output)) return output;
  const faults = new Map<string, ComponentValueMapping | ComponentRecordProjection>();
  for (const fault of contract.faults) {
    const mapping = createComponentDirectionalMapping(contract, input, {kind: 'fault', name: fault.name}, {signal: options.signal});
    if (mapping.kind !== 'component-mapping') return mapping;
    faults.set(fault.name, mapping);
  }
  return assessSoapResponse(contract, output, faults, bytes, {component: true, soap11ProtocolFaults: true,
    decode(owner, mapping, observed, controls) {
      if (mapping.kind === 'component-record-projection') return decodeComponentRecordXml(owner, mapping, observed, controls);
      return decodeComponentXml(owner, mapping, observed, {...controls, selectPayload(root) {
        const selected = controls.selectPayload(root);
        if (selected.mapping.kind !== 'component-mapping') throw new TypeError('Normal component decoding requires its exact mapping');
        return {payload: selected.payload, mapping: selected.mapping};
      }});
    },
  }, {...options, limits});
}

/** Shared response episode for offline inspection and actual HTTP exchanges. */
function assessSoapResponse<M extends DirectValueMapping | ComponentValueMapping | ComponentRecordProjection,
  D extends DirectDecodedXml | ComponentDecodedXml | ComponentRecordDecodedXml>(
  contract: DirectOperationContract, output: M, faults: ReadonlyMap<string, M>, bytes: Uint8Array,
  profile: Pick<ExchangeProfile<M, D>, 'component' | 'soap11ProtocolFaults' | 'decode'>, options: ResponseControls): ResponseAssessment<D> {
  const {context} = inspectDirectOperation(contract), {budget} = context;
  const signal = options.signal, limits = options.limits;
  const soap12 = profile.component && contract.binding.version === '1.2';
  const SOAP = soap12 ? 'http://www.w3.org/2003/05/soap-envelope' : SOAP11;
  const fail = (kind: DirectSoapFailure['kind'], rule: string, phase?: 'input' | 'response'): DirectSoapFailure =>
    Object.freeze({kind, rule, ...(phase ? {phase} : {}), usage: Object.freeze({...budget.usage()})});
  const check = () => {checkSemanticBudget(budget); if (signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');};
  const stop = (kind: DirectSoapFailure['kind'], rule: string): never => {throw new Stop(kind, rule);};
  try {
    check();
    const {elements, shape, bodyRoot, ignoredHeaders} = soapProtocolSelection(contract, profile.component, check, stop);
    let charset: string | undefined;
    const metadata = options.responseMetadata;
    if (metadata) {
    if ((metadata.contentEncoding ?? '') && (metadata.contentEncoding ?? '').toLowerCase() !== 'identity') return fail('unsupported', 'HTTP compression');
    let soap12Charset: string | undefined;
    let validSoap12Media = false;
    if (soap12) {
      try {
        const mime = new MIMEType(metadata.contentType);
        soap12Charset = mime.params.get('charset')?.toLowerCase();
        validSoap12Media = mime.essence === 'application/soap+xml' && (!soap12Charset || ['utf-8', 'utf-16', 'utf-16le', 'utf-16be', 'iso-8859-1'].includes(soap12Charset));
      } catch { /* Invalid media types are refused below. */ }
    }
    const media = soap12 ? validSoap12Media ? ['', soap12Charset] : null : /^text\/xml(?:\s*;\s*charset\s*=\s*(?:"(utf-8|utf-16|utf-16le|utf-16be|iso-8859-1)"|(utf-8|utf-16|utf-16le|utf-16be|iso-8859-1)))?\s*$/i.exec(metadata.contentType);
    if (!media) return fail('protocol', 'SOAP response Content-Type');
    if (metadata.status !== 200 && metadata.status !== 500 && !(soap12 && metadata.status === 400)) return fail('transport', 'SOAP HTTP status');
    // Header charset is a protocol assertion, checked against actual BOM bytes.
    charset = (media[1] ?? media[2])?.toLowerCase();
    if (!profile.component && charset === 'iso-8859-1') return fail('protocol', 'SOAP response Content-Type');
    const bom = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    if (!profile.component && charset && charset !== bom && !(charset === 'utf-16' && bom.startsWith('utf-16'))) return fail('protocol', 'SOAP charset disagrees with bytes');

    }
    let faultInfo: DeclaredSoapFault | undefined;
    let protocolFault: ProtocolFaultMetadata | undefined;
    const protocolFaultSignal = new Error('SOAP protocol fault assessed');
    const decodeResponse = () => profile.decode(contract, output, bytes, {signal, limits, uri: options.uri ?? 'urn:typescript-wsdl-client:observed-soap-response',
      ...(profile.component ? {componentResponseEncoding: {charset}} : {}),
      selectPayload: root => {
        const payload = bodyRoot(root, true);
        if (!same(payload.name, {namespace: SOAP, local: 'Fault'})) {
          if (options.responseMetadata && options.responseMetadata.status !== 200) stop('protocol', 'HTTP 500 requires SOAP Fault');
          return {payload, mapping: output};
        }
        if (soap12) {
          const children = shape(payload);
          const names = children.map(n => n.name.namespace === SOAP ? n.name.local : '');
          if (!/^Code,Reason(?:,Node)?(?:,Role)?(?:,Detail)?$/.test(names.join(','))) stop('protocol', 'SOAP 1.2 Fault children');
          const scalar = (node: SyntaxElement, language = false): string => {
            check();
            if (elements(node).length || node.attributes.some(a => !(language && a.name.namespace === 'http://www.w3.org/XML/1998/namespace' && a.name.local === 'lang')))
              stop('protocol', 'SOAP 1.2 Fault scalar child');
            return node.children.map(n => n.kind === 'text' ? n.value : '').join('');
          };
          const qname = (node: SyntaxElement): ExpandedName => {
            const lexical = scalar(node);
            try {
              const name = resolveLexicalQName(lexical, node);
              return name;
            } catch (error) {
              if (error instanceof SchemaLoadingError) return stop('protocol', 'SOAP Fault code QName');
              throw error;
            }
          };
          const codes: ExpandedName[] = [];
          let codeNode: SyntaxElement | undefined;
          let codeContainer: SyntaxElement | undefined = children[0]!;
          while (codeContainer) {
            check();
            const nested = shape(codeContainer);
            if (nested.length < 1 || nested.length > 2 || !same(nested[0]!.name, {namespace: SOAP, local: 'Value'})
              || nested[1] && !same(nested[1].name, {namespace: SOAP, local: 'Subcode'})) stop('protocol', 'SOAP 1.2 Fault Code');
            codeNode ??= nested[0]!;
            codes.push(qname(nested[0]!));
            codeContainer = nested[1];
          }
          const code = codes[0]!;
          if (code.namespace !== SOAP || !['VersionMismatch', 'MustUnderstand', 'DataEncodingUnknown', 'Sender', 'Receiver'].includes(code.local))
            stop('protocol', 'SOAP 1.2 Fault code');
          if (options.responseMetadata?.status === 400 && code.local !== 'Sender') stop('protocol', 'HTTP 400 requires SOAP Sender Fault');
          const reasonChildren = shape(children[1]!);
          if (!reasonChildren.length) stop('protocol', 'SOAP 1.2 Fault Reason');
          const reasons = reasonChildren.map(node => {
            check();
            if (!same(node.name, {namespace: SOAP, local: 'Text'})) stop('protocol', 'SOAP 1.2 Fault Reason Text');
            const text = scalar(node, true), lang = syntaxAttribute(node, 'lang', 'http://www.w3.org/XML/1998/namespace');
            if (lang === undefined || !/^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/.test(lang)) stop('protocol', 'SOAP 1.2 Fault language');
            return {lang: lang!, text};
          });
          const uriField = (local: 'Node' | 'Role'): string | undefined => {
            const node = children.find(n => n.name.local === local);
            if (!node) return undefined;
            const value = scalar(node).trim();
            if (!/^[A-Za-z][A-Za-z0-9+.-]*:[^\s]*$/.test(value)) stop('protocol', 'SOAP 1.2 Fault URI');
            return value;
          };
          const node = uriField('Node'), role = uriField('Role');
          const metadata: Soap12FaultMetadata = {version: '1.2', code, subcodes: codes.slice(1), reasons, string: reasons[0]!.text,
            ...(node === undefined ? {} : {node}), ...(role === undefined ? {} : {role})};
          const detailNode = children.find(n => n.name.local === 'Detail');
          // @see SOAP 1.2 section 5.4.5 permits attributes on Detail; these protocol-wrapper attributes stay in the original bytes.
          if (detailNode?.children.some(n => n.kind === 'text' && /[^\t\r\n ]/.test(n.value))) stop('protocol', 'SOAP 1.2 Fault Detail text');
          const detail = detailNode ? elements(detailNode) : [];
          const matches = contract.faults.filter(f => detail.some(n => same(f.root.element.name, n.name)));
          if (matches.length) {
            if (matches.length !== 1 || detail.length !== 1) stop('protocol', 'ambiguous SOAP Fault detail');
            faultInfo = directDataOwnership(budget).freeze({...metadata, name: matches[0]!.name, codeNode: codeNode!});
            return {payload: detail[0]!, mapping: faults.get(faultInfo.name)!};
          }
          protocolFault = directDataOwnership(budget).freeze(metadata);
          // @constraints Only protocol grammar was assessed; no fabricated application receipt is published.
          throw protocolFaultSignal;
        }
        const children = shape(payload);
        const names = children.map(n => n.name.namespace === '' ? n.name.local : '');
        const hasDetail = names.at(-1) === 'detail';
        if (!/^faultcode,faultstring(?:,faultactor)?(?:,detail)?$/.test(names.join(',')) || !hasDetail && !profile.soap11ProtocolFaults) {
          stop('protocol', 'SOAP Fault children');
        }
        const text = (node: SyntaxElement) => {
          if (node.attributes.some(a => !(node.name.local === 'faultstring' && a.name.namespace === 'http://www.w3.org/XML/1998/namespace' && a.name.local === 'lang')) || elements(node).length) stop('protocol', 'SOAP Fault scalar child');

          return node.children.map(n => n.kind === 'text' ? n.value : '').join('');
        };
        let code: ExpandedName;
        try {code = resolveLexicalQName(text(children[0]!), children[0]!);} catch (error) {
          if (error instanceof SchemaLoadingError) return stop('protocol', 'SOAP Fault code QName');
          throw error;
        }
        if (!code.namespace) stop('protocol', 'SOAP Fault code namespace required');
        const string = text(children[1]!);
        const actor = names[2] === 'faultactor' ? text(children[2]!) : undefined;
        const detail = hasDetail ? shape(children.at(-1)!) : [];
        if (!profile.soap11ProtocolFaults && detail.length !== 1) stop('protocol', 'one declared SOAP Fault detail required');
        const matches = contract.faults.filter(f => detail.some(node => same(f.root.element.name, node.name)));
        if (!matches.length && profile.soap11ProtocolFaults) {
          protocolFault = directDataOwnership(budget).freeze({version: '1.1', code, string, ...(actor === undefined ? {} : {actor})});
          throw protocolFaultSignal;
        }
        if (detail.length !== 1 || matches.length !== 1) stop('protocol', 'unknown or ambiguous SOAP Fault detail');
        faultInfo = {name: matches[0]!.name, code, codeNode: children[0]!, string, ...(actor === undefined ? {} : {actor})};
       directDataOwnership(budget).freeze(faultInfo);
        return {payload: detail[0]!, mapping: faults.get(faultInfo.name)!};
      }});
    let decoded: D | DirectCodecFailure | undefined;
    try {decoded = decodeResponse();} catch (error) {
      if (error !== protocolFaultSignal) throw error;
    }
    if (protocolFault && decoded === undefined) {
      check();
      return Object.freeze({kind: 'soap-fault', admitted: false, fault: protocolFault,
        ...(ignoredHeaders.length ? {ignoredHeaders: Object.freeze(ignoredHeaders)} : {}), usage: Object.freeze({...budget.usage()})});
    }
    if (!decoded) throw new TypeError('Missing decoded SOAP response');
    if (!('validated' in decoded)) return profile.component ? Object.freeze({...decoded, phase: 'response' as const})
      : Object.freeze({...fail(decoded.kind, decoded.rule), ...(decoded.diagnostic ? {diagnostic: decoded.diagnostic} : {})});
    check(); check();
    return Object.freeze({kind: faultInfo ? 'soap-fault' : 'soap-response', admitted: false, decoded,
      ...(faultInfo ? {fault: faultInfo} : {}),
      ...(ignoredHeaders.length ? {ignoredHeaders: Object.freeze(ignoredHeaders)} : {}), usage: Object.freeze({...budget.usage()})});
  } catch (error) {
    if (budget.exhausted()) return fail('resource-limit', 'response-budget', 'response');
    if (error instanceof DataOwnershipLimitError) return fail('resource-limit', error.message, 'response');
    if (signal?.aborted) return fail('cancelled', 'cooperative-cancellation', 'response');
    if (error instanceof Stop) return fail(error.kind, error.rule, 'response');
    if (error instanceof SchemaLoadingError) return fail(error.category === 'resource-limit' ? 'resource-limit' : error.category === 'invalid-schema' ? 'protocol' : 'unsupported', 'SOAP protocol XML', 'response');
    throw error;
  }
}

/** Select protocol-owned nodes without relabeling observed XML or granting value authority. */
function soapProtocolSelection(contract: DirectOperationContract, component: boolean, check: () => void,
  stop: (kind: DirectSoapFailure['kind'], rule: string) => never) {
  const soap12 = component && contract.binding.version === '1.2';
  const SOAP = soap12 ? 'http://www.w3.org/2003/05/soap-envelope' : SOAP11;
  const rpc = contract.binding.style === 'rpc';
    const elements = (node: SyntaxElement): SyntaxElement[] => {
     check();
      return node.children.filter((child): child is SyntaxElement => child.kind === 'element');
    };

    const shape = (node: SyntaxElement, encodedScope = false): SyntaxElement[] => {
      const children = elements(node);
      if (node.attributes.some(a => !(encodedScope && a.name.namespace === SOAP && a.name.local === 'encodingStyle'
        && a.value === 'http://schemas.xmlsoap.org/soap/encoding/')) || node.children.some(n => n.kind === 'text' && /[^\t\r\n ]/.test(n.value))) stop('protocol', 'SOAP protocol attributes or text');
      return children;
    };
    const ignoredHeaders: ExpandedName[] = [];
    const bodyRoot = (root: SyntaxElement, incoming = false): SyntaxElement => {
      if (!same(root.name, {namespace: SOAP, local: 'Envelope'})) stop('protocol', `SOAP ${contract.binding.version} Envelope required`);
      const children = shape(root, rpc);
      if (children[0]?.name.namespace === SOAP && children[0].name.local === 'Header') {
        if (component && incoming) {
          const assessed = assessComponentSoapHeader(children[0], check, contract.binding.version);
          if (assessed.kind !== 'ignored-optional-headers') stop(assessed.kind, assessed.rule);
          else for (const name of assessed.headers) {check(); ignoredHeaders.push(name);}
        } else if (shape(children[0]).length) stop('unsupported', 'incoming SOAP headers');
        children.shift();
      }
      if (children.length !== 1 || !same(children[0]!.name, {namespace: SOAP, local: 'Body'})) stop('protocol', 'one SOAP Body required');
      const body = shape(children[0]!, rpc);
      if (rpc && !body.some(n => same(n.name, {namespace: SOAP, local: 'Fault'}))) return children[0]!;
      if (body.length !== 1) stop('protocol', 'one SOAP Body payload required');
      return body[0]!;
    };

  return {elements, shape, bodyRoot, ignoredHeaders};
}
