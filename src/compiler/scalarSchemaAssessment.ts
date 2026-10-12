import type {SemanticTypeReference as Reference, SemanticTypeDependency, OriginalGeneratedScalarReference} from './semanticTypeReference.js';
/** Scalar schema legality and enforcement ownership. Payload enforcement is #184. */
import {isBuiltinType} from "./canonicalGraph.js";
import type {GraphNode, LexicalValue, NodeId, ValueConstraint} from "./canonicalGraph.js";
import type {ScalarFacet as Facet} from "./schemaSimpleTypeProperties.js";
import {checkTypeDerivation, declarationMethods, immediateTypeBase, RelationProblem} from "./schemaTypeRelations.js";
import type {AssessmentContext} from "./schemaScalarContext.js";
import {SchemaAssessmentError} from "./schemaScalarContext.js";
import {builtinListItem, builtinParents, builtinPrimitive, integerBounds, normalizeWhitespace, schemaDatatypeValues, whitespaceFor} from "./schemaDatatypeValues.js";
import type {SchemaOperand} from "./schemaDatatypeValues.js";
import {schemaPatterns,intrinsicBuiltinPatterns} from "./schemaPattern.js";
import {schemaScalarWitnesses} from "./schemaScalarWitnesses.js";
import {schemaValueSequences} from './schemaValueSequences.js';
import {LIST_CONSTRUCTOR_FACETS, schemaBuiltinFacetProperties} from './schemaBuiltinFacets.js';
import type {IntrinsicFacetProperties} from './schemaBuiltinFacets.js';
import type {SchemaPattern} from "./schemaPattern.js";
import {XSD_NAMESPACE} from "../loader/orderedSyntax.js";
import type {ExpandedName, SyntaxSource} from '../loader/orderedSyntax.js';
import type {SemanticContext} from './semanticContext.js';
import {resolveSemanticType} from './schemaTypeIdentity.js';
import {originalGeneratedShape, resolveOriginalScalarIdentity} from './schemaGeneratedScalarShape.js';
import type {RawSimpleTypeProperties} from './schemaSimpleTypeProperties.js';
import {projectFacetAnnotation, compareFacetAnnotation} from './schemaFacetAnnotation.js';
import type {FacetAnnotation} from './schemaFacetAnnotation.js';
import {collectSemanticTypeDependencies} from './semanticTypeDependencies.js';

export type ScalarEnforcement = "lexical-space" | "enumeration" | "pattern" | "whitespace" | "numeric-bounds" | "numeric-precision" | "length" | "QName-context" | "default-fixed" | "list" | "union";
export type ScalarConstraintLayer = Readonly<{owner: NodeId; facets: readonly Facet[]; patterns: readonly SchemaPattern[]}>;
export type ScalarObligation = Readonly<{rule: "simple-content-base-mixed-emptiable" | "raw-simple-content-derivation-validity" | "raw-simple-facet-restriction-validity" | "raw-simple-target-namespace"; component: NodeId; contextId?: string}>;
export type ScalarSupportPlan = Readonly<{
  obligations?: readonly ScalarObligation[];
  id: NodeId; reference: Reference; variety: "atomic" | "list" | "union"; primitive?: string;
  builtin?: string; item?: Reference; members?: readonly Reference[]; layers: readonly ScalarConstraintLayer[];
  declaredMembers?: readonly Reference[]; unionMapping?: "xsd10-flattened";
  whitespace: "preserve" | "replace" | "collapse" | "member";
  enforcement: readonly ScalarEnforcement[]; runtimeOwner: "#184"; consumers: readonly ["#188", "#189", "#198"];
}>;
/** References in this view select scalar content, including the private scalar
 * of a complex source owner. They are not synthetic GraphNode references.
 * Fundamental-facet equality follows equal complete determining properties;
 * this view does not publish unevaluated cardinality/finiteness values.
 */
export type ScalarContentProperties = Readonly<{
  definition: string; name?: ExpandedName; targetNamespace: string;
  final: readonly string[]; base?: Reference;
  variety: 'atomic' | 'list' | 'union' | 'absent'; primitive?: string;
  item?: Reference; members?: readonly Reference[];
  generatedPolicy?: 'GSC1'; annotation: 'absent' | 'source';
}>;
type Description = {
  typeDependencies?: readonly SemanticTypeDependency[];
  plan: ScalarSupportPlan; item?: Description; members?: Description[];
  /** Private exact properties, never inferred from a raw evaluator's builtin marker. */
  intrinsic?: IntrinsicFacetProperties;
  /** Raw atomic operands use their supplied properties over the primitive. */
  rawProperties?: boolean;
  originalFacetIdentity?:Description;
  /** Typed components belong to this description, even when caller facets are shared. */
  exactComponentSet?: readonly ExactFacetComponent[];
  conjuncts?: readonly Description[];
  facets: Map<string, {facet: Facet; operand?: SchemaOperand; integer?: string}>;
  /** Scalar component identity, including anonymous simple-content restrictions. */
  definition: string; parent?: Description;
};
type FacetProperty = {fixed: boolean; integer?: string; operand?: SchemaOperand; lexical?: string};
type PatternProperty = {expressions: readonly string[]; identity?: object};
type ExactFacetComponent = {name: string; values: readonly FacetProperty[];
  annotation?: FacetAnnotation; identity?: object};
/** Opaque internal evidence; its data is never accepted from a caller. */
export type ScalarFacetEvidence = Readonly<{kind: 'scalar-facet-evidence'}>;
export type ScalarFacetAnnotationPresence = 'absent' | 'present' | 'unresolved';
type FacetEvidenceRecord = {
  context: SemanticContext; identity: Description; applicable: boolean;
  scalars: ReadonlyMap<string, FacetProperty>; patterns: readonly PatternProperty[];
  enumerations: readonly (readonly SchemaOperand[])[];
  annotations: ScalarFacetAnnotationPresence;
  exact?: readonly ExactFacetComponent[];
  binding?:Description;
};
export type OriginalScalarFacetRecipe = Readonly<{kind:'original-scalar-facet-recipe'}>;
type RecipeFacet = {facet: Facet; value?: SchemaOperand; intrinsicPattern?:true;
  annotation: ScalarFacetAnnotationPresence; payload?: FacetAnnotation};
type RecipeLayer = {facets: readonly RecipeFacet[]; identity?: object};
type Recipe = {context: SemanticContext; layers: readonly RecipeLayer[]; obligations: readonly ScalarObligation[]; typeDependencies: readonly SemanticTypeDependency[]; identity: Description};
const originalRecipes = new WeakMap<OriginalScalarFacetRecipe, Recipe>();
const facetEvidence = new WeakMap<ScalarFacetEvidence, FacetEvidenceRecord>();
const excluded = new Set(["NOTATION", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES"]);
const boundNames = ["minInclusive", "minExclusive", "maxInclusive", "maxExclusive"];
const lengthNames = ["length", "minLength", "maxLength"];
const integerFacets = new Set([...lengthNames, "totalDigits", "fractionDigits"]);
const lower = (name: string) => name.startsWith("min");
const exclusive = (name: string) => name.endsWith("Exclusive");

export function scalarSchemaAssessment(c: AssessmentContext, options: {schemaOperandsOnly?: boolean;
  originalRecipe?: (type: Reference, owner: GraphNode) => OriginalScalarFacetRecipe;
  originalFacet?: (type: Reference, lexical: LexicalValue, owner: NodeId) => {operand: SchemaOperand; obligations: readonly ScalarObligation[];typeDependencies:readonly SemanticTypeDependency[]}} = {}) {
  const originalRecipeTokens=new WeakMap<Description,OriginalScalarFacetRecipe>();
  const descriptions = new Map<string, Description>(), values = schemaDatatypeValues(c), patterns = schemaPatterns(c), intrinsicPatterns=intrinsicBuiltinPatterns(c);
  const intrinsicFacets=new WeakSet<Facet>(), intrinsicCompiled=new WeakSet<SchemaPattern>();
  const patternOwner=(pattern:SchemaPattern)=>intrinsicCompiled.has(pattern)?intrinsicPatterns:patterns;
  let readingOriginalRecipe=false;
  const normalizedReferences=new Map<string,Reference>();
  const normalizeReference=(reference:Reference,owner:GraphNode):Reference=>{
    if(readingOriginalRecipe||reference.kind==='builtin'||reference.kind==='original-generated')return reference;
    const id=c.target(reference,owner)!,node=c.get(id);
    if(node.kind!=='complexType'||node.derivation?.contentKind!=='simple'||c.context.rawTypeProperties(id)||!c.context.sourceNode(id))return reference;
    const cached=normalizedReferences.get(id);if(cached)return cached;
    const mapped=resolveOriginalScalarIdentity(c.context,reference);
    if(mapped.kind==='resource-limit'){c.step(owner);throw new Error('Unreachable exhausted scalar budget');}
    if(mapped.kind!=='checked')return c.unresolved(owner,mapped.rule,mapped.message);
    c.step(owner,3);const result:Reference=mapped.value.kind==='component'?{kind:'local',target:mapped.value.id}:mapped.value;
    normalizedReferences.set(id,result);return result;
  };
  const boundFacetValues = new WeakMap<Facet, SchemaOperand>(), layerIdentities = new WeakMap<ScalarConstraintLayer, object>();
  const boundAnnotations = new WeakMap<Facet, ScalarFacetAnnotationPresence>();
  const boundAnnotationPayloads = new WeakMap<Facet, FacetAnnotation>();
  const recipeCache = new Map<Reference, Recipe>();
  const sourceFacetAnnotations = new WeakMap<Facet, 'absent' | 'present'>();
  const sourceFacetPayloads = new WeakMap<Facet, FacetAnnotation>();
  const facetAnnotationPresence=(annotation:FacetAnnotation|undefined):ScalarFacetAnnotationPresence=>
    annotation===undefined?'unresolved':annotation==='absent'?'absent':'present';
  const sequences = schemaValueSequences({step: c.step,
    isInvalidSchema: (error: unknown) => error instanceof SchemaAssessmentError && error.category === 'invalid-schema'});
  let builtinReferenceKeys:WeakMap<Reference, string>|undefined;
  const referenceKey = (reference: Reference, owner: GraphNode): string => {
    reference=normalizeReference(reference,owner);
    if (reference.kind === 'original-generated') {
      const selected = resolveSemanticType(c.context, reference);
      if (selected.kind !== 'original-generated') return c.unresolved(owner, 'original-generated-membership', 'Original scalar slot is not active');
      c.text(reference.owner, owner); return 'slot:' + reference.owner;
    }
    if (reference.kind !== "builtin") return c.target(reference, owner)!;
    const safe = c.context.ownTypeReference(reference);
    if (safe.kind !== 'builtin') return c.fail(owner, 'src-resolve', 'Builtin type requires the XSD namespace');
    if (!builtinReferenceKeys) {
      c.step(owner, 2);
      builtinReferenceKeys = new WeakMap<Reference, string>();
    }
    c.step(owner, 3);
    const known = builtinReferenceKeys.get(safe);
    if (known) return known;
    c.text(safe.name.local, owner); c.text(safe.name.namespace, owner);
    if (safe.name.namespace !== XSD_NAMESPACE || !isBuiltinType(safe.name.local)) return c.fail(owner, "src-resolve", "Unknown builtin scalar type");
    c.step(owner, 8 + safe.name.local.length);
    const key = `builtin:${safe.name.local}`;
    c.step(owner, 3);
    builtinReferenceKeys.set(safe, key);
    return key;
  };
  const checkFinal = (base: Reference, method: string, owner: GraphNode) => {
    if (base.kind === "builtin" || base.kind === "original-generated") return;
    const node = c.get(c.target(base, owner)!);
    try {
      const tokens: readonly string[] = declarationMethods(c.context, node, "final");
      if (tokens.includes(method)) c.fail(owner, "cos-st-derived-ok", `Base type prohibits derivation by ${method}`, undefined, [node.context.source]);
    } catch (error) {
      if (!(error instanceof RelationProblem)) throw error;
      if (error.result.kind === "unresolved") c.unresolved(owner, error.result.rule, error.message);
      c.fail(owner, error.result.rule, error.message);
    }
  };
  const builtin = (reference: Extract<Reference, {kind: "builtin"}>, owner: GraphNode): Description => {
    const name = reference.name.local;
    if (reference.name.namespace !== XSD_NAMESPACE || !isBuiltinType(name)) c.fail(owner, "src-resolve", "Builtin type requires the XSD namespace");
    if (excluded.has(name) && !options.schemaOperandsOnly) c.unsupported(owner, `datatype:${name}`, "Document identity, DTD-dependent and NOTATION datatypes are excluded");
    if (name === "anyType") c.fail(owner, "src-simple-type", "A scalar declaration cannot use complex anyType");
    const key = `builtin:${name}`, existing = descriptions.get(key); if (existing) return existing;
    const intrinsic = schemaBuiltinFacetProperties(name, owner, c);
    if (["NMTOKENS", "IDREFS", "ENTITIES"].includes(name)) {
      const item: Reference = {kind: "builtin", name: {namespace: XSD_NAMESPACE, local: builtinListItem(name)!}};
      const itemDescription = builtin(item, owner);
      c.step(owner,14+(itemDescription.typeDependencies?.length??0));
      const result: Description = {definition: key, intrinsic, typeDependencies:[{contextId:c.context.contextId,type:{kind:'builtin',name:reference.name}},...(itemDescription.typeDependencies??[])],plan: {id: key, reference, variety: "list", builtin: name, item, layers: [], whitespace: "collapse", enforcement: ["lexical-space", "whitespace", "list", "length"], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, item: itemDescription, facets: new Map()};
      descriptions.set(key, result); return result;
    }
    const primitive = builtinPrimitive(name);
    c.step(owner,14);
    const result: Description = {definition: key, intrinsic, typeDependencies:[{contextId:c.context.contextId,type:{kind:'builtin',name:reference.name}}],plan: {id: key, reference, variety: "atomic", primitive, builtin: name, layers: [], whitespace: whitespaceFor(name), enforcement: ["lexical-space", "whitespace", ...(primitive === "QName" ? ["QName-context" as const] : []), ...(integerBounds[name] ? ["numeric-bounds" as const] : []), ...(builtinParents[name] && primitive === "decimal" ? ["numeric-precision" as const] : [])], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, facets: new Map()};
    descriptions.set(key, result); return result;
  };
  const descriptionReference = (value: Description, owner: GraphNode): Reference => {
    c.text(value.definition, owner); c.step(owner, 4);
    if (value.definition.startsWith('builtin:')) return {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: value.definition.slice(8)}};
    return value.definition.startsWith('content:') ? {kind:'original-generated', owner:value.definition.slice(8)} : {kind: 'local', target: value.definition};
  };
  const descriptionFinal = (value: Description, owner: GraphNode): readonly string[] => {
    c.text(value.definition, owner);
    // GSC1 assigns the generated scalar its own empty final; a complex
    // container's final is a different property with a different authority.
    if (value.definition.startsWith('content:') || value.definition.startsWith('builtin:')) return [];
    try {return declarationMethods(c.context, c.get(value.definition), 'final');}
    catch (error) {
      if (!(error instanceof RelationProblem)) throw error;
      if (error.result.kind === 'unresolved') return c.unresolved(owner, error.result.rule, error.message);
      return c.fail(owner, error.result.rule, error.message);
    }
  };
  const checkStartingFinal = (value: Description, owner: GraphNode): void => {
    if (descriptionFinal(value, owner).includes('restriction')) c.fail(owner, 'cos-st-restricts', 'The exact starting scalar prohibits restriction');
  };
  const operands = new WeakMap<Description, WeakMap<LexicalValue, SchemaOperand>>();
  type OperandRequest = {description: Description; lexical: LexicalValue; owner: GraphNode};
  function* operandStep({description, lexical, owner}: OperandRequest): Generator<OperandRequest, SchemaOperand, SchemaOperand> {
    const cache = operands.get(description), cached = cache?.get(lexical); if (cached) return cached;
    c.text(lexical.value, owner);
    const whitespace = description.plan.whitespace === "member" ? "preserve" : description.plan.whitespace;
    const normalized = normalizeWhitespace(lexical.value, whitespace);
    let result: SchemaOperand;
    if (description.plan.variety === "atomic") result = {...values.atomic(description.rawProperties ? description.plan.primitive! : description.plan.builtin ?? description.plan.primitive!, lexical, owner, whitespace), normalized};
    else if (description.plan.variety === "list") {
      const items: SchemaOperand[] = [], tokens = values.listTokens(lexical, owner);
      c.step(owner, tokens.tokens.length);
      for (const token of tokens.tokens) {
        c.step(owner); const item = yield {description: description.item!, lexical: {...lexical, value: token}, owner};
        items.push(item);
      }
      result = values.listOperand(tokens, items, owner, description.plan.builtin);
    } else {
      c.step(owner, description.members!.length * 4);
      const chosen = yield* sequences.chooseUnionMember(description.members!.map(member => ({description: member, lexical, owner})), owner);
      if (!chosen) return c.fail(owner, "cvc-datatype-valid", "Schema union operand matches no declared member", lexical.context.source);
      c.step(owner, (chosen.value.selectedMembers?.length ?? 0) + 2);
      result = {...chosen.value, selectedMembers: [chosen.request.description.plan.reference, ...(chosen.value.selectedMembers ?? [])]};
    }
    for (const layer of description.plan.layers) {
      c.step(owner);
      if (layer.patterns.length) {
        let accepted = false;
        for (const pattern of layer.patterns) {if (patternOwner(pattern).acceptsOperand(pattern, result.normalized!, owner)) {accepted = true; break;}}
        if (!accepted) c.fail(owner, "cvc-pattern-valid", "Schema operand violates its inherited pattern layer", lexical.context.source);
      }
      const enumeration: SchemaOperand[] = [];
      for (const facet of layer.facets) {
        c.step(owner);
        if (facet.name === "enumeration") {
          // Values were checked against the base before the layer was installed.
          const value = enumerations.get(layer)!.get(facet); if (value) enumeration.push(value);
        }
      }
      if (enumeration.length && !enumeration.some(e => values.sameValue(e, result, owner))) c.fail(owner, "cvc-enumeration-valid", "Schema operand is outside the inherited enumeration", lexical.context.source);
    }
    const failedFacet = valueFacetFailure(description, result, owner, lexical.context.source);
    if (failedFacet) c.fail(owner, failedFacet, "Schema operand violates a value facet", lexical.context.source);
    for (const conjunct of description.conjuncts ?? []) {c.step(owner); yield {description: conjunct, lexical, owner};}
    c.step(owner); const updated = cache ?? new WeakMap(); updated.set(lexical, result); operands.set(description, updated); return result;
  }
  /** One value predicate for ordinary cvc assessment and finite typed exclusion. */
  const valueFacetFailure = (description: Description, result: SchemaOperand, owner: GraphNode, source?: SyntaxSource): string | undefined => {
    for (const name of facetNames(description, owner)) {
      c.step(owner); const constraint = facetProperty(description, name, owner)!;
      if (lengthNames.includes(name)) {
        if (description.plan.primitive === "QName" || description.plan.primitive === "NOTATION") continue; // XSD 1.0 cvc-length-valid: any value is facet-valid.
        if (result.length === undefined) c.fail(owner, "facet-applicability", "Length constraint has no datatype unit", source);
        const order = c.algebra.compare(result.length!, constraint.integer!);
        if (name === "length" && order !== 0 || name === "minLength" && order < 0 || name === "maxLength" && order > 0) return `cvc-${name}-valid`;
      } else if (boundNames.includes(name)) {
        const order = values.compare(result, constraint.operand!, owner);
        const violates = order === undefined || (lower(name) ? exclusive(name) ? order <= 0 : order < 0 : exclusive(name) ? order >= 0 : order > 0);
        if (violates) return `cvc-${name}-valid`;
      } else if (name === "totalDigits" || name === "fractionDigits") {
        const decimal = result.decimal;
        if (!decimal) c.fail(owner, "facet-applicability", "Precision facet requires exact decimal values", source);
        c.step(owner, decimal!.digits ?? 20);
        const digits = (decimal!.coefficient < 0n ? -decimal!.coefficient : decimal!.coefficient).toString().length.toString();
        if (c.algebra.compare(name === "totalDigits" ? digits : decimal!.scale.toString(), constraint.integer!) > 0 || name === "totalDigits" && c.algebra.compare(decimal!.scale.toString(), constraint.integer!) > 0) return `cvc-${name}-valid`;
      }
    }
    return undefined;
  };
  const operand = (description: Description, lexical: LexicalValue, owner: GraphNode): SchemaOperand => {
    type Frame = {request: OperandRequest; iterator: Generator<OperandRequest, SchemaOperand, SchemaOperand>; reply?: SchemaOperand; error?: unknown};
    const request = {description, lexical, owner}, stack: Frame[] = [{request, iterator: operandStep(request)}];
    while (stack.length) {
      const frame = stack.at(-1)!; c.step(frame.request.owner);
      try {
        const next = frame.error === undefined ? frame.iterator.next(frame.reply!) : frame.iterator.throw(frame.error);
        frame.error = undefined;
        if (next.done) {stack.pop(); if (!stack.length) return next.value; stack.at(-1)!.reply = next.value;}
        else {c.step(next.value.owner); stack.push({request: next.value, iterator: operandStep(next.value)});}
      } catch (error) {stack.pop(); if (!stack.length) throw error; stack.at(-1)!.error = error;}
    }
    return c.fail(owner, "cvc-datatype-valid", "Schema operand evaluation has no result");
  };
  // Inherited layers retain values assessed by their own base. A shared raw
  // facet object is syntax identity, not a datatype or evaluation-context key.
  const enumerations = new WeakMap<ScalarConstraintLayer, ReadonlyMap<Facet, SchemaOperand>>();
  const facetDependencies = new Map<Facet,readonly SemanticTypeDependency[]>();
  const facetObligations = new Map<Facet, readonly ScalarObligation[]>();
  const excludedByValueFacets = (base: Description, value: SchemaOperand, owner: GraphNode): boolean => {
    // A single union member's negative never proves the union negative.
    if (base.plan.variety === 'union' || (base.plan.variety === 'list' ? value.family !== 'list' : value.family !== base.plan.primitive)) return false;
    c.step(owner); const pending = [base];
    while (pending.length) {
      c.step(owner); const current = pending.pop()!;
      if (valueFacetFailure(current, value, owner)) return true;
      c.step(owner, current.conjuncts?.length ?? 0);
      for (const conjunct of current.conjuncts ?? []) pending.push(conjunct);
    }
    return false;
  };
  const membershipWitness = (base: Description, expected: SchemaOperand, lexical: LexicalValue, owner: GraphNode): boolean => {
    c.step(owner);
    const accepts = (candidate: LexicalValue): boolean => {
      try {return values.sameValue(expected, operand(base, candidate, owner), owner);}
      catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error;}
      return false;
    };
    for (const candidate of schemaScalarWitnesses(expected, lexical, owner, c)) if (accepts(candidate)) return true;
    c.step(owner); const outside: SchemaPattern[] = [];
    for (const layer of base.plan.layers) for (const pattern of layer.patterns) {
      c.step(owner); const language = patternOwner(pattern).literalLanguage(pattern, owner);
      if (language.kind === 'outside-fragment') {c.step(owner, 2); outside.push(pattern); continue;}
      for (const value of language.words) {
        c.step(owner, 3);
        if (accepts({...lexical, value})) return true;
      }
    }
    // An exact finite word may already establish membership. Only then spend
    // the shared allowance on incomplete proposals for outside fragments.
    for (const pattern of outside) {
      c.step(owner);
      for (const value of patternOwner(pattern).positiveWords(pattern, owner, lexical.value)) {
        c.step(owner, 3);
        if (accepts({...lexical, value})) return true;
      }
    }
    return false;
  };
  /** One complete enumeration component can conclusively exclude a value. */
  const excludedByEnumeration = (description: Description, value: SchemaOperand, owner: GraphNode): boolean => {
    for (const group of description.plan.layers) {
      c.step(owner); let present = false, member = false;
      for (const facet of group.facets) {
        c.step(owner); if (facet.name !== "enumeration") continue;
        present = true;
        if (values.sameValue(enumerations.get(group)!.get(facet)!, value, owner)) member = true;
      }
      if (present && !member) return true;
    }
    return false;
  };
  const facetOperand = (facet: Facet, base: Description, owner: GraphNode): SchemaOperand => {
    const supplied = facet.operand, bound = boundFacetValues.get(facet);
    let value: SchemaOperand;
    if (bound) value = bound;
    else if (!supplied) return operand(base, facet.lexical, owner);
    else if (supplied!.context === "original") {
      if (!options.originalFacet) return c.unresolved(owner, "original-facet-context", "Original typed facet requires the authenticated original context");
      const result = options.originalFacet(supplied!.type, facet.lexical, supplied!.owner); value = result.operand;
      c.step(owner, result.obligations.length + 1); facetObligations.set(facet, result.obligations);facetDependencies.set(facet,result.typeDependencies);
    } else {
      const originalOwner = c.get(supplied!.owner), type = ensure(supplied!.type, originalOwner);
      value = operand(type, facet.lexical, originalOwner);
      c.step(owner, (type.plan.obligations?.length ?? 0) + 1); facetObligations.set(facet, type.plan.obligations ?? []);facetDependencies.set(facet,type.typeDependencies??[]);
    }
    // Valid component unions contain atomic/list members and list items are
    // atomic or unions of atomics, so this shape recursion has bounded depth.
    const alternatives = (description: Description, assessed: SchemaOperand): boolean => {
      c.step(owner);
      if (description.plan.variety === "atomic") return assessed.family === description.plan.primitive;
      if (description.plan.variety === "list") {
        if (assessed.family !== "list" || !assessed.items) return false;
        c.step(owner, assessed.items.length + 1); return assessed.items.every(item => alternatives(description.item!, item));
      }
      // Component unions contain atomic/list members after source mapping.
      return description.members!.some(member => alternatives(member, assessed));
    };
    if (!alternatives(base, value)) return c.fail(owner, "facet-value-type", "Typed facet operand belongs to a different primitive or variety", facet.lexical.context.source);
    return value;
  };
  const allowFacet = (description: Description, facet: Facet, owner: GraphNode) => {
    const variety = description.plan.variety, primitive = description.plan.primitive;
    let allowed = ["pattern", "enumeration"];
    if (variety === "list") allowed = [...allowed, "whiteSpace", ...lengthNames];
    else if (variety === "atomic") {
      allowed.push("whiteSpace");
      if (["string", "anyURI", "QName", "NOTATION", "hexBinary", "base64Binary", "anySimpleType"].includes(primitive!)) allowed.push(...lengthNames);
      if (["decimal", "float", "double", "duration", "dateTime", "date", "time", "gYearMonth", "gYear", "gMonthDay", "gDay", "gMonth"].includes(primitive!)) allowed.push(...boundNames);
      if (primitive === "decimal") allowed.push("totalDigits", "fractionDigits");
    }
    if (!allowed.includes(facet.name)) c.fail(owner, "facet-applicability", "Facet is not permitted on this datatype variety", facet.lexical.context.source);
  };
  const lengthProperty = (description: Description, name: string): string | undefined =>
    description.facets.get(name)?.integer ?? description.intrinsic?.scalars.find(facet => facet.name === name && facet.kind === 'integer')?.value;
  /** Known builtin component facts, never fabricated source/caller facets. */
  const facetProperty = (description: Description, name: string, owner: GraphNode): FacetProperty | undefined => {
    c.step(owner, 4); const explicit = description.facets.get(name);
    if (explicit) return {fixed: explicit.facet.fixed, integer: explicit.integer, operand: explicit.operand, lexical: explicit.facet.lexical.value};
    c.step(owner, description.intrinsic?.scalars.length ?? 0);
    const intrinsic = description.intrinsic?.scalars.find(facet => facet.name === name);
    if (!intrinsic) return undefined;
    if (intrinsic.kind === 'integer') return {fixed: intrinsic.fixed, integer: intrinsic.value};
    if (intrinsic.kind === 'bound') return {fixed: intrinsic.fixed, operand: {family: 'decimal', canonical: intrinsic.value, decimal: values.decimal(intrinsic.value, owner)}};
    return {fixed: intrinsic.fixed, lexical: intrinsic.value};
  };
  const sameFacetProperty = (left: FacetProperty, right: FacetProperty, owner: GraphNode): boolean => {
    c.step(owner);
    if (left.integer !== undefined) c.text(left.integer, owner);
    if (right.integer !== undefined) c.text(right.integer, owner);
    if (left.fixed !== right.fixed || left.integer !== right.integer) return false;
    if (left.integer !== undefined) return true;
    if (left.operand || right.operand) return !!left.operand && !!right.operand && values.sameValue(left.operand, right.operand, owner);
    c.text(left.lexical!, owner); c.text(right.lexical!, owner);
    return normalizeWhitespace(left.lexical!, 'collapse') === normalizeWhitespace(right.lexical!, 'collapse');
  };
  const facetNames = (description: Description, owner: GraphNode): readonly string[] => {
    c.step(owner, description.facets.size * 2 + (description.intrinsic?.scalars.length ?? 0) * 2 + 2);
    return [...new Set([...description.facets.keys(), ...(description.intrinsic?.scalars.map(facet => facet.name) ?? [])])];
  };
  const patternProperties = (description: Description, owner: GraphNode): PatternProperty[] => {
    c.step(owner, (description.intrinsic?.patterns.length ?? 0) * 2 + description.plan.layers.length + 2);
    const result: PatternProperty[] = (description.intrinsic?.patterns ?? []).map(expression => ({expressions: [expression]}));
    for (const group of description.plan.layers) {
      c.step(owner, group.facets.length * 2 + 2);
      const expressions = group.facets.filter(facet => facet.name === 'pattern').map(facet => facet.lexical.value);
      if (expressions.length) result.push({expressions, identity: layerIdentities.get(group) ?? group});
    }
    return result;
  };
  const samePatternProperty = (a: PatternProperty, b: PatternProperty, owner: GraphNode): boolean => {
    c.step(owner);
    if (a.expressions.length !== 1 || b.expressions.length !== 1) return a.identity !== undefined && a.identity === b.identity;
    c.text(a.expressions[0], owner); c.text(b.expressions[0], owner);
    return a.expressions[0] === b.expressions[0];
  };
  const checkLengthProperties = (description: Description, owner: GraphNode, checkAncestry = true): void => {
    c.step(owner, 4);
    const length = lengthProperty(description, "length"), min = lengthProperty(description, "minLength"), max = lengthProperty(description, "maxLength");
    if (min !== undefined && max !== undefined && c.algebra.compare(min, max) > 0
      || length !== undefined && min !== undefined && c.algebra.compare(length, min) < 0
      || length !== undefined && max !== undefined && c.algebra.compare(length, max) > 0) c.fail(owner, "length-minLength-maxLength", "Length facet constraints are inconsistent");
    if (!checkAncestry || length === undefined) return;
    for (const name of ["minLength", "maxLength"]) {
      c.step(owner, 2); const bound = lengthProperty(description, name);
      if (bound === undefined) continue;
      let ancestor = description.parent, witnessed = false;
      while (ancestor) {
        c.step(owner, 3); const inherited = lengthProperty(ancestor, name);
        if (lengthProperty(ancestor, "length") === undefined && inherited !== undefined && c.algebra.compare(inherited, bound) === 0) {witnessed = true; break;}
        ancestor = ancestor.parent;
      }
      if (!witnessed) c.fail(owner, "length-minLength-maxLength", "Coexisting length and minimum/maximum require a proper restriction ancestor with the same bound and no length");
    }
  };
  const layer = (base: Description, reference: Reference, owner: GraphNode, facets: readonly Facet[], sourceRules = true): Description => {
    if (base.plan.builtin === "anySimpleType") c.fail(owner, "cos-st-restricts", "The simple ur-type has absent variety and is not an atomic restriction base");
    c.step(owner, base.plan.layers.length + base.facets.size + base.plan.enforcement.length);
    const result: Description = {definition: owner.kind === "complexType" ? `content:${owner.id}` : owner.id, parent: base, intrinsic: base.intrinsic, rawProperties: base.rawProperties, plan: {...base.plan, id: owner.id, reference}, item: base.item, members: base.members, facets: new Map(base.facets)};
    const seen = new Set<string>(), compiled: SchemaPattern[] = [], requirements = new Set(base.plan.enforcement);
    c.step(owner);
    const locals = new Map<string, {facet: Facet; operand?: SchemaOperand; integer?: string}>(), localEnumerations = new Map<Facet, SchemaOperand>();
    const original = sourceRules ? c.context.sourceNode(owner.id) : undefined;
    const originalFacets = original?.kind === 'simpleType' && original.variety.kind === 'restriction' ? original.variety.facets
      : original?.kind === 'complexType' ? original.derivation?.facets ?? [] : [];
    for (const facet of facets) {
      c.step(owner); c.text(facet.lexical.value, owner); allowFacet(base, facet, owner);
      c.step(owner, originalFacets.length + 1);
      const sourceFacet = originalFacets.find(item => item === facet);
      if (sourceFacet) {
        c.step(owner, sourceFacet.syntax.children.length + 2);
        const annotationNode = sourceFacet.syntax.children.find(child => {
          if (child.kind !== 'element') return false;
          c.step(owner, child.name.namespace.length + child.name.local.length + 1);
          return child.name.namespace === XSD_NAMESPACE && child.name.local === 'annotation';
        });
        sourceFacetAnnotations.set(facet, annotationNode ? 'present' : 'absent');
        sourceFacetPayloads.set(facet, annotationNode?.kind === 'element'
          ? projectFacetAnnotation(annotationNode, c.budget) : 'absent');
      }
      if (facet.fixed && ["enumeration", "pattern"].includes(facet.name)) c.fail(owner, "facet-fixed-property", "Pattern and enumeration have no fixed property", facet.lexical.context.source);
      if (seen.has(facet.name) && !["enumeration", "pattern"].includes(facet.name)) c.fail(owner, "src-single-facet-value", "Nonrepeatable facet is declared more than once", facet.lexical.context.source);
      seen.add(facet.name);
      if (facet.name === "pattern") {const engine=intrinsicFacets.has(facet)?intrinsicPatterns:patterns;const pattern=engine.compile(facet.lexical,owner);if(engine===intrinsicPatterns)intrinsicCompiled.add(pattern);compiled.push(pattern); requirements.add("pattern"); continue;}
      if (facet.name === "enumeration") {localEnumerations.set(facet, facetOperand(facet, base, owner)); requirements.add("enumeration"); continue;}
      if (facet.name === "whiteSpace") {
        const mode = normalizeWhitespace(facet.lexical.value, "collapse"), rank = {preserve: 0, replace: 1, collapse: 2};
        if (base.plan.whitespace === "member" || !(mode in rank) || rank[mode as keyof typeof rank] < rank[base.plan.whitespace]) c.fail(owner, "whiteSpace-valid-restriction", "Whitespace facet cannot weaken normalization", facet.lexical.context.source);
        result.plan = {...result.plan, whitespace: mode as keyof typeof rank}; requirements.add("whitespace"); locals.set(facet.name, {facet});
      } else if (integerFacets.has(facet.name)) {
        const raw = normalizeWhitespace(facet.lexical.value, "collapse");
        if (!/^[+-]?[0-9]+$/.test(raw)) c.fail(owner, "facet-value", "Facet requires a nonnegative integer", facet.lexical.context.source);
        const integer = raw.replace(/^[+-]/, "").replace(/^0+(?=\d)/, "");
        if (raw.startsWith("-") && integer !== "0") c.fail(owner, "facet-value", "Facet requires a nonnegative integer", facet.lexical.context.source);
        if (facet.name === "totalDigits" && integer === "0") c.fail(owner, "totalDigits-valid-restriction", "totalDigits must be positive", facet.lexical.context.source);
        const prior = facetProperty(base, facet.name, owner)?.integer;
        if (prior !== undefined) {
          const order = c.algebra.compare(integer, prior);
          if (facet.name === "length" && order !== 0 || facet.name === "minLength" && order < 0 || !["length", "minLength"].includes(facet.name) && order > 0) c.fail(owner, `${facet.name}-valid-restriction`, "Facet weakens the inherited constraint", facet.lexical.context.source);
        }
        locals.set(facet.name, {facet, integer}); requirements.add(lengthNames.includes(facet.name) ? "length" : "numeric-precision");
      } else if (boundNames.includes(facet.name)) {
        // rf-min/maxInclusive require the base's value space, including its
        // enum/pattern/precision layers. The exclusive facets alone admit
        // equality with the corresponding inherited exclusive endpoint.
        let value: SchemaOperand;
        try {value = facetOperand(facet, base, owner);}
        catch (error) {
          const inherited = facetProperty(base, facet.name, owner)?.operand;
          if (!(error instanceof SchemaAssessmentError) || error.category !== "invalid-schema" || !exclusive(facet.name) || !inherited) throw error;
          const primitive = {...base, facets: new Map<string, {facet: Facet}>(), plan: {...base.plan, layers: []}};
          value = facetOperand(facet, primitive, owner);
          if (!values.sameValue(value, inherited, owner)) throw error;
        }
        locals.set(facet.name, {facet, operand: value}); requirements.add("numeric-bounds");
      }
      const inherited = facetProperty(base, facet.name, owner);
      if (inherited?.fixed) {
        const local = locals.get(facet.name)!;
        if (local.integer !== undefined) c.text(local.integer, owner);
        if (inherited.integer !== undefined) c.text(inherited.integer, owner);
        if (inherited.lexical !== undefined) c.text(inherited.lexical, owner);
        if (local.integer !== inherited.integer || local.operand && inherited.operand && !values.sameValue(local.operand, inherited.operand, owner) || facet.name === "whiteSpace" && normalizeWhitespace(facet.lexical.value, "collapse") !== normalizeWhitespace(inherited.lexical!, "collapse")) c.fail(owner, "facet-fixed", "A fixed facet cannot change value", facet.lexical.context.source);
      }
    }
    for (const [name, constraint] of locals) {
      c.step(owner); result.facets.set(name, constraint);
      if (boundNames.includes(name)) {
        const sameSide = lower(name) ? "min" : "max";
        for (const priorName of boundNames) {
          const prior = facetProperty(base, priorName, owner); if (!prior?.operand) continue;
          const order = values.compare(constraint.operand!, prior.operand, owner);
          if (order === undefined) c.fail(owner, "facet-bound-order", "Facet bounds are not ordered in the datatype value space", constraint.facet.lexical.context.source);
          if (priorName.startsWith(sameSide)) {
            if (lower(name) ? order! < 0 || order === 0 && !exclusive(name) && exclusive(priorName) : order! > 0 || order === 0 && !exclusive(name) && exclusive(priorName)) c.fail(owner, `${name}-valid-restriction`, "Facet widens an inherited bound", constraint.facet.lexical.context.source);
          } else if (lower(name) ? order! > 0 || order === 0 && exclusive(priorName) : order! < 0 || order === 0 && (exclusive(name) || exclusive(priorName))) {
            c.fail(owner, `${name}-valid-restriction`, "Facet crosses an inherited opposite endpoint", constraint.facet.lexical.context.source);
          }
        }
      }
    }
    // Raw groups are only conjuncts until their complete property view is
    // assembled. Source restrictions already have their proper ancestry.
    checkLengthProperties(result, owner, sourceRules);
    if (sourceRules && (locals.has("minInclusive") && locals.has("minExclusive") || locals.has("maxInclusive") && locals.has("maxExclusive"))) c.fail(owner, "facet-bound-pair", "Inclusive and exclusive bounds cannot coexist on one side");
    const lowers = boundNames.filter(n => lower(n) && facetProperty(result, n, owner)), uppers = boundNames.filter(n => !lower(n) && facetProperty(result, n, owner));
    for (const a of lowers) for (const b of uppers) {
      c.step(owner); const order = values.compare(facetProperty(result, a, owner)!.operand!, facetProperty(result, b, owner)!.operand!, owner);
      if (order !== undefined && (order > 0 || order === 0 && exclusive(a) !== exclusive(b))) c.fail(owner, "facet-bound-order", "Lower and upper facet constraints are inconsistent");
    }
    if (sourceRules && base.plan.primitive === "NOTATION" && !facets.some(f => f.name === "enumeration") && !base.plan.layers.some(l => l.facets.some(f => f.name === "enumeration"))) c.fail(owner, "enumeration-required-notation", "A NOTATION-derived datatype requires an enumeration facet");
    const total = facetProperty(result, 'totalDigits', owner)?.integer, fraction = facetProperty(result, 'fractionDigits', owner)?.integer;
    if (total && fraction && c.algebra.compare(fraction, total) > 0) c.fail(owner, "fractionDigits-totalDigits", "fractionDigits cannot exceed totalDigits");
    c.step(owner, facets.length + compiled.length + requirements.size + base.plan.layers.length + 2);
    const installed: ScalarConstraintLayer = {owner: owner.id, facets, patterns: compiled};
    enumerations.set(installed, localEnumerations);
    result.plan = {...result.plan, layers: [...base.plan.layers, installed], enforcement: [...requirements]};
    return result;
  };
  /** Sufficient exact property correspondence; no regex-language inclusion is assumed. */
  const rawFacetCorrespondence = (base: Description, result: Description, reference: Reference, owner: GraphNode): boolean => {
    type Constraint = Description['facets'] extends Map<string, infer T> ? T : never;
    const effective = new Map<string, Constraint>(); let complete = true, reductionDeterminate = true;
    const equal = (a: Constraint, b: Constraint): boolean => {
      if (a.integer !== undefined) {
        c.text(a.integer, owner); if (b.integer !== undefined) c.text(b.integer, owner);
        return a.integer === b.integer;
      }
      if (a.operand && b.operand) return values.sameValue(a.operand, b.operand, owner);
      c.text(a.facet.lexical.value, owner); c.text(b.facet.lexical.value, owner);
      return normalizeWhitespace(a.facet.lexical.value, "collapse") === normalizeWhitespace(b.facet.lexical.value, "collapse");
    };
    for (const conjunct of result.conjuncts ?? []) for (const [name, constraint] of conjunct.facets) {
      c.step(owner, 8); const prior = effective.get(name);
      if (!prior) {effective.set(name, constraint); continue;}
      if (equal(prior, constraint)) {
        if (prior.facet.fixed !== constraint.facet.fixed) complete = false;
        if (constraint.facet.fixed) effective.set(name, constraint);
        continue;
      }
      // The abstract representation normalizes comparable nonfixed scalar
      // conjuncts. Conflicting fixed metadata is retained as an obligation.
      if (prior.facet.fixed || constraint.facet.fixed) complete = false;
      let choose = false;
      if (name === "length") c.fail(owner, "length-conjunction", "Complete length constraints are inconsistent");
      else if (constraint.integer && prior.integer) {
        const order = c.algebra.compare(constraint.integer, prior.integer); choose = name === "minLength" ? order > 0 : order < 0;
      } else if (constraint.operand && prior.operand) {
        const order = values.compare(constraint.operand, prior.operand, owner);
        if (order === undefined) {complete = false; reductionDeterminate = false; continue;}
        choose = lower(name) ? order > 0 : order < 0;
      } else if (name === "whiteSpace") {
        const rank: Record<string, number> = {preserve: 0, replace: 1, collapse: 2};
        choose = rank[normalizeWhitespace(constraint.facet.lexical.value, "collapse")] > rank[normalizeWhitespace(prior.facet.lexical.value, "collapse")];
      }
      if (choose) effective.set(name, constraint);
    }
    for (const side of ["min", "max"]) {
      const inclusive = effective.get(side + "Inclusive"), exclusiveValue = effective.get(side + "Exclusive");
      if (!inclusive || !exclusiveValue) continue;
      if (inclusive.facet.fixed || exclusiveValue.facet.fixed) complete = false;
      const order = values.compare(inclusive.operand!, exclusiveValue.operand!, owner);
      if (order === undefined) {complete = false; reductionDeterminate = false; continue;}
      const keepInclusive = side === "min" ? order > 0 : order < 0;
      effective.delete(side + (keepInclusive ? "Exclusive" : "Inclusive"));
    }
    c.step(owner, effective.size + 3);
    const facets: Facet[] = [], preserved = new Set<string>();
    for (const [name, constraint] of effective) {
      c.step(owner, 8); const inherited = facetProperty(base, name, owner);
      const supplied = {fixed: constraint.facet.fixed, integer: constraint.integer,
        operand: constraint.operand, lexical: constraint.facet.lexical.value};
      // Derive the local S from the complete property view: an exact inherited
      // tuple can remain in B, without being redeclared in S. In particular,
      // a preserved bound need not belong to B's later narrowed enumeration.
      if (inherited && sameFacetProperty(inherited, supplied, owner)) preserved.add(name);
      else facets.push(constraint.facet);
    }
    // This checks exact bounds, length, precision, whitespace and fixed values
    // against the base; it does not inject hidden constraints into assessment.
    if (reductionDeterminate) layer(base, reference, owner, facets, false);
    for (const [name, constraint] of effective) {
      c.step(owner);
      if (preserved.has(name) || !boundNames.includes(name) || !constraint.facet.operand || !constraint.operand) continue;
      // A privately assessed typed value establishes its original datatype,
      // not membership in this restriction's base value space. Exclusive
      // bounds alone may repeat their same-kind inherited endpoint.
      const inherited = facetProperty(base, name, owner)?.operand;
      if (exclusive(name) && inherited && values.sameValue(constraint.operand, inherited, owner)) continue;
      if (excludedByEnumeration(base, constraint.operand, owner) || excludedByValueFacets(base, constraint.operand, owner)) c.fail(owner, `${name}-value`, "Bound value is outside the base value space", constraint.facet.lexical.context.source);
      if (!membershipWitness(base, constraint.operand, constraint.facet.lexical, owner)) complete = false;
    }
    result.facets = effective;
    checkLengthProperties(result, owner);
    const inheritedNames = facetNames(base, owner);
    const inheritedPatterns = patternProperties(base, owner), suppliedPatterns = patternProperties(result, owner);
    // Presence comes from the supplied component inventory, before scalar
    // reduction. A qualified reduction can hide a supplied kind in the map;
    // that is missing correspondence evidence, not an omitted component.
    c.step(owner, 2); const suppliedKinds = new Set<string>();
    for (const group of result.plan.layers) for (const facet of group.facets) {
      c.step(owner, 2); suppliedKinds.add(facet.name);
    }
    for (const facet of result.intrinsic?.scalars ?? []) {c.step(owner, 2); suppliedKinds.add(facet.name);}
    if (result.intrinsic?.patterns.length) {c.step(owner, 2); suppliedKinds.add('pattern');}
    const hasEnumeration = (description: Description): boolean => {
      for (const group of description.plan.layers) {
        c.step(owner, group.facets.length + 1);
        if (group.facets.some(facet => facet.name === 'enumeration')) return true;
      }
      return false;
    };
    const omitted = (name: string): void => {
      c.step(owner);
      // c-fr's union/replacement cannot remove a known kind without leaving
      // that kind in the complete result. The reviewed nonfixed bound normal
      // form is handled before calling this predicate.
      if (!base.plan.obligations?.length && !suppliedKinds.has(name)) c.fail(owner, 'st-restrict-facets', 'Complete facet properties omit an inherited component kind');
      complete = false;
    };
    // Compare the supplied view with the exact source/builtin properties;
    // retained builtin execution is never evidence that a tuple was supplied.
    for (const name of inheritedNames) {
      c.step(owner); const inherited = facetProperty(base, name, owner)!;
      const represented = facetProperty(result, name, owner) !== undefined || !inherited.fixed && (
        name.startsWith("min") && boundNames.includes(name) && (effective.has("minInclusive") || effective.has("minExclusive"))
        || name.startsWith("max") && boundNames.includes(name) && (effective.has("maxInclusive") || effective.has("maxExclusive")));
      if (!represented) omitted(name);
    }
    if (inheritedPatterns.length && !suppliedKinds.has('pattern')) omitted('pattern');
    if (hasEnumeration(base) && !suppliedKinds.has('enumeration')) omitted('enumeration');
    const groupEqual = (a: ScalarConstraintLayer, b: ScalarConstraintLayer, name: string): boolean => {
      c.step(owner, a.facets.length + b.facets.length + 1);
      const left = a.facets.filter(facet => facet.name === name), right = b.facets.filter(facet => facet.name === name);
      if (!left.length || !right.length) return false;
      // A singleton maps directly to one expression string. Multi-pattern
      // source mapping has no established exact expression spelling here;
      // only the same privately issued component layer proves identity.
      if (name === "pattern" && (left.length !== 1 || right.length !== 1)) return (layerIdentities.get(a) ?? a) === (layerIdentities.get(b) ?? b);
      const same = (x: Facet, y: Facet): boolean => {
        c.step(owner);
        if (name === "pattern") {c.text(x.lexical.value, owner); c.text(y.lexical.value, owner); return x.lexical.value === y.lexical.value;}
        const xValue = enumerations.get(a)!.get(x)!, yValue = enumerations.get(b)!.get(y)!;
        return values.sameValue(xValue, yValue, owner);
      };
      return left.every(x => right.some(y => same(x, y))) && right.every(y => left.some(x => same(x, y)));
    };
    for (const prior of inheritedPatterns) {
      c.step(owner);
      if (!suppliedKinds.has('pattern')) continue;
      if (suppliedPatterns.some(group => samePatternProperty(prior, group, owner))) continue;
      if (prior.expressions.length === 1 && suppliedPatterns.every(group => group.expressions.length === 1)) c.fail(owner, 'st-restrict-facets', 'Complete raw facet properties omit an inherited pattern expression');
      complete = false;
    }
    for (const prior of base.plan.layers) for (const name of ["enumeration"]) {
      c.step(owner, prior.facets.length + 1);
      if (!suppliedKinds.has(name)) continue;
      if (prior.facets.some(facet => facet.name === name) && !result.plan.layers.some(group => groupEqual(prior, group, name))) {
        if (name === "enumeration") c.fail(owner, "st-restrict-facets", "Complete raw facet properties omit an inherited enumeration component");
      }
    }
    for (const group of result.plan.layers) {
      c.step(owner, group.facets.length + 1);
      if (base.plan.layers.some(prior => groupEqual(prior, group, "enumeration"))) continue;
      for (const facet of group.facets) if (facet.name === "enumeration") {
        const expected = enumerations.get(group)!.get(facet)!;
        if (excludedByEnumeration(base, expected, owner) || excludedByValueFacets(base, expected, owner)) c.fail(owner, "enumeration-valid-restriction", "Enumeration component contains a value outside the base value space", facet.lexical.context.source);
        // Every candidate is assessed by the exact base, retaining ordered
        // union selection and namespace context. Failed finite search is not
        // a complete negative membership answer.
        if (!membershipWitness(base, expected, facet.lexical, owner)) complete = false;
      }
    }
    return complete;
  };
  /** Selection/role checks concern the supplied operand request, separately
   * from forming the selected original datatype's own component properties. */
  const scalarOperandNode = (reference: Reference, owner: GraphNode, explicitOperand = false): GraphNode | undefined => {
    if (reference.kind === 'original-generated') {referenceKey(reference, owner); return undefined;}
    if (reference.kind === "builtin") {builtin(reference, owner); return undefined;}
    const node = c.get(c.target(reference, owner)!); c.step(node);
    if (c.context.originalSourceComponentAbsent(node.id))
      return c.fail(owner, 'src-simple-type', 'Source-only projection cannot provide a scalar operand');
    if (node.kind === 'simpleType') return node;
    if (node.kind !== 'complexType') return c.fail(owner, 'src-simple-type', 'Reference requires a scalar type');
    const raw = c.context.rawTypeProperties(node.id);
    if (!raw && !c.context.sourceNode(node.id)) return c.unresolved(node,"missing-type-component-properties","Abstract helper types require explicit component properties");
    if (explicitOperand && (raw ? raw.content.kind !== 'simple' : node.derivation?.contentKind !== 'simple'))
      return c.fail(owner, 'src-simple-type', 'Typed facet operand requires scalar content');
    if (raw && raw.content.kind !== 'simple') return c.unresolved(node, 'simple-content-variety', 'Abstract complex type has no scalar content property');
    if (!raw && node.derivation?.contentKind !== 'simple')
      return c.unresolved(owner, 'simple-content-variety', 'Complex scalar content requires a checked simple-content construction');
    return node;
  };
  const generatedShape = (slot: OriginalGeneratedScalarReference, owner: GraphNode) => {
    const result = originalGeneratedShape(c.context, slot);
    if (result.kind === 'resource-limit') {c.step(owner); throw new Error('Unreachable exhausted scalar budget');}
    if (result.kind !== 'checked') return c.unresolved(owner, result.rule, result.message);
    return result.value;
  };
  const recipe = (type: Reference, owner: GraphNode): Recipe => {
    const cached = recipeCache.get(type); if (cached) return cached;
    if (!options.originalRecipe) return c.unresolved(owner, 'original-scalar-properties', 'Original property reader is unavailable');
    const token = options.originalRecipe(type, owner), record = originalRecipes.get(token);
    if (!record || record.context !== c.context.originalContext() || record.context.budget !== c.budget) throw new TypeError('Foreign original scalar property recipe');
    c.step(owner, 2); recipeCache.set(type, record); return record;
  };
  const dependencies = (reference: Reference, owner: GraphNode): {reference: Reference; owner: GraphNode}[] => {
    if (reference.kind === 'original-generated') {
      referenceKey(reference, owner); recipe(reference,owner); const shape = generatedShape(reference, owner);
      c.step(owner, (shape.members?.length ?? 0) + 5);
      return [shape.base, ...(shape.item ? [shape.item] : []), ...(shape.members ?? [])].map(reference => ({reference, owner}));
    }
    const node = scalarOperandNode(reference, owner); if (!node) return [];
    const rawSimple = c.context.rawSimpleTypeProperties(node.id), rawComplex = c.context.rawTypeProperties(node.id);
    if (rawSimple) {
      c.step(node, 8 + (rawSimple.variety.kind === "union" ? rawSimple.variety.members.length : 1));
      const refs = [rawSimple.base, ...(rawSimple.variety.kind === "list" ? [rawSimple.variety.item] : rawSimple.variety.kind === "union" ? rawSimple.variety.members : [])];
      c.step(node, refs.length * 4);
      for (const ref of refs) if (ref.kind !== "builtin" && ref.kind !== "original-generated" && c.get(c.target(ref, node)!).kind !== "simpleType") c.fail(node, "st-props-correct", "Abstract simple types require simple operands");
      for (const group of rawSimple.facetLayers ?? rawSimple.facetComponentSet ?? []) for (const facet of group.facets) {
        c.step(node, 2);
        if (facet.operand?.context === "active") {
          scalarOperandNode(facet.operand.type, c.get(facet.operand.owner), true);
          refs.push(facet.operand.type);
        }
      }
      return refs.map(reference => ({reference, owner: node}));
    }
    if (rawComplex) {
      if (rawComplex.content.kind !== "simple") return c.unresolved(node, "simple-content-variety", "Abstract complex type has no scalar content property");
      return [{reference: rawComplex.content.type, owner: node}];
    }
    if (!c.context.sourceNode(node.id)) return c.unresolved(node, "missing-type-component-properties", "Abstract helper types require explicit component properties");
    if (node.kind === "simpleType") {
      const refs = node.variety.kind === "restriction" ? [node.variety.base] : node.variety.kind === "list" ? [node.variety.item] : node.variety.members;
      c.step(node, refs.length);
      for (const ref of refs) {
        if (ref.kind !== "builtin" && c.get(c.target(ref, node)!).kind !== "simpleType") return c.fail(node, "st-props-correct", "Simple-type constructors require simple type operands");
      }
      return refs.map(reference => ({reference, owner: node}));
    }
    if (node.kind === "complexType") {
      const derivation = node.derivation!;
      const base = derivation.base.kind === "builtin" ? undefined : c.get(c.target(derivation.base, node)!);
      if (base?.kind === "complexType" && base.derivation?.contentKind !== "simple") {
        if (derivation.kind !== "restriction" || !base.mixed || !derivation.inlineType) return c.fail(node, "simple-content-base", "A mixed complex base requires an explicit inline simple restriction type");
        return [{reference: derivation.inlineType, owner: node}];
      }
      const refs = [derivation.base, ...(derivation.inlineType ? [derivation.inlineType] : [])];
      return refs.map(reference => ({reference, owner: node}));
    }
    return c.fail(owner, "src-simple-type", "Reference requires a scalar type");
  };
  const withDependencies = (reference:Reference, result:Description, owner:GraphNode):Description => {
    const required=collectSemanticTypeDependencies(c.context);
    const selector=descriptionReference(result,owner);
    const selected=resolveSemanticType(c.context,selector);
    if(selector.kind==='original-generated'&&selected.kind!=='original-generated')return c.unresolved(owner,'original-generated-membership','Selected source scalar slot is not active');
    if(selected.kind==='component'||selected.kind==='builtin'||selected.kind==='original-generated') required.add([{contextId:c.context.contextId,type:selected.identity}]);
    for(const dependency of dependencies(reference,owner)) {
      const prior=descriptions.get(referenceKey(dependency.reference,owner)); required.add(prior?.typeDependencies??[]);
    }
    for(const group of result.plan.layers)for(const facet of group.facets){c.step(owner);required.add(facetDependencies.get(facet)??[]);}
    const raw=reference.kind==='original-generated'?undefined:c.context.rawSimpleTypeProperties(owner.id);
    if(reference.kind==='original-generated'||raw?.facetBinding) required.add(recipe(reference.kind==='original-generated'?reference:raw!.facetBinding!.type,owner).typeDependencies);
    return {...result,typeDependencies:required.snapshot()};
  };
  const ensure = (reference: Reference, owner: GraphNode): Description => {
    reference=normalizeReference(reference,owner);
    const rootKey = referenceKey(reference, owner), active = new Set<string>();
    const stack = [{reference, owner, ready: false}];
    while (stack.length) {
      const frame = stack[stack.length - 1], key = referenceKey(frame.reference, frame.owner); c.step(frame.owner);
      if (descriptions.has(key)) {stack.pop(); continue;}
      if (!frame.ready) {
        if (active.has(key)) c.fail(frame.owner, "st-props-correct", "Scalar dependency cycle");
        active.add(key); frame.ready = true;
        const deps = dependencies(frame.reference, frame.owner); c.step(frame.owner, deps.length*3);
        for(const dep of deps)dep.reference=normalizeReference(dep.reference,dep.owner);
        for (let i = deps.length - 1; i >= 0; i--) {c.step(frame.owner); if (!descriptions.has(referenceKey(deps[i].reference, deps[i].owner))) stack.push({...deps[i], ready: false});}
        continue;
      }
      const slot = frame.reference.kind === 'original-generated' ? frame.reference : undefined;
      const node = slot ? c.context.sourceNode(slot.owner)! : c.get(key); c.setCurrent(node);
      const description = (ref: Reference) => descriptions.get(referenceKey(ref, node))!;
      let result: Description;
      const shape = slot ? generatedShape(slot, node) : undefined;
      const rawSimple: RawSimpleTypeProperties | undefined = shape ? {type:node.id, base:shape.base, final:[],
        targetNamespace:shape.targetNamespace, variety:shape.variety === 'atomic' ? {kind:'atomic'} : shape.variety === 'list' ? {kind:'list',item:shape.item!} : {kind:'union',members:shape.members!},
        facetBinding:{kind:'original',type:slot!}, provenance:{kind:'actual-mapped',original:node.id}}
        : c.context.rawSimpleTypeProperties(node.id);
      const rawComplex = slot ? undefined : c.context.rawTypeProperties(node.id);
      if (rawSimple) {
        const bound = rawSimple.facetBinding ? recipe(rawSimple.facetBinding.type, node) : undefined;
        const groups: {facets: readonly Facet[]; identity?: object; annotation?: FacetAnnotation}[] = [];
        if (bound) for (const group of bound.layers) {
          c.step(node, group.facets.length * 5 + 3); const facets: Facet[] = [];
          for (const item of group.facets) {
            const facet = c.budget.freeze(c.budget.snapshot(item.facet)); facets.push(facet);
            if (item.value) boundFacetValues.set(facet,item.value);
            if(item.intrinsicPattern)intrinsicFacets.add(facet);
            boundAnnotations.set(facet,item.annotation);
            if(item.payload!==undefined)boundAnnotationPayloads.set(facet,item.payload);
          }
          groups.push({facets,identity:group.identity});
        } else for (const group of rawSimple.facetLayers ?? rawSimple.facetComponentSet ?? []) {c.step(node);groups.push(group);}
        if (node.identity.kind === "global" && rawSimple.targetNamespace !== undefined) {
          c.text(rawSimple.targetNamespace, node); c.text(node.identity.name.namespace, node);
          if (rawSimple.targetNamespace !== node.identity.name.namespace) c.fail(node, "raw-simple-target-namespace", "Named type namespace differs from its immutable identity");
        }
        const base = description(rawSimple.base), variety = rawSimple.variety;
        checkFinal(rawSimple.base, "restriction", node);
        const urBase = base.plan.builtin === "anySimpleType";
        if (variety.kind === "atomic") {
          if (base.plan.variety !== "atomic" || urBase) c.fail(node, "cos-st-restricts", "Atomic type requires an atomic base");
          result = {...base, definition: node.id, parent: base, intrinsic: undefined, rawProperties: true, conjuncts: undefined, facets: new Map(), plan: {...base.plan, id: node.id, reference: frame.reference, layers: [], whitespace: whitespaceFor(base.plan.primitive!)}};
        } else if (variety.kind === "list") {
          const item = description(variety.item);
          if (item.plan.variety === "list" || item.plan.builtin === "anySimpleType" || item.members?.some(member => member.plan.variety !== "atomic")) c.fail(node, "cos-st-restricts", "List items require atomic types or a union of atomic types");
          if (urBase) checkFinal(variety.item, "list", node);
          else {
            if (base.plan.variety !== "list") c.fail(node, "cos-st-restricts", "Restricted list requires a list base");
            const relation = checkTypeDerivation(c.context, variety.item, base.plan.item!, []);
            if (relation.kind === "resource-limit") c.step(node);
            if (relation.kind !== "checked") c.unresolved(node, "raw-list-item-derivation", "List item relation requires a checked local premise");
            else if (!relation.value) c.fail(node, "cos-st-restricts", "List item is not derived from its base item");
          }
          result = {definition: node.id, parent: base, intrinsic: urBase ? LIST_CONSTRUCTOR_FACETS : undefined, plan: {id: node.id, reference: frame.reference, variety: "list", item: variety.item, layers: [], whitespace: "collapse", enforcement: ["lexical-space", "whitespace", "list"], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, item, facets: new Map()};
        } else {
          c.step(node, variety.members.length + 1);
          const members = variety.members.map(ref => {c.step(node); return description(ref);});
          if (!members.length || members.some(member => member.plan.variety === "union" || member.plan.builtin === "anySimpleType")) c.fail(node, "cos-st-restricts", "Abstract union members require atomic or list variety");
          if (urBase) for (const ref of variety.members) checkFinal(ref, "union", node);
          else {
            if (base.plan.variety !== "union" || base.plan.members!.length !== members.length) c.fail(node, "cos-st-restricts", "Restricted union requires corresponding ordered base members");
            for (let i = 0; i < variety.members.length; i++) {
              const relation = checkTypeDerivation(c.context, variety.members[i], base.plan.members![i], []);
              if (relation.kind === "resource-limit") c.step(node);
              if (relation.kind !== "checked") c.unresolved(node, "raw-union-member-derivation", "Union member relation requires a checked local premise");
              else if (!relation.value) c.fail(node, "cos-st-restricts", "Union member is not derived from its corresponding base member");
            }
          }
          result = {definition: node.id, parent: base, plan: {id: node.id, reference: frame.reference, variety: "union", members: variety.members, layers: [], whitespace: "member", enforcement: ["lexical-space", "union", "whitespace"], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, members, facets: new Map()};
        }
        c.step(node);
        const intrinsic = result, conjuncts: Description[] = [];
        const exactComponentSet: ExactFacetComponent[] | undefined = rawSimple.facetComponentSet === undefined ? undefined : [];
        for (const group of groups) {
          c.step(node, group.facets.length + 1);
          if (urBase && group.facets.some(facet => variety.kind === "union" || facet.name !== "whiteSpace")) c.fail(node, "cos-st-restricts", "List/union construction facets violate the simple ur-base rule");
          if (urBase && variety.kind === "list" && group.facets.some(facet => !facet.fixed)) c.fail(node, "cos-st-restricts", "A list constructor requires its fixed-collapse whitespace component");
          const formed = layer(intrinsic, frame.reference, node, group.facets, false);
          if (group.identity) for (const installed of formed.plan.layers) {c.step(node);layerIdentities.set(installed,group.identity);}
          if (exactComponentSet) {
            const name = group.facets[0].name, installed = formed.plan.layers.at(-1)!;
            c.step(node, group.facets.length * 5 + 4);
            exactComponentSet.push({name, values:group.facets.map(facet => name === 'pattern'
              ? {fixed:false, lexical:facet.lexical.value} : name === 'enumeration'
                ? {fixed:false, operand:enumerations.get(installed)!.get(facet)!} : facetProperty(formed, name, node)!),
            annotation:group.annotation});
          }
          conjuncts.push(formed);
        }
        c.step(node, intrinsic.plan.enforcement.length + 1);
        const layers: ScalarConstraintLayer[] = [], requirements = new Set(intrinsic.plan.enforcement);
        let whitespace = intrinsic.plan.whitespace;
        const rank = {preserve: 0, replace: 1, collapse: 2, member: -1};
        for (const conjunct of conjuncts) {
          c.step(node, conjunct.plan.layers.length + conjunct.plan.enforcement.length + 1); layers.push(...conjunct.plan.layers);
          for (const requirement of conjunct.plan.enforcement) requirements.add(requirement);
          if (rank[conjunct.plan.whitespace] > rank[whitespace]) whitespace = conjunct.plan.whitespace;
        }
        c.step(node, conjuncts.length + requirements.size + 1);
        result = {...intrinsic, conjuncts: conjuncts.map(conjunct => ({...conjunct, plan: {...conjunct.plan, whitespace}})), plan: {...intrinsic.plan, whitespace, layers, enforcement: [...requirements]}};
        const facetCorrespondence = urBase || rawFacetCorrespondence(base, result, frame.reference, node);
        // These are exact supplied effective constraints. Proving they restrict
        // the base's complete constraints is a separate semantic obligation.
        c.step(node, (base.plan.obligations?.length ?? 0) + (result.item?.plan.obligations?.length ?? 0) + 4);
        const inherited = [...(base.plan.obligations ?? []), ...(result.item?.plan.obligations ?? []), ...(bound?.obligations ?? [])];
        if (node.identity.kind === "scoped" && rawSimple.targetNamespace === undefined && !c.context.sourceNode(node.id)) inherited.push({rule: "raw-simple-target-namespace", component: node.id});
        for (const member of result.members ?? []) {c.step(node, (member.plan.obligations?.length ?? 0) + 1); inherited.push(...(member.plan.obligations ?? []));}
        for (const group of groups) for (const facet of group.facets) {
          const required = facetObligations.get(facet) ?? []; c.step(node, required.length + 1); inherited.push(...required);
        }
        const repeatedExactScalar = exactComponentSet && (() => {
          const seen = new Map<string,FacetProperty[]>();
          for (const component of exactComponentSet) {
            const name = component.name;
            if (name === 'pattern' || name === 'enumeration') continue;
            const property=component.values[0];
            const prior=seen.get(name)??[];
            if(prior.length&&!prior.some(other=>sameFacetProperty(other,property,node)))return true;
            c.step(node);prior.push(property);seen.set(name,prior);
          }
          return false;
        })();
        if (!facetCorrespondence || repeatedExactScalar) inherited.push({rule: "raw-simple-facet-restriction-validity", component: node.id});
        result = {...result, exactComponentSet,
          originalFacetIdentity:bound?.identity, definition:slot ? 'content:'+slot.owner : node.id, parent: base, plan: {...result.plan, obligations: inherited}};
      } else if (rawComplex) {
        if (rawComplex.content.kind !== "simple") return c.unresolved(node, "simple-content-variety", "Abstract complex type has no scalar content property");
        const content = description(rawComplex.content.type);
        c.step(node, (content.plan.obligations?.length ?? 0) + 2);
        result = {...content, plan: {...content.plan, id: node.id, reference: frame.reference,
          obligations: [...(content.plan.obligations ?? []), {rule: "raw-simple-content-derivation-validity", component: node.id}]}};
      } else if (node.kind === "simpleType") {
        if (node.variety.kind === "restriction") {
          checkFinal(node.variety.base, "restriction", node); result = layer(description(node.variety.base), frame.reference, node, node.variety.facets);
        } else if (node.variety.kind === "list") {
          checkFinal(node.variety.item, "list", node); const item = description(node.variety.item);
          const members = [item], visited = new Set<string>();
          while (members.length) {
            const member = members.pop()!; c.step(node);
            if (visited.has(member.definition)) continue; visited.add(member.definition);
            if (member.plan.variety === "list" || member.plan.builtin === "anySimpleType") c.fail(node, "cos-st-restricts", "List items must be atomic or a union of atomic types");
            if (member.members) for (const nested of member.members) {c.step(node); members.push(nested);}
          }
          result = {definition: node.id, intrinsic: LIST_CONSTRUCTOR_FACETS, plan: {id: node.id, reference: frame.reference, variety: "list", item: node.variety.item, layers: [], whitespace: "collapse", enforcement: ["lexical-space", "whitespace", "list"], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, item, facets: new Map()};
        } else {
          const members: Description[] = [], references: Reference[] = [];
          for (const ref of node.variety.members) {
            c.step(node); checkFinal(ref, "union", node); const member = description(ref);
            if (member.plan.builtin === "anySimpleType") c.fail(node, "cos-st-restricts", "Union members must have atomic or list variety");
            // XSD 1.0's XML component mapping flattens every union member,
            // including constrained unions. WG bug2044 changed this only in
            // XSD1.1; the original graph still retains the discarded layers.
            if (member.plan.variety === "union") {
              for (const nested of member.members!) {c.step(node); members.push(nested); references.push(nested.plan.reference);}
            } else {members.push(member); references.push(ref);}
          }
          result = {definition: node.id, plan: {id: node.id, reference: frame.reference, variety: "union", members: references, declaredMembers: node.variety.members,
            unionMapping: "xsd10-flattened", layers: [], whitespace: "member", enforcement: ["lexical-space", "union", "whitespace"], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, members, facets: new Map()};
        }
      } else if (node.kind === "complexType") {
        const derivation = node.derivation!;
        const base = description(derivation.base);
        if (!base) {
          const baseId = c.target(derivation.base, node)!;
          const starting = description(derivation.inlineType!); checkStartingFinal(starting, node);
          result = layer(starting, frame.reference, node, derivation.facets);
          result = {...result, plan: {...result.plan, obligations: [...(result.plan.obligations ?? []), {rule: "simple-content-base-mixed-emptiable", component: baseId}]}};
          result=withDependencies(frame.reference,result,node);
          descriptions.set(key, result); active.delete(key); stack.pop(); continue;
        }
        result = base;
        if (derivation.kind === "restriction") {
          if (derivation.inlineType) {
            result = description(derivation.inlineType);
            if (!contentDerivation(derivation.inlineType, derivation.base, node)) return c.fail(node, "simple-content-inline-derivation", "Inline simple type does not derive from the original scalar content type");
          }
          checkStartingFinal(result, node);
          result = layer(result, frame.reference, node, derivation.facets);
        }
        result = {...result, plan: {...result.plan, id: node.id, reference: frame.reference}};
      } else return c.fail(node, "src-simple-type", "Expected scalar type");
      c.step(node, (result.plan.obligations?.length ?? 0) + (result.item?.plan.obligations?.length ?? 0) + 2);
      const obligations = [...(result.plan.obligations ?? []), ...(result.item?.plan.obligations ?? [])];
      for (const member of result.members ?? []) {c.step(node, (member.plan.obligations?.length ?? 0) + 1); obligations.push(...(member.plan.obligations ?? []));}
      result = withDependencies(frame.reference,{...result, plan: {...result.plan, obligations}},node);
      descriptions.set(key, result); active.delete(key); stack.pop();
    }
    return descriptions.get(rootKey)!;
  };
  const assessConstraint = (reference: Reference, constraint: ValueConstraint, owner: GraphNode) => {
    const description = ensure(reference, owner);
    if (description.plan.primitive === "NOTATION" && !description.plan.layers.some(l => l.facets.some(f => f.name === "enumeration"))) c.fail(owner, "enumeration-required-notation", "NOTATION cannot be used directly as a declared datatype");
    if (description.plan.builtin === "ID") c.fail(owner, owner.kind === "attribute" || owner.kind === "attributeUse" ? "a-props-correct" : "e-props-correct", "An ID-derived type/content cannot have a value constraint");
    const value = operand(description, constraint.lexical, owner);
    return {value, plan: {...description.plan, enforcement: [...new Set([...description.plan.enforcement, "default-fixed" as const])]}};
  };
  const checkValue = (reference: Reference, constraint: ValueConstraint, owner: GraphNode) => assessConstraint(reference, constraint, owner).plan;
  const equivalent = (referenceA: Reference, a: LexicalValue, referenceB: Reference, b: LexicalValue, owner: GraphNode) => {
    const x = operand(ensure(referenceA, owner), a, owner), y = operand(ensure(referenceB, owner), b, owner);
    return values.sameValue(x, y, owner);
  };
  const contentDerivation = (derived: Reference, base: Reference, owner: GraphNode): boolean => {
    const target = ensure(base, owner); let current: Description | undefined = ensure(derived, owner);
    const seen = new Set<Description>();
    while (current) {
      c.step(owner);
      if (current.definition === target.definition) return true;
      if (seen.has(current)) return c.fail(owner, "st-props-correct", "Scalar ancestry cycle");
      seen.add(current);
      if (current.definition.startsWith("builtin:") && target.definition.startsWith("builtin:")) {
        const relation = checkTypeDerivation(c.context,
          {kind: "builtin", name: {namespace: XSD_NAMESPACE, local: current.definition.slice(8)}},
          {kind: "builtin", name: {namespace: XSD_NAMESPACE, local: target.definition.slice(8)}}, []);
        if (relation.kind === "resource-limit") c.step(owner);
        if (relation.kind !== "checked") return c.unresolved(owner, "scalar-content-derivation", "Builtin scalar ancestry is unresolved");
        return relation.value;
      }
      current = current.parent;
    }
    return false;
  };
  const contentIdentity = (reference: Reference, owner: GraphNode): {definition: string; reference?: Reference} => {
    const value = ensure(reference, owner);
    c.text(value.definition, owner);
    if (value.definition.startsWith("builtin:")) return {definition: value.definition, reference: {kind: "builtin", name: {namespace: XSD_NAMESPACE, local: value.definition.slice(8)}}};
    if (value.definition.startsWith("content:")) return {definition: value.definition};
    return {definition: value.definition, reference: {kind: "local", target: value.definition}};
  };
  const contentProperties = (reference: Reference, owner: GraphNode): ScalarContentProperties => {
    const value = ensure(reference, owner), selected = descriptionReference(value, owner);
    c.step(owner, 18);
    const generated = value.definition.startsWith('content:');
    const node = selected.kind === 'local' ? c.get(selected.target) : selected.kind === 'original-generated' ? c.context.sourceNode(selected.owner) : undefined;
    const original = node ? c.context.sourceNode(node.id) : undefined;
    const raw = node?.kind === 'simpleType' ? c.context.rawSimpleTypeProperties(node.id) : undefined;
    if (generated && (original?.kind !== 'complexType' || original.derivation?.kind !== 'restriction' || original.derivation.contentKind !== 'simple')) return c.unresolved(owner, 'generated-scalar-properties', 'Generated scalar requires its authentic source restriction owner');
    const name = generated ? undefined : selected.kind === 'builtin' ? selected.name : node?.identity.kind === 'global' ? node.identity.name : undefined;
    const targetNamespace = generated ? original!.context.effectiveNamespace
      : name?.namespace ?? raw?.targetNamespace ?? original?.context.effectiveNamespace;
    if (targetNamespace === undefined) return c.unresolved(owner, 'raw-simple-target-namespace', 'Anonymous scalar requires an explicit target namespace property');
    let base: Reference | undefined;
    if (value.parent) base = descriptionReference(value.parent, owner);
    else {
      const relation = immediateTypeBase(c.context, selected);
      if (relation.kind === 'resource-limit') {c.step(owner); throw new Error('Unreachable exhausted scalar budget');}
      if (relation.kind !== 'checked') {
        if (relation.kind === 'unresolved') return c.unresolved(owner, relation.rule, relation.message);
        return c.fail(owner, relation.rule, relation.message);
      }
      base = relation.value;
    }
    return {definition: value.definition, name, targetNamespace, final: descriptionFinal(value, owner), base,
      variety: value.plan.builtin === 'anySimpleType' ? 'absent' : value.plan.variety,
      primitive: value.plan.builtin === 'anySimpleType' ? undefined : value.plan.primitive,
      item: value.plan.item, members: value.plan.members,
      generatedPolicy: generated ? 'GSC1' : undefined, annotation: generated || !node?.annotations.length ? 'absent' : 'source'};
  };
  /** Private snapshots are issued only by the owning context's scalar reader. */
  const readFacetProperties = (reference: Reference, owner: GraphNode): {evidence: ScalarFacetEvidence; obligations: readonly ScalarObligation[]; annotations: ScalarFacetAnnotationPresence;typeDependencies:readonly SemanticTypeDependency[]} => {
    const description = ensure(reference, owner), names = facetNames(description, owner);
    c.step(owner, names.length * 3 + 12);
    const scalars = new Map<string, FacetProperty>(), enumerationGroups: SchemaOperand[][] = [];
    let annotations: ScalarFacetAnnotationPresence = description.plan.obligations?.length ? 'unresolved' : 'absent';
    const annotation = (known: ScalarFacetAnnotationPresence | undefined): void => {
      c.step(owner);
      if (known === 'present') annotations = 'present';
      else if ((!known || known === 'unresolved') && annotations !== 'present') annotations = 'unresolved';
    };
    for (const name of names) {
      c.step(owner, 3); scalars.set(name, facetProperty(description, name, owner)!);
      const explicit = description.facets.get(name); if (explicit) annotation(boundAnnotations.get(explicit.facet) ?? sourceFacetAnnotations.get(explicit.facet) ?? facetAnnotationPresence(explicit.facet.annotation));
    }
    for (const group of description.plan.layers) {
      c.step(owner, group.facets.length * 3 + 8); const members: SchemaOperand[] = [];
      let patternCount = 0, enumerationCount = 0;
      let patternAnnotation: ScalarFacetAnnotationPresence = 'absent', enumerationAnnotation: ScalarFacetAnnotationPresence = 'absent';
      for (const facet of group.facets) {
        const known = boundAnnotations.get(facet) ?? sourceFacetAnnotations.get(facet) ?? facetAnnotationPresence(facet.annotation);
        if (facet.name === 'pattern') {
          patternCount++;
          if (known === 'present' || patternAnnotation === 'absent') patternAnnotation = known;
        }
        if (facet.name === 'enumeration') {
          enumerationCount++; members.push(enumerations.get(group)!.get(facet)!);
          if (known === 'present' || enumerationAnnotation === 'absent') enumerationAnnotation = known;
        }
      }
      // Multi-value source mapping fixes the component VALUE, but does not
      // select an aggregation of nonempty annotation adjuncts. All-absent is
      // exact; annotated or unrepresented multioperand metadata stays unknown.
      if (patternCount) annotation(patternCount > 1 && patternAnnotation !== 'absent' ? 'unresolved' : patternAnnotation);
      if (enumerationCount) annotation(enumerationCount > 1 && enumerationAnnotation !== 'absent' ? 'unresolved' : enumerationAnnotation);
      if (members.length) enumerationGroups.push(members);
    }
    const patternGroups = patternProperties(description, owner);
    const exact: ExactFacetComponent[] | undefined = description.exactComponentSet !== undefined
      || !description.rawProperties || description.originalFacetIdentity ? [] : undefined;
    if (exact) {
      if (description.exactComponentSet !== undefined) {
        for (const component of description.exactComponentSet) {
          c.step(owner); exact.push(component);
        }
      } else {
        for (const name of names) {
          const explicit = description.facets.get(name);
          c.step(owner, 4);
          exact.push({name,values:[scalars.get(name)!],
            annotation:explicit ? boundAnnotationPayloads.get(explicit.facet) ?? sourceFacetPayloads.get(explicit.facet) : 'absent'});
        }
        for (const expression of description.intrinsic?.patterns ?? []) {
          c.step(owner, 4); exact.push({name:'pattern',values:[{fixed:false,lexical:expression}],annotation:'absent'});
        }
        for (const group of description.plan.layers) for (const name of ['pattern','enumeration']) {
          const facets=group.facets.filter(facet=>facet.name===name);
          if (!facets.length) continue;
          c.step(owner, facets.length * 5 + 4);
          const payloads=facets.map(facet=>boundAnnotationPayloads.get(facet) ?? sourceFacetPayloads.get(facet));
          const ambiguous=facets.length>1 && payloads.some(payload=>payload!==undefined && payload!=='absent');
          exact.push({name,values:facets.map(facet=>name==='pattern'
            ? {fixed:false,lexical:facet.lexical.value} : {fixed:false,operand:enumerations.get(group)!.get(facet)!}),
            annotation:ambiguous ? undefined : payloads[0] ?? 'absent',
            identity:layerIdentities.get(group) ?? group});
        }
      }
    }
    if(description.exactComponentSet!==undefined){
      annotations=description.plan.obligations?.length?'unresolved':'absent';
      for(const component of description.exactComponentSet){
        c.step(owner);
        if(component.annotation===undefined){if(annotations!=='present')annotations='unresolved';}
        else if(component.annotation!=='absent')annotations='present';
      }
    }
    c.step(owner, 12);
    const evidence: ScalarFacetEvidence = Object.freeze({kind: 'scalar-facet-evidence'});
    facetEvidence.set(evidence, {context: c.context, identity: description,
      applicable: description.plan.builtin !== 'anySimpleType', scalars, patterns: patternGroups,
      enumerations: enumerationGroups, annotations,exact,binding:description.originalFacetIdentity});
    return {evidence, obligations: description.plan.obligations ?? [], annotations,typeDependencies:description.typeDependencies??[]};
  };
  /** Component and enumeration value collections are extensional sets. */
  const coversExact = <T,U>(left: readonly T[], right: readonly U[],
    compatible:(a:T,b:U)=>boolean, owner:GraphNode):boolean => {
    for(const value of left){
      let matched=false;
      for(const other of right){c.step(owner);if(compatible(value,other)){matched=true;break;}}
      if(!matched)return false;
    }
    return true;
  };
  const sameExactSet=<T>(left:readonly T[],right:readonly T[],compatible:(a:T,b:T)=>boolean,owner:GraphNode):boolean=>
    coversExact(left,right,compatible,owner)&&coversExact(right,left,compatible,owner);
  const exactValueRelation=(left:ExactFacetComponent,right:ExactFacetComponent,owner:GraphNode):'equal'|'different'|'unresolved'=>{
    if(left.name!==right.name)return 'different';
    if(left.name==='pattern'){
      if(left.values.length>1||right.values.length>1){
        return left.identity&&left.identity===right.identity?'equal':'unresolved';
      }
      c.text(left.values[0].lexical!,owner);c.text(right.values[0].lexical!,owner);
      return left.values[0].lexical===right.values[0].lexical?'equal':'different';
    }
    return sameExactSet(left.values,right.values,(a,b)=>sameFacetProperty(a,b,owner),owner)?'equal':'different';
  };
  const annotationRelation=(a:FacetAnnotation|undefined,b:FacetAnnotation|undefined):'equal'|'different'|'unresolved'=>{
    c.step(undefined,2);
    if(a===undefined||b===undefined)return 'unresolved';
    return compareFacetAnnotation(a,b,c.budget);
  };
  const exactAnnotationRelation=(left:ExactFacetComponent,right:ExactFacetComponent):'equal'|'different'|'unresolved'=>
    left.identity&&left.identity===right.identity?'equal':annotationRelation(left.annotation,right.annotation);
  /** One exact relation for same-context and authenticated cross-context facts. */
  const compareFacetProperties = (a: ScalarFacetEvidence, b: ScalarFacetEvidence, owner: GraphNode): boolean => {
    c.step(owner, 3); const x = facetEvidence.get(a), y = facetEvidence.get(b);
    if (!x || !y || x.context !== c.context || y.context.budget !== c.budget
      || y.context.originalContext() !== c.context.originalContext()) throw new TypeError('Unauthenticated or foreign scalar facet evidence');
    if (x.context === y.context && x.identity === y.identity) return true;
    if (x.applicable !== y.applicable) return false;
    // The special ur tableau has no {facets} property in either context.
    if (!x.applicable) return true;
    if (x.exact && y.exact) {
      if(sameExactSet(x.exact,y.exact,(left,right)=>exactValueRelation(left,right,owner)==='equal',owner))return true;
      if(sameExactSet(x.exact,y.exact,(left,right)=>exactValueRelation(left,right,owner)!=='different',owner))
        return c.unresolved(owner,'pattern-property-equality','Independent multi-pattern components require an exact expression mapping');
      return false;
    }
    c.step(owner, x.scalars.size + y.scalars.size + 2);
    const names = new Set([...x.scalars.keys(), ...y.scalars.keys()]);
    for (const name of names) {
      c.step(owner); const left = x.scalars.get(name), right = y.scalars.get(name);
      if (!left || !right || !sameFacetProperty(left, right, owner)) return false;
    }
    if (!x.patterns.every(group => y.patterns.some(other => samePatternProperty(group, other, owner)))
      || !y.patterns.every(group => x.patterns.some(other => samePatternProperty(group, other, owner)))) {
      if (!x.patterns.every(group => group.expressions.length === 1) || !y.patterns.every(group => group.expressions.length === 1)) return c.unresolved(owner, 'pattern-property-equality', 'Independent multi-pattern components require an exact expression mapping');
      return false;
    }
    const sameGroup = (left: readonly SchemaOperand[], right: readonly SchemaOperand[]): boolean => {
      c.step(owner, left.length + right.length + 1);
      return left.every(value => right.some(other => values.sameValue(value, other, owner)))
        && right.every(value => left.some(other => values.sameValue(value, other, owner)));
    };
    c.step(owner, x.enumerations.length + y.enumerations.length + 1);
    return x.enumerations.every(group => y.enumerations.some(other => sameGroup(group, other)))
      && y.enumerations.every(group => x.enumerations.some(other => sameGroup(group, other)));
  };
  const compareFacetAnnotations = (a:ScalarFacetEvidence,b:ScalarFacetEvidence,owner?:GraphNode):'equal'|'different'|'unresolved' => {
    const x=facetEvidence.get(a),y=facetEvidence.get(b);
    if(!x||!y||x.context!==c.context||y.context.originalContext()!==c.context.originalContext())throw new TypeError('Foreign facet evidence');
    c.step(undefined,4);
    if((x.binding??x.identity)===(y.binding??y.identity))return 'equal';
    if(x.exact&&y.exact&&owner){
      const known=sameExactSet(x.exact,y.exact,(left,right)=>exactValueRelation(left,right,owner)==='equal'
        &&exactAnnotationRelation(left,right)==='equal',owner);
      if(known)return 'equal';
      const possible=sameExactSet(x.exact,y.exact,(left,right)=>exactValueRelation(left,right,owner)!=='different'
        &&exactAnnotationRelation(left,right)!=='different',owner);
      return possible?'unresolved':'different';
    }
    if(x.annotations==='absent'&&y.annotations==='absent')return 'equal';
    if(x.annotations==='present'&&y.annotations==='absent'||y.annotations==='present'&&x.annotations==='absent')return 'different';
    return 'unresolved';
  };
  const facetPropertiesEquivalent = (a: Reference, b: Reference, owner: GraphNode): boolean =>
    compareFacetProperties(readFacetProperties(a, owner).evidence, readFacetProperties(b, owner).evidence, owner);
  const readOriginalRecipe = (reference: Reference, owner: GraphNode): OriginalScalarFacetRecipe => {
    if (c.context !== c.context.originalContext()) throw new TypeError('Only the original scalar owner issues recipes');
    const originalRef: Reference = reference.kind === 'original-generated' ? {kind:'local',target:reference.owner} : reference;
    const prior=readingOriginalRecipe;readingOriginalRecipe=true;
    let value:Description;
    try{
      // Formation errors in the original selected type keep their source owner.
      value=ensure(originalRef,owner);
      const mapped=resolveOriginalScalarIdentity(c.context,reference);
      if(mapped.kind==='resource-limit'){c.step(owner);throw new Error('Unreachable exhausted scalar budget');}
      if(mapped.kind!=='checked')return c.unresolved(owner,mapped.rule,mapped.message);
      const canonical:Reference=mapped.value.kind==='original-generated'?{kind:'local',target:mapped.value.owner}
        :mapped.value.kind==='component'?{kind:'local',target:mapped.value.id}:mapped.value;
      value=ensure(canonical,owner);
    }finally{readingOriginalRecipe=prior;}
    c.step(owner,2);const cached=originalRecipeTokens.get(value);if(cached)return cached;
    const layers: RecipeLayer[] = [];
    for (const name of facetNames(value,owner)) {
      const property = facetProperty(value,name,owner)!, explicit = value.facets.get(name);
      const lexical = explicit?.facet.lexical ?? {value:property.integer ?? property.operand?.canonical ?? property.lexical!,context:owner.context};
      c.step(owner,10);
      const facet: Facet = {name,fixed:property.fixed,lexical};
      layers.push({facets:[{facet,value:property.operand,
        annotation:explicit ? sourceFacetAnnotations.get(explicit.facet) ?? 'unresolved':'absent',
        payload:explicit ? sourceFacetPayloads.get(explicit.facet):'absent'}]});
    }
    for (const expression of value.intrinsic?.patterns ?? []) {c.step(owner,6); layers.push({facets:[{facet:{name:'pattern',fixed:false,lexical:{value:expression,context:owner.context}},intrinsicPattern:true,annotation:'absent',payload:'absent'}]});}
    for (const group of value.plan.layers) {
      c.step(owner,group.facets.length * 4 + 3); const facets:RecipeFacet[] = [];
      for (const facet of group.facets) if (facet.name === 'pattern' || facet.name === 'enumeration') facets.push({facet,value:enumerations.get(group)!.get(facet),
        annotation:sourceFacetAnnotations.get(facet) ?? 'unresolved',payload:sourceFacetPayloads.get(facet)});
      if (facets.length) layers.push({facets,identity:layerIdentities.get(group) ?? group});
    }
    c.step(owner,4+(value.plan.obligations?.length??0)*8); const token:OriginalScalarFacetRecipe=Object.freeze({kind:'original-scalar-facet-recipe'});
    originalRecipes.set(token,{context:c.context,layers,identity:value,obligations:(value.plan.obligations ?? []).map(obligation=>({...obligation,contextId:obligation.contextId??c.context.contextId})),typeDependencies:value.typeDependencies??[]});
    originalRecipeTokens.set(value,token);return token;
  };
  return {typeDependencies:(reference:Reference,owner:GraphNode)=>ensure(reference,owner).typeDependencies??[],ensure: (reference: Reference, owner: GraphNode) => ensure(reference, owner).plan, checkFinal, checkValue, assessConstraint, equivalent,
    contentIdentity, contentProperties, readOriginalRecipe, contentDerivation, facetPropertiesEquivalent, readFacetProperties, compareFacetProperties,compareFacetAnnotations,
    selectOperand: (reference: Reference, owner: GraphNode): void => {scalarOperandNode(reference, owner, true);},
    assess: (reference: Reference, lexical: LexicalValue, owner: GraphNode) => operand(ensure(reference, owner), lexical, owner),
    compare: values.compare};
}
