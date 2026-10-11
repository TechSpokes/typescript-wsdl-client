/** Immediate S4S instance grammar; payload does not construct schema components. */
import {isXmlNCName, XML_NAMESPACE, XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import type {SemanticBudget, ResourceLimitFailure} from './semanticBudget.js';
import {normalizeWhitespace} from '../util/xmlWhitespace.js';
import {schemaUri} from './schemaUri.js';
import {schemaBooleanLexical, schemaNonNegativeIntegerLexical, schemaPositiveIntegerLexical} from './schemaSourceLexical.js';

const facets = new Set(['minExclusive', 'minInclusive', 'maxExclusive', 'maxInclusive', 'totalDigits',
  'fractionDigits', 'length', 'minLength', 'maxLength', 'enumeration', 'whiteSpace', 'pattern']);
const numeric = new Set(['fractionDigits', 'length', 'minLength', 'maxLength']);
export type SourceTypedId = Readonly<{value: string; source: SyntaxSource}>;
export type SourceRepresentationResult = Readonly<{kind: 'checked'; recognized: boolean; id?: SourceTypedId}>
  | Readonly<{kind: 'invalid-schema'; rule: 'schema-for-schemas'; message: string; source: SyntaxSource}>
  | ResourceLimitFailure;

/**
 * The S4S annotated/facet/noFixedFacet/numFacet declarations and global
 * annotation/appinfo/documentation declarations. Descendants, foreign wildcard
 * attributes, schema-instance overrides and validation-root IDs have their own
 * assessment owners. A checked header alone is not subtree validity.
 */
export function assessSchemaSourceRepresentation(node: SyntaxElement, budget: SemanticBudget): SourceRepresentationResult {
  return budget.guard(() => {
    budget.chargeWork(80 + node.name.local.length + node.name.namespace.length);
    const role = node.name.local, facet = facets.has(role);
    if (node.name.namespace !== XSD_NAMESPACE || !facet && !['annotation', 'appinfo', 'documentation'].includes(role)) {
      return Object.freeze({kind: 'checked', recognized: false});
    }
    const invalid = (message: string) => budget.freeze(budget.snapshot({kind: 'invalid-schema' as const,
      rule: 'schema-for-schemas' as const, message, source: node.source}));
    const values = new Map<string, string>();
    const allowed = facet ? ['id', 'value', ...(!['pattern', 'enumeration'].includes(role) ? ['fixed'] : [])]
      : role === 'annotation' ? ['id'] : ['source'];
    for (const attribute of node.attributes) {
      budget.chargeWork(10 + attribute.name.namespace.length + attribute.name.local.length + attribute.value.length * 4);
      if (attribute.name.namespace === XSD_NAMESPACE || !attribute.name.namespace && !allowed.includes(attribute.name.local)) {
        return invalid('Attribute is not permitted by this S4S declaration');
      }
      if (attribute.name.namespace === XML_NAMESPACE && attribute.name.local === 'lang' && role === 'documentation') continue;
      if (attribute.name.namespace) continue; // shared wildcard owner assesses qualified attributes
      budget.chargeWork(2); values.set(attribute.name.local, attribute.value);
    }
    const id = values.get('id'), normalizedId = id === undefined ? undefined : normalizeWhitespace(id, 'collapse');
    if (normalizedId !== undefined && !isXmlNCName(normalizedId)) return invalid('Schema ID must be an XML NCName');
    const source = values.get('source');
    if (source !== undefined && !schemaUri(normalizeWhitespace(source, 'collapse'), node, {step: (_owner, count = 1) => budget.chargeWork(count)})) {
      return invalid('Invalid annotation source URI');
    }
    if (facet) {
      const value = values.get('value');
      if (value === undefined) return invalid('S4S facet value is required');
      if (numeric.has(role) && !schemaNonNegativeIntegerLexical(value) || role === 'totalDigits' && !schemaPositiveIntegerLexical(value)) {
        return invalid('Invalid S4S numeric facet value');
      }
      if (role === 'whiteSpace' && !['preserve', 'replace', 'collapse'].includes(normalizeWhitespace(value, 'collapse'))) {
        return invalid('Invalid S4S whitespace facet value');
      }
      const fixed = values.get('fixed');
      if (fixed !== undefined && !schemaBooleanLexical(fixed)) return invalid('Invalid S4S boolean spelling');
      // Bounds/enumeration are anySimpleType and pattern is string in S4S.
      // Their text is not interpreted as a constructed facet in this episode.
    }
    let annotations = 0;
    for (const child of node.children) {
      budget.chargeWork(4);
      if (role === 'appinfo' || role === 'documentation') continue; // mixed lax wildcard
      if (child.kind === 'text') {
        budget.chargeWork(child.value.length * 4);
        if (/[^\t\r\n ]/.test(child.value)) return invalid('S4S declaration requires element-only content');
      } else {
        budget.chargeWork(child.name.local.length + child.name.namespace.length);
        if (role === 'annotation') {
          if (child.name.namespace !== XSD_NAMESPACE || !['appinfo', 'documentation'].includes(child.name.local)) {
            return invalid('Annotation permits only appinfo and documentation');
          }
        } else if (child.name.namespace !== XSD_NAMESPACE || child.name.local !== 'annotation' || ++annotations > 1) {
          return invalid('Facet permits one optional annotation');
        }
      }
    }
    return budget.freeze(budget.snapshot({kind: 'checked' as const, recognized: true,
      ...(normalizedId === undefined ? {} : {id: {value: normalizedId, source: node.source}})}));
  });
}
