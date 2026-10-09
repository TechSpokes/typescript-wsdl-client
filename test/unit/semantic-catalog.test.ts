import path from "node:path";
import {cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {afterEach, describe, expect, it} from "vitest";
import {loadSchemaInput} from "../../src/loader/schemaInput.js";
import {buildCanonicalGraph} from "../../src/compiler/buildCanonicalGraph.js";
import {scopedId} from "../../src/compiler/canonicalGraph.js";
import {artifactGraph, semanticGraphFingerprint} from "../../src/compiler/catalogProvenance.js";
import {canonicalJson, parseCatalogJson} from "../../src/compiler/catalogErrors.js";
import {createSemanticCatalog, serializeSemanticCatalog, readCatalog, readCatalogFile, readLegacyCatalogFile, prepareCompilationInput, deriveCompatibilityView, CatalogError} from "../../src/compiler/semanticCatalog.js";
import type {SemanticCatalog} from "../../src/compiler/semanticCatalog.js";
import type {ComplexTypeNode, ElementNode, ParticleNode} from "../../src/compiler/canonicalGraph.js";
import {generateOpenAPI} from "../../src/openapi/generateOpenAPI.js";
import {applyShapeCatalogs} from "../../src/compiler/shapeResolver.js";

const fixtures = path.resolve("test/conformance/fixtures");
const temps: string[] = [];
const temp = () => {mkdirSync("tmp/conformance/catalogs", {recursive: true}); const dir = mkdtempSync(path.resolve("tmp/conformance/catalogs/input-")); temps.push(dir); return dir;};
afterEach(() => {for (const dir of temps.splice(0)) rmSync(dir, {recursive: true, force: true});});
const build = async (source = path.join(fixtures, "xsd/graph/shared-recursive.xsd")) => buildCanonicalGraph(await loadSchemaInput(source, {policy: {fileRoots: [fixtures]}}));
const catalog = async () => createSemanticCatalog(await build());
const read = (text: string, limits = {}) => readCatalog(text, {mode: "faithful", ...limits});

describe("versioned semantic catalogs", () => {
  it("round trips exact structure, lexical constraints, local identities, shared links and recursion", async () => {
    const c = await catalog(), text = serializeSemanticCatalog(c), result = read(text);
    expect(result.kind).toBe("semantic");
    if (result.kind !== "semantic") throw Error("semantic catalog");
    expect(serializeSemanticCatalog(result.catalog)).toBe(text);
    expect(canonicalJson(result.catalog.graph)).toBe(canonicalJson(c.graph));
    expect(Object.isFrozen(result.catalog.graph.nodes)).toBe(true);
    expect(result.catalog.graph.nodes.some(n => n.kind === "particle" && n.occurs.max === "900719925474099312345678901234567890")).toBe(true);
    expect(result.catalog.graph.nodes.some(n => n.kind === "attribute" && n.value?.lexical.value === "007")).toBe(true);
    expect(result.catalog.graph.nodes.some(n => n.kind === "simpleType" && n.variety.kind === "restriction" && n.variety.facets.some(f => f.lexical.context.namespaces.q === "urn:rebound"))).toBe(true);
  });

  it("serializes identically across directories and repeated root/include contexts", async () => {
    const texts: string[] = [];
    for (let i = 0; i < 2; i++) {
      const dir = temp(); cpSync(path.join(fixtures, "xsd/graph"), dir, {recursive: true});
      const g = buildCanonicalGraph(await loadSchemaInput(path.join(dir, "chameleon.wsdl"), {policy: {fileRoots: [dir]}}));
      const c = createSemanticCatalog(g); texts.push(serializeSemanticCatalog(c));
      expect(c.graph.globals).toHaveLength(4);
      expect(texts[i]).not.toContain(dir);
      expect(texts[i]).not.toContain("file://");
      expect(semanticGraphFingerprint(g)).toBe(c.semanticFingerprint);
    }
    expect(texts[0]).toBe(texts[1]);
  });

  it("keeps provenance/documentation separate from semantic fingerprints", async () => {
    const g = await build();
    const changed = JSON.parse(JSON.stringify(g));
    changed.schemaAnnotations[0].children[0].children[0].value = "Different documentation";
    for (const n of changed.nodes) n.context.source.digest = "a".repeat(64);
    expect(semanticGraphFingerprint(changed)).toBe(semanticGraphFingerprint(g));
    const c = await catalog();
    const shared = c.graph.nodes.find(n => n.kind === "complexType" && n.identity.kind === "global" && n.identity.name.local === "Shared")! as ComplexTypeNode;
    const seq = c.graph.nodes.find(n => n.id === shared.content)! as ParticleNode;
    expect(seq.context.baseUri).toMatch(/^urn:base:sha256:/);
    expect(seq.context.source.uri).toBe(`urn:source:sha256:${seq.context.source.digest}`);
    expect(new Set([seq.context.baseUri, shared.context.baseUri]).size).toBe(2);
    const view = deriveCompatibilityView(c.graph);
    expect(view.derived).toBe(true);
    expect(view.symbols.map(s => s.id)).toEqual(c.graph.globals);
  });

  it("keeps annotations with ordered text/attributes and operation-binding reference roles", async () => {
    const c = createSemanticCatalog(await build(path.join(fixtures, "soap/content-model/probe.wsdl")));
    const result = read(serializeSemanticCatalog(c));
    if (result.kind !== "semantic") throw Error("catalog");
    const binding = result.catalog.graph.nodes.find(n => n.kind === "wsdl" && n.role === "binding")!;
    expect(binding).toMatchObject({references: [{reference: {kind: "symbol", role: "portType"}}]});
    expect(JSON.stringify(result.catalog)).toContain("http://127.0.0.1:1/first");
    const g = createSemanticCatalog(await build());
    const appinfo = g.graph.schemaAnnotations[0].children[0];
    expect(appinfo.kind).toBe("element");
    if (appinfo.kind !== "element") throw Error("appinfo");
    expect(appinfo.children.map(c => c.kind)).toEqual(["text", "element", "text"]);
  });

  it("rejects unknown versions/models/profiles, required fields and corrupt fingerprints", async () => {
    const c = await catalog();
    for (const change of [{catalogFormat: 3}, {catalogFormat: "2"}, {model: "unknown"}, {profile: "unknown"}, {semanticFingerprint: "0".repeat(64)}]) expect(() => read(JSON.stringify({...c, ...change}))).toThrowError(expect.objectContaining({category: "incompatible-artifact"}));
    expect(() => read(JSON.stringify({...c, futureMandatory: true}))).toThrowError(expect.objectContaining({category: "invalid-schema"}));
    expect(() => read('{"catalogFormat":999,"catalogFormat":2}')).toThrowError(expect.objectContaining({category: "invalid-schema"}));
    expect(() => read('{"a":1,"\\u0061":2}')).toThrowError(expect.objectContaining({category: "invalid-schema"}));
    expect(() => read('{"graph":{}}')).toThrowError(expect.objectContaining({category: "incompatible-artifact"}));
  });

  it("rejects malformed node shapes, corrupt IDs, references, role links and exact bounds", async () => {
    const text = serializeSemanticCatalog(await catalog());
    const mutations = [
      (c: SemanticCatalog) => {(c.graph.nodes[0] as any).unknown = true;},
      (c: SemanticCatalog) => {(c.graph.nodes[0] as any).id = "bad";},
      (c: SemanticCatalog) => {(c.graph.nodes.find(n => n.kind === "particle") as any).occurs.min = 0;},
      (c: SemanticCatalog) => {(c.graph.nodes.find(n => n.kind === "particle") as any).occurs.max = "9007199254740993.5";},
      (c: SemanticCatalog) => {(c.graph.nodes.find(n => n.kind === "particle") as any).occurs.min = "99999999999999999999999999999999999999999999999999";},
      (c: SemanticCatalog) => {const n = c.graph.nodes.find(n => n.kind === "element" && n.type.kind === "symbol")! as ElementNode; (n.type as any).target = "missing";},
      (c: SemanticCatalog) => {const n = c.graph.nodes.find(n => n.kind === "element" && n.type.kind === "symbol")! as ElementNode; (n.type as any).lexical.context.namespaces.t = "urn:corrupt";},
      (c: SemanticCatalog) => {(c.graph.nodes.find(n => n.kind === "complexType") as any).content = "missing";},
      (c: SemanticCatalog) => {(c.graph.nodes[0] as any).context.source.end.offset = 0;},
      (c: SemanticCatalog) => {(c.graph.nodes.find(n => n.kind === "attribute" && n.type.kind === "builtin") as any).type.name.local = "FakeBuiltin";},
      (c: SemanticCatalog) => {(c.graph.globals as string[]).pop();},
    ];
    for (const mutate of mutations) {const c = JSON.parse(text); mutate(c); expect(() => read(JSON.stringify(c))).toThrowError(expect.objectContaining({category: "invalid-schema"}));}
  });

  it("rejects particle containment cycles and shared structural use sites", async () => {
    const text = serializeSemanticCatalog(await catalog());
    for (const mode of ["self", "duplicate"] as const) {
      const c = JSON.parse(text), p = c.graph.nodes.find((n: any) => n.kind === "particle" && n.term.kind === "sequence");
      p.term.children = mode === "self" ? [p.id] : [p.term.children[0], p.term.children[0]];
      expect(() => read(JSON.stringify(c))).toThrowError(expect.objectContaining({category: "invalid-schema"}));
    }
  });

  it("rejects inconsistent QName contexts, private provenance and impossible structural shapes", async () => {
    const text = serializeSemanticCatalog(await catalog());
    const mutations = [
      (c: any) => {c.graph.nodes.find((n: any) => n.kind === "attribute" && n.type.kind === "builtin").type.lexical.value = "xs:boolean";},
      (c: any) => {c.graph.nodes.find((n: any) => n.kind === "attribute" && n.type.kind === "builtin").type.lexical.value = "unknown:Type";},
      (c: any) => {const o = c.graph.origins[c.graph.nodes[0].id][0], t = JSON.parse(o.interpretation); t[2] = "https://private.test/schema?token=secret"; o.interpretation = JSON.stringify(t);},
      (c: any) => {const seq = c.graph.nodes.find((n: any) => n.kind === "particle" && n.term.kind === "sequence" && n.term.children.length > 3), choice = c.graph.nodes.find((n: any) => n.kind === "particle" && n.term.kind === "choice"); choice.term.children.push(seq.term.children[0]);},
      (c: any) => {const all = c.graph.nodes.find((n: any) => n.kind === "particle" && n.term.kind === "all"), seq = structuredClone(all); seq.identity.path += "/99"; seq.context.source.path += "/99"; seq.id = scopedId(seq.identity.owner, seq.identity.path, "particle"); seq.term = {kind: "sequence", children: [all.id]}; c.graph.nodes.push(seq); c.graph.origins[seq.id] = c.graph.origins[all.id]; c.graph.nodes.find((n: any) => n.content === all.id).content = seq.id;},
      (c: any) => {c.graph.nodes.find((n: any) => n.kind === "simpleType" && n.variety.kind === "union").variety.members = [];},
    ];
    for (const mutate of mutations) {const c = JSON.parse(text); mutate(c); expect(() => read(JSON.stringify(c))).toThrowError(expect.objectContaining({category: "invalid-schema"}));}
    const wsdl = JSON.parse(serializeSemanticCatalog(createSemanticCatalog(await build(path.join(fixtures, "soap/content-model/probe.wsdl")))));
    const r = wsdl.graph.nodes.find((n: any) => n.kind === "wsdl" && n.role === "binding").references[0].reference;
    r.lexical.context.namespaces.tns = "urn:other"; r.name.namespace = "urn:other"; delete r.target;
    wsdl.semanticFingerprint = semanticGraphFingerprint(wsdl.graph);
    expect(() => read(JSON.stringify(wsdl))).toThrowError(expect.objectContaining({category: "invalid-schema"}));
  });

  it("normalizes only display tables and specifies a language-neutral scoped ID vector", async () => {
    const c = await catalog(), reordered = JSON.parse(serializeSemanticCatalog(c));
    reordered.graph.nodes.reverse(); reordered.graph.globals.reverse();
    const result = read(JSON.stringify(reordered));
    if (result.kind !== "semantic") throw Error("catalog");
    expect(serializeSemanticCatalog(result.catalog)).toBe(serializeSemanticCatalog(c));
    expect(scopedId("parent", "/0/1", "type")).toBe("scoped:f325bc3d3205fbca17c95034c3a1093ed14ce66b9db6347931ad6890c026f65f");
  });

  it("excludes parsed documentation additions while detecting changed semantic order and bounds", async () => {
    for (const [relative, insert] of [
      ["soap/content-model/probe.wsdl", (xml: string) => xml.replace(/(<wsdl:portType\b[^>]*>)/, "$1<wsdl:documentation>New documentation</wsdl:documentation>\n")],
      ["xsd/graph/shared-recursive.xsd", (xml: string) => xml.replace('<xs:complexType name="Shared" mixed="true">', '<xs:complexType name="Shared" mixed="true"><xs:annotation><xs:documentation>New documentation</xs:documentation></xs:annotation>\n')],
    ] as const) {
      const dir = temp(), source = path.join(fixtures, relative), changed = path.join(dir, path.basename(source));
      writeFileSync(changed, insert(readFileSync(source, "utf8")));
      const modified = buildCanonicalGraph(await loadSchemaInput(changed, {policy: {fileRoots: [dir]}}));
      expect(semanticGraphFingerprint(modified)).toBe(semanticGraphFingerprint(await build(source)));
    }
    const c = await catalog(), modified = JSON.parse(JSON.stringify(c.graph));
    modified.nodes.find((n: any) => n.kind === "particle" && n.term.kind === "choice").term.children.reverse();
    expect(semanticGraphFingerprint(modified)).not.toBe(c.semanticFingerprint);
    modified.nodes.find((n: any) => n.kind === "particle").occurs.max = "999";
    expect(semanticGraphFingerprint(modified)).not.toBe(c.semanticFingerprint);
  });

  it("never remaps lexical namespace dictionaries as structural references", async () => {
    const id = (await build()).nodes.find(n => n.kind === "complexType" && n.identity.kind === "global" && n.identity.name.local === "Shared")! as ComplexTypeNode;
    const xml = readFileSync(path.join(fixtures, "xsd/graph/shared-recursive.xsd"), "utf8").replace('xmlns:q="urn:qname"', `xmlns:q="urn:qname" xmlns:target="${id.content}"`);
    const dir = temp(), fingerprints: string[] = [];
    for (const [i, text] of [xml, xml.replace('<xs:complexType name="Shared" mixed="true">', '<xs:complexType name="Shared" mixed="true"><xs:annotation><xs:documentation>New</xs:documentation></xs:annotation>')].entries()) {
      const source = path.join(dir, `${i}.xsd`); writeFileSync(source, text);
      fingerprints.push(semanticGraphFingerprint(buildCanonicalGraph(await loadSchemaInput(source, {policy: {fileRoots: [dir]}}))));
    }
    expect(fingerprints[0]).toBe(fingerprints[1]);
  });

  it("rejects oversized UTF-8 input, deep JSON, invalid encoding and special files", async () => {
    const text = serializeSemanticCatalog(await catalog());
    expect(read(text, {maxBytes: Buffer.byteLength(text)}).kind).toBe("semantic");
    expect(() => read(text, {maxBytes: Buffer.byteLength(text) - 1})).toThrowError(expect.objectContaining({category: "resource-limit"}));
    expect(() => read(text, {maxNodes: 2})).toThrowError(expect.objectContaining({category: "resource-limit"}));
    expect(() => parseCatalogJson('"☃"', {maxBytes: 4})).toThrowError(expect.objectContaining({category: "resource-limit"}));
    expect(() => parseCatalogJson("[".repeat(1025) + "0" + "]".repeat(1025))).toThrowError(expect.objectContaining({category: "resource-limit"}));
    expect(parseCatalogJson("[".repeat(1024) + "0" + "]".repeat(1024))).toBeInstanceOf(Array);
    expect(parseCatalogJson('{"text":"[[[["}', {maxDepth: 1})).toEqual({text: "[[[["});
    const dir = temp(), file = path.join(dir, "catalog.json"); writeFileSync(file, text);
    expect(readCatalogFile(file, {mode: "faithful"}).kind).toBe("semantic");
    expect(() => readCatalogFile(file, {maxBytes: 1})).toThrowError(expect.objectContaining({category: "resource-limit"}));
    writeFileSync(file, Buffer.from([0xff]));
    expect(() => readCatalogFile(file)).toThrowError(expect.objectContaining({category: "invalid-schema"}));
    if (process.platform !== "win32") {
      const fifo = path.join(dir, "fifo"); execFileSync("mkfifo", [fifo]);
      expect(() => readCatalogFile(fifo)).toThrowError(expect.objectContaining({category: "invalid-schema"}));
    }
  });

  it("omits source URL queries and rejects credential-bearing URIs explicitly", async () => {
    const dir = temp(), source = path.join(dir, "schema.xsd");
    const xml = readFileSync(path.join(fixtures, "xsd/graph/shared-recursive.xsd"));
    writeFileSync(source, xml);
    const g = buildCanonicalGraph(await loadSchemaInput(source, {policy: {fileRoots: [dir]}}));
    const changed = JSON.parse(JSON.stringify(g));
    for (const n of changed.nodes) {n.context.source.uri = "https://schemas.test/private?token=secret"; n.context.baseUri = "https://schemas.test/private?token=secret";}
    expect(JSON.stringify(artifactGraph(changed))).not.toContain("secret");
    changed.nodes[0].context.baseUri = "https://user:password@schemas.test/private";
    expect(() => createSemanticCatalog(changed)).toThrowError(expect.objectContaining({category: "incompatible-artifact"}));
  });

  it("exercises the approved source/catalog and legacy/faithful matrix through real dispatch", async () => {
    const source = path.join(fixtures, "soap/content-model/probe.wsdl");
    const legacy = await prepareCompilationInput({kind: "source", source});
    expect(legacy.kind).toBe("legacy");
    if (legacy.kind !== "legacy") throw Error("legacy");
    const legacyText = JSON.stringify(legacy.catalog);
    expect(readCatalog(legacyText).kind).toBe("legacy");
    expect(read(legacyText)).toMatchObject({kind: "regeneration-required", category: "incompatible-artifact", requiredInput: "original-source", command: expect.stringContaining("prepareCompilationInput")});
    const semantic = await prepareCompilationInput({kind: "source", source}, {mode: "faithful", loading: {policy: {fileRoots: [fixtures]}}});
    expect(semantic.kind).toBe("semantic");
    if (semantic.kind !== "semantic") throw Error("semantic");
    expect(read(serializeSemanticCatalog(semantic.catalog)).kind).toBe("semantic");
    expect(() => readCatalog(serializeSemanticCatalog(semantic.catalog))).toThrowError(expect.objectContaining({category: "incompatible-artifact"}));
    const dir = temp(), file = path.join(dir, "legacy.json"); writeFileSync(file, legacyText);
    expect(readLegacyCatalogFile(file)).toEqual(legacy.catalog);
    expect(() => readCatalog('{"bundleFormat":1}')).toThrowError(expect.objectContaining({category: "incompatible-artifact"}));
    expect(() => readCatalog('{"types":[]}')).toThrowError(CatalogError);
  });

  it("guards existing CLI, OpenAPI and companion readers before legacy consumers", async () => {
    const dir = temp(), file = path.join(dir, "structural.json");
    writeFileSync(file, serializeSemanticCatalog(await catalog()));
    await expect(generateOpenAPI({catalogFile: file, outFile: path.join(dir, "openapi.json")})).rejects.toMatchObject({category: "incompatible-artifact"});
    const legacy = await prepareCompilationInput({kind: "source", source: path.join(fixtures, "soap/content-model/probe.wsdl")});
    if (legacy.kind !== "legacy") throw Error("legacy");
    await expect(applyShapeCatalogs(legacy.catalog, {shapeCatalogs: {structural: {catalogFile: file}}, operations: {Submit: {mode: "stream", format: "ndjson", mediaType: "application/x-ndjson", recordPath: [], recordTypeName: "RecordType", shapeCatalogName: "structural"}}}, {baseDir: dir})).rejects.toMatchObject({category: "incompatible-artifact"});
    for (const command of ["client", "app"] as const) {
      const args = command === "client" ? ["--client-dir", path.join(dir, "client")] : ["--client-dir", dir, "--gateway-dir", dir, "--openapi-file", path.join(dir, "openapi.json"), "--app-dir", path.join(dir, "app")];
      try {execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", command, "--catalog-file", file, ...args], {encoding: "utf8", stdio: "pipe"}); throw Error("CLI unexpectedly accepted structural catalog");}
      catch (e) {const result = e as {status?: number; stderr?: string}; expect(result.status).toBe(1); expect(result.stderr).toContain("Legacy consumer cannot read a structural catalog");}
    }
  });
});
