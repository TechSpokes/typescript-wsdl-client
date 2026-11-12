/** Explicit buffered companion-record projection; wrapper and record source contexts never merge. */
import {inspectDirectOperation} from './directOperation.js';
import type {DirectOperationContract, DirectMessageRoot} from './directOperation.js';
import {createComponentValueMapping, inspectComponentValueMapping, expandProjectionValue} from './directValues.js';
import type {ComponentValueMapping, DirectApplicationValue, ProjectionValueReceipt} from './directValues.js';
import {observeComponentXml, assertComponentObservedPayload, assessObservedComponentPayload} from './directCodec.js';
import type {ComponentDecodedXml, ComponentXmlObservation, DirectCodecFailure, DirectXmlLimits} from './directCodec.js';
import {deriveActualComplexContent} from './complexTypeContent.js';
import {prepareSemanticParticleView} from './particleSemanticView.js';
import {checkDeclaredParticleLegality} from './particleLocalAssessment.js';
import {assessSourceAttributeUses} from './schemaAttributeUses.js';
import {assessStandardSchemaElement} from './standardSchemaComponents.js';
import type {StandardSchemaElementDeclaration} from './standardSchemaComponents.js';
import {namespaceAllows} from './wildcardAlgebra.js';
import type {NamespaceConstraint} from './wildcardAlgebra.js';
import {directDataOwnership} from './directExecutionPolicy.js';
import {createPayloadDiagnostic, diagnosticName} from './payloadDiagnostics.js';
import {DataOwnershipLimitError} from './dataOwnership.js';
import {isXmlNCName, syntaxElements} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';
import type {ResolverUsage} from './semanticBudget.js';
import type {DirectProjectionValue} from './directStructurePlan.js';

export interface ComponentRecordProjectionSpec {
  readonly version: 'component-record-scope-v1';
  readonly scope: 'records-with-declared-wrapper-scope';
  /** Relative to the outer WSDL output element; the current family supports one direct wildcard boundary. */
  readonly payloadPath: readonly ExpandedName[];
  /** Relative to the companion output element; every step must select a unique declared native slot. */
  readonly recordPath: readonly ExpandedName[];
  /** Metadata is omitted; the wildcard is assessed in the explicit companion universe, not a merged wrapper universe. */
  readonly opaqueExclusions: readonly Readonly<{path: readonly ExpandedName[];
    reason: 'standard-schema-metadata' | 'wrapper-declaration-universe'}>[];
}
/** Explicit acknowledgement of the existing scope, with a record path only when it is a real choice.
 * @since 1.1.7
 */
export interface ComponentRecordProjectionAssociation {
  readonly scope: 'records-with-declared-wrapper-scope';
  readonly recordPath?: readonly ExpandedName[];
}
export interface ComponentRecordProjection {
  readonly kind: 'component-record-projection'; readonly version: 'component-record-scope-v1';
  readonly direction: Readonly<{kind: 'output'}>; readonly root: DirectMessageRoot;
  readonly contextId: string; readonly admitted: false; readonly spec: ComponentRecordProjectionSpec;
  readonly usage: ResolverUsage;
}
export interface ComponentRecordValue {
  readonly kind: 'component-record-value'; readonly scope: 'records-with-declared-wrapper-scope';
  readonly admitted: false; readonly value: DirectApplicationValue; readonly recordCount: number;
  readonly companion: ProjectionValueReceipt;
}
export interface ComponentRecordDecodedXml {
  readonly kind: 'component-record-decoded'; readonly admitted: false;
  readonly payload: SyntaxElement; readonly mapping: ComponentRecordProjection; readonly validated: ComponentRecordValue;
  readonly usage: ResolverUsage;
}
type Leaf = Readonly<{kind: 'standard'; declaration: StandardSchemaElementDeclaration; optional: boolean} |
  {kind: 'boundary'; namespace: NamespaceConstraint}>;
type Owned = Readonly<{outer: DirectOperationContract; companion: DirectOperationContract;
  parser: ComponentValueMapping; mapping: ComponentValueMapping; leaves: readonly Leaf[]}>;
const issued = new WeakMap<ComponentRecordProjection, Owned>();
const values = new WeakMap<ComponentRecordValue, ComponentRecordProjection>();
/** Identity-only dispatch; inspecting an unowned object's fields cannot select this mapping profile. */
export function isComponentRecordProjection(value: unknown): value is ComponentRecordProjection {
  return !!value && typeof value === 'object' && issued.has(value as ComponentRecordProjection);
}
class ScopeStop extends Error {constructor(readonly kind: DirectCodecFailure['kind'], readonly rule: string) {super(rule);}}
const same = (a: ExpandedName, b: ExpandedName) => a.namespace === b.namespace && a.local === b.local;
const ownKeys = (value: object, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

/** Build an explicit mapping from independently qualified native contracts.
 * @remarks The current wrapper family is a unit sequence of fixed standard metadata elements and one strict
 *   wildcard. Native occurrence/EDC/UPA checks remain authoritative. The complete companion payload is retained;
 *   record paths establish intended record declarations, not permission to discard other payload fields.
 *   This is a buffered projection, not full-response XSD validation in a merged declaration universe or streaming.
 * @returns An exact native projection or a specific unsupported/value/resource/cancellation result.
 */
export function createComponentRecordProjection(outer: DirectOperationContract, companion: DirectOperationContract,
  supplied: ComponentRecordProjectionSpec | ComponentRecordProjectionAssociation, options: Readonly<{signal?: AbortSignal}> = {}): ComponentRecordProjection | DirectCodecFailure {
  const {context} = inspectDirectOperation(outer); inspectDirectOperation(companion);
  const {budget} = context;
  const check = () => {budget.chargeWork(); if (options.signal?.aborted) throw new ScopeStop('cancelled', 'cooperative-cancellation');};
  const stop: (rule: string) => never = rule => {throw new ScopeStop('unsupported', rule);};
  const failure = (kind: DirectCodecFailure['kind'], rule: string): DirectCodecFailure => Object.freeze({kind, rule, usage: Object.freeze({...budget.usage()})});
  try {
    const result = budget.guard(() => {
      check();
      if ('parts' in outer.output || 'parts' in companion.output) return failure('unsupported', 'record-projection-requires-document-output');
      if (outer.basis !== 'native-component-premises-v1' || companion.basis !== 'native-component-premises-v1'
        || outer.correspondence !== 'dated-XSD-2004-components-v1' || companion.correspondence !== 'dated-XSD-2004-components-v1') stop('component-record-source-authority');
      const requested = directDataOwnership(budget).freeze(directDataOwnership(budget).snapshot(supplied, check));
      const association = requested && typeof requested === 'object' && !Object.hasOwn(requested, 'version');
      if (association && (requested.scope !== 'records-with-declared-wrapper-scope'
        || !ownKeys(requested, Object.hasOwn(requested, 'recordPath') ? ['scope', 'recordPath'] : ['scope'])))
        throw new ScopeStop('value-invalid', 'explicit-component-record-scope');
      let spec: ComponentRecordProjectionSpec = association ? {version: 'component-record-scope-v1', scope: requested.scope,
        payloadPath: [companion.output.element.name], recordPath: requested.recordPath ?? [], opaqueExclusions: []} : requested as ComponentRecordProjectionSpec;
      const validName = (name: ExpandedName) => name && typeof name === 'object' && ownKeys(name, ['namespace', 'local'])
        && typeof name.namespace === 'string' && typeof name.local === 'string' && isXmlNCName(name.local);
      const path = (names: readonly ExpandedName[]) => Array.isArray(names) && names.length > 0 && names.every(validName);
      if (!spec || typeof spec !== 'object' || !ownKeys(spec, ['version', 'scope', 'payloadPath', 'recordPath', 'opaqueExclusions'])
        || spec.version !== 'component-record-scope-v1' || spec.scope !== 'records-with-declared-wrapper-scope'
        || !path(spec.payloadPath) || spec.payloadPath.length !== 1 || !(association && !Object.hasOwn(requested, 'recordPath') || path(spec.recordPath))
        || !Array.isArray(spec.opaqueExclusions) || !spec.opaqueExclusions.every(item => item && typeof item === 'object'
          && ownKeys(item, ['path', 'reason']) && path(item.path) && item.path.length === 1
          && ['standard-schema-metadata', 'wrapper-declaration-universe'].includes(item.reason)))
        throw new ScopeStop('value-invalid', 'explicit-component-record-scope');
      if (!same(spec.payloadPath[0]!, companion.output.element.name)) stop('companion-output-payload-path');
      const parser = createComponentValueMapping(outer, {kind: 'input'}, options);
      if (parser.kind !== 'component-mapping') return parser;
      const mapping = createComponentValueMapping(companion, {kind: 'output'}, options);
      if (mapping.kind !== 'component-mapping') return mapping;
      const projection = inspectComponentValueMapping(mapping, companion).projection;
      if (!projection) return failure('unsupported', 'record-projection-requires-document-mapping');
      const records = new Map(projection.records.map(record => [record.type.id, record]));
      if (association && !Object.hasOwn(requested, 'recordPath')) {
        const candidates: (readonly ExpandedName[])[] = [];
        let recursive = false;
        const pending: {value: DirectProjectionValue; prefix: readonly ExpandedName[]; ancestors: ReadonlySet<string>}[] = [
          {value: projection.root, prefix: [], ancestors: new Set()},
        ];
        while (pending.length) {
          check(); const {value, prefix, ancestors} = pending.pop()!;
          if (value.kind !== 'record') continue;
          if (ancestors.has(value.type)) {recursive = true; continue;}
          const record = records.get(value.type); if (!record) stop('record-path-native-record');
          const next = new Set(ancestors); next.add(value.type);
          for (const slot of record.slots) {
            check(); const path = [...prefix, slot.element.name];
            if (slot.value.kind === 'record' && slot.particle.occurs.max !== '1') candidates.push(path);
            pending.push({value: slot.value, prefix: path, ancestors: next});
          }
        }
        if (!recursive && !candidates.length) stop('record-path-complex-repeated-declaration');
        if (recursive || candidates.length !== 1) stop(`ambiguous-record-path: supply recordPath selecting one repeated complex declaration; candidates=${JSON.stringify(candidates)}; recursive=${recursive}`);
        spec = {...spec, recordPath: candidates[0]!};
      }
      let value: DirectProjectionValue = projection.root;
      for (let index = 0; index < spec.recordPath.length; index++) {
        check();
        if (value.kind !== 'record') stop('record-path-record-parent');
        const record = records.get(value.type);
        if (!record) stop('record-path-native-record');
        const slots = record.slots.filter(slot => {check(); return same(slot.element.name, spec.recordPath[index]!);});
        if (slots.length !== 1) stop('record-path-unique-declaration');
        value = slots[0]!.value;
        if (index === spec.recordPath.length - 1 && (value.kind !== 'record' || slots[0]!.particle.occurs.max === '1'))
          stop('record-path-complex-repeated-declaration');
      }
      const root = outer.output.element;
      if (root.nillable || root.abstract || root.value || root.substitutionGroup) stop('record-wrapper-declaration');
      const type = context.resolve(root.type);
      if (type.kind !== 'found' || type.node.kind !== 'complexType' || type.node.abstract || type.node.mixed) stop('record-wrapper-complex-type');
      const attributes = assessSourceAttributeUses(context, type.node.id);
      if (attributes.kind === 'resource-limit') return failure('resource-limit', 'record-wrapper-attributes');
      if (attributes.kind !== 'checked' || attributes.value.wildcard || attributes.value.attributes.length) stop('record-wrapper-attribute-scope');
      const content = deriveActualComplexContent(context, type.node.id);
      if (content.kind === 'resource-limit') return failure('resource-limit', 'record-wrapper-content');
      if (content.kind !== 'checked' || content.view.content.kind !== 'element-only') stop('record-wrapper-content');
      const prepared = prepareSemanticParticleView(context, content.view, 'declared');
      if (prepared.kind === 'resource-limit') return failure('resource-limit', 'record-wrapper-particle');
      if (prepared.kind !== 'checked') stop('record-wrapper-particle');
      const legal = checkDeclaredParticleLegality(context, prepared.view);
      if (legal.kind === 'resource-limit') return failure('resource-limit', 'record-wrapper-particle-legality');
      if (legal.kind !== 'checked' || !legal.value) stop('record-wrapper-particle-legality');
      const leaves: Leaf[] = [], pending = [prepared.view.root];
      let boundaries = 0;
      while (pending.length) {
        check(); const particle = pending.pop()!;
        // @why Only metadata may be absent, and only when the authenticated source declares it optional.
        if (particle.occurs.max !== '1' || (particle.occurs.min !== '1'
          && !(particle.standardElement && particle.occurs.min === '0'))) stop('record-wrapper-unit-occurrence');
        if (particle.kind === 'sequence') for (let index = particle.children.length - 1; index >= 0; index--) {check(); pending.push(particle.children[index]!);}
        else if (particle.standardElement) leaves.push(Object.freeze({kind: 'standard', declaration: particle.standardElement, optional: particle.occurs.min === '0'}));
        else if (particle.kind === 'any' && particle.wildcard?.processContents === 'strict') {
          if (++boundaries > 1 || !namespaceAllows(particle.wildcard.namespace, spec.payloadPath[0]!.namespace, budget.chargeWork)) stop('record-wrapper-wildcard-boundary');
          leaves.push(Object.freeze({kind: 'boundary', namespace: particle.wildcard.namespace}));
        } else stop('record-wrapper-terminal-scope');
      }
      if (boundaries !== 1) stop('record-wrapper-one-boundary');
      const metadata = leaves.filter((leaf): leaf is Extract<Leaf, {kind: 'standard'}> => leaf.kind === 'standard');
      if (association) spec = {...spec, opaqueExclusions: [
        ...metadata.map(leaf => ({path: [leaf.declaration.name], reason: 'standard-schema-metadata' as const})),
        {path: spec.payloadPath, reason: 'wrapper-declaration-universe'},
      ]};
      const exclusions = spec.opaqueExclusions.filter(item => item.reason === 'standard-schema-metadata');
      const universes = spec.opaqueExclusions.filter(item => item.reason === 'wrapper-declaration-universe');
      if (metadata.length !== exclusions.length || metadata.some(leaf =>
        exclusions.filter(item => same(item.path[0]!, leaf.declaration.name)).length !== 1)
        || universes.length !== 1 || !same(universes[0]!.path[0]!, spec.payloadPath[0]!)) stop('record-wrapper-explicit-exclusions');
      check();
      const result: ComponentRecordProjection = Object.freeze({kind: 'component-record-projection', version: 'component-record-scope-v1',
        direction: Object.freeze({kind: 'output'}), root: outer.output, contextId: outer.contextId, admitted: false, spec: directDataOwnership(budget).freeze(spec),
        usage: Object.freeze({...budget.usage()})});
      issued.set(result, Object.freeze({outer, companion, parser, mapping, leaves: Object.freeze(leaves)}));
      return result;
    });
    return result.kind === 'resource-limit' && !('rule' in result) ? failure('resource-limit', 'record-projection-budget') : result;
  } catch (error) {
    if (budget.exhausted()) return failure('resource-limit', 'record-projection-budget');
    if (error instanceof DataOwnershipLimitError) return failure('resource-limit', error.message);
    if (error instanceof ScopeStop) return failure(error.kind, error.rule);
    throw error;
  }
}

/** Native projection identity and exact outer contract are checked before reading projection fields. */
export function inspectComponentRecordProjection(projection: ComponentRecordProjection, outer?: DirectOperationContract): Owned {
  const owned = issued.get(projection);
  if (!owned || outer !== undefined && owned.outer !== outer) throw new TypeError('Native matching component record projection required');
  inspectDirectOperation(owned.outer); inspectDirectOperation(owned.companion);
  return owned;
}
export function inspectComponentRecordValue(value: ComponentRecordValue, projection: ComponentRecordProjection): ComponentRecordValue {
  inspectComponentRecordProjection(projection);
  if (values.get(value) !== projection) throw new TypeError('Native matching component record value required');
  return value;
}

/** Revalidate the projected application value, including after JSON serialization.
 * @remarks This uses the exact companion's existing inverse and scalar/structure owners. It establishes only
 *   projected-value validity; it cannot reconstruct or certify omitted wrapper metadata or SOAP protocol state.
 */
export function validateComponentRecordApplication(projection: ComponentRecordProjection, application: unknown,
  options: Readonly<{signal?: AbortSignal; maxText?: number; maxItems?: number}> = {}): ReturnType<typeof expandProjectionValue> {
  const owned = inspectComponentRecordProjection(projection), {context} = inspectDirectOperation(owned.companion);
  if ('parts' in owned.mapping.root) throw new TypeError('Record projection requires a document mapping');
  return expandProjectionValue(context, owned.mapping.root.element, application, options);
}

/** Decode once and validate the declared wrapper plus its explicitly selected companion payload.
 * @remarks The complete companion value survives; only declared standard metadata is omitted. This function
 *   does not validate SOAP protocol grammar itself. Its protocol selector can choose only this projection or
 *   an actual declared fault mapping of the outer contract, always on nodes from the same parse.
 */
export function decodeComponentRecordXml(outer: DirectOperationContract, projection: ComponentRecordProjection, bytes: Uint8Array,
  options: Readonly<{signal?: AbortSignal; limits?: DirectXmlLimits; uri?: string; componentResponseEncoding?: {charset?: string};
    selectPayload?: (root: SyntaxElement) => {payload: SyntaxElement; mapping: ComponentRecordProjection | ComponentValueMapping}}> = {}):
  ComponentRecordDecodedXml | ComponentDecodedXml | DirectCodecFailure {
  const owned = inspectComponentRecordProjection(projection, outer), {context} = inspectDirectOperation(outer), {budget} = context;
  const check = () => {budget.chargeWork(); if (options.signal?.aborted) throw new ScopeStop('cancelled', 'cooperative-cancellation');};
  const failure = (kind: DirectCodecFailure['kind'], rule: string): DirectCodecFailure => Object.freeze({kind, rule, usage: Object.freeze({...budget.usage()})});
  try {
    const result = budget.guard(() => {
      check();
      const observation = observeComponentXml(outer, owned.parser, bytes, options);
      if (observation.kind !== 'observed-component-xml') return observation;
      const selected = options.selectPayload?.(observation.root) ?? {payload: observation.root, mapping: projection};
      assertComponentObservedPayload(observation, selected.payload, check);
      if (selected.mapping !== projection) {
        const {mapping} = inspectComponentValueMapping(selected.mapping, outer);
        if (mapping.direction.kind !== 'fault') throw new TypeError('Record projection selection requires this output or a declared fault');
        return assessObservedComponentPayload(outer, mapping, observation, selected.payload, options);
      }
      const wrapper = selected.payload;
      if ('parts' in outer.output) throw new ScopeStop('unsupported', 'record-projection-requires-document-output');
      if (!same(wrapper.name, outer.output.element.name)) throw new ScopeStop('mismatch', 'record-wrapper-root');
      if (wrapper.attributes.length || wrapper.children.some(node => node.kind === 'text' && /[^\t\r\n ]/.test(node.value)))
        throw new ScopeStop('mismatch', 'record-wrapper-attributes-or-text');
      const children = syntaxElements(wrapper);
      const required = owned.leaves.filter(leaf => leaf.kind === 'boundary' || !leaf.optional).length;
      if (children.length < required || children.length > owned.leaves.length) throw new ScopeStop('mismatch', 'record-wrapper-child-count');
      let payload: SyntaxElement | undefined;
      let cursor = 0;
      for (let index = 0; index < owned.leaves.length; index++) {
        check(); const leaf = owned.leaves[index]!, child = children[cursor];
        if (leaf.kind === 'standard' && leaf.optional && (!child || !same(child.name, leaf.declaration.name))) continue;
        if (!child) throw new ScopeStop('mismatch', 'record-wrapper-child-count');
        cursor++;
        if (leaf.kind === 'standard') {
          if (!same(child.name, leaf.declaration.name)) throw new ScopeStop('mismatch', 'record-wrapper-standard-order');
          const assessed = assessStandardSchemaElement(leaf.declaration, child, budget, {signal: options.signal, check});
          if (assessed.kind !== 'schema-element-instance') return failure(assessed.kind, assessed.kind === 'resource-limit' ? 'record-standard-budget' : assessed.rule);
          if (assessed.remaining.length) throw new ScopeStop('unsupported', 'record-standard-instance-obligations');
        } else {
          if (!same(child.name, projection.spec.payloadPath[0]!) || !namespaceAllows(leaf.namespace, child.name.namespace, budget.chargeWork))
            throw new ScopeStop('mismatch', 'record-wrapper-companion-boundary');
          payload = child;
        }
      }
      if (cursor !== children.length) throw new ScopeStop('mismatch', 'record-wrapper-child-count');
      if (!payload) throw new TypeError('Native record boundary unavailable');
      const decoded = assessObservedComponentPayload(owned.companion, owned.mapping, observation, payload, options);
      if (decoded.kind !== 'component-decoded') return decoded;
      if (decoded.validated.kind !== 'projection-value') throw new TypeError('Record projection requires a document value receipt');
      const recordCount = countRecords(observation, payload, projection.spec.recordPath, check);
      const validated: ComponentRecordValue = Object.freeze({kind: 'component-record-value', scope: 'records-with-declared-wrapper-scope',
        admitted: false, value: decoded.validated.value, recordCount, companion: decoded.validated});
      values.set(validated, projection); check();
      return Object.freeze({kind: 'component-record-decoded' as const, admitted: false as const, payload: wrapper, mapping: projection,
        validated, usage: Object.freeze({...budget.usage()})});
    });
    return result.kind === 'resource-limit' && !('rule' in result) ? failure('resource-limit', 'record-projection-budget') : result;
  } catch (error) {
    if (budget.exhausted()) return failure('resource-limit', 'record-projection-budget');
    if (error instanceof ScopeStop) {
      if (error.kind !== 'mismatch' || 'parts' in outer.output) return failure(error.kind, error.rule);
      const declaration = outer.output.element;
      // @constraints Native metadata lookups consume the same budget and retain its terminal resource result.
      const diagnosed = budget.guard(() => {
        const diagnostic = createPayloadDiagnostic(context, declaration,
          '/' + diagnosticName(declaration.name) + '/[unknown-field]', {unknownField: true});
        return Object.freeze({...failure(error.kind, error.rule), diagnostic});
      });
      return diagnosed.kind === 'resource-limit' && !('rule' in diagnosed)
        ? failure('resource-limit', 'record-projection-budget') : diagnosed;
    }
    throw error;
  }
}

function countRecords(observation: ComponentXmlObservation, payload: SyntaxElement, path: readonly ExpandedName[], check: () => void): number {
  assertComponentObservedPayload(observation, payload, check);
  let current: readonly SyntaxElement[] = [payload];
  for (const name of path) {
    const next: SyntaxElement[] = [];
    for (const parent of current) for (const child of syntaxElements(parent)) {check(); if (same(child.name, name)) next.push(child);}
    current = next;
  }
  return current.length;
}
