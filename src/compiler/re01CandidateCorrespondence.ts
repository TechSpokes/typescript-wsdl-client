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
import {createSchemaScalarKernel} from './schemaScalarKernel.js';
import type {ScalarResult} from './schemaScalarKernel.js';
import type {ScalarObligation} from './scalarSchemaAssessment.js';
import type {RawAttributeGroupProperties} from './schemaAttributeGroupProperties.js';
import {declarationMethods, immediateTypeBase, RelationProblem} from './schemaTypeRelations.js';
import {namespaceSetSubset, wildcardNamespaces} from './wildcardAlgebra.js';

export type CorrespondenceFailure = Readonly<{kind: 'invalid-schema' | 'candidate-rejected' | 'invalid-evidence' | 'unresolved' | 'unsupported-capability';
  rule: string; component?: NodeId; message: string}>;
export type CorrespondenceReceipt = Readonly<{kind: 'checked'; authority: typeof RE01_DERIVATION_DOMAIN;
  parentContext: string; contextId: string; target: NodeId; intermediate: NodeId; ancestor: Reference;
  originalProperties: readonly NodeId[]; fresh: readonly NodeId[];
  scalarObligations: readonly Readonly<{contextId: string; obligation: ScalarObligation}>[]}>;
export type CorrespondenceResult = CorrespondenceReceipt | CorrespondenceFailure | ResourceLimitFailure;
const issued = new WeakMap<object, SemanticContext>();
type Mapped = Readonly<{properties: RawComplexTypeProperties; context: SemanticContext; view?: ParticleContentView;
  synthetic: readonly NodeId[]; scalarObligations: readonly ScalarObligation[]}>;
const actualMappings = new WeakMap<SemanticContext, Map<NodeId, Mapped>>();
const actualGroupMappings = new WeakMap<SemanticContext, Map<NodeId, Readonly<{
  properties: RawAttributeGroupProperties; scalarObligations: readonly ScalarObligation[];
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
export function re01Ancestor(context: SemanticContext, target: NodeId): Readonly<{kind: 'checked'; ancestor: Reference}> | CorrespondenceFailure | ResourceLimitFailure {
  assertSemanticContext(context);
  const result = context.budget.guard<Readonly<{kind: 'checked'; ancestor: Reference}> | CorrespondenceFailure | ResourceLimitFailure>(() => {
    const b = context.budget; b.chargeWork(4);
    const first = immediateTypeBase(context, {kind: 'local', target});
    if (first.kind === 'resource-limit') return first;
    if (first.kind !== 'checked' || !first.value) return {kind: 'unresolved', rule: 'ancestor-domain', component: target, message: 'Original immediate base is unavailable'};
    const seen = new Set<string>(); let current: Reference = first.value;
    for (;;) {
      const resolved = context.resolve(current);
      if (resolved.kind !== 'builtin' && resolved.kind !== 'found') return {kind: 'unresolved', rule: 'ancestor-domain', component: target, message: 'Ancestor is unavailable'};
      // The ur-type's actual base property is itself; the general ancestry
      // accessor stops there to avoid treating ordinary cycles as legal.
      if (resolved.kind === 'builtin' && resolved.name.local === 'anyType') return {kind: 'checked', ancestor: current};
      const key = resolved.kind === 'builtin' ? `builtin:${resolved.name.local}` : resolved.node.id;
      b.chargeWork(4 + key.length);
      if (seen.has(key)) return {kind: 'invalid-evidence', rule: 'ancestor-cycle', component: target, message: 'Ancestor chain is cyclic'};
      seen.add(key);
      const parent = immediateTypeBase(context, current);
      if (parent.kind !== 'checked') return parent.kind === 'resource-limit' ? parent : {kind: 'unresolved', rule: parent.rule, component: target, message: parent.message};
      if (!parent.value) return {kind: 'unresolved', rule: 'ancestor-domain', component: target, message: 'No proper ancestor with ur-type base'};
      const next = context.resolve(parent.value);
      if (next.kind === 'builtin' && next.name.namespace === XSD_NAMESPACE && next.name.local === 'anyType') {
        b.chargeWork(3); return Object.freeze({kind: 'checked', ancestor: current});
      }
      current = parent.value;
    }
  });
  return result.kind === 'resource-limit' ? result : context.budget.guard(() => context.budget.freeze(context.budget.snapshot(result)));
}

export function checkCandidateCorrespondence(actual: SemanticContext, parent: SemanticContext, candidate: SemanticContext,
  target: NodeId, intermediate: NodeId, ancestor: Reference): CorrespondenceResult {
  assertSemanticContext(actual); assertSemanticContext(parent); assertSemanticContext(candidate);
  const b = candidate.budget, charge = b.chargeWork;
  return b.guard(() => {
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
    const refKey = (context: SemanticContext, reference: Reference): string => {
      const found = context.resolve(reference);
      if (found.kind === 'found') return found.node.id;
      if (found.kind === 'builtin') {charge(8 + found.name.local.length); return `builtin:${found.name.local}`;}
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
      if (result.kind !== 'checked') throw new CorrespondenceAbort(result.kind === 'invalid-schema' && context.kind === 'candidate' ? {...result, kind: 'candidate-rejected'} : result);
      for (const obligation of result.obligations) {charge(3); scalarObligations.push({contextId: obligation.contextId ?? context.contextId, obligation});}
      return result.value;
    };
    const mapped = (id: NodeId): Mapped => {
      const prior = parent.rawTypeProperties(id);
      if (prior) {charge(7); return {properties: prior, context: parent, synthetic: [], scalarObligations: []};}
      let cache = actualMappings.get(actual);
      if (!cache) {charge(2); cache = new Map(); actualMappings.set(actual, cache);}
      const cached = cache.get(id);
      if (cached) {
        for (const obligation of cached.scalarObligations) {charge(3); scalarObligations.push({contextId: obligation.contextId ?? actual.contextId, obligation});}
        return cached;
      }
      const original = node(actual, id);
      if (original.kind !== 'complexType') return fail('original-property-correspondence', id, 'Expected an original complex type', 'invalid-evidence');
      const content = deriveActualComplexContent(actual, id), attrs = assessSourceAttributeUses(actual, id);
      if (content.kind !== 'checked') throw new CorrespondenceAbort(content.kind === 'resource-limit' ? content
        : {...content, kind: content.kind === 'invalid-input' ? 'invalid-evidence' : 'unresolved'});
      if (attrs.kind !== 'checked') throw new CorrespondenceAbort(attrs);
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
        view: content.view, synthetic: content.view.synthetic, scalarObligations: attrs.scalarObligations});
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
        for (const obligation of cached.scalarObligations) {charge(3); scalarObligations.push({contextId: obligation.contextId ?? actual.contextId, obligation});}
        return cached.properties;
      }
      const attrs = assessSourceAttributeUses(actual, id);
      if (attrs.kind !== 'checked') throw new CorrespondenceAbort(attrs);
      for (const obligation of attrs.scalarObligations) {charge(3); scalarObligations.push({contextId: obligation.contextId ?? actual.contextId, obligation});}
      charge(6 + attrs.value.uses.length);
      const properties = b.freeze(b.snapshot({group: id, attributeUses: attrs.value.uses.map(use => use.id), wildcard: attrs.value.wildcard}));
      cache.set(id, {properties, scalarObligations: attrs.scalarObligations}); return properties;
    };
    const compareContent = (left: Mapped, right: RawComplexTypeProperties): void => {
      const a = left.properties.content, c = right.content;
      if (a.kind !== c.kind) return fail('endpoint-content-variety', right.type, 'Original effective content variety changed');
      if (a.kind === 'empty') return;
      if (a.kind === 'simple' && c.kind === 'simple') {
        // Source complex facade describes the exact content definition, even
        // when a mapped anonymous simple type is not in the canonical graph.
        const sourceRef: Reference = left.context.kind === 'actual' ? {kind: 'local', target: right.type} : a.type;
        const x = scalarValue(left.context, createSchemaScalarKernel(left.context).contentIdentity(sourceRef, right.type));
        const y = scalarValue(candidate, createSchemaScalarKernel(candidate).contentIdentity(c.type, right.type));
        charge(x.definition.length + y.definition.length + 2);
        if (x.definition !== y.definition) return fail('endpoint-scalar-identity', right.type,
          'Original effective simple type identity was not retained', x.reference === undefined ? 'unresolved' : 'candidate-rejected');
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
      const before = node(parent, target), endpoint = node(candidate, target), e = node(candidate, intermediate);
      if (before.kind !== 'complexType' || endpoint.kind !== 'complexType' || e.kind !== 'complexType') return fail('two-step-types', target, 'Endpoint and intermediate must be complex types', 'invalid-evidence');
      const computed = re01Ancestor(parent, target);
      if (computed.kind !== 'checked') throw new CorrespondenceAbort(computed);
      if (refKey(parent, computed.ancestor) !== refKey(parent, suppliedAncestor)) return fail('ancestor-correspondence', target, 'Supplied ancestor differs from the original chain', 'invalid-evidence');
      const endProps = candidate.rawTypeProperties(target), middleProps = candidate.rawTypeProperties(intermediate);
      if (!endProps || !middleProps) return fail('raw-type-properties', target, 'Endpoint and intermediate need complete raw properties', 'unresolved');
      if (endProps.derivation.method !== 'restriction' || refKey(candidate, endProps.derivation.base) !== intermediate
        || middleProps.derivation.method !== 'extension' || refKey(candidate, middleProps.derivation.base) !== refKey(candidate, suppliedAncestor)) return fail('two-step-construction', target, 'Expected extension from the designated ancestor then endpoint restriction');
      charge(4); const originalProperties: NodeId[] = [], fresh: NodeId[] = [];
      for (const id of candidate.members) {
        const original = parent.lookup(id);
        if (original.kind !== 'found') {charge(); fresh.push(id); continue;}
        const group = candidate.rawAttributeGroupProperties(id);
        if (group) {
          const prior = mappedGroup(id);
          if (!sameSet(group.attributeUses, prior.attributeUses) || Boolean(group.wildcard) !== Boolean(prior.wildcard))
            return fail('original-group-property-correspondence', id, 'Original effective attribute group properties changed');
          if (group.wildcard && prior.wildcard && (group.wildcard.processContents !== prior.wildcard.processContents
            || !namespaceSetSubset(group.wildcard.namespace, prior.wildcard.namespace, charge) || !namespaceSetSubset(prior.wildcard.namespace, group.wildcard.namespace, charge)))
            return fail('original-group-property-correspondence', id, 'Original effective group wildcard changed');
          charge(); originalProperties.push(id);
        }
        const rawSimple = candidate.rawSimpleTypeProperties(id);
        if (rawSimple && rawSimple !== parent.rawSimpleTypeProperties(id)) return fail('original-simple-property-correspondence', id, 'A supplied original simple-property override requires a concrete mapping proof', 'unresolved');
        const element = candidate.rawElementProperties(id);
        if (element) {
          if (!sameSet(element.final, declarationMethods(parent, original.node, 'final')) || !sameSet(element.block, declarationMethods(parent, original.node, 'block'))) return fail('original-element-property-correspondence', id, 'Original declaration flags changed');
        }
        const properties = candidate.rawTypeProperties(id);
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
        originalProperties: Object.freeze(originalProperties), fresh: Object.freeze(fresh), scalarObligations: Object.freeze(scalarObligations)}));
      issued.set(receipt, candidate); return receipt;
    } catch (error) {
      if (error instanceof CorrespondenceAbort) return error.result;
      if (error instanceof RelationProblem) return Object.freeze({kind: 'unresolved', rule: error.result.rule, component: error.result.component, message: error.message});
      throw error;
    }
  });
}
