import {expect, it} from "vitest";
import {mkdirSync, mkdtempSync, rmSync} from "node:fs";
import {join, resolve} from "node:path";
import {createServer} from "node:http";
import {once} from "node:events";
import {pathToFileURL} from "node:url";
import type {Client, IOptions, ISecurity} from "soap";
import {runGenerationPipeline} from "../../src/pipeline.js";
import {parseStreamConfig} from "../../src/util/streamConfig.js";
import {readWireElements} from "../helpers/streamWireXml.js";

const fixture = resolve("test/fixtures/wsdl/stream-request-namespaces.wsdl");
interface GeneratedClient {
  soapClient(): Promise<Client>;
  Read(args: object): Promise<{records?: AsyncIterable<unknown>; response?: unknown}>;
}
interface MethodDescriptor {soapAction: string; input: Record<string, unknown>}
interface PortDescriptor {location: string; binding: {methods: Record<string, MethodDescriptor>}}

it("matches buffered SOAP request QNames and honors envelopeKey throughout security post-processing", async () => {
  mkdirSync("tmp/conformance", {recursive: true});
  const directory = mkdtempSync(resolve("tmp/conformance/stream-request-wire-"));
  const requests: string[] = [];
  const keys: string[] = [];
  const server = createServer(async (request, response) => {
    let xml = "";
    for await (const chunk of request) xml += String(chunk);
    requests.push(xml);
    response.setHeader("content-type", "text/xml");
    response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><tns:ReadResponse xmlns:tns="urn:stream-request"><Record><Value>ok</Value></Record></tns:ReadResponse></s:Body></s:Envelope>');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing owned endpoint");
    const endpoint = `http://127.0.0.1:${address.port}/read`;
    for (const streaming of [false, true]) {
      const outDir = join(directory, streaming ? "stream" : "buffered");
      await runGenerationPipeline({wsdl: fixture, catalogOut: join(outDir, "catalog.json"), clientOutDir: outDir,
        compiler: {imports: "js"}, ...(streaming ? {streamConfig: parseStreamConfig({operations: {Read: {recordType: "Record", recordPath: ["ReadResponse", "Record"]}}})} : {})});
      const {RequestNamespaces} = await import(pathToFileURL(join(outDir, "client.ts")).href) as {
        RequestNamespaces: new (options: {source: string; options: IOptions; security: ISecurity}) => GeneratedClient;
      };
      const security: ISecurity = {
        toXML: () => "",
        postProcess(xml: string, key: string) {
          keys.push(key);
          return xml.replace(`</${key}:Header>`, `<proof:Token xmlns:proof="urn:proof">owned</proof:Token></${key}:Header>`);
        },
      };
      const client = new RequestNamespaces({source: fixture, options: {envelopeKey: "custom", disableCache: true}, security});
      const soap = await client.soapClient();
      soap.setEndpoint(endpoint);
      soap.wsdl.xmlnsInHeader = 'xmlns:trace="urn:trace"';
      soap.addSoapHeader("<trace:Trace>metadata</trace:Trace>");
      const result = await client.Read({Enabled: true, Local: "A&B", Foreign: "foreign", Nested: {Active: false, LocalCode: "local"}});
      if (result.records) { for await (const record of result.records) expect(record).toEqual({Value: "ok"}); }
    }
    expect(requests).toHaveLength(2);
    expect(readWireElements(requests[1])).toEqual(readWireElements(requests[0]));
    expect(readWireElements(requests[1]).map(tag => tag.name)).toEqual([
      "{http://schemas.xmlsoap.org/soap/envelope/}Envelope", "{http://schemas.xmlsoap.org/soap/envelope/}Header", "{urn:trace}Trace", "{urn:proof}Token",
      "{http://schemas.xmlsoap.org/soap/envelope/}Body", "{urn:stream-request}Read", "{}Local", "{urn:stream-request:foreign}Foreign", "{}Nested", "{}LocalCode",
    ]);
    expect(keys).toEqual(["custom", "custom"]);
    expect(readWireElements(requests[1]).find(tag => tag.name === "{}Local")?.text).toBe("A&B");
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, {recursive: true, force: true});
  }
}, 30_000);

it("refuses missing or incompatible ambiguous operation bindings before sending a stream request", async () => {
  mkdirSync("tmp/conformance", {recursive: true});
  const directory = mkdtempSync(resolve("tmp/conformance/stream-request-binding-"));
  try {
    await runGenerationPipeline({wsdl: fixture, catalogOut: join(directory, "catalog.json"), clientOutDir: directory,
      compiler: {imports: "js"}, streamConfig: parseStreamConfig({operations: {Read: {recordType: "Record", recordPath: ["ReadResponse", "Record"]}}})});
    const {RequestNamespaces} = await import(pathToFileURL(join(directory, "client.ts")).href) as {
      RequestNamespaces: new (options: {source: string; options: IOptions}) => GeneratedClient;
    };
    const client = new RequestNamespaces({source: fixture, options: {disableCache: true}});
    const soap = await client.soapClient();
    const services = (soap.wsdl.definitions as unknown as {services: Record<string, {ports: Record<string, PortDescriptor>}>}).services;
    const ports = services.RequestNamespaces.ports;
    const original = ports.RequestPort;
    ports.RequestPort = {...original, binding: {...original.binding, methods: {Read: {...original.binding.methods.Read, soapAction: "urn:wrong"}}}};
    await expect(client.Read({})).rejects.toThrow(/matching.*binding|binding.*match/i);
    ports.RequestPort = original;
    ports.Ambiguous = {...original, binding: {...original.binding, methods: {Read: {...original.binding.methods.Read, input: {...original.binding.methods.Read.input, $name: "Other"}}}}};
    await expect(client.Read({})).rejects.toThrow(/ambiguous|incompatible/i);
  } finally { rmSync(directory, {recursive: true, force: true}); }
}, 30_000);
