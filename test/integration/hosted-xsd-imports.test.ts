import {once} from "node:events";
import {mkdir, mkdtemp, readFile, rm} from "node:fs/promises";
import {createServer} from "node:http";
import {join, resolve} from "node:path";
import {expect, it} from "vitest";
import {runOwnedNode} from "../helpers/ownedNodeProcess.js";
import {verificationPath} from "../helpers/verificationPath.js";

const fixtures = "test/conformance/fixtures/xsd/imports";
const wsdlName = "import-forecast.wsdl";
const xsdName = "import-forecast-types.xsd";
const servedWsdl = `/forecast/${wsdlName}?wsdl`;
const redirectSource = "/service?wsdl";
const redirectedXsd = "/schemas/forecast.xsd";
const includedXsd = `${redirectedXsd}?types`;

it.for(["local", "relative", "absolute", "redirected"] as const)(
  "generates a default client for the %s XSD import case",
  async (sourceKind, {signal}) => {
    const [wsdl, schema] = await Promise.all([
      readFile(join(fixtures, wsdlName), "utf8"),
      readFile(join(fixtures, xsdName), "utf8"),
    ]);
    const scratch = resolve(verificationPath("tmp/test-generation"));
    await mkdir(scratch, {recursive: true});
    const root = await mkdtemp(join(scratch, "hosted-xsd-imports-"));
    const requests: string[] = [];
    const xsdPath = sourceKind === "absolute" ? `/shared/${xsdName}` : `/forecast/${xsdName}`;
    let origin: string;
    const server = createServer((request, response) => {
      requests.push(`${request.method} ${request.url}`);
      response.setHeader("Content-Type", "application/xml");
      if (sourceKind === "redirected" && request.url === redirectSource) {
        response.writeHead(302, {Location: servedWsdl}).end();
      } else if (request.url === servedWsdl) {
        response.end(sourceKind === "absolute" ? wsdl.replace(xsdName, origin + xsdPath) : wsdl);
      } else if (request.url === xsdPath) {
        if (sourceKind === "redirected") response.writeHead(302, {Location: redirectedXsd}).end();
        else response.end(schema);
      } else if (sourceKind === "redirected" && request.url === redirectedXsd) {
        response.end(schema.replace(/<xs:simpleType[\s\S]*<\/xs:simpleType>/, '<xs:include schemaLocation="?types"/>'));
      } else if (sourceKind === "redirected" && request.url === includedXsd) {
        response.end(schema);
      } else {
        response.writeHead(404).end();
      }
    });
    try {
      let source = join(fixtures, wsdlName);
      if (sourceKind !== "local") {
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Expected an HTTP server port");
        origin = `http://127.0.0.1:${address.port}`;
        source = origin + (sourceKind === "redirected" ? redirectSource : servedWsdl);
      }
      const client = join(root, "client");
      await runOwnedNode(["--import", "tsx", resolve("src/cli.ts"), "client", "--wsdl-source", source, "--client-dir", client],
        {cwd: process.cwd(), signal, timeoutMs: 45_000});

      const expectedRequests = sourceKind === "local" ? [] : [`GET ${servedWsdl}`, `GET ${xsdPath}`];
      if (sourceKind === "redirected") {
        expectedRequests.unshift(`GET ${redirectSource}`);
        expectedRequests.push(`GET ${redirectedXsd}`, `GET ${includedXsd}`);
        expect(JSON.parse(await readFile(join(client, "catalog.json"), "utf8"))).toMatchObject({wsdlUri: source});
      }
      expect(requests).toEqual(expectedRequests);
      expect(await readFile(join(client, "client.ts"), "utf8")).toContain("export class ForecastService");
      expect(await readFile(join(client, "operations.ts"), "utf8")).toContain("GetForecast");
      expect(await readFile(join(client, "types.ts"), "utf8")).toContain("export type Days = number");
    } finally {
      try {
        if (server.listening) {
          server.close();
          await once(server, "close");
        }
      } finally {
        await rm(root, {recursive: true, force: true});
      }
    }
  },
);
