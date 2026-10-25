/**
 * Original parsed schema documents; never a hypothetical-schema validity receipt.
 * Checked means document representation plus the fixed S4S instance episode;
 * explicit imported-XML prerequisites and component construction remain separate.
 * Primary 2004 Structures: declare-schema, src-import, declare-notation,
 * Notation_Declaration_details, no-identity, declare-annotation and sch-props-correct/c-nmd.
 * S4S grammar corroboration: dgis/xsddiagram@9aedeb7dedfdd2fcd6bf916345499468dd4aa931,
 * XSD/XMLSchema.xsd (e767a159c179bd6e4dc2bac2a63a62f50cbd027ec19d6b5cc9eb1c2f33e0cb2e).
 * The complete grammar was independently compared to the dated REC Appendix A
 * Structures/Datatypes text. Imported XML version prerequisites stay explicit.
 */
import type {SchemaInput, SchemaInterpretation} from '../loader/schemaInput.js';
import {XSD_NAMESPACE, XML_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import type {SemanticLimits} from './resolveCanonicalGraph.js';
import {assertSemanticContext, prepareSemanticRequest} from './semanticContext.js';
import type {SemanticContext, SemanticPreparation} from './semanticContext.js';
import {createSemanticBudget} from './semanticBudget.js';
import type {SemanticBudget, ResourceLimitFailure} from './semanticBudget.js';
import {normalizeWhitespace} from './schemaDatatypeValues.js';
import {schemaUri} from './schemaUri.js';
import {assessSchemaSourceWildcards, validSchemaXmlLanguage} from './schemaSourceWildcards.js';
import type {SourceWildcardObligation} from './schemaSourceWildcards.js';
import {checkNotationProperties, equalNotationProperties, notationNameKey, readSourceNotationProperties, sourceNotationNamespace} from './schemaNotationProperties.js';
import type {SchemaNotationProperties} from './schemaNotationProperties.js';
import {prepareBoundSourceGraph, sourceSchemasForResolvedGraph} from './sourceSchemaBinding.js';
import type {SourcePreparationFailure} from './sourceSchemaBinding.js';

export type {SourcePreparationFailure} from './sourceSchemaBinding.js';
export type SourceSchemaPreparation = SemanticPreparation | SourcePreparationFailure;
type RemainingDocumentObligation = 'child-component-syntax' | 'semantic-construction' |
  'foreign-attribute-assessment' | 'annotation-payload-assessment' | 'namespace-interpretation';
export type SchemaDocumentResult = Readonly<{
  kind: 'checked'; authority: 'XSD10-schema-document-syntax-v1'; scope: 'schema-document-source-syntax';
  contextId: string; sources: readonly Readonly<{key: string; digest: string; source: SyntaxSource}>[];
  remaining: readonly RemainingDocumentObligation[];
  wildcardObligations: readonly SourceWildcardObligation[];
}> | Readonly<{kind: 'invalid-schema' | 'unsupported-capability'; rule: string; message: string; source: SyntaxSource}>
  | Readonly<{kind: 'unresolved'; rule: 'actual-source-only' | 'missing-source-syntax'}> | ResourceLimitFailure;

const sourceDocuments = new WeakMap<SemanticContext, readonly SchemaInterpretation[]>();

/**
 * One issued input snapshot owns both graph construction and retained source syntax.
 * Loading happened before entry. Canonical construction/reference resolution retain
 * their named legacy limits; the snapshot/context/syntax share the supplied budget.
 */
export function prepareSourceSchemaRequest(input: SchemaInput, options: Readonly<{
  budget?: SemanticBudget; sourceLimits?: SemanticLimits; accountPreparation?: true;
}> = {}): SourceSchemaPreparation {
  const budget = options.budget ?? createSemanticBudget();
  const source = prepareBoundSourceGraph(input, {budget, sourceLimits: options.sourceLimits, accountPreparation: options.accountPreparation});
  if (source.kind !== 'prepared') return source;
  return budget.guard(() => {
    const prepared = prepareSemanticRequest(source.resolved, {budget});
    if (prepared.kind === 'prepared') {
      budget.chargeWork(2);
      sourceDocuments.set(prepared.request.actual, sourceSchemasForResolvedGraph(source.resolved)!);
    }
    return prepared;
  });
}

class DocumentProblem extends Error {
  constructor(readonly kind: 'invalid-schema' | 'unsupported-capability', readonly rule: string,
    message: string, readonly source: SyntaxSource) {super(message);}
}
const globals = new Set(['simpleType', 'complexType', 'element', 'attribute', 'group', 'attributeGroup', 'notation']);
const unsupported = new Set(['redefine', 'override', 'assert', 'assertion', 'alternative', 'openContent', 'defaultOpenContent', 'explicitTimezone']);
const rootAttributes = ['id', 'attributeFormDefault', 'elementFormDefault', 'blockDefault', 'finalDefault', 'targetNamespace', 'version'];

/** Checks source document representation only; component grammar/semantics remain owned elsewhere. */
export function checkSchemaDocumentSyntax(context: SemanticContext): SchemaDocumentResult {
  assertSemanticContext(context);
  const budget = context.budget;
  return budget.guard(() => {
    budget.chargeWork(100);
    if (context.kind !== 'actual') return Object.freeze({kind: 'unresolved', rule: 'actual-source-only'});
    const schemas = sourceDocuments.get(context);
    if (!schemas) return Object.freeze({kind: 'unresolved', rule: 'missing-source-syntax'});
    budget.chargeWork(16);
    const checkedRoots = new Set<SyntaxElement>();
    const sources: {key: string; digest: string; source: SyntaxSource}[] = [];
    const wildcardObligations: SourceWildcardObligation[] = [];
    const step = (_owner: SyntaxElement, count = 1): void => budget.chargeWork(count);
    const text = (value: string): void => budget.chargeWork(2 + value.length * 4);
    const fail = (node: SyntaxElement, rule: string, message: string): never => {
      budget.chargeWork(8 + rule.length + message.length);
      throw new DocumentProblem('invalid-schema', rule, message, node.source);
    };
    const rejectUnsupported = (node: SyntaxElement): never => {
      text(node.name.local); budget.chargeWork(150);
      throw new DocumentProblem('unsupported-capability', `xsd:${node.name.local}`, 'Source feature is outside the approved XSD 1.0 profile', node.source);
    };
    const value = (node: SyntaxElement, name: string): string | undefined => {
      for (const attr of node.attributes) {
        budget.chargeWork(4); text(attr.name.local);
        if (attr.name.namespace === '' && attr.name.local === name) {text(attr.value); return normalizeWhitespace(attr.value, 'collapse');}
      }
      return undefined;
    };
    const uri = (node: SyntaxElement, lexical: string): void => {
      if (!schemaUri(lexical, node, {step})) fail(node, 'schema-for-schemas', 'Invalid schema anyURI value');
    };
    const notationProperties = (node: SyntaxElement, namespace: string): SchemaNotationProperties => {
      const mapped = readSourceNotationProperties(node, namespace, budget);
      if (mapped.kind === 'invalid-schema') return fail(node, mapped.rule, mapped.message);
      return mapped.properties;
    };
    const attrs = (node: SyntaxElement, allowed: readonly string[], language = false): void => {
      for (const attr of node.attributes) {
        budget.chargeWork(10 + allowed.length); text(attr.name.local); text(attr.name.namespace); text(attr.value);
        if (language && attr.name.namespace === XML_NAMESPACE && attr.name.local === 'lang') {
          if (!validSchemaXmlLanguage(attr.value, budget)) fail(node, 'schema-for-schemas', 'Invalid language value');
        } else if (attr.name.namespace === XSD_NAMESPACE || attr.name.namespace === '' && !allowed.includes(attr.name.local)) {
          fail(node, 'schema-for-schemas', 'Attribute is not permitted in this schema document syntax');
        }
      }
    };
    const children = (node: SyntaxElement): SyntaxElement[] => {
      budget.chargeWork(2); const result: SyntaxElement[] = [];
      for (const child of node.children) {
        budget.chargeWork(3);
        if (child.kind === 'element') {budget.chargeWork(); result.push(child);}
        else {text(child.value); if (/[^\t\r\n ]/.test(child.value)) fail(node, 'schema-for-schemas', 'Schema syntax requires element-only content');}
      }
      return result;
    };
    try {
      for (const schema of schemas) {
        budget.chargeWork(8); text(schema.key); text(schema.digest);
        sources.push(Object.freeze({key: schema.key, digest: schema.digest, source: schema.syntax.source}));
        const root = schema.syntax;
        if (checkedRoots.has(root)) continue;
        budget.chargeWork(5); checkedRoots.add(root);
        // Preserve source-profile classification before evaluating the separate
        // S4S instance episode. Inert annotation descendants are not components.
        budget.chargeWork(2); const sourceStack = [root];
        while (sourceStack.length) {
          budget.chargeWork(3); const node = sourceStack.pop()!;
          if (node.name.namespace !== XSD_NAMESPACE) continue;
          text(node.name.local);
          if (unsupported.has(node.name.local)) rejectUnsupported(node);
          if (node.name.local === 'annotation') continue;
          for (const child of node.children) {
            budget.chargeWork(2);
            if (child.kind === 'element') {budget.chargeWork(); sourceStack.push(child);}
          }
        }
        const wildcardResult = assessSchemaSourceWildcards(root, budget);
        if (wildcardResult.kind !== 'checked') return wildcardResult;
        budget.chargeWork(wildcardResult.remaining.length + 1);
        wildcardObligations.push(...wildcardResult.remaining);
        attrs(root, rootAttributes, true);
        const namespace = value(root, 'targetNamespace');
        if (namespace !== undefined) {if (namespace === '') fail(root, 'declare-schema', 'An explicit target namespace cannot be empty'); uri(root, namespace);}
        for (const name of ['attributeFormDefault', 'elementFormDefault']) {
          const form = value(root, name);
          if (form !== undefined && form !== 'qualified' && form !== 'unqualified') fail(root, 'schema-for-schemas', 'Invalid schema form default');
        }
        for (const name of ['blockDefault', 'finalDefault']) {
          const lexical = value(root, name);
          if (lexical === undefined || lexical === '' || lexical === '#all') continue;
          text(lexical); budget.chargeWork(10);
          const allowed = name === 'blockDefault' ? ['extension', 'restriction', 'substitution'] : ['extension', 'restriction', 'list', 'union'];
          if (lexical.split(' ').some(token => !allowed.includes(token))) fail(root, 'schema-for-schemas', 'Invalid schema default derivation set');
        }
        budget.chargeWork(); const notationNames = new Set<string>();
        let declarations = false;
        for (const child of children(root)) {
          budget.chargeWork(4); text(child.name.local); text(child.name.namespace);
          if (child.name.namespace !== XSD_NAMESPACE) fail(child, 'schema-for-schemas', 'Schema root child must be an XSD declaration');
          const role = child.name.local;
          if (unsupported.has(role)) rejectUnsupported(child);
          if (role === 'annotation') continue;
          if (role === 'include' || role === 'import') {
            if (declarations) fail(child, 'schema-for-schemas', 'Schema directives must precede declarations');
            attrs(child, role === 'include' ? ['id', 'schemaLocation'] : ['id', 'namespace', 'schemaLocation']);
            const location = value(child, 'schemaLocation');
            if (location !== undefined) uri(child, location);
            else if (role === 'include') fail(child, 'schema-for-schemas', 'Include requires schemaLocation');
            if (role === 'import') {
              const imported = value(child, 'namespace');
              if (imported !== undefined) {uri(child, imported); if (imported === namespace) fail(child, 'src-import', 'Import namespace must differ from the enclosing target namespace');}
              else if (namespace === undefined) fail(child, 'src-import', 'Import without namespace requires an enclosing target namespace');
            }
            continue;
          }
          if (!globals.has(role)) fail(child, 'schema-for-schemas', 'Unexpected schema root child');
          declarations = true;
          if (role === 'notation') {
            attrs(child, ['id', 'name', 'public', 'system']);
            const properties = notationProperties(child, namespace ?? '');
            const valid = checkNotationProperties(properties, budget);
            if (valid.kind === 'invalid-schema') fail(child, valid.rule, valid.message);
            const name = properties.name.local;
            // S4S schema/notation key is scoped to this physical schema root.
            // Equal cross-document representations are reconciled separately.
            text(name); budget.chargeWork(2);
            if (notationNames.has(name)) fail(child, 'schema-notation-key', 'Notation names must be unique within their schema validation root');
            notationNames.add(name);
          }
        }
        // Contextual S4S owns typed ID/IDREF scope across source and payload;
        // the source profile walk above does not type them a second time.
      }
      // no-identity fixes top-level notation identity by component kind and
      // expanded name. Equal complete property records describe that one
      // component even when represented by distinct original XML declarations.
      // Absence is a property state, not unknown information to fill from peers.
      // All original annotations and document obligations were checked above.
      budget.chargeWork(3); const notations = new Map<string, SchemaNotationProperties>();
      let namespaceInterpretation = false;
      for (const schema of schemas) {
        budget.chargeWork(5); text(schema.targetNamespace); text(schema.context.namespace);
        const effectiveNamespace = sourceNotationNamespace(schema, budget);
        // The legacy loader preserves raw namespace spellings. Source anyURI
        // normalization must not silently certify that legacy symbol mapping.
        if (schema.targetNamespace !== effectiveNamespace) namespaceInterpretation = true;
        for (const child of schema.syntax.children) {
          budget.chargeWork(5);
          if (child.kind !== 'element' || child.name.namespace !== XSD_NAMESPACE || child.name.local !== 'notation') continue;
          const properties = notationProperties(child, effectiveNamespace);
          const key = notationNameKey(properties.name, budget);
          const previous = notations.get(key);
          if (previous !== undefined) {
            if (!equalNotationProperties(previous, properties, budget)) {
              fail(child, 'notation-component-properties', 'Same-name notation representations must have equal public and system identifier properties');
            }
          } else {
            budget.chargeWork(); notations.set(key, properties);
          }
        }
      }
      budget.chargeWork(500 + context.contextId.length);
      const remaining: RemainingDocumentObligation[] = ['child-component-syntax', 'semantic-construction'];
      for (const category of ['foreign-attribute-assessment', 'annotation-payload-assessment'] as const) {
        budget.chargeWork(wildcardObligations.length + 1);
        if (wildcardObligations.some(obligation => obligation.category === category)) remaining.push(category);
      }
      if (namespaceInterpretation) remaining.push('namespace-interpretation');
      return Object.freeze({kind: 'checked', authority: 'XSD10-schema-document-syntax-v1', scope: 'schema-document-source-syntax',
        contextId: context.contextId, sources: Object.freeze(sources), remaining: Object.freeze(remaining),
        wildcardObligations: Object.freeze(wildcardObligations)});
    } catch (error) {
      if (!(error instanceof DocumentProblem)) throw error;
      budget.chargeWork(180 + error.rule.length + error.message.length);
      return Object.freeze({kind: error.kind, rule: error.rule, message: error.message, source: error.source});
    }
  });
}
