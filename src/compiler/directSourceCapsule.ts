import {directDataOwnership, directLimit, directLoadingLimits} from './directExecutionPolicy.js';
/** Internal P3.6 data boundary. Reading data never grants source or dispatch authority. */
import {checkSemanticBudget} from './semanticBudget.js';
import {DataOwnershipLimitError} from './dataOwnership.js';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalJson, parseCatalogJson, CatalogError} from './catalogErrors.js';
import {createApplicationBudget} from './semanticBudget.js';
import type {SemanticBudget, SemanticBudgetLimits, ResolverUsage} from './semanticBudget.js';
import {inspectDirectOperation, selectDirectOperationInRequest, selectComponentOperationInRequest} from './directOperation.js';
import type {DirectOperationContract, DirectOperationSelector} from './directOperation.js';
import {createDirectValueMapping, createComponentValueMapping, inspectComponentValueMapping, DIRECT_VALUE_VERSION, DIRECT_SCALAR_POLICY} from './directValues.js';
import type {DirectValueMapping, ComponentValueMapping} from './directValues.js';
import {prepareDirectSoapSource, prepareComponentSoapWsdl, DirectSoapSourceError, DIRECT_SOAP_SOURCE_MAX_BYTES} from './directSoapSource.js';
import {ComponentSoapPreparation} from './componentSoapPreparation.js';
import {copyOriginalSchemaResource} from '../loader/schemaInput.js';
import type {SchemaInputOptions, SchemaInput} from '../loader/schemaInput.js';
import {SchemaResourceLoader, resolveResourceUri} from '../loader/schemaResources.js';
import type {SchemaResourcePolicy} from '../loader/schemaResources.js';
import {parseOrderedSyntax, syntaxElements, isXmlNCName, SchemaLoadingError} from '../loader/orderedSyntax.js';
import type {ExpandedName} from '../loader/orderedSyntax.js';
import {createComponentRecordProjection, inspectComponentRecordProjection} from './componentRecordProjection.js';
import type {ComponentRecordProjection, ComponentRecordProjectionSpec} from './componentRecordProjection.js';
import {acquireStandardSchemaLibrary, SCHEMA_ELEMENT_LIBRARY} from './standardSchemaComponents.js';
import {parseApplicationGroups} from './applicationGroups.js';
import type {ApplicationGroupsOptions} from './applicationGroups.js';

export const DIRECT_CAPSULE_LIMITS = Object.freeze({maxBytes: 256 * 1024, sourceBytes: DIRECT_SOAP_SOURCE_MAX_BYTES});
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
  else if (error instanceof DataOwnershipLimitError) {kind = 'resource-limit'; rule = error.message;}
  else if (error instanceof Stop) {({kind, rule} = error);}
  else if (error instanceof CatalogError) {kind = error.category === 'resource-limit' ? 'resource-limit' : 'incompatible-artifact'; rule = 'capsule-json';}
  else if (error instanceof DirectSoapSourceError) {kind = error.kind; rule = error.message;}
  else if (error instanceof SchemaLoadingError) {kind = error.category === 'resource-limit' ? 'resource-limit' : 'missing-authority'; rule = 'authorized-local-source-required';}
  else throw error;
  return Object.freeze({kind, rule, repair: 'Regenerate matched checked direct artifacts from explicitly authorized original WSDL using the checked-direct-v1 pipeline.', usage: Object.freeze({...budget.usage()})});
}
function check(budget: SemanticBudget, signal?: AbortSignal): void {
  checkSemanticBudget(budget); if (signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');
}
function hash(text: string | Uint8Array): string {return createHash('sha256').update(text).digest('hex');}
function json(value: unknown, budget: SemanticBudget): string {

  directDataOwnership(budget).freeze(value);
  return canonicalJson(value);
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
function capsuleJson(bytes: Uint8Array, budget: SemanticBudget, signal?: AbortSignal): unknown {
  check(budget, signal);
  if (!types.isUint8Array(bytes) || types.isProxy(bytes)) return reject('byte-input-required');
  const typed = Object.getPrototypeOf(Uint8Array.prototype) as object;
  const length = Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!.call(bytes) as number;
  const backing: unknown = Object.getOwnPropertyDescriptor(typed, 'buffer')!.get!.call(bytes);
  if (types.isSharedArrayBuffer(backing)) return reject('shared-bytes-unsupported');
  if (length > directLimit(budget, DIRECT_CAPSULE_LIMITS.maxBytes)) throw new Stop('resource-limit', 'capsule-byte-limit');
  // The actual capsule byte/depth caps bound decoding, hashing and canonicalization.

  const input = new Uint8Array(length);
  Uint8Array.prototype.set.call(input, bytes);
  let decoded: string;
  try {decoded = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(input);} catch {return reject('capsule-utf8');}
  return parseCatalogJson(decoded, {maxBytes: directLimit(budget, DIRECT_CAPSULE_LIMITS.maxBytes), maxDepth: 16});
}
function read(bytes: Uint8Array, budget: SemanticBudget, signal?: AbortSignal): Capsule {
  const parsed = record(capsuleJson(bytes, budget, signal), ['versions', 'source', 'compatibility', 'fingerprint']);
  const actual = record(parsed.versions, Object.keys(versions));
  for (const key of Object.keys(versions) as (keyof typeof versions)[]) if (actual[key] !== versions[key]) reject('unsupported-version-mode-or-policy');
  const source = record(parsed.source, ['base64', 'digest']); text(source.base64); text(source.digest);
  if (source.base64.length > Math.ceil(directLimit(budget, DIRECT_CAPSULE_LIMITS.sourceBytes) / 3) * 4) throw new Stop('resource-limit', 'source-byte-limit');
  const sourceBytes = Buffer.from(source.base64, 'base64');
  if (sourceBytes.byteLength > directLimit(budget, DIRECT_CAPSULE_LIMITS.sourceBytes)) throw new Stop('resource-limit', 'source-byte-limit');
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
  return directDataOwnership(budget).freeze(parsed) as unknown as Capsule;
}
function descriptor(contract: DirectOperationContract, selection: DirectSourceSelection, signal?: AbortSignal): {compatibility: Compatibility; original: Uint8Array; mappings: DirectValueMapping[]} {
  const {context: {budget}, source} = inspectDirectOperation(contract);
  check(budget, signal);
  if (source.resources.some(r => r.byteLength > directLimit(budget, DIRECT_CAPSULE_LIMITS.sourceBytes))) throw new Stop('resource-limit', 'source-byte-limit');
  const owned = directDataOwnership(budget).snapshot(selection, () => check(budget, signal)); name(owned.service); ncname(owned.port);
  record(owned, ['service', 'port']);
  const {original} = prepareDirectSoapSource(contract, owned, () => check(budget, signal));
  if (original.byteLength > directLimit(budget, DIRECT_CAPSULE_LIMITS.sourceBytes)) throw new Stop('resource-limit', 'source-byte-limit');
  const mappings: DirectValueMapping[] = [];
  const make = (direction: Parameters<typeof createDirectValueMapping>[1]): Root => {
    const m = createDirectValueMapping(contract, direction, {signal});
    if (m.kind !== 'direct-mapping') throw new Stop(m.kind === 'resource-limit' || m.kind === 'cancelled' ? m.kind : 'unsupported', m.rule);
    mappings.push(m);
    // Resolved schema type names and expanded slot identities are independent
    // of retrieval URI, source offsets, lexical prefixes and context IDs.
    const type = m.root.type;
    if (type.kind !== 'builtin' && type.kind !== 'symbol') throw new Stop('unsupported', 'named-direct-type-required');
    return {element: m.root.element.name, message: m.root.message, part: m.root.part, type: type.name,
      builtin: m.rootBuiltin ?? null, slots: m.slots.map(s => ({element: s.element.name, builtin: s.builtin, min: s.particle.occurs.min, max: s.particle.occurs.max}))};
  };
  const input = make({kind: 'input'}), output = make({kind: 'output'});
  const faults = contract.faults.map(f => ({name: f.name, root: make({kind: 'fault', name: f.name})}));
  const compatibility = directDataOwnership(budget).freeze({selector: contract.selector, service: owned.service, port: owned.port, action: contract.binding.action, input, output, faults});
  return {compatibility, original, mappings};
}
/** Writer consumes native authority; produced bytes contain no handles or source paths. */
export function createDirectSourceCapsule(contract: DirectOperationContract, selection: DirectSourceSelection, signal?: AbortSignal): Readonly<{kind: 'direct-capsule'; bytes: Uint8Array; admitted: false; usage: ResolverUsage}> | DirectCapsuleFailure {
  const {budget} = inspectDirectOperation(contract).context;
  try {
    const {compatibility, original} = descriptor(contract, selection, signal);

    const capsule: Capsule = {versions, source: {base64: Buffer.from(original).toString('base64'), digest: hash(original)}, compatibility,
      fingerprint: hash(json({versions, compatibility}, budget))};
    const serialized = json(capsule, budget) + '\n';
    if (Buffer.byteLength(serialized) > directLimit(budget, DIRECT_CAPSULE_LIMITS.maxBytes)) throw new Stop('resource-limit', 'capsule-byte-limit');
    const bytes = Buffer.from(serialized);
    read(bytes, budget, signal); check(budget, signal);
    return Object.freeze({kind: 'direct-capsule', bytes, admitted: false, usage: Object.freeze({...budget.usage()})});
  } catch (error) {return failure(error, budget);}
}
/** No capsule path is used. Caller chooses and authorizes a NEW physical source. */
export async function reconstructDirectSourceCapsule(bytes: Uint8Array, localSource: string, options: Readonly<{
  policy: SchemaResourcePolicy; limits?: SemanticBudgetLimits; signal?: AbortSignal;
}>): Promise<ReconstructedDirectSource | DirectCapsuleFailure> {
  const budget = createApplicationBudget(options.limits);
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
    const loader = await SchemaResourceLoader.create({fileRoots: options.policy.fileRoots}, {...directLoadingLimits(budget), resources: 1, resourceBytes: directLimit(budget, DIRECT_CAPSULE_LIMITS.sourceBytes), totalBytes: directLimit(budget, DIRECT_CAPSULE_LIMITS.sourceBytes)}, undefined, () => check(budget, options.signal), options.signal);
    const resource = await loader.fetchResource(localSource);

    if (resource.digest !== capsule.source.digest || Buffer.from(resource.bytes).toString('base64') !== capsule.source.base64) reject('local-source-changed');
    // Existing syntax owner refuses DTD/entities; graph triggers are rejected
    // before semantic preparation, even if the caller authorized a wider root.
    let syntax;
    try {syntax = parseOrderedSyntax(resource.bytes, resource.uri, {maxDepth: directLimit(budget, 256), maxNodes: options.limits?.maxNodes,
      reserveNode: () => budget.reserveNodes(1), chargeWork: () => check(budget, options.signal)});}
    catch (error) {
      if (error instanceof SchemaLoadingError) throw new Stop(error.category === 'resource-limit' ? 'resource-limit' : error.category === 'unsupported-capability' ? 'unsupported' : 'invalid-schema', 'source-syntax');
      throw error;
    }
    const stack = [syntax.root];
    while (stack.length) {
      check(budget, options.signal); const node = stack.pop()!;

      if (['import', 'include', 'redefine'].includes(node.name.local)) throw new Stop('unsupported', 'single-source-required');
      stack.push(...syntaxElements(node));
    }
    const selected = await selectDirectOperationInRequest(resource.uri, capsule.compatibility.selector, {
      loading: {policy: {fileRoots: options.policy.fileRoots}, offlineResources: new Map([[resource.uri, resource]])}, limits: options.limits, signal: options.signal,
    }, budget);
    if (selected.kind !== 'selected') throw new Stop(selected.kind === 'loading-refused' ? 'missing-authority' : selected.kind === 'selection-refused' ? 'incompatible-artifact' : selected.kind, selected.rule);
    const derived = descriptor(selected.contract, {service: capsule.compatibility.service, port: capsule.compatibility.port}, options.signal);
    if (json(derived.compatibility, budget) !== json(capsule.compatibility, budget)) reject('source-contract-changed');
    check(budget, options.signal);
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
     check(budget, signal);
    return Object.freeze({kind: 'compatible-direct', sourceIdentity: capsule.source.digest === hash(fresh.original) ? 'exact-bytes' : 'revised-bytes', admitted: false, usage: Object.freeze({...budget.usage()})});
  } catch (error) {return failure(error, budget);}
}

const componentVersions = Object.freeze({...versions, scope: 'component-soap11-utf8-graph-v1', mapping: 'component-values-v1',
  runtimePolicy: 'explicit-http-verified-https-transport-v1'} as const);
const scopedComponentVersions = Object.freeze({...componentVersions, scope: 'component-soap11-utf8-graph-v2', mapping: 'component-values-and-record-scope-v1'} as const);
const rpcComponentVersions = Object.freeze({...componentVersions, scope: 'component-soap11-rpc-strings-v1', mapping: 'component-rpc-string-values-v1'} as const);
type ComponentRoot = Readonly<{element: ExpandedName; message: ExpandedName; part: string}> | Readonly<{
  kind: 'rpc-typed-parts-v1'; message: ExpandedName; wrapper: ExpandedName; bodyNamespace: string;
  encoding: string; parts: readonly {name: string; type: ExpandedName}[]}>;
interface ComponentResource {readonly key: string; readonly base64: string; readonly digest: string}
interface ComponentRecordSource {
  readonly selector: DirectOperationSelector; readonly action: string; readonly output: ComponentRoot;
  readonly libraries: readonly string[]; readonly resources: readonly ComponentResource[];
}
interface ComponentProjectionData {readonly spec: ComponentRecordProjectionSpec; readonly source: ComponentRecordSource}
interface ComponentCompatibility extends DirectSourceSelection {
  readonly selector: DirectOperationSelector; readonly action: string;
  readonly input: ComponentRoot; readonly output: ComponentRoot; readonly faults: readonly {name: string; root: ComponentRoot}[];
}
interface ComponentCapsule {
  readonly versions: typeof componentVersions | typeof scopedComponentVersions | typeof rpcComponentVersions;
  readonly resources: readonly ComponentResource[];
  readonly libraries?: readonly string[]; readonly projection?: ComponentProjectionData | null;
  readonly compatibility: ComponentCompatibility; readonly fingerprint: string;
  readonly applicationGroups?: ApplicationGroupsOptions;
  readonly applicationGroupIdentity?: string;
}
export interface ReconstructedComponentSource {
  readonly kind: 'reconstructed-component'; readonly contract: DirectOperationContract;
  readonly mappings: readonly (ComponentValueMapping | ComponentRecordProjection)[]; readonly selection: DirectSourceSelection;
  readonly responseProjection?: ComponentRecordProjection;
  readonly admitted: false; readonly usage: ResolverUsage;
}
const componentReconstructions = new WeakMap<ReconstructedComponentSource, ComponentCapsule>();
function componentFailure(error: unknown, budget: SemanticBudget): DirectCapsuleFailure {
  return Object.freeze({...failure(error, budget), repair: 'Regenerate matched component artifacts from explicitly authorized original WSDL and dependencies.'});
}
// @constraints Retrieval keys are compared only; artifact paths never initiate I/O. Local relative imports can relocate together.
function componentResourceKey(source: SchemaInput, uri: string): string {
  if (uri === source.root.uri) return 'root';
  if (new URL(uri).protocol !== 'file:') return 'uri:' + uri;
  return 'file:' + path.relative(path.dirname(fileURLToPath(source.root.uri)), fileURLToPath(uri)).replaceAll('\\', '/');
}
function componentResources(contract: DirectOperationContract, signal?: AbortSignal): readonly ComponentResource[] {
  const {source, context: {budget}} = inspectDirectOperation(contract);
  const resources = source.resources.map(resource => {
    check(budget, signal); const bytes = copyOriginalSchemaResource(source, resource.uri, amount => {check(budget, signal); budget.chargeWork(amount);});
    return {key: componentResourceKey(source, resource.uri), base64: Buffer.from(bytes).toString('base64'), digest: resource.digest};
  }).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  if (new Set(resources.map(resource => resource.key)).size !== resources.length) throw new Stop('unsupported', 'ambiguous-resource-key');
  return resources;
}
async function componentDescriptor(contract: DirectOperationContract, selection: DirectSourceSelection, signal?: AbortSignal,
  responseProjection?: ComponentRecordProjection, preparation?: ComponentSoapPreparation, applicationGroups?: ApplicationGroupsOptions) {
  const {context: {budget}, source} = inspectDirectOperation(contract);
  const tick = () => check(budget, signal);
  tick();
  if (contract.basis !== 'native-component-premises-v1' || contract.correspondence !== 'dated-XSD-2004-components-v1') throw new Stop('unsupported', 'component-capsule-version');
  const owned = directDataOwnership(budget).snapshot(selection, tick);
  record(owned, ['service', 'port']); name(owned.service); ncname(owned.port);
  if (preparation) await ComponentSoapPreparation.prototype.prepare.call(preparation, contract, owned, tick);
  else await prepareComponentSoapWsdl(contract, owned, tick);
  if (responseProjection) inspectComponentRecordProjection(responseProjection, contract);
  const mappings: (ComponentValueMapping | ComponentRecordProjection)[] = [];
  const make = (direction: ComponentValueMapping['direction']): ComponentRoot => {
    tick(); const mapping = direction.kind === 'output' && responseProjection ? responseProjection : createComponentValueMapping(contract, direction, {signal}, applicationGroups);
    if (mapping.kind !== 'component-mapping' && mapping.kind !== 'component-record-projection') throw new Stop(mapping.kind === 'resource-limit' || mapping.kind === 'cancelled' ? mapping.kind : 'unsupported', mapping.rule);
    mappings.push(mapping);
    if ('parts' in mapping.root) return {kind: 'rpc-typed-parts-v1', message: mapping.root.message,
      wrapper: mapping.root.wrapper, bodyNamespace: mapping.root.bodyNamespace, encoding: contract.binding.encoding!,
      parts: mapping.root.parts.map(part => {
        if (part.type.kind !== 'builtin') throw new Stop('unsupported', 'rpc-string-type-required');
        return {name: part.name, type: part.type.name};
      })};
    return {element: mapping.root.element.name, message: mapping.root.message, part: mapping.root.part};
  };
  const input = make({kind: 'input'}), output = make({kind: 'output'});
  const faults = contract.faults.map(fault => ({name: fault.name, root: make({kind: 'fault', name: fault.name})}));
  const compatibility: ComponentCompatibility = {selector: contract.selector, service: owned.service, port: owned.port,
    action: contract.binding.action, input, output, faults};
  let projection: ComponentProjectionData | null = null;
  if (responseProjection) {
    const {companion} = inspectComponentRecordProjection(responseProjection, contract);
    if ('parts' in companion.output) throw new Stop('unsupported', 'record-projection-requires-document-output');
    const {context} = inspectDirectOperation(companion);
    projection = {spec: responseProjection.spec, source: {selector: companion.selector, action: companion.binding.action,
      output: {element: companion.output.element.name, message: companion.output.message, part: companion.output.part},
      libraries: context.standardLibraryIds(), resources: componentResources(companion, signal)}};
  }
  const targets = new Set(mappings.flatMap(mapping => mapping.kind === 'component-mapping'
    ? (inspectComponentValueMapping(mapping,contract).applicationGroups?.targets ?? []).map(target=>target.target) : []));
  const groups = applicationGroups ? parseApplicationGroups(applicationGroups) : undefined;
  const groupPlans = mappings.flatMap(mapping=>mapping.kind==='component-mapping'
    ? [inspectComponentValueMapping(mapping,contract).applicationGroups!] : []);
  const applicationGroupIdentity = groups ? hash(json({version:'application-groups-v1',
    targets:[...new Map(groupPlans.flatMap(plan=>plan.targets.map(target=>[target.target,target] as const))).values()].sort((a,b)=>a.target.localeCompare(b.target,'en')),
    records:[...new Map(groupPlans.flatMap(plan=>plan.dispositions.map(record=>[record.source,record] as const))).values()].sort((a,b)=>a.source.localeCompare(b.source,'en'))},budget)) : undefined;
  tick(); return {compatibility, resources: componentResources(contract, signal), mappings, libraries: inspectDirectOperation(contract).context.standardLibraryIds(), projection,
    ...(groups ? {applicationGroups: groups.names === undefined ? {} : {names:groups.names.filter(item=>targets.has(item.target))}, applicationGroupIdentity} : {})};
}
/** Serialize native component provenance as data; no source, mapping or execution authority is serialized.
 * @returns Deterministic original resource bytes and compatibility description, or explicit refusal.
 * @throws TypeError For foreign operation handles. Caller cancellation is returned as a refusal.
 */
export async function createComponentSourceCapsule(contract: DirectOperationContract, selection: DirectSourceSelection, signal?: AbortSignal,
  responseProjection?: ComponentRecordProjection):
  Promise<Readonly<{kind: 'component-capsule'; bytes: Uint8Array; admitted: false; usage: ResolverUsage}> | DirectCapsuleFailure> {
  const {budget} = inspectDirectOperation(contract).context;
  try {
    const {compatibility, resources, libraries, projection} = await componentDescriptor(contract, selection, signal, responseProjection);
    const capsule = componentCapsule({compatibility, resources, libraries, projection}, budget);
    const serialized = json(capsule, budget) + '\n';
    if (Buffer.byteLength(serialized) > directLimit(budget, DIRECT_CAPSULE_LIMITS.maxBytes)) throw new Stop('resource-limit', 'capsule-byte-limit');
    check(budget, signal);
    return Object.freeze({kind: 'component-capsule', bytes: Buffer.from(serialized), admitted: false, usage: Object.freeze({...budget.usage()})});
  } catch (error) {
    if (!budget.exhausted() && signal?.aborted) return componentFailure(new Stop('cancelled', 'cooperative-cancellation'), budget);
    return componentFailure(error, budget);
  }
}
function componentCapsule(derived: Pick<Awaited<ReturnType<typeof componentDescriptor>>, 'compatibility' | 'resources' | 'libraries' | 'projection' | 'applicationGroups' | 'applicationGroupIdentity'>,
  budget: SemanticBudget): ComponentCapsule {
  const {compatibility, resources, libraries, projection} = derived;
  const extended = libraries.length > 0 || projection !== null;
  const rpc = 'kind' in compatibility.input && compatibility.input.kind === 'rpc-typed-parts-v1';
  if (rpc && (extended || derived.applicationGroups)) throw new Stop('unsupported', 'rpc-artifact-extension');
  const value = {versions: rpc ? rpcComponentVersions : extended ? scopedComponentVersions : componentVersions, resources, compatibility,
    ...(extended ? {libraries, projection} : {}), ...(derived.applicationGroups ? {applicationGroups: derived.applicationGroups,applicationGroupIdentity:derived.applicationGroupIdentity} : {})};
  return {...value, fingerprint: hash(json(value, budget))};
}

/** Prepare a generator-owned operation once through the same native descriptor used by runtime reconstruction.
 * @param contract Fresh source-owned operation, never a report or copied handle.
 * @param selection Explicit resolved service and port.
 * @param preparation Invocation-owned SOAP metadata reuse.
 * @param signal Caller cancellation.
 * @param responseProjection Optional native companion projection.
 * @returns An authentic reconstruction retaining its exact issued capsule and mappings, or native refusal.
 * @throws TypeError For foreign native operation identities.
 * @constraints Runtime physical-source reconstruction is independent and unchanged.
 */
export async function prepareComponentSourceForOperation(contract: DirectOperationContract, selection: DirectSourceSelection,
  preparation: ComponentSoapPreparation, signal?: AbortSignal, responseProjection?: ComponentRecordProjection, applicationGroups?: ApplicationGroupsOptions): Promise<ReconstructedComponentSource | DirectCapsuleFailure> {
  const {budget} = inspectDirectOperation(contract).context;
  try {
    const derived = await componentDescriptor(contract, selection, signal, responseProjection, preparation, applicationGroups);
    const capsule = componentCapsule(derived, budget);
    if (Buffer.byteLength(json(capsule, budget) + '\n') > directLimit(budget, DIRECT_CAPSULE_LIMITS.maxBytes)) throw new Stop('resource-limit', 'capsule-byte-limit');
    return issueComponentReconstruction(capsule, contract, derived, signal, responseProjection);
  } catch (error) {
    if (!budget.exhausted() && signal?.aborted) return componentFailure(new Stop('cancelled', 'cooperative-cancellation'), budget);
    return componentFailure(error, budget);
  }
}

/** Copy capsule data retained by an authentic reconstruction without repeating preparation.
 * @param expected Fresh owned reconstruction.
 * @param signal Caller cancellation.
 * @returns Deterministic capsule bytes; the data grants no runtime authority.
 * @throws TypeError For copied or foreign reconstruction identities; cancellation/resource failures propagate.
 */
export function componentSourceCapsuleBytes(expected: ReconstructedComponentSource, signal?: AbortSignal): Uint8Array {
  inspectReconstructedComponentSource(expected);
  const {budget} = inspectDirectOperation(expected.contract).context;
  check(budget, signal);
  return Buffer.from(json(componentReconstructions.get(expected)!, budget) + '\n');
}
function readComponent(bytes: Uint8Array, budget: SemanticBudget, signal?: AbortSignal): ComponentCapsule {
  const value = capsuleJson(bytes, budget, signal);
  const extended = !!value && typeof value === 'object' && (Object.hasOwn(value, 'libraries') || Object.hasOwn(value, 'projection'));
  const grouped = !!value && typeof value === 'object' && Object.hasOwn(value, 'applicationGroups');
  const parsed = record(value, [...(extended ? ['versions', 'resources', 'compatibility', 'libraries', 'projection', 'fingerprint']
    : ['versions', 'resources', 'compatibility', 'fingerprint']), ...(grouped ? ['applicationGroups','applicationGroupIdentity'] : [])]);
  if (grouped) {
    try {parseApplicationGroups(parsed.applicationGroups);} catch {reject('application-group-configuration');}
    text(parsed.applicationGroupIdentity);if (!/^[a-f0-9]{64}$/.test(parsed.applicationGroupIdentity)) reject('application-group-identity');
  }
  const rpc = !!parsed.versions && typeof parsed.versions === 'object' && (parsed.versions as Record<string, unknown>).scope === rpcComponentVersions.scope;
  if (rpc && (extended || grouped)) reject('rpc-artifact-extension');
  const expectedVersions = rpc ? rpcComponentVersions : extended ? scopedComponentVersions : componentVersions;
  const actual = record(parsed.versions, Object.keys(expectedVersions));
  for (const key of Object.keys(expectedVersions) as (keyof typeof expectedVersions)[]) if (actual[key] !== expectedVersions[key]) reject('unsupported-version-mode-or-policy');
  validateComponentResources(parsed.resources, budget, signal);
  const root = (value: unknown) => {
    if (rpc) {
      const r = record(value, ['kind', 'message', 'wrapper', 'bodyNamespace', 'encoding', 'parts']);
      if (r.kind !== 'rpc-typed-parts-v1' || r.encoding !== 'http://schemas.xmlsoap.org/soap/encoding/') reject('rpc-root-profile');
      name(r.message); name(r.wrapper); text(r.bodyNamespace);
      if (!Array.isArray(r.parts) || !r.parts.length) return reject('rpc-parts-required');
      const names = new Set<string>();
      for (const part of r.parts) {
        check(budget, signal); const p = record(part, ['name', 'type']); ncname(p.name); name(p.type);
        if (names.has(p.name)) reject('duplicate-rpc-part'); names.add(p.name);
        if (p.type.namespace !== 'http://www.w3.org/2001/XMLSchema' || p.type.local !== 'string') reject('rpc-part-type');
      }
      return;
    }
    const r = record(value, ['element', 'message', 'part']); name(r.element); name(r.message); ncname(r.part);
  };
  const selector = (value: unknown) => {const s = record(value, ['portType', 'binding', 'operation']); name(s.portType); name(s.binding); ncname(s.operation);};
  if (extended) {
    validateComponentLibraries(parsed.libraries);
    if (parsed.projection !== null) {
      const projection = record(parsed.projection, ['spec', 'source']);
      const spec = record(projection.spec, ['version', 'scope', 'payloadPath', 'recordPath', 'opaqueExclusions']);
      if (spec.version !== 'component-record-scope-v1' || spec.scope !== 'records-with-declared-wrapper-scope') reject('unsupported-record-projection');
      const path = (value: unknown) => {if (!Array.isArray(value) || !value.length) reject('record-projection-path'); else for (const entry of value) {check(budget, signal); name(entry);}};
      path(spec.payloadPath); path(spec.recordPath);
      if (!Array.isArray(spec.opaqueExclusions)) return reject('record-projection-exclusions');
      for (const item of spec.opaqueExclusions) {
        check(budget, signal); const exclusion = record(item, ['path', 'reason']); path(exclusion.path);
        if (!['standard-schema-metadata', 'wrapper-declaration-universe'].includes(exclusion.reason as string)) reject('record-projection-exclusion');
      }
      const source = record(projection.source, ['selector', 'action', 'output', 'libraries', 'resources']);
      selector(source.selector); text(source.action); root(source.output);
      validateComponentLibraries(source.libraries); validateComponentResources(source.resources, budget, signal);
    }
    if (!(parsed.libraries as string[]).length && parsed.projection === null) reject('empty-component-extension');
  }
  const c = record(parsed.compatibility, ['selector', 'service', 'port', 'action', 'input', 'output', 'faults']);
  selector(c.selector); name(c.service); ncname(c.port); text(c.action);
  root(c.input); root(c.output);
  if (!Array.isArray(c.faults)) return reject('faults-required');
  const names = new Set<string>();
  for (const entry of c.faults as unknown[]) {
    check(budget, signal); const fault = record(entry, ['name', 'root']); ncname(fault.name); root(fault.root);
    if (names.has(fault.name)) reject('duplicate-fault'); names.add(fault.name);
  }
  text(parsed.fingerprint);
  if (hash(json({versions: actual, resources: parsed.resources, compatibility: c,
    ...(extended ? {libraries: parsed.libraries, projection: parsed.projection} : {}),
    ...(grouped ? {applicationGroups: parsed.applicationGroups,applicationGroupIdentity:parsed.applicationGroupIdentity} : {})}, budget)) !== parsed.fingerprint) reject('compatibility-fingerprint');
  check(budget, signal); return directDataOwnership(budget).freeze(parsed) as unknown as ComponentCapsule;
}
function validateComponentLibraries(value: unknown): void {
  if (!Array.isArray(value)) return reject('component-libraries-required');
  let previous = '';
  for (const id of value) {
    if (typeof id !== 'string' || id !== SCHEMA_ELEMENT_LIBRARY || id <= previous) reject('supported-sorted-unique-libraries-required');
    previous = id;
  }
}
function validateComponentResources(value: unknown, budget: SemanticBudget, signal?: AbortSignal): void {
  if (!Array.isArray(value) || !value.length) return reject('resources-required');
  let previous = '';
  for (const entry of value as unknown[]) {
    check(budget, signal); const resource = record(entry, ['key', 'base64', 'digest']); text(resource.key); text(resource.base64); text(resource.digest);
    if (resource.key <= previous) reject('sorted-unique-resources-required'); previous = resource.key;
    const original = Buffer.from(resource.base64, 'base64');
    if (original.toString('base64') !== resource.base64 || hash(original) !== resource.digest) reject('corrupt-source');
  }
  if (!(value as {key: string}[]).some(resource => resource.key === 'root')) reject('root-resource-required');
}
/** Reconstruct from a physical root and caller-authorized dependencies; embedded bytes are comparison data only.
 * @remarks Local imports may relocate together. All original resource bytes and explicit service/binding roots must match.
 *   Loading policy, offline snapshots and namespace locations are supplied independently by the caller, never the capsule.
 * @returns Fresh native operation/mapping authority with admitted=false, or explicit refusal.
 */
export interface ComponentSourceReconstructionOptions {
  loading: SchemaInputOptions; limits?: SemanticBudgetLimits; signal?: AbortSignal;
  /** Caller permission; artifact identifiers alone never acquire a standard library. */
  standardLibraries?: readonly string[];
  /** Explicit physical companion roots, associated with exact outer binding/operation selectors. */
  recordSources?: readonly {readonly selector: DirectOperationSelector; readonly source: string}[];
}
export async function reconstructComponentSourceCapsule(bytes: Uint8Array, localSource: string, options: Readonly<ComponentSourceReconstructionOptions>): Promise<ReconstructedComponentSource | DirectCapsuleFailure> {
  return reconstructComponentSourceCapsuleInRequest(bytes, localSource, options, createApplicationBudget(options.limits));
}
/** Private runtime seam retaining one sticky request for artifact reading, source qualification and exchange. */
export async function reconstructComponentSourceCapsuleInRequest(bytes: Uint8Array, localSource: string, options: Readonly<ComponentSourceReconstructionOptions>,
  budget: SemanticBudget): Promise<ReconstructedComponentSource | DirectCapsuleFailure> {
  try {
    const capsule = readComponent(bytes, budget, options.signal);
    const allowed = directDataOwnership(budget).snapshot(options.standardLibraries ?? [], () => check(budget, options.signal));
    if (!Array.isArray(allowed) || allowed.some(id => id !== SCHEMA_ELEMENT_LIBRARY) || new Set(allowed).size !== allowed.length)
      throw new Stop('unsupported', 'explicit-standard-library-permissions');
    const sources = directDataOwnership(budget).snapshot(options.recordSources ?? [], () => check(budget, options.signal));
    if (!Array.isArray(sources)) throw new Stop('unsupported', 'explicit-record-source-permissions');
    let recordSource: string | undefined;
    const sourceKeys = new Set<string>();
    for (const entry of sources) {
      check(budget, options.signal); const supplied = record(entry, ['selector', 'source']); text(supplied.source);
      const selector = record(supplied.selector, ['portType', 'binding', 'operation']); name(selector.portType); name(selector.binding); ncname(selector.operation);
      const key = json(selector, budget);
      if (sourceKeys.has(key)) throw new Stop('unsupported', 'duplicate-record-source-permission'); sourceKeys.add(key);
      if (key === json(capsule.compatibility.selector, budget)) recordSource = supplied.source as string;
    }
    if (capsule.projection && !recordSource) throw new Stop('missing-authority', 'explicit-companion-source-required');
    const contract = await selectPinnedComponentSource(capsule.resources, capsule.compatibility.selector, capsule.libraries ?? [], localSource,
      options, budget, allowed);
    let responseProjection: ComponentRecordProjection | undefined;
    if (capsule.projection) {
      const source = capsule.projection.source;
      const companion = await selectPinnedComponentSource(source.resources, source.selector, source.libraries, recordSource!,
        {...options, loading: {...options.loading, sourceUri: undefined}}, budget, allowed);
      const projection = createComponentRecordProjection(contract, companion, capsule.projection.spec, {signal: options.signal});
      if (projection.kind !== 'component-record-projection') throw new Stop(projection.kind === 'resource-limit' || projection.kind === 'cancelled'
        ? projection.kind : 'incompatible-artifact', projection.rule);
      responseProjection = projection;
    }
    return await reconstructComponentAgainst(capsule, contract, {service: capsule.compatibility.service, port: capsule.compatibility.port}, options.signal, responseProjection);
  } catch (error) {
    if (!budget.exhausted() && options.signal?.aborted) return componentFailure(new Stop('cancelled', 'cooperative-cancellation'), budget);
    return componentFailure(error, budget);
  }
}
async function selectPinnedComponentSource(resources: readonly ComponentResource[], selector: DirectOperationSelector, libraries: readonly string[],
  localSource: string, options: Readonly<ComponentSourceReconstructionOptions>, budget: SemanticBudget, allowed: readonly string[]): Promise<DirectOperationContract> {
  if (typeof localSource !== 'string' || new URL(resolveResourceUri(localSource)).protocol !== 'file:') throw new Stop('missing-authority', 'new-local-file-required');
  if (libraries.some(id => !allowed.includes(id))) throw new Stop('missing-authority', 'explicit-standard-component-permission');
  const loader = await SchemaResourceLoader.create({fileRoots: options.loading.policy.fileRoots}, directLoadingLimits(budget, options.loading.limits),
    undefined, amount => {check(budget, options.signal); budget.chargeWork(amount);}, options.signal);
  const physical = await loader.fetchResource(localSource), expectedRoot = resources.find(resource => resource.key === 'root')!;
  if (physical.digest !== expectedRoot.digest || Buffer.from(physical.bytes).toString('base64') !== expectedRoot.base64) reject('local-source-changed');
  const offline = options.loading.offlineResources ? new Map(options.loading.offlineResources) : undefined;
  offline?.set(physical.uri, physical);
  const loading = {...options.loading, ...(offline ? {offlineResources: offline} : {})};
  const selected = await selectComponentOperationInRequest(loading.sourceUri ?? physical.uri, selector, {loading, signal: options.signal,
    standardLibraries: libraries.map(acquireStandardSchemaLibrary)}, budget);
  if (selected.kind !== 'selected') throw new Stop(selected.kind === 'loading-refused' ? 'missing-authority'
    : selected.kind === 'selection-refused' ? 'incompatible-artifact' : selected.kind, selected.rule);
  return selected.contract;
}
/** Generator seam: expected bytes are checked against an already fresh, source-owned native operation.
 * @remarks This accepts transient native authority only. Runtime consumers still reconstruct from independently
 *   authorized physical files. It permits service-wide generation to reuse one native whole-source qualification.
 */
export async function reconstructComponentSourceCapsuleForOperation(bytes: Uint8Array, contract: DirectOperationContract,
  selection: DirectSourceSelection, signal?: AbortSignal, responseProjection?: ComponentRecordProjection): Promise<ReconstructedComponentSource | DirectCapsuleFailure> {
  const {budget} = inspectDirectOperation(contract).context;
  try {return await reconstructComponentAgainst(readComponent(bytes, budget, signal), contract, selection, signal, responseProjection);}
  catch (error) {
    if (!budget.exhausted() && signal?.aborted) return componentFailure(new Stop('cancelled', 'cooperative-cancellation'), budget);
    return componentFailure(error, budget);
  }
}
async function reconstructComponentAgainst(capsule: ComponentCapsule, contract: DirectOperationContract,
  selection: DirectSourceSelection, signal?: AbortSignal, responseProjection?: ComponentRecordProjection): Promise<ReconstructedComponentSource> {
  const {budget} = inspectDirectOperation(contract).context;
  let derived: Awaited<ReturnType<typeof componentDescriptor>>;
  try {derived = await componentDescriptor(contract, selection, signal, responseProjection, undefined, capsule.applicationGroups);}
  catch (error) {if (error instanceof TypeError && error.message.startsWith('applicationGroups')) return reject('source-application-groups-changed'); throw error;}
  if (json(derived.applicationGroups ?? null,budget)!==json(capsule.applicationGroups ?? null,budget)) reject('source-application-groups-changed');
  if (derived.applicationGroupIdentity!==capsule.applicationGroupIdentity) reject('source-application-groups-changed');
  if (json(derived.resources, budget) !== json(capsule.resources, budget)) reject('local-source-changed');
  if (json(derived.compatibility, budget) !== json(capsule.compatibility, budget)) reject('source-contract-changed');
  if (json(derived.libraries, budget) !== json(capsule.libraries ?? [], budget) || json(derived.projection, budget) !== json(capsule.projection ?? null, budget)) reject('source-projection-changed');
  return issueComponentReconstruction(capsule, contract, derived, signal, responseProjection);
}
function issueComponentReconstruction(capsule: ComponentCapsule, contract: DirectOperationContract,
  derived: Awaited<ReturnType<typeof componentDescriptor>>, signal?: AbortSignal, responseProjection?: ComponentRecordProjection): ReconstructedComponentSource {
  const {budget} = inspectDirectOperation(contract).context;
  check(budget, signal);
  const result: ReconstructedComponentSource = Object.freeze({kind: 'reconstructed-component', contract,
    mappings: Object.freeze(derived.mappings), selection: Object.freeze({service: derived.compatibility.service, port: derived.compatibility.port}),
    ...(responseProjection ? {responseProjection} : {}),
    admitted: false, usage: Object.freeze({...budget.usage()})});
  componentReconstructions.set(result, capsule); return result;
}
/** Authenticate transient reconstruction identity; saved/copy-shaped reports cannot be consumed by generators. */
export function inspectReconstructedComponentSource(value: ReconstructedComponentSource): ReconstructedComponentSource {
  if (!componentReconstructions.has(value)) throw new TypeError('Freshly reconstructed component source required');
  inspectDirectOperation(value.contract); return value;
}

/** Group fresh operations for one service without merging source contexts or binding identities.
 * @returns A deterministic operation order over the original native handles.
 * @throws TypeError For foreign handles, duplicate operations, accessors or mixed sources/services/bindings.
 */
export function inspectComponentSourceService(values: readonly ReconstructedComponentSource[]): readonly ReconstructedComponentSource[] {
  if (!Array.isArray(values) || types.isProxy(values) || !values.length) throw new TypeError('Nonempty native component operations required');
  const keys = Reflect.ownKeys(values);
  if (keys.length !== values.length + 1) throw new TypeError('Dense native operation array required');
  const operations: ReconstructedComponentSource[] = [];
  for (let index = 0; index < values.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
    if (!descriptor || !('value' in descriptor)) throw new TypeError('Data-only native operation array required');
    operations.push(inspectReconstructedComponentSource(descriptor.value as ReconstructedComponentSource));
  }
  const first = operations[0]!, {source, context: {budget}} = inspectDirectOperation(first.contract), names = new Set<string>();
  for (const operation of operations) {
    check(budget);
    const inspection = inspectDirectOperation(operation.contract);
    if (inspection.source !== source || inspection.context.budget !== budget
      || json(operation.selection, budget) !== json(first.selection, budget)
      || json(operation.contract.selector.binding, budget) !== json(first.contract.selector.binding, budget)
      || names.has(operation.contract.selector.operation)) throw new TypeError('One source/service/binding and unique operations required');
    names.add(operation.contract.selector.operation);
  }
  return Object.freeze(operations.sort((a, b) => budget.compareText(a.contract.selector.operation, b.contract.selector.operation)));
}
