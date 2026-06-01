import {afterAll, describe, expect, it} from "vitest";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {compileCatalog, type CompiledCatalog} from "../../src/compiler/schemaCompiler.js";
import {resolveCompilerOptions, type CompilerOptions} from "../../src/config.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";
import {generateSchemas} from "../../src/openapi/generateSchemas.js";
import {buildChoiceWsdl, SEARCH_CHOICE_SCHEMA} from "../helpers/choiceWsdl.js";

const tmpRoot = mkdtempSync(join(tmpdir(), "wsdl-choice-openapi-"));
let fixtureCounter = 0;

afterAll(() => {
  rmSync(tmpRoot, {recursive: true, force: true});
});

async function compileFixture(choice: CompilerOptions["choice"]): Promise<CompiledCatalog> {
  fixtureCounter += 1;
  const wsdlPath = join(tmpRoot, `choice-${choice}-${fixtureCounter}.wsdl`);
  writeFileSync(
    wsdlPath,
    buildChoiceWsdl(SEARCH_CHOICE_SCHEMA, {
      namespace: "http://example.com/choice-openapi",
      servicePrefix: "ChoiceOpenApi",
    }),
    "utf8",
  );
  const wsdlCatalog = await loadWsdl(wsdlPath);
  return compileCatalog(
    wsdlCatalog,
    resolveCompilerOptions({choice}, {wsdl: wsdlPath, out: tmpRoot}),
  );
}

async function generateChoiceSchemas(choice: CompilerOptions["choice"]) {
  const compiled = await compileFixture(choice);
  return generateSchemas(compiled, {closedSchemas: true});
}

describe("OpenAPI schemas: choice union mode", () => {
  it("keeps all-optional mode on the existing flattened schema shape", async () => {
    const schemas = await generateChoiceSchemas("all-optional");
    const searchRequest = schemas.SearchRequest;

    expect(searchRequest).toMatchObject({
      type: "object",
      properties: {
        tenantId: {type: "string"},
        email: {type: "string"},
        phone: {type: "number"},
      },
      additionalProperties: false,
    });
    expect(searchRequest).not.toHaveProperty("oneOf");
    expect(searchRequest).not.toHaveProperty("allOf");
  });

  it("emits containing-object oneOf constraints in union mode", async () => {
    const schemas = await generateChoiceSchemas("union");
    const searchRequest = schemas.SearchRequest;

    expect(searchRequest).toMatchObject({
      type: "object",
      properties: {
        tenantId: {type: "string"},
        email: {type: "string"},
        phone: {type: "number"},
      },
      required: ["tenantId"],
      additionalProperties: false,
    });
    expect(searchRequest.oneOf).toEqual([
      {
        required: ["email"],
        not: {required: ["phone"]},
      },
      {
        required: ["phone"],
        not: {required: ["email"]},
      },
      {
        not: {
          anyOf: [
            {required: ["email"]},
            {required: ["phone"]},
          ],
        },
      },
    ]);
  });
});
