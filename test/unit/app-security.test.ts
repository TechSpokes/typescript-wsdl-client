import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import os from "node:os";
import {resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {describe, expect, it} from "vitest";
import {generateApp} from "../../src/app/generateApp.js";

const require = createRequire(import.meta.url);
const projectRoot = resolve(import.meta.dirname, "..", "..");

function makeTempDir(prefix: string): string {
  return mkdtempSync(prefix);
}

function readUtf8(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

interface AppFixture {
  clientDir: string;
  gatewayDir: string;
  appDir: string;
  catalogFile: string;
  openapiFile: string;
}

function createAppFixture(root: string, clientSource: string): AppFixture {
  const clientDir = `${root}/client`;
  const gatewayDir = `${root}/gateway`;
  const appDir = `${root}/app`;
  mkdirSync(clientDir, {recursive: true});
  mkdirSync(gatewayDir, {recursive: true});
  writeFileSync(`${clientDir}/client.ts`, clientSource, "utf8");
  writeFileSync(`${gatewayDir}/plugin.ts`, "export default async function plugin() {}\n", "utf8");
  const catalogFile = `${clientDir}/catalog.json`;
  writeFileSync(catalogFile, JSON.stringify({
    options: {clientName: "Weather", imports: "js"},
    types: [],
    aliases: [],
    operations: [],
    meta: {attrSpec: {}, attrType: {}, childType: {}, propMeta: {}},
    wsdlTargetNS: "",
    wsdlUri: "weather.wsdl",
  }));
  const openapiFile = `${root}/openapi.json`;
  writeFileSync(openapiFile, JSON.stringify({openapi: "3.1.0", info: {title: "T", version: "1"}, paths: {}, components: {schemas: {}}}));

  return {
    clientDir,
    gatewayDir,
    appDir,
    catalogFile,
    openapiFile,
  };
}

describe("generateApp security scaffold", () => {
  it("emits upstream SOAP security helper when security config has an upstream profile", async () => {
    const root = makeTempDir(`${os.tmpdir()}/wsdl-tsc-app-security-`);
    const fixture = createAppFixture(root, "export class Weather {}\n");
    const securityConfigFile = `${root}/security.json`;
    writeFileSync(securityConfigFile, JSON.stringify({
      upstream: {
        profile: "ws-security-username-token",
        usernameEnv: "SOAP_USERNAME",
        passwordEnv: "SOAP_PASSWORD",
      },
    }));

    await generateApp({
      clientDir: fixture.clientDir,
      gatewayDir: fixture.gatewayDir,
      openapiFile: fixture.openapiFile,
      catalogFile: fixture.catalogFile,
      appDir: fixture.appDir,
      securityConfigFile,
      force: true,
    });

    const serverSource = readUtf8(`${fixture.appDir}/server.ts`);
    const securitySource = readUtf8(`${fixture.appDir}/security.ts`);
    const envSource = readUtf8(`${fixture.appDir}/.env.example`);

    expect(serverSource).toContain("buildSoapRuntimeConfig");
    expect(securitySource).toContain("soapRuntime.WSSecurity");
    expect(envSource).toContain("SOAP_USERNAME=");
  });

  it("emits a tsconfig that type-checks sibling client and gateway artifacts", async () => {
    const tmpBase = `${projectRoot}/tmp`;
    mkdirSync(tmpBase, {recursive: true});
    const root = makeTempDir(`${tmpBase}/app-tsconfig-`);
    const fixture = createAppFixture(root, "export class Weather { constructor(_options: {source: string}) {} }\n");
    writeFileSync(`${fixture.gatewayDir}/_typecheck.ts`, "export const gatewayTypecheck = true;\n", "utf8");

    await generateApp({
      clientDir: fixture.clientDir,
      gatewayDir: fixture.gatewayDir,
      openapiFile: fixture.openapiFile,
      catalogFile: fixture.catalogFile,
      appDir: fixture.appDir,
      force: true,
    });

    execFileSync(
      process.execPath,
      [require.resolve("typescript/bin/tsc"), "-p", `${fixture.appDir}/tsconfig.json`, "--noEmit"],
      {cwd: root, encoding: "utf8", stdio: "pipe"},
    );
  });
});
