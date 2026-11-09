import {expect, it} from "vitest";
import {mkdirSync, mkdtempSync, rmSync} from "node:fs";
import {join, resolve} from "node:path";
import {createServer, request as httpRequest} from "node:http";
import {EventEmitter, once} from "node:events";
import {pathToFileURL} from "node:url";
import Fastify, {type FastifyPluginAsync} from "fastify";
import type {Client} from "soap";
import {runGenerationPipeline} from "../../src/pipeline.js";
import {parseStreamConfig} from "../../src/util/streamConfig.js";

interface GeneratedClient { soapClient(): Promise<Client> }
const fixture = resolve("test/fixtures/wsdl/stream-mapping.wsdl");

it.each([
  ["ndjson", "before headers"], ["json-array", "before headers"],
  ["ndjson", "during records"], ["json-array", "during records"],
] as const)("cancels upstream %s when the gateway consumer disconnects %s", async (format, phase) => {
  mkdirSync("tmp/conformance", {recursive: true});
  const directory = mkdtempSync(resolve("tmp/conformance/stream-gateway-cancel-"));
  const events = new EventEmitter();
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Consume the owned SOAP request. */ }
    response.once("close", () => events.emit("closed", response.writableEnded));
    if (phase === "during records") {
      response.writeHead(200, {"content-type": "text/xml"});
      response.write('<ReadResponse xmlns="urn:stream-mapping"><Record Enabled="true"><Count>42</Count></Record>');
    }
    events.emit("arrived");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const app = Fastify();
  try {
    await runGenerationPipeline({wsdl: fixture, catalogOut: join(directory, "client/catalog.json"), clientOutDir: join(directory, "client"),
      compiler: {imports: "js"}, streamConfig: parseStreamConfig({operations: {Read: {format, recordType: "Record", recordPath: ["ReadResponse", "Record"]}}}),
      openapi: {outFile: join(directory, "openapi.json")}, gateway: {outDir: join(directory, "gateway"), serviceSlug: "cancel", versionSlug: "v1"}});
    const {StreamMapping} = await import(pathToFileURL(join(directory, "client/client.ts")).href) as {
      StreamMapping: new (options: {source: string}) => GeneratedClient;
    };
    const client = new StreamMapping({source: fixture});
    const endpoint = server.address();
    if (!endpoint || typeof endpoint === "string") throw new Error("Missing owned endpoint");
    (await client.soapClient()).setEndpoint(`http://127.0.0.1:${endpoint.port}/soap`);
    const plugin = (await import(pathToFileURL(join(directory, "gateway/plugin.ts")).href)).default as FastifyPluginAsync<{client: GeneratedClient}>;
    await app.register(plugin, {client});
    const base = await app.listen({host: "127.0.0.1", port: 0});
    const controller = new AbortController();
    const arrived = once(events, "arrived");
    // @why The pre-header case must force an actual socket disconnect, independent of fetch's pooled-request abort scheduling.
    const downstream = phase === "before headers" ? httpRequest(base + "/read", {method: "POST", headers: {"content-type": "application/json"}}) : undefined;
    const downstreamClosed = downstream ? new Promise<void>(resolve => downstream.once("close", resolve)) : undefined;
    downstream?.on("error", () => { /* Destroying the consumer socket intentionally resets the pending response. */ });
    downstream?.end("{}");
    const pending = downstream ? undefined : fetch(base + "/read", {method: "POST", headers: {"content-type": "application/json"}, body: "{}", signal: controller.signal});
    await arrived;
    const closed = once(events, "closed", {signal: AbortSignal.timeout(5_000)});
    if (phase === "during records") {
      const response = await pending!;
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      let text = "";
      const decoder = new TextDecoder();
      while (!text.includes('"Count":42')) {
        const next = await reader.read();
        if (next.done) break;
        text += decoder.decode(next.value, {stream: true});
      }
      expect(text).toContain('"Count":42');
      controller.abort();
      await expect(reader.read()).rejects.toThrow();
    } else {
      downstream!.destroy();
      await downstreamClosed;
    }
    expect(await closed).toEqual([false]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await app.close();
    rmSync(directory, {recursive: true, force: true});
  }
}, 30_000);
