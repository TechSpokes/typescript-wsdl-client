import path from "node:path";
import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {globalId} from "../../src/compiler/canonicalGraph.js";
import {analyzeOccurrences} from "../../src/compiler/occurrenceAnalysis.js";
import type {OccurrenceAnalysis} from "../../src/compiler/occurrenceAnalysis.js";
import {assessSchemaProfile} from "../../src/compiler/assessSchemaProfile.js";
import type {OperationAssessment} from "../../src/compiler/assessSchemaProfile.js";
import {prepareResolvedCompilationInput} from "../../src/compiler/semanticCatalog.js";

const ns = "urn:assessment", id = (local: string, role: "type" | "element" = "type") => globalId(role, {namespace: ns, local});
const schema = (body: string) => `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="${ns}" targetNamespace="${ns}" elementFormDefault="qualified">${body}</xs:schema>`;
async function load(body: string): Promise<OccurrenceAnalysis> {
  const source = "https://assessment.test/schema.xsd", bytes = Buffer.from(schema(body));
  const input = await prepareResolvedCompilationInput({kind: "source", source}, {loading: {policy: {allowedOrigins: ["https://assessment.test"]}, offlineResources: new Map([[source, {bytes, digest: createHash("sha256").update(bytes).digest("hex")}]])}});
  if (input.kind !== "semantic") throw Error("semantic");
  const analyzed = analyzeOccurrences(input.composed); if (analyzed.kind !== "analyzed") throw analyzed.diagnostic;
  return analyzed.analysis;
}
const assess = (analysis: OccurrenceAnalysis, local = "T", role: "type" | "element" = "type"): OperationAssessment => {
  const result = assessSchemaProfile(analysis, [{kind: "components", id: local, roots: [id(local, role)]}]);
  if (result.kind !== "assessed") throw Error(JSON.stringify(result)); return result.assessment.operations[0];
};
const element = (name: string, occurs = "") => `<xs:element name="${name}" type="xs:string" ${occurs}/>`;

describe("reachable XSD 1.0 schema assessment", () => {
  it.each([
    ["exact adjacent repeats", `<xs:sequence>${element("a", 'minOccurs="2" maxOccurs="2"')}${element("a", 'minOccurs="3" maxOccurs="3"')}</xs:sequence>`, "supported"],
    ["variable adjacent repeats", `<xs:sequence>${element("a", 'minOccurs="2" maxOccurs="3"')}${element("a")}</xs:sequence>`, "invalid-schema"],
    ["common suffix alternatives", `<xs:choice><xs:sequence>${element("b")}${element("a")}</xs:sequence><xs:sequence>${element("c")}${element("a")}</xs:sequence></xs:choice>`, "supported"],
    ["overlapping alternatives", `<xs:choice>${element("a")}${element("a")}</xs:choice>`, "invalid-schema"],
    ["optional separator", `<xs:sequence>${element("a", 'minOccurs="0"')}${element("separator", 'minOccurs="0"')}${element("a")}</xs:sequence>`, "invalid-schema"],
    ["required separator", `<xs:sequence>${element("a", 'minOccurs="0"')}${element("separator")}${element("a")}</xs:sequence>`, "supported"],
    ["legal all", `<xs:all>${element("a")}${element("b", 'minOccurs="0"')}</xs:all>`, "supported"],
  ])("checks %s without expanding counters", async (_name, content, expected) => {
    expect(assess(await load(`<xs:complexType name="T">${content}</xs:complexType>`)).kind).toBe(expected);
  });

  it("distinguishes group use positions and preserves legal recursive element content", async () => {
    const a = await load(`<xs:group name="G"><xs:sequence>${element("a", 'minOccurs="0"')}</xs:sequence></xs:group><xs:complexType name="T"><xs:sequence><xs:group ref="t:G"/><xs:group ref="t:G"/></xs:sequence></xs:complexType><xs:complexType name="R"><xs:sequence><xs:element name="child" type="t:R" minOccurs="0" maxOccurs="unbounded"/></xs:sequence></xs:complexType>`);
    expect(assess(a).kind).toBe("invalid-schema"); expect(assess(a, "R").kind).toBe("supported");
  });

  it("checks structural element consistency even in unrealizable alternatives", async () => {
    const a = await load(`<xs:complexType name="T"><xs:choice><xs:sequence><xs:element name="a" type="xs:int"/><xs:choice/></xs:sequence>${element("a")}</xs:choice></xs:complexType>`);
    expect(assess(a)).toMatchObject({kind: "invalid-schema", diagnostic: {rule: "cos-element-consistent"}});
  });

  it("checks original syntax and inline scalar component derivation", async () => {
    for (const body of [
      `<xs:simpleType name="T"><xs:restriction base="xs:string" bogus="x"/></xs:simpleType>`,
      `<xs:simpleType name="T"><xs:restriction base="xs:string"><xs:pattern value="a" fixed="true"/></xs:restriction></xs:simpleType>`,
      `<xs:complexType name="T"><xs:complexContent><xs:restriction base="xs:anyType"><xs:minInclusive value="1"/></xs:restriction></xs:complexContent></xs:complexType>`,
      `<xs:complexType name="B"><xs:simpleContent><xs:extension base="xs:string"/></xs:simpleContent></xs:complexType><xs:complexType name="T"><xs:complexContent><xs:restriction base="t:B"><xs:sequence/></xs:restriction></xs:complexContent></xs:complexType>`,
      `<xs:simpleType name="Small"><xs:restriction base="xs:int"><xs:maxInclusive value="10"/></xs:restriction></xs:simpleType><xs:complexType name="B"><xs:simpleContent><xs:extension base="t:Small"/></xs:simpleContent></xs:complexType><xs:complexType name="T"><xs:simpleContent><xs:restriction base="t:B"><xs:simpleType><xs:restriction base="xs:int"/></xs:simpleType></xs:restriction></xs:simpleContent></xs:complexType>`,
    ]) expect(assess(await load(body)).kind).toBe("invalid-schema");
    const a = await load(`<xs:simpleType name="Small"><xs:restriction base="xs:int"><xs:maxInclusive value="10"/></xs:restriction></xs:simpleType><xs:complexType name="B"><xs:simpleContent><xs:extension base="t:Small"/></xs:simpleContent></xs:complexType><xs:complexType name="T"><xs:simpleContent><xs:restriction base="t:B"><xs:simpleType><xs:restriction base="t:Small"/></xs:simpleType></xs:restriction></xs:simpleContent></xs:complexType>`);
    expect(assess(a).kind).toBe("supported");
  });

  it("retains element block constraints in restrictions", async () => {
    const a = await load(`<xs:complexType name="B"><xs:sequence><xs:element name="a" type="xs:string" block="restriction"/></xs:sequence></xs:complexType><xs:complexType name="T"><xs:complexContent><xs:restriction base="t:B"><xs:sequence>${element("a")}</xs:sequence></xs:restriction></xs:complexContent></xs:complexType>`);
    expect(assess(a).kind).toBe("invalid-schema");
  });

  it("preserves effective content identity for empty extensions and opaque anyType legality", async () => {
    for (const empty of ["", "<xs:sequence/>", '<xs:choice minOccurs="0"/>']) {
      const a = await load(`<xs:complexType name="B"><xs:all>${element("a")}</xs:all></xs:complexType><xs:complexType name="T"><xs:complexContent><xs:extension base="t:B">${empty}</xs:extension></xs:complexContent></xs:complexType>`);
      expect(assess(a).kind).toBe("supported");
    }
    const scalar = await load(`<xs:complexType name="B"><xs:simpleContent><xs:extension base="xs:string"/></xs:simpleContent></xs:complexType><xs:complexType name="T"><xs:complexContent><xs:extension base="t:B"><xs:sequence/></xs:extension></xs:complexContent></xs:complexType>`);
    const result = assess(scalar); expect(result.kind).toBe("supported");
    if (result.kind === "supported") expect(result.types.find(t => t.id === id("T"))?.scalar).toMatchObject({primitive: "string"});
    for (const mixed of ["", 'mixed="true"']) {
      const a = await load(`<xs:complexType name="T"><xs:complexContent ${mixed}><xs:extension base="xs:anyType"><xs:sequence>${element("a")}</xs:sequence></xs:extension></xs:complexContent></xs:complexType>`);
      expect(assess(a).kind).toBe("invalid-schema");
    }
  });

  it("omits absent use/particle capabilities while retaining their source-reference gates", async () => {
    for (const content of ['<xs:attribute name="a" type="xs:ID" use="prohibited"/>', '<xs:attribute name="a" type="xs:int" use="prohibited" fixed="bogus"/>', '<xs:sequence><xs:element name="a" type="xs:ID" minOccurs="0" maxOccurs="0"/></xs:sequence>']) {
      expect(assess(await load(`<xs:complexType name="T">${content}</xs:complexType>`)).kind).toBe("supported");
    }
  });

  it.each([
    ["narrow sequence", `<xs:sequence>${element("a")}</xs:sequence>`, "supported"],
    ["missing required", `<xs:sequence>${element("b")}</xs:sequence>`, "invalid-schema"],
    ["reversed", `<xs:sequence>${element("b")}${element("a")}</xs:sequence>`, "invalid-schema"],
    ["wider occurrence", `<xs:sequence>${element("a", 'maxOccurs="2"')}</xs:sequence>`, "invalid-schema"],
  ])("checks restriction: %s", async (_name, content, expected) => {
    const a = await load(`<xs:complexType name="B"><xs:sequence>${element("a")}${element("b", 'minOccurs="0"')}</xs:sequence></xs:complexType><xs:complexType name="T"><xs:complexContent><xs:restriction base="t:B">${content}</xs:restriction></xs:complexContent></xs:complexType>`);
    expect(assess(a).kind).toBe(expected);
  });

  it.each([
    ["decimal alias", "xs:decimal", "1.0", "+01.00"],
    ["boolean alias", "xs:boolean", "true", "1"],
    ["QName context", "xs:QName", "t:value", "q:value"],
    ["list normalization", "t:L", "1 2", "+01   02"],
    ["time midnight", "xs:time", "24:00:00Z", "00:00:00Z"],
  ])("compares schema fixed operands in value space: %s", async (_name, type, base, derived) => {
    const a = await load(`<xs:simpleType name="L"><xs:list itemType="xs:integer"/></xs:simpleType><xs:complexType name="B"><xs:attribute name="a" type="${type}" fixed="${base}"/></xs:complexType><xs:complexType name="T"><xs:complexContent><xs:restriction xmlns:q="${ns}" base="t:B"><xs:attribute name="a" type="${type}" fixed="${derived}"/></xs:restriction></xs:complexContent></xs:complexType>`);
    const result = assess(a); expect(result.kind).toBe("supported");
    if (result.kind === "supported") expect(result.scalars.every(p => p.runtimeOwner === "#184")).toBe(true);
  });

  it.each([
    ["numeric precision", "xs:decimal", '<xs:totalDigits value="3"/><xs:fractionDigits value="4"/>', "invalid-schema"],
    ["empty range", "xs:integer", '<xs:minInclusive value="5"/><xs:maxExclusive value="5"/>', "invalid-schema"],
    ["duplicate facet", "xs:string", '<xs:length value="1"/><xs:length value="1"/>', "invalid-schema"],
    ["illegal boolean facet", "xs:boolean", '<xs:minInclusive value="false"/>', "invalid-schema"],
    ["malformed pattern", "xs:string", '<xs:pattern value="["/>', "invalid-schema"],
    ["invalid range grammar", "xs:string", '<xs:pattern value="[a-b-c]"/>', "invalid-schema"],
    ["unqualified pattern construct", "xs:string", '<xs:pattern value="\\i\\c*"/>', "unsupported-capability"],
    ["approved pattern", "xs:token", '<xs:pattern value="[A-Z]{2,4}"/><xs:enumeration value="AB"/>', "supported"],
    ["exact integer bounds", "xs:integer", '<xs:minInclusive value="900719925474099312345678901234567890"/><xs:maxInclusive value="900719925474099312345678901234567891"/>', "supported"],
  ])("checks scalar facet legality: %s", async (_name, base, facets, expected) => {
    expect(assess(await load(`<xs:simpleType name="T"><xs:restriction base="${base}">${facets}</xs:restriction></xs:simpleType>`)).kind).toBe(expected);
  });

  it("checks decimal scale in totalDigits and retains QName length's XSD exception", async () => {
    const a = await load(`<xs:simpleType name="D"><xs:restriction base="xs:decimal"><xs:totalDigits value="1"/></xs:restriction></xs:simpleType><xs:element name="d" type="t:D" default="0.001"/><xs:simpleType name="Q"><xs:restriction base="xs:QName"><xs:length value="0"/></xs:restriction></xs:simpleType><xs:element name="q" type="t:Q" default="t:a"/>`);
    expect(assess(a, "d", "element").kind).toBe("invalid-schema"); expect(assess(a, "q", "element").kind).toBe("supported");
  });

  it("preserves restricted union members and rejects list-of-list types", async () => {
    const a = await load(`<xs:simpleType name="U"><xs:union memberTypes="xs:integer xs:boolean"/></xs:simpleType><xs:simpleType name="R"><xs:restriction base="t:U"><xs:enumeration value="1"/></xs:restriction></xs:simpleType><xs:simpleType name="T"><xs:union memberTypes="t:R"/></xs:simpleType><xs:element name="e" type="t:T" fixed="2"/><xs:simpleType name="L"><xs:list itemType="xs:string"/></xs:simpleType><xs:simpleType name="LL"><xs:list itemType="t:L"/></xs:simpleType>`);
    expect(assess(a, "e", "element").kind).toBe("invalid-schema"); expect(assess(a, "LL").kind).toBe("invalid-schema");
  });

  it("accepts constrained nested atomic unions as list items and derived union-member attribute types", async () => {
    const a = await load(`<xs:simpleType name="U"><xs:union memberTypes="xs:int xs:string"/></xs:simpleType><xs:simpleType name="R"><xs:restriction base="t:U"><xs:enumeration value="1"/></xs:restriction></xs:simpleType><xs:simpleType name="W"><xs:union memberTypes="t:R xs:boolean"/></xs:simpleType><xs:simpleType name="L"><xs:list itemType="t:W"/></xs:simpleType><xs:simpleType name="Small"><xs:restriction base="xs:int"><xs:maxInclusive value="5"/></xs:restriction></xs:simpleType><xs:complexType name="B"><xs:attribute name="a" type="t:U"/></xs:complexType><xs:complexType name="T"><xs:complexContent><xs:restriction base="t:B"><xs:attribute name="a" type="t:Small"/></xs:restriction></xs:complexContent></xs:complexType>`);
    expect(assess(a, "L").kind).toBe("supported"); expect(assess(a).kind).toBe("supported");
  });

  it("limits support to selected reachable closures and is deterministic and immutable", async () => {
    const a = await load(`<xs:complexType name="T"><xs:sequence>${element("a")}</xs:sequence></xs:complexType><xs:complexType name="Excluded" abstract="true"/>`), before = JSON.stringify(a);
    const selections = [{kind: "components" as const, id: "safe", roots: [id("T")]}, {kind: "components" as const, id: "excluded", roots: [id("Excluded")]}];
    const result = assessSchemaProfile(a, selections);
    expect(result.kind).toBe("assessed");
    if (result.kind === "assessed") {
      expect(result.assessment.operations.map(o => o.kind)).toEqual(["supported", "unsupported-capability"]);
      expect(Object.isFrozen(result.assessment.operations)).toBe(true);
      expect(assessSchemaProfile(a, selections)).toEqual(result);
      const steps = result.assessment.metrics.steps;
      expect(assessSchemaProfile(a, selections, {maxNodes: a.composed.resolved.graph.nodes.length, maxSteps: steps})).toEqual(result);
      const beyond = assessSchemaProfile(a, selections, {maxSteps: steps - 1});
      expect(beyond).toMatchObject({kind: "failure", diagnostic: {category: "resource-limit"}}); expect("assessment" in beyond).toBe(false);
    }
    expect(JSON.stringify(a)).toBe(before);
  });

  it("reassesses S05 original wildcard/fixed operands against the primary rules", async () => {
    const fixtures = path.resolve("test/conformance/fixtures");
    for (const [fixture, expectedMode] of [["group-local-wildcard", "strict"], ["nested-group-wildcard", "strict"]]) {
      const input = await prepareResolvedCompilationInput({kind: "source", source: path.join(fixtures, `xsd/composition/${fixture}.xsd`)}, {loading: {policy: {fileRoots: [fixtures]}}});
      if (input.kind !== "semantic") throw Error("semantic"); const a = analyzeOccurrences(input.composed); if (a.kind !== "analyzed") throw a.diagnostic;
      const result = assessSchemaProfile(a.analysis, [{kind: "components", id: fixture, roots: [globalId("type", {namespace: "urn:composition", local: "D"})]}]);
      expect(result.kind).toBe("assessed");
      if (result.kind === "assessed") {
        const operation = result.assessment.operations[0]; expect(operation.kind).toBe("supported");
        if (operation.kind === "supported") expect(operation.types.find(t => t.id.endsWith('"D"]'))?.wildcard?.processContents).toBe(expectedMode);
      }
    }
  });
});
