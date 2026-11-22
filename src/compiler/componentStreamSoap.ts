/** Incremental SOAP 1.1 response validation over an owned HTTP exchange.
 * @since Unreleased
 * @constraints The parser retains the selected item and the active wrapper state independently of socket buffering.
 */
import {request as httpRequest, type IncomingMessage} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {SaxesParser} from 'saxes';
import {XML_NAMESPACE, resolveComponentXmlBase, SchemaLoadingError, syntaxAttribute, type SyntaxElement, type SyntaxNode} from '../loader/orderedSyntax.js';
import {CheckedStreamError, type CheckedStreamCompletion} from '../client/checkedStream.js';
import type {DirectClientFailure} from '../client/directClientRuntime.js';
import type {ElementNode} from './canonicalGraph.js';
import {encodeComponentXml, type DirectXmlLimits} from './directCodec.js';
import {inspectDirectOperation} from './directOperation.js';
import {selectedComponentSoapAddress, inspectComponentSoapResponse, type ComponentSoapOptions} from './directSoap.js';
import {matchDirectProjection} from './directStructure.js';
import {createFlatProjectionCursor, createOrderedProjectionCursor} from './directStructurePlan.js';
import {assessProjectionScalars} from './directValues.js';
import {assessComponentSoapHeader, assessReceiverWrapper} from './soapHeaders.js';
import type {ComponentStreamPlan} from './componentStreamPlan.js';
import {createComponentRecordWrapperCursor} from './componentRecordProjection.js';
import {assessStandardSchemaElement, type StandardSchemaElementDeclaration} from './standardSchemaComponents.js';

const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const xmlWhitespace = /^[\t\r\n ]*$/;
const same = (a: SyntaxElement['name'], b: SyntaxElement['name']) => a.namespace === b.namespace && a.local === b.local;
const soapElement = (node: SyntaxElement, local: string) => node.name.namespace === SOAP && node.name.local === local;
type BuildingNode = Omit<SyntaxElement, 'children'> & {children: SyntaxNode[]};
export interface CheckedStreamXmlLimits extends DirectXmlLimits {
  /** Inclusive UTF-8 bytes of one selected record, including its opening and closing tags. */
  readonly maxRecordBytes?: number;
  /** Inclusive UTF-8 bytes of a single retained subtree or unfinished XML token. */
  readonly maxRetainedBytes?: number;
}

/** Drive a credential-free document SOAP exchange from consumer demand.
 * @param plan Source-bound operation and response selection.
 * @param inputMapping Authenticated native mapping for the operation's request.
 * @param value Application request before native validation.
 * @param options Endpoint authority, abort signal and optional caller limits.
 * @returns Validated items and the terminal outcome after XML and HTTP completion.
 * @throws CheckedStreamError For an explicit refusal or a failed exchange.
 */
export async function* exchangeComponentStream(plan: ComponentStreamPlan, inputMapping: unknown, value: unknown,
  options: ComponentSoapOptions & {limits?: CheckedStreamXmlLimits}):
  AsyncGenerator<unknown, CheckedStreamCompletion> {
  const {contract} = plan;
  const {context} = inspectDirectOperation(contract);
  const {signal} = options;
  if (options.limits !== undefined && (!options.limits || typeof options.limits !== 'object' || Array.isArray(options.limits)))
    return {kind: 'unsupported', rule: 'invalid checked stream limits', usage: context.budget.usage()};
  const {maxRecordBytes, maxRetainedBytes, ...limits} = options.limits ?? {};
  const usage = () => context.budget.usage();
  const stop = (kind: DirectClientFailure['kind'], rule: string, phase?: 'input' | 'response'): never => {
    throw new CheckedStreamError({kind, rule, phase, usage: usage()});
  };
  const check = () => {if (signal?.aborted) stop('cancelled', 'cooperative-cancellation'); context.budget.chargeWork();};
  const timeout = options.timeoutMs === undefined ? 0 : options.timeoutMs;
  if (!Number.isSafeInteger(timeout) || timeout < 0 || timeout > 2_147_483_647 ||
      Object.entries(limits).some(([key, n]) => !['maxBytes', 'maxDepth', 'maxNodes', 'maxText'].includes(key) || !Number.isSafeInteger(n) || n < 1)
      || [maxRecordBytes, maxRetainedBytes].some(n => n !== undefined && (!Number.isSafeInteger(n) || n < 1)))
    return stop('unsupported', 'invalid checked stream limits');
  if (options.upstream !== undefined || options.headerValues !== undefined || options.headerProcessors !== undefined ||
      options.httpResponseHeaders !== undefined || options.capabilities !== undefined && (!Array.isArray(options.capabilities) || options.capabilities.length))
    return stop('unsupported', 'checked stream request security, header or capability profile');
  let endpoint: URL;
  try {endpoint = new URL(options.endpoint ?? selectedComponentSoapAddress(contract, options) ?? '');}
  catch {return stop('unsupported', 'explicit HTTP(S) endpoint required');}
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash)
    return stop('unsupported', 'explicit HTTP(S) endpoint required');
  if (options.ca !== undefined && (typeof options.ca !== 'string' || endpoint.protocol !== 'https:'))
    return stop('unsupported', 'HTTPS PEM trust anchor required');
  if (contract.policy?.kind === 'https-transport' && (endpoint.protocol !== 'https:' || !['Strict', 'Lax'].includes(contract.policy.layout)))
    return stop('unsupported', 'checked stream SOAP transport policy');
  if (typeof options.allowEndpoint !== 'function' || options.allowEndpoint(new URL(endpoint.href)) !== true)
    return stop('unsupported', 'endpoint authorization');
  const action = contract.binding.action;
  if (/[^\x20-\x21\x23-\x7e]|\\/.test(action)) return stop('unsupported', 'unsafe SOAPAction');
  const encoded = encodeComponentXml(contract, inputMapping, value, {signal, limits});
  if (!('bytes' in encoded)) throw new CheckedStreamError({kind: encoded.kind, rule: encoded.rule, phase: 'input',
    usage: encoded.usage, ...(encoded.diagnostic ? {diagnostic: encoded.diagnostic} : {})});
  const body = Buffer.concat([Buffer.from(`<s:Envelope xmlns:s="${SOAP}"><s:Body>`), encoded.bytes, Buffer.from('</s:Body></s:Envelope>')]);
  // @constraints Use a prefixed envelope to preserve the native encoder's no-namespace names.
  if (body.length > (limits?.maxBytes ?? Infinity)) return stop('resource-limit', 'SOAP request byte limit', 'input');
  check();

  const makeRequest = endpoint.protocol === 'https:' ? httpsRequest : httpRequest;
  const request = makeRequest(endpoint, {method: 'POST', agent: false, signal, rejectUnauthorized: true, ca: options.ca,
    headers: {'content-type': 'text/xml; charset=utf-8', 'content-length': body.length, soapaction: `"${action}"`, 'accept-encoding': 'identity'}});
  const headers = new Promise<IncomingMessage>((resolve, reject) => {
    request.once('response', resolve);
    // Retain the error handler through destruction, including errors after the response event.
    request.on('error', reject);
  });
  let timedOut = false;
  async function demanded<T>(next: Promise<T>): Promise<T> {
    const timer = timeout ? setTimeout(() => {timedOut = true; request.destroy(new Error('SOAP upstream inactivity'));}, timeout) : undefined;
    try {return await next;} finally {clearTimeout(timer);}
  }
  let response: IncomingMessage | undefined;
  try {
    request.end(body);
    response = await demanded(headers);
    const status = response.statusCode!;
    const contentType = response.headers['content-type'] ?? '';
    const contentEncoding = response.headers['content-encoding'];
    if (status !== 200 && status !== 500) return stop('transport', 'SOAP HTTP status');
    if (contentEncoding !== undefined && contentEncoding.toLowerCase() !== 'identity') return stop('unsupported', 'HTTP compression');
    if (!/^text\/xml(?:\s*;\s*charset\s*=\s*(?:"utf-?8"|utf-?8))?\s*$/i.test(contentType) ||
        (response.headersDistinct['content-type']?.length ?? 0) !== 1)
      return stop('protocol', 'SOAP response Content-Type');
    const transfer = response.headers['transfer-encoding'];
    if (transfer !== undefined && transfer.toLowerCase() !== 'chunked') return stop('unsupported', 'HTTP transfer encoding');
    const incoming = response;
    const iterator = incoming[Symbol.asyncIterator]();
    return yield* decodeComponentStream(plan, inputMapping, {contentType, status, contentEncoding, retrievalUri: endpoint.href},
      {signal, ...limits, maxRecordBytes, maxRetainedBytes}, () => demanded(iterator.next()), () => incoming.complete);
  } catch (error) {
    if (error instanceof CheckedStreamError) throw error;
    if (signal?.aborted) return stop('cancelled', 'cooperative-cancellation');
    if (context.budget.exhausted()) return stop('resource-limit', 'request-budget', 'response');
    const code = (error as NodeJS.ErrnoException | null)?.code;
    const diagnostic = code && /^[A-Z][A-Z0-9_]+$/.test(code) ? ' (' + code + ')' : '';
    return stop('transport', timedOut ? 'SOAP upstream inactivity' : 'incomplete or failed SOAP HTTP exchange' + diagnostic, 'response');
  } finally {
    response?.destroy();
    request.destroy();
  }
}

/** Decode one response episode through the native particle and scalar owners.
 * @param plan Source-bound response selection.
 * @param inputMapping Native operation input mapping for selecting declared SOAP faults.
 * @param metadata Observed status, media and retrieval base after transport admission.
 * @param controls Caller limits and cancellation.
 * @param read Pull one entity chunk.
 * @param framingComplete Confirm clean framing after entity EOF.
 * @returns Validated items and complete or fault outcome.
 * @throws CheckedStreamError For response validation, framing, cancellation or resource failure.
 */
export async function* decodeComponentStream(plan: ComponentStreamPlan, inputMapping: unknown,
  metadata: {status: number; contentType: string; contentEncoding?: string; retrievalUri: string},
  controls: CheckedStreamXmlLimits & {signal?: AbortSignal},
  read: () => Promise<IteratorResult<Uint8Array>>, framingComplete: () => boolean): AsyncGenerator<unknown, CheckedStreamCompletion> {
  const {contract} = plan;
  const {context} = inspectDirectOperation(contract);
  const {signal, maxRecordBytes, maxRetainedBytes, ...limits} = controls;
  const stop = (kind: DirectClientFailure['kind'], rule: string, phase?: 'input' | 'response'): never => {
    throw new CheckedStreamError({kind, rule, phase, usage: context.budget.usage()});
  };
  const check = () => {if (signal?.aborted) stop('cancelled', 'cooperative-cancellation'); context.budget.chargeWork();};
  const decoder = new TextDecoder('utf-8', {fatal: true});
  const parser = new SaxesParser({xmlns: true});
  const stack: Frame[] = [];
  let nodes = 0, textUnits = 0, totalBytes = 0;
  let lastTagStart = 0, lastEvent = 0;
  let commentEnding = false;
  let retained: {start: number; item: boolean} | undefined;
  let first = true, bodySeen = false, headerSeen = false, payloadSeen = false;
  let fault = false, count = 0;
  let ready: IteratorYieldResult<unknown> | undefined;
  let faultBytes: Buffer[] | undefined = [];
  const outer = plan.outer && createComponentRecordWrapperCursor(plan.outer, check);
  const recordContext = inspectDirectOperation(plan.recordContract).context;
  type WrapperCursor = {push(name: SyntaxElement['name']): ElementNode | undefined; end(): boolean};
  type Frame = {
    node: BuildingNode; role: 'envelope' | 'body' | 'header' | 'header-content' | 'outer' | 'wrapper' | 'capture' | 'fault';
    cursor?: WrapperCursor; wrapperIndex?: number; captureRoot?: {declaration: ElementNode; item: boolean};
    standard?: StandardSchemaElementDeclaration;
  };
  const reserveNode = () => {
    if (++nodes > (limits?.maxNodes ?? Infinity)) stop('resource-limit', 'XML node limit', 'response');
  };
  const assess = (element: ElementNode, payload: SyntaxElement, wrapperAttributesOnly = false) => {
    const match = matchDirectProjection(recordContext, element, payload, {signal, wrapperAttributesOnly});
    if (match.kind !== 'projection-match') return stop(match.kind, match.rule, 'response');
    const result = assessProjectionScalars(recordContext, match, {signal, maxText: limits?.maxText, maxItems: limits?.maxNodes});
    if (result.kind !== 'projection-value') return stop(result.kind, result.rule, 'response');
    return result.value;
  };
  const startWrapper = (node: BuildingNode, index: number): Frame => {
    const wrapper = plan.wrappers[index]!;
    assess(wrapper.element, node, true);
    const record = wrapper.record;
    let cursor: WrapperCursor;
    if (record.ordered) {
      const ordered = createOrderedProjectionCursor(recordContext, record, () => {
        check();
        if (recordContext !== context) recordContext.budget.chargeWork();
      });
      cursor = {push: name => ordered.push(name)?.element, end: () => ordered.end()};
    } else {
      const flat = createFlatProjectionCursor(record.slots, check);
      cursor = {push(name) {const next = flat.push(name); return next.kind === 'selected' ? next.slot.element : undefined;},
        end: () => !flat.end()};
    }
    return {node, role: 'wrapper', wrapperIndex: index, cursor};
  };
  const reserveWrapper = (node: SyntaxElement) => {
    const refusal = assessReceiverWrapper(node, '1.1', check);
    if (refusal) stop(refusal.kind, refusal.rule, 'response');
  };
  parser.on('error', () => stop('xml-invalid', 'Malformed XML or unresolved entity reference', 'response'));
  parser.on('doctype', () => stop('unsupported', 'DTDs and entity declarations are forbidden', 'response'));
  parser.on('xmldecl', declaration => {
    lastEvent = totalBytes;
    if (declaration.version !== '1.0' || declaration.encoding && !/^utf-?8$/i.test(declaration.encoding))
      stop('unsupported', 'Only XML 1.0 UTF-8 is supported', 'response');
  });
  parser.on('processinginstruction', () => {lastEvent = totalBytes;});
  // @why Saxes reports comment text at "--", before consuming the final ">".
  parser.on('comment', () => {commentEnding = true;});
  function retain(item: boolean) {
    retained = {start: lastTagStart, item};
    checkRetained();
  }
  function checkRetained() {
    if (!retained) return;
    const bytes = totalBytes - retained.start;
    if (retained.item && bytes > (maxRecordBytes ?? Infinity)) stop('resource-limit', 'SOAP stream record byte limit', 'response');
    if (bytes > (maxRetainedBytes ?? Infinity)) stop('resource-limit', 'SOAP stream retained XML byte limit', 'response');
  }
  parser.on('opentag', tag => {
    check(); reserveNode();
    lastEvent = totalBytes;
    if (stack.length >= (limits?.maxDepth ?? Infinity)) stop('resource-limit', 'XML syntax depth limit', 'response');
    const parent = stack.at(-1);
    const attributes = Object.values(tag.attributes).filter(a => a.uri !== XMLNS)
      .map(a => ({name: {namespace: a.uri, local: a.local}, lexicalName: a.name, value: a.value}));
    const namespaces = Object.assign(Object.create(null), parent?.node.namespaces ?? {xml: XML_NAMESPACE, '': ''}, tag.ns);
    let baseUri = parent?.node.baseUri ?? metadata.retrievalUri;
    const rawBase = attributes.find(a => a.name.namespace === XML_NAMESPACE && a.name.local === 'base')?.value;
    if (rawBase !== undefined) {
      try {baseUri = resolveComponentXmlBase(rawBase, baseUri, amount => {check(); context.budget.chargeWork(amount);});}
      catch (error) {
        if (error instanceof SchemaLoadingError) return stop('xml-invalid', error.message, 'response');
        throw error;
      }
    }
    const position = {offset: parser.position, line: parser.line, column: parser.column};
    const node: BuildingNode = {kind: 'element', name: {namespace: tag.uri, local: tag.local}, lexicalName: tag.name,
      attributes, namespaces, baseUri, children: [], source: {uri: 'urn:checked-stream:response', digest: '', path: '/'+stack.length, start: position, end: position}};
    if (!parent) {
      if (!soapElement(node, 'Envelope')) return stop('protocol', 'SOAP 1.1 Envelope required', 'response');
      reserveWrapper(node);
      stack.push({node, role: 'envelope'});
    } else if (parent.role === 'envelope') {
      if (!bodySeen && !headerSeen && soapElement(node, 'Header')) {
        headerSeen = true; reserveWrapper(node); stack.push({node, role: 'header'});
      } else if (!bodySeen && soapElement(node, 'Body')) {
        bodySeen = true; reserveWrapper(node); stack.push({node, role: 'body'});
      } else return stop('protocol', 'one SOAP Body required', 'response');
    } else if (parent.role === 'header') {
      const header = assessComponentSoapHeader({...parent.node, children: [node]}, check, '1.1', [stack[0]!.node], metadata.retrievalUri);
      if (header.kind !== 'ignored-optional-headers') return stop(header.kind, header.rule, 'response');
      stack.push({node, role: 'header-content'});
    } else if (parent.role === 'header-content') {
      stack.push({node, role: 'header-content'});
    } else if (parent.role === 'body') {
      if (payloadSeen) return stop('protocol', 'one SOAP Body payload required', 'response');
      payloadSeen = true;
      let encoding = '';
      for (const entry of [...stack.map(frame => frame.node), node])
        encoding = syntaxAttribute(entry, 'encodingStyle', SOAP) ?? encoding;
      if (!xmlWhitespace.test(encoding)) return stop('unsupported', 'SOAP 1.1 response encodingStyle', 'response');
      if (soapElement(node, 'Fault')) {
        fault = true; stack.push({node, role: 'fault'});
      } else {
        if (metadata.status !== 200) return stop('protocol', 'HTTP 500 requires SOAP Fault', 'response');
        if (!same(node.name, plan.outer?.root.element.name ?? plan.wrappers[0]!.element.name))
          return stop('mismatch', 'checked stream response wrapper', 'response');
        faultBytes = undefined;
        if (outer) {
          if (node.attributes.length) return stop('mismatch', 'record-wrapper-attributes-or-text', 'response');
          stack.push({node, role: 'outer'});
        } else stack.push(startWrapper(node, 0));
      }
    } else if (parent.role === 'outer') {
      const child = outer!.push(node.name);
      if (child.kind === 'mismatch') return stop(child.kind, child.rule, 'response');
      if (child.kind === 'standard') {
        retain(false);
        stack.push({node, role: 'capture', standard: child.declaration});
      }
      else stack.push(startWrapper(node, 0));
    } else if (parent.role === 'wrapper') {
      const declaration = parent.cursor!.push(node.name);
      if (!declaration) return stop('mismatch', 'checked stream wrapper particle language', 'response');
      const nextIndex = parent.wrapperIndex! + 1;
      if (declaration === plan.wrappers[nextIndex]?.element) stack.push(startWrapper(node, nextIndex));
      else {
        const item = nextIndex === plan.wrappers.length && declaration === plan.item;
        retain(item);
        stack.push({node, role: 'capture', captureRoot: {declaration, item}});
      }
    } else {
      if (parent.role !== 'fault') parent.node.children.push(node);
      stack.push({node, role: parent.role === 'fault' ? 'fault' : 'capture'});
    }
  });
  const appendText = (text: string) => {
    check();
    const frame = stack.at(-1);
    if (!frame || frame.role === 'fault') return;
    if (textUnits + text.length > (limits?.maxText ?? Infinity)) stop('resource-limit', 'XML text limit', 'response');
    textUnits += text.length;
    reserveNode();
    if (frame.role === 'capture') frame.node.children.push({kind: 'text', value: text, source: frame.node.source});
    else if (frame.role !== 'header-content' && !xmlWhitespace.test(text)) stop('mismatch', 'unexpected text in SOAP or response wrapper', 'response');
  };
  parser.on('text', appendText);
  parser.on('cdata', text => {appendText(text); lastEvent = totalBytes;});
  parser.on('closetag', () => {
    check();
    lastEvent = totalBytes;
    const frame = stack.pop()!;
    if (frame.role === 'envelope' && !bodySeen || frame.role === 'body' && !payloadSeen)
      return stop('protocol', 'missing SOAP Body or payload', 'response');
    if (frame.cursor && !frame.cursor.end()) return stop('mismatch', 'incomplete checked stream wrapper', 'response');
    if (frame.role === 'outer' && !outer!.end()) return stop('mismatch', 'record-wrapper-child-count', 'response');
    if (frame.standard) {
      retained = undefined;
      const assessed = assessStandardSchemaElement(frame.standard, frame.node, context.budget, {signal, check});
      if (assessed.kind !== 'schema-element-instance') return stop(assessed.kind, assessed.kind === 'resource-limit' ? 'record-standard-budget' : assessed.rule, 'response');
      if (assessed.remaining.length) return stop('unsupported', 'record-standard-instance-obligations', 'response');
    }
    if (frame.captureRoot) {
      retained = undefined;
      const value = assess(frame.captureRoot.declaration, frame.node);
      if (frame.captureRoot.item) {
        ready = {done: false, value};
        count++;
      }
    }
  });
  function decode(piece?: Uint8Array): string {
    try {return decoder.decode(piece, {stream: piece !== undefined});}
    catch {return stop('xml-invalid', 'Invalid UTF-8 SOAP response bytes', 'response');}
  }

  for (;;) {
    const next = await read();
    if (next.done) break;
    const chunk = next.value;
    // @why A malformed suffix in the same socket read must preserve an already validated prefix.
    for (let offset = 0; offset < chunk.length;) {
      const max = Math.min(offset + 16_384, chunk.length);
      const found = chunk.subarray(offset, max).indexOf(0x3e);
      const end = found === -1 ? max : offset + found + 1;
      const piece = chunk.subarray(offset, end);
      offset = end;
      const opener = piece.lastIndexOf(0x3c);
      if (opener !== -1) lastTagStart = totalBytes + opener;
      totalBytes += piece.byteLength;
      if (totalBytes > (limits?.maxBytes ?? Infinity)) return stop('resource-limit', 'SOAP response byte limit', 'response');
      if ((faultBytes && totalBytes > (maxRetainedBytes ?? Infinity)) || totalBytes - lastEvent > (maxRetainedBytes ?? Infinity))
        return stop('resource-limit', 'SOAP stream retained XML byte limit', 'response');
      checkRetained();
      faultBytes?.push(Buffer.from(piece));
      const decoded = decode(piece);
      if (first && decoded) {
        first = false;
        if (decoded.startsWith('\ufeff')) return stop('xml-invalid', 'Multiple XML byte order marks', 'response');
      }
      parser.write(decoded);
      if (commentEnding && piece[piece.length - 1] === 0x3e) {
        commentEnding = false;
        lastEvent = totalBytes;
      }
      const item = ready;
      if (item) {ready = undefined; yield (item as IteratorYieldResult<unknown>).value;}
    }
  }
  if (!framingComplete()) return stop('transport', 'incomplete SOAP HTTP framing', 'response');
  parser.write(decode()).close();
  if (fault && faultBytes) {
    const result = inspectComponentSoapResponse(contract, inputMapping, Buffer.concat(faultBytes), {limits: {
      maxBytes: Number.MAX_SAFE_INTEGER, maxText: Number.MAX_SAFE_INTEGER, maxNodes: Number.MAX_SAFE_INTEGER,
      maxDepth: Number.MAX_SAFE_INTEGER, ...limits}, signal, responseProjection: plan.outer,
      responseMetadata: metadata});
    if (result.kind === 'soap-fault' && result.fault) {
      const {code, string, actor} = result.fault as {code: SyntaxElement['name']; string: string; actor?: string};
      return {kind: 'soap-fault', fault: {version: '1.1', code, string, ...(actor === undefined ? {} : {actor}),
        ...('name' in result.fault ? {name: result.fault.name} : {})}, ...(result.decoded ? {value: result.decoded.validated.value} : {})};
    }
    if ('rule' in result) return stop(result.kind, result.rule, 'response');
    return stop('protocol', 'invalid SOAP Fault outcome', 'response');
  }
  return {kind: 'complete', scope: plan.spec.scope, records: count};
}
