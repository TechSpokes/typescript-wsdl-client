import {mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {afterAll, describe, expect, it, vi} from "vitest";
import {emitModelSchemas, emitOperationSchemas, emitRouteFiles} from "../../src/gateway/generators.js";
import {flattenAllOf, getJsonSchemaRefName, isNumericStatus, measureSchemaRefComplexity, type OpenAPIDocument} from "../../src/gateway/helpers.js";
import {
  injectGatewayProbe, nonMutatingAjv, readGatewaySchemas, registerGatewayProbe, withGatewayProbe,
  type GatewayTrace, type ProbeSchema,
} from "../helpers/contentModelGatewayProbe.js";

const boundaries = readGatewaySchemas("boundary-schemas");
const branches = readGatewaySchemas("branch-schemas");
const compositions = readGatewaySchemas("composition-schemas");
const scalars = readGatewaySchemas("scalar-schemas");
const evidence: Record<string, GatewayTrace[]> = {};
const outputRoot = fileURLToPath(new URL("../../tmp/conformance/content-model-gateway/", import.meta.url));

function tracesFor(name: string): GatewayTrace[] {
  return evidence[name] = [];
}

function expectUnchanged(trace: GatewayTrace): void {
  expect(trace.validatorBefore).toEqual(trace.submitted);
  expect(trace.validatorAfter).toEqual(trace.submitted);
}

function expectPreserved(trace: GatewayTrace, schema: ProbeSchema, external: ProbeSchema[] = []): void {
  expect(trace.statusCode).toBe(200);
  expectUnchanged(trace);
  expect(trace.handlerInput).toEqual(trace.submitted);
  expect(trace.responseBefore).toEqual(trace.returned);
  expect(trace.responseAfter).toEqual(trace.returned);
  const actual: unknown = JSON.parse(trace.httpBytes!);
  expect(actual).toEqual(trace.returned);
  // This check remains independent from the serializer and its internal Ajv.
  expect(nonMutatingAjv(external).compile(schema)(actual)).toBe(true);
}

afterAll(() => {
  mkdirSync(outputRoot, {recursive: true});
  writeFileSync(join(outputRoot, "traces.json"), JSON.stringify(evidence, null, 2) + "\n");
});

describe("S02 gateway feasibility: route-local validation boundaries", () => {
  it("rejects silent coercion, defaults and unknown-field removal while the host retains all three", async () => {
    const local = tracesFor("non-mutating");
    const host = tracesFor("host-control");
    await withGatewayProbe(async (app) => {
      registerGatewayProbe(app, {url: "/local", body: boundaries.mutation, response: boundaries.mutation, traces: local});
      registerGatewayProbe(app, {url: "/host", body: boundaries.mutation, hostDefaults: true, traces: host});
      for (const input of [{code: 7, extra: "remove"}, {code: "ok"}, {code: "ok", label: "yes", extra: true}, {code: 7, label: "yes"}]) {
        const trace = await injectGatewayProbe(app, "/local", JSON.stringify(input), local);
        expect(trace.statusCode).toBe(400);
        expectUnchanged(trace);
        expect(trace.handlerInput).toBeUndefined();
      }
      expectPreserved(await injectGatewayProbe(app, "/local", '{"code":"ok","label":"yes"}', local), boundaries.mutation);
      const hostTrace = await injectGatewayProbe(app, "/host", '{"code":7,"extra":"remove"}', host);
      expect(hostTrace.statusCode).toBe(200);
      expect(hostTrace.validatorBefore).toEqual({code: 7, extra: "remove"});
      expect(hostTrace.validatorAfter).toEqual({code: "7", label: "inserted"});
      expect(hostTrace.handlerInput).toEqual({code: "7", label: "inserted"});
      expect(JSON.parse(hostTrace.httpBytes!)).toEqual(hostTrace.returned);
    });
  });

  it("rejects an invalid closed branch combination that the current host validator repairs", async () => {
    const local = tracesFor("closed-choice");
    const host = tracesFor("closed-choice-host");
    await withGatewayProbe(async (app) => {
      registerGatewayProbe(app, {url: "/local", body: branches.closedChoice, response: branches.closedChoice, traces: local});
      registerGatewayProbe(app, {url: "/host", body: branches.closedChoice, hostDefaults: true, traces: host});
      const raw = '{"email":"team@example.test","phone":"+123"}';
      const rejected = await injectGatewayProbe(app, "/local", raw, local);
      expect(rejected.statusCode).toBe(400);
      expectUnchanged(rejected);
      expectPreserved(await injectGatewayProbe(app, "/local", '{"email":"team@example.test"}', local), branches.closedChoice);
      const repaired = await injectGatewayProbe(app, "/host", raw, host);
      expect(repaired.statusCode).toBe(200);
      expect(repaired.validatorBefore).toEqual({email: "team@example.test", phone: "+123"});
      expect(repaired.validatorAfter).toEqual({email: "team@example.test"});
    });
  });

  it.each([
    ["overlappingOneOf", '{"a":"a","b":"b"}', 400],
    ["overlappingAnyOf", '{"a":"a","b":"b"}', 200],
    ["emptyOverlap", '{}', 400],
    ["emptyLanguage", '{}', 200],
  ] as const)("classifies %s independently from XML choice language", async (name, raw, status) => {
    const traces = tracesFor(name);
    await withGatewayProbe(async (app) => {
      // JSON fallback preserves admitted fields even when branch serializers pick one alternative.
      registerGatewayProbe(app, {url: "/probe", body: branches[name], response: branches[name], serializer: "json", traces});
      const trace = await injectGatewayProbe(app, "/probe", raw, traces);
      expect(trace.statusCode).toBe(status);
      expectUnchanged(trace);
      if (status === 200) expectPreserved(trace, branches[name]);
    });
  });

  it.each([
    ["nullableItems", '{"items":["a",null]}', '{"items":null}'],
    ["nullableWrapper", '{"items":null}', '{"items":[null]}'],
  ])("keeps %s distinct in request validation and schema-generated response bytes", async (name, good, bad) => {
    const traces = tracesFor(name);
    await withGatewayProbe(async (app) => {
      registerGatewayProbe(app, {url: "/probe", body: boundaries[name], response: boundaries[name], traces});
      expectPreserved(await injectGatewayProbe(app, "/probe", good, traces), boundaries[name]);
      const rejected = await injectGatewayProbe(app, "/probe", bad, traces);
      expect(rejected.statusCode).toBe(400);
      expectUnchanged(rejected);
    });
  });

  it("preserves recursive references and rejects an invalid nested value", async () => {
    const traces = tracesFor("recursive");
    await withGatewayProbe(async (app) => {
      registerGatewayProbe(app, {url: "/probe", body: boundaries.recursive, response: boundaries.recursive, traces});
      expectPreserved(await injectGatewayProbe(app, "/probe", '{"value":"root","child":{"value":"leaf","child":null}}', traces), boundaries.recursive);
      const bad = await injectGatewayProbe(app, "/probe", '{"value":"root","child":{"value":17}}', traces);
      expect(bad.statusCode).toBe(400);
      expectUnchanged(bad);
    });
  });

  it("exposes the changed meaning of current allOf flattening and verifies outer draft-07 closure", async () => {
    const traces = tracesFor("outer-closure");
    const original = nonMutatingAjv().compile(compositions.closedMembers);
    const flattened = flattenAllOf(compositions.closedMembers, {});
    expect(original({a: "a", b: "b"})).toBe(false);
    expect(nonMutatingAjv().compile(flattened)({a: "a", b: "b"})).toBe(true);
    await withGatewayProbe(async (app) => {
      registerGatewayProbe(app, {url: "/probe", body: compositions.outerClosure, response: compositions.outerClosure, traces});
      expectPreserved(await injectGatewayProbe(app, "/probe", '{"a":"a","b":"b"}', traces), compositions.outerClosure);
      for (const raw of ['{"a":"a"}', '{"a":"a","b":"b","other":true}']) {
        const rejected = await injectGatewayProbe(app, "/probe", raw, traces);
        expect(rejected.statusCode).toBe(400);
        expectUnchanged(rejected);
      }
    });
  });

  it("fails closed on unlowered 2020-12 vocabulary and inert OpenAPI facet annotations", () => {
    expect(() => nonMutatingAjv().compile(compositions.modernClosure)).toThrow(/no schema with key or ref/);
    const {$schema: _dialect, ...unlabelled} = compositions.modernClosure;
    expect(() => nonMutatingAjv().compile(unlabelled)).toThrow(/unevaluatedProperties/);
    expect(() => nonMutatingAjv().compile(scalars.annotationOnly)).toThrow(/x-xsd-fractionDigits/);
    // Existing permissive compilation accepts the annotation without enforcing its claimed facet.
    const ajv = nonMutatingAjv();
    ajv.addKeyword({keyword: "x-xsd-fractionDigits", valid: true});
    expect(ajv.compile(scalars.annotationOnly)({decimal: "1.234"})).toBe(true);
  });

  it("preserves decimal/int64 strings and the reviewed lexical-sensitive facet witness", async () => {
    const traces = tracesFor("exact-scalars");
    await withGatewayProbe(async (app) => {
      registerGatewayProbe(app, {url: "/probe", body: scalars.exactStrings, response: scalars.exactStrings, traces});
      const raw = '{"int64":"9223372036854775807","decimal":"9007199254740993.12345678901234567890","witness":"+01.00"}';
      const good = await injectGatewayProbe(app, "/probe", raw, traces);
      expectPreserved(good, scalars.exactStrings);
      expect(good.httpBytes).toContain('"+01.00"');
      expect(good.httpBytes).toContain('"9007199254740993.12345678901234567890"');
      for (const bad of [
        {int64: 7, decimal: "1.00", witness: "+01.00"},
        {int64: "7", decimal: 1, witness: "+01.00"},
        {int64: "7", decimal: "1e3", witness: "+01.00"},
        {int64: "7", decimal: "1.00", witness: "1"},
      ]) {
        const rejected = await injectGatewayProbe(app, "/probe", JSON.stringify(bad), traces);
        expect(rejected.statusCode).toBe(400);
        expectUnchanged(rejected);
      }
      // Lexical JSON validation cannot establish the XSD int64 bound or exact decimal facets.
      expectPreserved(await injectGatewayProbe(app, "/probe", '{"int64":"9223372036854775808","decimal":"1.234","witness":"+01.00"}', traces), scalars.exactStrings);
    });
  });

  it("records precision loss before native-number validation begins", async () => {
    const traces = tracesFor("unsafe-numbers");
    await withGatewayProbe(async (app) => {
      registerGatewayProbe(app, {url: "/probe", body: scalars.nativeNumbers, response: scalars.nativeNumbers, serializer: "json", traces});
      const raw = '{"int64":9223372036854775807,"decimal":9007199254740993.12345678901234567890}';
      const trace = await injectGatewayProbe(app, "/probe", raw, traces);
      expectPreserved(trace, scalars.nativeNumbers);
      expect(trace.httpBytes).not.toBe(raw);
      expect(trace.validatorBefore).toEqual({int64: 9223372036854776000, decimal: 9007199254740994});
    });
  });

  it("rejects exact int64 bounds and fractionDigits through a narrow shared-owner callback before dispatch or serialization", async () => {
    const traces = tracesFor("exact-supplement");
    // Test-only predicates for this profile's two facets; production rules belong to #184/#198.
    const shared = (value: unknown): boolean => {
      const scalar = value as {int64: string; decimal: string};
      const integer = BigInt(scalar.int64);
      const fraction = scalar.decimal.split(".")[1]?.replace(/0+$/, "") ?? "";
      return integer >= -9223372036854775808n && integer <= 9223372036854775807n && fraction.length <= 2;
    };
    let returned: unknown;
    await withGatewayProbe(async (app) => {
      registerGatewayProbe(app, {url: "/probe", body: scalars.exactStrings, response: scalars.exactStrings, serializer: "json", sharedSemantics: shared, reply: (value) => returned ?? value, traces});
      const good = '{"int64":"9223372036854775807","decimal":"9007199254740993.1200","witness":"+01.00"}';
      expectPreserved(await injectGatewayProbe(app, "/probe", good, traces), scalars.exactStrings);
      expectPreserved(await injectGatewayProbe(app, "/probe", '{"int64":"-9223372036854775808","decimal":".01","witness":"+01.00"}', traces), scalars.exactStrings);
      for (const invalid of [
        {int64: "9223372036854775808", decimal: "1.00", witness: "+01.00"},
        {int64: "-9223372036854775809", decimal: "1.00", witness: "+01.00"},
        {int64: "7", decimal: "1.001", witness: "+01.00"},
      ]) {
        const request = await injectGatewayProbe(app, "/probe", JSON.stringify(invalid), traces);
        expect(request.statusCode).toBe(400);
        expectUnchanged(request);
        expect(request.handlerInput).toBeUndefined();
        returned = invalid;
        const response = await injectGatewayProbe(app, "/probe", good, traces);
        expect(response.statusCode).toBe(500);
        expect(response.responseBefore).toEqual(invalid);
        expect(response.serializedBefore).toBeUndefined();
      }
    });
  });

  it("checks JSON facet keywords on requests and independently on responses", async () => {
    const traces = tracesFor("json-facets");
    let returned: unknown = {label: "AB", count: 2, items: ["a"]};
    await withGatewayProbe(async (app) => {
      registerGatewayProbe(app, {url: "/probe", body: boundaries.facets, response: boundaries.facets, reply: () => returned, traces});
      const good = '{"label":"AB","count":2,"items":["a"]}';
      expectPreserved(await injectGatewayProbe(app, "/probe", good, traces), boundaries.facets);
      for (const input of [
        {label: "ab", count: 2, items: ["a"]}, {label: "A", count: 2, items: ["a"]},
        {label: "ABCDE", count: 2, items: ["a"]}, {label: "AB", count: 0, items: ["a"]},
        {label: "AB", count: 4, items: ["a"]}, {label: "AB", count: 1.5, items: ["a"]},
        {label: "AB", count: 2, items: []}, {label: "AB", count: 2, items: ["a", "b", "a"]},
        {label: "AB", count: 2, items: ["c"]},
      ]) {
        const rejected = await injectGatewayProbe(app, "/probe", JSON.stringify(input), traces);
        expect(rejected.statusCode).toBe(400);
        expectUnchanged(rejected);
        returned = input;
        const badResponse = await injectGatewayProbe(app, "/probe", good, traces);
        expect(badResponse.statusCode).toBe(500);
        expect(badResponse.responseBefore).toEqual(input);
        expect(badResponse.serializedBefore).toBeUndefined();
      }
    });
  });

  it("proves a schema serializer alone does not enforce ordinary response facets", async () => {
    const traces = tracesFor("serializer-without-validation");
    await withGatewayProbe(async (app) => {
      registerGatewayProbe(app, {
        url: "/probe", body: boundaries.facets, response: boundaries.facets, traces,
        independentResponseValidation: false, reply: () => ({label: "bad", count: 99, items: []}),
      });
      const trace = await injectGatewayProbe(app, "/probe", '{"label":"AB","count":2,"items":["a"]}', traces);
      expect(trace.statusCode).toBe(200);
      expect(JSON.parse(trace.httpBytes!)).toEqual(trace.returned);
      expect(nonMutatingAjv().compile(boundaries.facets)(JSON.parse(trace.httpBytes!))).toBe(false);
    });
  });

  it("detects admitted open response fields dropped by serialization and preserves them with validated JSON fallback", async () => {
    const schemaTraces = tracesFor("serializer-field-loss");
    const jsonTraces = tracesFor("serializer-field-fallback");
    await withGatewayProbe(async (app) => {
      const reply = () => ({known: "yes", approved: {nested: [1, null, "exact"]}});
      registerGatewayProbe(app, {url: "/schema", body: boundaries.openResponse, response: boundaries.openResponse, traces: schemaTraces, reply});
      registerGatewayProbe(app, {url: "/json", body: boundaries.openResponse, response: boundaries.openResponse, serializer: "json", traces: jsonTraces, reply});
      const lost = await injectGatewayProbe(app, "/schema", '{"known":"yes"}', schemaTraces);
      expect(lost.statusCode).toBe(500);
      expect(lost.returned).toEqual(reply());
      expect(lost.serializedBefore).toEqual({known: "yes"});
      const preserved = await injectGatewayProbe(app, "/json", '{"known":"yes"}', jsonTraces);
      expectPreserved(preserved, boundaries.openResponse);
    });
  });

  it("calls one injected semantic owner on request, returned response and fallback bytes", async () => {
    const traces = tracesFor("shared-semantic-seam");
    // A sentinel callback verifies integration only; this is not an XSD scalar engine.
    const shared = vi.fn((_value: unknown, _boundary: "request" | "response" | "bytes") => true);
    await withGatewayProbe(async (app) => {
      registerGatewayProbe(app, {url: "/probe", body: scalars.exactStrings, response: scalars.exactStrings, serializer: "json", sharedSemantics: shared, traces});
      const raw = '{"int64":"7","decimal":"1.00","witness":"+01.00"}';
      expectPreserved(await injectGatewayProbe(app, "/probe", raw, traces), scalars.exactStrings);
      expect(shared.mock.calls.map((call) => call[1])).toEqual(["request", "response", "bytes"]);
      shared.mockImplementationOnce(() => false);
      expect((await injectGatewayProbe(app, "/probe", raw, traces)).statusCode).toBe(400);
      shared.mockImplementationOnce(() => true).mockImplementationOnce(() => false);
      expect((await injectGatewayProbe(app, "/probe", raw, traces)).statusCode).toBe(500);
      shared.mockImplementationOnce(() => true).mockImplementationOnce(() => true).mockImplementationOnce(() => false);
      expect((await injectGatewayProbe(app, "/probe", raw, traces)).statusCode).toBe(500);
    });
  });

  it("executes the current 150-ref emitter fallback and retains independent validation in the proposed adapter", async () => {
    mkdirSync(outputRoot, {recursive: true});
    const directory = mkdtempSync(join(outputRoot, "emitter-"));
    const modelsDir = join(directory, "schemas", "models");
    const opsDir = join(directory, "schemas", "operations");
    const makeSchemas = (count: number): Record<string, ProbeSchema> => ({
      Response: {type: "object", properties: Object.fromEntries(Array.from({length: count - 1}, (_, i) => [`leaf${i}`, {$ref: `#/components/schemas/Leaf${i}`} ])), required: ["leaf0"], additionalProperties: false},
      ...Object.fromEntries(Array.from({length: count - 1}, (_, i) => [`Leaf${i}`, {type: "string", pattern: "^[A-Z]+$"}])),
    });
    const makeDocument = (schemas: Record<string, ProbeSchema>): OpenAPIDocument => ({
      openapi: "3.1.1", components: {schemas}, paths: {"/current": {post: {operationId: "Probe", responses: {
        200: {content: {"application/json": {schema: {$ref: "#/components/schemas/Response"}}}},
        default: {content: {"application/json": {schema: {$ref: "#/components/schemas/Response"}}}},
      }}}},
    });
    try {
      for (const count of [149, 150]) {
        const schemas = makeSchemas(count);
        const ids = emitModelSchemas(schemas, modelsDir, "v1", "probe");
        const operations = emitOperationSchemas(makeDocument(schemas), opsDir, "v1", "probe", ids, [], () => ({}), getJsonSchemaRefName, isNumericStatus);
        expect(measureSchemaRefComplexity("Response", schemas, 150)).toBe(count);
        expect(operations[0].skipResponseSchema).toBe(count === 150);
        if (count === 150) emitRouteFiles(directory, join(directory, "routes"), "v1", "probe", operations, "ts");
      }
      const routeFile = join(directory, "routes", "probe.ts");
      expect(readFileSync(routeFile, "utf8")).toContain("response: _response");
      const generated = await import(pathToFileURL(routeFile).href);
      const external = readdirSync(modelsDir).map((file) => JSON.parse(readFileSync(join(modelsDir, file), "utf8")) as ProbeSchema);
      const responseSchema = {$ref: "urn:services:probe:v1:schemas:models:response#"};
      const valid = {leaf0: "OK", leaf148: "END"};
      const invalid = {leaf0: 17, unexplained: "retained"};
      let returned: unknown = valid;
      const current = tracesFor("current-emitter-fallback");
      await withGatewayProbe(async (app) => {
        for (const schema of external) app.addSchema(schema);
        app.addHook("onRoute", (route) => {
          expect(route.schema?.response).toBeUndefined();
          // The actual emitted stub's registration is preserved; supply a local probe handler.
          route.handler = async () => {
            current.push({returned: structuredClone(returned)});
            return returned;
          };
        });
        await generated.registerRoute_v1_probe_probe(app);
        for (const value of [valid, invalid]) {
          returned = value;
          const trace = await injectGatewayProbe(app, "/current", '{}', current);
          expect(trace.statusCode).toBe(200);
          expect(JSON.parse(trace.httpBytes!)).toEqual(value);
          expect(nonMutatingAjv(external).compile(responseSchema)(JSON.parse(trace.httpBytes!))).toBe(value === valid);
        }
      });
      const proposed = tracesFor("validated-complexity-fallback");
      await withGatewayProbe(async (app) => {
        registerGatewayProbe(app, {url: "/proposed", body: {type: "object"}, response: responseSchema, externalSchemas: external, serializer: "json", reply: () => returned, traces: proposed});
        returned = valid;
        expectPreserved(await injectGatewayProbe(app, "/proposed", '{}', proposed), responseSchema, external);
        returned = invalid;
        const rejected = await injectGatewayProbe(app, "/proposed", '{}', proposed);
        expect(rejected.statusCode).toBe(500);
        expect(rejected.returned).toEqual(invalid);
        expect(rejected.serializedBefore).toBeUndefined();
      });
    } finally {
      rmSync(directory, {recursive: true, force: true});
    }
  });
});
