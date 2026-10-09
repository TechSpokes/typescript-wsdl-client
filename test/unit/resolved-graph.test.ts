import path from "node:path";
import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {loadSchemaInput} from "../../src/loader/schemaInput.js";
import {buildCanonicalGraph} from "../../src/compiler/buildCanonicalGraph.js";
import {globalId} from "../../src/compiler/canonicalGraph.js";
import {resolveCanonicalGraph, SemanticError} from "../../src/compiler/resolveCanonicalGraph.js";
import {createSemanticCatalog, serializeSemanticCatalog, readCatalog} from "../../src/compiler/semanticCatalog.js";
import type {CanonicalGraph, ComplexTypeNode, ParticleNode} from "../../src/compiler/canonicalGraph.js";
import {semanticGraphFingerprint} from "../../src/compiler/catalogProvenance.js";

const fixtures = path.resolve("test/conformance/fixtures");
const load = async (file: string) => buildCanonicalGraph(await loadSchemaInput(path.join(fixtures, file), {policy: {fileRoots: [fixtures]}}));
const id = (role: "type" | "element" | "attribute", local: string, namespace = "urn:references") => globalId(role, {namespace, local});
const roundTrip = (g: CanonicalGraph) => {
  const read = readCatalog(serializeSemanticCatalog(createSemanticCatalog(g)), {mode: "faithful"});
  if (read.kind !== "semantic") throw Error("semantic"); return read.catalog.graph;
};
async function offline(resources: Record<string, string>) {
  const offlineResources = new Map(Object.entries(resources).map(([file, text]) => {
    const bytes = Buffer.from(text); return [`https://references.test/${file}`, {bytes, digest: createHash("sha256").update(bytes).digest("hex")}];
  }));
  return buildCanonicalGraph(await loadSchemaInput("https://references.test/main.wsdl", {policy: {allowedOrigins: ["https://references.test"]}, offlineResources}));
}
const schema = (namespace: string, body: string) => `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:f="urn:foreign" targetNamespace="${namespace}">${body}</xs:schema>`;
const wsdl = (body: string) => `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" targetNamespace="urn:service"><types>${body}</types></definitions>`;

describe("resolved canonical references", () => {
  it("retains complete mutual recursion, namespace/role identities, anonymous definitions and independent bounds", async () => {
    const graph = await load("xsd/references/resolved.xsd"), before = JSON.stringify(graph);
    for (const g of [graph, roundTrip(graph)]) {
      const result = resolveCanonicalGraph(g);
      expect(result.graph).toBe(g);
      expect(new Set(result.links.map(l => l.target))).toContain(id("type", "Shared", "urn:foreign"));
      for (const role of ["type", "element", "attribute"] as const) expect(result.links.some(l => l.target === id(role, "Shared"))).toBe(true);
      const uses = g.nodes.find(n => n.id === id("type", "Uses")) as ComplexTypeNode;
      const sequence = g.nodes.find(n => n.id === uses.content) as ParticleNode;
      if (!("children" in sequence.term)) throw Error("sequence");
      const groups = sequence.term.children.map(id => g.nodes.find(n => n.id === id) as ParticleNode).filter(n => n.term.kind === "group");
      expect(groups.map(g => g.occurs)).toEqual([{min: "0", max: "2"}, {min: "3", max: "4"}]);
      expect(groups.map(p => p.term.kind === "group" ? p.term.reference.kind === "symbol" ? p.term.reference.target : "" : "")).toEqual([globalId("group", {namespace: "urn:references", local: "Pair"}), globalId("group", {namespace: "urn:references", local: "Pair"})]);
      expect(result.links.some(l => l.reference.kind === "local" && g.nodes.find(n => n.id === l.target)?.kind === "complexType")).toBe(true);
      expect(Object.isFrozen(result.links)).toBe(true);
    }
    expect(JSON.stringify(graph)).toBe(before);
  });

  it("resolves existing exact bounds, scalar/list/union context and chameleon identities", async () => {
    for (const file of ["xsd/graph/shared-recursive.xsd", "xsd/graph/chameleon.wsdl", "xsd/references/group-values.xsd"]) {
      const g = roundTrip(await load(file)); expect(resolveCanonicalGraph(g).links.length).toBeGreaterThan(0);
    }
  });

  it.each(["missing", "group-cycle", "attribute-cycle", "base-cycle", "scalar-cycle", "zero-group-cycle", "zero-missing-group"])("diagnoses %s with component/source paths", async name => {
    const g = await load(`xsd/references/${name}.xsd`);
    try {resolveCanonicalGraph(g); throw Error("accepted");}
    catch (e) {
      expect(e).toBeInstanceOf(SemanticError);
      const error = e as SemanticError; expect(error.category).toBe("invalid-schema");
      expect(error.component).toBeTruthy(); expect(error.source?.path).toBeTruthy();
      expect(error.message).toMatch(name.includes("missing") ? /Missing reference/ : /Forbidden component cycle/);
    }
  });

  it("preserves inline/reference content equivalence without flattening either use site", async () => {
    const g = await load("xsd/references/resolved.xsd"); resolveCanonicalGraph(g);
    const nodes = new Map(g.nodes.map(n => [n.id, n]));
    const uses = nodes.get(id("type", "Uses")) as ComplexTypeNode, inline = nodes.get(id("type", "Inline")) as ComplexTypeNode;
    const first = (type: ComplexTypeNode) => {
      const particle = nodes.get(type.content!) as ParticleNode;
      if (!("children" in particle.term)) throw Error("sequence"); return nodes.get(particle.term.children[0]) as ParticleNode;
    };
    const groupUse = first(uses), inlineUse = first(inline);
    expect(groupUse.occurs).toEqual(inlineUse.occurs);
    if (groupUse.term.kind !== "group" || groupUse.term.reference.kind !== "symbol") throw Error("group");
    const group = nodes.get(groupUse.term.reference.target!);
    if (group?.kind !== "group") throw Error("definition");
    const referenced = nodes.get(group.content) as ParticleNode;
    if (!("children" in referenced.term) || !("children" in inlineUse.term)) throw Error("sequences");
    const declarations = (ids: readonly string[]) => ids.map(id => {
      const p = nodes.get(id) as ParticleNode;
      if (p.term.kind !== "element" || p.term.declaration.kind !== "local") throw Error("element");
      const e = nodes.get(p.term.declaration.target);
      if (e?.kind !== "element" || e.type.kind !== "builtin") throw Error("declaration"); return {name: e.name, type: e.type.name, occurs: p.occurs};
    });
    expect(declarations(referenced.term.children)).toEqual(declarations(inlineUse.term.children));
  });

  it("requires an explicit import even when a foreign target was linked successfully", async () => {
    const g = await offline({"main.wsdl": wsdl(schema("urn:main", '<xs:element name="root" type="f:Shared"/>') + schema("urn:foreign", '<xs:complexType name="Shared"/>'))});
    expect(() => resolveCanonicalGraph(g)).toThrow(/not imported/);
  });

  it("authorizes unlocated imports from preserved syntax and rejects unavailable old-catalog evidence", async () => {
    const g = await offline({"main.wsdl": wsdl(schema("urn:main", '<xs:import namespace="urn:foreign"/><xs:element name="root" type="f:Shared"/>') + schema("urn:foreign", '<xs:complexType name="Shared"/>'))});
    expect(resolveCanonicalGraph(roundTrip(g)).links).toHaveLength(1);
    expect(() => resolveCanonicalGraph({...g, schemaRetained: []})).toThrow(/regenerate from original source/);
  });

  it("does not lend an including schema's imports to an included declaration", async () => {
    const g = await offline({"main.wsdl": wsdl(schema("urn:main", '<xs:import namespace="urn:foreign" schemaLocation="foreign.xsd"/><xs:include schemaLocation="included.xsd"/>')),
      "foreign.xsd": schema("urn:foreign", '<xs:complexType name="Shared"/>'), "included.xsd": schema("urn:main", '<xs:element name="root" type="f:Shared"/>')});
    expect(() => resolveCanonicalGraph(g)).toThrow(/not imported/);
  });

  it("bounds resolution work without returning a partial result", async () => {
    const g = await load("xsd/references/resolved.xsd");
    expect(() => resolveCanonicalGraph(g, {maxNodes: g.nodes.length - 1})).toThrow(/graph nodes/);
    expect(() => resolveCanonicalGraph(g, {maxSteps: 1})).toThrow(/steps/);
    expect(() => resolveCanonicalGraph(g, {maxNodes: 0})).toThrow(RangeError);
    const steps = resolveCanonicalGraph(g).metrics.steps;
    expect(resolveCanonicalGraph(g, {maxNodes: g.nodes.length, maxSteps: steps}).metrics.steps).toBe(steps);
    expect(() => resolveCanonicalGraph(g, {maxSteps: steps - 1})).toThrowError(expect.objectContaining({category: "resource-limit"}));
  });

  it("excludes retained import retrieval locations from semantic fingerprints", async () => {
    const g = await load("xsd/references/resolved.xsd"), changed = structuredClone(g);
    const retained = changed.schemaRetained.find(r => r.syntax.name.local === "import")!;
    const syntax = {...retained.syntax, attributes: retained.syntax.attributes.map(a => a.name.local === "schemaLocation" ? {...a, value: "different/foreign.xsd"} : a)};
    const mutated = {...changed, schemaRetained: changed.schemaRetained.map(r => r === retained ? {...r, syntax} : r)};
    expect(semanticGraphFingerprint(mutated)).toBe(semanticGraphFingerprint(g));
  });
});
