import {directLimit} from '../compiler/directExecutionPolicy.js';
import {DIRECT_CLIENT_RUNTIME_VERSION, DIRECT_CLIENT_RUNTIME_REPAIR} from './directClientVersion.js';
/** Native-plan generator consumed by the opt-in checked pipeline. */
import {checkSemanticBudget} from '../compiler/semanticBudget.js';
import {writeFileSync} from 'node:fs';
import {inspectDirectOperation} from '../compiler/directOperation.js';
import {inspectDirectValueMapping} from '../compiler/directValues.js';
import type {DirectValueMapping} from '../compiler/directValues.js';
import {checkDirectSourceCompatibility, createDirectSourceCapsule} from '../compiler/directSourceCapsule.js';
import type {ReconstructedDirectSource, DirectCapsuleFailure} from '../compiler/directSourceCapsule.js';
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
export function writeDirectClient(file: string, generated: GeneratedDirectClient): void {
  const budget = generatedArtifacts.get(generated);
  if (!budget) throw new TypeError('Authentic generated artifact required');
  checkSemanticBudget(budget);
  writeFileSync(file, generated.source, 'utf8');
}
