/** Frozen component injection contract emitted by the v1.2.0 generator.
 * @since 1.3.0
 * @constraints Copied from src/client/generateDirectClient.ts at v1.2.0; never derive this compatibility oracle from current runtime types.
 */
export interface Usage {readonly nodes: number; readonly work: number}
export interface Name {readonly namespace: string; readonly local: string}
export interface Options {
  readonly localSource: string; readonly fileRoots: readonly string[]; readonly capsule: Uint8Array;
  readonly sourceResources: readonly {readonly uri: string; readonly file: string; readonly canonicalUri?: string}[]; readonly sourceOrigins: readonly string[];
  readonly sourceUri?: string;
  readonly namespaceLocations?: readonly {readonly namespace: string; readonly location: string}[];
  readonly standardLibraries?: readonly string[];
  readonly recordSources?: readonly {readonly selector: {readonly portType: Name; readonly binding: Name; readonly operation: string}; readonly source: string}[];
  readonly soap: {readonly service: Name; readonly port: string; readonly endpoint?: string;
    readonly allowEndpoint?: (endpoint: URL) => boolean; readonly signal?: AbortSignal; readonly timeoutMs?: number;
    readonly capabilities?: readonly string[]; readonly ca?: string;
    readonly limits?: {readonly maxBytes?: number; readonly maxDepth?: number; readonly maxNodes?: number; readonly maxText?: number}};
}
export interface Failure {readonly kind: 'incompatible-artifact' | 'unsupported' | 'missing-authority' | 'resource-limit' | 'cancelled' | 'inconclusive' | 'invalid-schema' | 'scalar-invalid' | 'value-invalid' | 'xml-invalid' | 'mismatch' | 'transport' | 'protocol';
  readonly rule: string; readonly repair?: string; readonly phase?: 'input' | 'response'; readonly usage: Usage}
export interface NativeSuccess {readonly kind: 'soap-response' | 'soap-fault'; readonly value: unknown; readonly admitted: false;
  readonly status: number; readonly usage: Usage; readonly responseBytes: Uint8Array;
  readonly fault?: {readonly name: string; readonly code: Name; readonly string: string; readonly actor?: string}}
export interface Runtime {readonly version: 'checked-component-runtime-v2'; execute(expectedBase64: string, input: unknown, options: Options, version: 'checked-component-runtime-v2'): Promise<Failure | NativeSuccess>}

/** Accept the old generated client's exact injection shape without executing SOAP.
 * @param runtime Candidate installed public runtime.
 * @returns The unchanged runtime, statically checked against the frozen contract.
 */
export function acceptComponentRuntime(runtime: Runtime): Runtime {return runtime;}
