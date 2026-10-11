/** Compatibility adapter for shared pure schema rules; no aggregate assessment. */
import type {GraphNode, NodeId, Reference} from './canonicalGraph.js';
import {occurrenceAlgebra} from './occurrenceAnalysis.js';
import {checkNotationProperties} from './schemaNotationProperties.js';
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
  const notation = (namespace: string, local: string, owner: GraphNode): void => {
    text(namespace, owner); text(local, owner);
    const result = context.lookupNotation({namespace, local});
    if (result.kind === 'found') {
      const properties = checkNotationProperties(result.properties, context.budget);
      if (properties.kind !== 'checked') return fail(owner, properties.rule, properties.message);
      return;
    }
    if (result.kind === 'unresolved') return unresolved(owner, result.rule, 'NOTATION membership requires complete authenticated component properties');
    if (result.kind === 'outside-context') return unresolved(owner, 'notation-context-membership', 'NOTATION declaration is outside the active context');
    return fail(owner, 'cvc-datatype-valid', 'NOTATION operand names no declared notation');
  };
  return {context, notation, budget: context.budget, step, text, get, target, fail, unsupported, unresolved, indeterminate,
    setCurrent(node: GraphNode) {current = node;}, algebra: occurrenceAlgebra(() => step())};
}
export type AssessmentContext = ReturnType<typeof schemaScalarContext>;
