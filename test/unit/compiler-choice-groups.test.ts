import {afterAll, describe, expect, it} from "vitest";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {compileCatalog, type CompiledCatalog} from "../../src/compiler/schemaCompiler.js";
import {resolveCompilerOptions} from "../../src/config.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";

const tmpRoot = mkdtempSync(join(tmpdir(), "wsdl-choice-groups-"));

afterAll(() => {
  rmSync(tmpRoot, {recursive: true, force: true});
});

function buildWsdl(schemaBody: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://example.com/choice"
  xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://example.com/choice">
  <wsdl:types>
    <xs:schema
      xmlns:tns="http://example.com/choice"
      elementFormDefault="qualified"
      targetNamespace="http://example.com/choice">
      ${schemaBody}
    </xs:schema>
  </wsdl:types>
  <wsdl:message name="SearchInput"><wsdl:part name="parameters" element="tns:SearchRequest"/></wsdl:message>
  <wsdl:message name="SearchOutput"><wsdl:part name="parameters" element="tns:SearchResponse"/></wsdl:message>
  <wsdl:portType name="ChoicePortType">
    <wsdl:operation name="Search">
      <wsdl:input message="tns:SearchInput"/>
      <wsdl:output message="tns:SearchOutput"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="ChoiceBinding" type="tns:ChoicePortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="Search">
      <soap:operation soapAction="urn:search"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="ChoiceService">
    <wsdl:port name="ChoicePort" binding="tns:ChoiceBinding">
      <soap:address location="http://example.com/choice"/>
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

describe("compiler: choice group metadata", () => {
  it("retains xs:choice branch metadata on the enclosing complex type", async () => {
    const schema = `
      <xs:element name="SearchRequest" type="tns:SearchRequest"/>
      <xs:element name="SearchResponse">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="ok" type="xs:boolean"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>
      <xs:complexType name="SearchRequest">
        <xs:sequence>
          <xs:element name="tenantId" type="xs:string"/>
          <xs:choice minOccurs="0" maxOccurs="1">
            <xs:element name="email" type="xs:string" nillable="true">
              <xs:annotation>
                <xs:documentation>Email lookup key.</xs:documentation>
              </xs:annotation>
            </xs:element>
            <xs:element name="phone" type="xs:int" minOccurs="0"/>
          </xs:choice>
        </xs:sequence>
      </xs:complexType>`;
    const compiled = await compileFromFixture(buildWsdl(schema), "choice-metadata");
    const searchRequest = compiled.types.find((t) => t.name === "SearchRequest");

    expect(searchRequest, "SearchRequest type must be compiled").toBeTruthy();
    expect(searchRequest!.elems.map((e) => e.name)).toEqual(["tenantId", "email", "phone"]);
    expect(searchRequest!.choiceGroups).toEqual([
      {
        name: "SearchRequestChoice1",
        min: 0,
        max: 1,
        sourceOrder: 1,
        branches: [
          {
            name: "email",
            tsType: "string",
            min: 1,
            max: 1,
            nillable: true,
            declaredType: "xs:string",
            doc: "Email lookup key.",
            sourceOrder: 0,
          },
          {
            name: "phone",
            tsType: "number",
            min: 0,
            max: 1,
            declaredType: "xs:int",
            sourceOrder: 1,
          },
        ],
      },
    ]);
  });
});
