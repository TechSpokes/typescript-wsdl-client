/** Source-owned literal SOAP header encoding, schema assessment and explicit receiver acknowledgement.
 * @since Unreleased
 * @constraints Schema validity alone never establishes header semantics or incoming WS-Security verification.
 */
import {types} from 'node:util';
import {inspectDirectOperation} from './directOperation.js';
import type {ComponentSoapHeaderDeclaration, DirectOperationContract} from './directOperation.js';
import {createComponentDirectionalMapping, inspectComponentValueMapping, sameScopedQNameWords} from './directValues.js';
import type {ComponentValueMapping, DirectAssessedScalar} from './directValues.js';
import {encodeComponentXml, assessParsedComponentHeaderPayload} from './directCodec.js';
import type {DirectCodecFailure, DirectXmlLimits} from './directCodec.js';
import {directDataOwnership} from './directExecutionPolicy.js';
import {assessComponentSoapHeader} from './soapHeaders.js';
import {collapseXmlWhitespace, resolveReceiverRole} from './soapReceiverUri.js';
import {syntaxAttribute, syntaxElements} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';
import type {ResolverUsage} from './semanticBudget.js';

export interface ComponentHeaderProcessingContext {
  readonly id: string;
  readonly kind: 'header' | 'header-fault';
  readonly direction: 'input' | 'output';
  readonly message: ExpandedName;
  readonly part: string;
  readonly element: ExpandedName;
  readonly mandatory: boolean;
  readonly signal?: AbortSignal;
}
/** A synchronous consumer implementation acknowledges only after consuming/verifying the native value. */
export type ComponentHeaderProcessor = (value: unknown, context: ComponentHeaderProcessingContext) => true;
export type ComponentHeaderProcessors = Readonly<Record<string, ComponentHeaderProcessor>>;
type HeaderFailure = Readonly<{kind: 'protocol' | 'unsupported' | 'value-invalid' | 'cancelled'; rule: string; usage: ResolverUsage}>;
type HeaderOptions = Readonly<{signal?: AbortSignal; limits?: DirectXmlLimits}>;
type EncodedHeaderBlock = Readonly<{id: string; xml: string}>;
const scopedHeaderOperands = new WeakMap<EncodedHeaderBlock, Readonly<{mapping: ComponentValueMapping; operands: readonly DirectAssessedScalar[]}>>();

function ownRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value) as object | null))
    throw new TypeError('Own data header configuration required');
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor || !('value' in descriptor)) throw new TypeError('Own data header configuration required');
    result[key] = descriptor.value;
  }
  return result;
}

/** Snapshot callable processing capabilities separately from serializable credential and header-value data.
 * @returns A fresh immutable own map; missing configuration grants no processing semantics.
 * @throws TypeError For proxies, accessors or non-callable entries.
 */
export function snapshotComponentHeaderProcessors(value: unknown): ComponentHeaderProcessors {
  const entries = ownRecord(value), result: Record<string, ComponentHeaderProcessor> = Object.create(null) as Record<string, ComponentHeaderProcessor>;
  for (const [id, processor] of Object.entries(entries)) {
    if (typeof processor !== 'function' || types.isProxy(processor)) throw new TypeError('Explicit SOAP header processor required');
    result[id] = processor as ComponentHeaderProcessor;
  }
  return Object.freeze(result);
}

/** Encode all selected outgoing header parts through the exact request mapping presentation.
 * @returns Native UTF-8 blocks or a terminal source/value refusal before transport dispatch.
 */
export function encodeDeclaredComponentHeaders(contract: DirectOperationContract, inputMapping: ComponentValueMapping, supplied: unknown,
  options: HeaderOptions = {}): Readonly<{kind: 'encoded-component-headers'; blocks: readonly EncodedHeaderBlock[]; usage: ResolverUsage}> | DirectCodecFailure | HeaderFailure {
  const {context: {budget}} = inspectDirectOperation(contract);
  inspectComponentValueMapping(inputMapping, contract);
  const fail = (kind: HeaderFailure['kind'], rule: string): HeaderFailure => ({kind, rule, usage: budget.usage()});
  let values: Record<string, unknown>;
  try {values = supplied === undefined ? Object.create(null) as Record<string, unknown> : ownRecord(supplied);}
  catch {return fail('unsupported', 'data-only SOAP header values required');}
  const selected = contract.headers?.filter(header => header.direction === 'input' && header.kind === 'header') ?? [];
  if (Object.keys(values).some(id => !selected.some(header => header.id === id))) return fail('unsupported', 'unknown outgoing SOAP header declaration');
  const blocks: EncodedHeaderBlock[] = [];
  for (const header of selected) {
    budget.chargeWork(128 + header.id.length * 4);
    if (options.signal?.aborted) return fail('cancelled', 'cooperative-cancellation');
    if (!Object.hasOwn(values, header.id)) return fail('value-invalid', 'missing declared SOAP header value');
    const mapping = createComponentDirectionalMapping(contract, inputMapping, {kind: 'header', id: header.id}, options);
    if (mapping.kind !== 'component-mapping') return mapping;
    const encoded = encodeComponentXml(contract, mapping, values[header.id], options);
    if (encoded.kind !== 'component-encoded') return encoded;
    const block = {id: header.id, xml: Buffer.from(encoded.bytes).toString('utf8')};
    if ('operands' in encoded.expanded.validated
      && encoded.expanded.validated.operands.some(operand => operand.builtin.local === 'QName' && operand.retainLexical))
      scopedHeaderOperands.set(block, {mapping, operands: encoded.expanded.validated.operands});
    blocks.push(block);
  }
  return Object.freeze({kind: 'encoded-component-headers', blocks: directDataOwnership(budget).freeze(blocks), usage: budget.usage()});
}

/** Reassess scoped QName words in declared headers after SOAP adds inherited namespace declarations.
 * @param contract Authenticated operation owning the encoded blocks.
 * @param root Codec-owned assembled SOAP envelope.
 * @param blocks Exact encoded declaration blocks in writer order.
 * @param options Request cancellation and limits.
 * @returns Whether each scoped header matches its original native operands.
 */
export function outgoingQNameHeaderScopesAgree(contract: DirectOperationContract, root: SyntaxElement,
  blocks: readonly EncodedHeaderBlock[], options: HeaderOptions): boolean {
  if (!blocks.some(block => scopedHeaderOperands.has(block))) return true;
  const {context: {budget}} = inspectDirectOperation(contract);
  const charge = (amount: number) => {options.signal?.throwIfAborted(); budget.chargeWork(amount);};
  const header = syntaxElements(root, root.name.namespace, 'Header')[0];
  if (!header) return false;
  const observed = syntaxElements(header);
  const used = new Set<SyntaxElement>();
  for (const block of blocks) {
    charge(16);
    const declaration = contract.headers?.find(candidate => candidate.id === block.id);
    if (!declaration) return false;
    const expectedName = declaration.root.element.name;
    const node = observed.find(candidate => {
      charge(8);
      return !used.has(candidate) && candidate.name.namespace === expectedName.namespace && candidate.name.local === expectedName.local;
    });
    if (!node) return false;
    used.add(node);
    const scoped = scopedHeaderOperands.get(block);
    if (!scoped) continue;
    const parsed = assessParsedComponentHeaderPayload(contract, scoped.mapping, root, node, options);
    if (parsed.kind !== 'component-decoded' || !('operands' in parsed.validated)
      || !sameScopedQNameWords(scoped.operands, parsed.validated.operands, charge)) return false;
  }
  return true;
}

/** Validate and explicitly process selected incoming blocks before publishing any body value.
 * @param root Genuine codec-owned parsed envelope from this response episode.
 * @param header Actual immediate Header child of root.
 * @param suppliedProcessors Explicit pinned-ID consumer capabilities; a QName allowlist is insufficient.
 * @returns Typed observations, acknowledged fault observations and a Header view containing every unprocessed block.
 * @constraints This performs no cryptographic verification and must not stand in for a raw-message security owner.
 */
export function assessDeclaredComponentHeaders(contract: DirectOperationContract, inputMapping: ComponentValueMapping, root: SyntaxElement,
  header: SyntaxElement, suppliedProcessors: ComponentHeaderProcessors | undefined, options: HeaderOptions & {entityBase?: string} = {}):
  Readonly<{kind: 'assessed-component-headers'; values: Readonly<Record<string, unknown>>; faults: Readonly<Record<string, unknown>>;
    remaining: SyntaxElement; processed: readonly string[]; usage: ResolverUsage}> | DirectCodecFailure | HeaderFailure {
  const {context: {budget}} = inspectDirectOperation(contract);
  inspectComponentValueMapping(inputMapping, contract);
  const fail = (kind: HeaderFailure['kind'], rule: string): HeaderFailure => Object.freeze({kind, rule, usage: budget.usage()});
  const check = (amount = 1) => {budget.chargeWork(amount); if (options.signal?.aborted) throw new Error('cancelled');};
  let processors: ComponentHeaderProcessors;
  try {processors = suppliedProcessors === undefined ? Object.freeze({}) : snapshotComponentHeaderProcessors(suppliedProcessors);}
  catch {return fail('unsupported', 'explicit SOAP header processors required');}
  const selected = contract.headers?.filter(declaration => declaration.direction === 'output') ?? [];
  if (Object.keys(processors).some(id => !selected.some(declaration => declaration.id === id))) return fail('unsupported', 'unknown incoming SOAP header declaration');
  const namespace = contract.binding.version === '1.1' ? 'http://schemas.xmlsoap.org/soap/envelope/' : 'http://www.w3.org/2003/05/soap-envelope';
  if (!root.children.includes(header) || header.name.namespace !== namespace || header.name.local !== 'Header') return fail('protocol', 'immediate SOAP Header required');
  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const faults: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const processed: string[] = [], consumed = new Set<SyntaxElement>(), seen = new Set<string>();
  const blocks: {block: SyntaxElement; declaration: ComponentSoapHeaderDeclaration; processor?: ComponentHeaderProcessor; mandatory: boolean}[] = [];
  // @constraints Complete lexical/mandatory preflight precedes consumer callbacks, including unknown blocks later in Header.
  for (const block of header.children) {
    if (options.signal?.aborted) return fail('cancelled', 'cooperative-cancellation');
    check();
    if (block.kind !== 'element') {
      if (/[^\t\r\n ]/.test(block.value)) return fail('protocol', 'SOAP Header text');
      continue;
    }
    // @why The existing receiver remains the lexical/routing authority even for blocks with native declarations.
    const routing = assessComponentSoapHeader({...header, children: [block]}, check, contract.binding.version, [root], options.entityBase);
    if (routing.kind !== 'ignored-optional-headers' && !(routing.kind === 'unsupported' && routing.rule === 'incoming mandatory SOAP header'))
      return fail(routing.kind, routing.rule);
    const declaration = selected.find(declaration => declaration.root.element.name.namespace === block.name.namespace && declaration.root.element.name.local === block.name.local);
    if (!declaration) {
      if (routing.kind === 'unsupported') return fail('unsupported', 'incoming mandatory SOAP header');
      continue;
    }
    const target = contract.binding.version === '1.1' ? syntaxAttribute(block, 'actor', namespace) : syntaxAttribute(block, 'role', namespace);
    const resolved = target === undefined ? undefined : contract.binding.version === '1.1' ? target : resolveReceiverRole(target, [root, header, block], check, options.entityBase);
    if (resolved !== undefined && typeof resolved !== 'string') return fail(resolved.kind, resolved.rule);
    const targeted = resolved === undefined || (contract.binding.version === '1.1' ? resolved === 'http://schemas.xmlsoap.org/soap/actor/next'
      : [namespace + '/role/next', namespace + '/role/ultimateReceiver'].includes(resolved));
    if (!targeted) continue;
    const mandatory = routing.kind === 'unsupported';
    if (seen.has(declaration.id)) return fail('protocol', 'duplicate declared SOAP header block');
    seen.add(declaration.id);
    const processor = Object.getOwnPropertyDescriptor(processors, declaration.id)?.value as ComponentHeaderProcessor | undefined;
    if ((mandatory || declaration.kind === 'header-fault') && !processor) return fail('unsupported', 'incoming SOAP header processing required');
    blocks.push({block, declaration, processor, mandatory});
  }
  for (const {block, declaration, processor, mandatory} of blocks) {
    if (options.signal?.aborted) return fail('cancelled', 'cooperative-cancellation');
    let encoding = '';
    for (const ancestor of [root, header, block]) {
      check(); const claim = syntaxAttribute(ancestor, 'encodingStyle', namespace);
      if (claim !== undefined) encoding = claim;
    }
    if (collapseXmlWhitespace(encoding)) return fail('unsupported', 'typed SOAP header encodingStyle');
    const mapping = createComponentDirectionalMapping(contract, inputMapping, {kind: 'header', id: declaration.id}, options);
    if (mapping.kind !== 'component-mapping') return mapping;
    const decoded = assessParsedComponentHeaderPayload(contract, mapping, root, block, options);
    if (decoded.kind !== 'component-decoded') return decoded;
    const value = decoded.validated.value;
    if (processor) {
      let acknowledged: unknown;
      try {acknowledged = processor(value, processingContext(declaration, mandatory, options.signal));}
      catch {return fail(options.signal?.aborted ? 'cancelled' : 'unsupported', options.signal?.aborted ? 'cooperative-cancellation' : 'SOAP header processor failed');}
      if (acknowledged !== true) {
        if (types.isPromise(acknowledged)) void Promise.prototype.then.call(acknowledged, () => {}, () => {});
        return fail('unsupported', 'SOAP header processor acknowledgement required');
      }
      if (options.signal?.aborted) return fail('cancelled', 'cooperative-cancellation');
      consumed.add(block); processed.push(declaration.id);
    }
    (declaration.kind === 'header-fault' ? faults : values)[declaration.id] = value;
  }
  return Object.freeze({kind: 'assessed-component-headers', values: directDataOwnership(budget).freeze(values), faults: directDataOwnership(budget).freeze(faults),
    remaining: {...header, children: header.children.filter(child => child.kind !== 'element' || !consumed.has(child))},
    processed: Object.freeze(processed), usage: budget.usage()});
}

function processingContext(declaration: ComponentSoapHeaderDeclaration, mandatory: boolean, signal?: AbortSignal): ComponentHeaderProcessingContext {
  return Object.freeze({id: declaration.id, kind: declaration.kind, direction: declaration.direction, message: declaration.root.message,
    part: declaration.root.part, element: declaration.root.element.name, mandatory, ...(signal ? {signal} : {})});
}
