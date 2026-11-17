import {types} from 'node:util';
import {componentSoap11OneWayClientRuntime, componentSoap12OneWayClientRuntime} from './directClientRuntime.js';
import {COMPONENT_SOAP11_ONE_WAY_CLIENT_RUNTIME_VERSION, COMPONENT_SOAP12_ONE_WAY_CLIENT_RUNTIME_VERSION} from './directClientVersion.js';
import type {HttpResponseObservation} from '../compiler/httpResponseHeaders.js';
import type {CheckedPayloadDiagnostic} from '../compiler/payloadDiagnostics.js';
import type {ComponentSoapOptions} from '../compiler/directSoap.js';
import {directClientRuntime, componentClientRuntime, componentSoap11ClientRuntime, componentSoap12ClientRuntime,
  componentSoap11BranchClientRuntime, componentSoap12BranchClientRuntime} from './directClientRuntime.js';
import type {ComponentClientOptions} from './directClientRuntime.js';
import {DIRECT_CLIENT_RUNTIME_VERSION, DIRECT_CLIENT_RUNTIME_REPAIR, COMPONENT_CLIENT_RUNTIME_VERSION, COMPONENT_CLIENT_RUNTIME_REPAIR, COMPONENT_SOAP11_CLIENT_RUNTIME_VERSION, COMPONENT_SOAP12_CLIENT_RUNTIME_VERSION,
  COMPONENT_SOAP11_BRANCH_CLIENT_RUNTIME_VERSION, COMPONENT_SOAP12_BRANCH_CLIENT_RUNTIME_VERSION} from './directClientVersion.js';

interface Name { readonly namespace: string; readonly local: string }
interface Usage { readonly nodes: number; readonly work: number }
interface Options {
  readonly localSource: string;
  readonly fileRoots: readonly string[];
  readonly capsule: Uint8Array;
  readonly soap: {
    readonly service: Name; readonly port: string; readonly endpoint: string;
    readonly allowEndpoint: (endpoint: URL) => boolean;
    readonly signal?: AbortSignal; readonly timeoutMs?: number;
    readonly capabilities?: readonly string[];
    readonly limits?: {readonly maxBytes?: number; readonly maxDepth?: number; readonly maxNodes?: number; readonly maxText?: number};
  };
}
interface Failure {
  readonly http?: HttpResponseObservation;
  readonly kind: 'incompatible-artifact' | 'unsupported' | 'missing-authority' | 'resource-limit' | 'cancelled'
    | 'inconclusive' | 'invalid-schema' | 'scalar-invalid' | 'value-invalid' | 'xml-invalid' | 'mismatch' | 'transport' | 'protocol';
  readonly rule: string; readonly usage: Usage; readonly repair?: string;
  readonly phase?: 'input' | 'response';
  readonly diagnostic?: CheckedPayloadDiagnostic;
}
type Success = {
  readonly http?: HttpResponseObservation;
  readonly value: unknown;
  readonly admitted: false; readonly status: number; readonly usage: Usage; readonly responseBytes: Uint8Array;
} & ({readonly kind: 'soap-response'} | {readonly kind: 'soap-fault';
  readonly fault: {readonly name: string; readonly code: Name; readonly string: string; readonly actor?: string}});

type ComponentOptions = Omit<Options, 'soap'> & {
  readonly sourceResources: readonly {readonly uri: string; readonly file: string; readonly canonicalUri?: string; readonly contentType?: string}[];
  readonly sourceUri?: string;
  readonly sourceOrigins: readonly string[];
  readonly namespaceLocations?: readonly {readonly namespace: string; readonly location: string}[];
  readonly standardLibraries?: readonly string[];
  readonly recordSources?: readonly {readonly selector: {readonly portType: Name; readonly binding: Name; readonly operation: string}; readonly source: string}[];
  readonly soap: Omit<Options['soap'], 'endpoint' | 'allowEndpoint'> & Pick<ComponentSoapOptions, 'upstream' | 'headerValues' | 'headerProcessors'>
    & {readonly httpResponseHeaders?: readonly string[]; readonly ca?: string; readonly endpoint?: string; readonly allowEndpoint?: (endpoint: URL) => boolean};
};
type ComponentBranchOptions = ComponentOptions & {
  readonly branchSources?: readonly {readonly selector: {readonly portType: Name; readonly binding: Name; readonly operation: string}; readonly branch: string; readonly source: string}[];
};
type ProtocolVersion = typeof COMPONENT_SOAP11_CLIENT_RUNTIME_VERSION | typeof COMPONENT_SOAP12_CLIENT_RUNTIME_VERSION
  | typeof COMPONENT_SOAP11_ONE_WAY_CLIENT_RUNTIME_VERSION | typeof COMPONENT_SOAP12_ONE_WAY_CLIENT_RUNTIME_VERSION
  | typeof COMPONENT_SOAP11_BRANCH_CLIENT_RUNTIME_VERSION | typeof COMPONENT_SOAP12_BRANCH_CLIENT_RUNTIME_VERSION;
type ProtocolOptions<V extends ProtocolVersion> = V extends typeof COMPONENT_SOAP11_BRANCH_CLIENT_RUNTIME_VERSION | typeof COMPONENT_SOAP12_BRANCH_CLIENT_RUNTIME_VERSION
  ? ComponentBranchOptions : ComponentOptions;

function dataOptions(options: unknown, allowed: readonly string[]): boolean {
  return !!options && typeof options === 'object' && !types.isProxy(options)
    && [null, Object.prototype].includes(Object.getPrototypeOf(options) as object | null)
    && !Reflect.ownKeys(options).some(key => typeof key !== 'string' || !allowed.includes(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(options, key)!, 'value'));
}

/** Scoped direct-grammar binding used by the opt-in checked gateway preview. */
export const checkedDirectRuntimeV1: Readonly<{
  version: typeof DIRECT_CLIENT_RUNTIME_VERSION;
  execute(expectedBase64: string, input: unknown, options: Options, version: typeof DIRECT_CLIENT_RUNTIME_VERSION): Promise<Failure | Success>;
}> = Object.freeze({
  version: DIRECT_CLIENT_RUNTIME_VERSION,
  async execute(expectedBase64: string, input: unknown, options: Options, version: typeof DIRECT_CLIENT_RUNTIME_VERSION): Promise<Failure | Success> {
    if (version !== DIRECT_CLIENT_RUNTIME_VERSION) return Object.freeze({kind: 'incompatible-artifact',
      rule: 'generated-runtime-version', repair: DIRECT_CLIENT_RUNTIME_REPAIR,
      usage: Object.freeze({nodes: 0, work: 0})});
    // The public entry never accepts the private profiling hook, even from JavaScript.
    // Inspect descriptors before forwarding so getters/proxies cannot supply it.
    if (!dataOptions(options, ['localSource', 'fileRoots', 'capsule', 'soap'])) {
      return Object.freeze({kind: 'unsupported', rule: 'data-only checked direct options required', usage: Object.freeze({nodes: 0, work: 0})});
    }
    return directClientRuntime.execute(expectedBase64, input, options);
  },
});

/** Component injection protocol over the shared checked source, artifact and SOAP runtime.
 * @remarks Caller-authorized physical source resources are read independently of embedded artifact bytes.
 *   Component runtime v2 derives endpoint intent; explicit restrictions and TLS trust still apply.
 *   This entry accepts no diagnostic budget or deadline defaults.
 * @returns Native-validated normal/fault values or explicit refusal. No gateway admission is issued here.
 */
export const checkedComponentRuntimeV1: Readonly<{
  version: typeof COMPONENT_CLIENT_RUNTIME_VERSION;
  execute(expectedBase64: string, input: unknown, options: ComponentOptions, version: typeof COMPONENT_CLIENT_RUNTIME_VERSION): Promise<Failure | Success>;
}> = Object.freeze({
  version: COMPONENT_CLIENT_RUNTIME_VERSION,
  async execute(expectedBase64: string, input: unknown, options: ComponentOptions, version: typeof COMPONENT_CLIENT_RUNTIME_VERSION): Promise<Failure | Success> {
    if (version !== COMPONENT_CLIENT_RUNTIME_VERSION) return Object.freeze({kind: 'incompatible-artifact',
      rule: 'generated-runtime-version', repair: COMPONENT_CLIENT_RUNTIME_REPAIR, usage: Object.freeze({nodes: 0, work: 0})});
    if (!dataOptions(options, ['localSource', 'fileRoots', 'capsule', 'soap', 'sourceResources', 'sourceOrigins', 'sourceUri', 'namespaceLocations', 'standardLibraries', 'recordSources'])) {
      return Object.freeze({kind: 'unsupported', rule: 'data-only checked component options required', usage: Object.freeze({nodes: 0, work: 0})});
    }
    return componentClientRuntime.execute(expectedBase64, input, options);
  },
});

function checkedProtocolRuntime<V extends ProtocolVersion, R>(
  runtime: {version: V; execute: (expectedBase64: string, input: unknown, options: ComponentClientOptions) => Promise<R>},
) {
  // @constraints Header faults require a processor acknowledgement; prior generated signatures cannot receive them.
  function execute(expectedBase64: string, input: unknown, options: ProtocolOptions<V> & {
    readonly soap: ProtocolOptions<V>['soap'] & {readonly headerProcessors?: never};
  }, version: V): Promise<Failure | Exclude<R, {kind: 'soap-header-fault'}>>;
  function execute(expectedBase64: string, input: unknown, options: ProtocolOptions<V>, version: V): Promise<Failure | R>;
  async function execute(expectedBase64: string, input: unknown, options: ProtocolOptions<V>, version: V): Promise<Failure | R> {
      if (version !== runtime.version) return Object.freeze({kind: 'incompatible-artifact',
        rule: 'generated-runtime-version', repair: COMPONENT_CLIENT_RUNTIME_REPAIR, usage: Object.freeze({nodes: 0, work: 0})});
      if (!dataOptions(options, ['localSource', 'fileRoots', 'capsule', 'soap', 'sourceResources', 'sourceOrigins', 'sourceUri', 'namespaceLocations', 'standardLibraries', 'recordSources',
        ...(runtime.version === COMPONENT_SOAP11_BRANCH_CLIENT_RUNTIME_VERSION || runtime.version === COMPONENT_SOAP12_BRANCH_CLIENT_RUNTIME_VERSION ? ['branchSources'] : [])])) {
        return Object.freeze({kind: 'unsupported', rule: 'data-only checked component options required', usage: Object.freeze({nodes: 0, work: 0})});
      }
      return runtime.execute(expectedBase64, input, options);
  }
  return Object.freeze({version: runtime.version, execute});
}

/** Additive SOAP 1.2 binding permits protocol faults without declared application detail.
 * @since 1.3.0
 * @remarks Source reconstruction, endpoint restrictions and native validation use the shared component runtime.
 * @returns Native component values, SOAP 1.2 protocol faults or explicit refusal; no full-profile admission.
 */
export const checkedComponentRuntimeV2 = checkedProtocolRuntime(componentSoap12ClientRuntime);

/** SOAP 1.1 binding for generated clients that distinguish protocol faults from declared detail values.
 * @since 1.4.0
 * @returns Native-validated values, SOAP 1.1 protocol faults with their original bytes, or explicit refusal.
 */
export const checkedComponentRuntimeV3 = checkedProtocolRuntime(componentSoap11ClientRuntime);

/** Opt-in SOAP 1.1 binding with independently validated application-error outcomes.
 * @since 1.6.0
 * @constraints Existing bindings never reinterpret this capsule or outcome profile.
 */
export const checkedComponentRuntimeV4 = checkedProtocolRuntime(componentSoap11BranchClientRuntime);

/** Opt-in SOAP 1.2 binding with the same separately versioned branch outcome contract.
 * @since 1.6.0
 */
export const checkedComponentRuntimeV5 = checkedProtocolRuntime(componentSoap12BranchClientRuntime);

/** SOAP 1.1 one-way binding with transport-only acknowledgement results.
 * @since 1.6.3
 */
export const checkedComponentRuntimeV6 = checkedProtocolRuntime(componentSoap11OneWayClientRuntime);
/** SOAP 1.2 one-way binding using the same bounded acknowledgement policy.
 * @since 1.6.3
 */
export const checkedComponentRuntimeV7 = checkedProtocolRuntime(componentSoap12OneWayClientRuntime);
