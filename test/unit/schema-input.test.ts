import {createHash} from "node:crypto";
import {readFileSync, mkdtempSync, symlinkSync, rmSync, writeFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {describe, expect, it, vi, afterEach} from "vitest";
import {loadSchemaInput} from "../../src/loader/schemaInput.js";
import {resolveResourceUri} from "../../src/loader/schemaResources.js";
import type {OfflineSchemaResource} from "../../src/loader/schemaResources.js";
import {syntaxAttribute} from "../../src/loader/orderedSyntax.js";

const fixtures = path.resolve("test/conformance/fixtures/xsd");
const root = path.join(fixtures, "resolution");
const schema = (content = "", namespace = "urn:test") => `<schema xmlns="http://www.w3.org/2001/XMLSchema"${namespace ? ` targetNamespace="${namespace}"` : ""}>${content}</schema>`;
const origin = "https://allowed.example";
const uri = (name: string) => `${origin}/${name}`;
const pinned = (xml: string | Uint8Array): OfflineSchemaResource => { const bytes = typeof xml === "string" ? Buffer.from(xml) : xml; return {bytes, digest: createHash("sha256").update(bytes).digest("hex")}; };
const offline = (entries: [string, string][]) => new Map(entries.map(([name, xml]) => [uri(name), pinned(xml)]));
const local = (name: string) => loadSchemaInput(path.join(root, name), {policy: {fileRoots: [fixtures]}});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("contextual schema inputs", () => {
  it("interprets one chameleon resource in two namespaces and reuses repeated includes", async () => {
    const input = await local("chameleon.wsdl");
    expect(input.resources).toHaveLength(3);
    expect(input.schemas).toHaveLength(6);
    const common = input.schemas.filter(s => s.documentUri.endsWith("/common.xsd"));
    expect(common.map(s => s.targetNamespace)).toEqual(["urn:a", "urn:b"]);
    expect(common[0].syntax).toBe(common[1].syntax);
    expect(common[0].key).not.toBe(common[1].key);
    const fromA = input.edges.filter(e => e.referenceUri?.endsWith("common.xsd") && input.schemas.find(s => s.key === e.from)?.targetNamespace === "urn:a");
    expect(fromA).toHaveLength(2);
    expect(fromA[0].to).toBe(fromA[1].to);
  });

  it("keeps identical bytes at distinct base URIs separate", async () => {
    const input = await local("distinct-bases.xsd");
    const common = input.schemas.filter(s => s.documentUri.endsWith("common.xsd"));
    expect(common[0].digest).toBe(common[1].digest);
    expect(common[0].key).not.toBe(common[1].key);
    expect(input.schemas.filter(s => s.documentUri.endsWith("child.xsd")).map(s => s.syntax.children.filter(n => n.kind === "element").map(n => syntaxAttribute(n, "name")))).toEqual([["a"], ["b"]]);
    expect(input.resources).toHaveLength(5);
  });

  it("retains cycle edges and resolves local xml:base chains", async () => {
    const cycle = await local("cycle-a.xsd");
    expect(cycle.resources).toHaveLength(2);
    expect(cycle.edges.some(e => e.cycle)).toBe(true);
    expect(cycle.edges.every(e => e.to && cycle.schemas.some(s => s.key === e.to))).toBe(true);
    const chain = await local("base-chain.xsd");
    expect(chain.resources.map(r => path.basename(new URL(r.uri).pathname))).toEqual(["base-chain.xsd", "first.xsd", "leaf.xsd"]);
  });

  it("reuses the independently qualified relative-import input", async () => {
    const input = await loadSchemaInput(path.join(fixtures, "imports/import-relative-types.wsdl"), {policy: {fileRoots: [fixtures]}});
    expect(input.schemas.map(s => s.targetNamespace)).toEqual(["urn:conformance:import-relative-types", "urn:conformance:import-relative-types:types"]);
    expect(input.resources).toHaveLength(2);
    expect(input.edges[0].source.uri).toBe(input.root.uri);
  });

  it("handles WSDL imports and preserves multiple inline schemas of one namespace", async () => {
    const entries = offline([
      ["root.wsdl", '<w:definitions xmlns:w="http://schemas.xmlsoap.org/wsdl/" xmlns:x="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:root"><w:import namespace="urn:child" location="child.wsdl"/><w:types><x:schema targetNamespace="urn:test"/><x:schema targetNamespace="urn:test"/></w:types></w:definitions>'],
      ["child.wsdl", '<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" targetNamespace="urn:child"><import namespace="urn:root" location="root.wsdl"/></definitions>'],
    ]);
    const input = await loadSchemaInput(uri("root.wsdl"), {policy: {allowedOrigins: [origin]}, offlineResources: entries});
    expect(input.resources).toHaveLength(2);
    expect(input.schemas).toHaveLength(2);
    expect(input.schemas[0].key).not.toBe(input.schemas[1].key);
    expect(input.edges.some(e => e.kind === "wsdl-import" && e.cycle)).toBe(true);
  });

  it("uses the final checked redirect URI and inherited base, while fetching aliases once", async () => {
    const requested: string[] = [];
    const responses: Record<string, Response> = {
      [uri("entry")]: new Response(null, {status: 302, headers: {location: "/final/root.xsd"}}),
      [uri("final/root.xsd")]: new Response(schema('<include xml:base="../types/" schemaLocation="common.xsd"/><include schemaLocation="../types/common.xsd"/>')),
      [uri("types/common.xsd")]: new Response(schema("", "")),
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => { requested.push(url); expect(options.redirect).toBe("manual"); return responses[url]; }));
    const input = await loadSchemaInput(uri("entry"), {policy: {allowedOrigins: [origin]}});
    expect(input.root.uri).toBe(uri("final/root.xsd"));
    expect(requested).toEqual([uri("entry"), uri("final/root.xsd"), uri("types/common.xsd")]);
    expect(input.schemas).toHaveLength(2);
    expect(input.edges.every(e => e.referenceUri === uri("types/common.xsd"))).toBe(true);
  });

  it("preserves query identity and verifies pinned offline bytes without network", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const resources = offline([["root.xsd", schema('<include schemaLocation="common.xsd?v=1"/><include schemaLocation="common.xsd?v=2"/>')], ["common.xsd?v=1", schema("", "")], ["common.xsd?v=2", schema("", "")]]);
    const input = await loadSchemaInput(uri("root.xsd"), {policy: {allowedOrigins: [origin]}, offlineResources: resources});
    expect(input.resources).toHaveLength(3);
    expect(input.schemas).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled();
    resources.get(uri("root.xsd"))!.bytes[0] = 0;
    await expect(loadSchemaInput(uri("root.xsd"), {policy: {allowedOrigins: [origin]}, offlineResources: resources})).rejects.toMatchObject({category: "invalid-schema"});
    await expect(loadSchemaInput(uri("missing.xsd"), {policy: {allowedOrigins: [origin]}, offlineResources: resources})).rejects.toMatchObject({category: "transport"});
    expect(resolveResourceUri("HTTP://EXAMPLE.TEST:80/a/../x?v=1#part")).toBe("http://example.test/x?v=1");
  });

  it("rejects invalid composition with source diagnostics and never follows payload hints", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const [main, child, source] of [[schema('<include schemaLocation="child.xsd"/>'), schema("", "urn:other"), "child.xsd"], [schema('<import namespace="urn:other" schemaLocation="child.xsd"/>'), schema(), "child.xsd"], [schema('<include/>'), schema(), "root.xsd"], [schema('<import namespace="urn:test" schemaLocation="child.xsd"/>'), schema(), "root.xsd"]]) {
      await expect(loadSchemaInput(uri("root.xsd"), {policy: {allowedOrigins: [origin]}, offlineResources: offline([["root.xsd", main], ["child.xsd", child]])})).rejects.toMatchObject({category: "invalid-schema", source: expect.objectContaining({uri: uri(source)})});
    }
    const payload = '<p xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:x https://evil.example/evil.xsd"/>';
    await expect(loadSchemaInput(uri("root.xsd"), {policy: {allowedOrigins: [origin]}, offlineResources: offline([["root.xsd", payload]])})).rejects.toMatchObject({category: "unsupported-capability"});
    const annotated = schema('<annotation><appinfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:x https://evil.example/x"><include xmlns="urn:payload" schemaLocation="https://evil.example/x"/></appinfo></annotation>');
    expect((await loadSchemaInput(uri("root.xsd"), {policy: {allowedOrigins: [origin]}, offlineResources: offline([["root.xsd", annotated]])})).resources).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects forbidden schemes, origins, redirects, credentials and out-of-root symlinks", async () => {
    const fetch = vi.fn(async () => new Response(null, {status: 302, headers: {location: "https://evil.example/private?secret=hidden"}})); vi.stubGlobal("fetch", fetch);
    for (const source of ["ftp://allowed.example/x", "data:text/xml,hello", "https://evil.example/x", "https://user:secret@allowed.example/x"]) {
      await expect(loadSchemaInput(source, {policy: {allowedOrigins: [origin]}})).rejects.toMatchObject({category: "unsupported-capability"});
    }
    expect(fetch).not.toHaveBeenCalled();
    await expect(loadSchemaInput(uri("root.xsd"), {policy: {allowedOrigins: [origin]}})).rejects.toMatchObject({category: "unsupported-capability", message: expect.not.stringContaining("hidden")});
    expect(fetch).toHaveBeenCalledTimes(1);
    mkdirSync("tmp/conformance", {recursive: true});
    const temp = mkdtempSync(path.resolve("tmp/conformance/resolution-policy-"));
    try {
      const allowed = path.join(temp, "allowed"); mkdirSync(allowed);
      writeFileSync(path.join(temp, "outside.xsd"), schema());
      symlinkSync(path.join(temp, "outside.xsd"), path.join(allowed, "escape.xsd"));
      for (const file of [path.join(allowed, "escape.xsd"), path.join(allowed, "../outside.xsd")]) {
        await expect(loadSchemaInput(file, {policy: {fileRoots: [allowed]}})).rejects.toMatchObject({category: "unsupported-capability"});
      }
      await expect(loadSchemaInput(pathToFileURL(path.join(temp, "outside.xsd")).href, {policy: {}})).rejects.toMatchObject({category: "unsupported-capability"});
    } finally { rmSync(temp, {recursive: true, force: true}); }
  });
});
