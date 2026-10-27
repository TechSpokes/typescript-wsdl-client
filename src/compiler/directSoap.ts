/** Internal, one-retained-operation, unauthenticated loopback SOAP 1.1 adapter. */
import {Agent} from 'node:http';
import {types} from 'node:util';
import {WSDL} from 'soap/lib/wsdl/index.js';
import {Client} from 'soap/lib/client.js';
import {HttpClient} from 'soap/lib/http.js';
import {inspectDirectOperation} from './directOperation.js';
import type {DirectOperationContract} from './directOperation.js';
import {createDirectValueMapping, inspectDirectValueMapping} from './directValues.js';
import type {DirectValueMapping} from './directValues.js';
import {decodeDirectXml, encodeDirectXml, DIRECT_XML_LIMITS} from './directCodec.js';
import type {DirectCodecFailure, DirectDecodedXml, DirectXmlLimits} from './directCodec.js';
import {prepareDirectSoapSource, DirectSoapSourceError} from './directSoapSource.js';
import {isXmlNCName, resolveLexicalQName, SchemaLoadingError} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';
import type {ResolverUsage, SemanticBudget} from './semanticBudget.js';

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
}
export type DirectSoapResult = DirectSoapFailure | Readonly<{
  kind: 'soap-response' | 'soap-fault'; admitted: false;
  decoded: DirectDecodedXml;
  /** Actual bounded HTTP entity bytes, before any decoding; caller-owned data. */
  responseBytes: Uint8Array;
  status: number;
  fault?: Readonly<{name: string; code: ExpandedName; codeNode: SyntaxElement; string: string; actor?: string}>;
  usage: ResolverUsage;
}>;
class Stop extends Error {
  constructor(readonly kind: DirectSoapFailure['kind'], readonly rule: string) {super(rule);}
}
const same = (a: ExpandedName, b: ExpandedName) => a.namespace === b.namespace && a.local === b.local;

/** Shared entry guard: consumers must call before reading any SOAP option. */
export function directSoapOptionsShape(options: unknown, budget: SemanticBudget, check: () => void): string | undefined {
  budget.chargeWork(2048);
  if (!options || typeof options !== 'object' || types.isProxy(options)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(options) as object | null)) return 'data-only SOAP options required';
  const allowed = new Set(['service', 'port', 'endpoint', 'allowEndpoint', 'signal', 'timeoutMs', 'limits', 'capabilities']);
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
  const {context, source} = inspectDirectOperation(contract);
  const input = inspectDirectValueMapping(inputMapping, contract);
  if (input.direction.kind !== 'input') throw new TypeError('SOAP request requires the exact input mapping');
  const {budget} = context;
  const fail = (kind: DirectSoapFailure['kind'], rule: string): DirectSoapFailure => Object.freeze({kind, rule, usage: Object.freeze({...budget.usage()})});
  let signal: AbortSignal | undefined;
  const check = () => {budget.chargeWork(); if (signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');};
  const stop = (kind: DirectSoapFailure['kind'], rule: string): never => {throw new Stop(kind, rule);};
  let agent: Agent | undefined;
  let controller: AbortController | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const abort = () => controller?.abort();
  try {
    budget.chargeWork(8192); check();
    // Options are a closed capability surface. Never silently discard security,
    // headers, endpoint agents, redirects, streaming or other caller extensions.
    const optionRule = directSoapOptionsShape(options, budget, check);
    if (optionRule) return fail('unsupported', optionRule);
    signal = options.signal;
    if (signal !== undefined && !(signal instanceof AbortSignal)) return fail('unsupported', 'native AbortSignal required');
    const allowEndpoint = options.allowEndpoint;
    check();
    const config = budget.freeze(budget.snapshot({service: options.service, port: options.port, endpoint: options.endpoint,
      timeoutMs: options.timeoutMs ?? 15_000, limits: options.limits ?? {}, capabilities: options.capabilities ?? []}));
    if (!Array.isArray(config.capabilities) || config.capabilities.length) return fail('unsupported', 'SOAP capability');
    if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 2_147_483_647) throw new RangeError('SOAP timeout must be a positive timer integer');
    const limits = {...DIRECT_XML_LIMITS, ...config.limits};
    for (const [key, value] of Object.entries(limits)) {
      if (!['maxBytes', 'maxDepth', 'maxNodes', 'maxText'].includes(key) || !Number.isSafeInteger(value) || value < 1) throw new RangeError('Invalid SOAP XML limit');
    }
    // A capacity larger than representable reservation cannot fit the already
    // nonempty request budget. Exhaust through its normal sticky failure path.
    if (limits.maxBytes > Math.floor((Number.MAX_SAFE_INTEGER - 8192) / 16)) budget.chargeWork(Number.MAX_SAFE_INTEGER);
    if (typeof config.endpoint !== 'string' || typeof config.port !== 'string' || !isXmlNCName(config.port)
      || !config.service || typeof config.service.namespace !== 'string' || !isXmlNCName(config.service.local)) return fail('unsupported', 'explicit SOAP selection');
    const endpoint = new URL(config.endpoint);
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port || endpoint.port === '1'
      || endpoint.username || endpoint.password || endpoint.hash || endpoint.search) return fail('unsupported', 'owned loopback HTTP endpoint required');
    if (typeof allowEndpoint !== 'function' || allowEndpoint(new URL(endpoint.href)) !== true) return fail('unsupported', 'endpoint authorization');
    const action = contract.binding.action;
    budget.chargeWork(128 + action.length * 8);
    if (/[^\x20-\x21\x23-\x7e]|\\/.test(action)) return fail('unsupported', 'unsafe SOAPAction');
    const {wsdlText, original, bootstrapNodes} = prepareDirectSoapSource(contract, config, check);
    const elements = (node: SyntaxElement): SyntaxElement[] => {
      check(); budget.chargeWork(128 + node.children.length * 16 + node.attributes.length * 16);
      return node.children.filter((child): child is SyntaxElement => child.kind === 'element');
    };

    const encoded = encodeDirectXml(contract, input, application, {signal, limits});
    if (encoded.kind !== 'direct-encoded') return fail(encoded.kind, encoded.rule);
    const output = createDirectValueMapping(contract, {kind: 'output'}, {signal});
    if (output.kind !== 'direct-mapping') return fail(output.kind, output.rule);
    const faults = new Map<string, DirectValueMapping>();
    for (const fault of contract.faults) {
      check(); const mapping = createDirectValueMapping(contract, {kind: 'fault', name: fault.name}, {signal});
      if (mapping.kind !== 'direct-mapping') return fail(mapping.kind, mapping.rule);
      faults.set(fault.name, mapping);
    }
    const shape = (node: SyntaxElement): SyntaxElement[] => {
      const children = elements(node);
      if (node.attributes.length || node.children.some(n => n.kind === 'text' && /[^\t\r\n ]/.test(n.value))) stop('protocol', 'SOAP protocol attributes or text');
      return children;
    };
    const bodyRoot = (root: SyntaxElement): SyntaxElement => {
      if (!same(root.name, {namespace: SOAP, local: 'Envelope'})) stop('protocol', 'SOAP 1.1 Envelope required');
      const children = shape(root);
      if (children[0]?.name.namespace === SOAP && children[0].name.local === 'Header') {
        if (shape(children[0]).length) stop('unsupported', 'incoming SOAP headers');
        children.shift();
      }
      if (children.length !== 1 || !same(children[0]!.name, {namespace: SOAP, local: 'Body'})) stop('protocol', 'one SOAP Body required');
      const body = shape(children[0]!);
      if (body.length !== 1) stop('protocol', 'one SOAP Body payload required');
      return body[0]!;
    };
    // Reserve native dependency bootstrap's bounded retained source, maps and
    // envelope work before entering its non-cooperative synchronous routines.
    budget.chargeWork(8192 + original.byteLength * original.byteLength * 4);
    budget.reserveNodes(bootstrapNodes);
    const wsdl = new WSDL(wsdlText, source.root.uri, {wsdl_options: {overrideImportLocation: () => {throw new Stop('unsupported', 'dependency import forbidden');}}});
    await new Promise<void>((resolve, reject) => wsdl.onReady(error => error ? reject(error) : resolve()));
    check();
    // Reserve full native buffering, concatenation, request conversion, outgoing
    // syntax and publication copies before dispatch; no counter resets/retries.
    budget.chargeWork(8192 + limits.maxBytes * 16);
    agent = new Agent({keepAlive: false, maxSockets: 1});
    controller = new AbortController();
    signal?.addEventListener('abort', abort, {once: true});
    let timedOut = false;
    deadline = setTimeout(() => {timedOut = true; controller!.abort();}, config.timeoutMs);
    const complete = new Error('direct raw response captured');
    let response: {bytes: Buffer; status: number; contentType: string; encoding: string} | undefined;
    let hookFailure: unknown;
    class BufferedHttp extends HttpClient {
      override request(url: string, data: string, callback: (error: unknown) => void, headers: Record<string, string>, _options: Record<string, unknown>) {
        try {
          check();
          if (url !== endpoint.href || headers.SOAPAction !== `"${action}"` || headers['Content-Type'] !== 'text/xml; charset=utf-8') stop('protocol', 'dependency dispatch mismatch');
          budget.chargeWork(512 + data.length * 8);
          if (Buffer.byteLength(data) > limits.maxBytes) stop('resource-limit', 'SOAP request byte limit');
          const outgoing = decodeDirectXml(contract, input, Buffer.from(data), {signal, limits,
            uri: 'urn:typescript-wsdl-client:outgoing-soap', selectPayload: root => ({payload: bodyRoot(root), mapping: input})});
          if (outgoing.kind !== 'direct-decoded') stop(outgoing.kind, outgoing.rule);
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
          maxBodyLength: limits.maxBytes, proxy: false, httpAgent: agent, signal: controller!.signal, timeout: config.timeoutMs});
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
    const decoded = decodeDirectXml(contract, output, observed.bytes, {signal, limits, uri: endpoint.href,
      selectPayload: root => {
        const payload = bodyRoot(root);
        if (!same(payload.name, {namespace: SOAP, local: 'Fault'})) {
          if (observed.status !== 200) stop('protocol', 'HTTP 500 requires SOAP Fault');
          return {payload, mapping: output};
        }
        const children = shape(payload);
        const names = children.map(n => n.name.namespace === '' ? n.name.local : '');
        if (names.join(',') !== 'faultcode,faultstring,detail' && names.join(',') !== 'faultcode,faultstring,faultactor,detail') stop('protocol', 'SOAP Fault children');
        const text = (node: SyntaxElement) => {
          if (node.attributes.some(a => !(node.name.local === 'faultstring' && a.name.namespace === 'http://www.w3.org/XML/1998/namespace' && a.name.local === 'lang')) || elements(node).length) stop('protocol', 'SOAP Fault scalar child');
          budget.chargeWork(128 + node.children.reduce((sum, n) => sum + (n.kind === 'text' ? n.value.length * 8 : 0), 0));
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
        budget.freeze(faultInfo);
        return {payload: detail[0]!, mapping: faults.get(faultInfo.name)!};
      }});
    if (decoded.kind !== 'direct-decoded') return fail(decoded.kind, decoded.rule);
    check(); budget.chargeWork(4096); check();
    return Object.freeze({kind: faultInfo ? 'soap-fault' : 'soap-response', admitted: false, decoded,
      responseBytes: new Uint8Array(observed.bytes), status: observed.status, ...(faultInfo ? {fault: faultInfo} : {}), usage: Object.freeze({...budget.usage()})});
  } catch (error) {
    if (budget.exhausted()) return fail('resource-limit', 'request-budget');
    if (signal?.aborted) return fail('cancelled', 'cooperative-cancellation');
    if (error instanceof DirectSoapSourceError) return fail('unsupported', error.message);
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
