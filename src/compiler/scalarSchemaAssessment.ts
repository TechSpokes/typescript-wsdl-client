import type {SemanticTypeReference as Reference, SemanticTypeDependency, OriginalGeneratedScalarReference} from './semanticTypeReference.js';
import {constants as bufferConstants} from 'node:buffer';
/** Scalar schema legality and enforcement ownership. Payload enforcement is #184. */
import {isBuiltinType} from "./canonicalGraph.js";
import type {GraphNode, LexicalValue, NodeId, SimpleTypeNode, ValueConstraint} from "./canonicalGraph.js";
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
import {schemaRegularLanguages} from './schemaRegularLanguage.js';
import type {RegularLanguage} from './schemaRegularLanguage.js';
import {schemaDecimalLanguages} from './schemaDecimalLanguage.js';
import {calendarAliasExpressions, durationAliasExpressions} from './schemaTemporalAliases.js';
import {schemaIeeeLanguages} from './schemaIeeeLanguage.js';
import type {IeeeBound, IeeeInputInterval} from './schemaIeeeLanguage.js';
import {schemaCalendarLanguages} from './schemaCalendarLanguage.js';
import {schemaUriExpression} from './schemaUri.js';
import {schemaDurationLanguages} from './schemaDurationLanguage.js';
import {schemaValueImages} from './schemaValueImages.js';
import {schemaCalendarImages} from './schemaCalendarImages.js';
import {schemaNumericImageConditions} from './schemaNumericImageConditions.js';
import type {NumericImageCondition} from './schemaNumericImageConditions.js';
import {schemaLexicalPredicates} from './schemaLexicalPredicates.js';
import type {LexicalPredicate} from './schemaLexicalPredicates.js';
import {schemaSymbolicValueSets} from './schemaSymbolicValueSets.js';
import type {ScalarValueSet} from './schemaSymbolicValueSets.js';
import {schemaSymbolicSequences} from './schemaSymbolicSequences.js';
import type {SymbolicSequence} from './schemaSymbolicSequences.js';
import {schemaTokenImages} from './schemaTokenImages.js';
import {showInstant} from './schemaExactCalendar.js';
import {endpointCapacity} from './schemaEndpointWordCapacity.js';

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
  /** Private position predicates factored from a qualified whole-list enum. */
  membershipItems?: readonly Description[];
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
type ScalarTuple = {name: string; property: FacetProperty; facet?: Facet;
  annotation?: FacetAnnotation; identity?: object; annotationIdentity?: object};
type PatternProperty = {expressions: readonly string[]; identity?: object};
type ExactFacetComponent = {name: string; values: readonly FacetProperty[];
  annotation?: FacetAnnotation; identity?: object; annotationIdentity?: object; facet?: Facet};
type RawComponentReplay = Readonly<{component: ExactFacetComponent; facets: readonly Facet[];
  source?: Readonly<{values: readonly (SchemaOperand | undefined)[]; obligations: readonly ScalarObligation[];
    typeDependencies: readonly SemanticTypeDependency[]; intrinsicPatterns?: readonly boolean[]}>}>;
type SourceFacetStep = Readonly<{sourceOwner: NodeId; facets: readonly Facet[]}>;
type CurrentRepeatableComponent = Readonly<{component: ExactFacetComponent; layer?: ScalarConstraintLayer}>;
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
type RecipeLayer = {facets: readonly RecipeFacet[]; identity?: object; sourceStep?: SourceFacetStep};
type Recipe = {context: SemanticContext; layers: readonly RecipeLayer[]; obligations: readonly ScalarObligation[]; typeDependencies: readonly SemanticTypeDependency[]; identity: Description};
const originalRecipes = new WeakMap<OriginalScalarFacetRecipe, Recipe>();
const facetEvidence = new WeakMap<ScalarFacetEvidence, FacetEvidenceRecord>();
// Factory-owned frozen rows survive descendant contexts. Caller group sharing,
// another row, or another component incidence never supplies this identity.
const rawFacetOccurrences = new WeakMap<RawSimpleTypeProperties, readonly object[]>();
// A legacy RAW row publishes one reduced scalar component per kind. Its
// occurrence survives forks; typed values are still formed in the current H.
const rawReducedScalarOccurrences = new WeakMap<RawSimpleTypeProperties, Map<string, object>>();
// Actual source incidences share metadata, never typed VALUE or P1 shortcuts.
const sourceFacetIncidences = new WeakMap<SemanticContext, WeakMap<SimpleTypeNode, Map<string, object>>>();
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
  // Context-local completed tables. The immutable row's incidence identity may
  // survive a fork; its typed values and replay facts never leave this owner.
  let rawComponentTables: WeakMap<RawSimpleTypeProperties, readonly RawComponentReplay[]> | undefined;
  let sourceSteps: WeakMap<ScalarConstraintLayer, SourceFacetStep> | undefined;
  let currentComponents: WeakMap<Description, readonly CurrentRepeatableComponent[]> | undefined;
  let sourceComponentTables: WeakMap<Description, readonly RawComponentReplay[] | false> | undefined;
  let formedComponentTables: WeakMap<Description, readonly RawComponentReplay[] | false> | undefined;
  const rawFacetIdentities = (row: RawSimpleTypeProperties, owner: GraphNode): readonly object[] => {
    c.step(owner, 4);
    const prior = rawFacetOccurrences.get(row);
    if (prior) return prior;
    const count = (row.facetComponentSet ?? row.facetLayers ?? []).length;
    c.step(owner, count * 4 + 6);
    const identities = Object.freeze(Array.from({length: count}, () => Object.freeze({})));
    c.step(owner, 2);
    rawFacetOccurrences.set(row, identities);
    return identities;
  };
  const regular = schemaRegularLanguages(c);
  const decimalLanguages = schemaDecimalLanguages(c);
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
  const exactLayerComponents = new WeakMap<ScalarConstraintLayer, ExactFacetComponent>();
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
  const membershipWitness = (base: Description, expected: SchemaOperand, lexical: LexicalValue, owner: GraphNode): boolean | undefined => {
    c.step(owner);
    const accepts = (candidate: LexicalValue): boolean => {
      try {return values.sameValue(expected, operand(base, candidate, owner), owner);}
      catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error;}
      return false;
    };
    for (const candidate of schemaScalarWitnesses(expected, lexical, owner, c)) if (accepts(candidate)) return true;
    const decision = regularMembership(base, expected, lexical, owner);
    if (decision === true) return true;
    if (decision === false) return false;
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
    return undefined;
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
    // A narrowed ITEM/member may make an authentic enum value inactive.
    // Retention or NEW membership in the actual BASE is checked separately.
    if (facet.name === 'enumeration') return value;
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
  const sameFacetValue = (left: FacetProperty, right: FacetProperty, owner: GraphNode): boolean => {
    c.step(owner, 10);
    return sameFacetProperty({...left, fixed: false}, {...right, fixed: false}, owner);
  };
  const facetNames = (description: Description, owner: GraphNode): readonly string[] => {
    c.step(owner, description.facets.size * 2 + (description.intrinsic?.scalars.length ?? 0) * 2 + 2);
    return [...new Set([...description.facets.keys(), ...(description.intrinsic?.scalars.map(facet => facet.name) ?? [])])];
  };
  const patternProperties = (description: Description, owner: GraphNode): PatternProperty[] => {
    const components = currentRepeatableComponents(description, owner);
    c.step(owner, components.length * 3 + 2); const result: PatternProperty[] = [];
    for (const {component} of components) if (component.name === 'pattern') {
      c.step(owner, component.values.length + 2);
      result.push({expressions: component.values.map(value => value.lexical!), identity: component.identity});
    }
    return result;
  };
  /** Selected P1: one expression, with complete branches in supplied order. */
  const patternExpression = (expressions: readonly string[], owner: GraphNode): string => {
    c.step(owner, expressions.length + 1);
    for (const expression of expressions) c.text(expression, owner);
    if (expressions.length === 1) return expressions[0];
    // Charge the entire output before join allocates it, including separators.
    for (const expression of expressions) c.step(owner, expression.length);
    c.step(owner, Math.max(0, expressions.length - 1));
    return expressions.join('|');
  };
  const samePatternProperty = (a: PatternProperty, b: PatternProperty, owner: GraphNode): boolean => {
    c.step(owner);
    if (a.identity !== undefined && a.identity === b.identity) return true;
    const left = patternExpression(a.expressions, owner), right = patternExpression(b.expressions, owner);
    c.step(owner, left.length + right.length);
    return left === right;
  };
  const attachSourceStep = (layer: ScalarConstraintLayer, step: SourceFacetStep, owner: GraphNode): void => {
    c.step(owner, 4);
    if (!sourceSteps) {c.step(owner, 2); sourceSteps = new WeakMap();}
    sourceSteps.set(layer, step);
  };
  /** Source S replaces equal-valued base components; RAW groups already supply
   * a complete result. Neither case adds the raw alias's parent inventory. */
  const currentRepeatableComponents = (description: Description, owner: GraphNode): readonly CurrentRepeatableComponent[] => {
    c.step(owner, 3);
    const cached = currentComponents?.get(description); if (cached) return cached;
    c.step(owner, (description.intrinsic?.patterns.length ?? 0) * 7 + description.plan.layers.length * 3 + 3);
    let result: CurrentRepeatableComponent[] = (description.intrinsic?.patterns ?? []).map(expression =>
      ({component: {name: 'pattern', values: [{fixed: false, lexical: expression}], annotation: 'absent', identity: Object.freeze({})}}));
    for (const layer of description.plan.layers) for (const name of ['pattern', 'enumeration']) {
      c.step(owner, layer.facets.length * 5 + 3);
      const facets = layer.facets.filter(facet => facet.name === name); if (!facets.length) continue;
      let component = exactLayerComponents.get(layer);
      if (!component || component.name !== name) {
        c.step(owner, facets.length * 4 + 4);
        const payloads = facets.map(facet => boundAnnotationPayloads.get(facet) ?? sourceFacetPayloads.get(facet) ?? facet.annotation);
        component = {name, identity: layerIdentities.get(layer) ?? layer,
          values: facets.map(facet => name === 'pattern' ? {fixed: false, lexical: facet.lexical.value}
            : {fixed: false, operand: enumerations.get(layer)!.get(facet)!}),
          annotation: facets.length > 1 && payloads.some(payload => payload !== 'absent') ? undefined : payloads[0]};
      }
      if (sourceSteps?.has(layer)) {
        c.step(owner, result.length + 1);
        // Recompute dominance from formed H properties, never a transported
        // source visibility decision or an incidence-only value shortcut.
        result = result.filter(prior => exactValueRelation({...prior.component, identity: undefined},
          {...component, identity: undefined}, owner) !== 'equal');
      }
      c.step(owner, 2); result.push({component, layer});
    }
    c.step(owner, result.length * 2 + 4); const complete = Object.freeze(result.map(value => Object.freeze(value)));
    if (!currentComponents) {c.step(owner, 2); currentComponents = new WeakMap();}
    currentComponents.set(description, complete); return complete;
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
    let sourceStep = sourceRules && !!original;
    for (const facet of facets) {
      c.step(owner); c.text(facet.lexical.value, owner); allowFacet(base, facet, owner);
      c.step(owner, originalFacets.length + 1);
      const sourceFacet = originalFacets.find(item => item === facet);
      if ((facet.name === 'pattern' || facet.name === 'enumeration') && !sourceFacet) sourceStep = false;
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
        if (base.plan.whitespace === "member" || !(mode in rank) || !base.exactComponentSet && rank[mode as keyof typeof rank] < rank[base.plan.whitespace]) c.fail(owner, "whiteSpace-valid-restriction", "Whitespace facet cannot weaken normalization", facet.lexical.context.source);
        result.plan = {...result.plan, whitespace: mode as keyof typeof rank}; requirements.add("whitespace"); locals.set(facet.name, {facet});
      } else if (integerFacets.has(facet.name)) {
        const raw = normalizeWhitespace(facet.lexical.value, "collapse");
        if (!/^[+-]?[0-9]+$/.test(raw)) c.fail(owner, "facet-value", "Facet requires a nonnegative integer", facet.lexical.context.source);
        const integer = raw.replace(/^[+-]/, "").replace(/^0+(?=\d)/, "");
        if (raw.startsWith("-") && integer !== "0") c.fail(owner, "facet-value", "Facet requires a nonnegative integer", facet.lexical.context.source);
        if (facet.name === "totalDigits" && integer === "0") c.fail(owner, "totalDigits-valid-restriction", "totalDigits must be positive", facet.lexical.context.source);
        const prior = facetProperty(base, facet.name, owner)?.integer;
        if (prior !== undefined && !base.exactComponentSet) {
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
          if (!(error instanceof SchemaAssessmentError) || error.category !== "invalid-schema" || !exclusive(facet.name)) throw error;
          const inherited = scalarTuples(base, owner);
          c.step(owner, 16);
          const primitive = {...base, conjuncts: undefined, facets: new Map<string, {facet: Facet}>(), plan: {...base.plan, layers: []}};
          value = facetOperand(facet, primitive, owner);
          if (!inherited.some(prior => {
            c.step(owner); return prior.name === facet.name && values.sameValue(value, prior.property.operand!, owner);
          })) throw error;
        }
        locals.set(facet.name, {facet, operand: value}); requirements.add("numeric-bounds");
      }
      const inherited = facetProperty(base, facet.name, owner);
      if (inherited?.fixed && !base.exactComponentSet) {
        const local = locals.get(facet.name)!;
        if (local.integer !== undefined) c.text(local.integer, owner);
        if (inherited.integer !== undefined) c.text(inherited.integer, owner);
        if (inherited.lexical !== undefined) c.text(inherited.lexical, owner);
        if (local.integer !== inherited.integer || local.operand && inherited.operand && !values.sameValue(local.operand, inherited.operand, owner) || facet.name === "whiteSpace" && normalizeWhitespace(facet.lexical.value, "collapse") !== normalizeWhitespace(inherited.lexical!, "collapse")) c.fail(owner, "facet-fixed", "A fixed facet cannot change value", facet.lexical.context.source);
      }
    }
    for (const [name, constraint] of locals) {
      c.step(owner); result.facets.set(name, constraint);
      if (boundNames.includes(name) && !base.exactComponentSet) {
        const sameSide = lower(name) ? "min" : "max";
        for (const priorName of boundNames) {
          const prior = facetProperty(base, priorName, owner); if (!prior?.operand) continue;
          const order = values.compare(constraint.operand!, prior.operand, owner);
          // The primary facet-validity rules prohibit specified relations;
          // an indeterminate comparison is not itself one of those relations.
          if (order === undefined) continue;
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
    if (!sourceRules || !base.exactComponentSet) checkLengthProperties(result, owner, sourceRules);
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
    if (sourceStep && (seen.has('pattern') || seen.has('enumeration'))) {
      c.step(owner, 3); attachSourceStep(installed, Object.freeze({sourceOwner: owner.id, facets: originalFacets}), owner);
    }
    result.plan = {...result.plan, layers: [...base.plan.layers, installed], enforcement: [...requirements]};
    if (base.conjuncts) {
      c.step(owner, base.conjuncts.length * 8 + 1);
      result.conjuncts = base.conjuncts.map(conjunct => {
        c.step(owner, conjunct.facets.size * 3 + 1);
        // A local scalar kind replaces all inherited components of that kind.
        // Retaining their old enforcement would hide an illegal weakening.
        const retained = sourceRules && base.exactComponentSet
          ? new Map([...conjunct.facets].filter(([name]) => !locals.has(name))) : conjunct.facets;
        return {...conjunct, facets: retained, plan: {...conjunct.plan, whitespace: result.plan.whitespace}};
      });
    }
    if (sourceRules && base.exactComponentSet) {
      c.step(owner, base.exactComponentSet.length * 2 + locals.size * 6 + 2);
      const components = base.exactComponentSet.filter(component => !locals.has(component.name));
      for (const [name, constraint] of locals) {
        components.push({name, values: [facetProperty(result, name, owner)!], facet: constraint.facet,
          annotation: boundAnnotationPayloads.get(constraint.facet) ?? sourceFacetPayloads.get(constraint.facet)});
      }
      for (const name of ['pattern', 'enumeration']) {
        c.step(owner, facets.length * 7 + 4);
        const entries = facets.filter(facet => facet.name === name);
        if (!entries.length) continue;
        const payloads = entries.map(facet => boundAnnotationPayloads.get(facet) ?? sourceFacetPayloads.get(facet));
        components.push({name, identity: installed, values: entries.map(facet => name === 'pattern'
          ? {fixed: false, lexical: facet.lexical.value} : {fixed: false, operand: localEnumerations.get(facet)!}),
        annotation: entries.length > 1 && payloads.some(payload => payload !== 'absent') ? undefined : payloads[0]});
      }
      result.exactComponentSet = components;
      if (!exactScalarRestriction(base, result, owner)) {
        c.step(owner, (result.plan.obligations?.length ?? 0) + 3);
        result.plan = {...result.plan, obligations: [...(result.plan.obligations ?? []),
          {rule: 'raw-simple-facet-restriction-validity', component: owner.id}]};
      }
    }
    return result;
  };
  const reducedScalarIdentity = (description: Description, name: string, owner: GraphNode): object | undefined => {
    c.step(owner, 5); const found = c.context.lookup(description.definition);
    if (found.kind !== 'found' || found.node.kind !== 'simpleType') return undefined;
    const row = c.context.rawSimpleTypeProperties(description.definition); if (!row) return undefined;
    let identities = rawReducedScalarOccurrences.get(row);
    if (!identities) {c.step(owner, 3); identities = new Map(); rawReducedScalarOccurrences.set(row, identities);}
    c.text(name, owner); let identity = identities.get(name);
    if (!identity) {c.step(owner, 4); identity = Object.freeze({}); identities.set(name, identity);}
    return identity;
  };
  /** Exact scalar inventories retain each tuple; legacy layers expose their normal form. */
  const scalarTuples = (description: Description, owner: GraphNode): ScalarTuple[] => {
    c.step(owner); const tuples: ScalarTuple[] = [];
    if (description.exactComponentSet) {
      for (let index = 0; index < description.exactComponentSet.length; index++) {
        c.step(owner, 8); const component = description.exactComponentSet[index];
        if (component.name === 'pattern' || component.name === 'enumeration') continue;
        tuples.push({name: component.name, property: component.values[0], facet: component.facet,
          annotation: component.annotation, identity: component.identity ?? component, annotationIdentity: component.annotationIdentity});
      }
    } else for (const name of facetNames(description, owner)) {
      c.step(owner, 6); const facet = description.facets.get(name)?.facet;
      tuples.push({name, property: facetProperty(description, name, owner)!, facet, identity: reducedScalarIdentity(description, name, owner),
        annotation: facet ? boundAnnotationPayloads.get(facet) ?? sourceFacetPayloads.get(facet) ?? facet.annotation : 'absent'});
    }
    return tuples;
  };
  /** VALUE also tests physical legacy conjuncts hidden by the public reduction. */
  const valueFacetTuples = (description: Description, owner: GraphNode): ScalarTuple[] => {
    c.step(owner, 4); const result: ScalarTuple[] = [], pending = [description], seen = new Set<Description>();
    while (pending.length) {
      c.step(owner, 3); const current = pending.pop()!;
      if (seen.has(current)) continue;
      c.step(owner, 2); seen.add(current);
      for (const tuple of scalarTuples(current, owner)) {c.step(owner, 2); result.push(tuple);}
      for (const conjunct of current.conjuncts ?? []) {c.step(owner, 2); pending.push(conjunct);}
    }
    return result;
  };
  const restrictsScalar = (derived: ScalarTuple, base: ScalarTuple, owner: GraphNode): boolean => {
    c.step(owner);
    if (derived.name !== base.name) return false;
    const d = derived.property, b = base.property, name = derived.name;
    if (integerFacets.has(name)) {
      const order = c.algebra.compare(d.integer!, b.integer!);
      return name === 'length' ? order === 0 : name === 'minLength' ? order >= 0 : order <= 0;
    }
    if (boundNames.includes(name)) {
      const order = values.compare(d.operand!, b.operand!, owner);
      return order !== undefined && (lower(name) ? order >= 0 : order <= 0);
    }
    c.text(d.lexical!, owner); c.text(b.lexical!, owner); c.step(owner, 8);
    const rank: Record<string, number> = {preserve: 0, replace: 1, collapse: 2};
    return rank[normalizeWhitespace(d.lexical!, 'collapse')] >= rank[normalizeWhitespace(b.lexical!, 'collapse')];
  };
  const compatibleScalar = (derived: ScalarTuple, base: ScalarTuple, owner: GraphNode): boolean => {
    if (!boundNames.includes(derived.name)) return restrictsScalar(derived, base, owner);
    const order = values.compare(derived.property.operand!, base.property.operand!, owner);
    return order === undefined || (lower(derived.name) ? order >= 0 : order <= 0);
  };
  const regularPatterns = new WeakMap<SchemaPattern, RegularLanguage>();
  const patternLanguage = (pattern: SchemaPattern, owner: GraphNode): RegularLanguage => {
    c.step(owner); const known = regularPatterns.get(pattern); if (known) return known;
    const language = patternOwner(pattern).language(pattern, owner, regular);
    c.step(owner, 2); regularPatterns.set(pattern, language); return language;
  };
  const expressionLanguages = new Map<string, RegularLanguage>();
  const expressionLanguage = (expression: string | null, owner: GraphNode): RegularLanguage => {
    if (expression === null) return regular.union([], owner);
    c.text(expression, owner); c.step(owner); const known = expressionLanguages.get(expression); if (known) return known;
    const language = patternLanguage(patterns.compile({value: expression, context: owner.context}, owner), owner);
    c.step(owner, 2); expressionLanguages.set(expression, language); return language;
  };
  const ieeeLanguages = schemaIeeeLanguages<GraphNode>(c, regular, expressionLanguage);
  const calendarLanguages = schemaCalendarLanguages<GraphNode>(c, regular, expressionLanguage);
  const durationLanguages = schemaDurationLanguages<GraphNode>(c, regular, expressionLanguage);
  const valueImages = schemaValueImages<GraphNode>(c, regular, expressionLanguage);
  const calendarImages = schemaCalendarImages<GraphNode>(c, regular, expressionLanguage);
  const numericImages = schemaNumericImageConditions<GraphNode>(c, regular, ieeeLanguages, expressionLanguage);
  const lexicalPredicates = schemaLexicalPredicates<GraphNode>(c, regular, numericImages);
  const quoteExpression = (value: string, owner: GraphNode): string => {
    c.text(value, owner); c.step(owner, value.length * 2 + 1);
    return value.replace(/[\\.\-^?*+{}()\[\]|]/g, '\\$&').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  };
  /** null is a proved empty inverse; undefined leaves the representation unsupported. */
  const inverseExpression = (value: SchemaOperand, lexical: LexicalValue, owner: GraphNode): string | null | undefined => {
    c.text(value.canonical, owner);
    if (value.family === 'string' || value.family === 'anyURI') return quoteExpression(value.canonical, owner);
    if (value.family === 'boolean') return value.canonical === 'true' ? '(true|1)' : '(false|0)';
    if (value.family === 'decimal') {
      if (value.canonical === '0') return '[+\\-]?(0+([.]0*)?|[.]0+)';
      const negative = value.canonical.startsWith('-'), unsigned = negative ? value.canonical.slice(1) : value.canonical;
      const [integer, fraction] = unsigned.split('.'), sign = negative ? '\\-' : '[+]?';
      c.step(owner, value.canonical.length * 4 + 8);
      return fraction === undefined ? `${sign}0*${integer}([.]0*)?`
        : integer === '0' ? `${sign}0*[.]${fraction}0*` : `${sign}0*${integer}[.]${fraction}0*`;
    }
    if (value.family === 'hexBinary') {
      c.step(owner, value.canonical.length * 5 + 1); const pieces: string[] = [];
      for (const char of value.canonical) {c.step(owner, 5); pieces.push(/[a-f]/.test(char) ? `[${char}${char.toUpperCase()}]` : char);}
      c.step(owner, value.canonical.length * 4 + 1); return pieces.join('');
    }
    if (value.family === 'base64Binary') {
      c.step(owner, value.canonical.length * 8 + 4);
      const text = Buffer.from(value.canonical, 'hex').toString('base64');
      c.step(owner, text.length * 8 + 4);
      return [...text].map(char => quoteExpression(char, owner)).join(' *');
    }
    if (value.family === 'QName' || value.family === 'NOTATION') {
      c.step(owner, value.canonical.length * 3 + 4);
      const [namespace, local] = JSON.parse(value.canonical) as [string, string], expressions: string[] = [];
      for (const prefix in lexical.context.namespaces) {
        c.text(prefix, owner); c.text(lexical.context.namespaces[prefix], owner);
        if (lexical.context.namespaces[prefix] === namespace) {c.step(owner, prefix.length + local.length + 4); expressions.push(quoteExpression(prefix ? prefix + ':' + local : local, owner));}
      }
      if (namespace === '' && lexical.context.namespaces[''] === undefined) expressions.push(quoteExpression(local, owner));
      c.step(owner, expressions.length * 2 + 2); return expressions.length ? '(' + expressions.join('|') + ')' : null;
    }
    if (value.family === 'list' && value.items) {
      c.step(owner, value.items.length * 2 + 2); const expressions: string[] = []; let unsupported = false;
      for (const item of value.items) {
        const expression = inverseExpression(item, lexical, owner);
        if (expression === null) return null;
        if (expression === undefined) {unsupported = true; continue;}
        c.step(owner, expression.length + 4); expressions.push('(' + expression + ')');
      }
      c.step(owner, expressions.length * 2 + 1); return unsupported ? undefined : expressions.join(' ');
    }
    return undefined;
  };
  /** Lexical overapproximation; only proved-exact domains certify negatives. */
  const primitiveLexicalExpression = (description: Description): string | undefined => {
    const primitive = description.plan.primitive;
    if (primitive === 'decimal') return !description.rawProperties && description.plan.builtin !== 'decimal'
      ? '[+\\-]?[0-9]+' : '[+\\-]?([0-9]+([.][0-9]*)?|[.][0-9]+)';
    if (primitive === 'boolean') return 'true|false|1|0';
    if (primitive === 'float' || primitive === 'double') return 'INF|\\-INF|NaN|[+\\-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+\\-]?[0-9]+)?';
    if (primitive === 'hexBinary') return '([0-9a-fA-F]{2})*';
    if (primitive === 'base64Binary') return '([A-Za-z0-9+/] *[A-Za-z0-9+/] *[A-Za-z0-9+/] *[A-Za-z0-9+/] *)*([A-Za-z0-9+/] *[AQgw] *= *=|[A-Za-z0-9+/] *[A-Za-z0-9+/] *[AEIMQUYcgkosw048] *=)?';
    if (primitive === 'dateTime') return '\\-?[0-9]{4,}\\-[0-9]{2}\\-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+\\-][0-9]{2}:[0-9]{2})?';
    if (primitive === 'date') return '\\-?[0-9]{4,}\\-[0-9]{2}\\-[0-9]{2}(Z|[+\\-][0-9]{2}:[0-9]{2})?';
    if (primitive === 'duration') return '\\-?P([0-9]+Y)?([0-9]+M)?([0-9]+D)?(T([0-9]+H)?([0-9]+M)?([0-9]+([.][0-9]+)?S)?)?';
    if (primitive === 'time') return '[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+\\-][0-9]{2}:[0-9]{2})?';
    if (primitive === 'gYearMonth') return '\\-?[0-9]{4,}\\-[0-9]{2}(Z|[+\\-][0-9]{2}:[0-9]{2})?';
    if (primitive === 'gYear') return '\\-?[0-9]{4,}(Z|[+\\-][0-9]{2}:[0-9]{2})?';
    if (primitive === 'gMonthDay') return '\\-\\-[0-9]{2}\\-[0-9]{2}(Z|[+\\-][0-9]{2}:[0-9]{2})?';
    if (primitive === 'gDay') return '\\-\\-\\-[0-9]{2}(Z|[+\\-][0-9]{2}:[0-9]{2})?';
    if (primitive === 'gMonth') return '\\-\\-[0-9]{2}(Z|[+\\-][0-9]{2}:[0-9]{2})?';
    return undefined;
  };
  const spellingConstraints = (description: Description, owner: GraphNode): RegularLanguage[] => {
    c.step(owner, 2); const constraints: RegularLanguage[] = [];
    if (description.plan.whitespace !== 'member') constraints.push(normalizedStringLanguage(description, owner));
    const grammar = primitiveLexicalExpression(description);
    if (grammar !== undefined) constraints.push(expressionLanguage(grammar, owner));
    if (description.plan.primitive === 'anyURI') constraints.push(expressionLanguage(schemaUriExpression(owner, c), owner));
    for (const layer of description.plan.layers) {
      c.step(owner, layer.patterns.length + 1);
      if (layer.patterns.length) constraints.push(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner));
    }
    return constraints;
  };
  const decimalFacetLanguage = (tuple: ScalarTuple, owner: GraphNode): RegularLanguage | undefined => {
    if (tuple.name === 'totalDigits' || tuple.name === 'fractionDigits')
      return expressionLanguage(decimalLanguages.precision(tuple.name, tuple.property.integer!, owner), owner);
    if (!boundNames.includes(tuple.name)) return undefined;
    const operand = tuple.property.operand!;
    if (operand.family !== 'decimal') return undefined;
    const greater = tuple.name === 'maxInclusive' || tuple.name === 'minExclusive';
    const expression = decimalLanguages.relation(operand.canonical, greater, owner);
    const language = expression === undefined ? regular.union([], owner) : expressionLanguage(expression, owner);
    return exclusive(tuple.name) ? language : regular.negate(language, owner);
  };
  const decimalContainment = (base: Description, result: Description, inherited: readonly ScalarTuple[], supplied: readonly ScalarTuple[], owner: GraphNode): boolean => {
    if (result.plan.primitive !== 'decimal') return false;
    const missing = inherited.filter(prior => !supplied.some(derived => restrictsScalar(derived, prior, owner)));
    c.step(owner, 3); const constraints = spellingConstraints(result, owner);
    for (const tuple of supplied) {
      const language = decimalFacetLanguage(tuple, owner); if (language) {c.step(owner); constraints.push(language);}
    }
    for (const layer of result.plan.layers) {
      const members = enumerations.get(layer);
      if (members?.size) {
        c.step(owner, 2); const choices: RegularLanguage[] = [];
        for (const [facet, value] of members) {
          c.step(owner); const expression = inverseExpression(value, facet.lexical, owner);
          if (expression !== undefined) choices.push(expressionLanguage(expression, owner));
        }
        constraints.push(regular.union(choices, owner));
      }
    }
    for (const prior of missing) {
      const language = decimalFacetLanguage(prior, owner); if (!language) return false;
      c.step(owner, constraints.length + 2);
      const word = regular.witness(regular.intersect([...constraints, regular.negate(language, owner)], owner), owner);
      if (word !== undefined) {
        const assessed = operand(result, {value: word, context: owner.context}, owner);
        if (!excludedByValueFacets(base, assessed, owner)) throw new TypeError('Decimal language counterexample must violate a base value facet');
        c.fail(owner, 'scalar-value-space-restriction', 'A derived decimal value is excluded by a base bound or precision facet');
      }
    }
    return true;
  };
  const ieeeContainment = (base: Description, result: Description, inherited: readonly ScalarTuple[], supplied: readonly ScalarTuple[], owner: GraphNode): boolean => {
    const family = result.plan.primitive; if (family !== 'float' && family !== 'double') return false;
    const bounds: IeeeBound[] = [];
    for (const tuple of supplied) {
      c.step(owner); if (boundNames.includes(tuple.name)) bounds.push({name: tuple.name as IeeeBound['name'], value: tuple.property.operand!});
    }
    const language = regular.intersect(spellingConstraints(result, owner), owner);
    for (const prior of inherited) {
      if (supplied.some(derived => restrictsScalar(derived, prior, owner))) continue;
      if (!boundNames.includes(prior.name)) return false;
      const word = ieeeLanguages.wideningWitness(language, family, bounds, {name: prior.name as IeeeBound['name'], value: prior.property.operand!}, owner);
      if (word !== undefined) {
        let assessed: SchemaOperand;
        try {assessed = operand(result, {value: word, context: owner.context}, owner);}
        catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error; return false;}
        if (!excludedByValueFacets(base, assessed, owner)) throw new TypeError('IEEE interval product must issue a base-facet counterexample');
        c.fail(owner, 'scalar-value-space-restriction', 'A derived IEEE value is excluded by a base bound');
      }
    }
    return true;
  };
  const calendarContainment = (base: Description, result: Description, inherited: readonly ScalarTuple[], supplied: readonly ScalarTuple[], owner: GraphNode): boolean => {
    if (!['dateTime', 'date', 'time', 'gYear', 'gYearMonth', 'gMonthDay', 'gDay', 'gMonth'].includes(result.plan.primitive!)) return false;
    const source = regular.intersect(spellingConstraints(result, owner), owner), predicates: RegularLanguage[] = [source];
    for (const tuple of supplied) if (boundNames.includes(tuple.name)) {
      predicates.push(calendarLanguages.bound(source, tuple.property.operand!.calendar!, tuple.name as IeeeBound['name'], owner));
    }
    for (const prior of inherited) {
      if (supplied.some(derived => restrictsScalar(derived, prior, owner))) continue;
      if (!boundNames.includes(prior.name)) return false;
      const predicate = calendarLanguages.bound(source, prior.property.operand!.calendar!, prior.name as IeeeBound['name'], owner);
      c.step(owner, predicates.length + 4);
      const word = regular.witness(regular.intersect([...predicates, regular.negate(predicate, owner)], owner), owner);
      if (word !== undefined) {
        let value: SchemaOperand;
        try {value = operand(result, {value: word, context: owner.context}, owner);}
        catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error; return false;}
        if (!excludedByValueFacets(base, value, owner)) throw new TypeError('Calendar preimage must issue a base-facet counterexample');
        c.fail(owner, 'scalar-value-space-restriction', 'A derived calendar value is excluded by a base bound');
      }
    }
    return true;
  };
  const durationContainment = (base: Description, result: Description, inherited: readonly ScalarTuple[], supplied: readonly ScalarTuple[], owner: GraphNode): boolean => {
    if (result.plan.primitive !== 'duration') return false;
    const source = regular.intersect(spellingConstraints(result, owner), owner), predicates: RegularLanguage[] = [source];
    for (const tuple of supplied) if (boundNames.includes(tuple.name))
      predicates.push(durationLanguages.bound(source, tuple.property.operand!.duration!, tuple.name as IeeeBound['name'], owner));
    for (const prior of inherited) {
      if (supplied.some(derived => restrictsScalar(derived, prior, owner))) continue;
      if (!boundNames.includes(prior.name)) return false;
      const predicate = durationLanguages.bound(source, prior.property.operand!.duration!, prior.name as IeeeBound['name'], owner);
      const word = regular.witness(regular.intersect([...predicates, regular.negate(predicate, owner)], owner), owner);
      if (word !== undefined) {
        const value = operand(result, {value: word, context: owner.context}, owner);
        if (!excludedByValueFacets(base, value, owner)) throw new TypeError('Duration preimage must issue a base-facet counterexample');
        c.fail(owner, 'scalar-value-space-restriction', 'A derived duration value is excluded by a base bound');
      }
    }
    return true;
  };
  /** Exact normalized lexical admission where the predicates are regular. */
  const admissionLanguage = (description: Description, lexical: LexicalValue, owner: GraphNode): RegularLanguage | undefined => {
    if (description.plan.variety === 'union') return undefined;
    const constraints = spellingConstraints(description, owner), tuples = scalarTuples(description, owner);
    if (!description.rawProperties) for (const value of description.intrinsic?.patterns ?? []) {
      const pattern = intrinsicPatterns.compile({value, context: lexical.context}, owner); intrinsicCompiled.add(pattern);
      constraints.push(patternLanguage(pattern, owner));
    }
    if (description.plan.variety === 'list') {
      const admittedItem = admissionLanguage(description.item!, lexical, owner); if (!admittedItem) return undefined;
      const item = regular.intersect([admittedItem, expressionLanguage('[^ \\t\\r\\n]+', owner)], owner);
      const nonempty = regular.concatenate([item, regular.repeat(regular.concatenate([expressionLanguage(' ', owner), item], owner), 0, 'unbounded', owner)], owner);
      constraints.push(regular.union([expressionLanguage('', owner), nonempty], owner));
    }
    if (description.plan.primitive === 'QName' || description.plan.primitive === 'NOTATION') {
      const name = intrinsicPatterns.compile({value: '[\\i-[:]][\\c-[:]]*', context: lexical.context}, owner); intrinsicCompiled.add(name);
      const local = patternLanguage(name, owner), choices: RegularLanguage[] = [local];
      for (const prefix in lexical.context.namespaces) if (prefix) {
        c.text(prefix, owner); choices.push(regular.concatenate([expressionLanguage(quoteExpression(prefix + ':', owner), owner), local], owner));
      }
      constraints.push(regular.union(choices, owner));
    }
    if (['dateTime', 'date', 'time', 'gYear', 'gYearMonth', 'gMonthDay', 'gDay', 'gMonth'].includes(description.plan.primitive!))
      constraints.push(calendarLanguages.valid(description.plan.primitive as NonNullable<SchemaOperand['calendar']>['family'], owner));
    if (description.plan.primitive === 'duration') constraints.push(durationLanguages.valid(owner));
    let source = regular.intersect(constraints, owner);
    for (const tuple of tuples) {
      let language: RegularLanguage | undefined;
      if (lengthNames.includes(tuple.name)) {
        if (description.plan.primitive === 'QName' || description.plan.primitive === 'NOTATION') continue;
        language = valueLengthLanguage(description, tuple.name, tuple.property.integer!, owner);
      } else if (description.plan.primitive === 'decimal') language = decimalFacetLanguage(tuple, owner);
      else if (boundNames.includes(tuple.name)) {
        if (tuple.property.operand?.calendar) language = calendarLanguages.bound(source, tuple.property.operand.calendar, tuple.name as IeeeBound['name'], owner);
        else if (tuple.property.operand?.duration) language = durationLanguages.bound(source, tuple.property.operand.duration, tuple.name as IeeeBound['name'], owner);
        else if (description.plan.primitive === 'float' || description.plan.primitive === 'double') return undefined;
      }
      if (language) constraints.push(language);
    }
    source = regular.intersect(constraints, owner);
    for (const layer of description.plan.layers) {
      const members = enumerations.get(layer); if (!members?.size) continue;
      const choices: RegularLanguage[] = [];
      for (const value of members.values()) {
        if (description.plan.variety === 'atomic' && value.family !== description.plan.primitive) continue;
        if (description.plan.variety === 'list' && (value.family !== 'list' || !value.items
          || description.item!.plan.variety !== 'atomic' || value.items.some(item => item.family !== description.item!.plan.primitive))) continue;
        const inverse = inverseExpression(value, lexical, owner);
        if (inverse !== undefined) choices.push(expressionLanguage(inverse, owner));
        else if (value.calendar) for (const alias of calendarAliasExpressions(value.calendar, owner, c)) choices.push(expressionLanguage(alias, owner));
        else if (value.duration) for (const alias of durationAliasExpressions(value.duration, owner, c,
          alias => regular.witness(regular.intersect([source, expressionLanguage(alias, owner)], owner), owner) !== undefined)) choices.push(expressionLanguage(alias, owner));
        else return undefined;
      }
      constraints.push(regular.union(choices, owner));
    }
    for (const conjunct of description.conjuncts ?? []) {const language = admissionLanguage(conjunct, lexical, owner); if (!language) return undefined; constraints.push(language);}
    return regular.intersect(constraints, owner);
  };
  const ieeeAdmission = (description: Description, owner: GraphNode) => {
    const family = description.plan.primitive as 'float' | 'double', tuples = scalarTuples(description, owner);
    const bounds: IeeeBound[] = tuples.filter(tuple => boundNames.includes(tuple.name)).map(tuple => ({name: tuple.name as IeeeBound['name'], value: tuple.property.operand!}));
    let {intervals, literals} = ieeeLanguages.boundIntervals(family, bounds, owner);
    for (const layer of description.plan.layers) {
      const members = enumerations.get(layer); if (!members?.size) continue;
      const selected: IeeeInputInterval[] = [], selectedLiterals: string[] = [];
      for (const value of members.values()) {
        c.step(owner); if (value.family !== family || excludedByValueFacets(description, value, owner)) continue;
        selected.push(...ieeeLanguages.inverseIntervals(value, owner));
        if (value.canonical === 'NaN') selectedLiterals.push('NaN');
        if (value.canonical === 'Infinity' || value.canonical === '-Infinity') selectedLiterals.push(value.canonical === 'Infinity' ? 'INF' : '-INF');
      }
      const outside = ieeeLanguages.subtractIntervals([{negative: false}, {negative: true}], selected, owner);
      intervals = [...ieeeLanguages.subtractIntervals(intervals, outside, owner)]; literals = literals.filter(value => selectedLiterals.includes(value));
    }
    return {intervals, literals};
  };
  const atomicAdmissionPredicate = (description: Description, lexical: LexicalValue, owner: GraphNode): LexicalPredicate | undefined => {
    if (description.plan.variety !== 'atomic') return undefined;
    const mode = description.plan.whitespace as 'preserve' | 'replace' | 'collapse';
    if (description.plan.primitive !== 'float' && description.plan.primitive !== 'double') {
      const language = admissionLanguage(description, lexical, owner); return language && {kind: 'regular', language: regular.whitespacePreimage(language, mode, owner)};
    }
    c.step(owner, 5); const accepted = ieeeAdmission(description, owner), children: LexicalPredicate[] = [
      {kind: 'regular', language: regular.whitespacePreimage(regular.intersect(spellingConstraints(description, owner), owner), mode, owner)},
      {kind: 'numeric', condition: {...accepted, nonNumeric: false}},
    ];
    for (const conjunct of description.conjuncts ?? []) {
      const predicate = scalarAdmissionPredicate(conjunct, lexical, owner); if (!predicate) return undefined; children.push(predicate);
    }
    return {kind: 'and', children};
  };
  const inversePredicate = (expected: SchemaOperand, lexical: LexicalValue, source: RegularLanguage, mode: 'preserve' | 'replace' | 'collapse', owner: GraphNode): LexicalPredicate | undefined => {
    if (expected.family === 'float' || expected.family === 'double') {
      const literals = expected.canonical === 'NaN' ? ['NaN'] : expected.canonical === 'Infinity' ? ['INF'] : expected.canonical === '-Infinity' ? ['-INF'] : [];
      return {kind: 'numeric', condition: {intervals: ieeeLanguages.inverseIntervals(expected, owner), literals, nonNumeric: false}};
    }
    const inverse = inverseExpression(expected, lexical, owner); let language: RegularLanguage;
    if (inverse !== undefined) language = expressionLanguage(inverse, owner);
    else if (expected.family === 'QName' || expected.family === 'NOTATION') language = regular.union([], owner);
    else if (expected.calendar) {
      c.step(owner, 2); const choices: RegularLanguage[] = [];
      for (const alias of calendarAliasExpressions(expected.calendar, owner, c)) choices.push(expressionLanguage(alias, owner));
      language = regular.union(choices, owner);
    } else if (expected.duration) {
      c.step(owner, 2); const choices: RegularLanguage[] = [];
      for (const alias of durationAliasExpressions(expected.duration, owner, c,
        alias => regular.witness(regular.intersect([source, expressionLanguage(alias, owner)], owner), owner) !== undefined)) choices.push(expressionLanguage(alias, owner));
      language = regular.union(choices, owner);
    } else return undefined;
    return {kind: 'regular', language: regular.whitespacePreimage(regular.intersect([language, source], owner), mode, owner)};
  };
  const fixedAtomicPredicate = (description: Description, expected: SchemaOperand, lexical: LexicalValue, owner: GraphNode): LexicalPredicate | undefined => {
    if (description.plan.variety !== 'atomic') return undefined;
    if (description.plan.primitive !== expected.family || excludedByValueFacets(description, expected, owner) || excludedByEnumeration(description, expected, owner))
      return {kind: 'regular', language: regular.union([], owner)};
    const admitted = atomicAdmissionPredicate(description, lexical, owner); if (!admitted) return undefined;
    const inverse = inversePredicate(expected, lexical, regular.intersect(spellingConstraints(description, owner), owner),
      description.plan.whitespace as 'preserve' | 'replace' | 'collapse', owner);
    return inverse && {kind: 'and', children: [admitted, inverse]};
  };
  const fixedScalarScope = (description: Description, expected: SchemaOperand, lexical: LexicalValue, owner: GraphNode): RegularLanguage | undefined => {
    if (expected.family === 'list') return undefined;
    if (expected.family !== 'string' && expected.family !== 'anyURI' && expected.family !== 'base64Binary')
      return regular.whitespacePreimage(expressionLanguage('([^ \\t\\r\\n]+)?', owner), 'collapse', owner);
    const inverse = inverseExpression(expected, lexical, owner); if (inverse === undefined) return undefined;
    const candidates = description.plan.variety === 'union' ? description.members! : [description], languages: RegularLanguage[] = [];
    for (const member of candidates) if (member.plan.primitive === expected.family) {
      const mode = member.plan.whitespace as 'preserve' | 'replace' | 'collapse';
      languages.push(regular.whitespacePreimage(regular.intersect([expressionLanguage(inverse, owner), normalizedStringLanguage(member, owner)], owner), mode, owner));
    }
    return regular.union(languages, owner);
  };
  /** Compile a numeric guard only after proving its scoped spellings have no
   * exponent. Decimal rounding cells then have exact regular preimages. */
  const regularPredicateInScope = (predicate: LexicalPredicate, scope: RegularLanguage, owner: GraphNode): RegularLanguage | undefined => {
    const choices: RegularLanguage[] = [], grammar = expressionLanguage('INF|\\-INF|NaN|[+\\-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+\\-]?[0-9]+)?', owner);
    const exponential = regular.whitespacePreimage(expressionLanguage('[+\\-]?([0-9]+([.][0-9]*)?|[.][0-9]+)[eE][+\\-]?[0-9]+', owner), 'collapse', owner);
    for (const branch of lexicalPredicates.branches(predicate, scope, owner)) {
      const missing = numericImages.difference(numericImages.all(), branch.numeric, owner);
      if (!missing.nonNumeric && !missing.intervals.length && !missing.literals.length) {choices.push(branch.language); continue;}
      if (!numericImages.exists(branch.language, branch.numeric, owner)) continue;
      if (!numericImages.exists(branch.language, missing, owner)) {choices.push(branch.language); continue;}
      const accepted = [regular.whitespacePreimage(ieeeLanguages.decimalInputLanguage(branch.numeric.intervals, branch.numeric.literals, owner), 'collapse', owner)];
      const exponentialSource = regular.intersect([branch.language, exponential], owner);
      if (regular.witness(exponentialSource, owner) !== undefined) {
        const unsigned = regular.whitespacePreimage(expressionLanguage('[+]?[0-9]+[eE][+]?[0-9]+', owner), 'collapse', owner);
        if (regular.witness(regular.intersect([exponentialSource, regular.negate(unsigned, owner)], owner), owner) !== undefined) return undefined;
        accepted.push(regular.whitespacePreimage(ieeeLanguages.unsignedExponentialLanguage(regular.whitespaceImage(exponentialSource, 'collapse', owner), branch.numeric.intervals, owner), 'collapse', owner));
      }
      if (branch.numeric.nonNumeric) accepted.push(regular.negate(regular.whitespacePreimage(grammar, 'collapse', owner), owner));
      c.step(owner, 3); choices.push(regular.intersect([branch.language, regular.union(accepted, owner)], owner));
    }
    return regular.union(choices, owner);
  };
  /** Exact list admission restricted to all token paths of a whole-word DFA.
   * The quotient preserves every permitted token boundary, including binary
   * aliases whose spaces disappear only in the subsequent value projection. */
  const listAdmissionInScope = (description: Description, lexical: LexicalValue, scope: RegularLanguage, owner: GraphNode): RegularLanguage | undefined => {
    const token = expressionLanguage('[^ \\t\\r\\n]+', owner), space = expressionLanguage(' ', owner);
    const normal = regular.whitespaceImage(scope, 'collapse', owner);
    const tokenScope = regular.intersect([token, regular.quotient(normal,
      regular.repeat(regular.concatenate([token, space], owner), 0, 'unbounded', owner),
      regular.repeat(regular.concatenate([space, token], owner), 0, 'unbounded', owner), owner)], owner);
    const predicate = scalarAdmissionPredicate(description.item!, lexical, owner); if (!predicate) return undefined;
    const item = regularPredicateInScope(predicate, tokenScope, owner); if (!item) return undefined;
    const constraints = [...spellingConstraints(description, owner), regular.union([expressionLanguage('', owner),
      regular.concatenate([item, regular.repeat(regular.concatenate([space, item], owner), 0, 'unbounded', owner)], owner)], owner)];
    for (const tuple of scalarTuples(description, owner)) if (lengthNames.includes(tuple.name)) constraints.push(valueLengthLanguage(description, tuple.name, tuple.property.integer!, owner)!);
    for (const layer of description.plan.layers) {
      const members = enumerations.get(layer); if (!members?.size) continue;
      const alternatives: RegularLanguage[] = [];
      for (const value of members.values()) if (value.family === 'list' && value.items) {
        const sequence: RegularLanguage[] = []; let complete = true;
        for (let index = 0; index < value.items.length; index++) {
          const fixed = scalarAdmissionPredicate(description.item!, lexical, owner, value.items[index]);
          const admitted = fixed && regularPredicateInScope(fixed, tokenScope, owner);
          if (!admitted) {complete = false; break;}
          if (index) sequence.push(space); sequence.push(admitted);
        }
        if (!complete) return undefined;
        alternatives.push(regular.concatenate(sequence, owner));
      }
      constraints.push(regular.union(alternatives, owner));
    }
    for (const conjunct of description.conjuncts ?? []) {
      const admitted = listAdmissionInScope(conjunct, lexical, scope, owner); if (!admitted) return undefined;
      constraints.push(regular.whitespaceImage(admitted, 'collapse', owner));
    }
    return regular.whitespacePreimage(regular.intersect(constraints, owner), 'collapse', owner);
  };
  const scopedListAdmissionPredicate = (description: Description, lexical: LexicalValue, scope: RegularLanguage, owner: GraphNode): LexicalPredicate | undefined => {
    const normalized = regular.whitespaceImage(scope, 'collapse', owner);
    const multiple = expressionLanguage('[^ \\t\\r\\n]+( [^ \\t\\r\\n]+)+', owner);
    if (regular.witness(regular.intersect([normalized, multiple], owner), owner) !== undefined) {
      const finite = regular.finiteWords(normalized, owner); if (finite.kind !== 'finite') return undefined;
      c.step(owner, 2); const admitted: RegularLanguage[] = [];
      for (const word of finite.words) {
        try {operand(description, {...lexical, value: word}, owner); admitted.push(expressionLanguage(quoteExpression(word, owner), owner));}
        catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error;}
      }
      return {kind: 'regular', language: regular.whitespacePreimage(regular.union(admitted, owner), 'collapse', owner)};
    }
    c.step(owner, 3); const alternatives: LexicalPredicate[] = [];
    const onToken = (predicate: LexicalPredicate): LexicalPredicate => {
      c.step(owner, 3); const mapped = new Map<LexicalPredicate, LexicalPredicate>(), pending = [{node: predicate, ready: false}], token = expressionLanguage('[^ \\t\\r\\n]+', owner);
      while (pending.length) {
        c.step(owner); const frame = pending.pop()!, node = frame.node;
        if (mapped.has(node)) continue;
        if (node.kind === 'regular') mapped.set(node, {kind: 'regular', language: regular.whitespacePreimage(regular.intersect([node.language, token], owner), 'collapse', owner)});
        else if (node.kind === 'numeric') mapped.set(node, node);
        else if (!frame.ready) {
          c.step(owner, 3); pending.push({node, ready: true});
          for (const child of node.kind === 'not' ? [node.child] : node.children) {c.step(owner, 3); pending.push({node: child, ready: false});}
        } else if (node.kind === 'not') mapped.set(node, {kind: 'not', child: mapped.get(node.child)!});
        else {c.step(owner, node.children.length + 3); mapped.set(node, {kind: node.kind, children: node.children.map(child => mapped.get(child)!)});}
      }
      return mapped.get(predicate)!;
    };
    try {operand(description, {...lexical, value: ''}, owner); alternatives.push({kind: 'regular', language: expressionLanguage('[ \\t\\r\\n]*', owner)});}
    catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error;}
    if (!valueFacetFailure(description, {family: 'list', canonical: '[]', length: '1'}, owner)) {
      const children: LexicalPredicate[] = [{kind: 'regular', language: regular.whitespacePreimage(regular.intersect([
        ...spellingConstraints(description, owner), expressionLanguage('[^ \\t\\r\\n]+', owner)], owner), 'collapse', owner)}];
      const item = scalarAdmissionPredicate(description.item!, lexical, owner); if (!item) return undefined; children.push(onToken(item));
      for (const layer of description.plan.layers) {
        const members = enumerations.get(layer); if (!members?.size) continue;
        c.step(owner, 2); const choices: LexicalPredicate[] = [];
        for (const value of members.values()) if (value.family === 'list' && value.items?.length === 1) {
          const predicate = scalarAdmissionPredicate(description.item!, lexical, owner, value.items[0]); if (!predicate) return undefined; choices.push(onToken(predicate));
        }
        children.push({kind: 'or', children: choices});
      }
      for (const conjunct of description.conjuncts ?? []) {const predicate = scopedListAdmissionPredicate(conjunct, lexical, scope, owner); if (!predicate) return undefined; children.push(predicate);}
      alternatives.push({kind: 'and', children});
    }
    return {kind: 'or', children: alternatives};
  };
  const scalarAdmissionPredicate = (description: Description, lexical: LexicalValue, owner: GraphNode, expected?: SchemaOperand, scope?: RegularLanguage): LexicalPredicate | undefined => {
    if (description.plan.variety === 'atomic') return expected ? fixedAtomicPredicate(description, expected, lexical, owner) : atomicAdmissionPredicate(description, lexical, owner);
    if (description.plan.variety === 'list') return scope ? scopedListAdmissionPredicate(description, lexical, scope, owner) : undefined;
    c.step(owner, 4); const alternatives: LexicalPredicate[] = [], previous: LexicalPredicate[] = [];
    for (const member of description.members!) {
      const admitted = scalarAdmissionPredicate(member, lexical, owner, undefined, scope); if (!admitted) return undefined;
      const selected = expected && member.plan.variety === 'list' && expected.family !== 'list'
        ? {kind: 'regular' as const, language: regular.union([], owner)}
        : expected ? scalarAdmissionPredicate(member, lexical, owner, expected, scope) : admitted;
      if (!selected) return undefined;
      c.step(owner, previous.length * 2 + 4); const children: LexicalPredicate[] = [selected, ...previous.map(child => ({kind: 'not' as const, child}))];
      const mode = member.plan.whitespace as 'preserve' | 'replace' | 'collapse';
      for (const layer of description.plan.layers) {
        if (layer.patterns.length) children.push({kind: 'regular', language: regular.whitespacePreimage(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner), mode, owner)});
        const members = enumerations.get(layer); if (!members?.size) continue;
        c.step(owner, 2); const choices: LexicalPredicate[] = [];
        for (const value of members.values()) {
          if (value.family !== member.plan.primitive) continue;
          const inverse = inversePredicate(value, lexical, regular.intersect(spellingConstraints(member, owner), owner), mode, owner); if (!inverse) return undefined;
          choices.push(inverse);
        }
        children.push({kind: 'or', children: choices});
      }
      alternatives.push({kind: 'and', children}); previous.push(admitted);
    }
    for (const conjunct of description.conjuncts ?? []) {
      const predicate = scalarAdmissionPredicate(conjunct, lexical, owner, undefined, scope); if (!predicate) return undefined;
      // A conjunct tests admission independently, retaining this union's
      // selected typed result rather than substituting its selection.
      for (let index = 0; index < alternatives.length; index++) alternatives[index] = {kind: 'and', children: [alternatives[index], predicate]};
    }
    return {kind: 'or', children: alternatives};
  };
  const admissionWitness = (description: Description, lexical: LexicalValue, owner: GraphNode, extra: RegularLanguage): string | undefined => {
    if (description.plan.variety === 'union') {
      const predicate = scalarAdmissionPredicate(description, lexical, owner);
      if (predicate) {
        const word = lexicalPredicates.witness(predicate, extra, owner); if (word === undefined) return undefined;
        operand(description, {...lexical, value: word}, owner); return word;
      }
      const finite = description.plan.layers.find(layer => (enumerations.get(layer)?.size ?? 0) > 0);
      if (finite) {
        for (const expected of enumerations.get(finite)!.values()) {
          if (excludedByEnumeration(description, expected, owner)) continue;
          const decision = regularMembership(description, expected, lexical, owner, [extra]);
          if (decision === undefined) throw new TypeError('Complete admitted token membership must be determinate');
          if (!decision) continue;
          for (const candidate of schemaScalarWitnesses(expected, lexical, owner, c)) {
            if (regular.witness(regular.intersect([extra, expressionLanguage(quoteExpression(candidate.value, owner), owner)], owner), owner) === undefined) continue;
            try {const value = operand(description, candidate, owner); if (values.sameValue(value, expected, owner)) return candidate.value;}
            catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error;}
          }
          // Existence was proved by the complete inverse product above. A
          // fair positive traversal reconstructs a lexical witness; it never
          // supplies a negative result after a failed finite search.
          for (const word of regular.words(extra, owner)) {
            try {const value = operand(description, {...lexical, value: word}, owner); if (values.sameValue(value, expected, owner)) return word;}
            catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error;}
          }
          throw new TypeError('A proved token witness must be reconstructible');
        }
        return undefined;
      }
      for (const member of description.members!) {
        const constraints: RegularLanguage[] = [extra];
        for (const layer of description.plan.layers) if (layer.patterns.length)
          constraints.push(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner));
        const word = admissionWitness(member, lexical, owner, regular.intersect(constraints, owner));
        if (word === undefined) continue;
        try {operand(description, {...lexical, value: word}, owner); return word;}
        catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error;}
      }
      return undefined;
    }
    const domain = admissionLanguage(description, lexical, owner);
    if (domain) return regular.witness(regular.intersect([domain, extra], owner), owner);
    if (description.plan.primitive === 'float' || description.plan.primitive === 'double') {
      const language = regular.intersect([...spellingConstraints(description, owner), extra], owner), admission = ieeeAdmission(description, owner);
      for (const literal of admission.literals) {
        const word = regular.witness(regular.intersect([language, expressionLanguage(quoteExpression(literal, owner), owner)], owner), owner);
        if (word !== undefined) return word;
      }
      for (const interval of admission.intervals) {const word = ieeeLanguages.intervalWitness(language, interval, owner); if (word !== undefined) return word;}
      return undefined;
    }
    throw new TypeError('An admitted atomic item requires its complete lexical authority');
  };
  const listLanguageWitness = (description: Description, language: RegularLanguage, lexical: LexicalValue, owner: GraphNode): string | undefined => {
    const program = regular.automaton(language, owner), token = expressionLanguage('[^ \\t\\r\\n]+', owner);
    if (program.states[program.start].accepting) return '';
    c.step(owner, 5); const frontier = [{state: program.start, prefix: ''}], seen = new Set([program.start]);
    for (let index = 0; index < frontier.length; index++) {
      const from = frontier[index];
      for (let to = 0; to < program.states.length; to++) {
        c.step(owner); const state = program.states[to];
        if (!state.accepting && !state.transitions.some(edge => edge.lo <= 32 && edge.hi >= 32)) continue;
        const paths = regular.intersect([regular.paths(program, [from.state], new Set([to]), owner), token], owner);
        if (regular.witness(paths, owner) === undefined) continue;
        const word = admissionWitness(description.item!, lexical, owner, paths); if (word === undefined) continue;
        c.step(owner, from.prefix.length + word.length + 3); const value = from.prefix + word;
        if (state.accepting) return value;
        for (const edge of state.transitions) {
          c.step(owner); if (edge.lo > 32 || edge.hi < 32 || seen.has(edge.to)) continue;
          c.step(owner, value.length + 4); seen.add(edge.to); frontier.push({state: edge.to, prefix: value + ' '});
        }
      }
    }
    return undefined;
  };
  const scalarValueImage = (source: RegularLanguage, family: string, lexical: LexicalValue, owner: GraphNode): RegularLanguage | undefined => {
    if (['dateTime', 'date', 'time', 'gYear', 'gYearMonth', 'gMonthDay', 'gDay', 'gMonth'].includes(family))
      return calendarImages.image(source, family as NonNullable<SchemaOperand['calendar']>['family'], owner);
    if (family !== 'QName' && family !== 'NOTATION') return valueImages.simple(source, family, owner);
    const name = intrinsicPatterns.compile({value: '[\\i-[:]][\\c-[:]]*', context: lexical.context}, owner); intrinsicCompiled.add(name);
    const local = patternLanguage(name, owner), choices: RegularLanguage[] = [], epsilon = expressionLanguage('', owner);
    c.step(owner, 3); const bindings = new Map<string, string>();
    for (const prefix in lexical.context.namespaces) {
      c.text(prefix, owner); c.step(owner, 3); bindings.set(prefix, lexical.context.namespaces[prefix]);
    }
    if (!bindings.has('')) {c.step(owner, 2); bindings.set('', '');}
    for (const [prefix, namespace] of bindings) {
      c.text(prefix, owner); c.text(namespace, owner); c.step(owner, prefix.length + namespace.length * 3 + 12);
      const value = regular.intersect([regular.quotient(source, expressionLanguage(quoteExpression(prefix ? prefix + ':' : '', owner), owner), epsilon, owner), local], owner);
      const before = '[' + JSON.stringify(namespace) + ',"';
      choices.push(regular.concatenate([expressionLanguage(quoteExpression(before, owner), owner), value,
        expressionLanguage(quoteExpression('"]', owner), owner)], owner));
    }
    return regular.union(choices, owner);
  };
  const encodeImageValue = (value: SchemaOperand, owner: GraphNode): string => {
    c.text(value.canonical, owner); c.step(owner, value.canonical.length * 4 + 32);
    if (value.family === 'base64Binary') return Buffer.from(value.canonical, 'hex').toString('base64');
    if (value.family === 'hexBinary') return value.canonical;
    if (value.calendar) {
      const budget = {charge: (work: number) => c.step(owner, work), text: (text: string) => {c.text(text, owner);}, arithmetic: (digits: number) => c.step(owner, (digits + 2) ** 2)};
      const instant = showInstant(value.calendar.seconds, budget); return value.calendar.zoned ? instant : instant.slice(0, -1);
    }
    return value.canonical;
  };
  const valueSets = schemaSymbolicValueSets<GraphNode>(c, regular, numericImages, ieeeLanguages, expressionLanguage,
    (family, spelling, owner) => values.atomic(family, {value: spelling, context: owner.context}, owner, 'preserve'), encodeImageValue);
  const symbolicSequences = schemaSymbolicSequences<GraphNode, ScalarValueSet>(c, valueSets.satisfiable, label => label.family);
  const atomicImageLabels = (description: Description, lexical: LexicalValue, source: RegularLanguage, additions: readonly LexicalPredicate[], owner: GraphNode): readonly ScalarValueSet[] => {
    const candidates = description.plan.variety === 'union' ? description.members! : [description], result: ScalarValueSet[] = [], previous: LexicalPredicate[] = [];
    for (const member of candidates) {
      const admitted = atomicAdmissionPredicate(member, lexical, owner); if (!admitted) throw new TypeError('A list item must have an atomic selected member');
      c.step(owner, additions.length + previous.length * 2 + 4); const children: LexicalPredicate[] = [admitted, ...additions, ...previous.map(child => ({kind: 'not' as const, child}))];
      previous.push(admitted);
      if (description.plan.variety === 'union') {
        for (const layer of description.plan.layers) {
          if (layer.patterns.length) children.push({kind: 'regular', language: regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner)});
          const members = enumerations.get(layer); if (!members?.size) continue;
          const choices: LexicalPredicate[] = [];
          for (const value of members.values()) if (value.family === member.plan.primitive) {
            const predicate = inversePredicate(value, lexical, source, member.plan.whitespace as 'preserve' | 'replace' | 'collapse', owner);
            if (!predicate) throw new TypeError('An admitted atomic value requires a complete inverse'); choices.push(predicate);
          }
          children.push({kind: 'or', children: choices});
        }
        for (const conjunct of description.conjuncts ?? []) {
          const predicate = scalarAdmissionPredicate(conjunct, lexical, owner); if (!predicate) throw new TypeError('A list item conjunct requires atomic admission'); children.push(predicate);
        }
      }
      const predicate: LexicalPredicate = {kind: 'and', children};
      const branches = lexicalPredicates.branches(predicate, source, owner);
      if (member.plan.primitive === 'float' || member.plan.primitive === 'double') {
        if (branches.some(branch => numericImages.exists(branch.language, branch.numeric, owner))) result.push({family: member.plan.primitive, kind: 'ieee', inputs: branches});
        continue;
      }
      for (const branch of branches) {
        if (!numericImages.exists(branch.language, branch.numeric, owner)) continue;
        const compiled = regularPredicateInScope({kind: 'numeric', condition: branch.numeric}, branch.language, owner);
        const raw = compiled ?? branch.language, condition = compiled ? numericImages.all() : branch.numeric;
        if (!compiled && !['string', 'anyURI', 'hexBinary', 'base64Binary'].includes(member.plan.primitive!)) throw new TypeError('An atomic item guard needs its datatype preimage');
        const image = scalarValueImage(raw, member.plan.primitive!, lexical, owner);
        if (!image) throw new TypeError('An admitted atomic item needs its value image');
        c.step(owner, 4); result.push({kind: 'regular', family: member.plan.primitive!, language: image, numeric: condition});
      }
    }
    return result;
  };
  const joinSymbolic = (inputs: readonly SymbolicSequence<ScalarValueSet>[], owner: GraphNode): SymbolicSequence<ScalarValueSet> => {
    c.step(owner, 4); const states: {accepting: boolean; edges: {to: number; label: ScalarValueSet}[]}[] = [{accepting: false, edges: []}];
    for (const input of inputs) {
      c.step(owner, input.states.length * 3 + 4); const offset = states.length;
      for (const state of input.states) {c.step(owner, state.edges.length * 3 + 3); states.push({accepting: state.accepting, edges: state.edges.map(edge => ({to: edge.to + offset, label: edge.label}))});}
      states[0].accepting ||= input.states[input.start].accepting;
      for (const edge of input.states[input.start].edges) {c.step(owner, 3); states[0].edges.push({to: edge.to + offset, label: edge.label});}
    }
    return {start: 0, states};
  };
  type SelectedTokenBranch = {raw: RegularLanguage; numeric: NumericImageCondition; lists: readonly Description[]};
  const listGlobalDomain = (description: Description, owner: GraphNode): RegularLanguage => {
    const constraints = spellingConstraints(description, owner);
    for (const tuple of scalarTuples(description, owner)) if (lengthNames.includes(tuple.name)) constraints.push(valueLengthLanguage(description, tuple.name, tuple.property.integer!, owner)!);
    for (const conjunct of description.conjuncts ?? []) constraints.push(listGlobalDomain(conjunct, owner));
    return regular.whitespacePreimage(regular.intersect(constraints, owner), 'collapse', owner);
  };
  const selectedTokenBranches = (description: Description, member: Description, lexical: LexicalValue, owner: GraphNode): readonly SelectedTokenBranch[] | undefined => {
    const mode = member.plan.whitespace as 'preserve' | 'replace' | 'collapse';
    const domain = member.plan.variety === 'list' ? listGlobalDomain(member, owner) : admissionLanguage(member, lexical, owner);
    if (!domain) return undefined;
    const parent: RegularLanguage[] = [];
    for (const layer of description.plan.layers) {
      if (layer.patterns.length) parent.push(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner));
      if ((enumerations.get(layer)?.size ?? 0) > 0) return undefined;
    }
    let branches: SelectedTokenBranch[] = [{raw: regular.intersect([member.plan.variety === 'list' ? domain : regular.whitespacePreimage(domain, mode, owner),
      regular.whitespacePreimage(regular.intersect(parent, owner), mode, owner)], owner), numeric: numericImages.all(), lists: []}];
    c.step(owner, description.members!.length * 2 + 2);
    for (const prior of description.members!.slice(0, description.members!.indexOf(member))) {
      const next: SelectedTokenBranch[] = [];
      for (const branch of branches) {
        if (prior.plan.variety !== 'list') {
          const predicate = scalarAdmissionPredicate(prior, lexical, owner); if (!predicate) return undefined;
          for (const rejected of lexicalPredicates.branches({kind: 'not', child: predicate}, branch.raw, owner)) {
            c.step(owner, 4); next.push({...branch, raw: rejected.language, numeric: numericImages.intersection(branch.numeric, rejected.numeric, owner)});
          }
          continue;
        }
        const regularAdmission = listAdmissionInScope(prior, lexical, branch.raw, owner);
        if (regularAdmission) {next.push({...branch, raw: regular.intersect([branch.raw, regular.negate(regularAdmission, owner)], owner)}); continue;}
        const global = listGlobalDomain(prior, owner), outside = regular.intersect([branch.raw, regular.negate(global, owner)], owner);
        if (regular.witness(outside, owner) !== undefined) next.push({...branch, raw: outside});
        const inside = regular.intersect([branch.raw, global], owner); if (regular.witness(inside, owner) === undefined) continue;
        const finite = prior.plan.layers.find(layer => (enumerations.get(layer)?.size ?? 0) > 0);
        if (!finite) {
          c.step(owner, 4); const conjunctItems = (prior.conjuncts ?? []).map(conjunct => conjunct.item!);
          const combined = conjunctItems.length ? {...prior, item: {...prior.item!, conjuncts: [...prior.item!.conjuncts ?? [], ...conjunctItems]}} : prior;
          next.push({...branch, raw: inside, lists: [...branch.lists, combined]}); continue;
        }
        let variants: SelectedTokenBranch[] = [{...branch, raw: inside}];
        for (const [facet, value] of enumerations.get(finite)!) {
          if (value.family !== 'list' || !value.items || excludedByEnumeration(prior, value, owner) || excludedByValueFacets(prior, value, owner)) continue;
          c.step(owner, value.items.length * 6 + 5); const items = value.items.map(item => {
            const layer: ScalarConstraintLayer = {owner: prior.plan.id, facets: [facet], patterns: []}; enumerations.set(layer, new Map([[facet, item]]));
            return {...prior.item!, plan: {...prior.item!.plan, layers: [...prior.item!.plan.layers, layer]}};
          });
          const arity = regular.whitespacePreimage(valueLengthLanguage(prior, 'length', String(value.items.length), owner)!, 'collapse', owner), split: SelectedTokenBranch[] = [];
          for (const variant of variants) {
            split.push({...variant, raw: regular.intersect([variant.raw, regular.negate(arity, owner)], owner)});
            split.push({...variant, raw: regular.intersect([variant.raw, arity], owner), lists: [...variant.lists, {...prior, membershipItems: items}]});
          }
          variants = split;
        }
        next.push(...variants);
      }
      branches = next;
    }
    return branches;
  };
  const tokenUnionImages = (description: Description, lexical: LexicalValue, owner: GraphNode, includeLists = true): Map<string, SymbolicSequence<ScalarValueSet>> | undefined => {
    const images = new Map<string, SymbolicSequence<ScalarValueSet>[]>();
    for (const member of description.members!) {
      if (member.plan.variety !== 'list' && !['string', 'anyURI'].includes(member.plan.primitive!)) continue;
      if (!includeLists && member.plan.variety === 'list') continue;
      const family = member.plan.variety === 'list' ? 'list' : member.plan.primitive!, mode = member.plan.whitespace as 'preserve' | 'replace' | 'collapse';
      const finite = member.plan.layers.find(layer => (enumerations.get(layer)?.size ?? 0) > 0);
      if (member.plan.variety === 'list' && finite) {
        for (const [facet, value] of enumerations.get(finite)!) {
          if (value.family !== 'list' || !value.items) continue;
          const included = regularMembership(description, value, facet.lexical, owner); if (included === undefined) return undefined; if (!included) continue;
          c.step(owner, value.items.length * 6 + 4); const states = value.items.map((item, index) => ({accepting: false, edges: [{to: index + 1,
            label: {kind: 'singleton' as const, family: item.family, value: item, encoded: encodeImageValue(item, owner)}}]})); states.push({accepting: true, edges: []});
          const current = images.get(family) ?? []; current.push({start: 0, states}); images.set(family, current);
        }
        continue;
      }
      const branches = selectedTokenBranches(description, member, lexical, owner); if (!branches) return undefined;
      for (const branch of branches) {
        if (!numericImages.exists(branch.raw, branch.numeric, owner)) continue;
        const normalized = regular.whitespaceImage(branch.raw, mode, owner), variants: {source: RegularLanguage; numeric: NumericImageCondition}[] = [];
        const one = regular.whitespacePreimage(expressionLanguage('[^ \\t\\r\\n]+', owner), 'collapse', owner);
        variants.push({source: regular.intersect([normalized, one], owner), numeric: branch.numeric});
        if (branch.numeric.nonNumeric) variants.push({source: regular.intersect([normalized, regular.negate(one, owner)], owner), numeric: numericImages.all()});
        for (const variant of variants) {
          if (regular.witness(variant.source, owner) === undefined) continue;
          const maximum = Math.max(0, ...branch.lists.map(list => list.membershipItems ? list.membershipItems.length + 1 : 0));
          const factory = schemaTokenImages<GraphNode, ScalarValueSet>(c, regular, owner => expressionLanguage('[^ \\t\\r\\n]+', owner),
            (paths, position, rejected, owner): readonly ScalarValueSet[] => {
              const predicates: LexicalPredicate[] = [{kind: 'numeric', condition: variant.numeric}];
              for (const index of rejected) {
                const prior = branch.lists[index], item = prior.membershipItems?.[position] ?? prior.item!;
                const predicate = scalarAdmissionPredicate(item, lexical, owner); if (!predicate) throw new TypeError('A prior list token requires atomic admission');
                predicates.push({kind: 'not', child: predicate});
              }
              if (member.plan.variety === 'list') {
                for (const conjunct of member.conjuncts ?? []) {
                  const predicate = scalarAdmissionPredicate(conjunct.item!, lexical, owner); if (!predicate) throw new TypeError('A list conjunct requires atomic admission'); predicates.push(predicate);
                }
                return atomicImageLabels(member.item!, lexical, paths, predicates, owner);
              }
              return lexicalPredicates.branches({kind: 'and', children: predicates}, paths, owner)
                .filter(branch => numericImages.exists(branch.language, branch.numeric, owner))
                .map(branch => ({kind: 'regular', family: 'string-fragment', language: branch.language, numeric: branch.numeric}));
            }, (cp, owner): ScalarValueSet => ({kind: 'regular', family: 'string-fragment', language: expressionLanguage(quoteExpression(String.fromCodePoint(cp), owner), owner), numeric: numericImages.all()}));
          const image = factory.image(variant.source, branch.lists.length, maximum, member.plan.variety === 'list' ? 'list' : 'string', owner);
          const current = images.get(family) ?? []; current.push(image); images.set(family, current);
        }
      }
    }
    return new Map([...images].map(([family, inputs]) => [family, joinSymbolic(inputs, owner)]));
  };
  type GuardedImage = {language: RegularLanguage; numeric: NumericImageCondition};
  const guardedUnionImages = (description: Description, lexical: LexicalValue, owner: GraphNode, tokenFamilies = false): Map<string, readonly GuardedImage[]> | undefined => {
    c.step(owner, 3); const images = new Map<string, GuardedImage[]>();
    for (const member of description.members!) {
      if (member.plan.variety === 'list') continue;
      if (tokenFamilies && ['string', 'anyURI'].includes(member.plan.primitive!)) continue;
      if (member.plan.primitive === 'float' || member.plan.primitive === 'double') continue;
      const admitted = admissionLanguage(member, lexical, owner); if (!admitted) return undefined;
      const mode = member.plan.whitespace === 'member' ? 'collapse' : member.plan.whitespace, constraints = [admitted];
      for (const layer of description.plan.layers) {
        if (layer.patterns.length) constraints.push(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner));
        const members = enumerations.get(layer); if (!members?.size) continue;
        const choices: RegularLanguage[] = [];
        for (const value of members.values()) {
          if (value.family !== member.plan.primitive) continue;
          const inverse = inverseExpression(value, lexical, owner); if (inverse === undefined) return undefined;
          choices.push(expressionLanguage(inverse, owner));
        }
        constraints.push(regular.union(choices, owner));
      }
      c.step(owner, 4); let branches: {raw: RegularLanguage; numeric: NumericImageCondition}[] = [{
        raw: regular.whitespacePreimage(regular.intersect(constraints, owner), mode, owner), numeric: numericImages.all()}];
      c.step(owner, description.members!.length * 2 + 2);
      for (const prior of description.members!.slice(0, description.members!.indexOf(member))) {
        const priorMode = prior.plan.whitespace === 'member' ? 'collapse' : prior.plan.whitespace;
        const ieee = prior.plan.primitive === 'float' || prior.plan.primitive === 'double';
        const priorDomain = ieee ? regular.intersect(spellingConstraints(prior, owner), owner) : admissionLanguage(prior, lexical, owner);
        const next: typeof branches = [];
        for (const branch of branches) {
          const raw = priorDomain ? regular.whitespacePreimage(priorDomain, priorMode, owner)
            : prior.plan.variety === 'list' ? listAdmissionInScope(prior, lexical, branch.raw, owner) : undefined;
          if (!raw) return undefined;
          const outside = regular.intersect([branch.raw, regular.negate(raw, owner)], owner);
          if (regular.witness(outside, owner) !== undefined) next.push({...branch, raw: outside});
          if (!ieee) continue;
          const inside = regular.intersect([branch.raw, raw], owner); if (regular.witness(inside, owner) === undefined) continue;
          const accepted = ieeeAdmission(prior, owner);
          next.push({raw: inside, numeric: numericImages.intersection(branch.numeric,
            numericImages.difference({...numericImages.all(), nonNumeric: false}, {...accepted, nonNumeric: false}, owner), owner)});
        }
        branches = next;
      }
      for (const branch of branches) {
        let raw = branch.raw, condition = branch.numeric;
        if (!condition.nonNumeric) {
          const exponential = regular.whitespacePreimage(expressionLanguage('[+\\-]?([0-9]+([.][0-9]*)?|[.][0-9]+)[eE][+\\-]?[0-9]+', owner), 'collapse', owner);
          if (regular.witness(regular.intersect([raw, exponential], owner), owner) === undefined) {
            raw = regular.intersect([raw, regular.whitespacePreimage(ieeeLanguages.decimalInputLanguage(condition.intervals, condition.literals, owner), 'collapse', owner)], owner);
            condition = numericImages.all();
          } else if (!['string', 'anyURI', 'hexBinary', 'base64Binary'].includes(member.plan.primitive!)) return undefined;
        }
        if (regular.witness(raw, owner) === undefined) continue;
        const image = scalarValueImage(regular.whitespaceImage(raw, mode, owner), member.plan.primitive!, lexical, owner); if (!image) return undefined;
        c.step(owner, 3); const current = images.get(member.plan.primitive!) ?? []; current.push({language: image, numeric: condition}); images.set(member.plan.primitive!, current);
      }
    }
    return images;
  };
  const selectedIeeeLabels = (description: Description, lexical: LexicalValue, owner: GraphNode): readonly ScalarValueSet[] => {
    c.step(owner, 3); const labels: ScalarValueSet[] = [], members = description.members!;
    const scope = regular.whitespacePreimage(expressionLanguage('[^ \\t\\r\\n]+', owner), 'collapse', owner);
    for (let index = 0; index < members.length; index++) {
      const member = members[index]; if (member.plan.primitive !== 'float' && member.plan.primitive !== 'double') continue;
      const admitted = atomicAdmissionPredicate(member, lexical, owner)!; c.step(owner, index * 2 + 4);
      const children: LexicalPredicate[] = [admitted];
      for (let before = 0; before < index; before++) {
        const predicate = scalarAdmissionPredicate(members[before], lexical, owner, undefined, scope);
        if (!predicate) throw new TypeError('An earlier member on an IEEE spelling requires complete singleton-token admission');
        c.step(owner, 3); children.push({kind: 'not', child: predicate});
      }
      const mode = member.plan.whitespace as 'preserve' | 'replace' | 'collapse';
      for (const layer of description.plan.layers) {
        if (layer.patterns.length) children.push({kind: 'regular', language: regular.whitespacePreimage(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner), mode, owner)});
        const members = enumerations.get(layer); if (!members?.size) continue;
        c.step(owner, 2); const alternatives: LexicalPredicate[] = [];
        for (const value of members.values()) if (value.family === member.plan.primitive) {
          const predicate = inversePredicate(value, lexical, scope, mode, owner); if (!predicate) throw new TypeError('An IEEE enum requires a complete numeric inverse'); alternatives.push(predicate);
        }
        children.push({kind: 'or', children: alternatives});
      }
      for (const conjunct of description.conjuncts ?? []) {
        const predicate = scalarAdmissionPredicate(conjunct, lexical, owner, undefined, scope);
        if (!predicate) throw new TypeError('An IEEE union conjunct requires singleton-token admission'); children.push(predicate);
      }
      const inputs = lexicalPredicates.branches({kind: 'and', children}, scope, owner);
      if (inputs.some(branch => numericImages.exists(branch.language, branch.numeric, owner))) {c.step(owner, 4); labels.push({kind: 'ieee', family: member.plan.primitive, inputs});}
    }
    return labels;
  };
  const selectedUnionContainment = (base: Description, result: Description, owner: GraphNode): boolean => {
    const lexical: LexicalValue = {value: '', context: owner.context};
    const finite = result.plan.layers.find(layer => (enumerations.get(layer)?.size ?? 0) > 0);
    if (finite) {
      let complete = true;
      // Values retain their genuine introduction; containment uses this datatype's context.
      for (const value of enumerations.get(finite)!.values()) {
        const present = regularMembership(result, value, lexical, owner); if (present === false) continue;
        const contained = regularMembership(base, value, lexical, owner);
        if (present === true && contained === false) c.fail(owner, 'scalar-value-space-restriction', 'A selected derived enumeration value is excluded by the base selected image');
        if (present === undefined || contained === undefined) complete = false;
      }
      return complete;
    }
    if (!base.plan.layers.length && [...base.members!, ...result.members!].every(member => member.plan.variety === 'atomic')) {
      const primitive = base.members![0].plan.primitive, mode = base.members![0].plan.whitespace;
      if ([...base.members!, ...result.members!].every(member => member.plan.primitive === primitive && member.plan.whitespace === mode)
        && base.members!.some(member => member.plan.builtin === primitive && scalarTuples(member, owner).every(tuple => tuple.name === 'whiteSpace')
          && !member.intrinsic?.patterns.length && member.plan.layers.every(layer => !layer.patterns.length && layer.facets.every(facet => facet.name === 'whiteSpace'))))
        return true;
    }
    // These are positive counterexample probes. Every value is reselected by
    // the actual union and checked by complete typed membership in the base;
    // a missed probe contributes no containment or nonexistence conclusion.
    for (const member of result.members!) {
      const constraints = spellingConstraints(member, owner);
      for (const layer of result.plan.layers) if (layer.patterns.length) constraints.push(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner));
      if (member.plan.variety === 'list') constraints.push(valueLengthLanguage(member, 'minLength', '1', owner)!);
      const source = regular.intersect(constraints, owner);
      const word = member.plan.variety === 'list' ? listLanguageWitness(member, source, lexical, owner) : admissionWitness(member, lexical, owner, source);
      if (word === undefined) continue;
      let value: SchemaOperand;
      try {value = operand(result, {...lexical, value: word}, owner);}
      catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error; continue;}
      if (regularMembership(base, value, {...lexical, value: word}, owner) === false)
        c.fail(owner, 'scalar-value-space-restriction', 'An assessed selected derived union value has no base lexical representative');
    }
    const lists = base.members!.every(member => member.plan.variety === 'list') && result.members!.every(member => member.plan.variety === 'list');
    if (lists && !base.plan.layers.length) {
      const primitive = base.members![0].item!.plan.primitive;
      if (primitive && [...base.members!, ...result.members!].every(member => member.item!.plan.variety === 'atomic' && member.item!.plan.primitive === primitive)) {
        const full = base.members!.some(member => scalarTuples(member, owner).every(tuple => tuple.name === 'whiteSpace')
          && member.plan.layers.every(layer => !layer.patterns.length && layer.facets.every(facet => facet.name === 'whiteSpace'))
          && member.item!.plan.builtin === primitive && !member.item!.rawProperties
          && scalarTuples(member.item!, owner).every(tuple => tuple.name === 'whiteSpace')
          && !member.item!.plan.layers.length && !member.item!.intrinsic?.patterns.length);
        // Every successful item parser has the same primitive value on a
        // whitespace-free token. An unrestricted list member admits every
        // sequence of those values; earlier same-primitive lists cannot alter
        // that typed image when they select the lexical representative.
        if (full) return true;
      }
      const first = base.members![0];
      if (first.item!.plan.builtin === 'string' && !first.item!.plan.layers.length
        && scalarTuples(first, owner).every(tuple => tuple.name === 'whiteSpace')
        && first.plan.layers.every(layer => !layer.patterns.length && layer.facets.every(facet => facet.name === 'whiteSpace'))) {
        for (const member of result.members!) {
          if (member.item!.plan.primitive === 'string') continue;
          const source = regular.intersect([...spellingConstraints(member, owner), valueLengthLanguage(member, 'minLength', '1', owner)!], owner);
          const word = listLanguageWitness(member, source, lexical, owner); if (word === undefined) continue;
          let value: SchemaOperand;
          try {value = operand(result, {...lexical, value: word}, owner);}
          catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error; continue;}
          if (value.items?.some(item => item.family !== 'string') && regularMembership(base, value, {...lexical, value: word}, owner) === false)
            c.fail(owner, 'scalar-value-space-restriction', 'A derived typed list is outside the universally selected base string-item list image');
        }
      }
    }
    // A universal raw padding certificate can embed an entire collapse
    // member image in an unchanged later base member. The proof checks all
    // earlier raw admissions, rather than sampling individual value aliases.
    if (!base.plan.layers.length) {
      const firstDomain = admissionLanguage(base.members![0], lexical, owner);
      const firstImage = firstDomain && valueImages.simple(firstDomain, base.members![0].plan.primitive!, owner);
      let covered = true;
      for (const member of result.members!) {
        let certified = false;
        if (firstImage && member.plan.primitive === base.members![0].plan.primitive) {
          const domain = admissionLanguage(member, lexical, owner), image = domain && valueImages.simple(domain, member.plan.primitive!, owner);
          if (image && regular.witness(regular.intersect([image, regular.negate(firstImage, owner)], owner), owner) === undefined) certified = true;
        }
        if (!certified && member.plan.whitespace === 'collapse') {
          const index = base.members!.findIndex(prior => prior.definition === member.definition);
          if (index >= 0) for (const padding of ['\n', '\r', '\t', ' ']) {
            let universal = true;
            for (const prior of base.members!.slice(0, index)) {
              const domain = admissionLanguage(prior, lexical, owner); if (!domain || prior.plan.whitespace === 'member') {universal = false; break;}
              const raw = regular.whitespacePreimage(domain, prior.plan.whitespace, owner), affix = expressionLanguage(quoteExpression(padding, owner), owner);
              if (regular.witness(regular.quotient(raw, affix, affix, owner), owner) !== undefined) {universal = false; break;}
            }
            if (universal) {certified = true; break;}
          }
        }
        if (!certified) {covered = false; break;}
      }
      if (covered) return true;
    }
    const first = base.members![0];
    if (first.plan.primitive === 'string' && !first.plan.layers.length && !first.facets.size
      && !first.intrinsic?.patterns.length && !first.intrinsic?.scalars.length) {
      for (const member of result.members!) {
        if (member.plan.primitive === 'string') continue;
        const language = regular.intersect(spellingConstraints(member, owner), owner);
        const word = member.plan.variety === 'list' ? listLanguageWitness(member, language, lexical, owner)
          : admissionWitness(member, lexical, owner, language);
        if (word === undefined) continue;
        let value: SchemaOperand;
        try {value = operand(result, {...lexical, value: word}, owner);}
        catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error; continue;}
        if (value.family !== 'string' && membershipWitness(base, value, {...lexical, value: word}, owner) === false)
          c.fail(owner, 'scalar-value-space-restriction', 'A selected derived union value is outside the universally selected base string image');
      }
    }
    const tokenFamilies = [...base.members!, ...result.members!].some(member => member.plan.variety === 'list');
    const tokenParserEmbeds = (before: Description, target: Description): boolean => {
      if (before.definition === target.definition) return true;
      if (before.plan.variety !== 'atomic') return false;
      const first = target.plan.variety === 'union' ? target.members![0] : target;
      if (first.plan.variety !== 'atomic' || first.plan.primitive !== before.plan.primitive) return false;
      const admitted = scalarAdmissionPredicate(before, lexical, owner), selected = atomicAdmissionPredicate(first, lexical, owner);
      return !!admitted && !!selected && !lexicalPredicates.exists({kind: 'and', children: [admitted, {kind: 'not', child: selected}]}, expressionLanguage('[^ \\t\\r\\n]+', owner), owner);
    };
    let embeddedLists = true;
    for (const member of result.members!) if (member.plan.variety === 'list') {
      c.step(owner, base.members!.length * 2 + 3);
      const identical = base.members!.findIndex(prior => prior.definition === member.definition);
      if (identical >= 0 && base.members!.slice(0, identical).every(prior => prior.plan.variety === 'list' && tokenParserEmbeds(prior.item!, member.item!))
        && !base.plan.layers.some(layer => (enumerations.get(layer)?.size ?? 0) > 0)) {
        const constraints: RegularLanguage[] = [];
        for (const layer of result.plan.layers) if (layer.patterns.length) constraints.push(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner));
        const inherited: RegularLanguage[] = [];
        for (const layer of base.plan.layers) if (layer.patterns.length) inherited.push(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner));
        if (regular.witness(regular.intersect([...constraints, regular.negate(regular.intersect(inherited, owner), owner)], owner), owner) === undefined) continue;
      }
      const prior = base.members![0];
      const sameParser = member.item!.definition === prior.item?.definition || member.item!.plan.variety === 'atomic' && prior.item?.plan.variety === 'atomic'
        && member.item!.plan.primitive === prior.item.plan.primitive;
      if (prior.plan.variety !== 'list' || !sameParser) {embeddedLists = false; break;}
      const normal = spellingConstraints(member, owner);
      for (const layer of result.plan.layers) if (layer.patterns.length) normal.push(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner));
      const source = regular.whitespacePreimage(regular.intersect(normal, owner), 'collapse', owner);
      const supplied = listGlobalDomain(member, owner), inherited = listGlobalDomain(prior, owner);
      const suppliedItem = scalarAdmissionPredicate(member.item!, lexical, owner), inheritedItem = scalarAdmissionPredicate(prior.item!, lexical, owner);
      if (!suppliedItem || !inheritedItem || prior.plan.layers.some(layer => (enumerations.get(layer)?.size ?? 0) > 0)
        || lexicalPredicates.exists({kind: 'and', children: [suppliedItem, {kind: 'not', child: inheritedItem}]}, expressionLanguage('[^ \\t\\r\\n]+', owner), owner)) {embeddedLists = false; break;}
      const baseConstraints: RegularLanguage[] = [];
      for (const layer of base.plan.layers) {
        if (layer.patterns.length) baseConstraints.push(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner));
        if ((enumerations.get(layer)?.size ?? 0) > 0) {embeddedLists = false; break;}
      }
      const target = regular.intersect([inherited, regular.whitespacePreimage(regular.intersect(baseConstraints, owner), 'collapse', owner)], owner);
      // Shared primitive parsing maps every admitted token to the same typed
      // item on this lexical embedding; the first base member always selects.
      if (regular.witness(regular.intersect([source, supplied, regular.negate(target, owner)], owner), owner) !== undefined) {embeddedLists = false; break;}
    }
    if (tokenFamilies) {
      const supplied = tokenUnionImages(result, lexical, owner, !embeddedLists), inherited = tokenUnionImages(base, lexical, owner, !embeddedLists);
      if (!supplied || !inherited) return false;
      const empty = joinSymbolic([], owner);
      for (const [family, image] of supplied) {
        if (family === 'list' && embeddedLists) continue;
        if (symbolicSequences.differenceExists(image, inherited.get(family) ?? empty, owner))
          c.fail(owner, 'scalar-value-space-restriction', 'A selected derived token sequence is outside the base selected typed value image');
      }
    }
    const inherited = guardedUnionImages(base, lexical, owner, tokenFamilies), supplied = guardedUnionImages(result, lexical, owner, tokenFamilies);
    if (!inherited || !supplied) return false;
    for (const [family, images] of supplied) for (const image of images) {
      let residual: GuardedImage[] = [image];
      for (const prior of inherited.get(family) ?? []) {
        c.step(owner, residual.length * 2 + 3); const next: GuardedImage[] = [];
        for (const branch of residual) {
          next.push({language: regular.intersect([branch.language, regular.negate(prior.language, owner)], owner), numeric: branch.numeric});
          next.push({language: regular.intersect([branch.language, prior.language], owner), numeric: numericImages.difference(branch.numeric, prior.numeric, owner)});
        }
        residual = next;
      }
      for (const branch of residual) if (numericImages.exists(branch.language, branch.numeric, owner))
        c.fail(owner, 'scalar-value-space-restriction', 'A selected derived union value has no spelling in the base selected value space');
    }
    const suppliedIeee = selectedIeeeLabels(result, lexical, owner), inheritedIeee = selectedIeeeLabels(base, lexical, owner);
    for (const image of suppliedIeee) if (valueSets.satisfiable([image], inheritedIeee, owner))
      c.fail(owner, 'scalar-value-space-restriction', 'A selected derived IEEE value has no representative in the base selected image');
    return true;
  };
  const regularMembership = (base: Description, expected: SchemaOperand, lexical: LexicalValue, owner: GraphNode,
    extra: readonly RegularLanguage[] = [], rejections: readonly Description[] = [], rejectedLists: readonly Description[] = []): boolean | undefined => {
    const accepts = (value: string): boolean => {
      try {return values.sameValue(expected, operand(base, {...lexical, value}, owner), owner);}
      catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error; return false;}
    };
    if (base.plan.variety === 'list') {
      if (expected.family !== 'list' || !expected.items) return false;
      const allowed = base.item!.plan.variety === 'union' ? base.item!.members!.map(member => member.plan.primitive) : [base.item!.plan.primitive];
      c.step(owner, allowed.length + expected.items.length + 3);
      if (expected.items.some(item => !allowed.includes(item.family))) return false;
      if (excludedByEnumeration(base, expected, owner) || excludedByValueFacets(base, expected, owner)) return false;
      const language = regular.intersect([...spellingConstraints(base, owner), ...extra], owner);
      const program = regular.automaton(language, owner), token = expressionLanguage('[^ \\t\\r\\n]+', owner);
      c.step(owner, program.states.length * 3 + 4); const useful = new Set<number>(), pending: number[] = [], incoming: number[][] = program.states.map(() => []);
      for (let from = 0; from < program.states.length; from++) {
        if (program.states[from].accepting) {c.step(owner, 2); useful.add(from); pending.push(from);}
        for (const edge of program.states[from].transitions) {c.step(owner); incoming[edge.to].push(from);}
      }
      while (pending.length) {c.step(owner); const state = pending.pop()!; for (const before of incoming[state]) {
        c.step(owner); if (!useful.has(before)) {c.step(owner, 2); useful.add(before); pending.push(before);}
      }}
      c.step(owner, program.states.length * 2 + 4); let current = new Map([[program.start + ':0', {state: program.start, failed: 0n}]]), complete = true;
      const maskCost = Math.min(Number.MAX_SAFE_INTEGER, (rejectedLists.length + 4) ** 2);
      const masks = (operations = 1) => c.step(owner, Math.min(Number.MAX_SAFE_INTEGER, maskCost * operations));
      c.step(owner, rejectedLists.length + 4); masks(2); const allFailed = (1n << BigInt(rejectedLists.length)) - 1n;
      for (let index = 0; index < expected.items.length; index++) {
        c.step(owner, program.states.length + 3); const next = new Map<string, {state: number; failed: bigint}>();
        for (const from of current.values()) for (let to = 0; to < program.states.length; to++) {
          c.step(owner); if (index + 1 === expected.items.length ? !program.states[to].accepting
            : !program.states[to].transitions.some(edge => edge.lo <= 32 && edge.hi >= 32 && useful.has(edge.to))) continue;
          c.step(owner, program.states.length * 3 + 4);
          const paths = regular.intersect([regular.paths(program, [from.state], new Set([to]), owner), token], owner);
          if (regular.witness(paths, owner) === undefined) continue;
          c.step(owner, rejectedLists.length * 3 + 2); const missing = rejectedLists.flatMap((list, bit) => {masks(2); return from.failed & (1n << BigInt(bit)) ? [] : [{item: list.membershipItems?.[index] ?? list.item!, bit}];});
          const count = 2 ** missing.length; c.step(owner, Number.isSafeInteger(count) ? count : Number.MAX_SAFE_INTEGER);
          for (let subset = 0; subset < count; subset++) {
            c.step(owner, missing.length * 2 + 4); const rejected: Description[] = []; let failed = from.failed;
            for (let position = 0; position < missing.length; position++) {masks(3); if (BigInt(subset) & (1n << BigInt(position))) {
              rejected.push(missing[position].item); masks(2); failed |= 1n << BigInt(missing[position].bit);
            }}
            const accepted = regularMembership(base.item!, expected.items[index], lexical, owner, [paths], rejected);
            if (accepted === undefined) complete = false;
            if (accepted !== true) continue;
            const add = (state: number) => {c.step(owner, 40); masks(); next.set(state + ':' + failed, {state, failed});};
            if (index + 1 === expected.items.length) add(to);
            else for (const edge of program.states[to].transitions) {c.step(owner); if (edge.lo <= 32 && edge.hi >= 32) add(edge.to);}
          }
        }
        current = next; if (!current.size) return complete ? false : undefined;
      }
      for (const {state, failed} of current.values()) {masks(); if (program.states[state].accepting && failed === allFailed) return true;}
      return complete ? false : undefined;
    }
    const expression = inverseExpression(expected, lexical, owner);
    if (expression === undefined && (expected.family === 'QName' || expected.family === 'NOTATION')) return false;
    if (expected.family !== 'list' && (base.plan.variety === 'union' || rejections.length)) {
      const scope = fixedScalarScope(base, expected, lexical, owner);
      const selected = scalarAdmissionPredicate(base, lexical, owner, expected, scope);
      const rejected = rejections.map(description => scalarAdmissionPredicate(description, lexical, owner, undefined, scope));
      if (selected && rejected.every(predicate => predicate !== undefined)) {
        const predicate: LexicalPredicate = {kind: 'and', children: [selected, ...rejected.map(child => ({kind: 'not' as const, child: child!}))]};
        return lexicalPredicates.exists(predicate, regular.intersect(extra, owner), owner);
      }
    }
    if (base.plan.variety === 'union' || rejections.length) {
      if (excludedByEnumeration(base, expected, owner)) return false;
      let complete = true;
      const candidates = base.plan.variety === 'union' ? base.members! : [base];
      for (const member of candidates) {
        c.step(owner);
        if (member.plan.variety === 'atomic' ? expected.family !== member.plan.primitive : expected.family !== 'list') continue;
        if (excludedByEnumeration(member, expected, owner) || excludedByValueFacets(member, expected, owner)) continue;
        const mode = member.plan.whitespace === 'member' ? 'collapse' : member.plan.whitespace;
        const normalized = spellingConstraints(member, owner);
        for (const layer of base.plan.layers) if (layer.patterns.length) normalized.push(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner));
        const raw = regular.intersect([regular.whitespacePreimage(regular.intersect(normalized, owner), mode, owner), ...extra], owner);
        const ieee = expected.family === 'float' || expected.family === 'double';
        type Branch = {raw: RegularLanguage; intervals: readonly IeeeInputInterval[]; literals: readonly string[]; lists: readonly Description[]};
        const literal = expected.canonical === 'NaN' ? 'NaN' : expected.canonical === 'Infinity' ? 'INF' : expected.canonical === '-Infinity' ? '-INF' : undefined;
        c.step(owner, 5); let branches: Branch[] = [{raw, intervals: ieee ? ieeeLanguages.inverseIntervals(expected, owner) : [], literals: literal ? [literal] : [], lists: []}];
        let memberComplete = true;
        c.step(owner, candidates.length + rejections.length + 2);
        const preceding = [...rejections, ...candidates.slice(0, candidates.indexOf(member))];
        for (const prior of preceding) {
          const priorMode = prior.plan.whitespace === 'member' ? 'collapse' : prior.plan.whitespace;
          const priorIeee = prior.plan.primitive === 'float' || prior.plan.primitive === 'double';
          let priorLanguage = priorIeee ? regular.intersect(spellingConstraints(prior, owner), owner) : admissionLanguage(prior, lexical, owner);
          const priorList = !priorLanguage && prior.plan.variety === 'list' && member.plan.variety === 'list';
          if (priorList) {
            if (valueFacetFailure(prior, expected, owner)) continue;
            priorLanguage = regular.intersect(spellingConstraints(prior, owner), owner);
          }
          if (!priorLanguage) {memberComplete = false; break;}
          const priorRaw = regular.whitespacePreimage(priorLanguage, priorMode, owner), next: Branch[] = [];
          for (const branch of branches) {
            const inactive = regular.intersect([branch.raw, regular.negate(priorRaw, owner)], owner);
            if (regular.witness(inactive, owner) !== undefined) next.push({...branch, raw: inactive});
            const active = regular.intersect([branch.raw, priorRaw], owner); if (regular.witness(active, owner) === undefined) continue;
            if (priorList) {
              const finite = prior.plan.layers.find(layer => (enumerations.get(layer)?.size ?? 0) > 0);
              if (!finite) next.push({...branch, raw: active, lists: [...branch.lists, prior]});
              else {
                c.step(owner, 2); const excluded: Description[] = [];
                for (const [facet, value] of enumerations.get(finite)!) {
                  if (value.family !== 'list' || value.items?.length !== expected.items!.length || excludedByEnumeration(prior, value, owner)) continue;
                  c.step(owner, value.items.length * 4 + 4); const items: Description[] = [];
                  for (const item of value.items) {
                    c.step(owner, prior.item!.plan.layers.length + 10);
                    const layer: ScalarConstraintLayer = {owner: prior.plan.id, facets: [facet], patterns: []};
                    enumerations.set(layer, new Map([[facet, item]]));
                    items.push({...prior.item!, plan: {...prior.item!.plan, layers: [...prior.item!.plan.layers, layer]}});
                  }
                  c.step(owner, 5); excluded.push({...prior, membershipItems: items});
                }
                next.push({...branch, raw: active, lists: [...branch.lists, ...excluded]});
              }
              continue;
            }
            if (!priorIeee) continue;
            if (member.plan.variety === 'list') {
              // An IEEE lexical word has no internal whitespace, so a list
              // on this branch has exactly one token. Its earlier whole-word
              // numeric predicate is that token's rejection predicate.
              c.step(owner, 12); const singleton: Description = {...prior, item: prior,
                plan: {...prior.plan, variety: 'list', primitive: undefined}};
              next.push({...branch, raw: active, lists: [...branch.lists, singleton]}); continue;
            }
            if (ieee) {
              const rejected = ieeeAdmission(prior, owner);
              next.push({raw: active, lists: branch.lists, intervals: ieeeLanguages.subtractIntervals(branch.intervals, rejected.intervals, owner),
                literals: branch.literals.filter(value => !rejected.literals.includes(value))});
            } else if (expression !== undefined) {
              // Every numeric spelling in a fixed non-IEEE inverse has the
              // same rational value (or one fixed INF/NaN literal).
              const candidates = regular.intersect([active, regular.whitespacePreimage(expressionLanguage(expression, owner), mode, owner)], owner);
              const word = regular.witness(candidates, owner);
              if (word !== undefined) {
                let admitted = true;
                try {operand(prior, {...lexical, value: word}, owner);}
                catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error; admitted = false;}
                if (!admitted) next.push({...branch, raw: active});
              }
            } else {memberComplete = false; break;}
          }
          branches = next;
        }
        if (!memberComplete) {complete = false; continue;}
        for (const branch of branches) {
          const filtered = regular.whitespaceImage(branch.raw, mode, owner);
          if (ieee) {
            for (const literal of branch.literals) if (regular.witness(regular.intersect([filtered, expressionLanguage(quoteExpression(literal, owner), owner)], owner), owner) !== undefined) return true;
            for (const interval of branch.intervals) if (ieeeLanguages.intervalWitness(filtered, interval, owner) !== undefined) return true;
          } else {
            const decision = regularMembership(member, expected, lexical, owner, [filtered], [], branch.lists);
            if (decision === true) return true; if (decision === undefined) complete = false;
          }
        }
      }
      return complete ? false : undefined;
    }
    const constraints = [...spellingConstraints(base, owner), ...extra];
    if ((expected.family === 'float' || expected.family === 'double') && base.plan.variety === 'atomic') {
      if (excludedByEnumeration(base, expected, owner) || excludedByValueFacets(base, expected, owner)) return false;
      const word = ieeeLanguages.witness(regular.intersect(constraints, owner), expected, owner);
      if (word === undefined) return false;
      if (!accepts(word)) throw new TypeError('Exact IEEE inverse product must issue an assessed equal-value witness');
      return true;
    }
    if (expected.duration && base.plan.variety === 'atomic') {
      if (excludedByEnumeration(base, expected, owner) || excludedByValueFacets(base, expected, owner)) return false;
      c.step(owner, extra.length + 2); const durationPatterns: RegularLanguage[] = [...extra];
      for (const layer of base.plan.layers) {
        c.step(owner, layer.patterns.length + 1);
        if (layer.patterns.length) durationPatterns.push(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner));
      }
      const canMatch = (expression: string): boolean => regular.witness(regular.intersect([...durationPatterns, expressionLanguage(expression, owner)], owner), owner) !== undefined;
      for (const expression of durationAliasExpressions(expected.duration, owner, c, canMatch)) {
        const word = regular.witness(regular.intersect([...durationPatterns, expressionLanguage(expression, owner)], owner), owner);
        if (word !== undefined && accepts(word)) return true;
      }
      return false;
    }
    if (expected.calendar && base.plan.variety === 'atomic') {
      if (excludedByEnumeration(base, expected, owner) || excludedByValueFacets(base, expected, owner)) return false;
      // Integral-minute zones preserve both seconds modulo sixty and the
      // exact fractional part. Zone presence is also a value invariant.
      const calendar = expected.calendar, decimal = calendar.seconds;
      c.step(owner, (decimal.digits + decimal.scale + 8) ** 2);
      const power = 10n ** BigInt(decimal.scale), remainder = (decimal.coefficient % power + power) % power;
      const whole = (decimal.coefficient - remainder) / power, second = Number((whole % 60n + 60n) % 60n);
      c.step(owner, decimal.scale + 16);
      const fraction = remainder === 0n ? '([.]0+)?' : '[.]' + remainder.toString().padStart(decimal.scale, '0').replace(/0+$/, '') + '0*';
      const zone = '(Z|[+\\-][0-9]{2}:[0-9]{2})';
      let invariant = primitiveLexicalExpression(base)!;
      c.step(owner, invariant.length * 3 + fraction.length + 24);
      invariant = invariant.slice(0, -(zone.length + 1)) + (calendar.zoned ? zone : '');
      if (calendar.family === 'dateTime' || calendar.family === 'time') {
        c.step(owner, invariant.length * 2 + fraction.length + 16);
        const seconds = second === 0 ? '(00|60)' : second.toString().padStart(2, '0');
        invariant = invariant.replace('[0-9]{2}([.][0-9]+)?', seconds + fraction);
      }
      if (regular.witness(regular.intersect([...constraints, expressionLanguage(invariant, owner)], owner), owner) === undefined) return false;
      // Each generated branch already proves lexical validity and exact
      // value equality, so only the inherited pattern languages remain.
      c.step(owner, extra.length + 2); const calendarPatterns: RegularLanguage[] = [...extra];
      for (const layer of base.plan.layers) {
        c.step(owner, layer.patterns.length + 1);
        if (layer.patterns.length) calendarPatterns.push(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner));
      }
      for (const expression of calendarAliasExpressions(expected.calendar, owner, c)) {
        const language = regular.intersect([...calendarPatterns, expressionLanguage(expression, owner)], owner);
        const word = regular.witness(language, owner);
        if (word !== undefined && accepts(word)) return true;
      }
      return false;
    }
    if (expression !== undefined) {
      const language = regular.intersect([...constraints, expressionLanguage(expression, owner)], owner);
      const word = regular.witness(language, owner);
      if (word === undefined) return false;
      if (accepts(word)) return true;
      // For atomic inverse languages all words have this value, and member
      // grammar/value predicates depend only on it. Lists still need their
      // ordered item-member assessment and are exhausted separately below.
      if (base.plan.variety === 'atomic') return false;
      const finite = regular.finiteWords(language, owner);
      if (finite.kind === 'infinite') return undefined;
      for (const word of finite.words) if (accepts(word)) return true;
      return false;
    }
    // Complete finite admitted lexical spaces support every datatype family,
    // using its actual value parser rather than a lexical-family surrogate.
    const finite = regular.finiteWords(regular.intersect(constraints, owner), owner);
    if (finite.kind === 'infinite') return undefined;
    for (const word of finite.words) if (accepts(word)) return true;
    return false;
  };
  const wordLengthLanguage = (name: string, length: string, owner: GraphNode): RegularLanguage => {
    c.text(length, owner);
    const min = name === 'maxLength' ? '0' : length, max = name === 'minLength' ? 'unbounded' : length;
    return regular.fromPattern([{kind: 'character', expression: '[^]'}, {kind: 'repeat', child: 0, min, max}], 1, owner);
  };
  const valueLengthLanguage = (description: Description, name: string, length: string, owner: GraphNode): RegularLanguage | undefined => {
    if (description.plan.variety === 'atomic' && (description.plan.primitive === 'string' || description.plan.primitive === 'anyURI')) return wordLengthLanguage(name, length, owner);
    c.text(length, owner);
    const minimum = name === 'maxLength' ? '0' : length, maximum = name === 'minLength' ? undefined : length;
    if (description.plan.primitive === 'hexBinary') return expressionLanguage(`([0-9a-fA-F]{2}){${minimum},${maximum ?? ''}}`, owner);
    if (description.plan.primitive === 'base64Binary') {
      c.step(owner, minimum.length ** 2 + (maximum?.length ?? 0) ** 2 + 8);
      const min = BigInt(minimum), max = maximum === undefined ? undefined : BigInt(maximum), branches: RegularLanguage[] = [];
      const quartet = '([A-Za-z0-9+/] *[A-Za-z0-9+/] *[A-Za-z0-9+/] *[A-Za-z0-9+/] *)';
      for (let residue = 0n; residue < 3n; residue++) {
        c.step(owner, (minimum.length + (maximum?.length ?? 0)) * 8 + 20);
        if (max !== undefined && max < residue) continue;
        const first = min > residue ? (min - residue + 2n) / 3n : 0n;
        const maximumQuotient = max === undefined ? undefined : (max - residue) / 3n;
        if (maximumQuotient !== undefined && maximumQuotient < first) continue;
        const last = maximumQuotient === undefined ? '' : String(maximumQuotient);
        const ending = residue === 0n ? '' : residue === 1n ? '[A-Za-z0-9+/] *[AQgw] *= *=' : '[A-Za-z0-9+/] *[A-Za-z0-9+/] *[AEIMQUYcgkosw048] *=';
        c.step(owner, quartet.length + ending.length + minimum.length + (maximum?.length ?? 0) + 16);
        branches.push(expressionLanguage(`${quartet}{${first},${last}}${ending}`, owner));
      }
      return regular.union(branches, owner);
    }
    if (description.plan.variety === 'list') {
      c.step(owner, length.length ** 2 + 4);
      const min = BigInt(minimum), max = maximum === undefined ? undefined : BigInt(maximum);
      const token = '[^ \\t\\r\\n]+';
      if (max === 0n) return expressionLanguage('', owner);
      const lower = min > 0n ? min - 1n : 0n, upper = max === undefined ? '' : String(max - 1n);
      c.step(owner, minimum.length + (maximum?.length ?? 0) + 24);
      const nonempty = `${token}( ${token}){${lower},${upper}}`;
      return expressionLanguage(min === 0n ? `(${nonempty})?` : nonempty, owner);
    }
    return undefined;
  };
  /** Normalized spelling domain for string values; every word is its own value. */
  const normalizedStringLanguage = (description: Description, owner: GraphNode): RegularLanguage => {
    if (description.plan.whitespace === 'preserve') return wordLengthLanguage('minLength', '0', owner);
    if (description.plan.whitespace === 'replace') return expressionLanguage('[^\\t\\r\\n]*', owner);
    return expressionLanguage('([^ \\t\\r\\n]+( [^ \\t\\r\\n]+)*)?', owner);
  };
  /** Complete regular proof for string value lengths, with all retained layers. */
  const regularLengthContainment = (base: Description, result: Description, inherited: readonly ScalarTuple[], supplied: readonly ScalarTuple[], owner: GraphNode): boolean => {
    if (result.plan.primitive === 'QName' || result.plan.primitive === 'NOTATION')
      return inherited.every(prior => lengthNames.includes(prior.name) || supplied.some(derived => restrictsScalar(derived, prior, owner)));
    if (!['string', 'anyURI', 'hexBinary', 'base64Binary'].includes(result.plan.primitive!) && result.plan.variety !== 'list') return false;
    const missing = inherited.filter(prior => !supplied.some(derived => restrictsScalar(derived, prior, owner)));
    if (missing.some(prior => !lengthNames.includes(prior.name))) return false;
    c.step(owner, 4); const constraints: RegularLanguage[] = spellingConstraints(result, owner);
    for (const tuple of supplied) if (lengthNames.includes(tuple.name)) {
      c.step(owner); constraints.push(valueLengthLanguage(result, tuple.name, tuple.property.integer!, owner)!);
    }
    // Source builtin subtypes retain their lexical grammar; complete raw
    // atomic properties instead assess over the primitive value space.
    if (!result.rawProperties && result.plan.builtin) for (const expression of result.intrinsic?.patterns ?? []) {
      c.step(owner);
      const pattern = intrinsicPatterns.compile({value: expression, context: owner.context}, owner);
      intrinsicCompiled.add(pattern); constraints.push(patternLanguage(pattern, owner));
    }
    for (const prior of missing) {
      const language = regular.intersect([...constraints, regular.negate(valueLengthLanguage(result, prior.name, prior.property.integer!, owner)!, owner)], owner);
      const witness = result.plan.variety === 'list'
        ? listLanguageWitness(result, language, {value: '', context: owner.context}, owner) : regular.witness(language, owner);
      if (witness !== undefined) {
        let assessed: SchemaOperand;
        try {assessed = operand(result, {value: witness, context: owner.context}, owner);}
        catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error; return false;}
        if (!excludedByValueFacets(base, assessed, owner)) throw new TypeError('Regular length counterexample must violate a base value facet');
        c.fail(owner, 'scalar-value-space-restriction', 'A value admitted by the derived type is excluded by the base length facets');
      }
    }
    return true;
  };
  /** F2 scalar duties and a sound finite value-containment certificate.
   * A missing implication proof remains unresolved; only an assessed value
   * outside the base establishes widening. Pattern/enum inventories are
   * checked separately below, so they cannot be silently dropped here.
   */
  const exactScalarRestriction = (base: Description, result: Description, owner: GraphNode): boolean => {
    const source = sourceComponentTable(base, owner);
    c.step(owner, (source?.length ?? 0) * 4 + 2);
    const inherited = source ? source.filter(entry => !['pattern', 'enumeration'].includes(entry.component.name)).map(({component}) =>
      ({name: component.name, property: component.values[0], facet: component.facet, annotation: component.annotation,
        identity: component.identity, annotationIdentity: component.annotationIdentity})) : scalarTuples(base, owner);
    const supplied = scalarTuples(result, owner);
    const localBounds = new Set<string>(), possiblyRetained = new Set<string>();
    let complete = true;
    for (const name of boundNames) {
      c.step(owner, (inherited.length + supplied.length) * 2 + 3);
      const baseKind = inherited.filter(prior => prior.name === name);
      const resultKind = supplied.filter(value => value.name === name);
      // c-fr replaces a complete kind. Only a fully unchanged kind can be
      // inherited with no contribution of that kind to the local set S.
      const annotation = (a: ScalarTuple, b: ScalarTuple) => a.identity && a.identity === b.identity
        || a.annotationIdentity && a.annotationIdentity === b.annotationIdentity
        ? 'equal' : annotationRelation(a.annotation, b.annotation);
      if (resultKind.length && !sameExactSet(baseKind, resultKind, (a, b) =>
        sameFacetProperty(a.property, b.property, owner) && annotation(a, b) === 'equal', owner)) {
        localBounds.add(name);
        if (sameExactSet(baseKind, resultKind, (a, b) => sameFacetProperty(a.property, b.property, owner)
          && annotation(a, b) !== 'different', owner)) possiblyRetained.add(name);
      }
    }
    c.step(owner, supplied.length * 2 + 3);
    if (supplied.some(tuple => tuple.name === 'minInclusive') && supplied.some(tuple => tuple.name === 'minExclusive'))
      c.fail(owner, 'facet-bound-pair', 'Inclusive and exclusive lower bounds cannot coexist on the same datatype');
    if (localBounds.has('maxInclusive') && localBounds.has('maxExclusive')) {
      if (possiblyRetained.has('maxInclusive') || possiblyRetained.has('maxExclusive')) complete = false;
      else c.fail(owner, 'facet-bound-pair', 'Inclusive and exclusive upper bounds cannot both be supplied in one restriction step');
    }
    for (const derived of supplied) {
      let hasKind = false, compatible = false;
      for (const prior of inherited) {
        c.step(owner);
        if (prior.name === derived.name) {
          hasKind = true;
          // Valid-restriction clauses forbid explicit comparisons. A value
          // implication below additionally needs a determinate order.
          if (compatibleScalar(derived, prior, owner)) compatible = true;
          if (prior.property.fixed && !sameFacetValue(derived.property, prior.property, owner))
            c.fail(owner, 'facet-fixed', 'Every effective facet must retain every fixed base value');
        } else if (boundNames.includes(derived.name) && boundNames.includes(prior.name)) {
          const order = values.compare(derived.property.operand!, prior.property.operand!, owner);
          if (order !== undefined && (lower(derived.name) === lower(prior.name)
            ? (lower(derived.name) ? order < 0 : order > 0) || order === 0 && !exclusive(derived.name) && exclusive(prior.name)
            : lower(derived.name) ? order > 0 || order === 0 && exclusive(prior.name)
              : order < 0 || order === 0 && (exclusive(derived.name) || exclusive(prior.name))))
            c.fail(owner, `${derived.name}-valid-restriction`, 'Facet violates an inherited bound relation');
        }
      }
      if (hasKind && !compatible) c.fail(owner, `${derived.name}-valid-restriction`, 'No compatible same-kind base facet');
      if (!boundNames.includes(derived.name) || !derived.facet) continue;
      if (!localBounds.has(derived.name)) continue;
      const endpoint = derived.property.operand!;
      if (exclusive(derived.name) && inherited.some(prior => {
        c.step(owner); return prior.name === derived.name && values.sameValue(endpoint, prior.property.operand!, owner);
      })) continue;
      if (excludedByEnumeration(base, endpoint, owner) || excludedByValueFacets(base, endpoint, owner)) {
        if (possiblyRetained.has(derived.name)) {complete = false; continue;}
        c.fail(owner, `${derived.name}-value`, 'New bound operand is outside the base value space', derived.facet.lexical.context.source);
      }
      const membership = membershipWitness(base, endpoint, derived.facet.lexical, owner);
      if (membership === false && !possiblyRetained.has(derived.name)) c.fail(owner, `${derived.name}-value`, 'No base lexical spelling denotes the new typed bound', derived.facet.lexical.context.source);
      if (membership !== true) complete = false;
    }
    for (const a of supplied) for (const b of supplied) {
      c.step(owner);
      if (a.name === 'length' && b.name === 'length' && a.property.integer !== b.property.integer)
        c.fail(owner, 'length-conjunction', 'Complete length constraints are inconsistent');
      if ((a.name === 'length' || a.name === 'minLength') && b.name === 'maxLength'
        && c.algebra.compare(a.property.integer!, b.property.integer!) > 0
        || a.name === 'minLength' && b.name === 'length' && c.algebra.compare(a.property.integer!, b.property.integer!) > 0)
        c.fail(owner, 'length-minLength-maxLength', 'Length facet constraints are inconsistent');
      if (a.name === 'fractionDigits' && b.name === 'totalDigits'
        && c.algebra.compare(a.property.integer!, b.property.integer!) > 0)
        c.fail(owner, 'fractionDigits-totalDigits', 'fractionDigits cannot exceed totalDigits');
      if (boundNames.includes(a.name) && lower(a.name) && boundNames.includes(b.name) && !lower(b.name)) {
        const order = values.compare(a.property.operand!, b.property.operand!, owner);
        if (order !== undefined && (order > 0 || order === 0 && exclusive(a.name) !== exclusive(b.name)))
          c.fail(owner, 'facet-bound-order', 'Lower and upper facet constraints are inconsistent');
      }
      if (a.name !== 'length' || !['minLength', 'maxLength'].includes(b.name)) continue;
      let ancestor: Description | undefined = base, witnessed = false;
      while (ancestor) {
        const properties = scalarTuples(ancestor, owner);
        if (!properties.some(property => property.name === 'length')
          && properties.some(property => property.name === b.name && sameFacetValue(property.property, b.property, owner))) {
          witnessed = true; break;
        }
        c.step(owner); ancestor = ancestor.parent;
      }
      if (!witnessed) c.fail(owner, 'length-minLength-maxLength', 'Coexisting length and minimum/maximum require the matching proper ancestor');
    }
    return scalarValueContainment(base, result, owner) && complete;
  };
  /** Containment concerns every actual VALUE predicate, separately from metadata. */
  const scalarValueContainment = (base: Description, result: Description, owner: GraphNode): boolean => {
    const inherited = valueFacetTuples(base, owner), supplied = valueFacetTuples(result, owner);
    const covered = inherited.every(prior => {
      c.step(owner);
      return supplied.some(derived => restrictsScalar(derived, prior, owner));
    });
    if (covered) return true;
    // Every main layer tests the same selected normalized result. An empty
    // intersection proves containment without comparing whitespace modes;
    // separate conjuncts, list items and union members do not share that word.
    c.step(owner, result.plan.layers.length * 2 + 2);
    const mainPatterns: RegularLanguage[] = [];
    for (const layer of result.plan.layers) if (layer.patterns.length) {
      c.step(owner, layer.patterns.length * 2 + 2);
      mainPatterns.push(regular.union(layer.patterns.map(pattern => patternLanguage(pattern, owner)), owner));
    }
    if (mainPatterns.length && regular.witness(regular.intersect(mainPatterns, owner), owner) === undefined) return true;
    if (regularLengthContainment(base, result, inherited, supplied, owner)) return true;
    if (decimalContainment(base, result, inherited, supplied, owner)) return true;
    // A complete enumeration bounds the result's entire value space, even
    // when an independently retained scalar bound is weaker than a base one.
    c.step(owner, inherited.length * 2 + 1);
    const whitespaceCovered = inherited.filter(prior => prior.name === 'whiteSpace')
      .every(prior => supplied.some(derived => restrictsScalar(derived, prior, owner)));
    // Saved facet contexts still qualify NEW operands, not the current whole image.
    c.step(owner, 2); const lexical: LexicalValue = {value: '', context: owner.context};
    if (whitespaceCovered) for (const group of result.plan.layers) {
      c.step(owner); const members = enumerations.get(group);
      if (!members?.size) continue;
      let includesAll = true;
      for (const value of members.values()) {
        c.step(owner);
        if (!excludedByValueFacets(base, value, owner)
          || excludedByValueFacets(result, value, owner) || excludedByEnumeration(result, value, owner)) continue;
        const membership = membershipWitness(result, value, lexical, owner);
        if (membership === true)
          c.fail(owner, 'scalar-value-space-restriction', 'A derived enumeration value is excluded by the base');
        if (membership === undefined) includesAll = false;
      }
      if (includesAll) return true;
    }
    // Try supplied spellings before constructing complete datatype products.
    const counterexample = (lexical: LexicalValue): void => {
      let value: SchemaOperand;
      try {value = operand(result, lexical, owner);}
      catch (error) {
        if (error instanceof SchemaAssessmentError && error.category === 'invalid-schema') return;
        throw error;
      }
      if (excludedByValueFacets(base, value, owner))
        c.fail(owner, 'scalar-value-space-restriction', 'A value admitted by the derived facets is excluded by the base');
    };
    for (const tuple of supplied) {
      c.step(owner);
      if (tuple.facet && boundNames.includes(tuple.name)) counterexample(tuple.facet.lexical);
    }
    if (ieeeContainment(base, result, inherited, supplied, owner)) return true;
    if (calendarContainment(base, result, inherited, supplied, owner)) return true;
    if (durationContainment(base, result, inherited, supplied, owner)) return true;
    if (whitespaceCovered) for (const group of result.plan.layers) {
      c.step(owner);
      if (!group.patterns.length) continue;
      let finite = true;
      for (const pattern of group.patterns) {
        const language = patternOwner(pattern).literalLanguage(pattern, owner);
        if (language.kind === 'outside-fragment') {finite = false; continue;}
        for (const value of language.words) {
          c.step(owner, 3); counterexample({value, context: owner.context});
        }
      }
      // Every normalized spelling passes this disjunction. If every branch
      // was exhaustively enumerated, no other derived value is possible.
      if (finite) return true;
    }
    if (result.plan.primitive === 'string') {
      const size = lengthProperty(result, 'length') ?? lengthProperty(result, 'minLength') ?? '0';
      c.text(size, owner);
      const length = Number(size);
      // This is an optional positive counterexample probe, never an upper
      // bound on the datatype. Avoid native string-size failures on huge
      // exact facet integers; unresolved implication remains explicit.
      if (Number.isSafeInteger(length) && length <= bufferConstants.MAX_STRING_LENGTH) {
        c.step(owner, length + 4);
        counterexample({value: 'a'.repeat(length), context: owner.context});
      }
      for (const prior of inherited) {
        c.step(owner);
        if (prior.name !== 'maxLength') continue;
        c.text(prior.property.integer!, owner);
        const maximum = Number(prior.property.integer);
        if (Number.isSafeInteger(maximum) && maximum < bufferConstants.MAX_STRING_LENGTH) {
          c.step(owner, maximum + 5);
          counterexample({value: 'a'.repeat(maximum + 1), context: owner.context});
        }
      }
    }
    return false;
  };
  /** Exact component restriction; no regex-language inclusion is assumed. */
  const rawFacetCorrespondence = (base: Description, result: Description, reference: Reference, owner: GraphNode): boolean => {
    type Constraint = Description['facets'] extends Map<string, infer T> ? T : never;
    const effective = new Map<string, Constraint>(); let complete = true, reductionDeterminate = true;
    if (base.plan.variety === 'union' && result.plan.variety === 'union') {
      // Member ancestry alone does not preserve the first-selected image.
      c.step(owner, base.members!.length * 2 + 1);
      if (base.members!.some((member, index) => index < base.members!.length - 1
        && member.definition !== result.members![index]?.definition)
        && !selectedUnionContainment(base, result, owner)) complete = false;
    }
    const exact = result.exactComponentSet !== undefined || base.exactComponentSet !== undefined;
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
        if (!exact && prior.facet.fixed !== constraint.facet.fixed) complete = false;
        if (constraint.facet.fixed) effective.set(name, constraint);
        continue;
      }
      // The abstract representation normalizes comparable nonfixed scalar
      // conjuncts. Conflicting fixed metadata is retained as an obligation.
      if (!exact && (prior.facet.fixed || constraint.facet.fixed)) complete = false;
      let choose = false;
      if (name === "length") c.fail(owner, "length-conjunction", "Complete length constraints are inconsistent");
      else if (constraint.integer && prior.integer) {
        const order = c.algebra.compare(constraint.integer, prior.integer); choose = name === "minLength" ? order > 0 : order < 0;
      } else if (constraint.operand && prior.operand) {
        const order = values.compare(constraint.operand, prior.operand, owner);
        if (order === undefined) {if (!exact) complete = false; reductionDeterminate = false; continue;}
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
      if (!exact && (inclusive.facet.fixed || exclusiveValue.facet.fixed)) complete = false;
      const order = values.compare(inclusive.operand!, exclusiveValue.operand!, owner);
      if (order === undefined) {if (!exact) complete = false; reductionDeterminate = false; continue;}
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
    if (!exact && reductionDeterminate) layer(base, reference, owner, facets, false);
    for (const [name, constraint] of effective) {
      c.step(owner);
      if (exact || preserved.has(name) || !boundNames.includes(name) || !constraint.facet.operand || !constraint.operand) continue;
      // A privately assessed typed value establishes its original datatype,
      // not membership in this restriction's base value space. Exclusive
      // bounds alone may repeat their same-kind inherited endpoint.
      const inherited = facetProperty(base, name, owner)?.operand;
      if (exclusive(name) && inherited && values.sameValue(constraint.operand, inherited, owner)) continue;
      if (excludedByEnumeration(base, constraint.operand, owner) || excludedByValueFacets(base, constraint.operand, owner)) c.fail(owner, `${name}-value`, "Bound value is outside the base value space", constraint.facet.lexical.context.source);
      const membership = membershipWitness(base, constraint.operand, constraint.facet.lexical, owner);
      if (membership === false) c.fail(owner, `${name}-value`, 'No base lexical spelling denotes the typed bound', constraint.facet.lexical.context.source);
      if (membership !== true) complete = false;
    }
    result.facets = effective;
    if (exact) {if (!exactScalarRestriction(base, result, owner)) complete = false;}
    else checkLengthProperties(result, owner);
    const inheritedScalars = exact ? scalarTuples(base, owner) : undefined;
    c.step(owner, inheritedScalars ? inheritedScalars.length * 2 + 2 : 1);
    const inheritedNames = inheritedScalars ? [...new Set(inheritedScalars.map(tuple => tuple.name))] : facetNames(base, owner);
    const inheritedPatterns = patternProperties(base, owner), suppliedPatterns = patternProperties(result, owner);
    const source = sourceComponentTable(base, owner);
    c.step(owner, (source?.length ?? 0) * 2 + 2);
    const inheritedRepeatables = source ? source.filter(entry => ['pattern', 'enumeration'].includes(entry.component.name))
      : currentRepeatableComponents(base, owner);
    const suppliedRepeatables = currentRepeatableComponents(result, owner);
    // Presence comes from the supplied component inventory, before scalar
    // reduction. A qualified reduction can hide a supplied kind in the map;
    // that is missing correspondence evidence, not an omitted component.
    c.step(owner, 2); const suppliedKinds = new Set<string>();
    for (const group of result.plan.layers) for (const facet of group.facets) {
      c.step(owner, 2); if (facet.name !== 'pattern' && facet.name !== 'enumeration') suppliedKinds.add(facet.name);
    }
    for (const facet of result.intrinsic?.scalars ?? []) {c.step(owner, 2); suppliedKinds.add(facet.name);}
    for (const {component} of suppliedRepeatables) {c.step(owner, 2); suppliedKinds.add(component.name);}
    const hasEnumeration = (description: Description): boolean => {
      const components = currentRepeatableComponents(description, owner); c.step(owner, components.length + 1);
      return components.some(value => value.component.name === 'enumeration');
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
      const represented = exact ? suppliedKinds.has(name) : facetProperty(result, name, owner) !== undefined || !inherited.fixed && (
        name.startsWith("min") && boundNames.includes(name) && (effective.has("minInclusive") || effective.has("minExclusive"))
        || name.startsWith("max") && boundNames.includes(name) && (effective.has("maxInclusive") || effective.has("maxExclusive")));
      if (!represented) omitted(name);
    }
    if (inheritedPatterns.length && !suppliedKinds.has('pattern')) omitted('pattern');
    if (hasEnumeration(base) && !suppliedKinds.has('enumeration')) omitted('enumeration');
    for (const prior of inheritedPatterns) {
      c.step(owner);
      if (!suppliedKinds.has('pattern')) continue;
      if (suppliedPatterns.some(group => samePatternProperty(prior, group, owner))) continue;
      c.fail(owner, 'st-restrict-facets', 'Complete raw facet properties omit an inherited pattern expression');
    }
    for (const {component: prior} of inheritedRepeatables) {
      c.step(owner); if (prior.name !== 'enumeration' || !suppliedKinds.has('enumeration')) continue;
      if (!suppliedRepeatables.some(group => exactValueRelation(prior, group.component, owner) === 'equal'))
        c.fail(owner, 'st-restrict-facets', 'Complete raw facet properties omit an inherited enumeration component');
    }
    for (const entry of suppliedRepeatables) {
      c.step(owner); if (entry.component.name !== 'enumeration') continue;
      const group = entry.layer!;
      // Equal values cover an inherited value-set property, but retaining its
      // introduction also needs this component's annotation or issued identity.
      const supplied = entry.component; let retained = false, ambiguous = false;
      for (const {component: inherited} of inheritedRepeatables) {
        if (exactValueRelation(inherited, supplied, owner) !== 'equal') continue;
        const relation = supplied.identity && supplied.identity === inherited.identity
          || supplied.annotationIdentity && supplied.annotationIdentity === inherited.annotationIdentity
          ? 'equal' : annotationRelation(supplied.annotation, inherited.annotation);
        if (relation === 'equal') {retained = true; break;}
        if (relation === 'unresolved') ambiguous = true;
      }
      if (retained) continue;
      for (const facet of group.facets) if (facet.name === "enumeration") {
        const expected = enumerations.get(group)!.get(facet)!;
        if (excludedByEnumeration(base, expected, owner) || excludedByValueFacets(base, expected, owner)) {
          // Failed new formation cannot reject a still-possible retained component.
          if (ambiguous) {complete = false; continue;}
          c.fail(owner, "enumeration-valid-restriction", "Enumeration component contains a value outside the base value space", facet.lexical.context.source);
        }
        // Every candidate is assessed by the exact base, retaining ordered
        // union selection and namespace context. Failed finite search is not
        // a complete negative membership answer.
        const membership = membershipWitness(base, expected, facet.lexical, owner);
        if (membership === false && !ambiguous) c.fail(owner, 'enumeration-valid-restriction', 'No base lexical spelling denotes the typed enumeration value', facet.lexical.context.source);
        if (membership !== true) complete = false;
      }
    }
    if (!exact && !scalarValueContainment(base, result, owner)) complete = false;
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
      for (const group of rawSimple.facetLayers ?? rawSimple.facetComponentSet ?? []) if ('facets' in group) for (const facet of group.facets) {
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
  const qualifyNotationConstituent = (value: Description, owner: GraphNode): void => {
    c.step(owner);
    if (value.plan.primitive !== 'NOTATION') return;
    for (const layer of value.plan.layers) {
      c.step(owner, layer.facets.length + 1);
      if (layer.facets.some(facet => facet.name === 'enumeration')) return;
    }
    c.fail(owner, 'enumeration-required-notation', 'A NOTATION list item or union member requires an enumeration-qualified datatype');
  };
  /** Completed source-only atomic or singleton-DECIMAL union chains have stable survivors.
   * This reader never enters ensure, brands generic CURRENT records or issues
   * VALUE/P1 identity. Every entry owns its already formed H introduction. */
  const sourceComponentTable = (base: Description, owner: GraphNode): readonly RawComponentReplay[] | undefined => {
    c.step(owner, 3);
    const sourceUnion = base.plan.variety === 'union';
    if (base.rawProperties || !sourceUnion && (base.plan.variety !== 'atomic' || !['decimal', 'string', 'QName'].includes(base.plan.primitive!))) return undefined;
    c.text(base.definition, owner);
    if (base.definition.startsWith('builtin:') || base.definition.startsWith('content:')) return undefined;
    const cached = sourceComponentTables?.get(base); if (cached !== undefined) return cached || undefined;
    if (!sourceComponentTables) {c.step(owner, 2); sourceComponentTables = new WeakMap();}
    const unavailable = (): undefined => {c.step(owner, 2); sourceComponentTables!.set(base, false); return undefined;};
    c.step(owner, 4); const origins = new Map<Facet, SimpleTypeNode>();
    let reference: Reference = {kind: 'local', target: base.definition};
    while (reference.kind !== 'builtin') {
      const node = c.get(c.target(reference, owner)!);
      if (node.kind !== 'simpleType' || c.context.sourceNode(node.id) !== node || c.context.rawSimpleTypeProperties(node.id)) return unavailable();
      if (sourceUnion && node.variety.kind === 'union') {
        c.step(owner, 12);
        if (node.variety.members.length !== 1 || base.plan.members?.length !== 1 || base.members?.length !== 1) return unavailable();
        const literal = node.variety.members[0], effective = base.plan.members[0], member = base.members[0];
        if (literal.kind !== 'builtin' || effective.kind !== 'builtin') return unavailable();
        for (const reference of [literal, effective]) {c.text(reference.name.namespace, owner); c.text(reference.name.local, owner);}
        c.text(member.definition, owner);
        if (literal.name.namespace !== XSD_NAMESPACE || literal.name.local !== 'decimal'
          || effective.name.namespace !== XSD_NAMESPACE || effective.name.local !== 'decimal'
          || member.definition !== 'builtin:decimal' || member.plan.builtin !== 'decimal') return unavailable();
        break;
      }
      if (node.variety.kind !== 'restriction') return unavailable();
      c.step(owner, node.variety.facets.length * 3 + 3);
      for (const facet of node.variety.facets) {
        if ('operand' in facet && facet.operand !== undefined) return unavailable();
        origins.set(facet, node);
      }
      reference = node.variety.base;
    }
    if (reference.kind === 'builtin') {
      if (sourceUnion) return unavailable();
      c.text(reference.name.namespace, owner); c.text(reference.name.local, owner);
      if (reference.name.namespace !== XSD_NAMESPACE || reference.name.local !== base.plan.primitive) return unavailable();
    }
    const scalars = scalarTuples(base, owner);
    c.step(owner, scalars.length * 3 + 3);
    scalars.sort((a, b) => {c.text(a.name, owner); c.text(b.name, owner); return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;});
    const repeatables = currentRepeatableComponents(base, owner);
    c.step(owner, scalars.length * 3 + repeatables.length * 3 + 4);
    const drafts: {component: ExactFacetComponent; facets: readonly Facet[]; origin: SimpleTypeNode}[] = [];
    for (const tuple of scalars) {
      const origin = tuple.facet && origins.get(tuple.facet); if (!origin) return unavailable();
      drafts.push({component: {name: tuple.name, values: [tuple.property], annotation: tuple.annotation, facet: tuple.facet},
        facets: [tuple.facet!], origin});
    }
    for (const {component, layer} of repeatables) {
      if (!layer || !sourceSteps?.has(layer)) return unavailable();
      c.step(owner, layer.facets.length * 2 + 2);
      const facets = layer.facets.filter(facet => facet.name === component.name), origin = origins.get(facets[0]);
      if (!origin || facets.length !== component.values.length || facets.some(facet => origins.get(facet) !== origin)) return unavailable();
      drafts.push({component, facets, origin});
    }
    c.step(owner, drafts.length * 6 + 4); const entries: RawComponentReplay[] = [];
    const family = c.context.originalContext(); let issuers = sourceFacetIncidences.get(family);
    if (!issuers) {c.step(owner, 2); issuers = new WeakMap(); sourceFacetIncidences.set(family, issuers);}
    for (const draft of drafts) {
      c.step(owner, draft.facets.length * 3 + 8);
      let kinds = issuers.get(draft.origin);
      if (!kinds) {c.step(owner, 2); kinds = new Map(); issuers.set(draft.origin, kinds);}
      c.text(draft.component.name, owner); let identity = kinds.get(draft.component.name);
      if (!identity) {c.step(owner, 3); identity = Object.freeze({}); kinds.set(draft.component.name, identity);}
      const component = Object.freeze({...draft.component, annotationIdentity: identity});
      const values = draft.facets.map((facet, index) => facet.name === 'enumeration' || boundNames.includes(facet.name)
        ? component.values[index].operand : undefined);
      entries.push(Object.freeze({component, facets: draft.facets, source: Object.freeze({values: Object.freeze(values),
        obligations: base.plan.obligations ?? [], typeDependencies: base.typeDependencies ?? []})}));
    }
    c.step(owner, 3); const complete = Object.freeze(entries); sourceComponentTables.set(base, complete); return complete;
  };
  /** A complete formed inventory owns its current introductions. KEEP retains
   * actual components, including opaque annotations and intrinsic builtin facts;
   * it never borrows authority from a property-equal sibling. */
  const formedComponentTable = (base: Description, owner: GraphNode): readonly RawComponentReplay[] | undefined => {
    c.step(owner, 3);
    if (base.rawProperties && !base.exactComponentSet && !base.originalFacetIdentity
      && base.plan.obligations?.some(item => item.rule === 'raw-simple-facet-restriction-validity')) return undefined;
    const cached = formedComponentTables?.get(base); if (cached !== undefined) return cached || undefined;
    if (!formedComponentTables) {c.step(owner, 2); formedComponentTables = new WeakMap();}
    const unavailable = (): undefined => {c.step(owner, 2); formedComponentTables!.set(base, false); return undefined;};
    const scalars = scalarTuples(base, owner), repeatables = currentRepeatableComponents(base, owner);
    c.step(owner, scalars.length * 3 + 3);
    scalars.sort((a, b) => {c.text(a.name, owner); c.text(b.name, owner); return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;});
    c.step(owner, scalars.length * 7 + repeatables.length * 5 + 4);
    const drafts: {component: ExactFacetComponent; facets: readonly Facet[]}[] = [];
    for (const tuple of scalars) {
      c.step(owner, 7);
      const facet: Facet = tuple.facet ?? {name: tuple.name, fixed: tuple.property.fixed,
        lexical: {value: tuple.property.integer ?? tuple.property.operand?.canonical ?? tuple.property.lexical!, context: owner.context}};
      drafts.push({component: {name: tuple.name, values: [tuple.property], facet,
        annotation: tuple.annotation, identity: tuple.identity ?? facet, annotationIdentity: tuple.annotationIdentity}, facets: [facet]});
    }
    for (const {component, layer} of repeatables) {
      c.step(owner, (layer?.facets.length ?? component.values.length) * 7 + 2);
      if (!layer && component.name !== 'pattern') return unavailable();
      const facets: readonly Facet[] = layer ? layer.facets.filter(facet => facet.name === component.name)
        : component.values.map(property => ({name: 'pattern', fixed: false, lexical: {value: property.lexical!, context: owner.context}}));
      if (!layer) for (const facet of facets) {c.step(owner); intrinsicFacets.add(facet);}
      if (!facets.length || facets.length !== component.values.length) return unavailable();
      drafts.push({component, facets});
    }
    c.step(owner, drafts.length * 5 + 3); const entries: RawComponentReplay[] = [];
    for (const {component, facets} of drafts) {
      c.step(owner, facets.length * 5 + 5);
      const values = facets.map((facet, index) => facet.name === 'enumeration' || boundNames.includes(facet.name)
        ? component.values[index].operand : undefined);
      const intrinsic = facets.map(facet => intrinsicFacets.has(facet));
      entries.push(Object.freeze({component, facets, source: Object.freeze({values: Object.freeze(values),
        intrinsicPatterns: Object.freeze(intrinsic), obligations: base.plan.obligations ?? [], typeDependencies: base.typeDependencies ?? []})}));
    }
    c.step(owner, 3); const complete = Object.freeze(entries); formedComponentTables.set(base, complete); return complete;
  };
  const componentTable = (reference: Reference, base: Description, owner: GraphNode): readonly RawComponentReplay[] | undefined => {
    if (reference.kind === 'original-generated') return formedComponentTable(base, owner);
    const node = scalarOperandNode(reference, owner);
    const row = node?.kind === 'simpleType' ? c.context.rawSimpleTypeProperties(node.id) : undefined;
    if (!row) return sourceComponentTable(base, owner) ?? formedComponentTable(base, owner);
    if (!row.facetComponentSet) return formedComponentTable(base, owner);
    c.step(owner, 4);
    if (!rawComponentTables) {c.step(owner, 2); rawComponentTables = new WeakMap();}
    const cached = rawComponentTables.get(row); if (cached) return cached;
    if (!base.exactComponentSet || base.exactComponentSet.length !== row.facetComponentSet.length)
      throw new TypeError('Raw component table must match its completed scalar owner');
    c.step(owner, row.facetComponentSet.length * 5 + 4); const entries: RawComponentReplay[] = [];
    for (let index = 0; index < row.facetComponentSet.length; index++) {
      const entry = row.facetComponentSet[index];
      if (!('facets' in entry)) throw new TypeError('A completed selector row must publish its replay table');
      entries.push(Object.freeze({component: base.exactComponentSet[index], facets: entry.facets}));
    }
    const table = Object.freeze(entries); c.step(owner, 2); rawComponentTables.set(row, table); return table;
  };
  const wholeKeepSector = (base: Description, table: readonly RawComponentReplay[], groups: readonly {facets: readonly Facet[]; selected?: ExactFacetComponent}[],
    components: readonly ExactFacetComponent[], owner: GraphNode): boolean => {
    c.step(owner, table.length * 3 + groups.length * 6 + 4); let complete = true;
    const incidence = (component: ExactFacetComponent) => component.annotationIdentity ?? component.identity;
    const selected = new Set(groups.flatMap(group => group.selected && incidence(group.selected) ? [incidence(group.selected)] : []));
    const patternValue = (component: ExactFacetComponent): string => {
      c.step(owner, component.values.length * 2 + 2); return patternExpression(component.values.map(value => value.lexical!), owner);
    };
    for (const entry of table) if (entry.component.name === 'enumeration' || entry.component.name === 'pattern') {
      c.step(owner); if (!selected.has(incidence(entry.component))) complete = false;
    }
    // Raw ordinals cover their completed components, not additional source or
    // intrinsic properties which have no entry in that replay inventory.
    const current = sourceComponentTable(base, owner) ?? currentRepeatableComponents(base, owner);
    for (const {component} of current) {
      c.step(owner, 2);
      if (!['pattern', 'enumeration'].includes(component.name)) continue;
      if (!incidence(component) || !selected.has(incidence(component))) complete = false;
    }
    const newPatterns: string[] = [];
    for (let index = 0; index < groups.length; index++) {
      c.step(owner, 2); if (groups[index].selected) continue;
      const component = components[index];
      // Ordinary correspondence still checks every new enumeration value
      // against the current base; retained components cover its old sets.
      if (component.name !== 'pattern') continue;
      const expression = patternValue(component);
      for (const entry of table) if (entry.component.name === 'pattern') {
        const prior = patternValue(entry.component); c.step(owner, expression.length + prior.length + 1);
        if (expression === prior) complete = false;
      }
      for (const prior of newPatterns) {c.step(owner, expression.length + prior.length + 1); if (expression === prior) complete = false;}
      c.step(owner, 2); newPatterns.push(expression);
    }
    for (const name of boundNames) {
      c.step(owner, table.length * 3 + groups.length * 5 + 4);
      const inherited = table.filter(entry => entry.component.name === name);
      const indices = components.flatMap((component, index) => component.name === name ? [index] : []);
      if (indices.some(index => groups[index].selected)) {
        if (indices.some(index => !groups[index].selected) || inherited.some(entry => !selected.has(incidence(entry.component)))) complete = false;
      }
    }
    return complete;
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
      let result: Description, replayTable: readonly RawComponentReplay[] | undefined;
      const shape = slot ? generatedShape(slot, node) : undefined;
      const rawSimple: RawSimpleTypeProperties | undefined = shape ? {type:node.id, base:shape.base, final:[],
        targetNamespace:shape.targetNamespace, variety:shape.variety === 'atomic' ? {kind:'atomic'} : shape.variety === 'list' ? {kind:'list',item:shape.item!} : {kind:'union',members:shape.members!},
        facetBinding:{kind:'original',type:slot!}, provenance:{kind:'actual-mapped',original:node.id}}
        : c.context.rawSimpleTypeProperties(node.id);
      const rawComplex = slot ? undefined : c.context.rawTypeProperties(node.id);
      if (rawSimple) {
        const base = description(rawSimple.base), variety = rawSimple.variety;
        const bound = rawSimple.facetBinding ? recipe(rawSimple.facetBinding.type, node) : undefined;
        const groups: {facets: readonly Facet[]; identity?: object; annotation?: FacetAnnotation; selected?: ExactFacetComponent; ordinal?: number; sourceStep?: SourceFacetStep;
          replay?: RawComponentReplay['source']}[] = [];
        let selectedTable: readonly RawComponentReplay[] | undefined;
        let importedPatterns = false;
        let tableUnavailable = false;
        if (bound) for (const group of bound.layers) {
          c.step(node, group.facets.length * 5 + 3); const facets: Facet[] = [];
          for (const item of group.facets) {
            const facet = c.budget.freeze(c.budget.snapshot(item.facet)); facets.push(facet);
            if (item.value) boundFacetValues.set(facet,item.value);
            if(item.intrinsicPattern)intrinsicFacets.add(facet);
            boundAnnotations.set(facet,item.annotation);
            if(item.payload!==undefined)boundAnnotationPayloads.set(facet,item.payload);
          }
          groups.push({facets,identity:group.identity,sourceStep:group.sourceStep});
        } else if (rawSimple.facetComponentSet) for (const [ordinal, group] of rawSimple.facetComponentSet.entries()) {
          if (!('facets' in group)) {
            if ('builtinPattern' in group) {
              const source = builtin({kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: group.builtinPattern.name}}, node);
              const table = formedComponentTable(source, node);
              c.step(node, (table?.length ?? 0) * 2 + 4);
              const selected = table?.filter(entry => entry.component.name === 'pattern')[group.builtinPattern.index];
              if (!selected) return c.fail(node, 'raw-builtin-pattern-component', 'Builtin has no intrinsic pattern component at this ordinal');
              const replay = selected.source;
              if (!replay || replay.intrinsicPatterns?.length !== selected.facets.length || !replay.intrinsicPatterns.every(Boolean))
                return c.fail(node, 'raw-builtin-pattern-component', 'Selected builtin component lacks intrinsic pattern authority');
              c.step(node, selected.facets.length * 6 + 4);
              const facets = c.budget.freeze(c.budget.snapshot(selected.facets.map(facet => ({name: facet.name, fixed: facet.fixed, lexical: facet.lexical}))));
              for (const [index, facet] of facets.entries()) {
                c.step(node, 4);
                if (replay.intrinsicPatterns![index]) intrinsicFacets.add(facet);
                facetObligations.set(facet, replay.obligations);
                facetDependencies.set(facet, replay.typeDependencies);
              }
              groups.push({facets, annotation: selected.component.annotation, ordinal, replay});
              importedPatterns = true; continue;
            }
            selectedTable ??= componentTable(rawSimple.base, base, node);
            if (!selectedTable) {tableUnavailable = true; continue;}
            c.step(node, 24); const selected = selectedTable[group.baseComponent];
            if (!selected) c.fail(node, 'raw-base-facet-component', 'Immediate-base component ordinal is out of range');
            c.step(node, selected.source ? selected.facets.length * 4 + 3 : 3);
            const recipe = selected.source ? selected.facets.map(facet => ({name: facet.name, fixed: facet.fixed, lexical: facet.lexical})) : selected.facets;
            const facets = c.budget.freeze(c.budget.snapshot(recipe));
            if (selected.source) for (const [index, facet] of facets.entries()) {
              c.step(node, 4); const value = selected.source.values[index];
              if (value) boundFacetValues.set(facet, value);
              if (selected.source.intrinsicPatterns?.[index]) intrinsicFacets.add(facet);
              facetObligations.set(facet, selected.source.obligations);
              facetDependencies.set(facet, selected.source.typeDependencies);
            }
            groups.push({facets, annotation: selected.component.annotation, selected: selected.component, replay: selected.source}); continue;
          }
          // Caller extensions are data, never privately issued component identity.
          c.step(node, 2); groups.push({facets: group.facets, annotation: group.annotation, ordinal});
        } else for (const [ordinal, group] of (rawSimple.facetLayers ?? []).entries()) {
          c.step(node, 2); groups.push({facets: group.facets, identity: rawFacetIdentities(rawSimple, node)[ordinal]});
        }
        if (node.identity.kind === "global" && rawSimple.targetNamespace !== undefined) {
          c.text(rawSimple.targetNamespace, node); c.text(node.identity.name.namespace, node);
          if (rawSimple.targetNamespace !== node.identity.name.namespace) c.fail(node, "raw-simple-target-namespace", "Named type namespace differs from its immutable identity");
        }
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
        const identities = rawSimple.facetComponentSet?.length ? rawFacetIdentities(rawSimple, node) : undefined;
        for (const group of groups) {
          c.step(node, group.facets.length + 1);
          if (urBase && group.facets.some(facet => variety.kind === "union" || facet.name !== "whiteSpace")) c.fail(node, "cos-st-restricts", "List/union construction facets violate the simple ur-base rule");
          if (urBase && variety.kind === "list" && group.facets.some(facet => !facet.fixed)) c.fail(node, "cos-st-restricts", "A list constructor requires its fixed-collapse whitespace component");
          const formed = layer(intrinsic, frame.reference, node, group.facets, false);
          if (group.identity) for (const installed of formed.plan.layers) {c.step(node);layerIdentities.set(installed,group.identity);}
          if (group.sourceStep) attachSourceStep(formed.plan.layers.at(-1)!, group.sourceStep, node);
          if (exactComponentSet) {
            const name = group.facets[0].name, installed = formed.plan.layers.at(-1)!;
            c.step(node, group.facets.length * 5 + 6);
            const component: ExactFacetComponent = {name, facet: name === 'pattern' || name === 'enumeration' ? undefined : group.facets[0], values:group.facets.map(facet => name === 'pattern'
              ? {fixed:false, lexical:facet.lexical.value} : name === 'enumeration'
                ? {fixed:false, operand:enumerations.get(installed)!.get(facet)!} : facetProperty(formed, name, node)!),
            annotation:group.annotation, identity:identities![group.ordinal ?? exactComponentSet.length]};
            if (group.selected) {
              if (exactValueRelation({...component, identity: undefined}, {...group.selected, identity: undefined}, node) !== 'equal')
                c.fail(node, 'raw-base-facet-component-value', 'Current-context replay changed the selected component properties');
              if (group.selected.annotationIdentity) component.annotationIdentity = group.selected.annotationIdentity;
              else {
                component.identity = group.selected.identity;
                // Retention uses the actual BASE component above. This row's
                // immutable occurrence supplies only annotation continuity.
                component.annotationIdentity = identities![group.ordinal ?? exactComponentSet.length];
                c.step(node, 2); layerIdentities.set(installed, component.identity!);
              }
            }
            exactComponentSet.push(component);
            if (name === 'enumeration' || name === 'pattern') exactLayerComponents.set(installed, component);
          }
          conjuncts.push(formed);
        }
        // An unavailable entry supplies no partial complete inventory. Still
        // form known literals first so independent parser/type failures survive.
        if (tableUnavailable) return c.unresolved(node, 'raw-simple-facet-restriction-validity', 'Immediate base has no complete authenticated component replay table');
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
        result = {...intrinsic, exactComponentSet, conjuncts: conjuncts.map(conjunct => ({...conjunct, plan: {...conjunct.plan, whitespace}})), plan: {...intrinsic.plan, whitespace, layers, enforcement: [...requirements]}};
        // Sector qualification never short-circuits ordinary formation/F2.
        const ordinaryCorrespondence = urBase || rawFacetCorrespondence(base, result, frame.reference, node);
        let facetCorrespondence = ordinaryCorrespondence;
        if (selectedTable) {
          c.step(node, 4);
          facetCorrespondence = wholeKeepSector(base, selectedTable, groups, exactComponentSet!, node) && ordinaryCorrespondence;
        }
        if (selectedTable || importedPatterns) {
          c.step(node, groups.length * 4 + 3);
          replayTable = Object.freeze(groups.map((group, index) => Object.freeze({component: exactComponentSet![index], facets: group.facets, source: group.replay})));
        }
        // These are exact supplied effective constraints. Proving they restrict
        // the base's complete constraints is a separate semantic obligation.
        c.step(node, (base.plan.obligations?.length ?? 0) + (result.item?.plan.obligations?.length ?? 0) + 4);
        const inherited = [...(base.plan.obligations ?? []), ...(result.item?.plan.obligations ?? []), ...(bound?.obligations ?? [])];
        if (node.identity.kind === "scoped" && rawSimple.targetNamespace === undefined && !c.context.sourceNode(node.id)) inherited.push({rule: "raw-simple-target-namespace", component: node.id});
        for (const member of result.members ?? []) {c.step(node, (member.plan.obligations?.length ?? 0) + 1); inherited.push(...(member.plan.obligations ?? []));}
        for (const group of groups) for (const facet of group.facets) {
          const required = facetObligations.get(facet) ?? []; c.step(node, required.length + 1); inherited.push(...required);
        }
        if (!facetCorrespondence) inherited.push({rule: "raw-simple-facet-restriction-validity", component: node.id});
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
      if (result.item) qualifyNotationConstituent(result.item, node);
      c.step(node, (result.plan.obligations?.length ?? 0) + (result.item?.plan.obligations?.length ?? 0) + 2);
      const obligations = [...(result.plan.obligations ?? []), ...(result.item?.plan.obligations ?? [])];
      for (const member of result.members ?? []) {
        qualifyNotationConstituent(member, node);
        c.step(node, (member.plan.obligations?.length ?? 0) + 1); obligations.push(...(member.plan.obligations ?? []));
      }
      result = withDependencies(frame.reference,{...result, plan: {...result.plan, obligations}},node);
      if (replayTable) {
        c.step(node, 2);
        if (!rawComponentTables) {c.step(node, 2); rawComponentTables = new WeakMap();}
        rawComponentTables.set(rawSimple!, replayTable);
      }
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
    const source = sourceComponentTable(description, owner);
    c.step(owner, (source?.length ?? 0) * 2 + 2);
    const repeatables = source ? source.filter(entry => ['pattern', 'enumeration'].includes(entry.component.name))
      : currentRepeatableComponents(description, owner);
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
    for (const {component} of repeatables) {
      c.step(owner, component.values.length + 3);
      annotation(facetAnnotationPresence(component.annotation));
      if (component.name === 'enumeration') enumerationGroups.push(component.values.map(value => value.operand!));
    }
    const patternGroups = patternProperties(description, owner);
    const exact: ExactFacetComponent[] | undefined = description.exactComponentSet !== undefined
      || !description.rawProperties || description.originalFacetIdentity
      || !description.plan.obligations?.some(obligation => obligation.rule === 'raw-simple-facet-restriction-validity') ? [] : undefined;
    if (exact) {
      if (source) {
        c.step(owner, source.length + 1); for (const entry of source) exact.push(entry.component);
      } else if (description.exactComponentSet !== undefined) {
        for (const component of description.exactComponentSet) {
          c.step(owner); if (component.name !== 'pattern' && component.name !== 'enumeration') exact.push(component);
        }
      } else {
        for (const name of names) {
          const explicit = description.facets.get(name);
          c.step(owner, 4);
          exact.push({name,values:[scalars.get(name)!], identity: reducedScalarIdentity(description, name, owner),
            annotation:explicit ? boundAnnotationPayloads.get(explicit.facet) ?? sourceFacetPayloads.get(explicit.facet) ?? explicit.facet.annotation : 'absent'});
        }
      }
      if (!source) {c.step(owner, repeatables.length + 1); for (const {component} of repeatables) exact.push(component);}
    }
    if(exact){
      annotations=description.plan.obligations?.length?'unresolved':'absent';
      for(const component of exact){
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
      c.step(owner, left.values.length + right.values.length + 4);
      return samePatternProperty(
        {expressions: left.values.map(value => value.lexical!), identity: left.identity},
        {expressions: right.values.map(value => value.lexical!), identity: right.identity}, owner) ? 'equal' : 'different';
    }
    return sameExactSet(left.values,right.values,(a,b)=>sameFacetProperty(a,b,owner),owner)?'equal':'different';
  };
  const annotationRelation=(a:FacetAnnotation|undefined,b:FacetAnnotation|undefined):'equal'|'different'|'unresolved'=>{
    c.step(undefined,2);
    if(a===undefined||b===undefined)return 'unresolved';
    return compareFacetAnnotation(a,b,c.budget);
  };
  const exactAnnotationRelation=(left:ExactFacetComponent,right:ExactFacetComponent):'equal'|'different'|'unresolved'=>
    left.identity&&left.identity===right.identity||left.annotationIdentity&&left.annotationIdentity===right.annotationIdentity
      ?'equal':annotationRelation(left.annotation,right.annotation);
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
      return sameExactSet(x.exact,y.exact,(left,right)=>exactValueRelation(left,right,owner)==='equal',owner);
    }
    if (x.exact || y.exact) return c.unresolved(owner, 'raw-simple-facet-restriction-validity',
      'Comparing an exact inventory requires a proved normal form for the other operand');
    c.step(owner, x.scalars.size + y.scalars.size + 2);
    const names = new Set([...x.scalars.keys(), ...y.scalars.keys()]);
    for (const name of names) {
      c.step(owner); const left = x.scalars.get(name), right = y.scalars.get(name);
      if (!left || !right || !sameFacetProperty(left, right, owner)) return false;
    }
    if (!x.patterns.every(group => y.patterns.some(other => samePatternProperty(group, other, owner)))
      || !y.patterns.every(group => x.patterns.some(other => samePatternProperty(group, other, owner)))) {
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
      if (facets.length) layers.push({facets,identity:layerIdentities.get(group) ?? group,sourceStep:sourceSteps?.get(group)});
    }
    c.step(owner,4+(value.plan.obligations?.length??0)*8); const token:OriginalScalarFacetRecipe=Object.freeze({kind:'original-scalar-facet-recipe'});
    originalRecipes.set(token,{context:c.context,layers,identity:value,obligations:(value.plan.obligations ?? []).map(obligation=>({...obligation,contextId:obligation.contextId??c.context.contextId})),typeDependencies:value.typeDependencies??[]});
    originalRecipeTokens.set(value,token);return token;
  };
  /** Private alias word bound from genuine CURRENT masks/tables, without caller descriptions. */
  const privateAliasEndpointWordCapacity = (reference: Reference, owner: GraphNode) => {
    const description = ensure(reference, owner), family = description.plan.primitive;
    if (description.plan.variety !== 'atomic' || !family || !['decimal', 'duration', 'dateTime', 'date', 'time', 'gYear', 'gYearMonth', 'gMonthDay', 'gDay', 'gMonth', 'float', 'double'].includes(family))
      return c.unsupported(owner, 'endpoint-bound-family', 'Endpoint capacity requires a bound-capable atomic family');
    const table = componentTable(reference, description, owner);
    if (!table) return c.unresolved(owner, 'endpoint-current-inventory', 'Endpoint capacity needs the genuine completed CURRENT component table');
    c.step(owner, table.length * 4 + 4);
    const inventory: {ordinal: number; kind: string; fixed: readonly boolean[]; annotation: ScalarFacetAnnotationPresence}[] = [];
    let boundCount = 0, constantTextUnits = 0, inputMagnitude = 0n, magnitudeDigits = 1, primitiveConstantUnits = 0;
    const kinds = new Set<string>();
    for (let ordinal = 0; ordinal < table.length; ordinal++) {
      const entry = table[ordinal], component = entry.component; c.step(owner, component.values.length * 8 + 6);
      inventory.push({ordinal, kind: component.name, fixed: component.values.map(property => property.fixed), annotation: facetAnnotationPresence(component.annotation)});
      if (!boundNames.includes(component.name)) continue;
      kinds.add(component.name);
      for (let valueAt = 0; valueAt < component.values.length; valueAt++) {
        const value = component.values[valueAt].operand;
        if (!value) return c.unresolved(owner, 'endpoint-current-bound-value', 'CURRENT bound component lacks its assessed primitive operand');
        boundCount++;
        const constantLexical = entry.facets[valueAt]?.lexical ?? {value: value.canonical, context: owner.context};
        const text = constantLexical.value; c.text(text, owner); constantTextUnits += text.length;
        if (family === 'float' || family === 'double') {
          // A same-kind exclusive repeat needs only a primitive word, even if CURRENT admission is empty.
          let primitiveWord: string | undefined;
          try {if (values.sameValue(values.atomic(family, constantLexical, owner), value, owner)) primitiveWord = text;}
          catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== 'invalid-schema') throw error;}
          primitiveWord ??= ieeeLanguages.witness(expressionLanguage(primitiveLexicalExpression(description)!, owner), value, owner);
          if (primitiveWord === undefined) return c.unresolved(owner, 'endpoint-primitive-constant', 'Actual bound value needs its genuine primitive operand spelling');
          primitiveConstantUnits = Math.max(primitiveConstantUnits, primitiveWord.length);
        }
        const coordinates = [value.decimal, value.calendar?.seconds, value.duration?.seconds];
        for (const coordinate of coordinates) if (coordinate) {
          const digits = coordinate.digits ?? Math.max(text.length + 32, value.canonical.length + 32);
          c.step(owner, (digits + 4) ** 2 + 8); const magnitude = coordinate.coefficient < 0n ? -coordinate.coefficient : coordinate.coefficient;
          if (magnitude > inputMagnitude) inputMagnitude = magnitude; magnitudeDigits = Math.max(magnitudeDigits, digits);
        }
        if (value.duration) {
          const digits = value.duration.digits + 32; c.step(owner, (digits + 4) ** 2 + 8);
          const magnitude = value.duration.months < 0n ? -value.duration.months : value.duration.months;
          if (magnitude > inputMagnitude) inputMagnitude = magnitude; magnitudeDigits = Math.max(magnitudeDigits, digits);
        }
      }
    }
    const roles = kinds.size, formulaLeaves = 16 * (boundCount + 4) ** 2;
    if (!Number.isSafeInteger(roles) || roles < 0 || !Number.isSafeInteger(formulaLeaves) || formulaLeaves < 0)
      throw new TypeError('Private endpoint demand counts must be finite safe naturals');
    const lexical = {value: '', context: owner.context};
    // A native spelling contradiction proves admission empty before costly calendar value preimages.
    // Ensure/table qualification and all formation obligations have already been retained.
    const syntax = regular.intersect(spellingConstraints(description, owner), owner);
    const predicate: LexicalPredicate | undefined = regular.witness(syntax, owner) === undefined
      ? {kind: 'regular', language: syntax} : atomicAdmissionPredicate(description, lexical, owner);
    if (!predicate) return c.unresolved(owner, 'endpoint-current-admission', 'Endpoint capacity needs the actual scalar admission compiler');
    if (family !== 'float' && family !== 'double') {
      if (predicate.kind !== 'regular') return c.unresolved(owner, 'endpoint-current-admission', 'This atomic endpoint admission is not a compiled regular word mask');
      const mask = regular.automaton(predicate.language, owner);
      const metrics = {family, roles, formulaLeaves, rawMaskStates: roles * mask.states.length,
        constantCount: boundCount, constantTextUnits, inputMagnitude, magnitudeDigits};
      const capacity = endpointCapacity(metrics, count => c.step(owner, count));
      c.step(owner, 8); return {...capacity, inventory, maskAuthority: 'current-atomic-admission' as const};
    }
    const languages: RegularLanguage[] = [];
    const spelling = (node: LexicalPredicate): void => {
      c.step(owner, 2); if (node.kind === 'regular') {languages.push(node.language); return;}
      if (node.kind === 'numeric') return; // Taking all actual values is a conservative capacity superset.
      if (node.kind === 'and') {for (const child of node.children) spelling(child); return;}
      return c.unresolved(owner, 'endpoint-ieee-spelling', 'IEEE capacity needs the actual positive regular spelling conjunction');
    };
    spelling(predicate); const raw = regular.intersect(languages, owner), normalized = regular.whitespaceImage(raw, 'collapse', owner);
    let maximum = primitiveConstantUnits;
    let enumEntry: RawComponentReplay | undefined;
    for (const entry of table) {c.step(owner, 3); if (entry.component.name === 'enumeration'
      && (!enumEntry || entry.component.values.length < enumEntry.component.values.length)) enumEntry = entry;}
    function* finiteValues(): Generator<SchemaOperand> {
      if (enumEntry) for (const property of enumEntry.component.values) {c.step(owner); const operand = property.operand; if (operand && operand.family === family) yield operand;}
      else yield* ieeeLanguages.formatValues(family as 'float' | 'double', owner);
    }
    for (const value of roles ? finiteValues() : []) {
      const word = ieeeLanguages.witness(normalized, value, owner); if (word === undefined) continue;
      const restored = regular.witness(regular.intersect([raw, regular.whitespacePreimage(expressionLanguage(quoteExpression(word, owner), owner), 'collapse', owner)], owner), owner);
      if (restored === undefined) throw new TypeError('Exact IEEE whitespace image must have its raw preimage');
      maximum = Math.max(maximum, restored.length);
    }
    const encodedTupleUnits = 2 * roles * maximum;
    if (!Number.isSafeInteger(encodedTupleUnits)) {c.step(owner, Number.MAX_SAFE_INTEGER); throw new Error('Unreachable exhausted IEEE capacity');}
    c.step(owner, 64); return {kind: 'finite-ieee-capacity' as const, family, roles, maximumWordUnits: maximum,
      encodedTupleUnits, inventory, maskAuthority: 'current-ieee-spelling-and-finite-inverse' as const};
  };
  return {privateAliasEndpointWordCapacity,typeDependencies:(reference:Reference,owner:GraphNode)=>ensure(reference,owner).typeDependencies??[],ensure: (reference: Reference, owner: GraphNode) => ensure(reference, owner).plan, checkFinal, checkValue, assessConstraint, equivalent,
    contentIdentity, contentProperties, readOriginalRecipe, contentDerivation, facetPropertiesEquivalent, readFacetProperties, compareFacetProperties,compareFacetAnnotations,
    selectOperand: (reference: Reference, owner: GraphNode): void => {scalarOperandNode(reference, owner, true);},
    assess: (reference: Reference, lexical: LexicalValue, owner: GraphNode) => operand(ensure(reference, owner), lexical, owner),
    compare: values.compare};
}
