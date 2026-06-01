import {afterAll, describe, expect, it} from "vitest";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
import {compileCatalog, type CompiledCatalog} from "../../src/compiler/schemaCompiler.js";
import {generateTypes} from "../../src/client/generateTypes.js";
import {resolveCompilerOptions, type CompilerOptions} from "../../src/config.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";

const require = createRequire(import.meta.url);
const tmpRoot = mkdtempSync(join(tmpdir(), "wsdl-choice-types-"));
let fixtureCounter = 0;

afterAll(() => {
  rmSync(tmpRoot, {recursive: true, force: true});
});

function buildWsdl(schemaBody: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://example.com/choice-types"
  xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://example.com/choice-types">
  <wsdl:types>
    <xs:schema
      xmlns:tns="http://example.com/choice-types"
      elementFormDefault="qualified"
      targetNamespace="http://example.com/choice-types">
      ${schemaBody}
    </xs:schema>
  </wsdl:types>
  <wsdl:message name="SearchInput"><wsdl:part name="parameters" element="tns:SearchRequest"/></wsdl:message>
  <wsdl:message name="SearchOutput"><wsdl:part name="parameters" element="tns:SearchResponse"/></wsdl:message>
  <wsdl:portType name="ChoiceTypePortType">
    <wsdl:operation name="Search">
      <wsdl:input message="tns:SearchInput"/>
      <wsdl:output message="tns:SearchOutput"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="ChoiceTypeBinding" type="tns:ChoiceTypePortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="Search">
      <soap:operation soapAction="urn:search"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="ChoiceTypeService">
    <wsdl:port name="ChoiceTypePort" binding="tns:ChoiceTypeBinding">
      <soap:address location="http://example.com/choice-types"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`;
}

const CHOICE_SCHEMA = `
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
        <xs:element name="email" type="xs:string"/>
        <xs:element name="phone" type="xs:int"/>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>`;

async function compileFixture(choice: CompilerOptions["choice"]): Promise<CompiledCatalog> {
  fixtureCounter += 1;
  const wsdlPath = join(tmpRoot, `choice-${choice}-${fixtureCounter}.wsdl`);
  writeFileSync(wsdlPath, buildWsdl(CHOICE_SCHEMA), "utf8");
  const wsdlCatalog = await loadWsdl(wsdlPath);
  return compileCatalog(
    wsdlCatalog,
    resolveCompilerOptions({choice}, {wsdl: wsdlPath, out: tmpRoot}),
  );
}

async function generateTypesSource(choice: CompilerOptions["choice"], fileName: string): Promise<string> {
  const compiled = await compileFixture(choice);
  const typesFile = join(tmpRoot, fileName);
  generateTypes(typesFile, compiled);
  return readFileSync(typesFile, "utf8");
}

describe("client types: choice union mode", () => {
  it("keeps all-optional mode on the existing interface shape", async () => {
    const source = await generateTypesSource("all-optional", "all-optional-types.ts");

    expect(source).toContain("export interface SearchRequest {");
    expect(source).toContain("tenantId: string;");
    expect(source).toContain("email: string;");
    expect(source).toContain("phone: number;");
    expect(source).not.toContain("SearchRequestChoiceBase");
    expect(source).not.toContain("SearchRequestChoice1");
  });

  it("emits exclusive branch unions in union mode", async () => {
    const source = await generateTypesSource("union", "union-types.ts");

    expect(source).toContain("export type SearchRequest = SearchRequestChoiceBase & SearchRequestChoice1;");
    expect(source).toContain("export interface SearchRequestChoiceBase {");
    expect(source).toContain("export type SearchRequestChoice1 =");
    expect(source).toContain("email: string;");
    expect(source).toContain("phone?: never;");
    expect(source).toContain("phone: number;");
    expect(source).toContain("email?: never;");
  });

  it("makes multi-branch choice payloads fail TypeScript compilation in union mode", async () => {
    const source = await generateTypesSource("union", "types.ts");
    writeFileSync(join(tmpRoot, "types.ts"), source, "utf8");
    writeFileSync(
      join(tmpRoot, "choice-usage.ts"),
      `import type {SearchRequest} from "./types.js";

const emailOnly: SearchRequest = {tenantId: "tenant", email: "team@example.test"};
const phoneOnly: SearchRequest = {tenantId: "tenant", phone: 123};
const noChoice: SearchRequest = {tenantId: "tenant"};

void emailOnly;
void phoneOnly;
void noChoice;

// @ts-expect-error xs:choice union mode rejects payloads with multiple branches.
const invalid: SearchRequest = {tenantId: "tenant", email: "team@example.test", phone: 123};
void invalid;
`,
      "utf8",
    );
    writeFileSync(
      join(tmpRoot, "tsconfig.choice.json"),
      JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            skipLibCheck: true,
            types: [],
          },
          include: ["types.ts", "choice-usage.ts"],
        },
        null,
        2,
      ),
      "utf8",
    );

    execFileSync(
      process.execPath,
      [require.resolve("typescript/bin/tsc"), "-p", join(tmpRoot, "tsconfig.choice.json")],
      {cwd: tmpRoot, stdio: "pipe"},
    );
  });
});
