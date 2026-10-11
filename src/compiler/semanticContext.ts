/** Internal structural contexts. Preparation never certifies actual or hypothetical XSD legality. */
import {GRAPH_MODEL, globalId, isBuiltinType, scopedId} from './canonicalGraph.js';
import type {CanonicalGraph, ComplexTypeNode, GraphNode, NodeId, Reference} from './canonicalGraph.js';
import {containedNodes, referenceSlots} from './graphTraversal.js';
import type {ReferenceSlot} from './graphTraversal.js';
import type {ResolvedGraph} from './resolveCanonicalGraph.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ExpandedName} from '../loader/orderedSyntax.js';
import {createSemanticBudget} from './semanticBudget.js';
import type {ResourceLimitFailure, SemanticBudget} from './semanticBudget.js';
import {assertRawComplexTypeShape} from './re01TypeProperties.js';
import type {RawComplexTypeProperties} from './re01TypeProperties.js';
import {validateRawSimpleTypeShape} from './schemaSimpleTypeProperties.js';
import type {RawSimpleTypeProperties} from './schemaSimpleTypeProperties.js';
import {validateRawElementShape} from './schemaElementProperties.js';
import type {RawElementProperties} from './schemaElementProperties.js';
import {validateRawAttributeGroupShape} from './schemaAttributeGroupProperties.js';
import type {RawAttributeGroupProperties} from './schemaAttributeGroupProperties.js';

export const SEMANTIC_CONTEXT_CONTRACT = 'RE01-domain-boundary-v1' as const;
export type ContextLookup = Readonly<{kind: 'found'; node: GraphNode} | {kind: 'missing' | 'outside-context'; id: NodeId}>;
export type ContextResolution = ContextLookup | Readonly<{kind: 'builtin'; name: ExpandedName}>;
export type SemanticContext = Readonly<{
  contextId: string;
  profileVersion: typeof GRAPH_MODEL;
  contractVersion: typeof SEMANTIC_CONTEXT_CONTRACT;
  kind: 'actual' | 'candidate';
  acceptance: 'structural-only';
  membership: 'complete-actual-plus-additions' | 'structural-subset';
  budget: SemanticBudget;
  members: readonly NodeId[];
  lookup(id: NodeId): ContextLookup;
  resolve(reference: Reference): ContextResolution;
  sourceNode(id: NodeId): GraphNode | undefined;
  /** Original source operand interpretation, with the same request budget. */
  originalContext(): SemanticContext;
  /** Original schema syntax evidence, not implicit hypothetical symbol membership. */
  sourceSchemaRetained(): CanonicalGraph['schemaRetained'];
  /** Immutable supplied data; never an actual mapping or local-validity receipt. */
  rawTypeProperties(id: NodeId): RawComplexTypeProperties | undefined;
  rawSimpleTypeProperties(id: NodeId): RawSimpleTypeProperties | undefined;
  rawElementProperties(id: NodeId): RawElementProperties | undefined;
  rawAttributeGroupProperties(id: NodeId): RawAttributeGroupProperties | undefined;
  /** Checked accessors throw SemanticContextAccessError for an inactive/missing owner. */
  references(id: NodeId): readonly ReferenceSlot[];
  owner(id: NodeId): NodeId | undefined;
  incomingAffiliates(id: NodeId): readonly NodeId[];
}>;
export type SemanticCandidateDelta = Readonly<{
  key: string;
  /** Explicit complete membership, including helper IDs and any replaced endpoint. */
  active: readonly NodeId[];
  additions?: readonly GraphNode[];
  endpoint?: ComplexTypeNode;
  rawTypes?: readonly RawComplexTypeProperties[];
  rawSimpleTypes?: readonly RawSimpleTypeProperties[];
  rawElements?: readonly RawElementProperties[];
  rawAttributeGroups?: readonly RawAttributeGroupProperties[];
}>;
export type ContextFailure = Readonly<{
  kind: 'input-error' | 'candidate-rejected';
  code: 'identity' | 'missing' | 'outside-context' | 'reference' | 'cycle' | 'endpoint' | 'representation';
  component?: NodeId;
}>;
export type CandidatePreparation = Readonly<{kind: 'prepared'; context: SemanticContext}> | ContextFailure | ResourceLimitFailure;
export type SemanticRequest = Readonly<{
  graph: CanonicalGraph;
  actual: SemanticContext;
  budget: SemanticBudget;
  candidate(delta: SemanticCandidateDelta): CandidatePreparation;
}>;
export type SemanticPreparation = Readonly<{kind: 'prepared'; request: SemanticRequest}> | ContextFailure | ResourceLimitFailure;

const contexts = new WeakSet<object>();
const requests = new WeakMap<object, object>();
const parents = new WeakMap<object, SemanticContext>();

export function isSemanticCandidateOf(parent: SemanticContext, child: SemanticContext): boolean {
  assertSemanticContext(parent); assertSemanticContext(child); parent.budget.chargeWork();
  return parents.get(child) === parent;
}

/** Genuine handles must also have been prepared by the same request. */
export function contextsShareRequest(a: SemanticContext, b: SemanticContext): boolean {
  assertSemanticContext(a); assertSemanticContext(b);
  a.budget.chargeWork();
  return requests.get(a) === requests.get(b);
}
export type SemanticGraphMetadata = Omit<CanonicalGraph, 'nodes' | 'globals'>;
const metadata = new WeakMap<object, SemanticGraphMetadata>();
const projections = new WeakMap<object, () => CanonicalGraph>();

/** Borrowed original metadata only; never projects or indexes active members. */
export function semanticContextGraphMetadata(context: SemanticContext): SemanticGraphMetadata {
  assertSemanticContext(context); context.budget.chargeWork(); return metadata.get(context)!;
}
const forks = new WeakMap<object, (delta: SemanticCandidateDelta) => CandidatePreparation>();

/** Persistent candidate overlay with the original request's source universe and budget. */
export function forkSemanticCandidate(parent: SemanticContext, delta: SemanticCandidateDelta): CandidatePreparation {
  assertSemanticContext(parent);
  return forks.get(parent)!(delta);
}

/** Structural active-node projection; does not authenticate a persisted source catalog. */
export function graphForSemanticContext(context: SemanticContext): CanonicalGraph {
  assertSemanticContext(context);
  return projections.get(context)!();
}
let nextRequest = 0;

/** Runtime identity, not a caller-supplied authority string or a copied property brand. */
export function assertSemanticContext(context: SemanticContext): void {
  if (!contexts.has(context)) throw new TypeError('Unauthenticated semantic context');
}

class InvalidContext extends Error {
  constructor(readonly code: ContextFailure['code'], readonly component?: NodeId) {super(code);}
}

export class SemanticContextAccessError extends Error {
  constructor(readonly code: 'missing' | 'outside-context' | 'reference', readonly component?: NodeId) {
    super(`Semantic context ${code}${component ? `: ${component}` : ''}`);
    this.name = 'SemanticContextAccessError';
  }
}

/**
 * The resolved input is a structural source entry, not a schema-validity receipt.
 * Source/loader/catalog costs precede this adapter and retain their existing budgets.
 * This request owns snapshotting, indexes, deltas and all subsequent consumer work.
 */
export function prepareSemanticRequest(resolved: ResolvedGraph, options: Readonly<{budget?: SemanticBudget}> = {}): SemanticPreparation {
  const budget = options.budget ?? createSemanticBudget();
  return budget.guard(() => {
    const dataField = (value: unknown, name: string): unknown => {
      budget.chargeWork(44 + name.length);
      if (!value || typeof value !== 'object') throw new InvalidContext('representation');
      const field = Object.getOwnPropertyDescriptor(value, name);
      if (field === undefined) return undefined;
      if (!('value' in field)) throw new InvalidContext('representation');
      return field.value;
    };
    try {
      budget.chargeWork(3);
      const inputGraph = dataField(resolved, 'graph');
      const inputNodes = dataField(inputGraph, 'nodes');
      if (dataField(inputGraph, 'model') !== GRAPH_MODEL || !Array.isArray(inputNodes)) {
        throw new InvalidContext('representation');
      }
      budget.reserveNodes(dataField(inputNodes, 'length') as number);
      const graph = budget.freeze(budget.snapshot(inputGraph as CanonicalGraph));
      budget.chargeWork(5);
      const originals = new Map<NodeId, GraphNode>();
      const originalNames = new Map<string, NodeId>();
      const originalSlots = new Map<NodeId, readonly ReferenceSlot[]>();
      const originalEdges = new Map<NodeId, readonly NodeId[]>();
      const knownReferences = new WeakSet<object>();
      const requestAuthority = Object.freeze({});
      const requestId = `semantic-request:${++nextRequest}`;
      let serial = 0;
      type ContextState = {changes: ReadonlyMap<NodeId, GraphNode>; slots: ReadonlyMap<NodeId, readonly ReferenceSlot[]>;
        edges: ReadonlyMap<NodeId, readonly NodeId[]>; raw: ReadonlyMap<NodeId, RawComplexTypeProperties>;
        simple: ReadonlyMap<NodeId, RawSimpleTypeProperties>; elements: ReadonlyMap<NodeId, RawElementProperties>; groups: ReadonlyMap<NodeId, RawAttributeGroupProperties>};
      const states = new WeakMap<SemanticContext, ContextState>();

      const key = (id: string): void => budget.chargeWork(1 + id.length);
      const identityId = (node: GraphNode): string => {
        if (node.identity.kind === 'global') {
          const role = node.kind === 'simpleType' || node.kind === 'complexType' ? 'type' : node.kind === 'wsdl' ? node.role : node.kind;
          if (node.identity.role !== role) throw new InvalidContext('identity', node.id);
          if (node.kind === 'element' || node.kind === 'attribute' || node.kind === 'wsdl') {
            budget.chargeWork(4 + node.name.namespace.length + node.name.local.length + node.identity.name.namespace.length + node.identity.name.local.length);
            if (node.name.namespace !== node.identity.name.namespace || node.name.local !== node.identity.name.local) throw new InvalidContext('identity', node.id);
          }
          budget.chargeWork(64 + 6 * (node.identity.role.length + node.identity.name.namespace.length + node.identity.name.local.length));
          return globalId(node.identity.role, node.identity.name);
        }
        budget.chargeWork(64 + 6 * (node.identity.owner.length + node.identity.path.length + node.identity.role.length));
        return scopedId(node.identity.owner, node.identity.path, node.identity.role);
      };
      const indexNode = (node: GraphNode, slots: Map<NodeId, readonly ReferenceSlot[]>, edges: Map<NodeId, readonly NodeId[]>): void => {
        budget.chargeWork(12);
        // Precharge variable slot/containment arrays before the shared traversal allocates them.
        if (node.kind === 'simpleType' && node.variety.kind === 'union') budget.chargeWork(node.variety.members.length * 4);
        if (node.kind === 'wsdl') budget.chargeWork(node.references.length * 4);
        if (node.kind === 'complexType' || node.kind === 'attributeGroup') budget.chargeWork(node.attributes.length * 2);
        if (node.kind === 'particle' && 'children' in node.term) budget.chargeWork(node.term.children.length * 2);
        const references = referenceSlots(node);
        // Original operands were frozen once with the graph/delta snapshot. Only
        // freeze new slot records here; walking their provenance again is wasteful.
        for (const slot of references) {budget.chargeWork(3 + slot.path.length); Object.freeze(slot); knownReferences.add(slot.reference);}
        slots.set(node.id, Object.freeze(references));
        edges.set(node.id, Object.freeze(containedNodes(node)));
      };
      for (const node of graph.nodes) {
        key(node.id);
        if (originals.has(node.id) || node.id !== identityId(node)) throw new InvalidContext('identity', node.id);
        budget.chargeWork(2);
        originals.set(node.id, node);
        if (node.identity.kind === 'global') originalNames.set(node.id, node.id);
        indexNode(node, originalSlots, originalEdges);
      }

      budget.chargeWork(12);
      const sharedMetadata: SemanticGraphMetadata = Object.freeze({model: graph.model, origins: graph.origins,
        schemaAnnotations: graph.schemaAnnotations, schemaRetained: graph.schemaRetained, loading: graph.loading});
      const buildContext = (kind: SemanticContext['kind'], members: readonly NodeId[], changes: ReadonlyMap<NodeId, GraphNode>, changedSlots: ReadonlyMap<NodeId, readonly ReferenceSlot[]>, changedEdges: ReadonlyMap<NodeId, readonly NodeId[]>, rawTypes: readonly RawComplexTypeProperties[] = [], rawSimpleTypes: readonly RawSimpleTypeProperties[] = [], rawElements: readonly RawElementProperties[] = [], rawGroups: readonly RawAttributeGroupProperties[] = []): SemanticContext => {
        budget.chargeWork(5);
        const membership = new Set<NodeId>();
        const rawProperties = new Map<NodeId, RawComplexTypeProperties>();
        const rawSimpleProperties = new Map<NodeId, RawSimpleTypeProperties>();
        const rawSimpleSlots = new Map<NodeId, readonly ReferenceSlot[]>();
        const rawComplexSlots = new Map<NodeId, readonly ReferenceSlot[]>(), rawComplexEdges = new Map<NodeId, readonly NodeId[]>();
        const rawElementProperties = new Map<NodeId, RawElementProperties>();
        const rawGroupProperties = new Map<NodeId, RawAttributeGroupProperties>();
        let expectedMembers = originals.size;
        for (const id of changes.keys()) {key(id); if (!originals.has(id)) expectedMembers++;}
        const reverse = new Map<NodeId, NodeId[]>();
        const slotsFor = (id: NodeId): readonly ReferenceSlot[] => rawComplexSlots.get(id) ?? rawSimpleSlots.get(id) ?? changedSlots.get(id) ?? originalSlots.get(id) ?? [];
        const edgesFor = (id: NodeId): readonly NodeId[] => rawComplexEdges.get(id) ?? changedEdges.get(id) ?? originalEdges.get(id) ?? [];
        const record = (id: NodeId): GraphNode | undefined => changes.get(id) ?? originals.get(id);
        for (const id of members) {
          key(id);
          if (membership.has(id)) throw new InvalidContext('identity', id);
          if (!record(id)) throw new InvalidContext('missing', id);
          budget.chargeWork(2); membership.add(id);

        }
        const requireMember = (id: NodeId): GraphNode => {
          key(id);
          const node = record(id);
          if (!node) throw new InvalidContext('missing', id);
          if (!membership.has(id)) throw new InvalidContext('outside-context', id);
          return node;
        };
        for (const properties of rawTypes) {
          assertRawComplexTypeShape(properties, budget);
          key(properties.type);
          if (requireMember(properties.type).kind !== 'complexType' || rawProperties.has(properties.type)) throw new InvalidContext('representation', properties.type);
          budget.chargeWork(8 + properties.attributeUses.length); rawProperties.set(properties.type, properties);
          const references: ReferenceSlot[] = [Object.freeze({path: '$raw/derivation/base', reference: properties.derivation.base})];
          if (properties.content.kind === 'simple' || properties.content.kind === 'opaque-builtin') {
            budget.chargeWork(3); references.push(Object.freeze({path: '$raw/content/type', reference: properties.content.type}));
          }
          rawComplexSlots.set(properties.type, Object.freeze(references));
          const children = [...properties.attributeUses];
          if ('particle' in properties.content) {budget.chargeWork(); children.push(properties.content.particle);}
          rawComplexEdges.set(properties.type, Object.freeze(children));
        }
        for (const properties of rawSimpleTypes) {
          if (!validateRawSimpleTypeShape(properties, budget)) throw new InvalidContext('representation');
          key(properties.type);
          if (requireMember(properties.type).kind !== 'simpleType' || rawSimpleProperties.has(properties.type)) throw new InvalidContext('representation', properties.type);
          budget.chargeWork(5); rawSimpleProperties.set(properties.type, properties);
          const rawSlots: ReferenceSlot[] = [Object.freeze({path: '$raw/base', reference: properties.base})];
          if (properties.variety.kind === 'list') {budget.chargeWork(3); rawSlots.push(Object.freeze({path: '$raw/item', reference: properties.variety.item}));}
          if (properties.variety.kind === 'union') for (let i = 0; i < properties.variety.members.length; i++) {
            budget.chargeWork(12); rawSlots.push(Object.freeze({path: '$raw/members/' + i, reference: properties.variety.members[i]}));
          }
          rawSimpleSlots.set(properties.type, Object.freeze(rawSlots));
        }
        for (const properties of rawElements) {
          if (!validateRawElementShape(properties, budget)) throw new InvalidContext('representation');
          key(properties.element);
          if (requireMember(properties.element).kind !== 'element' || rawElementProperties.has(properties.element)) throw new InvalidContext('representation', properties.element);
          budget.chargeWork(); rawElementProperties.set(properties.element, properties);
        }
        for (const properties of rawGroups) {
          validateRawAttributeGroupShape(properties, budget); key(properties.group);
          if (requireMember(properties.group).kind !== 'attributeGroup' || rawGroupProperties.has(properties.group)) throw new InvalidContext('representation', properties.group);
          budget.chargeWork(4 + properties.attributeUses.length); rawGroupProperties.set(properties.group, properties);
          for (const id of properties.attributeUses) if (requireMember(id).kind !== 'attributeUse') throw new InvalidContext('reference', properties.group);
          for (const id of properties.wildcard?.sources ?? []) requireMember(id);
          rawComplexSlots.set(properties.group, Object.freeze([]));
          rawComplexEdges.set(properties.group, Object.freeze([...properties.attributeUses]));
        }
        const target = (reference: Reference): NodeId | undefined => {
          budget.chargeWork(4);
          if (!reference || typeof reference !== 'object') throw new InvalidContext('reference');
          if (reference.kind === 'builtin') {
            if (!reference.name || typeof reference.name.namespace !== 'string' || typeof reference.name.local !== 'string') throw new InvalidContext('reference');
            budget.chargeWork(reference.name.namespace.length + reference.name.local.length);
            if (reference.name.namespace !== XSD_NAMESPACE || !isBuiltinType(reference.name.local)) throw new InvalidContext('reference');
            return undefined;
          }
          // Canonical local references are direct IDs; S05 does not require a
          // scoped target. They can coherently reference a replaced endpoint.
          if (reference.kind === 'local') {
            if (typeof reference.target !== 'string') throw new InvalidContext('reference');
            return reference.target;
          }
          if (reference.kind !== 'symbol' || typeof reference.role !== 'string' || !reference.name
            || typeof reference.name.namespace !== 'string' || typeof reference.name.local !== 'string') throw new InvalidContext('reference');
          budget.chargeWork(64 + 6 * (reference.role.length + reference.name.namespace.length + reference.name.local.length));
          const id = globalId(reference.role, reference.name);
          if (reference.target !== undefined && reference.target !== id) throw new InvalidContext('reference', id);
          return id;
        };
        const rawEdges = new Map<NodeId, NodeId[]>();
        const rawReference = (owner: NodeId, reference: Reference, edges: NodeId[]): void => {
          const id = target(reference);
          if (id === undefined) return;
          const node = requireMember(id);
          if ((node.kind !== 'simpleType' && node.kind !== 'complexType') || reference.kind === 'symbol' && reference.role !== 'type') throw new InvalidContext('reference', owner);
          budget.chargeWork(); edges.push(id);
        };
        for (const properties of rawSimpleTypes) {
          budget.chargeWork(3); const edges: NodeId[] = [];
          rawReference(properties.type, properties.base, edges);
          if (properties.variety.kind === 'list') rawReference(properties.type, properties.variety.item, edges);
          if (properties.variety.kind === 'union') for (const member of properties.variety.members) rawReference(properties.type, member, edges);
          for (const layer of properties.facetLayers) for (const facet of layer.facets) {
            budget.chargeWork(2); const operand = facet.operand; if (!operand) continue;
            if (operand.context === 'active') {requireMember(operand.owner); rawReference(properties.type, operand.type, edges);}
            else {
              key(operand.owner); if (!originals.has(operand.owner)) throw new InvalidContext('reference', properties.type);
              const id = target(operand.type);
              if (id !== undefined) {
                key(id); const node = originals.get(id);
                if (!node || node.kind !== 'simpleType' && node.kind !== 'complexType' || operand.type.kind === 'symbol' && operand.type.role !== 'type') throw new InvalidContext('reference', properties.type);
              }
            }
          }
          rawEdges.set(properties.type, edges);
        }
        for (const properties of rawTypes) {
          budget.chargeWork(3); const edges: NodeId[] = [];
          rawReference(properties.type, properties.derivation.base, edges);
          if (properties.content.kind === 'simple' || properties.content.kind === 'opaque-builtin') rawReference(properties.type, properties.content.type, []);
          if ('particle' in properties.content && requireMember(properties.content.particle).kind !== 'particle') throw new InvalidContext('reference', properties.type);
          for (const id of properties.attributeUses) if (requireMember(id).kind !== 'attributeUse') throw new InvalidContext('reference', properties.type);
          for (const id of properties.wildcard?.sources ?? []) requireMember(id);
          rawEdges.set(properties.type, edges);
        }
        // Validate closure and ownership without unfolding recursive element/type references.
        for (const id of members) {
          const node = requireMember(id);
          if (node.identity.kind === 'scoped') requireMember(node.identity.owner);
          for (const child of edgesFor(id)) requireMember(child);
          for (const slot of slotsFor(id)) {
            const refId = target(slot.reference);
            if (refId !== undefined) {
              const referred = requireMember(refId);
              if (slot.reference.kind === 'symbol' && (referred.identity.kind !== 'global' || referred.identity.role !== slot.reference.role)) throw new InvalidContext('reference', id);
              if (node.kind === 'element' && slot.path === 'substitutionGroup') {
                if (referred.kind !== 'element') throw new InvalidContext('reference', id);
                budget.chargeWork(4);
                const incoming = reverse.get(refId) ?? [];
                incoming.push(id); reverse.set(refId, incoming);
              }
            }
          }
        }
        const forbidden = (id: NodeId): readonly NodeId[] => {
          const node = requireMember(id);
          budget.chargeWork(1 + edgesFor(id).length);
          const result = [...edgesFor(id)];
          for (const raw of rawEdges.get(id) ?? []) {budget.chargeWork(); result.push(raw);}
          for (const slot of slotsFor(id)) {
            budget.chargeWork();
            const expands = node.kind === 'simpleType' || node.kind === 'complexType' || node.kind === 'attributeGroupUse'
              || (node.kind === 'particle' && node.term.kind === 'group') || (node.kind === 'element' && slot.path === 'substitutionGroup');
            if (expands) {const refId = target(slot.reference); if (refId !== undefined) {budget.chargeWork(); result.push(refId);}}
          }
          return result;
        };
        const acyclic = (edges: (id: NodeId) => readonly NodeId[]): void => {
          budget.chargeWork(3);
          const done = new Set<NodeId>(), active = new Set<NodeId>();
          const stack: {id: NodeId; edges: readonly NodeId[]; index: number}[] = [];
          for (const root of members) {
            key(root); if (done.has(root)) continue;
            budget.chargeWork(5); active.add(root); stack.push({id: root, edges: edges(root), index: 0});
            while (stack.length) {
              budget.chargeWork(3);
              const top = stack[stack.length - 1];
              if (top.index === top.edges.length) {budget.chargeWork(3); active.delete(top.id); done.add(top.id); stack.pop(); continue;}
              const id = top.edges[top.index++]; key(id);
              if (active.has(id)) throw new InvalidContext('cycle', id);
              if (!done.has(id)) {budget.chargeWork(5); active.add(id); stack.push({id, edges: edges(id), index: 0});}
            }
          }
        };
        acyclic(forbidden);
        acyclic(id => {
          const node = requireMember(id); budget.chargeWork(2);
          return node.identity.kind === 'scoped' ? [node.identity.owner] : [];
        });
        for (const entries of reverse.values()) {budget.chargeWork(1 + entries.length); Object.freeze(entries);}
        budget.chargeWork(100 + members.length);
        const frozenMembers = Object.freeze([...members]);
        const contextId = `${requestId}:${kind}:${++serial}`;
        let context: SemanticContext;
        const authenticate = (): void => {assertSemanticContext(context); budget.chargeWork();};
        const lookup = (id: NodeId): ContextLookup => {
          authenticate(); key(id); budget.chargeWork(3);
          const node = record(id);
          return Object.freeze(!node ? {kind: 'missing', id} : !membership.has(id) ? {kind: 'outside-context', id} : {kind: 'found', node});
        };
        const checked = (id: NodeId): GraphNode => {
          const result = lookup(id);
          if (result.kind !== 'found') {budget.chargeWork(4 + id.length); throw new SemanticContextAccessError(result.kind, id);}
          return result.node;
        };
        const empty: readonly never[] = Object.freeze([]);
        context = Object.freeze({
          contextId, profileVersion: GRAPH_MODEL, contractVersion: SEMANTIC_CONTEXT_CONTRACT,
          kind, acceptance: 'structural-only', membership: membership.size === expectedMembers ? 'complete-actual-plus-additions' : 'structural-subset', budget, members: frozenMembers,
          lookup,
          resolve(reference: Reference): ContextResolution {
            authenticate();
            try {
              budget.chargeWork();
              const safe = knownReferences.has(reference) ? reference : budget.freeze(budget.snapshot(reference));
              const id = target(safe);
              if (id !== undefined) {
                const result = lookup(id);
                if (result.kind === 'found' && safe.kind === 'symbol'
                  && (result.node.identity.kind !== 'global' || result.node.identity.role !== safe.role)) throw new InvalidContext('reference', id);
                return result;
              }
              if (safe.kind !== 'builtin') throw new InvalidContext('reference');
              budget.chargeWork(4 + safe.name.namespace.length + safe.name.local.length);
              return Object.freeze({kind: 'builtin', name: Object.freeze({...safe.name})});
            } catch (error: unknown) {
              if (error instanceof InvalidContext || error instanceof TypeError) {
                budget.chargeWork(4); throw new SemanticContextAccessError('reference', error instanceof InvalidContext ? error.component : undefined);
              }
              throw error;
            }
          },
          sourceNode(id: NodeId): GraphNode | undefined {authenticate(); key(id); return originals.get(id);},
          originalContext(): SemanticContext {authenticate(); return actual;},
          sourceSchemaRetained(): CanonicalGraph['schemaRetained'] {authenticate(); return graph.schemaRetained;},
          rawTypeProperties(id: NodeId): RawComplexTypeProperties | undefined {checked(id); return rawProperties.get(id);},
          rawSimpleTypeProperties(id: NodeId): RawSimpleTypeProperties | undefined {checked(id); return rawSimpleProperties.get(id);},
          rawElementProperties(id: NodeId): RawElementProperties | undefined {checked(id); return rawElementProperties.get(id);},
          rawAttributeGroupProperties(id: NodeId): RawAttributeGroupProperties | undefined {checked(id); return rawGroupProperties.get(id);},
          references(id: NodeId): readonly ReferenceSlot[] {checked(id); return slotsFor(id);},
          owner(id: NodeId): NodeId | undefined {const node = checked(id); return node.identity.kind === 'scoped' ? node.identity.owner : undefined;},
          incomingAffiliates(id: NodeId): readonly NodeId[] {checked(id); return reverse.get(id) ?? empty;},
        });
        contexts.add(context); metadata.set(context, sharedMetadata);
        requests.set(context, requestAuthority);
        states.set(context, {changes, slots: changedSlots, edges: changedEdges, raw: rawProperties, simple: rawSimpleProperties, elements: rawElementProperties, groups: rawGroupProperties});
        forks.set(context, input => candidate(input, context));
        let projection: CanonicalGraph | undefined;
        projections.set(context, () => {
          authenticate();
          if (projection) return projection;
          budget.chargeWork(12 + 2 * frozenMembers.length);
          const nodes: GraphNode[] = [], globals: NodeId[] = [];
          for (const id of frozenMembers) {
            key(id); const node = record(id)!; nodes.push(node);
            if (node.identity.kind === 'global') globals.push(id);
          }
          projection = Object.freeze({...graph, nodes: Object.freeze(nodes), globals: Object.freeze(globals)});
          return projection;
        });
        return context;
      };
      budget.chargeWork(4 + graph.nodes.length);
      const actual = buildContext('actual', graph.nodes.map(node => node.id), new Map(), new Map(), new Map());
      const candidate = (input: SemanticCandidateDelta, from: SemanticContext = actual): CandidatePreparation => budget.guard(() => {
        try {
          budget.chargeWork(8);
          assertSemanticContext(from);
          if (requests.get(from) !== requestAuthority) throw new InvalidContext('representation');
          const parent = states.get(from)!;
          const candidateKey = dataField(input, 'key'), candidateActive = dataField(input, 'active');
          const additions = dataField(input, 'additions'), endpoint = dataField(input, 'endpoint'), rawTypes = dataField(input, 'rawTypes');
          const rawSimpleTypes = dataField(input, 'rawSimpleTypes'), rawElements = dataField(input, 'rawElements'), rawGroups = dataField(input, 'rawAttributeGroups');
          if (typeof candidateKey !== 'string' || !Array.isArray(candidateActive)
            || (additions !== undefined && !Array.isArray(additions)) || (rawTypes !== undefined && !Array.isArray(rawTypes))
            || (rawGroups !== undefined && !Array.isArray(rawGroups)) || (rawSimpleTypes !== undefined && !Array.isArray(rawSimpleTypes)) || (rawElements !== undefined && !Array.isArray(rawElements))) throw new InvalidContext('representation');
          budget.reserveNodes((additions ? dataField(additions, 'length') as number : 0) + (endpoint ? 1 : 0));
          const delta = budget.freeze(budget.snapshot(input));
          budget.chargeWork(12 + delta.active.length + parent.changes.size * 2 + parent.slots.size * 2 + parent.edges.size * 2
            + parent.raw.size * 2 + parent.simple.size * 2 + parent.elements.size * 2 + parent.groups.size * 2);
          const changes = new Map(parent.changes), slots = new Map(parent.slots), edges = new Map(parent.edges);
          const raw = new Map(parent.raw), simple = new Map(parent.simple), elements = new Map(parent.elements), groups = new Map(parent.groups);
          const active = new Set(delta.active);
          for (const node of delta.additions ?? []) {
            key(node.id);
            if (originals.has(node.id) || changes.has(node.id) || originalNames.has(identityId(node)) || node.id !== identityId(node)) throw new InvalidContext('identity', node.id);
            if (!active.has(node.id)) throw new InvalidContext('outside-context', node.id);
            budget.chargeWork(); changes.set(node.id, node); indexNode(node, slots, edges);
          }
          if (delta.endpoint) {
            const node = delta.endpoint; key(node.id);
            const original = parent.changes.get(node.id) ?? originals.get(node.id);
            if (from.lookup(node.id).kind !== 'found' || !original || original.kind !== 'complexType' || node.kind !== 'complexType' || node.id !== identityId(node) || !active.has(node.id)) throw new InvalidContext('endpoint', node.id);
            budget.chargeWork(); changes.set(node.id, node); indexNode(node, slots, edges);
          }
          const permittedProperty = (id: NodeId): void => {
            key(id);
            if (from.kind === 'candidate' && id !== delta.endpoint?.id && (originals.has(id) || parent.changes.has(id))) throw new InvalidContext('endpoint', id);
          };
          budget.chargeWork(3); const seenRaw = new Set<NodeId>(), seenSimple = new Set<NodeId>(), seenElements = new Set<NodeId>(), seenGroups = new Set<NodeId>();
          const unique = (id: NodeId, seen: Set<NodeId>): void => {key(id); if (seen.has(id)) throw new InvalidContext('identity', id); budget.chargeWork(); seen.add(id);};
          for (const row of delta.rawTypes ?? []) {assertRawComplexTypeShape(row, budget); permittedProperty(row.type); unique(row.type, seenRaw); budget.chargeWork(); raw.set(row.type, row);}
          for (const row of delta.rawSimpleTypes ?? []) {if (!validateRawSimpleTypeShape(row, budget)) throw new InvalidContext('representation'); permittedProperty(row.type); unique(row.type, seenSimple); budget.chargeWork(); simple.set(row.type, row);}
          for (const row of delta.rawElements ?? []) {if (!validateRawElementShape(row, budget)) throw new InvalidContext('representation'); permittedProperty(row.element); unique(row.element, seenElements); budget.chargeWork(); elements.set(row.element, row);}
          for (const row of delta.rawAttributeGroups ?? []) {validateRawAttributeGroupShape(row, budget); permittedProperty(row.group); unique(row.group, seenGroups); budget.chargeWork(); groups.set(row.group, row);}
          budget.chargeWork(4 + raw.size + simple.size + elements.size + groups.size);
          const context = buildContext('candidate', delta.active, changes, slots, edges, [...raw.values()], [...simple.values()], [...elements.values()], [...groups.values()]);
          budget.chargeWork(); parents.set(context, from);
          budget.chargeWork(3); return Object.freeze({kind: 'prepared', context});
        } catch (error: unknown) {
          if (error instanceof TypeError) {budget.chargeWork(4); return Object.freeze({kind: 'candidate-rejected', code: 'representation'});}
          if (!(error instanceof InvalidContext)) throw error;
          budget.chargeWork(4); return Object.freeze({kind: 'candidate-rejected', code: error.code, component: error.component});
        }
      });
      budget.chargeWork(8);
      return Object.freeze({kind: 'prepared', request: Object.freeze({graph, actual, budget, candidate})});
    } catch (error: unknown) {
      if (error instanceof TypeError) {budget.chargeWork(4); return Object.freeze({kind: 'input-error', code: 'representation'});}
      if (!(error instanceof InvalidContext)) throw error;
      budget.chargeWork(4); return Object.freeze({kind: 'input-error', code: error.code, component: error.component});
    }
  });
}
