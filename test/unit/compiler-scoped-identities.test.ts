import {describe, expect, it} from "vitest";
import {join} from "node:path";
import type {CompiledCatalog, CompiledType} from "../../src/compiler/schemaCompiler.js";
import {compileCatalog} from "../../src/compiler/schemaCompiler.js";
import {resolveCompilerOptions} from "../../src/config.js";
import {loadWsdl, type WsdlCatalog} from "../../src/loader/wsdlLoader.js";

const fixtureRoot = join(process.cwd(), "test/conformance/fixtures/xsd/types/scoped-identities");

async function compileFixture(fileName: string): Promise<CompiledCatalog> {
  const wsdlPath = join(fixtureRoot, fileName);
  const source = await loadWsdl(wsdlPath);
  return compileCatalog(source, resolveCompilerOptions({}, {wsdl: wsdlPath, out: fixtureRoot}));
}

function compileCatalogClone(catalog: WsdlCatalog): CompiledCatalog {
  return compileCatalog(catalog, resolveCompilerOptions({}, {wsdl: catalog.wsdlUri, out: fixtureRoot}));
}

function replacePrefix(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(replacePrefix);
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? value.replace(/\bxs:/g, "xsd:") : value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key.startsWith("xs:") ? `xsd:${key.slice(3)}` : key,
    replacePrefix(child),
  ]));
}

function addWhitespaceText(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(addWhitespaceText);
  if (!value || typeof value !== "object") return value;
  const entries: [string, unknown][] = Object.entries(value).map(([key, child]) => [key, addWhitespaceText(child)]);
  if (entries.some(([key]) => !key.startsWith("@_"))) entries.push(["#text", " \n  "]);
  return Object.fromEntries(entries);
}

function addOtherNamespacePascalCollision(catalog: WsdlCatalog): WsdlCatalog {
  const variant = structuredClone(catalog);
  const originalSchema = variant.schemas[0];
  const declarations = originalSchema.xml["xs:complexType"];
  const named = (Array.isArray(declarations) ? declarations : [declarations])
    .find((type: Record<string, unknown>) => type["@_name"] === "FooBar");
  if (!named) throw new Error("Missing FooBar source declaration");
  const otherType = structuredClone(named) as Record<string, unknown>;
  otherType["@_name"] = "foo-bar";
  const sequence = otherType["xs:sequence"] as Record<string, unknown>;
  const firstElement = sequence["xs:element"] as Record<string, unknown>;
  firstElement["@_name"] = "OtherNamespaceOnly";
  originalSchema.prefixes.other = "urn:other-scoped-identities";
  originalSchema.xml["xs:complexType"] = [...(Array.isArray(declarations) ? declarations : [declarations]), {
    "@_name": "ReferenceOwner", "xs:sequence": {"xs:element": [
      {"@_name": "Original", "@_type": "tns:FooBar"},
      {"@_name": "Other", "@_type": "other:foo-bar"},
    ]},
  }];
  variant.schemas.push({
    uri: "C:/relocated/other.xsd",
    xml: {"@_targetNamespace": "urn:other-scoped-identities", "xs:complexType": [otherType]},
    targetNS: "urn:other-scoped-identities",
    prefixes: {xs: "http://www.w3.org/2001/XMLSchema"},
  });
  return variant;
}

function member(catalog: CompiledCatalog, ownerName: string, elementName: string) {
  const owner = catalog.types.find(type => type.name === ownerName);
  if (!owner) throw new Error(`Missing owner type ${ownerName}`);
  const found = owner.elems.find(element => element.name === elementName);
  if (!found) throw new Error(`Missing ${ownerName}.${elementName}`);
  return found;
}

function memberType(catalog: CompiledCatalog, ownerName: string, elementName: string): CompiledType {
  const reference = member(catalog, ownerName, elementName);
  const found = catalog.types.find(type => type.name === reference.tsType);
  if (!found) throw new Error(`Unresolved compiled type ${reference.tsType} for ${ownerName}.${elementName}`);
  return found;
}

function identityProjection(catalog: CompiledCatalog): Record<string, unknown> {
  const owners = ["Left", "Right", "InheritedLeft", "InheritedRight", "NestedParent", "StableOwner", "NormalizedOwner"];
  return Object.fromEntries(owners.map(owner => {
    const element = owner === "NestedParent" ? "Entry" : owner === "StableOwner" ? "Details"
      : owner === "NormalizedOwner" ? "foo-bar" : "Entry";
    const reference = member(catalog, owner, element);
    const target = memberType(catalog, owner, element);
    return [owner, {typeName: reference.tsType, base: target.base,
      attrs: target.attrs.map(attribute => [attribute.name, attribute.declaredType]),
      elems: target.elems.map(child => [child.name, child.tsType, child.min, child.max])}];
  }));
}

describe("legacy compiler scoped anonymous identities", () => {
  it("keeps same-named inline types owned by separate parent types distinct", async () => {
    const catalog = await compileFixture("left-first.wsdl");
    const leftName = member(catalog, "Left", "Entry").tsType;
    const rightName = member(catalog, "Right", "Entry").tsType;
    const left = memberType(catalog, "Left", "Entry");
    const right = memberType(catalog, "Right", "Entry");

    expect(leftName).not.toBe("Entry");
    expect(rightName).not.toBe("Entry");
    expect(leftName).not.toBe(rightName);
    expect(left.elems.map(element => element.name)).toEqual(["LeftOnly"]);
    expect(right.elems.map(element => element.name)).toEqual(["RightOnly"]);
    expect(left.attrs.map(attribute => [attribute.name, attribute.declaredType])).toEqual([["Quantity", "xs:integer"]]);
    expect(right.attrs.map(attribute => [attribute.name, attribute.declaredType])).toEqual([["Quantity", "xs:nonNegativeInteger"]]);
  });

  it("allocates the same owner-specific names when declaration order changes", async () => {
    const leftFirst = await compileFixture("left-first.wsdl");
    const rightFirst = await compileFixture("right-first.wsdl");

    expect(identityProjection(rightFirst)).toEqual(identityProjection(leftFirst));
  });

  it("keeps identity names stable across parsed whitespace, prefix, relocation, and root-order changes", async () => {
    const source = await loadWsdl(join(fixtureRoot, "left-first.wsdl"));
    const variant = structuredClone(source);
    variant.wsdlUri = "C:/relocated/scoped-identities.wsdl";
    for (const schema of variant.schemas) {
      schema.uri = "C:/relocated/another-schema-root";
      schema.xml = addWhitespaceText(replacePrefix(schema.xml));
      schema.prefixes.xsd = variant.prefixMap.xs;
      delete schema.prefixes.xs;
      const complex = schema.xml["xsd:complexType"];
      if (Array.isArray(complex)) complex.reverse();
      // Parsed WsdlCatalogs omit indentation-only text. Explicit whitespace text nodes
      // model authored catalog clones and must not become declaration-path components.
      schema.xml["#text"] = " \n  ";
    }

    expect(identityProjection(compileCatalogClone(variant))).toEqual(identityProjection(compileCatalogClone(source)));
  });

  it("preserves a nested leaf when anonymous declarations repeat the same local name", async () => {
    const catalog = await compileFixture("left-first.wsdl");
    const outerName = member(catalog, "NestedParent", "Entry").tsType;
    const outer = memberType(catalog, "NestedParent", "Entry");
    const innerReference = outer.elems.find(element => element.name === "Entry");
    if (!innerReference) throw new Error("Missing NestedParent.Entry.Entry");
    const inner = catalog.types.find(type => type.name === innerReference.tsType);

    expect(outerName).not.toBe(innerReference.tsType);
    expect(inner, "nested anonymous type must resolve independently").toBeTruthy();
    expect(inner!.elems.map(element => element.name)).toEqual(["Leaf"]);
  });

  it("keeps true recursion on a named type while retaining its other members", async () => {
    const catalog = await compileFixture("left-first.wsdl");
    const recursive = catalog.types.find(type => type.name === "RecursiveNode");
    const next = recursive?.elems.find(element => element.name === "Next");

    expect(recursive?.elems.map(element => element.name)).toEqual(["Value", "Next"]);
    expect(next?.tsType).toBe("RecursiveNode");
  });

  it("compiles colliding anonymous extensions from their own bases and local members", async () => {
    const catalog = await compileFixture("left-first.wsdl");
    const leftName = member(catalog, "InheritedLeft", "Entry").tsType;
    const rightName = member(catalog, "InheritedRight", "Entry").tsType;
    const left = memberType(catalog, "InheritedLeft", "Entry");
    const right = memberType(catalog, "InheritedRight", "Entry");

    expect(leftName).not.toBe(rightName);
    expect(left).toMatchObject({base: "BaseLeft", localElems: [{name: "LeftOnly"}]});
    expect(left.attrs.map(attribute => attribute.name)).toContain("BaseLeft");
    expect(right).toMatchObject({base: "BaseRight", localElems: [{name: "RightOnly"}]});
    expect(right.attrs.map(attribute => attribute.name)).toContain("BaseRight");
  });

  it("preserves an unambiguous inline type label", async () => {
    const catalog = await compileFixture("left-first.wsdl");
    const details = member(catalog, "StableOwner", "Details");

    expect(details.tsType).toBe("Details");
    expect(memberType(catalog, "StableOwner", "Details").elems.map(element => element.name)).toEqual(["Code"]);
  });

  it("reserves a named type when an anonymous name normalizes to the same label", async () => {
    const catalog = await compileFixture("left-first.wsdl");
    const named = catalog.types.find(type => type.name === "FooBar");
    const anonymousName = member(catalog, "NormalizedOwner", "foo-bar").tsType;
    const anonymous = memberType(catalog, "NormalizedOwner", "foo-bar");

    expect(anonymousName).not.toBe("FooBar");
    expect(named?.elems.map(element => element.name)).toEqual(["NamedOnly"]);
    expect(anonymous.elems.map(element => element.name)).toEqual(["AnonymousOnly"]);
  });

  it("disambiguates named Pascal-equivalent types across namespaces", async () => {
    const source = await loadWsdl(join(fixtureRoot, "left-first.wsdl"));
    const variant = addOtherNamespacePascalCollision(source);
    const compiled = compileCatalogClone(variant);
    const reversedRoots = structuredClone(variant);
    reversedRoots.schemas.reverse();
    const compiledReversed = compileCatalogClone(reversedRoots);
    const original = compiled.types.find(type => type.ns === "urn:scoped-identities" && type.elems.some(element => element.name === "NamedOnly"));
    const other = compiled.types.find(type => type.ns === "urn:other-scoped-identities");
    const projection = (catalog: CompiledCatalog) => catalog.types
      .filter(type => type.ns === "urn:scoped-identities" || type.ns === "urn:other-scoped-identities")
      .map(type => [type.ns, type.name, type.elems.map(element => element.name)] as const)
      .sort(([leftNs, leftName], [rightNs, rightName]) => leftNs.localeCompare(rightNs) || leftName.localeCompare(rightName));

    expect(original).toBeTruthy();
    expect(other).toBeTruthy();
    expect(original!.name).not.toBe(other!.name);
    expect(original!.elems.map(element => element.name)).toEqual(["NamedOnly"]);
    expect(other!.elems.map(element => element.name)).toEqual(["OtherNamespaceOnly"]);
    expect(member(compiled, "ReferenceOwner", "Original").tsType).toBe(original!.name);
    expect(member(compiled, "ReferenceOwner", "Other").tsType).toBe(other!.name);
    expect(projection(compiledReversed)).toEqual(projection(compiled));
  });

  it("reuses a same-name complex type for its global element and keeps metadata references aligned", async () => {
    const catalog = await compileFixture("left-first.wsdl");
    const namedType = catalog.types.find(type => type.ns === "urn:scoped-identities" && type.name === "FooBar");

    expect(catalog.types.filter(type => type.name === "FooBar")).toHaveLength(1);
    expect(namedType?.elems.map(element => element.name)).toEqual(["NamedOnly"]);
    for (const type of catalog.types) {
      for (const element of type.elems) {
        expect(catalog.meta.childType[type.name]?.[element.name]).toBe(element.tsType);
        expect(catalog.meta.propMeta[type.name]?.[element.name]).toMatchObject({
          declaredType: element.declaredType,
          min: element.min,
          max: element.max,
          nillable: element.nillable,
        });
      }
    }
  });

  it("binds normalized alias, list, and union references to allocated labels", async () => {
    const source = await loadWsdl(join(fixtureRoot, "left-first.wsdl"));
    const schema = source.schemas[0];
    schema.xml["xs:simpleType"] = [
      {"@_name": "First-Alias", "xs:restriction": {"@_base": "xs:string", "xs:enumeration": {"@_value": "left"}}},
      {"@_name": "First.Alias", "xs:restriction": {"@_base": "xs:string", "xs:enumeration": {"@_value": "right"}}},
      {"@_name": "AliasList", "xs:list": {"@_itemType": "tns:First-Alias"}},
      {"@_name": "AliasUnion", "xs:union": {"@_memberTypes": "tns:First-Alias tns:First.Alias"}},
    ];
    schema.xml["xs:complexType"].push({"@_name": "AliasOwner", "xs:sequence": {"xs:element": [
      {"@_name": "Left", "@_type": "tns:First-Alias"}, {"@_name": "Right", "@_type": "tns:First.Alias"},
      {"@_name": "Items", "@_type": "tns:AliasList"}, {"@_name": "Either", "@_type": "tns:AliasUnion"},
    ]}});
    const catalog = compileCatalogClone(source);
    const leftName = member(catalog, "AliasOwner", "Left").tsType;
    const rightName = member(catalog, "AliasOwner", "Right").tsType;
    expect(leftName).not.toBe(rightName);
    expect(catalog.aliases.find(alias => alias.name === leftName)?.tsType).toBe('"left"');
    expect(catalog.aliases.find(alias => alias.name === rightName)?.tsType).toBe('"right"');
    expect(catalog.aliases.find(alias => alias.name === "AliasList")?.tsType).toBe(`${leftName}[]`);
    expect(catalog.aliases.find(alias => alias.name === "AliasUnion")?.tsType).toBe(`${leftName} | ${rightName}`);
  });

  it("preserves owner-specific bounds and nil flags on same-named fields", async () => {
    const source = await loadWsdl(join(fixtureRoot, "left-first.wsdl"));
    const rawTypes = source.schemas[0].xml["xs:complexType"] as Record<string, unknown>[];
    for (const [name, min, max, nil] of [["Left", "0", "3", "true"], ["Right", "1", "unbounded", "false"]]) {
      const owner = rawTypes.find(type => type["@_name"] === name)!;
      const sequence = owner["xs:sequence"] as Record<string, unknown>;
      const entry = sequence["xs:element"] as Record<string, unknown>;
      const inline = entry["xs:complexType"] as Record<string, unknown>;
      inline["xs:sequence"] = {"xs:element": {"@_name": "Common", "@_type": "xs:string",
        "@_minOccurs": min, "@_maxOccurs": max, "@_nillable": nil}};
    }
    const catalog = compileCatalogClone(source);
    expect(memberType(catalog, "Left", "Entry").elems).toMatchObject([{name: "Common", min: 0, max: 3, nillable: true}]);
    expect(memberType(catalog, "Right", "Entry").elems).toMatchObject([{name: "Common", min: 1, max: "unbounded", nillable: false}]);
  });

  it("distinguishes same-name inline choice peers while reusing each declaration across visits", async () => {
    const source = await loadWsdl(join(fixtureRoot, "left-first.wsdl"));
    const branch = (leaf: string) => ({"xs:element": {"@_name": "Item", "xs:complexType": {
      "xs:sequence": {"xs:element": {"@_name": leaf, "@_type": "xs:string"}},
    }}});
    source.schemas[0].xml["xs:complexType"].push({"@_name": "ChoiceOwner", "xs:sequence": {
      "xs:choice": [branch("FirstLeaf"), branch("SecondLeaf")],
    }});
    const catalog = compileCatalogClone(source);
    const groups = catalog.types.find(type => type.name === "ChoiceOwner")!.choiceGroups!;
    const targets = groups.map(group => group.branches[0].tsType);
    expect(new Set(targets).size).toBe(2);
    expect(targets.map(name => catalog.types.find(type => type.name === name)!.elems[0].name))
      .toEqual(["FirstLeaf", "SecondLeaf"]);
    expect(targets.every(name => catalog.types.filter(type => type.name === name).length === 1)).toBe(true);
  });
});
