import type {CatalogForMocks} from "../../src/test/mockData.js";

export function createSearchChoiceCatalog(
  choice: "all-optional" | "union" = "union",
  opts: {choiceMin?: number} = {},
): CatalogForMocks {
  return {
    options: {choice},
    meta: {
      childType: {
        SearchRequest: {
          tenantId: "string",
          email: "string",
          phone: "number",
        },
      },
      propMeta: {},
    },
    types: [
      {
        name: "SearchRequest",
        attrs: [],
        elems: [
          {name: "tenantId", max: 1},
          {name: "email", max: 1},
          {name: "phone", max: 1},
        ],
        choiceGroups: [
          {
            name: "SearchRequestChoice1",
            min: opts.choiceMin ?? 0,
            max: 1,
            sourceOrder: 1,
            branches: [
              {name: "email", tsType: "string", min: 1, max: 1, declaredType: "xs:string", sourceOrder: 0},
              {name: "phone", tsType: "number", min: 1, max: 1, declaredType: "xs:int", sourceOrder: 1},
            ],
          },
        ],
      },
    ],
  };
}
