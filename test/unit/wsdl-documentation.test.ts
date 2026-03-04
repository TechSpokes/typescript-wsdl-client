import {afterAll, describe, expect, it} from "vitest";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {resolveCompilerOptions} from "../../src/config.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";
import {compileCatalog} from "../../src/compiler/schemaCompiler.js";
import {generateCatalog} from "../../src/compiler/generateCatalog.js";
import {generateClient} from "../../src/client/generateClient.js";
import {generateTypes} from "../../src/client/generateTypes.js";
import {generateOperations} from "../../src/client/generateOperations.js";
import {generateOpenAPI} from "../../src/openapi/generateOpenAPI.js";
import {generateGateway} from "../../src/gateway/generateGateway.js";

const tmpRoot = mkdtempSync(join(tmpdir(), "wsdl-docs-"));
const wsdlPath = join(tmpRoot, "docs.wsdl");

const TEST_WSDL = `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions
  xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://example.com/docs"
  targetNamespace="http://example.com/docs">
  <wsdl:types>
    <xs:schema targetNamespace="http://example.com/docs" elementFormDefault="qualified">
      <xs:element name="GetThing">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="id" type="xs:string">
              <xs:annotation>
                <xs:documentation>Identifier field.</xs:documentation>
              </xs:annotation>
            </xs:element>
          </xs:sequence>
        </xs:complexType>
      </xs:element>
      <xs:element name="GetThingResponse">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="result" type="tns:Thing"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>
      <xs:complexType name="Thing">
        <xs:annotation>
          <xs:documentation>Thing payload.</xs:documentation>
        </xs:annotation>
        <xs:sequence>
          <xs:element name="name" type="xs:string">
            <xs:annotation>
              <xs:documentation>Display name.</xs:documentation>
            </xs:annotation>
          </xs:element>
        </xs:sequence>
      </xs:complexType>
    </xs:schema>
  </wsdl:types>
  <wsdl:message name="GetThingRequestMessage">
    <wsdl:documentation>Request wrapper message.</wsdl:documentation>
    <wsdl:part name="parameters" element="tns:GetThing">
      <wsdl:documentation>Request parameters part.</wsdl:documentation>
    </wsdl:part>
  </wsdl:message>
  <wsdl:message name="GetThingResponseMessage">
    <wsdl:documentation>Response wrapper message.</wsdl:documentation>
    <wsdl:part name="parameters" element="tns:GetThingResponse">
      <wsdl:documentation>Response parameters part.</wsdl:documentation>
    </wsdl:part>
  </wsdl:message>
  <wsdl:portType name="DemoPortType">
    <wsdl:operation name="GetThing">
      <wsdl:documentation>Gets a thing. Returns details.</wsdl:documentation>
      <wsdl:input message="tns:GetThingRequestMessage"/>
      <wsdl:output message="tns:GetThingResponseMessage"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="DemoBinding" type="tns:DemoPortType">
    <wsdl:documentation>SOAP binding for demo service.</wsdl:documentation>
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <wsdl:operation name="GetThing">
      <soap:operation soapAction="urn:GetThing" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="DemoService">
    <wsdl:documentation>Demo service entrypoint.</wsdl:documentation>
    <wsdl:port name="DemoPort" binding="tns:DemoBinding">
      <wsdl:documentation>Primary SOAP port.</wsdl:documentation>
      <soap:address location="http://example.com/service"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`;

writeFileSync(wsdlPath, TEST_WSDL, "utf8");

afterAll(() => {
  rmSync(tmpRoot, {recursive: true, force: true});
});

describe("WSDL/XSD documentation propagation", () => {
  it("preserves docs in catalog and propagates them to client and OpenAPI outputs", async () => {
    const wsdlCatalog = await loadWsdl(wsdlPath);
    const compiled = compileCatalog(
      wsdlCatalog,
      resolveCompilerOptions(
        {},
        {
          wsdl: wsdlPath,
          out: tmpRoot,
        }
      )
    );

    const op = compiled.operations.find(o => o.name === "GetThing");
    expect(op?.doc).toBe("Gets a thing. Returns details.");

    const thingType = compiled.types.find(t => t.name === "Thing");
    expect(thingType?.doc).toBe("Thing payload.");
    expect(thingType?.elems.find(e => e.name === "name")?.doc).toBe("Display name.");

    expect(compiled.wsdlDocs?.bindings?.find(b => b.name === "DemoBinding")?.doc).toBe("SOAP binding for demo service.");
    expect(compiled.wsdlDocs?.messages?.find(m => m.name === "GetThingRequestMessage")?.doc).toBe("Request wrapper message.");
    expect(compiled.wsdlDocs?.messages?.find(m => m.name === "GetThingRequestMessage")?.parts?.find(p => p.name === "parameters")?.doc).toBe("Request parameters part.");
    expect(compiled.wsdlDocs?.services?.find(s => s.name === "DemoService")?.doc).toBe("Demo service entrypoint.");
    expect(compiled.wsdlDocs?.services?.find(s => s.name === "DemoService")?.ports?.find(p => p.name === "DemoPort")?.doc).toBe("Primary SOAP port.");

    const catalogFile = join(tmpRoot, "catalog.json");
    const clientFile = join(tmpRoot, "client.ts");
    const typesFile = join(tmpRoot, "types.ts");
    const operationsFile = join(tmpRoot, "operations.ts");
    const openapiFile = join(tmpRoot, "openapi.json");
    const opsFile = join(tmpRoot, "ops.json");
    const summaryOverrideOpsFile = join(tmpRoot, "ops-summary.json");
    const gatewayDir = join(tmpRoot, "gateway");

    generateCatalog(catalogFile, compiled);
    generateClient(clientFile, compiled);
    generateTypes(typesFile, compiled);
    generateOperations(operationsFile, compiled);
    writeFileSync(
      opsFile,
      JSON.stringify(
        {
          GetThing: {
            description: "Override operation description.",
          },
        },
        null,
        2
      ),
      "utf8"
    );
    const {doc} = await generateOpenAPI({
      compiledCatalog: compiled,
      outFile: openapiFile,
      format: "json",
      opsFile,
      skipValidate: true,
    });

    const catalogJson = JSON.parse(readFileSync(catalogFile, "utf8"));
    expect(catalogJson.operations[0].doc).toBe("Gets a thing. Returns details.");
    expect(catalogJson.wsdlDocs.bindings[0].doc).toBe("SOAP binding for demo service.");
    expect(catalogJson.wsdlDocs.messages[0].parts[0].doc).toBe("Request parameters part.");
    expect(catalogJson.wsdlDocs.services[0].ports[0].doc).toBe("Primary SOAP port.");

    const typesSource = readFileSync(typesFile, "utf8");
    expect(typesSource).toContain("* Thing payload.");
    expect(typesSource).toContain("* Display name.");
    expect(typesSource).toContain("@xsd");

    const operationsSource = readFileSync(operationsFile, "utf8");
    expect(operationsSource).toContain("* Gets a thing. Returns details.");

    const clientSource = readFileSync(clientFile, "utf8");
    expect(clientSource).toContain("* Gets a thing. Returns details.");

    expect(doc.paths["/get-thing"].post.summary).toBe("Gets a thing.");
    expect(doc.paths["/get-thing"].post.description).toBe("Override operation description.");
    expect(doc.components.schemas.Thing.description).toBe("Thing payload.");
    expect(doc.components.schemas.Thing.properties.name.description).toBe("Display name.");

    writeFileSync(
      summaryOverrideOpsFile,
      JSON.stringify(
        {
          GetThing: {
            summary: "Explicit summary override.",
          },
        },
        null,
        2
      ),
      "utf8"
    );

    const summaryDoc = await generateOpenAPI({
      compiledCatalog: compiled,
      opsFile: summaryOverrideOpsFile,
      skipValidate: true,
    });
    expect(summaryDoc.doc.paths["/get-thing"].post.summary).toBe("Explicit summary override.");
    expect(summaryDoc.doc.paths["/get-thing"].post.description).toBe("Gets a thing. Returns details.");

    await generateGateway({
      openapiDocument: doc,
      outDir: gatewayDir,
      versionSlug: "v1",
      serviceSlug: "demo",
      catalogFile,
    });
    const routeSource = readFileSync(join(gatewayDir, "routes", "getthing.ts"), "utf8");
    expect(routeSource).toContain("* Summary: Gets a thing.");
    expect(routeSource).toContain("* Description: Override operation description.");
  });
});
