import {directDataOwnership, directLimit} from './directExecutionPolicy.js';
/** Internal, buffered, bare-root XML codec. No SOAP envelope or dispatch. */
import {checkSemanticBudget} from './semanticBudget.js';
import {DataOwnershipLimitError} from './dataOwnership.js';
import {types} from 'node:util';
import {inspectDirectOperation} from './directOperation.js';
import type {DirectOperationContract} from './directOperation.js';
import {inspectDirectValueMapping, expandDirectValue, assessDirectScalars, inspectComponentValueMapping,
  expandProjectionValue, assessProjectionScalars} from './directValues.js';
import type {DirectValueMapping, DirectValueReceipt, DirectValueFailure, DirectExpandedValue,
  ComponentValueMapping, ProjectionExpandedValue, ProjectionValueReceipt} from './directValues.js';
import {matchDirectOperation, matchDirectProjection} from './directStructure.js';
import {parseOrderedSyntax, SchemaLoadingError, XML_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import type {SemanticBudget, ResolverUsage} from './semanticBudget.js';

export interface DirectXmlLimits {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  /** Aggregate parsed/emitted text in UTF-16 units, excluding markup. */
  readonly maxText?: number;
}
export const DIRECT_XML_LIMITS = Object.freeze({maxBytes: 1024 * 1024, maxDepth: 256, maxNodes: 100_000, maxText: 1024 * 1024});
type Options = Readonly<{signal?: AbortSignal; limits?: DirectXmlLimits}>;
/** Internal protocol selection over the same parsed observed document. */
export interface DirectPayloadSelection {
  readonly payload: SyntaxElement;
  readonly mapping: DirectValueMapping;
}
export interface DirectCodecFailure {
  readonly kind: DirectValueFailure['kind'] | 'xml-invalid' | 'mismatch';
  readonly rule: string;
  readonly source?: SyntaxSource;
  readonly schemaPath?: string;
  readonly payloadPath?: string;
  readonly usage: ResolverUsage;
}
export interface DirectEncodedXml {
  readonly kind: 'direct-encoded'; readonly admitted: false; readonly encoding: 'utf-8';
  /** Owned mutable output bytes; bytes are data, never receipt authority. */
  readonly bytes: Uint8Array;
  readonly expanded: DirectExpandedValue;
  readonly usage: ResolverUsage;
}
export interface DirectDecodedXml {
  readonly kind: 'direct-decoded'; readonly admitted: false;
  readonly payload: SyntaxElement; readonly validated: DirectValueReceipt;
  readonly usage: ResolverUsage;
}
export interface ComponentEncodedXml {
  readonly kind: 'component-encoded'; readonly admitted: false; readonly encoding: 'utf-8';
  readonly bytes: Uint8Array; readonly expanded: ProjectionExpandedValue; readonly mapping: ComponentValueMapping;
  readonly usage: ResolverUsage;
}
export interface ComponentDecodedXml {
  readonly kind: 'component-decoded'; readonly admitted: false;
  readonly payload: SyntaxElement; readonly validated: ProjectionValueReceipt; readonly mapping: ComponentValueMapping;
  readonly usage: ResolverUsage;
}
export interface ComponentPayloadSelection {readonly payload: SyntaxElement; readonly mapping: ComponentValueMapping}
/** Parser ownership only; neither the observation nor its displayed fields establish value or operation validity. */
export interface ComponentXmlObservation {
  readonly kind: 'observed-component-xml'; readonly root: SyntaxElement; readonly usage: ResolverUsage;
}
const componentObservations = new WeakSet<object>();
class Stop extends Error {
  constructor(readonly kind: DirectCodecFailure['kind'], readonly rule: string) {super(rule);}
}
interface Session {
  budget: SemanticBudget; limits: Required<DirectXmlLimits>; check(): void;
}
type CodecMapping = DirectValueMapping | ComponentValueMapping;
type CodecProfile = Readonly<{version: CodecMapping['version']; basis: DirectOperationContract['basis'];
  correspondence: DirectOperationContract['correspondence']; rule: string}>;
const directProfile: CodecProfile = Object.freeze({version: 'direct-values-v1', basis: 'native-direct-premises-v1',
  correspondence: 'dated-XSD-2004-direct-v1', rule: 'direct-codec-version'});
const componentProfile: CodecProfile = Object.freeze({version: 'component-values-v1', basis: 'native-component-premises-v1',
  correspondence: 'dated-XSD-2004-components-v1', rule: 'component-codec-version'});
function runMapping<M extends CodecMapping, T extends {readonly usage: ResolverUsage}>(contract: DirectOperationContract, supplied: unknown,
  options: Options, profile: CodecProfile, inspect: (value: unknown, contract: DirectOperationContract) => M,
  work: (mapping: M, s: Session) => T): T | DirectCodecFailure {
  // Identity before all property reads, including version checks.
  const mapping = inspect(supplied, contract);
  const {budget} = inspectDirectOperation(contract).context;
  const check = () => {checkSemanticBudget(budget); if (options.signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');};
  try {
    const result = budget.guard(() => {
      check();
      if (mapping.version !== profile.version || mapping.contextId !== contract.contextId
        || contract.basis !== profile.basis || contract.correspondence !== profile.correspondence
        || contract.binding.version !== '1.1' || contract.binding.style !== 'document' || contract.binding.use !== 'literal'
        || contract.binding.transport !== 'http://schemas.xmlsoap.org/soap/http') throw new Stop('unsupported', profile.rule);
      const direction = mapping.direction;
      const root = direction.kind === 'fault' ? contract.faults.find(f => {
       check(); return budget.compareText(f.name, direction.name) === 0;
      })?.root : contract[direction.kind];
      if (mapping.root !== root) throw new TypeError('Incompatible direct codec root');
      const configured = options.limits === undefined ? {} : directDataOwnership(budget).snapshot(options.limits, check);
      if (!configured || typeof configured !== 'object' || Array.isArray(configured)) throw new TypeError('Data-only XML limits required');
      for (const key of Reflect.ownKeys(configured)) {
        if (typeof key !== 'string' || !['maxBytes', 'maxDepth', 'maxNodes', 'maxText'].includes(key)) throw new TypeError('Unknown XML limit');
      }

      const limits: {-readonly [K in keyof Required<DirectXmlLimits>]: number} = {
        maxBytes: directLimit(budget, DIRECT_XML_LIMITS.maxBytes), maxDepth: directLimit(budget, DIRECT_XML_LIMITS.maxDepth),
        maxNodes: directLimit(budget, DIRECT_XML_LIMITS.maxNodes), maxText: directLimit(budget, DIRECT_XML_LIMITS.maxText),
      };
      for (const key of ['maxBytes', 'maxDepth', 'maxNodes', 'maxText'] as const) {
        const value = configured[key];
        if (value !== undefined) {
          if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('XML limits must be positive safe integers');
          limits[key] = value;
        }
      }
      const result = work(mapping, {budget, limits, check});
      // Native failures remain terminal even though publication has no synthetic work price.
     check(); return Object.freeze({...result, usage: Object.freeze({...budget.usage()})});
    });
    if (budget.exhausted()) return {kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()};
    return result as T;
  } catch (error) {
    if (budget.exhausted()) return {kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()};
    if (error instanceof DataOwnershipLimitError) return {kind: 'resource-limit', rule: error.message, usage: budget.usage()};
    if (error instanceof Stop) return Object.freeze({kind: error.kind, rule: error.rule, usage: Object.freeze({...budget.usage()})});
    if (error instanceof SchemaLoadingError) return Object.freeze({kind: error.category === 'invalid-schema' ? 'xml-invalid'
      : error.category === 'resource-limit' ? 'resource-limit' : 'unsupported', rule: error.message, source: error.source,
      usage: Object.freeze({...budget.usage()})} satisfies DirectCodecFailure);
    throw error;
  }
}
function run<T extends {readonly usage: ResolverUsage}>(contract: DirectOperationContract, mapping: unknown, options: Options,
  work: (mapping: DirectValueMapping, s: Session) => T): T | DirectCodecFailure {
  return runMapping(contract, mapping, options, directProfile, inspectDirectValueMapping, work);
}
function runComponent<T extends {readonly usage: ResolverUsage}>(contract: DirectOperationContract, mapping: unknown, options: Options,
  work: (mapping: ComponentValueMapping, s: Session) => T): T | DirectCodecFailure {
  return runMapping(contract, mapping, options, componentProfile,
    (value, owner) => inspectComponentValueMapping(value, owner).mapping, work);
}

/** Serialize only native inverse output; source names and values have already passed their native owners. */
function emitObservedXml(payload: SyntaxElement, {budget, limits, check}: Session): Uint8Array {
    const pieces: string[] = [];
    let byteLength = 0, nodes = 0, textUnits = 0, nextPrefix = 0;
    const prefixes = new Map<string, string>();
    const append = (text: string) => {
     check();
      const size = Buffer.byteLength(text, 'utf8');
      if (size > limits.maxBytes - byteLength) throw new Stop('resource-limit', 'XML byte limit');
      byteLength += size; pieces.push(text);
    };
    const escape = (text: string, attribute = false) => {
     check();
      return text.replace(/[&<>\r"\t\n]/g, c => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;'
        : c === '\r' ? '&#13;' : attribute && c === '"' ? '&quot;' : attribute && c === '\t' ? '&#9;'
        : attribute && c === '\n' ? '&#10;' : c);
    };
    const prefixFor = (namespace: string): string => {
      if (!namespace) return '';
      if (namespace === 'http://www.w3.org/2000/xmlns/') throw new Stop('unsupported', 'namespace-declaration-as-data');
      let prefix = namespace === XML_NAMESPACE ? 'xml' : prefixes.get(namespace);
      if (namespace && prefix === undefined) {
        prefix = `n${nextPrefix++}`; prefixes.set(namespace, prefix);
      }
      return prefix!;
    };
    type Task = {kind: 'element'; node: SyntaxElement; depth: number} | {kind: 'close'; name: string} | {kind: 'text'; value: string};
    const tasks: Task[] = [{kind: 'element', node: payload, depth: 1}];
    while (tasks.length) {
      check(); const task = tasks.pop()!;
      if (task.kind === 'close') {append(`</${task.name}>`); continue;}
      budget.reserveNodes(1);
      if (task.kind === 'text') {
        if (++nodes > limits.maxNodes || task.value.length > limits.maxText - textUnits) throw new Stop('resource-limit', 'XML node/text limit');
        textUnits += task.value.length; append(escape(task.value)); continue;
      }
      const {node, depth} = task;
      if (++nodes > limits.maxNodes || depth > limits.maxDepth) throw new Stop('resource-limit', 'XML node/depth limit');
      const declarations = new Map<string, string>();
      const qualified = (namespace: string, local: string): string => {
        const prefix = prefixFor(namespace);
        if (prefix && prefix !== 'xml') declarations.set(prefix, namespace);
        return prefix ? `${prefix}:${local}` : local;
      };
      const name = qualified(node.name.namespace, node.name.local), attributes: string[] = [];
      for (const attribute of node.attributes) {
        check();
        if (attribute.name.namespace === '' && attribute.name.local === 'xmlns') throw new Stop('unsupported', 'namespace-declaration-as-data');
        attributes.push(` ${qualified(attribute.name.namespace, attribute.name.local)}="${escape(attribute.value, true)}"`);
      }
      // @why Bind each used prefix at this element; sibling discovery never makes a prefix in scope elsewhere.
      append(`<${name}`);
      for (const [prefix, namespace] of declarations) append(` xmlns:${prefix}="${escape(namespace, true)}"`);
      for (const attribute of attributes) append(attribute);
      append('>'); tasks.push({kind: 'close', name});
      for (let i = node.children.length - 1; i >= 0; i--) {
        check(); const child = node.children[i]!;
        tasks.push(child.kind === 'element' ? {kind: 'element', node: child, depth: depth + 1} : {kind: 'text', value: child.value});
      }
    }
    // Actual output bytes were bounded by append; bytes are caller-owned data, not authority.
    check();
    const bytes = Buffer.from(pieces.join(''), 'utf8');
    check();
    return bytes;
}

/** Validate fresh values using the delivered inverse, then emit deterministic UTF-8. */
export function encodeDirectXml(contract: DirectOperationContract, mapping: unknown, application: unknown, options: Options = {}): DirectEncodedXml | DirectCodecFailure {
  return run(contract, mapping, options, (owned, session) => {
    const {budget, limits} = session;
    const expanded = expandDirectValue(contract, owned, application, {...options, maxText: Math.min(limits.maxText, limits.maxBytes), maxItems: Math.min(limits.maxNodes, limits.maxBytes)});
    if (expanded.kind !== 'direct-expanded') return expanded;
    const bytes = emitObservedXml(expanded.payload, session);
    return Object.freeze({kind: 'direct-encoded' as const, admitted: false as const, encoding: 'utf-8' as const,
      bytes, expanded, usage: Object.freeze({...budget.usage()})});
  });
}

/** Encode a component-qualified structured operation direction through the same native inverse and XML writer.
 * @remarks Mapping/source authority is checked before values. This supplies XML bytes only, not policy enforcement or dispatch.
 * @returns Native-validated UTF-8 output or explicit scalar/value/unsupported/cancellation/resource failure.
 */
export function encodeComponentXml(contract: DirectOperationContract, mapping: unknown, application: unknown, options: Options = {}): ComponentEncodedXml | DirectCodecFailure {
  return runComponent(contract, mapping, options, (owned, session) => {
    const {context} = inspectDirectOperation(contract), {budget, limits} = session;
    // @why Application items include attributes; XML syntax-node/text caps count elements and character data.
    //   Encoded bytes bound inverse input capacity without treating those different counters as equal.
    const expanded = expandProjectionValue(context, owned.root.element, application, {...options,
      maxText: limits.maxBytes, maxItems: limits.maxBytes});
    if (expanded.kind !== 'projection-expanded') return expanded;
    const bytes = emitObservedXml(expanded.payload, session);
    return Object.freeze({kind: 'component-encoded' as const, admitted: false as const, encoding: 'utf-8' as const,
      bytes, expanded, mapping: owned, usage: Object.freeze({...budget.usage()})});
  });
}

/** Retain the shared byte-copy, XML-version, entity and explicit capacity boundaries for both profiles. */
function parseObservedXml(bytes: Uint8Array, {budget, limits, check}: Session, sourceUri?: string): SyntaxElement {
    if (!types.isUint8Array(bytes) || types.isProxy(bytes)) throw new TypeError('XML requires Uint8Array bytes');
    // Use native internal-slot access, avoiding subclass/own length, buffer and
    // iterator getters. Shared backing stores are outside the data-only contract.
    const typed = Object.getPrototypeOf(Uint8Array.prototype) as object;
    const length = Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!.call(bytes) as number;
    const backing: unknown = Object.getOwnPropertyDescriptor(typed, 'buffer')!.get!.call(bytes);
    if (types.isSharedArrayBuffer(backing)) throw new TypeError('Shared XML bytes are unsupported');
    if (length > limits.maxBytes) throw new Stop('resource-limit', 'XML byte limit');
    check();
    const input = new Uint8Array(length);
    Uint8Array.prototype.set.call(input, bytes);
    const uri = sourceUri ?? 'urn:typescript-wsdl-client:observed-direct-xml';
    if (typeof uri !== 'string') throw new TypeError('XML source URI must be a string');
    check();
    return parseOrderedSyntax(input, uri, {...limits, xml10Only: true,
      chargeWork: () => check(), reserveNode: () => {check(); budget.reserveNodes(1);}}).root;
}
function assertObservedPayload(root: SyntaxElement, payload: SyntaxElement, check: () => void): void {
  const pending = [root];
  while (pending.length) {
    check(); const node = pending.pop()!;
    if (node === payload) return;
    for (let i = node.children.length - 1; i >= 0; i--) {
      check(); const child = node.children[i]!; if (child.kind === 'element') pending.push(child);
    }
  }
  throw new TypeError('Protocol payload must belong to the observed document');
}

/** Observe once through the existing component parser and execution controls.
 * @remarks Any exact operation-owned mapping can bind parsing to its execution context. Its value/root is not
 *   assessed here. Source qualification, wrapper scope and selected payload validation remain separate owners.
 */
export function observeComponentXml(contract: DirectOperationContract, mapping: unknown, bytes: Uint8Array,
  options: Options & Readonly<{uri?: string}> = {}): ComponentXmlObservation | DirectCodecFailure {
  const result = runComponent(contract, mapping, options, (_owned, session) => {
    const root = parseObservedXml(bytes, session, options.uri ?? 'urn:typescript-wsdl-client:observed-component-xml');
    directDataOwnership(session.budget).freeze(root);
    return Object.freeze({kind: 'observed-component-xml' as const, root, usage: Object.freeze({...session.budget.usage()})});
  });
  if (result.kind === 'observed-component-xml') componentObservations.add(result);
  return result;
}

/** Validate a genuine observed subtree through an independently qualified component mapping.
 * @remarks XML capacities belong to the observation episode. This entry assesses the selected mapping's
 *   structure and scalar duties; it does not assert cross-contract wrapper, SOAP or runtime authority.
 * @throws TypeError For copied observations, foreign mappings or a node outside the observed document.
 */
export function assessObservedComponentPayload(contract: DirectOperationContract, mapping: unknown, observation: ComponentXmlObservation,
  payload: SyntaxElement, options: Readonly<{signal?: AbortSignal}> = {}): ComponentDecodedXml | DirectCodecFailure {
  if (!componentObservations.has(observation)) throw new TypeError('Native component XML observation required');
  return runComponent(contract, mapping, options, (owned, {budget, check}) => {
    assertObservedPayload(observation.root, payload, check);
    const {context} = inspectDirectOperation(contract);
    const structural = matchDirectProjection(context, owned.root.element, payload, options);
    if (structural.kind !== 'projection-match') return structural;
    const validated = assessProjectionScalars(context, structural, options);
    if (validated.kind !== 'projection-value') return validated;
    return Object.freeze({kind: 'component-decoded' as const, admitted: false as const, payload, validated, mapping: owned,
      usage: Object.freeze({...budget.usage()})});
  });
}
/** Verify membership without conferring a selected mapping or wrapper validity. */
export function assertComponentObservedPayload(observation: ComponentXmlObservation, payload: SyntaxElement, check: () => void): void {
  if (!componentObservations.has(observation)) throw new TypeError('Native component XML observation required');
  assertObservedPayload(observation.root, payload, check);
}

/** Bounded observed bytes -> ordered syntax -> existing structural/scalar checks. */
export function decodeDirectXml(contract: DirectOperationContract, mapping: unknown, bytes: Uint8Array,
  options: Options & Readonly<{uri?: string; selectPayload?: (root: SyntaxElement) => DirectPayloadSelection}> = {}): DirectDecodedXml | DirectCodecFailure {
  return run(contract, mapping, options, (owned, session) => {
    const {budget, check} = session;
    const root = parseObservedXml(bytes, session, options.uri);
    const selection = options.selectPayload?.(root) ?? {payload: root, mapping: owned};
    const payload = selection.payload;
    const selectedMapping = inspectDirectValueMapping(selection.mapping, contract);
    // Protocol selection may only return an actual node from this parse, never
    // a synthetic tree relabeled with the observed document's provenance.
    assertObservedPayload(root, payload, check);
    const structural = matchDirectOperation(contract, selectedMapping.direction, payload, options);
    if (structural.kind !== 'structural-match') return structural;
    const validated = assessDirectScalars(contract, structural, options);
    if (validated.kind !== 'direct-value') return validated;
    check(); directDataOwnership(budget).freeze(payload); check();
    return Object.freeze({kind: 'direct-decoded' as const, admitted: false as const, payload, validated,
      usage: Object.freeze({...budget.usage()})});
  });
}

/** Decode observed component-profile bytes through the same parser and native structured/scalar owners.
 * @remarks Protocol selection may choose only an actual node from this parse and an exact operation-owned mapping.
 *   It cannot relabel a copied syntax tree, switch operations or acquire runtime/policy enforcement authority.
 * @returns A native-validated structured value or explicit XML/structure/scalar/unsupported/resource failure.
 */
export function decodeComponentXml(contract: DirectOperationContract, mapping: unknown, bytes: Uint8Array,
  options: Options & Readonly<{uri?: string; selectPayload?: (root: SyntaxElement) => ComponentPayloadSelection}> = {}): ComponentDecodedXml | DirectCodecFailure {
  return runComponent(contract, mapping, options, (owned, session) => {
    const {budget, check} = session, {context} = inspectDirectOperation(contract);
    const root = parseObservedXml(bytes, session, options.uri ?? 'urn:typescript-wsdl-client:observed-component-xml');
    const selection = options.selectPayload?.(root) ?? {payload: root, mapping: owned};
    const selected = inspectComponentValueMapping(selection.mapping, contract).mapping;
    assertObservedPayload(root, selection.payload, check);
    const structural = matchDirectProjection(context, selected.root.element, selection.payload, options);
    if (structural.kind !== 'projection-match') return structural;
    const validated = assessProjectionScalars(context, structural, options);
    if (validated.kind !== 'projection-value') return validated;
    check(); directDataOwnership(budget).freeze(selection.payload); check();
    return Object.freeze({kind: 'component-decoded' as const, admitted: false as const, payload: selection.payload,
      validated, mapping: selected, usage: Object.freeze({...budget.usage()})});
  });
}
