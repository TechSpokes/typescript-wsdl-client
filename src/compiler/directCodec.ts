/** Internal, buffered, bare-root XML codec. No SOAP envelope or dispatch. */
import {types} from 'node:util';
import {inspectDirectOperation} from './directOperation.js';
import type {DirectOperationContract} from './directOperation.js';
import {inspectDirectValueMapping, expandDirectValue, assessDirectScalars} from './directValues.js';
import type {DirectValueMapping, DirectValueReceipt, DirectValueFailure, DirectExpandedValue} from './directValues.js';
import {matchDirectOperation} from './directStructure.js';
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
class Stop extends Error {
  constructor(readonly kind: DirectCodecFailure['kind'], readonly rule: string) {super(rule);}
}
interface Session {
  budget: SemanticBudget; limits: Required<DirectXmlLimits>; check(): void;
}
function run<T extends {readonly usage: ResolverUsage}>(contract: DirectOperationContract, supplied: unknown, options: Options, work: (mapping: DirectValueMapping, s: Session) => T): T | DirectCodecFailure {
  // Identity before all property reads, including version checks.
  const mapping = inspectDirectValueMapping(supplied, contract);
  const {budget} = inspectDirectOperation(contract).context;
  const check = () => {budget.chargeWork(); if (options.signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');};
  try {
    const result = budget.guard(() => {
      budget.chargeWork(4096); check();
      if (mapping.version !== 'direct-values-v1' || mapping.contextId !== contract.contextId
        || contract.basis !== 'native-direct-premises-v1' || contract.correspondence !== 'dated-XSD-2004-direct-v1'
        || contract.binding.version !== '1.1' || contract.binding.style !== 'document' || contract.binding.use !== 'literal'
        || contract.binding.transport !== 'http://schemas.xmlsoap.org/soap/http') throw new Stop('unsupported', 'direct-codec-version');
      const direction = mapping.direction;
      const root = direction.kind === 'fault' ? contract.faults.find(f => {
        check(); return budget.compareText(f.name, direction.name) === 0;
      })?.root : contract[direction.kind];
      if (mapping.root !== root) throw new TypeError('Incompatible direct codec root');
      const configured = options.limits === undefined ? {} : budget.snapshot(options.limits);
      if (!configured || typeof configured !== 'object' || Array.isArray(configured)) throw new TypeError('Data-only XML limits required');
      budget.chargeWork(512);
      const limits: {-readonly [K in keyof Required<DirectXmlLimits>]: number} = {...DIRECT_XML_LIMITS};
      for (const key of ['maxBytes', 'maxDepth', 'maxNodes', 'maxText'] as const) {
        const value = configured[key];
        if (value !== undefined) {
          if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('XML limits must be positive safe integers');
          limits[key] = value;
        }
      }
      const result = work(mapping, {budget, limits, check});
      // Fixed envelope/snapshot publication is reserved by the entry charge.
      check(); return Object.freeze({...result, usage: Object.freeze({...budget.usage()})});
    });
    if (budget.exhausted()) return {kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()};
    return result as T;
  } catch (error) {
    if (budget.exhausted()) return {kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()};
    if (error instanceof Stop) return Object.freeze({kind: error.kind, rule: error.rule, usage: Object.freeze({...budget.usage()})});
    if (error instanceof SchemaLoadingError) return Object.freeze({kind: error.category === 'invalid-schema' ? 'xml-invalid'
      : error.category === 'resource-limit' ? 'resource-limit' : 'unsupported', rule: error.message, source: error.source,
      usage: Object.freeze({...budget.usage()})} satisfies DirectCodecFailure);
    throw error;
  }
}

/** Validate fresh values using the delivered inverse, then emit deterministic UTF-8. */
export function encodeDirectXml(contract: DirectOperationContract, mapping: unknown, application: unknown, options: Options = {}): DirectEncodedXml | DirectCodecFailure {
  return run(contract, mapping, options, (owned, {budget, limits, check}) => {
    const expanded = expandDirectValue(contract, owned, application, options);
    if (expanded.kind !== 'direct-expanded') return expanded;
    budget.chargeWork(256);
    const pieces: string[] = [];
    let byteLength = 0, nodes = 0, textUnits = 0, nextPrefix = 0;
    const prefixes = new Map<string, string>();
    const append = (text: string) => {
      check(); budget.chargeWork(64 + text.length * 8);
      const size = Buffer.byteLength(text, 'utf8');
      if (size > limits.maxBytes - byteLength) throw new Stop('resource-limit', 'XML byte limit');
      byteLength += size; pieces.push(text);
    };
    const escape = (text: string, attribute = false) => {
      check(); budget.chargeWork(128 + text.length * 32);
      return text.replace(/[&<>\r"\t\n]/g, c => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;'
        : c === '\r' ? '&#13;' : attribute && c === '"' ? '&quot;' : attribute && c === '\t' ? '&#9;'
        : attribute && c === '\n' ? '&#10;' : c);
    };
    const emit = (node: SyntaxElement, depth: number) => {
      check(); budget.reserveNodes(1); budget.chargeWork(1024 + (node.name.local.length + node.name.namespace.length) * 8);
      if (++nodes > limits.maxNodes || depth > limits.maxDepth) throw new Stop('resource-limit', 'XML node/depth limit');
      const namespace = node.name.namespace;
      let prefix = namespace === XML_NAMESPACE ? 'xml' : prefixes.get(namespace);
      if (namespace && prefix === undefined) {
        prefix = `n${nextPrefix++}`; prefixes.set(namespace, prefix);
      }
      // Bind at each use: a prefix first encountered on one sibling is not in
      // scope at its next sibling. Never use a default namespace, so local
      // unqualified children need no inherited-default reset.
      const declaration = namespace && prefix !== 'xml' ? ` xmlns:${prefix}="${escape(namespace, true)}"` : '';
      const name = prefix ? `${prefix}:${node.name.local}` : node.name.local;
      append(`<${name}${declaration}>`);
      for (const child of node.children) {
        check();
        if (child.kind === 'element') emit(child, depth + 1);
        else {
          budget.reserveNodes(1); budget.chargeWork(128);
          if (++nodes > limits.maxNodes || child.value.length > limits.maxText - textUnits) throw new Stop('resource-limit', 'XML node/text limit');
          textUnits += child.value.length; append(escape(child.value));
        }
      }
      append(`</${name}>`);
    };
    emit(expanded.payload, 1);
    // Join, UTF-8 conversion, result envelope and usage are precharged; mutable
    // bytes are caller-owned and never registered as downstream authority.
    check(); budget.chargeWork(2048 + byteLength * 8);
    const bytes = Buffer.from(pieces.join(''), 'utf8');
    check();
    return Object.freeze({kind: 'direct-encoded' as const, admitted: false as const, encoding: 'utf-8' as const,
      bytes, expanded, usage: Object.freeze({...budget.usage()})});
  });
}

/** Bounded observed bytes -> ordered syntax -> existing structural/scalar checks. */
export function decodeDirectXml(contract: DirectOperationContract, mapping: unknown, bytes: Uint8Array,
  options: Options & Readonly<{uri?: string; selectPayload?: (root: SyntaxElement) => DirectPayloadSelection}> = {}): DirectDecodedXml | DirectCodecFailure {
  return run(contract, mapping, options, (owned, {budget, limits, check}) => {
    if (!types.isUint8Array(bytes) || types.isProxy(bytes)) throw new TypeError('XML requires Uint8Array bytes');
    // Use native internal-slot access, avoiding subclass/own length, buffer and
    // iterator getters. Shared backing stores are outside the data-only contract.
    const typed = Object.getPrototypeOf(Uint8Array.prototype) as object;
    const length = Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!.call(bytes) as number;
    const backing: unknown = Object.getOwnPropertyDescriptor(typed, 'buffer')!.get!.call(bytes);
    if (types.isSharedArrayBuffer(backing)) throw new TypeError('Shared XML bytes are unsupported');
    if (length > limits.maxBytes) throw new Stop('resource-limit', 'XML byte limit');
    check(); budget.chargeWork(512 + length * 4);
    const input = new Uint8Array(length);
    Uint8Array.prototype.set.call(input, bytes);
    const uri = options.uri ?? 'urn:typescript-wsdl-client:observed-direct-xml';
    if (typeof uri !== 'string') throw new TypeError('XML source URI must be a string');
    check(); budget.chargeWork(256 + uri.length * 4);
    const root = parseOrderedSyntax(input, uri, {...limits, xml10Only: true,
      chargeWork: amount => {check(); budget.chargeWork(amount);}, reserveNode: () => {check(); budget.reserveNodes(1);}}).root;
    const selection = options.selectPayload?.(root) ?? {payload: root, mapping: owned};
    const payload = selection.payload;
    const selectedMapping = inspectDirectValueMapping(selection.mapping, contract);
    // Protocol selection may only return an actual node from this parse, never
    // a synthetic tree relabeled with the observed document's provenance.
    const contains = (node: SyntaxElement): boolean => {
      check(); budget.chargeWork(64 + node.children.length * 8);
      return node === payload || node.children.some(child => child.kind === 'element' && contains(child));
    };
    if (!contains(root)) throw new TypeError('Protocol payload must belong to the observed document');
    const structural = matchDirectOperation(contract, selectedMapping.direction, payload, options);
    if (structural.kind !== 'structural-match') return structural;
    const validated = assessDirectScalars(contract, structural, options);
    if (validated.kind !== 'direct-value') return validated;
    check(); budget.chargeWork(2048); budget.freeze(payload); check();
    return Object.freeze({kind: 'direct-decoded' as const, admitted: false as const, payload, validated,
      usage: Object.freeze({...budget.usage()})});
  });
}
