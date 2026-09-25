import {afterAll, describe, expect, it} from "vitest";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {generateTypes} from "../../src/client/generateTypes.js";
import {generateSchemas} from "../../src/openapi/generateSchemas.js";
import {compileCatalog, type CompiledCatalog} from "../../src/compiler/schemaCompiler.js";
import {resolveCompilerOptions} from "../../src/config.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";

const tmpParent = join(process.cwd(), "tmp", "conformance");
mkdirSync(tmpParent, {recursive: true});
const tmpRoot = mkdtempSync(join(tmpParent, "compiler-sequence-occurs-"));

afterAll(() => {
  rmSync(tmpRoot, {recursive: true, force: true});
});

function buildWsdl(schemaBody: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://example.com/occurs"
  xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://example.com/occurs">
  <wsdl:types>
    <xs:schema
      xmlns:tns="http://example.com/occurs"
      elementFormDefault="qualified"
      targetNamespace="http://example.com/occurs">
      ${schemaBody}
    </xs:schema>
  </wsdl:types>
  <wsdl:message name="PingInput"><wsdl:part name="parameters" element="tns:PingRequest"/></wsdl:message>
  <wsdl:message name="PingOutput"><wsdl:part name="parameters" element="tns:PingResponse"/></wsdl:message>
  <wsdl:portType name="OccursPortType">
    <wsdl:operation name="Ping">
      <wsdl:input message="tns:PingInput"/>
      <wsdl:output message="tns:PingOutput"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="OccursBinding" type="tns:OccursPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="Ping">
      <soap:operation soapAction="urn:ping"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="OccursService">
    <wsdl:port name="OccursPort" binding="tns:OccursBinding">
      <soap:address location="http://example.com/occurs"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`;
}

async function compileFromFixture(wsdl: string, name: string): Promise<CompiledCatalog> {
  const wsdlPath = join(tmpRoot, `${name}.wsdl`);
  writeFileSync(wsdlPath, wsdl, "utf8");
  const wsdlCatalog = await loadWsdl(wsdlPath);
  return compileCatalog(
    wsdlCatalog,
    resolveCompilerOptions({}, {wsdl: wsdlPath, out: tmpRoot}),
  );
}

describe("compiler: compositor-level minOccurs/maxOccurs", () => {
  it("applies a wrapping xs:sequence's own maxOccurs to its element particles (issue #141)", async () => {
    const schema = `
      <xs:element name="PingRequest" type="xs:string"/>
      <xs:element name="PingResponse">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="addresses">
              <xs:complexType>
                <xs:sequence maxOccurs="2">
                  <xs:element name="address" type="xs:string"/>
                </xs:sequence>
              </xs:complexType>
            </xs:element>
          </xs:sequence>
        </xs:complexType>
      </xs:element>`;
    const compiled = await compileFromFixture(buildWsdl(schema), "sequence-max-2");
    const addresses = compiled.types.find((t) => t.elems.some((e) => e.name === "address"));
    expect(addresses, "type carrying the address particle must be compiled").toBeTruthy();
    const address = addresses!.elems.find((e) => e.name === "address");
    expect(address).toMatchObject({min: 1, max: 2});
  });

  it("multiplies min and max when both the compositor and the element declare occurrence bounds", async () => {
    const schema = `
      <xs:element name="PingRequest" type="xs:string"/>
      <xs:element name="PingResponse">
        <xs:complexType>
          <xs:sequence minOccurs="0">
            <xs:element name="item" type="xs:string" maxOccurs="3"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>`;
    const compiled = await compileFromFixture(buildWsdl(schema), "sequence-min-0-elem-max-3");
    const pingResponse = compiled.types.find((t) => t.name === "PingResponse");
    const item = pingResponse!.elems.find((e) => e.name === "item");
    // outer sequence: {min:0, max:1 (default)} x element: {min:1 (default), max:3} => {min:0, max:3}
    expect(item).toMatchObject({min: 0, max: 3});
  });

  it("propagates unbounded from a nested compositor rather than multiplying it as a number", async () => {
    const schema = `
      <xs:element name="PingRequest" type="xs:string"/>
      <xs:element name="PingResponse">
        <xs:complexType>
          <xs:sequence>
            <xs:sequence maxOccurs="unbounded">
              <xs:element name="row" type="xs:string" minOccurs="0"/>
            </xs:sequence>
          </xs:sequence>
        </xs:complexType>
      </xs:element>`;
    const compiled = await compileFromFixture(buildWsdl(schema), "sequence-unbounded");
    const pingResponse = compiled.types.find((t) => t.name === "PingResponse");
    const row = pingResponse!.elems.find((e) => e.name === "row");
    expect(row).toMatchObject({min: 0, max: "unbounded"});
  });

  it("preserves existing xs:any wildcard bounds", async () => {
    const schema = `
      <xs:element name="PingRequest" type="xs:string"/>
      <xs:element name="PingResponse">
        <xs:complexType>
          <xs:sequence maxOccurs="2">
            <xs:any namespace="##other" processContents="lax"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>`;
    const compiled = await compileFromFixture(buildWsdl(schema), "sequence-wildcard-max-2");
    const pingResponse = compiled.types.find((t) => t.name === "PingResponse");
    expect(pingResponse!.wildcards).toEqual([
      {min: 1, max: 1, namespace: "##other", processContents: "lax"},
    ]);
  });

  it("leaves element occurrence untouched when no compositor declares its own bounds", async () => {
    const schema = `
      <xs:element name="PingRequest" type="xs:string"/>
      <xs:element name="PingResponse">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="ok" type="xs:boolean"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>`;
    const compiled = await compileFromFixture(buildWsdl(schema), "no-compositor-occurs");
    const pingResponse = compiled.types.find((t) => t.name === "PingResponse");
    const ok = pingResponse!.elems.find((e) => e.name === "ok");
    expect(ok).toMatchObject({min: 1, max: 1});
  });
});

describe("sequence occurrence consumer contracts", () => {
  it("generates required and optional arrays from the reusable production-shaped fixture", async () => {
    const wsdl = readFileSync("test/conformance/fixtures/xsd/sequences/sequence-occurrence-wrappers.wsdl", "utf8");
    const compiled = await compileFromFixture(wsdl, "consumer");
    const output = join(tmpRoot, "types.ts");
    generateTypes(output, compiled);
    const source = readFileSync(output, "utf8");
    expect(source).toContain("address: AddressType[];");
    expect(source).toContain("address?: AddressType[];");
    expect(source).toContain("bounded?: string[];");
    expect(source).toContain("unbounded?: string[];");
    const flattened = generateSchemas(compiled, {});
    expect(flattened.Addresses).toMatchObject({type: "array", items: {$ref: "#/components/schemas/AddressType"}});
    const wrapped = generateSchemas(compiled, {flattenArrayWrappers: false});
    expect(wrapped.Addresses).toMatchObject({type: "object", required: ["address"], properties: {address: {type: "array"}}});
    expect(wrapped.OptionalAddresses.required ?? []).not.toContain("address");
    expect(wrapped.OptionalAddresses.properties.address.type).toBe("array");
    expect(wrapped.SubmitOccurrence.required).toEqual(["requestId"]);
  });

  it.each([
    ["finite-product", '<xs:sequence minOccurs="2" maxOccurs="3"><xs:sequence minOccurs="2" maxOccurs="4"><xs:element name="item" type="xs:string" minOccurs="2" maxOccurs="5"/></xs:sequence></xs:sequence>', 8, 60],
    ["choice-boundary", '<xs:sequence minOccurs="0" maxOccurs="5"><xs:choice><xs:sequence minOccurs="0" maxOccurs="3"><xs:element name="item" type="xs:string"/></xs:sequence></xs:choice></xs:sequence>', 1, 1],
    ["all-boundary", '<xs:all minOccurs="0"><xs:element name="item" type="xs:string"/></xs:all>', 1, 1],
    ["all-nested-sequence-legacy", '<xs:all><xs:sequence minOccurs="0" maxOccurs="3"><xs:element name="item" type="xs:string"/></xs:sequence></xs:all>', 1, 1],
    ["disabled-sequence", '<xs:sequence minOccurs="0" maxOccurs="unbounded"><xs:sequence minOccurs="0" maxOccurs="0"><xs:sequence maxOccurs="3"><xs:element name="item" type="xs:string"/></xs:sequence></xs:sequence></xs:sequence>', 1, 1],
    ["disabled-element", '<xs:sequence maxOccurs="unbounded"><xs:element name="item" type="xs:string" minOccurs="0" maxOccurs="0"/></xs:sequence>', 0, 0],
  ] as const)("retains the intended boundary for %s", async (name, body, min, max) => {
    const compiled = await compileFromFixture(buildWsdl(`<xs:element name="PingRequest" type="xs:string"/><xs:element name="PingResponse"><xs:complexType>${body}</xs:complexType></xs:element>`), name);
    expect(compiled.types.find(t => t.name === "PingResponse")?.elems.find(e => e.name === "item")).toMatchObject({min, max});
  });

  it("keeps inline type scope separate and extension locals multiplied once", async () => {
    const compiled = await compileFromFixture(buildWsdl(`
      <xs:element name="PingRequest" type="xs:string"/>
      <xs:complexType name="Base"><xs:sequence maxOccurs="2"><xs:element name="baseItem" type="xs:string"/></xs:sequence></xs:complexType>
      <xs:complexType name="Extended"><xs:complexContent><xs:extension base="tns:Base"><xs:sequence maxOccurs="3">
        <xs:element name="localItem"><xs:complexType><xs:sequence><xs:element name="value" type="xs:string"/></xs:sequence></xs:complexType></xs:element>
      </xs:sequence></xs:extension></xs:complexContent></xs:complexType>
      <xs:element name="PingResponse" type="tns:Extended"/>`), "extension");
    const extended = compiled.types.find(t => t.name === "Extended")!;
    expect(extended.elems.find(e => e.name === "baseItem")).toMatchObject({min: 1, max: 2});
    const local = extended.elems.find(e => e.name === "localItem")!;
    expect(local).toMatchObject({min: 1, max: 3});
    expect(extended.localElems?.find(e => e.name === "localItem")).toMatchObject({min: 1, max: 3});
    expect(compiled.types.find(t => t.name === local.tsType)?.elems).toEqual([
      expect.objectContaining({name: "value", min: 1, max: 1}),
    ]);
  });
});
