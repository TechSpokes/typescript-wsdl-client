/** Compatibility adapter for shared pure schema rules; no aggregate assessment. */
import type {GraphNode, NodeId, Reference} from './canonicalGraph.js';
import {occurrenceAlgebra} from './occurrenceAnalysis.js';
import {schemaUri} from './schemaUri.js';
import {XSD_NAMESPACE, isXmlNCName} from '../loader/orderedSyntax.js';
import type {SyntaxSource} from '../loader/orderedSyntax.js';
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';

export class SchemaOperandContextError extends Error {
  constructor(readonly component: string, readonly rule: string) {super('Scalar operand is outside the authenticated context');}
}
export class SchemaAssessmentError extends Error {
  constructor(readonly category: 'invalid-schema' | 'unsupported-capability' | 'scalar-indeterminate' | 'missing-prerequisite',
    readonly rule: string, message: string, readonly node: GraphNode, readonly source: SyntaxSource = node.context.source,
    readonly related: readonly SyntaxSource[] = []) {super(message); this.name = 'SchemaAssessmentError';}
}
export function schemaScalarContext(context: SemanticContext) {
  assertSemanticContext(context);
  let current: GraphNode | undefined;
  const step = (_node = current, count = 1): void => context.budget.chargeWork(count);
  const text = (value: string, node = current): string => {step(node, 4 * value.length + 1); return value;};
  const get = (id: NodeId): GraphNode => {
    const result = context.lookup(id);
    if (result.kind !== 'found') throw new SchemaOperandContextError(id, result.kind);
    return result.node;
  };
  const fail = (node: GraphNode, rule: string, message: string, source?: SyntaxSource, related?: readonly SyntaxSource[]): never => {
    throw new SchemaAssessmentError('invalid-schema', rule, message, node, source, related);
  };
  const unsupported = (node: GraphNode, rule: string, message: string, source?: SyntaxSource): never => {
    throw new SchemaAssessmentError('unsupported-capability', rule, message, node, source);
  };
  const unresolved = (node: GraphNode, rule: string, message: string, source?: SyntaxSource): never => {
    throw new SchemaAssessmentError('missing-prerequisite', rule, message, node, source);
  };
  const indeterminate = (node: GraphNode, rule: string, source?: SyntaxSource): never => {
    throw new SchemaAssessmentError('scalar-indeterminate', rule, 'Scalar ordering is indeterminate', node, source);
  };
  const target = (reference: Reference, owner: GraphNode): NodeId | undefined => {
    const result = context.resolve(reference);
    if (result.kind === 'builtin') return undefined;
    if (result.kind !== 'found') return unresolved(owner, 'src-resolve', `Reference is ${result.kind}`);
    return result.node.id;
  };
  let notationNames: Set<string> | undefined;
  const notation = (namespace: string, local: string, owner: GraphNode): void => {
    if (!notationNames) {
      step(owner); const checkedNames = new Set<string>();
      for (const retained of context.sourceSchemaRetained()) {
        step(owner, 12 + retained.syntax.attributes.length * 8);
        if (retained.syntax.name.namespace !== XSD_NAMESPACE || retained.syntax.name.local !== 'notation') continue;
        const rawName = retained.syntax.attributes.find(a => !a.name.namespace && a.name.local === 'name')?.value;
        if (rawName !== undefined) text(rawName, owner);
        const collapse = (value: string) => value.replace(/[\t\r\n ]+/g, ' ').replace(/^ | $/g, '');
        const name = rawName === undefined ? undefined : collapse(rawName);
        if (!name || !isXmlNCName(name)) return fail(owner, 'n-props-correct', 'Retained notation requires an XML NCName', retained.context.source);
        const publicId = retained.syntax.attributes.find(a => !a.name.namespace && a.name.local === 'public')?.value;
        const systemId = retained.syntax.attributes.find(a => !a.name.namespace && a.name.local === 'system')?.value;
        if (publicId === undefined && systemId === undefined) return fail(owner, 'n-props-correct', 'Notation requires a public or system identifier', retained.context.source);
        if (publicId !== undefined) {
          text(publicId, owner);
          if (!/^[ A-Za-z0-9\-'()+,./:=?;!*#@$_%]*$/.test(collapse(publicId))) return fail(owner, 'n-props-correct', 'Notation public identifier has an invalid XML PubidChar', retained.context.source);
        }
        if (systemId !== undefined && !schemaUri(systemId, owner, {step})) return fail(owner, 'n-props-correct', 'Notation system identifier is not a URI reference', retained.context.source);
        text(name, owner); text(retained.context.effectiveNamespace, owner);
        checkedNames.add(JSON.stringify([retained.context.effectiveNamespace, name]));
      }
      notationNames = checkedNames;
    }
    text(namespace, owner); text(local, owner);
    if (!notationNames.has(JSON.stringify([namespace, local]))) {
      if (context.kind === 'candidate') return unresolved(owner, 'notation-context-membership', 'Fresh hypothetical notation declarations require explicit complete-context membership');
      return fail(owner, 'cvc-datatype-valid', 'NOTATION operand names no declared notation');
    }
  };
  return {context, notation, budget: context.budget, step, text, get, target, fail, unsupported, unresolved, indeterminate,
    setCurrent(node: GraphNode) {current = node;}, algebra: occurrenceAlgebra(() => step())};
}
export type AssessmentContext = ReturnType<typeof schemaScalarContext>;
