/** Derive stream selection and capsule identity from native checked sources.
 * @since Unreleased
 */
import type {ExpandedName} from '../loader/orderedSyntax.js';
import type {ElementNode} from './canonicalGraph.js';
import type {DirectOperationContract, DirectOperationSelector} from './directOperation.js';
import {inspectDirectOperation} from './directOperation.js';
import {inspectComponentValueMapping} from './directValues.js';
import type {ReconstructedComponentSource} from './directSourceCapsule.js';
import type {DirectProjectionRecord, DirectProjectionValue} from './directStructurePlan.js';
import {inspectOrderedProjectionWildcards} from './directStructurePlan.js';
import {inspectComponentRecordProjection, type ComponentRecordProjection, type ComponentRecordProjectionSpec} from './componentRecordProjection.js';

export interface CheckedStreamSelection {
  readonly selector: DirectOperationSelector;
  readonly path: readonly (ExpandedName | string)[];
  readonly format: 'ndjson' | 'json-array';
  readonly recordType?: ExpandedName;
}

export interface CheckedStreamSpec extends CheckedStreamSelection {
  readonly path: readonly ExpandedName[];
  readonly scope: 'full-response' | 'records-with-declared-wrapper-scope';
  readonly opaqueExclusions?: ComponentRecordProjectionSpec['opaqueExclusions'];
}

const artifactVersion = 'checked-component-stream-capsule-v1';
export const COMPONENT_STREAM_RUNTIME_VERSION = 'checked-component-stream-runtime-v1' as const;

export interface ComponentStreamPlan {
  readonly contract: DirectOperationContract;
  readonly recordContract: DirectOperationContract;
  readonly outer?: ComponentRecordProjection;
  readonly wrappers: readonly Readonly<{element: ElementNode; record: DirectProjectionRecord}>[];
  readonly item: ElementNode;
  readonly spec: CheckedStreamSpec;
}

export function planComponentStream(expected: ReconstructedComponentSource, choice: CheckedStreamSelection): ComponentStreamPlan {
  const {contract} = expected;
  const refuse = (reason: string): never => {throw new TypeError('checked-stream:' + reason);};
  if (choice.format !== 'ndjson' && choice.format !== 'json-array') return refuse('unsupported stream format');
  if (contract.binding.version !== '1.1' || contract.binding.style !== 'document' || contract.binding.use !== 'literal' || contract.pattern === 'one-way'
    || contract.headers?.length || contract.policy?.kind === 'https-transport' && (contract.policy.includeTimestamp || contract.policy.requireClientCertificate))
    return refuse('requires credential-free SOAP 1.1 document/literal request-response');
  if (expected.responseBranches) return refuse('application-error response branches are unavailable for streams');
  const outer = expected.responseProjection;
  const companion = outer && inspectComponentRecordProjection(outer, contract);
  const recordContract = companion?.companion ?? contract;
  const output = expected.mappings.find(mapping => mapping.direction.kind === 'output');
  const mapping = companion?.mapping ?? output;
  if (mapping?.kind !== 'component-mapping' || 'parts' in mapping.root) return refuse('document output mapping required');
  const {projection, applicationGroups} = inspectComponentValueMapping(mapping, recordContract);
  const {context} = inspectDirectOperation(recordContract);
  if (!projection || applicationGroups) return refuse('native document output without application-group remapping required');
  const matches = (step: ExpandedName | string, name: ExpandedName) => typeof step === 'string'
    ? step === name.local : step.local === name.local && step.namespace === name.namespace;
  const chosen = choice.selector, selected = contract.selector;
  if (chosen.operation !== selected.operation || !matches(chosen.binding, selected.binding) || !matches(chosen.portType, selected.portType))
    return refuse('operation selector mismatch');
  let element = mapping.root.element;
  let value: DirectProjectionValue = projection.root;
  const wrappers: {element: ElementNode; record: DirectProjectionRecord}[] = [];
  if (outer && !matches(choice.path[0]!, outer.root.element.name)) return refuse('path must begin with the selected outer response wrapper');
  const path = outer ? choice.path.slice(1) : choice.path;
  if (path.length < 2 || !matches(path[0]!, element.name)) return refuse('path must begin with the selected response wrapper');
  for (const [index, step] of path.slice(1).entries()) {
    if (value.kind !== 'record' || value.nillable || value.constraint) return refuse('path crosses a non-container, nillable or constrained wrapper');
    const type = value.type;
    const record = projection.records.find(record => record.type.id === type)!;
    if (record.content !== 'element-only' || record.ordered && inspectOrderedProjectionWildcards(context, record))
      return refuse('path crosses an unsupported wrapper grammar');
    const matching = record.slots.filter(slot => matches(step, slot.element.name));
    if (matching.length !== 1) return refuse('ambiguous or missing source declaration: ' + JSON.stringify(step));
    const slot = matching[0]!;
    if (index === path.length - 2 && ['0', '1'].includes(slot.particle.occurs.max))
      return refuse('stream item must be a repeated declaration');
    wrappers.push({element, record});
    element = slot.element;
    value = slot.value;
  }
  const recordType = element.type.kind === 'local' ? undefined : element.type.name;
  if (choice.recordType && (!recordType || !matches(choice.recordType, recordType))) return refuse('recordType does not match the source declaration');
  const name = ({namespace, local}: ExpandedName) => ({namespace, local});
  const recordPath = [...wrappers.slice(1).map(wrapper => wrapper.element.name), element.name];
  if (outer && (recordPath.length !== outer.spec.recordPath.length || recordPath.some((step, index) => !matches(step, outer.spec.recordPath[index]!))))
    return refuse('path must match the authenticated companion record association');
  const spec = {selector: {portType: name(selected.portType), binding: name(selected.binding), operation: selected.operation},
    path: [...(outer ? [name(outer.root.element.name)] : []), ...wrappers.map(wrapper => name(wrapper.element.name)), name(element.name)], format: choice.format,
    ...(recordType ? {recordType: name(recordType)} : {}), scope: outer?.spec.scope ?? 'full-response',
    ...(outer ? {opaqueExclusions: outer.spec.opaqueExclusions.map(exclusion => ({path: exclusion.path.map(name), reason: exclusion.reason}))} : {})} as const;
  return {contract, recordContract, outer, wrappers, item: element, spec};
}

/** Bind stream identity without modifying any of the existing capsule formats. */
export function streamArtifactCapsule(capsule: Uint8Array, plan: ComponentStreamPlan): Uint8Array {
  return Buffer.from(JSON.stringify({version: artifactVersion, runtime: COMPONENT_STREAM_RUNTIME_VERSION, stream: plan.spec,
    source: Buffer.from(capsule).toString('base64')}));
}

export function readStreamArtifactCapsule(bytes: Uint8Array): {source: Uint8Array; stream: CheckedStreamSpec} | undefined {
  const value = JSON.parse(Buffer.from(bytes).toString('utf8')) as {
    version: string; runtime: string; stream: CheckedStreamSpec; source: string;
  };
  if (value.version !== artifactVersion || value.runtime !== COMPONENT_STREAM_RUNTIME_VERSION) return undefined;
  return {source: Buffer.from(value.source, 'base64'), stream: value.stream};
}
