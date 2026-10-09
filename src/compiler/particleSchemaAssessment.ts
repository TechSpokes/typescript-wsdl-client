/** XSD 1.0 component constraints. Does not match or enumerate payloads. */
import type {ComplexTypeNode, ElementNode, GraphNode, Occurs, ParticleNode, Reference, Wildcard} from "./canonicalGraph.js";
import {namespaceIntersection, namespaceSubset, wildcardNamespaces} from "./composeCanonicalGraph.js";
import type {NamespaceConstraint} from "./composeCanonicalGraph.js";
import type {AssessmentContext} from "./schemaAssessmentContext.js";
import {normalizeWhitespace} from "./schemaDatatypeValues.js";
import {XSD_NAMESPACE} from "../loader/orderedSyntax.js";

const ONE: Occurs = {min: "1", max: "1"};
const ZERO: Occurs = {min: "0", max: "0"};
type GroupKind = "sequence" | "choice" | "all";
export type SchemaParticle = {
  uid: number; owner: GraphNode; kind: GroupKind | "element" | "any"; occurs: Occurs;
  children: SchemaParticle[]; element?: ElementNode; wildcard?: Wildcard;
  nullable: boolean; hasRealization: boolean; schemaEmptiable: boolean; range: Occurs;
};
export type EffectiveContent = Readonly<{particle?: SchemaParticle; mixed: boolean; scalar?: Reference; opaque: boolean}>;
const group = (p: SchemaParticle): boolean => ["sequence", "choice", "all"].includes(p.kind);
const rank = {skip: 0, lax: 1, strict: 2};
export const namespaceAllows = (constraint: NamespaceConstraint, ns: string): boolean => constraint.kind === "set" ? constraint.namespaces.includes(ns) : !constraint.namespaces.includes(ns);

export function particleSchemaAssessment(c: AssessmentContext, derives: (derived: Reference, base: Reference, owner: GraphNode, restrictionOnly?: boolean) => boolean,
  fixedEqual: (a: ElementNode, b: ElementNode) => boolean) {
  let next = 0;
  const roots = new Map<string, EffectiveContent>();
  const fresh = (owner: GraphNode, kind: SchemaParticle["kind"], occurs: Occurs): SchemaParticle => {
    c.step(owner); return {uid: next++, owner, kind, occurs, children: [], nullable: false, hasRealization: true, schemaEmptiable: occurs.min === "0", range: occurs};
  };
  const expand = (root: ParticleNode): SchemaParticle => {
    const instantiate = (node: ParticleNode) => {
      c.setCurrent(node); c.algebra.validate(node.occurs);
      let term = node;
      if (node.term.kind === "group") {
        const definition = c.get(c.target(node.term.reference, node)!);
        if (definition.kind !== "group") c.fail(node, "src-group", "Model-group use requires a group definition");
        term = c.get((definition as Extract<GraphNode, {kind: "group"}>).content) as ParticleNode;
        if (term.kind !== "particle" || !["sequence", "choice", "all"].includes(term.term.kind)) c.fail(node, "src-group", "A group definition requires a compositor");
        if (term.occurs.min !== "1" || term.occurs.max !== "1") c.fail(term, "src-group", "A named group compositor cannot declare occurrence bounds");
      }
      const result = fresh(node, term.term.kind as SchemaParticle["kind"], node.occurs), summary = c.particles.get(node.id)!;
      Object.assign(result, {nullable: summary.nullable, hasRealization: summary.hasRealization, schemaEmptiable: summary.schemaEmptiable, range: summary.effectiveTotalRange});
      if (term.term.kind === "element") {
        const declaration = c.get(c.target(term.term.declaration, term)!);
        if (declaration.kind !== "element") c.fail(term, "src-element", "Element particle requires an element declaration");
        result.element = declaration as ElementNode;
      } else if (term.term.kind === "any") result.wildcard = term.term.wildcard;
      const children = "children" in term.term ? term.term.children : [];
      return {result, children, index: 0};
    };
    const first = instantiate(root), stack = [first];
    while (stack.length) {
      const frame = stack[stack.length - 1]; c.step(frame.result.owner);
      if (frame.index === frame.children.length) {stack.pop(); continue;}
      const child = c.get(frame.children[frame.index++]);
      if (child.kind !== "particle") c.fail(child, "p-props-correct", "Compositor member must be a particle");
      // Still validate source-local bounds and references for disabled particles.
      const copied = instantiate(child as ParticleNode);
      if (copied.result.occurs.max !== "0") frame.result.children.push(copied.result);
      stack.push(copied);
    }
    return first.result;
  };
  const sequence = (owner: GraphNode, children: SchemaParticle[]) => {
    const result = fresh(owner, "sequence", ONE); result.children = children;
    result.nullable = true; result.hasRealization = true; result.range = ZERO;
    for (const child of children) {
      c.step(owner); result.nullable &&= child.nullable; result.hasRealization &&= child.hasRealization;
      result.range = {min: c.algebra.add(result.range.min, child.range.min), max: c.algebra.add(result.range.max, child.range.max)};
    }
    result.schemaEmptiable = result.range.min === "0"; return result;
  };
  const builtinContent = (owner: GraphNode): EffectiveContent => {
    // Primary ur-type-itself component, used only for schema legality. It
    // never widens #178's declared-only payload summary/assessment scope.
    const any = fresh(owner, "any", {min: "0", max: "unbounded"});
    any.wildcard = {namespace: {value: "##any", context: owner.context}, processContents: "lax"};
    any.nullable = true; any.schemaEmptiable = true;
    return {particle: sequence(owner, [any]), mixed: true, opaque: true};
  };
  const localContent = (node: ComplexTypeNode): SchemaParticle | undefined => {
    if (!node.content) return node.mixed ? sequence(node, []) : undefined;
    const original = c.get(node.content);
    if (original.kind !== "particle") return c.fail(original, "p-props-correct", "Content requires a particle");
    const mappedEmpty = original.occurs.max === "0" || "children" in original.term && original.term.children.length === 0
      && (original.term.kind !== "choice" || original.occurs.min === "0");
    if (mappedEmpty) return node.mixed ? sequence(node, []) : undefined;
    return expand(original);
  };
  const effective = (type: ComplexTypeNode): EffectiveContent => {
    const stack = [type];
    while (stack.length) {
      const node = stack.at(-1)!; c.step(node);
      if (roots.has(node.id)) {stack.pop(); continue;}
      const baseRef = node.derivation?.base, baseId = baseRef && c.target(baseRef, node), baseNode = baseId ? c.get(baseId) : undefined;
      if (baseNode?.kind === "complexType" && !roots.has(baseNode.id)) {stack.push(baseNode); continue;}
      let result: EffectiveContent;
      if (c.types.get(node.id)?.scalar) result = {mixed: false, scalar: {kind: "local", target: node.id}, opaque: false};
      else {
        const local = localContent(node);
        const base = baseNode?.kind === "complexType" ? roots.get(baseNode.id) : baseRef?.kind === "builtin" && baseRef.name.namespace === XSD_NAMESPACE && baseRef.name.local === "anyType" ? builtinContent(node) : undefined;
        if (node.derivation?.kind === "extension" && base) {
          if (!local) result = base;
          else if (!base.particle && !base.scalar) result = {particle: local, mixed: node.mixed, opaque: false};
          else {
            if (base.scalar) c.fail(node, "cos-ct-extends", "Particle extension cannot replace scalar content");
            result = {particle: sequence(node, [base.particle!, local]), mixed: node.mixed, opaque: base.opaque};
          }
        } else result = {particle: local, mixed: node.mixed, opaque: false};
      }
      roots.set(node.id, result); stack.pop();
    }
    return roots.get(type.id)!;
  };
  const typeRoot = (type: ComplexTypeNode): SchemaParticle => effective(type).particle ?? sequence(type, []);
  const checkAll = (root: SchemaParticle) => {
    const stack = [root];
    while (stack.length) {
      const p = stack.pop()!; c.step(p.owner);
      if (p.kind === "all") {
        if (p !== root || p.occurs.max !== "1" || !["0", "1"].includes(p.occurs.min)) c.fail(p.owner, "cos-all-limited", "An all group must be the type's sole root with maximum 1");
        for (const child of p.children) {
          c.step(child.owner);
          if (child.kind !== "element" || !["0", "1"].includes(child.occurs.min) || !["0", "1"].includes(child.occurs.max)) c.fail(child.owner, "cos-all-limited", "All members must be element particles with 0/1 bounds");
        }
      }
      for (const child of p.children) {c.step(p.owner); stack.push(child);}
    }
  };
  const overlaps = (a: SchemaParticle, b: SchemaParticle) => {
    c.step(a.owner);
    if (a.element && b.element) return a.element.name.namespace === b.element.name.namespace && a.element.name.local === b.element.name.local;
    if (a.wildcard && b.wildcard) {
      c.text(a.wildcard.namespace.value, a.owner); c.text(b.wildcard.namespace.value, b.owner);
      const intersection = namespaceIntersection(wildcardNamespaces(a.wildcard), wildcardNamespaces(b.wildcard));
      return intersection.kind === "not" || intersection.namespaces.length > 0;
    }
    const element = a.element ?? b.element!, wildcard = a.wildcard ?? b.wildcard!;
    c.text(wildcard.namespace.value, a.owner);
    return namespaceAllows(wildcardNamespaces(wildcard), element.name.namespace);
  };
  const fixed = (p: SchemaParticle) => p.occurs.min === p.occurs.max;
  const univocal = (p: SchemaParticle) => {
    c.step(p.owner);
    if (!fixed(p)) return false;
    for (const child of p.children) {c.step(child.owner); if (child.nullable) return false;}
    return true;
  };
  const nonempty = (items: readonly SchemaParticle[]) => {
    for (const item of items) {c.step(item.owner); if (!item.nullable) return true;} return false;
  };
  // Structural attribution uses exact counters without expanding repetitions.
  // Path separation follows the published XMLSchema MIT model-check algorithm
  // (Davide Brunato, validators/models.py); use identities here remain distinct,
  // every pair is checked, and primary-rule language nullability is retained.
  const separated = (a: SchemaParticle[], b: SchemaParticle[]) => {
    let depth = 0;
    while (depth + 1 < a.length && depth + 1 < b.length && a[depth + 1] === b[depth + 1]) {c.step(a[depth].owner); depth++;}
    const common = a[depth];
    let beforeA = false, afterA = false, beforeB = false, afterB = false, fixedA = true, fixedB = true;
    if (common.kind === "sequence") {
      c.step(common.owner, common.children.length * 2);
      const i = common.children.indexOf(a[depth + 1]), j = common.children.indexOf(b[depth + 1]);
      beforeA = nonempty(common.children.slice(0, i));
      afterA = beforeB = nonempty(common.children.slice(i + 1, j));
      afterB = nonempty(common.children.slice(j + 1));
    }
    const descend = (path: SchemaParticle[]) => {
      let before = false, after = false, exact = true;
      for (let k = depth + 1; k < path.length - 1; k++) {
        const p = path[k]; c.step(p.owner); exact &&= univocal(p);
        c.step(p.owner, p.children.length * 2); const i = p.children.indexOf(path[k + 1]);
        if (p.kind === "sequence") {before ||= nonempty(p.children.slice(0, i)); after ||= nonempty(p.children.slice(i + 1));}
        else for (const child of p.children) {c.step(p.owner); if (child !== path[k + 1] && child.nullable) exact = false;}
      }
      return {before, after, exact};
    };
    const x = descend(a), y = descend(b);
    beforeA ||= x.before; afterA ||= x.after; beforeB ||= y.before; afterB ||= y.after; fixedA &&= x.exact; fixedB &&= y.exact;
    if (common.kind !== "sequence") {
      if (beforeA && beforeB) return true;
      if (beforeA) return fixedA && univocal(a.at(-1)!) || afterA || common.occurs.max === "1";
      if (beforeB) return fixedB && univocal(b.at(-1)!) || afterB || common.occurs.max === "1";
      return false;
    }
    const forward = beforeB || (beforeA || fixedA) && (univocal(a.at(-1)!) || afterA);
    return common.occurs.max === "1" ? forward : forward && (beforeA || (beforeB || fixedB) && (univocal(b.at(-1)!) || afterB));
  };
  const attribution = (root: SchemaParticle) => {
    const declarations: SchemaParticle[] = [], declared = [root];
    while (declared.length) {
      const p = declared.pop()!; c.step(p.owner);
      if (p.occurs.max === "0") continue;
      if (p.element) declarations.push(p);
      for (const child of p.children) {c.step(p.owner); declared.push(child);}
    }
    for (let i = 0; i < declarations.length; i++) for (let j = i + 1; j < declarations.length; j++) {
      const a = declarations[i], b = declarations[j]; c.step(a.owner);
      if (a.element!.name.namespace === b.element!.name.namespace && a.element!.name.local === b.element!.name.local && !sameType(a.element!.type, b.element!.type, a.owner)) c.fail(b.owner, "cos-element-consistent", "Same-name particles require the same named type definition", undefined, [a.owner.context.source]);
    }
    const leaves: {particle: SchemaParticle; path: SchemaParticle[]}[] = [];
    const stack = [{particle: root, path: [] as SchemaParticle[]}];
    while (stack.length) {
      const {particle: p, path} = stack.pop()!; c.step(p.owner);
      if (p.occurs.max === "0" || !p.hasRealization) continue;
      c.step(p.owner, path.length + 1); const here = [...path, p];
      if (group(p)) {
        for (let i = p.children.length - 1; i >= 0; i--) {c.step(p.owner); stack.push({particle: p.children[i], path: here});}
      } else leaves.push({particle: p, path: here});
    }
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], b = leaves[j]; c.step(a.particle.owner);
      if (!overlaps(a.particle, b.particle)) continue;
      if (!separated(a.path, b.path)) c.fail(b.particle.owner, "cos-nonambig", "Overlapping particles cannot be attributed without looking ahead", undefined, [a.particle.owner.context.source]);
    }
  };
  const sameType = (a: Reference, b: Reference, owner: GraphNode) => {
    if (a.kind === "builtin" || b.kind === "builtin") return a.kind === "builtin" && b.kind === "builtin" && a.name.local === b.name.local && a.name.namespace === b.name.namespace;
    const x = c.get(c.target(a, owner)!), y = c.get(c.target(b, owner)!);
    return x.id === y.id && x.identity.kind === "global";
  };
  const rangeOK = (r: Occurs, b: Occurs) => c.algebra.compare(r.min, b.min) >= 0 && c.algebra.compare(r.max, b.max) <= 0;
  const blocks = (element: ElementNode) => {
    const value = element.declaredAttributes.find(a => !a.name.namespace && a.name.local === "block")?.value
      ?? element.context.schemaAttributes.find(a => !a.name.namespace && a.name.local === "blockDefault")?.value ?? "";
    c.text(value, element); const tokens = normalizeWhitespace(value, "collapse").split(" ");
    return tokens.includes("#all") ? ["extension", "restriction", "substitution"] : tokens;
  };
  // Pointless compositor normalization belongs only to restriction checking.
  const normalized = new Map<number, SchemaParticle>();
  const normalize = (root: SchemaParticle) => {
    const stack = [{p: root, done: false}];
    while (stack.length) {
      const f = stack.pop()!; c.step(f.p.owner);
      if (normalized.has(f.p.uid)) continue;
      if (!f.done) {stack.push({...f, done: true}); for (const child of f.p.children) {c.step(f.p.owner); stack.push({p: child, done: false});} continue;}
      const children: SchemaParticle[] = [];
      for (const raw of f.p.children) {
        c.step(f.p.owner); const child = normalized.get(raw.uid)!;
        const pointlessEmpty = group(child) && child.children.length === 0 && (child.kind !== "choice" || child.occurs.min === "0");
        if (pointlessEmpty) continue;
        if (child.kind === f.p.kind && fixed(child) && child.occurs.min === "1" && child.kind !== "all") {
          for (const member of child.children) {c.step(child.owner); children.push(member);}
        } else children.push(child);
      }
      const value = {...f.p, children};
      if (group(value) && children.length === 1 && (value.kind === "all" || fixed(value) && value.occurs.min === "1")) normalized.set(f.p.uid, children[0]);
      else normalized.set(f.p.uid, value);
    }
    return normalized.get(root.uid)!;
  };
  type Pair = readonly [SchemaParticle, SchemaParticle, boolean?];
  const memo = new Map<string, boolean>();
  const pairKey = ([r, b, ignore]: Pair) => `${r.uid}/${b.uid}/${ignore ? 1 : 0}`;
  function* restriction([r, b, ignore]: Pair): Generator<Pair, boolean, boolean> {
    c.setCurrent(r.owner); c.step(r.owner);
    if (r === b) return true;
    const cardinality = ignore || rangeOK(r.occurs, b.occurs);
    if (r.kind === "element" && b.kind === "element") {
      const x = r.element!, y = b.element!;
      if (!cardinality || x.name.namespace !== y.name.namespace || x.name.local !== y.name.local) return false;
      if (x.identity.kind === "global" && y.identity.kind === "global") return true;
      const requiredBlocks = blocks(y), actualBlocks = blocks(x); c.step(r.owner, requiredBlocks.length * actualBlocks.length);
      return (!x.nillable || y.nillable) && fixedEqual(x, y) && requiredBlocks.every(method => !method || actualBlocks.includes(method)) && derives(x.type, y.type, r.owner, true);
    }
    if (b.kind === "any") {
      c.text(b.wildcard!.namespace.value, b.owner);
      const namespace = wildcardNamespaces(b.wildcard!);
      if (r.kind === "element") return cardinality && namespaceAllows(namespace, r.element!.name.namespace);
      if (r.kind === "any") {
        c.text(r.wildcard!.namespace.value, r.owner);
        return cardinality && namespaceSubset(wildcardNamespaces(r.wildcard!), namespace) && rank[r.wildcard!.processContents] >= rank[b.wildcard!.processContents];
      }
      if (!rangeOK(r.range, b.occurs)) return false;
      for (const child of r.children) {if (!(yield [child, b, true])) return false;}
      return true;
    }
    if (!group(b) || r.kind === "any") return false;
    let members = r.children, kind = r.kind, occurs = r.occurs;
    if (r.kind === "element") {members = [r]; kind = b.kind; occurs = ONE;}
    if (kind === "all" && b.kind !== "all" || kind === "choice" && b.kind !== "choice") return false;
    if (kind === "sequence" && b.kind === "choice") {
      const length = members.length.toString(), range = {min: c.algebra.multiply(occurs.min, length), max: c.algebra.multiply(occurs.max, length)};
      if (!ignore && !rangeOK(range, b.occurs)) return false;
      for (const child of members) {
        let found = false;
        for (const target of b.children) {if (yield [child, target]) {found = true; break;}}
        if (!found) return false;
      }
      return true;
    }
    if (!ignore && !rangeOK(occurs, b.occurs)) return false;
    if (kind === "sequence" && b.kind === "all") {
      const used = new Set<number>();
      for (const child of members) {
        let found = false;
        for (let i = 0; i < b.children.length; i++) {
          c.step(child.owner);
          if (!used.has(i) && (yield [child, b.children[i]])) {used.add(i); found = true; break;}
        }
        if (!found) return false;
      }
      for (let i = 0; i < b.children.length; i++) {c.step(b.owner); if (!used.has(i) && !b.children[i].schemaEmptiable) return false;}
      return true;
    }
    // Ordered complete functional mappings use bounded dynamic programming.
    // A greedy match would reject valid later alignments.
    let states = new Set([0]);
    for (const child of members) {
      const nextStates = new Set<number>();
      for (const start of states) for (let i = start; i < b.children.length; i++) {
        c.step(child.owner);
        if (yield [child, b.children[i]]) nextStates.add(i + 1);
        if (b.kind !== "choice" && !b.children[i].schemaEmptiable) break;
      }
      states = nextStates; if (!states.size) return false;
    }
    if (b.kind === "choice") return states.size > 0;
    for (const start of states) {
      let complete = true;
      for (let i = start; i < b.children.length; i++) {c.step(b.owner); if (!b.children[i].schemaEmptiable) {complete = false; break;}}
      if (complete) return true;
    }
    return false;
  }
  const restricts = (derived: SchemaParticle, base: SchemaParticle) => {
    const root: Pair = [normalize(derived), normalize(base)];
    const stack = [{pair: root, iterator: restriction(root), reply: false}];
    while (stack.length) {
      const frame = stack[stack.length - 1]; c.step(frame.pair[0].owner);
      const result = frame.iterator.next(frame.reply);
      if (result.done) {
        memo.set(pairKey(frame.pair), result.value); stack.pop();
        if (!stack.length) return result.value;
        stack[stack.length - 1].reply = result.value;
      } else {
        const cached = memo.get(pairKey(result.value));
        if (cached !== undefined) frame.reply = cached;
        else {c.step(result.value[0].owner); stack.push({pair: result.value, iterator: restriction(result.value), reply: false});}
      }
    }
    return false;
  };
  const check = (node: ComplexTypeNode) => {
    const root = typeRoot(node); checkAll(root); attribution(root);
    const derivation = node.derivation;
    if (!derivation || derivation.contentKind !== "complex") return;
    if (derivation.base.kind === "builtin" && derivation.base.name.local === "anyType") {
      if (derivation.kind === "extension" && effective(node).mixed !== true) c.fail(node, "cos-ct-extends", "Extension of anyType must retain mixed content");
      return;
    }
    const base = c.get(c.target(derivation.base, node)!);
    if (base.kind !== "complexType") c.fail(node, "src-ct", "Complex-content derivation requires a complex base");
    const baseRoot = typeRoot(base as ComplexTypeNode), composed = c.types.get(node.id)!, baseComposed = c.types.get(base.id)!;
    const currentContent = effective(node), baseContent = effective(base as ComplexTypeNode);
    if (baseContent.scalar && !(derivation.kind === "extension" && currentContent.scalar)) c.fail(node, "derivation-ok-restriction/cos-ct-extends", "Complex particle content cannot replace a scalar-content base");
    if (derivation.kind === "extension") {
      if (baseContent.particle && currentContent.mixed !== baseContent.mixed) c.fail(node, "cos-ct-extends", "Extension cannot change mixed versus element-only content");
      // S05 retained exact ordered base contributions; verify this owning gate.
      for (let i = 0; i < baseComposed.content.length; i++) {
        c.step(node); const a = baseComposed.content[i], b = composed.content[i];
        if (!b || a.kind !== b.kind || a.kind === "particle" && b.kind === "particle" && a.particle !== b.particle) c.fail(node, "cos-particle-extend", "Extension must retain the complete base particle first");
      }
    } else {
      if (currentContent.mixed && !baseContent.mixed) c.fail(node, "derivation-ok-restriction", "Restriction cannot introduce mixed text");
      if (!composed.content.length || root.children.length === 0 && root.kind !== "choice") {
        if (!baseRoot.schemaEmptiable) c.fail(node, "derivation-ok-restriction", "Empty restriction requires a formally emptiable base");
      } else if (!restricts(root, baseRoot)) c.fail(node, "cos-particle-restrict", "Particle restriction has no valid XSD 1.0 component mapping", undefined, [base.context.source]);
    }
  };
  return {check, typeRoot, effective, restricts, sameType};
}
