import {directLimit} from '../compiler/directExecutionPolicy.js';
import {DIRECT_CLIENT_RUNTIME_VERSION, DIRECT_CLIENT_RUNTIME_REPAIR, COMPONENT_CLIENT_RUNTIME_VERSION, COMPONENT_CLIENT_RUNTIME_REPAIR} from './directClientVersion.js';
/** Native-plan generator consumed by the opt-in checked pipeline. */
import {checkSemanticBudget} from '../compiler/semanticBudget.js';
import {writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {inspectDirectOperation} from '../compiler/directOperation.js';
import {inspectDirectValueMapping} from '../compiler/directValues.js';
import type {DirectValueMapping} from '../compiler/directValues.js';
import {checkDirectSourceCompatibility, createDirectSourceCapsule, createComponentSourceCapsule, inspectReconstructedComponentSource, inspectComponentSourceService} from '../compiler/directSourceCapsule.js';
import type {ReconstructedDirectSource, ReconstructedComponentSource, DirectCapsuleFailure} from '../compiler/directSourceCapsule.js';
import {lowerComponentShape} from '../generation/componentShape.js';
import type {ResolverUsage, SemanticBudget} from '../compiler/semanticBudget.js';
import {composeGeneratedSource, resolvePreamble} from '../generation/preamble.js';

const MAX_SOURCE_BYTES = 512 * 1024;
const generatedArtifacts = new WeakMap<object, SemanticBudget>();
export interface GeneratedDirectClient {
  readonly kind: 'generated-direct-client'; readonly source: string; readonly capsule: Uint8Array;
  readonly admitted: false; readonly usage: ResolverUsage;
}
/** Roles are separate declarations, so equal local names never merge namespace identities. */
export function generateDirectClient(expected: ReconstructedDirectSource, signal?: AbortSignal): GeneratedDirectClient | DirectCapsuleFailure {
  const {budget} = inspectDirectOperation(expected.contract).context;
  const failure = (kind: DirectCapsuleFailure['kind'], rule: string): DirectCapsuleFailure => ({kind, rule,
    repair: 'Regenerate matched internal direct artifacts from an explicitly authorized source.', usage: Object.freeze({...budget.usage()})});
  try {
    const compatible = checkDirectSourceCompatibility(expected, expected.contract, expected.selection, signal);
    if (compatible.kind !== 'compatible-direct') return compatible;
    const capsule = createDirectSourceCapsule(expected.contract, expected.selection, signal);
    if (capsule.kind !== 'direct-capsule') return capsule;
    // Bound every variable emission before building strings. Six bytes per UTF-16
    // unit covers JSON escapes; fixed per-slot/role costs cover TypeScript syntax.
    let bound = 16_384 + Math.ceil(capsule.bytes.byteLength / 3) * 4;
    for (const mapping of expected.mappings) {
      inspectDirectValueMapping(mapping, expected.contract);

      if (mapping.direction.kind === 'fault') bound += mapping.direction.name.length * 6 + 512;
      for (const slot of mapping.slots) bound += 256 + slot.element.name.local.length * 6;
    }
    const selector = expected.contract.selector;
    bound += 6 * (selector.operation.length * 2 + selector.portType.namespace.length + selector.portType.local.length
      + selector.binding.namespace.length + selector.binding.local.length + expected.selection.service.namespace.length
      + expected.selection.service.local.length + expected.selection.port.length);
    if (bound > directLimit(budget, MAX_SOURCE_BYTES)) return failure('resource-limit', 'generated-source-byte-limit');

    const literal = (text: string): string => JSON.stringify(text).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    const primitive = (name: string): string => {
      if (name === 'string') return 'string';
      if (name === 'boolean') return 'boolean';
      if (name === 'int') return 'number';
      throw new TypeError('Unsupported native scalar plan');
    };
    const shape = (supplied: DirectValueMapping): string => {
      const mapping = inspectDirectValueMapping(supplied, expected.contract);
      if (mapping.rootBuiltin) return primitive(mapping.rootBuiltin.local);
      if (!mapping.slots.length) return 'Readonly<Record<string, never>>';
      return '{\n' + mapping.slots.map(slot => {
        if (signal?.aborted) throw new Error('cancelled');

        const item = primitive(slot.builtin.local), {min, max} = slot.particle.occurs;
        const type = max === 'unbounded' ? min === '1' ? `readonly [${item}, ...${item}[]]` : `readonly ${item}[]` : item;
        return `  readonly ${literal(slot.element.name.local)}${max === '1' && min === '0' ? '?' : ''}: ${type};`;
      }).join('\n') + '\n}';
    };
    const mappings = expected.mappings;
    const input = mappings.find(m => m.direction.kind === 'input')!;
    const output = mappings.find(m => m.direction.kind === 'output')!;
    const faults = mappings.filter(m => m.direction.kind === 'fault');
    const lines = [
      '// Checked direct client; inject checkedDirectRuntimeV1 from the package root.',
      '// Opt-in preview binding supports only the documented direct grammar.',
      '// Static number types require native int32 validation; native checks enforce exact shapes.',
      `export type Request = ${shape(input)};`,
      `export type Response = ${shape(output)};`,
      ...faults.map((m, i) => `export type Fault_${i} = ${shape(m)};`),
      'export interface Usage { readonly nodes: number; readonly work: number }',
      'export interface Name { readonly namespace: string; readonly local: string }',
      'export interface Options {',
      '  readonly localSource: string; readonly fileRoots: readonly string[]; readonly capsule: Uint8Array;',
      '  readonly soap: { readonly service: Name; readonly port: string; readonly endpoint: string;',
      '    readonly allowEndpoint: (endpoint: URL) => boolean; readonly signal?: AbortSignal;',
      '    readonly timeoutMs?: number; readonly capabilities?: readonly string[];',
      '    readonly limits?: { readonly maxBytes?: number; readonly maxDepth?: number; readonly maxNodes?: number; readonly maxText?: number } };',
      '}',
      'export interface Failure {',
      '  readonly kind: "incompatible-artifact" | "unsupported" | "missing-authority" | "resource-limit" | "cancelled" | "inconclusive" | "invalid-schema" | "scalar-invalid" | "value-invalid" | "xml-invalid" | "mismatch" | "transport" | "protocol";',
      '  readonly rule: string; readonly repair?: string; readonly usage: Usage;',
      '}',
      'export interface NativeSuccess { readonly kind: "soap-response" | "soap-fault"; readonly value: unknown;',
      '  readonly admitted: false; readonly status: number; readonly usage: Usage; readonly responseBytes: Uint8Array;',
      '  readonly fault?: { readonly name: string; readonly code: Name; readonly string: string; readonly actor?: string }; }',
      `export interface Runtime { readonly version: ${literal(DIRECT_CLIENT_RUNTIME_VERSION)}; execute(expectedBase64: string, input: unknown, options: Options, version: ${literal(DIRECT_CLIENT_RUNTIME_VERSION)}): Promise<Failure | NativeSuccess> }`,
      'type Common = { readonly admitted: false; readonly status: number; readonly usage: Usage; readonly responseBytes: Uint8Array };',
      'export type DeclaredFault = ' + (faults.length ? faults.map((m, i) => {
        if (m.direction.kind !== 'fault') throw new TypeError('fault direction');
        return `(Common & { readonly kind: "soap-fault"; readonly value: Fault_${i}; readonly fault: { readonly name: ${literal(m.direction.name)}; readonly code: Name; readonly string: string; readonly actor?: string } })`;
      }).join(' | ') : 'never') + ';',
      'export type Result = Failure | (Common & { readonly kind: "soap-response"; readonly value: Response }) | DeclaredFault;',
      `const capsule = ${literal(Buffer.from(capsule.bytes).toString('base64'))};`,
      'export const expectedCapsuleBase64 = capsule;',
      `export const selection = ${literal(JSON.stringify({selector: expected.contract.selector, ...expected.selection}))};`,
      'export function createClient(runtime: Runtime) {',
      '  return Object.freeze({',
      `    [${literal(expected.contract.selector.operation)}]: async (input: Request, options: Options): Promise<Result> => {`,
      `      if (runtime.version !== ${literal(DIRECT_CLIENT_RUNTIME_VERSION)}) return {kind: "incompatible-artifact", rule: "generated-runtime-version", repair: ${literal(DIRECT_CLIENT_RUNTIME_REPAIR)}, usage: {nodes: 0, work: 0}};`,
      '      // The installed native binding pins the literal capsule before issuing fresh authority.',
      `      return await runtime.execute(capsule, input, options, ${literal(DIRECT_CLIENT_RUNTIME_VERSION)}) as Result;`,
      '    },',
      '  });',
      '}',
      '',
    ];
    const source = composeGeneratedSource(lines.join('\n'), resolvePreamble('direct-client'));
    if (Buffer.byteLength(source) > directLimit(budget, MAX_SOURCE_BYTES)) return failure('resource-limit', 'generated-source-byte-limit');
    if (signal?.aborted) return failure('cancelled', 'cooperative-cancellation');

    const result = Object.freeze({kind: 'generated-direct-client' as const, source, capsule: capsule.bytes, admitted: false as const, usage: Object.freeze({...budget.usage()})});
    generatedArtifacts.set(result, budget);
    return result;
  } catch (error) {
    if (budget.exhausted()) return failure('resource-limit', 'request-budget');
    if (signal?.aborted) return failure('cancelled', 'cooperative-cancellation');
    throw error;
  }
}
/** Only authentic bounded artifacts may be written; prior semantic failure remains terminal. */
export function writeDirectClient(file: string, generated: GeneratedDirectClient | GeneratedComponentClient): void {
  const budget = generatedArtifacts.get(generated);
  if (!budget) throw new TypeError('Authentic generated artifact required');
  checkSemanticBudget(budget);
  writeFileSync(file, generated.source, 'utf8');
}

export interface GeneratedComponentClient {
  readonly kind: 'generated-component-client'; readonly source: string; readonly capsule: Uint8Array;
  readonly admitted: false; readonly usage: ResolverUsage;
}
/** Emit recursive component types and the existing checked runtime injection protocol.
 * @remarks Native reconstruction and mappings remain authoritative; generated TypeScript is a static description.
 * @returns An authentic writable artifact, or explicit refusal. No legacy catalog or saved report is consumed.
 * @throws TypeError For copied/foreign reconstruction handles. Caller cancellation returns a refusal.
 */
export async function generateComponentClient(expected: ReconstructedComponentSource, signal?: AbortSignal): Promise<GeneratedComponentClient | DirectCapsuleFailure> {
  inspectReconstructedComponentSource(expected);
  const {budget} = inspectDirectOperation(expected.contract).context;
  const failure = (kind: DirectCapsuleFailure['kind'], rule: string): DirectCapsuleFailure => ({kind, rule,
    repair: COMPONENT_CLIENT_RUNTIME_REPAIR, usage: Object.freeze({...budget.usage()})});
  const check = () => {checkSemanticBudget(budget); if (signal?.aborted) throw new Error('cancelled');};
  try {
    check(); const capsule = await createComponentSourceCapsule(expected.contract, expected.selection, signal, expected.responseProjection);
    if (capsule.kind !== 'component-capsule') return capsule;
    const literal = (value: unknown): string => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    const mappings = expected.mappings;
    const input = mappings.find(mapping => mapping.direction.kind === 'input')!;
    const output = mappings.find(mapping => mapping.direction.kind === 'output')!;
    const request = lowerComponentShape(expected.contract, input, 'Request', check);
    const response = lowerComponentShape(expected.contract, output, 'Response', check);
    const faults = mappings.filter(mapping => mapping.direction.kind === 'fault').map((mapping, index) => ({mapping,
      shape: lowerComponentShape(expected.contract, mapping, `Fault_${index}`, check)}));
    const lines = [
      '// Checked component client; inject checkedComponentRuntimeV1 from the package root.',
      '// Scalar facets, ordered occurrence correlation and wildcard membership remain native runtime duties.',
      ...request.declarations, `export type Request = ${request.type};`,
      ...response.declarations, `export type Response = ${response.type};`,
      ...faults.flatMap(({shape}, index) => [...shape.declarations, `export type Fault_${index} = ${shape.type};`]),
      'export interface Usage {readonly nodes: number; readonly work: number}',
      'export interface Name {readonly namespace: string; readonly local: string}',
      'export interface Options {',
      '  readonly localSource: string; readonly fileRoots: readonly string[]; readonly capsule: Uint8Array;',
      '  readonly sourceResources: readonly {readonly uri: string; readonly file: string; readonly canonicalUri?: string}[]; readonly sourceOrigins: readonly string[];',
      '  readonly sourceUri?: string;',
      '  readonly namespaceLocations?: readonly {readonly namespace: string; readonly location: string}[];',
      '  readonly standardLibraries?: readonly string[];',
      '  readonly recordSources?: readonly {readonly selector: {readonly portType: Name; readonly binding: Name; readonly operation: string}; readonly source: string}[];',
      '  readonly soap: {readonly service: Name; readonly port: string; readonly endpoint?: string;',
      '    readonly allowEndpoint?: (endpoint: URL) => boolean; readonly signal?: AbortSignal; readonly timeoutMs?: number;',
      '    readonly capabilities?: readonly string[]; readonly ca?: string;',
      '    readonly limits?: {readonly maxBytes?: number; readonly maxDepth?: number; readonly maxNodes?: number; readonly maxText?: number}};',
      '}',
      'export interface Failure {readonly kind: "incompatible-artifact" | "unsupported" | "missing-authority" | "resource-limit" | "cancelled" | "inconclusive" | "invalid-schema" | "scalar-invalid" | "value-invalid" | "xml-invalid" | "mismatch" | "transport" | "protocol";',
      '  readonly rule: string; readonly repair?: string; readonly phase?: "input" | "response"; readonly usage: Usage}',
      'export interface NativeSuccess {readonly kind: "soap-response" | "soap-fault"; readonly value: unknown; readonly admitted: false;',
      '  readonly status: number; readonly usage: Usage; readonly responseBytes: Uint8Array;',
      '  readonly fault?: {readonly name: string; readonly code: Name; readonly string: string; readonly actor?: string}}',
      `export interface Runtime {readonly version: ${literal(COMPONENT_CLIENT_RUNTIME_VERSION)}; execute(expectedBase64: string, input: unknown, options: Options, version: ${literal(COMPONENT_CLIENT_RUNTIME_VERSION)}): Promise<Failure | NativeSuccess>}`,
      'type Common = {readonly admitted: false; readonly status: number; readonly usage: Usage; readonly responseBytes: Uint8Array};',
      'export type Result = Failure | (Common & {readonly kind: "soap-response"; readonly value: Response})',
      ...faults.map(({mapping}, index) => {
        if (mapping.direction.kind !== 'fault') throw new TypeError('Native fault mapping required');
        return `  | (Common & {readonly kind: "soap-fault"; readonly value: Fault_${index}; readonly fault: {readonly name: ${literal(mapping.direction.name)}; readonly code: Name; readonly string: string; readonly actor?: string}})`;
      }),
      ...(faults.length ? [] : ['  | (Common & {readonly kind: "soap-fault"; readonly value: never; readonly fault: {readonly name: never; readonly code: Name; readonly string: string; readonly actor?: string}})']),
      ';',
      `export const expectedCapsuleBase64 = ${literal(Buffer.from(capsule.bytes).toString('base64'))};`,
      `export const selection = ${literal(JSON.stringify({selector: expected.contract.selector, ...expected.selection}))};`,
      'export function createClient(runtime: Runtime) {',
      '  return Object.freeze({',
      `    [${literal(expected.contract.selector.operation)}]: async (input: Request, options: Options): Promise<Result> => {`,
      `      if (runtime.version !== ${literal(COMPONENT_CLIENT_RUNTIME_VERSION)}) return {kind: "incompatible-artifact", rule: "generated-runtime-version", repair: ${literal(COMPONENT_CLIENT_RUNTIME_REPAIR)}, usage: {nodes: 0, work: 0}};`,
      `      return await runtime.execute(expectedCapsuleBase64, input, options, ${literal(COMPONENT_CLIENT_RUNTIME_VERSION)}) as Result;`,
      '    },', '  });', '}', '',
    ];
    const source = composeGeneratedSource(lines.join('\n'), resolvePreamble('direct-client'));
    if (Buffer.byteLength(source) > directLimit(budget, MAX_SOURCE_BYTES)) return failure('resource-limit', 'generated-source-byte-limit');
    check();
    const artifact: GeneratedComponentClient = Object.freeze({kind: 'generated-component-client', source, capsule: capsule.bytes,
      admitted: false, usage: Object.freeze({...budget.usage()})});
    generatedArtifacts.set(artifact, budget); return artifact;
  } catch (error) {
    if (budget.exhausted()) return failure('resource-limit', 'request-budget');
    if (signal?.aborted) return failure('cancelled', 'cooperative-cancellation');
    throw error;
  }
}

/** Emit a service client index and per-operation native artifacts using the existing component emitter.
 * @remarks All operation artifacts are prepared before writing. The index contains no source authority.
 * @returns Generator-owned relative capsule paths, keyed by exact operation name.
 * @throws For foreign/mixed native operations, refused generation, cancellation or filesystem failure.
 */
export async function writeComponentServiceClient(expected: readonly ReconstructedComponentSource[], directory: string, signal?: AbortSignal):
  Promise<Readonly<Record<string, string>>> {
  const operations = inspectComponentSourceService(expected);
  const generated: GeneratedComponentClient[] = [];
  for (const operation of operations) {
    const artifact = await generateComponentClient(operation, signal);
    if (artifact.kind !== 'generated-component-client') throw new Error(`Checked client refused: ${artifact.kind}: ${artifact.rule}`);
    generated.push(artifact);
  }
  const files: Record<string, string> = Object.create(null) as Record<string, string>;
  const lines = operations.flatMap((_, index) => [
    `import {createClient as operation_${index}} from './operations/${index}/client.js';`,
    `export * as Operation_${index} from './operations/${index}/client.js';`,
  ]);
  lines.push("import type {Runtime, Options as OperationOptions} from './operations/0/client.js';",
    "export type Options = Omit<OperationOptions, 'capsule'>;",
    `export const selection = ${JSON.stringify(JSON.stringify(operations[0]!.selection))};`,
    'export function createClient(runtime: Runtime) {', '  return Object.freeze({',
    ...operations.map((_, index) => `    ...operation_${index}(runtime),`), '  });', '}', '');
  for (const [index, operation] of operations.entries()) {
    const dir = path.join(directory, 'operations', String(index));
    mkdirSync(dir, {recursive: true}); writeDirectClient(path.join(dir, 'client.ts'), generated[index]!);
    writeFileSync(path.join(dir, 'contract.json'), generated[index]!.capsule);
    files[operation.contract.selector.operation] = `operations/${index}/contract.json`;
  }
  const {budget} = inspectDirectOperation(operations[0]!.contract).context;
  checkSemanticBudget(budget);
  writeFileSync(path.join(directory, 'client.ts'), composeGeneratedSource(lines.join('\n'), resolvePreamble('direct-client')), 'utf8');
  return Object.freeze(files);
}
