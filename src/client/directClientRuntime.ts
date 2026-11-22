import {directDataOwnership, directLimit, directLoadingLimits} from '../compiler/directExecutionPolicy.js';
import type {CheckedPayloadDiagnostic} from '../compiler/payloadDiagnostics.js';
/** Private P3.7 binding. No public package entry or alternate SOAP implementation. */
import {checkSemanticBudget} from '../compiler/semanticBudget.js';
import {DataOwnershipLimitError} from '../compiler/dataOwnership.js';
import {types} from 'node:util';
import {COMPONENT_STREAM_RUNTIME_VERSION, planComponentStream, readStreamArtifactCapsule} from '../compiler/componentStreamPlan.js';
import {exchangeComponentStream, type CheckedStreamXmlLimits} from '../compiler/componentStreamSoap.js';
import {checkedStream, type CheckedStream, type CheckedStreamCompletion} from './checkedStream.js';
import {normalizeHttpResponseHeaders} from '../compiler/httpResponseHeaders.js';
import {snapshotUpstreamSecurity} from '../util/upstreamSecurity.js';
import {snapshotComponentHeaderProcessors} from '../compiler/componentSoapHeaders.js';
import type {ComponentHeaderFaultResult} from '../compiler/directSoap.js';
import type {HttpResponseObservation} from '../compiler/httpResponseHeaders.js';
import {createApplicationBudget} from '../compiler/semanticBudget.js';
import type {SemanticBudgetLimits, ResolverUsage} from '../compiler/semanticBudget.js';
import {reconstructDirectSourceCapsuleInRequest, reconstructComponentSourceCapsuleInRequest, checkDirectSourceCompatibility, DIRECT_CAPSULE_LIMITS} from '../compiler/directSourceCapsule.js';
import type {DirectCapsuleFailure} from '../compiler/directSourceCapsule.js';
import {exchangeDirectSoap, exchangeComponentSoap, directSoapOptionsShape} from '../compiler/directSoap.js';
import type {DirectSoapOptions, ComponentSoapOptions, DirectSoapFailure, ComponentRecordSoapResult, ComponentResponseBranchesSoapResult, ComponentProtocolFault, DeclaredSoapFault, Soap11FaultMetadata, Soap12FaultMetadata, SoapAcknowledgement} from '../compiler/directSoap.js';
import type {DirectOperationSelector} from '../compiler/directOperation.js';
import type {DirectApplicationValue} from '../compiler/directValues.js';
import {DIRECT_CLIENT_RUNTIME_VERSION, COMPONENT_CLIENT_RUNTIME_VERSION, COMPONENT_SOAP11_CLIENT_RUNTIME_VERSION, COMPONENT_SOAP12_CLIENT_RUNTIME_VERSION,
  COMPONENT_SOAP11_BRANCH_CLIENT_RUNTIME_VERSION, COMPONENT_SOAP12_BRANCH_CLIENT_RUNTIME_VERSION} from './directClientVersion.js';
import {prepareSchemaSnapshotFiles} from '../loader/schemaInput.js';
import {SchemaLoadingError} from '../loader/orderedSyntax.js';
import {COMPONENT_SOAP11_ONE_WAY_CLIENT_RUNTIME_VERSION, COMPONENT_SOAP12_ONE_WAY_CLIENT_RUNTIME_VERSION} from './directClientVersion.js';

export interface DirectClientOptions {
  readonly localSource: string;
  readonly fileRoots: readonly string[];
  readonly capsule: Uint8Array;
  readonly budget?: SemanticBudgetLimits;
  readonly soap: DirectSoapOptions;
}
export interface ComponentClientOptions extends Omit<DirectClientOptions, 'soap'> {
  readonly sourceResources: readonly {readonly uri: string; readonly file: string; readonly canonicalUri?: string; readonly contentType?: string}[];
  readonly sourceUri?: string;
  readonly sourceOrigins: readonly string[];
  readonly namespaceLocations?: readonly {readonly namespace: string; readonly location: string}[];
  readonly standardLibraries?: readonly string[];
  readonly recordSources?: readonly {readonly selector: DirectOperationSelector; readonly source: string}[];
  readonly branchSources?: readonly {readonly selector: DirectOperationSelector; readonly branch: string; readonly source: string}[];
  readonly soap: ComponentSoapOptions;
}
export interface DirectClientFailure {
  readonly http?: HttpResponseObservation;
  readonly kind: DirectCapsuleFailure['kind'] | DirectSoapFailure['kind'];
  readonly rule: string; readonly usage: ResolverUsage; readonly repair?: string;
  readonly phase?: 'input' | 'response';
  readonly diagnostic?: CheckedPayloadDiagnostic;
}
export type DirectClientResult = DirectClientFailure | Readonly<{
  http?: HttpResponseObservation;
  kind: 'soap-response'; value: DirectApplicationValue; status: number; admitted: false;
  responseBytes: Uint8Array; usage: ResolverUsage;
}> | Readonly<{
  http?: HttpResponseObservation;
  kind: 'soap-fault'; value: DirectApplicationValue; status: number; admitted: false;
  fault: Readonly<{name: string; code: Readonly<{namespace: string; local: string}>; string: string; actor?: string}>;
  responseBytes: Uint8Array; usage: ResolverUsage;
}>;
export interface DirectClientRuntime {
  readonly version: typeof DIRECT_CLIENT_RUNTIME_VERSION;
  execute(expectedBase64: string, input: unknown, options: DirectClientOptions): Promise<DirectClientResult>;
}
/** Component-only protocol faults retain raw bytes without claiming an application value.
 * @since 1.3.0
 */
export type ComponentClientResult<F extends Soap11FaultMetadata | Soap12FaultMetadata = Soap12FaultMetadata> = (Exclude<DirectClientResult, {kind: 'soap-fault'}> | ComponentProtocolFault<F> | ComponentHeaderFaultResult
  | Readonly<Omit<Extract<DirectClientResult, {kind: 'soap-fault'}>, 'fault'> & {fault: Omit<DeclaredSoapFault, 'codeNode'>}>)
  & Readonly<{headerValues?: Readonly<Record<string, unknown>>; processedHeaders?: readonly string[]}>;
export type ComponentBranchClientResult<F extends Soap11FaultMetadata | Soap12FaultMetadata = Soap11FaultMetadata | Soap12FaultMetadata> = ComponentClientResult<F> | Readonly<{
  http?: HttpResponseObservation;
  kind: 'application-error'; branch: string; value: DirectApplicationValue; status: number; admitted: false;
  responseBytes: Uint8Array; usage: ResolverUsage;
}>;
/** The generated literal is the expected artifact; caller bytes never choose its static contract. */
export const directClientRuntime: DirectClientRuntime = Object.freeze({
  version: DIRECT_CLIENT_RUNTIME_VERSION,
  execute: (expectedBase64: string, input: unknown, options: DirectClientOptions) => executeClient(expectedBase64, input, options, false),
});
/** Same artifact/execution chain, with explicit physical dependency snapshots and component-profile reconstruction. */
export const componentClientRuntime = Object.freeze({
  version: COMPONENT_CLIENT_RUNTIME_VERSION,
  execute: (expectedBase64: string, input: unknown, options: ComponentClientOptions): Promise<DirectClientResult> => executeClient(expectedBase64, input, options, true),
});
/** Additive SOAP 1.2 injection shares reconstruction and transport with SOAP 1.1.
 * @since 1.3.0
 */
export const componentSoap12ClientRuntime = Object.freeze({
  version: COMPONENT_SOAP12_CLIENT_RUNTIME_VERSION,
  execute: (expectedBase64: string, input: unknown, options: ComponentClientOptions): Promise<ComponentClientResult> => executeClient(expectedBase64, input, options, true, '1.2'),
});
/** SOAP 1.1 protocol faults require a generated client that can represent a missing application value.
 * @since 1.4.0
 */
export const componentSoap11ClientRuntime = Object.freeze({
  version: COMPONENT_SOAP11_CLIENT_RUNTIME_VERSION,
  execute: (expectedBase64: string, input: unknown, options: ComponentClientOptions) => executeClient(expectedBase64, input, options, true, '1.1'),
});
/** Branch-enabled SOAP 1.1 runtime; retained bindings refuse its capsule profile.
 * @since 1.6.0
 */
export const componentSoap11BranchClientRuntime = Object.freeze({
  version: COMPONENT_SOAP11_BRANCH_CLIENT_RUNTIME_VERSION,
  execute: (expectedBase64: string, input: unknown, options: ComponentClientOptions) => executeClient(expectedBase64, input, options, true, '1.1', true),
});
/** Branch-enabled SOAP 1.2 runtime over the same protocol and native owners.
 * @since 1.6.0
 */
export const componentSoap12BranchClientRuntime = Object.freeze({
  version: COMPONENT_SOAP12_BRANCH_CLIENT_RUNTIME_VERSION,
  execute: (expectedBase64: string, input: unknown, options: ComponentClientOptions) => executeClient(expectedBase64, input, options, true, '1.2', true),
});
export type ComponentOneWayClientResult<F extends Soap11FaultMetadata | Soap12FaultMetadata = Soap11FaultMetadata | Soap12FaultMetadata> = DirectClientFailure | ComponentProtocolFault<F> | SoapAcknowledgement | ComponentHeaderFaultResult;
export const componentSoap11OneWayClientRuntime = Object.freeze({
  version: COMPONENT_SOAP11_ONE_WAY_CLIENT_RUNTIME_VERSION,
  execute: (expectedBase64: string, input: unknown, options: ComponentClientOptions) => executeClient(expectedBase64, input, options, true, '1.1', false, true),
});
export const componentSoap12OneWayClientRuntime = Object.freeze({
  version: COMPONENT_SOAP12_ONE_WAY_CLIENT_RUNTIME_VERSION,
  execute: (expectedBase64: string, input: unknown, options: ComponentClientOptions) => executeClient(expectedBase64, input, options, true, '1.2', false, true),
});
function executeClient(expectedBase64: string, input: unknown, options: DirectClientOptions, component: false): Promise<DirectClientResult>;
function executeClient(expectedBase64: string, input: unknown, options: ComponentClientOptions, component: true): Promise<DirectClientResult>;
function executeClient(expectedBase64: string, input: unknown, options: ComponentClientOptions, component: true, protocol: '1.2'): Promise<ComponentClientResult<Soap12FaultMetadata>>;
function executeClient(expectedBase64: string, input: unknown, options: ComponentClientOptions, component: true, protocol: '1.1'): Promise<ComponentClientResult<Soap11FaultMetadata>>;
function executeClient(expectedBase64: string, input: unknown, options: ComponentClientOptions, component: true, protocol: '1.1', branches: true): Promise<ComponentBranchClientResult<Soap11FaultMetadata>>;
function executeClient(expectedBase64: string, input: unknown, options: ComponentClientOptions, component: true, protocol: '1.2', branches: true): Promise<ComponentBranchClientResult<Soap12FaultMetadata>>;
function executeClient(expectedBase64: string, input: unknown, options: ComponentClientOptions, component: true, protocol: '1.1', branches: false, oneWay: true): Promise<ComponentOneWayClientResult<Soap11FaultMetadata>>;
function executeClient(expectedBase64: string, input: unknown, options: ComponentClientOptions, component: true, protocol: '1.2', branches: false, oneWay: true): Promise<ComponentOneWayClientResult<Soap12FaultMetadata>>;
function executeClient(expectedBase64: string, input: unknown, options: ComponentClientOptions, component: true, protocol: '1.1',
  branches: false, oneWay: false, streamSignal: AbortSignal): Promise<DirectClientFailure | AsyncGenerator<unknown, CheckedStreamCompletion>>;
async function executeClient(expectedBase64: string, input: unknown, options: DirectClientOptions | ComponentClientOptions,
  component: boolean, protocol?: '1.1' | '1.2', branches = false, oneWay = false, streamSignal?: AbortSignal):
  Promise<ComponentBranchClientResult | ComponentOneWayClientResult | AsyncGenerator<unknown, CheckedStreamCompletion>> {
    // Constant-sized entry introspection precedes budget configuration and all reads.
    const entryFailure = (): DirectClientFailure => ({kind: 'unsupported', rule: 'data-only client options required', usage: {nodes: 0, work: 0}});
    if (!options || typeof options !== 'object' || types.isProxy(options)
      || ![null, Object.prototype].includes(Object.getPrototypeOf(options) as object | null)) return entryFailure();
    const allowed = ['localSource', 'fileRoots', 'capsule', 'budget', 'soap', ...(component ? ['sourceResources', 'sourceOrigins', 'sourceUri', 'namespaceLocations', 'standardLibraries', 'recordSources', ...(branches ? ['branchSources'] : [])] : [])];
    const owned: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(options)) {
      const descriptor = Object.getOwnPropertyDescriptor(options, key);
      if (typeof key !== 'string' || !allowed.includes(key) || !descriptor || !('value' in descriptor)) return entryFailure();
      owned[key] = descriptor.value;
    }
    if (!['localSource', 'fileRoots', 'capsule', 'soap', ...(component ? ['sourceResources', 'sourceOrigins'] : [])].every(key => Object.hasOwn(owned, key))) return entryFailure();
    if (owned.budget !== undefined) {
      const limits = owned.budget;
      if (!limits || typeof limits !== 'object' || types.isProxy(limits)
        || ![null, Object.prototype].includes(Object.getPrototypeOf(limits) as object | null)) return entryFailure();
      const copied: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of Reflect.ownKeys(limits)) {
        const descriptor = Object.getOwnPropertyDescriptor(limits, key);
        if (typeof key !== 'string' || !['maxNodes', 'maxWork'].includes(key) || !descriptor || !('value' in descriptor)) return entryFailure();
        copied[key] = descriptor.value;
      }
      owned.budget = Object.freeze(copied);
    }
    options = owned as unknown as DirectClientOptions;
    const budget = createApplicationBudget(options.budget);
    let http: HttpResponseObservation | undefined;
    const fail = (kind: DirectClientFailure['kind'], rule: string): DirectClientFailure => Object.freeze({kind, rule, ...(http ? {http} : {}), usage: Object.freeze({...budget.usage()})});
    try {
      const optionRule = directSoapOptionsShape(options.soap, () => checkSemanticBudget(budget), component ? ['ca', 'httpResponseHeaders', 'upstream', 'headerValues', 'headerProcessors'] : []);
      if (optionRule) return fail('unsupported', optionRule);
      if (options.soap.signal !== undefined && !(options.soap.signal instanceof AbortSignal)) return fail('unsupported', 'native AbortSignal required');
      if (options.soap.signal?.aborted) return fail('cancelled', 'cooperative-cancellation');
      const signal = streamSignal ?? options.soap.signal;
      const check = () => {checkSemanticBudget(budget); if (signal?.aborted) throw new Error('cancelled');};

      const soap: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of Reflect.ownKeys(options.soap)) soap[key as string] = Object.getOwnPropertyDescriptor(options.soap, key)!.value;
      if (streamSignal) soap.signal = streamSignal;
      if (component && soap.upstream !== undefined) {
        try {soap.upstream = snapshotUpstreamSecurity(soap.upstream);}
        catch {return fail('unsupported', 'runtime security configuration');}
      }
      if (component && soap.headerProcessors !== undefined) {
        try {soap.headerProcessors = snapshotComponentHeaderProcessors(soap.headerProcessors);}
        catch {return fail('unsupported', 'explicit SOAP header processors required');}
      }
      if (component && Object.hasOwn(soap, 'httpResponseHeaders')) {
        try {soap.httpResponseHeaders = normalizeHttpResponseHeaders(soap.httpResponseHeaders);}
        catch {return fail('unsupported', 'httpResponseHeaders selection');}
      }
      for (const key of ['service', 'port', 'endpoint', 'timeoutMs', 'limits', 'capabilities', ...(component ? ['ca', 'upstream', 'headerValues'] : [])]) {
        if (Object.hasOwn(soap, key)) soap[key] = directDataOwnership(budget).freeze(directDataOwnership(budget).snapshot(soap[key], check));
      }
      options = Object.freeze({...options, fileRoots: directDataOwnership(budget).freeze(directDataOwnership(budget).snapshot(options.fileRoots, check)), soap: Object.freeze(soap) as unknown as DirectSoapOptions});
      if (typeof expectedBase64 !== 'string' || expectedBase64.length > Math.ceil(directLimit(budget, DIRECT_CAPSULE_LIMITS.maxBytes) / 3) * 4) return fail('incompatible-artifact', 'generated-capsule-limit');
      // The exact embedded artifact pins the emitted types. Check actual byte extent
      // before copying; do not invoke caller byte getters.

      if (!types.isUint8Array(options.capsule) || types.isProxy(options.capsule)) return fail('incompatible-artifact', 'capsule-bytes-required');
      const typed = Object.getPrototypeOf(Uint8Array.prototype) as object;
      const backing: unknown = Object.getOwnPropertyDescriptor(typed, 'buffer')!.get!.call(options.capsule);
      const length = Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!.call(options.capsule) as number;
      if (types.isSharedArrayBuffer(backing) || length > directLimit(budget, DIRECT_CAPSULE_LIMITS.maxBytes)) return fail('incompatible-artifact', 'capsule-bytes-required');

      const bytes = new Uint8Array(length);
      Uint8Array.prototype.set.call(bytes, options.capsule);
      if (Buffer.from(bytes).toString('base64') !== expectedBase64) return fail('incompatible-artifact', 'generated-capsule-mismatch');
      let streamArtifact: ReturnType<typeof readStreamArtifactCapsule>;
      if (component && protocol === '1.1' && !branches && !oneWay) {
        try {streamArtifact = readStreamArtifactCapsule(bytes);}
        catch {return fail('incompatible-artifact', 'invalid component capsule');}
      }
      if (streamSignal && !streamArtifact) return fail('incompatible-artifact', 'checked-stream-capsule-required');
      let result: Awaited<ReturnType<typeof exchangeDirectSoap>> | ComponentRecordSoapResult | ComponentResponseBranchesSoapResult;
      if (component) {
        if (typeof options.localSource !== 'string') return fail('unsupported', 'explicit local source required');
        const supplied = options as ComponentClientOptions;
        const sources = directDataOwnership(budget).freeze(directDataOwnership(budget).snapshot({resources: supplied.sourceResources,
          origins: supplied.sourceOrigins, locations: supplied.namespaceLocations ?? [], standards: supplied.standardLibraries ?? [],
          records: supplied.recordSources ?? [], branches: supplied.branchSources ?? []}, check));
        if (!Array.isArray(sources.resources) || !Array.isArray(sources.origins) || !sources.origins.every(origin => typeof origin === 'string')
          || !Array.isArray(sources.locations) || !Array.isArray(sources.standards) || !sources.standards.every(id => typeof id === 'string')
          || !Array.isArray(sources.records) || !Array.isArray(sources.branches)) return fail('unsupported', 'explicit source snapshots required');
        for (const resource of sources.resources) {
          check();
          if (!resource || typeof resource.uri !== 'string' || typeof resource.file !== 'string'
            || Object.keys(resource).some(k => !['uri', 'file', 'canonicalUri', 'contentType'].includes(k))
            || resource.canonicalUri !== undefined && typeof resource.canonicalUri !== 'string'
            || resource.contentType !== undefined && typeof resource.contentType !== 'string') return fail('unsupported', 'explicit source resource required');
        }
        const namespaceLocations = new Map<string, string>();
        for (const location of sources.locations) {
          check();
          if (!location || typeof location.namespace !== 'string' || typeof location.location !== 'string'
            || Object.keys(location).length !== 2 || namespaceLocations.has(location.namespace)) return fail('unsupported', 'explicit namespace location required');
          namespaceLocations.set(location.namespace, location.location);
        }
        const prepared = await prepareSchemaSnapshotFiles(options.localSource, sources.resources, {policy: {
          fileRoots: options.fileRoots, allowedOrigins: sources.origins}, limits: directLoadingLimits(budget), namespaceLocations, signal, sourceUri: supplied.sourceUri,
          chargeWork: amount => {check(); budget.chargeWork(amount);}});
        const fresh = await reconstructComponentSourceCapsuleInRequest(streamArtifact?.source ?? bytes, prepared.source, {loading: prepared.loading, signal,
          standardLibraries: sources.standards, recordSources: sources.records, branchSources: sources.branches, responseBranchMode: branches}, budget);
        if (fresh.kind !== 'reconstructed-component') return fresh;
        if (!protocol && fresh.contract.headers?.length) return fail('incompatible-artifact', 'declared-headers-runtime-binding');
        if ((fresh.contract.pattern === 'one-way') !== oneWay || oneWay && fresh.contract.binding.version !== protocol) return fail('incompatible-artifact', 'one-way-runtime-binding');
        if (fresh.contract.binding.version === '1.2' && protocol !== '1.2') return fail('incompatible-artifact', 'SOAP 1.2 runtime binding required');
        if (branches && fresh.contract.binding.version !== protocol) return fail('incompatible-artifact', 'Matching response branch protocol binding required');
        if (fresh.selection.port !== options.soap.port || fresh.selection.service.namespace !== options.soap.service.namespace
          || fresh.selection.service.local !== options.soap.service.local) return fail('incompatible-artifact', 'explicit source selection mismatch');
        if (streamSignal && streamArtifact) {
          let plan: ReturnType<typeof planComponentStream>;
          try {plan = planComponentStream(fresh, streamArtifact.stream);}
          catch (error) {
            if (signal?.aborted || budget.exhausted()) throw error;
            return fail('incompatible-artifact', error instanceof TypeError && error.message.startsWith('checked-stream:')
              ? error.message : 'checked-stream-source-selection');
          }
          if (JSON.stringify(plan.spec) !== JSON.stringify(streamArtifact.stream)) return fail('incompatible-artifact', 'checked-stream-spec-mismatch');
          return exchangeComponentStream(plan, fresh.mappings[0], input, options.soap as ComponentSoapOptions);
        }
        result = fresh.responseBranches
          ? await exchangeComponentSoap(fresh.contract, fresh.mappings[0], input, options.soap as ComponentSoapOptions, fresh.responseProjection, protocol === '1.1', fresh.responseBranches)
          : await exchangeComponentSoap(fresh.contract, fresh.mappings[0], input, options.soap as ComponentSoapOptions, fresh.responseProjection, protocol === '1.1');
      } else {
        const fresh = await reconstructDirectSourceCapsuleInRequest(bytes, options.localSource,
        {policy: {fileRoots: options.fileRoots}, limits: options.budget, signal: options.soap.signal}, budget);
      if (fresh.kind !== 'reconstructed-direct') return fresh;
      const compatible = checkDirectSourceCompatibility(fresh, fresh.contract, {service: options.soap.service, port: options.soap.port}, options.soap.signal);
      if (compatible.kind !== 'compatible-direct') return compatible;
      // Value and byte provenance stay owned
      // by the original adapter; no catch-and-cast turns a failure into typed success.

        result = await exchangeDirectSoap(fresh.contract, fresh.mappings[0], input, options.soap);
      }
      http = result.http;
      if (!('decoded' in result)) {
        if (result.kind === 'soap-fault' && result.fault.version !== protocol) throw new TypeError('Protocol fault requires its generated runtime binding');
        if (result.kind === 'soap-fault' || result.kind === 'soap-acknowledgement' || result.kind === 'soap-header-fault') return result;
        // @constraints Native source provenance can contain endpoint secrets; only the safe diagnostic crosses the runtime boundary.
        return Object.freeze({kind: result.kind, rule: result.rule, usage: result.usage,
          ...(http ? {http} : {}),
          ...(result.phase ? {phase: result.phase} : {}), ...(result.diagnostic ? {diagnostic: result.diagnostic} : {})});
      }

      if (options.soap.signal?.aborted) return fail('cancelled', 'cooperative-cancellation');
      const common = {value: result.decoded.validated.value, status: result.status, admitted: false as const,
        ...('headerValues' in result && result.headerValues ? {headerValues: result.headerValues} : {}),
        ...('processedHeaders' in result && result.processedHeaders ? {processedHeaders: result.processedHeaders} : {}),
        ...(http ? {http} : {}),
        responseBytes: result.responseBytes, usage: Object.freeze({...budget.usage()})};
      if (result.kind === 'application-error') {
        if (!branches) return fail('incompatible-artifact', 'response-branch-runtime-version');
        return Object.freeze({kind: 'application-error', branch: result.branch, ...common});
      }
      if (result.kind === 'soap-fault') {
        if (!result.fault) throw new TypeError('Missing native declared fault');
        return Object.freeze({kind: 'soap-fault', ...common, fault: result.fault});
      }
      return Object.freeze({kind: 'soap-response', ...common});
    } catch (error) {
      if (budget.exhausted()) return fail('resource-limit', 'request-budget');
      if (error instanceof DataOwnershipLimitError) return fail('resource-limit', error.message);
      if (options.soap.signal?.aborted) return fail('cancelled', 'cooperative-cancellation');
      if (error instanceof SchemaLoadingError) return fail(error.category === 'resource-limit' ? 'resource-limit' : 'missing-authority', 'authorized-local-source-required');
      throw error;
    }
}

/** Additive runtime for the generated, source-bound checked streaming methods. */
export const checkedComponentStreamRuntimeV1 = Object.freeze({
  version: COMPONENT_STREAM_RUNTIME_VERSION,
  open<T>(expectedBase64: string, input: unknown, options: ComponentClientOptions & {
    soap: {limits?: CheckedStreamXmlLimits};
  },
    version: typeof COMPONENT_STREAM_RUNTIME_VERSION): CheckedStream<T> {
    // Inspect data descriptors without calling a proxy, getter or caller-defined signal method.
    const soap = options && typeof options === 'object' && !types.isProxy(options)
      ? Object.getOwnPropertyDescriptor(options, 'soap')?.value as unknown : undefined;
    const signal = soap && typeof soap === 'object' && !types.isProxy(soap)
      ? Object.getOwnPropertyDescriptor(soap, 'signal')?.value as unknown : undefined;
    return checkedStream<T>(async function* (ownedSignal) {
      if (version !== COMPONENT_STREAM_RUNTIME_VERSION) return {kind: 'incompatible-artifact', rule: 'generated-runtime-version', usage: {nodes: 0, work: 0}};
      const prepared = await executeClient(expectedBase64, input, options, true, '1.1', false, false, ownedSignal);
      if ('kind' in prepared) return prepared;
      return yield* prepared as AsyncGenerator<T, CheckedStreamCompletion>;
    }, signal instanceof AbortSignal ? signal : undefined);
  },
});
