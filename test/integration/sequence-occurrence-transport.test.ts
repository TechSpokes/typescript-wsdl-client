import {expect, it} from "vitest";
import {mkdirSync, mkdtempSync, rmSync} from "node:fs";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import Fastify from "fastify";
import {runGenerationPipeline} from "../../src/pipeline.js";
import {verifyOccurrenceTransport} from "../helpers/occurrenceTransport.mjs";

const fixture = resolve("test/conformance/fixtures/xsd/sequences/sequence-occurrence-wrappers.wsdl");

it.each([true, false])("normalizes real SOAP responses with flattenArrayWrappers=%s", async flatten => {
  mkdirSync("tmp/conformance", {recursive: true});
  const outDir = mkdtempSync(resolve("tmp/conformance/occurrence-transport-"));
  try {
    await runGenerationPipeline({
      wsdl: fixture,
      catalogOut: join(outDir, "client/catalog.json"),
      clientOutDir: join(outDir, "client"),
      openapi: {outFile: join(outDir, "openapi.json"), format: "json", flattenArrayWrappers: flatten},
      gateway: {outDir: join(outDir, "gateway"), serviceSlug: "occurrence", versionSlug: "v1"},
      compiler: {imports: "js"},
    });
    const {OccurrenceService} = await import(pathToFileURL(join(outDir, "client/client.ts")).href);
    const client = new OccurrenceService({source: fixture, options: {timeout: 5_000}});
    for (const type of ["Addresses", "OptionalAddresses", "ExtendedAddresses", "AddressCollection"]) {
      expect(client.fromSoapResult({address: {street: "single"}}, type)).toEqual({address: [{street: "single"}]});
    }
    expect(client.fromSoapResult({label: "", addresses: {address: {street: "nested"}}}, "SubmitOccurrenceResponse"))
      .toEqual({label: [""], addresses: {address: [{street: "nested"}]}});
    for (const value of [false, 0, ""]) {
      expect(client.fromSoapResult({label: value}, "SubmitOccurrenceResponse")).toEqual({label: [value]});
    }
    expect(client.fromSoapResult({label: null}, "SubmitOccurrenceResponse")).toEqual({label: null});
    expect(client.fromSoapResult({label: undefined}, "SubmitOccurrenceResponse")).toEqual({label: undefined});
    expect(client.fromSoapResult({}, "SubmitOccurrenceResponse")).toEqual({});
    expect(client.fromSoapResult({street: "scalar", unknown: "value", attributes: {id: "1"}, $value: "text"}, "AddressType"))
      .toEqual({street: "scalar", unknown: "value", id: "1", $value: "text"});
    const array = {label: ["first", "second"]};
    expect(client.fromSoapResult(array, "SubmitOccurrenceResponse")).toEqual(array);
    const repeated = client.dataTypes.RepeatedElements;
    client.dataTypes = {...client.dataTypes, RepeatedElements: undefined};
    expect(client.fromSoapResult({label: "legacy"}, "SubmitOccurrenceResponse")).toEqual({label: "legacy"});
    client.dataTypes.RepeatedElements = repeated;
    const plugin = (await import(pathToFileURL(join(outDir, "gateway/plugin.ts")).href)).default;
    await verifyOccurrenceTransport({
      client,
      createGateway: async client => {
        const app = Fastify();
        await app.register(plugin, {client});
        return {app, flatten};
      },
    });
  } finally {
    rmSync(outDir, {recursive: true, force: true});
  }
}, 30_000);
