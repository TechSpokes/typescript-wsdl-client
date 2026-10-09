import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import type {CompiledCatalog} from "../../src/compiler/schemaCompiler.js";

export interface SemanticBaselineCase {
  id: string;
  family: string;
  capabilityId: string;
  fixture: string;
  provenance: string;
  findings: string[];
  schema: "accepted" | "rejected";
  fast: boolean;
  compilerOptions: {choice: "union" | "all-optional"};
  catalogType: string;
  instances: Array<{fixture: string; expected: "accepted" | "rejected"; secondaryExpected?: "accepted" | "rejected"}>;
  referenceDisagreement?: {summary: string; owner: number};
  current: {
    catalog: {
      elements: Array<{name: string; min: number; max: number | "unbounded"}>;
      choices: Array<{min: number; max: number | "unbounded"; branches: string[]}>;
      wildcards: unknown[];
    };
    clientIncludes: string[];
    clientExcludes: string[];
    openapi: unknown;
    defaultChoice?: {clientIncludes: string[]; openapi: unknown};
  };
  intended: string;
  disposition: {summary: string; owners: number[]};
  downstream: {status: string; reason?: string; tests?: string[]; assertions?: string};
}

export const semanticBaseline = JSON.parse(readFileSync(fileURLToPath(
  new URL("./semantic-baseline.json", import.meta.url)), "utf8")) as {
  formatVersion: number;
  sourceRevision: string;
  cases: SemanticBaselineCase[];
};

export function assertBaselineCatalog(compiled: CompiledCatalog, cases: SemanticBaselineCase[]): void {
  for (const entry of cases) {
    const type = compiled.types.find(type => type.name === entry.catalogType);
    assert.ok(type, `${entry.id}: missing catalog type ${entry.catalogType}`);
    assert.deepEqual({
      elements: type.elems.map(({name, min, max}) => ({name, min, max})),
      choices: (type.choiceGroups ?? []).map(({min, max, branches}) => ({min, max,
        branches: branches.map(branch => branch.name)})),
      wildcards: type.wildcards ?? [],
    }, entry.current.catalog, `${entry.id}: current catalog characterization`);
  }
}

export function assertBaselineClient(source: string, entry: SemanticBaselineCase): void {
  // Keep assertions inside this type and its generated choice declarations.
  const declarations = source.split(/(?=\nexport )/).filter(declaration => {
    const name = declaration.match(/export (?:interface|type) (\w+)/)?.[1];
    return name === entry.catalogType || name?.startsWith(`${entry.catalogType}Choice`);
  }).join("\n");
  assert.ok(declarations, `${entry.id}: missing generated declarations`);
  for (const text of entry.current.clientIncludes) {
    assert.ok(declarations.includes(text), `${entry.id}: missing current client fragment ${text}`);
  }
  for (const text of entry.current.clientExcludes) {
    assert.ok(!declarations.includes(text), `${entry.id}: unexpected current client fragment ${text}`);
  }
}
