/** Internal XSD 1.0 legality/capability gate over #178's reviewed analysis. */
import {deepFreeze} from "./canonicalGraph.js";
import type {ComplexTypeNode, GraphNode, NodeId, Reference} from "./canonicalGraph.js";
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
export type AssessmentScope = Readonly<{component: NodeId; kind: "opaque-builtin" | "wildcard-lax" | "wildcard-skip" | "absent-source"; description: string}>;
export type OperationAssessment = Readonly<
  {kind: "supported"; operation: string; selection: AssessmentSelection; roots: readonly NodeId[]; closure: readonly NodeId[];
    types: readonly AssessedType[]; scalars: readonly ScalarSupportPlan[]; scopes: readonly AssessmentScope[]; binding?: BindingSupportPlan;
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
    if (retained.context.source.uri === node.context.source.uri && unsupportedSyntax.has(retained.syntax.name.local)) c.unsupported(node, `xsd:${retained.syntax.name.local}`, "Reachable schema interpretation requires an excluded feature", retained.syntax.source);
  }
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
    let scalars: ReturnType<typeof scalarSchemaAssessment>;
    const particles = particleSchemaAssessment(c, (...args) => scalars.derives(...args), (derived, base) => {
      if (base.value?.kind !== "fixed") return true;
      return derived.value?.kind === "fixed" && scalars.equivalent(derived.type, derived.value.lexical, base.type, base.value.lexical, derived);
    });
    scalars = scalarSchemaAssessment(c, node => c!.types.get(node.id)?.scalar ? undefined : particles.effective(node).scalar);
    const attributes = attributeSchemaAssessment(c, scalars);
    const checked = new Map<NodeId, AssessedType>(), operations: OperationAssessment[] = [], ids = new Set<string>();
    for (const originalSelection of selections) {
      c.step(); c.text(originalSelection.id);
      // Copy before freezing the result; caller records remain untouched.
      let selection: AssessmentSelection;
      if (originalSelection.kind === "components") {
        c.step(undefined, originalSelection.roots.length); for (const root of originalSelection.roots) c.text(root);
        selection = {...originalSelection, roots: [...originalSelection.roots]};
      } else {
        c.text(originalSelection.binding); c.text(originalSelection.operation);
        if (originalSelection.additionalRoots) {c.step(undefined, originalSelection.additionalRoots.length); for (const root of originalSelection.additionalRoots) c.text(root);}
        if (originalSelection.port) {c.text(originalSelection.port.service); c.text(originalSelection.port.name);}
        selection = {...originalSelection, port: originalSelection.port && {...originalSelection.port}, additionalRoots: originalSelection.additionalRoots && [...originalSelection.additionalRoots]};
      }
      c.step(); c.text(selection.id);
      if (!selection.id || ids.has(selection.id)) throw new SemanticError("invalid-schema", "Assessment selection IDs must be present and unique");
      ids.add(selection.id);
      try {
        const selected = selectedOperationRoots(c, selection), closure: NodeId[] = [], seen = new Set<string>(), queue: {id: NodeId; sourceOnly: boolean}[] = [];
        const scope: AssessmentScope[] = [], scalarPlans = new Map<NodeId, ScalarSupportPlan>(), typePlans: AssessedType[] = [];
        const recordScalar = (plan: ScalarSupportPlan) => {
          context.step(undefined, plan.enforcement.length); const prior = scalarPlans.get(plan.id);
          if (prior) {context.step(undefined, prior.enforcement.length + plan.enforcement.length); scalarPlans.set(plan.id, {...plan, enforcement: [...new Set([...prior.enforcement, ...plan.enforcement])]});}
          else scalarPlans.set(plan.id, plan);
        };
        for (const id of selected.roots) {c.step(); queue.push({id, sourceOnly: false});}
        const scalar = (reference: Reference, owner: GraphNode) => {
          if (reference.kind === "builtin" && reference.name.local === "anyType") {scope.push({component: owner.id, kind: "opaque-builtin", description: "Builtin content is opaque; declared contributions are assessed separately"}); return;}
          const plan = scalars.ensure(reference, owner); context.step(owner); recordScalar(plan);
        };
        const wildcard = (node: GraphNode, constraint: ReturnType<typeof wildcardNamespaces>, process: "strict" | "lax" | "skip", role: "element" | "attribute") => {
          if (process !== "strict") scope.push({component: node.id, kind: process === "lax" ? "wildcard-lax" : "wildcard-skip", description: process === "lax" ? "Validate known matching declarations; unknown names remain unassessed" : "Wildcard content is intentionally unassessed"});
          if (process === "skip") return;
          for (const id of c!.graph.globals) {
            c!.step(node); const declaration = c!.get(id);
            if (declaration.kind === role && namespaceAllows(constraint, declaration.name.namespace)) queue.push({id: declaration.id, sourceOnly: false});
          }
        };
        while (queue.length) {
          const entry = queue.pop()!; c.step(); const node = c.get(entry.id);
          const sourceOnly = entry.sourceOnly || node.kind === "particle" && node.occurs.max === "0" || node.kind === "attributeUse" && node.use === "prohibited";
          const visit = `${sourceOnly ? "source" : "component"}:${entry.id}`;
          if (seen.has(visit)) continue; seen.add(visit);
          if (sourceOnly) {
            c.setCurrent(node); checkSchemaSyntax(c, node);
            scope.push({component: node.id, kind: "absent-source", description: "Source syntax has no surviving particle/attribute-use component; S05 reference and cycle diagnostics remain applicable"});
            const refs = referenceSlots(node), children = containedNodes(node);
            c.step(node, refs.length + children.length);
            for (const slot of refs) if (slot.reference.kind !== "builtin") {c.step(node); queue.push({id: c.target(slot.reference, node)!, sourceOnly: true});}
            for (const child of children) {c.step(node); queue.push({id: child, sourceOnly: true});}
            continue;
          }
          const id = entry.id; checkSyntax(c, node); closure.push(id);
          if (node.kind === "simpleType") scalar({kind: "local", target: node.id}, node);
          if (node.kind === "element" || node.kind === "attribute") {
            const target = node.type.kind === "builtin" ? undefined : c.get(c.target(node.type, node)!);
            if (node.kind === "attribute" || node.type.kind === "builtin" || target?.kind === "simpleType" || target?.kind === "complexType" && particles.effective(target).scalar) scalar(node.type, node);
            if (node.value) {
              let type = node.type;
              if (target?.kind === "complexType" && !particles.effective(target).scalar) {
                const content = particles.effective(target);
                if (!content.mixed || !content.particle?.schemaEmptiable || content.opaque) c.fail(node, "e-props-correct", "Element value constraint requires scalar or mixed formally emptiable content");
                type = {kind: "builtin", name: {namespace: XSD_NAMESPACE, local: "string"}};
              }
              const plan = scalars.checkValue(type, node.value, node); recordScalar(plan);
            }
          }
          if (node.kind === "complexType") {
            let plan = checked.get(node.id);
            if (!plan) {
              checkReorderedDerivation(c, node);
              particles.check(node); const attrs = attributes.ensure(node), original = c.types.get(node.id)!;
              let scalarPlan: ScalarSupportPlan | undefined;
              const effectiveContent = particles.effective(node);
              if (effectiveContent.scalar) {
                scalarPlan = scalars.ensure({kind: "local", target: node.id}, node);
                if (node.derivation?.contentKind === "simple") {
                  scalars.checkFinal(node.derivation.base, node.derivation.kind, node);
                  const baseId = c.target(node.derivation.base, node), base = baseId && c.get(baseId);
                  if (node.derivation.kind === "restriction" && base && base.kind === "complexType" && !c.types.get(base.id)?.scalar) {
                    if (!c.types.get(base.id)?.mixed || !c.typeSummaries.get(base.id)?.children.schemaEmptiable || !node.derivation.inlineType) c.fail(node, "src-ct", "Simple-content restriction of a mixed base requires formal emptiability and an inline scalar type");
                  }
                }
              }
              const obligations: AssessedType["obligations"][number][] = [];
              for (const obligation of original.obligations) {c.step(node); obligations.push({kind: obligation.kind, owner: obligation.owner, status: "discharged"});}
              plan = {id: node.id, original, effectiveContent, attributes: attrs.attributes, wildcard: attrs.wildcard, scalar: scalarPlan, obligations, assessment: "schema-assessed"}; checked.set(node.id, plan);
            }
            typePlans.push(plan);
            if (plan.scalar) recordScalar(plan.scalar);
            if (plan.wildcard) wildcard(node, plan.wildcard.namespace, plan.wildcard.processContents, "attribute");
            for (const use of plan.attributes) {
              c.step(node); if (use.use === "prohibited") continue;
              const scalarPlan = scalars.ensure(use.type, c.get(use.declaration));
              recordScalar(scalarPlan);
              for (const constraint of use.constraints) if (constraint.value) {
                c.step(node); const supported = scalars.checkValue(use.type, constraint.value, c.get(constraint.owner)); recordScalar(supported);
              }
            }
          }
          if (node.kind === "attributeGroup") attributes.group(node);
          if (node.kind === "particle" && node.term.kind === "any") {
            c.text(node.term.wildcard.namespace.value, node); wildcard(node, wildcardNamespaces(node.term.wildcard), node.term.wildcard.processContents, "element");
          }
          const referenceCount = node.kind === "simpleType" && node.variety.kind === "union" ? node.variety.members.length : node.kind === "wsdl" ? node.references.length : 3;
          const containedCount = node.kind === "complexType" || node.kind === "attributeGroup" ? node.attributes.length + 1 : node.kind === "particle" && "children" in node.term ? node.term.children.length : 1;
          c.step(node, referenceCount + containedCount);
          for (const slot of referenceSlots(node)) {
            c.step(node);
            if (slot.reference.kind === "builtin") {
              if (slot.reference.name.local !== "anyType") scalar(slot.reference, node);
              else scalar(slot.reference, node);
            } else queue.push({id: c.target(slot.reference, node)!, sourceOnly: false});
          }
          for (const child of containedNodes(node)) {c.step(node); queue.push({id: child, sourceOnly: false});}
        }
        c.step(undefined, closure.length + typePlans.length + scalarPlans.size + scope.length);
        operations.push({kind: "supported", operation: selection.id, selection, roots: selected.roots, closure,
          types: typePlans, scalars: [...scalarPlans.values()], scopes: scope, binding: selected.binding,
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
