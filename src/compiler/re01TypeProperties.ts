/** Explicit XSD type properties, separate from canonical XML source contributions. */
import type {NodeId, Reference} from './canonicalGraph.js';
import type {NamespaceConstraint, WildcardProcess} from './wildcardAlgebra.js';
import type {SemanticBudget} from './semanticBudget.js';
import {assertSemanticTypeReferenceShape} from './semanticTypeReference.js';
import type {SemanticTypeReference} from './semanticTypeReference.js';

export const RE01_DERIVATION_DOMAIN = 'RE01-derivation-B-v1' as const;
export type ComplexDerivationMethod = 'extension' | 'restriction';
declare const originalParticleAuthority: unique symbol;
/** Opaque selection of an actual source-mapped particle, never a validity receipt. */
export type OriginalComplexParticleHandle = Readonly<{
  owner: NodeId; particle: NodeId; [originalParticleAuthority]: true;
}>;
declare const originalUrWildcardAuthority: unique symbol;
/** Unchanged actual-source native UR leaf, never a caller-supplied origin flag. */
export type OriginalUrWildcardHandle = Readonly<{
  owner: NodeId; particle: NodeId; [originalUrWildcardAuthority]: true;
}>;
export type RawComplexContent = Readonly<
  {kind: 'empty'} | {kind: 'simple'; type: SemanticTypeReference} |
  {kind: 'mixed' | 'element-only'; particle: NodeId; original?: OriginalComplexParticleHandle} |
  {kind: 'opaque-builtin'; type: Reference}
>;
/**
 * This is supplied data, not a checked semantic receipt. In particular the
 * actual-mapped label does not authenticate effective-property computation.
 * The aggregate owner must compare with privately issued actual owner evidence.
 */
export type RawComplexTypeProperties = Readonly<{
  type: NodeId;
  /** Explicit semantic namespace for anonymous helpers; empty means absent.
   * Omission supplies no namespace fact for a fresh scoped helper. */
  targetNamespace?: string;
  derivation: Readonly<{base: SemanticTypeReference; method: ComplexDerivationMethod}>;
  abstract: boolean;
  final: readonly ComplexDerivationMethod[];
  block: readonly ComplexDerivationMethod[];
  content: RawComplexContent;
  /** Complete effective AU identities, including inherited uses; never a QName map. */
  attributeUses: readonly NodeId[];
  wildcard?: Readonly<{namespace: NamespaceConstraint; processContents: WildcardProcess; sources: readonly NodeId[]}>;
  provenance: Readonly<{kind: 'actual-mapped'; original: NodeId} |
    {kind: 'hypothetical-abstract'; originals: readonly NodeId[]}>;
}>;

/** Runtime data-shape boundary, shared by preparation and property consumers. */
export function assertRawComplexTypeShape(value: unknown, budget: SemanticBudget): asserts value is RawComplexTypeProperties {
  const fail = (): never => {throw new TypeError('Invalid raw complex type properties');};
  const object = (v: unknown, fields: readonly string[]): Record<string, unknown> => {
    budget.chargeWork(3);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail();
    const prototype: unknown = Object.getPrototypeOf(v);
    if (prototype !== Object.prototype && prototype !== null) return fail();
    for (const key of fields) {
      budget.chargeWork(46 + key.length);
      const field = Object.getOwnPropertyDescriptor(v, key);
      if (field && !('value' in field)) return fail();
    }
    for (const key in v) {
      budget.chargeWork(46 + key.length + fields.length);
      const field = Object.getOwnPropertyDescriptor(v, key);
      if (!field || !('value' in field) || !fields.includes(key)) return fail();
    }
    return v as Record<string, unknown>;
  };
  const id = (v: unknown): void => {budget.chargeWork(); if (typeof v !== 'string' || !v) fail();};
  const list = (v: unknown, item: (x: unknown) => void): void => {
    budget.chargeWork(); if (!Array.isArray(v)) return fail();
    for (let index = 0; index < v.length; index++) {
      budget.chargeWork(60);
      const field = Object.getOwnPropertyDescriptor(v, index);
      if (!field || !('value' in field)) return fail();
      item(field.value);
    }
  };
  const method = (v: unknown): void => {budget.chargeWork(); if (v !== 'restriction' && v !== 'extension') fail();};
  const reference = (v: unknown): void => {
    assertSemanticTypeReferenceShape(v, budget);
    const kind = object(v, ['kind', 'owner', 'target', 'name', 'role', 'lexical']);
    if (kind['kind'] === 'original-generated') {id(kind['owner']); return;}
    const r = object(v, ['kind', 'target', 'name', 'role', 'lexical']);
    if (r['kind'] === 'local') {id(r['target']); return;}
    if (r['kind'] !== 'symbol' && r['kind'] !== 'builtin') return fail();
    const name = object(r['name'], ['namespace', 'local']);
    if (typeof name['namespace'] !== 'string') return fail(); id(name['local']);
    if (r['kind'] === 'symbol' && r['role'] !== 'type') return fail();
    if (r['target'] !== undefined) id(r['target']);
  };
  const r = object(value, ['type', 'targetNamespace', 'derivation', 'abstract', 'final', 'block', 'content', 'attributeUses', 'wildcard', 'provenance']);
  id(r['type']);
  if (r['targetNamespace'] !== undefined && typeof r['targetNamespace'] !== 'string') return fail();
  const d = object(r['derivation'], ['base', 'method']); method(d['method']); reference(d['base']);
  if (typeof r['abstract'] !== 'boolean') return fail();
  list(r['final'], method); list(r['block'], method); list(r['attributeUses'], id);
  const content = object(r['content'], ['kind', 'type', 'particle', 'original']);
  if (content['kind'] === 'simple' || content['kind'] === 'opaque-builtin') {
    if ('particle' in content || 'original' in content) return fail(); reference(content['type']);
  } else if (content['kind'] === 'mixed' || content['kind'] === 'element-only') {
    if ('type' in content) return fail(); id(content['particle']);
    if (content['original'] !== undefined) {
      const original = object(content['original'], ['owner', 'particle']); id(original['owner']); id(original['particle']);
    }
  } else if (content['kind'] !== 'empty' || 'type' in content || 'particle' in content || 'original' in content) return fail();
  if (r['wildcard'] !== undefined) {
    const w = object(r['wildcard'], ['namespace', 'processContents', 'sources']);
    if (w['processContents'] !== 'strict' && w['processContents'] !== 'lax' && w['processContents'] !== 'skip') return fail();
    const n = object(w['namespace'], ['kind', 'namespaces']);
    if (n['kind'] !== 'set' && n['kind'] !== 'not') return fail();
    list(n['namespaces'], ns => {budget.chargeWork(); if (typeof ns !== 'string') fail();}); list(w['sources'], id);
  }
  const provenance = object(r['provenance'], ['kind', 'original', 'originals']);
  if (provenance['kind'] === 'actual-mapped') {
    if ('originals' in provenance) return fail(); id(provenance['original']);
  } else if (provenance['kind'] === 'hypothetical-abstract') {
    if ('original' in provenance) return fail(); list(provenance['originals'], id);
  } else fail();
}
