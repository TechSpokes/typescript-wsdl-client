import {afterAll, describe, expect, it} from "vitest";
import {mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {createServer} from "node:http";
import {once} from "node:events";
import {pathToFileURL} from "node:url";
import Fastify, {type FastifyPluginAsync} from "fastify";
import {XMLParser} from "fast-xml-parser";
import {runGenerationPipeline} from "../../src/pipeline.js";
import {generateClient} from "../../src/client/generateClient.js";
import {generateOperations} from "../../src/client/generateOperations.js";
import {generateTypes} from "../../src/client/generateTypes.js";
import {generateUtils} from "../../src/client/generateUtils.js";
import {compileCatalog, type CompiledCatalog} from "../../src/compiler/schemaCompiler.js";
import {readLegacyCatalogFile} from "../../src/compiler/semanticCatalog.js";
import {applyShapeCatalogs, parseStreamConfig} from "../../src/index.js";
import {resolveCompilerOptions} from "../../src/config.js";
import {loadWsdl, type WsdlCatalog} from "../../src/loader/wsdlLoader.js";
import {generateOpenAPI} from "../../src/openapi/generateOpenAPI.js";

const fixtureRoot = join(process.cwd(), "test/conformance/fixtures/xsd/types/scoped-identities");
const parent = join(process.cwd(), "tmp/conformance");
mkdirSync(parent, {recursive: true});
const root = mkdtempSync(join(parent, "wsdl-scoped-artifacts-"));
afterAll(() => rmSync(root, {recursive: true, force: true}));

async function compileSource(wsdlPath: string): Promise<CompiledCatalog> {
  const source = await loadWsdl(wsdlPath);
  return compileCatalog(source, resolveCompilerOptions({}, {wsdl: wsdlPath, out: root}));
}

function emitArtifacts(catalog: CompiledCatalog, directory: string): Record<string, string> {
  mkdirSync(directory, {recursive: true});
  const generators = [
    ["client.ts", generateClient],
    ["operations.ts", generateOperations],
    ["types.ts", generateTypes],
    ["utils.ts", generateUtils],
  ] as const;
  return Object.fromEntries(generators.map(([file, generate]) => {
    const destination = join(directory, file);
    generate(destination, catalog);
    return [file, readFileSync(destination, "utf8")];
  }));
}

function addMainServiceType(source: WsdlCatalog): WsdlCatalog {
  const catalog = structuredClone(source);
  const schema = catalog.schemas[0];
  const rawTypes = schema.xml["xs:complexType"];
  const types = (Array.isArray(rawTypes) ? rawTypes : [rawTypes]) as Array<Record<string, unknown>>;
  const fooBar = types.find(type => type["@_name"] === "FooBar");
  if (!fooBar) throw new Error("Missing FooBar source declaration");
  const serviceType = structuredClone(fooBar);
  serviceType["@_name"] = "Service";
  const sequence = serviceType["xs:sequence"] as Record<string, unknown>;
  const only = sequence["xs:element"] as Record<string, unknown>;
  only["@_name"] = "MainOnly";
  types.push(serviceType);
  schema.xml["xs:complexType"] = types;
  return catalog;
}

function compileCatalogSource(source: WsdlCatalog, wsdlPath: string): CompiledCatalog {
  return compileCatalog(source, resolveCompilerOptions({}, {wsdl: wsdlPath, out: root}));
}

describe("scoped compiler artifacts and companion boundaries", () => {
  it("keeps request and response declarations distinct through generated gateway and SOAP wire", async () => {
    const wsdl = join(fixtureRoot, "wire.wsdl");
    const dir = join(root, "wire");
    await runGenerationPipeline({wsdl, catalogOut: join(dir, "client/catalog.json"), clientOutDir: join(dir, "client"),
      openapi: {outFile: join(dir, "openapi.json"), flattenArrayWrappers: false},
      gateway: {outDir: join(dir, "gateway"), serviceSlug: "scoped-wire", versionSlug: "v1"},
    });
    const received: string[] = [];
    const actions: string[] = [];
    const server = createServer(async (request, response) => {
      let xml = "";
      for await (const chunk of request) xml += String(chunk);
      received.push(xml);
      actions.push(String(request.headers.soapaction));
      response.setHeader("content-type", "text/xml; charset=utf-8");
      response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ReadResponse xmlns="urn:scoped-wire"><Entry Code="right"><RightOnly>received</RightOnly></Entry></ReadResponse></s:Body></s:Envelope>');
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const app = Fastify();
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing owned SOAP endpoint");
      const generated = await import(pathToFileURL(join(dir, "client/client.ts")).href) as {
        ScopedWire: new (options: {source: string}) => {soapClient(): Promise<{setEndpoint(endpoint: string): void}>};
      };
      const client = new generated.ScopedWire({source: wsdl});
      (await client.soapClient()).setEndpoint(`http://127.0.0.1:${address.port}/scoped`);
      const plugin = await import(pathToFileURL(join(dir, "gateway/plugin.ts")).href) as {default: FastifyPluginAsync<{client: unknown}>};
      await app.register(plugin.default, {client});
      const result = await app.inject({method: "POST", url: "/read", payload: {Entry: {Code: "left", LeftOnly: "sent"}}});
      expect(result.statusCode, result.body).toBe(200);
      expect(result.json()).toMatchObject({status: "SUCCESS", data: {Entry: {Code: "right", RightOnly: "received"}}});
      expect(actions).toEqual(['"urn:scoped-wire:read"']);
      const parser = new XMLParser({ignoreAttributes: false, removeNSPrefix: true});
      const parsed: unknown = parser.parse(received[0]);
      expect(parsed).toMatchObject({Envelope: {Body: {ReadRequest: {Entry: {"@_Code": "left", LeftOnly: "sent"}}}}});
      expect(received[0]).not.toContain("RightOnly");
      const invalid = await app.inject({method: "POST", url: "/read", payload: {Entry: {Code: "left", RightOnly: "wrong owner"}}});
      expect(invalid.statusCode).toBe(400);
      expect(received).toHaveLength(1);
    } finally {
      await app.close();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("preserves owner-specific collision identities through catalog serialization and emitters", async () => {
    const wsdlPath = join(fixtureRoot, "left-first.wsdl");
    const direct = await compileSource(wsdlPath);
    const left = direct.types.find(type => type.name === "Left");
    const right = direct.types.find(type => type.name === "Right");
    const leftEntry = left?.elems.find(element => element.name === "Entry");
    const rightEntry = right?.elems.find(element => element.name === "Entry");
    expect(leftEntry).toBeDefined();
    expect(rightEntry).toBeDefined();
    expect(leftEntry!.tsType).not.toBe(rightEntry!.tsType);

    const catalogFile = join(root, "scoped-catalog.json");
    writeFileSync(catalogFile, JSON.stringify(direct), "utf8");
    const restored = readLegacyCatalogFile(catalogFile);
    const directArtifacts = emitArtifacts(direct, join(root, "direct"));
    const restoredArtifacts = emitArtifacts(restored, join(root, "restored"));

    expect(restored.types.map(type => type.name)).toEqual(direct.types.map(type => type.name));
    expect(restoredArtifacts).toEqual(directArtifacts);
    expect(directArtifacts["types.ts"]).toContain(`export interface ${leftEntry!.tsType}`);
    expect(directArtifacts["types.ts"]).toContain(`export interface ${rightEntry!.tsType}`);
    expect(directArtifacts["types.ts"]).toContain("LeftOnly");
    expect(directArtifacts["types.ts"]).toContain("RightOnly");

    const directOpenApi = await generateOpenAPI({compiledCatalog: direct, skipValidate: true});
    const restoredOpenApi = await generateOpenAPI({catalogFile, skipValidate: true});
    expect(directOpenApi.doc.components.schemas[leftEntry!.tsType]).toBeDefined();
    expect(directOpenApi.doc.components.schemas[rightEntry!.tsType]).toBeDefined();
    expect(directOpenApi.doc.components.schemas[leftEntry!.tsType].properties.LeftOnly).toBeDefined();
    expect(directOpenApi.doc.components.schemas[rightEntry!.tsType].properties.RightOnly).toBeDefined();
    expect(restoredOpenApi.doc).toEqual(directOpenApi.doc);

    const oldCatalog: CompiledCatalog = {...direct, wsdlUri: "unavailable-original.wsdl", operations: [], aliases: [],
      types: [{name: "Entry", ns: "urn:old", attrs: [], elems: [
        {name: "LeftOnly", tsType: "string", declaredType: "xs:string", min: 1, max: 1},
        {name: "RightOnly", tsType: "string", declaredType: "xs:string", min: 1, max: 1},
      ]}], meta: {attrSpec: {}, attrType: {}, childType: {}, propMeta: {}},
    };
    const oldFile = join(root, "old-merged-catalog.json");
    writeFileSync(oldFile, JSON.stringify(oldCatalog), "utf8");
    expect(readLegacyCatalogFile(oldFile).types).toEqual(oldCatalog.types);
  });

  it("keeps same-local Service conflicts conservative for companion WSDL and catalog sources", async () => {
    const mainWsdlPath = join(fixtureRoot, "left-first.wsdl");
    const mainSource = addMainServiceType(await loadWsdl(mainWsdlPath));
    const companionPath = join(fixtureRoot, "service-companion.wsdl");
    const companion = await compileSource(companionPath);
    const companionCatalogFile = join(root, "service-companion-catalog.json");
    writeFileSync(companionCatalogFile, JSON.stringify(companion), "utf8");

    const cases = [
      {shape: {wsdlSource: "service-companion.wsdl"}, baseDir: fixtureRoot},
      {shape: {catalogFile: companionCatalogFile}, baseDir: root},
    ] as const;
    for (const testCase of cases) {
      const main = compileCatalogSource(mainSource, mainWsdlPath);
      const config = parseStreamConfig({
        shapeCatalogs: {companion: testCase.shape},
        operations: {Read: {format: "json-array", recordType: "Service", recordPath: ["Service"], shapeCatalog: "companion"}},
      });

      await expect(applyShapeCatalogs(main, config, {baseDir: testCase.baseDir}))
        .rejects.toThrow(/type "Service" that conflicts structurally/);
      expect(main.types.find(type => type.name === "Service")?.elems.map(element => element.name)).toEqual(["MainOnly"]);
    }
  });

  it("copies corrected anonymous companion shapes without merging service dispatch", async () => {
    const mainPath = join(fixtureRoot, "left-first.wsdl");
    const mainSource = addMainServiceType(await loadWsdl(mainPath));
    const companionPath = join(fixtureRoot, "service-companion.wsdl");
    const companion = await compileSource(companionPath);
    const companionFile = join(root, "corrected-companion.json");
    writeFileSync(companionFile, JSON.stringify(companion), "utf8");
    const record = companion.types.find(type => type.name === "FirstOwner")!;
    const childName = record.elems[0].tsType;
    expect(childName).not.toBe("Service");
    const cases = [{wsdlSource: companionPath}, {catalogFile: companionFile}];
    for (const [index, shape] of cases.entries()) {
      const config = parseStreamConfig({shapeCatalogs: {companion: shape}, operations: {
        Read: {recordType: "FirstOwner", recordPath: ["Records", "Record"],
          format: index === 0 ? "ndjson" : "json-array", shapeCatalog: "companion"},
      }});
      const main = compileCatalog(mainSource, resolveCompilerOptions({}, {wsdl: mainPath, out: root}), config);
      const operations = structuredClone(main.operations);
      const serviceName = main.serviceName;
      await applyShapeCatalogs(main, config);
      expect(main.operations).toEqual(operations);
      expect(main.serviceName).toBe(serviceName);
      expect(main.types.find(type => type.name === "Service")?.elems.map(element => element.name)).toEqual(["MainOnly"]);
      expect(main.types.find(type => type.name === childName)?.elems.map(element => element.name)).toEqual(["FirstOnly"]);
      expect(main.meta.childType.FirstOwner.Service).toBe(childName);
      expect(main.types.some(type => type.name === "SecondOwner")).toBe(false);
      const artifacts = emitArtifacts(main, join(root, `stream-${index}`));
      expect(artifacts["client.ts"]).toContain("StreamOperationResponse<T.FirstOwner");
      const openapi = await generateOpenAPI({compiledCatalog: main, skipValidate: true});
      expect(openapi.doc.components.schemas[childName].properties.FirstOnly).toBeDefined();
    }
  });
});
