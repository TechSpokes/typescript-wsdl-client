import {afterAll, describe, expect, it} from "vitest";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {compileCatalog, type CompiledCatalog} from "../../src/compiler/schemaCompiler.js";
import {resolveCompilerOptions} from "../../src/config.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";
import {parseStreamConfig} from "../../src";
import {WsdlCompilationError} from "../../src/util/errors.js";

const tmpRoot = mkdtempSync(join(tmpdir(), "wsdl-wildcards-"));

afterAll(() => {
  rmSync(tmpRoot, {recursive: true, force: true});
});

function buildWsdl(schemaBody: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://example.com/wild"
  xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://example.com/wild">
  <wsdl:types>
    <xs:schema
      xmlns:tns="http://example.com/wild"
      elementFormDefault="qualified"
      targetNamespace="http://example.com/wild">
      ${schemaBody}
    </xs:schema>
  </wsdl:types>
  <wsdl:message name="StreamInput"><wsdl:part name="parameters" element="tns:StreamRequest"/></wsdl:message>
  <wsdl:message name="StreamOutput"><wsdl:part name="parameters" element="tns:StreamResponse"/></wsdl:message>
  <wsdl:portType name="WildPortType">
    <wsdl:operation name="Stream">
      <wsdl:input message="tns:StreamInput"/>
      <wsdl:output message="tns:StreamOutput"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="WildBinding" type="tns:WildPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="Stream">
      <soap:operation soapAction="urn:stream"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="WildService">
    <wsdl:port name="WildPort" binding="tns:WildBinding">
      <soap:address location="http://example.com/wild"/>
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

describe("compiler: wildcard retention", () => {
  it("retains xs:any particles on the enclosing complex type", async () => {
    const schema = `
      <xs:element name="StreamRequest">
        <xs:complexType><xs:sequence><xs:element name="Query" type="xs:string"/></xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="StreamResponse">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="StreamResult">
              <xs:complexType>
                <xs:sequence>
                  <xs:element ref="xs:schema"/>
                  <xs:any minOccurs="1" maxOccurs="1" namespace="##any" processContents="lax"/>
                </xs:sequence>
              </xs:complexType>
            </xs:element>
          </xs:sequence>
        </xs:complexType>
      </xs:element>`;
    const compiled = await compileFromFixture(buildWsdl(schema), "any-particle");

    // The nested StreamResult inline complex type is the one that carries
    // the xs:any particle. It is named after the element it was inlined from.
    const streamResult = compiled.types.find((t) => t.name === "StreamResult");
    expect(streamResult, "StreamResult type must be compiled").toBeTruthy();
    expect(streamResult!.wildcards).toEqual([
      {min: 1, max: 1, namespace: "##any", processContents: "lax"},
    ]);

    // Types that did not declare an xs:any must not sprout a wildcards field;
    // this is what keeps existing catalogs byte-for-byte identical.
    const streamRequest = compiled.types.find((t) => t.name === "StreamRequest");
    expect(streamRequest, "StreamRequest type must be compiled").toBeTruthy();
    expect(streamRequest!.wildcards).toBeUndefined();
  });

  it("retains multiple wildcards when a type declares more than one", async () => {
    const schema = `
      <xs:element name="StreamRequest">
        <xs:complexType><xs:sequence><xs:element name="Q" type="xs:string"/></xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="StreamResponse">
        <xs:complexType>
          <xs:sequence>
            <xs:any minOccurs="0" maxOccurs="unbounded"/>
            <xs:any minOccurs="0" maxOccurs="1" namespace="##other"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>`;
    const compiled = await compileFromFixture(buildWsdl(schema), "multi-wildcards");
    const streamResponse = compiled.types.find((t) => t.name === "StreamResponse");
    expect(streamResponse!.wildcards).toHaveLength(2);
    expect(streamResponse!.wildcards![0]).toMatchObject({min: 0, max: "unbounded"});
    expect(streamResponse!.wildcards![1]).toMatchObject({min: 0, max: 1, namespace: "##other"});
  });

  it("attaches stream metadata from the stream config to matching operations", async () => {
    const schema = `
      <xs:element name="StreamRequest">
        <xs:complexType><xs:sequence><xs:element name="Q" type="xs:string"/></xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="StreamResponse">
        <xs:complexType><xs:sequence><xs:any minOccurs="1" maxOccurs="1"/></xs:sequence></xs:complexType>
      </xs:element>`;
    const wsdl = buildWsdl(schema);
    const wsdlPath = join(tmpRoot, `stream-meta.wsdl`);
    writeFileSync(wsdlPath, wsdl, "utf8");
    const wsdlCatalog = await loadWsdl(wsdlPath);
    const streamConfig = parseStreamConfig({
      operations: {
        Stream: {
          recordType: "StreamRecord",
          recordPath: ["StreamResponse", "Records", "Record"],
        },
      },
    });
    const compiled = compileCatalog(
      wsdlCatalog,
      resolveCompilerOptions({}, {wsdl: wsdlPath, out: tmpRoot}),
      streamConfig,
    );
    const op = compiled.operations.find((o) => o.name === "Stream");
    expect(op, "Stream operation must be present").toBeTruthy();
    expect(op!.stream).toMatchObject({
      mode: "stream",
      format: "ndjson",
      mediaType: "application/x-ndjson",
      recordTypeName: "StreamRecord",
      recordPath: ["StreamResponse", "Records", "Record"],
      sourceOutputTypeName: "StreamResponse",
    });
  });

  it("rejects a stream config that references an unknown operation", async () => {
    const schema = `
      <xs:element name="StreamRequest">
        <xs:complexType><xs:sequence><xs:element name="Q" type="xs:string"/></xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="StreamResponse">
        <xs:complexType><xs:sequence><xs:any/></xs:sequence></xs:complexType>
      </xs:element>`;
    const wsdl = buildWsdl(schema);
    const wsdlPath = join(tmpRoot, `stream-unknown-op.wsdl`);
    writeFileSync(wsdlPath, wsdl, "utf8");
    const wsdlCatalog = await loadWsdl(wsdlPath);
    const streamConfig = parseStreamConfig({
      operations: {
        NonExistent: {
          recordType: "Foo",
          recordPath: ["a"],
        },
      },
    });
    expect(() =>
      compileCatalog(
        wsdlCatalog,
        resolveCompilerOptions({}, {wsdl: wsdlPath, out: tmpRoot}),
        streamConfig,
      ),
    ).toThrow(WsdlCompilationError);
  });
});
