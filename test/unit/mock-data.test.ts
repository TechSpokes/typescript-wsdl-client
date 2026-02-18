import { describe, it, expect } from "vitest";
import {
  generateMockPrimitive,
  generateMockData,
  generateAllOperationMocks,
  type CatalogForMocks,
} from "../../src/test/mockData.js";

describe("generateMockPrimitive", () => {
  it("returns boolean true for 'Success'", () => {
    expect(generateMockPrimitive("boolean", "Success")).toBe(true);
  });

  it("returns boolean true for arbitrary booleans", () => {
    expect(generateMockPrimitive("boolean", "IsActive")).toBe(true);
  });

  it("returns contextual number for ID-like props", () => {
    expect(generateMockPrimitive("number", "WeatherID")).toBe(1);
  });

  it("returns contextual number for temperature", () => {
    expect(generateMockPrimitive("number", "Temperature")).toBe(72);
  });

  it("returns 0 for unknown number props", () => {
    expect(generateMockPrimitive("number", "SomethingRandom")).toBe(0);
  });

  it("returns ZIP code for ZIP prop", () => {
    expect(generateMockPrimitive("string", "ZIP")).toBe("10001");
  });

  it("returns city name for City prop", () => {
    expect(generateMockPrimitive("string", "City")).toBe("New York");
  });

  it("returns state for State prop", () => {
    expect(generateMockPrimitive("string", "State")).toBe("NY");
  });

  it("returns description for Description prop", () => {
    expect(generateMockPrimitive("string", "Description")).toBe("Sample description");
  });

  it("returns description for misspelled Desciption", () => {
    expect(generateMockPrimitive("string", "Desciption")).toBe("Sample description");
  });

  it("returns URL for PictureURL prop", () => {
    expect(generateMockPrimitive("string", "PictureURL")).toBe("https://example.com/image.png");
  });

  it("returns date string for Date prop", () => {
    const result = generateMockPrimitive("string", "Date");
    expect(typeof result).toBe("string");
    expect(result).toContain("T");
  });

  it("returns 'sample' for unknown string props", () => {
    expect(generateMockPrimitive("string", "SomethingUnknown")).toBe("sample");
  });

  it("picks first enum value for string union types", () => {
    expect(generateMockPrimitive('"Test" | "Production"', "Target")).toBe("Test");
    expect(generateMockPrimitive('"Start" | "End" | "Rollback"', "Status")).toBe("Start");
    expect(generateMockPrimitive('"Yes" | "No" | "Inherit"', "ShareSynchInd")).toBe("Yes");
  });

  it("returns correct types", () => {
    expect(typeof generateMockPrimitive("string", "x")).toBe("string");
    expect(typeof generateMockPrimitive("number", "x")).toBe("number");
    expect(typeof generateMockPrimitive("boolean", "x")).toBe("boolean");
  });
});

describe("generateMockData", () => {
  it("returns empty object for unknown type", () => {
    const catalog: CatalogForMocks = { meta: { childType: {} } };
    expect(generateMockData("UnknownType", catalog)).toEqual({});
  });

  it("returns empty object for type with no children", () => {
    const catalog: CatalogForMocks = {
      meta: { childType: { EmptyType: {} } },
    };
    expect(generateMockData("EmptyType", catalog)).toEqual({});
  });

  it("generates flat object with primitive properties", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          SimpleType: {
            Name: "string",
            Count: "number",
            Active: "boolean",
          },
        },
        propMeta: {},
      },
    };
    const result = generateMockData("SimpleType", catalog);
    expect(typeof result.Name).toBe("string");
    expect(typeof result.Count).toBe("number");
    expect(typeof result.Active).toBe("boolean");
  });

  it("generates nested objects for complex types", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          Parent: { Child: "ChildType" },
          ChildType: { Value: "string" },
        },
        propMeta: {},
      },
    };
    const result = generateMockData("Parent", catalog);
    expect(result.Child).toBeDefined();
    expect(typeof (result.Child as any).Value).toBe("string");
  });

  it("wraps unbounded properties in arrays", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          ListType: { Item: "string" },
        },
        propMeta: {
          ListType: {
            Item: { declaredType: "string", min: 0, max: "unbounded" },
          },
        },
      },
    };
    const result = generateMockData("ListType", catalog);
    expect(Array.isArray(result.Item)).toBe(true);
    expect((result.Item as string[]).length).toBe(1);
    expect(typeof (result.Item as string[])[0]).toBe("string");
  });

  it("wraps complex types in arrays when unbounded", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          Container: { Items: "ItemType" },
          ItemType: { Id: "number", Name: "string" },
        },
        propMeta: {
          Container: {
            Items: { declaredType: "ItemType", min: 0, max: "unbounded" },
          },
        },
      },
    };
    const result = generateMockData("Container", catalog);
    expect(Array.isArray(result.Items)).toBe(true);
    const items = result.Items as any[];
    expect(items.length).toBe(1);
    expect(typeof items[0].Id).toBe("number");
    expect(typeof items[0].Name).toBe("string");
  });

  it("handles cycles by returning empty object", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          TypeA: { Ref: "TypeB" },
          TypeB: { Back: "TypeA" },
        },
        propMeta: {},
      },
    };
    const result = generateMockData("TypeA", catalog);
    expect(result.Ref).toBeDefined();
    // TypeB.Back -> TypeA is a cycle, so it returns {}
    expect((result.Ref as any).Back).toEqual({});
  });

  it("respects maxDepth option", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          L0: { Next: "L1" },
          L1: { Next: "L2" },
          L2: { Next: "L3" },
          L3: { Value: "string" },
        },
        propMeta: {},
      },
    };
    const result = generateMockData("L0", catalog, { maxDepth: 2 });
    // Depth 0: L0, Depth 1: L1, Depth 2 is maxDepth so L2 -> {}
    expect(result.Next).toBeDefined();
    expect((result.Next as any).Next).toEqual({});
  });

  it("returns empty object when catalog has no meta", () => {
    const catalog: CatalogForMocks = {};
    expect(generateMockData("AnyType", catalog)).toEqual({});
  });

  it("includes attributes from attrType in mock data", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          RequestType: { Name: "string" },
        },
        attrType: {
          RequestType: { Version: "string", Priority: "number" },
        },
        propMeta: {},
      },
    };
    const result = generateMockData("RequestType", catalog);
    expect(typeof result.Name).toBe("string");
    expect(typeof result.Version).toBe("string");
    expect(typeof result.Priority).toBe("number");
  });

  it("does not overwrite element values with attribute values", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          MyType: { Status: "string" },
        },
        attrType: {
          MyType: { Status: "boolean" },
        },
        propMeta: {},
      },
    };
    const result = generateMockData("MyType", catalog);
    // Element value takes priority
    expect(typeof result.Status).toBe("string");
  });

  it("generates attribute-only types (no elements)", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          AttrOnlyType: {},
        },
        attrType: {
          AttrOnlyType: { Code: "string", Active: "boolean" },
        },
        propMeta: {},
      },
    };
    // childType is empty, so elements produce nothing, but attrType adds attrs
    const result = generateMockData("AttrOnlyType", catalog);
    expect(typeof result.Code).toBe("string");
    expect(typeof result.Active).toBe("boolean");
  });
});

describe("generateAllOperationMocks", () => {
  it("returns empty map for catalog with no operations", () => {
    const catalog: CatalogForMocks = {};
    const result = generateAllOperationMocks(catalog);
    expect(result.size).toBe(0);
  });

  it("generates entries for all operations", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          GetDataInput: { Query: "string" },
          GetDataOutput: { Result: "string" },
        },
        propMeta: {},
      },
      operations: [
        { name: "GetData", inputTypeName: "GetDataInput", outputTypeName: "GetDataOutput" },
      ],
    };
    const result = generateAllOperationMocks(catalog);
    expect(result.size).toBe(1);
    expect(result.has("GetData")).toBe(true);
    const mock = result.get("GetData")!;
    expect(typeof mock.request.Query).toBe("string");
    expect(typeof mock.response.Result).toBe("string");
  });

  it("handles operations with no input type", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          ListOutput: { Items: "string" },
        },
        propMeta: {},
      },
      operations: [
        { name: "ListAll", outputTypeName: "ListOutput" },
      ],
    };
    const result = generateAllOperationMocks(catalog);
    const mock = result.get("ListAll")!;
    expect(mock.request).toEqual({});
    expect(typeof mock.response.Items).toBe("string");
  });

  it("handles operations with no output type", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          DeleteInput: { Id: "number" },
        },
        propMeta: {},
      },
      operations: [
        { name: "Delete", inputTypeName: "DeleteInput" },
      ],
    };
    const result = generateAllOperationMocks(catalog);
    const mock = result.get("Delete")!;
    expect(typeof mock.request.Id).toBe("number");
    expect(mock.response).toEqual({});
  });

  it("generates multiple operation entries", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          AInput: { X: "string" },
          AOutput: { Y: "number" },
          BInput: { Z: "boolean" },
          BOutput: { W: "string" },
        },
        propMeta: {},
      },
      operations: [
        { name: "OpA", inputTypeName: "AInput", outputTypeName: "AOutput" },
        { name: "OpB", inputTypeName: "BInput", outputTypeName: "BOutput" },
      ],
    };
    const result = generateAllOperationMocks(catalog);
    expect(result.size).toBe(2);
    expect(result.has("OpA")).toBe(true);
    expect(result.has("OpB")).toBe(true);
  });

  it("flattens array wrappers in request payloads when types are available", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          ReqType: { Items: "ArrayOfItem" },
          ArrayOfItem: { Item: "ItemType" },
          ItemType: { Id: "number" },
          ResType: { Items: "ArrayOfItem" },
        },
        propMeta: {
          ArrayOfItem: {
            Item: { declaredType: "ItemType", min: 0, max: "unbounded" },
          },
        },
      },
      types: [
        { name: "ArrayOfItem", attrs: [], elems: [{ name: "Item", max: "unbounded" as const }] },
        { name: "ItemType", attrs: [], elems: [{ name: "Id", max: 1 }] },
        { name: "ReqType", attrs: [], elems: [{ name: "Items", max: 1 }] },
        { name: "ResType", attrs: [], elems: [{ name: "Items", max: 1 }] },
      ],
      operations: [
        { name: "GetItems", inputTypeName: "ReqType", outputTypeName: "ResType" },
      ],
    };
    const result = generateAllOperationMocks(catalog, { flattenArrayWrappers: true });
    const mock = result.get("GetItems")!;
    // Request should be flattened: Items is an array, not { Item: [...] }
    expect(Array.isArray(mock.request.Items)).toBe(true);
    // Response should stay SOAP-shaped (pre-unwrap)
    expect(mock.response.Items).toHaveProperty("Item");
  });

  it("does not flatten when flattenArrayWrappers is false", () => {
    const catalog: CatalogForMocks = {
      meta: {
        childType: {
          ReqType: { Items: "ArrayOfItem" },
          ArrayOfItem: { Item: "string" },
        },
        propMeta: {
          ArrayOfItem: {
            Item: { declaredType: "string", min: 0, max: "unbounded" },
          },
        },
      },
      types: [
        { name: "ArrayOfItem", attrs: [], elems: [{ name: "Item", max: "unbounded" as const }] },
        { name: "ReqType", attrs: [], elems: [{ name: "Items", max: 1 }] },
      ],
      operations: [
        { name: "Op", inputTypeName: "ReqType" },
      ],
    };
    const result = generateAllOperationMocks(catalog, { flattenArrayWrappers: false });
    const mock = result.get("Op")!;
    // Should NOT be flattened
    expect(mock.request.Items).toHaveProperty("Item");
  });
});
