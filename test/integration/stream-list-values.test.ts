import {expect, it} from "vitest";
import {mkdirSync, mkdtempSync, rmSync} from "node:fs";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {createServer} from "node:http";
import {once} from "node:events";
import type {Client} from "soap";
import {runGenerationPipeline} from "../../src/pipeline.js";
import {parseStreamConfig} from "../../src/util/streamConfig.js";
import {readLegacyCatalogFile} from "../../src/compiler/semanticCatalog.js";
import {generateClient} from "../../src/client/generateClient.js";

const fixture = resolve("test/fixtures/wsdl/stream-mapping.wsdl");
interface GeneratedClient {
  soapClient(): Promise<Client>;
  Read(args: object): Promise<{records: AsyncIterable<unknown>}>;
  fromSoapResult(value: unknown, type: string): unknown;
}
async function generate(directory: string, recordType: string) {
  await runGenerationPipeline({wsdl: fixture, catalogOut: join(directory, "catalog.json"), clientOutDir: directory,
    compiler: {imports: "js"}, streamConfig: parseStreamConfig({operations: {Read: {recordType, recordPath: ["ReadResponse", "Record"]}}})});
  const catalog = readLegacyCatalogFile(join(directory, "catalog.json"));
  catalog.aliases.push({name: "ListAliasChain", ns: "urn:stream-mapping", tsType: "WordList", declared: "{urn:stream-mapping}WordList"});
  generateClient(join(directory, "client.ts"), catalog);
  return (await import(pathToFileURL(join(directory, "client.ts")).href) as {
    StreamMapping: new (options: {source: string}) => GeneratedClient;
  }).StreamMapping;
}
async function collect(records: AsyncIterable<unknown>): Promise<unknown[]> {
  const values: unknown[] = [];
  for await (const value of records) values.push(value);
  return values;
}

it("maps XML list aliases, inline lists and repeated list elements without changing the parser bag contract", async () => {
  mkdirSync("tmp/conformance", {recursive: true});
  const directory = mkdtempSync(resolve("tmp/conformance/stream-list-values-"));
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Consume the owned request. */ }
    response.setHeader("content-type", "text/xml");
    response.end('<ReadResponse><Record><Words> alpha\t beta\n gamma </Words><Numbers>1 2</Numbers><Flags>true 0 1 false</Flags><EmptyList/>' +
      '<InlineList>3 4</InlineList><RepeatedList>5 6</RepeatedList><RepeatedList>7</RepeatedList><RepeatedInlineList>8 9</RepeatedInlineList><RepeatedInlineList/>' +
      '<EnumList>1 2</EnumList><ListContent Flags="1 false">red blue</ListContent><Success/><EmptyString/><EmptyContent/></Record>' +
      '<Record><RepeatedList>10 11</RepeatedList><RepeatedInlineList>12 13</RepeatedInlineList></Record></ReadResponse>');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const Constructor = await generate(directory, "Record");
    const client = new Constructor({source: fixture});
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing owned endpoint");
    (await client.soapClient()).setEndpoint(`http://127.0.0.1:${address.port}/lists`);
    expect(await collect((await client.Read({})).records)).toEqual([
      {Words: ["alpha", "beta", "gamma"], Numbers: [1, 2], Flags: [true, false, true, false], EmptyList: [], InlineList: [3, 4],
        RepeatedList: [[5, 6], [7]], RepeatedInlineList: [[8, 9], []], EnumList: ["1", "2"],
        ListContent: {Flags: [true, false], $value: ["red", "blue"]}, Success: {}, EmptyString: "", EmptyContent: {$value: ""}},
      {RepeatedList: [[10, 11]], RepeatedInlineList: [[12, 13]]},
    ]);
    expect(client.fromSoapResult("one two", "ListAliasChain")).toEqual(["one", "two"]);
    expect(client.fromSoapResult("9007199254740993 -4", "bigint[]")).toEqual([9007199254740993n, -4n]);
    expect(client.fromSoapResult(["1", "2"], "NumberList")).toEqual([1, 2]);
    expect(client.fromSoapResult("", "Empty")).toEqual({});
    expect(client.fromSoapResult("unexpected", "Empty")).toBe("unexpected");
    expect(client.fromSoapResult("", "string")).toBe("");
    expect(client.fromSoapResult("", "TextContent")).toEqual({$value: ""});
    expect(() => client.fromSoapResult("true invalid", "BooleanList")).toThrow(/boolean/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, {recursive: true, force: true});
  }
}, 30_000);

it("maps an empty complex stream record to an object", async () => {
  mkdirSync("tmp/conformance", {recursive: true});
  const directory = mkdtempSync(resolve("tmp/conformance/stream-empty-record-"));
  const server = createServer((request, response) => {request.resume(); response.end("<ReadResponse><Record/></ReadResponse>");});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const Constructor = await generate(directory, "Empty");
    const client = new Constructor({source: fixture});
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing owned endpoint");
    (await client.soapClient()).setEndpoint(`http://127.0.0.1:${address.port}/empty`);
    expect(await collect((await client.Read({})).records)).toEqual([{}]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, {recursive: true, force: true});
  }
});

it("preserves buffered empty-object DTOs while keeping explicitly nullable complex children null", async () => {
  mkdirSync("tmp/conformance", {recursive: true});
  const directory = mkdtempSync(resolve("tmp/conformance/buffered-empty-object-"));
  const server = createServer((request, response) => {
    request.resume();
    response.setHeader("content-type", "text/xml");
    response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ReadResponse xmlns="urn:stream-mapping">' +
      '<Record><Success/><NilEmpty xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/></Record></ReadResponse></s:Body></s:Envelope>');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await runGenerationPipeline({wsdl: fixture, clientOutDir: directory, catalogOut: join(directory, "catalog.json"), compiler: {imports: "js"}});
    const {StreamMapping} = await import(pathToFileURL(join(directory, "client.ts")).href) as {
      StreamMapping: new (options: {source: string; options: {handleNilAsNull: boolean; disableCache: boolean}}) => {
        soapClient(): Promise<Client>; Read(args: object): Promise<{response: unknown}>;
      };
    };
    // @constraints node-soap caches parser options with WSDLs; this case explicitly selects nil-as-null independently of other clients.
    const client = new StreamMapping({source: fixture, options: {handleNilAsNull: true, disableCache: true}});
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing owned endpoint");
    (await client.soapClient()).setEndpoint(`http://127.0.0.1:${address.port}/empty`);
    expect((await client.Read({})).response).toEqual({Record: [{Success: {}, NilEmpty: null}]});
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, {recursive: true, force: true});
  }
});
