import {expect, it} from "vitest";
import {mkdtempSync, mkdirSync, rmSync} from "node:fs";
import {join, resolve} from "node:path";
import {createServer} from "node:http";
import {once} from "node:events";
import {pathToFileURL} from "node:url";
import Fastify, {type FastifyPluginAsync} from "fastify";
import type {Client, IOptions, ISecurity} from "soap";
import {runGenerationPipeline} from "../../src/pipeline.js";
import {parseStreamConfig} from "../../src/util/streamConfig.js";
import {readWireElements} from "../helpers/streamWireXml.js";

const fixture = resolve("test/fixtures/wsdl/stream-mapping.wsdl");
const record = '<Record Enabled="1" Rank="7"><Count>42</Count><Total>12.50</Total><Large>9007199254740993</Large><Label Active="false">3.50</Label><BareLabel>4.50</BareLabel><Tag>one</Tag><Nil xsi:nil="true"/><Children><Child Active="true"/></Children></Record>';
const prefix = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><s:Body><ReadResponse xmlns="urn:stream-mapping">';
const suffix = '</ReadResponse></s:Body></s:Envelope>';
async function generate(directory: string, primitive?: {decimalAs: "number"; int64As: "bigint"}) {
  await runGenerationPipeline({wsdl: fixture, catalogOut: join(directory, "client/catalog.json"), clientOutDir: join(directory, "client"),
    compiler: {imports: "js", ...(primitive ? {primitive} : {})},
    streamConfig: parseStreamConfig({operations: {Read: {recordType: "Record", recordPath: ["ReadResponse", "Record"]}}})});
  return await import(pathToFileURL(join(directory, "client/client.ts")).href) as {
    StreamMapping: new (options: {source: string}) => GeneratedClient;
  };
}
interface GeneratedClient {
  soapClient(): Promise<Client>;
  Read(args: {Enabled: boolean}, options?: {signal?: AbortSignal; timeoutMs?: number}): Promise<{records: AsyncIterable<unknown>}>;
  fromSoapResult(value: unknown, type: string): unknown;
}

it("maps configured numeric and bigint policies including object-form simple content", async () => {
  mkdirSync("tmp/conformance", {recursive: true});
  const directory = mkdtempSync(resolve("tmp/conformance/stream-scalar-policy-"));
  try {
    const {StreamMapping} = await generate(directory, {decimalAs: "number", int64As: "bigint"});
    const client = new StreamMapping({source: fixture});
    expect(client.fromSoapResult({attributes: {Enabled: "1", Rank: "7"}, Count: "42", Total: "12.50", Large: "9007199254740993", Label: {attributes: {Active: "0"}, $value: "3.50"}, BareLabel: "4.50", Tag: "one", Nil: null}, "Record"))
      .toEqual({Enabled: true, Rank: 7, Count: 42, Total: 12.5, Large: 9007199254740993n, Label: {Active: false, $value: 3.5}, BareLabel: {$value: 4.5}, Tag: ["one"], Nil: null});
  } finally { rmSync(directory, {recursive: true, force: true}); }
});

it.each([ ["ndjson", true], ["ndjson", false], ["json-array", true], ["json-array", false] ] as const)(
  "maps generated %s records incrementally with flattenArrayWrappers=%s and honors client endpoint/security", async (format, flatten) => {
    mkdirSync("tmp/conformance", {recursive: true});
    const directory = mkdtempSync(resolve("tmp/conformance/stream-mapped-"));
    let finishResponse = () => {};
    const finished = new Promise<void>(resolve => { finishResponse = resolve; });
    let upstreamEnded = false;
    const received: Array<{xml: string; authorization: string | undefined; action: string | undefined; custom: string | undefined}> = [];
    const server = createServer(async (request, response) => {
      let xml = "";
      for await (const chunk of request) xml += String(chunk);
      received.push({xml, authorization: request.headers.authorization, action: request.headers.soapaction as string | undefined, custom: request.headers["x-owned"] as string | undefined});
      response.setHeader("content-type", "text/xml");
      response.write(prefix + record);
      await finished;
      upstreamEnded = true;
      response.end(record.replace('<Tag>one</Tag>', '<Tag>one</Tag><Tag>two</Tag>') + suffix);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const app = Fastify();
    try {
      await runGenerationPipeline({wsdl: fixture, catalogOut: join(directory, "client/catalog.json"), clientOutDir: join(directory, "client"),
        compiler: {imports: "js"}, streamConfig: parseStreamConfig({operations: {Read: {format, recordType: "Record", recordPath: ["ReadResponse", "Record"]}}}),
        openapi: {outFile: join(directory, "openapi.json"), flattenArrayWrappers: flatten},
        gateway: {outDir: join(directory, "gateway"), serviceSlug: "mapping", versionSlug: "v1"}});
      const {StreamMapping} = await import(pathToFileURL(join(directory, "client/client.ts")).href) as {
        StreamMapping: new (options: {source: string; security?: ISecurity; options?: IOptions}) => GeneratedClient;
      };
      const security: ISecurity = {
        addHeaders(headers) { headers.Authorization = "Bearer owned-test"; },
        toXML() { return '<Owned xmlns="urn:owned">test</Owned>'; },
      };
      const client = new StreamMapping({source: fixture, security});
      const soap = await client.soapClient();
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing owned endpoint");
      soap.setEndpoint(`http://127.0.0.1:${address.port}/owned`);
      soap.addHttpHeader("X-Owned", "yes");
      const plugin = (await import(pathToFileURL(join(directory, "gateway/plugin.ts")).href)).default as FastifyPluginAsync<{client: GeneratedClient}>;
      await app.register(plugin, {client});
      await app.listen({host: "127.0.0.1", port: 0});
      const gatewayAddress = app.server.address();
      if (!gatewayAddress || typeof gatewayAddress === "string") throw new Error("Missing gateway endpoint");
      const response = await fetch(`http://127.0.0.1:${gatewayAddress.port}/read`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({Enabled: true, Options: {Active: false}, RequestLabel: {Active: true, $value: "5.25"}})});
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let body = "";
      while (!body.includes('"Count":42')) {
        const next = await reader.read();
        if (next.done) break;
        body += decoder.decode(next.value, {stream: true});
      }
      expect(body).toContain('"Count":42');
      expect(upstreamEnded).toBe(false);
      finishResponse();
      while (true) { const next = await reader.read(); if (next.done) break; body += decoder.decode(next.value, {stream: true}); }
      const records: unknown[] = format === "ndjson" ? body.trim().split("\n").map(line => JSON.parse(line) as unknown) : JSON.parse(body) as unknown[];
      const expected = {Enabled: true, Rank: 7, Count: 42, Total: "12.50", Large: "9007199254740993", Label: {Active: false, $value: "3.50"}, BareLabel: {$value: "4.50"}, Tag: ["one"], Nil: null, Children: flatten ? [{Active: true}] : {Child: [{Active: true}]}};
      expect(records).toEqual([expected, {...expected, Tag: ["one", "two"]}]);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({authorization: "Bearer owned-test", custom: "yes", action: '"urn:stream-mapping:read"'});
      const wire = readWireElements(received[0].xml);
      expect(wire.find(tag => tag.name === "{urn:stream-mapping}Read")?.attributes).toEqual({"{}Enabled": "true"});
      expect(wire.find(tag => tag.name === "{urn:stream-mapping}Options")).toMatchObject({attributes: {"{}Active": "false"}, text: ""});
      expect(wire.find(tag => tag.name === "{urn:stream-mapping}RequestLabel")).toMatchObject({attributes: {"{}Active": "true"}, text: "5.25"});
      expect(wire.find(tag => tag.name === "{urn:owned}Owned")?.text).toBe("test");
      expect(wire.some(tag => tag.name.endsWith("}Enabled"))).toBe(false);
    } finally {
      finishResponse();
      await app.close();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      rmSync(directory, {recursive: true, force: true});
    }
  }, 30_000);
