import {describe, expect, it} from "vitest";
import {composeOpenApiDocuments} from "../../src/openapi/composeOpenAPI.js";

function document(path = "/main/read") {
  return {
    openapi: "3.1.0", info: {title: "Native", version: "1"},
    paths: {[path]: {post: {operationId: "Read", responses: {"200": {description: "ok",
      content: {"application/json": {schema: {$ref: "#/components/schemas/Reply"}}}}}}}},
    components: {schemas: {Reply: {type: "object", properties: {Value: {type: "string"}}}}},
  };
}

describe("native OpenAPI composition", () => {
  it("qualifies conflicting names once, leaves source paths intact, and is pure and deterministic", () => {
    const main = document();
    const content = document("/content/read");
    content.components.schemas.Reply = {type: "object", properties: {Value: {type: "integer"}}};
    const entries = [{key: "main", document: main}, {key: "content", document: content}];
    const before = JSON.stringify(entries);
    const options = {title: "Together", version: "2", description: "Two native APIs", servers: ["https://example.test"]};
    const result = composeOpenApiDocuments(entries, options);
    expect(result).toMatchObject({openapi: "3.1.0", info: {title: "Together", version: "2", description: "Two native APIs"},
      servers: [{url: "https://example.test"}],
      paths: {
        "/main/read": {post: {operationId: "main.Read", responses: {"200": {content: {"application/json": {schema: {$ref: "#/components/schemas/main__Reply"}}}}}}},
        "/content/read": {post: {operationId: "content.Read", responses: {"200": {content: {"application/json": {schema: {$ref: "#/components/schemas/content__Reply"}}}}}}},
      },
      components: {schemas: {main__Reply: main.components.schemas.Reply, content__Reply: content.components.schemas.Reply}},
    });
    expect(Object.keys(result.paths)).toEqual(["/content/read", "/main/read"]);
    expect(JSON.stringify(composeOpenApiDocuments([...entries].reverse(), options))).toBe(JSON.stringify(result));
    expect(JSON.stringify(entries)).toBe(before);
  });

  it("rewrites every component category, local pointers, mappings, links, callbacks, and security owners", () => {
    const source = {
      ...document(), security: [{Auth: ["read"]}],
      paths: {
        "/main/read": {post: {operationId: "Read", requestBody: {$ref: "#/components/requestBodies/Input"},
          parameters: [{$ref: "#/components/parameters/Limit"}], security: [{Auth: []}],
          callbacks: {changed: {$ref: "#/components/callbacks/Changed"}},
          responses: {"200": {$ref: "#/components/responses/Success"}}}},
        "/main/other": {$ref: "#/components/pathItems/Other"},
      },
      components: {
        schemas: {Reply: {type: "object", properties: {"a/b~c": {type: "string"}},
          discriminator: {propertyName: "kind", mapping: {reply: "#/components/schemas/Reply", short: "Reply"}}}},
        parameters: {Limit: {name: "limit", in: "query", schema: {type: "integer"}}},
        headers: {Trace: {schema: {type: "string"}}},
        examples: {Sample: {value: {$ref: "#/components/schemas/Reply", operationId: "Read"}}},
        requestBodies: {Input: {content: {"application/json": {schema: {$ref: "#/components/schemas/Reply/properties/a~1b~0c"}, examples: {sample: {$ref: "#/components/examples/Sample"}}}}}},
        responses: {Success: {description: "ok", headers: {Trace: {$ref: "#/components/headers/Trace"}},
          links: {byId: {$ref: "#/components/links/Again"}, byRef: {operationRef: "#/paths/~1main~1read/post"}}}},
        links: {Again: {operationId: "Read"}},
        callbacks: {Changed: {"{$request.body#/callbackUrl}": {post: {operationId: "Changed", responses: {"200": {description: "ok"}}}}}},
        pathItems: {Other: {get: {operationId: "Other", responses: {"200": {description: "ok"}}}}},
        securitySchemes: {Auth: {type: "http", scheme: "bearer"}},
      },
    };
    const result = composeOpenApiDocuments([{key: "main", document: source}]);
    expect(result.components).toMatchObject({
      schemas: {main__Reply: {discriminator: {mapping: {reply: "#/components/schemas/main__Reply", short: "main__Reply"}}}},
      requestBodies: {main__Input: {content: {"application/json": {schema: {$ref: "#/components/schemas/main__Reply/properties/a~1b~0c"}, examples: {sample: {$ref: "#/components/examples/main__Sample"}}}}}},
      responses: {main__Success: {headers: {Trace: {$ref: "#/components/headers/main__Trace"}}, links: {
        byId: {$ref: "#/components/links/main__Again"}, byRef: {operationRef: "#/paths/~1main~1read/post"}}}},
      links: {main__Again: {operationId: "main.Read"}},
      callbacks: {main__Changed: {"{$request.body#/callbackUrl}": {post: {operationId: "main.Changed"}}}},
      pathItems: {main__Other: {get: {operationId: "main.Other"}}},
    });
    for (const category of Object.keys(source.components)) {
      expect(Object.keys(result.components[category]).every(name => name.startsWith("main__"))).toBe(true);
    }
    expect(result.paths["/main/read"].post).toMatchObject({security: [{main__Auth: []}],
      parameters: [{$ref: "#/components/parameters/main__Limit"}], requestBody: {$ref: "#/components/requestBodies/main__Input"},
      callbacks: {changed: {$ref: "#/components/callbacks/main__Changed"}}});
    expect(result.paths["/main/other"].$ref).toBe("#/components/pathItems/main__Other");
  });

  it("materializes source root security per operation without leaking it to another service", () => {
    const main = {...document(), security: [{Auth: ["read"]}], components: {schemas: document().components.schemas, securitySchemes: {Auth: {type: "http", scheme: "bearer"}}}};
    const content = document("/content/read");
    const result = composeOpenApiDocuments([{key: "main", document: main}, {key: "content", document: content}]);
    expect(result.paths["/main/read"].post.security).toEqual([{main__Auth: ["read"]}]);
    expect(result.paths["/content/read"].post.security ?? []).toEqual([]);
    expect(result.security ?? []).toEqual([]);
  });

  it("preserves opaque examples, defaults, enums, extension data, and external references", () => {
    const opaque = {$ref: "#/components/schemas/DoesNotExist", operationId: "Read", operationRef: "#/missing"};
    const source = {...document(), "x-native": opaque, components: {schemas: {Reply: {type: "object",
      properties: {nested: {"$ref": "https://example.test/schema.json#/Reply"}},
      example: opaque, examples: [opaque], default: opaque, enum: [opaque], "x-opaque": opaque}},
      examples: {Sample: {value: opaque}}}};
    const result = composeOpenApiDocuments([{key: "main", document: source}]);
    expect(result.components.schemas.main__Reply).toEqual(source.components.schemas.Reply);
    expect(result.components.examples.main__Sample.value).toEqual(opaque);
  });

  it("handles prototype-sensitive JSON property names without prototype mutation", () => {
    const source = JSON.parse('{"openapi":"3.1.0","info":{"title":"Safe","version":"1"},"paths":{},"components":{"schemas":{"__proto__":{"type":"object","properties":{"constructor":{"type":"string"},"__proto__":{"type":"integer"}}},"constructor":{"type":"string"}}}}');
    const result = composeOpenApiDocuments([{key: "main", document: source}]);
    expect(Object.hasOwn(result.components.schemas, "main____proto__")).toBe(true);
    expect(Object.hasOwn(result.components.schemas.main____proto__.properties, "__proto__")).toBe(true);
    expect(Object.hasOwn(result.components.schemas, "main__constructor")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("retains service extension data while resolving security aliases and URI-encoded schema pointers", () => {
    const opaque = {$ref: "#/components/schemas/Missing", operationId: "literal source ID"};
    const source = {
      ...document(), security: [{Alias: []}],
      paths: {
        "x-path-data": opaque,
        "/main/read": {post: {operationId: "Read", responses: {
          "200": {description: "ok", content: {"application/json": {schema: {$ref: "#/components/schemas/Reply/properties/space%20%23%20%E9%9B%AA"}}}},
          default: {description: "fallback", content: {"application/json": {schema: {$ref: "#/components/schemas/Reply"}}}},
          "x-response-data": opaque,
        }}},
      },
      components: {
        "x-component-data": opaque,
        schemas: {Reply: {type: "object", properties: {"space # 雪": {type: "string"}}}},
        securitySchemes: {Auth: {type: "http", scheme: "bearer"}, Alias: {$ref: "#/components/securitySchemes/Auth"}},
      },
    };
    const result = composeOpenApiDocuments([{key: "main", document: source}]);
    expect(result["x-wsdl-tsc-services"].main).toMatchObject({
      componentExtensions: {"x-component-data": opaque}, pathExtensions: {"x-path-data": opaque},
    });
    expect(result.paths["x-path-data"]).toBeUndefined();
    expect(result.paths["/main/read"].post).toMatchObject({security: [{main__Alias: []}], responses: {
      "200": {content: {"application/json": {schema: {$ref: "#/components/schemas/main__Reply/properties/space%20%23%20%E9%9B%AA"}}}},
      default: {content: {"application/json": {schema: {$ref: "#/components/schemas/main__Reply"}}}},
      "x-response-data": opaque,
    }});
    expect(result.components.securitySchemes.main__Alias).toEqual({$ref: "#/components/securitySchemes/main__Auth"});
  });

  it("qualifies the generated streaming item schema while leaving unrelated extension data intact", () => {
    const source = document();
    const media = source.paths["/main/read"].post.responses["200"].content["application/json"];
    const itemSchema = {$ref: "#/components/schemas/Reply"};
    Object.assign(media, {"x-wsdl-tsc-stream": {format: "ndjson", itemSchema}, "x-other": {itemSchema}});
    const result = composeOpenApiDocuments([{key: "main", document: source}]);
    expect(result.paths["/main/read"].post).toMatchObject({responses: {"200": {content: {"application/json": {
      "x-wsdl-tsc-stream": {format: "ndjson", itemSchema: {$ref: "#/components/schemas/main__Reply"}},
      "x-other": {itemSchema},
    }}}}});
  });

  it("preserves each service's root, path, and operation servers and security overrides", () => {
    const operation = (operationId: string) => ({operationId, responses: {"200": {description: "ok"}}});
    const main = {...document(), servers: [{url: "https://main.test"}], security: [{Auth: ["read"]}],
      paths: {
        "/main/read": {post: operation("Read")},
        "/main/path": {servers: [{url: "https://main-path.test"}], post: operation("Path")},
        "/main/operation": {servers: [{url: "https://main-path.test"}], post: {...operation("Operation"),
          servers: [{url: "https://main-operation.test"}], security: []}},
      },
      components: {securitySchemes: {Auth: {type: "oauth2", flows: {clientCredentials: {tokenUrl: "https://main.test/token", scopes: {read: "Read"}}}}}},
    };
    const content = {...document("/content/read"), servers: [{url: "https://content.test"}]};
    const result = composeOpenApiDocuments([{key: "main", document: main}, {key: "content", document: content}], {servers: ["https://gateway.test"]});
    expect(result.servers).toEqual([{url: "https://gateway.test"}]);
    expect(result.paths["/main/read"].post).toMatchObject({servers: [{url: "https://main.test"}], security: [{main__Auth: ["read"]}]});
    expect(result.paths["/main/path"].post).toMatchObject({servers: [{url: "https://main-path.test"}], security: [{main__Auth: ["read"]}]});
    expect(result.paths["/main/operation"].post).toMatchObject({servers: [{url: "https://main-operation.test"}], security: []});
    expect(result.paths["/content/read"].post.servers).toEqual([{url: "https://content.test"}]);
    expect(result.paths["/content/read"].post.security ?? []).toEqual([]);
    expect(result.security ?? []).toEqual([]);
  });

  it("refuses unresolved external document bases and nested schema resource or anchor semantics explicitly", () => {
    const relative = document();
    relative.paths["/main/read"].post.responses["200"].content["application/json"].schema.$ref = "./shared.json#/Reply";
    expect(() => composeOpenApiDocuments([{key: "main", document: relative}])).toThrow(/relative.*resol|resol.*reference/i);
    for (const resource of [{$id: "https://example.test/embedded", type: "string"}, {$anchor: "embedded", type: "string"}]) {
      const source = {...document(), components: {schemas: {Reply: {type: "object", properties: {nested: resource}}}}};
      expect(() => composeOpenApiDocuments([{key: "main", document: source}])).toThrow(/resource|anchor|resolv/i);
    }
  });

  it("rejects final route collisions even when source operation IDs differ", () => {
    expect(() => composeOpenApiDocuments([{key: "main", document: document()}, {key: "content", document: document()}]))
      .toThrow(/route|path|duplicate|collision/i);
  });

  it("rejects unresolved semantic references and ambiguous source operation IDs", () => {
    const missing = document();
    missing.paths["/main/read"].post.responses["200"].content["application/json"].schema.$ref = "#/components/schemas/Missing";
    expect(() => composeOpenApiDocuments([{key: "main", document: missing}])).toThrow(/ref|missing|resolve/i);
    const duplicate = document();
    duplicate.paths["/second"] = structuredClone(duplicate.paths["/main/read"]);
    expect(() => composeOpenApiDocuments([{key: "main", document: duplicate}])).toThrow(/operation|ambiguous|duplicate/i);
    const linked = {...document(), components: {schemas: document().components.schemas, links: {Missing: {operationId: "Missing"}}}};
    expect(() => composeOpenApiDocuments([{key: "main", document: linked}])).toThrow(/operation|missing|resolve/i);
  });

  it("rejects duplicate keys, invalid documents, and values that are not actual JSON", () => {
    expect(() => composeOpenApiDocuments([{key: "main", document: document()}, {key: "main", document: document("/other")}])).toThrow(/key|duplicate/i);
    for (const invalid of [null, [], {openapi: "2.0", paths: {}}, {...document(), extra: undefined},
      {...document(), extra: Infinity}, {...document(), extra: new Date()}, {...document(), extra: 1n}]) {
      expect(() => composeOpenApiDocuments([{key: "main", document: invalid}])).toThrow();
    }
    const circular: Record<string, unknown> = document();
    circular.self = circular;
    expect(() => composeOpenApiDocuments([{key: "main", document: circular}])).toThrow();
  });
});
