// noinspection ES6PreferShortImport,HttpUrlsUsage,JSVoidFunctionReturnValueUsed

import {afterAll, describe, expect, it, vi} from "vitest";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {resolveCompilerOptions} from "../../src/config.js";
import {compileCatalog, type CompiledCatalog} from "../../src/compiler/schemaCompiler.js";
import {generateOperations} from "../../src/client/generateOperations.js";
import {generateTypes} from "../../src/client/generateTypes.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";
import {generateOpenAPI} from "../../src/openapi/generateOpenAPI.js";
import {reportCompilationStats} from "../../src/util/cli.js";

const tmpRoot = mkdtempSync(join(tmpdir(), "wsdl-simple-type-collision-"));
const wsdlPath = join(tmpRoot, "enum.wsdl");
let fixtureCounter = 0;

const TEST_WSDL = `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://example.com/enum"
  xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://example.com/enum">
  <wsdl:types>
    <xs:schema
      xmlns:tns="http://example.com/enum"
      elementFormDefault="qualified"
      targetNamespace="http://example.com/enum">
      <xs:simpleType name="MyEnum">
        <xs:annotation>
          <xs:appinfo>
            <ActualType xmlns="http://schemas.microsoft.com/2003/10/Serialization/" Name="unsignedByte" Namespace="http://www.w3.org/2001/XMLSchema"/>
          </xs:appinfo>
        </xs:annotation>
        <xs:restriction base="xs:string">
          <xs:enumeration value="Red"/>
          <xs:enumeration value="Green"/>
          <xs:enumeration value="Blue"/>
        </xs:restriction>
      </xs:simpleType>
      <xs:element name="MyEnum" nillable="true" type="tns:MyEnum"/>
    </xs:schema>
  </wsdl:types>
  <wsdl:message name="EchoInput">
    <wsdl:part name="parameters" element="tns:MyEnum"/>
  </wsdl:message>
  <wsdl:message name="EchoOutput">
    <wsdl:part name="parameters" element="tns:MyEnum"/>
  </wsdl:message>
  <wsdl:portType name="EnumPortType">
    <wsdl:operation name="Echo">
      <wsdl:input message="tns:EchoInput"/>
      <wsdl:output message="tns:EchoOutput"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="EnumBinding" type="tns:EnumPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="Echo">
      <soap:operation soapAction="urn:echo"/>
      <wsdl:input>
        <soap:body use="literal"/>
      </wsdl:input>
      <wsdl:output>
        <soap:body use="literal"/>
      </wsdl:output>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="EnumService">
    <wsdl:port name="EnumPort" binding="tns:EnumBinding">
      <soap:address location="http://example.com/enum"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`;

writeFileSync(wsdlPath, TEST_WSDL, "utf8");

afterAll(() => {
  rmSync(tmpRoot, {recursive: true, force: true});
});

async function compileTestWsdl(): Promise<CompiledCatalog> {
  const wsdlCatalog = await loadWsdl(wsdlPath);
  return compileCatalog(
    wsdlCatalog,
    resolveCompilerOptions(
      {},
      {
        wsdl: wsdlPath,
        out: tmpRoot,
      }
    )
  );
}

function buildWsdl(schemaBody: string, elementName: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://example.com/variants"
  xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://example.com/variants">
  <wsdl:types>
    <xs:schema
      xmlns:tns="http://example.com/variants"
      elementFormDefault="qualified"
      targetNamespace="http://example.com/variants">
      ${schemaBody}
    </xs:schema>
  </wsdl:types>
  <wsdl:message name="EchoInput">
    <wsdl:part name="parameters" element="tns:${elementName}"/>
  </wsdl:message>
  <wsdl:message name="EchoOutput">
    <wsdl:part name="parameters" element="tns:${elementName}"/>
  </wsdl:message>
  <wsdl:portType name="VariantPortType">
    <wsdl:operation name="Echo">
      <wsdl:input message="tns:EchoInput"/>
      <wsdl:output message="tns:EchoOutput"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="VariantBinding" type="tns:VariantPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="Echo">
      <soap:operation soapAction="urn:echo"/>
      <wsdl:input>
        <soap:body use="literal"/>
      </wsdl:input>
      <wsdl:output>
        <soap:body use="literal"/>
      </wsdl:output>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="VariantService">
    <wsdl:port name="VariantPort" binding="tns:VariantBinding">
      <soap:address location="http://example.com/variants"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`;
}

async function compileVariant(schemaBody: string, elementName: string): Promise<CompiledCatalog> {
  const variantPath = join(tmpRoot, `variant-${++fixtureCounter}.wsdl`);
  writeFileSync(variantPath, buildWsdl(schemaBody, elementName), "utf8");
  const wsdlCatalog = await loadWsdl(variantPath);
  return compileCatalog(
    wsdlCatalog,
    resolveCompilerOptions(
      {},
      {
        wsdl: variantPath,
        out: tmpRoot,
      }
    )
  );
}

describe("same-name simpleType and global element", () => {
  it("uses the simple type alias without emitting a duplicate wrapper interface", async () => {
    const compiled = await compileTestWsdl();

    expect(compiled.aliases.map(a => a.name)).toContain("MyEnum");
    expect(compiled.types.map(t => t.name)).not.toContain("MyEnum");
    expect(compiled.operations[0].inputTypeName).toBe("MyEnum");
    expect(compiled.operations[0].outputTypeName).toBe("MyEnum");
    expect(compiled.diagnostics?.notes).toContain(
      "Element {http://example.com/enum}MyEnum reuses same-name simple type alias MyEnum instead of emitting a wrapper interface."
    );

    const typesFile = join(tmpRoot, "types.ts");
    const operationsFile = join(tmpRoot, "operations.ts");
    generateTypes(typesFile, compiled);
    generateOperations(operationsFile, compiled);

    const typesSource = readFileSync(typesFile, "utf8");
    expect(typesSource).toContain('export type MyEnum = "Red" | "Green" | "Blue";');
    expect(typesSource).not.toContain("export interface MyEnum");
    expect(typesSource).not.toContain("extends MyEnum");

    const operationsSource = readFileSync(operationsFile, "utf8");
    expect(operationsSource).toContain("args: MyEnum");
    expect(operationsSource).toContain("response: MyEnum");

    const {doc} = await generateOpenAPI({
      compiledCatalog: compiled,
      skipValidate: true,
    });
    expect(doc.components.schemas.MyEnum).toEqual({
      type: "string",
      enum: ["Red", "Green", "Blue"],
    });
    expect(doc.paths["/echo"].post.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/MyEnum",
    });
    expect(doc.components.schemas.MyEnumResponseEnvelope.allOf[1].properties.data.anyOf[0]).toEqual({
      $ref: "#/components/schemas/MyEnum",
    });
  });

  it("reuses same-name primitive simple type aliases", async () => {
    const compiled = await compileVariant(
      `<xs:simpleType name="AccountCode">
        <xs:restriction base="xs:string"/>
      </xs:simpleType>
      <xs:element name="AccountCode" type="tns:AccountCode"/>`,
      "AccountCode"
    );

    expect(compiled.aliases.find(a => a.name === "AccountCode")?.tsType).toBe("string");
    expect(compiled.types.map(t => t.name)).not.toContain("AccountCode");
    expect(compiled.operations[0].inputTypeName).toBe("AccountCode");
    expect(compiled.diagnostics?.notes).toContain(
      "Element {http://example.com/variants}AccountCode reuses same-name simple type alias AccountCode instead of emitting a wrapper interface."
    );
  });

  it("reports same-name simple type reuse as an informational compilation note", async () => {
    const compiled = await compileTestWsdl();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      reportCompilationStats({schemas: [{}]}, compiled);
      expect(logSpy).toHaveBeenCalledWith(
        "Note: Element {http://example.com/enum}MyEnum reuses same-name simple type alias MyEnum instead of emitting a wrapper interface."
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it("reuses same-name list simple type aliases", async () => {
    const compiled = await compileVariant(
      `<xs:simpleType name="CodeList">
        <xs:list itemType="xs:string"/>
      </xs:simpleType>
      <xs:element name="CodeList" type="tns:CodeList"/>`,
      "CodeList"
    );

    expect(compiled.aliases.find(a => a.name === "CodeList")?.tsType).toBe("string[]");
    expect(compiled.types.map(t => t.name)).not.toContain("CodeList");
    expect(compiled.operations[0].outputTypeName).toBe("CodeList");
  });

  it("keeps different-name simple type elements as wrapper surface types", async () => {
    const compiled = await compileVariant(
      `<xs:simpleType name="MyEnum">
        <xs:restriction base="xs:string">
          <xs:enumeration value="Red"/>
          <xs:enumeration value="Green"/>
        </xs:restriction>
      </xs:simpleType>
      <xs:element name="FavoriteColor" type="tns:MyEnum"/>`,
      "FavoriteColor"
    );

    expect(compiled.aliases.map(a => a.name)).toContain("MyEnum");
    expect(compiled.types.map(t => t.name)).toContain("FavoriteColor");
    expect(compiled.diagnostics?.notes ?? []).toEqual([]);

    const typesFile = join(tmpRoot, "different-name-types.ts");
    generateTypes(typesFile, compiled);
    const typesSource = readFileSync(typesFile, "utf8");
    expect(typesSource).toContain('export type MyEnum = "Red" | "Green";');
    expect(typesSource).toContain("export interface FavoriteColor");
    expect(typesSource).toContain("$value?: MyEnum;");
  });

  it("keeps same-name complex type elements as complex interfaces", async () => {
    const compiled = await compileVariant(
      `<xs:complexType name="Thing">
        <xs:sequence>
          <xs:element name="Name" type="xs:string"/>
        </xs:sequence>
      </xs:complexType>
      <xs:element name="Thing" type="tns:Thing"/>`,
      "Thing"
    );

    expect(compiled.aliases.map(a => a.name)).not.toContain("Thing");
    expect(compiled.types.map(t => t.name)).toContain("Thing");
    expect(compiled.diagnostics?.notes ?? []).toEqual([]);

    const typesFile = join(tmpRoot, "complex-types.ts");
    generateTypes(typesFile, compiled);
    const typesSource = readFileSync(typesFile, "utf8");
    expect(typesSource.match(/export interface Thing/g)?.length).toBe(1);
    expect(typesSource).toContain("Name: string;");
  });

  it("defensively ignores legacy self-wrappers when generating from an old catalog", async () => {
    const compiled = await compileTestWsdl();
    const legacyCompiled: CompiledCatalog = {
      ...compiled,
      types: [
        ...compiled.types,
        {
          name: "MyEnum",
          ns: "http://example.com/enum",
          attrs: [],
          elems: [
            {
              name: "$value",
              tsType: "MyEnum",
              min: 0,
              max: 1,
              nillable: false,
              declaredType: "{http://example.com/enum}MyEnum",
            },
          ],
        },
      ],
    };

    const typesFile = join(tmpRoot, "legacy-types.ts");
    generateTypes(typesFile, legacyCompiled);

    const typesSource = readFileSync(typesFile, "utf8");
    expect(typesSource).toContain('export type MyEnum = "Red" | "Green" | "Blue";');
    expect(typesSource).not.toContain("export interface MyEnum");

    const {doc} = await generateOpenAPI({
      compiledCatalog: legacyCompiled,
      skipValidate: true,
    });
    expect(doc.components.schemas.MyEnum).toEqual({
      type: "string",
      enum: ["Red", "Green", "Blue"],
    });
  });
});
