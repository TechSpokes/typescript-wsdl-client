/** Structural checks of explicit abstract properties, separate from source mapping. */
import type {GraphNode, NodeId, Reference} from './canonicalGraph.js';
import type {SemanticTypeReference} from './semanticTypeReference.js';
import {resolveSemanticType, semanticTypeKey} from './schemaTypeIdentity.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import {assertSemanticContext, SemanticContextAccessError} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {RE01_DERIVATION_DOMAIN} from './re01TypeProperties.js';
import type {RawComplexTypeProperties} from './re01TypeProperties.js';
import {assertCandidateCorrespondence} from './re01CandidateCorrespondence.js';
import type {CorrespondenceReceipt} from './re01CandidateCorrespondence.js';

export type RawTypeValidation = Readonly<{
  kind: 'checked-structure'; contract: typeof RE01_DERIVATION_DOMAIN; component: NodeId;
  context: string; properties: RawComplexTypeProperties;
  mappingAuthority: 'none';
  remaining: readonly ['effective-property-mapping', 'complete-type-validity', 'endpoint-correspondence', 'all-original-property-correspondence'];
}> | Readonly<{kind: 'invalid-input' | 'unresolved'; rule: string; component: NodeId}> | ResourceLimitFailure;
class InvalidRawType extends Error {
  constructor(readonly rule: string, readonly unresolved = false) {super(rule);}
}

/** The context has already copied data and rejected accessors. No caller labels authenticate actual mapping. */
export function validateRawComplexTypeProperties(context: SemanticContext, typeId: NodeId,
  correspondence?: CorrespondenceReceipt): RawTypeValidation {
  assertSemanticContext(context);
  if (correspondence) assertCandidateCorrespondence(context, correspondence);
  const b = context.budget;
  return b.guard((): Exclude<RawTypeValidation, ResourceLimitFailure> => {
    try {
      b.chargeWork(3 + typeId.length);
      const fail = (rule: string, unresolved = false): never => {throw new InvalidRawType(rule, unresolved);};
      const node = (id: NodeId, kind?: GraphNode['kind']): GraphNode => {
        b.chargeWork(3);
        const result = context.lookup(id);
        if (result.kind !== 'found') return fail(`raw-type-${result.kind}`, true);
        if (kind !== undefined && result.node.kind !== kind) return fail('raw-type-reference-role');
        return result.node;
      };
      const reference = (value: SemanticTypeReference, simple = false): string => {
        b.chargeWork(3);
        const result = resolveSemanticType(context, value);
        if (result.kind === 'builtin') {
          if (simple && result.name.local === 'anyType') return fail('raw-type-content-role');
          return semanticTypeKey(context, result.identity);
        }
        if (result.kind === 'original-generated') return semanticTypeKey(context, result.identity);
        if (result.kind === 'wrong-role') return fail('raw-type-reference-role');
        if (result.kind !== 'component') return fail(`raw-type-${result.kind}`, true);
        if (simple && result.node.kind !== 'simpleType') return fail('raw-type-content-role');
        return semanticTypeKey(context, result.identity);
      };
      const methods = (value: readonly string[]): void => {
        b.chargeWork(2);
        const seen = new Set<string>();
        for (const method of value) {
          b.chargeWork(5);
          if (seen.has(method)) return fail('raw-type-methods');
          seen.add(method);
        }
      };
      const owner = node(typeId, 'complexType');
      if (owner.kind !== 'complexType') return fail('raw-type-owner');
      const supplied = context.rawTypeProperties(typeId);
      if (!supplied) return fail('missing-raw-complex-type-properties', true);
      // assertRawComplexTypeShape is the single shape gate in the authenticated
      // context factory. These checks add selected-context consistency only.
      const raw = supplied;
      if (raw.type !== typeId || raw.abstract !== owner.abstract)
        return fail('raw-type-owner-properties');
      if (raw.targetNamespace !== undefined && owner.identity.kind === 'global' &&
          b.compareText(raw.targetNamespace, owner.identity.name.namespace) !== 0)
        return fail('raw-type-target-namespace');
      if (raw.targetNamespace === undefined && owner.identity.kind === 'scoped' && !context.sourceNode(owner.id))
        return fail('missing-raw-type-target-namespace', true);
      methods(raw.final); methods(raw.block);
      const derivation = raw.derivation;
      if (derivation.method !== (owner.derivation?.kind ?? 'restriction'))
        return fail('raw-type-derivation');
      const base = reference(derivation.base);
      const ur: Reference = {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: 'anyType'}};
      // Canonical Reference cannot encode the private scalar slot. That explicit
      // semantic base replaces only the unrepresentable source placeholder;
      // ordinary bases retain the existing representation-coherence check.
      if (derivation.base.kind !== 'original-generated') {
        const canonicalBase = owner.derivation ? reference(owner.derivation.base) : reference(ur);
        if (b.compareText(base, canonicalBase) !== 0) return fail('raw-type-derivation');
      }
      const content = raw.content;
      switch (content.kind) {
        case 'empty': break;
        case 'simple': reference(content.type, true); break;
        case 'mixed': case 'element-only':
          node(content.particle, 'particle'); break;
        case 'opaque-builtin':
          if (b.compareText(reference(content.type), reference(ur)) !== 0) return fail('raw-type-content');
          break;
      }
      b.chargeWork(); const uses = new Set<string>();
      for (const id of raw.attributeUses) {
        const use = node(id, 'attributeUse');
        b.chargeWork(4 + use.id.length);
        if (use.kind !== 'attributeUse' || use.use === 'prohibited' || uses.has(use.id)) return fail('raw-type-attribute-uses');
        uses.add(use.id);
      }
      for (const id of raw.wildcard?.sources ?? []) {b.chargeWork(); node(id, 'attributeWildcard');}
      const provenance = raw.provenance;
      if (provenance.kind === 'actual-mapped') {
        b.chargeWork(1 + (correspondence?.originalProperties.length ?? 0));
        if (!correspondence?.originalProperties.includes(typeId) || provenance.original !== typeId)
          return fail('unauthenticated-actual-type-mapping', true);
      }
      for (const original of provenance.kind === 'hypothetical-abstract' ? provenance.originals : []) {
        b.chargeWork(2);
        if (!context.sourceNode(original)) return fail('raw-type-provenance');
      }
      b.chargeWork(160 + context.contextId.length + typeId.length);
      // The returned raw value was frozen by the context. It remains supplied
      // data: neither this label nor these references prove effective mapping.
      return Object.freeze({kind: 'checked-structure', contract: RE01_DERIVATION_DOMAIN,
        component: typeId, context: context.contextId, properties: supplied, mappingAuthority: 'none',
        remaining: Object.freeze(['effective-property-mapping', 'complete-type-validity', 'endpoint-correspondence',
          'all-original-property-correspondence'] as const)});
    } catch (error: unknown) {
      if (error instanceof InvalidRawType) {b.chargeWork(5); return Object.freeze({kind: error.unresolved ? 'unresolved' : 'invalid-input', rule: error.rule, component: typeId});}
      if (error instanceof SemanticContextAccessError) {b.chargeWork(5); return Object.freeze({kind: error.code === 'reference' ? 'invalid-input' : 'unresolved', rule: `raw-type-${error.code}`, component: typeId});}
      throw error;
    }
  });
}
