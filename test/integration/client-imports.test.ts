import {it} from "vitest";
import {execFileSync} from "node:child_process";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {compileWsdlToProject, parseStreamConfig} from "../../src/index.js";
import {resolveCompilerOptions} from "../../src/config.js";
import {generateOperations} from "../../src/client/generateOperations.js";
import {readLegacyCatalogFile} from "../../src/compiler/semanticCatalog.js";

const require = createRequire(import.meta.url);
const fixture = resolve("examples/minimal/weather.wsdl");

it("compiles and initializes buffered and streamed clients whose names match SOAP imports", async () => {
  mkdirSync("tmp/test-generation", {recursive: true});
  const root = mkdtempSync(resolve("tmp/test-generation/client-imports-"));
  const names = ["Weather", "Client", "IOptions", "ISecurity", "createClientAsync"];
  const streamConfig = parseStreamConfig({operations: {GetWeatherInformation: {
    recordType: "WeatherDescription",
    recordPath: ["GetWeatherInformationResponse", "GetWeatherInformationResult", "WeatherDescription"],
  }}});
  const cases: Array<{name: string; directory: string}> = [];
  try {
    for (const mode of ["buffered", "streamed"]) {
      for (const name of names) {
        const directory = `${mode}-${name}`;
        const outDir = join(root, "projects", directory);
        await compileWsdlToProject({
          wsdl: fixture,
          outDir,
          options: resolveCompilerOptions({imports: "js", clientName: name}, {wsdl: fixture, out: outDir}),
          streamConfig: mode === "streamed" ? streamConfig : undefined,
        });
        cases.push({name, directory});
      }
    }
    const recordFixture = resolve("test/fixtures/wsdl/stream-mapping.wsdl");
    const recordDir = join(root, "projects", "record-model");
    await compileWsdlToProject({wsdl: recordFixture, outDir: recordDir,
      options: resolveCompilerOptions({imports: "js"}, {wsdl: recordFixture, out: recordDir}),
      streamConfig: parseStreamConfig({operations: {Read: {recordType: "Record", recordPath: ["ReadResponse", "Record"]}}}),
    });
    const recordCatalog = readLegacyCatalogFile(join(recordDir, "catalog.json"));
    generateOperations(join(recordDir, "no-input-operations.ts"), {...recordCatalog,
      operations: recordCatalog.operations.map(operation => ({...operation,
        inputTypeName: undefined, inputElement: undefined, outputTypeName: "Record", stream: undefined,
      })),
    });
    writeFileSync(join(recordDir, "consumer.ts"), `import type {StreamMappingOperations, StreamOperationResponse} from "./operations.js";
import type {StreamMappingOperations as NoInputOperations} from "./no-input-operations.js";
import type {Record as ServiceRecord} from "./types.js";
declare const operations: StreamMappingOperations;
declare const noInput: NoInputOperations;
declare const response: StreamOperationResponse<ServiceRecord>;
const stream = await operations.Read({Enabled: true});
for await (const record of stream.records) {
  const count: number = record.Count;
  // @ts-expect-error A model named Record keeps its native numeric field type.
  const wrong: string = record.Count;
  void [count, wrong];
}
const header: unknown = response.headers["x-owned"];
// @ts-expect-error Generic HTTP headers do not become fields of the service DTO.
const narrowed: string = response.headers["x-owned"];
const buffered = await noInput.Read({trace: "owned"});
const count: number = buffered.response.Count;
void [header, narrowed, count];
`, "utf8");
    for (const modelName of ["StreamCallOptions", "StreamOperationResponse", "AbortSignal", "StreamMappingOperations"]) {
      const directory = join(root, "projects", `model-${modelName}`);
      mkdirSync(directory, {recursive: true});
      const wsdl = join(directory, "model.wsdl");
      writeFileSync(wsdl, readFileSync(recordFixture, "utf8").replace(/\bRecord\b/g, modelName), "utf8");
      await compileWsdlToProject({wsdl, outDir: directory,
        options: resolveCompilerOptions({imports: "js"}, {wsdl, out: directory}),
        streamConfig: parseStreamConfig({operations: {Read: {recordType: modelName, recordPath: ["ReadResponse", modelName]}}}),
      });
      writeFileSync(join(directory, "consumer.ts"), `import type {StreamMappingOperations as Operations, StreamOperationResponse as Response, StreamCallOptions as CallOptions} from "./operations.js";
import type {${modelName} as ServiceModel} from "./types.js";
declare const operations: Operations;
declare const response: Response<ServiceModel>;
const input: Parameters<Operations["Read"]>[0] = {Enabled: true};
const options: CallOptions = {signal: new AbortController().signal};
const signal: AbortSignal = options.signal!;
const streamed = await operations.Read(input, options);
for await (const record of streamed.records) {
  const native: ServiceModel = record;
  const count: number = native.Count;
  // @ts-expect-error The streamed DTO keeps its numeric field type.
  const wrong: string = native.Count;
  void [count, wrong];
}
// @ts-expect-error Request DTO properties retain their native types.
operations.Read({Enabled: "yes"});
// @ts-expect-error Cancellation requires the native AbortSignal contract.
operations.Read(input, {signal: {}});
const header: unknown = response.headers["x-owned"];
void [signal, header];
`, "utf8");
    }
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        strict: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext",
        verbatimModuleSyntax: true, skipLibCheck: true, types: ["node"],
        rootDir: "projects", outDir: "compiled",
      },
      include: ["projects/**/*.ts"],
    }));
    execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", join(root, "tsconfig.json")], {
      encoding: "utf8", timeout: 60_000,
    });
    // Run the emitted JavaScript in Node, using the installed SOAP declarations
    // and exports rather than the smoke stub or Vitest's TypeScript transform.
    const runner = join(root, "initialize.mjs");
    writeFileSync(runner, `import assert from "node:assert/strict";
const cases = ${JSON.stringify(cases)};
for (const {name, directory} of cases) {
  const module = await import("./compiled/" + directory + "/client.js");
  const security = {toXML: () => ""};
  const wrapper = new module[name]({
    source: ${JSON.stringify(fixture)}, options: {attributesKey: "customAttributes"}, security,
  });
  const client = await wrapper.soapClient();
  assert.equal(await wrapper.soapClient(), client, "SOAP initialization must stay lazy and cached");
  assert.equal(client.security, security, "Security must reach the underlying SOAP client");
  assert.equal(client.wsdl.options.attributesKey, "customAttributes", "SOAP options must reach the client");
  assert.ok(client.describe().Weather, "The real SOAP client must load the fixture");
  await assert.rejects(new module[name]({source: ""}).soapClient(), /non-empty string/);
}
`);
    execFileSync(process.execPath, [runner], {encoding: "utf8", timeout: 30_000});
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}, 90_000);
