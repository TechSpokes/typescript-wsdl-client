import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {spawnSync} from "node:child_process";
import {once} from "node:events";
import {join, relative, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import Fastify, {type FastifyPluginAsync} from "fastify";
import {XMLParser} from "fast-xml-parser";
import {loadMultiServiceConfig, runMultiServicePipeline} from "../../src/multiServicePipeline.js";
import {runOwnedNode} from "../helpers/ownedNodeProcess.js";
import {parseStreamConfig} from "../../src/util/streamConfig.js";

const fixtures = resolve("test/conformance/fixtures/wsdl/composition");
const parent = resolve("tmp/conformance");
mkdirSync(parent, {recursive: true});
const root = mkdtempSync(join(parent, "multi-service-"));
const generated = join(root, "generated");
type Options = Parameters<typeof runMultiServicePipeline>[0];

function configuration(directory: string): Options {
  return {
    services: ["main", "content"].map(key => ({key, generation: {
      wsdl: join(fixtures, `${key}.wsdl`),
      catalogOut: join(directory, "sources", key, "model", "catalog.json"),
      clientOutDir: join(directory, "sources", key, "model"),
      compiler: {imports: "js"},
      openapi: {outFile: join(directory, "sources", key, "native.json"), basePath: `/${key}`, format: "json"},
      gateway: {outDir: join(directory, "adapters", key), serviceSlug: key, versionSlug: "v1"},
    }})),
    openapi: {outFile: join(directory, "published", "openapi.json"), title: "Two independent SOAP services", version: "1"},
    gateway: {outDir: join(directory, "entry"), imports: "js"},
  };
}

interface NativeClient {
  soapClient(): Promise<{setEndpoint(endpoint: string): void}>;
}
interface Clients {main: NativeClient; content: NativeClient}
interface AggregateModule {
  default: FastifyPluginAsync<{clients: Clients}>;
  createClients(options: {main: {source: string}; content: {source: string}}): Clients;
}

beforeAll(async () => {await runMultiServicePipeline(configuration(generated));});
afterAll(() => rmSync(root, {recursive: true, force: true}));

describe("native multi-service pipeline", () => {
  it("serves one discoverable document and dispatches identical operation names to their own WSDL, endpoint, action, and fields", async () => {
    const observations: Record<string, Array<{xml: string; action: string | undefined; path: string | undefined}>> = {main: [], content: []};
    const mainServer = createServer(async (request, response) => {
      let xml = "";
      for await (const chunk of request) xml += String(chunk);
      observations.main.push({xml, action: request.headers.soapaction as string | undefined, path: request.url});
      response.setHeader("content-type", "text/xml; charset=utf-8");
      response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ReadResponse xmlns="urn:composition:main"><Entry Scope="main-reply"><Value>main &amp; only</Value></Entry></ReadResponse></s:Body></s:Envelope>');
    });
    const contentServer = createServer(async (request, response) => {
      let xml = "";
      for await (const chunk of request) xml += String(chunk);
      observations.content.push({xml, action: request.headers.soapaction as string | undefined, path: request.url});
      response.setHeader("content-type", "text/xml; charset=utf-8");
      response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ReadResponse xmlns="urn:composition:content"><Entry Revision="7"><Count>42</Count></Entry></ReadResponse></s:Body></s:Envelope>');
    });
    mainServer.listen(0, "127.0.0.1");
    contentServer.listen(0, "127.0.0.1");
    await Promise.all([once(mainServer, "listening"), once(contentServer, "listening")]);
    const app = Fastify();
    try {
      const aggregate = await import(pathToFileURL(join(generated, "entry/plugin.ts")).href) as AggregateModule;
      const clients = aggregate.createClients({main: {source: join(fixtures, "main.wsdl")}, content: {source: join(fixtures, "content.wsdl")}});
      for (const [key, server] of [["main", mainServer], ["content", contentServer]] as const) {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Missing owned SOAP endpoint");
        (await clients[key].soapClient()).setEndpoint(`http://127.0.0.1:${address.port}/${key}-owned`);
      }
      await app.register(aggregate.default, {clients});
      const discovery = await app.inject({method: "GET", url: "/openapi.json"});
      expect(discovery.statusCode, discovery.body).toBe(200);
      const spec = discovery.json();
      const routeById = Object.fromEntries(Object.entries(spec.paths as Record<string, {post: {operationId: string}}>).map(([path, item]) => [item.post.operationId, path]));
      expect(routeById).toEqual({"main.Read": "/main/read", "content.Read": "/content/read"});
      expect(spec.components.schemas.main__Reply.properties).toMatchObject({Value: {type: "string"}});
      expect(spec.components.schemas.content__Reply.properties).toMatchObject({Count: {type: "number"}});

      const main = await app.inject({method: "POST", url: routeById["main.Read"], payload: {Entry: {Scope: "main-request", Lookup: "a&b"}}});
      const content = await app.inject({method: "POST", url: routeById["content.Read"], payload: {Entry: {Revision: 3, Index: 2}}});
      expect(main.statusCode, main.body).toBe(200);
      expect(content.statusCode, content.body).toBe(200);
      expect(main.json()).toEqual({status: "SUCCESS", message: null, data: {Entry: {Scope: "main-reply", Value: "main & only"}}, error: null});
      expect(content.json()).toEqual({status: "SUCCESS", message: null, data: {Entry: {Revision: 7, Count: 42}}, error: null});
      expect(observations.main).toHaveLength(1);
      expect(observations.content).toHaveLength(1);
      expect(observations.main[0]).toMatchObject({action: '"urn:composition:main:Read"', path: "/main-owned"});
      expect(observations.content[0]).toMatchObject({action: '"urn:composition:content:Read"', path: "/content-owned"});
      const parser = new XMLParser({ignoreAttributes: false, removeNSPrefix: true});
      expect(parser.parse(observations.main[0].xml)).toMatchObject({Envelope: {Body: {ReadRequest: {Entry: {"@_Scope": "main-request", Lookup: "a&b"}}}}});
      expect(parser.parse(observations.content[0].xml)).toMatchObject({Envelope: {Body: {ReadRequest: {Entry: {"@_Revision": "3", Index: 2}}}}});
      expect(observations.main[0].xml).toContain("urn:composition:main");
      expect(observations.content[0].xml).toContain("urn:composition:content");
      expect(observations.main[0].xml).not.toContain("Revision");
      expect(observations.content[0].xml).not.toContain("Scope");

      const wrongMain = await app.inject({method: "POST", url: routeById["main.Read"], payload: {Entry: {Revision: 3, Index: 2}}});
      const wrongContent = await app.inject({method: "POST", url: routeById["content.Read"], payload: {Entry: {Scope: "wrong", Lookup: "wrong"}}});
      expect(wrongMain.statusCode).toBe(400);
      expect(wrongContent.statusCode).toBe(400);
      expect(observations.main).toHaveLength(1);
      expect(observations.content).toHaveLength(1);
    } finally {
      await app.close();
      for (const server of [mainServer, contentServer]) server.closeAllConnections();
      await Promise.all([mainServer, contentServer].map(server => new Promise<void>(done => server.close(() => done()))));
    }
  });

  it("typechecks both native models, typed client factory, aggregate registration, and distinct Fastify decorators together", async context => {
    const consumer = join(generated, "consumer.ts");
    writeFileSync(consumer, `import Fastify from "fastify";
import plugin, {createClients} from "./entry/plugin.js";
import {Service as MainService} from "./sources/main/model/client.js";
import {Service as ContentService} from "./sources/content/model/client.js";
const clients = createClients({main: {source: "main.wsdl"}, content: {source: "content.wsdl"}});
const main: MainService = clients.main;
const content: ContentService = clients.content;
await main.Read({Entry: {Scope: "main", Lookup: "key"}});
await content.Read({Entry: {Revision: 1, Index: 2}});
// @ts-expect-error Each native request retains its own fields.
await main.Read({Entry: {Revision: 1, Index: 2}});
// @ts-expect-error Each native request retains its own fields.
await content.Read({Entry: {Scope: "main", Lookup: "key"}});
// @ts-expect-error All configured services require constructor options.
createClients({main: {source: "main.wsdl"}});
// @ts-expect-error Each constructor keeps its required source.
createClients({main: {}, content: {source: "content.wsdl"}});
await Fastify().register(plugin, {clients});
`, "utf8");
    const tsconfig = join(generated, "tsconfig.json");
    writeFileSync(tsconfig, JSON.stringify({compilerOptions: {target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext",
      strict: true, noEmit: true, skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, types: ["node"]},
      include: ["**/*.ts"]}), "utf8");
    const typecheck = () => runOwnedNode(["--permission", "--allow-fs-read=" + process.cwd(), resolve("node_modules/typescript/bin/tsc"), "-p", tsconfig],
      {cwd: process.cwd(), timeoutMs: 60_000, signal: context.signal, childProcessesDenied: true});
    try {
      await typecheck();
    } catch (error) {
      const captured = error as {stdout?: string; stderr?: string};
      throw new Error(`Generated consumer TypeScript failed: ${String(error)}\n${captured.stdout ?? ""}${captured.stderr ?? ""}`, {cause: error});
    }
    const conflicting = join(generated, "conflicting-decorator.ts");
    writeFileSync(conflicting, `import type {ServiceOperations as ContentOperations} from "./sources/content/model/operations.js";
declare module "fastify" {
  interface FastifyInstance {
    wsdl_mainClient: ContentOperations;
  }
}
`, "utf8");
    try {
      let failure: unknown;
      try {await typecheck();} catch (error) {failure = error;}
      expect(failure, "A conflicting native decorator must fail even with skipLibCheck").toBeDefined();
      const captured = failure as {stdout?: string; stderr?: string};
      const diagnostics = `${captured.stdout ?? ""}${captured.stderr ?? ""}`;
      expect(diagnostics).toContain("TS2717");
      expect(diagnostics).toContain("wsdl_mainClient");
    } finally {
      rmSync(conflicting, {force: true});
    }
    for (const key of ["main", "content"]) {
      const native = JSON.parse(readFileSync(join(generated, "sources", key, "native.json"), "utf8"));
      expect(native.paths[`/${key}/read`].post.operationId).toBe("Read");
      expect(native.components.schemas.Reply).toBeDefined();
      expect(native.components.schemas[`${key}__Reply`]).toBeUndefined();
      const catalog = JSON.parse(readFileSync(join(generated, "sources", key, "model/catalog.json"), "utf8"));
      expect(catalog.serviceName).toBe("Service");
      expect(catalog.operations[0]).toMatchObject({name: "Read", soapAction: `urn:composition:${key}:Read`});
    }
  }, 90_000);

  it("discovers a service-scoped stream item schema and delivers its mapped DTO before SOAP completion", async context => {
    const directory = join(root, "composed-stream");
    const options = configuration(directory);
    options.services[1].generation.streamConfig = parseStreamConfig({operations: {Read: {
      format: "ndjson", recordType: "Reply", recordPath: ["ReadResponse", "Entry"],
    }}});
    const result = await runMultiServicePipeline(options);
    let release = () => {};
    let upstreamFinished = false;
    const gate = new Promise<void>(resolve => {release = resolve;});
    const server = createServer(async (request, response) => {
      request.resume();
      response.setHeader("content-type", "text/xml");
      response.write('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ReadResponse xmlns="urn:composition:content"><Entry Revision="7"><Count>42</Count></Entry>');
      await gate;
      upstreamFinished = true;
      response.end('</ReadResponse></s:Body></s:Envelope>');
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const app = Fastify();
    try {
      const aggregate = await import(pathToFileURL(result.pluginFile).href) as AggregateModule;
      const clients = aggregate.createClients({main: {source: join(fixtures, "main.wsdl")}, content: {source: join(fixtures, "content.wsdl")}});
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing owned stream endpoint");
      (await clients.content.soapClient()).setEndpoint(`http://127.0.0.1:${address.port}/stream`);
      await app.register(aggregate.default, {clients});
      const origin = await app.listen({host: "127.0.0.1", port: 0});
      const document = await (await fetch(origin + "/openapi.json", {signal: context.signal})).json();
      const route = Object.keys(document.paths).find(path => document.paths[path].post.operationId === "content.Read")!;
      const media = document.paths[route].post.responses["200"].content["application/x-ndjson"];
      expect(media["x-wsdl-tsc-stream"].itemSchema).toEqual({$ref: "#/components/schemas/content__Reply"});
      expect(document.components.schemas.content__Reply.properties).toMatchObject({Revision: {type: "number"}, Count: {type: "number"}});
      const response = await fetch(origin + route, {method: "POST", headers: {"content-type": "application/json"},
        body: JSON.stringify({Entry: {Revision: 3, Index: 2}}), signal: context.signal});
      expect(response.status).toBe(200);
      const reader = response.body!.getReader(), decoder = new TextDecoder();
      let line = "";
      while (!line.includes("\n")) {
        const next = await reader.read();
        if (next.done) throw new Error("Stream ended before a complete DTO record");
        line += decoder.decode(next.value, {stream: true});
      }
      expect(JSON.parse(line.trim())).toEqual({Revision: 7, Count: 42});
      expect(upstreamFinished).toBe(false);
      release();
      while (!(await reader.read()).done) { /* Exhaust transport to verify clean completion. */ }
      expect(upstreamFinished).toBe(true);
    } finally {
      release(); await app.close(); server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("loads config-relative paths through the API and CLI and rejects mixed single-source CLI flags", async () => {
    const directory = join(root, "cli-relative");
    const options = configuration(directory);
    mkdirSync(directory, {recursive: true});
    const configFile = join(directory, "services.json");
    const relativeOptions: Options = {
      ...options,
      services: options.services.map(({key, generation}) => ({key, generation: {...generation,
        wsdl: relative(directory, generation.wsdl),
        catalogOut: relative(directory, generation.catalogOut!),
        clientOutDir: relative(directory, generation.clientOutDir!),
        openapi: {...generation.openapi, outFile: relative(directory, generation.openapi!.outFile!)},
        gateway: {...generation.gateway!, outDir: relative(directory, generation.gateway!.outDir!)},
      }})),
      openapi: {...options.openapi, outFile: relative(directory, options.openapi.outFile)},
      gateway: {...options.gateway, outDir: relative(directory, options.gateway.outDir)},
    };
    writeFileSync(configFile, JSON.stringify(relativeOptions));
    const loaded = await loadMultiServiceConfig(configFile);
    expect(loaded.openapi.outFile).toBe(options.openapi.outFile);
    expect(loaded.gateway.outDir).toBe(options.gateway.outDir);
    for (let index = 0; index < options.services.length; index++) {
      const expected = options.services[index].generation;
      expect(loaded.services[index].generation).toMatchObject({wsdl: expected.wsdl,
        catalogOut: expected.catalogOut, clientOutDir: expected.clientOutDir,
        openapi: {outFile: expected.openapi!.outFile}, gateway: {outDir: expected.gateway!.outDir}});
    }
    const args = ["--import", "tsx", resolve("src/cli.ts"), "pipeline", "--services-config", configFile];
    const success = spawnSync(process.execPath, args, {cwd: process.cwd(), encoding: "utf8", windowsHide: true, timeout: 60_000});
    expect(success.error).toBeUndefined();
    expect(success.status, success.stdout + success.stderr).toBe(0);
    const document = JSON.parse(readFileSync(options.openapi.outFile, "utf8"));
    expect(Object.keys(document.paths)).toEqual(["/content/read", "/main/read"]);
    const pluginFile = join(options.gateway.outDir, "plugin.ts");
    const before = readFileSync(pluginFile, "utf8");
    const mixed = spawnSync(process.execPath, [...args, "--wsdl-source", join(fixtures, "main.wsdl")],
      {cwd: process.cwd(), encoding: "utf8", windowsHide: true, timeout: 30_000});
    expect(mixed.error).toBeUndefined();
    expect(mixed.status, mixed.stdout + mixed.stderr).not.toBe(0);
    expect(mixed.stdout + mixed.stderr).toMatch(/unknown|exclusive|cannot|single.source/i);
    expect(readFileSync(pluginFile, "utf8")).toBe(before);
  }, 100_000);

  it("rejects invalid composition configuration before writing source or replacing aggregate outputs", async () => {
    const cases: Array<{name: string; mutate(options: Options): void}> = [
      {name: "duplicate-key", mutate: options => {options.services[1].key = "main";}},
      {name: "duplicate-slug", mutate: options => {options.services[1].generation.gateway!.serviceSlug = "main";}},
      {name: "client-overlap", mutate: options => {options.services[1].generation.clientOutDir = options.services[0].generation.clientOutDir;}},
      {name: "missing-base-path", mutate: options => {delete options.services[1].generation.openapi!.basePath;}},
      {name: "duplicate-base-path", mutate: options => {options.services[1].generation.openapi!.basePath = "/main";}},
      {name: "missing-catalog", mutate: options => {delete options.services[1].generation.catalogOut;}},
      {name: "unsupported-checked", mutate: options => {options.services[1].generation.model = "checked-components-v1";}},
      {name: "unsupported-app", mutate: options => {options.services[1].generation.app = {appDir: join(root, "unwanted-app")};}},
    ];
    for (const {name, mutate} of cases) {
      const directory = join(root, name);
      const options = configuration(directory);
      mkdirSync(join(directory, "published"), {recursive: true});
      mkdirSync(options.gateway.outDir, {recursive: true});
      const previousSpec = '{"previous":"aggregate"}\n';
      const previousPlugin = 'export default "previous aggregate";\n';
      writeFileSync(options.openapi.outFile, previousSpec);
      writeFileSync(join(options.gateway.outDir, "plugin.ts"), previousPlugin);
      mutate(options);
      await expect(runMultiServicePipeline(options), name).rejects.toThrow();
      expect(existsSync(join(directory, "sources")), name).toBe(false);
      expect(readFileSync(options.openapi.outFile, "utf8"), name).toBe(previousSpec);
      expect(readFileSync(join(options.gateway.outDir, "plugin.ts"), "utf8"), name).toBe(previousPlugin);
    }
  });

  it("preserves the last aggregate when a later independent source cannot compile", async () => {
    const directory = join(root, "late-failure");
    const options = configuration(directory);
    options.services[1].generation.wsdl = join(fixtures, "does-not-exist.wsdl");
    mkdirSync(join(directory, "published"), {recursive: true});
    mkdirSync(options.gateway.outDir, {recursive: true});
    writeFileSync(options.openapi.outFile, "previous spec");
    writeFileSync(join(options.gateway.outDir, "plugin.ts"), "previous plugin");
    await expect(runMultiServicePipeline(options)).rejects.toThrow();
    expect(readFileSync(options.openapi.outFile, "utf8")).toBe("previous spec");
    expect(readFileSync(join(options.gateway.outDir, "plugin.ts"), "utf8")).toBe("previous plugin");
  });
});
