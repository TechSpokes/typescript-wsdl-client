/** Exact S06 summaries of child particles. Intervals never describe the full language. */
import {deepFreeze} from "./canonicalGraph.js";
import type {GraphNode, NodeId, Occurs, ParticleNode, Reference} from "./canonicalGraph.js";
import type {ExpandedName} from "../loader/orderedSyntax.js";
import type {ComposedGraph} from "./composeCanonicalGraph.js";
import {referenceTarget, SemanticError, semanticBudget} from "./resolveCanonicalGraph.js";
import type {SemanticLimits} from "./resolveCanonicalGraph.js";

export type Bound = Occurs["max"];
export const ZERO_OCCURS: Occurs = Object.freeze({min: "0", max: "0"});
const ONE_OCCURS: Occurs = Object.freeze({min: "1", max: "1"});

/** Charge operand and result work before BigInt conversion or arithmetic allocation. */
export function occurrenceAlgebra(charge: () => void) {
  const work = (length: number) => {for (let i = 0; i < length; i++) charge();};
  const compare = (a: Bound, b: Bound): number => {
    work(a.length + b.length);
    return a === b ? 0 : a === "unbounded" ? 1 : b === "unbounded" ? -1 : a.length === b.length ? (a < b ? -1 : 1) : a.length < b.length ? -1 : 1;
  };
  const finite = (value: Bound): boolean => {
    work(value.length);
    return value === "unbounded" || /^(0|[1-9][0-9]*)$/.test(value);
  };
  const validate = (range: Occurs) => {
    if (range.min === "unbounded" || !finite(range.min) || !finite(range.max) || compare(range.min, range.max) > 0) {
      throw new SemanticError("invalid-schema", "Malformed occurrence range");
    }
  };
  const add = (a: Bound, b: Bound): Bound => {
    work(a.length + b.length + 1);
    return a === "unbounded" || b === "unbounded" ? "unbounded" : (BigInt(a) + BigInt(b)).toString();
  };
  const multiply = (a: Bound, b: Bound): Bound => {
    work(a.length + b.length);
    if (a === "0" || b === "0") return "0";
    if (a === "unbounded" || b === "unbounded") return "unbounded";
    // Conservative decimal multiplication work also bounds the result's digit allocation.
    for (let i = 0; i < a.length; i++) work(b.length);
    return (BigInt(a) * BigInt(b)).toString();
  };
  return {compare, validate, add, multiply,
    sum: (a: Occurs, b: Occurs): Occurs => ({min: add(a.min, b.min), max: add(a.max, b.max)}),
    product: (a: Occurs, b: Occurs): Occurs => ({min: multiply(a.min, b.min), max: multiply(a.max, b.max)}),
    alternative: (a: Occurs, b: Occurs): Occurs => ({min: compare(a.min, b.min) <= 0 ? a.min : b.min, max: compare(a.max, b.max) >= 0 ? a.max : b.max}),
  };
}

export type PropertyContribution = Readonly<{
  name: ExpandedName; occurs: Occurs; declarations: readonly NodeId[]; particles: readonly NodeId[];
}>;
export type ParticleSummary = Readonly<{
  id: NodeId; nullable: boolean; hasRealization: boolean; elements: readonly PropertyContribution[]; wildcard: Occurs;
  /** XSD's formal ETR / Particle Emptiable predicate, not language emptiness. */
  effectiveTotalRange: Occurs; schemaEmptiable: boolean;
}>;
export type TypeSummary = Readonly<{
  id: NodeId; children: Omit<ParticleSummary, "id">;
  /** Named contributions cover declared particles only when opaque builtin content exists. */
  scope: "declared-particles" | "declared-particles-with-opaque-builtin";
}>;
export type OccurrenceAnalysis = Readonly<{
  composed: ComposedGraph; particles: readonly ParticleSummary[]; types: readonly TypeSummary[];
  assessment: "requires-schema-assessment"; metrics: Readonly<{steps: number}>;
}>;
export type AnalysisResult = Readonly<
  {kind: "analyzed"; analysis: OccurrenceAnalysis} |
  {kind: "failure"; diagnostic: SemanticError}
>;

/** Pure bounded DAG evaluation. Element/type value recursion is an atomic element boundary. */
export function analyzeOccurrences(composed: ComposedGraph, limits: SemanticLimits = {}): AnalysisResult {
  let current: GraphNode | undefined;
  try {
    const graph = composed.resolved.graph, budget = semanticBudget(limits);
    if (graph.nodes.length > budget.maxNodes) throw new SemanticError("resource-limit", `Analysis exceeds ${budget.maxNodes} graph nodes`);
    const nodes = new Map<NodeId, GraphNode>();
    for (const n of graph.nodes) {budget.step(n); nodes.set(n.id, n);}
    const summaries = new Map<NodeId, ParticleSummary>(), active = new Set<NodeId>();
    const algebra = occurrenceAlgebra(() => budget.step(current));
    const get = (id: NodeId): GraphNode => nodes.get(id) ?? (() => {throw new SemanticError("invalid-schema", "Missing structural component", id, current?.context.source);})();
    const key = (name: ExpandedName) => {
      for (const value of [name.namespace, name.local]) for (let i = 0; i < value.length; i++) budget.step(current);
      return JSON.stringify([name.namespace, name.local]);
    };
    const target = (reference: Reference, owner: GraphNode) => {
      if (reference.kind === "symbol") for (const value of [reference.role, reference.name.namespace, reference.name.local]) for (let i = 0; i < value.length; i++) budget.step(owner);
      return referenceTarget(reference, nodes, owner);
    };
    const copyIds = (a: readonly NodeId[], b: readonly NodeId[]): readonly NodeId[] => {
      const unique = new Set<NodeId>();
      for (const list of [a, b]) for (const id of list) {budget.step(current); for (let i = 0; i < id.length; i++) budget.step(current); unique.add(id);}
      return [...unique];
    };
    type Content = Omit<ParticleSummary, "id">;
    const empty = (): Content => ({nullable: true, hasRealization: true, elements: [], wildcard: ZERO_OCCURS, effectiveTotalRange: ZERO_OCCURS, schemaEmptiable: true});
    const combine = (input: readonly Content[], choice: boolean): Content => {
      const parts: Content[] = [];
      let effectiveTotalRange = ZERO_OCCURS;
      for (let i = 0; i < input.length; i++) {
        const part = input[i]; budget.step(current);
        // Formal ETR includes all declared alternatives, even an empty choice.
        effectiveTotalRange = choice ? i === 0 ? part.effectiveTotalRange : algebra.alternative(effectiveTotalRange, part.effectiveTotalRange) : algebra.sum(effectiveTotalRange, part.effectiveTotalRange);
        if (!choice || part.hasRealization) parts.push(part);
      }
      const formal = {effectiveTotalRange, schemaEmptiable: effectiveTotalRange.min === "0"};
      const elements = new Map<string, PropertyContribution>();
      let wildcard = ZERO_OCCURS, nullable = !choice;
      const hasRealization = choice ? parts.length > 0 : parts.every(p => p.hasRealization);
      if (!hasRealization) return {...formal, nullable: false, hasRealization: false, elements: [], wildcard: ZERO_OCCURS};
      for (let i = 0; i < parts.length; i++) {
        budget.step(current); const part = parts[i], present = new Set<string>();
        nullable = choice ? nullable || part.nullable : nullable && part.nullable;
        wildcard = choice && i > 0 ? algebra.alternative(wildcard, part.wildcard) : choice ? part.wildcard : algebra.sum(wildcard, part.wildcard);
        for (const p of part.elements) {
          budget.step(current); const k = key(p.name); present.add(k); const prior = elements.get(k);
          const occurs = prior ? (choice ? algebra.alternative(prior.occurs, p.occurs) : algebra.sum(prior.occurs, p.occurs)) : choice && i > 0 ? algebra.alternative(ZERO_OCCURS, p.occurs) : p.occurs;
          elements.set(k, {name: p.name, occurs, declarations: copyIds(prior?.declarations ?? [], p.declarations), particles: copyIds(prior?.particles ?? [], p.particles)});
        }
        if (choice) for (const [k, p] of elements) {
          budget.step(current); if (!present.has(k)) elements.set(k, {...p, occurs: algebra.alternative(p.occurs, ZERO_OCCURS)});
        }
      }
      return {...formal, nullable, hasRealization, elements: [...elements.values()], wildcard};
    };
    const dependencies = (node: ParticleNode): NodeId[] => {
      if ("children" in node.term) {
        const result: NodeId[] = []; for (const id of node.term.children) {budget.step(node); result.push(id);} return result;
      }
      if (node.term.kind === "group") {
        const id = target(node.term.reference, node), group = id ? get(id) : undefined;
        if (group?.kind !== "group") throw new SemanticError("invalid-schema", "Group particle requires a model group", node.id, node.context.source);
        return [group.content];
      }
      if (node.term.kind === "element") {
        const id = target(node.term.declaration, node);
        if (!id || get(id).kind !== "element") throw new SemanticError("invalid-schema", "Element particle requires an element declaration", node.id, node.context.source);
      }
      return [];
    };
    type Frame = {node: ParticleNode; children: NodeId[]; index: number};
    const frame = (node: ParticleNode): Frame => {current = node; algebra.validate(node.occurs); return {node, children: dependencies(node), index: 0};};
    for (const root of graph.nodes) {
      if (root.kind !== "particle" || summaries.has(root.id)) continue;
      const stack = [frame(root)]; active.add(root.id);
      while (stack.length) {
        const f = stack[stack.length - 1]; current = f.node; budget.step(current);
        if (f.index < f.children.length) {
          const id = f.children[f.index++], child = get(id);
          if (child.kind !== "particle") throw new SemanticError("invalid-schema", "Content requires a particle", id, child.context.source);
          if (active.has(id)) throw new SemanticError("invalid-schema", "Forbidden particle expansion cycle", id, child.context.source);
          if (!summaries.has(id)) {active.add(id); stack.push(frame(child));}
          continue;
        }
        const node = f.node;
        let content: Content;
        if (node.term.kind === "element") {
          const id = target(node.term.declaration, node)!, declaration = get(id);
          if (declaration.kind !== "element") throw new Error("Checked element target changed");
          content = {nullable: false, hasRealization: true, elements: [{name: declaration.name, occurs: ONE_OCCURS, declarations: [id], particles: [node.id]}], wildcard: ZERO_OCCURS, effectiveTotalRange: ONE_OCCURS, schemaEmptiable: false};
        } else if (node.term.kind === "any") content = {nullable: false, hasRealization: true, elements: [], wildcard: ONE_OCCURS, effectiveTotalRange: ONE_OCCURS, schemaEmptiable: false};
        else {
          const parts: ParticleSummary[] = [];
          for (const id of f.children) {budget.step(node); parts.push(summaries.get(id)!);}
          content = combine(parts, node.term.kind === "choice");
        }
        const elements: PropertyContribution[] = [];
        for (const p of content.elements) {budget.step(node); elements.push({...p, occurs: algebra.product(p.occurs, node.occurs)});}
        const effectiveTotalRange = algebra.product(content.effectiveTotalRange, node.occurs);
        summaries.set(node.id, {id: node.id, nullable: node.occurs.min === "0" || content.nullable, hasRealization: node.occurs.min === "0" || content.hasRealization, elements, wildcard: algebra.product(content.wildcard, node.occurs), effectiveTotalRange, schemaEmptiable: effectiveTotalRange.min === "0"});
        active.delete(node.id); stack.pop();
      }
    }
    const types: TypeSummary[] = [];
    for (const type of composed.types) {
      current = get(type.id); budget.step(current); const parts: Content[] = []; let opaque = false;
      for (const contribution of type.content) {
        budget.step(current);
        if (contribution.kind === "builtin") {opaque = true; continue;}
        const summary = summaries.get(contribution.particle);
        if (!summary) throw new SemanticError("invalid-schema", "Missing composed particle", type.id, current.context.source);
        parts.push(summary);
      }
      types.push({id: type.id, children: parts.length ? combine(parts, false) : empty(), scope: opaque ? "declared-particles-with-opaque-builtin" : "declared-particles"});
    }
    return deepFreeze({kind: "analyzed" as const, analysis: {composed, particles: [...summaries.values()], types, assessment: "requires-schema-assessment" as const, metrics: {steps: budget.steps}}});
  } catch (error) {
    if (error instanceof SemanticError) return Object.freeze({kind: "failure", diagnostic: error.component || !current ? error : new SemanticError(error.category, error.message, current.id, current.context.source, error.related)});
    throw error;
  }
}
