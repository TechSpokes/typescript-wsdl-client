/**
 * Fixed S4S instance assessment: dated 2004 Structures/Datatypes Appendix A,
 * cvc-assess-elt, cvc-elt/type/complex-type/attribute/wildcard and cvc-id/key.
 * Parent-selected local declarations outrank global lookup. Application Gamma
 * and schema-location hints never extend this distinct assessment universe.
 * The historical imported XML component inventory remains explicitly qualified.
 */
import {XML_NAMESPACE, XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import type {SemanticBudget, ResourceLimitFailure} from './semanticBudget.js';
import {normalizeWhitespace} from './schemaDatatypeValues.js';
import {createSchemaSourceValues} from './schemaSourceValues.js';
import type {FixedSimpleTypeHandle, SourceIdentityFact} from './schemaSourceValues.js';
import {abstractSourceRole, assessSourceGrammar, globalSourceRole, namedSourceRole, sourceRoleTypeName} from './schemaSourceGrammar.js';
import type {SourceGrammarRole} from './schemaSourceGrammar.js';
import type {SchemaOperand} from './schemaDatatypeValues.js';

const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';
const xsiTypes: Readonly<Record<string, string>> = Object.freeze({type: 'QName', nil: 'boolean',
  schemaLocation: '#schemaLocations', noNamespaceSchemaLocation: 'anyURI'});
export type SourceTypedId = Readonly<{value: string; source: SyntaxSource}>;
export type SourceWildcardObligation = Readonly<{
  category: 'foreign-attribute-assessment' | 'annotation-payload-assessment';
  rule: string; source: SyntaxSource; name: ExpandedName; message?: string;
}>;
export type SourceWildcardResult = Readonly<{kind: 'checked'; remaining: readonly SourceWildcardObligation[]; ids: readonly SourceTypedId[]}>
  | Readonly<{kind: 'invalid-schema'; rule: string; message: string; source: SyntaxSource}>
  | ResourceLimitFailure;

/** Empty lang needs import-version qualification; nonempty language values collapse. */
export function validSchemaXmlLanguage(value: string, budget: SemanticBudget): boolean {
  budget.chargeWork(4 + value.length * 4);
  return value === '' || /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/.test(normalizeWhitespace(value, 'collapse'));
}
class SourceProblem extends Error {
  constructor(readonly rule: string, message: string, readonly source: SyntaxSource) {super(message);}
}
type Scope = {parent?: Scope; direct: Map<string, Set<string>>; identities: Set<string>};
type Frame = {node: SyntaxElement; payload: boolean; role?: SourceGrammarRole; scope?: Scope; parentSchema?: Scope};
type RootReference = SourceIdentityFact & Readonly<{category: SourceWildcardObligation['category']}>;

/** Pure borrowed-syntax clauses. Only the authentic document owner issues aggregate authority. */
export function assessSchemaSourceWildcards(root: SyntaxElement, budget: SemanticBudget): SourceWildcardResult {
  return budget.guard(() => {
    budget.chargeWork(30);
    const remaining: SourceWildcardObligation[] = [], ids: SourceTypedId[] = [], references: RootReference[] = [];
    const idValues = new Set<string>(), values = createSchemaSourceValues(budget);
    let completeIdUniverse = true;
    const stack: Frame[] = [{node: root, payload: false}];
    const fail = (node: SyntaxElement, message: string, rule = 'schema-for-schemas'): never => {
      budget.chargeWork(6 + message.length + rule.length); throw new SourceProblem(rule, message, node.source);
    };
    const pending = (node: SyntaxElement, name: ExpandedName, category: SourceWildcardObligation['category'], rule: string, message?: string): void => {
      budget.chargeWork(8); remaining.push({category, rule, source: node.source, name, ...(message === undefined ? {} : {message})});
    };
    const facts = (node: SyntaxElement, entries: readonly SourceIdentityFact[], category: SourceWildcardObligation['category']): void => {
      for (const entry of entries) {
        budget.chargeWork(5 + entry.value.length);
        if (entry.kind === 'ID') {
          if (idValues.has(entry.value)) fail(node, 'Schema IDs must be unique within their schema validation root', 'schema-id');
          budget.chargeWork(4); idValues.add(entry.value); ids.push({value: entry.value, source: entry.source});
        } else {budget.chargeWork(3); references.push({...entry, category});}
      }
    };
    const assess = (node: SyntaxElement, type: FixedSimpleTypeHandle, lexical: string, name: ExpandedName,
      category: SourceWildcardObligation['category']): SchemaOperand | undefined => {
      budget.chargeWork(6);
      const result = values.assess(type, {value: lexical, context: {namespaces: node.namespaces, source: node.source}}, node);
      if (result.kind === 'resource-limit') {budget.chargeWork(); throw new Error('Unreachable exhausted source budget');}
      if (result.kind === 'invalid-schema') return fail(node, `${result.rule}: ${result.message}`);
      if (result.kind !== 'checked') {pending(node, name, category, result.rule, result.message); return undefined;}
      facts(node, result.identityFacts, category);
      for (const obligation of result.obligations) {budget.chargeWork(); pending(node, obligation.name ?? name, category, obligation.rule);}
      return result.value;
    };
    try {
      while (stack.length) {
        budget.chargeWork(12);
        const frame = stack.pop()!, {node, payload} = frame;
        const category = payload ? 'annotation-payload-assessment' : 'foreign-attribute-assessment';
        budget.chargeWork(node.name.namespace.length + node.name.local.length);
        const declaration = frame.role ?? globalSourceRole(node.name);
        let role = declaration, simpleType: FixedSimpleTypeHandle | undefined, typeName: ExpandedName | undefined;
        let deferredType = false;
        for (const attr of node.attributes) {
          budget.chargeWork(7 + attr.name.namespace.length + attr.name.local.length);
          if (attr.name.namespace !== XSI_NAMESPACE || !Object.hasOwn(xsiTypes, attr.name.local)) continue;
          const assessed = assess(node, values.fixed(xsiTypes[attr.name.local]), attr.value, attr.name, category);
          if (attr.name.local === 'nil' && declaration !== undefined) fail(node, 'A non-nillable S4S declaration forbids xsi:nil presence');
          if (attr.name.local === 'type' && assessed) {
            budget.chargeWork(assessed.canonical.length * 3 + 4);
            const pair = JSON.parse(assessed.canonical) as [string, string];
            typeName = {namespace: pair[0], local: pair[1]};
          }
        }
        if (typeName) {
          budget.chargeWork(8 + typeName.namespace.length + typeName.local.length);
          const complex = namedSourceRole(typeName);
          if (complex !== undefined) {
            if (abstractSourceRole(complex)) fail(node, 'An abstract fixed S4S type cannot assess an element');
            if (declaration !== undefined && sourceRoleTypeName(declaration) !== typeName.local) {
              fail(node, 'xsi:type does not match the declared S4S type under blockDefault=#all');
            }
            role = complex;
          } else {
            const lookup = values.lookup(typeName);
            if (lookup.kind === 'resource-limit') {budget.chargeWork(); throw new Error('Unreachable exhausted source budget');}
            if (lookup.kind === 'unresolved') {
              // Any imported XML type is either absent or a distinct named
              // type. Neither can replace a fixed declaration under block=#all.
              if (declaration !== undefined) fail(node, 'An imported XML type cannot equal the declared S4S type under blockDefault=#all');
              pending(node, typeName, category, lookup.rule); deferredType = true;
            }
            else if (lookup.kind === 'found') {
              if (declaration !== undefined) fail(node, 'A simple xsi:type cannot replace this S4S complex declaration');
              role = undefined; simpleType = lookup.type;
            } else if (declaration !== undefined) fail(node, 'xsi:type is absent from the fixed S4S assessment type universe');
            // Undeclared + genuinely absent type follows lax ur-type fallback.
          }
        }
        if (declaration === undefined && node.name.namespace === XML_NAMESPACE) {
          pending(node, node.name, category, 'schema-for-schemas-auxiliary-element-declarations');
          // An unknown declaration can also supply a value constraint: even a
          // resolved explicit simple type cannot justify rejecting empty text.
          deferredType = true;
        }
        if (deferredType) {
          completeIdUniverse = false;
          // Unknown is not absent: its type may contain a skip wildcard. Do
          // not assign ur/lax to descendants or fabricate negative local facts.
          if (frame.scope) pending(node, node.name, category, 'schema-for-schemas-identity-assessment',
            'Fixed schema-key selectors crossing an unassessed subtree require its typed fields');
          continue;
        }
        if (simpleType) {
          budget.chargeWork(5); const chunks: string[] = [];
          for (const child of node.children) {
            budget.chargeWork(3);
            if (child.kind === 'element') fail(node, 'A simple item type forbids element children');
            else {budget.chargeWork(child.value.length + 1); chunks.push(child.value);}
          }
          for (const attr of node.attributes) {
            budget.chargeWork(4);
            if (attr.name.namespace !== XSI_NAMESPACE || !Object.hasOwn(xsiTypes, attr.name.local)) {
              fail(node, 'A simple item type permits only the four builtin schema-instance attributes');
            }
          }
          budget.chargeWork(chunks.length + 1);
          assess(node, simpleType, chunks.join(''), typeName!, category);
          continue;
        }
        const grammar = assessSourceGrammar(role ?? 'anyType', node, budget);
        if (grammar.kind !== 'checked') return budget.freeze(budget.snapshot(grammar));
        budget.chargeWork(3); const assessedAttributes = new Map<string, SchemaOperand>();
        for (const item of grammar.attributes) {
          budget.chargeWork(3);
          const attr = node.attributes[item.index], assessed = assess(node, values.fixed(item.type), attr.value, attr.name, category);
          if (assessed) {budget.chargeWork(2); assessedAttributes.set(attr.name.local, assessed);}
        }
        for (const attr of node.attributes) {
          budget.chargeWork(6 + attr.name.namespace.length + attr.name.local.length);
          if (attr.name.namespace !== XML_NAMESPACE) continue;
          if (attr.name.local === 'lang') {
            if (!validSchemaXmlLanguage(attr.value, budget)) fail(node, 'Invalid XML language value');
            if (attr.value === '') pending(node, attr.name, category, 'schema-for-schemas-xml-import-version');
            else assess(node, values.fixed('language'), attr.value, attr.name, category);
          } else if (attr.name.local === 'space') {
            budget.chargeWork(attr.value.length * 4 + 3);
            if (!['default', 'preserve'].includes(normalizeWhitespace(attr.value, 'collapse'))) fail(node, 'Invalid XML space value');
          } else if (attr.name.local === 'base') assess(node, values.fixed('anyURI'), attr.value, attr.name, category);
          else {
            pending(node, attr.name, category, 'schema-for-schemas-xml-attribute-declarations');
            completeIdUniverse = false;
          }
        }
        // Seven fixed S4S keys belong to each schema declaration; ID/IDREF
        // duties belong to the outer physical schema validation root.
        let scope = frame.scope;
        if (declaration === 'schema') {budget.chargeWork(7); scope = {parent: scope, direct: new Map(), identities: new Set()};}
        const name = assessedAttributes.get('name')?.canonical;
        if (node.name.namespace === XSD_NAMESPACE && ['key', 'unique', 'keyref'].includes(node.name.local)) {
          if (name === undefined) fail(node, 'S4S identity-constraint key requires an assessed name');
          for (let current = frame.scope; current; current = current.parent) {
            budget.chargeWork(4 + name!.length);
            if (current.identities.has(name!)) fail(node, 'Duplicate S4S descendant identity-constraint key', 'schema-key');
            current.identities.add(name!);
          }
        }
        if (frame.parentSchema && node.name.namespace === XSD_NAMESPACE) {
          const local = node.name.local, key = local === 'simpleType' || local === 'complexType' ? 'type'
            : ['element', 'attribute', 'group', 'attributeGroup', 'notation'].includes(local) ? local : undefined;
          if (key !== undefined) {
            if (name === undefined) fail(node, 'S4S schema key requires an assessed name');
            let members = frame.parentSchema.direct.get(key);
            if (!members) {budget.chargeWork(3); members = new Set(); frame.parentSchema.direct.set(key, members);}
            budget.chargeWork(3 + name!.length);
            if (members.has(name!)) fail(node, 'Duplicate S4S schema declaration key', key === 'notation' ? 'schema-notation-key' : 'schema-key');
            members.add(name!);
          }
        }
        const childrenArePayload = payload || declaration === 'appinfo' || declaration === 'documentation';
        for (let index = grammar.children.length - 1; index >= 0; index--) {
          budget.chargeWork(7);
          const child = grammar.children[index], syntax = node.children[child.index];
          if (syntax.kind !== 'element') throw new Error('Source grammar selected a non-element child');
          stack.push({node: syntax, payload: childrenArePayload, role: child.role, scope,
            ...(declaration === 'schema' ? {parentSchema: scope} : {})});
        }
      }
      for (const reference of references) {
        budget.chargeWork(3 + reference.value.length);
        if (!idValues.has(reference.value)) {
          if (completeIdUniverse) throw new SourceProblem('cvc-id', 'IDREF has no ID in its physical schema validation root', reference.source);
          budget.chargeWork(8);
          remaining.push({category: reference.category, rule: 'cvc-id', source: reference.source,
            name: {namespace: XSD_NAMESPACE, local: 'IDREF'}, message: 'ID binding requires the unresolved imported XML type/declaration inventory'});
        }
      }
      return budget.freeze(budget.snapshot({kind: 'checked' as const, remaining, ids}));
    } catch (error) {
      if (!(error instanceof SourceProblem)) throw error;
      return budget.freeze(budget.snapshot({kind: 'invalid-schema' as const, rule: error.rule, message: error.message, source: error.source}));
    }
  });
}
