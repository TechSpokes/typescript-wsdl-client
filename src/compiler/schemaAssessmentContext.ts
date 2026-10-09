/** Shared bounded state for schema-only assessment; never a payload validator. */
import type {GraphNode, NodeId, Reference} from "./canonicalGraph.js";
import type {OccurrenceAnalysis, ParticleSummary, TypeSummary} from "./occurrenceAnalysis.js";
import {occurrenceAlgebra} from "./occurrenceAnalysis.js";
import type {ComposedType} from "./composeCanonicalGraph.js";
import {referenceTarget, SemanticError, semanticBudget} from "./resolveCanonicalGraph.js";
import type {SemanticLimits} from "./resolveCanonicalGraph.js";
import type {SyntaxSource} from "../loader/orderedSyntax.js";

export class SchemaAssessmentError extends SemanticError {
  constructor(category: "invalid-schema" | "unsupported-capability", readonly rule: string,
    message: string, node: GraphNode, source: SyntaxSource = node.context.source,
    related: readonly SyntaxSource[] = []) {
    super(category, message, node.id, source, related);
    this.name = "SchemaAssessmentError";
  }
}

export function assessmentContext(analysis: OccurrenceAnalysis, limits: SemanticLimits) {
  const graph = analysis.composed.resolved.graph, budget = semanticBudget(limits);
  if (graph.nodes.length > budget.maxNodes) throw new SemanticError("resource-limit", `Assessment exceeds ${budget.maxNodes} graph nodes`);
  const nodes = new Map<NodeId, GraphNode>(), types = new Map<NodeId, ComposedType>();
  const particles = new Map<NodeId, ParticleSummary>(), typeSummaries = new Map<NodeId, TypeSummary>();
  for (const node of graph.nodes) {budget.step(node); nodes.set(node.id, node);}
  for (const type of analysis.composed.types) {budget.step(nodes.get(type.id)); types.set(type.id, type);}
  for (const particle of analysis.particles) {budget.step(nodes.get(particle.id)); particles.set(particle.id, particle);}
  for (const type of analysis.types) {budget.step(nodes.get(type.id)); typeSummaries.set(type.id, type);}
  let current: GraphNode | undefined;
  const step = (node = current, count = 1) => {for (let i = 0; i < count; i++) budget.step(node);};
  const text = (value: string, node = current) => {step(node, value.length); return value;};
  const get = (id: NodeId): GraphNode => nodes.get(id) ?? (() => {throw new SemanticError("invalid-schema", "Missing assessment component", id, current?.context.source);})();
  const target = (reference: Reference, owner: GraphNode) => {
    step(owner);
    if (reference.kind === "symbol") for (const value of [reference.role, reference.name.namespace, reference.name.local]) text(value, owner);
    return referenceTarget(reference, nodes, owner);
  };
  const fail = (node: GraphNode, rule: string, message: string, source?: SyntaxSource, related?: readonly SyntaxSource[]): never => {
    throw new SchemaAssessmentError("invalid-schema", rule, message, node, source, related);
  };
  const unsupported = (node: GraphNode, rule: string, message: string, source?: SyntaxSource): never => {
    throw new SchemaAssessmentError("unsupported-capability", rule, message, node, source);
  };
  return {analysis, graph, nodes, types, particles, typeSummaries, budget, step, text, get, target, fail, unsupported,
    setCurrent: (node: GraphNode) => {current = node;},
    algebra: occurrenceAlgebra(() => step()),
  };
}
export type AssessmentContext = ReturnType<typeof assessmentContext>;
