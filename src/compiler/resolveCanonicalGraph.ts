/** Pure S05 reference assessment. Definitions and use-site occurrences remain canonical. */
import {deepFreeze, DEFAULT_GRAPH_NODES, globalId, isBuiltinType} from "./canonicalGraph.js";
import type {CanonicalGraph, GraphNode, NodeId, Reference} from "./canonicalGraph.js";
import {positiveLimit} from "./catalogErrors.js";
import {referenceSlots, containedNodes} from "./graphTraversal.js";
import {syntaxAttribute, XSD_NAMESPACE} from "../loader/orderedSyntax.js";
import type {SyntaxSource} from "../loader/orderedSyntax.js";

export class SemanticError extends Error {
  constructor(readonly category: "invalid-schema" | "unsupported-capability" | "incompatible-artifact" | "resource-limit", message: string,
    readonly component?: NodeId, readonly source?: SyntaxSource, readonly related: readonly SyntaxSource[] = []) {
    super(message); this.name = "SemanticError";
  }
}
export type SemanticLimits = {maxNodes?: number; maxSteps?: number};
export function semanticBudget(limits: SemanticLimits = {}) {
  const maxNodes = positiveLimit(limits.maxNodes, DEFAULT_GRAPH_NODES, "maxNodes");
  const maxSteps = positiveLimit(limits.maxSteps, 1_000_000, "maxSteps");
  let steps = 0;
  return {maxNodes, get steps() {return steps;}, step(node?: GraphNode) {
    if (++steps > maxSteps) throw new SemanticError("resource-limit", `Semantic traversal exceeds ${maxSteps} steps`, node?.id, node?.context.source);
  }};
}
export type ResolvedLink = Readonly<{owner: NodeId; path: string; reference: Reference; target?: NodeId}>;
export type ResolvedGraph = Readonly<{graph: CanonicalGraph; links: readonly ResolvedLink[]; metrics: Readonly<{steps: number}>}>;

/** Resolve against a node index, never against generated names or an asserted stored target. */
export function referenceTarget(reference: Reference, nodes: ReadonlyMap<NodeId, GraphNode>, owner: GraphNode): NodeId | undefined {
  if (reference.kind === "builtin") {
    if (reference.name.namespace !== XSD_NAMESPACE || !isBuiltinType(reference.name.local)) throw new SemanticError("invalid-schema", "Unknown builtin type", owner.id, owner.context.source);
    return undefined;
  }
  const id = reference.kind === "symbol" ? globalId(reference.role, reference.name) : reference.target;
  const target = nodes.get(id);
  if (!target) throw new SemanticError("invalid-schema", `Missing reference target ${id}`, owner.id, reference.kind === "symbol" ? reference.lexical.context.source : owner.context.source);
  if (reference.kind === "symbol" && (target.identity.kind !== "global" || target.identity.role !== reference.role || (reference.target !== undefined && reference.target !== id))) {
    throw new SemanticError("invalid-schema", `Reference role/identity mismatch ${id}`, owner.id, reference.lexical.context.source);
  }
  return id;
}

type Interpretation = {namespace: string; document: string};
function interpretation(key: string): Interpretation {
  if (!key.startsWith("[")) return {namespace: "", document: key};
  const tuple = JSON.parse(key) as string[];
  return {namespace: tuple[3], document: tuple[1]};
}

export function resolveCanonicalGraph(graph: CanonicalGraph, limits: SemanticLimits = {}): ResolvedGraph {
  const budget = semanticBudget(limits);
  if (graph.nodes.length > budget.maxNodes) throw new SemanticError("resource-limit", `Resolution exceeds ${budget.maxNodes} graph nodes`);
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  if (nodes.size !== graph.nodes.length) throw new SemanticError("invalid-schema", "Duplicate graph identities");
  // Imports authorize foreign namespaces in the declaring interpretation only.
  // Including/importing documents do not lend their import permissions to a reference.
  const imports = new Map<string, Set<string>>(), unknownImports = new Set<string>();
  const sourceKey = (source: SyntaxSource) => JSON.stringify([source.uri, source.digest, source.path]);
  const importSyntax = new Map(graph.schemaRetained.filter(r => r.syntax.name.namespace === XSD_NAMESPACE && r.syntax.name.local === "import")
    .map(r => [sourceKey(r.syntax.source), r.syntax]));
  for (const edge of graph.loading.edges) {
    budget.step();
    if (edge.kind !== "import") continue;
    const syntax = importSyntax.get(sourceKey(edge.source));
    const ns = syntax ? syntaxAttribute(syntax, "namespace") ?? "" : edge.to ? interpretation(edge.to).namespace : undefined;
    if (ns === undefined) {unknownImports.add(edge.from); continue;}
    if (ns === interpretation(edge.from).namespace) throw new SemanticError("invalid-schema", "Import must authorize a different namespace", undefined, edge.source);
    const values = imports.get(edge.from) ?? new Set<string>(); values.add(ns); imports.set(edge.from, values);
  }
  const links: ResolvedLink[] = [];
  for (const node of graph.nodes) {
    budget.step(node);
    for (const slot of referenceSlots(node)) {
      budget.step(node);
      const ref = slot.reference, target = referenceTarget(ref, nodes, node);
      if (ref.kind === "symbol" && node.kind !== "wsdl") {
        for (const origin of graph.origins[node.id] ?? []) {
          budget.step(node);
          if (ref.name.namespace === origin.context.effectiveNamespace) continue;
          if (!imports.get(origin.interpretation)?.has(ref.name.namespace)) {
            if (unknownImports.has(origin.interpretation)) throw new SemanticError("incompatible-artifact", "Catalog lacks namespace evidence for an unlocated import; regenerate from original source", node.id, ref.lexical.context.source);
            throw new SemanticError("invalid-schema", `Reference namespace ${ref.name.namespace} is not imported`, node.id, ref.lexical.context.source);
          }
        }
      }
      links.push({owner: node.id, path: slot.path, reference: ref, ...(target ? {target} : {})});
    }
  }
  // Only expansion/base edges enter this DAG. Element -> type and particle -> element
  // are deliberately excluded: crossing an element admits complete recursive values.
  const forbidden = (n: GraphNode): NodeId[] => {
    const result = [...containedNodes(n)];
    for (const slot of referenceSlots(n)) {
      const expansion = n.kind === "simpleType" || n.kind === "complexType" || n.kind === "attributeGroupUse" ||
        (n.kind === "particle" && n.term.kind === "group") || (n.kind === "element" && slot.path === "substitutionGroup");
      if (expansion) {const target = referenceTarget(slot.reference, nodes, n); if (target) result.push(target);}
    }
    return result;
  };
  const done = new Set<NodeId>(), active = new Set<NodeId>();
  for (const root of graph.nodes) {
    if (done.has(root.id)) continue;
    const stack: {node: GraphNode; edges: NodeId[]; index: number}[] = [{node: root, edges: forbidden(root), index: 0}]; active.add(root.id);
    while (stack.length) {
      budget.step(stack[stack.length - 1].node);
      const frame = stack[stack.length - 1];
      if (frame.index === frame.edges.length) {active.delete(frame.node.id); done.add(frame.node.id); stack.pop(); continue;}
      const id = frame.edges[frame.index++], child = nodes.get(id);
      if (!child) throw new SemanticError("invalid-schema", `Missing structural target ${id}`, frame.node.id, frame.node.context.source);
      if (active.has(id)) {
        const cycle = stack.slice(stack.findIndex(f => f.node.id === id));
        throw new SemanticError("invalid-schema", `Forbidden component cycle: ${cycle.map(f => f.node.id).join(" -> ")} -> ${id}`, frame.node.id, frame.node.context.source, cycle.map(f => f.node.context.source));
      }
      if (!done.has(id)) {active.add(id); stack.push({node: child, edges: forbidden(child), index: 0});}
    }
  }
  return deepFreeze({graph, links, metrics: {steps: budget.steps}});
}
