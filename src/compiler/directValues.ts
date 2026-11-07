import {directDataOwnership, directLimit} from './directExecutionPolicy.js';
import {types} from 'node:util';
/** Internal direct value chain. No XML encoding, transport or runtime admission. */
import {checkSemanticBudget} from './semanticBudget.js';
import {DataOwnershipLimitError} from './dataOwnership.js';
import {inspectDirectOperation} from './directOperation.js';
import type {DirectOperationContract, DirectMessageRoot} from './directOperation.js';
import {inspectDirectStructuralMatch, matchDirectOperation} from './directStructure.js';
import type {DirectDirection, DirectScalarDuty, DirectStructuralMatch} from './directStructure.js';
import {planDirectProjection, flatDirectProjection, projectionScalarRepresentation, resolveProjectionWildcard, selectProjectionWildcard, selectProjectionAttribute, isXmlCharacters, isXmlNamespaceBinding} from './directStructurePlan.js';
import type {DirectRootPlan, DirectProjectionPlan, DirectProjectionValue} from './directStructurePlan.js';
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {ElementNode} from './canonicalGraph.js';
import {inspectProjectionStructuralMatch, matchDirectProjection} from './directStructure.js';
import type {DirectMatchedNode, ProjectionStructuralMatch} from './directStructure.js';
import {datatypeValues, normalizeWhitespace, whitespaceFor} from './datatypeValues.js';
import type {SemanticBudget, ResolverUsage} from './semanticBudget.js';
import type {ExpandedName, SyntaxAttribute, SyntaxElement, SyntaxNode, SyntaxSource} from '../loader/orderedSyntax.js';
import {assessProjectionScalarOperand} from './projectionScalar.js';
import type {DatatypeOperand} from './datatypeValues.js';
import type {ProjectionScalarList} from './projectionScalar.js';
import {isXmlNCName, XML_NAMESPACE, XSD_NAMESPACE} from '../loader/orderedSyntax.js';

export type DirectPrimitive = string | boolean | number;
/** Inverse construction caps; XML encoding may impose smaller byte/text/node limits. */
export const DIRECT_VALUE_LIMITS = Object.freeze({maxText: 1024 * 1024, maxItems: 100_000});
export const DIRECT_VALUE_VERSION = 'direct-values-v1';
export const DIRECT_SCALAR_POLICY = 'direct-string-boolean-int-v1';
export interface DirectRecordValue {readonly [key: string]: DirectApplicationValue | readonly DirectApplicationValue[]}
export type DirectApplicationValue = DirectPrimitive | DirectRecordValue | readonly DirectApplicationValue[];
export interface DirectValueMapping extends DirectRootPlan {
  readonly kind: 'direct-mapping'; readonly version: typeof DIRECT_VALUE_VERSION; readonly admitted: false;
  readonly root: DirectMessageRoot; readonly direction: DirectDirection; readonly contextId: string;
  readonly usage: ResolverUsage;
}
export interface ComponentValueMapping {
  readonly kind: 'component-mapping'; readonly version: 'component-values-v1'; readonly admitted: false;
  readonly root: DirectMessageRoot; readonly direction: DirectDirection; readonly contextId: string;
  readonly usage: ResolverUsage;
}
export interface DirectAssessedScalar extends DirectScalarDuty {
  readonly normalized: string; readonly canonical: string; readonly value: DirectPrimitive | readonly DirectPrimitive[];
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
export interface ProjectionValueReceipt {
  readonly kind: 'projection-value'; readonly scope: 'direct-structure-and-scalars'; readonly admitted: false;
  readonly root: ElementNode; readonly structural: ProjectionStructuralMatch; readonly contextId: string;
  readonly operands: readonly DirectAssessedScalar[]; readonly value: DirectApplicationValue; readonly usage: ResolverUsage;
}
export interface ProjectionExpandedValue {
  readonly kind: 'projection-expanded'; readonly provenance: 'generated-direct-value'; readonly admitted: false;
  readonly payload: SyntaxElement; readonly validated: ProjectionValueReceipt; readonly usage: ResolverUsage;
}
export interface DirectValueFailure {
  readonly kind: 'scalar-invalid' | 'value-invalid' | 'unsupported' | 'cancelled' | 'resource-limit';
  readonly rule: string; readonly schemaPath?: string; readonly payloadPath?: string; readonly usage: ResolverUsage;
}
type Options = Readonly<{signal?: AbortSignal; maxText?: number; maxItems?: number}>;
const mappings = new WeakMap<object, DirectOperationContract>();
// @why Keep the exact native-derived plan with its issued mapping without widening portable preview data.
const mappingProjections = new WeakMap<DirectValueMapping, DirectProjectionPlan>();
const componentMappings = new WeakMap<object, Readonly<{mapping: ComponentValueMapping; contract: DirectOperationContract; projection: DirectProjectionPlan}>>();
const values = new WeakMap<object, DirectOperationContract>();
const expansions = new WeakMap<object, DirectOperationContract>();
const projectionValues = new WeakMap<object, SemanticContext>();
const projectionExpansions = new WeakMap<object, SemanticContext>();
/** Inspect only the exact context-issued expansion; no operation or portable authority is conferred. */
export function inspectProjectionExpandedValue(value: unknown, context: SemanticContext): ProjectionExpandedValue {
  assertSemanticContext(context);
  if (!value || typeof value !== 'object' || projectionExpansions.get(value) !== context) throw new TypeError('Unauthenticated or foreign projection expansion');
  return value as ProjectionExpandedValue;
}
/** Context-owned value evidence does not authenticate an operation, portable bundle or runtime admission. */
export function inspectProjectionValue(value: unknown, context: SemanticContext): ProjectionValueReceipt {
  assertSemanticContext(context);
  if (!value || typeof value !== 'object' || projectionValues.get(value) !== context) throw new TypeError('Unauthenticated or foreign projection value');
  return value as ProjectionValueReceipt;
}
function authentic<T>(registry: WeakMap<object, DirectOperationContract>, receipt: unknown, contract: DirectOperationContract, label: string): T {
  if (!receipt || typeof receipt !== 'object' || registry.get(receipt) !== contract) throw new TypeError(`Unauthenticated or foreign direct ${label}`);
  inspectDirectOperation(contract);
  return receipt as T;
}
/** Inspection is identity-only; operational consumers still check native authority and limits. */
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
  return runContext(inspectDirectOperation(contract).context, options, work);
}
function runContext<T>(context: SemanticContext, options: Options, work: (s: Session) => T): T | DirectValueFailure {
  assertSemanticContext(context);
  const {budget} = context;
  const check = () => {checkSemanticBudget(budget); if (options.signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');};
  try {
    const result = budget.guard(() => {
      check();
      return work({budget, check, publish(value) {
        directDataOwnership(budget).freeze(value); check();
        return Object.freeze({...value, usage: Object.freeze({...budget.usage()})});
      }});
    });
    if (budget.exhausted()) return Object.freeze({kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()});
    return result as T;
  } catch (error) {
    if (budget.exhausted()) return {kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()};
    if (error instanceof DataOwnershipLimitError) return {kind: 'resource-limit', rule: error.message, usage: budget.usage()};
    if (error instanceof Stop) return Object.freeze({kind: error.kind, rule: error.rule, schemaPath: error.schemaPath,
      payloadPath: error.payloadPath, usage: Object.freeze({...budget.usage()})});
    throw error;
  }
}
function mappingRoot(contract: DirectOperationContract, direction: DirectDirection, s: Session): Readonly<{root: DirectMessageRoot; direction: DirectDirection}> {
  inspectDirectOperation(contract);
  const {budget, check} = s;
  const owned = directDataOwnership(budget).snapshot(direction, check);
  if (!owned || typeof owned !== 'object' || Array.isArray(owned)) throw new TypeError('Data-only direct direction required');
  let root: DirectMessageRoot;
  if (owned.kind === 'input' || owned.kind === 'output') root = contract[owned.kind];
  else if (owned.kind === 'fault' && typeof owned.name === 'string') {

    const fault = contract.faults.find(f => budget.compareText(f.name, owned.name) === 0);
    if (!fault) throw new Stop('unsupported', 'unknown-fault');
    root = fault.root;
  } else throw new Stop('unsupported', 'unknown-direction');
  return {root, direction: owned.kind === 'fault' ? {kind: 'fault', name: owned.name} : {kind: owned.kind}};
}
function mappingFor(contract: DirectOperationContract, direction: DirectDirection, s: Session): DirectValueMapping {
  const {context} = inspectDirectOperation(contract), {check} = s;
  if (contract.basis !== 'native-direct-premises-v1' || contract.correspondence !== 'dated-XSD-2004-direct-v1')
    throw new Stop('unsupported', 'direct-mapping-version');
  const selected = mappingRoot(contract, direction, s), {root} = selected;
  const unsupported = (): never => {throw new Stop('unsupported', 'native-direct-shape', root.element.context.source.path);};
  const projection = planDirectProjection(context, root.element, check, unsupported);
  const plan = flatDirectProjection(projection, check, unsupported);
  const mapping = s.publish({kind: 'direct-mapping' as const, version: DIRECT_VALUE_VERSION as typeof DIRECT_VALUE_VERSION, admitted: false as const,
    root, direction: selected.direction, contextId: context.contextId, ...plan});
  mappings.set(mapping, contract);
  mappingProjections.set(mapping, projection);
  return mapping;
}
/** Includes absent optional/zero-count slots; no observed payload is needed. */
export function createDirectValueMapping(contract: DirectOperationContract, direction: DirectDirection, options: Options = {}): DirectValueMapping | DirectValueFailure {
  return run(contract, options, s => mappingFor(contract, direction, s));
}

/** Plan an operation direction through the existing native structured owner without flattening or preview admission.
 * @remarks This transient mapping carries a distinct version and retains the exact native projection privately.
 *   It grants no codec, artifact or transport authority; copied mappings and mappings for other operations refuse.
 * @returns An operation-owned structured mapping or the existing unsupported/cancellation/resource diagnostic.
 */
export function createComponentValueMapping(contract: DirectOperationContract, direction: DirectDirection, options: Options = {}): ComponentValueMapping | DirectValueFailure {
  return run(contract, options, s => {
    const {context} = inspectDirectOperation(contract);
    if (contract.basis !== 'native-component-premises-v1' || contract.correspondence !== 'dated-XSD-2004-components-v1')
      throw new Stop('unsupported', 'component-mapping-version');
    const selected = mappingRoot(contract, direction, s);
    const projection = planDirectProjection(context, selected.root.element, s.check,
      () => {throw new Stop('unsupported', 'native-component-shape', selected.root.element.context.source.path);});
    const mapping: ComponentValueMapping = s.publish({kind: 'component-mapping' as const, version: 'component-values-v1' as const,
      admitted: false as const, root: selected.root, direction: selected.direction, contextId: context.contextId});
    componentMappings.set(mapping, Object.freeze({mapping, contract, projection}));
    return mapping;
  });
}

/** Authenticate the exact structured mapping and expose its existing native plan to local consumers only. */
export function inspectComponentValueMapping(value: unknown, contract: DirectOperationContract):
  Readonly<{mapping: ComponentValueMapping; projection: DirectProjectionPlan}> {
  inspectDirectOperation(contract);
  if (!value || typeof value !== 'object') throw new TypeError('Fresh matching component value mapping required');
  const owned = componentMappings.get(value);
  if (!owned || owned.contract !== contract) throw new TypeError('Fresh matching component value mapping required');
  return Object.freeze({mapping: owned.mapping, projection: owned.projection});
}
function scalar(duty: DirectScalarDuty, s: Session, context: SemanticContext): DirectAssessedScalar {
  const {budget, check} = s;
  const fail = (_owner: DirectScalarDuty, rule: string): never => {throw new Stop('scalar-invalid', rule, duty.schemaPath, duty.payloadPath);};
  const unavailable = (): never => {throw new Stop('unsupported', 'direct-datatype-prerequisite', duty.schemaPath, duty.payloadPath);};

  // This is a neutral lexical operand, not a schema LexicalValue or checked receipt.
  const core = datatypeValues<DirectScalarDuty>({
    step: (_owner, count = 1) => {check(); budget.chargeWork(count);},
    text: text => {check(); return text;},
    fail, unsupported: unavailable, unresolved: unavailable, notation: unavailable,
  });
  let result: DatatypeOperand;
  const lexical = {value: duty.lexical, context: {namespaces: duty.namespaces, source: duty.payloadSource}};
  if (duty.type.kind === 'builtin' && !duty.list) result = core.atomic(duty.builtin.local, lexical, duty);
  else {
    const assessed = assessProjectionScalarOperand(context, duty.declaration, lexical, check);
    check();
    if (assessed.kind !== 'projection-scalar-operand') throw new Stop(assessed.kind === 'scalar-invalid' ? 'scalar-invalid' : assessed.kind === 'resource-limit' ? 'resource-limit' : 'unsupported',
      'rule' in assessed ? assessed.rule : 'request-budget', duty.schemaPath, duty.payloadPath);
    result = assessed.operand;
  }
  if (duty.fixedCanonical !== undefined && budget.compareText(result.canonical, duty.fixedCanonical) !== 0)
    throw new Stop('scalar-invalid', duty.declaration.kind === 'attribute' ? 'fixed-attribute-value' : 'fixed-element-value', duty.schemaPath, duty.payloadPath);

  const normalized = result.normalized ?? normalizeWhitespace(duty.lexical, whitespaceFor(duty.builtin.local));
  const present = (operand: DatatypeOperand, builtin: ExpandedName, lexical: string, retainLexical?: true): DirectPrimitive => {
    check();
    if (retainLexical) return lexical;
    if (builtin.local === 'int') return Number(operand.canonical);
    if (builtin.local === 'boolean') return operand.canonical === 'true';
    if (operand.family === 'hexBinary') {
      budget.chargeWork(64 + operand.canonical.length * 2);
      return operand.canonical.toUpperCase();
    }
    if (operand.family === 'base64Binary') {
      budget.chargeWork(64 + operand.canonical.length * 4);
      return Buffer.from(operand.canonical, 'hex').toString('base64');
    }
    // @why Neutral temporal/IEEE comparison keys are not XML lexicals.
    return operand.calendar || operand.duration || operand.family === 'float' || operand.family === 'double' ? lexical : operand.canonical;
  };
  let value: DirectPrimitive | readonly DirectPrimitive[];
  if (duty.list && !duty.retainLexical) {
    if (!result.items) throw new TypeError('Missing native list item operands');
    const items: DirectPrimitive[] = [];
    for (const item of result.items) {
      check(); budget.chargeWork(64);
      if (item.normalized === undefined) throw new TypeError('Missing native list item lexical');
      items.push(present(item, duty.list.builtin, item.normalized, duty.list.retainLexical));
    }
    value = items;
  // @why #422 primitive-string unions re-assess the complete pre-member lexical input on every inverse.
  } else value = present(result, duty.builtin, result.selectedMembers ? duty.lexical : normalized, duty.retainLexical);
  return {...duty, normalized, canonical: result.canonical, value};
}
function assessed(contract: DirectOperationContract, structural: DirectStructuralMatch, mapping: DirectValueMapping, s: Session): DirectValueReceipt {
  const {check} = s;

  const operands: DirectAssessedScalar[] = [];
  for (const duty of structural.occurrences) {check(); operands.push(scalar(duty, s, inspectDirectOperation(contract).context));}
  const value = projectValue(structural.tree, operands, s);
  const receipt = s.publish({kind: 'direct-value' as const, scope: 'direct-structure-and-scalars' as const, admitted: false as const,
    mapping, structural, operands, value});
  values.set(receipt, contract);
  return receipt;
}

/** Project authenticated matched record boundaries; scalar checks remain the existing native datatype owner. */
function projectValue(tree: DirectMatchedNode, operands: readonly DirectAssessedScalar[], s: Session): DirectApplicationValue {
  const {budget, check} = s;
  let result: DirectApplicationValue | undefined;
  type Frame = {node: DirectMatchedNode; scope?: Readonly<Record<string, string>>; set(value: DirectApplicationValue): void};
  const frames: Frame[] = [{node: tree, set: value => {result = value;}}];
  while (frames.length) {
    check(); const {node, set, scope} = frames.pop()!;
    budget.chargeWork(128);
    if (node.kind === 'mixed-text') {set(node.value); continue;}
    const retain = (target: Record<string, DirectApplicationValue>, effective: Readonly<Record<string, string>>) => {
      const delta = Object.create(null) as Record<string, string>;
      for (const key of budget.sorted(Object.keys(effective), (a, b) => budget.compareText(a, b))) {
        check(); budget.chargeWork(32 + key.length + effective[key]!.length);
        if (key !== 'xml' && (!scope || scope[key] !== effective[key])) delta[key] = effective[key]!;
      }
      if (!scope || Object.keys(delta).length) target.$namespaces = delta;
    };
    if (node.kind === 'unassessed') {
      const payload = node.payload;
      const value = Object.create(null) as Record<string, DirectApplicationValue>;
      value.$namespace = payload.name.namespace;
      retain(value, payload.namespaces);
      if (payload.attributes.length) {
        value.$attributes = budget.sorted([...payload.attributes], (a, b) => budget.compareText(JSON.stringify([a.name.namespace, a.name.local]), JSON.stringify([b.name.namespace, b.name.local]))).map(attribute => {
          const entry = Object.create(null) as Record<string, DirectApplicationValue>;
          entry[attribute.name.local] = attribute.name.namespace ? {$namespace: attribute.name.namespace, $value: attribute.value} : attribute.value;
          return entry;
        });
      }
      const content: DirectApplicationValue[] = []; value.$content = content; set(value);
      const children: Frame[] = [];
      for (const child of payload.children) {
        check(); budget.chargeWork(128);
        if (child.kind === 'text') {
          children.push({node: {kind: 'mixed-text', declaration: node.declaration, payloadPath: node.payloadPath, value: child.value}, set(text) {
            if (!text) return;
            const last = content.at(-1) as Record<string, DirectApplicationValue> | undefined;
            if (last && Object.hasOwn(last, '$value')) last.$value = String(last.$value) + String(text);
            else content.push({$value: text});
          }});
        } else children.push({node: {...node, payload: child}, scope: payload.namespaces, set(value) {
          const entry = Object.create(null) as Record<string, DirectApplicationValue>;
          entry[child.name.local] = value; content.push(entry);
        }});
      }
      for (let index = children.length - 1; index >= 0; index--) frames.push(children[index]!);
      continue;
    }
    if (node.kind === 'scalar') {
      const operand = operands[node.operand];
      if (!operand || operand.declaration !== node.declaration || operand.payloadPath !== node.payloadPath) throw new TypeError('Foreign projection scalar operand');
      set(operand.value); continue;
    }
    const record: Record<string, DirectApplicationValue | DirectApplicationValue[]> = Object.create(null) as Record<string, DirectApplicationValue | DirectApplicationValue[]>;
    set(record);
    if (node.namespaces) retain(record, node.namespaces);
    if (node.nil) record.$nil = true;
    const attributeIdentities = new Map<DirectApplicationValue, ExpandedName>();
    for (const attribute of node.attributes) {
      check(); const operand = operands[attribute.operand];
      if (!operand || operand.declaration !== attribute.declaration || operand.payloadPath !== attribute.payloadPath) throw new TypeError('Foreign projection attribute operand');
      const key = attribute.declaration.name.local;
      budget.chargeWork(64 + key.length * 4);
      if (attribute.bag) {
        const bag = (record.$attributes ??= []) as DirectApplicationValue[];
        const entry = Object.create(null) as Record<string, DirectApplicationValue>;
        entry[key] = attribute.namespaceChoice ? {$namespace: attribute.declaration.name.namespace, $value: operand.value} : operand.value;
        bag.push(entry);
        attributeIdentities.set(entry, attribute.declaration.name);
      } else record[key] = operand.value;
    }
    if (node.openAttributes?.length) {
      const bag = (record.$attributes ??= []) as DirectApplicationValue[];
      for (const attribute of node.openAttributes) {
        check(); budget.chargeWork(128 + attribute.value.length * 4);
        const entry = Object.create(null) as Record<string, DirectApplicationValue>;
        entry[attribute.name.local] = attribute.name.namespace ? {$namespace: attribute.name.namespace, $value: attribute.value} : attribute.value;
        bag.push(entry);
        attributeIdentities.set(entry, attribute.name);
      }
    }
    if (Array.isArray(record.$attributes)) {
      const identity = (entry: DirectApplicationValue): string => {
        const name = attributeIdentities.get(entry)!;
        return JSON.stringify([name.namespace, name.local]);
      };
      record.$attributes = budget.sorted([...record.$attributes], (a, b) => budget.compareText(identity(a), identity(b)));
    }
    const children: Frame[] = [];
    if (node.text) children.push({node: node.text, set: value => {record.$value = value;}});
    if (node.content) {
      const content: DirectApplicationValue[] = []; record.$content = content;
      for (const item of node.content) {
        check(); budget.chargeWork(128 + item.declaration.name.local.length * 4 + item.declaration.name.namespace.length * 4);
        children.push({node: item, scope: node.namespaces ?? scope, set: value => {
          if (item.kind === 'mixed-text') {
            const text = value as string;
            if (!text) return;
            const last = content.at(-1);
            if (last && typeof last === 'object' && !Array.isArray(last) && Object.hasOwn(last, '$value')) {
              (last as Record<string, DirectApplicationValue>).$value = String((last as Record<string, DirectApplicationValue>).$value) + text;
            } else content.push({$value: text});
          } else if (node.keyed) {
            const entry = Object.create(null) as Record<string, DirectApplicationValue>;
            if (item.kind === 'unassessed') {entry[item.payload.name.local] = value; content.push(entry); return;}
            if (node.namespaceChoices?.includes(item.declaration.name.local) || node.dynamicDeclarations?.includes(item.declaration)) {
              if (item.kind === 'scalar') value = {$namespace: item.declaration.name.namespace, $value: value};
              // @why Records publish their owned container before child frames fill it; preserve that reference.
              else (value as Record<string, DirectApplicationValue>).$namespace = item.declaration.name.namespace;
            }
            entry[item.declaration.name.local] = value;
            content.push(entry);
          } else content.push({name: {...item.declaration.name}, value});
        }});
      }
    }
    for (const {slot, items} of node.slots) {
      check(); const key = slot.element.name.local;
      budget.chargeWork(64 + key.length * 4);
      if (slot.particle.occurs.max === 'unbounded') {
        const values: DirectApplicationValue[] = []; record[key] = values;
        for (const item of items) {check(); budget.chargeWork(128); children.push({node: item, scope: node.namespaces ?? scope, set: value => {values.push(value);}});}
      } else if (items.length) {
        if (items.length !== 1) throw new TypeError('Invalid projection singleton boundary');
        budget.chargeWork(128);
        children.push({node: items[0]!, scope: node.namespaces ?? scope, set: value => {record[key] = value;}});
      }
    }
    for (let i = children.length - 1; i >= 0; i--) {check(); frames.push(children[i]!);}
  }
  if (result === undefined) throw new TypeError('Missing projection root');
  return result;
}

/** Validate scalar operands and retain nested application records without claiming source or operation admission. */
export function assessProjectionScalars(context: SemanticContext, supplied: unknown, options: Options = {}): ProjectionValueReceipt | DirectValueFailure {
  const structural = inspectProjectionStructuralMatch(supplied, context);
  return runContext(context, options, s => {
    const operands: DirectAssessedScalar[] = [];
    for (const duty of structural.occurrences) {s.check(); operands.push(scalar(duty, s, context));}
    const value = projectValue(structural.tree, operands, s);
    const receipt = s.publish({kind: 'projection-value' as const, scope: 'direct-structure-and-scalars' as const, admitted: false as const,
      root: structural.root, contextId: context.contextId, structural, operands, value});
    projectionValues.set(receipt, context);
    return receipt;
  });
}
export function assessDirectScalars(contract: DirectOperationContract, match: unknown, options: Options = {}): DirectValueReceipt | DirectValueFailure {
  const structural = inspectDirectStructuralMatch(match, contract);
  return run(contract, options, s => {
     s.check();
    const mapping = mappingFor(contract, structural.direction, s);
    if (mapping.root !== structural.root) throw new TypeError('Foreign direct root');
    return assessed(contract, structural, mapping, s);
  });
}
/**
 * Construct fresh ordered syntax without coercion, defaults or field removal.
 * @remarks maxItems counts scalar/simple-content roots, member elements, present attributes and list array items, excluding a record document wrapper.
 *   Repeated members each count; pending descendants reserve their item count before allocation.
 *   Native structural and scalar owners must validate the result before any successful expansion is issued.
 */
function buildProjectionPayload(context: SemanticContext, root: ElementNode, plan: DirectProjectionPlan, application: unknown, options: Options, s: Session): SyntaxElement {
    const {budget, check} = s;
    const invalid = (rule: string, path = '/value', element = root): never => {throw new Stop('value-invalid', rule, element.context.source.path, path);};
    let textUnits = 0, items = 0;
    const maxItems = options.maxItems ?? directLimit(budget, DIRECT_VALUE_LIMITS.maxItems);
    const maxText = options.maxText ?? directLimit(budget, DIRECT_VALUE_LIMITS.maxText);
    if (![maxItems, maxText].every(value => Number.isSafeInteger(value) && value >= 0)) throw new RangeError('Application value limits must be nonnegative safe integers');
    const data = (object: object, key: PropertyKey, path: string, element: ElementNode): unknown => {
     check();
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable && !(Array.isArray(object) && key === 'length')) return invalid('own-data-property', path, element);
      return descriptor.value;
    };
    const keys = (object: object, maximum: number, path: string, element: ElementNode): PropertyKey[] => {
      // Refuse extra keys without traversal. Reflect.ownKeys still allocates its
      // intrinsic vector before we can inspect its size; no hard heap bound is claimed.
     check();
      const result = Reflect.ownKeys(object);
      if (result.length > maximum) return invalid('unknown-key', path, element);
      return result;
    };
    const spelling = (value: unknown, builtin: ExpandedName, path: string, element: ElementNode, retainLexical?: true, list?: ProjectionScalarList): string => {
     check();
      if (list && !retainLexical) {
        if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return invalid('dense-list-array-required', path, element);
        const length = data(value, 'length', path, element) as number;
        if (length > maxItems - items) throw new Stop('resource-limit', 'application item limit');
        const own = keys(value, length + 1, path, element);
        if (own.length !== length + 1) return invalid('dense-list-array-required', path, element);
        items += length;
        const parts: string[] = []; let units = 0;
        for (let index = 0; index < length; index++) {
          check(); const memberPath = `${path}/${index}`;
          const raw = spelling(data(value, String(index), memberPath, element), list.builtin, memberPath, element, list.retainLexical);
          budget.chargeWork(64 + raw.length * 4);
          const normalized = normalizeWhitespace(raw, list.whitespace);
          if (!normalized || /[\t\r\n ]/.test(normalized)) return invalid('list-item-token-required', memberPath, element);
          units += normalized.length; parts.push(normalized);
        }
        budget.chargeWork(64 + units * 2 + length * 2);
        return parts.join(' ');
      }
      if (retainLexical || projectionScalarRepresentation(builtin) === 'string') {
        if (typeof value !== 'string') return invalid('string-required', path, element);
        if (value.length > maxText - textUnits) throw new Stop('resource-limit', 'application text limit');
        textUnits += value.length;
         return value;
      }
      if (builtin.local === 'boolean') {
        if (typeof value !== 'boolean') return invalid('boolean-required', path, element);
        return value ? 'true' : 'false';
      }
      if (typeof value !== 'number' || !Number.isInteger(value)) return invalid('integer-number-required', path, element);
      // Range and XML lexical validity are checked by the same neutral core below.
       return String(value === 0 ? 0 : value);
    };
    const lexical = (value: unknown, path: string, element: ElementNode): string => {
      const text = spelling(value, {namespace: XSD_NAMESPACE, local: 'string'}, path, element);
      if (!isXmlCharacters(text)) return invalid('xml-characters', path, element);
      return text;
    };
    const source = (path: string): SyntaxSource => {

      return {uri: 'urn:typescript-wsdl-client:generated-direct-value', digest: '', path,
        start: {offset: 0, line: 0, column: 0}, end: {offset: 0, line: 0, column: 0}};
    };
    const leaf = (name: ExpandedName, lexical: string, path: string): SyntaxElement => {
     check();
      return {kind: 'element', name, lexicalName: name.local, namespaces: Object.create(null) as Record<string, string>,
        baseUri: 'urn:typescript-wsdl-client:generated-direct-value', attributes: [], source: source(path),
        children: [{kind: 'text', value: lexical, source: source(path + '/text')}]};
    };
    const records = new Map(plan.records.map(record => [record.type.id, record]));
    const wildcardPlans = new Map([[root, plan]]);
    const wildcardValue = (element: ElementNode): DirectProjectionValue => {
      let selected = wildcardPlans.get(element);
      if (!selected) {
        selected = planDirectProjection(context, element, check, () => {throw new Stop('unsupported', 'native-wildcard-target-shape', element.context.source.path);});
        budget.chargeWork(64 + selected.records.length * 64);
        for (const record of selected.records) {check(); if (!records.has(record.type.id)) records.set(record.type.id, record);}
        wildcardPlans.set(element, selected);
      }
      return selected.root;
    };
    const active = new WeakSet<object>();
    const scopeFor = (value: object, inherited: Readonly<Record<string, string>> | undefined, required: boolean, path: string, element: ElementNode) => {
      if (!Object.hasOwn(value, '$namespaces') && required && !inherited) return invalid('namespace-boundary-required', path, element);
      const result = Object.assign(Object.create(null) as Record<string, string>, inherited ?? {xml: XML_NAMESPACE, '': ''});
      if (!Object.hasOwn(value, '$namespaces')) return result;
      const raw = data(value, '$namespaces', path, element);
      if (!raw || typeof raw !== 'object' || types.isProxy(raw) || Array.isArray(raw) || ![null, Object.prototype].includes(Object.getPrototypeOf(raw))) return invalid('namespace-map-required', path, element);
      for (const key of keys(raw, maxItems, path, element)) {
        if (typeof key !== 'string') return invalid('namespace-binding', path, element);
        const namespace = lexical(data(raw, key, path, element), path, element);
        if (!isXmlNamespaceBinding(key, namespace)) return invalid('namespace-binding', path, element);
        budget.chargeWork(64 + key.length * 4 + namespace.length * 4); result[key] = namespace;
      }
      return result;
    };
    type Frame = {kind: 'node'; element: ElementNode; shape: DirectProjectionValue; value: unknown; xmlPath: string; valuePath: string; into: SyntaxNode[]}
      & {scope?: Readonly<Record<string, string>>; identity?: string}
      | {kind: 'open'; name: ExpandedName; element: ElementNode; value: unknown; scope?: Readonly<Record<string, string>>; xmlPath: string; valuePath: string; into: SyntaxNode[]}
      | {kind: 'text'; text: string; xmlPath: string; into: SyntaxNode[]} | {kind: 'leave'; value: object};
    const frames: Frame[] = [];
    const roots: SyntaxNode[] = [];
    const schedule = (pending: Frame[], element: ElementNode, shape: DirectProjectionValue, value: unknown, xmlPath: string, valuePath: string, into: SyntaxNode[], scope?: Readonly<Record<string, string>>, identity?: string) => {
      check();
      if ((shape.kind === 'scalar' || xmlPath !== '/0' || records.get(shape.type)?.content === 'simple') && ++items > maxItems) throw new Stop('resource-limit', 'application item limit');
      pending.push({kind: 'node', element, shape, value, xmlPath, valuePath, into, scope, identity});
    };
    schedule(frames, root, plan.root, application, '/0', '/value', roots);
    while (frames.length) {
      check(); const frame = frames.pop()!;
      if (frame.kind === 'leave') {active.delete(frame.value); continue;}
      if (frame.kind === 'text') {frame.into.push({kind: 'text', value: frame.text, source: source(frame.xmlPath)}); continue;}
      if (frame.kind === 'open') {
        const {element, name, value, valuePath, xmlPath, into} = frame;
        const object = (raw: unknown, maximum: number): {value: object; keys: string[]} => {
          if (!raw || typeof raw !== 'object' || types.isProxy(raw) || Array.isArray(raw) || ![null, Object.prototype].includes(Object.getPrototypeOf(raw))) return invalid('plain-record-required', valuePath, element);
          const own = keys(raw, maximum, valuePath, element);
          if (own.some(key => typeof key !== 'string')) return invalid('unknown-key', valuePath, element);
          return {value: raw, keys: own as string[]};
        };
        const holder = object(value, 4);
        if (holder.keys.some(key => !['$namespace', '$namespaces', '$attributes', '$content'].includes(key))) return invalid('unknown-key', valuePath, element);
        if (!isXmlNCName(name.local) || !isXmlCharacters(name.namespace) || name.namespace === 'http://www.w3.org/2000/xmlns/') return invalid('expanded-name-required', valuePath, element);
        if (data(holder.value, '$namespace', valuePath, element) !== name.namespace) return invalid('element-namespace-required', valuePath, element);
        if (active.has(holder.value)) return invalid('cyclic-value', valuePath, element);
        active.add(holder.value);
        const scope = scopeFor(holder.value, frame.scope, true, valuePath, element);
        const array = (raw: unknown): unknown[] => {
          if (!raw || typeof raw !== 'object' || types.isProxy(raw) || !Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype) return invalid('dense-array-required', valuePath, element);
          const length = data(raw, 'length', valuePath, element) as number;
          if (length > maxItems - items) throw new Stop('resource-limit', 'application item limit');
          if (keys(raw, length + 1, valuePath, element).length !== length + 1) return invalid('dense-array-required', valuePath, element);
          items += length;
          return raw;
        };
        const attributes: SyntaxAttribute[] = [], seen = new Set<string>();
        if (Object.hasOwn(holder.value, '$attributes')) {
          const bag = array(data(holder.value, '$attributes', valuePath, element));
          for (let index = 0; index < bag.length; index++) {
            check(); const entry = object(data(bag, String(index), valuePath, element), 1);
            if (entry.keys.length !== 1) return invalid('attribute-entry-shape', valuePath, element);
            const key = entry.keys[0]!;
            if (!isXmlNCName(key)) return invalid('attribute-name', valuePath, element);
            let member = data(entry.value, key, valuePath, element), namespace = '';
            if (typeof member !== 'string') {
              const identity = object(member, 2);
              if (identity.keys.length !== 2 || !identity.keys.includes('$namespace') || !identity.keys.includes('$value')) return invalid('attribute-holder-shape', valuePath, element);
              const uri = data(identity.value, '$namespace', valuePath, element);
              if (typeof uri !== 'string' || !uri || !isXmlCharacters(uri) || uri === 'http://www.w3.org/2000/xmlns/') return invalid('attribute-namespace', valuePath, element);
              namespace = uri; member = data(identity.value, '$value', valuePath, element);
            }
            const identity = JSON.stringify([namespace, key]);
            if (!namespace && key === 'xmlns') return invalid('attribute-name', valuePath, element);
            if (seen.has(identity)) return invalid('duplicate-attribute', valuePath, element);
            seen.add(identity);
            attributes.push({name: {namespace, local: key}, lexicalName: key, value: lexical(member, valuePath, element)});
          }
        }
        const children: SyntaxNode[] = [];
        into.push({kind: 'element', name, lexicalName: name.local, namespaces: scope, attributes, children, baseUri: 'urn:typescript-wsdl-client:generated-direct-value', source: source(xmlPath)});
        const content = array(data(holder.value, '$content', valuePath, element)), pending: Frame[] = [];
        for (let index = 0; index < content.length; index++) {
          check(); const entry = object(data(content, String(index), valuePath, element), 1);
          if (entry.keys.length !== 1) return invalid('ordered-entry-shape', valuePath, element);
          const key = entry.keys[0]!, member = data(entry.value, key, valuePath, element), at = `${valuePath}/$content/${index}`;
          if (key === '$value') pending.push({kind: 'text', text: lexical(member, at, element), xmlPath: `${xmlPath}/children/${index}`, into: children});
          else {
            const child = object(member, 4), namespace = data(child.value, '$namespace', at, element);
            if (typeof namespace !== 'string') return invalid('element-namespace-required', at, element);
            pending.push({kind: 'open', name: {namespace, local: key}, element, value: member, scope, xmlPath: `${xmlPath}/children/${index}`, valuePath: at, into: children});
          }
        }
        frames.push({kind: 'leave', value: holder.value});
        for (let index = pending.length - 1; index >= 0; index--) frames.push(pending[index]!);
        continue;
      }
      const {element, shape, value, xmlPath, valuePath, into} = frame;
      const nil = !!value && typeof value === 'object' && !types.isProxy(value) && Object.hasOwn(value, '$nil');
      if (nil && (!shape.nillable || shape.constraint?.kind === 'fixed')) return invalid('nil-not-permitted', valuePath, element);
      if (shape.kind === 'scalar' && !nil) {
        into.push(leaf(element.name, spelling(value, shape.builtin, valuePath, element, shape.retainLexical, shape.list), xmlPath));
        continue;
      }
      if (!value || typeof value !== 'object') return invalid('record-required', valuePath, element);
      if (types.isProxy(value)) return invalid('plain-record-required', valuePath, element);
      if (Array.isArray(value)) return invalid('record-required', valuePath, element);
     check();
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return invalid('plain-record-required', valuePath, element);
      if (active.has(value)) return invalid('cyclic-value', valuePath, element);
      active.add(value);
      const record = shape.kind === 'record' ? records.get(shape.type) : {attributes: [], slots: [], text: undefined, ordered: undefined, keyed: undefined, fixedOrder: undefined, contextual: undefined, attributeWildcard: undefined, content: 'empty'};
      if (!record) throw new TypeError('Missing native projection record');

      const declared = new Set<string>();
      if (frame.identity !== undefined) {
        if (data(value, '$namespace', valuePath, element) !== frame.identity) return invalid('element-namespace-required', valuePath, element);
        declared.add('$namespace');
      }
      if (record.contextual) declared.add('$namespaces');
      if (record.attributeWildcard) declared.add('$attributes');
      if (nil) {
        if (data(value, '$nil', valuePath + '/$nil', element) !== true) return invalid('nil-marker-true-required', valuePath, element);
        declared.add('$nil');
      } else if (record.ordered) declared.add('$content');
      else for (const slot of record.slots) {check(); declared.add(slot.element.name.local);}
      for (const attribute of record.attributes) {check(); declared.add(attribute.bag ? '$attributes' : attribute.declaration.name.local);}
      if (record.text && !nil) declared.add('$value');
      for (const key of keys(value, declared.size, valuePath, element)) {
       check(); if (typeof key !== 'string') return invalid('unknown-key', valuePath, element);

        if (!declared.has(key)) return invalid('unknown-key', valuePath, element);
        data(value, key, valuePath, element);
      }

      const children: SyntaxNode[] = [];
      if (record.text && !nil) {
        const path = valuePath + '/$value';
        if (!Object.hasOwn(value, '$value')) return invalid('missing-simple-content', path, element);
        children.push({kind: 'text', value: spelling(data(value, '$value', path, element), record.text.builtin, path, element, record.text.retainLexical, record.text.list), source: source(xmlPath + '/text')});
      }
      const attributes: SyntaxAttribute[] = [];
      if (nil) attributes.push({name: {namespace: 'http://www.w3.org/2001/XMLSchema-instance', local: 'nil'}, lexicalName: 'xsi:nil', value: 'true'});
      const bagValues = new Map<string, unknown>();
      const bagIdentities = new Set<string>();
      if (Object.hasOwn(value, '$attributes')) {
        const path = valuePath + '/$attributes', bag = data(value, '$attributes', path, element);
        if (!bag || typeof bag !== 'object' || types.isProxy(bag) || !Array.isArray(bag) || Object.getPrototypeOf(bag) !== Array.prototype) return invalid('dense-array-required', path, element);
        const length = data(bag, 'length', path, element) as number;
        if (length > maxItems - items) throw new Stop('resource-limit', 'application item limit');
        if (keys(bag, length + 1, path, element).length !== length + 1) return invalid('dense-array-required', path, element);
        items += length;
        for (let index = 0; index < length; index++) {
          const at = `${path}/${index}`, entry = data(bag, String(index), at, element);
          if (!entry || typeof entry !== 'object' || types.isProxy(entry) || Array.isArray(entry)) return invalid('attribute-entry-shape', at, element);
          const own = keys(entry, 1, at, element);
          if (own.length !== 1 || typeof own[0] !== 'string') return invalid('attribute-entry-shape', at, element);
          const key = own[0], candidates = record.attributes.filter(attribute => attribute.bag && attribute.declaration.name.local === key);
          if (!isXmlNCName(key)) return invalid('attribute-name', at, element);
          let member = data(entry, key, at, element);
          let selected = candidates.length === 1 ? candidates[0] : undefined;
          let namespace = selected?.declaration.name.namespace ?? '';
          if (candidates.length > 1 || record.attributeWildcard) {
            namespace = '';
            if (member && typeof member === 'object' && !Array.isArray(member)) {
            if (!member || typeof member !== 'object' || types.isProxy(member) || Array.isArray(member)) return invalid('attribute-namespace-required', at, element);
            const own = keys(member, 2, at, element);
            if (own.length !== 2 || !own.includes('$namespace') || !own.includes('$value')) return invalid('attribute-holder-shape', at, element);
            const uri = data(member, '$namespace', at, element);
            if (typeof uri !== 'string' || !uri || !isXmlCharacters(uri) || uri === 'http://www.w3.org/2000/xmlns/') return invalid('attribute-namespace-required', at, element);
            namespace = uri;
            member = data(member, '$value', at, element);
            }
            selected = candidates.find(candidate => candidate.declaration.name.namespace === namespace);
          }
          const identity = JSON.stringify([namespace, key]);
          if (!namespace && key === 'xmlns') return invalid('attribute-name', at, element);
          if (bagIdentities.has(identity)) return invalid('duplicate-attribute', at, element);
          bagIdentities.add(identity);
          if (!selected && record.attributeWildcard) {
            if (record.attributes.some(attribute => attribute.declaration.name.local === key && attribute.declaration.name.namespace === namespace)) return invalid('duplicate-attribute-channel', at, element);
            const selection = selectProjectionAttribute(context, record, {namespace, local: key}, check,
              () => {throw new Stop('unsupported', 'native-wildcard-attribute-scalar', element.context.source.path, at);});
            if (!selection) return invalid('unknown-attribute', at, element);
            const descriptor = selection.attribute;
            attributes.push({name: {namespace, local: key}, lexicalName: key, value: descriptor
              ? spelling(member, descriptor.builtin, at, element, descriptor.retainLexical, descriptor.list) : lexical(member, at, element)});
            continue;
          }
          if (!selected) return invalid('unknown-attribute', at, element);
          if (bagValues.has(selected.declaration.id)) return invalid('duplicate-attribute', at, element);
          bagValues.set(selected.declaration.id, member);
        }
      }
      for (const attribute of record.attributes) {
        check(); const name = attribute.declaration.name;
        const path = `${valuePath}/${name.local.replaceAll('~', '~0').replaceAll('/', '~1')}`;
        if (attribute.bag ? !bagValues.has(attribute.declaration.id) : !Object.hasOwn(value, name.local)) {
          if (attribute.required) return invalid('missing-attribute', path, element);
          continue;
        }
        if (++items > maxItems) throw new Stop('resource-limit', 'application item limit');
        budget.chargeWork(128 + name.local.length * 4);
        attributes.push({name, lexicalName: name.local, value: spelling(attribute.bag ? bagValues.get(attribute.declaration.id) : data(value, name.local, path, element), attribute.builtin, path, element, attribute.retainLexical, attribute.list)});
      }
      const scope = record.contextual ? scopeFor(value, frame.scope, true, valuePath, element) : frame.scope;
      into.push({kind: 'element', name: element.name, lexicalName: element.name.local,
        namespaces: scope ?? Object.create(null) as Record<string, string>, baseUri: 'urn:typescript-wsdl-client:generated-direct-value',
        attributes, source: source(xmlPath), children});
      if (nil) {active.delete(value); continue;}
      const pending: Frame[] = [];
      if (record.ordered) {
        const path = `${valuePath}/$content`;
        if (!Object.hasOwn(value, '$content')) return invalid('missing-ordered-content', path, element);
        const content = data(value, '$content', path, element);
        if (!content || typeof content !== 'object' || types.isProxy(content) || !Array.isArray(content) || Object.getPrototypeOf(content) !== Array.prototype) return invalid('dense-array-required', path, element);
        const length = data(content, 'length', path, element) as number;
        if (length > maxItems - items) throw new Stop('resource-limit', 'application item limit');
        if (keys(content, length + 1, path, element).length !== length + 1) return invalid('dense-array-required', path, element);
        const object = (input: unknown, at: string, fields: readonly string[]): object => {
          if (!input || typeof input !== 'object' || types.isProxy(input) || Array.isArray(input)) return invalid('plain-record-required', at, element);
          const proto: unknown = Object.getPrototypeOf(input);
          if (proto !== Object.prototype && proto !== null) return invalid('plain-record-required', at, element);
          const own = keys(input, fields.length, at, element);
          if (own.length !== fields.length || own.some(key => {check(); return typeof key !== 'string' || !fields.includes(key);})) return invalid('ordered-entry-shape', at, element);
          return input;
        };
        let fixedIndex = 0;
        for (let index = 0; index < length; index++) {
          check(); const at = `${path}/${index}`;
          if (record.keyed) {
            const raw = data(content, String(index), at, element);
            if (!raw || typeof raw !== 'object' || types.isProxy(raw) || Array.isArray(raw)) return invalid('ordered-entry-shape', at, element);
            const own = keys(raw, 1, at, element);
            if (own.length !== 1 || typeof own[0] !== 'string') return invalid('ordered-entry-shape', at, element);
            const key = own[0], entry = object(raw, at, [key]);
            const member = data(entry, key, at, element);
            if (key === '$value') {
              if (record.content !== 'mixed') return invalid('complex-text', at, element);
              const text = lexical(member, at, element);
              if (++items > maxItems) throw new Stop('resource-limit', 'application item limit');
              // @why Schedule text with elements so mixed positions survive the iterative construction order.
              pending.push({kind: 'text', text, xmlPath: `${xmlPath}/children/${index}`, into: children});
              continue;
            }
            const slots = record.slots.filter(slot => slot.element.name.local === key);
            let selectedValue = member;
            let selectedIdentity: string | undefined;
            let slot = record.fixedOrder ? record.slots[fixedIndex++] : slots.length === 1 ? slots[0] : undefined;
            if (record.fixedOrder && slot?.element.name.local !== key) return invalid('ordered-particle-language', at, element);
            if (!record.fixedOrder && slot && member && typeof member === 'object' && !types.isProxy(member) && !Array.isArray(member) && Object.hasOwn(member, '$namespace')
              && data(member, '$namespace', at, element) !== slot.element.name.namespace) slot = undefined;
            if (!record.fixedOrder && slots.length > 1) {
              if (!member || typeof member !== 'object' || types.isProxy(member) || Array.isArray(member)) return invalid('element-namespace-required', at, element);
              const namespace = data(member, '$namespace', at, element);
              slot = slots.find(candidate => candidate.element.name.namespace === namespace);
              if (!slot) return invalid('unknown-ordered-element', at, element);
              if (slot.value.kind === 'scalar') {
                if (Object.hasOwn(member, '$nil')) {
                  object(member, at, ['$namespace', '$nil']);
                  selectedValue = {$nil: data(member, '$nil', at, element)};
                } else {
                  object(member, at, ['$namespace', '$value']);
                  selectedValue = data(member, '$value', at, element);
                }
              } else {
                selectedIdentity = namespace as string;
              }
            }
            if (!slot) {
              if (!isXmlNCName(key) || !member || typeof member !== 'object' || types.isProxy(member) || Array.isArray(member)) return invalid('unknown-ordered-element', at, element);
              const namespace = data(member, '$namespace', at, element);
              if (typeof namespace !== 'string') return invalid('element-namespace-required', at, element);
              const selected = selectProjectionWildcard(context, record, {namespace, local: key}, check);
              if (!selected) return invalid('unknown-ordered-element', at, element);
              if (!selected.element) {
                // @why Nested open entries count through their parent array; this assessed-to-open boundary has no such parent charge.
                if (++items > maxItems) throw new Stop('resource-limit', 'application item limit');
                pending.push({kind: 'open', name: {namespace, local: key}, value: member, element, scope, xmlPath: `${xmlPath}/children/${index}`, valuePath: at, into: children});
              }
              else {
                const shape = wildcardValue(selected.element);
                const selectedValue = shape.kind === 'scalar' ? (() => {
                  if (Object.hasOwn(member, '$nil')) {
                    object(member, at, ['$namespace', '$nil']);
                    return {$nil: data(member, '$nil', at, element)};
                  }
                  object(member, at, ['$namespace', '$value']);
                  return data(member, '$value', at, element);
                })() : member;
                schedule(pending, selected.element, shape, selectedValue, `${xmlPath}/children/${index}`, at, children, scope, shape.kind === 'record' ? namespace : undefined);
              }
              continue;
            }
            schedule(pending, slot.element, slot.value, selectedValue, `${xmlPath}/children/${index}`, at + '/' + key, children, scope, selectedIdentity);
            continue;
          }
          const entry = object(data(content, String(index), at, element), at, ['name', 'value']);
          const name = object(data(entry, 'name', at + '/name', element), at + '/name', ['namespace', 'local']);
          const namespace = data(name, 'namespace', at + '/name/namespace', element), local = data(name, 'local', at + '/name/local', element);
          if (typeof namespace !== 'string' || typeof local !== 'string') return invalid('expanded-name-required', at + '/name', element);
          budget.chargeWork(64 + namespace.length * 4 + local.length * 4);
          const slot = record.slots.find(item => {check(); return item.element.name.namespace === namespace && item.element.name.local === local;});
          const selected = slot?.element ?? resolveProjectionWildcard(context, record, {namespace, local}, check);
          if (!selected) return invalid('unknown-ordered-element', at, element);
          schedule(pending, selected, slot?.value ?? wildcardValue(selected), data(entry, 'value', at + '/value', element), `${xmlPath}/children/${index}`, at + '/value', children, scope);
        }
      } else for (const slot of record.slots) {
       check();
        const key = slot.element.name.local;
        const memberPath = `${valuePath}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
        if (!Object.hasOwn(value, key)) {
          if (slot.particle.occurs.max === 'unbounded' || slot.particle.occurs.min === '1') return invalid('missing-member', memberPath, slot.element);
          continue;
        }
        const member = data(value, key, memberPath, slot.element);
        const append = (item: unknown, path: string) => {
          check(); schedule(pending, slot.element, slot.value, item, `${xmlPath}/children/${pending.length}`, path, children, scope);
        };
        if (slot.particle.occurs.max === 'unbounded') {
          if (types.isProxy(member) || !Array.isArray(member) || Object.getPrototypeOf(member) !== Array.prototype) return invalid('dense-array-required', memberPath, slot.element);
          const length = data(member, 'length', memberPath, slot.element) as number;
          if (length > maxItems - items) throw new Stop('resource-limit', 'application item limit');
          if (slot.particle.occurs.min === '1' && length === 0) return invalid('required-repetition', memberPath, slot.element);
          // Check actual repetition length before key enumeration or inverse construction.

          const own = keys(member, length + 1, memberPath, slot.element);
          if (own.length !== length + 1) return invalid('dense-array-required', memberPath, slot.element);
          for (let i = 0; i < length; i++) {check(); const path = `${memberPath}/${i}`; append(data(member, String(i), path, slot.element), path);}
        } else append(member, memberPath);
      }
      frames.push({kind: 'leave', value});
      for (let i = pending.length - 1; i >= 0; i--) {check(); frames.push(pending[i]!);}
    }
    const payload = roots[0];
    if (!payload || payload.kind !== 'element') throw new TypeError('Missing projection payload');
    return payload;
}

/** Validate structured application values with the same native structural/scalar owners, without operation admission. */
export function expandProjectionValue(context: SemanticContext, root: ElementNode, application: unknown, options: Options = {}): ProjectionExpandedValue | DirectValueFailure {
  return runContext(context, options, s => {
    const plan = planDirectProjection(context, root, s.check, () => {throw new Stop('unsupported', 'native-direct-shape');});
    const payload = buildProjectionPayload(context, root, plan, application, options, s);
    const structural = matchDirectProjection(context, root, payload, options);
    if (structural.kind !== 'projection-match') {
      if (structural.kind === 'mismatch') {
        if (structural.rule === 'ordered-particle-language') throw new Stop('value-invalid', structural.rule, structural.schemaPath, structural.payloadPath);
        throw new Error('Internal projection expansion violated its source mapping');
      }
      throw new Stop(structural.kind, structural.rule, structural.schemaPath, structural.payloadPath);
    }
    const validated = assessProjectionScalars(context, structural, options);
    if (validated.kind !== 'projection-value') throw new Stop(validated.kind, validated.rule, validated.schemaPath, validated.payloadPath);
    const expanded = s.publish({kind: 'projection-expanded' as const, provenance: 'generated-direct-value' as const, admitted: false as const, payload, validated});
    projectionExpansions.set(expanded, context);
    return expanded;
  });
}

/** Pure shape validation plus lexical reconstruction, followed by existing validators. */
export function expandDirectValue(contract: DirectOperationContract, suppliedMapping: unknown, application: unknown, options: Options = {}): DirectExpandedValue | DirectValueFailure {
  const mapping = inspectDirectValueMapping(suppliedMapping, contract);
  return run(contract, options, s => {
    const plan = mappingProjections.get(mapping);
    if (!plan) throw new TypeError('Missing native mapping projection');
    const payload = buildProjectionPayload(inspectDirectOperation(contract).context, mapping.root.element, plan, application, options, s);
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
