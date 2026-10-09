import path from "node:path";
import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {loadSchemaInput} from "../../src/loader/schemaInput.js";
import {buildCanonicalGraph} from "../../src/compiler/buildCanonicalGraph.js";
import {globalId} from "../../src/compiler/canonicalGraph.js";
import {resolveCanonicalGraph} from "../../src/compiler/resolveCanonicalGraph.js";
import {composeCanonicalGraph, namespaceIntersection, namespaceUnion, namespaceSubset} from "../../src/compiler/composeCanonicalGraph.js";
import {createSemanticCatalog, serializeSemanticCatalog, readCatalog} from "../../src/compiler/semanticCatalog.js";
import type {ComplexTypeNode} from "../../src/compiler/canonicalGraph.js";
import type {ComposedGraph, ComposedType} from "../../src/compiler/composeCanonicalGraph.js";

const fixtures = path.resolve("test/conformance/fixtures"), id = (local: string) => globalId("type", {namespace: "urn:composition", local});
const load = async (name = "derivations") => buildCanonicalGraph(await loadSchemaInput(path.join(fixtures, "xsd/composition", name + ".xsd"), {policy: {fileRoots: [fixtures]}}));
const view = (result: ComposedGraph, local: string): ComposedType => result.types.find(n => n.id === id(local))!;

describe("immutable derivation composition", () => {
  it("extends ordered root contributions and replaces restrictions including empty content", async () => {
    const graph = await load(), before = JSON.stringify(graph), result = composeCanonicalGraph(resolveCanonicalGraph(graph));
    const base = view(result, "Base"), extended = view(result, "Extended"), restricted = view(result, "Restricted"), empty = view(result, "Empty");
    const local = (name: string) => (graph.nodes.find(n => n.id === id(name)) as ComplexTypeNode).content!;
    expect(extended.content).toEqual([...base.content, {kind: "particle", particle: local("Extended")}]);
    expect(restricted.content).toEqual([{kind: "particle", particle: local("Restricted")}]);
    expect(empty.content).toEqual([]);
    expect(view(result, "Sibling").content).toEqual(base.content);
    expect(extended.derivation?.base).toMatchObject({target: base.id});
    expect(restricted.obligations.some(o => o.kind === "particle-restriction" && o.base === base.id)).toBe(true);
    expect(JSON.stringify(graph)).toBe(before);
    expect(Object.isFrozen(base.attributes)).toBe(true);
    expect(() => Reflect.set(extended.attributes[0], "use", "prohibited")).not.toThrow();
    expect(extended.attributes[0].use).toBe("required");
    expect(base.attributes.some(a => a.name.local === "flag")).toBe(false);
  });

  it("inherits omitted uses, preserves prohibitions, defaults/fixed constraints and independent siblings", async () => {
    const result = composeCanonicalGraph(resolveCanonicalGraph(await load()));
    const restricted = view(result, "Restricted"), empty = view(result, "Empty");
    expect(restricted.attributes.find(a => a.name.local === "id")?.use).toBe("required");
    expect(restricted.attributes.find(a => a.name.local === "gone")?.use).toBe("prohibited");
    expect(empty.attributes.find(a => a.name.local === "tag")?.value?.lexical.value).toBe("base");
    expect(view(result, "Sibling").attributes.find(a => a.name.local === "sibling")?.value).toMatchObject({kind: "fixed", lexical: {value: "yes"}});
    expect(view(result, "Base").attributes.find(a => a.name.local === "gone")?.use).toBe("optional");
  });

  it("composes wildcard namespaces using lexical declaration context and processing rules", async () => {
    const result = composeCanonicalGraph(resolveCanonicalGraph(await load()));
    expect(view(result, "Extended").wildcard).toMatchObject({namespace: {kind: "set", namespaces: ["urn:external", "urn:more"]}, processContents: "strict"});
    expect(view(result, "Restricted").wildcard).toMatchObject({namespace: {kind: "set", namespaces: ["urn:external"]}, processContents: "strict"});
    expect(view(result, "Empty").wildcard).toBeUndefined();
    expect(view(result, "Grouped").wildcard).toMatchObject({namespace: {kind: "set", namespaces: ["urn:external"]}, processContents: "lax"});
    const a = {kind: "not" as const, namespaces: ["", "urn:a"]}, b = {kind: "not" as const, namespaces: ["", "urn:b"]};
    expect(namespaceIntersection(a, b)).toEqual({kind: "not", namespaces: ["", "urn:a", "urn:b"]});
    expect(namespaceUnion(a, b)).toEqual({kind: "not", namespaces: [""]});
    expect(namespaceSubset({kind: "set", namespaces: ["urn:c"]}, a)).toBe(true);
    expect(namespaceSubset(a, b)).toBe(false);
  });

  it("preserves scalar bases, ordered facets, QName values and list/union definitions for their owners", async () => {
    const graph = await load(), result = composeCanonicalGraph(resolveCanonicalGraph(graph));
    expect(view(result, "ScalarRestricted").scalar).toMatchObject({base: {target: id("Exact")}, layers: [{owner: id("Scalar"), facets: []}, {owner: id("ScalarRestricted"), facets: [{name: "maxInclusive", lexical: {value: "10"}}]}]});
    expect(view(result, "ScalarExtended").attributes.find(a => a.name.local === "tag")?.value).toMatchObject({kind: "fixed", lexical: {value: "t:value", context: {namespaces: {t: "urn:composition"}}}});
    expect(view(result, "ListContent").scalar?.base).toMatchObject({target: id("List")});
    expect(view(result, "UnionContent").scalar?.base).toMatchObject({target: id("Union")});
    expect(graph.nodes.find(n => n.id === id("Union"))).toMatchObject({variety: {kind: "union", members: [{target: id("List")}, {name: {local: "string"}}]}});
  });

  it("retains opaque anyType extension content and replaces anyType restriction content", async () => {
    const result = composeCanonicalGraph(resolveCanonicalGraph(await load()));
    expect(view(result, "OpaqueExtension")).toMatchObject({mixed: true, content: [{kind: "builtin", reference: {kind: "builtin", name: {local: "anyType"}}}], wildcard: {namespace: {kind: "not", namespaces: []}, processContents: "lax"}});
    expect(view(result, "OpaqueRestriction").content).toHaveLength(1);
    expect(view(result, "OpaqueRestriction").wildcard).toBeUndefined();
  });

  it("uses effective mixed bases and ignores group-contained prohibitions", async () => {
    const result = composeCanonicalGraph(resolveCanonicalGraph(await load("reviewed-boundaries")));
    expect(view(result, "OpaqueBase").mixed).toBe(true);
    expect(view(result, "Text").scalar?.base).toMatchObject({kind: "local"});
    expect(view(result, "Inherited").attributes.find(a => a.name.local === "a")?.use).toBe("optional");
    expect(view(result, "OptionalBase").attributes.find(a => a.name.local === "a")?.use).toBe("optional");
  });

  it("bounds duplicate provenance copying before allocating expanded arrays", async () => {
    const uri = "https://budget.test/schema.xsd";
    const bytes = Buffer.from(`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:composition" targetNamespace="urn:composition"><xs:attribute name="a" type="xs:string"/><xs:complexType name="Repeated">${'<xs:attribute ref="t:a"/>'.repeat(80)}</xs:complexType></xs:schema>`);
    const graph = buildCanonicalGraph(await loadSchemaInput(uri, {policy: {allowedOrigins: ["https://budget.test"]}, offlineResources: new Map([[uri, {bytes, digest: createHash("sha256").update(bytes).digest("hex")}]])}));
    const resolved = resolveCanonicalGraph(graph);
    expect(() => composeCanonicalGraph(resolved, {maxSteps: 1000})).toThrowError(expect.objectContaining({category: "resource-limit"}));
    const result = composeCanonicalGraph(resolved);
    expect(view(result, "Repeated").attributes[0].sources).toHaveLength(80);
    expect(composeCanonicalGraph(resolved, {maxSteps: result.metrics.steps}).metrics.steps).toBe(result.metrics.steps);
    expect(() => composeCanonicalGraph(resolved, {maxSteps: result.metrics.steps - 1})).toThrowError(expect.objectContaining({category: "resource-limit"}));
  });

  it.each(["required-prohibition", "new-attribute", "wildcard-widening", "wildcard-weakening"])("diagnoses %s explicitly", async name => {
    const graph = await load(name);
    expect(() => composeCanonicalGraph(resolveCanonicalGraph(graph))).toThrowError(expect.objectContaining({category: "invalid-schema", source: expect.objectContaining({path: expect.any(String)})}));
  });

  it("retains oracle disagreements as unresolved legality obligations without scalar coercion", async () => {
    const fixed = composeCanonicalGraph(resolveCanonicalGraph(await load("fixed-restriction")));
    expect(view(fixed, "Derived").obligations).toContainEqual(expect.objectContaining({kind: "fixed-value-equivalence", base: expect.objectContaining({lexical: expect.objectContaining({value: "1"})}), local: expect.objectContaining({lexical: expect.objectContaining({value: "+01"})})}));
    const grouped = composeCanonicalGraph(resolveCanonicalGraph(await load("group-local-wildcard")));
    expect(view(grouped, "D").wildcard?.processContents).toEqual({kind: "assessment-required", alternatives: ["lax", "strict"]});
    expect(view(grouped, "D").assessment).toBe("requires-schema-assessment");
    const nested = composeCanonicalGraph(resolveCanonicalGraph(await load("nested-group-wildcard")));
    expect(view(nested, "D").wildcard?.processContents).toEqual({kind: "assessment-required", alternatives: ["lax", "strict"]});
    expect(view(nested, "D").obligations).toContainEqual(expect.objectContaining({kind: "group-local-wildcard-process", owner: globalId("attributeGroup", {namespace: "urn:composition", local: "G"})}));
  });

  it("round trips declared catalogs and recomputes deterministic bounded composition", async () => {
    const graph = await load(), resolved = resolveCanonicalGraph(graph), result = composeCanonicalGraph(resolved);
    const read = readCatalog(serializeSemanticCatalog(createSemanticCatalog(graph)), {mode: "faithful"});
    if (read.kind !== "semantic") throw Error("semantic");
    const semantics = (t: ComposedType) => ({id: t.id, content: t.content.map(c => c.kind === "particle" ? c : {kind: c.kind, name: "name" in c.reference ? c.reference.name : undefined}), attributes: t.attributes.map(a => ({name: a.name, use: a.use}))});
    expect(composeCanonicalGraph(resolveCanonicalGraph(read.catalog.graph)).types.map(semantics)).toEqual(result.types.map(semantics));
    expect(composeCanonicalGraph(resolved, {maxNodes: graph.nodes.length, maxSteps: result.metrics.steps}).metrics.steps).toBe(result.metrics.steps);
    expect(() => composeCanonicalGraph(resolved, {maxSteps: result.metrics.steps - 1})).toThrowError(expect.objectContaining({category: "resource-limit"}));
  });
});
