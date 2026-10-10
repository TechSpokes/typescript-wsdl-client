import path from "node:path";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {analyzeOccurrences, occurrenceAlgebra} from "../../../src/compiler/occurrenceAnalysis.js";
import {prepareResolvedCompilationInput} from "../../../src/compiler/semanticCatalog.js";
import {referenceTarget} from "../../../src/compiler/resolveCanonicalGraph.js";
import type {ParticleNode} from "../../../src/compiler/canonicalGraph.js";
import {namespaceSubset, wildcardNamespaces} from "../../../src/compiler/composeCanonicalGraph.js";
import type {DecisionParticle, Callbacks} from "./predicate.js";
import {groupWildcardPredicate} from "./predicate.js";

const fixtureRoot = path.resolve("test/conformance/fixtures/xsd/s06-pw01");
type Case = {id: string; file: string; literal2004: boolean; proposed2232: boolean; effectiveTotalRange: {min: string; max: string}};
const cases = (JSON.parse(readFileSync(path.join(fixtureRoot, "expectations.json"), "utf8")) as {cases: Case[]}).cases;


const callbacks: Callbacks = {
  arithmetic: charge => occurrenceAlgebra(charge),
  namespaces: (derived, base, charge) => {
    const b = base.wildcard!.constraint;
    let baseChars = 0;
    for (const value of b.namespaces) {charge(value.length + 1); baseChars += value.length;}
    if (derived.kind === "element") {
      const value = derived.namespace ?? "";
      charge((value.length + baseChars + 1) * (b.namespaces.length + 1));
      return b.kind === "set" ? b.namespaces.includes(value) : !b.namespaces.includes(value);
    }
    const r = derived.wildcard!.constraint;
    let derivedChars = 0;
    for (const value of r.namespaces) {charge(value.length + 1); derivedChars += value.length;}
    // Shared helper may copy sets and compare strings; charge conservatively
    // before allocating its sets or evaluating membership comparisons.
    charge((baseChars + derivedChars + 1) * (b.namespaces.length + 1) * (r.namespaces.length + 1));
    return namespaceSubset(r, b);
  },
};

// Fixture adapter only. It exposes original #178 summaries and a restriction
// view for these fixed cases; it neither calculates ranges nor assesses schemas.
async function operands(file: string) {
  const prepared = await prepareResolvedCompilationInput({kind: "source", source: path.join(fixtureRoot, file)}, {loading: {policy: {fileRoots: [fixtureRoot]}}});
  if (prepared.kind !== "semantic") throw new Error("semantic input");
  const original = JSON.stringify(prepared), graph = prepared.catalog.graph;
  const analyzed = analyzeOccurrences(prepared.composed);
  if (analyzed.kind !== "analyzed") throw analyzed.diagnostic;
  const summaries = new Map(analyzed.analysis.particles.map(p => [p.id, p]));
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  const built = new Map<string, DecisionParticle>();
  const view = (p: ParticleNode): DecisionParticle => {
    const known = built.get(p.id); if (known) return known;
    let term = p.term;
    if (term.kind === "group") {
      const target = nodes.get(referenceTarget(term.reference, nodes, p)!);
      if (target?.kind !== "group") throw new Error("group target");
      const content = nodes.get(target.content); if (content?.kind !== "particle") throw new Error("group content");
      term = content.term;
    }
    if (term.kind === "group") throw new Error("non-compositor group");
    const members = "children" in term ? term.children.flatMap(id => {
      const child = nodes.get(id); if (child?.kind !== "particle") throw new Error("member");
      // Component mapping removes max=0 particles; originals remain in graph.
      return child.occurs.max === "0" ? [] : [view(child)];
    }) : [];
    let namespace: string | undefined;
    if (term.kind === "element") {
      const element = nodes.get(referenceTarget(term.declaration, nodes, p)!);
      if (element?.kind !== "element") throw new Error("element"); namespace = element.name.namespace;
    }
    const result: DecisionParticle = {owner: p, kind: term.kind, occurs: p.occurs, total: summaries.get(p.id)!.effectiveTotalRange,
      members, namespace, wildcard: term.kind === "any" ? {constraint: wildcardNamespaces(term.wildcard), processContents: term.wildcard.processContents, lexical: {value: term.wildcard.namespace.value, effectiveNamespace: term.wildcard.namespace.context.effectiveNamespace}} : undefined};
    built.set(p.id, result); return result;
  };
  const types = graph.nodes.filter(n => n.kind === "complexType" && n.identity.kind === "global");
  const derived = types.find(n => n.kind === "complexType" && n.identity.kind === "global" && n.identity.name.local === "D");
  const base = types.find(n => n.kind === "complexType" && n.identity.kind === "global" && n.identity.name.local === "B");
  if (derived?.kind !== "complexType" || base?.kind !== "complexType" || !derived.content || !base.content) throw new Error("roots");
  const derivedRoot = nodes.get(derived.content), baseRoot = nodes.get(base.content);
  if (derivedRoot?.kind !== "particle" || baseRoot?.kind !== "particle") throw new Error("particle roots");
  const restriction = view(derivedRoot);
  const baseChildren = "children" in baseRoot.term ? baseRoot.term.children : [];
  const originalWildcard = nodes.get(baseChildren[0]);
  if (originalWildcard?.kind !== "particle") throw new Error("wildcard root");
  const wildcard = view(originalWildcard);
  const normalize = (p: DecisionParticle): DecisionParticle => {
    if (p.kind === "element" || p.kind === "any") return p;
    const members = p.members.flatMap(raw => {
      const child = normalize(raw);
      if (!child.members.length && (child.kind === "sequence" || child.kind === "all" || child.kind === "choice" && child.occurs.min === "0")) return [];
      if (child.kind === p.kind && child.kind !== "all" && child.occurs.min === "1" && child.occurs.max === "1") return child.members;
      return [child];
    });
    if (members.length === 1 && (p.kind === "all" || p.occurs.min === "1" && p.occurs.max === "1")) return members[0];
    return {...p, members};
  };
  return {root: normalize(restriction), base: wildcard, originalRange: restriction.total, inputNodes: graph.nodes.length,
    absentContent: derivedRoot.occurs.max === "0" && wildcard.occurs.max === "0", assertUnchanged: () => expect(JSON.stringify(prepared)).toBe(original)};
}

describe("PW01 independent restriction candidates", () => {
  for (const row of cases) it(row.id, async () => {
    const input = await operands(row.file);
    expect(input.originalRange).toEqual(row.effectiveTotalRange);
    for (const interpretation of ["literal2004", "proposed2232"] as const) {
      // This source contrast maps both contents to empty before particle checking.
      if (input.absentContent) {expect(row[interpretation]).toBe(true); continue;}
      const result = groupWildcardPredicate(input.root, input.base, interpretation, input.inputNodes, callbacks);
      expect(result).toMatchObject({kind: "answer", validRestriction: row[interpretation]});
    }
    input.assertUnchanged();
  });

  it("measures exact node/work boundaries, huge digits and preserves source context", async () => {
    const input = await operands("huge-exact-repetition.xsd");
    const first = groupWildcardPredicate(input.root, input.base, "proposed2232", input.inputNodes, callbacks);
    if (first.kind !== "answer") throw first.diagnostic;
    expect(first.validRestriction).toBe(true);
    const observations: {case: string; limits: {maxNodes?: number; maxSteps?: number}; inputNodes?: number; result: string; steps: number; elapsedMs: number}[] = [];
    for (const limits of [{maxNodes: input.inputNodes, maxSteps: first.steps}, {maxNodes: input.inputNodes - 1}, {maxSteps: first.steps - 1}]) {
      const start = performance.now(), result = groupWildcardPredicate(input.root, input.base, "proposed2232", input.inputNodes, callbacks, limits);
      observations.push({case: "huge-exact-repetition", limits, result: result.kind === "answer" ? "answer" : result.diagnostic.category,
        steps: result.steps, elapsedMs: performance.now() - start});
      if (result.kind === "failure") {expect(result.diagnostic.source.path).toBeTruthy(); expect("validRestriction" in result).toBe(false);}
    }
    expect(observations.map(r => r.result)).toEqual(["answer", "resource-limit", "resource-limit"]);
    for (const count of [100_000, 100_001]) {
      // Actual synthetic source-node array, independently constructed outside
      // the predicate. The owning input stage supplies its immutable count.
      const sourceNodes = Array.from({length: count}, (_, i) => ({...input.root.owner, id: `pw-node-${i}`}));
      const start = performance.now(), result = groupWildcardPredicate(input.root, input.base, "proposed2232", sourceNodes.length, callbacks);
      observations.push({case: "default-input-node-boundary", limits: {}, inputNodes: sourceNodes.length, result: result.kind === "answer" ? "answer" : result.diagnostic.category,
        steps: result.steps, elapsedMs: performance.now() - start});
      expect(result.kind).toBe(count === 100_000 ? "answer" : "failure");
      if (count > 100_000) expect(result.steps).toBe(0);
    }
    // Independent supplied total. Long exact comparisons consume work without
    // converting the operand to Number, BigInt, or expanding repetitions.
    let padded = false;
    const atDefault: Callbacks = {...callbacks, namespaces: (r, b, charge) => {
      if (!padded) {padded = true; charge(1_000_000 - first.steps);}
      return callbacks.namespaces(r, b, charge);
    }};
    const passStart = performance.now(), defaultPass = groupWildcardPredicate(input.root, input.base, "proposed2232", input.inputNodes, atDefault);
    expect(defaultPass).toMatchObject({kind: "answer", validRestriction: true, steps: 1_000_000});
    observations.push({case: "synthetic-charged-work-at-default", limits: {maxSteps: 1_000_000}, result: defaultPass.kind === "answer" ? "answer" : defaultPass.diagnostic.category,
      steps: defaultPass.steps, elapsedMs: performance.now() - passStart});
    const long = "9".repeat(500_000);
    const hugeRoot = {...input.root, total: {min: "1", max: long}};
    const hugeBase = {...input.base, occurs: {min: "0", max: "unbounded"}};
    const exhaustedStart = performance.now(), exhausted = groupWildcardPredicate(hugeRoot, hugeBase, "proposed2232", input.inputNodes, callbacks);
    expect(exhausted).toMatchObject({kind: "failure", diagnostic: {category: "resource-limit"}, steps: 1_000_000});
    observations.push({case: "default-work-limit-long-exact-operands", limits: {maxSteps: 1_000_000}, result: exhausted.kind === "answer" ? "answer" : exhausted.diagnostic.category,
      steps: exhausted.steps, elapsedMs: performance.now() - exhaustedStart});
    mkdirSync("tmp/conformance/s06-pw01", {recursive: true});
    writeFileSync("tmp/conformance/s06-pw01/measurements.json", JSON.stringify(observations, null, 2) + "\n");
  });
});
