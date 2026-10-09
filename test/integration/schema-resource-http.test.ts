import {createServer} from "node:http";
import {gzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {expect, it} from "vitest";
import {loadSchemaInput} from "../../src/loader/schemaInput.js";
import {DEFAULT_LOADING_LIMITS} from "../../src/loader/schemaResources.js";

it("resolves final-URI/base references and bounds actual HTTP decompression", async () => {
  const common = readFileSync("test/conformance/fixtures/xsd/resolution/common.xsd");
  const leaf = readFileSync("test/conformance/fixtures/xsd/resolution/leaf.xsd");
  const prefix = '<schema xmlns="http://www.w3.org/2001/XMLSchema"><!--';
  const suffix = '--></schema>';
  const large = Buffer.from(prefix + "x".repeat(DEFAULT_LOADING_LIMITS.resourceBytes + 1 - Buffer.byteLength(prefix + suffix)) + suffix);
  const compressed = gzipSync(large);
  expect(compressed.byteLength).toBeLessThan(large.byteLength / 100);
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!);
    if (request.url === "/entry") { response.writeHead(302, {location: "/final/root.xsd"}); response.end(); }
    else if (request.url === "/final/root.xsd") response.end('<schema xmlns="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:http" xml:base="../types/"><include schemaLocation="common.xsd"/></schema>');
    else if (request.url === "/types/common.xsd") response.end(common);
    else if (request.url === "/types/leaf.xsd") response.end(leaf);
    else if (request.url === "/compressed.xsd") { response.writeHead(200, {"content-encoding": "gzip", "content-length": compressed.byteLength}); response.end(compressed); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listener address");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const input = await loadSchemaInput(`${origin}/entry`, {policy: {allowedOrigins: [origin]}});
    expect(input.root.uri).toBe(`${origin}/final/root.xsd`);
    expect(input.schemas.map(s => s.targetNamespace)).toEqual(["urn:http", "urn:http", "urn:http"]);
    expect(requests).toEqual(["/entry", "/final/root.xsd", "/types/common.xsd", "/types/leaf.xsd"]);
    await expect(loadSchemaInput(`${origin}/compressed.xsd`, {policy: {allowedOrigins: [origin]}})).rejects.toMatchObject({category: "resource-limit"});
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
