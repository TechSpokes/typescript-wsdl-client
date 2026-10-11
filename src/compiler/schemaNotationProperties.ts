/** Shared notation property mapping and rules; never source/context authority. */
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';
import type {SchemaInterpretation} from '../loader/schemaInput.js';
import {isXmlNCName} from '../loader/orderedSyntax.js';
import {normalizeWhitespace} from '../util/xmlWhitespace.js';
import {schemaUri} from './schemaUri.js';
import type {SemanticBudget} from './semanticBudget.js';

export type SchemaNotationProperties = Readonly<{
  name: ExpandedName;
  publicIdentifier: string | undefined;
  systemIdentifier: string | undefined;
}>;
export type NotationPropertyFailure = Readonly<{
  kind: 'invalid-schema'; rule: 'n-props-correct'; message: string;
}>;
export type SourceNotationProperties = Readonly<{kind: 'properties'; properties: SchemaNotationProperties}> | NotationPropertyFailure;
const checked = Object.freeze({kind: 'checked' as const});
function failure(message: string, budget: SemanticBudget): NotationPropertyFailure {
  budget.chargeWork(64 + message.length);
  return Object.freeze({kind: 'invalid-schema', rule: 'n-props-correct', message});
}

/** Source target-namespace mapping, including chameleon include interpretation. */
export function sourceNotationNamespace(schema: SchemaInterpretation, budget: SemanticBudget): string {
  for (const attribute of schema.syntax.attributes) {
    budget.chargeWork(6 + attribute.name.namespace.length + attribute.name.local.length);
    if (attribute.name.namespace === '' && attribute.name.local === 'targetNamespace') {
      budget.chargeWork(2 + 4 * attribute.value.length);
      return normalizeWhitespace(attribute.value, 'collapse');
    }
  }
  budget.chargeWork(2);
  if (schema.context.kind !== 'include') return '';
  budget.chargeWork(2 + 4 * schema.context.namespace.length);
  return normalizeWhitespace(schema.context.namespace, 'collapse');
}

/** XML source mapping only. Invalid named tuples remain available for reservation. */
export function readSourceNotationProperties(syntax: SyntaxElement, effectiveNamespace: string, budget: SemanticBudget): SourceNotationProperties {
  let local: string | undefined, publicIdentifier: string | undefined, systemIdentifier: string | undefined;
  for (const attribute of syntax.attributes) {
    budget.chargeWork(8 + attribute.name.namespace.length + attribute.name.local.length);
    if (attribute.name.namespace !== '') continue;
    const field = attribute.name.local;
    if (field !== 'name' && field !== 'public' && field !== 'system') continue;
    budget.chargeWork(2 + 4 * attribute.value.length);
    const value = normalizeWhitespace(attribute.value, 'collapse');
    if (field === 'name' && local === undefined) local = value;
    else if (field === 'public' && publicIdentifier === undefined) publicIdentifier = value;
    else if (field === 'system' && systemIdentifier === undefined) systemIdentifier = value;
  }
  if (local === undefined) return failure('Notation requires a name property', budget);
  budget.chargeWork(2 + 4 * effectiveNamespace.length);
  const namespace = normalizeWhitespace(effectiveNamespace, 'collapse');
  budget.chargeWork(96); // Mapped QName, complete tuple, result and their frozen fields.
  return Object.freeze({kind: 'properties', properties: Object.freeze({
    name: Object.freeze({namespace, local}), publicIdentifier, systemIdentifier,
  })});
}

/** Abstract values are checked as supplied, without source normalization/repair. */
export function checkNotationProperties(properties: SchemaNotationProperties, budget: SemanticBudget): typeof checked | NotationPropertyFailure {
  const {name, publicIdentifier, systemIdentifier} = properties;
  budget.chargeWork(12 + name.local.length * 4);
  if (!isXmlNCName(name.local)) return failure('Notation name must be an XML NCName', budget);
  const step = (_owner: SchemaNotationProperties, count = 1): void => budget.chargeWork(count);
  if (name.namespace !== '' && !schemaUri(name.namespace, properties, {step})) return failure('Notation namespace must be a URI reference or absent', budget);
  if (publicIdentifier === undefined && systemIdentifier === undefined) return failure('Notation requires a public or system identifier', budget);
  if (publicIdentifier !== undefined) {
    budget.chargeWork(2 + 4 * publicIdentifier.length);
    if (!/^[\r\na-zA-Z0-9 \-'()+,.\/:=?;!*#@$_%]*$/.test(publicIdentifier)) return failure('Notation public identifier has an invalid XML PubidChar', budget);
  }
  if (systemIdentifier !== undefined && !schemaUri(systemIdentifier, properties, {step})) return failure('Notation system identifier must be a URI reference', budget);
  budget.chargeWork(); return checked;
}

export function notationNameKey(name: ExpandedName, budget: SemanticBudget): string {
  budget.chargeWork(30 + 6 * (name.namespace.length + name.local.length));
  return JSON.stringify([name.namespace, name.local]);
}

/** Complete property equality: absent identifiers never fill from another tuple. */
export function equalNotationProperties(left: SchemaNotationProperties, right: SchemaNotationProperties, budget: SemanticBudget): boolean {
  budget.chargeWork(16 + left.name.namespace.length + right.name.namespace.length + left.name.local.length + right.name.local.length +
    (left.publicIdentifier?.length ?? 0) + (right.publicIdentifier?.length ?? 0) +
    (left.systemIdentifier?.length ?? 0) + (right.systemIdentifier?.length ?? 0));
  return left.name.namespace === right.name.namespace && left.name.local === right.name.local &&
    left.publicIdentifier === right.publicIdentifier && left.systemIdentifier === right.systemIdentifier;
}
