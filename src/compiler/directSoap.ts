import {isApplicationUnmetered} from './semanticBudget.js';
import {directDataOwnership, directLimit} from './directExecutionPolicy.js';
/** Shared retained-operation SOAP 1.1 exchange; profile-specific authority stays explicit. */
import {checkSemanticBudget} from './semanticBudget.js';
import {DataOwnershipLimitError} from './dataOwnership.js';
import {Agent} from 'node:http';
import {Agent as HttpsAgent} from 'node:https';
import {types} from 'node:util';
import {WSDL} from 'soap/lib/wsdl/index.js';
import {Client} from 'soap/lib/client.js';
import {HttpClient} from 'soap/lib/http.js';
import {inspectDirectOperation} from './directOperation.js';
import type {DirectOperationContract} from './directOperation.js';
import {createDirectValueMapping, inspectDirectValueMapping, createComponentValueMapping, inspectComponentValueMapping} from './directValues.js';
import type {DirectValueMapping, ComponentValueMapping} from './directValues.js';
import {decodeDirectXml, encodeDirectXml, decodeComponentXml, encodeComponentXml, DIRECT_XML_LIMITS} from './directCodec.js';
import type {DirectCodecFailure, DirectDecodedXml, ComponentDecodedXml, DirectXmlLimits} from './directCodec.js';
import {prepareDirectSoapSource, prepareComponentSoapWsdl, DirectSoapSourceError} from './directSoapSource.js';
import {isXmlNCName, resolveLexicalQName, SchemaLoadingError, syntaxElements, syntaxAttribute, WSDL_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';
import type {ResolverUsage} from './semanticBudget.js';
import {decodeComponentRecordXml, inspectComponentRecordProjection} from './componentRecordProjection.js';
import type {ComponentRecordProjection, ComponentRecordDecodedXml} from './componentRecordProjection.js';
import {assessComponentSoapHeader} from './soapHeaders.js';

const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
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
}
type SoapResult<D> = DirectSoapFailure | Readonly<{
  kind: 'soap-response' | 'soap-fault'; admitted: false;
  decoded: D;
  /** Actual bounded HTTP entity bytes, before any decoding; caller-owned data. */
  responseBytes: Uint8Array;
  status: number;
  fault?: Readonly<{name: string; code: ExpandedName; codeNode: SyntaxElement; string: string; actor?: string}>;
  /** Qualified optional response blocks ignored under SOAP 1.1; their application semantics were not assessed. */
  ignoredHeaders?: readonly ExpandedName[];
  usage: ResolverUsage;
}>;
export type DirectSoapResult = SoapResult<DirectDecodedXml>;
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
  return exchangeSoap<DirectValueMapping, DirectDecodedXml>(contract, input, application, options, {
    component: false, encode: encodeDirectXml, decode: decodeDirectXml, create: createDirectValueMapping,
    prepare: async (selection, check) => {
      const {source} = inspectDirectOperation(contract);
      const {wsdlText} = prepareDirectSoapSource(contract, selection, check);
      const wsdl = new WSDL(wsdlText, source.root.uri, {wsdl_options: {overrideImportLocation: () => {throw new Stop('unsupported', 'dependency import forbidden');}}});
      await new Promise<void>((resolve, reject) => wsdl.onReady(error => error ? reject(error) : resolve()));
      return wsdl;
    },
  });
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
  options: ComponentSoapOptions, responseProjection: ComponentRecordProjection): Promise<ComponentRecordSoapResult>;
export async function exchangeComponentSoap(contract: DirectOperationContract, inputMapping: unknown, application: unknown,
  options: ComponentSoapOptions, responseProjection?: ComponentRecordProjection): Promise<ComponentRecordSoapResult> {
  const {mapping: input} = inspectComponentValueMapping(inputMapping, contract);
  if (responseProjection !== undefined) {
    inspectComponentRecordProjection(responseProjection, contract);
    return exchangeSoap<ComponentValueMapping | ComponentRecordProjection, ComponentDecodedXml | ComponentRecordDecodedXml>(contract, input, application, options, {
      component: true,
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
        return direction.kind === 'output' ? responseProjection : createComponentValueMapping(owner, direction, controls);
      },
      prepare: (selection, check) => prepareComponentSoapWsdl(contract, selection, check),
    });
  }
  return exchangeSoap<ComponentValueMapping, ComponentDecodedXml>(contract, input, application, options, {
    component: true, encode: encodeComponentXml, decode: decodeComponentXml, create: createComponentValueMapping,
    prepare: (selection, check) => prepareComponentSoapWsdl(contract, selection, check),
  });
}

interface ExchangeProfile<M extends DirectValueMapping | ComponentValueMapping | ComponentRecordProjection,
  D extends DirectDecodedXml | ComponentDecodedXml | ComponentRecordDecodedXml> {
  component: boolean;
  encode(contract: DirectOperationContract, mapping: M, value: unknown, options: {signal?: AbortSignal; limits: DirectXmlLimits}):
    {bytes: Uint8Array} | DirectCodecFailure;
  decode(contract: DirectOperationContract, mapping: M, bytes: Uint8Array, options: {signal?: AbortSignal; limits: DirectXmlLimits;
    uri: string; selectPayload: (root: SyntaxElement) => {payload: SyntaxElement; mapping: M}}): D | DirectCodecFailure;
  create(contract: DirectOperationContract, direction: M['direction'], options: {signal?: AbortSignal}): M | DirectCodecFailure;
  prepare(selection: {service: ExpandedName; port: string}, check: () => void): Promise<WSDL>;
}
async function exchangeSoap<M extends DirectValueMapping | ComponentValueMapping | ComponentRecordProjection,
  D extends DirectDecodedXml | ComponentDecodedXml | ComponentRecordDecodedXml>(
  contract: DirectOperationContract, input: M, application: unknown, options: ComponentSoapOptions,
  profile: ExchangeProfile<M, D>): Promise<SoapResult<D>> {
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
      const addresses = ports.flatMap(p => syntaxElements(p, 'http://schemas.xmlsoap.org/wsdl/soap/', 'address'));
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

    if (/[^\x20-\x21\x23-\x7e]|\\/.test(action)) return fail('unsupported', 'unsafe SOAPAction');
    const elements = (node: SyntaxElement): SyntaxElement[] => {
     check();
      return node.children.filter((child): child is SyntaxElement => child.kind === 'element');
    };

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
    const shape = (node: SyntaxElement): SyntaxElement[] => {
      const children = elements(node);
      if (node.attributes.length || node.children.some(n => n.kind === 'text' && /[^\t\r\n ]/.test(n.value))) stop('protocol', 'SOAP protocol attributes or text');
      return children;
    };
    const ignoredHeaders: ExpandedName[] = [];
    const bodyRoot = (root: SyntaxElement, incoming = false): SyntaxElement => {
      if (!same(root.name, {namespace: SOAP, local: 'Envelope'})) stop('protocol', 'SOAP 1.1 Envelope required');
      const children = shape(root);
      if (children[0]?.name.namespace === SOAP && children[0].name.local === 'Header') {
        if (profile.component && incoming) {
          const assessed = assessComponentSoapHeader(children[0], check);
          if (assessed.kind !== 'ignored-optional-headers') stop(assessed.kind, assessed.rule);
          else for (const name of assessed.headers) {check(); ignoredHeaders.push(name);}
        } else if (shape(children[0]).length) stop('unsupported', 'incoming SOAP headers');
        children.shift();
      }
      if (children.length !== 1 || !same(children[0]!.name, {namespace: SOAP, local: 'Body'})) stop('protocol', 'one SOAP Body required');
      const body = shape(children[0]!);
      if (body.length !== 1) stop('protocol', 'one SOAP Body payload required');
      return body[0]!;
    };
    const wsdl = await profile.prepare(config, check);
    check();
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
          if (url !== endpoint.href || headers.SOAPAction !== `"${action}"` || headers['Content-Type'] !== 'text/xml; charset=utf-8') stop('protocol', 'dependency dispatch mismatch');

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
    const client = new Client(wsdl, endpoint.href, {httpClient: new BufferedHttp()});
    // Every lookup is own and explicit; the dependency's first-port shortcut is
    // never consulted. Source checks above bind these names to the native handle.
    const own = (object: object, key: string): unknown => Object.getOwnPropertyDescriptor(object, key)?.value;
    const service = own(client, config.service.local);
    const port = service && typeof service === 'object' ? own(service, config.port) : undefined;
    const method = port && typeof port === 'object' ? own(port, contract.selector.operation) : undefined;
    if (typeof method !== 'function') return fail('unsupported', 'dependency selected method unavailable');
    check();
    await new Promise<void>((resolve, reject) => method({_xml: Buffer.from(encoded.bytes).toString('utf8')}, (error: unknown) => error === complete ? resolve() : reject(error), {}, {SOAPAction: `"${action}"`}));
    check();
    if (timedOut) return fail('transport', 'SOAP deadline exceeded');
    if (hookFailure) throw hookFailure;
    if (!response) return fail('transport', 'incomplete HTTP response');
    const observed: {bytes: Buffer; status: number; contentType: string; encoding: string} = response;
    if (observed.encoding && observed.encoding.toLowerCase() !== 'identity') return fail('unsupported', 'HTTP compression');
    const media = /^text\/xml(?:\s*;\s*charset\s*=\s*(?:"(utf-8|utf-16|utf-16le|utf-16be)"|(utf-8|utf-16|utf-16le|utf-16be)))?\s*$/i.exec(observed.contentType);
    if (!media) return fail('protocol', 'SOAP response Content-Type');
    if (observed.status !== 200 && observed.status !== 500) return fail('transport', 'SOAP HTTP status');
    // Header charset is a protocol assertion, checked against actual BOM bytes.
    const charset = (media[1] ?? media[2])?.toLowerCase();
    const bom = observed.bytes[0] === 0xff && observed.bytes[1] === 0xfe ? 'utf-16le'
      : observed.bytes[0] === 0xfe && observed.bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    if (charset && charset !== bom && !(charset === 'utf-16' && bom.startsWith('utf-16'))) return fail('protocol', 'SOAP charset disagrees with bytes');
    let faultInfo: {name: string; code: ExpandedName; codeNode: SyntaxElement; string: string; actor?: string} | undefined;
    const decoded = profile.decode(contract, output, observed.bytes, {signal, limits, uri: endpoint.href,
      selectPayload: root => {
        const payload = bodyRoot(root, true);
        if (!same(payload.name, {namespace: SOAP, local: 'Fault'})) {
          if (observed.status !== 200) stop('protocol', 'HTTP 500 requires SOAP Fault');
          return {payload, mapping: output};
        }
        const children = shape(payload);
        const names = children.map(n => n.name.namespace === '' ? n.name.local : '');
        if (names.join(',') !== 'faultcode,faultstring,detail' && names.join(',') !== 'faultcode,faultstring,faultactor,detail') stop('protocol', 'SOAP Fault children');
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
        const detail = shape(children.at(-1)!);
        if (detail.length !== 1) stop('protocol', 'one declared SOAP Fault detail required');
        const matches = contract.faults.filter(f => same(f.root.element.name, detail[0]!.name));
        if (matches.length !== 1) stop('protocol', 'unknown or ambiguous SOAP Fault detail');
        faultInfo = {name: matches[0]!.name, code, codeNode: children[0]!, string, ...(actor === undefined ? {} : {actor})};
       directDataOwnership(budget).freeze(faultInfo);
        return {payload: detail[0]!, mapping: faults.get(faultInfo.name)!};
      }});
    if (!('validated' in decoded)) return fail(decoded.kind, decoded.rule, 'response');
    check(); check();
    return Object.freeze({kind: faultInfo ? 'soap-fault' : 'soap-response', admitted: false, decoded,
      responseBytes: new Uint8Array(observed.bytes), status: observed.status, ...(faultInfo ? {fault: faultInfo} : {}),
      ...(ignoredHeaders.length ? {ignoredHeaders: Object.freeze(ignoredHeaders)} : {}), usage: Object.freeze({...budget.usage()})});
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
