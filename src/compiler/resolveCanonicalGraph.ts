/** Pure S05 reference assessment. Definitions and use-site occurrences remain canonical. */
import {deepFreeze, DEFAULT_GRAPH_NODES, globalId, isBuiltinType} from "./canonicalGraph.js";
import type {CanonicalGraph, GraphNode, NodeId, Reference} from "./canonicalGraph.js";
import {positiveLimit} from "./catalogErrors.js";
import {referenceSlots, containedNodes} from "./graphTraversal.js";
import {syntaxAttribute, XSD_NAMESPACE} from "../loader/orderedSyntax.js";
import type {SyntaxSource} from "../loader/orderedSyntax.js";
import {normalizeWhitespace} from '../util/xmlWhitespace.js';
import {standardSchemaElement, inspectStandardSchemaElement} from './standardSchemaComponents.js';
import type {StandardSchemaLibrary, StandardSchemaElementDeclaration} from './standardSchemaComponents.js';

export class SemanticError extends Error {
  constructor(readonly category: "invalid-schema" | "unsupported-capability" | "incompatible-artifact" | "resource-limit", message: string,
    readonly component?: NodeId, readonly source?: SyntaxSource, readonly related: readonly SyntaxSource[] = []) {
    super(message); this.name = "SemanticError";
  }
}
/** Internal missing-symbol detail; source resolution must distinguish absent import resources from disproved declarations. */
class MissingReferenceError extends SemanticError {
  constructor(reference: Reference, owner: GraphNode, id: NodeId) {
    super('invalid-schema', `Missing reference target ${id}`, owner.id,
      reference.kind === 'symbol' ? reference.lexical.context.source : owner.context.source);
  }
}
export type SemanticLimits = {maxNodes?: number; maxSteps?: number; requestBudget?: import("./semanticBudget.js").SemanticBudget;
  standardLibraries?: readonly StandardSchemaLibrary[]};
export function semanticBudget(limits: SemanticLimits = {}) {
  const maxNodes = positiveLimit(limits.maxNodes, DEFAULT_GRAPH_NODES, "maxNodes");
  const maxSteps = positiveLimit(limits.maxSteps, 1_000_000, "maxSteps");
  let steps = 0;
  return {maxNodes, get steps() {return steps;}, step(node?: GraphNode) {
    limits.requestBudget?.chargeWork(64);
    if (++steps > maxSteps) throw new SemanticError("resource-limit", `Semantic traversal exceeds ${maxSteps} steps`, node?.id, node?.context.source);
  }};
}

/** Count structural data before retaining another input or serializing a copy. */
export function countSemanticData(value: unknown, budget: ReturnType<typeof semanticBudget>, node?: GraphNode): void {
  const stack: unknown[] = [value];
  while (stack.length) {
    const item = stack.pop(); budget.step(node);
    if (typeof item === "string") for (let i = 0; i < item.length; i++) budget.step(node);
    else if (item && typeof item === "object") for (const key in item) {
      if (!Object.hasOwn(item, key)) continue;
      budget.step(node);
      for (let i = 0; i < key.length; i++) budget.step(node);
      stack.push((item as Record<string, unknown>)[key]);
    }
  }
}
export type ResolvedLink = Readonly<{owner: NodeId; path: string; reference: Reference; target?: NodeId}>;
export type ResolvedGraph = Readonly<{graph: CanonicalGraph; links: readonly ResolvedLink[]; metrics: Readonly<{steps: number}>}>;
const resolvedStandards = new WeakMap<ResolvedGraph, readonly StandardSchemaLibrary[]>();

/** Native acquired dependencies only; copied graph reports cannot recreate this association. */
export function standardSchemaLibrariesForResolved(resolved: ResolvedGraph): readonly StandardSchemaLibrary[] | undefined {
  return resolvedStandards.get(resolved);
}

/** Resolve against a node index, never against generated names or an asserted stored target. */
export function referenceTarget(reference: Reference, nodes: ReadonlyMap<NodeId, GraphNode>, owner: GraphNode,
  standards?: ReadonlyMap<NodeId, StandardSchemaElementDeclaration>): NodeId | undefined {
  if (reference.kind === "builtin") {
    if (reference.name.namespace !== XSD_NAMESPACE || !isBuiltinType(reference.name.local)) throw new SemanticError("invalid-schema", "Unknown builtin type", owner.id, owner.context.source);
    return undefined;
  }
  const id = reference.kind === "symbol" ? globalId(reference.role, reference.name) : reference.target;
  const target = nodes.get(id);
  if (!target) {
    const supplied = standards?.get(id);
    if (!supplied) throw new MissingReferenceError(reference, owner, id);
    inspectStandardSchemaElement(supplied);
    if (reference.kind !== 'symbol' || reference.role !== 'element' || supplied.id !== id
      || reference.target !== undefined && reference.target !== id) throw new SemanticError('invalid-schema', 'Standard declaration reference role/identity mismatch', owner.id, owner.context.source);
    return id;
  }
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
  // Separate precharged graph traversal covers initial index and retained-import table preparation.
  limits.requestBudget?.freeze(graph);
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  if (nodes.size !== graph.nodes.length) throw new SemanticError("invalid-schema", "Duplicate graph identities");
  const standards = new Map<NodeId, StandardSchemaElementDeclaration>(), selectedLibraries: StandardSchemaLibrary[] = [];
  for (const library of limits.standardLibraries ?? []) {
    budget.step();
    const declaration = standardSchemaElement(library, {namespace: XSD_NAMESPACE, local: 'schema'});
    if (!declaration) throw new SemanticError('unsupported-capability', 'Standard library supplies no implemented schema element');
    if (standards.has(declaration.id)) throw new SemanticError('unsupported-capability', 'Duplicate standard library selection');
    if (nodes.has(declaration.id)) throw new SemanticError('unsupported-capability', 'Acquired standard declaration conflicts with explicit schema source; select one source authority');
    standards.set(declaration.id, declaration); selectedLibraries.push(library);
  }
  // Imports authorize foreign namespaces in the declaring interpretation only.
  // Including/importing documents do not lend their import permissions to a reference.
  const imports = new Map<string, Set<string>>(), unknownImports = new Set<string>();
  const unlocatedImports = new Map<string, Set<string>>();
  const sourceKey = (source: SyntaxSource) => JSON.stringify([source.uri, source.digest, source.path]);
  const importSyntax = new Map(graph.schemaRetained.filter(r => r.syntax.name.namespace === XSD_NAMESPACE && r.syntax.name.local === "import")
    .map(r => [sourceKey(r.syntax.source), r.syntax]));
  for (const edge of graph.loading.edges) {
    budget.step();
    if (edge.kind !== "import") continue;
    const syntax = importSyntax.get(sourceKey(edge.source));
    const ns = syntax ? normalizeWhitespace(syntaxAttribute(syntax, "namespace") ?? "", 'collapse') : edge.to ? interpretation(edge.to).namespace : undefined;
    if (ns === undefined) {unknownImports.add(edge.from); continue;}
    if (ns === interpretation(edge.from).namespace) throw new SemanticError("invalid-schema", "Import must authorize a different namespace", undefined, edge.source);
    const values = imports.get(edge.from) ?? new Set<string>(); values.add(ns); imports.set(edge.from, values);
    if (!edge.to && syntax && syntaxAttribute(syntax, 'schemaLocation') === undefined) {
      const pending = unlocatedImports.get(edge.from) ?? new Set<string>(); pending.add(ns); unlocatedImports.set(edge.from, pending);
    }
  }
  const links: ResolvedLink[] = [];
  let unresolvedImport: SemanticError | undefined;
  for (const node of graph.nodes) {
    budget.step(node);
    for (const slot of referenceSlots(node)) {
      budget.step(node);
      const ref = slot.reference;
      let target: NodeId | undefined;
      let unavailable: SemanticError | undefined;
      try {target = referenceTarget(ref, nodes, node, standards);} catch (error) {
        if (error instanceof MissingReferenceError && ref.kind === 'symbol' && node.kind !== 'wsdl') {
          for (const origin of graph.origins[node.id] ?? []) {
            budget.step(node);
            if (ref.name.namespace !== origin.context.effectiveNamespace && unlocatedImports.get(origin.interpretation)?.has(ref.name.namespace)) {
              unavailable = new SemanticError('unsupported-capability', `Missing declaration in namespace ${ref.name.namespace}; supply the locationless import dependency explicitly`, node.id, ref.lexical.context.source);
              break;
            }
          }
        }
        if (!unavailable) throw error;
      }
      // @why P1-D01: missing dependency evidence must not mask independent actual reference failures.
      if (unavailable) {unresolvedImport ??= unavailable; continue;}
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
  if (unresolvedImport) throw unresolvedImport;
  // Only expansion/base edges enter this DAG. Element -> type and particle -> element
  // are deliberately excluded: crossing an element admits complete recursive values.
  const forbidden = (n: GraphNode): NodeId[] => {
    limits.requestBudget?.freeze(n);
    const result = [...containedNodes(n)];
    for (const slot of referenceSlots(n)) {
      const expansion = n.kind === "simpleType" || n.kind === "complexType" || n.kind === "attributeGroupUse" ||
        (n.kind === "particle" && n.term.kind === "group") || (n.kind === "element" && slot.path === "substitutionGroup");
      if (expansion) {
        const target = referenceTarget(slot.reference, nodes, n, standards);
        if (target && standards.has(target)) throw new SemanticError('unsupported-capability',
          'Substitution affiliation to an acquired standard element is not implemented', n.id, n.context.source);
        if (target) result.push(target);
      }
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
  const result = {graph, links, metrics: {steps: budget.steps}};
  const frozen = limits.requestBudget ? limits.requestBudget.freeze(result) : deepFreeze(result);
  resolvedStandards.set(frozen, Object.freeze(selectedLibraries));
  return frozen;
}
