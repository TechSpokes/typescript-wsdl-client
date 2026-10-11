/**
 * Original parsed schema documents; never a hypothetical-schema validity receipt.
 * Checked means the implemented document clauses below, not full S4S validation:
 * root/directive/notation/annotation representation, element-only text and root IDs/keys.
 * Primary 2004 Structures: declare-schema, src-import, declare-notation,
 * Notation_Declaration_details, declare-annotation and sch-props-correct/c-nmd.
 * S4S grammar corroboration: dgis/xsddiagram@9aedeb7dedfdd2fcd6bf916345499468dd4aa931,
 * XSD/XMLSchema.xsd (e767a159c179bd6e4dc2bac2a63a62f50cbd027ec19d6b5cc9eb1c2f33e0cb2e).
 * That independent copy explicitly labels itself nonnormative; it is not passed
 * off as the unavailable exact REC Appendix A. Receipt prerequisites stay explicit.
 */
import {assertLoadedSchemaInput} from '../loader/schemaInput.js';
import type {SchemaInput, SchemaInterpretation} from '../loader/schemaInput.js';
import {isXmlNCName, XSD_NAMESPACE, XML_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import {buildCanonicalGraph} from './buildCanonicalGraph.js';
import {GraphError} from './canonicalGraph.js';
import {resolveCanonicalGraph, SemanticError} from './resolveCanonicalGraph.js';
import type {SemanticLimits} from './resolveCanonicalGraph.js';
import {assertSemanticContext, prepareSemanticRequest} from './semanticContext.js';
import type {SemanticContext, SemanticPreparation} from './semanticContext.js';
import {createSemanticBudget} from './semanticBudget.js';
import type {SemanticBudget, ResourceLimitFailure} from './semanticBudget.js';
import {normalizeWhitespace} from './schemaDatatypeValues.js';
import {schemaUri} from './schemaUri.js';

export type SourcePreparationFailure = Readonly<{kind: 'source-preparation-failed';
  stage: 'canonical-build' | 'reference-resolution'; category: GraphError['category'] | SemanticError['category'];
  message: string; source?: SyntaxSource}>;
export type SourceSchemaPreparation = SemanticPreparation | SourcePreparationFailure;
type RemainingDocumentObligation = 'child-component-syntax' | 'semantic-construction' |
  'foreign-attribute-assessment' | 'annotation-payload-assessment' | 'notation-component-identity' | 'namespace-interpretation';
export type SchemaDocumentResult = Readonly<{
  kind: 'checked'; authority: 'XSD10-schema-document-syntax-v1'; scope: 'schema-document-source-syntax';
  contextId: string; sources: readonly Readonly<{key: string; digest: string; source: SyntaxSource}>[];
  remaining: readonly RemainingDocumentObligation[];
}> | Readonly<{kind: 'invalid-schema' | 'unsupported-capability'; rule: string; message: string; source: SyntaxSource}>
  | Readonly<{kind: 'unresolved'; rule: 'actual-source-only' | 'missing-source-syntax'}> | ResourceLimitFailure;

const sourceDocuments = new WeakMap<SemanticContext, readonly SchemaInterpretation[]>();

/**
 * One issued input snapshot owns both graph construction and retained source syntax.
 * Loading happened before entry. Canonical construction/reference resolution retain
 * their named legacy limits; the snapshot/context/syntax share the supplied budget.
 */
export function prepareSourceSchemaRequest(input: SchemaInput, options: Readonly<{
  budget?: SemanticBudget; sourceLimits?: SemanticLimits;
}> = {}): SourceSchemaPreparation {
  assertLoadedSchemaInput(input);
  const budget = options.budget ?? createSemanticBudget();
  return budget.guard(() => {
    const owned = budget.freeze(budget.snapshot(input));
    let stage: SourcePreparationFailure['stage'] = 'canonical-build';
    try {
      const graph = buildCanonicalGraph(owned, {maxNodes: options.sourceLimits?.maxNodes});
      stage = 'reference-resolution';
      const prepared = prepareSemanticRequest(resolveCanonicalGraph(graph, options.sourceLimits), {budget});
      if (prepared.kind === 'prepared') {
        budget.chargeWork(2);
        sourceDocuments.set(prepared.request.actual, owned.schemas);
      }
      return prepared;
    } catch (error) {
      if (!(error instanceof GraphError || error instanceof SemanticError)) throw error;
      budget.chargeWork(200 + error.message.length);
      return Object.freeze({kind: 'source-preparation-failed', stage, category: error.category,
        message: error.message, ...(error.source ? {source: error.source} : {})});
    }
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
    let foreignAttributes = false, annotationPayload = false;
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
    const attrs = (node: SyntaxElement, allowed: readonly string[], language = false): void => {
      for (const attr of node.attributes) {
        budget.chargeWork(10 + allowed.length); text(attr.name.local); text(attr.name.namespace); text(attr.value);
        if (language && attr.name.namespace === XML_NAMESPACE && attr.name.local === 'lang') {
          const lang = normalizeWhitespace(attr.value, 'collapse');
          if (lang !== '' && !/^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/.test(lang)) fail(node, 'schema-for-schemas', 'Invalid language value');
        } else if (attr.name.namespace === XSD_NAMESPACE || attr.name.namespace === '' && !allowed.includes(attr.name.local)) {
          fail(node, 'schema-for-schemas', 'Attribute is not permitted in this schema document syntax');
        } else if (attr.name.namespace !== '') foreignAttributes = true;
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
    const annotation = (node: SyntaxElement): void => {
      attrs(node, ['id']);
      for (const child of children(node)) {
        budget.chargeWork(4); text(child.name.local); text(child.name.namespace);
        if (child.name.namespace !== XSD_NAMESPACE || !['appinfo', 'documentation'].includes(child.name.local)) fail(child, 'schema-for-schemas', 'Annotation permits only appinfo and documentation');
        attrs(child, ['source'], child.name.local === 'documentation');
        const source = value(child, 'source'); if (source !== undefined) uri(child, source);
        // Mixed payload is annotation information, never a nested schema declaration.
        // Its lax wildcard may still require validation when a declaration exists.
        for (const payload of child.children) {budget.chargeWork(); if (payload.kind === 'element') annotationPayload = true;}
      }
    };
    const oneAnnotation = (node: SyntaxElement): void => {
      const content = children(node);
      if (content.length > 1 || content.some(child => child.name.namespace !== XSD_NAMESPACE || child.name.local !== 'annotation')) fail(node, 'schema-for-schemas', 'Only one optional annotation is permitted');
      if (content[0]) annotation(content[0]);
    };
    try {
      for (const schema of schemas) {
        budget.chargeWork(8); text(schema.key); text(schema.digest);
        sources.push(Object.freeze({key: schema.key, digest: schema.digest, source: schema.syntax.source}));
        const root = schema.syntax;
        if (checkedRoots.has(root)) continue;
        budget.chargeWork(5); checkedRoots.add(root);
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
          if (role === 'annotation') {annotation(child); continue;}
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
            oneAnnotation(child); continue;
          }
          if (!globals.has(role)) fail(child, 'schema-for-schemas', 'Unexpected schema root child');
          declarations = true;
          if (role === 'notation') {
            attrs(child, ['id', 'name', 'public', 'system']);
            const name = value(child, 'name'), pub = value(child, 'public'), system = value(child, 'system');
            if (name === undefined || !isXmlNCName(name)) fail(child, 'schema-for-schemas', 'Notation requires an NCName');
            // S4S schema/notation key is scoped to this physical schema root.
            // Cross-document component identity remains semantic construction.
            text(name!); budget.chargeWork(2);
            if (notationNames.has(name!)) fail(child, 'schema-notation-key', 'Notation names must be unique within their schema validation root');
            notationNames.add(name!);
            if (pub === undefined && system === undefined) fail(child, 'notation-properties-correct', 'Notation requires a public or system identifier');
            if (pub !== undefined && !/^[\r\na-zA-Z0-9 \-'()+,.\/:=?;!*#@$_%]*$/.test(pub)) fail(child, 'schema-for-schemas', 'Invalid public identifier');
            if (system !== undefined) uri(child, system);
            oneAnnotation(child);
          }
        }
        // ID typing is scoped to this schema validation root; repeated chameleon
        // interpretations share syntax, while distinct inline roots remain separate.
        budget.chargeWork(3); const ids = new Set<string>(), stack = [root];
        while (stack.length) {
          budget.chargeWork(3); const node = stack.pop()!;
          if (node.name.namespace !== XSD_NAMESPACE) continue;
          text(node.name.local);
          if (unsupported.has(node.name.local)) rejectUnsupported(node);
          // The component grammar owner admits ##other attributes, but does not
          // discharge their lax value assessment. Preserve that obligation on
          // every original XSD representation, including component descendants.
          for (const attr of node.attributes) {
            budget.chargeWork(4); text(attr.name.namespace); text(attr.name.local);
            if (attr.name.namespace !== '' && attr.name.namespace !== XSD_NAMESPACE &&
                !(node === root && attr.name.namespace === XML_NAMESPACE && attr.name.local === 'lang')) foreignAttributes = true;
          }
          const id = value(node, 'id');
          if (id !== undefined) {
            text(id);
            if (!isXmlNCName(id) || ids.has(id)) fail(node, 'schema-id', 'Schema IDs must be NCNames unique within their schema validation root');
            budget.chargeWork(); ids.add(id);
          }
          if (node.name.local === 'annotation') {annotation(node); continue;}
          for (const child of children(node)) {budget.chargeWork(); stack.push(child);}
        }
      }
      // Notations are retained source records, not canonical global nodes. The
      // same physical declaration reused in an effective namespace is one fact;
      // distinct declarations need a semantic component-identity assessment.
      budget.chargeWork(3); const notations = new Map<string, SyntaxElement>();
      let notationIdentity = false, namespaceInterpretation = false;
      for (const schema of schemas) {
        budget.chargeWork(5); text(schema.targetNamespace); text(schema.context.namespace);
        const declaredNamespace = value(schema.syntax, 'targetNamespace');
        const effectiveNamespace = declaredNamespace ?? (schema.context.kind === 'include'
          ? normalizeWhitespace(schema.context.namespace, 'collapse') : '');
        // The legacy loader preserves raw namespace spellings. Source anyURI
        // normalization must not silently certify that legacy symbol mapping.
        if (schema.targetNamespace !== effectiveNamespace) namespaceInterpretation = true;
        for (const child of schema.syntax.children) {
          budget.chargeWork(5);
          if (child.kind !== 'element' || child.name.namespace !== XSD_NAMESPACE || child.name.local !== 'notation') continue;
          const name = value(child, 'name')!;
          budget.chargeWork(30 + 6 * (effectiveNamespace.length + name.length));
          const key = JSON.stringify([effectiveNamespace, name]);
          const previous = notations.get(key);
          if (previous !== undefined && previous !== child) notationIdentity = true;
          else notations.set(key, child);
        }
      }
      budget.chargeWork(500 + context.contextId.length);
      const remaining: RemainingDocumentObligation[] = ['child-component-syntax', 'semantic-construction'];
      if (foreignAttributes) remaining.push('foreign-attribute-assessment');
      if (annotationPayload) remaining.push('annotation-payload-assessment');
      if (notationIdentity) remaining.push('notation-component-identity');
      if (namespaceInterpretation) remaining.push('namespace-interpretation');
      return Object.freeze({kind: 'checked', authority: 'XSD10-schema-document-syntax-v1', scope: 'schema-document-source-syntax',
        contextId: context.contextId, sources: Object.freeze(sources), remaining: Object.freeze(remaining)});
    } catch (error) {
      if (!(error instanceof DocumentProblem)) throw error;
      budget.chargeWork(180 + error.rule.length + error.message.length);
      return Object.freeze({kind: error.kind, rule: error.rule, message: error.message, source: error.source});
    }
  });
}
