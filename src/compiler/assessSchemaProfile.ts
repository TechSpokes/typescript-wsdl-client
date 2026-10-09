/** Internal XSD 1.0 legality/capability gate over #178's reviewed analysis. */
import {deepFreeze} from "./canonicalGraph.js";
import type {AttributeNode, ComplexTypeNode, ElementNode, GraphNode, NodeId, Reference, ValueConstraint} from "./canonicalGraph.js";
import type {ComposedType, DerivationObligation} from "./composeCanonicalGraph.js";
import {referenceSlots, containedNodes} from "./graphTraversal.js";
import type {OccurrenceAnalysis} from "./occurrenceAnalysis.js";
import {SemanticError} from "./resolveCanonicalGraph.js";
import type {SemanticLimits} from "./resolveCanonicalGraph.js";
import {assessmentContext, SchemaAssessmentError} from "./schemaAssessmentContext.js";
import type {AssessmentContext} from "./schemaAssessmentContext.js";
import {scalarSchemaAssessment} from "./scalarSchemaAssessment.js";
import type {ScalarSupportPlan} from "./scalarSchemaAssessment.js";
import {attributeSchemaAssessment} from "./attributeSchemaAssessment.js";
import type {AssessedAttribute, AssessedWildcard} from "./attributeSchemaAssessment.js";
import {namespaceAllows, particleSchemaAssessment} from "./particleSchemaAssessment.js";
import type {EffectiveContent} from "./particleSchemaAssessment.js";
import {wildcardNamespaces} from "./composeCanonicalGraph.js";
import {selectedOperationRoots} from "./operationSchemaAssessment.js";
import type {AssessmentSelection, BindingSupportPlan} from "./operationSchemaAssessment.js";
import type {SyntaxSource} from "../loader/orderedSyntax.js";
import {XSD_NAMESPACE} from "../loader/orderedSyntax.js";
import {checkSchemaSyntax} from "./schemaSyntaxAssessment.js";
import {normalizeWhitespace} from "./schemaDatatypeValues.js";

export type SchemaDiagnostic = Readonly<{
  category: "invalid-schema" | "unsupported-capability" | "resource-limit" | "incompatible-artifact";
  rule: string; message: string; component?: NodeId; source?: SyntaxSource; related: readonly SyntaxSource[];
  operations: readonly string[];
  scope: "request" | "selected-operations";
}>;
export type AssessedType = Readonly<{
  id: NodeId; original: ComposedType; attributes: readonly AssessedAttribute[];
  wildcard?: AssessedWildcard;
  scalar?: ScalarSupportPlan; obligations: readonly Readonly<{kind: DerivationObligation["kind"]; owner: NodeId; status: "discharged"}>[];
  effectiveContent: EffectiveContent;
  assessment: "schema-assessed";
}>;
export type AssessmentScope = Readonly<{component: NodeId; kind: "opaque-builtin" | "wildcard-lax" | "wildcard-skip" | "absent-source" | "schema-only"; description: string}>;
export type ElementValuePlan = Readonly<{
  owner: NodeId; originalType: Reference; operandType: Reference; constraint: ValueConstraint;
  scope: "simple-content" | "mixed-text"; scalar: ScalarSupportPlan; runtimeOwner: "#184";
}>;
export type OperationAssessment = Readonly<
  {kind: "supported"; operation: string; selection: AssessmentSelection; roots: readonly NodeId[]; closure: readonly NodeId[];
    types: readonly AssessedType[]; scalars: readonly ScalarSupportPlan[]; elementValues: readonly ElementValuePlan[]; scopes: readonly AssessmentScope[]; binding?: BindingSupportPlan;
    schemaAssessment: "selected-closure"; payloadEnforcement: "requires-#180-and-#184"} |
  {kind: "invalid-schema" | "unsupported-capability"; operation: string; selection: AssessmentSelection; diagnostic: SchemaDiagnostic}
>;
export type SchemaAssessment = Readonly<{
  profile: "xsd10-faithful-v1"; analysis: OccurrenceAnalysis; operations: readonly OperationAssessment[]; metrics: Readonly<{steps: number}>;
}>;
export type SchemaAssessmentResult = Readonly<
  {kind: "assessed"; assessment: SchemaAssessment} | {kind: "failure"; diagnostic: SchemaDiagnostic}
>;

/** Freeze only new assessment records, iteratively and within this stage's budget. */
function freezeAssessment<T>(value: T, c: AssessmentContext, metrics: {steps: number}): T {
  const stack: unknown[] = [value], objects: object[] = [], seen = new Set<object>();
  while (stack.length) {
    const item = stack.pop(); c.step();
    if (!item || typeof item !== "object" || Object.isFrozen(item) || seen.has(item)) continue;
    seen.add(item); c.step(); objects.push(item);
    for (const key in item) {
      c.step(); if (Object.hasOwn(item, key)) stack.push((item as Record<string, unknown>)[key]);
    }
  }
  metrics.steps = c.budget.steps;
  // Each object was charged before adding it to this list.
  for (const item of objects) Object.freeze(item);
  return value;
}

const unsupportedSyntax = new Set(["key", "keyref", "unique", "assert", "assertion", "alternative", "openContent", "defaultOpenContent", "explicitTimezone", "redefine"]);
/** Charge the upper bound before helpers create reference/containment arrays. */
function chargeEdges(c: AssessmentContext, node: GraphNode) {
  const references = node.kind === "simpleType" && node.variety.kind === "union" ? node.variety.members.length : node.kind === "wsdl" ? node.references.length : 2;
  const contained = node.kind === "complexType" || node.kind === "attributeGroup" ? node.attributes.length + 1 : node.kind === "particle" && "children" in node.term ? node.term.children.length : 1;
  c.step(node, references + contained);
}
const allowedAttributes: Readonly<Record<GraphNode["kind"], readonly string[]>> = {
  element: ["id", "name", "type", "form", "default", "fixed", "nillable", "abstract", "block", "final", "substitutionGroup", "minOccurs", "maxOccurs"],
  attribute: ["id", "name", "type", "form", "default", "fixed", "use"],
  particle: ["id", "minOccurs", "maxOccurs", "name", "ref", "type", "form", "default", "fixed", "nillable", "block", "abstract", "final", "namespace", "processContents"],
  attributeUse: ["id", "name", "ref", "type", "form", "default", "fixed", "use"], attributeGroupUse: ["id", "ref"],
  attributeWildcard: ["id", "namespace", "processContents"], simpleType: ["id", "name", "final"],
  complexType: ["id", "name", "mixed", "abstract", "block", "final"], group: ["id", "name"], attributeGroup: ["id", "name"], wsdl: [],
};
function checkSyntax(c: AssessmentContext, node: GraphNode) {
  c.setCurrent(node); c.step(node);
  checkSchemaSyntax(c, node);
  if (node.kind !== "wsdl") for (const attribute of node.declaredAttributes) {
    c.step(node); c.text(attribute.name.local, node); c.text(attribute.value, node);
    if (!attribute.name.namespace && !allowedAttributes[node.kind].includes(attribute.name.local)) c.fail(node, "schema-for-schemas", "Attribute is not permitted on this XSD declaration");
    if (!attribute.name.namespace && ["final", "block"].includes(attribute.name.local)) {
      const tokens = normalizeWhitespace(attribute.value, "collapse").split(" ").filter(Boolean);
      const allowed = attribute.name.local === "block" && node.kind === "element" ? ["extension", "restriction", "substitution"] : node.kind === "simpleType" ? ["restriction", "list", "union"] : ["extension", "restriction"];
      if (!(tokens.length === 1 && tokens[0] === "#all") && tokens.some(t => !allowed.includes(t))) c.fail(node, "schema-for-schemas", "Invalid final/block derivation set");
    }
  }
  for (const retained of node.retained) {
    c.step(node);
    if (retained.name.namespace === XSD_NAMESPACE) {
      if (unsupportedSyntax.has(retained.name.local)) c.unsupported(node, `xsd:${retained.name.local}`, "Identity constraints, XSD 1.1 features and redefine are excluded", retained.source);
      c.fail(node, "schema-for-schemas", "Unexpected XSD child in this declaration", retained.source);
    }
    c.fail(node, "schema-for-schemas", "Foreign child belongs in annotation/appinfo rather than the XSD content grammar", retained.source);
  }
  if (node.kind === "element" && (node.abstract || node.substitutionGroup) || node.kind === "complexType" && node.abstract) c.unsupported(node, "polymorphism", "Abstract/substitution-group polymorphism is excluded");
  if (node.kind === "group") {
    const content = c.get(node.content);
    if (content.kind !== "particle" || content.declaredAttributes.some(a => !a.name.namespace && ["minOccurs", "maxOccurs"].includes(a.name.local))) c.fail(node, "src-group", "Named group compositors cannot declare occurrence attributes");
  }
  for (const retained of c.graph.schemaRetained) {
    c.step(node);
    if (retained.context.source.uri !== node.context.source.uri) continue;
    if (retained.syntax.name.namespace === XSD_NAMESPACE && unsupportedSyntax.has(retained.syntax.name.local)) c.unsupported(node, `xsd:${retained.syntax.name.local}`, "Reachable schema interpretation requires an excluded feature", retained.syntax.source);
    if (retained.syntax.name.namespace !== XSD_NAMESPACE || !["include", "import", "notation"].includes(retained.syntax.name.local)) c.fail(node, "schema-for-schemas", "Unexpected child of a reachable schema document", retained.syntax.source);
  }
}
function checkAttributeType(c: AssessmentContext, node: AttributeNode) {
  c.step(node);
  const type = node.type.kind === "builtin" ? undefined : c.get(c.target(node.type, node)!);
  if (node.type.kind === "builtin" && node.type.name.local === "anyType" || type && type.kind !== "simpleType") c.fail(node, "a-props-correct", "An attribute declaration requires a simple type definition");
}

/** Never discharge the existential reordered-derivation rule by omission. */
function checkReorderedDerivation(c: AssessmentContext, node: ComplexTypeNode) {
  if (node.derivation?.kind !== "extension") return;
  let base: Reference | undefined = node.derivation.base;
  while (base && base.kind !== "builtin") {
    c.step(node); const ancestor = c.get(c.target(base, node)!);
    if (ancestor.kind !== "complexType") return;
    const derivation = ancestor.derivation;
    if (derivation?.kind === "restriction" && !(derivation.base.kind === "builtin" && derivation.base.name.local === "anyType")) c.unsupported(node, "S06-RE-01", "A primary-rule reordered extension/restriction witness is required before this model can be assessed", ancestor.context.source);
    base = derivation?.base;
  }
}

/** Exhaustion aborts the entire request, even after another operation was assessed. */
export function assessSchemaProfile(analysis: OccurrenceAnalysis, selections: readonly AssessmentSelection[], limits: SemanticLimits = {}): SchemaAssessmentResult {
  let c: AssessmentContext | undefined;
  const diagnostic = (error: SemanticError, operations: readonly string[], scope: SchemaDiagnostic["scope"] = "selected-operations"): SchemaDiagnostic => ({category: error.category,
    rule: error instanceof SchemaAssessmentError ? error.rule : error.category === "resource-limit" ? "S02-D09" : "semantic-input",
    message: error.message, component: error.component, source: error.source, related: error.related, operations, scope});
  try {
    c = assessmentContext(analysis, limits);
    const context = c;
    const valueType = (node: ElementNode | AttributeNode, checks: ReturnType<typeof particleSchemaAssessment>): {type: Reference; scope: ElementValuePlan["scope"]} => {
      context.step(node);
      if (node.kind === "element" && node.type.kind === "builtin" && node.type.name.namespace === XSD_NAMESPACE && node.type.name.local === "anyType") {
        return {type: {kind: "builtin", name: {namespace: XSD_NAMESPACE, local: "string"}}, scope: "mixed-text"};
      }
      const target = node.type.kind === "builtin" ? undefined : context.get(context.target(node.type, node)!);
      if (node.kind === "element" && target?.kind === "complexType") {
        const content = checks.effective(target);
        if (!content.scalar) {
          if (!content.mixed || !content.particle?.schemaEmptiable) context.fail(node, "e-props-correct", "Element value constraint requires scalar or mixed formally emptiable content");
          return {type: {kind: "builtin", name: {namespace: XSD_NAMESPACE, local: "string"}}, scope: "mixed-text"};
        }
      }
      return {type: node.type, scope: "simple-content"};
    };
    const scalarContent = (node: ComplexTypeNode, particleChecks: ReturnType<typeof particleSchemaAssessment>, scalarChecks: ReturnType<typeof scalarSchemaAssessment>) => {
      if (!particleChecks.effective(node).scalar) return undefined;
      const plan = scalarChecks.ensure({kind: "local", target: node.id}, node);
      if (node.derivation?.contentKind === "simple") {
        scalarChecks.checkFinal(node.derivation.base, node.derivation.kind, node);
        const baseId = context.target(node.derivation.base, node), base = baseId && context.get(baseId);
        if (node.derivation.kind === "restriction" && base && base.kind === "complexType" && !context.types.get(base.id)?.scalar) {
          const baseContent = particleChecks.effective(base);
          if (!baseContent.mixed || !baseContent.particle?.schemaEmptiable || !node.derivation.inlineType) context.fail(node, "src-ct", "Simple-content restriction of a mixed base requires formal emptiability and an inline scalar type");
        }
      }
      return plan;
    };
    let scalars: ReturnType<typeof scalarSchemaAssessment>;
    let sourceScalars: ReturnType<typeof scalarSchemaAssessment>;
    const particles = particleSchemaAssessment(c, (...args) => sourceScalars.derives(...args), (derived, base) => {
      if (base.value?.kind !== "fixed") return true;
      return derived.value?.kind === "fixed" && sourceScalars.equivalent(valueType(derived, particles).type, derived.value.lexical, valueType(base, particles).type, base.value.lexical, derived);
    });
    scalars = scalarSchemaAssessment(c, node => c!.types.get(node.id)?.scalar ? undefined : particles.effective(node).scalar);
    // A dead use creates no runtime requirement, but an existing referenced
    // global declaration still has schema-level operands/facet constraints.
    const sourceParticles = particleSchemaAssessment(c, (...args) => sourceScalars.derives(...args), (a, b) =>
      b.value?.kind !== "fixed" || a.value?.kind === "fixed" && sourceScalars.equivalent(valueType(a, sourceParticles).type, a.value.lexical, valueType(b, sourceParticles).type, b.value.lexical, a));
    sourceScalars = scalarSchemaAssessment(c, node => c!.types.get(node.id)?.scalar ? undefined : sourceParticles.effective(node).scalar, {schemaOperandsOnly: true});
    const isSchemaIdType = (type: Reference, owner: GraphNode) => sourceScalars.ensure(type, owner).builtin === "ID";
    const sourceAttributes = attributeSchemaAssessment(c, sourceScalars, isSchemaIdType);
    // Derivation operands are schema-only; surviving uses acquire runtime
    // scalar requirements below, after restriction has removed absent uses.
    const attributes = sourceAttributes;
    const checked = new Map<NodeId, AssessedType>(), operations: OperationAssessment[] = [], ids = new Set<string>();
    for (const originalSelection of selections) {
      c.step(); c.text(originalSelection.id);
      // Copy before freezing the result; caller records remain untouched.
      let selection: AssessmentSelection;
      if (originalSelection.kind === "components") {
        c.step(undefined, originalSelection.roots.length); for (const root of originalSelection.roots) c.text(root);
        selection = {kind: "components", id: originalSelection.id, roots: [...originalSelection.roots]};
      } else {
        c.text(originalSelection.binding); c.text(originalSelection.operation);
        if (originalSelection.inputName !== undefined) c.text(originalSelection.inputName);
        if (originalSelection.outputName !== undefined) c.text(originalSelection.outputName);
        if (originalSelection.additionalRoots) {c.step(undefined, originalSelection.additionalRoots.length); for (const root of originalSelection.additionalRoots) c.text(root);}
        if (originalSelection.port) {c.text(originalSelection.port.service); c.text(originalSelection.port.name);}
        selection = {kind: "operation", id: originalSelection.id, binding: originalSelection.binding, operation: originalSelection.operation,
          inputName: originalSelection.inputName, outputName: originalSelection.outputName,
          port: originalSelection.port && {service: originalSelection.port.service, name: originalSelection.port.name},
          additionalRoots: originalSelection.additionalRoots && [...originalSelection.additionalRoots]};
      }
      c.step(); c.text(selection.id);
      if (!selection.id || ids.has(selection.id)) throw new SemanticError("invalid-schema", "Assessment selection IDs must be present and unique");
      ids.add(selection.id);
      try {
        const selected = selectedOperationRoots(c, selection), closure: NodeId[] = [], seen = new Set<string>(), queue: {id: NodeId; mode: "runtime" | "schema" | "absent"}[] = [];
        const scope: AssessmentScope[] = [], scalarPlans = new Map<NodeId, ScalarSupportPlan>(), typePlans: AssessedType[] = [], elementValues: ElementValuePlan[] = [];
        const recordScalar = (plan: ScalarSupportPlan) => {
          context.step(undefined, plan.enforcement.length); const prior = scalarPlans.get(plan.id);
          if (prior) {context.step(undefined, prior.enforcement.length + plan.enforcement.length); scalarPlans.set(plan.id, {...plan, enforcement: [...new Set([...prior.enforcement, ...plan.enforcement])]});}
          else scalarPlans.set(plan.id, plan);
        };
        for (const id of selected.roots) {c.step(); queue.push({id, mode: "runtime"});}
        const scalar = (reference: Reference, owner: GraphNode) => {
          if (reference.kind === "builtin" && reference.name.local === "anyType") {scope.push({component: owner.id, kind: "opaque-builtin", description: "Builtin content is opaque; declared contributions are assessed separately"}); return;}
          const plan = scalars.ensure(reference, owner); context.step(owner); recordScalar(plan);
        };
        const wildcard = (node: GraphNode, constraint: ReturnType<typeof wildcardNamespaces>, process: "strict" | "lax" | "skip", role: "element" | "attribute") => {
          if (process !== "strict") scope.push({component: node.id, kind: process === "lax" ? "wildcard-lax" : "wildcard-skip", description: process === "lax" ? "Validate known matching declarations; unknown names remain unassessed" : "Wildcard content is intentionally unassessed"});
          if (process === "skip") return;
          for (const id of c!.graph.globals) {
            c!.step(node); const declaration = c!.get(id);
            if (declaration.kind === role && namespaceAllows(constraint, declaration.name.namespace)) queue.push({id: declaration.id, mode: "runtime"});
          }
        };
        while (queue.length) {
          const entry = queue.pop()!; c.step(); const node = c.get(entry.id);
          const mode = node.kind === "particle" && node.occurs.max === "0" || node.kind === "attributeUse" && node.use === "prohibited" ? "absent" : entry.mode;
          const sourceOnly = mode !== "runtime";
          const visit = `${mode}:${entry.id}`;
          if (seen.has(visit)) continue; seen.add(visit);
          if (sourceOnly) {
            c.setCurrent(node); checkSchemaSyntax(c, node);
            const componentExists = mode === "schema" || node.identity.kind === "global";
            if (componentExists) {
              if (node.kind === "attribute") checkAttributeType(c, node);
              if (node.kind === "simpleType") sourceScalars.ensure({kind: "local", target: node.id}, node);
              if (node.kind === "complexType") {checkReorderedDerivation(c, node); sourceParticles.check(node); sourceAttributes.ensure(node); scalarContent(node, sourceParticles, sourceScalars);}
              if (node.kind === "attributeGroup") sourceAttributes.group(node);
              if ((node.kind === "element" || node.kind === "attribute") && node.value) {
                sourceScalars.checkValue(valueType(node, sourceParticles).type, node.value, node);
              }
              scope.push({component: node.id, kind: "schema-only", description: "Existing component retains original schema operands without adding a surviving runtime scalar capability"});
            } else scope.push({component: node.id, kind: "absent-source", description: "Source syntax has no surviving particle/attribute-use component; S05 reference and cycle diagnostics remain applicable"});
            chargeEdges(c, node);
            const refs = referenceSlots(node), children = containedNodes(node);
            const nextMode = componentExists ? "schema" : "absent";
            for (const slot of refs) if (slot.reference.kind !== "builtin") {c.step(node); queue.push({id: c.target(slot.reference, node)!, mode: nextMode});}
            for (const child of children) {c.step(node); queue.push({id: child, mode: nextMode});}
            continue;
          }
          const id = entry.id; checkSyntax(c, node); closure.push(id);
          if (node.kind === "attribute") checkAttributeType(c, node);
          if (node.kind === "simpleType") scalar({kind: "local", target: node.id}, node);
          if (node.kind === "element" || node.kind === "attribute") {
            const operand = node.value && valueType(node, particles);
            if (node.value) sourceScalars.checkValue(operand!.type, node.value, node);
            const target = node.type.kind === "builtin" ? undefined : c.get(c.target(node.type, node)!);
            if (node.kind === "attribute" || node.type.kind === "builtin" || target?.kind === "simpleType" || target?.kind === "complexType" && particles.effective(target).scalar) scalar(node.type, node);
            if (node.value) {
              const plan = scalars.checkValue(operand!.type, node.value, node); recordScalar(plan);
              if (node.kind === "element") {c.step(node); elementValues.push({owner: node.id, originalType: node.type, operandType: operand!.type, constraint: node.value, scope: operand!.scope, scalar: plan, runtimeOwner: "#184"});}
            }
          }
          if (node.kind === "complexType") {
            let plan = checked.get(node.id);
            if (!plan) {
              checkReorderedDerivation(c, node);
              particles.check(node);
              const attrs = attributes.ensure(node), original = c.types.get(node.id)!;
              const effectiveContent = particles.effective(node);
              const scalarPlan = scalarContent(node, particles, scalars);
              const obligations: AssessedType["obligations"][number][] = [];
              for (const obligation of original.obligations) {c.step(node); obligations.push({kind: obligation.kind, owner: obligation.owner, status: "discharged"});}
              plan = {id: node.id, original, effectiveContent, attributes: attrs.attributes, wildcard: attrs.wildcard, scalar: scalarPlan, obligations, assessment: "schema-assessed"}; checked.set(node.id, plan);
            }
            typePlans.push(plan);
            if (plan.scalar) recordScalar(plan.scalar);
            if (plan.effectiveContent.opaque) scope.push({component: node.id, kind: "opaque-builtin", description: "Inherited builtin content is opaque; surviving declared contributions are assessed separately"});
            const effectiveParticles = plan.effectiveContent.particle ? [plan.effectiveContent.particle] : [];
            while (effectiveParticles.length) {
              const particle = effectiveParticles.pop()!; c.step(particle.owner);
              if (particle.occurs.max === "0") continue;
              if (particle.element) queue.push({id: particle.element.id, mode: "runtime"});
              if (particle.wildcard && particle.owner.kind === "particle") wildcard(particle.owner, wildcardNamespaces(particle.wildcard), particle.wildcard.processContents, "element");
              c.step(particle.owner, particle.children.length);
              for (const child of particle.children) effectiveParticles.push(child);
            }
            if (plan.wildcard) wildcard(node, plan.wildcard.namespace, plan.wildcard.processContents, "attribute");
            for (const use of plan.attributes) {
              c.step(node); if (use.use === "prohibited") continue;
              queue.push({id: use.declaration, mode: "runtime"});
              const scalarPlan = scalars.ensure(use.type, c.get(use.declaration));
              recordScalar(scalarPlan);
              for (const constraint of use.constraints) if (constraint.value) {
                c.step(node); const supported = scalars.checkValue(use.type, constraint.value, c.get(constraint.owner)); recordScalar(supported);
              }
            }
          }
          if (node.kind === "attributeGroup") {sourceAttributes.group(node); attributes.group(node);}
          if (node.kind === "particle" && node.term.kind === "any") {
            c.text(node.term.wildcard.namespace.value, node); wildcard(node, wildcardNamespaces(node.term.wildcard), node.term.wildcard.processContents, "element");
          }
          chargeEdges(c, node);
          for (const slot of referenceSlots(node)) {
            c.step(node);
            if (slot.reference.kind === "builtin") {
              if (slot.reference.name.local !== "anyType") scalar(slot.reference, node);
              else scalar(slot.reference, node);
            } else queue.push({id: c.target(slot.reference, node)!, mode: node.kind === "complexType" && slot.path === "derivation/base" ? "schema" : "runtime"});
          }
          for (const child of containedNodes(node)) {c.step(node); queue.push({id: child, mode: node.kind === "complexType" && child !== node.content ? "schema" : "runtime"});}
        }
        c.step(undefined, closure.length + typePlans.length + scalarPlans.size + scope.length + elementValues.length);
        operations.push({kind: "supported", operation: selection.id, selection, roots: selected.roots, closure,
          types: typePlans, scalars: [...scalarPlans.values()], elementValues, scopes: scope, binding: selected.binding,
          schemaAssessment: "selected-closure", payloadEnforcement: "requires-#180-and-#184"});
      } catch (error) {
        if (!(error instanceof SemanticError) || error.category === "resource-limit") throw error;
        if (error.category !== "invalid-schema" && error.category !== "unsupported-capability") throw error;
        operations.push({kind: error.category, operation: selection.id, selection, diagnostic: diagnostic(error, [selection.id])});
      }
    }
    const metrics = {steps: 0};
    return freezeAssessment({kind: "assessed" as const, assessment: {profile: "xsd10-faithful-v1" as const, analysis, operations, metrics}}, context, metrics);
  } catch (error) {
    if (error instanceof SemanticError) return deepFreeze({kind: "failure" as const, diagnostic: diagnostic(error, [], "request")});
    throw error;
  }
}
