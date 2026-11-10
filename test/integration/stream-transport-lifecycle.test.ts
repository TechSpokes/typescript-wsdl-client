import {expect, it, vi} from "vitest";
import {mkdirSync, mkdtempSync, readFileSync, rmSync} from "node:fs";
import {join, resolve} from "node:path";
import {createServer} from "node:http";
import {Agent, createServer as createSecureServer} from "node:https";
import {once} from "node:events";
import {pathToFileURL} from "node:url";
import {ClientSSLSecurity, HttpClient, type Client, type IOptions, type ISecurity} from "soap";
import {runGenerationPipeline} from "../../src/pipeline.js";
import {parseStreamConfig} from "../../src/util/streamConfig.js";

interface StreamClient {
  soapClient(): Promise<Client>;
  Read(args: object, options?: {signal?: AbortSignal; timeoutMs?: number}): Promise<{records: AsyncIterable<unknown>}>;
}
interface StreamConstructor {
  new (options: {source: string; options?: IOptions; security?: ISecurity; streamRequestOptions?: Record<string, unknown>}): StreamClient;
}
const fixture = resolve("test/fixtures/wsdl/stream-mapping.wsdl");
const start = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ReadResponse xmlns="urn:stream-mapping"><Record Enabled="true"><Count>42</Count></Record>';
const end = '</ReadResponse></s:Body></s:Envelope>';

async function generate(directory: string): Promise<StreamConstructor> {
  await runGenerationPipeline({wsdl: fixture, catalogOut: join(directory, "catalog.json"), clientOutDir: directory,
    compiler: {imports: "js"}, streamConfig: parseStreamConfig({operations: {Read: {recordType: "Record", recordPath: ["ReadResponse", "Record"]}}})});
  return (await import(pathToFileURL(join(directory, "client.ts")).href) as {StreamMapping: StreamConstructor}).StreamMapping;
}
function temporary(): string {
  mkdirSync("tmp/conformance", {recursive: true});
  return mkdtempSync(resolve("tmp/conformance/stream-lifecycle-"));
}

it("rejects an already aborted stream call before initializing its SOAP metadata client", async () => {
  const directory = temporary();
  try {
    const Constructor = await generate(directory);
    const client = new Constructor({source: fixture});
    const initialize = vi.spyOn(client, "soapClient").mockRejectedValue(new Error("SOAP metadata initialization must not run"));
    await expect(client.Read({}, {signal: AbortSignal.abort(new Error("Already stopped"))})).rejects.toThrow("Already stopped");
    expect(initialize).not.toHaveBeenCalled();
  } finally { rmSync(directory, {recursive: true, force: true}); }
});

it("releases an incomplete upstream on iterator return, signal cancellation and total deadline", async () => {
  const directory = temporary();
  const closed: Promise<boolean>[] = [];
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Consume the request before starting the response. */ }
    closed.push(new Promise(resolve => response.once("close", () => resolve(!response.writableEnded))));
    if (request.url !== "/no-headers") response.writeHead(200, {"content-type": "text/xml"}).write(start);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const Constructor = await generate(directory);
    const client = new Constructor({source: fixture});
    const soap = await client.soapClient();
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing owned endpoint");
    soap.setEndpoint(`http://127.0.0.1:${address.port}/stream`);
    const first = (await client.Read({})).records[Symbol.asyncIterator]();
    expect(await first.next()).toEqual({done: false, value: {Enabled: true, Count: 42}});
    await first.return?.();
    expect(await closed[0]).toBe(true);
    const unread = (await client.Read({})).records[Symbol.asyncIterator]();
    await unread.return?.();
    expect(await closed[1]).toBe(true);
    const controller = new AbortController();
    const aborted = (await client.Read({}, {signal: controller.signal})).records[Symbol.asyncIterator]();
    await aborted.next();
    const pending = aborted.next();
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(await closed[2]).toBe(true);
    const expired = (await client.Read({}, {timeoutMs: 150})).records[Symbol.asyncIterator]();
    await expired.next();
    await expect(expired.next()).rejects.toThrow();
    expect(await closed[3]).toBe(true);
    soap.setEndpoint(`http://127.0.0.1:${address.port}/no-headers`);
    await expect(client.Read({}, {timeoutMs: 150})).rejects.toThrow();
    expect(await closed[4]).toBe(true);
    await expect(client.Read({}, {signal: AbortSignal.abort()})).rejects.toThrow();
    expect(closed).toHaveLength(5);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, {recursive: true, force: true});
  }
}, 30_000);

it("uses explicit verified HTTPS agents and inherited TLS security without disabling CA verification", async () => {
  const directory = temporary();
  const cert = readFileSync("test/conformance/fixtures/soap/content-model/test-cert.pem");
  const key = readFileSync("test/conformance/fixtures/soap/content-model/test-key.pem");
  let requests = 0;
  const server = createSecureServer({cert, key}, async (request, response) => {
    for await (const _chunk of request) { /* Consume the request before starting the response. */ }
    requests++;
    response.writeHead(200, {"content-type": "text/xml"});
    response.end(start + end);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const agent = new Agent({ca: cert, rejectUnauthorized: true});
  try {
    const Constructor = await generate(directory);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing TLS endpoint");
    const endpoint = `https://127.0.0.1:${address.port}/stream`;
    for (const options of [{streamRequestOptions: {httpsAgent: agent}}, {security: new ClientSSLSecurity("", "", cert)}]) {
      const client = new Constructor({source: fixture, ...options});
      (await client.soapClient()).setEndpoint(endpoint);
      const result = await client.Read({});
      const values: unknown[] = [];
      for await (const value of result.records) values.push(value);
      expect(values).toEqual([{Enabled: true, Count: 42}]);
    }
    const untrusted = new Constructor({source: fixture});
    (await untrusted.soapClient()).setEndpoint(endpoint);
    await expect(untrusted.Read({})).rejects.toThrow(/certificate|self.signed|verify/i);
    expect(requests).toBe(2);
    const httpClient = new HttpClient();
    const unsupported = new Constructor({source: fixture, options: {httpClient: {request: httpClient.request.bind(httpClient)}}});
    await expect(unsupported.Read({})).rejects.toThrow(/requestStream/);
    const soap12 = new Constructor({source: fixture, options: {forceSoap12Headers: true}});
    await expect(soap12.Read({})).rejects.toThrow(/SOAP 1.1/);
  } finally {
    agent.destroy();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, {recursive: true, force: true});
  }
}, 30_000);
