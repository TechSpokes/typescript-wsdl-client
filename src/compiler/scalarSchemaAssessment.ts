/** Scalar schema legality and enforcement ownership. Payload enforcement is #184. */
import {isBuiltinType} from "./canonicalGraph.js";
import type {GraphNode, LexicalValue, NodeId, Reference, ValueConstraint} from "./canonicalGraph.js";
import type {ScalarFacet as Facet} from "./schemaSimpleTypeProperties.js";
import {checkTypeDerivation, declarationMethods, RelationProblem} from "./schemaTypeRelations.js";
import type {AssessmentContext} from "./schemaScalarContext.js";
import {SchemaAssessmentError} from "./schemaScalarContext.js";
import {builtinParents, builtinPrimitive, integerBounds, normalizeWhitespace, schemaDatatypeValues, whitespaceFor} from "./schemaDatatypeValues.js";
import type {SchemaOperand} from "./schemaDatatypeValues.js";
import {schemaPatterns} from "./schemaPattern.js";
import type {SchemaPattern} from "./schemaPattern.js";
import {XSD_NAMESPACE} from "../loader/orderedSyntax.js";

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
type Description = {
  plan: ScalarSupportPlan; item?: Description; members?: Description[];
  conjuncts?: readonly Description[];
  facets: Map<string, {facet: Facet; operand?: SchemaOperand; integer?: string}>;
  /** Scalar component identity, including anonymous simple-content restrictions. */
  definition: string; parent?: Description;
};
const excluded = new Set(["NOTATION", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES"]);
const boundNames = ["minInclusive", "minExclusive", "maxInclusive", "maxExclusive"];
const lengthNames = ["length", "minLength", "maxLength"];
const integerFacets = new Set([...lengthNames, "totalDigits", "fractionDigits"]);
const lower = (name: string) => name.startsWith("min");
const exclusive = (name: string) => name.endsWith("Exclusive");

export function scalarSchemaAssessment(c: AssessmentContext, options: {schemaOperandsOnly?: boolean;
  originalFacet?: (type: Reference, lexical: LexicalValue, owner: NodeId) => {operand: SchemaOperand; obligations: readonly ScalarObligation[]}} = {}) {
  const descriptions = new Map<string, Description>(), values = schemaDatatypeValues(c), patterns = schemaPatterns(c);
  const referenceKey = (reference: Reference, owner: GraphNode): string => {
    if (reference.kind !== "builtin") return c.target(reference, owner)!;
    c.text(reference.name.local, owner); c.text(reference.name.namespace, owner);
    if (reference.name.namespace !== XSD_NAMESPACE || !isBuiltinType(reference.name.local)) return c.fail(owner, "src-resolve", "Unknown builtin scalar type");
    return `builtin:${reference.name.local}`;
  };
  const checkFinal = (base: Reference, method: string, owner: GraphNode) => {
    if (base.kind === "builtin") return;
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
    if (["NMTOKENS", "IDREFS", "ENTITIES"].includes(name)) {
      const item: Reference = {kind: "builtin", name: {namespace: XSD_NAMESPACE, local: name === "NMTOKENS" ? "NMTOKEN" : name === "IDREFS" ? "IDREF" : "ENTITY"}};
      const itemDescription = builtin(item, owner);
      const result: Description = {definition: key, plan: {id: key, reference, variety: "list", builtin: name, item, layers: [], whitespace: "collapse", enforcement: ["lexical-space", "whitespace", "list", "length"], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, item: itemDescription, facets: new Map()};
      descriptions.set(key, result); return result;
    }
    const primitive = builtinPrimitive(name);
    const result: Description = {definition: key, plan: {id: key, reference, variety: "atomic", primitive, builtin: name, layers: [], whitespace: whitespaceFor(name), enforcement: ["lexical-space", "whitespace", ...(primitive === "QName" ? ["QName-context" as const] : []), ...(integerBounds[name] ? ["numeric-bounds" as const] : []), ...(builtinParents[name] && primitive === "decimal" ? ["numeric-precision" as const] : [])], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, facets: new Map()};
    descriptions.set(key, result); return result;
  };
  const operands = new WeakMap<Description, WeakMap<LexicalValue, SchemaOperand>>();
  type OperandRequest = {description: Description; lexical: LexicalValue; owner: GraphNode};
  function* operandStep({description, lexical, owner}: OperandRequest): Generator<OperandRequest, SchemaOperand, SchemaOperand> {
    const cache = operands.get(description), cached = cache?.get(lexical); if (cached) return cached;
    c.text(lexical.value, owner);
    const whitespace = description.plan.whitespace === "member" ? "preserve" : description.plan.whitespace;
    const normalized = normalizeWhitespace(lexical.value, whitespace);
    let result: SchemaOperand;
    if (description.plan.variety === "atomic") result = {...values.atomic(description.plan.builtin ?? description.plan.primitive!, lexical, owner, whitespace), normalized};
    else if (description.plan.variety === "list") {
      const keys: string[] = [], items: SchemaOperand[] = [], tokens = normalized ? normalized.split(" ") : [];
      c.step(owner, tokens.length);
      for (const token of tokens) {
        c.step(owner); const item = yield {description: description.item!, lexical: {...lexical, value: token}, owner};
        c.text(item.canonical, owner); keys.push(JSON.stringify([item.family, item.canonical])); items.push(item);
      }
      if (["NMTOKENS", "IDREFS", "ENTITIES"].includes(description.plan.builtin ?? "") && !tokens.length) c.fail(owner, "cvc-minLength-valid", "Builtin token list requires at least one item", lexical.context.source);
      c.step(owner, keys.length); result = {family: "list", canonical: JSON.stringify(keys), length: tokens.length.toString(), normalized, items};
    } else {
      let chosen: SchemaOperand | undefined;
      for (const member of description.members!) {
        c.step(owner);
        try {const assessed = yield {description: member, lexical, owner}; chosen = {...assessed, selectedMembers: [member.plan.reference, ...(assessed.selectedMembers ?? [])]}; break;}
        catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== "invalid-schema") throw error;}
      }
      if (!chosen) c.fail(owner, "cvc-datatype-valid", "Schema union operand matches no declared member", lexical.context.source);
      result = chosen!; // Declaration-order choice is preserved in the plan.
    }
    for (const layer of description.plan.layers) {
      c.step(owner);
      if (layer.patterns.length) {
        let accepted = false;
        for (const pattern of layer.patterns) {if (patterns.acceptsOperand(pattern, result.normalized!, owner)) {accepted = true; break;}}
        if (!accepted) c.fail(owner, "cvc-pattern-valid", "Schema operand violates its inherited pattern layer", lexical.context.source);
      }
      const enumeration: SchemaOperand[] = [];
      for (const facet of layer.facets) {
        c.step(owner);
        if (facet.name === "enumeration") {
          // Values were checked against the base before the layer was installed.
          const value = enumerations.get(facet); if (value) enumeration.push(value);
        }
      }
      if (enumeration.length && !enumeration.some(e => values.sameValue(e, result, owner))) c.fail(owner, "cvc-enumeration-valid", "Schema operand is outside the inherited enumeration", lexical.context.source);
    }
    for (const [name, constraint] of description.facets) {
      c.step(owner);
      if (lengthNames.includes(name)) {
        if (description.plan.primitive === "QName" || description.plan.primitive === "NOTATION") continue; // XSD 1.0 cvc-length-valid: any value is facet-valid.
        if (result.length === undefined) c.fail(owner, "facet-applicability", "Length constraint has no datatype unit", lexical.context.source);
        const order = c.algebra.compare(result.length!, constraint.integer!);
        if (name === "length" && order !== 0 || name === "minLength" && order < 0 || name === "maxLength" && order > 0) c.fail(owner, `cvc-${name}-valid`, "Schema operand violates a length facet", lexical.context.source);
      } else if (boundNames.includes(name)) {
        const order = values.compare(result, constraint.operand!, owner);
        const violates = order === undefined || (lower(name) ? exclusive(name) ? order <= 0 : order < 0 : exclusive(name) ? order >= 0 : order > 0);
        if (violates) c.fail(owner, `cvc-${name}-valid`, "Schema operand violates an ordered bound", lexical.context.source);
      } else if (name === "totalDigits" || name === "fractionDigits") {
        const decimal = result.decimal;
        if (!decimal) c.fail(owner, "facet-applicability", "Precision facet requires exact decimal values", lexical.context.source);
        c.step(owner, decimal!.digits ?? 20);
        const digits = (decimal!.coefficient < 0n ? -decimal!.coefficient : decimal!.coefficient).toString().length.toString();
        if (c.algebra.compare(name === "totalDigits" ? digits : decimal!.scale.toString(), constraint.integer!) > 0 || name === "totalDigits" && c.algebra.compare(decimal!.scale.toString(), constraint.integer!) > 0) c.fail(owner, `cvc-${name}-valid`, "Schema operand violates numeric precision", lexical.context.source);
      }
    }
    for (const conjunct of description.conjuncts ?? []) {c.step(owner); yield {description: conjunct, lexical, owner};}
    c.step(owner); const updated = cache ?? new WeakMap(); updated.set(lexical, result); operands.set(description, updated); return result;
  }
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
  const enumerations = new Map<Facet, SchemaOperand>();
  const facetObligations = new Map<Facet, readonly ScalarObligation[]>();
  const facetOperand = (facet: Facet, base: Description, owner: GraphNode): SchemaOperand => {
    const supplied = facet.operand;
    let value: SchemaOperand;
    if (!supplied) return operand(base, facet.lexical, owner);
    if (supplied.context === "original") {
      if (!options.originalFacet) return c.unresolved(owner, "original-facet-context", "Original typed facet requires the authenticated original context");
      const result = options.originalFacet(supplied.type, facet.lexical, supplied.owner); value = result.operand;
      c.step(owner, result.obligations.length + 1); facetObligations.set(facet, result.obligations);
    } else {
      const originalOwner = c.get(supplied.owner), type = ensure(supplied.type, originalOwner);
      value = operand(type, facet.lexical, originalOwner);
      c.step(owner, (type.plan.obligations?.length ?? 0) + 1); facetObligations.set(facet, type.plan.obligations ?? []);
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
  const layer = (base: Description, reference: Reference, owner: GraphNode, facets: readonly Facet[], sourceRules = true): Description => {
    if (base.plan.builtin === "anySimpleType") c.fail(owner, "cos-st-restricts", "The simple ur-type has absent variety and is not an atomic restriction base");
    c.step(owner, base.plan.layers.length + base.facets.size + base.plan.enforcement.length);
    const result: Description = {definition: owner.kind === "complexType" ? `content:${owner.id}` : owner.id, parent: base, plan: {...base.plan, id: owner.id, reference}, item: base.item, members: base.members, facets: new Map(base.facets)};
    const seen = new Set<string>(), compiled: SchemaPattern[] = [], requirements = new Set(base.plan.enforcement);
    const locals = new Map<string, {facet: Facet; operand?: SchemaOperand; integer?: string}>();
    for (const facet of facets) {
      c.step(owner); c.text(facet.lexical.value, owner); allowFacet(base, facet, owner);
      if (facet.fixed && ["enumeration", "pattern"].includes(facet.name)) c.fail(owner, "facet-fixed-property", "Pattern and enumeration have no fixed property", facet.lexical.context.source);
      if (seen.has(facet.name) && !["enumeration", "pattern"].includes(facet.name)) c.fail(owner, "src-single-facet-value", "Nonrepeatable facet is declared more than once", facet.lexical.context.source);
      seen.add(facet.name);
      if (facet.name === "pattern") {compiled.push(patterns.compile(facet.lexical, owner)); requirements.add("pattern"); continue;}
      if (facet.name === "enumeration") {enumerations.set(facet, facetOperand(facet, base, owner)); requirements.add("enumeration"); continue;}
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
        if (facet.name === "fractionDigits" && builtinPrimitive(base.plan.builtin ?? "") === "decimal" && base.plan.builtin !== "decimal" && integer !== "0") c.fail(owner, "fractionDigits-valid-restriction", "Integer fractionDigits is fixed at zero", facet.lexical.context.source);
        if (["NMTOKENS", "IDREFS", "ENTITIES"].includes(base.plan.builtin ?? "") && lengthNames.includes(facet.name) && integer === "0") c.fail(owner, "length-minLength-maxLength", "Builtin token list has intrinsic minLength 1", facet.lexical.context.source);
        const prior = base.facets.get(facet.name)?.integer;
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
          const inherited = base.facets.get(facet.name)?.operand;
          if (!(error instanceof SchemaAssessmentError) || error.category !== "invalid-schema" || !exclusive(facet.name) || !inherited) throw error;
          const primitive = {...base, facets: new Map<string, {facet: Facet}>(), plan: {...base.plan, layers: []}};
          value = facetOperand(facet, primitive, owner);
          if (!values.sameValue(value, inherited, owner)) throw error;
        }
        locals.set(facet.name, {facet, operand: value}); requirements.add("numeric-bounds");
      }
      const inherited = base.facets.get(facet.name);
      if (inherited?.facet.fixed) {
        const local = locals.get(facet.name)!;
        if (local.integer !== inherited.integer || local.operand && inherited.operand && !values.sameValue(local.operand, inherited.operand, owner) || facet.name === "whiteSpace" && normalizeWhitespace(facet.lexical.value, "collapse") !== normalizeWhitespace(inherited.facet.lexical.value, "collapse")) c.fail(owner, "facet-fixed", "A fixed facet cannot change value", facet.lexical.context.source);
      }
    }
    for (const [name, constraint] of locals) {
      c.step(owner); result.facets.set(name, constraint);
      if (boundNames.includes(name)) {
        const sameSide = lower(name) ? "min" : "max";
        for (const priorName of boundNames) {
          const prior = base.facets.get(priorName); if (!prior?.operand) continue;
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
    const localLength = locals.get("length");
    if (sourceRules && localLength && (locals.has("minLength") || locals.has("maxLength"))) c.fail(owner, "length-minLength-maxLength", "One restriction step cannot introduce length alongside minLength/maxLength", localLength.facet.lexical.context.source);
    const length = result.facets.get("length")?.integer, minLength = result.facets.get("minLength")?.integer, maxLength = result.facets.get("maxLength")?.integer;
    if (minLength && maxLength && c.algebra.compare(minLength, maxLength) > 0 || length && minLength && c.algebra.compare(length, minLength) < 0 || length && maxLength && c.algebra.compare(length, maxLength) > 0) c.fail(owner, "length-minLength-maxLength", "Length facet constraints are inconsistent");
    if (sourceRules && (locals.has("minInclusive") && locals.has("minExclusive") || locals.has("maxInclusive") && locals.has("maxExclusive"))) c.fail(owner, "facet-bound-pair", "Inclusive and exclusive bounds cannot coexist on one side");
    const lowers = boundNames.filter(n => lower(n) && result.facets.has(n)), uppers = boundNames.filter(n => !lower(n) && result.facets.has(n));
    for (const a of lowers) for (const b of uppers) {
      c.step(owner); const order = values.compare(result.facets.get(a)!.operand!, result.facets.get(b)!.operand!, owner);
      if (order !== undefined && (order > 0 || order === 0 && exclusive(a) !== exclusive(b))) c.fail(owner, "facet-bound-order", "Lower and upper facet constraints are inconsistent");
    }
    if (sourceRules && base.plan.primitive === "NOTATION" && !facets.some(f => f.name === "enumeration") && !base.plan.layers.some(l => l.facets.some(f => f.name === "enumeration"))) c.fail(owner, "enumeration-required-notation", "A NOTATION-derived datatype requires an enumeration facet");
    const total = result.facets.get("totalDigits")?.integer, fraction = result.facets.get("fractionDigits")?.integer;
    if (total && fraction && c.algebra.compare(fraction, total) > 0) c.fail(owner, "fractionDigits-totalDigits", "fractionDigits cannot exceed totalDigits");
    c.step(owner, facets.length + compiled.length + requirements.size + base.plan.layers.length);
    result.plan = {...result.plan, layers: [...base.plan.layers, {owner: owner.id, facets, patterns: compiled}], enforcement: [...requirements]};
    return result;
  };
  /** Sufficient exact property correspondence; no regex-language inclusion is assumed. */
  const rawFacetCorrespondence = (base: Description, result: Description, reference: Reference, owner: GraphNode): boolean => {
    type Constraint = Description['facets'] extends Map<string, infer T> ? T : never;
    const effective = new Map<string, Constraint>(); let complete = true, reductionDeterminate = true;
    const equal = (a: Constraint, b: Constraint): boolean => a.integer !== undefined ? a.integer === b.integer
      : a.operand && b.operand ? values.sameValue(a.operand, b.operand, owner)
      : normalizeWhitespace(a.facet.lexical.value, "collapse") === normalizeWhitespace(b.facet.lexical.value, "collapse");
    for (const conjunct of result.conjuncts ?? []) for (const [name, constraint] of conjunct.facets) {
      c.step(owner, 8); const prior = effective.get(name);
      if (!prior) {effective.set(name, constraint); continue;}
      if (equal(prior, constraint)) {if (constraint.facet.fixed) effective.set(name, constraint); continue;}
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
      const order = values.compare(inclusive.operand!, exclusiveValue.operand!, owner);
      if (order === undefined) {complete = false; reductionDeterminate = false; continue;}
      const keepInclusive = side === "min" ? order > 0 : order < 0;
      effective.delete(side + (keepInclusive ? "Exclusive" : "Inclusive"));
    }
    c.step(owner, effective.size + 1);
    const facets = [...effective.values()].map(constraint => constraint.facet);
    // This checks exact bounds, length, precision, whitespace and fixed values
    // against the base; it does not inject hidden constraints into assessment.
    if (reductionDeterminate) layer(base, reference, owner, facets, false);
    result.facets = effective;
    for (const [name] of base.facets) {
      c.step(owner);
      const represented = effective.has(name) || name.startsWith("min") && boundNames.includes(name) && (effective.has("minInclusive") || effective.has("minExclusive"))
        || name.startsWith("max") && boundNames.includes(name) && (effective.has("maxInclusive") || effective.has("maxExclusive"))
        || (name === "minLength" || name === "maxLength") && effective.has("length");
      if (!represented) complete = false;
    }
    const groupEqual = (a: readonly Facet[], b: readonly Facet[], name: string): boolean => {
      c.step(owner, a.length + b.length + 1);
      const left = a.filter(facet => facet.name === name), right = b.filter(facet => facet.name === name);
      if (!left.length || !right.length) return false;
      const same = (x: Facet, y: Facet): boolean => {
        c.step(owner);
        if (name === "pattern") {c.text(x.lexical.value, owner); c.text(y.lexical.value, owner); return x.lexical.value === y.lexical.value;}
        const xValue = enumerations.get(x)!, yValue = enumerations.get(y)!;
        return values.sameValue(xValue, yValue, owner);
      };
      return left.every(x => right.some(y => same(x, y))) && right.every(y => left.some(x => same(x, y)));
    };
    for (const prior of base.plan.layers) for (const name of ["pattern", "enumeration"]) {
      c.step(owner, prior.facets.length + 1);
      if (prior.facets.some(facet => facet.name === name) && !result.plan.layers.some(group => groupEqual(prior.facets, group.facets, name))) complete = false;
    }
    for (const group of result.plan.layers) {
      c.step(owner, group.facets.length + 1);
      if (base.plan.layers.some(prior => groupEqual(prior.facets, group.facets, "enumeration"))) continue;
      for (const facet of group.facets) if (facet.name === "enumeration") {
        // New enumeration members must be values of the base. Failure here
        // leaves correspondence unresolved when other effective groups narrow.
        try {
          const expected = enumerations.get(facet)!, assessed = operand(base, facet.lexical, owner);
          c.text(expected.canonical, owner); c.text(assessed.canonical, owner);
          if (!values.sameValue(expected, assessed, owner)) {
            // These primitive canonical forms are themselves lexical witnesses;
            // structured/list/union alternatives retain the unresolved premise.
            if (!["string", "anyURI", "decimal", "boolean"].includes(expected.family)) complete = false;
            else {
              const canonical = operand(base, {...facet.lexical, value: expected.canonical}, owner);
              if (!values.sameValue(canonical, expected, owner)) complete = false;
            }
          }
        }
        catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== "invalid-schema") throw error; complete = false;}
      }
    }
    return complete;
  };
  const dependencies = (reference: Reference, owner: GraphNode): {reference: Reference; owner: GraphNode}[] => {
    if (reference.kind === "builtin") {builtin(reference, owner); return [];}
    const node = c.get(c.target(reference, owner)!); c.step(node);
    const rawSimple = c.context.rawSimpleTypeProperties(node.id), rawComplex = c.context.rawTypeProperties(node.id);
    if (rawSimple) {
      c.step(node, 8 + (rawSimple.variety.kind === "union" ? rawSimple.variety.members.length : 1));
      const refs = [rawSimple.base, ...(rawSimple.variety.kind === "list" ? [rawSimple.variety.item] : rawSimple.variety.kind === "union" ? rawSimple.variety.members : [])];
      c.step(node, refs.length * 4);
      for (const ref of refs) if (ref.kind !== "builtin" && c.get(c.target(ref, node)!).kind !== "simpleType") c.fail(node, "st-props-correct", "Abstract simple types require simple operands");
      for (const group of rawSimple.facetLayers) for (const facet of group.facets) {
        c.step(node, 2);
        if (facet.operand?.context === "active") refs.push(facet.operand.type);
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
      if (node.derivation?.contentKind !== "simple") return c.unresolved(owner, "simple-content-variety", "Complex scalar content requires a checked simple-content construction");
      const base = node.derivation.base.kind === "builtin" ? undefined : c.get(c.target(node.derivation.base, node)!);
      if (base?.kind === "complexType" && base.derivation?.contentKind !== "simple") {
        if (node.derivation.kind !== "restriction" || !base.mixed || !node.derivation.inlineType) return c.fail(node, "simple-content-base", "A mixed complex base requires an explicit inline simple restriction type");
        return [{reference: node.derivation.inlineType, owner: node}];
      }
      const refs = [node.derivation.base, ...(node.derivation.inlineType ? [node.derivation.inlineType] : [])];
      return refs.map(reference => ({reference, owner: node}));
    }
    return c.fail(owner, "src-simple-type", "Reference requires a scalar type");
  };
  const ensure = (reference: Reference, owner: GraphNode): Description => {
    const rootKey = referenceKey(reference, owner), active = new Set<string>();
    const stack = [{reference, owner, ready: false}];
    while (stack.length) {
      const frame = stack[stack.length - 1], key = referenceKey(frame.reference, frame.owner); c.step(frame.owner);
      if (descriptions.has(key)) {stack.pop(); continue;}
      if (!frame.ready) {
        if (active.has(key)) c.fail(frame.owner, "st-props-correct", "Scalar dependency cycle");
        active.add(key); frame.ready = true;
        const deps = dependencies(frame.reference, frame.owner); c.step(frame.owner, deps.length);
        for (let i = deps.length - 1; i >= 0; i--) {c.step(frame.owner); if (!descriptions.has(referenceKey(deps[i].reference, deps[i].owner))) stack.push({...deps[i], ready: false});}
        continue;
      }
      const node = c.get(key); c.setCurrent(node);
      const description = (ref: Reference) => descriptions.get(referenceKey(ref, node))!;
      let result: Description;
      const rawSimple = c.context.rawSimpleTypeProperties(node.id), rawComplex = c.context.rawTypeProperties(node.id);
      if (rawSimple) {
        if (node.identity.kind === "global" && rawSimple.targetNamespace !== undefined) {
          c.text(rawSimple.targetNamespace, node); c.text(node.identity.name.namespace, node);
          if (rawSimple.targetNamespace !== node.identity.name.namespace) c.fail(node, "raw-simple-target-namespace", "Named type namespace differs from its immutable identity");
        }
        const base = description(rawSimple.base), variety = rawSimple.variety;
        checkFinal(rawSimple.base, "restriction", node);
        const urBase = base.plan.builtin === "anySimpleType";
        if (variety.kind === "atomic") {
          if (base.plan.variety !== "atomic" || urBase) c.fail(node, "cos-st-restricts", "Atomic type requires an atomic base");
          result = {...base, definition: node.id, parent: base, conjuncts: undefined, facets: new Map(), plan: {...base.plan, id: node.id, reference: frame.reference, layers: [], whitespace: whitespaceFor(base.plan.builtin ?? base.plan.primitive!)}};
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
          result = {definition: node.id, parent: base, plan: {id: node.id, reference: frame.reference, variety: "list", item: variety.item, layers: [], whitespace: "collapse", enforcement: ["lexical-space", "whitespace", "list"], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, item, facets: new Map()};
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
        const intrinsic = result, conjuncts: Description[] = [];
        for (const group of rawSimple.facetLayers) {
          c.step(node, group.facets.length + 1);
          if (urBase && group.facets.some(facet => variety.kind === "union" || facet.name !== "whiteSpace")) c.fail(node, "cos-st-restricts", "List/union construction facets violate the simple ur-base rule");
          conjuncts.push(layer(intrinsic, frame.reference, node, group.facets, false));
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
        const inherited = [...(base.plan.obligations ?? []), ...(result.item?.plan.obligations ?? [])];
        if (node.identity.kind === "scoped" && rawSimple.targetNamespace === undefined && !c.context.sourceNode(node.id)) inherited.push({rule: "raw-simple-target-namespace", component: node.id});
        for (const member of result.members ?? []) {c.step(node, (member.plan.obligations?.length ?? 0) + 1); inherited.push(...(member.plan.obligations ?? []));}
        for (const group of rawSimple.facetLayers) for (const facet of group.facets) {
          const required = facetObligations.get(facet) ?? []; c.step(node, required.length + 1); inherited.push(...required);
        }
        if (!facetCorrespondence) inherited.push({rule: "raw-simple-facet-restriction-validity", component: node.id});
        result = {...result, parent: base, plan: {...result.plan, obligations: inherited}};
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
          result = {definition: node.id, plan: {id: node.id, reference: frame.reference, variety: "list", item: node.variety.item, layers: [], whitespace: "collapse", enforcement: ["lexical-space", "whitespace", "list"], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, item, facets: new Map()};
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
          result = layer(description(derivation.inlineType!), frame.reference, node, derivation.facets);
          result = {...result, plan: {...result.plan, obligations: [...(result.plan.obligations ?? []), {rule: "simple-content-base-mixed-emptiable", component: baseId}]}};
          descriptions.set(key, result); active.delete(key); stack.pop(); continue;
        }
        result = base;
        if (derivation.kind === "restriction") {
          if (derivation.inlineType) {
            result = description(derivation.inlineType);
            if (!contentDerivation(derivation.inlineType, derivation.base, node)) return c.fail(node, "simple-content-inline-derivation", "Inline simple type does not derive from the original scalar content type");
          }
          result = layer(result, frame.reference, node, derivation.facets);
        }
        result = {...result, plan: {...result.plan, id: node.id, reference: frame.reference}};
      } else return c.fail(node, "src-simple-type", "Expected scalar type");
      c.step(node, (result.plan.obligations?.length ?? 0) + (result.item?.plan.obligations?.length ?? 0) + 2);
      const obligations = [...(result.plan.obligations ?? []), ...(result.item?.plan.obligations ?? [])];
      for (const member of result.members ?? []) {c.step(node, (member.plan.obligations?.length ?? 0) + 1); obligations.push(...(member.plan.obligations ?? []));}
      result = {...result, plan: {...result.plan, obligations}};
      descriptions.set(key, result); active.delete(key); stack.pop();
    }
    return descriptions.get(rootKey)!;
  };
  const checkValue = (reference: Reference, constraint: ValueConstraint, owner: GraphNode) => {
    const description = ensure(reference, owner);
    if (description.plan.primitive === "NOTATION" && !description.plan.layers.some(l => l.facets.some(f => f.name === "enumeration"))) c.fail(owner, "enumeration-required-notation", "NOTATION cannot be used directly as a declared datatype");
    if (description.plan.builtin === "ID") c.fail(owner, owner.kind === "attribute" || owner.kind === "attributeUse" ? "a-props-correct" : "e-props-correct", "An ID-derived type/content cannot have a value constraint");
    operand(description, constraint.lexical, owner);
    return {...description.plan, enforcement: [...new Set([...description.plan.enforcement, "default-fixed" as const])]};
  };
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
  /** Concrete facet property comparison; datatype value equality remains owned here. */
  const facetPropertiesEquivalent = (a: Reference, b: Reference, owner: GraphNode): boolean => {
    const x = ensure(a, owner), y = ensure(b, owner);
    c.step(owner, x.facets.size + y.facets.size + 4);
    if (x.facets.size !== y.facets.size || x.plan.whitespace !== y.plan.whitespace) return false;
    for (const [name, left] of x.facets) {
      c.step(owner); const right = y.facets.get(name);
      if (left.integer !== undefined) c.text(left.integer, owner);
      if (right?.integer !== undefined) c.text(right.integer, owner);
      if (!right || left.facet.fixed !== right.facet.fixed || left.integer !== right.integer) return false;
      if (left.operand || right.operand) {
        if (!left.operand || !right.operand || !values.sameValue(left.operand, right.operand, owner)) return false;
      } else {
        c.text(left.facet.lexical.value, owner); c.text(right.facet.lexical.value, owner);
        if (normalizeWhitespace(left.facet.lexical.value, "collapse") !== normalizeWhitespace(right.facet.lexical.value, "collapse")) return false;
      }
    }
    for (const name of ["enumeration", "pattern"]) {
      c.step(owner, x.plan.layers.length + y.plan.layers.length + 2);
      const groups = (value: Description): Facet[][] => value.plan.layers.map(group => {
        c.step(owner, group.facets.length + 1); return group.facets.filter(facet => facet.name === name);
      }).filter(group => group.length !== 0);
      const left = groups(x), right = groups(y);
      const same = (p: Facet, q: Facet): boolean => {
        c.step(owner);
        if (name === "enumeration") return values.sameValue(enumerations.get(p)!, enumerations.get(q)!, owner);
        c.text(p.lexical.value, owner); c.text(q.lexical.value, owner); return p.lexical.value === q.lexical.value;
      };
      const sameGroup = (p: readonly Facet[], q: readonly Facet[]): boolean => {
        c.step(owner, p.length + q.length + 1);
        return p.every(facet => q.some(other => same(facet, other))) && q.every(facet => p.some(other => same(facet, other)));
      };
      if (!left.every(group => right.some(other => sameGroup(group, other))) || !right.every(group => left.some(other => sameGroup(group, other)))) {
        if (name === "pattern") return c.unresolved(owner, "pattern-property-equality", "Distinct pattern group representations require an exact regular-expression property correspondence");
        return false;
      }
    }
    return true;
  };
  return {ensure: (reference: Reference, owner: GraphNode) => ensure(reference, owner).plan, checkFinal, checkValue, equivalent,
    contentIdentity, contentDerivation, facetPropertiesEquivalent,
    assess: (reference: Reference, lexical: LexicalValue, owner: GraphNode) => operand(ensure(reference, owner), lexical, owner),
    compare: values.compare};
}
