import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {parseOrderedSyntax, resolveLexicalQName, syntaxAttribute, syntaxElements, XSD_NAMESPACE, XML_NAMESPACE} from "../../src/loader/orderedSyntax.js";
import type {SyntaxElement} from "../../src/loader/orderedSyntax.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";

const fixtures = path.resolve("test/conformance/fixtures");
const load = (name: string) => { const file = path.join(fixtures, name); return parseOrderedSyntax(readFileSync(file), pathToFileURL(file).href); };
const parse = (text: string, maxDepth?: number) => parseOrderedSyntax(Buffer.from(text), "https://allowed.example/schema.xsd", {maxDepth});
const descendants = (root: SyntaxElement): SyntaxElement[] => [root, ...syntaxElements(root).flatMap(descendants)];

describe("ordered syntax boundary", () => {
  it("retains compositor interleaving, local scope, attributes, text and inherited base", () => {
    const doc = load("xsd/syntax/ordered-namespaces.xsd");
    const types = syntaxElements(doc.root, XSD_NAMESPACE, "complexType");
    const sequence = syntaxElements(types[0], XSD_NAMESPACE, "sequence")[0];
    expect(syntaxElements(sequence).map(e => e.name.local)).toEqual(["element", "choice", "element", "any", "sequence"]);
    const [a, choice, repeatedA] = syntaxElements(sequence);
    const b = syntaxElements(choice)[0];
    expect(resolveLexicalQName(syntaxAttribute(a, "type")!, a)).toEqual({namespace: "urn:one", local: "First"});
    expect(resolveLexicalQName(syntaxAttribute(b, "type")!, b)).toEqual({namespace: "urn:two", local: "Second"});
    expect(resolveLexicalQName(syntaxAttribute(repeatedA, "type")!, repeatedA).namespace).toBe("urn:one");
    expect(syntaxAttribute(a, "form")).toBe("unqualified");
    expect(sequence.baseUri).toBe(new URL("schemas/nested/", doc.uri).href);
    expect(syntaxAttribute(sequence, "base", XML_NAMESPACE)).toBe("nested/");
    const info = descendants(doc.root).find(e => e.name.local === "appinfo")!;
    expect(info.children.map(n => n.kind === "text" ? n.value : n.name)).toEqual(["before", {namespace: "urn:one", local: "note"}, "after"]);
    const note = syntaxElements(info)[0];
    expect(note.attributes.map(a => a.name.namespace)).toEqual(["", "urn:one"]);
    expect(Object.isFrozen(sequence)).toBe(true);
    expect(Object.isFrozen(sequence.children)).toBe(true);
  });

  it("keeps prefix-equivalent names and distinct scoped declaration paths", () => {
    const docs = [load("xsd/syntax/ordered-namespaces.xsd"), load("xsd/syntax/default-namespaces.xsd")];
    const meaning = (root: SyntaxElement) => descendants(root).map(e => ({name: e.name, attrs: e.attributes.map(a => [a.name,
      a.name.local === "type" ? resolveLexicalQName(a.value, e) : a.value])}));
    expect(meaning(docs[0].root)).toEqual(meaning(docs[1].root));
    const locals = descendants(docs[0].root).filter(e => syntaxAttribute(e, "name") === "a");
    expect(new Set(locals.map(e => e.source.path)).size).toBe(3);
    const unprefixed = docs[1].root;
    expect(unprefixed.name.namespace).toBe(XSD_NAMESPACE);
    expect(unprefixed.attributes.find(a => a.name.local === "targetNamespace")?.name.namespace).toBe("");
    expect(resolveLexicalQName("string", unprefixed)).toEqual({namespace: XSD_NAMESPACE, local: "string"});
  });

  it("pins full URI/digest and exact element source spans", () => {
    const bytes = Buffer.from('<r>\r\n  <x v="&amp;">text</x>\r\n</r>');
    const doc = parseOrderedSyntax(bytes, "https://allowed.example/a.xsd?version=1");
    const x = syntaxElements(doc.root)[0];
    expect(x.source.uri).toBe(doc.uri);
    expect(x.source.digest).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(x.source.start).toEqual({offset: 7, line: 2, column: 3});
    expect(bytes.toString().slice(x.source.start.offset, x.source.end.offset)).toBe('<x v="&amp;">text</x>');
    expect(syntaxAttribute(x, "v")).toBe("&");
    expect(x.children[0].source.start.offset).toBe(20);
  });

  it("preserves independent S01 and S02 inputs without name-keyed materialization", () => {
    const root = load("xsd/compositors/content-model-boundaries.wsdl").root;
    expect(descendants(root).some(e => e.name.local === "any")).toBe(true);
    const xml = load("soap/content-model/ordered.xml").root;
    expect(descendants(xml).length).toBeGreaterThan(5);
    expect(syntaxElements(syntaxElements(xml)[0]).map(e => e.name.local)).toEqual(["a", "b", "c", "a", "b"]);
    const kind = syntaxElements(xml).find(e => e.name.local === "kind")!;
    expect(resolveLexicalQName(kind.children.filter(n => n.kind === "text").map(n => n.value).join(""), kind)).toEqual({namespace: "urn:kind", local: "T"});
  });

  it("leaves the legacy loader and relative import contract working", async () => {
    const catalog = await loadWsdl(path.join(fixtures, "xsd/imports/import-relative-types.wsdl"));
    expect(catalog.schemas.map(s => s.targetNS)).toContain("urn:conformance:import-relative-types:types");
    expect(catalog.schemas[0].xml["@_elementFormDefault"]).toBe("qualified");
  });

  it("rejects DTDs, declared/unknown entities, malformed namespaces and QNames", () => {
    for (const xml of ['<!DOCTYPE r [<!ENTITY e "x">]><r>&e;</r>', '<!DOCTYPE r SYSTEM "https://bad.example/dtd"><r/>', '<r>&unknown;</r>', '<p:r/>', '<r xmlns:p="urn:x" p:a="1" xmlns:q="urn:x" q:a="2"/>']) {
      expect(() => parse(xml)).toThrow();
    }
    for (const name of ["missing:Type", "a:b:c", "1bad", "a b"]) expect(() => resolveLexicalQName(name, parse('<r/>').root)).toThrow();
    expect(resolveLexicalQName("名", parse('<r/>').root).local).toBe("名");
  });

  it("accepts depth 256 and fails at 257 with a resource diagnostic", () => {
    const nested = (n: number) => "<x>".repeat(n) + "</x>".repeat(n);
    expect(() => parse(nested(256))).not.toThrow();
    expect(() => parse(nested(257))).toThrow(expect.objectContaining({category: "resource-limit", source: expect.objectContaining({uri: "https://allowed.example/schema.xsd"})}));
    expect(() => parse(nested(3), 2)).toThrow();
    expect(() => parse("<r/>", 0)).toThrow(RangeError);
  });

  it("decodes UTF-8/UTF-16 strictly and retains CDATA text", () => {
    expect(parse('<r><![CDATA[a<b]]><x/>c</r>').root.children.map(n => n.kind === "text" ? n.value : n.name.local)).toEqual(["a<b", "x", "c"]);
    expect(parseOrderedSyntax(Buffer.concat([Buffer.from([255, 254]), Buffer.from('<r>é</r>', 'utf16le')]), "file:///a.xsd").root.children[0]).toMatchObject({value: "é"});
    expect(() => parseOrderedSyntax(Buffer.from([0xff]), "file:///a.xsd")).toThrow();
    expect(() => parse('<?xml version="1.0" encoding="ISO-8859-1"?><r/>')).toThrow(expect.objectContaining({category: "unsupported-capability"}));
  });
});
