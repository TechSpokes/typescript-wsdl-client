import path from "node:path";
import {createHash} from "node:crypto";
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {loadSchemaInput} from "../../src/loader/schemaInput.js";
import {buildCanonicalGraph} from "../../src/compiler/buildCanonicalGraph.js";
import {globalId} from "../../src/compiler/canonicalGraph.js";
import type {CanonicalGraph} from "../../src/compiler/canonicalGraph.js";
import {mergeStructuralCompanions} from "../../src/compiler/structuralCompanions.js";
import {createSemanticCatalog, serializeSemanticCatalog, prepareCompilationInput, prepareResolvedCompilationInput} from "../../src/compiler/semanticCatalog.js";

const fixtures = path.resolve("test/conformance/fixtures");
const id = (local: string, role: Parameters<typeof globalId>[0] = "type", namespace = "urn:references") => globalId(role, {namespace, local});
const source = (file: string) => ({kind: "source" as const, source: path.join(fixtures, file)});
const loading = {policy: {fileRoots: [fixtures]}};
const load = async (file: string) => buildCanonicalGraph(await loadSchemaInput(path.join(fixtures, file), loading));
const schema = async (body: string, uri = "https://companion.test/schema.xsd", namespace = "urn:references") => {
  const bytes = Buffer.from(`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="${namespace}" targetNamespace="${namespace}">${body}</xs:schema>`);
  return buildCanonicalGraph(await loadSchemaInput(uri, {policy: {allowedOrigins: ["https://companion.test"]}, offlineResources: new Map([[uri, {bytes, digest: createHash("sha256").update(bytes).digest("hex")}]])}));
};
const text = (graph: CanonicalGraph) => ({kind: "catalog" as const, text: serializeSemanticCatalog(createSemanticCatalog(graph))});
const primary = () => schema('<xs:complexType name="Primary"/>');
const semantic = (result: Awaited<ReturnType<typeof prepareResolvedCompilationInput>>) => {
  if (result.kind !== "semantic" || !("resolved" in result)) throw Error("Expected resolved semantic input"); return result;
};

describe("structural companion dispatch", () => {
  it("composes the independently qualified public-characterization fixture from a structural companion", async () => {
    const ns = "urn:composition:public", named = (local: string) => id(local, "type", ns);
    const roots = ["Restricted", "Empty", "Uses", "Recursive", "MutualA"].map(named);
    const result = semantic(await prepareResolvedCompilationInput(text(await primary()), {loading, companions: [{input: source("xsd/composition/derivation-boundaries.wsdl"), roots}]}));
    const restricted = result.composed.types.find(t => t.id === named("Restricted"))!, base = result.composed.types.find(t => t.id === named("Base"))!;
    expect(restricted.content).toHaveLength(1);
    expect(restricted.content).not.toEqual(base.content);
    expect(restricted.attributes.find(a => a.name.local === "gone")?.use).toBe("prohibited");
    expect(result.composed.types.find(t => t.id === named("Empty"))?.content).toEqual([]);
    expect(result.composed.types.find(t => t.id === named("Uses"))?.attributes.find(a => a.name.local === "id")?.use).toBe("required");
    expect(result.catalog.graph.nodes.some(n => n.kind === "wsdl")).toBe(false);
    expect(result.resolved.links.some(l => l.target === named("Recursive"))).toBe(true);
    expect(result.catalog.graph.globals).toContain(named("MutualB"));
  });
  it("copies only required recursive closures through the source and catalog boundary", async () => {
    const main = await primary(), before = JSON.stringify(main);
    const result = semantic(await prepareResolvedCompilationInput(text(main), {loading, companions: [{input: source("xsd/references/resolved.xsd"), roots: [id("Shared")]}]}));
    expect(result.catalog.graph.globals).toEqual([id("Shared", "attribute"), id("Flags", "attributeGroup"), id("Inner", "attributeGroup"), id("Shared", "element"), id("Other"), id("Primary"), id("Shared")].sort());
    expect(result.composed.types.filter(t => t.id !== id("Primary"))).toHaveLength(2);
    expect(result.resolved.links.some(l => l.target === id("Shared", "element"))).toBe(true);
    expect(JSON.stringify(main)).toBe(before);
    const roundTrip = semantic(await prepareResolvedCompilationInput(text(result.catalog.graph)));
    expect(roundTrip.catalog.semanticFingerprint).toBe(result.catalog.semanticFingerprint);
    expect(roundTrip.composed.types).toEqual(result.composed.types);
  });

  it("retains use-site bounds, anonymous owners and namespace/role identities", async () => {
    const result = semantic(await prepareResolvedCompilationInput(text(await primary()), {loading, companions: [{input: source("xsd/references/resolved.xsd"), roots: [id("Uses")]}]}));
    expect(result.catalog.graph.globals).toContain(id("Shared", "type", "urn:foreign"));
    expect(result.catalog.graph.globals).toContain(id("Shared", "element", "urn:foreign"));
    expect(result.catalog.graph.globals).not.toContain(id("Inline"));
    expect(result.catalog.graph.nodes.filter(n => n.kind === "particle" && n.term.kind === "group").map(n => n.kind === "particle" ? n.occurs : undefined)).toEqual(expect.arrayContaining([{min: "0", max: "2"}, {min: "3", max: "4"}]));
    expect(result.catalog.graph.nodes.some(n => n.kind === "complexType" && n.identity.kind === "scoped")).toBe(true);
    expect(Object.isFrozen(result.catalog.graph.origins)).toBe(true);
  });

  it("deduplicates actual structure across shifted source paths and preserves every origin", async () => {
    const body = '<xs:complexType name="Shared"><xs:sequence><xs:element name="value"><xs:complexType><xs:attribute name="id" type="xs:int"/></xs:complexType></xs:element></xs:sequence></xs:complexType>';
    const a = await schema(body), b = await schema(body.replace('<xs:sequence>', '<xs:annotation><xs:documentation>Different docs</xs:documentation></xs:annotation><xs:sequence>'), "https://companion.test/other.xsd");
    const result = semantic(await prepareResolvedCompilationInput(text(a), {companions: [{input: text(b), roots: [id("Shared")]}]}));
    expect(result.merge.deduplicated).toEqual([id("Shared")]);
    expect(result.catalog.graph.nodes).toHaveLength(a.nodes.length);
    expect(Object.values(result.catalog.graph.origins).every(origins => origins.length === 2)).toBe(true);
    expect(result.catalog.semanticFingerprint).toBe(createSemanticCatalog(a).semanticFingerprint);
    expect(JSON.stringify(result.catalog.graph.origins)).toContain(createHash("sha256").update(`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:references" targetNamespace="urn:references">${body}</xs:schema>`).digest("hex"));
  });

  it.each([
    ["order", '<xs:sequence><xs:element name="a"/><xs:element name="b"/></xs:sequence>', '<xs:sequence><xs:element name="b"/><xs:element name="a"/></xs:sequence>'],
    ["occurrence", '<xs:sequence maxOccurs="2"><xs:element name="a"/></xs:sequence>', '<xs:sequence maxOccurs="900719925474099312345"><xs:element name="a"/></xs:sequence>'],
    ["group", '<xs:group ref="t:G"/>', '<xs:group ref="t:H"/>'],
    ["derivation", '<xs:complexContent><xs:extension base="t:B"/></xs:complexContent>', '<xs:complexContent><xs:restriction base="t:B"/></xs:complexContent>'],
    ["attribute", '<xs:attribute name="id" type="xs:int" use="required" fixed="1"/>', '<xs:attribute name="id" type="xs:int" use="optional" fixed="2"/>'],
    ["wildcard", '<xs:anyAttribute namespace="urn:a" processContents="lax"/>', '<xs:anyAttribute namespace="urn:b" processContents="strict"/>'],
  ])("rejects meaningful %s collisions with both source locations", async (_kind, a, b) => {
    const definitions = '<xs:complexType name="B"/><xs:group name="G"><xs:sequence/></xs:group><xs:group name="H"><xs:sequence/></xs:group>';
    const current = await schema(`${definitions}<xs:complexType name="Shared">${a}</xs:complexType>`), companion = await schema(`${definitions}<xs:complexType name="Shared">${b}</xs:complexType>`, "https://companion.test/other.xsd");
    const before = JSON.stringify(current);
    expect(() => mergeStructuralCompanions(current, [{graph: companion, roots: [id("Shared")]}])).toThrowError(expect.objectContaining({category: "invalid-schema", component: id("Shared"), source: expect.objectContaining({uri: "https://companion.test/other.xsd"}), related: [expect.objectContaining({uri: "https://companion.test/schema.xsd"})]}));
    expect(JSON.stringify(current)).toBe(before);
  });

  it("compares reachable referenced definitions and scalar constraints after equal root deduplication", async () => {
    const root = '<xs:complexType name="Shared"><xs:attribute name="v" type="t:Exact"/></xs:complexType>';
    const a = await schema(`<xs:simpleType name="Exact"><xs:restriction base="xs:decimal"><xs:maxInclusive value="10"/></xs:restriction></xs:simpleType>${root}`), b = await schema(`<xs:simpleType name="Exact"><xs:restriction base="xs:decimal"><xs:maxInclusive value="11"/></xs:restriction></xs:simpleType>${root}`, "https://companion.test/other.xsd");
    expect(() => mergeStructuralCompanions(a, [{graph: b, roots: [id("Shared")]}])).toThrowError(expect.objectContaining({component: id("Exact")}));
  });

  it("compares symbol identity rather than optional stored-link availability", async () => {
    const root = '<xs:complexType name="Shared"><xs:attribute name="v" type="t:Exact"/></xs:complexType>';
    const a = await schema(`<xs:simpleType name="Exact"><xs:restriction base="xs:string"/></xs:simpleType>${root}`), b = await schema(root, "https://companion.test/other.xsd");
    const result = semantic(await prepareResolvedCompilationInput(text(a), {companions: [{input: text(b), roots: [id("Shared")]}]}));
    expect(result.merge.deduplicated).toEqual([id("Shared")]);
    expect(result.resolved.links.some(l => l.target === id("Exact"))).toBe(true);
  });

  it.each([true, false])("relinks new union references before catalog validation (primary missing: %s)", async primaryMissing => {
    const reference = '<xs:complexType name="Shared"><xs:sequence><xs:element name="value" type="t:Other"/></xs:sequence></xs:complexType>', definition = '<xs:complexType name="Other"/>';
    const a = await schema(primaryMissing ? reference : definition), b = await schema(primaryMissing ? definition : reference, "https://companion.test/other.xsd");
    const before = [JSON.stringify(a), JSON.stringify(b)];
    const result = semantic(await prepareResolvedCompilationInput(text(a), {companions: [{input: text(b), roots: [id(primaryMissing ? "Other" : "Shared")]}]}));
    expect(result.resolved.links.some(l => l.target === id("Other"))).toBe(true);
    expect(result.catalog.graph.nodes.some(n => n.kind === "element" && n.type.kind === "symbol" && n.type.target === id("Other"))).toBe(true);
    expect([JSON.stringify(a), JSON.stringify(b)]).toEqual(before);
    expect(semantic(await prepareResolvedCompilationInput(text(result.catalog.graph))).catalog.semanticFingerprint).toBe(result.catalog.semanticFingerprint);
  });

  it.each([true, false])("resolves required dependencies across companion pools (reverse order: %s)", async reverse => {
    const c = await schema('<xs:complexType name="C"><xs:sequence><xs:element name="value" type="t:D"/></xs:sequence></xs:complexType>', "https://companion.test/c.xsd");
    // D is required by C, even though only E is explicitly selected from this pool.
    const d = await schema('<xs:complexType name="D"/><xs:complexType name="E"/><xs:complexType name="Unused"/>', "https://companion.test/d.xsd");
    const requests = [{input: text(c), roots: [id("C")]}, {input: text(d), roots: [id("E")]}];
    if (reverse) requests.reverse();
    const result = semantic(await prepareResolvedCompilationInput(text(await primary()), {companions: requests}));
    expect(result.catalog.graph.globals).toEqual([id("Primary"), id("C"), id("D"), id("E")].sort());
    expect(result.resolved.links.some(l => l.target === id("D"))).toBe(true);
  });

  it("terminates mutual recursion across separately read companion pools", async () => {
    const c = await schema('<xs:complexType name="C"><xs:sequence><xs:element name="next" type="t:D" minOccurs="0"/></xs:sequence></xs:complexType>', "https://companion.test/c.xsd");
    const d = await schema('<xs:complexType name="D"><xs:sequence><xs:element name="next" type="t:C" minOccurs="0"/></xs:sequence></xs:complexType>', "https://companion.test/d.xsd");
    const result = semantic(await prepareResolvedCompilationInput(text(await primary()), {companions: [{input: text(c), roots: [id("C")]}, {input: text(d), roots: [id("D")]}]}));
    expect(result.resolved.links.filter(l => l.target === id("C") || l.target === id("D"))).toHaveLength(2);
    expect(result.composed.types).toHaveLength(3);
  });

  it("preserves import visibility when a primary definition supplies a companion target", async () => {
    const main = await schema('<xs:complexType name="P"/>', "https://companion.test/p.xsd", "urn:primary");
    const body = '<xs:complexType name="C"><xs:sequence><xs:element xmlns:p="urn:primary" name="value" type="p:P"/></xs:sequence></xs:complexType>';
    const allowed = await schema('<xs:import namespace="urn:primary"/>' + body), denied = await schema(body);
    const result = semantic(await prepareResolvedCompilationInput(text(main), {companions: [{input: text(allowed), roots: [id("C")]}]}));
    expect(result.resolved.links.some(l => l.target === id("P", "type", "urn:primary"))).toBe(true);
    await expect(prepareResolvedCompilationInput(text(main), {companions: [{input: text(denied), roots: [id("C")]}]})).rejects.toMatchObject({category: "invalid-schema", source: expect.objectContaining({path: expect.any(String)})});
  });

  it("bounds aggregate retained inputs before collecting redundant companion graphs", async () => {
    const graph = await schema('<xs:complexType name="Shared"/>');
    await expect(prepareResolvedCompilationInput(text(graph), {semantics: {maxNodes: 1}, companions: [{input: text(graph), roots: [id("Shared")]}]})).rejects.toMatchObject({category: "resource-limit", message: expect.stringContaining("aggregate input nodes")});
    const options = {semantics: {maxNodes: 2}, companions: [{input: text(graph), roots: [id("Shared")]}]};
    const result = semantic(await prepareResolvedCompilationInput(text(graph), options));
    expect(result.gathering.inputNodes).toBe(2);
    const steps = Math.max(result.gathering.steps, result.merge.metrics.steps, result.resolved.metrics.steps, result.composed.metrics.steps);
    expect(semantic(await prepareResolvedCompilationInput(text(graph), {...options, semantics: {maxNodes: 2, maxSteps: steps}})).catalog.semanticFingerprint).toBe(result.catalog.semanticFingerprint);
    await expect(prepareResolvedCompilationInput(text(graph), {...options, semantics: {maxNodes: 2, maxSteps: steps - 1}})).rejects.toMatchObject({category: "resource-limit"});
  });

  it("counts dynamic namespace-prefix keys before provenance and normalization copies", async () => {
    const prefix = 'p'.repeat(20_000), body = `<xs:complexType name="Shared" xmlns:${prefix}="urn:long"/>`;
    const a = await schema(body), b = await schema(body, "https://companion.test/other.xsd");
    expect(() => mergeStructuralCompanions(a, [{graph: b, roots: [id("Shared")]}], {maxSteps: 10_000})).toThrowError(expect.objectContaining({category: "resource-limit"}));
    const result = mergeStructuralCompanions(a, [{graph: b, roots: [id("Shared")]}]);
    expect(result.deduplicated).toEqual([id("Shared")]);
  });

  it("does not resolve or copy unrelated missing and unsupported operation components", async () => {
    const graph = await schema('<xs:complexType name="Shared"/><xs:complexType name="Unrelated"><xs:sequence><xs:element name="missing" type="t:Missing"/></xs:sequence><xs:assert test="false()"/></xs:complexType>');
    const result = semantic(await prepareResolvedCompilationInput(text(await primary()), {companions: [{input: text(graph), roots: [id("Shared")]}]}));
    expect(result.catalog.graph.globals).toEqual([id("Primary"), id("Shared")].sort());
    expect(JSON.stringify(result.catalog.graph)).not.toContain('false()');
  });

  it("retains reachable unassessed constraints for the downstream capability gate", async () => {
    const graph = await schema('<xs:complexType name="Shared"><xs:assert test="false()"/></xs:complexType>');
    const result = semantic(await prepareResolvedCompilationInput(text(await primary()), {companions: [{input: text(graph), roots: [id("Shared")]}]}));
    expect(result.catalog.graph.nodes.find(n => n.id === id("Shared"))?.retained).toEqual(expect.arrayContaining([expect.objectContaining({name: {namespace: "http://www.w3.org/2001/XMLSchema", local: "assert"}})]));
    expect(result.composed.types.find(t => t.id === id("Shared"))?.assessment).toBe("requires-schema-assessment");
  });

  it("diagnoses required missing references and forbidden cycles through the shared resolver", async () => {
    for (const file of ["missing", "group-cycle"]) {
      const graph = await load(`xsd/references/${file}.xsd`);
      const root = graph.globals[0];
      await expect(prepareResolvedCompilationInput(text(await primary()), {companions: [{input: text(graph), roots: [root]}]})).rejects.toMatchObject({category: "invalid-schema", source: expect.objectContaining({path: expect.any(String)})});
    }
  });

  it("preserves chameleon identities without making interpretations global symbols", async () => {
    const graph = await load("xsd/graph/chameleon.wsdl");
    const roots = graph.nodes.filter(n => n.kind === "complexType" && n.identity.kind === "global").map(n => n.id);
    const result = semantic(await prepareResolvedCompilationInput(text(await primary()), {companions: [{input: text(graph), roots}]}));
    expect(roots).toHaveLength(2);
    expect(result.catalog.graph.nodes.filter(n => n.kind === "complexType" && n.context.chameleon)).toHaveLength(2);
    expect(result.catalog.graph.globals).toEqual([id("Primary"), ...roots].sort());
  });

  it("uses file dispatch, skips unused companions and requires source regeneration for legacy artifacts", async () => {
    mkdirSync("tmp/conformance", {recursive: true}); const dir = mkdtempSync(path.resolve("tmp/conformance/companion-"));
    try {
      const file = path.join(dir, "catalog.json"); writeFileSync(file, text(await load("xsd/references/resolved.xsd")).text);
      const result = semantic(await prepareResolvedCompilationInput(text(await primary()), {companions: [{input: {kind: "catalog-file", file}, roots: [id("Shared")]}, {input: {kind: "catalog-file", file: path.join(dir, "absent")}, roots: []}]}));
      expect(result.catalog.graph.globals).toContain(id("Shared"));
      const legacy = await prepareCompilationInput({kind: "source", source: "examples/minimal/weather.wsdl"});
      if (legacy.kind !== "legacy") throw Error("legacy");
      expect(await prepareResolvedCompilationInput(text(await primary()), {companions: [{input: {kind: "catalog", text: JSON.stringify(legacy.catalog)}, roots: [id("Shared")]}]})).toMatchObject({kind: "regeneration-required", requiredInput: "original-source"});
    } finally {rmSync(dir, {recursive: true, force: true});}
  });

  it("bounds closure traversal, actual comparison and provenance copying with exact deterministic budgets", async () => {
    const main = await primary(), companion = await load("xsd/references/resolved.xsd"), requests = [{graph: companion, roots: [id("Uses")]}];
    const result = mergeStructuralCompanions(main, requests);
    expect(mergeStructuralCompanions(main, requests, {maxSteps: result.metrics.steps}).metrics.steps).toBe(result.metrics.steps);
    expect(() => mergeStructuralCompanions(main, requests, {maxSteps: result.metrics.steps - 1})).toThrowError(expect.objectContaining({category: "resource-limit"}));
    expect(() => mergeStructuralCompanions(main, requests, {maxNodes: main.nodes.length})).toThrowError(expect.objectContaining({category: "resource-limit"}));
  });
});
