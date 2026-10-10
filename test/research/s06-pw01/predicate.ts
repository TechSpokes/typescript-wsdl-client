/** Pure decision-specific PW01 experiment; adapters inject accepted #178 relations. */
export type Occurs = Readonly<{min: string; max: string}>;
export type Origin = Readonly<{id: string; context: {source: Readonly<{path: string}>}}>;
export type NamespaceConstraint = Readonly<{kind: "set" | "not"; namespaces: readonly string[]}>;
export type WildcardOperand = Readonly<{
  constraint: NamespaceConstraint;
  processContents: "skip" | "lax" | "strict";
  /** Original lexical/effective namespace context survives decoded constraints. */
  lexical: Readonly<{value: string; effectiveNamespace: string}>;
}>;
export type DecisionParticle = Readonly<{
  owner: Origin;
  kind: "sequence" | "choice" | "all" | "element" | "any";
  occurs: Occurs;
  /** Supplied by #178; this experiment never calculates an effective range. */
  total: Occurs;
  members: readonly DecisionParticle[];
  namespace?: string;
  wildcard?: WildcardOperand;
}>;
export type Interpretation = "literal2004" | "proposed2232";
export type Callbacks = Readonly<{
  arithmetic: (charge: (count?: number) => void) => {validate(range: Occurs): void; compare(a: string, b: string): number};
  namespaces: (derived: DecisionParticle, base: DecisionParticle, charge: (count?: number) => void) => boolean;
}>;
export type Failure = Readonly<{category: "invalid-schema" | "resource-limit"; message: string; component: string; source: Origin["context"]["source"]}>;
export type PredicateResult = Readonly<
  {kind: "answer"; validRestriction: boolean; steps: number} |
  {kind: "failure"; diagnostic: Failure; steps: number}
>;
class PredicateFailure extends Error {
  constructor(readonly diagnostic: Failure) {super(diagnostic.message);}
}

/** Requires validated, resolved, restriction-normalized operands and the actual graph node count. */
export function groupWildcardPredicate(root: DecisionParticle, base: DecisionParticle,
  interpretation: Interpretation, inputNodes: number, callbacks: Callbacks,
  limits: {maxNodes?: number; maxSteps?: number} = {}, baseIsUrTypeWildcard = false): PredicateResult {
  const maxNodes = limits.maxNodes ?? 100_000, maxSteps = limits.maxSteps ?? 1_000_000;
  if (![maxNodes, maxSteps, inputNodes].every(x => Number.isSafeInteger(x) && x > 0)) throw new Error("PW01 requires positive safe-integer limits and node count");
  let steps = 0, current = root.owner;
  const fail = (category: Failure["category"], message: string): never => {
    throw new PredicateFailure({category, message, component: current.id, source: current.context.source});
  };
  const charge = (count = 1) => {
    for (let i = 0; i < count; i++) {
      if (steps === maxSteps) fail("resource-limit", "PW01 predicate exhausted work");
      steps++;
    }
  };
  const algebra = callbacks.arithmetic(charge);
  const within = (actual: Occurs, min: string) => algebra.compare(actual.min, min) >= 0 && algebra.compare(actual.max, base.occurs.max) <= 0;
  try {
    if (inputNodes > maxNodes) fail("resource-limit", "PW01 predicate exceeds input node limit");
    if (base.kind !== "any" || !base.wildcard) fail("invalid-schema", "PW01 requires an original wildcard particle");
    algebra.validate(base.occurs);
    charge();
    const memo = new Map<DecisionParticle, Map<string, boolean>>();
    type Frame = {particle: DecisionParticle; min: string; index: number; entered: boolean; valid: boolean};
    charge();
    const stack: Frame[] = [{particle: root, min: base.occurs.min, index: 0, entered: false, valid: true}];
    const rank = {skip: 0, lax: 1, strict: 2};
    while (stack.length) {
      const frame = stack[stack.length - 1], p = frame.particle;
      current = p.owner; charge();
      if (!frame.entered) {
        frame.entered = true;
        algebra.validate(p.occurs); algebra.validate(p.total);
        frame.valid = within(p.kind === "element" || p.kind === "any" ? p.occurs : p.total, frame.min);
        if (p.kind === "any" && !p.wildcard) fail("invalid-schema", "Missing wildcard operand");
        if (p.kind === "element" || p.kind === "any") frame.valid &&= callbacks.namespaces(p, base, charge);
        if (p.kind === "any") {
          frame.valid &&= baseIsUrTypeWildcard || rank[p.wildcard!.processContents] >= rank[base.wildcard!.processContents];
        }
      }
      if (frame.valid && p.kind !== "element" && p.kind !== "any" && frame.index < p.members.length) {
        const child = p.members[frame.index], min = interpretation === "proposed2232" ? "0" : frame.min;
        charge();
        const known = memo.get(child)?.get(min);
        if (known !== undefined) {frame.valid &&= known; frame.index++;}
        else {charge(); stack.push({particle: child, min, index: 0, entered: false, valid: true});}
        continue;
      }
      charge();
      let values = memo.get(p);
      if (!values) {charge(); values = new Map(); memo.set(p, values);}
      charge(); values.set(frame.min, frame.valid); stack.pop();
      if (!stack.length) return {kind: "answer", validRestriction: frame.valid, steps};
    }
    throw new Error("Missing PW01 predicate result");
  } catch (error) {
    if (error instanceof PredicateFailure) return {kind: "failure", diagnostic: error.diagnostic, steps};
    // The injected accepted arithmetic reports malformed ranges as invalid-schema.
    if (error instanceof Error && "category" in error && error.category === "invalid-schema") {
      return {kind: "failure", diagnostic: {category: "invalid-schema", message: error.message, component: current.id, source: current.context.source}, steps};
    }
    throw error;
  }
}
