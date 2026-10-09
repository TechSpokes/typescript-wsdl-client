/** S05 composition views reference declared components; S06 discharges schema legality. */
import {deepFreeze} from "./canonicalGraph.js";
import type {AttributeUseNode, CanonicalGraph, ComplexTypeNode, Facet, GraphNode, NodeId, Reference, ValueConstraint, Wildcard} from "./canonicalGraph.js";
import type {ExpandedName} from "../loader/orderedSyntax.js";
import {referenceTarget, SemanticError, semanticBudget} from "./resolveCanonicalGraph.js";
import type {ResolvedGraph, SemanticLimits} from "./resolveCanonicalGraph.js";

export type NamespaceConstraint = Readonly<{kind: "set"; namespaces: readonly string[]} | {kind: "not"; namespaces: readonly string[]}>;
export type WildcardProcess = Wildcard["processContents"];
export type WildcardPlan = Readonly<{
  namespace: NamespaceConstraint;
  processContents: WildcardProcess | Readonly<{kind: "assessment-required"; alternatives: readonly WildcardProcess[]}>;
  sources: readonly NodeId[];
}>;
export type AttributePlan = Readonly<{
  name: ExpandedName; declaration: NodeId; type: Reference; use: AttributeUseNode["use"]; value?: ValueConstraint;
  sources: readonly NodeId[];
}>;
/** These obligations are not a schema-validity certificate. #179 must discharge them before planning. */
export type DerivationObligation = Readonly<{
  kind: "particle-extension" | "particle-restriction" | "attribute-type-restriction" | "attribute-extension-equivalence" |
    "fixed-value-equivalence" | "wildcard-expressibility" | "group-local-wildcard-process" | "scalar-derivation" | "mixed-content";
  owner: NodeId; base?: NodeId | Reference | ValueConstraint; local?: NodeId | Reference | ValueConstraint;
}>;
export type ComposedType = Readonly<{
  id: NodeId;
  /** Sequence of declared root particles, not flattened children or occurrence summaries. */
  content: readonly ContentContribution[];
  mixed: boolean;
  attributes: readonly AttributePlan[];
  wildcard?: WildcardPlan;
  scalar?: Readonly<{base: Reference; layers: readonly Readonly<{owner: NodeId; facets: readonly Facet[]; inlineType?: Reference}>[]}>;
  derivation?: ComplexTypeNode["derivation"];
  obligations: readonly DerivationObligation[];
  assessment: "requires-schema-assessment";
}>;
export type ComposedGraph = Readonly<{resolved: ResolvedGraph; types: readonly ComposedType[]; metrics: Readonly<{steps: number}>}>;
export type ContentContribution = Readonly<{kind: "particle"; particle: NodeId} | {kind: "builtin"; reference: Reference}>;

const canonicalSet = (values: Iterable<string>): readonly string[] => [...new Set(values)].sort();
export function wildcardNamespaces(wildcard: Wildcard): NamespaceConstraint {
  const value = wildcard.namespace.value.trim(), namespace = wildcard.namespace.context.effectiveNamespace;
  if (value === "##any") return {kind: "not", namespaces: []};
  if (value === "##other") return {kind: "not", namespaces: canonicalSet(["", namespace])};
  const tokens = value.split(/\s+/);
  if (!value || tokens.some(t => t.startsWith("##") && !["##local", "##targetNamespace"].includes(t))) {
    throw new SemanticError("invalid-schema", "Invalid wildcard namespace constraint", undefined, wildcard.namespace.context.source);
  }
  return {kind: "set", namespaces: canonicalSet(tokens.map(t => t === "##local" ? "" : t === "##targetNamespace" ? namespace : t))};
}
export function namespaceUnion(a: NamespaceConstraint, b: NamespaceConstraint): NamespaceConstraint {
  if (a.kind === "set" && b.kind === "set") return {kind: "set", namespaces: canonicalSet([...a.namespaces, ...b.namespaces])};
  if (a.kind === "not" && b.kind === "not") {const set = new Set(b.namespaces); return {kind: "not", namespaces: a.namespaces.filter(n => set.has(n))};}
  const excluded = a.kind === "not" ? a : b, included = a.kind === "set" ? a : b;
  const set = new Set(included.namespaces); return {kind: "not", namespaces: excluded.namespaces.filter(n => !set.has(n))};
}
export function namespaceIntersection(a: NamespaceConstraint, b: NamespaceConstraint): NamespaceConstraint {
  if (a.kind === "set" && b.kind === "set") {const set = new Set(b.namespaces); return {kind: "set", namespaces: a.namespaces.filter(n => set.has(n))};}
  if (a.kind === "not" && b.kind === "not") return {kind: "not", namespaces: canonicalSet([...a.namespaces, ...b.namespaces])};
  const excluded = a.kind === "not" ? a : b, included = a.kind === "set" ? a : b;
  const set = new Set(excluded.namespaces); return {kind: "set", namespaces: included.namespaces.filter(n => !set.has(n))};
}
export function namespaceSubset(derived: NamespaceConstraint, base: NamespaceConstraint): boolean {
  const baseSet = new Set(base.namespaces), derivedSet = new Set(derived.namespaces);
  if (derived.kind === "set") return derived.namespaces.every(n => base.kind === "set" ? baseSet.has(n) : !baseSet.has(n));
  return base.kind === "not" && base.namespaces.every(n => derivedSet.has(n));
}
const allows = (constraint: NamespaceConstraint, ns: string) => constraint.kind === "set" ? constraint.namespaces.includes(ns) : !constraint.namespaces.includes(ns);
const rank: Record<WildcardProcess, number> = {skip: 0, lax: 1, strict: 2};
const key = (name: ExpandedName) => JSON.stringify([name.namespace, name.local]);

/** Extension concatenates root contributions, retaining each root's exact declared occurrence. */
export function extendContent(base: readonly ContentContribution[], local: NodeId | undefined): readonly ContentContribution[] {
  return [...base, ...restrictContent(local)];
}
/** Restriction replaces child content, including the empty case. No removed base particle is appended. */
export function restrictContent(local: NodeId | undefined): readonly ContentContribution[] {
  return local ? [{kind: "particle", particle: local}] : [];
}

export function composeCanonicalGraph(resolved: ResolvedGraph, limits: SemanticLimits = {}): ComposedGraph {
  const graph: CanonicalGraph = resolved.graph, budget = semanticBudget(limits);
  if (graph.nodes.length > budget.maxNodes) throw new SemanticError("resource-limit", `Composition exceeds ${budget.maxNodes} graph nodes`);
  const nodes = new Map(graph.nodes.map(n => [n.id, n])), composed = new Map<NodeId, ComposedType>();
  const fail = (node: GraphNode, message: string): never => {throw new SemanticError("invalid-schema", message, node.id, node.context.source);};
  const get = (id: NodeId): GraphNode => nodes.get(id) ?? (() => {throw new SemanticError("invalid-schema", `Missing component ${id}`);})();
  const localAttributes = (owner: ComplexTypeNode, obligations: DerivationObligation[]) => {
    const attributes = new Map<string, AttributePlan>(), wildcards: WildcardPlan[] = []; let explicit: WildcardPlan | undefined;
    const direct = new Set(owner.attributes), stack = [...owner.attributes].reverse();
    while (stack.length) {
      const node = get(stack.pop()!); budget.step(node);
      if (node.kind === "attributeGroupUse") {
        const target = referenceTarget(node.reference, nodes, node), group = target ? get(target) : undefined;
        if (group?.kind !== "attributeGroup") fail(node, "Attribute group reference requires an attribute-group definition");
        for (const id of [...(group as Extract<GraphNode, {kind: "attributeGroup"}>).attributes].reverse()) {budget.step(node); stack.push(id);} continue;
      }
      if (node.kind === "attributeWildcard") {
        // Count lexical scanning before tokenization can allocate an oversized namespace list.
        for (let i = 0; i < node.wildcard.namespace.value.length; i++) budget.step(node);
        const wildcard: WildcardPlan = {namespace: wildcardNamespaces(node.wildcard), processContents: node.wildcard.processContents, sources: [node.id]};
        for (const ignored of wildcard.namespace.namespaces) budget.step(node);
        wildcards.push(wildcard);
        if (direct.has(node.id)) {if (explicit) fail(node, "Multiple local attribute wildcards"); explicit = wildcard;}
        continue;
      }
      if (node.kind !== "attributeUse") fail(node, "Expected an attribute use");
      const use = node as AttributeUseNode, target = referenceTarget(use.declaration, nodes, use), declaration = target ? get(target) : undefined;
      if (declaration?.kind !== "attribute") fail(node, "Attribute use requires an attribute declaration");
      const attribute = declaration as Extract<GraphNode, {kind: "attribute"}>;
      const value = use.value ?? attribute.value;
      if (use.value && attribute.value?.kind === "fixed") obligations.push({kind: "fixed-value-equivalence", owner: owner.id, base: attribute.value, local: use.value});
      const result: AttributePlan = {name: attribute.name, declaration: attribute.id, type: attribute.type, use: use.use, value, sources: [use.id]};
      const existing = attributes.get(key(attribute.name));
      if (existing) obligations.push({kind: "attribute-extension-equivalence", owner: owner.id, base: existing.declaration, local: result.declaration});
      attributes.set(key(attribute.name), existing ? {...result, sources: [...existing.sources, ...result.sources]} : result);
    }
    let wildcard = wildcards[0];
    if (wildcard) {
      for (const other of wildcards.slice(1)) {
        budget.step(owner);
        for (const ignored of [...wildcard.namespace.namespaces, ...other.namespace.namespaces, ...wildcard.sources, ...other.sources]) budget.step(owner);
        wildcard = {...wildcard, namespace: namespaceIntersection(wildcard.namespace, other.namespace), sources: [...wildcard.sources, ...other.sources]};
      }
      if (explicit && wildcard.processContents !== explicit.processContents) {
        obligations.push({kind: "group-local-wildcard-process", owner: owner.id, local: explicit.sources[0]});
        wildcard = {...wildcard, processContents: {kind: "assessment-required", alternatives: canonicalSet([wildcard.processContents as WildcardProcess, explicit.processContents as WildcardProcess]) as readonly WildcardProcess[]}};
      }
      obligations.push({kind: "wildcard-expressibility", owner: owner.id});
    }
    return {attributes: [...attributes.values()], wildcard};
  };
  const compose = (node: ComplexTypeNode): ComposedType => {
    const obligations: DerivationObligation[] = [], local = localAttributes(node, obligations), derivation = node.derivation;
    let content = restrictContent(node.content), attributes = local.attributes, wildcard = local.wildcard, mixed = node.mixed;
    let scalar: ComposedType["scalar"];
    if (derivation) {
      const baseId = referenceTarget(derivation.base, nodes, node), baseNode = baseId ? get(baseId) : undefined;
      const base: Omit<ComposedType, "id" | "assessment" | "derivation"> | undefined = baseId ? composed.get(baseId) : derivation.base.kind === "builtin" && derivation.base.name.local === "anyType"
        ? {content: [{kind: "builtin", reference: derivation.base}], mixed: true, attributes: [], wildcard: {namespace: {kind: "not", namespaces: []}, processContents: "lax", sources: []}, obligations: []} : undefined;
      if (derivation.contentKind === "complex" && baseNode?.kind !== "complexType" && !(derivation.base.kind === "builtin" && derivation.base.name.local === "anyType")) fail(node, "Complex content requires a complex base");
      if (derivation.contentKind === "simple") {
        if (node.content) fail(node, "Simple content cannot contribute particles");
        if (baseNode?.kind === "complexType" && !base?.scalar && (derivation.kind === "extension" || !baseNode.mixed)) fail(node, "Simple content base has no scalar content");
        if (derivation.base.kind === "builtin" && derivation.base.name.local === "anyType" && (derivation.kind === "extension" || !derivation.inlineType)) fail(node, "Simple content requires a scalar base or an inline restriction type");
        if (derivation.kind === "restriction" && !base && baseNode?.kind !== "complexType") fail(node, "Simple-content restriction requires a complex base");
        const inherited = base?.scalar;
        for (const ignored of inherited?.layers ?? []) budget.step(node);
        scalar = {base: inherited?.base ?? derivation.inlineType ?? derivation.base, layers: [...(inherited?.layers ?? []), {owner: node.id, facets: derivation.facets, inlineType: derivation.inlineType}]};
        obligations.push({kind: "scalar-derivation", owner: node.id, base: derivation.base, local: derivation.inlineType});
      }
      if (base) {
        for (const ignored of [...base.content, ...base.attributes, ...base.obligations]) budget.step(node);
        for (const ignored of base.wildcard?.namespace.namespaces ?? []) budget.step(node);
        obligations.push(...base.obligations);
        if (derivation.kind === "extension") {
          if (derivation.contentKind === "complex") {content = extendContent(base.content, node.content); if (!node.content) mixed = base.mixed;}
          const merged = new Map(base.attributes.map(a => [key(a.name), a]));
          for (const a of local.attributes) {
            budget.step(node); const prior = merged.get(key(a.name));
            if (a.use === "prohibited") {
              if (prior) obligations.push({kind: "attribute-extension-equivalence", owner: node.id, base: prior.declaration, local: a.declaration});
              continue; // Prohibition contributes no use on extension, never deletes base.
            }
            if (prior && prior.use !== "prohibited") {
              if (prior.use === "required" && a.use !== "required") fail(node, "Extension cannot weaken a required attribute");
              obligations.push({kind: "attribute-extension-equivalence", owner: node.id, base: prior.declaration, local: a.declaration});
              if (prior.value?.kind === "fixed") obligations.push({kind: "fixed-value-equivalence", owner: node.id, base: prior.value, local: a.value});
            }
            merged.set(key(a.name), prior ? {...a, sources: [...prior.sources, ...a.sources]} : a);
          }
          attributes = [...merged.values()];
          if (base.wildcard && local.wildcard) wildcard = {...local.wildcard, namespace: namespaceUnion(base.wildcard.namespace, local.wildcard.namespace), sources: [...base.wildcard.sources, ...local.wildcard.sources]};
          else wildcard = local.wildcard ?? base.wildcard;
          obligations.push({kind: "particle-extension", owner: node.id, base: baseId ?? derivation.base, local: node.content});
        } else {
          const merged = new Map(base.attributes.map(a => [key(a.name), a]));
          for (const a of local.attributes) {
            budget.step(node); const prior = merged.get(key(a.name));
            if (prior?.use === "required" && a.use !== "required") fail(node, "Restriction cannot weaken or prohibit a required attribute");
            if (!prior && a.use !== "prohibited" && (!base.wildcard || !allows(base.wildcard.namespace, a.name.namespace))) fail(node, "New restricted attribute is outside the base wildcard");
            if (prior?.value?.kind === "fixed") obligations.push({kind: "fixed-value-equivalence", owner: node.id, base: prior.value, local: a.value});
            if (prior && a.use !== "prohibited") obligations.push({kind: "attribute-type-restriction", owner: node.id, base: prior.type, local: a.type});
            merged.set(key(a.name), prior ? {...a, sources: [...prior.sources, ...a.sources]} : a);
          }
          attributes = [...merged.values()]; wildcard = local.wildcard; // Omitted restriction wildcard is removed.
          if (wildcard) {
            if (!base.wildcard || !namespaceSubset(wildcard.namespace, base.wildcard.namespace)) fail(node, "Restricted wildcard is not a subset of its base");
            const baseProcess = base.wildcard?.processContents;
            if (typeof wildcard.processContents === "string" && typeof baseProcess === "string" && rank[wildcard.processContents] < rank[baseProcess]) fail(node, "Restricted wildcard weakens processContents");
          }
          obligations.push({kind: "particle-restriction", owner: node.id, base: baseId ?? derivation.base, local: node.content});
        }
        obligations.push({kind: "mixed-content", owner: node.id, base: baseId ?? derivation.base});
      }
    }
    for (const ignored of [...content, ...attributes, ...obligations]) budget.step(node);
    return deepFreeze({id: node.id, content, mixed, attributes, wildcard, scalar, derivation, obligations, assessment: "requires-schema-assessment" as const});
  };
  // Derivation order only, never recursively traverse element/type value graphs.
  for (const root of graph.nodes) {
    if (root.kind !== "complexType" || composed.has(root.id)) continue;
    const stack = [root], active = new Set<NodeId>();
    while (stack.length) {
      const node = stack[stack.length - 1]; budget.step(node);
      if (composed.has(node.id)) {stack.pop(); active.delete(node.id); continue;}
      const baseId = node.derivation ? referenceTarget(node.derivation.base, nodes, node) : undefined, base = baseId ? get(baseId) : undefined;
      if (base?.kind === "complexType" && !composed.has(base.id)) {
        if (active.has(base.id)) fail(node, "Cyclic derivation supplied to composition");
        active.add(node.id); stack.push(base); continue;
      }
      composed.set(node.id, compose(node)); stack.pop(); active.delete(node.id);
    }
  }
  return deepFreeze({resolved, types: [...composed.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), metrics: {steps: budget.steps}});
}
