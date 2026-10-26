/** Internal direct value chain. No XML encoding, transport or runtime admission. */
import {inspectDirectOperation} from './directOperation.js';
import type {DirectOperationContract, DirectMessageRoot} from './directOperation.js';
import {inspectDirectStructuralMatch, matchDirectOperation} from './directStructure.js';
import type {DirectDirection, DirectScalarDuty, DirectStructuralMatch} from './directStructure.js';
import {planDirectRoot} from './directStructurePlan.js';
import type {DirectRootPlan} from './directStructurePlan.js';
import {datatypeValues, normalizeWhitespace, whitespaceFor} from './datatypeValues.js';
import type {SemanticBudget, ResolverUsage} from './semanticBudget.js';
import type {ExpandedName, SyntaxElement, SyntaxNode, SyntaxSource} from '../loader/orderedSyntax.js';

export type DirectPrimitive = string | boolean | number;
export type DirectApplicationValue = DirectPrimitive | Readonly<Record<string, DirectPrimitive | readonly DirectPrimitive[]>>;
export interface DirectValueMapping extends DirectRootPlan {
  readonly kind: 'direct-mapping'; readonly version: 'direct-values-v1'; readonly admitted: false;
  readonly root: DirectMessageRoot; readonly direction: DirectDirection; readonly contextId: string;
  readonly usage: ResolverUsage;
}
export interface DirectAssessedScalar extends DirectScalarDuty {
  readonly normalized: string; readonly canonical: string; readonly value: DirectPrimitive;
}
export interface DirectValueReceipt {
  readonly kind: 'direct-value'; readonly scope: 'direct-structure-and-scalars'; readonly admitted: false;
  readonly mapping: DirectValueMapping; readonly structural: DirectStructuralMatch;
  readonly operands: readonly DirectAssessedScalar[]; readonly value: DirectApplicationValue; readonly usage: ResolverUsage;
}
export interface DirectExpandedValue {
  readonly kind: 'direct-expanded'; readonly provenance: 'generated-direct-value'; readonly admitted: false;
  readonly payload: SyntaxElement; readonly validated: DirectValueReceipt; readonly usage: ResolverUsage;
}
export interface DirectValueFailure {
  readonly kind: 'scalar-invalid' | 'value-invalid' | 'unsupported' | 'cancelled' | 'resource-limit';
  readonly rule: string; readonly schemaPath?: string; readonly payloadPath?: string; readonly usage: ResolverUsage;
}
type Options = Readonly<{signal?: AbortSignal}>;
const mappings = new WeakMap<object, DirectOperationContract>();
const values = new WeakMap<object, DirectOperationContract>();
const expansions = new WeakMap<object, DirectOperationContract>();
function authentic<T>(registry: WeakMap<object, DirectOperationContract>, receipt: unknown, contract: DirectOperationContract, label: string): T {
  if (!receipt || typeof receipt !== 'object' || registry.get(receipt) !== contract) throw new TypeError(`Unauthenticated or foreign direct ${label}`);
  inspectDirectOperation(contract);
  return receipt as T;
}
/** Inspection is identity-only; operational consumers must still spend the original budget. */
export function inspectDirectValueMapping(mapping: unknown, contract: DirectOperationContract): DirectValueMapping {
  return authentic(mappings, mapping, contract, 'mapping');
}
export function inspectDirectValue(value: unknown, contract: DirectOperationContract): DirectValueReceipt {
  return authentic(values, value, contract, 'value');
}
export function inspectDirectExpandedValue(value: unknown, contract: DirectOperationContract): DirectExpandedValue {
  return authentic(expansions, value, contract, 'expansion');
}
class Stop extends Error {
  constructor(readonly kind: DirectValueFailure['kind'], readonly rule: string, readonly schemaPath?: string, readonly payloadPath?: string) {super(rule);}
}
interface Session {budget: SemanticBudget; check(): void; publish<T extends object>(value: T): Readonly<T> & {usage: ResolverUsage}}
function run<T>(contract: DirectOperationContract, options: Options, work: (s: Session) => T): T | DirectValueFailure {
  const {budget} = inspectDirectOperation(contract).context;
  const check = () => {budget.chargeWork(); if (options.signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');};
  try {
    const result = budget.guard(() => {
      budget.chargeWork(4096); check();
      return work({budget, check, publish(value) {
        budget.chargeWork(512); budget.freeze(value); check();
        return Object.freeze({...value, usage: Object.freeze({...budget.usage()})});
      }});
    });
    if (budget.exhausted()) return Object.freeze({kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()});
    return result as T;
  } catch (error) {
    if (budget.exhausted()) return {kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()};
    if (error instanceof Stop) return Object.freeze({kind: error.kind, rule: error.rule, schemaPath: error.schemaPath,
      payloadPath: error.payloadPath, usage: Object.freeze({...budget.usage()})});
    throw error;
  }
}
function mappingFor(contract: DirectOperationContract, direction: DirectDirection, s: Session): DirectValueMapping {
  const {context} = inspectDirectOperation(contract);
  const {budget, check} = s;
  const owned = budget.snapshot(direction);
  if (!owned || typeof owned !== 'object' || Array.isArray(owned)) throw new TypeError('Data-only direct direction required');
  let root: DirectMessageRoot;
  if (owned.kind === 'input' || owned.kind === 'output') root = contract[owned.kind];
  else if (owned.kind === 'fault' && typeof owned.name === 'string') {
    budget.chargeWork(64 + contract.faults.length * 32);
    const fault = contract.faults.find(f => budget.compareText(f.name, owned.name) === 0);
    if (!fault) throw new Stop('unsupported', 'unknown-fault');
    root = fault.root;
  } else throw new Stop('unsupported', 'unknown-direction');
  const plan = planDirectRoot(context, root, check, () => {throw new Stop('unsupported', 'native-direct-shape', root.element.context.source.path);});
  const mapping = s.publish({kind: 'direct-mapping' as const, version: 'direct-values-v1' as const, admitted: false as const,
    root, direction: owned.kind === 'fault' ? {kind: 'fault' as const, name: owned.name} : {kind: owned.kind}, contextId: context.contextId, ...plan});
  mappings.set(mapping, contract);
  return mapping;
}
/** Includes absent optional/zero-count slots; no observed payload is needed. */
export function createDirectValueMapping(contract: DirectOperationContract, direction: DirectDirection, options: Options = {}): DirectValueMapping | DirectValueFailure {
  return run(contract, options, s => mappingFor(contract, direction, s));
}
function scalar(duty: DirectScalarDuty, s: Session): DirectAssessedScalar {
  const {budget, check} = s;
  const fail = (_owner: DirectScalarDuty, rule: string): never => {throw new Stop('scalar-invalid', rule, duty.schemaPath, duty.payloadPath);};
  const unavailable = (): never => {throw new Stop('unsupported', 'direct-datatype-prerequisite', duty.schemaPath, duty.payloadPath);};
  budget.chargeWork(512);
  // This is a neutral lexical operand, not a schema LexicalValue or checked receipt.
  const core = datatypeValues<DirectScalarDuty>({
    step: (_owner, count = 1) => {check(); budget.chargeWork(count);},
    text: text => {check(); budget.chargeWork(32 + text.length * 4); return text;},
    fail, unsupported: unavailable, unresolved: unavailable, notation: unavailable,
  });
  const result = core.atomic(duty.builtin.local, {value: duty.lexical, context: {namespaces: duty.namespaces, source: duty.payloadSource}}, duty);
  budget.chargeWork(256 + (duty.lexical.length + result.canonical.length) * 4);
  const value = duty.builtin.local === 'int' ? Number(result.canonical) : duty.builtin.local === 'boolean' ? result.canonical === 'true' : result.canonical;
  return {...duty, normalized: normalizeWhitespace(duty.lexical, whitespaceFor(duty.builtin.local)), canonical: result.canonical, value};
}
function assessed(contract: DirectOperationContract, structural: DirectStructuralMatch, mapping: DirectValueMapping, s: Session): DirectValueReceipt {
  const {budget, check} = s;
  budget.chargeWork(128);
  const operands: DirectAssessedScalar[] = [];
  for (const duty of structural.occurrences) {check(); budget.chargeWork(32); operands.push(scalar(duty, s));}
  let value: DirectApplicationValue;
  if (mapping.rootBuiltin) value = operands[0]!.value;
  else {
    budget.chargeWork(64);
    const record: Record<string, DirectPrimitive | DirectPrimitive[]> = Object.create(null) as Record<string, DirectPrimitive | DirectPrimitive[]>;
    let cursor = 0;
    for (const slot of mapping.slots) {
      check(); budget.chargeWork(128 + slot.element.name.local.length * 4);
      const key = slot.element.name.local;
      if (slot.particle.occurs.max === 'unbounded') {
        const items: DirectPrimitive[] = []; record[key] = items;
        while (cursor < operands.length && operands[cursor]!.declaration === slot.element) {
          check(); budget.chargeWork(32); items.push(operands[cursor++]!.value);
        }
      } else if (cursor < operands.length && operands[cursor]!.declaration === slot.element) record[key] = operands[cursor++]!.value;
    }
    value = record;
  }
  const receipt = s.publish({kind: 'direct-value' as const, scope: 'direct-structure-and-scalars' as const, admitted: false as const,
    mapping, structural, operands, value});
  values.set(receipt, contract);
  return receipt;
}
export function assessDirectScalars(contract: DirectOperationContract, match: unknown, options: Options = {}): DirectValueReceipt | DirectValueFailure {
  const structural = inspectDirectStructuralMatch(match, contract);
  return run(contract, options, s => {
    s.budget.chargeWork(128); s.check();
    const mapping = mappingFor(contract, structural.direction, s);
    if (mapping.root !== structural.root) throw new TypeError('Foreign direct root');
    return assessed(contract, structural, mapping, s);
  });
}
/** Pure shape validation plus lexical reconstruction, followed by existing validators. */
export function expandDirectValue(contract: DirectOperationContract, suppliedMapping: unknown, application: unknown, options: Options = {}): DirectExpandedValue | DirectValueFailure {
  const mapping = inspectDirectValueMapping(suppliedMapping, contract);
  return run(contract, options, s => {
    const {budget, check} = s;
    const invalid = (rule: string, path = '/value'): never => {throw new Stop('value-invalid', rule, mapping.root.element.context.source.path, path);};
    const data = (object: object, key: PropertyKey): unknown => {
      check(); budget.chargeWork(96 + (typeof key === 'string' ? key.length * 4 : 0));
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable && !(Array.isArray(object) && key === 'length')) return invalid('own-data-property');
      return descriptor.value;
    };
    const keys = (object: object, maximum: number): PropertyKey[] => {
      // Source/array shape gives an upper bound for every valid key vector.
      // Reserve it before invoking the intrinsic, then refuse excess keys without
      // traversal. Malformed objects can still make the engine allocate a larger
      // vector internally; the documented boundary cannot control that allocation.
      check(); budget.chargeWork(64 + maximum * 64);
      const result = Reflect.ownKeys(object);
      if (result.length > maximum) return invalid('unknown-key');
      return result;
    };
    const spelling = (value: unknown, builtin: ExpandedName): string => {
      check(); budget.chargeWork(128);
      if (builtin.local === 'string') {
        if (typeof value !== 'string') return invalid('string-required');
        budget.chargeWork(32 + value.length * 4); return value;
      }
      if (builtin.local === 'boolean') {
        if (typeof value !== 'boolean') return invalid('boolean-required');
        return value ? 'true' : 'false';
      }
      if (typeof value !== 'number' || !Number.isInteger(value)) return invalid('integer-number-required');
      // Range and XML lexical validity are checked by the same neutral core below.
      budget.chargeWork(128); return String(value === 0 ? 0 : value);
    };
    const source = (path: string): SyntaxSource => {
      budget.chargeWork(256 + path.length * 4);
      return {uri: 'urn:typescript-wsdl-client:generated-direct-value', digest: '', path,
        start: {offset: 0, line: 0, column: 0}, end: {offset: 0, line: 0, column: 0}};
    };
    const leaf = (name: ExpandedName, lexical: string, path: string): SyntaxElement => {
      check(); budget.chargeWork(512 + name.local.length * 4 + name.namespace.length * 4 + lexical.length * 4);
      return {kind: 'element', name, lexicalName: name.local, namespaces: Object.create(null) as Record<string, string>,
        baseUri: 'urn:typescript-wsdl-client:generated-direct-value', attributes: [], source: source(path),
        children: [{kind: 'text', value: lexical, source: source(path + '/text')}]};
    };
    let payload: SyntaxElement;
    if (mapping.rootBuiltin) payload = leaf(mapping.root.element.name, spelling(application, mapping.rootBuiltin), '/0');
    else {
      if (!application || typeof application !== 'object' || Array.isArray(application)) return invalid('record-required');
      check(); budget.chargeWork(64);
      const proto: unknown = Object.getPrototypeOf(application);
      if (proto !== Object.prototype && proto !== null) return invalid('plain-record-required');
      budget.chargeWork(64);
      const declared = new Set<string>();
      for (const slot of mapping.slots) {check(); budget.chargeWork(64 + slot.element.name.local.length * 4); declared.add(slot.element.name.local);}
      for (const key of keys(application, mapping.slots.length)) {
        check(); if (typeof key !== 'string') return invalid('unknown-key');
        budget.chargeWork(32 + key.length * 4);
        if (!declared.has(key)) return invalid('unknown-key');
        data(application, key);
      }
      budget.chargeWork(128);
      const children: SyntaxNode[] = [];
      for (const slot of mapping.slots) {
        check(); budget.chargeWork(96 + slot.element.name.local.length * 4);
        const key = slot.element.name.local;
        if (!Object.hasOwn(application, key)) {
          if (slot.particle.occurs.max === 'unbounded' || slot.particle.occurs.min === '1') return invalid('missing-member');
          continue;
        }
        const value = data(application, key);
        const append = (item: unknown) => {check(); budget.chargeWork(64); children.push(leaf(slot.element.name, spelling(item, slot.builtin), `/0/children/${children.length}`));};
        if (slot.particle.occurs.max === 'unbounded') {
          if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return invalid('dense-array-required');
          const length = data(value, 'length') as number;
          if (slot.particle.occurs.min === '1' && length === 0) return invalid('required-repetition');
          // Charge the dense shape before iteration/allocation; sparse huge arrays stop here.
          budget.chargeWork(128 + length * 128);
          const own = keys(value, length + 1);
          if (own.length !== length + 1) return invalid('dense-array-required');
          for (let i = 0; i < length; i++) {check(); append(data(value, String(i)));}
        } else append(value);
      }
      budget.chargeWork(512);
      payload = {kind: 'element', name: mapping.root.element.name, lexicalName: mapping.root.element.name.local,
        namespaces: Object.create(null) as Record<string, string>, baseUri: 'urn:typescript-wsdl-client:generated-direct-value',
        attributes: [], source: source('/0'), children};
    }
    const structural = matchDirectOperation(contract, mapping.direction, payload, options);
    if (structural.kind !== 'structural-match') {
      if (structural.kind === 'mismatch') throw new Error('Internal direct expansion violated its source mapping');
      throw new Stop(structural.kind, structural.rule, structural.schemaPath, structural.payloadPath);
    }
    const validated = assessed(contract, structural, mapping, s);
    const expanded = s.publish({kind: 'direct-expanded' as const, provenance: 'generated-direct-value' as const, admitted: false as const, payload, validated});
    expansions.set(expanded, contract);
    return expanded;
  });
}
