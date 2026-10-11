/**
 * Source representation assessment uses S4S, not the schema being constructed.
 * Structures: conformance-schemaValidity, cvc-resolve-instance, cvc-wildcard,
 * cvc-assess-elt and cvc-assess-attr. No source/payload hint initiates loading.
 * The declaration inventory is corroborated by dgis/xsddiagram
 * @9aedeb7dedfdd2fcd6bf916345499468dd4aa931/XSD/XMLSchema.xsd, SHA256
 * e767a159c179bd6e4dc2bac2a63a62f50cbd027ec19d6b5cc9eb1c2f33e0cb2e.
 * This is not an exact retrieved REC Appendix A snapshot. Its sole import is
 * the XML namespace; its global attributes are empty. The historical XML
 * import inventory is not assumed complete here. Known S4S element grammar
 * and schema-instance assessment remain explicit finite implementation work.
 */
import {XML_NAMESPACE, XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import type {SemanticBudget, ResourceLimitFailure} from './semanticBudget.js';
import {normalizeWhitespace} from './schemaDatatypeValues.js';
import {schemaUri} from './schemaUri.js';
import {assessSchemaSourceRepresentation} from './schemaSourceRepresentation.js';
import type {SourceTypedId} from './schemaSourceRepresentation.js';

const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';
// Only global declarations participate in lax name lookup. For example,
// extension is a local S4S declaration; assert is not an XSD 1.0 declaration.
const s4sElements = new Set(['schema', 'anyAttribute', 'complexContent', 'simpleContent',
  'complexType', 'element', 'all', 'choice', 'sequence', 'group', 'any', 'attribute',
  'attributeGroup', 'include', 'redefine', 'import', 'selector', 'field', 'unique',
  'key', 'keyref', 'notation', 'appinfo', 'documentation', 'annotation', 'simpleType',
  'restriction', 'list', 'union', 'minExclusive', 'minInclusive', 'maxExclusive',
  'maxInclusive', 'totalDigits', 'fractionDigits', 'length', 'minLength', 'maxLength',
  'enumeration', 'whiteSpace', 'pattern']);

export type SourceWildcardObligation = Readonly<{
  category: 'foreign-attribute-assessment' | 'annotation-payload-assessment';
  rule: 'schema-for-schemas-element-assessment' | 'schema-instance-assessment' |
    'schema-for-schemas-xml-attribute-declarations' | 'schema-for-schemas-auxiliary-element-declarations' |
    'schema-for-schemas-xml-import-version';
  source: SyntaxSource;
  name: ExpandedName;
}>;
export type SourceWildcardResult = Readonly<{kind: 'checked'; remaining: readonly SourceWildcardObligation[]; ids: readonly SourceTypedId[]}>
  | Readonly<{kind: 'invalid-schema'; rule: 'schema-for-schemas'; message: string; source: SyntaxSource}>
  | ResourceLimitFailure;

/** Empty lang needs import-version qualification; nonempty language values collapse. */
export function validSchemaXmlLanguage(value: string, budget: SemanticBudget): boolean {
  budget.chargeWork(4 + value.length * 4);
  return value === '' || /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/.test(normalizeWhitespace(value, 'collapse'));
}

/** Pure additional source clauses; the authenticated document owner supplies roots. */
export function assessSchemaSourceWildcards(root: SyntaxElement, budget: SemanticBudget): SourceWildcardResult {
  return budget.guard(() => {
    budget.chargeWork(8);
    const remaining: SourceWildcardObligation[] = [];
    const ids: SourceTypedId[] = [];
    const stack: {node: SyntaxElement; payload: boolean}[] = [{node: root, payload: false}];
    const pending = (node: SyntaxElement, name: ExpandedName, category: SourceWildcardObligation['category'],
      rule: SourceWildcardObligation['rule']): void => {
      budget.chargeWork(7); remaining.push({category, rule, source: node.source, name});
    };
    const invalid = (node: SyntaxElement, message: string) => budget.freeze(budget.snapshot({
      kind: 'invalid-schema' as const, rule: 'schema-for-schemas' as const, message, source: node.source}));
    while (stack.length) {
      budget.chargeWork(6);
      const {node, payload} = stack.pop()!;
      budget.chargeWork(node.name.namespace.length + node.name.local.length);
      const category = payload ? 'annotation-payload-assessment' : 'foreign-attribute-assessment';
      if (payload) {
        if (node.name.namespace === XSD_NAMESPACE && s4sElements.has(node.name.local)) {
          const representation = assessSchemaSourceRepresentation(node, budget);
          if (representation.kind !== 'checked') return representation;
          if (!representation.recognized) pending(node, node.name, category, 'schema-for-schemas-element-assessment');
          if (representation.id) {budget.chargeWork(); ids.push(representation.id);}
        } else if (node.name.namespace === XML_NAMESPACE || node.name.namespace === XSI_NAMESPACE) {
          pending(node, node.name, category, 'schema-for-schemas-auxiliary-element-declarations');
        }
      }
      for (const attribute of node.attributes) {
        budget.chargeWork(8 + attribute.name.namespace.length + attribute.name.local.length + attribute.value.length * 4);
        // Source grammar owns its local attributes. A payload element without
        // a global declaration is laxly assessed with the ur-type; its absent
        // unqualified/XSD global attribute declarations impose no new values.
        if (attribute.name.namespace === XSI_NAMESPACE) {
          pending(node, attribute.name, category, 'schema-instance-assessment');
        } else if (attribute.name.namespace === XML_NAMESPACE) {
          const value = normalizeWhitespace(attribute.value, 'collapse');
          if (attribute.name.local === 'lang') {
            if (!validSchemaXmlLanguage(attribute.value, budget)) return invalid(node, 'Invalid XML language value');
            // Historical XML imports disagree: language alone versus language |
            // string{''}. Keep literal empty unresolved without choosing a version.
            if (attribute.value === '') pending(node, attribute.name, category, 'schema-for-schemas-xml-import-version');
          } else if (attribute.name.local === 'space') {
            if (value !== 'default' && value !== 'preserve') return invalid(node, 'Invalid XML space value');
          } else if (attribute.name.local === 'base') {
            if (!schemaUri(value, node, {step: (_owner, count = 1) => budget.chargeWork(count)})) {
              return invalid(node, 'Invalid XML base URI value');
            }
          } else {
            pending(node, attribute.name, category, 'schema-for-schemas-xml-attribute-declarations');
          }
        }
      }
      const childrenArePayload = payload || node.name.namespace === XSD_NAMESPACE &&
        (node.name.local === 'appinfo' || node.name.local === 'documentation');
      // No unknown ancestor suppresses assessment of known descendants.
      for (let index = node.children.length - 1; index >= 0; index--) {
        budget.chargeWork(4);
        const child = node.children[index];
        if (child.kind === 'element') {budget.chargeWork(3); stack.push({node: child, payload: childrenArePayload});}
      }
    }
    return budget.freeze(budget.snapshot({kind: 'checked' as const, remaining, ids}));
  });
}
