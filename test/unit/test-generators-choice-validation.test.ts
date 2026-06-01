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
  it("emits invalid multi-branch payload coverage for union-mode choices", () => {
    const content = emitValidationTest(
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
      createSearchChoiceCatalog("union"),
    );

    expect(content).toContain("rejects invalid SearchRequest choice payload");
    expect(content).toContain('"email": "sample"');
    expect(content).toContain('"phone": 0');
    expect(content).toContain("expect(res.statusCode).toBe(400);");
  });
});
