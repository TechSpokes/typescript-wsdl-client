/** Supplied abstract scalar properties. No XML constructor or schema defaults are inferred. */
import type {LexicalValue, NodeId, Reference} from './canonicalGraph.js';
import type {SemanticBudget} from './semanticBudget.js';
export type ScalarFacet = Readonly<{name: string; lexical: LexicalValue; fixed: boolean;
  /** Absent means a newly supplied operand of the intrinsic helper family. */
  operand?: Readonly<{type: Reference; owner: NodeId; context: 'original' | 'active'}>}>;
/** Each layer is a conjunction; its pattern and enumeration entries are alternatives.
 * A nonempty enumeration group denotes one set-valued facet component;
 * a nonempty pattern group denotes one regular-expression branch union.
 * Multiple pattern operands have no inferred canonical expression spelling;
 * independent groups retain an exact mapping prerequisite for comparison.
 * Distinct inherited enumeration components remain present and are matched
 * by typed set equality, without requiring caller construction history.
 * Comparable nonfixed scalar facets normalize to their strongest effective
 * bound/length/precision/whitespace property. Original operands remain retained.
 * Fixed conflicts, incomparable order and inherited pattern/enum correspondence
 * are never discarded by that normalization.
 */
export type RawScalarFacetLayer = Readonly<{facets: readonly ScalarFacet[]}>;
export type RawSimpleTypeProperties = Readonly<{
  type: NodeId;
  /** Required to establish anonymous helper namespace correspondence; empty means absent. */
  targetNamespace?: string;
  base: Reference;
  final: readonly ('restriction' | 'list' | 'union')[];
  variety: Readonly<{kind: 'atomic'} | {kind: 'list'; item: Reference} | {kind: 'union'; members: readonly Reference[]}>;
  /** Complete effective constraints, including inherited pattern intersections. */
  facetLayers: readonly RawScalarFacetLayer[];
  provenance: Readonly<{kind: 'actual-mapped'; original: NodeId} | {kind: 'hypothetical-abstract'; originals: readonly NodeId[]}>;
}>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const facetNames = ['length', 'minLength', 'maxLength', 'pattern', 'enumeration', 'whiteSpace', 'maxInclusive', 'maxExclusive', 'minInclusive', 'minExclusive', 'totalDigits', 'fractionDigits'];
export function validateRawSimpleTypeShape(value: unknown, budget: SemanticBudget): value is RawSimpleTypeProperties {
  budget.chargeWork(16);
  if (!object(value) || typeof value.type !== 'string' || !object(value.base) || !Array.isArray(value.final) || !object(value.variety) || !Array.isArray(value.facetLayers)) return false;
  if (value.targetNamespace !== undefined && typeof value.targetNamespace !== 'string') return false;
  budget.chargeWork(value.type.length + value.final.length * 4 + value.facetLayers.length * 4);
  if (value.final.some(method => !['restriction', 'list', 'union'].includes(method))) return false;
  if (!['atomic', 'list', 'union'].includes(value.variety.kind as string)) return false;
  if (value.variety.kind === 'list' && !object(value.variety.item) || value.variety.kind === 'union' && !Array.isArray(value.variety.members)) return false;
  for (const layer of value.facetLayers) {
    budget.chargeWork(4);
    if (!object(layer) || !Array.isArray(layer.facets)) return false;
    budget.chargeWork(layer.facets.length * 4);
    for (const facet of layer.facets) {
      budget.chargeWork(8);
      if (!object(facet) || !facetNames.includes(facet.name as string) || typeof facet.fixed !== 'boolean' || !object(facet.lexical) || typeof facet.lexical.value !== 'string' || !object(facet.lexical.context) || !object(facet.lexical.context.namespaces) || !object(facet.lexical.context.source)) return false;
      if (facet.operand !== undefined && (!object(facet.operand) || !object(facet.operand.type) || typeof facet.operand.owner !== 'string' || !['original', 'active'].includes(facet.operand.context as string))) return false;
      if (facet.operand !== undefined && !['enumeration', 'minInclusive', 'minExclusive', 'maxInclusive', 'maxExclusive'].includes(facet.name as string)) return false;
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
