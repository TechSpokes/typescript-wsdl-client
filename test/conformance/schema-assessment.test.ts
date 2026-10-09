/** Hand-authored primary-rule contrasts; no expectation uses production helpers. */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {globalId} from "../../src/compiler/canonicalGraph.js";
import {analyzeOccurrences} from "../../src/compiler/occurrenceAnalysis.js";
import {assessSchemaProfile} from "../../src/compiler/assessSchemaProfile.js";
import {prepareResolvedCompilationInput} from "../../src/compiler/semanticCatalog.js";
const fixtures = path.resolve("test/conformance/fixtures");
const manifest = JSON.parse(readFileSync("test/conformance/schema-assessment-manifest.json", "utf8")) as {
  formatVersion: number; cases: {id: string; fixture: string; sha256: string; namespace: string; root: string; role: "element" | "type"; assessment: string; qualification?: string}[];
};
const bindings = JSON.parse(readFileSync("test/conformance/schema-binding-manifest.json", "utf8")) as {
  namespace: string; cases: {id: string; fixture: string; sha256: string; assessment: string; rule?: string}[];
};
describe("internal faithful schema assessment, distinct from legacy public support", () => {
  for (const entry of manifest.cases) it(entry.id, async () => {
    expect(createHash("sha256").update(readFileSync(path.join(fixtures, entry.fixture))).digest("hex")).toBe(entry.sha256);
    const input = await prepareResolvedCompilationInput({kind: "source", source: path.join(fixtures, entry.fixture)}, {loading: {policy: {fileRoots: [fixtures]}}});
    if (input.kind !== "semantic") throw Error("semantic");
    const result = analyzeOccurrences(input.composed); if (result.kind !== "analyzed") throw result.diagnostic;
    const assessed = assessSchemaProfile(result.analysis, [{kind: "components", id: entry.id, roots: [globalId(entry.role, {namespace: entry.namespace, local: entry.root})]}]);
    expect(assessed.kind).toBe("assessed");
    if (assessed.kind === "assessed") {
      const operation = assessed.assessment.operations[0]; expect(operation.kind).toBe(entry.assessment);
      if (operation.kind !== "supported") {
        expect(operation.diagnostic.component).toBeDefined(); expect(operation.diagnostic.source?.path).toBeDefined();
        expect(operation.diagnostic.operations).toEqual([entry.id]);
        if (entry.qualification) expect(operation.diagnostic.rule).toBe(entry.qualification);
      }
    }
  });
  for (const entry of bindings.cases) it(entry.id, async () => {
    expect(createHash("sha256").update(readFileSync(path.join(fixtures, entry.fixture))).digest("hex")).toBe(entry.sha256);
    const input = await prepareResolvedCompilationInput({kind: "source", source: path.join(fixtures, entry.fixture)}, {loading: {policy: {fileRoots: [fixtures]}}});
    if (input.kind !== "semantic") throw Error("semantic");
    const analyzed = analyzeOccurrences(input.composed); if (analyzed.kind !== "analyzed") throw analyzed.diagnostic;
    const result = assessSchemaProfile(analyzed.analysis, [{kind: "operation", id: entry.id, binding: globalId("binding", {namespace: bindings.namespace, local: "B"}), operation: "read", port: {service: globalId("service", {namespace: bindings.namespace, local: "S"}), name: "Port"}}]);
    expect(result.kind).toBe("assessed");
    if (result.kind === "assessed") {
      expect(result.assessment.operations[0].kind).toBe(entry.assessment);
      if (entry.rule) expect(result.assessment.operations[0]).toMatchObject({diagnostic: {rule: entry.rule, operations: [entry.id]}});
    }
  });
});
