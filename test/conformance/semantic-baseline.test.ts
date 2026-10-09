import {mkdirSync, mkdtempSync, readFileSync, rmSync} from "node:fs";
import {join, resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {generateTypes} from "../../src/client/generateTypes.js";
import {compileCatalog} from "../../src/compiler/schemaCompiler.js";
import {resolveCompilerOptions} from "../../src/config.js";
import {loadWsdl} from "../../src/loader/wsdlLoader.js";
import {generateSchemas} from "../../src/openapi/generateSchemas.js";
import {capabilities} from "./registry.js";
import {fixturesRoot, resolveUnder} from "./fixturePolicy.js";
import {assertBaselineCatalog, assertBaselineClient, semanticBaseline} from "./semanticBaseline.js";

describe("bounded semantic baseline: current behavior, not future support", () => {
  it("links every case to the registry, local inputs, findings and gap owners", () => {
    expect(semanticBaseline.formatVersion).toBe(1);
    expect(new Set(semanticBaseline.cases.map(entry => entry.id)).size).toBe(semanticBaseline.cases.length);
    const families = new Set(semanticBaseline.cases.map(entry => entry.family));
    for (const family of ["repeated-sequence", "optional-sequence", "simple-choice", "ordering", "wildcard",
      "zero-group", "required-single-choice", "required-multiple-choice", "empty-alternative", "finite-count-gap"]) {
      expect(families.has(family), family).toBe(true);
    }
    for (const entry of semanticBaseline.cases) {
      expect(capabilities.find(capability => capability.id === entry.capabilityId)?.fixture, entry.id).toBe(entry.fixture);
      expect(readFileSync(resolveUnder(fixturesRoot, entry.fixture), "utf8").length).toBeGreaterThan(0);
      expect(entry.provenance.length).toBeGreaterThan(0);
      expect(entry.findings.length).toBeGreaterThan(0);
      expect(entry.disposition.owners.length).toBeGreaterThan(0);
      expect(entry.intended.length).toBeGreaterThan(0);
      expect(entry.downstream.status.length).toBeGreaterThan(0);
      for (const instance of entry.instances) {
        expect(readFileSync(resolveUnder(fixturesRoot, instance.fixture), "utf8").length).toBeGreaterThan(0);
      }
      if (entry.schema === "accepted") {
        expect(entry.instances.some(instance => instance.expected === "accepted"), entry.id).toBe(true);
        expect(entry.instances.some(instance => instance.expected === "rejected" ||
          (entry.referenceDisagreement && instance.secondaryExpected === "rejected")), entry.id).toBe(true);
        if (entry.referenceDisagreement) {
          expect(entry.disposition.owners, entry.id).toContain(entry.referenceDisagreement.owner);
          expect(entry.instances.some(instance => instance.secondaryExpected), entry.id).toBe(true);
        }
      } else {
        expect(entry.instances, entry.id).toEqual([]);
      }
    }
  });

  for (const fixture of [...new Set(semanticBaseline.cases.map(entry => entry.fixture))]) {
    it(`characterizes catalog, scoped TypeScript and OpenAPI: ${fixture}`, async () => {
      const cases = semanticBaseline.cases.filter(entry => entry.fixture === fixture);
      mkdirSync("tmp/conformance", {recursive: true});
      const outDir = mkdtempSync(resolve("tmp/conformance/semantic-baseline-"));
      try {
        const wsdl = resolveUnder(fixturesRoot, fixture);
        const compiled = compileCatalog(await loadWsdl(wsdl), resolveCompilerOptions(cases[0]!.compilerOptions,
          {wsdl, out: outDir}));
        assertBaselineCatalog(compiled, cases);
        const typesFile = join(outDir, "types.ts");
        generateTypes(typesFile, compiled);
        const source = readFileSync(typesFile, "utf8");
        const schemas = generateSchemas(compiled, {flattenArrayWrappers: false});
        for (const entry of cases) {
          assertBaselineClient(source, entry);
          expect(schemas[entry.catalogType], entry.id).toEqual(entry.current.openapi);
        }
        const defaultCases = cases.filter(entry => entry.current.defaultChoice);
        if (defaultCases.length > 0) {
          const defaultCompiled = compileCatalog(await loadWsdl(wsdl), resolveCompilerOptions({choice: "all-optional"},
            {wsdl, out: outDir}));
          assertBaselineCatalog(defaultCompiled, defaultCases);
          generateTypes(typesFile, defaultCompiled);
          const defaultSource = readFileSync(typesFile, "utf8");
          const defaultSchemas = generateSchemas(defaultCompiled, {flattenArrayWrappers: false});
          for (const entry of defaultCases) {
            assertBaselineClient(defaultSource, {...entry, current: {...entry.current,
              clientIncludes: entry.current.defaultChoice!.clientIncludes}});
            expect(defaultSchemas[entry.catalogType], `${entry.id}: default all-optional`).toEqual(
              entry.current.defaultChoice!.openapi);
          }
        }
      } finally {
        rmSync(outDir, {recursive: true, force: true});
      }
    });
  }
});
