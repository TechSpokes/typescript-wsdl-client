import {afterAll, describe, expect, it} from "vitest";
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import path from "node:path";
import {buildCanonicalGraph} from "../../src/compiler/buildCanonicalGraph.js";
import {prepareCorrectedSourceInputs, inspectSourceCorrectionInventory, recoverOriginalSourceCorrectionTarget, SourceCorrectionError} from "../../src/compiler/sourceCorrections.js";
import type {SourceCorrectionInventory, SourceCorrectionInventoryNode, SourceCorrectionSelector} from "../../src/compiler/sourceCorrections.js";
import {copyOriginalSchemaResource, loadSemanticSchemaInput} from "../../src/loader/schemaInput.js";
import type {SchemaInput} from "../../src/loader/schemaInput.js";
import {XSD_NAMESPACE} from "../../src/loader/orderedSyntax.js";

const fixtures = path.resolve("test/conformance/fixtures");
const temporaryParent = path.resolve('tmp/conformance');
mkdirSync(temporaryParent, {recursive: true});
const temporaryRoot = mkdtempSync(path.join(temporaryParent, "wsdl-source-corrections-"));
afterAll(() => rmSync(temporaryRoot, {recursive: true, force: true}));

async function loadFixture(relative: string): Promise<SchemaInput> {
  return loadSemanticSchemaInput(path.join(fixtures, relative), {policy: {fileRoots: [fixtures]}});
}
function pins(inventory: SourceCorrectionInventory) {
  return inventory.resources.map(({uri, digest}) => ({uri, digest}));
}
function selector(node: SourceCorrectionInventoryNode): SourceCorrectionSelector {
  return {id: node.id, uri: node.uri, digest: node.digest};
}
function requiredNode(inventory: SourceCorrectionInventory, predicate: (node: SourceCorrectionInventoryNode) => boolean, label: string): SourceCorrectionInventoryNode {
  const found = inventory.nodes.find(predicate);
  if (!found) throw new Error(`Missing correction inventory target ${label}`);
  return found;
}
function attr(node: SourceCorrectionInventoryNode, name: string): string | undefined {
  return node.attributes.find(attribute => attribute.namespace === "" && attribute.name === name)?.value;
}
function recipe(resources: ReturnType<typeof pins>, corrections: unknown[]) {
  return {version: 1, resources, corrections};
}

describe("source correction recipes", () => {
  it('does not mistake Unicode namespace characters for removable XML whitespace when narrowing', async () => {
    const file = path.join(temporaryRoot, 'namespace-identity.xsd');
    writeFileSync(file, `<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="urn:source"><xs:complexType name="Payload"><xs:sequence><xs:any namespace="urn:payload\u00a0"/></xs:sequence></xs:complexType></xs:schema>`);
    const input = await loadSemanticSchemaInput(file, {policy: {fileRoots: [temporaryRoot]}});
    const inventory = inspectSourceCorrectionInventory([input]);
    const wildcard = requiredNode(inventory, node => Boolean(node.wildcard), 'wildcard');
    try {
      prepareCorrectedSourceInputs([input], recipe(pins(inventory), [{kind: 'set-wildcard-namespaces', target: selector(wildcard), namespaces: ['urn:payload']}]));
      throw new Error('A different namespace must not be admitted as a narrowing correction');
    } catch (error) {
      expect(error).toBeInstanceOf(SourceCorrectionError);
      expect((error as SourceCorrectionError).category).toBe('unsupported-target');
    }
  });
  it("applies occurrence, wildcard, and sequence edits to pinned original XML spans", async () => {
    const input = await loadFixture("xsd/compositors/content-model-boundaries.wsdl");
    const inventory = inspectSourceCorrectionInventory([input]);
    const anchor = requiredNode(inventory, node => node.kind === "particle" && node.syntaxName.local === "element" && attr(node, "name") === "a", "Ordering.a");
    const orderingSequence = requiredNode(inventory, node => node.kind === "particle" && node.syntaxName.local === "sequence" && node.children?.includes(anchor.id), "Ordering sequence");
    const zeroRow = requiredNode(inventory, node => node.kind === "particle" && node.syntaxName.local === "element" && attr(node, "name") === "row" && attr(node, "maxOccurs") === "0", "ZeroElement.row");
    const wildcard = requiredNode(inventory, node => node.kind === "particle" && node.wildcard?.namespace === "##other", "Wildcard xs:any");
    const original = copyOriginalSchemaResource(input, inventory.resources[0]!.uri, () => {});
    const corrected = prepareCorrectedSourceInputs([input], recipe(pins(inventory), [
      {kind: "set-occurs", target: selector(zeroRow), min: "0", max: "2"},
      {kind: "set-wildcard-namespaces", target: selector(wildcard), namespaces: ["urn:payload"]},
      {kind: "insert-element", target: selector(orderingSequence), position: {kind: "before", target: selector(anchor)},
        element: {kind: "declaration", name: "added", type: {namespace: XSD_NAMESPACE, local: "string"}, min: "0", max: "2"}},
    ]));
    const resource = corrected.resources.get(inventory.resources[0]!.uri);
    expect(resource).toBeDefined();
    expect(resource!.digest).not.toBe(inventory.resources[0]!.digest);
    expect(Buffer.from(copyOriginalSchemaResource(input, inventory.resources[0]!.uri, () => {}))).toEqual(Buffer.from(original));
    expect(corrected.provenance.resources).toMatchObject([{changed: true, originalDigest: inventory.resources[0]!.digest}]);

    const correctedInput = await loadSemanticSchemaInput(input.root.uri, {policy: {fileRoots: [fixtures]}, offlineResources: corrected.resources});
    const next = inspectSourceCorrectionInventory([correctedInput]);
    expect(requiredNode(next, node => node.kind === "particle" && attr(node, "name") === "row" && attr(node, "maxOccurs") === "2", "corrected row")).toBeDefined();
    expect(requiredNode(next, node => node.kind === "particle" && node.wildcard?.namespace === "urn:payload" && node.wildcard.processContents === "lax", "corrected wildcard")).toBeDefined();
    const added = requiredNode(next, node => node.kind === "element" && node.name?.local === "added", "corrected added element");
    const graph = buildCanonicalGraph(correctedInput);
    const addedGraphNode = graph.nodes.find(node => node.id === added.id);
    expect(addedGraphNode?.kind).toBe("element");
    if (addedGraphNode?.kind === "element") expect(addedGraphNode.type).toMatchObject({kind: "builtin", name: {namespace: XSD_NAMESPACE, local: "string"}});
    const originalA = inventory.nodes.find(node => node.kind === 'element' && attr(node, 'name') === 'a')!;
    const effectiveA = graph.nodes.find(node => node.kind === 'element' && node.name.local === 'a')!;
    expect(recoverOriginalSourceCorrectionTarget(corrected, effectiveA.context.source, effectiveA.context.effectiveNamespace, 'element'))
      .toMatchObject({kind: 'available', target: selector(originalA), declaredType: {namespace: XSD_NAMESPACE, local: 'string'}});
    expect(recoverOriginalSourceCorrectionTarget(corrected, addedGraphNode!.context.source, addedGraphNode!.context.effectiveNamespace, 'element'))
      .toEqual({kind: 'unavailable', reason: 'original-target-not-established'});
  });

  it("inserts existing complex types and element references at multiple original anchors", async () => {
    const wsdlPath = path.join(temporaryRoot, "payload.xsd");
    writeFileSync(wsdlPath, `<?xml version="1.0" encoding="UTF-8"?>\n<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="urn:source&amp;schema">\n  <xs:complexType name="Payload"><xs:sequence><xs:element name="A" type="xs:string"/><xs:element name="B" type="xs:string"/></xs:sequence></xs:complexType>\n  <xs:element name="Existing" type="xs:string"/>\n</xs:schema>`, "utf8");
    const input = await loadSemanticSchemaInput(wsdlPath, {policy: {fileRoots: [temporaryRoot]}});
    const inventory = inspectSourceCorrectionInventory([input]);
    const anchorA = requiredNode(inventory, node => node.kind === "particle" && attr(node, "name") === "A", "Payload.A");
    const anchorB = requiredNode(inventory, node => node.kind === "particle" && attr(node, "name") === "B", "Payload.B");
    const sequence = requiredNode(inventory, node => node.kind === "particle" && node.syntaxName.local === "sequence" && node.children?.includes(anchorA.id), "Payload sequence");
    const existing = requiredNode(inventory, node => node.kind === "element" && node.name?.local === "Existing", "global Existing");
    const ns = "urn:source&schema";
    const corrected = prepareCorrectedSourceInputs([input], recipe(pins(inventory), [
      {kind: "insert-element", target: selector(sequence), position: {kind: "before", target: selector(anchorA)},
        element: {kind: "declaration", name: "Before", type: {namespace: ns, local: "Payload"}, min: "0", max: "1"}},
      {kind: "insert-element", target: selector(sequence), position: {kind: "after", target: selector(anchorA)},
        element: {kind: "declaration", name: "After", type: {namespace: XSD_NAMESPACE, local: "string"}, min: "0", max: "unbounded"}},
      {kind: "insert-element", target: selector(sequence), position: "append",
        element: {kind: "reference", target: selector(existing), min: "0", max: "1"}},
    ]));
    const text = new TextDecoder("utf-8").decode(corrected.resources.get(input.root.uri)!.bytes);
    expect(text).toContain('xmlns:correction="urn:source&amp;schema"');
    expect(text).toContain('type="correction:Payload"');
    expect(text).toContain('ref="correction:Existing"');
    expect(text).toContain('encoding="UTF-8"');

    const correctedInput = await loadSemanticSchemaInput(input.root.uri, {policy: {fileRoots: [temporaryRoot]}, offlineResources: corrected.resources});
    const graph = buildCanonicalGraph(correctedInput);
    const payload = graph.nodes.find(node => node.kind === "complexType" && node.identity.kind === "global" && node.identity.name.local === "Payload");
    if (!payload || payload.kind !== "complexType" || !payload.content) throw new Error("Missing corrected Payload type");
    const contents = graph.nodes.find(node => node.id === payload.content);
    if (!contents || contents.kind !== "particle" || contents.term.kind !== "sequence") throw new Error("Missing corrected Payload sequence");
    const particles = contents.term.children.map(id => graph.nodes.find(node => node.id === id)).filter((node): node is NonNullable<typeof node> => Boolean(node));
    const localElementNames = particles.filter(node => node.kind === "particle" && node.term.kind === "element").map(node => {
      if (node.kind !== "particle" || node.term.kind !== "element" || node.term.declaration.kind !== "local") return "";
      const declaration = graph.nodes.find(candidate => candidate.id === node.term.declaration.target);
      return declaration?.kind === "element" ? declaration.name.local : "";
    });
    expect(localElementNames.filter(Boolean)).toEqual(["Before", "A", "After", "B"]);
    const localName = (id: string) => {
      const found = graph.nodes.find(candidate => candidate.id === id);
      return found?.kind === "element" ? found.name.local : undefined;
    };
    const beforeParticle = particles.find(node => node.kind === "particle" && node.term.kind === "element" && node.term.declaration.kind === "local" && localName(node.term.declaration.target) === "Before");
    expect(beforeParticle).toMatchObject({kind: "particle", occurs: {min: "0", max: "1"}});
    const appendedReference = particles.at(-1);
    expect(appendedReference).toMatchObject({kind: "particle", term: {kind: "element", declaration: {kind: "symbol", role: "element", name: {namespace: ns, local: "Existing"}}}, occurs: {min: "0", max: "1"}});
    expect(() => prepareCorrectedSourceInputs([input], recipe(pins(inventory), [
      {kind: "insert-element", target: selector(sequence), position: {kind: "after", target: selector(anchorA)},
        element: {kind: "declaration", name: "AfterA", type: {namespace: XSD_NAMESPACE, local: "string"}, min: "0", max: "1"}},
      {kind: "insert-element", target: selector(sequence), position: {kind: "before", target: selector(anchorB)},
        element: {kind: "declaration", name: "BeforeB", type: {namespace: XSD_NAMESPACE, local: "string"}, min: "0", max: "1"}},
    ]))).toThrow(/same original source position/);
  });

  it("requires complete source pins and rejects stale, widening, conflicting and ambiguous-context edits", async () => {
    const input = await loadFixture("xsd/compositors/content-model-boundaries.wsdl");
    const inventory = inspectSourceCorrectionInventory([input]);
    const row = requiredNode(inventory, node => node.kind === "particle" && attr(node, "name") === "row" && attr(node, "maxOccurs") === "0", "row");
    const wildcard = requiredNode(inventory, node => node.kind === "particle" && node.wildcard?.namespace === "##other", "wildcard");
    const base = [{kind: "set-occurs", target: selector(row), min: "0", max: "1"}];
    expect(() => prepareCorrectedSourceInputs([input], recipe([], base))).toThrow(SourceCorrectionError);
    expect(() => prepareCorrectedSourceInputs([input], {...recipe(pins(inventory), base), extra: true})).toThrow(/unknown fields/);
    expect(() => prepareCorrectedSourceInputs([input], recipe(pins(inventory), [{kind: "set-occurs", target: {...selector(row), digest: "0".repeat(64)}, min: "0", max: "1"}]))).toThrow(/absent from the pinned canonical inventory/);
    expect(() => prepareCorrectedSourceInputs([input], recipe(pins(inventory), [{kind: "set-wildcard-namespaces", target: selector(wildcard), namespaces: ["urn:conformance:content-model"]}]))).toThrow(/widen/);
    expect(() => prepareCorrectedSourceInputs([input], recipe(pins(inventory), [...base, ...base]))).toThrow(/Conflicting correction/);
    let unresolvedError: unknown;
    try {prepareCorrectedSourceInputs([input], recipe(pins(inventory), [{kind: "set-occurs", target: selector(row), min: null, max: "1"}]));}
    catch (error) {unresolvedError = error;}
    expect(unresolvedError).toMatchObject({category: "invalid-recipe"});

    const chameleon = await loadSemanticSchemaInput(path.join(fixtures, "xsd/graph/chameleon.wsdl"), {policy: {fileRoots: [path.join(fixtures, "xsd/graph")]}});
    const chameleonInventory = inspectSourceCorrectionInventory([chameleon]);
    const ambiguous = requiredNode(chameleonInventory, node => node.ambiguousContext && node.kind === "particle" && attr(node, "name") === "next", "ambiguous chameleon element");
    expect(() => prepareCorrectedSourceInputs([chameleon], recipe(pins(chameleonInventory), [{kind: "set-occurs", target: selector(ambiguous), min: "0", max: "2"}]))).toThrow(/multiple target namespaces/);

  });

  it('appends a typed child to a self-closing sequence without changing its namespace', async () => {
    const emptyPath = path.join(temporaryRoot, "empty-sequence.xsd");
    writeFileSync(emptyPath, `<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="urn:empty"><xs:complexType name="Empty"><xs:sequence/></xs:complexType></xs:schema>`, "utf8");
    const empty = await loadSemanticSchemaInput(emptyPath, {policy: {fileRoots: [temporaryRoot]}});
    const emptyInventory = inspectSourceCorrectionInventory([empty]);
    const sequence = requiredNode(emptyInventory, node => node.kind === "particle" && node.syntaxName.local === "sequence", "empty sequence");
    const corrected = prepareCorrectedSourceInputs([empty], recipe(pins(emptyInventory), [{kind: "insert-element", target: selector(sequence), position: "append",
      element: {kind: "declaration", name: "Value", type: {namespace: XSD_NAMESPACE, local: "string"}, min: "0", max: "1"}}]));
    const loaded = await loadSemanticSchemaInput(emptyPath, {policy: {fileRoots: [temporaryRoot]}, offlineResources: corrected.resources});
    const graph = buildCanonicalGraph(loaded);
    expect(graph.nodes.some(node => node.kind === 'element' && node.name.local === 'Value')).toBe(true);
    expect(inspectSourceCorrectionInventory([loaded]).nodes.find(node => node.kind === 'particle' && node.syntaxName.local === 'element')?.occurs)
      .toEqual({min: '0', max: '1'});
  });

  it("adds missing occurrence attributes at the absolute offset of a later start tag", async () => {
    const sourcePath = path.join(temporaryRoot, "missing-occurs.xsd");
    writeFileSync(sourcePath, `<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="urn:occurs"><xs:complexType name="Payload"><xs:sequence><xs:element name="Earlier" type="xs:string"/><xs:element name="Quantity" type="xs:string"/></xs:sequence></xs:complexType></xs:schema>`, "utf8");
    const input = await loadSemanticSchemaInput(sourcePath, {policy: {fileRoots: [temporaryRoot]}});
    const inventory = inspectSourceCorrectionInventory([input]);
    const quantity = requiredNode(inventory, node => node.kind === "particle" && attr(node, "name") === "Quantity", "Payload.Quantity");
    expect(attr(quantity, "minOccurs")).toBeUndefined();
    expect(attr(quantity, "maxOccurs")).toBeUndefined();
    const corrected = prepareCorrectedSourceInputs([input], recipe(pins(inventory), [
      {kind: "set-occurs", target: selector(quantity), min: "0", max: "3"},
    ]));
    const correctedInput = await loadSemanticSchemaInput(input.root.uri, {policy: {fileRoots: [temporaryRoot]}, offlineResources: corrected.resources});
    const correctedInventory = inspectSourceCorrectionInventory([correctedInput]);
    const correctedQuantity = requiredNode(correctedInventory, node => node.kind === "particle" && attr(node, "name") === "Quantity", "corrected Payload.Quantity");
    expect(attr(correctedQuantity, "minOccurs")).toBe("0");
    expect(attr(correctedQuantity, "maxOccurs")).toBe("3");
  });

  it("refuses a no-namespace type QName that a default XSD namespace would reinterpret", async () => {
    const sourcePath = path.join(temporaryRoot, "default-xsd-namespace.xsd");
    writeFileSync(sourcePath, `<schema xmlns="${XSD_NAMESPACE}"><complexType name="Local"><sequence/></complexType><complexType name="Payload"><sequence><element name="A" type="string"/></sequence></complexType></schema>`, "utf8");
    const input = await loadSemanticSchemaInput(sourcePath, {policy: {fileRoots: [temporaryRoot]}});
    const inventory = inspectSourceCorrectionInventory([input]);
    const sequence = requiredNode(inventory, node => node.kind === "particle" && node.syntaxName.local === "sequence" && node.children?.length === 1, "Payload sequence");
    let correctionError: unknown;
    try {
      prepareCorrectedSourceInputs([input], recipe(pins(inventory), [{kind: "insert-element", target: selector(sequence), position: "append",
        element: {kind: "declaration", name: "Added", type: {namespace: "", local: "Local"}, min: "0", max: "1"}}]));
    } catch (error) {correctionError = error;}
    expect(correctionError).toMatchObject({category: "unsupported-target"});
  });

  it("requires pins for the complete imported resource closure", async () => {
    const input = await loadFixture("xsd/imports/import-relative-types.wsdl");
    const inventory = inspectSourceCorrectionInventory([input]);
    expect(inventory.resources).toHaveLength(2);
    const leaf = requiredNode(inventory, node => node.kind === "particle" && attr(node, "name") === "name", "ImportedPayload.name");
    const sequence = requiredNode(inventory, node => node.kind === "particle" && node.syntaxName.local === "sequence" && node.children?.includes(leaf.id), "ImportedPayload sequence");
    const corrected = prepareCorrectedSourceInputs([input], recipe(pins(inventory), [{kind: "insert-element", target: selector(sequence), position: "append",
      element: {kind: "declaration", name: "code", type: {namespace: XSD_NAMESPACE, local: "string"}, min: "0", max: "1"}}]));
    expect(corrected.resources.has(inventory.resources[0]!.uri)).toBe(true);
    expect(corrected.resources.has(inventory.resources[1]!.uri)).toBe(true);
    expect(corrected.provenance.resources.filter(resource => resource.changed)).toHaveLength(1);
  });
});
