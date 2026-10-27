import {directDataOwnership, directLimit} from '../compiler/directExecutionPolicy.js';
/** Private P3.7 binding. No public package entry or alternate SOAP implementation. */
import {checkSemanticBudget} from '../compiler/semanticBudget.js';
import {DataOwnershipLimitError} from '../compiler/dataOwnership.js';
import {types} from 'node:util';
import {createApplicationBudget} from '../compiler/semanticBudget.js';
import type {SemanticBudgetLimits, ResolverUsage} from '../compiler/semanticBudget.js';
import {reconstructDirectSourceCapsuleInRequest, checkDirectSourceCompatibility, DIRECT_CAPSULE_LIMITS} from '../compiler/directSourceCapsule.js';
import type {DirectCapsuleFailure} from '../compiler/directSourceCapsule.js';
import {exchangeDirectSoap, directSoapOptionsShape} from '../compiler/directSoap.js';
import type {DirectSoapOptions, DirectSoapFailure} from '../compiler/directSoap.js';
import type {DirectApplicationValue} from '../compiler/directValues.js';
import {DIRECT_CLIENT_RUNTIME_VERSION} from './directClientVersion.js';

export interface DirectClientOptions {
  readonly localSource: string;
  readonly fileRoots: readonly string[];
  readonly capsule: Uint8Array;
  readonly budget?: SemanticBudgetLimits;
  readonly soap: DirectSoapOptions;
}
export interface DirectClientFailure {
  readonly kind: DirectCapsuleFailure['kind'] | DirectSoapFailure['kind'];
  readonly rule: string; readonly usage: ResolverUsage; readonly repair?: string;
}
export type DirectClientResult = DirectClientFailure | Readonly<{
  kind: 'soap-response'; value: DirectApplicationValue; status: number; admitted: false;
  responseBytes: Uint8Array; usage: ResolverUsage;
}> | Readonly<{
  kind: 'soap-fault'; value: DirectApplicationValue; status: number; admitted: false;
  fault: Readonly<{name: string; code: Readonly<{namespace: string; local: string}>; string: string; actor?: string}>;
  responseBytes: Uint8Array; usage: ResolverUsage;
}>;
export interface DirectClientRuntime {
  readonly version: typeof DIRECT_CLIENT_RUNTIME_VERSION;
  execute(expectedBase64: string, input: unknown, options: DirectClientOptions): Promise<DirectClientResult>;
}
/** The generated literal is the expected artifact; caller bytes never choose its static contract. */
export const directClientRuntime: DirectClientRuntime = Object.freeze({
  version: DIRECT_CLIENT_RUNTIME_VERSION,
  async execute(expectedBase64: string, input: unknown, options: DirectClientOptions): Promise<DirectClientResult> {
    // Constant-sized entry introspection precedes budget configuration and all reads.
    const entryFailure = (): DirectClientFailure => ({kind: 'unsupported', rule: 'data-only client options required', usage: {nodes: 0, work: 0}});
    if (!options || typeof options !== 'object' || types.isProxy(options)
      || ![null, Object.prototype].includes(Object.getPrototypeOf(options) as object | null)) return entryFailure();
    const allowed = ['localSource', 'fileRoots', 'capsule', 'budget', 'soap'];
    const owned: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(options)) {
      const descriptor = Object.getOwnPropertyDescriptor(options, key);
      if (typeof key !== 'string' || !allowed.includes(key) || !descriptor || !('value' in descriptor)) return entryFailure();
      owned[key] = descriptor.value;
    }
    if (!['localSource', 'fileRoots', 'capsule', 'soap'].every(key => Object.hasOwn(owned, key))) return entryFailure();
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
    const fail = (kind: DirectClientFailure['kind'], rule: string): DirectClientFailure => Object.freeze({kind, rule, usage: Object.freeze({...budget.usage()})});
    try {
      const optionRule = directSoapOptionsShape(options.soap, () => checkSemanticBudget(budget));
      if (optionRule) return fail('unsupported', optionRule);
      if (options.soap.signal !== undefined && !(options.soap.signal instanceof AbortSignal)) return fail('unsupported', 'native AbortSignal required');
      if (options.soap.signal?.aborted) return fail('cancelled', 'cooperative-cancellation');
      const signal = options.soap.signal;
      const check = () => {checkSemanticBudget(budget); if (signal?.aborted) throw new Error('cancelled');};

      const soap: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of Reflect.ownKeys(options.soap)) soap[key as string] = Object.getOwnPropertyDescriptor(options.soap, key)!.value;
      for (const key of ['service', 'port', 'endpoint', 'timeoutMs', 'limits', 'capabilities']) {
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
      const fresh = await reconstructDirectSourceCapsuleInRequest(bytes, options.localSource,
        {policy: {fileRoots: options.fileRoots}, limits: options.budget, signal: options.soap.signal}, budget);
      if (fresh.kind !== 'reconstructed-direct') return fresh;
      const compatible = checkDirectSourceCompatibility(fresh, fresh.contract, {service: options.soap.service, port: options.soap.port}, options.soap.signal);
      if (compatible.kind !== 'compatible-direct') return compatible;
      // Value and byte provenance stay owned
      // by the original adapter; no catch-and-cast turns a failure into typed success.

      const result = await exchangeDirectSoap(fresh.contract, fresh.mappings[0], input, options.soap);
      if (!('decoded' in result)) return result;

      if (options.soap.signal?.aborted) return fail('cancelled', 'cooperative-cancellation');
      const common = {value: result.decoded.validated.value, status: result.status, admitted: false as const,
        responseBytes: result.responseBytes, usage: Object.freeze({...budget.usage()})};
      if (result.kind === 'soap-fault') {
        if (!result.fault) throw new TypeError('Missing native declared fault');
        return Object.freeze({kind: 'soap-fault', ...common, fault: result.fault});
      }
      return Object.freeze({kind: 'soap-response', ...common});
    } catch (error) {
      if (budget.exhausted()) return fail('resource-limit', 'request-budget');
      if (error instanceof DataOwnershipLimitError) return fail('resource-limit', error.message);
      if (options.soap.signal?.aborted) return fail('cancelled', 'cooperative-cancellation');
      throw error;
    }
  },
});
