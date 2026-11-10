import {types} from 'node:util';
import {directClientRuntime, componentClientRuntime, componentSoap11ClientRuntime, componentSoap12ClientRuntime} from './directClientRuntime.js';
import type {ComponentClientOptions, ComponentClientResult} from './directClientRuntime.js';
import {DIRECT_CLIENT_RUNTIME_VERSION, DIRECT_CLIENT_RUNTIME_REPAIR, COMPONENT_CLIENT_RUNTIME_VERSION, COMPONENT_CLIENT_RUNTIME_REPAIR, COMPONENT_SOAP11_CLIENT_RUNTIME_VERSION, COMPONENT_SOAP12_CLIENT_RUNTIME_VERSION} from './directClientVersion.js';

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
  readonly kind: 'incompatible-artifact' | 'unsupported' | 'missing-authority' | 'resource-limit' | 'cancelled'
    | 'inconclusive' | 'invalid-schema' | 'scalar-invalid' | 'value-invalid' | 'xml-invalid' | 'mismatch' | 'transport' | 'protocol';
  readonly rule: string; readonly usage: Usage; readonly repair?: string;
  readonly phase?: 'input' | 'response';
}
type Success = {
  readonly value: unknown;
  readonly admitted: false; readonly status: number; readonly usage: Usage; readonly responseBytes: Uint8Array;
} & ({readonly kind: 'soap-response'} | {readonly kind: 'soap-fault';
  readonly fault: {readonly name: string; readonly code: Name; readonly string: string; readonly actor?: string}});

type ComponentOptions = Omit<Options, 'soap'> & {
  readonly sourceResources: readonly {readonly uri: string; readonly file: string; readonly canonicalUri?: string}[];
  readonly sourceUri?: string;
  readonly sourceOrigins: readonly string[];
  readonly namespaceLocations?: readonly {readonly namespace: string; readonly location: string}[];
  readonly standardLibraries?: readonly string[];
  readonly recordSources?: readonly {readonly selector: {readonly portType: Name; readonly binding: Name; readonly operation: string}; readonly source: string}[];
  readonly soap: Omit<Options['soap'], 'endpoint' | 'allowEndpoint'> & {readonly ca?: string; readonly endpoint?: string; readonly allowEndpoint?: (endpoint: URL) => boolean};
};

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

function checkedProtocolRuntime<V extends typeof COMPONENT_SOAP11_CLIENT_RUNTIME_VERSION | typeof COMPONENT_SOAP12_CLIENT_RUNTIME_VERSION, R>(
  runtime: {version: V; execute: (expectedBase64: string, input: unknown, options: ComponentClientOptions) => Promise<R>},
) {
  return Object.freeze({
    version: runtime.version,
    async execute(expectedBase64: string, input: unknown, options: ComponentOptions, version: V): Promise<Failure | R> {
      if (version !== runtime.version) return Object.freeze({kind: 'incompatible-artifact',
        rule: 'generated-runtime-version', repair: COMPONENT_CLIENT_RUNTIME_REPAIR, usage: Object.freeze({nodes: 0, work: 0})});
      if (!dataOptions(options, ['localSource', 'fileRoots', 'capsule', 'soap', 'sourceResources', 'sourceOrigins', 'sourceUri', 'namespaceLocations', 'standardLibraries', 'recordSources'])) {
        return Object.freeze({kind: 'unsupported', rule: 'data-only checked component options required', usage: Object.freeze({nodes: 0, work: 0})});
      }
      return runtime.execute(expectedBase64, input, options);
    },
  });
}

/** Additive SOAP 1.2 binding permits protocol faults without declared application detail.
 * @since 1.3.0
 * @remarks Source reconstruction, endpoint restrictions and native validation use the shared component runtime.
 * @returns Native component values, SOAP 1.2 protocol faults or explicit refusal; no full-profile admission.
 */
export const checkedComponentRuntimeV2: Readonly<{
  version: typeof COMPONENT_SOAP12_CLIENT_RUNTIME_VERSION;
  execute(expectedBase64: string, input: unknown, options: ComponentOptions, version: typeof COMPONENT_SOAP12_CLIENT_RUNTIME_VERSION): Promise<ComponentClientResult>;
}> = checkedProtocolRuntime(componentSoap12ClientRuntime);

/** SOAP 1.1 binding for generated clients that distinguish protocol faults from declared detail values.
 * @since 1.4.0
 * @returns Native-validated values, SOAP 1.1 protocol faults with their original bytes, or explicit refusal.
 */
export const checkedComponentRuntimeV3 = checkedProtocolRuntime(componentSoap11ClientRuntime);
