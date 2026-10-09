/** Required structural closures over one declared graph; no public-symbol renaming. */
import {deepFreeze, globalId} from "./canonicalGraph.js";
import type {CanonicalGraph, GraphNode, GraphOrigin, NodeId} from "./canonicalGraph.js";
import {containedNodes, referenceSlots, mapNodeReferences} from "./graphTraversal.js";
import {referenceTarget, SemanticError, semanticBudget, countSemanticData} from "./resolveCanonicalGraph.js";
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
  const countData = (value: unknown, node?: GraphNode) => countSemanticData(value, budget, node);
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
  // Index requested pools before walking, so a cross-companion dependency is
  // resolved by availability rather than the caller's request order.
  const providers = new Map<NodeId, number[]>();
  const pools = companions.map((companion, pool) => {
    budget.step();
    if (companion.graph.nodes.length > budget.maxNodes) throw new SemanticError("resource-limit", `Companion input exceeds ${budget.maxNodes} graph nodes`);
    const source = new Map(companion.graph.nodes.map(n => {budget.step(n); return [n.id, n];}));
    if (companion.roots.length) for (const node of source.values()) {
      budget.step(node); if (node.identity.kind !== "global") continue;
      const available = providers.get(node.id) ?? []; available.push(pool); providers.set(node.id, available);
    }
    return {companion, source, selected: new Set<NodeId>()};
  });
  const queue: {pool: number; id: NodeId}[] = [];
  const enqueueAvailable = (id: NodeId, node: GraphNode) => {
    for (const pool of providers.get(id) ?? []) {budget.step(node); queue.push({pool, id});}
  };
  pools.forEach(({companion, source}, pool) => {
    for (const root of companion.roots) {
      budget.step(); const node = source.get(root);
      if (!node || node.identity.kind !== "global") throw new SemanticError("invalid-schema", `Companion root must identify a declared global component: ${root}`, root, node?.context.source);
      queue.push({pool, id: root});
    }
  });
  for (const node of primary.nodes) for (const {reference} of referenceSlots(node)) {
    budget.step(node);
    if (reference.kind === "symbol") {
      const id = globalId(reference.role, reference.name);
      if (!nodes.has(id)) enqueueAvailable(id, node);
    }
  }
  while (queue.length) {
    const {pool, id} = queue.pop()!, {source, selected} = pools[pool];
    if (selected.has(id)) continue;
    const node = source.get(id);
    if (!node) throw new SemanticError("invalid-schema", `Missing companion component ${id}`, id);
    budget.step(node); selected.add(id);
    for (const child of containedNodes(node)) {budget.step(node); queue.push({pool, id: child});}
    for (const {reference} of referenceSlots(node)) {
      budget.step(node);
      const candidate = reference.kind === "local" ? reference.target : reference.kind === "symbol" ? globalId(reference.role, reference.name) : undefined;
      if (candidate && source.has(candidate)) {
        referenceTarget(reference, source, node); queue.push({pool, id: candidate});
      } else if (candidate && reference.kind === "symbol" && !nodes.has(candidate) && providers.has(candidate)) {
        for (const available of providers.get(candidate)!) referenceTarget(reference, pools[available].source, node);
        enqueueAvailable(candidate, node);
      } else referenceTarget(reference, nodes, node);
    }
  }
  for (const {companion, source, selected} of pools) {
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
  const linked = [...nodes.values()].map(node => {
    budget.step(node);
    return mapNodeReferences(node, reference => {
      budget.step(node);
      if (reference.kind !== "symbol") return reference;
      const id = globalId(reference.role, reference.name);
      if (reference.target !== undefined && reference.target !== id) throw new SemanticError("invalid-schema", "Stored companion reference has a mismatched target", node.id, reference.lexical.context.source);
      return nodes.has(id) ? {...reference, target: id} : reference;
    });
  }).sort((a, b) => {budget.step(); return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;});
  return deepFreeze({graph: {...primary, nodes: linked, globals: linked.filter(n => n.identity.kind === "global").map(n => n.id).sort(), origins, schemaAnnotations: annotations, schemaRetained: retained, loading: {...primary.loading, edges}}, copied: [...copied].sort(), deduplicated: [...deduplicated].sort(), metrics: {steps: budget.steps}});
}
