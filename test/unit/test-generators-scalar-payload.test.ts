import {describe, expect, it} from "vitest";
import type {ResolvedOperationMeta} from "../../src/gateway/helpers.js";
import {emitEnvelopeTest, emitErrorsTest, emitRoutesTest} from "../../src/test/generators.js";

const scalarOperation: ResolvedOperationMeta = {
  operationId: "EchoAlias",
  operationSlug: "echoalias",
  method: "post",
  path: "/echo-alias",
  clientMethodName: "EchoAlias",
  requestTypeName: "AliasCode",
  responseTypeName: "AliasCode",
};

const scalarMocks = new Map([
  [
    "EchoAlias",
    {
      request: "Primary",
      response: "Secondary",
    },
  ],
]);

describe("test generators: scalar payload injection", () => {
  it("emits JSON-encoded scalar payloads for happy path route tests", () => {
    const content = emitRoutesTest("tests", "js", [scalarOperation], scalarMocks);

    expect(content).toContain('headers: {"content-type": "application/json"},');
    expect(content).toContain('payload: JSON.stringify("Primary"),');
  });

  it("emits JSON-encoded scalar payloads for envelope tests", () => {
    const content = emitEnvelopeTest("tests", "js", [scalarOperation], scalarMocks);

    expect(content).toContain('headers: {"content-type": "application/json"},');
    expect(content).toContain('payload: JSON.stringify("Primary"),');
  });

  it("emits JSON-encoded scalar payloads for error tests", () => {
    const content = emitErrorsTest("tests", "js", [scalarOperation], scalarMocks);

    expect(content).toContain('headers: {"content-type": "application/json"},');
    expect(content).toContain('payload: JSON.stringify("Primary"),');
  });
});
