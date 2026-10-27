/** Internal P3.6 data boundary. Reading data never grants source or dispatch authority. */
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {canonicalJson, parseCatalogJson, CatalogError} from './catalogErrors.js';
import {createSemanticBudget} from './semanticBudget.js';
import type {SemanticBudget, SemanticBudgetLimits, ResolverUsage} from './semanticBudget.js';
import {inspectDirectOperation, selectDirectOperationInRequest} from './directOperation.js';
import type {DirectOperationContract, DirectOperationSelector} from './directOperation.js';
import {createDirectValueMapping, DIRECT_VALUE_VERSION, DIRECT_SCALAR_POLICY} from './directValues.js';
import type {DirectValueMapping} from './directValues.js';
import {prepareDirectSoapSource, DirectSoapSourceError} from './directSoapSource.js';
import {SchemaResourceLoader, resolveResourceUri} from '../loader/schemaResources.js';
import type {SchemaResourcePolicy} from '../loader/schemaResources.js';
import {parseOrderedSyntax, syntaxElements, isXmlNCName, SchemaLoadingError} from '../loader/orderedSyntax.js';
import type {ExpandedName} from '../loader/orderedSyntax.js';

export const DIRECT_CAPSULE_LIMITS = Object.freeze({maxBytes: 256 * 1024, sourceBytes: 64 * 1024});
const versions = Object.freeze({capsuleFormat: 1, model: 'xsd10-faithful-v1', scope: 'direct-soap11-single-utf8-v1',
  mapping: DIRECT_VALUE_VERSION, scalarPolicy: DIRECT_SCALAR_POLICY, runtimePolicy: 'owned-loopback-http-no-extensions-v1'} as const);
export interface DirectSourceSelection {readonly service: ExpandedName; readonly port: string}
interface Root {
  readonly element: ExpandedName; readonly message: ExpandedName; readonly part: string;
  readonly type: ExpandedName; readonly builtin: ExpandedName | null;
  readonly slots: readonly {element: ExpandedName; builtin: ExpandedName; min: string; max: string}[];
}
interface Compatibility extends DirectSourceSelection {
  readonly selector: DirectOperationSelector; readonly action: string;
  readonly input: Root; readonly output: Root; readonly faults: readonly {name: string; root: Root}[];
}
interface Capsule {
  readonly versions: typeof versions;
  readonly source: {readonly base64: string; readonly digest: string};
  readonly compatibility: Compatibility; readonly fingerprint: string;
}
export interface ReconstructedDirectSource {
  readonly kind: 'reconstructed-direct'; readonly contract: DirectOperationContract;
  readonly mappings: readonly DirectValueMapping[]; readonly selection: DirectSourceSelection;
  readonly admitted: false; readonly usage: ResolverUsage;
}
const reconstructed = new WeakMap<object, Capsule>();
export interface DirectCapsuleFailure {
  readonly kind: 'incompatible-artifact' | 'unsupported' | 'missing-authority' | 'resource-limit' | 'cancelled' | 'inconclusive' | 'invalid-schema';
  readonly rule: string; readonly repair: string; readonly usage: ResolverUsage;
}
class Stop extends Error {constructor(readonly kind: DirectCapsuleFailure['kind'], readonly rule: string) {super(rule);}}
const reject = (rule: string): never => {throw new Stop('incompatible-artifact', rule);};
function failure(error: unknown, budget: SemanticBudget): DirectCapsuleFailure {
  let kind: DirectCapsuleFailure['kind'], rule: string;
  if (budget.exhausted()) {kind = 'resource-limit'; rule = 'request-budget';}
  else if (error instanceof Stop) {({kind, rule} = error);}
  else if (error instanceof CatalogError) {kind = error.category === 'resource-limit' ? 'resource-limit' : 'incompatible-artifact'; rule = 'capsule-json';}
  else if (error instanceof DirectSoapSourceError) {kind = 'unsupported'; rule = error.message;}
  else if (error instanceof SchemaLoadingError) {kind = error.category === 'resource-limit' ? 'resource-limit' : 'missing-authority'; rule = 'authorized-local-source-required';}
  else throw error;
  return Object.freeze({kind, rule, repair: 'Regenerate matched internal direct artifacts from explicitly authorized original WSDL; public generation remains unavailable.', usage: Object.freeze({...budget.usage()})});
}
function check(budget: SemanticBudget, signal?: AbortSignal): void {
  budget.chargeWork(); if (signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');
}
function hash(text: string | Uint8Array): string {return createHash('sha256').update(text).digest('hex');}
function json(value: unknown, budget: SemanticBudget): string {
  budget.freeze(value);
  const pending: unknown[] = [value];
  // Reserve worst-case JSON escaping and sorting before the existing canonical
  // serializer allocates its copies. Only reader/native-owned acyclic data enters.
  while (pending.length) {
    const item = pending.pop(); budget.chargeWork(128);
    if (typeof item === 'string') budget.chargeWork(item.length * 128);
    else if (Array.isArray(item)) {budget.chargeWork(item.length * 128); pending.push(...item);}
    else if (item && typeof item === 'object') {
      const keys = Object.keys(item); budget.chargeWork(keys.length * keys.length * 128);
      for (const key of keys) {budget.chargeWork(key.length * 128); pending.push((item as Record<string, unknown>)[key]);}
    }
  }
  const text = canonicalJson(value);
  return text;
}
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return reject('data-record-required');
  const result = value as Record<string, unknown>;
  const keys = Object.keys(result);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) return reject('missing-or-unknown-field');
  return result;
}
function text(value: unknown): asserts value is string {if (typeof value !== 'string') reject('string-required');}
function name(value: unknown): asserts value is ExpandedName {
  const v = record(value, ['namespace', 'local']); text(v.namespace); text(v.local);
  if (!isXmlNCName(v.local)) reject('expanded-name-required');
}
function ncname(value: unknown): asserts value is string {text(value); if (!isXmlNCName(value)) reject('name-required');}
function root(value: unknown): void {
  const v = record(value, ['element', 'message', 'part', 'type', 'builtin', 'slots']);
  name(v.element); name(v.message); ncname(v.part); name(v.type);
  if (v.builtin !== null) name(v.builtin);
  if (!Array.isArray(v.slots)) reject('slots-required');
  for (const item of v.slots as unknown[]) {
    const slot = record(item, ['element', 'builtin', 'min', 'max']); name(slot.element); name(slot.builtin);
    if (!['0', '1'].includes(slot.min as string) || !['1', 'unbounded'].includes(slot.max as string)) reject('direct-occurrence-required');
  }
}
/** Bounded bytes only, duplicate checking delegated to the existing catalog reader. No I/O. */
export function readDirectSourceCapsule(bytes: Uint8Array, budget: SemanticBudget, signal?: AbortSignal): Capsule | DirectCapsuleFailure {
  try {return read(bytes, budget, signal);} catch (error) {return failure(error, budget);}
}
function read(bytes: Uint8Array, budget: SemanticBudget, signal?: AbortSignal): Capsule {
  check(budget, signal);
  if (!types.isUint8Array(bytes) || types.isProxy(bytes)) return reject('byte-input-required');
  const typed = Object.getPrototypeOf(Uint8Array.prototype) as object;
  const length = Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!.call(bytes) as number;
  const backing: unknown = Object.getOwnPropertyDescriptor(typed, 'buffer')!.get!.call(bytes);
  if (types.isSharedArrayBuffer(backing)) return reject('shared-bytes-unsupported');
  if (length > DIRECT_CAPSULE_LIMITS.maxBytes) throw new Stop('resource-limit', 'capsule-byte-limit');
  // Inclusive bound reserves decoding, duplicate scan, parse, canonicalization,
  // hashing, base64 copies, freeze and descriptor traversal before allocation.
  budget.chargeWork(8192 + length * 256);
  const input = new Uint8Array(length);
  Uint8Array.prototype.set.call(input, bytes);
  let decoded: string;
  try {decoded = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(input);} catch {return reject('capsule-utf8');}
  const parsed = record(parseCatalogJson(decoded, {maxBytes: DIRECT_CAPSULE_LIMITS.maxBytes, maxDepth: 16}), ['versions', 'source', 'compatibility', 'fingerprint']);
  const actual = record(parsed.versions, Object.keys(versions));
  for (const key of Object.keys(versions) as (keyof typeof versions)[]) if (actual[key] !== versions[key]) reject('unsupported-version-mode-or-policy');
  const source = record(parsed.source, ['base64', 'digest']); text(source.base64); text(source.digest);
  if (source.base64.length > Math.ceil(DIRECT_CAPSULE_LIMITS.sourceBytes / 3) * 4) throw new Stop('resource-limit', 'source-byte-limit');
  const sourceBytes = Buffer.from(source.base64, 'base64');
  if (sourceBytes.byteLength > DIRECT_CAPSULE_LIMITS.sourceBytes) throw new Stop('resource-limit', 'source-byte-limit');
  if (sourceBytes.toString('base64') !== source.base64 || hash(sourceBytes) !== source.digest) reject('corrupt-source');
  try {new TextDecoder('utf-8', {fatal: true}).decode(sourceBytes);} catch {return reject('source-utf8');}
  const c = record(parsed.compatibility, ['selector', 'service', 'port', 'action', 'input', 'output', 'faults']);
  const s = record(c.selector, ['portType', 'binding', 'operation']); name(s.portType); name(s.binding); ncname(s.operation);
  name(c.service); ncname(c.port); text(c.action); root(c.input); root(c.output);
  if (!Array.isArray(c.faults)) reject('faults-required');
  const faults = new Set<string>();
  for (const item of c.faults as unknown[]) {
    const f = record(item, ['name', 'root']); ncname(f.name); root(f.root);
    if (faults.has(f.name)) reject('duplicate-fault'); faults.add(f.name);
  }
  text(parsed.fingerprint);
  if (hash(json({versions: parsed.versions, compatibility: c}, budget)) !== parsed.fingerprint) reject('compatibility-fingerprint');
  check(budget, signal);
  return budget.freeze(parsed) as unknown as Capsule;
}
function descriptor(contract: DirectOperationContract, selection: DirectSourceSelection, signal?: AbortSignal): {compatibility: Compatibility; original: Uint8Array; mappings: DirectValueMapping[]} {
  const {context: {budget}, source} = inspectDirectOperation(contract);
  check(budget, signal);
  if (source.resources.some(r => r.byteLength > DIRECT_CAPSULE_LIMITS.sourceBytes)) throw new Stop('resource-limit', 'source-byte-limit');
  const owned = budget.snapshot(selection); name(owned.service); ncname(owned.port);
  record(owned, ['service', 'port']);
  const {original} = prepareDirectSoapSource(contract, owned, () => check(budget, signal));
  if (original.byteLength > DIRECT_CAPSULE_LIMITS.sourceBytes) throw new Stop('resource-limit', 'source-byte-limit');
  const mappings: DirectValueMapping[] = [];
  const make = (direction: Parameters<typeof createDirectValueMapping>[1]): Root => {
    const m = createDirectValueMapping(contract, direction, {signal});
    if (m.kind !== 'direct-mapping') throw new Stop(m.kind === 'resource-limit' || m.kind === 'cancelled' ? m.kind : 'unsupported', m.rule);
    mappings.push(m); budget.chargeWork(512 + m.slots.length * 1024);
    // Resolved schema type names and expanded slot identities are independent
    // of retrieval URI, source offsets, lexical prefixes and context IDs.
    const type = m.root.type;
    if (type.kind !== 'builtin' && type.kind !== 'symbol') throw new Stop('unsupported', 'named-direct-type-required');
    return {element: m.root.element.name, message: m.root.message, part: m.root.part, type: type.name,
      builtin: m.rootBuiltin ?? null, slots: m.slots.map(s => ({element: s.element.name, builtin: s.builtin, min: s.particle.occurs.min, max: s.particle.occurs.max}))};
  };
  const input = make({kind: 'input'}), output = make({kind: 'output'});
  const faults = contract.faults.map(f => ({name: f.name, root: make({kind: 'fault', name: f.name})}));
  const compatibility = budget.freeze({selector: contract.selector, service: owned.service, port: owned.port, action: contract.binding.action, input, output, faults});
  return {compatibility, original, mappings};
}
/** Writer consumes native authority; produced bytes contain no handles or source paths. */
export function createDirectSourceCapsule(contract: DirectOperationContract, selection: DirectSourceSelection, signal?: AbortSignal): Readonly<{kind: 'direct-capsule'; bytes: Uint8Array; admitted: false; usage: ResolverUsage}> | DirectCapsuleFailure {
  const {budget} = inspectDirectOperation(contract).context;
  try {
    const {compatibility, original} = descriptor(contract, selection, signal);
    budget.chargeWork(8192 + original.byteLength * 256);
    const capsule: Capsule = {versions, source: {base64: Buffer.from(original).toString('base64'), digest: hash(original)}, compatibility,
      fingerprint: hash(json({versions, compatibility}, budget))};
    const serialized = json(capsule, budget) + '\n';
    if (Buffer.byteLength(serialized) > DIRECT_CAPSULE_LIMITS.maxBytes) throw new Stop('resource-limit', 'capsule-byte-limit');
    const bytes = Buffer.from(serialized);
    read(bytes, budget, signal); check(budget, signal);
    return Object.freeze({kind: 'direct-capsule', bytes, admitted: false, usage: Object.freeze({...budget.usage()})});
  } catch (error) {return failure(error, budget);}
}
/** No capsule path is used. Caller chooses and authorizes a NEW physical source. */
export async function reconstructDirectSourceCapsule(bytes: Uint8Array, localSource: string, options: Readonly<{
  policy: SchemaResourcePolicy; limits?: SemanticBudgetLimits; signal?: AbortSignal;
}>): Promise<ReconstructedDirectSource | DirectCapsuleFailure> {
  const budget = createSemanticBudget(options.limits);
  return reconstructDirectSourceCapsuleInRequest(bytes, localSource, options, budget);
}
/** Internal consumer entry: decoding/emission and reconstruction share one sticky request. */
export async function reconstructDirectSourceCapsuleInRequest(bytes: Uint8Array, localSource: string, options: Readonly<{
  policy: SchemaResourcePolicy; limits?: SemanticBudgetLimits; signal?: AbortSignal;
}>, budget: SemanticBudget): Promise<ReconstructedDirectSource | DirectCapsuleFailure> {
  try {
    const capsule = read(bytes, budget, options.signal);
    if (new URL(resolveResourceUri(localSource)).protocol !== 'file:') throw new Stop('missing-authority', 'new-local-file-required');
    // Pin the caller-authorized actual file, rather than substituting artifact
    // bytes for a modified file. No network origins are inherited or accepted.
    const loader = await SchemaResourceLoader.create({fileRoots: options.policy.fileRoots}, {resources: 1, resourceBytes: DIRECT_CAPSULE_LIMITS.sourceBytes, totalBytes: DIRECT_CAPSULE_LIMITS.sourceBytes}, undefined, n => {check(budget, options.signal); budget.chargeWork(n);});
    const resource = await loader.fetchResource(localSource);
    budget.chargeWork(1024 + resource.byteLength * 64);
    if (resource.digest !== capsule.source.digest || Buffer.from(resource.bytes).toString('base64') !== capsule.source.base64) reject('local-source-changed');
    // Existing syntax owner refuses DTD/entities; graph triggers are rejected
    // before semantic preparation, even if the caller authorized a wider root.
    let syntax;
    try {syntax = parseOrderedSyntax(resource.bytes, resource.uri, {maxNodes: options.limits?.maxNodes,
      reserveNode: () => budget.reserveNodes(1), chargeWork: n => {check(budget, options.signal); budget.chargeWork(n);}});}
    catch (error) {
      if (error instanceof SchemaLoadingError) throw new Stop(error.category === 'resource-limit' ? 'resource-limit' : error.category === 'unsupported-capability' ? 'unsupported' : 'invalid-schema', 'source-syntax');
      throw error;
    }
    const stack = [syntax.root];
    while (stack.length) {
      check(budget, options.signal); const node = stack.pop()!;
      budget.chargeWork(256 + node.children.length * 32);
      if (['import', 'include', 'redefine'].includes(node.name.local)) throw new Stop('unsupported', 'single-source-required');
      stack.push(...syntaxElements(node));
    }
    const selected = await selectDirectOperationInRequest(resource.uri, capsule.compatibility.selector, {
      loading: {policy: {fileRoots: options.policy.fileRoots}, offlineResources: new Map([[resource.uri, resource]])}, limits: options.limits, signal: options.signal,
    }, budget);
    if (selected.kind !== 'selected') throw new Stop(selected.kind === 'loading-refused' ? 'missing-authority' : selected.kind === 'selection-refused' ? 'incompatible-artifact' : selected.kind, selected.rule);
    const derived = descriptor(selected.contract, {service: capsule.compatibility.service, port: capsule.compatibility.port}, options.signal);
    if (json(derived.compatibility, budget) !== json(capsule.compatibility, budget)) reject('source-contract-changed');
    check(budget, options.signal); budget.chargeWork(1024);
    const result: ReconstructedDirectSource = Object.freeze({kind: 'reconstructed-direct', contract: selected.contract, mappings: Object.freeze(derived.mappings), selection: Object.freeze({service: capsule.compatibility.service, port: capsule.compatibility.port}), admitted: false, usage: Object.freeze({...budget.usage()})});
    reconstructed.set(result, capsule);
    return result;
  } catch (error) {
    if (!budget.exhausted() && options.signal?.aborted) return failure(new Stop('cancelled', 'cooperative-cancellation'), budget);
    return failure(error, budget);
  }
}
/** #195/#201 handoff: compare expected data against a freshly issued native plan. */
export function checkDirectSourceCompatibility(expected: unknown, contract: DirectOperationContract, selection: DirectSourceSelection, signal?: AbortSignal): Readonly<{kind: 'compatible-direct'; sourceIdentity: 'exact-bytes' | 'revised-bytes'; admitted: false; usage: ResolverUsage}> | DirectCapsuleFailure {
  const {budget} = inspectDirectOperation(contract).context;
  if (!expected || typeof expected !== 'object' || !reconstructed.has(expected)) throw new TypeError('Freshly reconstructed expected source required');
  try {
    const capsule = reconstructed.get(expected)!;
    const fresh = descriptor(contract, selection, signal);
    if (json(capsule.compatibility, budget) !== json(fresh.compatibility, budget)) reject('operation-binding-root-fault-slot-or-datatype-changed');
    budget.chargeWork(512 + fresh.original.byteLength * 8); check(budget, signal);
    return Object.freeze({kind: 'compatible-direct', sourceIdentity: capsule.source.digest === hash(fresh.original) ? 'exact-bytes' : 'revised-bytes', admitted: false, usage: Object.freeze({...budget.usage()})});
  } catch (error) {return failure(error, budget);}
}
