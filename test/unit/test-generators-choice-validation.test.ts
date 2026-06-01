import {describe, expect, it} from "vitest";
import type {ResolvedOperationMeta} from "../../src/gateway/helpers.js";
import {emitValidationTest} from "../../src/test/generators.js";
import {createSearchChoiceCatalog} from "../helpers/choiceCatalog.js";

const searchOperation: ResolvedOperationMeta = {
  operationId: "Search",
  operationSlug: "search",
  method: "post",
  path: "/search",
  clientMethodName: "Search",
  requestTypeName: "SearchRequest",
  responseTypeName: "SearchResponse",
};

describe("test generators: choice validation", () => {
  function emitSearchValidation(catalog = createSearchChoiceCatalog("union")): string {
    return emitValidationTest(
      "tests",
      "js",
      [searchOperation],
      new Map([
        [
          "Search",
          {
            request: {
              tenantId: "sample",
              email: "sample",
            },
            response: {},
          },
        ],
      ]),
      catalog,
    );
  }

  it("emits invalid multi-branch payload coverage for union-mode choices", () => {
    const content = emitSearchValidation();

    expect(content).toContain("rejects invalid SearchRequest choice payload");
    expect(content).toContain('"email": "sample"');
    expect(content).toContain('"phone": 0');
    expect(content).toContain("expect(res.statusCode).toBe(400);");
  });

  it("emits missing-branch payload coverage for required union-mode choices", () => {
    const content = emitSearchValidation(createSearchChoiceCatalog("union", {choiceMin: 1}));

    expect(content).toContain("rejects missing SearchRequest choice payload");
    expect(content).toMatch(/rejects missing SearchRequest choice payload[\s\S]*payload: \{\s+"tenantId": "sample"\s+}/);
    expect(content).toContain("expect(res.statusCode).toBe(400);");
  });
});
