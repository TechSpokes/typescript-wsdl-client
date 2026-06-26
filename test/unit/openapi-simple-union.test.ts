import {describe, expect, it} from "vitest";
import {compileCatalog} from "../../src/compiler/schemaCompiler.js";
import {resolveCompilerOptions} from "../../src/config.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";
import {generateSchemas} from "../../src/openapi/generateSchemas.js";
import {capabilities} from "../conformance/registry.js";
import {fixturePathFor} from "../conformance/runner.js";

async function compileUnionFixture() {
  const capability = capabilities.find(entry => entry.id === "xs-union-simple-type");
  expect(capability, "xs-union-simple-type conformance case must exist").toBeTruthy();
  const wsdlPath = fixturePathFor(capability!);
  const wsdlCatalog = await loadWsdl(wsdlPath);
  return compileCatalog(
    wsdlCatalog,
    resolveCompilerOptions({}, {wsdl: wsdlPath, out: "tmp"}),
  );
}

describe("OpenAPI schemas: xs:union aliases", () => {
  it("emits oneOf schemas for mixed primitive and literal union aliases", async () => {
    const compiled = await compileUnionFixture();
    const schemas = generateSchemas(compiled, {closedSchemas: true});

    expect(schemas.Identifier).toEqual({
      oneOf: [
        {type: "string"},
        {type: "number"},
      ],
    });
    expect(schemas.InlineIdentifier).toEqual({
      oneOf: [
        {type: "string", enum: ["Local", "Remote"]},
        {type: "number"},
      ],
    });
    expect(schemas.UnionRequest.properties.id).toEqual({
      $ref: "#/components/schemas/Identifier",
    });
  });
});
