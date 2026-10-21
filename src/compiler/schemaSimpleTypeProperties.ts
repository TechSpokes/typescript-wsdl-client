/** Supplied abstract scalar properties. No XML constructor or schema defaults are inferred. */
import type {LexicalValue, NodeId} from './canonicalGraph.js';
import type {SemanticBudget} from './semanticBudget.js';
import {assertSemanticTypeReferenceShape} from './semanticTypeReference.js';
import type {SemanticTypeReference} from './semanticTypeReference.js';
import {validateFacetAnnotation} from './schemaFacetAnnotation.js';
import type {FacetAnnotation} from './schemaFacetAnnotation.js';
export type ScalarFacet = Readonly<{name: string; lexical: LexicalValue; fixed: boolean;
  /** Explicit abstract absence for legacy layers. Exact payloads belong to a component. */
  annotation?: 'absent';
  /** Absent means a newly supplied operand of the intrinsic helper family. */
  operand?: Readonly<{type: SemanticTypeReference; owner: NodeId; context: 'original' | 'active'}>}>;
/** Each layer is a conjunction; its pattern and enumeration entries are alternatives.
 * A nonempty enumeration group denotes one set-valued facet component;
 * a nonempty pattern group denotes one regular-expression branch union.
 * P1 maps pattern operands to one expression by joining complete operands in
 * supplied order with |, preserving singleton spelling and duplicate branches.
 * Distinct inherited enumeration components remain present and are matched
 * by typed set equality, without requiring caller construction history.
 * Comparable nonfixed scalar facets normalize to their strongest effective
 * bound/length/precision/whitespace property. Original operands remain retained.
 * Fixed conflicts, incomparable order and inherited pattern/enum correspondence
 * are never discarded by that normalization.
 */
export type RawScalarFacetLayer = Readonly<{facets: readonly ScalarFacet[]}>;
/** Exact supplied component inventory. Each entry is one scalar component,
 * one enumeration value-set component, or one pattern expression component.
 * Unlike facetLayers, scalar entries are never reduced to a normal form.
 */
export type RawScalarFacetComponent = Readonly<{facets: readonly ScalarFacet[];
  /** Annotation of the abstract component, including grouped pattern/enum. */
  annotation?: FacetAnnotation}>;
/** An actual component in the formed immediate base's available replay table. */
export type RawBaseFacetComponent = Readonly<{baseComponent: number}>;
export type RawFacetComponentEntry = RawScalarFacetComponent | RawBaseFacetComponent;
export type RawSimpleFacetInput = Readonly<
  {facetLayers: readonly RawScalarFacetLayer[]; facetBinding?: never; facetComponentSet?: never} |
  {facetComponentSet: readonly RawFacetComponentEntry[]; facetLayers?: never; facetBinding?: never} |
  {facetBinding: Readonly<{kind: 'original'; type: SemanticTypeReference}>; facetLayers?: never; facetComponentSet?: never}
>;
export type RawSimpleTypeProperties = Readonly<{
  type: NodeId;
  /** Required to establish anonymous helper namespace correspondence; empty means absent. */
  targetNamespace?: string;
  base: SemanticTypeReference;
  final: readonly ('restriction' | 'list' | 'union')[];
  variety: Readonly<{kind: 'atomic'} | {kind: 'list'; item: SemanticTypeReference} | {kind: 'union'; members: readonly SemanticTypeReference[]}>;
  provenance: Readonly<{kind: 'actual-mapped'; original: NodeId} | {kind: 'hypothetical-abstract'; originals: readonly NodeId[]}>;
}> & RawSimpleFacetInput;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const facetNames = ['length', 'minLength', 'maxLength', 'pattern', 'enumeration', 'whiteSpace', 'maxInclusive', 'maxExclusive', 'minInclusive', 'minExclusive', 'totalDigits', 'fractionDigits'];
export function validateRawSimpleTypeShape(value: unknown, budget: SemanticBudget): value is RawSimpleTypeProperties {
  budget.chargeWork(16);
  if (!object(value) || typeof value.type !== 'string' || !object(value.base) || !Array.isArray(value.final) || !object(value.variety)) return false;
  assertSemanticTypeReferenceShape(value.base, budget);
  const binding = value.facetBinding;
  const exact = value.facetComponentSet;
  if (binding !== undefined) {
    if (value.facetLayers !== undefined || exact !== undefined || !object(binding) || binding.kind !== 'original') return false;
    assertSemanticTypeReferenceShape(binding.type, budget);
  } else if (exact !== undefined ? value.facetLayers !== undefined || !Array.isArray(exact) : !Array.isArray(value.facetLayers)) return false;
  const layers = binding !== undefined ? [] : (exact ?? value.facetLayers) as unknown[];
  if (value.targetNamespace !== undefined && typeof value.targetNamespace !== 'string') return false;
  budget.chargeWork(value.type.length + value.final.length * 4 + layers.length * 4);
  if (value.final.some(method => !['restriction', 'list', 'union'].includes(method))) return false;
  if (!['atomic', 'list', 'union'].includes(value.variety.kind as string)) return false;
  if (value.variety.kind === 'list' && !object(value.variety.item) || value.variety.kind === 'union' && !Array.isArray(value.variety.members)) return false;
  if (value.variety.kind === 'list') assertSemanticTypeReferenceShape(value.variety.item, budget);
  if (value.variety.kind === 'union') for (const member of value.variety.members as unknown[]) assertSemanticTypeReferenceShape(member, budget);
  for (const layer of layers) {
    budget.chargeWork(4);
    if (!object(layer)) return false;
    if (exact !== undefined && !('facets' in layer)) {
      const selected = Object.getOwnPropertyDescriptor(layer, 'baseComponent');
      if ('annotation' in layer || !selected || !('value' in selected)
        || !Number.isSafeInteger(selected.value) || selected.value < 0) return false;
      continue;
    }
    if (!Array.isArray(layer.facets) || exact !== undefined && !layer.facets.length) return false;
    budget.chargeWork(layer.facets.length * 4);
    if (exact !== undefined) {
      const first=layer.facets[0];
      if (!object(first) || typeof first.name !== 'string'
        || layer.facets.some((facet:unknown)=>!object(facet)||facet.name!==first.name)
        || layer.facets.length > 1 && !['pattern', 'enumeration'].includes(first.name)) return false;
      const annotation = Object.getOwnPropertyDescriptor(layer,'annotation');
      if (annotation && (!('value' in annotation) || annotation.value !== undefined
        && !validateFacetAnnotation(annotation.value,budget))) return false;
    }
    for (const facet of layer.facets) {
      budget.chargeWork(8);
      if (!object(facet) || !facetNames.includes(facet.name as string) || typeof facet.fixed !== 'boolean' || !object(facet.lexical) || typeof facet.lexical.value !== 'string' || !object(facet.lexical.context) || !object(facet.lexical.context.namespaces) || !object(facet.lexical.context.source)) return false;
      budget.chargeWork(56);
      const annotation = Object.getOwnPropertyDescriptor(facet, 'annotation');
      if (annotation && (!('value' in annotation) || annotation.value !== undefined &&
        (exact !== undefined || annotation.value !== 'absent'))) return false;
      if (facet.operand !== undefined && (!object(facet.operand) || !object(facet.operand.type) || typeof facet.operand.owner !== 'string' || !['original', 'active'].includes(facet.operand.context as string))) return false;
      if (facet.operand !== undefined && !['enumeration', 'minInclusive', 'minExclusive', 'maxInclusive', 'maxExclusive'].includes(facet.name as string)) return false;
      if (facet.operand !== undefined) assertSemanticTypeReferenceShape(facet.operand.type, budget);
      budget.chargeWork(facet.lexical.value.length + 4);
      for (const namespace in facet.lexical.context.namespaces) {budget.chargeWork(namespace.length + 1); if (typeof facet.lexical.context.namespaces[namespace] !== 'string') return false;}
    }
  }
  if (!object(value.provenance)) return false;
  if (value.provenance.kind === 'actual-mapped') return typeof value.provenance.original === 'string';
  if (value.provenance.kind !== 'hypothetical-abstract' || !Array.isArray(value.provenance.originals)) return false;
  budget.chargeWork(value.provenance.originals.length + 1);
  return value.provenance.originals.every(id => typeof id === 'string');
}
