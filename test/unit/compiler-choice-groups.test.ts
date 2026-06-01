import {afterAll, describe, expect, it} from "vitest";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {compileCatalog, type CompiledCatalog} from "../../src/compiler/schemaCompiler.js";
import {resolveCompilerOptions} from "../../src/config.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";
import {buildChoiceWsdl} from "../helpers/choiceWsdl.js";

const tmpRoot = mkdtempSync(join(tmpdir(), "wsdl-choice-groups-"));

afterAll(() => {
  rmSync(tmpRoot, {recursive: true, force: true});
});

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
    const compiled = await compileFromFixture(buildChoiceWsdl(schema), "choice-metadata");
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
