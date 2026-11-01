/** Explicit native standard-component acquisition; selecting a library never qualifies an application source. */
import {globalId} from './canonicalGraph.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';
import type {SemanticBudget} from './semanticBudget.js';
import {assessSchemaElementInstance} from './schemaElementInstance.js';

export const SCHEMA_ELEMENT_LIBRARY = 'w3c-xsd10-schema-element-2004-v1' as const;
export type StandardSchemaLibraryId = typeof SCHEMA_ELEMENT_LIBRARY;
export interface StandardSchemaTypeReference {
  readonly kind: 'standard-type';
  readonly library: StandardSchemaLibraryId;
  readonly component: 'schema-element-anonymous' | 'openAttrs';
}
export interface StandardSchemaLibrary {
  readonly id: StandardSchemaLibraryId;
  readonly specification: string;
}
export interface StandardSchemaElementDeclaration {
  readonly kind: 'standard-element'; readonly id: string; readonly name: ExpandedName;
  readonly scope: 'global'; readonly type: StandardSchemaTypeReference;
  readonly abstract: false; readonly nillable: false;
  readonly block: readonly ['restriction', 'extension', 'substitution']; readonly final: readonly [];
  readonly instanceGrammar: 'XSD10-S4S-element-instance-2004';
}
export interface StandardSchemaComplexType {
  readonly kind: 'standard-complex-type'; readonly reference: StandardSchemaTypeReference;
  readonly identity: Readonly<{kind: 'anonymous'; owner: ExpandedName}> | Readonly<{kind: 'global'; name: ExpandedName}>;
  readonly mixed: false; readonly abstract: false;
  readonly derivation: Readonly<{kind: 'extension'; base: StandardSchemaTypeReference}>
    | Readonly<{kind: 'restriction'; base: Readonly<{kind: 'builtin'; name: ExpandedName}>}>;
  readonly grammar: 'schema' | 'openAttrs';
}
type Definition = Readonly<{element: StandardSchemaElementDeclaration;
  types: Readonly<Record<StandardSchemaTypeReference['component'], StandardSchemaComplexType>>}>;
const libraries = new WeakMap<StandardSchemaLibrary, Definition>();
const elements = new WeakMap<StandardSchemaElementDeclaration, StandardSchemaLibrary>();

/** Acquire the implemented fixed standard definitions explicitly, without metadata I/O.
 * @remarks The schema element has an anonymous complex type extending the named openAttrs type;
 *   neither is a primitive builtin or an alias of anyType. These definition handles issue no source-validity receipt.
 * @returns A native library handle; copied JSON or similarly shaped objects cannot resolve definitions.
 * @throws TypeError For unknown library identifiers.
 * @see https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/structures.html#composition-schemaImport
 */
export function acquireStandardSchemaLibrary(id: string): StandardSchemaLibrary {
  if (id !== SCHEMA_ELEMENT_LIBRARY) throw new TypeError('Unsupported standard schema component library');
  const library: StandardSchemaLibrary = Object.freeze({id, specification: 'https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/structures.html#element-schema'});
  const name = Object.freeze({namespace: XSD_NAMESPACE, local: 'schema'});
  const reference = (component: StandardSchemaTypeReference['component']): StandardSchemaTypeReference => Object.freeze({kind: 'standard-type', library: id, component});
  const schema = reference('schema-element-anonymous'), openAttrs = reference('openAttrs');
  const element: StandardSchemaElementDeclaration = Object.freeze({kind: 'standard-element', id: globalId('element', name), name,
    scope: 'global', type: schema, abstract: false, nillable: false,
    block: Object.freeze(['restriction', 'extension', 'substitution'] as const), final: Object.freeze([] as const),
    instanceGrammar: 'XSD10-S4S-element-instance-2004'});
  const types: Definition['types'] = Object.freeze({
    'schema-element-anonymous': Object.freeze({kind: 'standard-complex-type', reference: schema,
      identity: Object.freeze({kind: 'anonymous', owner: name}), mixed: false, abstract: false,
      derivation: Object.freeze({kind: 'extension', base: openAttrs}), grammar: 'schema'}),
    openAttrs: Object.freeze({kind: 'standard-complex-type', reference: openAttrs,
      identity: Object.freeze({kind: 'global', name: Object.freeze({namespace: XSD_NAMESPACE, local: 'openAttrs'})}), mixed: false, abstract: false,
      derivation: Object.freeze({kind: 'restriction', base: Object.freeze({kind: 'builtin', name: Object.freeze({namespace: XSD_NAMESPACE, local: 'anyType'})})}), grammar: 'openAttrs'}),
  });
  libraries.set(library, Object.freeze({element, types})); elements.set(element, library);
  return library;
}

function definition(library: StandardSchemaLibrary): Definition {
  const owned = libraries.get(library);
  if (!owned) throw new TypeError('Native acquired standard schema library required');
  return owned;
}

/** Authenticate an acquired declaration before a resolver uses its identity. */
export function inspectStandardSchemaElement(declaration: StandardSchemaElementDeclaration): StandardSchemaElementDeclaration {
  if (!elements.has(declaration)) throw new TypeError('Native standard schema declaration required');
  return declaration;
}

/** Borrow the exact acquired declaration's fixed complex ancestry; selectors cannot manufacture this ownership. */
export function standardSchemaElementTypes(declaration: StandardSchemaElementDeclaration): readonly StandardSchemaComplexType[] {
  inspectStandardSchemaElement(declaration);
  const owned = definition(elements.get(declaration)!);
  return Object.freeze([owned.types['schema-element-anonymous'], owned.types.openAttrs]);
}

/** Resolve only the supplied library's implemented global declaration; namespace names initiate no acquisition. */
export function standardSchemaElement(library: StandardSchemaLibrary, name: ExpandedName): StandardSchemaElementDeclaration | undefined {
  const owned = definition(library);
  return name.namespace === XSD_NAMESPACE && name.local === 'schema' ? owned.element : undefined;
}

/** Resolve a selector through an acquired library, retaining anonymous and named complex identities. */
export function standardSchemaType(library: StandardSchemaLibrary, reference: StandardSchemaTypeReference): StandardSchemaComplexType | undefined {
  const owned = definition(library);
  return reference.kind === 'standard-type' && reference.library === library.id && Object.hasOwn(owned.types, reference.component)
    ? owned.types[reference.component] : undefined;
}

/** Apply the existing fixed instance owner to an exact native declaration handle.
 * @remarks This does not qualify application schema declarations, WSDL operations, mappings or portable artifacts.
 * @throws TypeError For copied or unowned declaration handles.
 */
export function assessStandardSchemaElement(declaration: StandardSchemaElementDeclaration, root: SyntaxElement, budget: SemanticBudget,
  options: Parameters<typeof assessSchemaElementInstance>[2] = {}) {
  inspectStandardSchemaElement(declaration);
  return assessSchemaElementInstance(root, budget, options);
}
