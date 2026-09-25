import {afterAll, describe, expect, it} from "vitest";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
import {compileCatalog, type CompiledCatalog} from "../../src/compiler/schemaCompiler.js";
import {generateTypes} from "../../src/client/generateTypes.js";
import {resolveCompilerOptions, type CompilerOptions} from "../../src/config.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";
import {buildChoiceWsdl, SEARCH_CHOICE_SCHEMA} from "../helpers/choiceWsdl.js";

const require = createRequire(import.meta.url);
const tmpRoot = mkdtempSync(join(tmpdir(), "wsdl-choice-types-"));
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
      namespace: "http://example.com/choice-types",
      servicePrefix: "ChoiceType",
    }),
    "utf8",
  );
  const wsdlCatalog = await loadWsdl(wsdlPath);
  return compileCatalog(
    wsdlCatalog,
    resolveCompilerOptions({choice}, {wsdl: wsdlPath, out: tmpRoot}),
  );
}

async function generateTypesSource(choice: CompilerOptions["choice"], fileName: string): Promise<string> {
  const compiled = await compileFixture(choice);
  const typesFile = join(tmpRoot, fileName);
  generateTypes(typesFile, compiled);
  return readFileSync(typesFile, "utf8");
}

describe("client types: choice union mode", () => {
  it("keeps all-optional mode on the existing interface shape", async () => {
    const source = await generateTypesSource("all-optional", "all-optional-types.ts");

    expect(source).toContain("export interface SearchRequest {");
    expect(source).toContain("tenantId: string;");
    expect(source).toContain("email: string;");
    expect(source).toContain("phone: number;");
    expect(source).not.toContain("SearchRequestChoiceBase");
    expect(source).not.toContain("SearchRequestChoice1");
  });

  it("emits exclusive branch unions in union mode", async () => {
    const source = await generateTypesSource("union", "union-types.ts");

    expect(source).toContain("export type SearchRequest = SearchRequestChoiceBase & SearchRequestChoice1;");
    expect(source).toContain("export interface SearchRequestChoiceBase {");
    expect(source).toContain("export type SearchRequestChoice1 =");
    expect(source).toContain("email: string;");
    expect(source).toContain("phone?: never;");
    expect(source).toContain("phone: number;");
    expect(source).toContain("email?: never;");
  });

  it("makes multi-branch choice payloads fail TypeScript compilation in union mode", async () => {
    const source = await generateTypesSource("union", "types.ts");
    writeFileSync(join(tmpRoot, "types.ts"), source, "utf8");
    writeFileSync(
      join(tmpRoot, "choice-usage.ts"),
      `import type {SearchRequest} from "./types.js";

const emailOnly: SearchRequest = {tenantId: "tenant", email: "team@example.test"};
const phoneOnly: SearchRequest = {tenantId: "tenant", phone: 123};
const noChoice: SearchRequest = {tenantId: "tenant"};

void emailOnly;
void phoneOnly;
void noChoice;

// @ts-expect-error xs:choice union mode rejects payloads with multiple branches.
const invalid: SearchRequest = {tenantId: "tenant", email: "team@example.test", phone: 123};
void invalid;
`,
      "utf8",
    );
    writeFileSync(
      join(tmpRoot, "tsconfig.choice.json"),
      JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            skipLibCheck: true,
            types: [],
          },
          include: ["types.ts", "choice-usage.ts"],
        },
        null,
        2,
      ),
      "utf8",
    );

    execFileSync(
      process.execPath,
      [require.resolve("typescript/bin/tsc"), "-p", join(tmpRoot, "tsconfig.choice.json")],
      {cwd: tmpRoot, stdio: "pipe"},
    );
  });
});
