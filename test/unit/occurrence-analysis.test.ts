import path from "node:path";
import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {globalId, DEFAULT_GRAPH_NODES} from "../../src/compiler/canonicalGraph.js";
import type {ParticleNode} from "../../src/compiler/canonicalGraph.js";
import {analyzeOccurrences, occurrenceAlgebra} from "../../src/compiler/occurrenceAnalysis.js";
import type {OccurrenceAnalysis, TypeSummary} from "../../src/compiler/occurrenceAnalysis.js";
import {prepareResolvedCompilationInput} from "../../src/compiler/semanticCatalog.js";
import {resolveCanonicalGraph} from "../../src/compiler/resolveCanonicalGraph.js";

const fixtures = path.resolve("test/conformance/fixtures"), id = (name: string) => globalId("type", {namespace: "urn:analysis", local: name});
const load = async () => {
  const input = await prepareResolvedCompilationInput({kind: "source", source: path.join(fixtures, "xsd/analysis/analysis.xsd")}, {loading: {policy: {fileRoots: [fixtures]}}});
  if (input.kind !== "semantic") throw Error("Expected semantic input"); return input;
};
const analyze = (input: Awaited<ReturnType<typeof load>>): OccurrenceAnalysis => {
  const result = analyzeOccurrences(input.composed); if (result.kind !== "analyzed") throw result.diagnostic; return result.analysis;
};
const type = (a: OccurrenceAnalysis, name: string): TypeSummary => a.types.find(t => t.id === id(name))!;
const counts = (a: OccurrenceAnalysis, name: string) => Object.fromEntries(type(a, name).children.elements.map(p => [p.name.local, p.occurs]));

describe("exact occurrence analysis", () => {
  it("keeps exact arithmetic and zero distinct from unbounded", () => {
    const a = occurrenceAlgebra(() => {});
    expect(a.multiply("0", "unbounded")).toBe("0");
    expect(a.multiply("unbounded", "0")).toBe("0");
    expect(a.multiply("900719925474099312345678901234567890", "2")).toBe("1801439850948198624691357802469135780");
    expect(a.add("99999999999999999999999", "1")).toBe("100000000000000000000000");
  });

  it("sums sequences and computes choice guarantees including absent branches", async () => {
    const a = analyze(await load());
    expect(counts(a, "Single")).toEqual({a: {min: "1", max: "1"}});
    expect(counts(a, "Common")).toEqual({b: {min: "0", max: "3"}, a: {min: "2", max: "3"}, c: {min: "0", max: "3"}});
    expect(counts(a, "Grouped")).toEqual({a: {min: "3", max: "6"}, b: {min: "3", max: "6"}, separator: {min: "1", max: "1"}});
    expect(counts(a, "All")).toEqual({a: {min: "1", max: "1"}, b: {min: "0", max: "1"}});
    expect(counts(a, "Epsilon")).toEqual({a: {min: "0", max: "1"}});
    expect(type(a, "Epsilon").children.nullable).toBe(true);
    expect(type(a, "Common").children.nullable).toBe(false);
  });

  it("distinguishes epsilon, empty language, element occurrence and recursive child content", async () => {
    const a = analyze(await load());
    expect(type(a, "EmptyChoice").children).toMatchObject({nullable: false, hasRealization: false});
    expect(type(a, "EmptyChoice").children).toMatchObject({effectiveTotalRange: {min: "0", max: "0"}, schemaEmptiable: true});
    expect(type(a, "DeadRequired").children).toMatchObject({nullable: false, hasRealization: false, effectiveTotalRange: {min: "1", max: "1"}, schemaEmptiable: false});
    expect(type(a, "OptionalEmptyChoice").children).toMatchObject({nullable: true, hasRealization: true});
    expect(type(a, "EmptySequence").children).toMatchObject({nullable: true, hasRealization: true});
    expect(counts(a, "DeadOptional")).toEqual({});
    expect(counts(a, "DeadAndRequired")).toEqual({b: {min: "1", max: "1"}});
    expect(type(a, "DeadAndRequired").children.effectiveTotalRange).toEqual({min: "1", max: "4"});
    expect(type(a, "DeadWildcard").children.wildcard).toEqual({min: "0", max: "0"});
    expect(type(a, "Container").children.nullable).toBe(false);
    expect(counts(a, "Container")).toEqual({child: {min: "1", max: "1"}});
    expect(type(a, "Recursive").children.nullable).toBe(true);
    expect(type(a, "Opaque").scope).toBe("declared-particles-with-opaque-builtin");
    expect(a.assessment).toBe("requires-schema-assessment");
  });

  it("preserves count gaps, declared bounds, ordered branches and deterministic immutable inputs", async () => {
    const input = await load(), before = JSON.stringify(input), a = analyze(input);
    expect(counts(a, "Disabled")).toEqual({a: {min: "0", max: "0"}});
    expect(type(a, "Disabled").children.effectiveTotalRange).toEqual({min: "0", max: "0"});
    expect(counts(a, "ZeroElement")).toEqual({a: {min: "0", max: "0"}});
    expect(counts(a, "Huge")).toEqual({a: {min: "1801439850948198624691357802469135780", max: "1801439850948198624691357802469135780"}});
    expect(counts(a, "Gap")).toEqual({a: {min: "2", max: "4"}});
    expect(counts(a, "Shared")).toEqual({shared: {min: "256", max: "256"}});
    expect(type(a, "Shared").children.elements[0].particles.length).toBe(1);
    const root = input.catalog.graph.nodes.find(n => n.id === id("Gap"));
    expect(root).toMatchObject({kind: "complexType"});
    if (root?.kind !== "complexType") throw Error("type");
    expect(input.catalog.graph.nodes.find(n => n.id === root.content)).toMatchObject({occurs: {min: "1", max: "2"}});
    expect(JSON.stringify(analyze(input))).toBe(JSON.stringify(a));
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(type(a, "Common").children.elements[0].occurs)).toBe(true);
  });

  it("retains S05 zero-bounded missing reference and cycle diagnostics", async () => {
    for (const name of ["zero-missing-group", "zero-group-cycle"]) {
      await expect(prepareResolvedCompilationInput({kind: "source", source: path.join(fixtures, `xsd/references/${name}.xsd`)}, {loading: {policy: {fileRoots: [fixtures]}}})).rejects.toMatchObject({category: "invalid-schema"});
    }
  });

  it("measures inclusive budgets, huge arithmetic and shared recursive structures without partial success", async () => {
    const input = await load(), a = analyze(input), steps = a.metrics.steps, nodes = input.catalog.graph.nodes.length;
    const results = [];
    for (const limits of [{maxNodes: nodes, maxSteps: steps}, {maxNodes: nodes - 1}, {maxSteps: steps - 1}]) {
      const start = performance.now(), result = analyzeOccurrences(input.composed, limits);
      results.push({limits, outcome: result.kind === "analyzed" ? "passes" : result.diagnostic.category, elapsedMs: performance.now() - start});
    }
    expect(results.map(r => r.outcome)).toEqual(["passes", "resource-limit", "resource-limit"]);
    const particle = input.catalog.graph.nodes.find(n => n.kind === "particle" && n.term.kind === "element") as ParticleNode;
    const altered = {...input.catalog.graph, nodes: input.catalog.graph.nodes.map(n => n === particle ? {...particle, occurs: {min: "1", max: "9".repeat(20_000)}} : n)};
    const resolved = resolveCanonicalGraph(altered), composed = {...input.composed, resolved};
    const result = analyzeOccurrences(composed, {maxSteps: 1000});
    expect(result).toMatchObject({kind: "failure", diagnostic: {category: "resource-limit"}});
    expect("analysis" in result).toBe(false);
    mkdirSync("tmp/conformance/analysis", {recursive: true});
    writeFileSync("tmp/conformance/analysis/measurements.json", JSON.stringify(results, null, 2) + "\n");
  });

  it("measures the default node budget before allocating traversal indexes", async () => {
    const input = await load(), template = input.catalog.graph.nodes.find(n => n.kind === "element")!;
    const measurements = [];
    for (const count of [DEFAULT_GRAPH_NODES, DEFAULT_GRAPH_NODES + 1]) {
      const graph = {...input.catalog.graph, nodes: Array.from({length: count}, (_, i) => ({...template, id: `node-${i}`}))};
      const composed = {...input.composed, types: [], resolved: {...input.resolved, graph}};
      const start = performance.now(), result = analyzeOccurrences(composed);
      measurements.push({nodes: count, outcome: result.kind === "analyzed" ? "passes" : result.diagnostic.category, elapsedMs: performance.now() - start});
    }
    expect(measurements.map(r => r.outcome)).toEqual(["passes", "resource-limit"]);
    mkdirSync("tmp/conformance/analysis", {recursive: true});
    writeFileSync("tmp/conformance/analysis/node-measurements.json", JSON.stringify(measurements, null, 2) + "\n");
  });

  it("charges expanded-name serialization before allocating large property keys", async () => {
    const source = "https://analysis.test/large-name.xsd";
    const bytes = Buffer.from(`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:complexType name="T"><xs:sequence><xs:element name="${"a".repeat(20_000)}" type="xs:string"/></xs:sequence></xs:complexType></xs:schema>`);
    const input = await prepareResolvedCompilationInput({kind: "source", source}, {loading: {policy: {allowedOrigins: ["https://analysis.test"]}, offlineResources: new Map([[source, {bytes, digest: createHash("sha256").update(bytes).digest("hex")}]])}});
    if (input.kind !== "semantic") throw Error("semantic");
    expect(analyzeOccurrences(input.composed, {maxSteps: 1000})).toMatchObject({kind: "failure", diagnostic: {category: "resource-limit", component: expect.any(String), source: expect.objectContaining({path: expect.any(String)})}});
  });
});
