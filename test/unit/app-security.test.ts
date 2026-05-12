import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {generateApp} from "../../src/app/generateApp.js";

describe("generateApp security scaffold", () => {
  it("emits upstream SOAP security helper when security config has an upstream profile", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wsdl-tsc-app-security-"));
    const clientDir = path.join(root, "client");
    const gatewayDir = path.join(root, "gateway");
    const appDir = path.join(root, "app");
    fs.mkdirSync(clientDir, {recursive: true});
    fs.mkdirSync(gatewayDir, {recursive: true});
    fs.writeFileSync(path.join(clientDir, "client.ts"), "export class Weather {}\n");
    fs.writeFileSync(path.join(gatewayDir, "plugin.ts"), "export default async function plugin() {}\n");
    const catalogFile = path.join(clientDir, "catalog.json");
    fs.writeFileSync(catalogFile, JSON.stringify({
      options: {clientName: "Weather", imports: "js"},
      types: [],
      aliases: [],
      operations: [],
      meta: {attrSpec: {}, attrType: {}, childType: {}, propMeta: {}},
      wsdlTargetNS: "",
      wsdlUri: "weather.wsdl",
    }));
    const openapiFile = path.join(root, "openapi.json");
    fs.writeFileSync(openapiFile, JSON.stringify({openapi: "3.1.0", info: {title: "T", version: "1"}, paths: {}, components: {schemas: {}}}));
    const securityConfigFile = path.join(root, "security.json");
    fs.writeFileSync(securityConfigFile, JSON.stringify({
      upstream: {
        profile: "ws-security-username-token",
        usernameEnv: "SOAP_USERNAME",
        passwordEnv: "SOAP_PASSWORD",
      },
    }));

    await generateApp({
      clientDir,
      gatewayDir,
      openapiFile,
      catalogFile,
      appDir,
      securityConfigFile,
      force: true,
    });

    expect(fs.readFileSync(path.join(appDir, "server.ts"), "utf8")).toContain("buildSoapRuntimeConfig");
    expect(fs.readFileSync(path.join(appDir, "security.ts"), "utf8")).toContain("soapRuntime.WSSecurity");
    expect(fs.readFileSync(path.join(appDir, ".env.example"), "utf8")).toContain("SOAP_USERNAME=");
  });
});
