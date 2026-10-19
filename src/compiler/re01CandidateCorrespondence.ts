/** Literal endpoint/property correspondence. No normalized-language equivalence. */
import type {GraphNode, NodeId, Reference} from './canonicalGraph.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import {assertSemanticContext, contextsShareRequest, isSemanticCandidateOf} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import type {RawComplexTypeProperties} from './re01TypeProperties.js';
import {RE01_DERIVATION_DOMAIN} from './re01TypeProperties.js';
import {deriveActualComplexContent, particleContentNode} from './complexTypeContent.js';
import type {ParticleContentView} from './complexTypeContent.js';
import {assessSourceAttributeUses} from './schemaAttributeUses.js';
import {compareSchemaFacetProperties, createSchemaScalarKernel} from './schemaScalarKernel.js';
import type {ScalarResult} from './schemaScalarKernel.js';
import type {ScalarObligation} from './scalarSchemaAssessment.js';
import type {RawAttributeGroupProperties} from './schemaAttributeGroupProperties.js';
import {checkTypeDerivation, declarationMethods, immediateTypeBase, RelationProblem} from './schemaTypeRelations.js';
import {namespaceSetSubset, wildcardNamespaces} from './wildcardAlgebra.js';
import type {SemanticTypeDependency, SemanticTypeReference} from './semanticTypeReference.js';
import {declaredType, resolveSemanticType, semanticTypeKey} from './schemaTypeIdentity.js';
import {collectSemanticTypeDependencies} from './semanticTypeDependencies.js';

export type CorrespondenceFailure = Readonly<{kind: 'invalid-schema' | 'candidate-rejected' | 'invalid-evidence' | 'unresolved' | 'unsupported-capability';
  rule: string; component?: NodeId; contextId?: string; message: string}>;
export type CorrespondenceReceipt = Readonly<{kind: 'checked'; authority: typeof RE01_DERIVATION_DOMAIN;
  parentContext: string; contextId: string; target: NodeId; intermediate: NodeId; ancestor: SemanticTypeReference;
  originalProperties: readonly NodeId[]; fresh: readonly NodeId[];
  scalarObligations: readonly Readonly<{contextId: string; obligation: ScalarObligation}>[];
  typeDependencies: readonly SemanticTypeDependency[]}>;
export type CorrespondenceResult = CorrespondenceReceipt | CorrespondenceFailure | ResourceLimitFailure;
export type Re01FreshAffiliationObstruction = Readonly<{
  kind: 'proved-no-construction'; domain: typeof RE01_DERIVATION_DOMAIN;
  scope: 'contextual-nonprimitive-two-step'; criterion: 'mandatory-fresh-affiliate-fixed-complex-ancestry';
  actualContextId: string; contextId: string; target: NodeId; ancestor: SemanticTypeReference;
  affiliate: NodeId; head: NodeId; headType: NodeId;
}>;
export type Re01FreshAffiliationResult = Re01FreshAffiliationObstruction | Readonly<{
  kind: 'not-established'; contextId: string; target: NodeId; message: string;
}> | CorrespondenceFailure | ResourceLimitFailure;
const issued = new WeakMap<object, SemanticContext>();
type Mapped = Readonly<{properties: RawComplexTypeProperties; context: SemanticContext; view?: ParticleContentView;
  synthetic: readonly NodeId[]; scalarObligations: readonly ScalarObligation[]; typeDependencies: readonly SemanticTypeDependency[]}>;
const actualMappings = new WeakMap<SemanticContext, Map<NodeId, Mapped>>();
const actualGroupMappings = new WeakMap<SemanticContext, Map<NodeId, Readonly<{
  properties: RawAttributeGroupProperties; scalarObligations: readonly ScalarObligation[]; typeDependencies: readonly SemanticTypeDependency[];
}>>>();
const ANY_TYPE: Reference = Object.freeze({kind: 'builtin', name: Object.freeze({namespace: XSD_NAMESPACE, local: 'anyType'})});
class CorrespondenceAbort extends Error {
  constructor(readonly result: CorrespondenceFailure | ResourceLimitFailure) {super(result.kind);}
}
export function assertCandidateCorrespondence(context: SemanticContext, receipt: CorrespondenceReceipt): void {
  assertSemanticContext(context);
  if (issued.get(receipt) !== context) throw new TypeError('Unauthenticated candidate correspondence');
}

/** The selected ancestor is computed from the complete context, never selected by a caller label. */
export function re01Ancestor(context: SemanticContext, target: NodeId): Readonly<{kind: 'checked'; ancestor: SemanticTypeReference; typeDependencies: readonly SemanticTypeDependency[]}> | CorrespondenceFailure | ResourceLimitFailure {
  assertSemanticContext(context);
  const result = context.budget.guard<Readonly<{kind: 'checked'; ancestor: SemanticTypeReference; typeDependencies: readonly SemanticTypeDependency[]}> | CorrespondenceFailure | ResourceLimitFailure>(() => {
    const b = context.budget; b.chargeWork(4);
    const dependencies = collectSemanticTypeDependencies(context);
    const first = immediateTypeBase(context, {kind: 'local', target});
    if (first.kind === 'resource-limit') return first;
    if (first.kind !== 'checked' || !first.value) return {kind: 'unresolved', rule: 'ancestor-domain', component: target, message: 'Original immediate base is unavailable'};
    dependencies.add(first.typeDependencies);
    const seen = new Set<string>(); let current: SemanticTypeReference = first.value;
    for (;;) {
      const resolved = resolveSemanticType(context, current);
      if (!('identity' in resolved)) return {kind: 'unresolved', rule: 'ancestor-domain', component: target, message: 'Ancestor is unavailable'};
      // The ur-type's actual base property is itself; the general ancestry
      // accessor stops there to avoid treating ordinary cycles as legal.
      if (resolved.kind === 'builtin' && resolved.name.local === 'anyType') return {kind: 'checked', ancestor: current, typeDependencies: dependencies.snapshot()};
      const key = semanticTypeKey(context, resolved.identity);
      b.chargeWork(4 + key.length);
      if (seen.has(key)) return {kind: 'invalid-evidence', rule: 'ancestor-cycle', component: target, message: 'Ancestor chain is cyclic'};
      seen.add(key);
      const parent = immediateTypeBase(context, current);
      if (parent.kind !== 'checked') return parent.kind === 'resource-limit' ? parent : {kind: 'unresolved', rule: parent.rule, component: target, message: parent.message};
      dependencies.add(parent.typeDependencies);
      if (!parent.value) return {kind: 'unresolved', rule: 'ancestor-domain', component: target, message: 'No proper ancestor with ur-type base'};
      const next = resolveSemanticType(context, parent.value);
      if (next.kind === 'builtin' && next.name.namespace === XSD_NAMESPACE && next.name.local === 'anyType') {
        b.chargeWork(4); return Object.freeze({kind: 'checked', ancestor: current, typeDependencies: dependencies.snapshot()});
      }
      current = parent.value;
    }
  });
  return result.kind === 'resource-limit' ? result : context.budget.guard(() => context.budget.freeze(context.budget.snapshot(result)));
}

/** A sufficient contextual contradiction, not a complete RE01 decision.
 * Every fresh affiliate remains a child legality root in domain B. A complex
 * head outside X -> E -> A's fixed chain cannot satisfy e-props-correct.4.
 */
export function proveRe01FreshAffiliationObstruction(actual: SemanticContext, parent: SemanticContext,
  target: NodeId): Re01FreshAffiliationResult {
  assertSemanticContext(actual); assertSemanticContext(parent);
  const b = parent.budget;
  return b.guard(() => {
    if (!contextsShareRequest(parent, actual)) throw new TypeError('Contexts belong to different requests');
    b.chargeWork(8);
    const publish = <T>(result: T): T => b.freeze(b.snapshot(result));
    const unresolved = (rule: string, message: string): CorrespondenceFailure => {
      b.chargeWork(8);
      return publish({kind: 'unresolved', rule, message, contextId: parent.contextId, component: target});
    };
    const unknown = (message: string): Re01FreshAffiliationResult => {
      b.chargeWork(6);
      return publish({kind: 'not-established', contextId: parent.contextId, target, message});
    };
    const key = (reference: SemanticTypeReference): string | undefined => {
      const found = resolveSemanticType(parent, reference);
      return 'identity' in found ? semanticTypeKey(parent, found.identity) : undefined;
    };
    try {
      if (actual.kind !== 'actual' || actual.membership !== 'complete-actual-plus-additions'
        || parent.membership !== 'complete-actual-plus-additions')
        return unresolved('complete-domain-membership', 'The contradiction requires the complete immutable actual and parent environments');
      if (typeof target !== 'string' || !target) throw new TypeError('Expected a target component ID');
      const selected = parent.lookup(target);
      if (selected.kind !== 'found' || selected.node.kind !== 'complexType')
        return unknown('The target is not an available complex extension');
      const raw = parent.rawTypeProperties(target);
      if (!raw && !parent.sourceNode(target) || parent.rawSimpleTypeProperties(target))
        return unresolved('missing-type-component-properties', 'The complex target requires its exact derivation properties');
      if ((raw?.derivation.method ?? selected.node.derivation?.kind ?? 'restriction') !== 'extension')
        return unknown('Only nonprimitive complex extensions require this two-step construction');
      const first = immediateTypeBase(parent, {kind: 'local', target});
      if (first.kind === 'resource-limit') return first;
      if (first.kind !== 'checked' || !first.value) return unresolved('ancestor-domain', 'The target immediate base is unavailable');
      const base = resolveSemanticType(parent, first.value);
      if (base.kind !== 'component' || base.node.kind !== 'complexType')
        return unknown('Simple-base and ur-type extensions are outside this obstruction');
      const designated = re01Ancestor(parent, target);
      if (designated.kind !== 'checked') return designated;
      const ancestorKey = key(designated.ancestor), firstKey = key(first.value);
      if (!ancestorKey || !firstKey) return unresolved('ancestor-domain', 'Exact ancestor identity is unavailable');
      if (b.compareText(firstKey, ancestorKey) === 0)
        return unknown('Primitive no-change does not introduce a restriction edge');

      for (const id of parent.members) {
        b.chargeWork();
        // Original declarations available in H are not necessarily legality
        // roots. Fresh declarations, including inherited ones, always are.
        if (actual.lookup(id).kind === 'found') continue;
        const found = parent.lookup(id);
        if (found.kind !== 'found' || found.node.kind !== 'element' || found.node.identity.kind !== 'global'
          || !found.node.substitutionGroup) continue;
        const memberType = resolveSemanticType(parent, declaredType(parent, found.node));
        if (memberType.kind !== 'component' || b.compareText(memberType.node.id, target) !== 0) continue;
        const head = parent.resolve(found.node.substitutionGroup);
        if (head.kind !== 'found' || head.node.kind !== 'element' || head.node.identity.kind !== 'global')
          return unresolved('e-props-correct.4', 'The mandatory affiliate lacks its exact global head');
        const headReference = declaredType(parent, head.node), headType = resolveSemanticType(parent, headReference);
        if (headType.kind !== 'component' || headType.node.kind !== 'complexType') continue;
        if (b.compareText(headType.node.id, target) === 0) continue; // Identity precedes derivation exclusions.
        if (parent.rawSimpleTypeProperties(headType.node.id))
          return unresolved('missing-type-component-properties', 'The head requires unambiguous complex type properties');
        const path = checkTypeDerivation(parent, designated.ancestor, headReference, []);
        if (path.kind === 'resource-limit') return path;
        if (path.kind !== 'checked') return unresolved(path.rule, path.message);
        if (path.value) continue; // B can already be on the fixed A ancestry.
        const headBase = immediateTypeBase(parent, headReference);
        if (headBase.kind === 'resource-limit') return headBase;
        if (headBase.kind !== 'checked' || !headBase.value) return unresolved('ancestor-domain', 'The head type immediate base is unavailable');
        const headRaw = parent.rawTypeProperties(headType.node.id);
        if (!headRaw && !parent.sourceNode(headType.node.id))
          return unresolved('missing-type-component-properties', 'The head type requires its exact immediate derivation');
        const headBaseKey = key(headBase.value);
        if (!headBaseKey) return unresolved('ancestor-domain', 'The head type base identity is unavailable');
        if ((headRaw?.derivation.method ?? headType.node.derivation?.kind ?? 'restriction') === 'extension'
          && b.compareText(headBaseKey, ancestorKey) === 0) continue; // Existing B may itself be E.
        b.chargeWork(14);
        return publish({kind: 'proved-no-construction', domain: RE01_DERIVATION_DOMAIN,
          scope: 'contextual-nonprimitive-two-step', criterion: 'mandatory-fresh-affiliate-fixed-complex-ancestry',
          actualContextId: actual.contextId, contextId: parent.contextId, target, ancestor: designated.ancestor,
          affiliate: id, head: head.node.id, headType: headType.node.id} as const);
      }
      return unknown('No mandatory fresh affiliate satisfies the fixed complex ancestry contradiction');
    } catch (error) {
      if (error instanceof RelationProblem) return unresolved(error.result.rule, error.message);
      throw error;
    }
  });
}

export function checkCandidateCorrespondence(actual: SemanticContext, parent: SemanticContext, candidate: SemanticContext,
  target: NodeId, intermediate: NodeId, ancestor: SemanticTypeReference): CorrespondenceResult {
  assertSemanticContext(actual); assertSemanticContext(parent); assertSemanticContext(candidate);
  const b = candidate.budget, charge = b.chargeWork;
  return b.guard(() => {
    const typeDependencies = collectSemanticTypeDependencies(candidate);
    if (!contextsShareRequest(actual, parent) || !isSemanticCandidateOf(parent, candidate)) throw new TypeError('Candidate is not an authenticated direct child of this request');
    const suppliedAncestor = b.freeze(b.snapshot(ancestor));
    const fail = (rule: string, component: NodeId | undefined, message: string, kind: CorrespondenceFailure['kind'] = 'candidate-rejected'): never => {
      charge(12 + rule.length + message.length + (component?.length ?? 0));
      throw new CorrespondenceAbort(Object.freeze({kind, rule, component, message}));
    };
    const node = (context: SemanticContext, id: NodeId): GraphNode => {
      const found = context.lookup(id);
      return found.kind === 'found' ? found.node : fail('complete-domain-membership', id, 'Required component is unavailable', 'unresolved');
    };
    const refKey = (context: SemanticContext, reference: SemanticTypeReference): string => {
      const found = resolveSemanticType(context, reference);
      // Preservation compares an available type's identity. Full validity is
      // owed through its semantic owners, not through an unrelated raw read.
      if ('identity' in found) return semanticTypeKey(context, found.identity);
      return fail('reference-correspondence', undefined, 'Correspondence reference is unavailable', 'unresolved');
    };
    const sameSet = (a: readonly string[], c: readonly string[]): boolean => {
      charge(4); const x = new Set<string>(), y = new Set<string>();
      for (const id of a) {charge(2 + id.length); x.add(id);}
      for (const id of c) {charge(2 + id.length); y.add(id);}
      if (x.size !== y.size) return false;
      for (const id of x) {charge(1 + id.length); if (!y.has(id)) return false;}
      return true;
    };
    charge(4); const scalarObligations: {contextId: string; obligation: ScalarObligation}[] = [];
    const scalarValue = <T>(context: SemanticContext, result: ScalarResult<T>): T => {
      if (result.kind !== 'checked') {
        if (result.kind === 'resource-limit') throw new CorrespondenceAbort(result);
        const origin = result.contextId ?? context.contextId;
        charge(5);
        throw new CorrespondenceAbort(Object.freeze({...result, contextId: origin,
          kind: result.kind === 'invalid-schema' && origin !== actual.contextId ? 'candidate-rejected' : result.kind}));
      }
      typeDependencies.add(result.typeDependencies);
      for (const obligation of result.obligations) {charge(3); scalarObligations.push({contextId: obligation.contextId ?? context.contextId, obligation});}
      return result.value;
    };
    const compareSimple = (id: NodeId): void => {
      charge(4); const reference: Reference = {kind: 'local', target: id};
      const left = scalarValue(parent, createSchemaScalarKernel(parent).contentProperties(reference, id));
      const right = scalarValue(candidate, createSchemaScalarKernel(candidate).contentProperties(reference, id));
      const text = (a: string | undefined, c: string | undefined): boolean => a === undefined || c === undefined
        ? a === c : b.compareText(a, c) === 0;
      // Equal definition IDs across two contexts do not prove equal properties.
      // These references retain component identity; structural substitution is
      // the separate cos-particle-extend equality owner's task.
      if (!text(left.definition, right.definition) || !text(left.name?.namespace, right.name?.namespace)
        || !text(left.name?.local, right.name?.local) || !text(left.targetNamespace, right.targetNamespace)
        || !sameSet(left.final, right.final) || left.variety !== right.variety || !text(left.primitive, right.primitive)
        || Boolean(left.base) !== Boolean(right.base) || Boolean(left.item) !== Boolean(right.item)
        || (left.members?.length ?? 0) !== (right.members?.length ?? 0))
        return fail('original-simple-property-correspondence', id, 'Original simple type metadata changed');
      if (left.base && right.base && refKey(parent, left.base) !== refKey(candidate, right.base)
        || left.item && right.item && refKey(parent, left.item) !== refKey(candidate, right.item))
        return fail('original-simple-property-correspondence', id, 'Original scalar base or item identity changed');
      for (let index = 0; index < (left.members?.length ?? 0); index++) {
        charge();
        if (refKey(parent, left.members![index]!) !== refKey(candidate, right.members![index]!))
          return fail('original-simple-property-correspondence', id, 'Original ordered scalar member identity changed');
      }
      const facets = compareSchemaFacetProperties(parent, reference, id, candidate, reference, id);
      if (facets.kind === 'resource-limit') throw new CorrespondenceAbort(facets);
      if (facets.kind !== 'checked') {
        if (facets.side === 'comparison') return fail(facets.rule, id, facets.message, 'unresolved');
        charge(8);
        throw new CorrespondenceAbort(Object.freeze({kind: facets.kind === 'invalid-schema' && facets.contextId !== actual.contextId
          ? 'candidate-rejected' : facets.kind, rule: facets.rule, component: facets.component, contextId: facets.contextId, message: facets.message}));
      }
      typeDependencies.add(facets.typeDependencies);
      for (const obligation of facets.obligations) {
        charge(3);
        if (!obligation.contextId) return fail('scalar-obligation-context', id, 'Cross-context scalar obligation lacks its originating context', 'unresolved');
        scalarObligations.push({contextId: obligation.contextId, obligation});
      }
      if (!facets.value) return fail('original-simple-property-correspondence', id, 'Original simple type facet properties changed');
      // Only the shared private facet owner can compare complete annotation
      // data or the identity of an originally bound facet component. Aggregate
      // presence alone cannot establish full annotation correspondence.
      if (facets.annotationCorrespondence === 'different')
        return fail('original-facet-annotation-correspondence', id, 'Original facet annotation properties changed');
      if (facets.annotationCorrespondence !== 'equal') return fail('original-facet-annotation-correspondence', id,
        'Original facet annotations require exact supplied data or original component binding', 'unresolved');
    };
    const mapped = (id: NodeId): Mapped => {
      const prior = parent.rawTypeProperties(id);
      if (prior) {charge(8); return {properties: prior, context: parent, synthetic: [], scalarObligations: [], typeDependencies: []};}
      let cache = actualMappings.get(actual);
      if (!cache) {charge(2); cache = new Map(); actualMappings.set(actual, cache);}
      const cached = cache.get(id);
      if (cached) {
        typeDependencies.add(cached.typeDependencies);
        for (const obligation of cached.scalarObligations) {charge(3); scalarObligations.push({contextId: obligation.contextId ?? actual.contextId, obligation});}
        return cached;
      }
      const original = node(actual, id);
      if (original.kind !== 'complexType') return fail('original-property-correspondence', id, 'Expected an original complex type', 'invalid-evidence');
      const content = deriveActualComplexContent(actual, id), attrs = assessSourceAttributeUses(actual, id);
      if (content.kind !== 'checked') throw new CorrespondenceAbort(content.kind === 'resource-limit' ? content
        : {...content, kind: content.kind === 'invalid-input' ? 'invalid-evidence' : 'unresolved'});
      if (attrs.kind !== 'checked') throw new CorrespondenceAbort(attrs);
      typeDependencies.add(attrs.typeDependencies);
      for (const obligation of attrs.scalarObligations) {charge(3); scalarObligations.push({contextId: obligation.contextId ?? actual.contextId, obligation});}
      charge(20 + attrs.value.uses.length);
      const properties: RawComplexTypeProperties = {
        type: id, derivation: {method: original.derivation?.kind ?? 'restriction', base: original.derivation?.base ?? ANY_TYPE},
        targetNamespace: original.context.effectiveNamespace,
        abstract: original.abstract, final: declarationMethods(actual, original, 'final') as RawComplexTypeProperties['final'],
        block: declarationMethods(actual, original, 'block') as RawComplexTypeProperties['block'], content: content.view.content,
        attributeUses: attrs.value.uses.map(use => use.id), wildcard: attrs.value.wildcard, provenance: {kind: 'actual-mapped', original: id},
      };
      charge(9); const result = Object.freeze({properties: b.freeze(b.snapshot(properties)), context: actual,
        view: content.view, synthetic: content.view.synthetic, scalarObligations: attrs.scalarObligations, typeDependencies: attrs.typeDependencies});
      cache.set(id, result); return result;
    };
    const typeNamespace = (context: SemanticContext, id: NodeId, properties: RawComplexTypeProperties): string => {
      const definition = node(context, id);
      if (properties.targetNamespace !== undefined) return properties.targetNamespace;
      if (definition.identity.kind === 'global') return definition.identity.name.namespace;
      const original = actual.sourceNode(id);
      if (original) return original.context.effectiveNamespace;
      return fail('original-type-target-namespace', id, 'An abstract scoped type lacks its namespace property', 'unresolved');
    };
    const mappedGroup = (id: NodeId): RawAttributeGroupProperties => {
      const prior = parent.rawAttributeGroupProperties(id);
      if (prior) return prior;
      let cache = actualGroupMappings.get(actual);
      if (!cache) {charge(2); cache = new Map(); actualGroupMappings.set(actual, cache);}
      const cached = cache.get(id);
      if (cached) {
        typeDependencies.add(cached.typeDependencies);
        for (const obligation of cached.scalarObligations) {charge(3); scalarObligations.push({contextId: obligation.contextId ?? actual.contextId, obligation});}
        return cached.properties;
      }
      const attrs = assessSourceAttributeUses(actual, id);
      if (attrs.kind !== 'checked') throw new CorrespondenceAbort(attrs);
      typeDependencies.add(attrs.typeDependencies);
      for (const obligation of attrs.scalarObligations) {charge(3); scalarObligations.push({contextId: obligation.contextId ?? actual.contextId, obligation});}
      charge(6 + attrs.value.uses.length);
      const properties = b.freeze(b.snapshot({group: id, attributeUses: attrs.value.uses.map(use => use.id), wildcard: attrs.value.wildcard}));
      cache.set(id, {properties, scalarObligations: attrs.scalarObligations, typeDependencies: attrs.typeDependencies}); return properties;
    };
    const compareContent = (left: Mapped, right: RawComplexTypeProperties): void => {
      const a = left.properties.content, c = right.content;
      if (a.kind !== c.kind) return fail('endpoint-content-variety', right.type, 'Original effective content variety changed');
      if (a.kind === 'empty') return;
      if (a.kind === 'simple' && c.kind === 'simple') {
        // Source complex facade describes the exact content definition, even
        // when a mapped anonymous simple type is not in the canonical graph.
        const sourceRef: SemanticTypeReference = left.context.kind === 'actual' ? {kind: 'local', target: right.type} : a.type;
        const x = scalarValue(left.context, createSchemaScalarKernel(left.context).contentIdentity(sourceRef, right.type));
        const y = scalarValue(candidate, createSchemaScalarKernel(candidate).contentIdentity(c.type, right.type));
        charge(x.definition.length + y.definition.length + 2);
        if (x.definition !== y.definition) return fail('endpoint-scalar-identity', right.type,
          'Original effective simple type identity was not retained');
        return;
      }
      if (a.kind === 'opaque-builtin' && c.kind === 'opaque-builtin') {
        if (refKey(left.context, a.type) !== refKey(candidate, c.type)) return fail('endpoint-builtin-identity', right.type, 'Opaque builtin identity changed');
        return;
      }
      if (!('particle' in a) || !('particle' in c)) return fail('endpoint-content-variety', right.type, 'Content property mismatch');
      charge(6 + left.synthetic.length); const synthetic = new Set(left.synthetic), forward = new Map<string, string>(), reverse = new Map<string, string>();
      charge(3); const pairs: [NodeId, NodeId][] = [[a.particle, c.particle]];
      while (pairs.length) {
        charge(3); const [xid, yid] = pairs.pop()!;
        if (!synthetic.has(xid)) {if (xid !== yid) return fail('endpoint-original-particle', right.type, 'Original declared particle identity changed'); continue;}
        if (forward.has(xid)) {if (forward.get(xid) !== yid) return fail('endpoint-particle-sharing', right.type, 'Shared generated particle was split'); continue;}
        if (reverse.has(yid)) return fail('endpoint-particle-sharing', right.type, 'Distinct generated particles were merged');
        charge(4); forward.set(xid, yid); reverse.set(yid, xid);
        const x = left.view && particleContentNode(left.context, left.view, xid), y = node(candidate, yid);
        if (x?.kind === 'particle' && y.kind === 'particle') charge(4 + x.occurs.min.length + x.occurs.max.length + y.occurs.min.length + y.occurs.max.length);
        if (x?.kind !== 'particle' || y.kind !== 'particle' || x.term.kind !== y.term.kind || x.occurs.min !== y.occurs.min || x.occurs.max !== y.occurs.max) return fail('endpoint-raw-particle', right.type, 'Generated raw particle structure changed');
        if ('children' in x.term && 'children' in y.term) {
          if (x.term.children.length !== y.term.children.length) return fail('endpoint-raw-particle', right.type, 'Generated compositor child count changed');
          for (let i = 0; i < x.term.children.length; i++) {charge(3); pairs.push([x.term.children[i]!, y.term.children[i]!]);}
        } else if (x.term.kind === 'any' && y.term.kind === 'any') {
          const xs = wildcardNamespaces(x.term.wildcard, charge), ys = wildcardNamespaces(y.term.wildcard, charge);
          if (x.term.wildcard.processContents !== y.term.wildcard.processContents || !namespaceSetSubset(xs, ys, charge) || !namespaceSetSubset(ys, xs, charge)) return fail('endpoint-raw-wildcard', right.type, 'Generated wildcard properties changed');
        } else return fail('endpoint-generated-kind', right.type, 'Unqualified generated content component', 'unresolved');
      }
    };
    try {
      if (actual.kind !== 'actual') return fail('actual-context', target, 'Original source context is required', 'invalid-evidence');
      if (parent.membership !== 'complete-actual-plus-additions' || candidate.membership !== 'complete-actual-plus-additions') return fail('complete-domain-membership', target, 'Semantic candidate must retain the complete available environment', 'unresolved');
      if (parent.scalarSlotMembership !== 'complete-original' || candidate.scalarSlotMembership !== 'complete-original')
        return fail('complete-scalar-slot-membership', target, 'Semantic candidate must retain every original scalar component', 'unresolved');
      const before = node(parent, target), endpoint = node(candidate, target), e = node(candidate, intermediate);
      if (before.kind !== 'complexType' || endpoint.kind !== 'complexType' || e.kind !== 'complexType') return fail('two-step-types', target, 'Endpoint and intermediate must be complex types', 'invalid-evidence');
      const computed = re01Ancestor(parent, target);
      if (computed.kind !== 'checked') throw new CorrespondenceAbort(computed);
      typeDependencies.add(computed.typeDependencies);
      if (refKey(parent, computed.ancestor) !== refKey(parent, suppliedAncestor)) return fail('ancestor-correspondence', target, 'Supplied ancestor differs from the original chain', 'invalid-evidence');
      const endProps = candidate.rawTypeProperties(target), middleProps = candidate.rawTypeProperties(intermediate);
      if (!endProps || !middleProps) return fail('raw-type-properties', target, 'Endpoint and intermediate need complete raw properties', 'unresolved');
      if (endProps.derivation.method !== 'restriction' || refKey(candidate, endProps.derivation.base) !== refKey(candidate, {kind: 'local', target: intermediate})
        || middleProps.derivation.method !== 'extension' || refKey(candidate, middleProps.derivation.base) !== refKey(candidate, suppliedAncestor)) return fail('two-step-construction', target, 'Expected extension from the designated ancestor then endpoint restriction');
      charge(4); const originalProperties: NodeId[] = [], fresh: NodeId[] = [];
      for (const id of candidate.members) {
        const original = parent.lookup(id);
        if (original.kind !== 'found') {charge(); fresh.push(id); continue;}
        const group = candidate.rawAttributeGroupProperties(id);
        const rawSimple = candidate.rawSimpleTypeProperties(id);
        const element = candidate.rawElementProperties(id);
        const attribute = candidate.rawAttributeProperties(id);
        const properties = candidate.rawTypeProperties(id);
        if ((group || rawSimple || element || attribute || properties) && candidate.originalSourceComponentAbsent(id))
          return fail('source-only-property-overlay', id, 'A source-only diagnostic node cannot receive component properties');
        if (group) {
          const prior = mappedGroup(id);
          if (!sameSet(group.attributeUses, prior.attributeUses) || Boolean(group.wildcard) !== Boolean(prior.wildcard))
            return fail('original-group-property-correspondence', id, 'Original effective attribute group properties changed');
          if (group.wildcard && prior.wildcard && (group.wildcard.processContents !== prior.wildcard.processContents
            || !namespaceSetSubset(group.wildcard.namespace, prior.wildcard.namespace, charge) || !namespaceSetSubset(prior.wildcard.namespace, group.wildcard.namespace, charge)))
            return fail('original-group-property-correspondence', id, 'Original effective group wildcard changed');
          charge(); originalProperties.push(id);
        }
        if (rawSimple) {compareSimple(id); charge(); originalProperties.push(id);}
        if (element) {
          if (!sameSet(element.final, declarationMethods(parent, original.node, 'final')) || !sameSet(element.block, declarationMethods(parent, original.node, 'block'))) return fail('original-element-property-correspondence', id, 'Original declaration flags changed');
        }
        if (element?.type !== undefined || attribute) {
          const current = node(candidate, id);
          if (original.node.kind !== 'element' && original.node.kind !== 'attribute' || current.kind !== 'element' && current.kind !== 'attribute')
            return fail('original-declaration-type-correspondence', id, 'Explicit type requires a declaration');
          if (refKey(parent, declaredType(parent, original.node)) !== refKey(candidate, declaredType(candidate, current)))
            return fail('original-declaration-type-correspondence', id, 'Original declaration type identity changed');
          charge(); originalProperties.push(id);
        }
        if (!properties) continue;
        const left = mapped(id), prior = left.properties;
        if (typeNamespace(candidate, id, properties) !== typeNamespace(left.context, id, prior)
          || properties.abstract !== prior.abstract || !sameSet(properties.final, prior.final) || !sameSet(properties.block, prior.block)
          || !sameSet(properties.attributeUses, prior.attributeUses)) return fail('original-type-property-correspondence', id, 'Original flags or attribute-use identities changed');
        if (id !== target && (properties.derivation.method !== prior.derivation.method || refKey(candidate, properties.derivation.base) !== refKey(left.context, prior.derivation.base))) return fail('original-base-correspondence', id, 'A nonendpoint derivation changed');
        if (Boolean(properties.wildcard) !== Boolean(prior.wildcard)) return fail('original-wildcard-correspondence', id, 'Original wildcard presence changed');
        if (properties.wildcard && prior.wildcard && (properties.wildcard.processContents !== prior.wildcard.processContents
          || !namespaceSetSubset(properties.wildcard.namespace, prior.wildcard.namespace, charge) || !namespaceSetSubset(prior.wildcard.namespace, properties.wildcard.namespace, charge))) return fail('original-wildcard-correspondence', id, 'Original wildcard properties changed');
        compareContent(left, properties); charge(); originalProperties.push(id);
      }
      charge(16 + originalProperties.length + fresh.length + scalarObligations.length);
      const receipt: CorrespondenceReceipt = b.freeze(b.snapshot({kind: 'checked', authority: RE01_DERIVATION_DOMAIN,
        parentContext: parent.contextId, contextId: candidate.contextId, target, intermediate, ancestor: computed.ancestor,
        originalProperties: Object.freeze(originalProperties), fresh: Object.freeze(fresh), scalarObligations: Object.freeze(scalarObligations), typeDependencies: typeDependencies.snapshot()}));
      issued.set(receipt, candidate); return receipt;
    } catch (error) {
      if (error instanceof CorrespondenceAbort) return error.result;
      if (error instanceof RelationProblem) return Object.freeze({kind: 'unresolved', rule: error.result.rule, component: error.result.component, message: error.message});
      throw error;
    }
  });
}
