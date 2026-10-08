import {it} from "vitest";
import {execFileSync} from "node:child_process";
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {compileWsdlToProject, parseStreamConfig} from "../../src/index.js";

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
        await compileWsdlToProject({
          wsdl: fixture,
          outDir: join(root, "projects", directory),
          options: {imports: "js", clientName: name},
          streamConfig: mode === "streamed" ? streamConfig : undefined,
        });
        cases.push({name, directory});
      }
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
