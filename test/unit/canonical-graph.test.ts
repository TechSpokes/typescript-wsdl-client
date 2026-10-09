import path from "node:path";
import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {loadSchemaInput} from "../../src/loader/schemaInput.js";
import {buildCanonicalGraph} from "../../src/compiler/buildCanonicalGraph.js";
import {globalId, GraphError} from "../../src/compiler/canonicalGraph.js";
import type {CanonicalGraph, GraphNode, ParticleNode, ComplexTypeNode, SimpleTypeNode, ElementNode} from "../../src/compiler/canonicalGraph.js";
import {XSD_NAMESPACE} from "../../src/loader/orderedSyntax.js";

const fixtures = path.resolve("test/conformance/fixtures");
const graph = async (file = "xsd/graph/shared-recursive.xsd") => buildCanonicalGraph(await loadSchemaInput(path.join(fixtures, file), {policy: {fileRoots: [fixtures]}}));
const node = <T extends GraphNode>(g: CanonicalGraph, id: string) => g.nodes.find(n => n.id === id)! as T;
const symbol = (role: "type" | "element" | "attribute" | "group", local: string, namespace = "urn:graph") => globalId(role, {namespace, local});
async function fromXml(body: string, options?: {maxNodes?: number}) {
  const uri = "https://graph.test/input.xsd", bytes = Buffer.from(`<xs:schema xmlns:xs="${XSD_NAMESPACE}" xmlns:t="urn:test" targetNamespace="urn:test">${body}</xs:schema>`);
  const input = await loadSchemaInput(uri, {policy: {allowedOrigins: ["https://graph.test"]}, offlineResources: new Map([[uri, {bytes, digest: createHash("sha256").update(bytes).digest("hex")}]])});
  return buildCanonicalGraph(input, options);
}

describe("canonical graph contract", () => {
  it("keeps shared definitions, recursion, local bounds and semantic child order independent", async () => {
    const g = await graph(), shared = node<ComplexTypeNode>(g, symbol("type", "Shared"));
    const sequence = node<ParticleNode>(g, shared.content!);
    expect(sequence.term.kind).toBe("sequence");
    if (sequence.term.kind !== "sequence") throw Error("sequence");
    const children = sequence.term.children.map(id => node<ParticleNode>(g, id));
    expect(children.map(n => n.term.kind)).toEqual(["group", "choice", "group", "element", "element"]);
    expect(children[0].occurs).toEqual({min: "0", max: "2"});
    expect(children[2].occurs).toEqual({min: "3", max: "900719925474099312345678901234567890"});
    for (const p of [children[0], children[2]]) {
      expect(p.term).toMatchObject({kind: "group", reference: {target: symbol("group", "Pair")}});
    }
    expect(children[3].term).toMatchObject({kind: "element", declaration: {target: symbol("element", "Shared")}});
    expect(node<ElementNode>(g, symbol("element", "Shared")).type).toMatchObject({target: shared.id});
    expect(g.nodes.filter(n => n.id === symbol("group", "Pair"))).toHaveLength(1);
    expect(shared.attributes).toHaveLength(2);
    expect(Object.isFrozen(g)).toBe(true);
    expect(Object.isFrozen(children[0].occurs)).toBe(true);
    expect(() => Reflect.set(children[0].occurs, "min", "8")).not.toThrow();
    expect(children[0].occurs.min).toBe("0");
  });

  it("distinguishes namespaces, symbol roles, scoped declarations and anonymous types", async () => {
    const g = await graph();
    expect(new Set([symbol("type", "Shared"), symbol("element", "Shared"), symbol("attribute", "Shared")]).size).toBe(3);
    const locals = g.nodes.filter((n): n is ElementNode => n.kind === "element" && n.name.local === "local");
    expect(locals).toHaveLength(2);
    expect(new Set(locals.map(n => n.id)).size).toBe(2);
    expect(locals.map(n => n.name.namespace)).toEqual(["urn:graph", "urn:graph"]);
    expect(g.nodes.some(n => n.kind === "element" && n.name.local === "inline" && n.name.namespace === "")).toBe(true);
    expect(g.nodes.filter(n => n.kind === "complexType" && n.identity.kind === "scoped")).toHaveLength(1);
    expect(g.nodes.every(n => n.kind !== "attribute" || n.identity.kind !== "scoped" || n.name.namespace === "")).toBe(true);
    const cham = await graph("xsd/graph/chameleon.wsdl");
    expect(cham.globals).toHaveLength(4);
    for (const ns of ["urn:graph:a", "urn:graph:b"]) {
      const declaration = node<ElementNode>(cham, symbol("element", "node", ns));
      expect(declaration.type).toMatchObject({kind: "symbol", name: {namespace: ns, local: "Node"}, target: symbol("type", "Node", ns), lexical: {value: "Node", context: {namespaces: {"": ""}, chameleon: true}}});
    }
  });

  it("preserves scalar/base/facet/default/fixed lexical values, namespaces and derivation edges", async () => {
    const g = await graph(), exact = node<SimpleTypeNode>(g, symbol("type", "Exact"));
    expect(exact.variety).toMatchObject({kind: "restriction", base: {kind: "builtin", name: {local: "decimal"}}, facets: [{name: "pattern", lexical: {value: "[+]0[0-9][.][0-9]{2}"}}, {name: "minInclusive", lexical: {value: "+01.00"}, fixed: true}, {name: "fractionDigits"}]});
    expect(node<SimpleTypeNode>(g, symbol("type", "Names")).variety).toMatchObject({facets: [{lexical: {value: "q:Name", context: {namespaces: {q: "urn:rebound"}}}}]});
    expect(node(g, symbol("attribute", "Shared"))).toMatchObject({value: {kind: "default", lexical: {value: "q:Default", context: {namespaces: {q: "urn:qname"}}}}});
    expect(node<ComplexTypeNode>(g, symbol("type", "Extended")).derivation).toMatchObject({kind: "extension", contentKind: "complex", base: {target: symbol("type", "Shared")}});
    expect(node<ComplexTypeNode>(g, symbol("type", "Restricted")).derivation).toMatchObject({kind: "restriction", contentKind: "simple", facets: [{lexical: {value: "[+]01[.]00"}}]});
    expect(node<SimpleTypeNode>(g, symbol("type", "Alternatives")).variety).toMatchObject({kind: "union", members: [{target: symbol("type", "Exact")}, {name: {local: "string"}}, {kind: "local"}]});
    expect(g.nodes.some(n => n.kind === "attribute" && n.value?.lexical.value === "007")).toBe(true);
  });

  it("reuses independent ordered syntax and SOAP/baseline fixtures", async () => {
    for (const file of ["xsd/syntax/ordered-namespaces.xsd", "xsd/syntax/default-namespaces.xsd", "soap/content-model/probe.wsdl", "xsd/compositors/content-model-boundaries.wsdl", "xsd/imports/import-relative-types.wsdl"]) {
      const g = await graph(file);
      expect(g.nodes.length).toBeGreaterThan(0);
      if (file.includes("syntax")) {
        const first = node<ComplexTypeNode>(g, symbol("type", "First", "urn:syntax"));
        expect(node<ParticleNode>(g, first.content!).context.baseUri).toContain("schemas/nested/");
        const annotation = g.schemaAnnotations[0];
        expect(annotation.children[0].kind).toBe("element");
        if (annotation.children[0].kind !== "element") throw Error("appinfo");
        expect(annotation.children[0].children.map(c => c.kind)).toEqual(["text", "element", "text"]);
        expect(annotation.children[0].children[1]).toMatchObject({attributes: [{name: {namespace: "", local: "plain"}}, {name: {namespace: "urn:one", local: "code"}}]});
      }
      if (file.includes("probe.wsdl")) expect(g.nodes.some(n => n.kind === "wsdl" && n.role === "binding" && n.references.some(r => r.reference.kind === "symbol" && r.reference.role === "portType" && r.reference.target))).toBe(true);
    }
  });

  it("keeps unresolved references explicit and unsupported constraints retained for downstream assessment", async () => {
    const g = await fromXml('<xs:element name="root" type="t:Missing"><xs:key name="key"><xs:selector xpath="x"/><xs:field xpath="@id"/></xs:key></xs:element>');
    expect(g.nodes[0]).toMatchObject({kind: "element", type: {kind: "symbol", name: {local: "Missing"}}, retained: [{name: {local: "key"}}]});
    expect((g.nodes[0] as ElementNode).type).not.toHaveProperty("target");
  });

  it("retains unsupported syntax at schema/type/wrapper boundaries and models inline scalar restriction", async () => {
    const g = await fromXml('<xs:notation name="N" public="urn:n"/><xs:redefine schemaLocation="other.xsd"/><xs:simpleType name="S"><xs:restriction base="xs:string"/><xs:assert test="true()"/></xs:simpleType><xs:complexType name="T"><xs:simpleContent><xs:restriction base="t:S"><xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType></xs:restriction><xs:assert test="true()"/></xs:simpleContent></xs:complexType><xs:simpleType name="L"><xs:list itemType="xs:string"><xs:minLength value="1"/></xs:list></xs:simpleType>');
    expect(g.schemaRetained.map(r => r.syntax.name.local)).toEqual(["notation", "redefine"]);
    expect(node(g, symbol("type", "S", "urn:test"))).toMatchObject({retained: [{name: {local: "assert"}}]});
    const t = node<ComplexTypeNode>(g, symbol("type", "T", "urn:test"));
    expect(t).toMatchObject({retained: [{name: {local: "assert"}}], derivation: {inlineType: {kind: "local"}}});
    if (t.derivation?.inlineType?.kind !== "local") throw Error("inline restriction");
    expect(node(g, t.derivation.inlineType.target).kind).toBe("simpleType");
    expect(node(g, symbol("type", "L", "urn:test"))).toMatchObject({retained: [{name: {local: "minLength"}}]});
    const extension = await fromXml('<xs:complexType name="T"><xs:simpleContent><xs:extension base="xs:string"><xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType></xs:extension></xs:simpleContent></xs:complexType>');
    expect(extension.nodes[0]).toMatchObject({retained: [{name: {local: "simpleType"}}], syntaxDetails: [{name: {local: "simpleContent"}}]});
    const facet = await fromXml('<xs:simpleType name="S"><xs:restriction base="xs:string" vendor="kept"><xs:pattern value="a"><extra xmlns="urn:vendor">text</extra></xs:pattern></xs:restriction></xs:simpleType>');
    expect(facet.nodes[0]).toMatchObject({variety: {facets: [{syntax: {children: [{name: {local: "extra"}, children: [{value: "text"}]}]}}]}, syntaxDetails: [{attributes: [{value: "xs:string"}, {value: "kept"}]}]});
    const padded = await fromXml('<xs:element name="  e  "/>');
    expect(padded.nodes[0]).toMatchObject({name: {local: "e"}, declaredAttributes: [{value: "  e  "}]});
    const prototype = await fromXml('<xs:constructor name="Ghost"/><xs:__proto__ name="Ghost"/><xs:toString name="Ghost"/>');
    expect(prototype.nodes).toHaveLength(0);
    expect(prototype.schemaRetained.map(r => r.syntax.name.local)).toEqual(["constructor", "__proto__", "toString"]);
  });

  it("rejects invalid structural shapes and exact bounds with source diagnostics", async () => {
    for (const body of [
      '<xs:complexType name="T"><xs:sequence minOccurs="2" maxOccurs="1"/></xs:complexType>',
      '<xs:complexType name="T"><xs:sequence minOccurs="1.5"/></xs:complexType>',
      '<xs:complexType name="T"><xs:all maxOccurs="2"/></xs:complexType>',
      '<xs:complexType name="T"><xs:all><xs:choice/></xs:all></xs:complexType>',
      '<xs:element name="a" default="a" fixed="b"/>',
      '<xs:simpleType name="T"/>',
      '<xs:complexType name="T"><xs:sequence/><xs:choice/></xs:complexType>',
      '<xs:complexType name="T"><xs:element name="direct"/></xs:complexType>',
      '<xs:complexType name="T"><xs:sequence><xs:all/></xs:sequence></xs:complexType>',
      '<xs:complexType name="T"><xs:sequence><xs:element ref="t:a" type="xs:string"/></xs:sequence></xs:complexType>',
      '<xs:element name="a"/><xs:element name="a"/>',
      '<xs:complexType name="T">significant<xs:sequence/></xs:complexType>',
    ]) await expect(fromXml(body)).rejects.toMatchObject({category: "invalid-schema", source: {uri: "https://graph.test/input.xsd"}});
    const g = await fromXml('<xs:complexType name="T"><xs:sequence minOccurs="+000" maxOccurs="0002"/></xs:complexType>');
    expect(g.nodes.find(n => n.kind === "particle")).toMatchObject({occurs: {min: "0", max: "2"}});
  });

  it("enforces an inclusive configurable graph budget before returning a partial graph", async () => {
    const body = '<xs:complexType name="T"><xs:sequence><xs:element name="a" type="xs:string"/></xs:sequence></xs:complexType>';
    expect((await fromXml(body, {maxNodes: 4})).nodes).toHaveLength(4);
    await expect(fromXml(body, {maxNodes: 3})).rejects.toBeInstanceOf(GraphError);
    await expect(fromXml(body, {maxNodes: 3})).rejects.toMatchObject({category: "resource-limit"});
    await expect(fromXml(body, {maxNodes: 0})).rejects.toBeInstanceOf(RangeError);
  });

  it("bounds scoped identity size for deeply nested anonymous declarations", async () => {
    let body = '<xs:element name="leaf" type="xs:string"/>';
    for (let i = 0; i < 60; i++) body = `<xs:element name="n${i}"><xs:complexType><xs:sequence>${body}</xs:sequence></xs:complexType></xs:element>`;
    const g = await fromXml(body);
    expect(g.nodes).toHaveLength(241);
    expect(g.nodes.every(n => n.id.length < 150)).toBe(true);
  });
});
