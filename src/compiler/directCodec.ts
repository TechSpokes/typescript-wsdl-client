import {directDataOwnership, directLimit} from './directExecutionPolicy.js';
/** Internal, buffered, bare-root XML codec. No SOAP envelope or dispatch. */
import {checkSemanticBudget} from './semanticBudget.js';
import {DataOwnershipLimitError} from './dataOwnership.js';
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
  const check = () => {checkSemanticBudget(budget); if (options.signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');};
  try {
    const result = budget.guard(() => {
      check();
      if (mapping.version !== 'direct-values-v1' || mapping.contextId !== contract.contextId
        || contract.basis !== 'native-direct-premises-v1' || contract.correspondence !== 'dated-XSD-2004-direct-v1'
        || contract.binding.version !== '1.1' || contract.binding.style !== 'document' || contract.binding.use !== 'literal'
        || contract.binding.transport !== 'http://schemas.xmlsoap.org/soap/http') throw new Stop('unsupported', 'direct-codec-version');
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

/** Validate fresh values using the delivered inverse, then emit deterministic UTF-8. */
export function encodeDirectXml(contract: DirectOperationContract, mapping: unknown, application: unknown, options: Options = {}): DirectEncodedXml | DirectCodecFailure {
  return run(contract, mapping, options, (owned, {budget, limits, check}) => {
    const expanded = expandDirectValue(contract, owned, application, {...options, maxText: Math.min(limits.maxText, limits.maxBytes), maxItems: Math.min(limits.maxNodes, limits.maxBytes)});
    if (expanded.kind !== 'direct-expanded') return expanded;

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
    const emit = (node: SyntaxElement, depth: number) => {
     check(); budget.reserveNodes(1);
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
          budget.reserveNodes(1);
          if (++nodes > limits.maxNodes || child.value.length > limits.maxText - textUnits) throw new Stop('resource-limit', 'XML node/text limit');
          textUnits += child.value.length; append(escape(child.value));
        }
      }
      append(`</${name}>`);
    };
    emit(expanded.payload, 1);
    // Actual output bytes were bounded by append; bytes are caller-owned data, not authority.
    check();
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
    check();
    const input = new Uint8Array(length);
    Uint8Array.prototype.set.call(input, bytes);
    const uri = options.uri ?? 'urn:typescript-wsdl-client:observed-direct-xml';
    if (typeof uri !== 'string') throw new TypeError('XML source URI must be a string');
    check();
    const root = parseOrderedSyntax(input, uri, {...limits, xml10Only: true,
      chargeWork: () => check(), reserveNode: () => {check(); budget.reserveNodes(1);}}).root;
    const selection = options.selectPayload?.(root) ?? {payload: root, mapping: owned};
    const payload = selection.payload;
    const selectedMapping = inspectDirectValueMapping(selection.mapping, contract);
    // Protocol selection may only return an actual node from this parse, never
    // a synthetic tree relabeled with the observed document's provenance.
    const contains = (node: SyntaxElement): boolean => {
     check();
      return node === payload || node.children.some(child => child.kind === 'element' && contains(child));
    };
    if (!contains(root)) throw new TypeError('Protocol payload must belong to the observed document');
    const structural = matchDirectOperation(contract, selectedMapping.direction, payload, options);
    if (structural.kind !== 'structural-match') return structural;
    const validated = assessDirectScalars(contract, structural, options);
    if (validated.kind !== 'direct-value') return validated;
    check(); directDataOwnership(budget).freeze(payload); check();
    return Object.freeze({kind: 'direct-decoded' as const, admitted: false as const, payload, validated,
      usage: Object.freeze({...budget.usage()})});
  });
}
