import {describe, it, expect, afterAll} from "vitest";
import fs from "node:fs";
import path from "node:path";
import {runGenerationPipeline, generateGateway, generateTests, compileWsdlToProject, parseStreamConfig} from "../../src/index.js";
import {generateApp} from "../../src/app/generateApp.js";
import {composeGeneratedSource, resolvePreamble} from "../../src/generation/preamble.js";
import {generateClient} from "../../src/client/generateClient.js";
import {generateTypes} from "../../src/client/generateTypes.js";
import {generateUtils} from "../../src/client/generateUtils.js";
import {generateOperations} from "../../src/client/generateOperations.js";

const base = path.resolve("tmp/test-generation/preamble-generation");
fs.mkdirSync(base, {recursive: true});
const root = fs.mkdtempSync(path.join(base, "coverage-"));
afterAll(() => fs.rmSync(root, {recursive: true, force: true}));
function inventory(dir: string): Record<string, string> {
  return Object.fromEntries(fs.readdirSync(dir, {recursive: true, withFileTypes: true})
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name)).sort()
    .map(file => [path.relative(dir, file).replace(/\\/g, "/"), fs.readFileSync(file, "utf8")]));
}
function checkHeaders(files: Record<string, string>) {
  const tsFiles = Object.entries(files).filter(([file]) => file.endsWith(".ts"));
  expect(tsFiles.length).toBeGreaterThan(0);
  for (const [file, content] of tsFiles) {
    const scope = file.startsWith("app/") ? "app" : file.startsWith("tests/") ? "test" : "client";
    const prefix = composeGeneratedSource("", resolvePreamble(scope));
    expect(content.startsWith(prefix), file).toBe(true);
    expect(content.split(prefix), file).toHaveLength(2);
  }
  for (const [file, content] of Object.entries(files).filter(([file]) => !file.endsWith(".ts"))) {
    expect(content, file).not.toContain("/* eslint-disable */");
  }
}

describe("complete generated TypeScript coverage", () => {
  it("covers pipeline, conditional helpers, ownership, direct generators and stub output", async () => {
    const clientDir = path.join(root, "client");
    const gatewayDir = path.join(root, "gateway");
    const appDir = path.join(root, "app");
    const testDir = path.join(root, "tests");
    const catalogFile = path.join(clientDir, "catalog.json");
    const openapiFile = path.join(root, "openapi.json");
    const securityConfigFile = path.join(root, "security.json");
    fs.writeFileSync(securityConfigFile, JSON.stringify({upstream: {profile: "ws-security-username-token", usernameEnv: "SOAP_USERNAME", passwordEnv: "SOAP_PASSWORD"}}));
    const options = {
      wsdl: "examples/minimal/weather.wsdl", catalogOut: catalogFile, clientOutDir: clientDir,
      openapi: {outFile: openapiFile, format: "json" as const},
      gateway: {outDir: gatewayDir, versionSlug: "v1", serviceSlug: "weather"},
      app: {appDir, securityConfigFile}, test: {testDir},
      streamConfig: parseStreamConfig({operations: {GetWeatherInformation: {
        format: "json-array", recordType: "WeatherDescription",
        recordPath: ["GetWeatherInformationResponse", "GetWeatherInformationResult", "WeatherDescription"],
      }}}),
    };
    await runGenerationPipeline(options);
    const first = inventory(root);
    checkHeaders(first);
    for (const file of ["client/streamXml.ts", "gateway/_typecheck.ts", "app/security.ts", "tests/runtime/unwrap.test.ts"]) {
      expect(first[file], file).toBeDefined();
    }
    expect(first["client/streamXml.ts"]).toContain("Embedded from");
    expect(first["gateway/runtime.ts"]).toContain("toJsonArray");
    await runGenerationPipeline(options);
    expect(inventory(root)).toEqual(first);

    const adopted = "// maintained, suppression intentionally removed\nexport {};\n";
    fs.writeFileSync(path.join(appDir, "server.ts"), adopted);
    fs.writeFileSync(path.join(testDir, "helpers/mock-client.ts"), adopted);
    await generateApp({clientDir, gatewayDir, appDir, catalogFile, openapiFile, securityConfigFile});
    await generateTests({testDir, gatewayDir, clientDir, catalogFile});
    expect(fs.readFileSync(path.join(appDir, "server.ts"), "utf8")).toBe(adopted);
    expect(fs.readFileSync(path.join(testDir, "helpers/mock-client.ts"), "utf8")).toBe(adopted);
    await generateApp({clientDir, gatewayDir, appDir, catalogFile, openapiFile, securityConfigFile, force: true});
    await generateTests({testDir, gatewayDir, clientDir, catalogFile, force: true});
    checkHeaders(inventory(root));

    const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
    const direct = path.join(root, "direct");
    fs.mkdirSync(direct);
    for (const [name, generate] of [["client", generateClient], ["types", generateTypes], ["utils", generateUtils], ["operations", generateOperations]] as const) {
      generate(path.join(direct, `${name}.ts`), catalog);
      expect(() => generate(path.join(direct, "absent", `${name}.ts`), catalog)).toThrow(/Failed to generate/);
    }
    checkHeaders(inventory(direct));
    await generateGateway({openapiFile, outDir: path.join(root, "stubs"), versionSlug: "v1", serviceSlug: "weather", stubHandlers: true});
    checkHeaders(inventory(path.join(root, "stubs")));
  }, 60_000);

  it("covers the public client-only API with an unrelated destination name", async () => {
    const destination = path.join(root, "elsewhere");
    await compileWsdlToProject({wsdl: "examples/minimal/weather.wsdl", outDir: destination});
    checkHeaders(inventory(destination));
  });
});
