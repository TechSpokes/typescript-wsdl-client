/** Frozen buffered injection shapes emitted before declared-header outcomes.
 * @provenance src/client/generateDirectClient.ts at 7946edb (published bindings through v1.6.5).
 * @constraints Never derive these result kinds from current runtime types.
 */
interface Name {readonly namespace: string; readonly local: string}
interface Usage {readonly nodes: number; readonly work: number}
interface Options {
  readonly localSource: string; readonly fileRoots: readonly string[]; readonly capsule: Uint8Array;
  readonly sourceResources: readonly {readonly uri: string; readonly file: string; readonly canonicalUri?: string}[];
  readonly sourceOrigins: readonly string[]; readonly sourceUri?: string;
  readonly namespaceLocations?: readonly {readonly namespace: string; readonly location: string}[];
  readonly standardLibraries?: readonly string[];
  readonly recordSources?: readonly {readonly selector: {readonly portType: Name; readonly binding: Name; readonly operation: string}; readonly source: string}[];
  readonly soap: {readonly service: Name; readonly port: string; readonly endpoint?: string;
    readonly allowEndpoint?: (endpoint: URL) => boolean; readonly signal?: AbortSignal; readonly timeoutMs?: number;
    readonly capabilities?: readonly string[]; readonly ca?: string; readonly httpResponseHeaders?: readonly string[];
    readonly limits?: {readonly maxBytes?: number; readonly maxDepth?: number; readonly maxNodes?: number; readonly maxText?: number}};
}
interface Failure {
  readonly kind: 'incompatible-artifact' | 'unsupported' | 'missing-authority' | 'resource-limit' | 'cancelled' | 'inconclusive'
    | 'invalid-schema' | 'scalar-invalid' | 'value-invalid' | 'xml-invalid' | 'mismatch' | 'transport' | 'protocol';
  readonly rule: string; readonly usage: Usage;
}
type Versions = 'checked-component-soap12-runtime-v1' | 'checked-component-soap11-runtime-v1'
  | 'checked-component-soap11-branches-runtime-v1' | 'checked-component-soap12-branches-runtime-v1'
  | 'checked-component-soap11-one-way-runtime-v1' | 'checked-component-soap12-one-way-runtime-v1';
type Kind<V extends Versions> = V extends `${string}-one-way-runtime-v1` ? 'soap-acknowledgement' | 'soap-fault'
  : V extends `${string}-branches-runtime-v1` ? 'soap-response' | 'soap-fault' | 'application-error' : 'soap-response' | 'soap-fault';
interface Success<V extends Versions> {
  readonly kind: Kind<V>; readonly admitted: false; readonly value?: unknown;
  readonly status: number; readonly usage: Usage; readonly responseBytes: Uint8Array;
  readonly fault?: {readonly name?: string; readonly code: Name; readonly string: string; readonly actor?: string};
}
export interface FrozenBufferedRuntime<V extends Versions> {
  readonly version: V;
  execute(expectedBase64: string, input: unknown, options: Options, version: V): Promise<Failure | Success<V>>;
}
export function acceptBufferedRuntime<V extends Versions>(runtime: FrozenBufferedRuntime<V>): FrozenBufferedRuntime<V> {return runtime;}
