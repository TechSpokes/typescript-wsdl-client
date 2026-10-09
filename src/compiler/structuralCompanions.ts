/** Required structural closures over one declared graph; no public-symbol renaming. */
import {deepFreeze, globalId} from "./canonicalGraph.js";
import type {CanonicalGraph, GraphNode, GraphOrigin, NodeId} from "./canonicalGraph.js";
import {containedNodes, referenceSlots} from "./graphTraversal.js";
import {referenceTarget, SemanticError, semanticBudget} from "./resolveCanonicalGraph.js";
import type {SemanticLimits} from "./resolveCanonicalGraph.js";
import {semanticGraphRepresentation} from "./catalogProvenance.js";
import {canonicalJson} from "./catalogErrors.js";

export type StructuralCompanion = Readonly<{graph: CanonicalGraph; roots: readonly NodeId[]}>;
export type StructuralMerge = Readonly<{
  graph: CanonicalGraph; copied: readonly NodeId[]; deduplicated: readonly NodeId[]; metrics: Readonly<{steps: number}>;
}>;

export function mergeStructuralCompanions(primary: CanonicalGraph, companions: readonly StructuralCompanion[], limits: SemanticLimits = {}): StructuralMerge {
  const budget = semanticBudget(limits);
  if (primary.nodes.length > budget.maxNodes) throw new SemanticError("resource-limit", `Primary input exceeds ${budget.maxNodes} graph nodes`);
  const nodes = new Map(primary.nodes.map(n => {budget.step(n); return [n.id, n];}));
  const checkSize = () => {if (nodes.size > budget.maxNodes) throw new SemanticError("resource-limit", `Companion graph exceeds ${budget.maxNodes} nodes`);};
  checkSize();
  // Bound normalization and provenance copying before recursive serialization allocates.
  const countData = (value: unknown, node?: GraphNode) => {
    const stack: unknown[] = [value];
    while (stack.length) {
      const item = stack.pop(); budget.step(node);
      if (typeof item === "string") for (let i = 0; i < item.length; i++) budget.step(node);
      else if (item && typeof item === "object") for (const child of Object.values(item)) {budget.step(node); stack.push(child);}
    }
  };
  const owned = (root: GraphNode, index: ReadonlyMap<NodeId, GraphNode>): GraphNode[] => {
    const stack = [root.id], seen = new Set<NodeId>(), result: GraphNode[] = [];
    while (stack.length) {
      const id = stack.pop()!; if (seen.has(id)) continue;
      const node = index.get(id); if (!node) throw new SemanticError("invalid-schema", `Missing owned component ${id}`, root.id, root.context.source);
      budget.step(node); seen.add(id); result.push(node);
      for (const child of containedNodes(node)) {budget.step(node); stack.push(child);}
      for (const slot of referenceSlots(node)) if (slot.reference.kind === "local") {budget.step(node); stack.push(slot.reference.target);}
    }
    return result;
  };
  const representation = (root: GraphNode, index: ReadonlyMap<NodeId, GraphNode>) => {
    const declarations = owned(root, index); countData(declarations, root);
    return semanticGraphRepresentation({...primary, nodes: declarations, globals: [root.id], origins: {}, schemaAnnotations: [], schemaRetained: [], loading: {...primary.loading, edges: []}}, {referenceIdentityOnly: true});
  };
  const origins: Record<NodeId, GraphOrigin[]> = Object.create(null), originKeys = new Map<NodeId, Set<string>>();
  const addOrigins = (id: NodeId, values: readonly GraphOrigin[], node: GraphNode) => {
    const list = origins[id] ??= [], keys = originKeys.get(id) ?? new Set<string>(); originKeys.set(id, keys);
    for (const origin of values) {countData(origin, node); const key = canonicalJson(origin); if (!keys.has(key)) {keys.add(key); list.push(origin);}}
  };
  for (const node of primary.nodes) {budget.step(node); addOrigins(node.id, primary.origins[node.id] ?? [], node);}
  const edges = [...primary.loading.edges], retained = [...primary.schemaRetained], annotations = [...primary.schemaAnnotations];
  countData([edges, retained, annotations]);
  const edgeKeys = new Set(edges.map(canonicalJson)), retainedKeys = new Set(retained.map(canonicalJson)), annotationKeys = new Set(annotations.map(canonicalJson));
  const copied = new Set<NodeId>(), deduplicated = new Set<NodeId>();
  for (const companion of companions) {
    if (companion.graph.nodes.length > budget.maxNodes) throw new SemanticError("resource-limit", `Companion input exceeds ${budget.maxNodes} graph nodes`);
    const source = new Map(companion.graph.nodes.map(n => {budget.step(n); return [n.id, n];})), selected = new Set<NodeId>();
    for (const ignored of companion.roots) budget.step();
    const queue = [...companion.roots];
    for (const root of companion.roots) {
      const node = source.get(root);
      if (!node || node.identity.kind !== "global") throw new SemanticError("invalid-schema", `Companion root must identify a declared global component: ${root}`, root, node?.context.source);
    }
    while (queue.length) {
      const id = queue.pop()!; if (selected.has(id)) continue;
      const node = source.get(id);
      if (!node) throw new SemanticError("invalid-schema", `Missing companion component ${id}`, id);
      budget.step(node); selected.add(id);
      for (const child of containedNodes(node)) {budget.step(node); queue.push(child);}
      for (const slot of referenceSlots(node)) {
        budget.step(node);
        // Companion definitions take precedence for comparison; missing imported
        // definitions may be supplied by the primary graph, with visibility still checked later.
        const reference = slot.reference, candidate = reference.kind === "local" ? reference.target : reference.kind === "symbol" ? globalId(reference.role, reference.name) : undefined;
        const target = referenceTarget(reference, candidate && source.has(candidate) ? source : nodes, node);
        if (target && source.has(target)) queue.push(target);
      }
    }
    const interpretations = new Set<string>(), contexts = new Set<string>(), documents = new Set<string>();
    for (const id of selected) {
      const node = source.get(id)!;
      for (const origin of companion.graph.origins[id] ?? []) {countData(origin, node); interpretations.add(origin.interpretation); contexts.add(canonicalJson([origin.context.source.uri, origin.context.source.digest, origin.context.effectiveNamespace])); documents.add(canonicalJson([origin.context.source.uri, origin.context.source.digest]));}
    }
    const mapping = new Map<NodeId, NodeId>();
    for (const id of [...selected].sort((a, b) => {budget.step(); return a < b ? -1 : a > b ? 1 : 0;})) {
      const root = source.get(id)!; if (root.identity.kind !== "global") continue;
      const current = nodes.get(id);
      if (current) {
        const a = representation(current, nodes), b = representation(root, source);
        if (a.structure !== b.structure) throw new SemanticError("invalid-schema", `Structural companion collision for ${id}; reconcile the original declarations`, id, root.context.source, [current.context.source]);
        // Equal normalized positions identify corresponding scoped declarations.
        const positions = new Map([...a.identities].map(([original, normalized]) => [normalized, original]));
        for (const [original, normalized] of b.identities) {budget.step(root); mapping.set(original, positions.get(normalized)!);}
        deduplicated.add(id);
      } else {
        for (const node of owned(root, source)) {
          budget.step(node); nodes.set(node.id, node); checkSize(); mapping.set(node.id, node.id);
        }
        copied.add(id);
      }
    }
    for (const id of selected) {
      const target = mapping.get(id), node = source.get(id)!;
      if (!target) throw new SemanticError("invalid-schema", "Companion closure lost scoped ownership", id, node.context.source);
      addOrigins(target, companion.graph.origins[id] ?? [], node);
    }
    for (const edge of companion.graph.loading.edges) {
      budget.step(); if (!interpretations.has(edge.from)) continue;
      countData(edge); const key = canonicalJson(edge); if (!edgeKeys.has(key)) {edgeKeys.add(key); edges.push(edge);}
    }
    for (const entry of companion.graph.schemaRetained) {
      budget.step(); if (!contexts.has(canonicalJson([entry.context.source.uri, entry.context.source.digest, entry.context.effectiveNamespace]))) continue;
      countData(entry); const key = canonicalJson(entry); if (!retainedKeys.has(key)) {retainedKeys.add(key); retained.push(entry);}
    }
    for (const annotation of companion.graph.schemaAnnotations) {
      budget.step(); if (!documents.has(canonicalJson([annotation.source.uri, annotation.source.digest]))) continue;
      countData(annotation); const key = canonicalJson(annotation); if (!annotationKeys.has(key)) {annotationKeys.add(key); annotations.push(annotation);}
    }
  }
  return deepFreeze({graph: {...primary, nodes: [...nodes.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), globals: [...nodes.values()].filter(n => n.identity.kind === "global").map(n => n.id).sort(), origins, schemaAnnotations: annotations, schemaRetained: retained, loading: {...primary.loading, edges}}, copied: [...copied].sort(), deduplicated: [...deduplicated].sort(), metrics: {steps: budget.steps}});
}
