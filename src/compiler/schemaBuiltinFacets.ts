/** Exact derived-builtin facet components from dated Datatypes Appendix A.
 * Primitive normalization behavior is separate: primitive {facets} is empty.
 */
import {builtinListItem, builtinParents, integerBounds} from './schemaDatatypeValues.js';
import type {SchemaValueContext} from './schemaValueContext.js';

export type IntrinsicScalarFacet = Readonly<{
  name: string; kind: 'integer' | 'bound' | 'whiteSpace'; value: string; fixed: boolean;
}>;
export type IntrinsicFacetProperties = Readonly<{
  scalars: readonly IntrinsicScalarFacet[]; patterns: readonly string[];
}>;
export const LIST_CONSTRUCTOR_FACETS: IntrinsicFacetProperties = Object.freeze({
  scalars: Object.freeze([Object.freeze({name: 'whiteSpace', kind: 'whiteSpace' as const, value: 'collapse', fixed: true})]),
  patterns: Object.freeze([]),
});
const exactPatterns: Readonly<Record<string, string>> = Object.freeze({
  language: '[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*', NMTOKEN: '\\c+', Name: '\\i\\c*',
  NCName: '[\\i-[:]][\\c-[:]]*', integer: '[\\-+]?[0-9]+',
});
export function schemaBuiltinFacetProperties<Owner>(name: string, owner: Owner,
  c: Pick<SchemaValueContext<Owner>, 'step' | 'text'>): IntrinsicFacetProperties {
  c.step(owner, 5);
  if (builtinListItem(name)) {
    c.step(owner, 6);
    return {scalars: [...LIST_CONSTRUCTOR_FACETS.scalars, {name: 'minLength', kind: 'integer', value: '1', fixed: false}], patterns: []};
  }
  const path: string[] = [], scalars = new Map<string, IntrinsicScalarFacet>(), patterns: string[] = [];
  for (let current = name; builtinParents[current]; current = builtinParents[current]) {c.step(owner, 2); path.push(current);}
  for (let index = path.length - 1; index >= 0; index--) {
    c.step(owner, 6); const current = path[index], pattern = exactPatterns[current];
    if (pattern !== undefined) {c.text(pattern, owner); patterns.push(pattern);}
    if (current === 'normalizedString' || current === 'token') scalars.set('whiteSpace', {
      name: 'whiteSpace', kind: 'whiteSpace', value: current === 'token' ? 'collapse' : 'replace', fixed: false,
    });
    if (current === 'integer') scalars.set('fractionDigits', {name: 'fractionDigits', kind: 'integer', value: '0', fixed: true});
    const bounds = integerBounds[current];
    if (bounds) for (const position of [0, 1] as const) {
      c.step(owner, 4); const value = bounds[position];
      if (value !== undefined) {
        c.text(value, owner); const boundName = position === 0 ? 'minInclusive' : 'maxInclusive';
        scalars.set(boundName, {name: boundName, kind: 'bound', value, fixed: false});
      }
    }
  }
  c.step(owner, scalars.size + 2);
  return {scalars: [...scalars.values()], patterns};
}
