/** Scalar schema legality and enforcement ownership. Payload enforcement is #184. */
import type {Facet, GraphNode, LexicalValue, NodeId, Reference, ValueConstraint} from "./canonicalGraph.js";
import type {AssessmentContext} from "./schemaAssessmentContext.js";
import {SchemaAssessmentError} from "./schemaAssessmentContext.js";
import {builtinParents, builtinPrimitive, integerBounds, normalizeWhitespace, schemaDatatypeValues, whitespaceFor} from "./schemaDatatypeValues.js";
import type {SchemaOperand} from "./schemaDatatypeValues.js";
import {schemaPatterns} from "./schemaPattern.js";
import type {SchemaPattern} from "./schemaPattern.js";
import {XSD_NAMESPACE} from "../loader/orderedSyntax.js";

export type ScalarEnforcement = "lexical-space" | "enumeration" | "pattern" | "whitespace" | "numeric-bounds" | "numeric-precision" | "length" | "QName-context" | "default-fixed" | "list" | "union";
export type ScalarConstraintLayer = Readonly<{owner: NodeId; facets: readonly Facet[]; patterns: readonly SchemaPattern[]}>;
export type ScalarSupportPlan = Readonly<{
  id: NodeId; reference: Reference; variety: "atomic" | "list" | "union"; primitive?: string;
  builtin?: string; item?: Reference; members?: readonly Reference[]; layers: readonly ScalarConstraintLayer[];
  whitespace: "preserve" | "replace" | "collapse";
  enforcement: readonly ScalarEnforcement[]; runtimeOwner: "#184"; consumers: readonly ["#188", "#189", "#198"];
}>;
type Description = {
  plan: ScalarSupportPlan; item?: Description; members?: Description[];
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

export function scalarSchemaAssessment(c: AssessmentContext, inheritedScalar: (node: Extract<GraphNode, {kind: "complexType"}>) => Reference | undefined = () => undefined) {
  const descriptions = new Map<string, Description>(), values = schemaDatatypeValues(c), patterns = schemaPatterns(c);
  const referenceKey = (reference: Reference, owner: GraphNode) => reference.kind === "builtin" ? `builtin:${reference.name.local}` : c.target(reference, owner)!;
  const checkFinal = (base: Reference, method: string, owner: GraphNode) => {
    if (base.kind === "builtin") return;
    const node = c.get(c.target(base, owner)!);
    const value = node.declaredAttributes.find(a => !a.name.namespace && a.name.local === "final")?.value
      ?? node.context.schemaAttributes.find(a => !a.name.namespace && a.name.local === "finalDefault")?.value ?? "";
    c.text(value, node);
    const tokens = normalizeWhitespace(value, "collapse").split(" ");
    if (tokens.includes("#all") || tokens.includes(method)) c.fail(owner, "cos-st-derived-ok", `Base type prohibits derivation by ${method}`, undefined, [node.context.source]);
  };
  const builtin = (reference: Extract<Reference, {kind: "builtin"}>, owner: GraphNode): Description => {
    const name = reference.name.local;
    if (reference.name.namespace !== XSD_NAMESPACE) c.fail(owner, "src-resolve", "Builtin type requires the XSD namespace");
    if (excluded.has(name)) c.unsupported(owner, `datatype:${name}`, "Document identity, DTD-dependent and NOTATION datatypes are excluded");
    if (name === "anyType") c.fail(owner, "src-simple-type", "A scalar declaration cannot use complex anyType");
    const key = `builtin:${name}`, existing = descriptions.get(key); if (existing) return existing;
    if (name === "NMTOKENS") {
      const item: Reference = {kind: "builtin", name: {namespace: XSD_NAMESPACE, local: "NMTOKEN"}};
      const itemDescription = builtin(item, owner);
      const result: Description = {definition: key, plan: {id: key, reference, variety: "list", builtin: name, item, layers: [], whitespace: "collapse", enforcement: ["lexical-space", "whitespace", "list", "length"], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, item: itemDescription, facets: new Map()};
      descriptions.set(key, result); return result;
    }
    const primitive = builtinPrimitive(name);
    const result: Description = {definition: key, plan: {id: key, reference, variety: "atomic", primitive, builtin: name, layers: [], whitespace: whitespaceFor(name), enforcement: ["lexical-space", "whitespace", ...(primitive === "QName" ? ["QName-context" as const] : []), ...(integerBounds[name] ? ["numeric-bounds" as const] : []), ...(builtinParents[name] && primitive === "decimal" ? ["numeric-precision" as const] : [])], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, facets: new Map()};
    descriptions.set(key, result); return result;
  };
  const operands = new WeakMap<Description, Map<LexicalValue, SchemaOperand>>();
  type OperandRequest = {description: Description; lexical: LexicalValue; owner: GraphNode};
  function* operandStep({description, lexical, owner}: OperandRequest): Generator<OperandRequest, SchemaOperand, SchemaOperand> {
    const cache = operands.get(description), cached = cache?.get(lexical); if (cached) return cached;
    c.text(lexical.value, owner); const normalized = normalizeWhitespace(lexical.value, description.plan.whitespace);
    let result: SchemaOperand;
    if (description.plan.variety === "atomic") result = values.atomic(description.plan.builtin ?? description.plan.primitive!, lexical, owner, description.plan.whitespace);
    else if (description.plan.variety === "list") {
      const keys: string[] = [], tokens = normalized ? normalized.split(" ") : [];
      c.step(owner, tokens.length);
      for (const token of tokens) {
        c.step(owner); const item = yield {description: description.item!, lexical: {...lexical, value: token}, owner};
        c.text(item.canonical, owner); keys.push(JSON.stringify([item.family, item.canonical]));
      }
      if (description.plan.builtin === "NMTOKENS" && !tokens.length) c.fail(owner, "cvc-minLength-valid", "NMTOKENS requires at least one item", lexical.context.source);
      c.step(owner, keys.length); result = {family: "list", canonical: JSON.stringify(keys), length: tokens.length.toString()};
    } else {
      let chosen: SchemaOperand | undefined;
      for (const member of description.members!) {
        c.step(owner);
        try {chosen = yield {description: member, lexical, owner}; break;}
        catch (error) {if (!(error instanceof SchemaAssessmentError) || error.category !== "invalid-schema") throw error;}
      }
      if (!chosen) c.fail(owner, "cvc-datatype-valid", "Schema union operand matches no declared member", lexical.context.source);
      result = chosen!; // Declaration-order choice is preserved in the plan.
    }
    for (const layer of description.plan.layers) {
      c.step(owner);
      if (layer.patterns.length) {
        let accepted = false;
        for (const pattern of layer.patterns) {if (patterns.acceptsOperand(pattern, normalized, owner)) {accepted = true; break;}}
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
      if (enumeration.length && !enumeration.some(e => e.family === result.family && e.canonical === result.canonical)) c.fail(owner, "cvc-enumeration-valid", "Schema operand is outside the inherited enumeration", lexical.context.source);
    }
    for (const [name, constraint] of description.facets) {
      c.step(owner);
      if (lengthNames.includes(name)) {
        if (description.plan.primitive === "QName") continue; // XSD 1.0 cvc-length-valid: any value is facet-valid.
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
    c.step(owner); const updated = cache ?? new Map(); updated.set(lexical, result); operands.set(description, updated); return result;
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
  const allowFacet = (description: Description, facet: Facet, owner: GraphNode) => {
    const variety = description.plan.variety, primitive = description.plan.primitive;
    let allowed = ["pattern", "enumeration"];
    if (variety === "list") allowed = [...allowed, "whiteSpace", ...lengthNames];
    else if (variety === "atomic") {
      allowed.push("whiteSpace");
      if (["string", "anyURI", "QName", "hexBinary", "base64Binary", "anySimpleType"].includes(primitive!)) allowed.push(...lengthNames);
      if (["decimal", "float", "double", "duration", "dateTime", "date", "time", "gYearMonth", "gYear", "gMonthDay", "gDay", "gMonth"].includes(primitive!)) allowed.push(...boundNames);
      if (primitive === "decimal") allowed.push("totalDigits", "fractionDigits");
    }
    if (!allowed.includes(facet.name)) c.fail(owner, "facet-applicability", "Facet is not permitted on this datatype variety", facet.lexical.context.source);
  };
  const layer = (base: Description, reference: Reference, owner: GraphNode, facets: readonly Facet[]): Description => {
    c.step(owner, base.plan.layers.length + base.facets.size + base.plan.enforcement.length);
    const result: Description = {definition: owner.kind === "complexType" ? `content:${owner.id}` : owner.id, parent: base, plan: {...base.plan, id: owner.id, reference}, item: base.item, members: base.members, facets: new Map(base.facets)};
    const seen = new Set<string>(), compiled: SchemaPattern[] = [], requirements = new Set(base.plan.enforcement);
    const locals = new Map<string, {facet: Facet; operand?: SchemaOperand; integer?: string}>();
    for (const facet of facets) {
      c.step(owner); c.text(facet.lexical.value, owner); allowFacet(base, facet, owner);
      if (seen.has(facet.name) && !["enumeration", "pattern"].includes(facet.name)) c.fail(owner, "src-single-facet-value", "Nonrepeatable facet is declared more than once", facet.lexical.context.source);
      seen.add(facet.name);
      if (facet.name === "pattern") {compiled.push(patterns.compile(facet.lexical, owner)); requirements.add("pattern"); continue;}
      if (facet.name === "enumeration") {enumerations.set(facet, operand(base, facet.lexical, owner)); requirements.add("enumeration"); continue;}
      if (facet.name === "whiteSpace") {
        const mode = normalizeWhitespace(facet.lexical.value, "collapse"), rank = {preserve: 0, replace: 1, collapse: 2};
        if (!(mode in rank) || rank[mode as keyof typeof rank] < rank[base.plan.whitespace]) c.fail(owner, "whiteSpace-valid-restriction", "Whitespace facet cannot weaken normalization", facet.lexical.context.source);
        result.plan = {...result.plan, whitespace: mode as keyof typeof rank}; requirements.add("whitespace"); locals.set(facet.name, {facet});
      } else if (integerFacets.has(facet.name)) {
        const raw = normalizeWhitespace(facet.lexical.value, "collapse");
        if (!/^[+]?[0-9]+$/.test(raw)) c.fail(owner, "facet-value", "Facet requires a nonnegative integer", facet.lexical.context.source);
        const integer = raw.replace(/^\+/, "").replace(/^0+(?=\d)/, "");
        if (facet.name === "totalDigits" && integer === "0") c.fail(owner, "totalDigits-valid-restriction", "totalDigits must be positive", facet.lexical.context.source);
        if (facet.name === "fractionDigits" && builtinPrimitive(base.plan.builtin ?? "") === "decimal" && base.plan.builtin !== "decimal" && integer !== "0") c.fail(owner, "fractionDigits-valid-restriction", "Integer fractionDigits is fixed at zero", facet.lexical.context.source);
        const prior = base.facets.get(facet.name)?.integer;
        if (prior !== undefined) {
          const order = c.algebra.compare(integer, prior);
          if (facet.name === "length" && order !== 0 || facet.name === "minLength" && order < 0 || !["length", "minLength"].includes(facet.name) && order > 0) c.fail(owner, `${facet.name}-valid-restriction`, "Facet weakens the inherited constraint", facet.lexical.context.source);
        }
        locals.set(facet.name, {facet, integer}); requirements.add(lengthNames.includes(facet.name) ? "length" : "numeric-precision");
      } else if (boundNames.includes(facet.name)) {
        // A bound is a value of the base's primitive space. The inherited
        // bound itself need not satisfy the base's exclusive endpoint.
        const primitive = {...base, facets: new Map<string, {facet: Facet}>(), plan: {...base.plan, layers: []}};
        const value = operand(primitive, facet.lexical, owner);
        locals.set(facet.name, {facet, operand: value}); requirements.add("numeric-bounds");
      }
      const inherited = base.facets.get(facet.name);
      if (inherited?.facet.fixed) {
        const local = locals.get(facet.name)!;
        if (local.integer !== inherited.integer || local.operand && inherited.operand && (local.operand.family !== inherited.operand.family || local.operand.canonical !== inherited.operand.canonical) || facet.name === "whiteSpace" && normalizeWhitespace(facet.lexical.value, "collapse") !== normalizeWhitespace(inherited.facet.lexical.value, "collapse")) c.fail(owner, "facet-fixed", "A fixed facet cannot change value", facet.lexical.context.source);
      }
    }
    for (const [name, constraint] of locals) {
      c.step(owner); result.facets.set(name, constraint);
      if (boundNames.includes(name)) {
        const opposite = lower(name) ? "min" : "max";
        for (const priorName of boundNames) {
          const prior = base.facets.get(priorName); if (!prior?.operand) continue;
          const order = values.compare(constraint.operand!, prior.operand, owner);
          if (order === undefined) c.fail(owner, "facet-bound-order", "Facet bounds are not ordered in the datatype value space", constraint.facet.lexical.context.source);
          if (priorName.startsWith(opposite)) {
            if (lower(name) ? order! < 0 || order === 0 && !exclusive(name) && exclusive(priorName) : order! > 0 || order === 0 && !exclusive(name) && exclusive(priorName)) c.fail(owner, `${name}-valid-restriction`, "Facet widens an inherited bound", constraint.facet.lexical.context.source);
          }
        }
      }
    }
    const localLength = locals.get("length");
    if (localLength && (locals.has("minLength") || locals.has("maxLength"))) c.fail(owner, "length-minLength-maxLength", "One restriction step cannot introduce length alongside minLength/maxLength", localLength.facet.lexical.context.source);
    const length = result.facets.get("length")?.integer, minLength = result.facets.get("minLength")?.integer, maxLength = result.facets.get("maxLength")?.integer;
    if (minLength && maxLength && c.algebra.compare(minLength, maxLength) > 0 || length && minLength && c.algebra.compare(length, minLength) < 0 || length && maxLength && c.algebra.compare(length, maxLength) > 0) c.fail(owner, "length-minLength-maxLength", "Length facet constraints are inconsistent");
    if (locals.has("minInclusive") && locals.has("minExclusive") || locals.has("maxInclusive") && locals.has("maxExclusive")) c.fail(owner, "facet-bound-pair", "Inclusive and exclusive bounds cannot coexist on one side");
    const lowers = boundNames.filter(n => lower(n) && result.facets.has(n)), uppers = boundNames.filter(n => !lower(n) && result.facets.has(n));
    for (const a of lowers) for (const b of uppers) {
      c.step(owner); const order = values.compare(result.facets.get(a)!.operand!, result.facets.get(b)!.operand!, owner);
      if (order === undefined || order > 0 || order === 0 && (exclusive(a) || exclusive(b))) c.fail(owner, "facet-bound-order", "Lower and upper facet constraints are inconsistent");
    }
    const total = result.facets.get("totalDigits")?.integer, fraction = result.facets.get("fractionDigits")?.integer;
    if (total && fraction && c.algebra.compare(fraction, total) > 0) c.fail(owner, "fractionDigits-totalDigits", "fractionDigits cannot exceed totalDigits");
    c.step(owner, facets.length + compiled.length + requirements.size + base.plan.layers.length);
    result.plan = {...result.plan, layers: [...base.plan.layers, {owner: owner.id, facets, patterns: compiled}], enforcement: [...requirements]};
    return result;
  };
  const dependencies = (reference: Reference, owner: GraphNode): {reference: Reference; owner: GraphNode}[] => {
    if (reference.kind === "builtin") {builtin(reference, owner); return [];}
    const node = c.get(c.target(reference, owner)!); c.step(node);
    if (node.kind === "simpleType") {
      const refs = node.variety.kind === "restriction" ? [node.variety.base] : node.variety.kind === "list" ? [node.variety.item] : node.variety.members;
      c.step(node, refs.length); return refs.map(reference => ({reference, owner: node}));
    }
    if (node.kind === "complexType") {
      const scalar = c.types.get(node.id)?.scalar;
      if (!scalar) {
        const alias = inheritedScalar(node);
        if (alias) return [{reference: alias, owner: node}];
      }
      if (!scalar) c.fail(owner, "src-simple-type", "Scalar use requires simple or simple-content type");
      const refs: Reference[] = [scalar!.base];
      if (node.derivation?.base.kind !== "builtin") {
        const baseId = node.derivation && c.target(node.derivation.base, node);
        if (baseId && c.types.get(baseId)?.scalar) refs.push(node.derivation!.base);
      }
      for (const l of scalar!.layers) {c.step(node); if (l.inlineType) refs.push(l.inlineType);}
      c.step(node, refs.length); return refs.map(reference => ({reference, owner: node}));
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
      if (node.kind === "simpleType") {
        if (node.variety.kind === "restriction") {
          checkFinal(node.variety.base, "restriction", node); result = layer(description(node.variety.base), frame.reference, node, node.variety.facets);
        } else if (node.variety.kind === "list") {
          checkFinal(node.variety.item, "list", node); const item = description(node.variety.item);
          const members = [item], visited = new Set<string>();
          while (members.length) {
            const member = members.pop()!; c.step(node);
            if (visited.has(member.definition)) continue; visited.add(member.definition);
            if (member.plan.variety === "list") c.fail(node, "cos-st-restricts", "List items must be atomic or a union of atomic types");
            if (member.members) for (const nested of member.members) {c.step(node); members.push(nested);}
          }
          result = {definition: node.id, plan: {id: node.id, reference: frame.reference, variety: "list", item: node.variety.item, layers: [], whitespace: "collapse", enforcement: ["lexical-space", "whitespace", "list"], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, item, facets: new Map()};
        } else {
          const members: Description[] = [], references: Reference[] = [];
          for (const ref of node.variety.members) {
            c.step(node); checkFinal(ref, "union", node); const member = description(ref);
            if (member.plan.variety === "union" && member.plan.layers.length === 0) {
              for (const nested of member.members!) {c.step(node); members.push(nested); references.push(nested.plan.reference);}
            } else {members.push(member); references.push(ref);}
          }
          result = {definition: node.id, plan: {id: node.id, reference: frame.reference, variety: "union", members: references, layers: [], whitespace: "collapse", enforcement: ["lexical-space", "union", "whitespace"], runtimeOwner: "#184", consumers: ["#188", "#189", "#198"]}, members, facets: new Map()};
        }
      } else if (node.kind === "complexType") {
        const scalar = c.types.get(node.id)!.scalar;
        if (!scalar) {
          const alias = inheritedScalar(node);
          if (!alias) c.fail(node, "src-simple-type", "Complex type has no scalar content");
          const inherited = description(alias!);
          result = {...inherited, plan: {...inherited.plan, id: node.id, reference: frame.reference}};
          descriptions.set(key, result); active.delete(key); stack.pop(); continue;
        }
        result = description(scalar.base);
        for (const l of scalar.layers) {
          c.step(node); const layerOwner = c.get(l.owner);
          if (layerOwner.kind !== "complexType") c.fail(layerOwner, "src-ct", "Scalar contribution requires a complex owner");
          if ((layerOwner as Extract<GraphNode, {kind: "complexType"}>).derivation?.kind === "extension") continue;
          if (l.inlineType) {
            const inline = description(l.inlineType), baseRef = (layerOwner as Extract<GraphNode, {kind: "complexType"}>).derivation?.base;
            const baseId = baseRef && c.target(baseRef, layerOwner), baseType = baseId ? c.types.get(baseId) : undefined;
            if (baseType?.scalar) {
              const original = descriptions.get(baseId!)!; let ancestor: Description | undefined = inline, valid = false;
              while (ancestor) {c.step(layerOwner); if (ancestor.definition === original.definition) {valid = true; break;} ancestor = ancestor.parent;}
              if (!valid) c.fail(layerOwner, "derivation-ok-restriction", "Inline simple type must explicitly derive from the base's original scalar content type");
            }
            result = inline;
          }
          result = layer(result, frame.reference, layerOwner, l.facets);
        }
        result = {...result, plan: {...result.plan, id: node.id, reference: frame.reference}};
      } else return c.fail(node, "src-simple-type", "Expected scalar type");
      descriptions.set(key, result); active.delete(key); stack.pop();
    }
    return descriptions.get(rootKey)!;
  };
  const derives = (derived: Reference, base: Reference, owner: GraphNode, restrictionOnly = false): boolean => {
    const targets = new Set<string>(), bases = [base], queue = [derived], seen = new Set<string>();
    while (bases.length) {
      const reference = bases.pop()!, key = referenceKey(reference, owner); c.step(owner);
      if (targets.has(key)) continue; targets.add(key);
      if (reference.kind !== "builtin" && c.get(key).kind === "simpleType") {
        const description = ensure(reference, owner);
        if (description.plan.variety === "union") for (const member of description.members!) {c.step(owner); bases.push(member.plan.reference);}
      }
    }
    while (queue.length) {
      const reference = queue.pop()!, key = referenceKey(reference, owner); c.step(owner);
      if (targets.has(key)) return true;
      if (seen.has(key)) continue; seen.add(key);
      if (reference.kind === "builtin") {
        const parent = builtinParents[reference.name.local] ?? (reference.name.local === "anyType" ? undefined : reference.name.local === "anySimpleType" ? "anyType" : "anySimpleType");
        if (parent) queue.push({kind: "builtin", name: {namespace: XSD_NAMESPACE, local: parent}});
      } else {
        const node = c.get(key);
        if (node.kind === "simpleType") {
          if (node.variety.kind === "restriction") queue.push(node.variety.base);
          else queue.push({kind: "builtin", name: {namespace: XSD_NAMESPACE, local: "anySimpleType"}});
        } else if (node.kind === "complexType") {
          if (node.derivation && (!restrictionOnly || node.derivation.kind === "restriction")) queue.push(node.derivation.base);
          else if (!node.derivation) queue.push({kind: "builtin", name: {namespace: XSD_NAMESPACE, local: "anyType"}});
        }
      }
    }
    return false;
  };
  const checkValue = (reference: Reference, constraint: ValueConstraint, owner: GraphNode) => {
    const description = ensure(reference, owner); operand(description, constraint.lexical, owner);
    return {...description.plan, enforcement: [...new Set([...description.plan.enforcement, "default-fixed" as const])]};
  };
  const equivalent = (referenceA: Reference, a: LexicalValue, referenceB: Reference, b: LexicalValue, owner: GraphNode) => {
    const x = operand(ensure(referenceA, owner), a, owner), y = operand(ensure(referenceB, owner), b, owner);
    return x.family === y.family && x.canonical === y.canonical;
  };
  return {ensure: (reference: Reference, owner: GraphNode) => ensure(reference, owner).plan, derives, checkFinal, checkValue, equivalent};
}
