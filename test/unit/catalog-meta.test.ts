import {describe, it, expect} from "vitest";
import {
  detectArrayWrappers,
  detectChildrenTypes,
  flattenMockPayload,
  type CatalogTypeDef,
} from "../../src/util/catalogMeta.js";

describe("detectArrayWrappers", () => {
  it("identifies types with exactly 1 unbounded element and no attrs", () => {
    const types: CatalogTypeDef[] = [
      {name: "ArrayOfFoo", attrs: [], elems: [{name: "Foo", max: "unbounded"}]},
    ];
    expect(detectArrayWrappers(types)).toEqual({ArrayOfFoo: "Foo"});
  });

  it("rejects types with attributes", () => {
    const types: CatalogTypeDef[] = [
      {name: "NotWrapper", attrs: [{name: "Version"}], elems: [{name: "Item", max: "unbounded"}]},
    ];
    expect(detectArrayWrappers(types)).toEqual({});
  });

  it("rejects types with more than 1 element", () => {
    const types: CatalogTypeDef[] = [
      {name: "MultiElem", attrs: [], elems: [{name: "A", max: "unbounded"}, {name: "B", max: 1}]},
    ];
    expect(detectArrayWrappers(types)).toEqual({});
  });

  it("rejects types with max=1", () => {
    const types: CatalogTypeDef[] = [
      {name: "SingleElem", attrs: [], elems: [{name: "Item", max: 1}]},
    ];
    expect(detectArrayWrappers(types)).toEqual({});
  });

  it("accepts types with numeric max > 1", () => {
    const types: CatalogTypeDef[] = [
      {name: "BoundedArray", attrs: [], elems: [{name: "Item", max: 5}]},
    ];
    expect(detectArrayWrappers(types)).toEqual({BoundedArray: "Item"});
  });

  it("returns empty for empty input", () => {
    expect(detectArrayWrappers([])).toEqual({});
  });
});

describe("detectChildrenTypes", () => {
  it("excludes array wrappers from result", () => {
    const childTypeMap = {
      ArrayOfFoo: {Foo: "FooType"},
      ParentType: {Child: "ChildType", Items: "ArrayOfFoo"},
      ChildType: {Value: "string"},
    };
    const arrayWrappers = {ArrayOfFoo: "Foo"};
    const result = detectChildrenTypes(childTypeMap, arrayWrappers);

    expect(result).not.toHaveProperty("ArrayOfFoo");
    expect(result).toHaveProperty("ParentType");
    expect(result).toHaveProperty("ChildType");
  });

  it("returns empty when all types are wrappers", () => {
    const childTypeMap = {ArrayOfFoo: {Foo: "FooType"}};
    const arrayWrappers = {ArrayOfFoo: "Foo"};
    expect(detectChildrenTypes(childTypeMap, arrayWrappers)).toEqual({});
  });

  it("returns all when no wrappers exist", () => {
    const childTypeMap = {A: {X: "string"}, B: {Y: "number"}};
    const result = detectChildrenTypes(childTypeMap, {});
    expect(Object.keys(result)).toEqual(["A", "B"]);
  });
});

describe("flattenMockPayload", () => {
  const arrayWrappers = {ArrayOfItem: "Item"};
  const childTypeMap: Record<string, Record<string, string>> = {
    RequestType: {Name: "string", Items: "ArrayOfItem"},
    ArrayOfItem: {Item: "ItemType"},
    ItemType: {Id: "number"},
  };

  it("flattens array wrapper fields in request payloads", () => {
    const data = {
      Name: "test",
      Items: {Item: [{Id: 1}, {Id: 2}]},
    };
    const result = flattenMockPayload(data, "RequestType", childTypeMap, arrayWrappers);
    expect(result).toEqual({
      Name: "test",
      Items: [{Id: 1}, {Id: 2}],
    });
  });

  it("preserves non-wrapper fields unchanged", () => {
    const data = {Name: "test", Count: 5};
    const result = flattenMockPayload(data, "RequestType", childTypeMap, arrayWrappers);
    expect(result.Name).toBe("test");
    expect(result.Count).toBe(5);
  });

  it("handles empty wrapper (missing inner key)", () => {
    const data = {
      Name: "test",
      Items: {},
    };
    const result = flattenMockPayload(data, "RequestType", childTypeMap, arrayWrappers);
    expect(result.Items).toEqual([]);
  });

  it("returns data unchanged when typeName not in childTypeMap", () => {
    const data = {X: 1};
    const result = flattenMockPayload(data, "UnknownType", childTypeMap, arrayWrappers);
    expect(result).toEqual({X: 1});
  });

  it("handles arrays of wrapper types", () => {
    const nestedChildTypeMap: Record<string, Record<string, string>> = {
      ...childTypeMap,
      Container: {ItemGroups: "ArrayOfItem"},
    };
    // Array wrapper used directly as an array element type
    const data = {
      ItemGroups: {Item: [{Id: 1}]},
    };
    const result = flattenMockPayload(data, "Container", nestedChildTypeMap, arrayWrappers);
    expect(result.ItemGroups).toEqual([{Id: 1}]);
  });
});
