import { describe, it, expect } from "vitest";
import {
  normalizeArray,
  pascal,
  resolveQName,
  explodePascal,
  pascalToSnakeCase,
  getChildrenWithLocalName,
  getFirstWithLocalName,
} from "../../src/util/tools.js";

describe("normalizeArray", () => {
  it("returns empty array for null", () => {
    expect(normalizeArray(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(normalizeArray(undefined)).toEqual([]);
  });

  it("wraps a single value in an array", () => {
    expect(normalizeArray("hello")).toEqual(["hello"]);
  });

  it("returns an array as-is", () => {
    expect(normalizeArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("wraps a single object", () => {
    const obj = { a: 1 };
    expect(normalizeArray(obj)).toEqual([obj]);
  });
});

describe("pascal", () => {
  it("converts simple words", () => {
    expect(pascal("hello")).toBe("Hello");
  });

  it("converts kebab-case", () => {
    expect(pascal("get-user-details")).toBe("GetUserDetails");
  });

  it("converts dot-separated", () => {
    expect(pascal("com.example.service")).toBe("ComExampleService");
  });

  it("converts space-separated", () => {
    expect(pascal("hello world")).toBe("HelloWorld");
  });

  it("preserves underscores", () => {
    expect(pascal("my_type_name")).toBe("My_Type_Name");
  });

  it("handles empty string", () => {
    expect(pascal("")).toBe("_");
  });

  it("prefixes leading digit with underscore", () => {
    // digits are not separators, so "abc" stays lowercase
    expect(pascal("123abc")).toBe("_123abc");
  });

  it("guards against reserved keyword 'class'", () => {
    expect(pascal("class")).toBe("_Class");
  });

  it("guards against reserved keyword 'string'", () => {
    expect(pascal("string")).toBe("_String");
  });

  it("does not prefix names that start with a reserved word", () => {
    // "Aspect" starts with "as" but should not be prefixed
    expect(pascal("Aspect")).toBe("Aspect");
  });

  it("handles colon-separated (QName-like)", () => {
    expect(pascal("xs:string")).toBe("XsString");
  });

  it("handles slash-separated", () => {
    expect(pascal("path/to/thing")).toBe("PathToThing");
  });

  it("removes disallowed characters without capitalizing after them", () => {
    // @ and ! are removed but are not separator chars that trigger uppercasing
    expect(pascal("hello@world!")).toBe("Helloworld");
  });

  it("preserves $ in identifiers", () => {
    // $ is preserved but is not a separator — no uppercase after it
    expect(pascal("$value")).toBe("$value");
  });
});

describe("resolveQName", () => {
  const prefixes = {
    xs: "http://www.w3.org/2001/XMLSchema",
    tns: "http://example.com/service",
  };

  it("resolves prefixed QName", () => {
    expect(resolveQName("xs:string", "http://default.ns", prefixes)).toEqual({
      ns: "http://www.w3.org/2001/XMLSchema",
      local: "string",
    });
  });

  it("uses default namespace for unprefixed name", () => {
    expect(resolveQName("MyType", "http://default.ns", prefixes)).toEqual({
      ns: "http://default.ns",
      local: "MyType",
    });
  });

  it("handles unknown prefix by falling back to default namespace", () => {
    expect(resolveQName("unk:Foo", "http://default.ns", prefixes)).toEqual({
      ns: "http://default.ns",
      local: "Foo",
    });
  });

  it("handles empty string", () => {
    expect(resolveQName("", "http://default.ns", prefixes)).toEqual({
      ns: "http://default.ns",
      local: "",
    });
  });
});

describe("explodePascal", () => {
  it("splits PascalCase into segments", () => {
    expect(explodePascal("GetUserDetails")).toEqual(["Get", "User", "Details"]);
  });

  it("splits camelCase", () => {
    expect(explodePascal("getUserDetails")).toEqual(["get", "User", "Details"]);
  });

  it("handles consecutive uppercase (acronyms)", () => {
    expect(explodePascal("XMLParser")).toEqual(["XML", "Parser"]);
  });

  it("handles single word", () => {
    expect(explodePascal("Hello")).toEqual(["Hello"]);
  });

  it("handles underscore-separated", () => {
    expect(explodePascal("My_Type")).toEqual(["My", "Type"]);
  });
});

describe("pascalToSnakeCase", () => {
  it("converts PascalCase to snake_case", () => {
    expect(pascalToSnakeCase("GetUserDetails")).toBe("get_user_details");
  });

  it("converts camelCase to snake_case", () => {
    expect(pascalToSnakeCase("getUserDetails")).toBe("get_user_details");
  });

  it("handles acronyms", () => {
    expect(pascalToSnakeCase("XMLParser")).toBe("xml_parser");
  });

  it("handles single word", () => {
    expect(pascalToSnakeCase("Hello")).toBe("hello");
  });
});

describe("getChildrenWithLocalName", () => {
  it("finds children by exact local name", () => {
    const node = { element: { name: "foo" } };
    expect(getChildrenWithLocalName(node, "element")).toEqual([{ name: "foo" }]);
  });

  it("finds children by prefixed local name", () => {
    const node = { "xs:element": { name: "bar" } };
    expect(getChildrenWithLocalName(node, "element")).toEqual([{ name: "bar" }]);
  });

  it("returns empty array for missing children", () => {
    expect(getChildrenWithLocalName({}, "element")).toEqual([]);
  });

  it("returns empty array for null node", () => {
    expect(getChildrenWithLocalName(null, "element")).toEqual([]);
  });

  it("handles array values", () => {
    const node = { element: [{ name: "a" }, { name: "b" }] };
    expect(getChildrenWithLocalName(node, "element")).toEqual([
      { name: "a" },
      { name: "b" },
    ]);
  });
});

describe("getFirstWithLocalName", () => {
  it("returns first matching child", () => {
    const node = { element: { name: "foo" } };
    expect(getFirstWithLocalName(node, "element")).toEqual({ name: "foo" });
  });

  it("returns first matching with prefix", () => {
    const node = { "xs:element": "hello" };
    expect(getFirstWithLocalName(node, "element")).toBe("hello");
  });

  it("returns undefined for missing child", () => {
    expect(getFirstWithLocalName({}, "element")).toBeUndefined();
  });

  it("returns undefined for null node", () => {
    expect(getFirstWithLocalName(null, "element")).toBeUndefined();
  });
});
