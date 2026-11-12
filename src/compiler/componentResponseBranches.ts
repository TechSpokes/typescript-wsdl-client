/** Independently owned full-response application-error grammars with exact structural selection.
 * @since 1.6.0
 * @constraints Branch selection never retries validation in another declaration universe.
 */
import {inspectDirectOperation} from './directOperation.js';
import type {DirectOperationContract, DirectMessageRoot} from './directOperation.js';
import {createComponentValueMapping, inspectComponentValueMapping, expandProjectionValue} from './directValues.js';
import type {ComponentValueMapping, ProjectionValueReceipt} from './directValues.js';
import {observeComponentXml, assertComponentObservedPayload, assessObservedComponentPayload} from './directCodec.js';
import type {ComponentDecodedXml, DirectCodecFailure, DirectXmlLimits} from './directCodec.js';
import {inspectComponentRecordProjection, assessObservedComponentRecordPayload} from './componentRecordProjection.js';
import type {ComponentRecordProjection, ComponentRecordDecodedXml} from './componentRecordProjection.js';
import {inspectProjectionGrammar, inspectOrderedProjectionWildcards} from './directStructurePlan.js';
import type {DirectProjectionValue} from './directStructurePlan.js';
import type {SemanticParticle} from './particleSemanticView.js';
import {directDataOwnership} from './directExecutionPolicy.js';
import {DataOwnershipLimitError} from './dataOwnership.js';
import {isXmlNCName, syntaxElements} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';
import type {ResolverUsage} from './semanticBudget.js';

export interface ComponentResponseBranchInput {
  readonly id: string; readonly path: readonly ExpandedName[]; readonly contract: DirectOperationContract;
}
export interface ComponentResponseBranchesSpec {
  readonly version: 'component-response-branches-v1'; readonly policy: 'application-error-http502-v1';
  readonly branches: readonly Readonly<{id: string; path: readonly ExpandedName[]}>[];
}
export interface ComponentResponseBranches {
  readonly kind: 'component-response-branches'; readonly version: 'component-response-branches-v1';
  readonly direction: Readonly<{kind: 'output'}>; readonly root: DirectMessageRoot; readonly contextId: string;
  readonly admitted: false; readonly spec: ComponentResponseBranchesSpec; readonly usage: ResolverUsage;
}
export interface ComponentApplicationErrorDecodedXml {
  readonly kind: 'component-application-error-decoded'; readonly branch: string; readonly payload: SyntaxElement;
  readonly mapping: ComponentResponseBranches; readonly validated: ProjectionValueReceipt;
  readonly usage: ResolverUsage; readonly admitted: false;
}
type ErrorBranch = Readonly<ComponentResponseBranchInput & {mapping: ComponentValueMapping}>;
type Owned = Readonly<{outer: DirectOperationContract; success: ComponentRecordProjection; errors: readonly ErrorBranch[]}>;
const issued = new WeakMap<ComponentResponseBranches, Owned>();
export const COMPONENT_RESPONSE_BRANCH_LIMITS = Object.freeze({maxBranches: 8, maxPath: 16, maxIdLength: 64});
const same = (a: ExpandedName, b: ExpandedName) => a.namespace === b.namespace && a.local === b.local;
class Stop extends Error {constructor(readonly kind: DirectCodecFailure['kind'], readonly rule: string) {super(rule);}}

/** Authenticate the native branch owner before inspecting any caller-visible property.
 * @param value Native branch owner.
 * @param outer Optional exact outer operation.
 * @returns Its independent success and error contracts.
 * @throws TypeError For copied, foreign or mismatched handles.
 */
export function inspectComponentResponseBranches(value: ComponentResponseBranches, outer?: DirectOperationContract): Owned {
  const owned = issued.get(value);
  if (!owned || outer !== undefined && owned.outer !== outer) throw new TypeError('Native matching component response branches required');
  inspectDirectOperation(owned.outer); inspectComponentRecordProjection(owned.success, owned.outer);
  for (const error of owned.errors) inspectComponentValueMapping(error.mapping, error.contract);
  return owned;
}

/** Qualify finite, structurally disjoint error branches in their original source universes.
 * @param outer Exact document-output operation.
 * @param success Existing scoped companion projection.
 * @param entries One to eight error contracts and mandatory unit discriminator paths.
 * @param options Cooperative cancellation controls.
 * @returns Authenticated branches or a precise bounded refusal.
 * @throws TypeError For unauthenticated contracts or success projection.
 */
export function createComponentResponseBranches(outer: DirectOperationContract, success: ComponentRecordProjection,
  entries: readonly ComponentResponseBranchInput[], options: Readonly<{signal?: AbortSignal}> = {}): ComponentResponseBranches | DirectCodecFailure {
  const {context} = inspectDirectOperation(outer), {budget} = context;
  const companion = inspectComponentRecordProjection(success, outer);
  const check = () => {budget.chargeWork(); if (options.signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');};
  const fail = (kind: DirectCodecFailure['kind'], rule: string): DirectCodecFailure => Object.freeze({kind, rule, usage: Object.freeze({...budget.usage()})});
  const stop: (rule: string) => never = rule => {throw new Stop('unsupported', rule);};
  try {
    const result = budget.guard(() => {
      check();
      if (inspectDirectOperation(companion.companion).context.budget !== budget) stop('response-branches-shared-budget');
      if ('parts' in outer.output) stop('response-branches-require-document-output');
      if (!Array.isArray(entries) || entries.length < 1 || entries.length > COMPONENT_RESPONSE_BRANCH_LIMITS.maxBranches) stop('response-branches-error-count');
      const errors: ErrorBranch[] = [], ids = new Set<string>(), first: ExpandedName[] = [success.spec.payloadPath[0]!];
      for (const entry of entries) {
        check(); const {context: errorContext} = inspectDirectOperation(entry.contract);
        if (errorContext.budget !== budget) stop('response-branches-shared-budget');
        const metadata = directDataOwnership(budget).freeze(directDataOwnership(budget).snapshot({id: entry.id, path: entry.path}, check));
        if (typeof metadata.id !== 'string' || metadata.id.length > COMPONENT_RESPONSE_BRANCH_LIMITS.maxIdLength || !isXmlNCName(metadata.id)
          || metadata.id === 'success' || ids.has(metadata.id)) stop('response-branches-branch-id');
        ids.add(metadata.id);
        if (!Array.isArray(metadata.path) || !metadata.path.length || metadata.path.length > COMPONENT_RESPONSE_BRANCH_LIMITS.maxPath || metadata.path.some(name => {
          check(); return !name || typeof name !== 'object' || Object.keys(name).length !== 2
            || typeof name.namespace !== 'string' || typeof name.local !== 'string' || !isXmlNCName(name.local);
        })) stop('response-branches-discriminator-path');
        if (first.some(name => same(name, metadata.path[0]!))) stop('response-branches-unproved-disjoint');
        first.push(metadata.path[0]!);
        if ('parts' in entry.contract.output || 'parts' in outer.output) stop('response-branches-require-document-output');
        if (!same(entry.contract.output.element.name, outer.output.element.name)) stop('response-branches-complete-output-root');
        const mapping = createComponentValueMapping(entry.contract, {kind: 'output'}, options);
        if (mapping.kind !== 'component-mapping') return mapping;
        const projection = inspectComponentValueMapping(mapping, entry.contract).projection;
        if (!projection) stop('response-branches-require-document-mapping');
        for (const record of projection.records) {
          check();
          if (record.attributeWildcard || inspectProjectionGrammar(errorContext, record)
            && inspectOrderedProjectionWildcards(errorContext, record)) stop('response-branches-complete-declared-grammar');
        }
        const records = new Map(projection.records.map(record => [record.type.id, record]));
        let value: DirectProjectionValue = projection.root;
        for (const name of metadata.path) {
          check(); if (value.kind !== 'record' || value.nillable) stop('response-branches-mandatory-unit-path');
          const record = records.get(value.type);
          if (!record) stop('response-branches-mandatory-unit-path');
          const slots = record.slots.filter(slot => {check(); return same(slot.element.name, name);});
          if (slots.length !== 1 || slots[0]!.particle.occurs.min !== '1' || slots[0]!.particle.occurs.max !== '1'
            || slots[0]!.element.nillable) stop('response-branches-mandatory-unit-path');
          const grammar = inspectProjectionGrammar(errorContext, record);
          if (grammar) {
            let matches = 0;
            const pending: {particle: SemanticParticle; mandatory: boolean}[] = [{particle: grammar.view.root, mandatory: true}];
            while (pending.length) {
              check(); const {particle, mandatory} = pending.pop()!;
              const unit = mandatory && particle.occurs.min === '1' && particle.occurs.max === '1';
              if (particle.element && same(particle.element.name, name)) {if (!unit) stop('response-branches-mandatory-unit-path'); matches++;}
              for (const child of particle.children) pending.push({particle: child, mandatory: unit && particle.kind !== 'choice'});
            }
            if (matches !== 1) stop('response-branches-mandatory-unit-path');
          }
          value = slots[0]!.value;
        }
        budget.reserveNodes(1 + metadata.path.length);
        errors.push(Object.freeze({...metadata, contract: entry.contract, mapping}));
      }
      const spec: ComponentResponseBranchesSpec = directDataOwnership(budget).freeze({version: 'component-response-branches-v1',
        policy: 'application-error-http502-v1', branches: errors.map(({id, path}) => ({id, path}))});
      const branches: ComponentResponseBranches = Object.freeze({kind: 'component-response-branches', version: spec.version,
        direction: Object.freeze({kind: 'output'}), root: outer.output, contextId: outer.contextId, admitted: false,
        spec, usage: Object.freeze({...budget.usage()})});
      issued.set(branches, Object.freeze({outer, success, errors: Object.freeze(errors)}));
      return branches;
    });
    return result.kind === 'resource-limit' && !('rule' in result) ? fail('resource-limit', 'response-branches-budget') : result;
  } catch (error) {
    if (budget.exhausted()) return fail('resource-limit', 'response-branches-budget');
    if (error instanceof DataOwnershipLimitError) return fail('resource-limit', error.message);
    if (error instanceof Stop) return fail(error.kind, error.rule);
    throw error;
  }
}

/** Revalidate a configured error's complete application value through its native inverse.
 * @param branches Exact native branch owner.
 * @param branch Configured application-error identifier.
 * @param value Complete error value, including all wrappers and attributes.
 * @param options Cancellation and application value limits.
 * @returns Native inverse validation result.
 * @throws TypeError For foreign handles or unknown branch identifiers.
 */
export function validateComponentApplicationError(branches: ComponentResponseBranches, branch: string, value: unknown,
  options: Readonly<{signal?: AbortSignal; maxText?: number; maxItems?: number}> = {}): ReturnType<typeof expandProjectionValue> {
  const owned = inspectComponentResponseBranches(branches), selected = owned.errors.find(error => error.id === branch);
  if (!selected || 'parts' in selected.mapping.root) throw new TypeError('Configured native application-error branch required');
  return expandProjectionValue(inspectDirectOperation(selected.contract).context, selected.mapping.root.element, value, options);
}

/** Parse once, select an exact structural branch and validate its complete native output.
 * @param outer Exact outer operation.
 * @param branches Authenticated branch owner.
 * @param bytes Original XML bytes.
 * @param options Observation controls and protocol-first payload selector.
 * @returns Native success, application error, declared fault or bounded refusal.
 * @throws TypeError For foreign handles, mappings or selected nodes.
 */
export function decodeComponentResponseBranchesXml(outer: DirectOperationContract, branches: ComponentResponseBranches, bytes: Uint8Array,
  options: Readonly<{signal?: AbortSignal; limits?: DirectXmlLimits; uri?: string; componentResponseEncoding?: {charset?: string};
    selectPayload?: (root: SyntaxElement) => {payload: SyntaxElement; mapping: ComponentResponseBranches | ComponentValueMapping}}> = {}):
  ComponentRecordDecodedXml | ComponentDecodedXml | ComponentApplicationErrorDecodedXml | DirectCodecFailure {
  const owned = inspectComponentResponseBranches(branches, outer), {context} = inspectDirectOperation(outer), {budget} = context;
  const check = () => {budget.chargeWork(); if (options.signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');};
  const fail = (kind: DirectCodecFailure['kind'], rule: string): DirectCodecFailure => Object.freeze({kind, rule, usage: Object.freeze({...budget.usage()})});
  try {
    const result = budget.guard(() => {
      check(); const parser = inspectComponentRecordProjection(owned.success, outer).parser;
      const observation = observeComponentXml(outer, parser, bytes, options);
      if (observation.kind !== 'observed-component-xml') return observation;
      const selected = options.selectPayload?.(observation.root) ?? {payload: observation.root, mapping: branches};
      assertComponentObservedPayload(observation, selected.payload, check);
      if (selected.mapping !== branches) {
        const {mapping} = inspectComponentValueMapping(selected.mapping, outer);
        if (mapping.direction.kind !== 'fault') throw new TypeError('Response branches select only this output or a declared fault');
        return assessObservedComponentPayload(outer, mapping, observation, selected.payload, options);
      }
      const matches = (path: readonly ExpandedName[]): boolean => {
        let current = selected.payload;
        for (const name of path) {
          check(); let next: SyntaxElement | undefined;
          for (const child of syntaxElements(current)) {
            check(); if (!same(child.name, name)) continue;
            if (next) throw new Stop('mismatch', 'response-branches-multiple-matches');
            next = child;
          }
          if (!next) return false;
          current = next;
        }
        return true;
      };
      const success = matches(owned.success.spec.payloadPath);
      const errors = owned.errors.filter(error => {check(); return matches(error.path);});
      if (Number(success) + errors.length !== 1) return fail('mismatch', errors.length || success ? 'response-branches-multiple-matches' : 'response-branches-unknown');
      if (success) return assessObservedComponentRecordPayload(outer, owned.success, observation, selected.payload, options);
      const error = errors[0]!;
      const decoded = assessObservedComponentPayload(error.contract, error.mapping, observation, selected.payload, options);
      if (decoded.kind !== 'component-decoded') return decoded;
      if (decoded.validated.kind !== 'projection-value') throw new TypeError('Application error requires a native document value');
      check(); return Object.freeze({kind: 'component-application-error-decoded' as const, branch: error.id, payload: selected.payload,
        mapping: branches, validated: decoded.validated, usage: Object.freeze({...budget.usage()}), admitted: false as const});
    });
    return result.kind === 'resource-limit' && !('rule' in result) ? fail('resource-limit', 'response-branches-budget') : result;
  } catch (error) {
    if (budget.exhausted()) return fail('resource-limit', 'response-branches-budget');
    if (error instanceof DataOwnershipLimitError) return fail('resource-limit', error.message);
    if (error instanceof Stop) return fail(error.kind, error.rule);
    throw error;
  }
}
