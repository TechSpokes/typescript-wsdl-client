import {types} from 'node:util';
import {directClientRuntime} from './directClientRuntime.js';
import {DIRECT_CLIENT_RUNTIME_VERSION, DIRECT_CLIENT_RUNTIME_REPAIR} from './directClientVersion.js';

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
}
type Success = {
  readonly value: unknown;
  readonly admitted: false; readonly status: number; readonly usage: Usage; readonly responseBytes: Uint8Array;
} & ({readonly kind: 'soap-response'} | {readonly kind: 'soap-fault';
  readonly fault: {readonly name: string; readonly code: Name; readonly string: string; readonly actor?: string}});

/** Unreleased direct-grammar binding. Generation and broader SOAP capabilities remain internal. */
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
    if (!options || typeof options !== 'object' || types.isProxy(options)
      || ![null, Object.prototype].includes(Object.getPrototypeOf(options) as object | null)
      || Reflect.ownKeys(options).some(key => typeof key !== 'string'
        || !['localSource', 'fileRoots', 'capsule', 'soap'].includes(key)
        || !Object.hasOwn(Object.getOwnPropertyDescriptor(options, key)!, 'value'))) {
      return Object.freeze({kind: 'unsupported', rule: 'data-only checked direct options required', usage: Object.freeze({nodes: 0, work: 0})});
    }
    return directClientRuntime.execute(expectedBase64, input, options);
  },
});
