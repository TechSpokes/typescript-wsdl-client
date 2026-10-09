/** Assess attribute derivation from original uses and wildcard operands. */
import type {AttributeNode, ComplexTypeNode, GraphNode, NodeId, Reference, ValueConstraint} from "./canonicalGraph.js";
import type {AttributePlan, NamespaceConstraint, WildcardPlan, WildcardProcess} from "./composeCanonicalGraph.js";
import {namespaceIntersection, namespaceSubset, namespaceUnion, wildcardNamespaces} from "./composeCanonicalGraph.js";
import type {AssessmentContext} from "./schemaAssessmentContext.js";
import type {scalarSchemaAssessment} from "./scalarSchemaAssessment.js";
import {namespaceAllows} from "./particleSchemaAssessment.js";

export type AssessedAttribute = Readonly<AttributePlan & {
  /** Original surviving use constraints; #184 consumes their conjunction. */
  constraints: readonly Readonly<{owner: NodeId; use: "optional" | "required"; value?: ValueConstraint}>[];
}>;
export type AssessedWildcard = Omit<WildcardPlan, "processContents"> & {processContents: WildcardProcess};
type Attributes = {attributes: readonly AssessedAttribute[]; wildcard?: AssessedWildcard};
type Container = ComplexTypeNode | Extract<GraphNode, {kind: "attributeGroup"}>;
const rank = {skip: 0, lax: 1, strict: 2};

export function attributeSchemaAssessment(c: AssessmentContext, scalars: ReturnType<typeof scalarSchemaAssessment>, isSchemaIdType: (type: Reference, owner: GraphNode) => boolean) {
  const groups = new Map<NodeId, Attributes>(), types = new Map<NodeId, Attributes>();
  const checkIds = (attributes: Iterable<AssessedAttribute>, owner: Container) => {
    const ids = new Set<NodeId>();
    for (const attribute of attributes) {
      c.step(owner);
      if (attribute.use === "prohibited" || !isSchemaIdType(attribute.type, c.get(attribute.declaration))) continue;
      // A complex type constrains distinct declarations; an attribute group
      // constrains distinct AU members. Repeated references to one AU share ID.
      const members = owner.kind === "attributeGroup" ? attribute.sources : [attribute.declaration];
      for (const id of members) {c.step(owner); ids.add(id);}
      if (ids.size > 1) c.fail(owner, owner.kind === "attributeGroup" ? "ag-props-correct" : "ct-props-correct", "Multiple distinct ID-derived attribute declarations/uses are forbidden");
    }
  };
  const compatibleUses = (a: AssessedAttribute, b: AssessedAttribute, owner: GraphNode) => {
    if (a.use !== b.use) c.unsupported(owner, "S06-AU-01", "Differing uses of the same global attribute require resolution of the recorded XSD 1.0 qualification");
    const x = a.value, y = b.value;
    if (x?.kind !== y?.kind || x && y && !scalars.equivalent(a.type, x.lexical, b.type, y.lexical, owner)) c.unsupported(owner, "S06-AU-01", "Differing constraints on the same global attribute require resolution of the recorded XSD 1.0 qualification");
  };
  const key = (attribute: AttributeNode | AttributePlan) => {
    c.text(attribute.name.namespace); c.text(attribute.name.local);
    return JSON.stringify([attribute.name.namespace, attribute.name.local]);
  };
  const expressible = (namespace: NamespaceConstraint, owner: GraphNode) => {
    c.step(owner, namespace.namespaces.length);
    if (namespace.kind === "not" && namespace.namespaces.length && (!namespace.namespaces.includes("") || namespace.namespaces.length > 2)) c.fail(owner, "cos-aw-intersect/union", "Attribute wildcard combination is not expressible as an XSD 1.0 namespace constraint");
  };
  const mergeWildcard = (a: Attributes["wildcard"], b: Attributes["wildcard"], owner: GraphNode, union = false): Attributes["wildcard"] => {
    if (!a) return b; if (!b) return a;
    c.step(owner, a.namespace.namespaces.length + b.namespace.namespaces.length + a.sources.length + b.sources.length);
    const namespace = union ? namespaceUnion(a.namespace, b.namespace) : namespaceIntersection(a.namespace, b.namespace);
    expressible(namespace, owner);
    return {...b, namespace, sources: [...a.sources, ...b.sources], processContents: union ? b.processContents : a.processContents};
  };
  const local = (root: Container): Attributes => {
    type Frame = {node: Container; index: number; uses: AssessedAttribute[]; wildcards: NonNullable<Attributes["wildcard"]>[]; explicit?: NonNullable<Attributes["wildcard"]>};
    const frame = (node: Container): Frame => ({node, index: 0, uses: [], wildcards: []});
    const stack = [frame(root)];
    while (stack.length) {
      const current = stack.at(-1)!, owner = current.node; c.setCurrent(owner); c.step(owner);
      if (current.index < owner.attributes.length) {
        const node = c.get(owner.attributes[current.index]); c.step(node);
        if (node.kind === "attributeGroupUse") {
          const target = c.get(c.target(node.reference, node)!);
          if (target.kind !== "attributeGroup") c.fail(node, "src-attribute-group", "Attribute-group use requires a group");
          const existing = groups.get(target.id);
          if (!existing) {stack.push(frame(target as Container)); continue;}
          for (const attribute of existing.attributes) {c.step(node); current.uses.push(attribute);}
          if (existing.wildcard) current.wildcards.push(existing.wildcard);
        } else if (node.kind === "attributeWildcard") {
          if (current.explicit) c.fail(node, "src-attribute-group", "Multiple local attribute wildcards");
          c.text(node.wildcard.namespace.value, node);
          current.explicit = {namespace: wildcardNamespaces(node.wildcard), processContents: node.wildcard.processContents, sources: [node.id]};
        } else if (node.kind === "attributeUse") {
          const declaration = c.get(c.target(node.declaration, node)!);
          if (declaration.kind !== "attribute") c.fail(node, "src-attribute", "Use requires an attribute declaration");
          const attribute = declaration as AttributeNode, value = node.value ?? attribute.value;
          if (node.value?.kind === "default" && node.use !== "optional") c.fail(node, "src-attribute", "Attribute default requires an optional use");
          if (node.use === "prohibited") {
            if (owner.kind === "complexType" && owner.derivation?.kind === "restriction") current.uses.push({name: attribute.name, declaration: attribute.id, type: attribute.type, use: "prohibited", sources: [node.id], constraints: []});
            current.index++; continue; // Source corresponds to no AU/value operand.
          }
          const type = attribute.type.kind === "builtin" ? undefined : c.get(c.target(attribute.type, attribute)!);
          if (attribute.type.kind === "builtin" && attribute.type.name.local === "anyType" || type && type.kind !== "simpleType") c.fail(attribute, "a-props-correct", "An attribute declaration requires a simple type definition");
          scalars.ensure(attribute.type, attribute);
          if (attribute.value) scalars.checkValue(attribute.type, attribute.value, attribute);
          if (node.value) scalars.checkValue(attribute.type, node.value, node);
          if (node.value && attribute.value?.kind === "fixed" && (node.value.kind !== "fixed" || !scalars.equivalent(attribute.type, node.value.lexical, attribute.type, attribute.value.lexical, node))) c.fail(node, "au-props-correct", "Use fixed value must equal the declaration's fixed value");
          current.uses.push({name: attribute.name, declaration: attribute.id, type: attribute.type, use: node.use, value, sources: [node.id],
            constraints: [{owner: node.id, use: node.use, value}]});
        } else c.fail(node, "src-attribute-group", "Container requires attribute uses, groups or a wildcard");
        current.index++; continue;
      }
      const attributes = new Map<string, AssessedAttribute>();
      for (const attribute of current.uses) {
        c.step(owner); const k = key(attribute), prior = attributes.get(k);
        if (prior) {
          if (owner.kind === "attributeGroup") {
            const first = prior.sources[0];
            for (const id of prior.sources) {c.step(owner); if (id !== first) c.fail(owner, "ag-props-correct", "Distinct attribute-use members cannot share a QName");}
            for (const id of attribute.sources) {c.step(owner); if (id !== first) c.fail(owner, "ag-props-correct", "Distinct attribute-use members cannot share a QName");}
          }
          if (prior.declaration !== attribute.declaration) c.fail(owner, "ct-props-correct/ag-props-correct", "Distinct attribute declarations cannot share a QName", undefined, [c.get(prior.declaration).context.source, c.get(attribute.declaration).context.source]);
          compatibleUses(prior, attribute, owner);
          c.step(owner, prior.sources.length + attribute.sources.length + prior.constraints.length + attribute.constraints.length);
          attributes.set(k, {...prior, use: prior.use === "required" || attribute.use === "required" ? "required" : attribute.use,
            sources: [...prior.sources, ...attribute.sources], constraints: [...prior.constraints, ...attribute.constraints]});
        } else attributes.set(k, attribute);
      }
      checkIds(attributes.values(), owner);
      // c-awi1 starts from the local wildcard and selects its processing;
      // c-awi2 starts from the first non-absent group and selects that mode.
      let wildcard: Attributes["wildcard"] = current.explicit ?? current.wildcards[0];
      const start = current.explicit ? 0 : 1;
      for (let i = start; i < current.wildcards.length; i++) wildcard = mergeWildcard(wildcard, current.wildcards[i], owner);
      c.step(owner, attributes.size); const result = {attributes: [...attributes.values()], wildcard};
      stack.pop();
      if (owner.kind === "attributeGroup") groups.set(owner.id, result);
      else return result;
    }
    return groups.get(root.id)!;
  };
  const fixedRequired = (base: AssessedAttribute, derived: AssessedAttribute, owner: GraphNode) => {
    for (const constraint of base.constraints) {
      c.step(owner);
      if (constraint.value?.kind !== "fixed") continue;
      let found = false;
      for (const value of derived.constraints) {
        c.step(owner);
        if (value.value?.kind === "fixed" && scalars.equivalent(base.type, constraint.value.lexical, derived.type, value.value.lexical, owner)) {found = true; break;}
      }
      if (!found) c.fail(owner, "derivation-ok-restriction", "Restriction must retain the base's value-equivalent fixed constraint", undefined, [c.get(base.declaration).context.source]);
    }
  };
  const ensure = (root: ComplexTypeNode): Attributes => {
    const stack = [root];
    while (stack.length) {
      const node = stack.at(-1)!; c.setCurrent(node); c.step(node);
      if (types.has(node.id)) {stack.pop(); continue;}
      const baseRef = node.derivation?.base, baseId = baseRef && c.target(baseRef, node), baseNode = baseId && c.get(baseId);
      if (baseNode && baseNode.kind === "complexType" && !types.has(baseNode.id)) {stack.push(baseNode); continue;}
      const declared = local(node);
      const base: Attributes | undefined = baseNode && baseNode.kind === "complexType" ? types.get(baseNode.id) : baseRef?.kind === "builtin" && baseRef.name.local === "anyType"
        ? {attributes: [], wildcard: {namespace: {kind: "not", namespaces: []}, processContents: "lax", sources: []}} : undefined;
      let attributes = declared.attributes, wildcard = declared.wildcard;
      if (node.derivation && base) {
        scalars.checkFinal(node.derivation.base, node.derivation.kind, node);
        const merged = new Map<string, AssessedAttribute>();
        for (const attribute of base.attributes) {c.step(node); merged.set(key(attribute), attribute);}
        for (const attribute of declared.attributes) {
          c.step(node); const k = key(attribute), prior = merged.get(k);
          if (node.derivation.kind === "extension") {
            if (attribute.use === "prohibited") continue;
            if (prior && prior.use !== "prohibited") {
              if (prior.declaration !== attribute.declaration) c.fail(node, "ct-props-correct", "Extension introduces a distinct attribute declaration with the base QName", undefined, [c.get(prior.declaration).context.source, c.get(attribute.declaration).context.source]);
              compatibleUses(prior, attribute, node);
              c.step(node, prior.sources.length + attribute.sources.length + prior.constraints.length + attribute.constraints.length);
              merged.set(k, {...prior, use: prior.use === "required" || attribute.use === "required" ? "required" : "optional", sources: [...prior.sources, ...attribute.sources], constraints: [...prior.constraints, ...attribute.constraints]});
            } else merged.set(k, attribute);
          } else {
            if (prior?.use === "required" && attribute.use !== "required") c.fail(node, "derivation-ok-restriction", "Restriction cannot remove or weaken a required attribute");
            if (attribute.use !== "prohibited") {
              if (prior) {
                if (!scalars.derives(attribute.type, prior.type, node)) c.fail(node, "derivation-ok-restriction", "Restricted attribute type must derive from the original base type");
                fixedRequired(prior, attribute, node);
              } else if (!base.wildcard || !namespaceAllows(base.wildcard.namespace, attribute.name.namespace)) c.fail(node, "derivation-ok-restriction", "New restricted attribute is not admitted by the base wildcard");
            }
            merged.set(k, attribute);
          }
        }
        c.step(node, merged.size); attributes = [...merged.values()];
        if (node.derivation.kind === "extension") wildcard = mergeWildcard(base.wildcard, declared.wildcard, node, true);
        else if (wildcard && (!base.wildcard || !namespaceSubset(wildcard.namespace, base.wildcard.namespace) || !(baseRef?.kind === "builtin" && baseRef.name.local === "anyType") && rank[wildcard.processContents] < rank[base.wildcard.processContents])) c.fail(node, "derivation-ok-restriction", "Restricted wildcard must be a namespace subset with equal or stronger processing");
      }
      checkIds(attributes, node);
      types.set(node.id, {attributes, wildcard}); stack.pop();
    }
    return types.get(root.id)!;
  };
  return {ensure, group: (node: Extract<GraphNode, {kind: "attributeGroup"}>) => groups.get(node.id) ?? local(node)};
}
