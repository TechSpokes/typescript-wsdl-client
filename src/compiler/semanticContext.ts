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
import {equalNotationProperties, notationNameKey, readSourceNotationProperties, sourceNotationNamespace} from './schemaNotationProperties.js';
import type {SchemaNotationProperties} from './schemaNotationProperties.js';
import {sourceSchemasForResolvedGraph} from './sourceSchemaBinding.js';
import type {SyntaxElement} from '../loader/orderedSyntax.js';
import {assertSemanticTypeReferenceShape} from './semanticTypeReference.js';
import type {OriginalGeneratedScalarReference, SemanticTypeReference} from './semanticTypeReference.js';
import {validateRawAttributeShape} from './schemaAttributeProperties.js';
import type {RawAttributeProperties} from './schemaAttributeProperties.js';
import {computeOriginalSourceAbsence} from './originalSourceMembership.js';

export const SEMANTIC_CONTEXT_CONTRACT = 'RE01-domain-boundary-v1' as const;
export type ContextLookup = Readonly<{kind: 'found'; node: GraphNode} | {kind: 'missing' | 'outside-context'; id: NodeId}>;
export type ContextResolution = ContextLookup | Readonly<{kind: 'builtin'; name: ExpandedName}>;
export type SemanticReferenceSlot = Readonly<{path: string; reference: SemanticTypeReference}>;
export type ContextScalarSlotLookup = Readonly<{kind: 'found'; slot: OriginalGeneratedScalarReference} |
  {kind: 'missing' | 'outside-context'; slot: OriginalGeneratedScalarReference}>;
export type ContextNotationLookup = Readonly<
  {kind: 'found'; properties: SchemaNotationProperties; origin: 'original' | 'addition'} |
  {kind: 'missing' | 'outside-context'; name: ExpandedName} |
  {kind: 'unresolved'; name: ExpandedName; rule: 'notation-source-universe' | 'notation-active-membership' | 'notation-original-properties'}
>;
export type SemanticContext = Readonly<{
  contextId: string;
  profileVersion: typeof GRAPH_MODEL;
  contractVersion: typeof SEMANTIC_CONTEXT_CONTRACT;
  kind: 'actual' | 'candidate';
  acceptance: 'structural-only';
  membership: 'complete-actual-plus-additions' | 'structural-subset';
  budget: SemanticBudget;
  members: readonly NodeId[];
  scalarSlots: readonly OriginalGeneratedScalarReference[];
  scalarSlotMembership: 'complete-original' | 'structural-subset';
  lookupScalarSlot(reference: OriginalGeneratedScalarReference): ContextScalarSlotLookup;
  /** Separate NOTATION symbol space; no persisted GraphNode role is introduced. */
  notationMembers: readonly ExpandedName[];
  notationMembership: 'complete-original-plus-additions' | 'structural-subset';
  notationUniverse: 'source-bound' | 'retained-only';
  lookupNotation(name: ExpandedName): ContextNotationLookup;
  lookup(id: NodeId): ContextLookup;
  /** Owns immutable selector data only; every resolution still checks current membership. */
  ownTypeReference(reference: SemanticTypeReference): SemanticTypeReference;
  resolve(reference: Reference): ContextResolution;
  sourceNode(id: NodeId): GraphNode | undefined;
  originalSourceComponentAbsent(id: NodeId): boolean;
  /** Original source operand interpretation, with the same request budget. */
  originalContext(): SemanticContext;
  /** Original schema syntax evidence, not implicit hypothetical symbol membership. */
  sourceSchemaRetained(): CanonicalGraph['schemaRetained'];
  /** Immutable supplied data; never an actual mapping or local-validity receipt. */
  rawTypeProperties(id: NodeId): RawComplexTypeProperties | undefined;
  rawSimpleTypeProperties(id: NodeId): RawSimpleTypeProperties | undefined;
  rawElementProperties(id: NodeId): RawElementProperties | undefined;
  rawAttributeProperties(id: NodeId): RawAttributeProperties | undefined;
  rawAttributeGroupProperties(id: NodeId): RawAttributeGroupProperties | undefined;
  /** Checked accessors throw SemanticContextAccessError for an inactive/missing owner. */
  references(id: NodeId): readonly SemanticReferenceSlot[];
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
  rawAttributes?: readonly RawAttributeProperties[];
  /** Independent scalar component membership; omission inherits the parent. */
  scalarSlots?: readonly OriginalGeneratedScalarReference[];
  rawAttributeGroups?: readonly RawAttributeGroupProperties[];
  /** Omission inherits the parent; an explicit selection must include every new addition. */
  notations?: Readonly<{active: readonly ExpandedName[]; additions?: readonly SchemaNotationProperties[]}>;
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
      // Private exact-handle binding is read before snapshotting loses that identity.
      // Availability of all source roots is distinct from source/component validity.
      const sourceSchemas = sourceSchemasForResolvedGraph(resolved);
      const inputGraph = dataField(resolved, 'graph');
      const inputNodes = dataField(inputGraph, 'nodes');
      if (dataField(inputGraph, 'model') !== GRAPH_MODEL || !Array.isArray(inputNodes)) {
        throw new InvalidContext('representation');
      }
      budget.reserveNodes(dataField(inputNodes, 'length') as number);
      // An exact source-bound resolved handle owns a deeply frozen graph from
      // the resolver. The generic catalog entry still snapshots caller data.
      const graph = sourceSchemas !== undefined ? inputGraph as CanonicalGraph
        : budget.freeze(budget.snapshot(inputGraph as CanonicalGraph));
      budget.chargeWork(6);
      const originals = new Map<NodeId, GraphNode>();
      const originalNames = new Map<string, NodeId>();
      const originalSlots = new Map<NodeId, readonly ReferenceSlot[]>();
      const originalEdges = new Map<NodeId, readonly NodeId[]>();
      const knownReferences = new WeakSet<object>();
      const ownedTypeReferences = new WeakSet<object>();
      const requestAuthority = Object.freeze({});
      const requestId = `semantic-request:${++nextRequest}`;
      let serial = 0;
      type OriginalNotation = {properties: SchemaNotationProperties; conflicting: boolean};
      type NotationState = {additions: ReadonlyMap<string, SchemaNotationProperties>; active: ReadonlySet<string>; members: readonly ExpandedName[]};
      type ScalarSlotState = {active: ReadonlySet<NodeId>; members: readonly OriginalGeneratedScalarReference[]};
      const originalScalarSlots = new Map<NodeId, OriginalGeneratedScalarReference>();
      const absentOriginals = computeOriginalSourceAbsence(graph.nodes, budget);
      const originalNotations = new Map<string, OriginalNotation>();
      type ContextState = {changes: ReadonlyMap<NodeId, GraphNode>; slots: ReadonlyMap<NodeId, readonly ReferenceSlot[]>;
        edges: ReadonlyMap<NodeId, readonly NodeId[]>; raw: ReadonlyMap<NodeId, RawComplexTypeProperties>;
        simple: ReadonlyMap<NodeId, RawSimpleTypeProperties>; elements: ReadonlyMap<NodeId, RawElementProperties>;
        attributes: ReadonlyMap<NodeId, RawAttributeProperties>; groups: ReadonlyMap<NodeId, RawAttributeGroupProperties>;
        notations: NotationState; scalarSlots: ScalarSlotState};
      const states = new WeakMap<SemanticContext, ContextState>();

      const key = (id: string): void => {
        budget.chargeWork();
        if (typeof id !== 'string') throw new TypeError('Semantic component IDs must be strings');
        budget.chargeWork(id.length);
      };
      const notationField = (value: unknown, field: string): unknown => {
        budget.chargeWork(44 + field.length);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Notation properties require data records');
        const descriptor = Object.getOwnPropertyDescriptor(value, field);
        if (!descriptor || !('value' in descriptor)) throw new TypeError('Notation properties require explicit own data fields');
        return descriptor.value;
      };
      const notationName = (value: unknown): ExpandedName => {
        if (typeof notationField(value, 'namespace') !== 'string' || typeof notationField(value, 'local') !== 'string') throw new TypeError('Notation QName fields must be strings');
        return value as ExpandedName;
      };
      const notationProperties = (value: unknown): SchemaNotationProperties => {
        notationName(notationField(value, 'name'));
        const publicIdentifier = notationField(value, 'publicIdentifier'), systemIdentifier = notationField(value, 'systemIdentifier');
        if ((publicIdentifier !== undefined && typeof publicIdentifier !== 'string') || (systemIdentifier !== undefined && typeof systemIdentifier !== 'string')) throw new TypeError('Notation identifiers must be strings or explicit undefined');
        return value as SchemaNotationProperties;
      };
      const retainNotation = (syntax: SyntaxElement, namespace: string): void => {
        // Each physical representation allocates a tuple, even if later coalesced.
        budget.reserveNodes(1);
        const mapped = readSourceNotationProperties(syntax, namespace, budget);
        if (mapped.kind !== 'properties') return; // Missing names remain source-grammar failures.
        const id = notationNameKey(mapped.properties.name, budget), prior = originalNotations.get(id);
        budget.chargeWork(4);
        if (!prior) originalNotations.set(id, {properties: mapped.properties, conflicting: false});
        else if (!equalNotationProperties(prior.properties, mapped.properties, budget)) prior.conflicting = true;
      };
      if (sourceSchemas !== undefined) {
        for (const schema of sourceSchemas) {
          budget.chargeWork(); const namespace = sourceNotationNamespace(schema, budget);
          for (const child of schema.syntax.children) {
            budget.chargeWork(4);
            if (child.kind === 'element') {
              budget.chargeWork(child.name.namespace.length + child.name.local.length);
              if (child.name.namespace === XSD_NAMESPACE && child.name.local === 'notation') retainNotation(child, namespace);
            }
          }
        }
      } else {
        for (const retained of graph.schemaRetained) {
          budget.chargeWork(4 + retained.syntax.name.namespace.length + retained.syntax.name.local.length);
          if (retained.syntax.name.namespace === XSD_NAMESPACE && retained.syntax.name.local === 'notation') retainNotation(retained.syntax, retained.context.effectiveNamespace);
        }
      }
      budget.chargeWork(5 + originalNotations.size * 3);
      const actualNotations: NotationState = {additions: new Map(), active: new Set(originalNotations.keys()),
        members: Object.freeze([...originalNotations.values()].map(row => row.properties.name))};
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
        if (node.kind === 'complexType' && node.derivation?.contentKind === 'simple' && node.derivation.kind === 'restriction' && !absentOriginals.has(node.id)) {
          budget.reserveNodes(1); budget.chargeWork(5 + node.id.length);
          const slot = Object.freeze({kind: 'original-generated', owner: node.id} as const);
          assertSemanticTypeReferenceShape(slot, budget);
          budget.chargeWork(); ownedTypeReferences.add(slot);
          originalScalarSlots.set(node.id, slot);
        }
      }
      budget.chargeWork(4 + originalScalarSlots.size * 2);
      const actualScalarSlots: ScalarSlotState = {active: new Set(originalScalarSlots.keys()), members: Object.freeze([...originalScalarSlots.values()])};

      budget.chargeWork(12);
      const sharedMetadata: SemanticGraphMetadata = Object.freeze({model: graph.model, origins: graph.origins,
        schemaAnnotations: graph.schemaAnnotations, schemaRetained: graph.schemaRetained, loading: graph.loading});
      const buildContext = (kind: SemanticContext['kind'], members: readonly NodeId[], changes: ReadonlyMap<NodeId, GraphNode>, changedSlots: ReadonlyMap<NodeId, readonly ReferenceSlot[]>, changedEdges: ReadonlyMap<NodeId, readonly NodeId[]>, rawTypes: readonly RawComplexTypeProperties[] = [], rawSimpleTypes: readonly RawSimpleTypeProperties[] = [], rawElements: readonly RawElementProperties[] = [], rawGroups: readonly RawAttributeGroupProperties[] = [], notations: NotationState = actualNotations, scalarSlots: ScalarSlotState = actualScalarSlots, rawAttributes: readonly RawAttributeProperties[] = []): SemanticContext => {
        budget.chargeWork(5);
        const membership = new Set<NodeId>();
        const rawProperties = new Map<NodeId, RawComplexTypeProperties>();
        const rawSimpleProperties = new Map<NodeId, RawSimpleTypeProperties>();
        const rawSimpleSlots = new Map<NodeId, readonly SemanticReferenceSlot[]>();
        const rawComplexSlots = new Map<NodeId, readonly SemanticReferenceSlot[]>(), rawComplexEdges = new Map<NodeId, readonly NodeId[]>();
        const rawElementProperties = new Map<NodeId, RawElementProperties>();
        const rawAttributeProperties = new Map<NodeId, RawAttributeProperties>();
        const rawGroupProperties = new Map<NodeId, RawAttributeGroupProperties>();
        let expectedMembers = originals.size;
        for (const id of changes.keys()) {key(id); if (!originals.has(id)) expectedMembers++;}
        const reverse = new Map<NodeId, NodeId[]>();
        const slotsFor = (id: NodeId): readonly SemanticReferenceSlot[] => rawComplexSlots.get(id) ?? rawSimpleSlots.get(id) ?? changedSlots.get(id) ?? originalSlots.get(id) ?? [];
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
          const references: SemanticReferenceSlot[] = [Object.freeze({path: '$raw/derivation/base', reference: properties.derivation.base})];
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
          const rawSlots: SemanticReferenceSlot[] = [Object.freeze({path: '$raw/base', reference: properties.base})];
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
          if (properties.type) {
            const original = changedSlots.get(properties.element) ?? originalSlots.get(properties.element) ?? [];
            budget.chargeWork(5 + original.length * 2);
            rawComplexSlots.set(properties.element, Object.freeze([...original.filter(slot => slot.path !== 'type'), Object.freeze({path: '$raw/type', reference: properties.type})]));
          }
        }
        for (const properties of rawAttributes) {
          if (!validateRawAttributeShape(properties, budget)) throw new InvalidContext('representation');
          key(properties.attribute);
          if (requireMember(properties.attribute).kind !== 'attribute' || rawAttributeProperties.has(properties.attribute)) throw new InvalidContext('representation', properties.attribute);
          budget.chargeWork(5); rawAttributeProperties.set(properties.attribute, properties);
          rawComplexSlots.set(properties.attribute, Object.freeze([Object.freeze({path: '$raw/type', reference: properties.type})]));
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
        const requireScalarSlot = (reference: OriginalGeneratedScalarReference, original = false): void => {
          key(reference.owner);
          if (!originalScalarSlots.has(reference.owner)) throw new InvalidContext('missing', reference.owner);
          if (!original && !scalarSlots.active.has(reference.owner)) throw new InvalidContext('outside-context', reference.owner);
        };
        const rawReference = (owner: NodeId, reference: SemanticTypeReference, edges: NodeId[], original = false): void => {
          assertSemanticTypeReferenceShape(reference, budget);
          // These records came from the frozen graph/delta snapshot, never the
          // mutable caller. Ownership is not selected-context resolution.
          budget.chargeWork(); ownedTypeReferences.add(reference);
          if (reference.kind === 'original-generated') {requireScalarSlot(reference, original); return;}
          const id = target(reference);
          if (id === undefined) return;
          const node = original ? originals.get(id) : requireMember(id);
          if (!node) throw new InvalidContext('reference', owner);
          if ((node.kind !== 'simpleType' && node.kind !== 'complexType') || reference.kind === 'symbol' && reference.role !== 'type') throw new InvalidContext('reference', owner);
          if (!original) {budget.chargeWork(); edges.push(id);}
        };
        for (const properties of rawSimpleTypes) {
          budget.chargeWork(3); const edges: NodeId[] = [];
          rawReference(properties.type, properties.base, edges);
          if (properties.variety.kind === 'list') rawReference(properties.type, properties.variety.item, edges);
          if (properties.variety.kind === 'union') for (const member of properties.variety.members) rawReference(properties.type, member, edges);
          if (properties.facetBinding) rawReference(properties.type, properties.facetBinding.type, [], true);
          for (const layer of properties.facetLayers ?? properties.facetComponentSet ?? []) for (const facet of layer.facets) {
            budget.chargeWork(2); const operand = facet.operand; if (!operand) continue;
            if (operand.context === 'active') {requireMember(operand.owner); rawReference(properties.type, operand.type, edges);}
            else {
              key(operand.owner); if (!originals.has(operand.owner)) throw new InvalidContext('reference', properties.type);
              rawReference(properties.type, operand.type, [], true);
            }
          }
          rawEdges.set(properties.type, edges);
        }
        for (const properties of rawElements) if (properties.type) rawReference(properties.element, properties.type, []);
        for (const properties of rawAttributes) rawReference(properties.attribute, properties.type, []);
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
            if (slot.reference.kind === 'original-generated') {requireScalarSlot(slot.reference); continue;}
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
            // A scalar slot is a distinct component. Its lazy property owner
            // checks scalar dependency cycles; the provenance owner is no edge.
            if (slot.reference.kind === 'original-generated') continue;
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
        const ownTypeReference = (input: SemanticTypeReference): SemanticTypeReference => {
          authenticate(); budget.chargeWork(3);
          if (ownedTypeReferences.has(input)) return input;
          // Canonical known references also include non-type symbols. Reuse
          // their immutable storage only after the semantic shape/role gate.
          const safe = knownReferences.has(input) ? input : budget.freeze(budget.snapshot(input));
          assertSemanticTypeReferenceShape(safe, budget);
          budget.chargeWork(); ownedTypeReferences.add(safe);
          return safe;
        };
        context = Object.freeze({
          contextId, profileVersion: GRAPH_MODEL, contractVersion: SEMANTIC_CONTEXT_CONTRACT,
          kind, acceptance: 'structural-only', membership: membership.size === expectedMembers ? 'complete-actual-plus-additions' : 'structural-subset', budget, members: frozenMembers,
          scalarSlots: scalarSlots.members,
          scalarSlotMembership: scalarSlots.active.size === originalScalarSlots.size ? 'complete-original' : 'structural-subset',
          lookupScalarSlot(input: OriginalGeneratedScalarReference): ContextScalarSlotLookup {
            const selected = ownTypeReference(input);
            if (selected.kind !== 'original-generated') throw new SemanticContextAccessError('reference');
            key(selected.owner); budget.chargeWork(5);
            const slot = originalScalarSlots.get(selected.owner);
            return Object.freeze(!slot ? {kind: 'missing', slot: selected}
              : !scalarSlots.active.has(selected.owner) ? {kind: 'outside-context', slot} : {kind: 'found', slot});
          },
          notationMembers: notations.members,
          notationMembership: notations.active.size === originalNotations.size + notations.additions.size ? 'complete-original-plus-additions' : 'structural-subset',
          notationUniverse: sourceSchemas !== undefined ? 'source-bound' : 'retained-only',
          lookupNotation(input: ExpandedName): ContextNotationLookup {
            authenticate();
            const name = notationName(budget.freeze(budget.snapshot(input)));
            const id = notationNameKey(name, budget), original = originalNotations.get(id), addition = notations.additions.get(id);
            budget.chargeWork(12);
            if ((original || addition) && !notations.active.has(id)) return Object.freeze({kind: 'outside-context', name});
            if (original) return original.conflicting ? Object.freeze({kind: 'unresolved', name, rule: 'notation-original-properties'})
              : Object.freeze({kind: 'found', properties: original.properties, origin: 'original'});
            if (sourceSchemas === undefined) return Object.freeze({kind: 'unresolved', name, rule: 'notation-source-universe'});
            if (addition) return Object.freeze({kind: 'found', properties: addition, origin: 'addition'});
            if (notations.active.size !== originalNotations.size + notations.additions.size) return Object.freeze({kind: 'unresolved', name, rule: 'notation-active-membership'});
            return Object.freeze({kind: 'missing', name});
          },
          lookup,
          ownTypeReference,
          resolve(reference: Reference): ContextResolution {
            authenticate();
            try {
              budget.chargeWork(2);
              const safe = knownReferences.has(reference) || ownedTypeReferences.has(reference) ? reference : budget.freeze(budget.snapshot(reference));
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
          originalSourceComponentAbsent(id: NodeId): boolean {authenticate(); key(id); return absentOriginals.has(id);},
          originalContext(): SemanticContext {authenticate(); return actual;},
          sourceSchemaRetained(): CanonicalGraph['schemaRetained'] {authenticate(); return graph.schemaRetained;},
          rawTypeProperties(id: NodeId): RawComplexTypeProperties | undefined {checked(id); return rawProperties.get(id);},
          rawSimpleTypeProperties(id: NodeId): RawSimpleTypeProperties | undefined {checked(id); return rawSimpleProperties.get(id);},
          rawElementProperties(id: NodeId): RawElementProperties | undefined {checked(id); return rawElementProperties.get(id);},
          rawAttributeProperties(id: NodeId): RawAttributeProperties | undefined {checked(id); return rawAttributeProperties.get(id);},
          rawAttributeGroupProperties(id: NodeId): RawAttributeGroupProperties | undefined {checked(id); return rawGroupProperties.get(id);},
          references(id: NodeId): readonly SemanticReferenceSlot[] {checked(id); return slotsFor(id);},
          owner(id: NodeId): NodeId | undefined {const node = checked(id); return node.identity.kind === 'scoped' ? node.identity.owner : undefined;},
          incomingAffiliates(id: NodeId): readonly NodeId[] {checked(id); return reverse.get(id) ?? empty;},
        });
        contexts.add(context); metadata.set(context, sharedMetadata);
        requests.set(context, requestAuthority);
        states.set(context, {changes, slots: changedSlots, edges: changedEdges, raw: rawProperties, simple: rawSimpleProperties,
          elements: rawElementProperties, attributes: rawAttributeProperties, groups: rawGroupProperties, notations, scalarSlots});
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
          const rawAttributes = dataField(input, 'rawAttributes'), inputScalarSlots = dataField(input, 'scalarSlots');
          const notationDelta = dataField(input, 'notations');
          const notationActive = notationDelta === undefined ? undefined : dataField(notationDelta, 'active');
          const notationAdditions = notationDelta === undefined ? undefined : dataField(notationDelta, 'additions');
          if (typeof candidateKey !== 'string' || !Array.isArray(candidateActive)
            || (additions !== undefined && !Array.isArray(additions)) || (rawTypes !== undefined && !Array.isArray(rawTypes))
            || (rawGroups !== undefined && !Array.isArray(rawGroups)) || (rawSimpleTypes !== undefined && !Array.isArray(rawSimpleTypes)) || (rawElements !== undefined && !Array.isArray(rawElements))
            || (rawAttributes !== undefined && !Array.isArray(rawAttributes)) || (inputScalarSlots !== undefined && !Array.isArray(inputScalarSlots))) throw new InvalidContext('representation');
          if (notationDelta !== undefined && (!Array.isArray(notationActive) || (notationAdditions !== undefined && !Array.isArray(notationAdditions)))) throw new InvalidContext('representation');
          budget.reserveNodes((additions ? dataField(additions, 'length') as number : 0) + (endpoint ? 1 : 0)
            + (notationAdditions ? dataField(notationAdditions, 'length') as number : 0));
          const delta = budget.freeze(budget.snapshot(input));
          budget.chargeWork(12 + delta.active.length + parent.changes.size * 2 + parent.slots.size * 2 + parent.edges.size * 2
            + parent.raw.size * 2 + parent.simple.size * 2 + parent.elements.size * 2 + parent.attributes.size * 2 + parent.groups.size * 2);
          const changes = new Map(parent.changes), slots = new Map(parent.slots), edges = new Map(parent.edges);
          const raw = new Map(parent.raw), simple = new Map(parent.simple), elements = new Map(parent.elements), attributes = new Map(parent.attributes), groups = new Map(parent.groups);
          const active = new Set(delta.active);
          let scalarSlots = parent.scalarSlots;
          if (delta.scalarSlots !== undefined) {
            budget.chargeWork(4); const selected = new Set<NodeId>(), members: OriginalGeneratedScalarReference[] = [];
            for (const reference of delta.scalarSlots) {
              assertSemanticTypeReferenceShape(reference, budget);
              if (reference.kind !== 'original-generated') throw new InvalidContext('representation');
              key(reference.owner); const slot = originalScalarSlots.get(reference.owner);
              if (!slot) throw new InvalidContext('missing', reference.owner);
              if (selected.has(reference.owner)) throw new InvalidContext('identity', reference.owner);
              budget.chargeWork(2); selected.add(reference.owner); members.push(slot);
            }
            budget.chargeWork(2 + members.length); scalarSlots = {active: selected, members: Object.freeze(members)};
          }
          let notations = parent.notations;
          if (delta.notations !== undefined) {
            budget.chargeWork(4 + parent.notations.additions.size * 2);
            const additions = new Map(parent.notations.additions), selected = new Set<string>(), names: ExpandedName[] = [];
            for (const rawName of delta.notations.active) {
              const name = notationName(rawName), id = notationNameKey(name, budget);
              if (selected.has(id)) throw new InvalidContext('identity', id);
              budget.chargeWork(2); selected.add(id); names.push(name);
            }
            for (const rawProperties of delta.notations.additions ?? []) {
              const properties = notationProperties(rawProperties), id = notationNameKey(properties.name, budget);
              if (originalNotations.has(id) || additions.has(id)) throw new InvalidContext('identity', id);
              if (!selected.has(id)) throw new InvalidContext('outside-context', id);
              budget.chargeWork(); additions.set(id, properties);
            }
            for (const id of selected) {key(id); if (!originalNotations.has(id) && !additions.has(id)) throw new InvalidContext('missing', id);}
            budget.chargeWork(4 + names.length);
            notations = {additions, active: selected, members: Object.freeze(names)};
          }
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
          budget.chargeWork(4); const seenRaw = new Set<NodeId>(), seenSimple = new Set<NodeId>(), seenElements = new Set<NodeId>(), seenAttributes = new Set<NodeId>(), seenGroups = new Set<NodeId>();
          const unique = (id: NodeId, seen: Set<NodeId>): void => {key(id); if (seen.has(id)) throw new InvalidContext('identity', id); budget.chargeWork(); seen.add(id);};
          for (const row of delta.rawTypes ?? []) {assertRawComplexTypeShape(row, budget); permittedProperty(row.type); unique(row.type, seenRaw); budget.chargeWork(); raw.set(row.type, row);}
          for (const row of delta.rawSimpleTypes ?? []) {if (!validateRawSimpleTypeShape(row, budget)) throw new InvalidContext('representation'); permittedProperty(row.type); unique(row.type, seenSimple); budget.chargeWork(); simple.set(row.type, row);}
          for (const row of delta.rawElements ?? []) {if (!validateRawElementShape(row, budget)) throw new InvalidContext('representation'); permittedProperty(row.element); unique(row.element, seenElements); budget.chargeWork(); elements.set(row.element, row);}
          for (const row of delta.rawAttributes ?? []) {if (!validateRawAttributeShape(row, budget)) throw new InvalidContext('representation'); permittedProperty(row.attribute); unique(row.attribute, seenAttributes); budget.chargeWork(); attributes.set(row.attribute, row);}
          for (const row of delta.rawAttributeGroups ?? []) {validateRawAttributeGroupShape(row, budget); permittedProperty(row.group); unique(row.group, seenGroups); budget.chargeWork(); groups.set(row.group, row);}
          budget.chargeWork(5 + raw.size + simple.size + elements.size + attributes.size + groups.size);
          const context = buildContext('candidate', delta.active, changes, slots, edges, [...raw.values()], [...simple.values()], [...elements.values()], [...groups.values()], notations, scalarSlots, [...attributes.values()]);
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
